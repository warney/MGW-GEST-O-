-- MGW Parceiros - estrutura inicial e provisionamento independente de estabelecimentos.
-- Esta migration cria somente a estrutura. A aplicação no banco ativo será feita
-- após revisão e validação da etapa.

begin;

create table if not exists public.mgw_partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  referral_code text not null unique,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mgw_partners_email_normalized check (
    email = lower(btrim(email)) and position('@' in email) > 1
  ),
  constraint mgw_partners_name_valid check (char_length(btrim(full_name)) between 2 and 120),
  constraint mgw_partners_referral_code_valid check (referral_code ~ '^[A-Z0-9]{8,16}$')
);

-- Atribuicao de clientes indicados: um estabelecimento pode pertencer a no maximo um parceiro.
create table if not exists public.mgw_partner_referrals (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.mgw_partners(id) on delete restrict,
  referred_user_id uuid not null unique references auth.users(id) on delete restrict,
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  referral_code text not null,
  status text not null default 'registered'
    check (status in ('registered', 'converted', 'rejected')),
  created_at timestamptz not null default now(),
  converted_at timestamptz,
  constraint mgw_partner_referrals_code_valid check (referral_code ~ '^[A-Z0-9]{8,16}
  'Contas do programa MGW Parceiros. Não dependem de tenant, loja ou assinatura MGW Gestão.';

alter table public.mgw_partners enable row level security;

drop policy if exists mgw_partners_select_self_or_platform_admin on public.mgw_partners;
create policy mgw_partners_select_self_or_platform_admin
on public.mgw_partners
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_platform_admin(array['super_admin', 'support', 'finance'])
);

revoke all on table public.mgw_partners from anon, authenticated;
grant select on table public.mgw_partners to authenticated;

-- O trigger existente provisiona um tenant para todo novo auth.users.
-- Contas marcadas explicitamente como parceiro recebem somente mgw_partners.
create or replace function public.provision_new_mgw_owner()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_name text;
  v_slug_base text;
  v_slug text;
  v_tenant_id uuid;
  v_trial_days integer := 3;
  v_trial_amount integer;
  v_referral_code text;
begin
  v_name := left(btrim(coalesce(NEW.raw_user_meta_data ->> 'shop_name', '')), 80);
  if v_name = '' then
    v_name := left(coalesce(
      nullif(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(NEW.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(split_part(coalesce(NEW.email, ''), '@', 1)), ''),
      'Estabelecimento'
    ), 80);
  end if;

  if coalesce(NEW.raw_user_meta_data ->> 'account_type', '') = 'mgw_partner' then
    v_referral_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    insert into public.mgw_partners (
      user_id, email, full_name, referral_code, status
    )
    values (
      NEW.id,
      lower(btrim(NEW.email)),
      left(btrim(coalesce(
        nullif(NEW.raw_user_meta_data ->> 'full_name', ''),
        nullif(NEW.raw_user_meta_data ->> 'name', ''),
        split_part(coalesce(NEW.email, ''), '@', 1)
      )), 120),
      v_referral_code,
      'active'
    );

    return NEW;
  end if;

  select amount_cents into v_trial_amount
  from public.plans
  where code = 'trial' and active = true;

  if v_trial_amount is null then
    raise exception 'Plano trial não está configurado.';
  end if;

  v_slug_base := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug_base := trim(both '-' from v_slug_base);
  if char_length(v_slug_base) < 2 then
    v_slug_base := 'loja';
  end if;
  v_slug := left(v_slug_base, 48) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.tenants (slug, name, status, billing_exempt)
  values (v_slug, v_name, 'active', false)
  returning id into v_tenant_id;

  insert into public.tenant_members (tenant_id, user_id, email, role, active)
  values (v_tenant_id, NEW.id, lower(btrim(NEW.email)), 'owner', true);

  insert into public.subscriptions (
    tenant_id, plan_code, plan_amount_cents, currency, status,
    trial_ends_at, current_period_start, current_period_end
  )
  values (
    v_tenant_id, 'trial', v_trial_amount, 'BRL', 'trialing',
    now() + make_interval(days => v_trial_days), now(),
    now() + make_interval(days => v_trial_days)
  );

  insert into public.shop_settings (tenant_id, owner_email, establishment_name, start_date)
  values (v_tenant_id, lower(btrim(NEW.email)), v_name, current_date);

  insert into public.digital_menu_settings (
    tenant_id, slug, is_active, is_open, store_name, description,
    phone_whatsapp, address, opening_hours, pix_key, delivery_fee,
    minimum_order_amount, accepts_delivery, accepts_pickup
  ) values (
    v_tenant_id, v_slug, false, true, v_name,
    'Confira nosso cardápio e faça seu pedido online.',
    '', '', 'Consulte nosso horário de funcionamento', '', 5, 15, true, true
  );

  insert into public.user_profiles (user_id, email, full_name, default_tenant_id)
  values (
    NEW.id,
    lower(btrim(NEW.email)),
    left(btrim(coalesce(NEW.raw_user_meta_data ->> 'full_name', '')), 120),
    v_tenant_id
  );

  -- O codigo vem de metadata editavel pelo usuario, portanto e tratado somente
  -- como atribuicao comercial; nunca concede permissao ou acesso privilegiado.
  v_referral_code := upper(left(btrim(coalesce(NEW.raw_user_meta_data ->> 'referral_code', '')), 16));
  if v_referral_code ~ '^[A-Z0-9]{8,16}
end;
$function$;

commit;
)
);

