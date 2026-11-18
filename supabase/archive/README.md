# Archived Supabase migration drafts

The SQL files in this directory are historical drafts from the pre-production implementation.

They are intentionally outside `supabase/migrations/` because their schema and behavior were superseded by the versioned migrations that match the applied production migration history:

- `20261118190220_initial_saas_schema.sql`
- `20261118190223_saas_signup_and_digital_menu.sql`
- `20261118191318_online_orders_and_trial_access.sql`
- `20261118195047_etapa4_multi_tenant_rbac_and_plans.sql`
- `20261118195322_security_hardening_and_role_enforcement.sql`

**Do not execute the archived files against production.** They are retained only for historical reference.
