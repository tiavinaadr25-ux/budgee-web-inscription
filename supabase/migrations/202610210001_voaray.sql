-- Voaray prepaid access. Run once in Supabase SQL Editor before enabling payments.
-- Provider values are extended without removing existing provider validations.
do $$
declare provider_type text; c record;
begin
  select quote_ident(n.nspname)||'.'||quote_ident(t.typname) into provider_type
  from pg_attribute a join pg_type t on t.oid=a.atttypid join pg_namespace n on n.oid=t.typnamespace
  where a.attrelid='public.subscriptions'::regclass and a.attname='provider' and t.typtype='e';
  if provider_type is not null then execute 'alter type '||provider_type||' add value if not exists ''voaray'''; end if;
  for c in select conname, pg_get_expr(conbin,conrelid) as expression
    from pg_constraint where conrelid='public.subscriptions'::regclass and contype='c'
      and conkey=array[(select attnum from pg_attribute where attrelid='public.subscriptions'::regclass and attname='provider')]::smallint[]
  loop
    execute format('alter table public.subscriptions drop constraint %I', c.conname);
    execute format('alter table public.subscriptions add constraint %I check ((provider::text = ''voaray'') or (%s))', c.conname,c.expression);
  end loop;
end $$;

create table if not exists public.voaray_orders (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 purchase_key text not null,
 amount numeric(18,2) not null check(amount > 0),
 currency text not null check(currency ~ '^[A-Z]{3}$'),
 environment text not null check(environment in ('sandbox','production')),
 status text not null default 'pending' check(status in ('pending','failed','canceled','completed','sandbox_completed','refunded','duplicate_payment')),
 subscription_id uuid references public.subscriptions(id),
 access_ends_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index if not exists voaray_one_pending_order on public.voaray_orders(purchase_key) where status='pending';
create index if not exists voaray_orders_user on public.voaray_orders(user_id,created_at desc);
alter table public.voaray_orders enable row level security;
revoke all on public.voaray_orders from anon, authenticated;
grant all on public.voaray_orders to service_role;

create or replace function public.fulfill_voaray_order(p_order_id uuid) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.voaray_orders%rowtype; new_subscription uuid; ends_at timestamptz;
begin
 select * into item from public.voaray_orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(item.user_id::text,0));
 if item.status in ('completed','sandbox_completed','refunded','duplicate_payment') then return item.status; end if;
 if item.environment='sandbox' then
   update public.voaray_orders set status='sandbox_completed',updated_at=now() where id=item.id;
   return 'sandbox_completed'; -- Never grant production access for a sandbox payment.
 end if;
 if exists(select 1 from public.voaray_orders where purchase_key=item.purchase_key and id<>item.id and status='completed') then
   update public.voaray_orders set status='duplicate_payment',updated_at=now() where id=item.id;
   return 'duplicate_payment'; -- Payment needs merchant reconciliation, not another month of credit.
 end if;
 ends_at=now()+interval '1 month';
 -- Canceled + a future paid-through date is the app's existing finite-access representation.
 -- Mobile Money is prepaid; there is no automatic recurring debit to cancel.
 insert into public.subscriptions(user_id,provider,provider_subscription_id,status,price_amount,currency,
   trial_ends_at,current_period_end_at,cancel_at_period_end)
 values(item.user_id,'voaray','voaray:'||item.id::text,'canceled',item.amount,item.currency,null,ends_at,true)
 returning id into new_subscription;
 insert into public.billing_records(user_id,provider_invoice_id,amount,currency,billed_at,status,label)
 values(item.user_id,'voaray:'||item.id::text,item.amount,item.currency,now(),'paid','Kloo — un mois via Voaray')
 on conflict(provider_invoice_id) do nothing;
 update public.voaray_orders set status='completed',subscription_id=new_subscription,access_ends_at=ends_at,updated_at=now() where id=item.id;
 return 'completed';
end $$;

create or replace function public.refund_voaray_order(p_order_id uuid) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.voaray_orders%rowtype;
begin
 select * into item from public.voaray_orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(item.user_id::text,0));
 if item.subscription_id is not null then
   update public.subscriptions set current_period_end_at=now(),cancel_at_period_end=true,status='canceled'
   where id=item.subscription_id and provider_subscription_id='voaray:'||item.id::text;
 end if;
 update public.voaray_orders set status='refunded',access_ends_at=least(access_ends_at,now()),updated_at=now() where id=item.id;
 update public.billing_records set status='failed' where provider_invoice_id='voaray:'||item.id::text;
 return 'refunded';
end $$;
revoke all on function public.fulfill_voaray_order(uuid) from public,anon,authenticated;
revoke all on function public.refund_voaray_order(uuid) from public,anon,authenticated;
grant execute on function public.fulfill_voaray_order(uuid) to service_role;
grant execute on function public.refund_voaray_order(uuid) to service_role;
