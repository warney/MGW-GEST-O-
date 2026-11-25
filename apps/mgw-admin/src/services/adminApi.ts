import type {
  AdminSubscriptionRecord,
  ClientRecord,
  EstablishmentRecord,
  FinanceSummary,
  MfaFactorSummary,
  PlanRecord,
  PlatformAdminProfile,
  PlatformAdminUserRecord,
  PlatformAuditLogRecord,
  PlatformOverview,
  PlatformPaymentRecord,
  PlatformRole,
  PlatformSettingsRecord,
  SupportTicketMessageRecord,
  SupportTicketRecord,
  WebhookEventRecord,
} from '../types/admin';
import { getSupabaseAdminClient } from './supabaseClient';

export class PendingMigrationError extends Error {
  readonly isPendingMigration = true;

  constructor(message: string) {
    super(message);
    this.name = 'PendingMigrationError';
  }
}

export function isPendingMigrationMessage(message: string): boolean {
  return (
    message.includes('PGRST202') ||
    message.includes('42883') ||
    message.includes('Could not find the function') ||
    (message.includes('function public.admin_') && message.includes('does not exist')) ||
    /migration 20261122(?:000001|171114|171122) pendente/i.test(message)
  );
}

export function isPendingMigrationError(error: unknown): boolean {
  if (error instanceof PendingMigrationError) return true;
  if (typeof error === 'object' && error !== null && 'isPendingMigration' in error) {
    return Boolean((error as { isPendingMigration: unknown }).isPendingMigration);
  }
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return isPendingMigrationMessage(msg);
}

export function formatAdminError(error: unknown): string {
  if (!error) return 'Erro inesperado na comunicacao com o servidor.';
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);

  if (isPendingMigrationMessage(message)) {
    return 'Os RPCs administrativos da Etapa 4.1 ainda nao estao disponiveis no Supabase remoto. Reconcile e aplique as migrations administrativas pendentes antes de usar este recurso.';
  }

  if (message.includes('MFA/AAL2')) {
    return 'Verificacao em duas etapas (MFA/AAL2) obrigatoria para confirmar esta acao critica.';
  }

  return message;
}

export async function signInAdmin(email: string, password: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new Error(error.message);
}

export async function signOutAdmin(): Promise<void> {
  const supabase = getSupabaseAdminClient();
  await supabase.auth.signOut();
}

export async function getMfaStatus(): Promise<{
  currentLevel: 'aal1' | 'aal2' | null;
  nextLevel: 'aal1' | 'aal2' | null;
  verifiedFactors: MfaFactorSummary[];
}> {
  const supabase = getSupabaseAdminClient();
  const [{ data: aalData, error: aalError }, { data: factorsData, error: factorsError }] =
    await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);

  if (aalError) throw new Error(aalError.message);
  if (factorsError) throw new Error(factorsError.message);

  const totp = factorsData?.totp ?? [];
  const verifiedFactors: MfaFactorSummary[] = totp.map((factor) => ({
    id: factor.id,
    friendlyName: factor.friendly_name || 'Autenticador TOTP',
    status: factor.status === 'verified' ? 'verified' : 'unverified',
  }));

  return {
    currentLevel: (aalData?.currentLevel as 'aal1' | 'aal2' | null) ?? null,
    nextLevel: (aalData?.nextLevel as 'aal1' | 'aal2' | null) ?? null,
    verifiedFactors: verifiedFactors.filter((item) => item.status === 'verified'),
  };
}

export async function enrollTotpFactor(friendlyName = 'MGW Admin TOTP'): Promise<{
  factorId: string;
  qrCodeSvg: string;
  secret: string;
}> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName,
  });
  if (error || !data) {
    throw new Error(error?.message || 'Nao foi possivel iniciar o registro MFA.');
  }
  return {
    factorId: data.id,
    qrCodeSvg: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

export async function verifyTotpChallenge(factorId: string, code: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const cleanCode = code.replace(/\D/g, '').slice(0, 6);
  if (cleanCode.length !== 6) {
    throw new Error('Informe o codigo de 6 digitos do aplicativo autenticador.');
  }
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: cleanCode,
  });
  if (error) {
    throw new Error(error.message || 'Codigo TOTP invalido.');
  }
}

