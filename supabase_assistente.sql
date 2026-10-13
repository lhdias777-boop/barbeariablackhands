-- Execute no SQL Editor do Supabase, ajustando à estrutura real existente.
-- Não substitua tabelas já usadas pelo site sem migrar os dados.
create table if not exists public.bh_bookings (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 status text not null default 'solicitado', payment_status text default 'pendente',
 description text, created_at timestamptz not null default now()
);
create table if not exists public.bh_orders (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 status text not null default 'recebido', payment_status text default 'pendente',
 description text, created_at timestamptz not null default now()
);
alter table public.bh_bookings enable row level security;
alter table public.bh_orders enable row level security;
create policy "cliente consulta seus agendamentos" on public.bh_bookings for select to authenticated using (auth.uid() = user_id);
create policy "cliente consulta seus pedidos" on public.bh_orders for select to authenticated using (auth.uid() = user_id);
