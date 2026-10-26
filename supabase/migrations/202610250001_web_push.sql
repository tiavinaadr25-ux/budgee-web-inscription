-- Private browser push endpoints. Run in the Supabase SQL editor once.
create table if not exists public.web_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint_hash text not null unique,
 endpoint text not null,
 p256dh text not null,
 auth text not null,
 preferences jsonb not null default '{"eveningReminder":true,"budgetAlerts":true,"goalReached":true,"monthlyReport":false}',
 timezone text not null default 'UTC',
 reminder_hour integer not null default 21 check(reminder_hour between 0 and 23),
 enabled boolean not null default true,
 next_check_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists web_push_due on public.web_push_subscriptions(next_check_at) where enabled;
create index if not exists web_push_owner on public.web_push_subscriptions(user_id);
alter table public.web_push_subscriptions enable row level security;
revoke all on public.web_push_subscriptions from anon, authenticated;
grant all on public.web_push_subscriptions to service_role;

create table if not exists public.web_push_deliveries (
 subscription_id uuid not null references public.web_push_subscriptions(id) on delete cascade,
 event_key text not null,
 status text not null default 'pending' check(status in ('pending','sent','failed')),
 attempts integer not null default 1,
 lease_until timestamptz not null default now()+interval '1 minute',
 next_attempt_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 primary key(subscription_id,event_key)
);
alter table public.web_push_deliveries enable row level security;
revoke all on public.web_push_deliveries from anon, authenticated;
grant all on public.web_push_deliveries to service_role;

create or replace function public.claim_web_push_subscriptions(batch_size integer default 40)
returns setof public.web_push_subscriptions
language sql security definer set search_path=pg_catalog,public as $$
 with due as (
  select id from public.web_push_subscriptions
  where enabled and next_check_at <= now()
  order by next_check_at,id limit greatest(1,least(batch_size,100))
  for update skip locked
 )
 update public.web_push_subscriptions s set next_check_at=now()+interval '5 minutes'
 from due where s.id=due.id returning s.*;
$$;

create or replace function public.claim_web_push_delivery(p_subscription_id uuid,p_event_key text)
returns boolean language sql security definer set search_path=pg_catalog,public as $$
 with claimed as (
  insert into public.web_push_deliveries(subscription_id,event_key)
  values(p_subscription_id,p_event_key)
  on conflict(subscription_id,event_key) do update
  set status='pending', attempts=web_push_deliveries.attempts+1,
      lease_until=now()+interval '1 minute'
  where web_push_deliveries.attempts<3 and (
    (web_push_deliveries.status='failed' and web_push_deliveries.next_attempt_at<=now()) or
    (web_push_deliveries.status='pending' and web_push_deliveries.lease_until<now())
  ) returning 1
 ) select exists(select 1 from claimed);
$$;
revoke all on function public.claim_web_push_subscriptions(integer) from public,anon,authenticated;
revoke all on function public.claim_web_push_delivery(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_web_push_subscriptions(integer) to service_role;
grant execute on function public.claim_web_push_delivery(uuid,text) to service_role;
