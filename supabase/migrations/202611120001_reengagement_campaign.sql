-- ONE-OFF approved email. Run ONLY AFTER deploying the code with reengagement support.
-- Uses the existing private queue, opt-outs, daily cap and signed unsubscribe links.
-- Rerunning does not create a second message for the same address in this campaign.
begin;
alter table public.lifecycle_email_outbox drop constraint if exists lifecycle_email_outbox_kind_check;
alter table public.lifecycle_email_outbox add constraint lifecycle_email_outbox_kind_check
 check(kind in ('welcome','check_in','trial_expired','mobile_confirmed','mobile_expiring','mobile_expired','reengagement'));
create or replace function public.reengagement_email_is_eligible(p_user_id uuid) returns boolean
language sql security definer set search_path=pg_catalog,public as $$
 select exists(
  select 1 from auth.users u
  join lateral(select * from public.subscriptions x where x.user_id=u.id order by x.created_at desc,x.id desc limit 1) s on true
  where u.id=p_user_id and u.email_confirmed_at is not null and u.deleted_at is null and u.email is not null
  and not coalesce(s.status='active' or (s.status='trialing' and (s.trial_ends_at is null or s.trial_ends_at>now()))
    or (s.status in ('canceled','past_due') and s.current_period_end_at>now()),false)
  and (s.trial_ends_at<=now() or s.current_period_end_at<=now())
  and not exists(
   select 1 from auth.users other
   left join public.lifecycle_email_preferences pref on pref.user_id=other.id
   left join lateral(select * from public.subscriptions x where x.user_id=other.id order by x.created_at desc,x.id desc limit 1) os on true
   where lower(trim(other.email))=lower(trim(u.email)) and other.deleted_at is null
    and (pref.enabled=false or coalesce(os.status='active' or (os.status='trialing' and (os.trial_ends_at is null or os.trial_ends_at>now()))
     or (os.status in ('canceled','past_due') and os.current_period_end_at>now()),false))
  )
 );
$$;
revoke all on function public.reengagement_email_is_eligible(uuid) from public,anon,authenticated;
grant execute on function public.reengagement_email_is_eligible(uuid) to service_role;

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
   and ((q.kind='reengagement' and q.payload->>'campaign'='budget-2026-11-12' and public.reengagement_email_is_eligible(u.id)) or q.kind='welcome'
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


with audience as (
 select distinct on (lower(trim(u.email))) u.id,u.email
 from auth.users u where public.reengagement_email_is_eligible(u.id)
 order by lower(trim(u.email)),u.created_at desc,u.id desc
), queued as (
 insert into public.lifecycle_email_outbox(user_id,recipient_email,event_key,kind,payload)
 select id,email,'campaign:budget-2026-11-12:'||md5(lower(trim(email))),'reengagement',jsonb_build_object('campaign','budget-2026-11-12')
 from audience on conflict(event_key) do nothing returning id
) select count(*) as emails_added_to_queue from queued;
commit;