async function callRpc<T>(fnName: string, params?: Record<string, unknown>): Promise<T> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc(fnName, params ?? {});
  if (error) {
    const formatted = formatAdminError(error);
    if (isPendingMigrationMessage(error.message || formatted)) {
      throw new PendingMigrationError(formatted);
    }
    throw new Error(formatted);
  }
  return data as T;
}

export async function fetchMyAdminProfile(): Promise<PlatformAdminProfile | null> {
  return callRpc<PlatformAdminProfile | null>('admin_get_my_profile');
}

export async function fetchPlatformOverview(): Promise<PlatformOverview> {
  return callRpc<PlatformOverview>('admin_get_platform_overview');
}

export async function fetchClients(search = '', limit = 100, offset = 0): Promise<{
  total: number;
  items: ClientRecord[];
}> {
  return callRpc('admin_list_clients', {
    p_search: search,
    p_limit: limit,
    p_offset: offset,
  });
}

export async function setMemberActiveStatus(
  memberId: string,
  active: boolean,
  reason: string,
): Promise<{ memberId: string; active: boolean }> {
  return callRpc('admin_set_member_active', {
    p_member_id: memberId,
    p_active: active,
    p_reason: reason,
  });
}

export async function fetchEstablishments(
  search = '',
  status = 'all',
  limit = 100,
  offset = 0,
): Promise<{ total: number; items: EstablishmentRecord[] }> {
  return callRpc('admin_list_establishments', {
    p_search: search,
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  });
}

export interface EstablishmentMemberDetail {
  memberId: string;
  userId: string;
  email: string;
  fullName: string;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  role: string;
  memberActive: boolean;
  isFounder: boolean;
}

export async function fetchEstablishmentMembers(tenantId: string): Promise<{
  members: EstablishmentMemberDetail[];
  truncated: boolean;
}> {
  const res = await fetchClients('', 200, 0);
  const members: EstablishmentMemberDetail[] = [];

  for (const client of res.items) {
    for (const membership of client.memberships) {
      if (membership.tenantId === tenantId) {
        members.push({
          memberId: membership.memberId,
          userId: client.user_id,
          email: client.email,
          fullName: client.full_name,
          emailConfirmedAt: client.email_confirmed_at,
          lastSignInAt: client.last_sign_in_at,
          role: membership.role,
          memberActive: membership.memberActive,
          isFounder: membership.isFounder,
        });
      }
    }
  }

  const rolePriority: Record<string, number> = {
    owner: 0,
    admin: 1,
    manager: 2,
    staff: 3,
  };
  members.sort((a, b) => (rolePriority[a.role] ?? 9) - (rolePriority[b.role] ?? 9));

  return {
    members,
    truncated: res.total > res.items.length,
  };
}

export async function setEstablishmentStatus(
  tenantId: string,
  status: 'active' | 'suspended' | 'archived',
  reason: string,
): Promise<{ tenantId: string; status: string }> {
  return callRpc('admin_set_establishment_status', {
    p_tenant_id: tenantId,
    p_status: status,
    p_reason: reason,
  });
}

export async function fetchPlansAndSubscriptions(
  status = 'all',
  search = '',
): Promise<{ plans: PlanRecord[]; subscriptions: AdminSubscriptionRecord[] }> {
  return callRpc('admin_list_plans_and_subscriptions', {
    p_status: status,
    p_search: search,
  });
}

