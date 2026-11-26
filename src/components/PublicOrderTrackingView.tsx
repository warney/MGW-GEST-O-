import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  Bike,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  FileText,
  Gift,
  Home,
  Info,
  MapPin,
  MessageCircle,
  Package,
  Printer,
  QrCode,
  RefreshCw,
  ShoppingBag,
  Store,
  Truck,
  XCircle,
} from 'lucide-react';
import {
  createPublicReviewInvitation,
  fetchPublicDigitalMenu,
  fetchPublicOrderByToken,
  subscribePublicOrderTracking,
} from '../services/dataService';
import type {
  OnlineOrderStatus,
  PublicDigitalMenuPayload,
  PublicOrderTrackingRecord,
} from '../types/finance';
import { formatCurrencyBRL } from '../utils/finance';
import { formatDeliveryFeeRuleLabel } from '../utils/deliveryRegions';
import { getStoreMonogram } from '../utils/menuPresentation';
import {
  buildWhatsappUrl,
  formatDateTimeBR,
  formatOrderNumber,
  formatTimeBR,
  getTrackingFlowSteps,
  isTerminalOrderStatus,
  normalizePixKeyInput,
  ORDER_STATUS_LABELS,
  shouldShowOrderPixPaymentBox,
} from '../utils/onlineOrders';
import {
  extractStepTimestamps,
  upsertTrackedOrder,
} from '../utils/orderTrackingRecovery';
import { fromPublicTrackingRecord } from '../utils/orderPrint';
import { OrderPrintModal } from './OrderPrintModal';

interface PublicOrderTrackingViewProps {
  token: string;
  onBackToMenu?: (slug: string) => void;
  initialOrder?: PublicOrderTrackingRecord | null;
  initialStoreMenu?: PublicDigitalMenuPayload | null;
  onOpenReview?: (token: string) => void;
}

const STATUS_HEADLINES: Record<OnlineOrderStatus, string> = {
  received: 'Seu pedido foi recebido!',
  accepted: 'O estabelecimento confirmou seu pedido!',
  preparing: 'Seu pedido está sendo preparado!',
  ready: 'Seu pedido está pronto!',
  out_for_delivery: 'Seu pedido está a caminho!',
  ready_for_pickup: 'Seu pedido está disponível para retirada!',
  completed: 'Pedido concluído!',
  rejected: 'Pedido não aceito pelo estabelecimento',
  cancelled: 'Pedido cancelado',
};

const STATUS_DESCRIPTIONS: Record<OnlineOrderStatus, string> = {
  received: 'Aguardando a confirmação da loja. Esta tela atualiza automaticamente.',
  accepted: 'Pedido aceito! Em instantes começará a ser preparado.',
  preparing: 'Estamos preparando seu pedido com todo carinho.',
  ready: 'Seu pedido foi conferido e já está pronto.',
  out_for_delivery: 'O entregador já saiu com o seu pedido.',
  ready_for_pickup: 'Você já pode retirar seu pedido no balcão do estabelecimento.',
  completed: 'Entrega finalizada! Obrigado por escolher a gente.',
  rejected: 'Infelizmente o estabelecimento não pôde aceitar este pedido.',
  cancelled: 'Este pedido foi cancelado.',
};

const STEP_SHORT_LABELS: Record<OnlineOrderStatus, string> = {
  received: 'Pedido recebido',
  accepted: 'Pedido aceito',
  preparing: 'Em preparação',
  ready: 'Pedido pronto',
  out_for_delivery: 'Saiu para entrega',
  ready_for_pickup: 'Pronto p/ retirada',
  completed: 'Concluído',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
};

function renderStepGlyph(status: OnlineOrderStatus, className: string) {
  switch (status) {
    case 'received':
      return <Clock className={className} aria-hidden="true" />;
    case 'accepted':
      return <Check className={className} aria-hidden="true" />;
    case 'preparing':
      return <ChefHat className={className} aria-hidden="true" />;
    case 'ready':
      return <Gift className={className} aria-hidden="true" />;
    case 'out_for_delivery':
      return <Truck className={className} aria-hidden="true" />;
    case 'ready_for_pickup':
      return <Store className={className} aria-hidden="true" />;
    case 'completed':
      return <CheckCircle2 className={className} aria-hidden="true" />;
    case 'rejected':
    case 'cancelled':
      return <XCircle className={className} aria-hidden="true" />;
  }
}

