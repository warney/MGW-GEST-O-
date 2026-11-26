import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  Building2,
  ChevronLeft,
  ChevronRight,
  Command,
  CreditCard,
  FileSpreadsheet,
  Handshake,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  ADMIN_MODULE_GROUPS,
  canAccessModule,
  formatRoleLabel,
  MODULE_RULES,
} from '../services/rbac';
import type { AdminModuleId, PlatformAdminProfile } from '../types/admin';
import { MgwBrandLogo } from './MgwBrandLogo';
import { PWAInstallButton } from './PWAInstallButton';
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
  audit: FileSpreadsheet,
  partners: Handshake,
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
  const [quickJumpOpen, setQuickJumpOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const quickInputRef = useRef<HTMLInputElement | null>(null);

  const visibleModules = useMemo(
    () => MODULE_RULES.filter((item) => canAccessModule(profile.role, item.id)),
    [profile.role],
  );
  const currentModule =
    visibleModules.find((item) => item.id === activeModule) ?? visibleModules[0];

  const groupedModules = useMemo(
    () =>
      ADMIN_MODULE_GROUPS.map((group) => ({
        group,
        items: visibleModules.filter((item) => item.group === group),
      })).filter((section) => section.items.length > 0),
    [visibleModules],
  );

  const quickResults = useMemo(() => {
    const q = quickQuery.trim().toLowerCase();
    if (!q) return visibleModules;
    return visibleModules.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q),
    );
  }, [quickQuery, visibleModules]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [quickQuery, quickJumpOpen]);

  useEffect(() => {
    const handleGlobalKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setQuickQuery('');
        setQuickJumpOpen((prev) => !prev);
      } else if (event.key === 'Escape' && quickJumpOpen) {
        event.preventDefault();
        setQuickJumpOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [quickJumpOpen]);

  useEffect(() => {
    if (quickJumpOpen) {
      setTimeout(() => quickInputRef.current?.focus(), 20);
    }
  }, [quickJumpOpen]);

  const handleQuickNavigate = (moduleId: AdminModuleId) => {
    onSelectModule(moduleId);
    setQuickJumpOpen(false);
    setQuickQuery('');
  };

  const renderSidebarNav = (mobile = false) => (
    <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-4" aria-label="Navegação MGW Admin">
      {groupedModules.map((section) => (
        <div key={section.group} className="space-y-1">
          {(!collapsed || mobile) && (
            <p className="px-3 pb-0.5 text-[11px] font-semibold text-slate-500">
              {section.group}
            </p>
          )}
          <div className="space-y-0.5">
            {section.items.map((item) => {
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
                  title={collapsed && !mobile ? `${item.label} · ${item.group}` : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-amber-50 text-amber-900 border border-amber-300/80'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${isActive ? 'text-amber-700' : 'text-slate-500'}`}
                  />
                  {(!collapsed || mobile) && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col border-r border-slate-200 bg-white transition-all duration-150 shrink-0 ${
          collapsed ? 'w-[72px]' : 'w-[256px]'
        }`}
      >
        <div className="h-14 px-3 border-b border-slate-800 bg-[#202733] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {collapsed ? (
              <MgwBrandLogo variant="icon" className="h-7 w-auto mx-auto" />
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <MgwBrandLogo variant="compact" className="h-6 w-auto" />
                <span className="text-[11px] font-mono font-semibold text-amber-300 shrink-0">
                  Admin
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            className="rounded p-1.5 text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer shrink-0"
            aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {renderSidebarNav(false)}

        <div className="border-t border-slate-200 p-3 space-y-2.5 bg-slate-50/70">
          {!collapsed ? (
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-slate-900 truncate">
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
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 cursor-pointer whitespace-nowrap"
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
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-68 max-w-[85vw] bg-white border-r border-slate-200 flex flex-col">
            <div className="h-14 px-4 border-b border-slate-800 bg-[#202733] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <MgwBrandLogo variant="compact" className="h-6 w-auto" />
                <span className="text-[11px] font-mono font-semibold text-amber-300 shrink-0">
                  Admin
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded p-1 text-slate-300 hover:text-white cursor-pointer"
                aria-label="Fechar menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {renderSidebarNav(true)}
            <div className="border-t border-slate-200 p-3 bg-slate-50/70">
              <p className="text-xs font-semibold text-slate-900 truncate">{profile.email}</p>
              <p className="text-[11px] text-slate-500 mb-2">{formatRoleLabel(profile.role)}</p>
              <button
                type="button"
                onClick={onSignOut}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
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
        <header className="h-14 border-b border-slate-200 bg-white/95 backdrop-blur px-4 lg:px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden rounded p-1.5 text-slate-600 hover:bg-slate-100 cursor-pointer"
              aria-label="Abrir navegação"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
                <span className="font-semibold text-slate-700 hidden sm:inline">MGW Admin</span>
                <span className="hidden sm:inline text-slate-300">/</span>
                <span className="hidden md:inline text-slate-500">{currentModule?.group}</span>
                <span className="hidden md:inline text-slate-300">/</span>
                <span className="text-slate-900 font-semibold truncate">{currentModule?.label}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setQuickQuery('');
                setQuickJumpOpen(true);
              }}
              className="hidden sm:inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer whitespace-nowrap shrink-0"
              title="Navegação rápida entre módulos (Ctrl+K / Cmd+K)"
            >
              <Search className="h-3.5 w-3.5 text-slate-500" />
              <span>Ir para módulo...</span>
              <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                <Command className="h-2.5 w-2.5" />K
              </kbd>
            </button>

            <button
              type="button"
              onClick={onOpenMfaModal}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 hover:bg-slate-100 cursor-pointer whitespace-nowrap shrink-0"
              title="Gerenciar verificação MFA (AAL2)"
            >
              <MfaBadgeIndicator verified={profile.mfaVerified} />
            </button>

            <PWAInstallButton tone="light" compactOnMobile showManualFallback />

            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
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

      {/* Quick Module Command Palette */}
      {quickJumpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/50 pt-20 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Navegação rápida MGW Admin"
          onClick={() => setQuickJumpOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200">
              <Search className="h-4 w-4 text-slate-500 shrink-0" />
              <input
                ref={quickInputRef}
                type="text"
                value={quickQuery}
                onChange={(e) => setQuickQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlightIndex((idx) =>
                      quickResults.length === 0 ? 0 : (idx + 1) % quickResults.length,
                    );
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlightIndex((idx) =>
                      quickResults.length === 0
                        ? 0
                        : (idx - 1 + quickResults.length) % quickResults.length,
                    );
                  } else if (e.key === 'Enter' && quickResults[highlightIndex]) {
                    e.preventDefault();
                    handleQuickNavigate(quickResults[highlightIndex].id);
                  }
                }}
                placeholder="Digite o módulo ou área (ex.: estabelecimentos, parceiros, auditoria)..."
                className="w-full text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setQuickJumpOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                aria-label="Fechar busca rápida"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto py-2">
              {quickResults.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-slate-500">
                  Nenhum módulo encontrado para "{quickQuery}".
                </p>
              ) : (
                quickResults.map((item, idx) => {
                  const Icon = MODULE_ICONS[item.id];
                  const isHighlighted = idx === highlightIndex;
                  const isCurrent = item.id === activeModule;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setHighlightIndex(idx)}
                      onClick={() => handleQuickNavigate(item.id)}
                      className={`w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                        isHighlighted ? 'bg-amber-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            isCurrent || isHighlighted ? 'text-amber-700' : 'text-slate-500'
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 truncate">
                            {item.label}
                            {isCurrent && (
                              <span className="ml-2 font-mono text-[10px] text-amber-700">
                                · Atual
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {item.group} · {item.description}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