export async function updatePlan(params: {
  code: string;
  name: string;
  description: string;
  amountCents: number;
  maxMembers: number;
  active: boolean;
  reason: string;
}): Promise<{ code: string; updated: boolean }> {
  return callRpc('admin_update_plan', {
    p_code: params.code,
    p_name: params.name,
    p_description: params.description,
    p_amount_cents: params.amountCents,
    p_max_members: params.maxMembers,
    p_active: params.active,
    p_reason: params.reason,
  });
}

export async function manageSubscription(params: {
  tenantId: string;
  action:
    | 'extend_trial'
    | 'grant_exempt'
    | 'revoke_exempt'
    | 'activate_manual'
    | 'suspend_nonpayment'
    | 'reactivate_tenant';
  days?: number;
  reason: string;
}): Promise<{ tenantId: string; action: string; ok: boolean }> {
  return callRpc('admin_manage_subscription', {
    p_tenant_id: params.tenantId,
    p_action: params.action,
    p_days: params.days ?? null,
    p_reason: params.reason,
  });
}

export async function manageSubscriptionExpiry(params: {
  tenantId: string;
  mode: 'extend' | 'set' | 'expire';
  duration?: number;
  unit?: 'days' | 'months' | 'years';
  expiresAt?: string;
  reason: string;
}): Promise<{ tenantId: string; action: string; ok: boolean; expiresAt?: string }> {
  return callRpc('admin_set_subscription_expiry', {
    p_tenant_id: params.tenantId,
    p_mode: params.mode,
    p_duration: params.duration ?? null,
    p_unit: params.unit ?? 'days',
    p_expires_at: params.expiresAt ?? null,
    p_reason: params.reason,
  });
}

export async function fetchFinanceSummary(): Promise<FinanceSummary> {
  return callRpc('admin_get_finance_summary');
}

export async function fetchPayments(
  status = 'all',
  limit = 100,
): Promise<PlatformPaymentRecord[]> {
  return callRpc('admin_list_payments', {
    p_status: status,
    p_limit: limit,
  });
}

export async function fetchWebhookEvents(
  status = 'all',
  limit = 100,
): Promise<WebhookEventRecord[]> {
  return callRpc('admin_list_webhook_events', {
    p_status: status,
    p_limit: limit,
  });
}

export async function fetchTickets(
  status = 'all',
  priority = 'all',
  search = '',
): Promise<SupportTicketRecord[]> {
  return callRpc('admin_list_tickets', {
    p_status: status,
    p_priority: priority,
    p_search: search,
  });
}

export async function createTicket(params: {
  tenantId: string | null;
  requesterEmail: string;
  subject: string;
  category: string;
  priority: string;
  initialMessage: string;
}): Promise<{ id: string; ticketNumber: number }> {
  return callRpc('admin_create_ticket', {
    p_tenant_id: params.tenantId,
    p_requester_email: params.requesterEmail,
    p_subject: params.subject,
    p_category: params.category,
    p_priority: params.priority,
    p_initial_message: params.initialMessage,
  });
}

export async function fetchTicketMessages(
  ticketId: string,
): Promise<SupportTicketMessageRecord[]> {
  return callRpc('admin_get_ticket_messages', {
    p_ticket_id: ticketId,
  });
}

export async function replyOrUpdateTicket(params: {
  ticketId: string;
  status?: string;
  priority?: string;
  message?: string;
  isInternalNote?: boolean;
}): Promise<{ ticketId: string; ok: boolean }> {
  return callRpc('admin_reply_or_update_ticket', {
    p_ticket_id: params.ticketId,
    p_status: params.status ?? null,
    p_priority: params.priority ?? null,
    p_message: params.message ?? null,
    p_is_internal_note: params.isInternalNote ?? false,
  });
}

export async function fetchPlatformSettings(): Promise<PlatformSettingsRecord> {
  return callRpc('admin_get_platform_settings');
}