function renderStatusHeroIcon(order: PublicOrderTrackingRecord) {
  switch (order.status) {
    case 'preparing':
      return <ChefHat className="w-8 h-8 text-[#F5B900]" aria-hidden="true" />;
    case 'out_for_delivery':
      return <Bike className="w-8 h-8 text-[#F5B900]" aria-hidden="true" />;
    case 'ready':
    case 'ready_for_pickup':
      return <Gift className="w-8 h-8 text-[#F5B900]" aria-hidden="true" />;
    case 'completed':
      return <CheckCircle2 className="w-8 h-8 text-[#22C55E]" aria-hidden="true" />;
    case 'rejected':
    case 'cancelled':
      return <XCircle className="w-8 h-8 text-[#F87171]" aria-hidden="true" />;
    default:
      return order.fulfillmentType === 'delivery' ? (
        <Bike className="w-8 h-8 text-[#F5B900]" aria-hidden="true" />
      ) : (
        <ShoppingBag className="w-8 h-8 text-[#F5B900]" aria-hidden="true" />
      );
  }
}

function renderPaymentMethodIcon(method: PublicOrderTrackingRecord['paymentMethod']) {
  if (method === 'Pix') {
    return <QrCode className="w-4 h-4 text-[#22C55E] shrink-0" aria-hidden="true" />;
  }
  if (method === 'Dinheiro') {
    return <Banknote className="w-4 h-4 text-[#F5B900] shrink-0" aria-hidden="true" />;
  }
  return <CreditCard className="w-4 h-4 text-[#F5B900] shrink-0" aria-hidden="true" />;
}

