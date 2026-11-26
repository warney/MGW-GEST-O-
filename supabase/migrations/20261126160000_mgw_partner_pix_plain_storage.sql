begin;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='mgw_partner_payout_profiles' and column_name='pix_key_ciphertext'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='mgw_partner_payout_profiles' and column_name='pix_key'
  ) then
    alter table public.mgw_partner_payout_profiles rename column pix_key_ciphertext to pix_key;
  end if;
end $$;
alter table public.mgw_partner_payout_profiles
  drop constraint if exists mgw_partner_pix_ciphertext_len;
alter table public.mgw_partner_payout_profiles
  drop constraint if exists mgw_partner_pix_key_len;
alter table public.mgw_partner_payout_profiles
  add constraint mgw_partner_pix_key_len check (char_length(btrim(pix_key)) between 3 and 160);
comment on column public.mgw_partner_payout_profiles.pix_key is
  'Chave Pix do parceiro em texto legível; acesso somente pelas Edge Functions autenticadas do parceiro e Super Admin.';
commit;