import { useCallback, useEffect, useState } from 'react';
import { AdminLayout } from './components/AdminLayout';
import { AdminLoginScreen } from './components/AdminLoginScreen';
import { MfaGateModal } from './components/MfaGateModal';
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
import { PlansSubscriptionsView } from './views/PlansSubscriptionsView';
import { SettingsView } from './views/SettingsView';
import { SupportView } from './views/SupportView';

export function App() {
  const [booting, setBooting] = useState(true);
  const [profile, setProfile] = useState<PlatformAdminProfile | null>(null);
  const [unauthorizedNotice, setUnauthorizedNotice] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<AdminModuleId>('dashboard');
  const [mfaModalOpen, setMfaModalOpen] = useState(false);

  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<unknown>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const loadSessionAndProfile = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setBooting(false);
      return;
    }

    setBooting(true);
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
      setBooting(false);
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
        void loadSessionAndProfile();
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
    setActiveModule(moduleId);
  };

  const handleGlobalRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleSignOut = async () => {
    await signOutAdmin();
    setProfile(null);
    setOverview(null);
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
      <AdminLoginScreen
        onSuccess={loadSessionAndProfile}
        unauthorizedNotice={unauthorizedNotice}
      />
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
            onRetry={loadOverview}
          />
        )}

        {activeModule === 'clients' && (
          <ClientsView
            role={profile.role}
            mfaVerified={profile.mfaVerified}
            onRequestMfa={() => setMfaModalOpen(true)}
            refreshTrigger={refreshTrigger}
          />
        )}

        {activeModule === 'establishments' && (
          <EstablishmentsView
            role={profile.role}
            mfaVerified={profile.mfaVerified}
            onRequestMfa={() => setMfaModalOpen(true)}
            refreshTrigger={refreshTrigger}
          />
        )}

        {activeModule === 'plans' && (
          <PlansSubscriptionsView
            role={profile.role}
            mfaVerified={profile.mfaVerified}
            onRequestMfa={() => setMfaModalOpen(true)}
            refreshTrigger={refreshTrigger}
          />
        )}

        {activeModule === 'finance' && canAccessModule(profile.role, 'finance') && (
          <FinanceView refreshTrigger={refreshTrigger} />
        )}

        {activeModule === 'monitoring' && (
          <MonitoringView refreshTrigger={refreshTrigger} />
        )}

        {activeModule === 'support' && (
          <SupportView role={profile.role} refreshTrigger={refreshTrigger} />
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

        {activeModule === 'audit' && <AuditReportsView refreshTrigger={refreshTrigger} />}
      </AdminLayout>

      <MfaGateModal
        open={mfaModalOpen}
        onClose={() => setMfaModalOpen(false)}
        onVerified={loadSessionAndProfile}
      />
    </>
  );
}

export default App;