export async function updatePlatformSettings(params: {
  platformName: string;
  trialDays: number;
  graceDays: number;
  retentionMonths: number;
  supportEmail: string;
  supportWhatsapp: string;
  allowPublicSignup: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  reason: string;
}): Promise<PlatformSettingsRecord> {
  return callRpc('admin_update_platform_settings', {
    p_platform_name: params.platformName,
    p_trial_days: params.trialDays,
    p_grace_days: params.graceDays,
    p_retention_months: params.retentionMonths,
    p_support_email: params.supportEmail,
    p_support_whatsapp: params.supportWhatsapp,
    p_allow_public_signup: params.allowPublicSignup,
    p_maintenance_mode: params.maintenanceMode,
    p_maintenance_message: params.maintenanceMessage,
    p_reason: params.reason,
  });
}

export async function fetchPlatformAdmins(): Promise<PlatformAdminUserRecord[]> {
  return callRpc('admin_list_platform_admins');
}

export async function upsertPlatformAdmin(params: {
  email: string;
  role: PlatformRole;
  fullName: string;
  active: boolean;
  notes: string;
  reason: string;
}): Promise<PlatformAdminUserRecord> {
  return callRpc('admin_upsert_platform_admin', {
    p_email: params.email,
    p_role: params.role,
    p_full_name: params.fullName,
    p_active: params.active,
    p_notes: params.notes,
    p_reason: params.reason,
  });
}

export async function fetchAuditLogs(
  action = 'all',
  targetType = 'all',
  limit = 150,
): Promise<PlatformAuditLogRecord[]> {
  return callRpc('admin_list_audit_logs', {
    p_action: action,
    p_target_type: targetType,
    p_limit: limit,
  });
}

export interface MgwPartnerAdminRecord {
  id:string; email:string; full_name:string; referral_code:string; status:'active'|'suspended'|'blocked';
  created_at:string; referral_count:number; converted_count:number; pending_cents:number; paid_cents:number;
}
export interface MgwPartnerProgramSettings { id:number; commission_percent:number; payout_enabled:boolean; payout_schedule_day:'friday'; }
export async function fetchMgwPartners():Promise<MgwPartnerAdminRecord[]> { return callRpc('admin_list_mgw_partners'); }
export async function fetchMgwPartnerSettings():Promise<MgwPartnerProgramSettings> { return callRpc('admin_get_mgw_partner_settings'); }
export async function updateMgwPartnerStatus(partnerId:string,status:'active'|'suspended'|'blocked',reason:string):Promise<unknown>{
  return callRpc('admin_update_mgw_partner',{p_partner_id:partnerId,p_status:status,p_reason:reason});
}
export async function updateMgwPartnerProgram(params:{commissionPercent:number;reason:string}):Promise<MgwPartnerProgramSettings>{
  return callRpc('admin_update_mgw_partner_settings',{p_commission_percent:params.commissionPercent,p_reason:params.reason});
}

export interface MgwPartnerCommissionRecord {
  id:string; partner_id:string; partner_name:string; partner_email:string; referral_code:string;
  base_amount_cents:number; commission_percent:number; amount_cents:number;
  status:'available'|'paid'|'cancelled'; created_at:string; paid_at:string|null;
  payment_reference:string|null; payment_method:string|null; payment_note:string; reversal_required:boolean;
  has_pix_key:boolean; pix_key_type:string|null; pix_holder_name:string|null;
}
export interface MgwPartnerPixDetails { pix_key:string; pix_key_type:string; holder_name:string; }
export async function fetchMgwPartnerCommissions(status:'available'|'paid'|'all'='available'):Promise<MgwPartnerCommissionRecord[]> {
  return callRpc('admin_list_mgw_partner_commissions',{p_status:status});
}
export async function markMgwPartnerCommissionPaid(params:{commissionId:string;paymentReference:string;paymentNote?:string}):Promise<{id:string;status:string;amount_cents:number;paid_at:string}> {
  return callRpc('admin_mark_mgw_partner_commission_paid',{
    p_commission_id:params.commissionId,p_payment_reference:params.paymentReference,p_payment_note:params.paymentNote??'',
  });
}
export async function revealMgwPartnerPix(partnerId:string):Promise<MgwPartnerPixDetails> {
  const supabase=getSupabaseAdminClient();
  const {data,error}=await supabase.functions.invoke('admin-partner-pix',{body:{partnerId}});
  if(error) throw new Error(error.message||'Nao foi possivel consultar a chave Pix.');
  if(!data?.pix_key) throw new Error(data?.error||'Chave Pix indisponivel.');
  return data as MgwPartnerPixDetails;
}