create index if not exists idx_mgw_partner_referrals_partner_created
  on public.mgw_partner_referrals (partner_id, created_at desc);
alter table public.mgw_partner_referrals enable row level security;
revoke all on table public.mgw_partner_referrals from anon, authenticated;

comment on table public.mgw_partners is
  'Contas do programa MGW Parceiros. Não dependem de tenant, loja ou assinatura MGW Gestão.';

alter table public.mgw_partners enable row level security;

drop policy if exists mgw_partners_select_self_or_platform_admin on public.mgw_partners;
create policy mgw_partners_select_self_or_platform_admin
on public.mgw_partners
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_platform_admin(array['super_admin', 'support', 'finance'])
);

revoke all on table public.mgw_partners from anon, authenticated;
grant select on table public.mgw_partners to authenticated;

-- O trigger existente provisiona um tenant para todo novo auth.users.
-- Contas marcadas explicitamente como parceiro recebem somente mgw_partners.
create or replace function public.provision_new_mgw_owner()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_name text;
  v_slug_base text;
  v_slug text;
  v_tenant_id uuid;
  v_trial_days integer := 3;
  v_trial_amount integer;
  v_referral_code text;
begin
  v_name := left(btrim(coalesce(NEW.raw_user_meta_data ->> 'shop_name', '')), 80);
  if v_name = '' then
    v_name := left(coalesce(
      nullif(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(NEW.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(split_part(coalesce(NEW.email, ''), '@', 1)), ''),
      'Estabelecimento'
    ), 80);
  end if;

  if coalesce(NEW.raw_user_meta_data ->> 'account_type', '') = 'mgw_partner' then
    v_referral_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    insert into public.mgw_partners (
      user_id, email, full_name, referral_code, status
    )
    values (
      NEW.id,
      lower(btrim(NEW.email)),
      left(btrim(coalesce(
        nullif(NEW.raw_user_meta_data ->> 'full_name', ''),
        nullif(NEW.raw_user_meta_data ->> 'name', ''),
        split_part(coalesce(NEW.email, ''), '@', 1)
      )), 120),
      v_referral_code,
      'active'
    );

    return NEW;
  end if;

  select amount_cents into v_trial_amount
  from public.plans
  where code = 'trial' and active = true;

  if v_trial_amount is null then
    raise exception 'Plano trial não está configurado.';
  end if;

  v_slug_base := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug_base := trim(both '-' from v_slug_base);
  if char_length(v_slug_base) < 2 then
    v_slug_base := 'loja';
  end if;
  v_slug := left(v_slug_base, 48) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.tenants (slug, name, status, billing_exempt)
  values (v_slug, v_name, 'active', false)
  returning id into v_tenant_id;

  insert into public.tenant_members (tenant_id, user_id, email, role, active)
  values (v_tenant_id, NEW.id, lower(btrim(NEW.email)), 'owner', true);

  insert into public.subscriptions (
    tenant_id, plan_code, plan_amount_cents, currency, status,
    trial_ends_at, current_period_start, current_period_end
  )
  values (
    v_tenant_id, 'trial', v_trial_amount, 'BRL', 'trialing',
    now() + make_interval(days => v_trial_days), now(),
    now() + make_interval(days => v_trial_days)
  );

  insert into public.shop_settings (tenant_id, owner_email, establishment_name, start_date)
  values (v_tenant_id, lower(btrim(NEW.email)), v_name, current_date);

  insert into public.digital_menu_settings (
    tenant_id, slug, is_active, is_open, store_name, description,
    phone_whatsapp, address, opening_hours, pix_key, delivery_fee,
    minimum_order_amount, accepts_delivery, accepts_pickup
  ) values (
    v_tenant_id, v_slug, false, true, v_name,
    'Confira nosso cardápio e faça seu pedido online.',
    '', '', 'Consulte nosso horário de funcionamento', '', 5, 15, true, true
  );

  insert into public.user_profiles (user_id, email, full_name, default_tenant_id)
  values (
    NEW.id,
    lower(btrim(NEW.email)),
    left(btrim(coalesce(NEW.raw_user_meta_data ->> 'full_name', '')), 120),
    v_tenant_id
  );

  return NEW;
end;
$function$;

commit;
 then
    insert into public.mgw_partner_referrals (
      partner_id, referred_user_id, tenant_id, referral_code, status
    )
    select p.id, NEW.id, v_tenant_id, p.referral_code, 'registered'
    from public.mgw_partners p
    where p.referral_code = v_referral_code
      and p.status = 'active'
      and p.user_id <> NEW.id
    on conflict (tenant_id) do nothing;
  end if;

  return NEW;
end;
$function$;

commit;
)
);

