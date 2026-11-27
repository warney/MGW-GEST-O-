import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BarChart3,
  Bell,
  Bike,
  Boxes,
  Building2,
  ChevronDown,
  ClipboardList,
  Globe,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Motorbike,
  Package,
  Plus,
  Receipt,
  Send,
  Settings,
  ShoppingBag,
  Store,
  Users,
  Wallet,
  FileBarChart,
  X,
} from 'lucide-react';
import { ROLE_LABELS_PT } from '../services/rbacPolicy';
import type { AppRoute, TenantContext } from '../types/finance';
import {
  formatUserDisplayName,
  getUserInitials,
  resolveActiveShellNavId,
  resolveShellPageTitle,
  type SettingsTabKind,
  type ShellNavId,
} from '../utils/shellProfile';
import { OfflineIndicator } from './OfflineIndicator';
import { PWAInstallButton } from './PWAInstallButton';
import { useSegmentConfig } from '../hooks/useSegmentConfig';

const SIDEBAR_COLLAPSE_KEY = 'mgw_sidebar_collapsed';

export interface AppShellNavItem {
  id: ShellNavId;
  route: AppRoute;
  settingsTab?: SettingsTabKind;
  section: 'main' | 'delivery' | 'catalog_settings';
  label: string;
  mobileLabel: string;
  icon: typeof LayoutDashboard;
}

interface AppShellProps {
  effectiveRoute: AppRoute;
  activeSettingsTab: SettingsTabKind;
  onNavigate: (route: AppRoute, settingsTab?: SettingsTabKind) => void;
  canViewDashboard: boolean;
  canAccessDelivery?: boolean;
  canReadInventory?: boolean;
  canReadSales: boolean;
  canCreateSales: boolean;
  canReadExpenses: boolean;
  canCreateExpenses: boolean;
  canViewReports: boolean;
  canAccessSettingsRoute: boolean;
  canWriteSettings: boolean;
  canWriteCatalog: boolean;
  unviewedOrdersCount: number;
  activeTenant: TenantContext;
  tenants: TenantContext[];
  establishmentName: string;
  userEmail: string;
  onSelectTenant: (tenantId: string) => void;
  onLogout: () => Promise<void>;
  onOpenNewSale: () => void;
  onOpenNewExpense: () => void;
  onOpenOrdersNotifications: () => void;
  topBannerSlot?: ReactNode;
  children: ReactNode;
  overlaysSlot?: ReactNode;
}

function MgwBrandLogo({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={`flex items-center ${
        collapsed ? 'justify-center' : 'gap-2.5'
      } min-w-0`}
    >
      <svg
        width="32"
        height="34"
        viewBox="0 0 36 38"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <path
          d="M11 4.5C15.5 2.5 23.5 3 27 8.5C30 13.2 27.5 19.5 21 23C16.5 25.4 13.5 28.5 14 33.5C8.5 31.8 6 27 7 22C8 17 13.5 14.8 16.5 12C18.5 10.1 17.5 7 11 4.5Z"
          fill="#F5B900"
        />
        <path
          d="M17.5 6.5C21.5 6.8 25 9.6 25.2 13.8C25.4 17.8 21.8 20.6 17.5 22.8"
          stroke="#FFC928"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>

      {!collapsed && (
        <div className="min-w-0 leading-none">
          <span className="block text-[17px] font-extrabold tracking-tight text-[#172033]">
            MGW
          </span>
          <span className="block text-[13px] font-semibold tracking-tight text-[#172033] mt-0.5">
            Gestão
          </span>
        </div>
      )}
    </div>
  );
}

