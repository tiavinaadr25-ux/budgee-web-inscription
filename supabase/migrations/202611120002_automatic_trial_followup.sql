-- Automatic one-time follow-up 48 hours after a trial ends, without paid conversion.
-- Replaces the manual campaign. Does not send emails directly or create a table.
begin;
alter table public.lifecycle_email_settings add column if not exists trial_followup_started_at timestamptz;
update public.lifecycle_email_settings set trial_followup_started_at=now() where singleton and trial_followup_started_at is null;
alter table public.lifecycle_email_outbox drop constraint if exists lifecycle_email_outbox_kind_check;
alter table public.lifecycle_email_outbox add constraint lifecycle_email_outbox_kind_check
 check(kind in ('welcome','check_in','trial_expired','mobile_confirmed','mobile_expiring','mobile_expired','reengagement'));
create or replace function public.trial_followup_is_eligible(p_user_id uuid,p_subscription_id uuid) returns boolean
language sql security definer set search_path=pg_catalog,public as $$
 select exists(
  select 1 from auth.users u
  join lateral(select * from public.subscriptions x where x.user_id=u.id order by x.created_at desc,x.id desc limit 1) s on true
  join public.lifecycle_email_settings cfg on cfg.singleton
  where u.id=p_user_id and s.id=p_subscription_id and u.email_confirmed_at is not null and u.deleted_at is null and u.email is not null
   and s.trial_ends_at is not null and s.trial_ends_at+interval '48 hours'<=now()
   and s.trial_ends_at+interval '48 hours'>=cfg.trial_followup_started_at
   and not coalesce(s.status='active' or (s.status='trialing' and s.trial_ends_at>now())
    or (s.status in ('canceled','past_due') and s.current_period_end_at>now()),false)
   and not exists(
    select 1 from auth.users other
    left join public.lifecycle_email_preferences pref on pref.user_id=other.id
    left join lateral(select * from public.subscriptions x where x.user_id=other.id order by x.created_at desc,x.id desc limit 1) os on true
    where lower(trim(other.email))=lower(trim(u.email)) and other.deleted_at is null
    and (pref.enabled=false or coalesce(os.status='active' or (os.status='trialing' and (os.trial_ends_at is null or os.trial_ends_at>now()))
      or (os.status in ('canceled','past_due') and os.current_period_end_at>now()),false)
     or exists(select 1 from public.billing_records b where b.user_id=other.id and b.status='paid' and b.amount>0)
     or exists(select 1 from public.voaray_orders v where v.user_id=other.id and v.environment='production' and v.status in ('completed','refunded')))
   )
   and not exists(select 1 from public.lifecycle_email_outbox sent
    join auth.users recipient on recipient.id=sent.user_id
    where sent.kind='reengagement' and sent.status in ('sent','review')
     and lower(trim(recipient.email))=lower(trim(u.email)))
 );
