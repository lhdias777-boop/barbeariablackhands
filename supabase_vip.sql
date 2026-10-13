-- Execute no Supabase SQL Editor após conferir a estrutura existente.
create table if not exists public.bh_vip_payments (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 plan text not null check(plan in ('vip1','vip2')),
 asaas_payment_id text not null unique,
 amount numeric(10,2) not null,
 status text not null default 'PENDING',
 created_at timestamptz not null default now()
);
create table if not exists public.bh_vip_memberships (
 user_id uuid primary key references auth.users(id),
 plan text not null check(plan in ('vip1','vip2')),
 status text not null default 'ACTIVE',
 paid_until timestamptz not null,
 created_at timestamptz not null default now()
);
alter table public.bh_vip_payments enable row level security;
alter table public.bh_vip_memberships enable row level security;
-- Somente o backend com service role pode alterar essas tabelas.
create policy "VIP cliente consulta seu plano" on public.bh_vip_memberships
for select to authenticated using (auth.uid()=user_id);
create policy "VIP cliente consulta pagamentos" on public.bh_vip_payments
for select to authenticated using (auth.uid()=user_id);