export function AppShell({
  effectiveRoute,
  activeSettingsTab,
  onNavigate,
  canViewDashboard,
  canAccessDelivery = false,
  canReadInventory = false,
  canReadSales,
  canCreateSales,
  canReadExpenses,
  canCreateExpenses,
  canViewReports,
  canAccessSettingsRoute,
  canWriteSettings,
  canWriteCatalog,
  unviewedOrdersCount,
  activeTenant,
  tenants,
  establishmentName,
  userEmail,
  onSelectTenant,
  onLogout,
  onOpenNewSale,
  onOpenNewExpense,
  onOpenOrdersNotifications,
  topBannerSlot,
  children,
  overlaysSlot,
}: AppShellProps) {
  const { segment: activeSegment } = useSegmentConfig(activeTenant);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileSidebarOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileSidebarOpen]);

  const sidebarItems = useMemo<AppShellNavItem[]>(() => {
    const items: AppShellNavItem[] = [];
    if (canViewDashboard) {
      items.push({
        id: 'dashboard',
        route: 'dashboard',
        section: 'main',
        label: 'Dashboard',
        mobileLabel: 'Início',
        icon: LayoutDashboard,
      });
    }
    if (canReadSales) {
      items.push({
        id: 'orders',
        route: 'orders',
        section: 'main',
        label: 'Pedidos',
        mobileLabel: 'Pedidos',
        icon: ClipboardList,
      });
    }
    if (canReadSales || canCreateSales) {
      items.push({
        id: 'sales',
        route: 'sales',
        section: 'main',
        label: 'Vendas',
        mobileLabel: 'Vendas',
        icon: ShoppingBag,
      });
    }
    if (canReadExpenses) {
      items.push({
        id: 'expenses',
        route: 'expenses',
        section: 'main',
        label: 'Despesas',
        mobileLabel: 'Despesas',
        icon: Receipt,
      });
    }
    if (canViewReports) {
      items.push({
        id: 'reports',
        route: 'reports',
        section: 'main',
        label: 'Relatórios',
        mobileLabel: 'Relat.',
        icon: BarChart3,
      });
    }
    if (activeSegment === 'adega' && canReadInventory) {
      items.push({
        id: 'inventory',
        route: 'inventory',
        section: 'main',
        label: 'Estoque',
        mobileLabel: 'Estoque',
        icon: Boxes,
      });
    }
    if (canAccessDelivery) {
      items.push({
        id: 'delivery',
        route: 'delivery',
        section: 'delivery',
        label: 'MGW Delivery',
        mobileLabel: 'Delivery',
        icon: Motorbike,
      });
      items.push({
        id: 'delivery_customers',
        route: 'delivery_customers',
        section: 'delivery',
        label: 'Clientes',
        mobileLabel: 'Clientes',
        icon: Users,
      });
      items.push({
        id: 'delivery_couriers',
        route: 'delivery_couriers',
        section: 'delivery',
        label: 'Entregadores',
        mobileLabel: 'Motoboys',
        icon: Bike,
      });
      items.push({
        id: 'delivery_dispatch',
        route: 'delivery_dispatch',
        section: 'delivery',
        label: 'Central de despacho',
        mobileLabel: 'Despacho',
        icon: Send,
      });
      items.push({
        id: 'delivery_regions',
        route: 'delivery_regions',
        section: 'delivery',
        label: 'Regiões e taxas',
        mobileLabel: 'Regiões',
        icon: MapPin,
      });
      items.push({
        id: 'delivery_finance',
        route: 'delivery_finance',
        section: 'delivery',
        label: 'Financeiro',
        mobileLabel: 'Financeiro',
        icon: Wallet,
      });
      items.push({
        id: 'delivery_reports',
        route: 'delivery_reports',
        section: 'delivery',
        label: 'Relatórios e inteligência',
        mobileLabel: 'Relatórios',
        icon: FileBarChart,
      });
    }
    if (canWriteCatalog) {
      items.push({
        id: 'products',
        route: 'settings',
        settingsTab: 'catalog',
        section: 'catalog_settings',
        label: 'Produtos e Combos',
        mobileLabel: 'Produtos',
        icon: Package,
      });
    }
    if (canWriteSettings) {
      items.push({
        id: 'digital_menu',
        route: 'settings',
        settingsTab: 'digital_menu',
        section: 'catalog_settings',
        label: 'Cardápio Digital',
        mobileLabel: 'Cardápio',
        icon: Globe,
      });
    }
    if (canWriteSettings) {
      items.push({
        id: 'settings',
        route: 'settings',
        settingsTab: 'shop',
        section: 'catalog_settings',
        label: 'Configurações',
        mobileLabel: 'Ajustes',
        icon: Settings,
      });
    }
    return items;
  }, [
    activeSegment,
    canViewDashboard,
    canAccessDelivery,
    canReadInventory,
    canReadSales,
    canCreateSales,
    canReadExpenses,
    canViewReports,
    canAccessSettingsRoute,
    canWriteSettings,
    canWriteCatalog,
  ]);

  const mainSectionItems = useMemo(
    () => sidebarItems.filter((item) => item.section === 'main'),
    [sidebarItems],
  );
  const deliverySectionItems = useMemo(
    () => sidebarItems.filter((item) => item.section === 'delivery'),
    [sidebarItems],
  );
  const secondarySectionItems = useMemo(
    () => sidebarItems.filter((item) => item.section === 'catalog_settings'),
    [sidebarItems],
  );

  // Barra inferior mobile mantém até 6 destinos diretos sem apertar os botões
  const mobileBottomItems = useMemo(
    () =>
      sidebarItems
        .filter(
          (item) =>
            item.id !== 'products' &&
            item.id !== 'digital_menu' &&
            item.id !== 'delivery' &&
            item.id !== 'delivery_customers' &&
            item.id !== 'delivery_couriers' &&
            item.id !== 'delivery_dispatch' &&
            item.id !== 'delivery_regions' &&
            item.id !== 'delivery_reports',
        )
        .slice(0, 6),
    [sidebarItems],
  );

  const mobileNavGridClass =
    (
      {
        1: 'grid-cols-1',
        2: 'grid-cols-2',
        3: 'grid-cols-3',
        4: 'grid-cols-4',
        5: 'grid-cols-5',
        6: 'grid-cols-6',
      } as Record<number, string>
    )[mobileBottomItems.length] ?? 'grid-cols-6';

  const activeNavId = resolveActiveShellNavId(effectiveRoute, activeSettingsTab);
  const currentPageTitle = resolveShellPageTitle(effectiveRoute, activeSettingsTab);
  const displayEstablishment =
    establishmentName.trim() || activeTenant.name || 'MGW Gestão';
  const roleLabel = ROLE_LABELS_PT[activeTenant.role] ?? 'Equipe';
  const userDisplayName = formatUserDisplayName(userEmail);
  const userInitials = getUserInitials(userDisplayName, userEmail);
  const hasMultipleTenants = tenants.length > 1;

  function toggleDesktopSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // Ignora erro de storage
      }
      return next;
    });
  }

  function handleNavClick(item: AppShellNavItem) {
    onNavigate(item.route, item.settingsTab);
    setMobileSidebarOpen(false);
  }

  function renderNavItem(item: AppShellNavItem, collapsed: boolean) {
    const Icon = item.icon;
    const active = activeNavId === item.id;
    const isDeliveryModule = item.section === 'delivery';
    const showOrdersBadge = item.id === 'orders' && unviewedOrdersCount > 0;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => handleNavClick(item)}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? item.label : undefined}
        className={`group relative w-full min-h-[42px] ${
          collapsed ? 'px-2 justify-center' : 'px-3.5 justify-between'
        } rounded-xl flex items-center gap-2.5 text-[13.5px] whitespace-nowrap cursor-pointer transition-all duration-150 ${
          active
            ? 'mgw-nav-item-active text-[#172033]'
            : isDeliveryModule
              ? 'text-[#172033] font-semibold bg-[#FFFBEB]/65 border border-[#FDE68A]/70 hover:bg-[#FFFBEB]'
              : 'text-[#778094] font-medium hover:text-[#172033] hover:bg-[#F5F6FA]'
        }`}
      >
        <span className="inline-flex items-center gap-3 min-w-0">
          <Icon
            className={`w-[18px] h-[18px] shrink-0 transition-colors ${
              active
                ? 'text-[#172033]'
                : isDeliveryModule
                  ? 'text-[#B38300] group-hover:text-[#8A6200]'
                  : 'text-[#778094] group-hover:text-[#172033]'
            }`}
          />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </span>

        {showOrdersBadge && !collapsed && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#F5B900] text-[#172033] text-[11px] font-bold font-mono tabular-nums flex items-center justify-center">
            {unviewedOrdersCount}
          </span>
        )}

        {showOrdersBadge && collapsed && (
          <span
            aria-label={`${unviewedOrdersCount} novos pedidos`}
            className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[#F5B900] text-[#172033] text-[9px] font-bold font-mono tabular-nums flex items-center justify-center"
          >
            {unviewedOrdersCount}
          </span>
        )}
      </button>
    );
  }

  function renderNavList(collapsed: boolean) {
    return (
      <nav aria-label="Navegação principal" className="flex-1 px-3 py-2 overflow-y-auto">
        <div className="space-y-1">
          {mainSectionItems.map((item) => renderNavItem(item, collapsed))}
        </div>

        {deliverySectionItems.length > 0 && (
          <>
            <div className="my-3.5 border-t border-[#E8EAF0]" aria-hidden="true" />
            <div className="space-y-1.5">
              {!collapsed && (
                <p className="px-3.5 text-[10.5px] font-bold tracking-[0.06em] text-[#778094] uppercase">
                  MGW DELIVERY
                </p>
              )}
              {deliverySectionItems.map((item) => renderNavItem(item, collapsed))}
            </div>
          </>
        )}

        {(mainSectionItems.length > 0 || deliverySectionItems.length > 0) &&
          secondarySectionItems.length > 0 && (
            <div className="my-3.5 border-t border-[#E8EAF0]" aria-hidden="true" />
          )}

        {secondarySectionItems.length > 0 && (
          <div className="space-y-1">
            {secondarySectionItems.map((item) => renderNavItem(item, collapsed))}
          </div>
        )}
      </nav>
    );
  }

  function renderEstablishmentFooter(collapsed: boolean, selectId: string) {
    if (collapsed) {
      return (
        <div className="p-3 border-t border-[#E8EAF0] flex flex-col items-center">
          <div
            title={`Meu Estabelecimento: ${displayEstablishment} (${roleLabel})`}
            className="w-10 h-10 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] flex items-center justify-center text-[#172033]"
          >
            <Store className="w-4 h-4 text-[#B38300]" />
          </div>
        </div>
      );
    }

    return (
      <div className="p-3.5 space-y-2.5">
        {hasMultipleTenants && (
          <div>
            <label
              htmlFor={selectId}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-[#778094] mb-1.5"
            >
              <Building2 className="w-3.5 h-3.5 text-[#B38300]" />
              Trocar estabelecimento
            </label>
            <select
              id={selectId}
              value={activeTenant.tenantId}
              onChange={(e) => onSelectTenant(e.target.value)}
              className="w-full min-h-[38px] px-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-xs font-medium text-[#172033]"
            >
              {tenants.map((t) => (
                <option key={t.tenantId} value={t.tenantId}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] px-3 py-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FFF3C4] to-[#FFE28A] border border-[#FDE68A] flex items-center justify-center shrink-0">
            <Store className="w-4 h-4 text-[#B38300]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-[#172033] truncate leading-tight">
              Meu Estabelecimento
            </p>
            <p className="text-[11px] text-[#778094] truncate leading-tight mt-0.5">
              {displayEstablishment}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-tenant-segment={activeSegment}
      className="mgw-app-theme min-h-screen bg-[#F5F6FA] text-[#172033] flex flex-col lg:flex-row"
    >
      {/* Desktop Sidebar */}
      <aside
        aria-label="Barra lateral"
        className={`no-print hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 bg-white border-r border-[#E8EAF0] z-30 transition-[width] duration-200 ${
          sidebarCollapsed ? 'lg:w-[76px]' : 'lg:w-[240px]'
        }`}
      >
        <div
          className={`h-[72px] flex items-center shrink-0 ${
            sidebarCollapsed ? 'justify-center px-2' : 'px-5'
          }`}
        >
          <MgwBrandLogo collapsed={sidebarCollapsed} />
        </div>

        {renderNavList(sidebarCollapsed)}
        {renderEstablishmentFooter(sidebarCollapsed, 'desktop-tenant-select')}
      </aside>

      {/* Mobile / Tablet Slide-over Sidebar */}
      {mobileSidebarOpen && (
        <div className="no-print lg:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Fechar menu lateral"
            onClick={() => setMobileSidebarOpen(false)}
            className="fixed inset-0 bg-[#172033]/40 backdrop-blur-[2px]"
          />
          <aside
            aria-label="Menu lateral móvel"
            className="relative w-72 max-w-[85vw] bg-white border-r border-[#E8EAF0] h-full flex flex-col shadow-xl z-10"
          >
            <div className="h-[68px] px-4 flex items-center justify-between gap-2 shrink-0 border-b border-[#E8EAF0]/70">
              <MgwBrandLogo collapsed={false} />
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                aria-label="Fechar menu"
                className="w-9 h-9 rounded-xl border border-[#E8EAF0] text-[#778094] hover:text-[#172033] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {renderNavList(false)}
            {renderEstablishmentFooter(false, 'mobile-drawer-tenant-select')}
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-200 ${
          sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[240px]'
        }`}
      >
        {/* Top Header */}
        <header className="no-print mgw-shell-header sticky top-0 z-30 h-16 bg-[#F5F6FA]/95 backdrop-blur-md border-b border-[#E8EAF0] px-2.5 sm:px-5 lg:px-8 flex items-center justify-between gap-2 sm:gap-3">
          {/* Left: Sidebar Toggle + Page Title */}
          <div className="flex flex-1 items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Abrir menu de navegação"
              aria-expanded={mobileSidebarOpen}
              className="lg:hidden w-10 h-10 rounded-xl text-[#778094] hover:text-[#172033] hover:bg-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            >
              <Menu className="w-[18px] h-[18px]" />
            </button>

            <button
              type="button"
              onClick={toggleDesktopSidebar}
              aria-label={
                sidebarCollapsed
                  ? 'Expandir barra lateral'
                  : 'Recolher barra lateral'
              }
              aria-expanded={!sidebarCollapsed}
              className="hidden lg:inline-flex w-9 h-9 rounded-xl text-[#778094] hover:text-[#172033] hover:bg-white items-center justify-center shrink-0 cursor-pointer transition-colors"
            >
              <Menu className="w-[18px] h-[18px]" />
            </button>

            <div className="min-w-0 flex items-center gap-2">
              <h1 className="text-[15px] sm:text-base font-semibold text-[#778094] tracking-tight truncate">
                {currentPageTitle}
              </h1>
            </div>
          </div>

          {/* Right: Actions + Notifications + Profile */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <OfflineIndicator variant="badge" />
            <PWAInstallButton
              appName="MGW Gestão"
              installLabel="Instalar"
              compactOnMobile
            />

            {canCreateExpenses && (
              <button
                type="button"
                onClick={onOpenNewExpense}
                className="min-h-[38px] px-2.5 sm:px-3.5 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] bg-white hover:bg-[#F7F8FC] text-[#172033] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors shadow-[0_1px_2px_rgba(23,32,51,0.03)]"
              >
                <Plus className="w-3.5 h-3.5 text-[#778094]" />
                <span className="hidden md:inline">Nova Despesa</span>
                <span className="hidden sm:inline md:hidden">Despesa</span>
              </button>
            )}

            {canCreateSales && (
              <button
                type="button"
                onClick={onOpenNewSale}
                className="min-h-[38px] px-3 sm:px-3.5 rounded-xl bg-[#F5B900] hover:bg-[#FFC928] text-[#172033] text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors shadow-[0_1px_2px_rgba(23,32,51,0.06)]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Nova Venda</span>
                <span className="sm:hidden">Venda</span>
              </button>
            )}

            {canReadSales && (
              <button
                type="button"
                onClick={onOpenOrdersNotifications}
                aria-label={
                  unviewedOrdersCount > 0
                    ? `${unviewedOrdersCount} pedidos aguardando visualização`
                    : 'Notificações de pedidos'
                }
                title={
                  unviewedOrdersCount > 0
                    ? `${unviewedOrdersCount} novo(s) pedido(s)`
                    : 'Central de pedidos'
                }
                className={`relative w-9 h-9 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                  unviewedOrdersCount > 0
                    ? 'bg-[#FFFBEB] border border-[#FDE68A] text-[#B38300]'
                    : 'text-[#778094] hover:text-[#172033] hover:bg-white'
                }`}
              >
                <Bell className="w-[18px] h-[18px]" />
                {unviewedOrdersCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[#E35D62] text-white text-[10px] font-bold font-mono tabular-nums flex items-center justify-center ring-2 ring-[#F5F6FA]">
                    {unviewedOrdersCount > 99 ? '99+' : unviewedOrdersCount}
                  </span>
                )}
              </button>
            )}

            {/* User Avatar & Profile Menu */}
            <div ref={profileMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
                aria-label="Menu do perfil do usuário"
                className="min-h-[38px] pl-1 pr-2 rounded-full hover:bg-white/90 flex items-center gap-2 cursor-pointer transition-colors"
              >
                <span className="w-8 h-8 rounded-full bg-[#172033] text-white text-xs font-bold flex items-center justify-center shrink-0 shadow-[0_1px_3px_rgba(23,32,51,0.18)]">
                  {userInitials}
                </span>
                <span className="hidden md:inline text-[13px] font-medium text-[#172033] max-w-[140px] truncate">
                  {userDisplayName}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-[#778094] transition-transform ${
                    profileMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {profileMenuOpen && (
                <div
                  role="menu"
                  aria-label="Perfil e sessão"
                  className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-[#E8EAF0] shadow-[0_16px_38px_rgba(23,32,51,0.12)] p-2 z-50"
                >
                  <div className="px-3 py-2.5 border-b border-[#E8EAF0] mb-1.5">
                    <p className="text-xs font-bold text-[#172033] truncate">
                      {userDisplayName}
                    </p>
                    <p className="text-[11px] text-[#778094] truncate">
                      {userEmail}
                    </p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FFFBEB] text-[#8A6200] border border-[#FDE68A] truncate max-w-full">
                        {displayEstablishment} · {roleLabel}
                      </span>
                    </div>
                  </div>

                  {canAccessSettingsRoute && (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          onNavigate('settings', 'catalog');
                        }}
                        className="w-full min-h-[38px] px-3 rounded-xl text-left text-xs font-medium text-[#172033] hover:bg-[#F5F6FA] flex items-center gap-2.5 cursor-pointer"
                      >
                        <Package className="w-3.5 h-3.5 text-[#778094]" />
                        Produtos e Catálogo
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          onNavigate(
                            'settings',
                            canWriteSettings ? 'shop' : 'catalog',
                          );
                        }}
                        className="w-full min-h-[38px] px-3 rounded-xl text-left text-xs font-medium text-[#172033] hover:bg-[#F5F6FA] flex items-center gap-2.5 cursor-pointer"
                      >
                        <Settings className="w-3.5 h-3.5 text-[#778094]" />
                        Configurações da Loja
                      </button>
                      <div className="my-1.5 border-t border-[#E8EAF0]" />
                    </>
                  )}

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      void onLogout();
                    }}
                    className="w-full min-h-[38px] px-3 rounded-xl text-left text-xs font-semibold text-[#E35D62] hover:bg-[#FEF2F2] flex items-center gap-2.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sair da conta
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {topBannerSlot}

        <main className="mgw-shell-main flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-10 w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Menu inferior"
        className={`no-print lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 backdrop-blur-md border-t border-[#E8EAF0] grid ${mobileNavGridClass} items-center`}
      >
        {mobileBottomItems.map((item) => {
          const Icon = item.icon;
          const active = activeNavId === item.id;
          const showOrdersBadge = item.id === 'orders' && unviewedOrdersCount > 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item)}
              aria-current={active ? 'page' : undefined}
              className={`relative h-full min-h-[44px] flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
                active ? 'text-[#172033]' : 'text-[#778094]'
              }`}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-3 right-3 h-0.5 rounded-b-full bg-[#F5B900]"
                />
              )}
              <div className="relative">
                <Icon className="w-5 h-5" />
                {showOrdersBadge && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#F5B900] text-[#172033] text-[9px] font-bold font-mono tabular-nums flex items-center justify-center">
                    {unviewedOrdersCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">
                {item.mobileLabel}
              </span>
            </button>
          );
        })}
      </nav>

      {overlaysSlot}
    </div>
  );
}