export interface MgwPartnerCampaignRecord {
  id:string; slug:string; name:string; objective:string; target_segment:string; instructions:string;
  status:string; starts_at:string|null; ends_at:string|null; created_at:string;
}
export interface MgwPartnerMaterialRecord {
  id:string; title:string; description:string; category:string; resource_url:string;
  resource_type:string; active:boolean; created_at:string;
}
export interface MgwPartnerLeadAdminRecord {
  id:string; partner_id:string; contact_name:string; establishment_name:string; phone:string;
  email:string; segment:string; city:string; stage:string; created_at:string;
  partner_name:string; partner_email:string;
}
export async function fetchAdminMgwPartnerCampaigns():Promise<MgwPartnerCampaignRecord[]> {
  return callRpc('admin_list_mgw_partner_campaigns');
}
export async function fetchAdminMgwPartnerMaterials():Promise<MgwPartnerMaterialRecord[]> {
  return callRpc('admin_list_mgw_partner_materials');
}
export async function fetchAdminMgwPartnerLeads(limit=300):Promise<MgwPartnerLeadAdminRecord[]> {
  return callRpc('admin_list_mgw_partner_leads',{p_limit:limit});
}
export async function createAdminMgwPartnerCampaign(input:{slug:string;name:string;objective:string;targetSegment:string;instructions:string;startsAt:string|null;endsAt:string|null}):Promise<MgwPartnerCampaignRecord> {
  return callRpc('admin_create_mgw_partner_campaign',{p_slug:input.slug,p_name:input.name,p_objective:input.objective,p_target_segment:input.targetSegment,p_instructions:input.instructions,p_starts_at:input.startsAt,p_ends_at:input.endsAt});
}
export async function setAdminMgwPartnerCampaignStatus(id:string,status:'active'|'ended'|'archived'):Promise<MgwPartnerCampaignRecord> {
  return callRpc('admin_set_mgw_partner_campaign_status',{p_campaign_id:id,p_status:status});
}
export async function createAdminMgwPartnerMaterial(input:{title:string;description:string;category:string;resourceUrl:string;resourceType:string;campaignId:string|null}):Promise<MgwPartnerMaterialRecord> {
  return callRpc('admin_create_mgw_partner_material',{p_title:input.title,p_description:input.description,p_category:input.category,p_resource_url:input.resourceUrl,p_resource_type:input.resourceType,p_campaign_id:input.campaignId});
}
export async function setAdminMgwPartnerMaterialActive(id:string,active:boolean):Promise<MgwPartnerMaterialRecord> {
  return callRpc('admin_set_mgw_partner_material_active',{p_material_id:id,p_active:active});
}

export interface MgwPartnerCrmOverview {
  partners:number; clicks:number; clicks_30d:number; leads:number; open_leads:number;
  converted_leads:number; campaigns_active:number; materials_active:number;
  by_partner:Array<{partner_id:string;partner_name:string;email:string;clicks:number;leads:number;converted_leads:number;referrals:number;converted_referrals:number}>;
  by_campaign:Array<{campaign_id:string;name:string;status:string;clicks:number;leads:number}>;
}
export async function fetchMgwPartnerCrmOverview():Promise<MgwPartnerCrmOverview> {
  return callRpc('admin_get_partner_crm_overview');
}
