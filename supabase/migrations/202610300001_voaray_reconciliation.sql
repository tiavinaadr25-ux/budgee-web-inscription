-- Keep the provider transaction identity before opening checkout.
-- Existing orders/data are preserved; only new bound transactions are reconciled.
alter table public.voaray_orders add column if not exists provider_trx_id text;
alter table public.voaray_orders add column if not exists next_verification_at timestamptz not null default now();
create unique index if not exists voaray_provider_transaction_unique
 on public.voaray_orders(environment,provider_trx_id) where provider_trx_id is not null;
create index if not exists voaray_pending_verification
 on public.voaray_orders(next_verification_at) where provider_trx_id is not null and status in ('pending','failed','canceled');