create index if not exists idx_mgw_partner_referrals_partner_created
  on public.mgw_partner_referrals (partner_id, created_at desc);
alter table public.mgw_partner_referrals enable row level security;
revoke all on table public.mgw_partner_referrals from anon, authenticated;

comment on table public.mgw_partners is
  'Contas do programa MGW Parceiros. Não dependem de tenant, loja ou assinatura MGW Gestão.';

alter table public.mgw_partners enable row level security;

drop policy if exists mgw_partners_select_self_or_platform_admin on public.mgw_partners;
create policy mgw_partners_select_self_or_platform_admin
on public.mgw_partners
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_platform_admin(array['super_admin', 'support', 'finance'])
);

revoke all on table public.mgw_partners from anon, authenticated;
grant select on table public.mgw_partners to authenticated;

-- O trigger existente provisiona um tenant para todo novo auth.users.
-- Contas marcadas explicitamente como parceiro recebem somente mgw_partners.
create or replace function public.provision_new_mgw_owner()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_name text;
  v_slug_base text;
  v_slug text;
  v_tenant_id uuid;
  v_trial_days integer := 3;
  v_trial_amount integer;
  v_referral_code text;
begin
  v_name := left(btrim(coalesce(NEW.raw_user_meta_data ->> 'shop_name', '')), 80);
  if v_name = '' then
    v_name := left(coalesce(
      nullif(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(NEW.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(split_part(coalesce(NEW.email, ''), '@', 1)), ''),
      'Estabelecimento'
    ), 80);
  end if;

  if coalesce(NEW.raw_user_meta_data ->> 'account_type', '') = 'mgw_partner' then
    v_referral_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    insert into public.mgw_partners (
      user_id, email, full_name, referral_code, status
    )
    values (
      NEW.id,
      lower(btrim(NEW.email)),
      left(btrim(coalesce(
        nullif(NEW.raw_user_meta_data ->> 'full_name', ''),
        nullif(NEW.raw_user_meta_data ->> 'name', ''),
        split_part(coalesce(NEW.email, ''), '@', 1)
      )), 120),
      v_referral_code,
      'active'
    );

    return NEW;
  end if;

  select amount_cents into v_trial_amount
  from public.plans
  where code = 'trial' and active = true;

  if v_trial_amount is null then
    raise exception 'Plano trial não está configurado.';
  end if;

  v_slug_base := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug_base := trim(both '-' from v_slug_base);
  if char_length(v_slug_base) < 2 then
    v_slug_base := 'loja';
  end if;
  v_slug := left(v_slug_base, 48) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.tenants (slug, name, status, billing_exempt)
  values (v_slug, v_name, 'active', false)
  returning id into v_tenant_id;

  insert into public.tenant_members (tenant_id, user_id, email, role, active)
  values (v_tenant_id, NEW.id, lower(btrim(NEW.email)), 'owner', true);

  insert into public.subscriptions (
    tenant_id, plan_code, plan_amount_cents, currency, status,
    trial_ends_at, current_period_start, current_period_end
  )
  values (
    v_tenant_id, 'trial', v_trial_amount, 'BRL', 'trialing',
    now() + make_interval(days => v_trial_days), now(),
    now() + make_interval(days => v_trial_days)
  );

  insert into public.shop_settings (tenant_id, owner_email, establishment_name, start_date)
  values (v_tenant_id, lower(btrim(NEW.email)), v_name, current_date);

  insert into public.digital_menu_settings (
    tenant_id, slug, is_active, is_open, store_name, description,
    phone_whatsapp, address, opening_hours, pix_key, delivery_fee,
    minimum_order_amount, accepts_delivery, accepts_pickup
  ) values (
    v_tenant_id, v_slug, false, true, v_name,
    'Confira nosso cardápio e faça seu pedido online.',
    '', '', 'Consulte nosso horário de funcionamento', '', 5, 15, true, true
  );

  insert into public.user_profiles (user_id, email, full_name, default_tenant_id)
  values (
    NEW.id,
    lower(btrim(NEW.email)),
    left(btrim(coalesce(NEW.raw_user_meta_data ->> 'full_name', '')), 120),
    v_tenant_id
  );

  return NEW;
end;
$function$;

commit;
