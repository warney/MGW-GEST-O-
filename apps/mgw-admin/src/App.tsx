import { useCallback, useEffect, useState } from 'react';
import { AdminLayout } from './components/AdminLayout';
import { AdminLoginScreen } from './components/AdminLoginScreen';
import { MfaGateModal } from './components/MfaGateModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  fetchMyAdminProfile,
  fetchPlatformOverview,
  formatAdminError,
  signOutAdmin,
} from './services/adminApi';
import { canAccessModule } from './services/rbac';
import { getSupabaseAdminClient, isSupabaseConfigured } from './services/supabaseClient';
import type { AdminModuleId, PlatformAdminProfile, PlatformOverview } from './types/admin';
import { AdminUsersView } from './views/AdminUsersView';
import { AuditReportsView } from './views/AuditReportsView';
import { ClientsView } from './views/ClientsView';
import { DashboardView } from './views/DashboardView';
import { EstablishmentsView } from './views/EstablishmentsView';
import { FinanceView } from './views/FinanceView';
import { MonitoringView } from './views/MonitoringView';
import { PartnersView } from './views/PartnersView';
import { PlansSubscriptionsView } from './views/PlansSubscriptionsView';
import { SettingsView } from './views/SettingsView';
import { SupportView } from './views/SupportView';