export function PublicOrderTrackingView({
  token,
  onBackToMenu,
  initialOrder,
  initialStoreMenu,
  onOpenReview,
}: PublicOrderTrackingViewProps) {
  const [order, setOrder] = useState<PublicOrderTrackingRecord | null>(
    initialOrder ?? null,
  );
  const [storeMenu, setStoreMenu] = useState<PublicDigitalMenuPayload | null>(
    initialStoreMenu ?? null,
  );
  const [loading, setLoading] = useState(initialOrder === undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printingOpen, setPrintingOpen] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [reviewInvitationLoading, setReviewInvitationLoading] = useState(false);
  const [reviewInvitationError, setReviewInvitationError] = useState('');
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  function markImageBroken(url?: string) {
    if (!url) return;
    setBrokenImages((prev) => (prev[url] ? prev : { ...prev, [url]: true }));
  }

  function hasUsableImage(url?: string): url is string {
    return Boolean(url && !brokenImages[url]);
  }

  async function handleCopyPixKey(rawKey: string) {
    const cleanKey = normalizePixKeyInput(rawKey);
    if (!cleanKey) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(cleanKey);
      } else {
        const input = document.createElement('input');
        input.value = cleanKey;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        input.setSelectionRange(0, cleanKey.length);
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 3500);
    } catch {
      try {
        const input = document.createElement('input');
        input.value = cleanKey;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        input.setSelectionRange(0, cleanKey.length);
        document.execCommand('copy');
        document.body.removeChild(input);
        setCopiedPix(true);
        setTimeout(() => setCopiedPix(false), 3500);
      } catch {
        setCopiedPix(false);
      }
    }
  }

  async function handleOpenReview() {
    if (reviewInvitationLoading || order?.status !== 'completed') return;
    setReviewInvitationLoading(true);
    setReviewInvitationError('');
    try {
      const reviewToken = await createPublicReviewInvitation(token);
      if (onOpenReview) onOpenReview(reviewToken);
      else window.location.assign(`/cardapio/avaliar/${reviewToken}`);
    } catch (err) {
      setReviewInvitationError(err instanceof Error ? err.message : 'Não foi possível abrir a avaliação.');
    } finally {
      setReviewInvitationLoading(false);
    }
  }

  async function loadInitial(isManualRefresh = false) {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await fetchPublicOrderByToken(token);
      setOrder(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao consultar status do pedido.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (initialOrder !== undefined) return;
    void loadInitial(false);
  }, [token, initialOrder]);

  // Synchronize local active-order tracking persistence cleanly per store slug
  useEffect(() => {
    if (!order || !order.storeSlug) return;
    try {
      window.localStorage.setItem('mgw_public_menu_last_slug', order.storeSlug);
    } catch {
      // Ignora bloqueio de storage
    }
    upsertTrackedOrder(order.storeSlug, {
      trackingToken: token,
      storeSlug: order.storeSlug,
      orderNumber: order.orderNumber,
      orderCode: order.orderCode,
      status: order.status,
      fulfillmentType: order.fulfillmentType,
      totalAmount: order.totalAmount,
      createdAtMs: order.createdAtMs,
      updatedAtMs: order.updatedAtMs,
    });
  }, [order, token]);

  // Enrich with establishment's own logo, banner, tagline and item photos
  useEffect(() => {
    if (initialStoreMenu !== undefined || !order?.storeSlug) return;
    let active = true;
    void fetchPublicDigitalMenu(order.storeSlug)
      .then((menuRes) => {
        if (active && menuRes.found) {
          setStoreMenu(menuRes);
        }
      })
      .catch(() => {
        // Silencioso: tela continua completa mesmo sem fotos extras
      });
    return () => {
      active = false;
    };
  }, [order?.storeSlug, initialStoreMenu]);

  useEffect(() => {
    if (!order) return;
    const prevTitle = document.title;
    document.title = `Pedido ${formatOrderNumber(order.orderNumber)} — ${order.storeName}`;
    return () => {
      document.title = prevTitle;
    };
  }, [order]);

  const hasLoadedOrder = order !== null;
  const isTerminalOrder = order ? isTerminalOrderStatus(order.status) : false;

  useEffect(() => {
    if (!hasLoadedOrder || isTerminalOrder || initialOrder !== undefined) return;
    const unsub = subscribePublicOrderTracking(
      token,
      (updated) => {
        if (updated) {
          setOrder(updated);
        }
      },
      () => {
        // Falha transitória silenciosa na atualização automática; o botão Atualizar continua disponível
      },
    );
    return unsub;
  }, [token, hasLoadedOrder, isTerminalOrder, initialOrder]);

  const itemImagesMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!storeMenu) return map;
    for (const p of storeMenu.products) {
      if (p.id && p.imageUrl) map.set(`product:${p.id}`, p.imageUrl);
    }
    for (const c of storeMenu.combos) {
      if (c.id && c.imageUrl) map.set(`combo:${c.id}`, c.imageUrl);
    }
    return map;
  }, [storeMenu]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0C10] text-[#F3F4F6] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#14171F] border border-[#282D3A] rounded-2xl p-6 text-center space-y-2.5">
          <RefreshCw className="w-6 h-6 text-[#F5B900] animate-spin mx-auto" />
          <p className="text-sm font-bold text-white">Localizando seu pedido...</p>
          <p className="text-xs text-[#9CA3AF]">
            Conectando ao acompanhamento em tempo real.
          </p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#0A0C10] text-[#F3F4F6] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#14171F] border border-[#282D3A] rounded-2xl p-6 text-center space-y-4">
          <AlertCircle className="w-8 h-8 text-[#EF4444] mx-auto" />
          <div className="space-y-1">
            <h1 className="text-base font-bold text-white">Pedido não encontrado</h1>
            <p className="text-xs text-[#9CA3AF]">
              {error ||
                'O link de acompanhamento informado é inválido ou não existe.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void loadInitial(true)}
              className="min-h-[42px] px-4 rounded-xl bg-[#F5B900] hover:bg-[#FFC928] text-[#0B0D11] text-xs font-extrabold inline-flex items-center gap-2 cursor-pointer transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </button>
            {onBackToMenu && (
              <button
                type="button"
                onClick={() => onBackToMenu('')}
                className="min-h-[42px] px-4 rounded-xl border border-[#282D3A] text-xs font-semibold text-[#F3F4F6] cursor-pointer"
              >
                Ir ao cardápio
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const steps = getTrackingFlowSteps(order.fulfillmentType);
  const currentStepIndex = steps.indexOf(order.status);
  const isNegativeTerminal =
    order.status === 'rejected' || order.status === 'cancelled';
  const stepTimestamps = extractStepTimestamps(order);

  const storeProfile = storeMenu?.store ?? null;
  const bannerUrl = storeProfile?.bannerUrl;
  const logoUrl = storeProfile?.logoUrl;
  const storeDescription = storeProfile?.description;
  const storeIsOpen = storeProfile ? storeProfile.isOpen : null;

  const storeWhatsappUrl = order.storeWhatsapp
    ? buildWhatsappUrl(
        order.storeWhatsapp,
        `Olá ${order.storeName}, gostaria de falar sobre meu pedido ${formatOrderNumber(order.orderNumber)}.`,
      )
    : null;

  const paymentStatusText =
    order.status === 'completed'
      ? 'Confirmado'
      : isNegativeTerminal
        ? 'Encerrado'
        : order.paymentMethod === 'Pix' && shouldShowOrderPixPaymentBox(order)
          ? 'Pix disponível ou na entrega'
          : order.fulfillmentType === 'delivery'
            ? 'Pagar na entrega'
            : 'Pagar na retirada';

  return (
    <div className="min-h-screen w-full overflow-x-clip bg-[#0A0C10] text-[#F3F4F6] pb-10">
      {/* Store Branded Dark Header */}
      <header className="relative overflow-hidden bg-[#0E1117]">
        {hasUsableImage(bannerUrl) ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <img
              src={bannerUrl}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => markImageBroken(bannerUrl)}
              className="w-full h-full object-cover object-center opacity-50"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0A0C10]/55 via-[#0A0C10]/82 to-[#0A0C10]" />
          </div>
        ) : (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,185,0,0.14),transparent_60%),linear-gradient(180deg,rgba(20,23,31,0.92)_0%,rgba(10,12,16,1)_100%)]"
          />
        )}

        <div className="relative max-w-2xl mx-auto px-3.5 sm:px-6 pt-4 pb-3 space-y-3.5">
          {/* Top bar */}
          <div className="flex items-center justify-between gap-2">
            {onBackToMenu ? (
              <button
                type="button"
                onClick={() => onBackToMenu(order.storeSlug)}
                className="min-h-[38px] px-4 rounded-full border border-[#2C3344] hover:border-[#F5B900]/60 bg-[#161922]/90 text-xs font-semibold text-white inline-flex items-center gap-2 cursor-pointer transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Voltar ao cardápio</span>
              </button>
            ) : (
              <span />
            )}

            <button
              type="button"
              onClick={() => setPrintingOpen(true)}
              aria-label={`Imprimir pedido ${formatOrderNumber(order.orderNumber)}`}
              className="min-h-[38px] px-3.5 rounded-full border border-[#2C3344] hover:border-[#F5B900]/60 bg-[#161922]/90 text-xs font-semibold text-[#D1D5DB] hover:text-[#F5B900] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Printer className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Imprimir</span>
            </button>
          </div>

          {/* Store Identity Row */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden bg-gradient-to-br from-[#F5B900]/25 via-[#181C24] to-[#0A0C10] border-2 border-[#F5B900]/75 flex items-center justify-center text-[#F5B900] font-display font-extrabold text-xl shadow-[0_8px_24px_rgba(0,0,0,0.5)] shrink-0">
              {hasUsableImage(logoUrl) ? (
                <img
                  src={logoUrl}
                  alt={`Logo de ${order.storeName}`}
                  referrerPolicy="no-referrer"
                  onError={() => markImageBroken(logoUrl)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span aria-hidden="true">{getStoreMonogram(order.storeName)}</span>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h2 className="font-display text-lg sm:text-xl font-extrabold text-white truncate">
                  {order.storeName}
                </h2>
                {storeIsOpen !== null && (
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold shrink-0 ${
                      storeIsOpen ? 'text-[#22C55E]' : 'text-[#F87171]'
                    }`}
                  >
                    {storeIsOpen ? (
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>
                      {storeIsOpen ? 'Aberto para pedidos' : 'Fechado no momento'}
                    </span>
                  </span>
                )}
              </div>

              {storeDescription && (
                <p className="text-xs text-[#D1D5DB] line-clamp-1 leading-snug">
                  {storeDescription}
                </p>
              )}
            </div>
          </div>

          {/* Order Number & Refresh Strip */}
          <div className="rounded-2xl bg-[#14171F]/95 border border-[#282D3A] px-3.5 py-2.5 flex items-center justify-between gap-3 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#0D1017] border border-[#242936] flex items-center justify-center shrink-0">
                <ShoppingBag className="w-5 h-5 text-[#F5B900]" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-sm sm:text-base font-extrabold text-white font-mono tabular-nums">
                    Pedido {formatOrderNumber(order.orderNumber)}
                  </h1>
                  <span
                    data-testid="tracking-current-status"
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                      isNegativeTerminal
                        ? 'bg-[#EF4444]/15 border-[#EF4444]/40 text-[#FCA5A5]'
                        : order.status === 'completed'
                          ? 'bg-[#22C55E]/15 border-[#22C55E]/40 text-[#86EFAC]'
                          : 'bg-[#F5B900]/15 border-[#F5B900]/45 text-[#F5B900]'
                    }`}
                  >
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
                </div>
                <p className="text-[11px] text-[#9CA3AF] font-mono tabular-nums mt-0.5">
                  Realizado em {formatDateTimeBR(order.createdAtMs)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void loadInitial(true)}
              disabled={refreshing}
              aria-busy={refreshing}
              className="min-h-[38px] px-3.5 rounded-xl border border-[#F5B900]/65 bg-[#1B1F2A] hover:bg-[#F5B900]/15 text-xs font-bold text-[#F5B900] inline-flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Atualizar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Cards */}
      <main className="max-w-2xl mx-auto px-3.5 sm:px-6 pt-2 space-y-4">
        {/* Highlighted Status & Interactive Progress Timeline */}
        <section
          aria-label="Andamento e linha do tempo do pedido"
          className="rounded-2xl bg-[#14171F] border border-[#282D3A] p-4 sm:p-5 space-y-4 shadow-[0_10px_28px_rgba(0,0,0,0.3)]"
        >
          {/* Current Status Highlight Banner */}
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#0D1017] border border-[#F5B900]/35 flex items-center justify-center shrink-0">
              {renderStatusHeroIcon(order)}
            </div>
            <div className="min-w-0 space-y-0.5">
              <h2 className="font-display text-base sm:text-lg font-extrabold text-white leading-snug">
                {STATUS_HEADLINES[order.status]}
              </h2>
              <p className="text-xs sm:text-[13px] text-[#A0A8B8] leading-snug">
                {STATUS_DESCRIPTIONS[order.status]}
              </p>
            </div>
          </div>

          {/* Negative Terminal Reason */}
          {isNegativeTerminal && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/35 space-y-1.5"
            >
              <p className="text-xs font-bold text-[#FCA5A5]">
                {order.status === 'rejected'
                  ? 'Este pedido foi recusado pelo estabelecimento.'
                  : 'Este pedido foi cancelado.'}
              </p>
              {order.rejectionReason && (
                <p className="text-sm text-white">
                  Motivo: {order.rejectionReason}
                </p>
              )}
            </div>
          )}

          {/* Connected Horizontal Visual Timeline */}
          {!isNegativeTerminal && (
            <div className="overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              <ol
                aria-label="Etapas do pedido"
                className="flex items-start min-w-[390px] pt-1"
              >
                {steps.map((step, idx) => {
                  const isCompletedOrder = order.status === 'completed';
                  const isDone =
                    isCompletedOrder ? true : currentStepIndex > idx;
                  const isCurrent =
                    !isCompletedOrder && currentStepIndex === idx;
                  const stepTime = stepTimestamps[step];
                  const isLast = idx === steps.length - 1;
                  const connectorActive = currentStepIndex > idx;

                  return (
                    <li
                      key={step}
                      aria-current={isCurrent ? 'step' : undefined}
                      className="relative flex-1 min-w-[64px] flex flex-col items-center text-center px-1"
                    >
                      {/* Connector Line to Next Step */}
                      {!isLast && (
                        <span
                          aria-hidden="true"
                          className={`absolute top-4 left-1/2 w-full h-[2px] z-0 ${
                            connectorActive ? 'bg-[#F5B900]' : 'bg-[#282D3A]'
                          }`}
                        />
                      )}

                      {/* Node Circle */}
                      <span
                        className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                          isCurrent
                            ? 'bg-[#14171F] border-2 border-[#F5B900] text-[#F5B900] shadow-[0_0_16px_rgba(245,185,0,0.45)]'
                            : isDone
                              ? 'bg-[#F5B900] border border-[#F5B900] text-[#0B0D11]'
                              : 'bg-[#1C212C] border border-[#2C3344] text-[#6B7280]'
                        }`}
                      >
                        {isDone ? (
                          <Check className="w-4 h-4 stroke-[2.8]" aria-hidden="true" />
                        ) : (
                          renderStepGlyph(step, 'w-4 h-4')
                        )}
                      </span>

                      {/* Step Label */}
                      <span
                        className={`mt-2 text-[10.5px] leading-tight font-semibold ${
                          isCurrent
                            ? 'text-[#F5B900] font-bold'
                            : isDone
                              ? 'text-[#F3F4F6]'
                              : 'text-[#6B7280]'
                        }`}
                      >
                        {STEP_SHORT_LABELS[step]}
                      </span>

                      {/* Real Timestamp or "Agora" Pill */}
                      {isCurrent ? (
                        <span className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded-full bg-[#F5B900] text-[#0B0D11] text-[9.5px] font-extrabold tracking-wide">
                          Agora
                        </span>
                      ) : stepTime ? (
                        <span className="mt-1 text-[10px] font-mono tabular-nums text-[#9CA3AF]">
                          {formatTimeBR(stepTime)}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {/* Honest Forecast & Order Type Box */}
          <div className="rounded-xl bg-[#0D1017] border border-[#242936] p-3 grid grid-cols-1 min-[360px]:grid-cols-2 gap-3">
            <div className="flex items-start gap-2.5 min-w-0 min-[360px]:pr-2 min-[360px]:border-r min-[360px]:border-[#242936]">
              <Clock className="w-5 h-5 text-[#F5B900] shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[11px] text-[#9CA3AF]">
                  {order.fulfillmentType === 'delivery'
                    ? 'Previsão de entrega'
                    : 'Previsão de retirada'}
                </p>
                {order.status === 'completed' ? (
                  <p className="text-sm font-extrabold text-[#22C55E] mt-0.5">
                    Concluído às {formatTimeBR(stepTimestamps.completed || order.updatedAtMs)}
                  </p>
                ) : isNegativeTerminal ? (
                  <p className="text-sm font-extrabold text-[#FCA5A5] mt-0.5">
                    Pedido encerrado
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-extrabold text-[#F5B900] mt-0.5">
                      Atualização em andamento
                    </p>
                    <p className="text-[10.5px] text-[#8E96A8] leading-tight mt-0.5">
                      O estabelecimento atualizará o andamento do pedido.
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2.5 min-w-0">
              {order.fulfillmentType === 'delivery' ? (
                <Home className="w-5 h-5 text-[#F5B900] shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <Store className="w-5 h-5 text-[#F5B900] shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className="text-[11px] text-[#9CA3AF]">Tipo de pedido</p>
                <p className="text-sm sm:text-base font-extrabold text-white mt-0.5">
                  {order.fulfillmentType === 'delivery'
                    ? 'Entrega'
                    : 'Retirada no balcão'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Optional Pix Copy-and-Paste Card */}
        {shouldShowOrderPixPaymentBox(order) && (
          <section
            data-testid="tracking-pix-card"
            className="rounded-2xl bg-[#14171F] border border-[#F5B900]/55 p-4 sm:p-5 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h2 className="text-sm font-bold text-white">
                  Pagar com Pix (opcional antecipar)
                </h2>
                <p className="text-xs text-[#9CA3AF]">
                  Se preferir, você também pode pagar na{' '}
                  {order.fulfillmentType === 'delivery'
                    ? 'entrega'
                    : 'retirada no balcão'}
                  .
                </p>
              </div>
              <span className="font-mono tabular-nums text-sm font-extrabold text-[#F5B900] bg-[#F5B900]/10 border border-[#F5B900]/35 px-2.5 py-1 rounded-lg">
                {formatCurrencyBRL(order.totalAmount)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#0D1017] border border-[#242936] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-[#9CA3AF]">Chave Pix da loja</p>
                <p
                  data-testid="tracking-pix-key-value"
                  className="text-sm font-mono text-white break-all select-all mt-0.5"
                >
                  {order.storePixKey}
                </p>
              </div>

              <button
                type="button"
                data-testid="copy-pix-key-btn"
                onClick={() => void handleCopyPixKey(order.storePixKey)}
                className={`min-h-[40px] px-4 rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
                  copiedPix
                    ? 'bg-[#22C55E] text-[#0B0D11]'
                    : 'bg-[#F5B900] hover:bg-[#FFC928] text-[#0B0D11]'
                }`}
              >
                {copiedPix ? (
                  <>
                    <Check className="w-4 h-4" />
                    Chave Pix copiada!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copiar chave Pix
                  </>
                )}
              </button>
            </div>
          </section>
        )}

        {/* Order Summary Card */}
        <section
          aria-label="Resumo do pedido"
          className="rounded-2xl bg-[#14171F] border border-[#282D3A] p-4 sm:p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[#242936] pb-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-[#F5B900] shrink-0" aria-hidden="true" />
              <h2 className="text-sm sm:text-base font-extrabold text-white">
                Resumo do Pedido
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setDetailsExpanded((v) => !v)}
              aria-expanded={detailsExpanded}
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-[#F5B900] hover:text-[#FFC928] cursor-pointer shrink-0 whitespace-nowrap"
            >
              <span>{detailsExpanded ? 'Ocultar histórico' : 'Ver detalhes'}</span>
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform ${
                  detailsExpanded ? 'rotate-90' : ''
                }`}
                aria-hidden="true"
              />
            </button>
          </div>

          {/* Items List */}
          <div className="divide-y divide-[#242936]">
            {order.items.map((item) => {
              const photoUrl = itemImagesMap.get(`${item.itemKind}:${item.refId}`);
              return (
                <div
                  key={item.id}
                  className="py-3 first:pt-0 last:pb-0 flex items-center gap-3"
                >
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-[#0D1017] border border-[#242936] flex items-center justify-center shrink-0">
                    {hasUsableImage(photoUrl) ? (
                      <img
                        src={photoUrl}
                        alt={item.itemName}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() => markImageBroken(photoUrl)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ShoppingBag className="w-5 h-5 text-[#F5B900]" aria-hidden="true" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm sm:text-[15px] font-extrabold text-white leading-snug">
                      {item.itemName}
                    </p>
                    {item.selectedAddons?.map((group) => (
                      <p key={group.groupId} className="text-xs text-[#D1D5DB]">
                        <span className="text-[#F5B900]">{group.groupName}:</span>{' '}
                        {group.options.map((option) => option.name).join(', ')}
                      </p>
                    ))}
                    {item.itemNote && (
                      <p className="text-xs text-[#9CA3AF]">Obs: {item.itemNote}</p>
                    )}
                    <p className="text-base font-extrabold text-[#F5B900] font-mono tabular-nums pt-0.5">
                      {formatCurrencyBRL(item.lineTotal)}
                    </p>
                  </div>

                  <span className="px-3 py-1.5 rounded-xl bg-[#0D1017] border border-[#2C3344] text-xs font-bold text-white font-mono tabular-nums shrink-0">
                    Qtd: {item.quantity}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Payment & Totals Breakdown */}
          <div className="pt-3 border-t border-[#242936] space-y-2.5 text-xs sm:text-sm">
            <div className="flex items-center justify-between gap-2 text-[#D1D5DB]">
              <div className="flex items-center gap-2 min-w-0">
                <CreditCard className="w-4 h-4 text-[#F5B900] shrink-0" aria-hidden="true" />
                <span>Subtotal</span>
              </div>
              <span className="font-mono tabular-nums font-semibold text-white">
                {formatCurrencyBRL(order.subtotalAmount)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 text-[#D1D5DB]">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="text-[#9CA3AF]">Pagamento</span>
                <span className="inline-flex items-center gap-1.5 font-bold text-white">
                  {renderPaymentMethodIcon(order.paymentMethod)}
                  <span>{order.paymentMethod}</span>
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#0D1017] border border-[#2C3344] text-[#A0A8B8]">
                  {paymentStatusText}
                </span>
              </div>
              {order.paymentMethod === 'Dinheiro' && order.changeFor ? (
                <span className="text-xs font-mono tabular-nums text-[#F5B900] shrink-0">
                  Troco p/ {formatCurrencyBRL(order.changeFor)}
                </span>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-2 text-[#D1D5DB]">
              <div className="flex items-center gap-2 min-w-0">
                <Truck className="w-4 h-4 text-[#F5B900] shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <span>
                    {order.fulfillmentType === 'delivery'
                      ? 'Taxa de entrega'
                      : 'Retirada no balcão'}
                  </span>
                  {order.fulfillmentType === 'delivery' &&
                    (order.deliveryFeeRule || order.deliveryFreeApplied) && (
                      <span className="block text-[11px] text-[#9CA3AF] truncate">
                        {formatDeliveryFeeRuleLabel(
                          order.deliveryFeeRule,
                          order.deliveryFreeApplied,
                        )}
                      </span>
                    )}
                </div>
              </div>
              <span className="font-mono tabular-nums font-semibold text-white shrink-0">
                {order.deliveryFee <= 0
                  ? 'Grátis'
                  : formatCurrencyBRL(order.deliveryFee)}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2.5 border-t border-[#242936]">
              <span className="text-base sm:text-lg font-extrabold text-[#F5B900]">
                Total
              </span>
              <span className="text-lg sm:text-xl font-extrabold text-[#F5B900] font-mono tabular-nums">
                {formatCurrencyBRL(order.totalAmount)}
              </span>
            </div>
          </div>

          {/* Fulfillment Address / Pickup Details */}
          <div className="p-3.5 rounded-xl bg-[#0D1017] border border-[#242936] space-y-2 text-xs">
            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-[#F5B900] shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0 space-y-0.5">
                <p className="text-[#9CA3AF]">
                  {order.fulfillmentType === 'delivery'
                    ? 'Endereço de entrega'
                    : 'Local de retirada'}
                </p>
                {order.fulfillmentType === 'delivery' ? (
                  <>
                    <p className="font-semibold text-white leading-snug">
                      {order.deliveryAddress}
                    </p>
                    {(order.deliveryNeighborhood ||
                      order.deliveryCity ||
                      order.deliveryRegionName) && (
                      <p className="text-[#D1D5DB]">
                        {[
                          order.deliveryNeighborhood
                            ? `Bairro ${order.deliveryNeighborhood}`
                            : order.deliveryRegionName,
                          order.deliveryCity,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                    {order.deliveryReference && (
                      <p className="text-[#A0A8B8]">
                        Referência / Complemento: {order.deliveryReference}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-white leading-snug">
                      {order.storeAddress || order.storeName}
                    </p>
                    <p className="text-[#A0A8B8]">
                      O pedido será retirado diretamente no local.
                    </p>
                  </>
                )}
              </div>
            </div>

            {order.customerNote && (
              <div className="flex items-start gap-2.5 pt-2 border-t border-[#242936]">
                <Package className="w-4 h-4 text-[#F5B900] shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-[#9CA3AF]">Observação do pedido</p>
                  <p className="font-medium text-white mt-0.5">
                    {order.customerNote}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Expanded History Timeline */}
          {detailsExpanded && order.statusHistory.length > 0 && (
            <div className="pt-2 border-t border-[#242936] space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#9CA3AF]">
                Histórico de atualizações
              </h3>
              <div className="space-y-2">
                {order.statusHistory.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-start justify-between gap-3 text-xs border-b border-[#242936]/70 last:border-b-0 pb-2 last:pb-0"
                  >
                    <div>
                      <p className="font-semibold text-white">
                        {ORDER_STATUS_LABELS[ev.toStatus]}
                      </p>
                      {ev.reason && (
                        <p className="text-[#9CA3AF] mt-0.5">Motivo: {ev.reason}</p>
                      )}
                    </div>
                    <span className="font-mono tabular-nums text-[#9CA3AF] shrink-0">
                      {formatTimeBR(ev.createdAtMs)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* WhatsApp Contact CTA */}
        {storeWhatsappUrl && (
          <a
            href={storeWhatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full min-h-[50px] px-4 rounded-2xl bg-[#14171F] border border-[#282D3A] hover:border-[#22C55E]/70 text-sm font-bold text-white flex items-center justify-between gap-3 transition-colors"
          >
            <span className="inline-flex items-center gap-3 min-w-0">
              <span className="w-8 h-8 rounded-full bg-[#22C55E]/15 border border-[#22C55E]/40 flex items-center justify-center shrink-0">
                <MessageCircle className="w-4 h-4 text-[#22C55E]" aria-hidden="true" />
              </span>
              <span className="truncate">
                Falar com o estabelecimento no WhatsApp
              </span>
            </span>
            <ChevronRight className="w-4 h-4 text-[#22C55E] shrink-0" aria-hidden="true" />
          </a>
        )}

        {order.status === 'completed' && (
          <section className="rounded-2xl bg-[#14171F] border border-[#F5B900]/40 p-4 space-y-3">
            <div className="space-y-1">
              <h2 className="text-sm font-extrabold text-white">Seu pedido foi concluído!</h2>
              <p className="text-xs text-[#A0A8B8]">Conte como foi sua experiência. Sua avaliação ajuda o estabelecimento e outros clientes.</p>
            </div>
            {reviewInvitationError && <p role="alert" className="text-xs text-red-300">{reviewInvitationError}</p>}
            <button type="button" onClick={() => void handleOpenReview()} disabled={reviewInvitationLoading} className="w-full min-h-[48px] rounded-xl bg-[#F5B900] hover:bg-[#FFC928] disabled:opacity-60 text-[#0B0D11] text-sm font-extrabold inline-flex items-center justify-center gap-2">
              {reviewInvitationLoading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Preparando avaliação...</> : <><CheckCircle2 className="w-4 h-4" /> Avaliar meu pedido</>}
            </button>
          </section>
        )}

        {/* Persistent Return Assurance Notice */}
        <div className="rounded-2xl bg-[#14171F] border border-[#282D3A] px-4 py-3 flex items-center gap-3">
          <span className="w-8 h-8 rounded-full bg-[#F5B900]/15 border border-[#F5B900]/35 flex items-center justify-center shrink-0">
            <Info className="w-4 h-4 text-[#F5B900]" aria-hidden="true" />
          </span>
          <p className="text-xs sm:text-[13px] text-[#D1D5DB] leading-snug">
            Você pode voltar aqui a qualquer momento para acompanhar seu pedido.
          </p>
        </div>

        {/* Bottom Return to Menu Button */}
        {onBackToMenu && (
          <button
            type="button"
            onClick={() => onBackToMenu(order.storeSlug)}
            className="w-full min-h-[50px] px-4 rounded-2xl bg-[#14171F] border-2 border-[#F5B900] hover:bg-[#F5B900]/10 text-sm font-extrabold text-white inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Home className="w-4 h-4 text-[#F5B900]" aria-hidden="true" />
            <span>Voltar para o cardápio</span>
          </button>
        )}
      </main>

      <OrderPrintModal
        order={printingOpen ? fromPublicTrackingRecord(order) : null}
        allowKitchenToggle={false}
        onClose={() => setPrintingOpen(false)}
      />
    </div>
  );
}
