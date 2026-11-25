import { useState, type ReactNode } from 'react';
import {
  Activity,
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileSpreadsheet,
  LayoutDashboard,
  LifeBuoy,\n  Handshake,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  Shield,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { canAccessModule, formatRoleLabel, MODULE_RULES } from '../services/rbac';
import type { AdminModuleId, PlatformAdminProfile } from '../types/admin';
import { MfaBadgeIndicator } from './StatusIndicator';

interface AdminLayoutProps {
  profile: PlatformAdminProfile;
  activeModule: AdminModuleId;
  onSelectModule: (moduleId: AdminModuleId) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onOpenMfaModal: () => void;
  onSignOut: () => void;
  children: ReactNode;
}

const MODULE_ICONS: Record<AdminModuleId, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  clients: Users,
  establishments: Building2,
  plans: CreditCard,
  finance: Wallet,
  monitoring: Activity,
  support: LifeBuoy,
  settings: Settings,
  admins: Shield,
  audit: FileSpreadsheet,\n  partners: Handshake,
};

export function AdminLayout({
  profile,
  activeModule,
  onSelectModule,
  onRefresh,
  refreshing,
  onOpenMfaModal,
  onSignOut,
  children,
}: AdminLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const visibleModules = MODULE_RULES.filter((item) => canAccessModule(profile.role, item.id));
  const currentModule = MODULE_RULES.find((item) => item.id === activeModule) ?? visibleModules[0];

  const renderSidebarNav = (mobile = false) => (
    <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-1" aria-label="Navegação MGW Admin">
      {visibleModules.map((item) => {
        const Icon = MODULE_ICONS[item.id];
        const isActive = item.id === activeModule;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              onSelectModule(item.id);
              if (mobile) setMobileMenuOpen(false);
            }}
            title={collapsed && !mobile ? item.label : undefined}
            className={`w-full flex items-center gap-3 rounded-md px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              isActive
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {(!collapsed || mobile) && <span className="truncate">{item.label}</span>}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col border-r border-slate-200 bg-white transition-all duration-150 shrink-0 ${
          collapsed ? 'w-[72px]' : 'w-[252px]'
        }`}
      >
        <div className="h-14 px-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-md bg-[#F5B731]/12 border border-[#F5B731]/30 flex items-center justify-center text-[#F5B731] shrink-0">
              <ShieldCheck className="h-4 w-4" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">MGW Admin</p>
                <p className="text-[11px] text-slate-500 truncate">Plataforma SaaS</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer shrink-0"
            aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {renderSidebarNav(false)}

        <div className="border-t border-slate-200 p-3 space-y-2.5">
          {!collapsed ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-900 truncate">
                {profile.fullName || profile.email}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {formatRoleLabel(profile.role)} · <span className="font-mono">{profile.email}</span>
              </p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={onSignOut}
            title="Sair"
            className="w-full flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer whitespace-nowrap"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            {!collapsed && <span>Encerrar sessão</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/45"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-64 max-w-[85vw] bg-white border-r border-slate-200 flex flex-col">
            <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#F5B731]" />
                <span className="text-sm font-bold text-slate-900">MGW Admin</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded p-1 text-slate-500 hover:text-slate-900"
                aria-label="Fechar menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {renderSidebarNav(true)}
            <div className="border-t border-slate-200 p-3">
              <p className="text-xs font-medium text-slate-900 truncate">{profile.email}</p>
              <p className="text-[11px] text-slate-500 mb-2">{formatRoleLabel(profile.role)}</p>
              <button
                type="button"
                onClick={onSignOut}
                className="w-full flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Encerrar sessão</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 border-b border-slate-200 bg-white/90 backdrop-blur px-4 lg:px-6 flex items-center justify-between gap-3 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden rounded p-1.5 text-slate-600 hover:bg-slate-100"
              aria-label="Abrir navegação"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
                <span className="font-medium text-slate-600">MGW Admin</span>
                <span>/</span>
                <span className="text-slate-900 font-semibold truncate">{currentModule?.label}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onOpenMfaModal}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 hover:bg-slate-100 cursor-pointer whitespace-nowrap shrink-0"
              title="Gerenciar verificação MFA (AAL2)"
            >
              <MfaBadgeIndicator verified={profile.mfaVerified} />
            </button>

            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 lg:px-6 lg:py-6 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
