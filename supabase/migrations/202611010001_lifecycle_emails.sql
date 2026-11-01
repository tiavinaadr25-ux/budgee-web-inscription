-- Automatic lifecycle email queue. No email is sent by this migration.
create table if not exists public.lifecycle_email_settings (
 singleton boolean primary key default true check(singleton),
 audience_since timestamptz not null default now()-interval '7 days'
);
insert into public.lifecycle_email_settings(singleton) values(true) on conflict do nothing;
create table if not exists public.lifecycle_email_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default true,
 updated_at timestamptz not null default now()
);
create table if not exists public.lifecycle_email_outbox (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 event_key text not null unique,
 kind text not null check(kind in ('welcome','trial_expired','mobile_confirmed','mobile_expiring','mobile_expired')),
 recipient_email text not null,
 payload jsonb not null default '{}',
 status text not null default 'pending' check(status in ('pending','processing','sent','review','canceled')),
 attempts integer not null default 0,
 lease_until timestamptz,
 next_attempt_at timestamptz not null default now(),
 first_attempt_at timestamptz,
 provider_message_id text,
 last_error text,
 created_at timestamptz not null default now(),
 sent_at timestamptz
);
create index if not exists lifecycle_email_due on public.lifecycle_email_outbox(status,next_attempt_at);
create index if not exists lifecycle_email_user on public.lifecycle_email_outbox(user_id,created_at,id);
create index if not exists lifecycle_email_sent on public.lifecycle_email_outbox(sent_at) where sent_at is not null;
alter table public.lifecycle_email_settings enable row level security;
alter table public.lifecycle_email_preferences enable row level security;
alter table public.lifecycle_email_outbox enable row level security;
revoke all on public.lifecycle_email_settings,public.lifecycle_email_preferences,public.lifecycle_email_outbox from anon,authenticated;
grant all on public.lifecycle_email_settings,public.lifecycle_email_preferences,public.lifecycle_email_outbox to service_role;

create or replace function public.collect_lifecycle_emails() returns integer
language plpgsql security definer set search_path=pg_catalog,public as $$
declare inserted integer;
begin
 with audience as (
  select u.id,u.email,u.created_at,coalesce(p.full_name,'') as full_name,
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
  from audience a where a.created_at >= (select audience_since from public.lifecycle_email_settings where singleton)
  union all
  select a.id,a.email,'trial_expired:'||a.subscription_id,'trial_expired',
   jsonb_build_object('name',left(a.full_name,80),'subscription_id',a.subscription_id)
  from audience a where not coalesce(a.access_active,false) and a.trial_ends_at<=now()
   and a.trial_ends_at >= (select audience_since from public.lifecycle_email_settings where singleton)
  union all
  select a.id,a.email,'mobile_confirmed:'||o.id,'mobile_confirmed',
   jsonb_build_object('name',left(a.full_name,80),'order_id',o.id,'access_ends_at',o.access_ends_at,'amount',o.amount,'currency',o.currency)
  from audience a join public.voaray_orders o on o.user_id=a.id
  where o.environment='production' and o.status='completed' and o.access_ends_at>now()
   and o.created_at >= (select audience_since from public.lifecycle_email_settings where singleton)
  union all
  select a.id,a.email,'mobile_expiring:'||o.id,'mobile_expiring',
   jsonb_build_object('name',left(a.full_name,80),'order_id',o.id,'access_ends_at',o.access_ends_at)
  from audience a join public.voaray_orders o on o.subscription_id=a.subscription_id
  where a.provider='voaray' and o.environment='production' and o.status='completed'
   and o.access_ends_at>now() and o.access_ends_at<=now()+interval '1 day'
  union all
  select a.id,a.email,'mobile_expired:'||o.id,'mobile_expired',
   jsonb_build_object('name',left(a.full_name,80),'order_id',o.id,'access_ends_at',o.access_ends_at)
  from audience a join public.voaray_orders o on o.subscription_id=a.subscription_id
  where a.provider='voaray' and not coalesce(a.access_active,false) and o.environment='production'
   and o.status='completed' and o.access_ends_at<=now()
   and o.access_ends_at >= (select audience_since from public.lifecycle_email_settings where singleton)
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
   and (q.kind='welcome'
    or (q.kind='trial_expired' and s.id::text=q.payload->>'subscription_id' and s.trial_ends_at<=now()
     and not coalesce(s.status='active' or (s.status in ('canceled','past_due') and s.current_period_end_at>now()),false))
    or (q.kind='mobile_confirmed' and o.status='completed' and o.environment='production' and o.access_ends_at>now())
    or (q.kind='mobile_expiring' and o.status='completed' and s.id=o.subscription_id and s.provider='voaray'
     and o.access_ends_at>now() and o.access_ends_at<=now()+interval '1 day')
    or (q.kind='mobile_expired' and o.status='completed' and s.id=o.subscription_id and s.provider='voaray' and o.access_ends_at<=now()
     and not coalesce(s.status='active' or (s.status in ('canceled','past_due') and s.current_period_end_at>now()),false)))
 );