$$;
revoke all on function public.trial_followup_is_eligible(uuid,uuid) from public,anon,authenticated;
grant execute on function public.trial_followup_is_eligible(uuid,uuid) to service_role;
create or replace function public.collect_lifecycle_emails() returns integer
language plpgsql security definer set search_path=pg_catalog,public as $$
declare inserted integer;
begin
 with audience as (
  select u.id,u.email,u.created_at,u.email_confirmed_at,coalesce(p.full_name,'') as full_name,
    s.id as subscription_id,s.provider,s.status,s.trial_ends_at,s.current_period_end_at,
    (s.status='active' or (s.status='trialing' and (s.trial_ends_at is null or s.trial_ends_at>now()))
     or (s.status in ('canceled','past_due') and s.current_period_end_at>now())) as access_active
  from auth.users u left join public.profiles p on p.id=u.id
  left join lateral(select * from public.subscriptions x where x.user_id=u.id order by x.created_at desc,x.id desc limit 1) s on true
  left join public.lifecycle_email_preferences pref on pref.user_id=u.id
  where u.email_confirmed_at is not null and u.email is not null and u.deleted_at is null
    and coalesce(pref.enabled,true)
 ), events as (
  select a.id,a.email,'welcome:'||a.id as event_key,'welcome' as kind,
   jsonb_build_object('name',left(a.full_name,80)) as payload
  from audience a where a.created_at >= (select welcome_since from public.lifecycle_email_settings where singleton)
  union all
  select a.id,a.email,'check_in:'||a.id,'check_in',jsonb_build_object('name',left(a.full_name,80))
  from audience a where a.created_at >= (select welcome_since from public.lifecycle_email_settings where singleton)
   and a.email_confirmed_at+interval '3 days'<=now()
  union all
  select a.id,a.email,'trial-followup-v1:'||md5(lower(trim(a.email))),'reengagement',
   jsonb_build_object('campaign','trial-followup-v1','subscription_id',a.subscription_id)
  from audience a where public.trial_followup_is_eligible(a.id,a.subscription_id)
  union all
  select a.id,a.email,'trial_expired:'||a.subscription_id,'trial_expired',
   jsonb_build_object('name',left(a.full_name,80),'subscription_id',a.subscription_id)
  from audience a where a.created_at >= (select other_since from public.lifecycle_email_settings where singleton) and not coalesce(a.access_active,false) and a.trial_ends_at<=now()
   and a.trial_ends_at >= (select other_since from public.lifecycle_email_settings where singleton)
  union all
  select a.id,a.email,'mobile_confirmed:'||o.id,'mobile_confirmed',
   jsonb_build_object('name',left(a.full_name,80),'order_id',o.id,'access_ends_at',o.access_ends_at,'amount',o.amount,'currency',o.currency)
  from audience a join public.voaray_orders o on o.user_id=a.id
  where o.environment='production' and a.created_at >= (select other_since from public.lifecycle_email_settings where singleton) and o.status='completed' and o.access_ends_at>now()
   and o.created_at >= (select other_since from public.lifecycle_email_settings where singleton)
  union all
  select a.id,a.email,'mobile_expiring:'||o.id,'mobile_expiring',
   jsonb_build_object('name',left(a.full_name,80),'order_id',o.id,'access_ends_at',o.access_ends_at)
  from audience a join public.voaray_orders o on o.subscription_id=a.subscription_id
  where a.provider='voaray' and a.created_at >= (select other_since from public.lifecycle_email_settings where singleton) and o.environment='production' and o.status='completed'
   and o.access_ends_at>now() and o.access_ends_at<=now()+interval '1 day'
  union all
  select a.id,a.email,'mobile_expired:'||o.id,'mobile_expired',
   jsonb_build_object('name',left(a.full_name,80),'order_id',o.id,'access_ends_at',o.access_ends_at)
  from audience a join public.voaray_orders o on o.subscription_id=a.subscription_id
  where a.provider='voaray' and a.created_at >= (select other_since from public.lifecycle_email_settings where singleton) and not coalesce(a.access_active,false) and o.environment='production'
   and o.status='completed' and o.access_ends_at<=now()
   and o.access_ends_at >= (select other_since from public.lifecycle_email_settings where singleton)
 )
 insert into public.lifecycle_email_outbox(user_id,recipient_email,event_key,kind,payload)
 select id,email,event_key,kind,payload from events on conflict(event_key) do nothing;
 get diagnostics inserted=row_count;return inserted;
end $$;


create or replace function public.lifecycle_email_is_relevant(p_id uuid) returns boolean
language sql security definer set search_path=pg_catalog,public as $$
 select exists(
  select 1 from public.lifecycle_email_outbox q join auth.users u on u.id=q.user_id
  left join public.lifecycle_email_preferences pref on pref.user_id=u.id
  left join lateral(select * from public.subscriptions x where x.user_id=u.id order by x.created_at desc,x.id desc limit 1) s on true
  left join public.voaray_orders o on o.id::text=q.payload->>'order_id'
  where q.id=p_id and u.email_confirmed_at is not null and u.deleted_at is null
   and u.email=q.recipient_email and coalesce(pref.enabled,true)
   and (q.kind='reengagement' or (q.kind in ('welcome','check_in') and u.created_at >= (select welcome_since from public.lifecycle_email_settings where singleton))
     or (q.kind not in ('welcome','check_in') and u.created_at >= (select other_since from public.lifecycle_email_settings where singleton)))
   and ((q.kind='reengagement' and q.payload->>'campaign'='trial-followup-v1' and s.id::text=q.payload->>'subscription_id' and public.trial_followup_is_eligible(u.id,s.id)) or q.kind='welcome'
    or (q.kind='check_in' and u.email_confirmed_at+interval '3 days'<=now())
    or (q.kind='trial_expired' and s.id::text=q.payload->>'subscription_id' and s.trial_ends_at<=now()
     and not coalesce(s.status='active' or (s.status in ('canceled','past_due') and s.current_period_end_at>now()),false))
    or (q.kind='mobile_confirmed' and o.status='completed' and o.environment='production' and o.access_ends_at>now())
    or (q.kind='mobile_expiring' and o.status='completed' and s.id=o.subscription_id and s.provider='voaray'
     and o.access_ends_at>now() and o.access_ends_at<=now()+interval '1 day')
    or (q.kind='mobile_expired' and o.status='completed' and s.id=o.subscription_id and s.provider='voaray' and o.access_ends_at<=now()
     and not coalesce(s.status='active' or (s.status in ('canceled','past_due') and s.current_period_end_at>now()),false)))
 );
$$;


-- Cancel the older one-off request, including queued messages not yet sent.
update public.lifecycle_email_outbox set status='canceled',lease_until=null,last_error='replaced_by_trial_followup'
where kind='reengagement' and payload->>'campaign'='budget-2026-11-12' and status in ('pending','processing');
commit;
