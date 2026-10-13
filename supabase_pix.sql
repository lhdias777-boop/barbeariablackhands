-- Executar no SQL Editor do Supabase (com projeto próprio e RLS).
create table if not exists public.bh_pix_orders (
 id uuid primary key,
 kind text not null check(kind in ('store','booking')),
 asaas_payment_id text not null unique,
 amount numeric(10,2) not null check(amount>0),
 status text not null default 'PENDING' check(status in ('PENDING','PAID','CANCELED')),
 customer_name text not null,
 customer_phone text not null,
 customer_email text,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 paid_at timestamptz
);
alter table public.bh_pix_orders enable row level security;
-- Sem políticas públicas: somente backend com service role lê/escreve.