export function App() {
  const [booting, setBooting] = useState(true);
  const [profile, setProfile] = useState<PlatformAdminProfile | null>(null);
  const [unauthorizedNotice, setUnauthorizedNotice] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<AdminModuleId>('dashboard');
  const [focusedTenantId, setFocusedTenantId] = useState<string | null>(null);
  const [focusedTicketTenantId, setFocusedTicketTenantId] = useState<string | null>(null);
  const [mfaModalOpen, setMfaModalOpen] = useState(false);

  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<unknown>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const loadSessionAndProfile = useCallback(async (options?: { silent?: boolean }) => {
    if (!isSupabaseConfigured) {
      setBooting(false);
      return;
    }

    const silent = options?.silent ?? false;
    if (!silent) {
      setBooting(true);
    }
    setUnauthorizedNotice(null);
    try {
      const supabase = getSupabaseAdminClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setProfile(null);
        return;
      }

      const adminProfile = await fetchMyAdminProfile();
      if (!adminProfile) {
        await signOutAdmin();
        setProfile(null);
        setUnauthorizedNotice(
          'Acesso negado: esta conta não está autorizada na tabela platform_admins ou não possui e-mail verificado.',
        );
        return;
      }

      setProfile(adminProfile);
    } catch (err) {
      setUnauthorizedNotice(formatAdminError(err));
      setProfile(null);
    } finally {
      if (!silent) {
        setBooting(false);
      }
    }
  }, []);

  const loadOverview = useCallback(async () => {
    if (!profile) return;
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const data = await fetchPlatformOverview();
      setOverview(data);
    } catch (err) {
      setOverviewError(err);
    } finally {
      setOverviewLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void loadSessionAndProfile();

    if (!isSupabaseConfigured) return;
    const supabase = getSupabaseAdminClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setOverview(null);
      } else if (event === 'TOKEN_REFRESHED' || event === 'MFA_CHALLENGE_VERIFIED') {
        void loadSessionAndProfile({ silent: true });
      }
    });

    return () => subscription.unsubscribe();
  }, [loadSessionAndProfile]);

  useEffect(() => {
    if (profile && activeModule === 'dashboard') {
      void loadOverview();
    }
  }, [profile, activeModule, refreshTrigger, loadOverview]);

  const handleSelectModule = (moduleId: AdminModuleId) => {
    if (!profile || !canAccessModule(profile.role, moduleId)) return;
    if (moduleId !== 'establishments') {
      setFocusedTenantId(null);
    }
    if (moduleId !== 'support') {
      setFocusedTicketTenantId(null);
    }
    setActiveModule(moduleId);
  };

  const handleInspectEstablishment = (tenantId: string) => {
    if (!profile || !canAccessModule(profile.role, 'establishments')) return;
    setFocusedTenantId(tenantId);
    setActiveModule('establishments');
  };

  const handleOpenTicketForTenant = (tenantId: string) => {
    if (!profile || !canAccessModule(profile.role, 'support')) return;
    setFocusedTicketTenantId(tenantId);
    setActiveModule('support');
  };

  const handleGlobalRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleSignOut = async () => {
    await signOutAdmin();
    setProfile(null);
    setOverview(null);
    setFocusedTenantId(null);
    setFocusedTicketTenantId(null);
    setActiveModule('dashboard');
  };

  if (booting) {
    return (
      <div className="min-h-screen bg-[#f6f7f9] text-slate-600 flex items-center justify-center text-xs font-mono">
        Verificando sessão administrativa no Supabase...
      </div>
    );
  }

  if (!profile) {
    return (
      <>
        <AdminLoginScreen
          onSuccess={loadSessionAndProfile}
          unauthorizedNotice={unauthorizedNotice}
        />
        <OfflineIndicator />
      </>
    );
  }

  return (
    <>
      <AdminLayout
        profile={profile}
        activeModule={activeModule}
        onSelectModule={handleSelectModule}
        onRefresh={handleGlobalRefresh}
        refreshing={overviewLoading}
        onOpenMfaModal={() => setMfaModalOpen(true)}
        onSignOut={handleSignOut}
      >
        {activeModule === 'dashboard' && (
          <DashboardView
            data={overview}
            loading={overviewLoading}
            error={overviewError}
            onNavigate={handleSelectModule}
            onInspectEstablishment={handleInspectEstablishment}
            onRetry={loadOverview}
          />
        )}

        {activeModule === 'clients' && (
          <ClientsView
            role={profile.role}
            mfaVerified={profile.mfaVerified}
            onRequestMfa={() => setMfaModalOpen(true)}
            refreshTrigger={refreshTrigger}
            onInspectEstablishment={handleInspectEstablishment}
          />
        )}

        {activeModule === 'establishments' && (
          <EstablishmentsView
            role={profile.role}
            mfaVerified={profile.mfaVerified}
            onRequestMfa={() => setMfaModalOpen(true)}
            refreshTrigger={refreshTrigger}
            focusedTenantId={focusedTenantId}
            onFocusedTenantConsumed={() => setFocusedTenantId(null)}
            onNavigate={handleSelectModule}
            onOpenTicketForTenant={handleOpenTicketForTenant}
          />
        )}

        {activeModule === 'plans' && (
          <PlansSubscriptionsView
            role={profile.role}
            mfaVerified={profile.mfaVerified}
            onRequestMfa={() => setMfaModalOpen(true)}
            refreshTrigger={refreshTrigger}
            onInspectEstablishment={handleInspectEstablishment}
          />
        )}

        {activeModule === 'finance' && canAccessModule(profile.role, 'finance') && (
          <FinanceView
            role={profile.role}
            mfaVerified={profile.mfaVerified}
            onRequestMfa={() => setMfaModalOpen(true)}
            refreshTrigger={refreshTrigger}
            onInspectEstablishment={handleInspectEstablishment}
          />
        )}

        {activeModule === 'monitoring' && (
          <MonitoringView
            refreshTrigger={refreshTrigger}
            onInspectEstablishment={handleInspectEstablishment}
          />
        )}

        {activeModule === 'support' && (
          <SupportView
            role={profile.role}
            refreshTrigger={refreshTrigger}
            onInspectEstablishment={handleInspectEstablishment}
            focusedTicketTenantId={focusedTicketTenantId}
            onFocusedTicketTenantConsumed={() => setFocusedTicketTenantId(null)}
          />
        )}

        {activeModule === 'settings' && (
          <SettingsView
            role={profile.role}
            mfaVerified={profile.mfaVerified}
            onRequestMfa={() => setMfaModalOpen(true)}
            refreshTrigger={refreshTrigger}
          />
        )}

        {activeModule === 'admins' && canAccessModule(profile.role, 'admins') && (
          <AdminUsersView
            currentAdminUserId={profile.userId}
            mfaVerified={profile.mfaVerified}
            onRequestMfa={() => setMfaModalOpen(true)}
            refreshTrigger={refreshTrigger}
          />
        )}

        {activeModule === 'audit' && (
          <AuditReportsView
            refreshTrigger={refreshTrigger}
            onInspectEstablishment={handleInspectEstablishment}
          />
        )}

        {activeModule === 'partners' && canAccessModule(profile.role, 'partners') && (
          <PartnersView
            role={profile.role}
            mfaVerified={profile.mfaVerified}
            onRequestMfa={() => setMfaModalOpen(true)}
            refreshTrigger={refreshTrigger}
          />
        )}
      </AdminLayout>

      <MfaGateModal
        open={mfaModalOpen}
        onClose={() => setMfaModalOpen(false)}
        onVerified={() => loadSessionAndProfile({ silent: true })}
      />
      <OfflineIndicator />
    </>
  );
}

export default App;