$$;

create or replace function public.claim_lifecycle_emails(p_daily_limit integer default 100)
returns setof public.lifecycle_email_outbox
language plpgsql security definer set search_path=pg_catalog,public as $$
declare room integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('kloo-lifecycle-emails',0));
 update public.lifecycle_email_outbox set status='review',last_error='retry_window_closed'
 where status in ('pending','processing') and first_attempt_at is not null
  and (first_attempt_at<now()-interval '20 minutes' or attempts>=3)
  and (lease_until is null or lease_until<now());
 update public.lifecycle_email_outbox q set status='canceled'
 where q.status='pending' and not public.lifecycle_email_is_relevant(q.id);
 select greatest(0,least(1000,p_daily_limit)-count(*)::integer) into room
 from public.lifecycle_email_outbox where sent_at>now()-interval '24 hours'
  or (status='processing' and lease_until>now());
 return query with due as (
  select q.id from public.lifecycle_email_outbox q
  where (q.status='pending' and q.next_attempt_at<=now() or q.status='processing' and q.lease_until<now())
   and q.attempts<3 and public.lifecycle_email_is_relevant(q.id)
   and (q.kind='mobile_confirmed' or not exists(select 1 from public.lifecycle_email_outbox sent
    where sent.user_id=q.user_id and sent.sent_at>now()-interval '24 hours'))
   and not exists(select 1 from public.lifecycle_email_outbox earlier
    where earlier.user_id=q.user_id and earlier.id<>q.id and earlier.status in ('pending','processing')
     and q.kind<>'mobile_confirmed'
     and (case earlier.kind when 'mobile_confirmed' then 0 when 'welcome' then 1 else 2 end,earlier.created_at,earlier.id)
       <(case q.kind when 'welcome' then 1 else 2 end,q.created_at,q.id))
  order by case q.kind when 'mobile_confirmed' then 0 when 'welcome' then 1 else 2 end,q.created_at,q.id
  limit least(3,room) for update skip locked
 ) update public.lifecycle_email_outbox q set status='processing',attempts=q.attempts+1,
  first_attempt_at=coalesce(q.first_attempt_at,now()),lease_until=now()+interval '2 minutes'
 from due where q.id=due.id returning q.*;
end $$;

revoke all on function public.collect_lifecycle_emails() from public,anon,authenticated;
revoke all on function public.lifecycle_email_is_relevant(uuid) from public,anon,authenticated;
revoke all on function public.claim_lifecycle_emails(integer) from public,anon,authenticated;
grant execute on function public.collect_lifecycle_emails() to service_role;
grant execute on function public.lifecycle_email_is_relevant(uuid) to service_role;
grant execute on function public.claim_lifecycle_emails(integer) to service_role;
