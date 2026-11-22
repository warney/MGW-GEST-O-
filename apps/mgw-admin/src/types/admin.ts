export type PlatformRole = 'super_admin' | 'support' | 'finance';

export type AdminModuleId =
  | 'dashboard'
  | 'clients'
  | 'establishments'
  | 'plans'
  | 'finance'
  | 'monitoring'
  | 'support'
  | 'settings'
  | 'admins'
  | 'audit';

export interface PlatformAdminProfile {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  role: PlatformRole;
  active: boolean;
  aal: string;
  mfaVerified: boolean;
  createdAt: string;
}

export interface MonthlySeriesPoint {
  month_key: string;
  label: string;
  new_tenants: number;
  new_paid: number;
  sales_count: number;
}

export interface RecentTenantItem {
  id: string;
  slug: string;
  name: string;
  status: string;
  is_founder: boolean;
  billing_exempt: boolean;
  onboarding_completed: boolean;
  created_at: string;
  subscription_status: string | null;
  plan_code: string | null;
  trial_ends_at: string | null;
}

export interface PlatformOverview {
  totalClients: number;
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  founderTenants: number;
  trialActive: number;
  paidActive: number;
  pastDue: number;
  cancelledOrExpired: number;
  retentionActive: number;
  mrrCents: number;
  approvedPaymentsCents: number;
  pendingPaymentsCount: number;
  failedPaymentsCount: number;
  openTicketsCount: number;
  webhookFailedCount: number;
  salesCount30d: number;
  onlineOrdersCount30d: number;
  monthlySeries: MonthlySeriesPoint[];
  recentTenants: RecentTenantItem[];
}

export interface ClientMembershipSummary {
  memberId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
  role: string;
  memberActive: boolean;
  isFounder: boolean;
  subscriptionStatus: string | null;
  planCode: string | null;
}

export interface ClientRecord {
  user_id: string;
  email: string;
  full_name: string;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  created_at: string;
  banned_until: string | null;
  default_tenant_id: string | null;
  memberships: ClientMembershipSummary[];
  is_platform_admin: boolean;
}

export interface EstablishmentRecord {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'suspended' | 'archived';
  is_founder_account: boolean;
  billing_exempt: boolean;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
  owner_email: string | null;
  timezone: string | null;
  plan_code: string | null;
  plan_amount_cents: number | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  grace_until: string | null;
  retention_status: string | null;
  retention_ends_at: string | null;
  digital_menu_active: boolean;
  digital_menu_slug: string | null;
  active_members_count: number;
  products_count: number;
  sales_count: number;
  online_orders_count: number;
  last_sale_at: string | null;
}

export interface PlanRecord {
  code: string;
  name: string;
  description: string;
  amount_cents: number;
  currency: string;
  billing_interval: string;
  max_members: number;
  active: boolean;
  updated_at: string;
}

export interface AdminSubscriptionRecord {
  id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  tenant_status: string;
  is_founder_account: boolean;
  billing_exempt: boolean;
  plan_code: string;
  plan_amount_cents: number;
  currency: string;
  status: string;
  mp_preapproval_id: string | null;
  mp_payer_email: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_until: string | null;
  ended_at: string | null;
  retention_status: string;
  retention_started_at: string | null;
  retention_ends_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
}

export interface FinanceSummary {
  mrrCents: number;
  arrCents: number;
  approvedMonthCents: number;
  approvedTotalCents: number;
  pendingCents: number;
  rejectedCount: number;
  payingTenants: number;
  trialTenants: number;
  exemptTenants: number;
}

export interface PlatformPaymentRecord {
  id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  provider: string;
  mp_payment_id: string | null;
  mp_preapproval_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  payment_method: string;
  payer_email: string;
  failure_reason: string;
  paid_at: string | null;
  due_at: string | null;
  created_at: string;
}

export interface WebhookEventRecord {
  id: string;
  event_type: string;
  action: string | null;
  resource_id: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  signature_verified: boolean;
  processing_status: string;
  error_message: string | null;
  received_at: string;
  processed_at: string | null;
}

export interface SupportTicketRecord {
  id: string;
  ticket_number: number;
  tenant_id: string | null;
  tenant_name: string | null;
  requester_email: string;
  subject: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_client' | 'resolved' | 'closed';
  assigned_admin_id: string | null;
  assigned_admin_email: string | null;
  resolution_note: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  messages_count: number;
}

export interface SupportTicketMessageRecord {
  id: string;
  ticket_id: string;
  sender_type: 'platform_admin' | 'client' | 'system';
  sender_email: string;
  message: string;
  is_internal_note: boolean;
  created_at: string;
}

export interface PlatformSettingsRecord {
  id: number;
  platform_name: string;
  default_plan_code: string;
  default_plan_amount_cents: number;
  trial_days: number;
  grace_days: number;
  retention_months: number;
  support_email: string;
  support_whatsapp: string;
  allow_public_signup: boolean;
  maintenance_mode: boolean;
  maintenance_message: string;
  updated_at: string;
}

export interface PlatformAdminUserRecord {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: PlatformRole;
  active: boolean;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformAuditLogRecord {
  id: string;
  admin_user_id: string | null;
  admin_email: string;
  admin_role: string;
  action: string;
  target_type: string;
  target_id: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  reason: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface MfaFactorSummary {
  id: string;
  friendlyName: string;
  status: 'verified' | 'unverified';
}
