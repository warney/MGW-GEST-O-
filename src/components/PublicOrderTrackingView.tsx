import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clock,
  Copy,
  MapPin,
  MessageCircle,
  Package,
  Printer,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';
import {
  fetchPublicOrderByToken,
  subscribePublicOrderTracking,
} from '../services/dataService';
import type { PublicOrderTrackingRecord } from '../types/finance';
import { formatCurrencyBRL } from '../utils/finance';
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
import { fromPublicTrackingRecord } from '../utils/orderPrint';
import { OrderPrintModal } from './OrderPrintModal';

interface PublicOrderTrackingViewProps {
  token: string;
  onBackToMenu?: (slug: string) => void;
}

const STATUS_DESCRIPTIONS: Record<
  PublicOrderTrackingRecord['status'],
  string
> = {
  received: 'Seu pedido chegou para a lanchonete e aguarda confirmação.',
  accepted: 'Pedido confirmado! Logo ele entrará em preparo.',
  preparing: 'Sua comida está sendo preparada na cozinha.',
  ready: 'Pedido pronto e conferido!',
  out_for_delivery: 'O entregador já saiu com o seu pedido.',
  ready_for_pickup: 'Seu pedido está pronto aguardando retirada no balcão.',
  completed: 'Pedido concluído! Obrigado pela preferência.',
  rejected: 'Infelizmente a loja não pôde aceitar este pedido.',
  cancelled: 'Este pedido foi cancelado.',
};

export function PublicOrderTrackingView({
  token,
  onBackToMenu,
}: PublicOrderTrackingViewProps) {
  const [order, setOrder] = useState<PublicOrderTrackingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printingOpen, setPrintingOpen] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);

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
      // Fall back to execCommand when Clipboard API permission is denied (e.g. iframe)
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

  async function loadInitial() {
    setLoading(true);
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
    }
  }

  useEffect(() => {
    void loadInitial();
  }, [token]);

  const hasLoadedOrder = order !== null;
  const isTerminalOrder = order ? isTerminalOrderStatus(order.status) : false;
  const firebaseTokenHash = order?.tokenHash;

  useEffect(() => {
    if (!hasLoadedOrder || isTerminalOrder) return;
    const unsub = subscribePublicOrderTracking(
      token,
      (updated) => {
        setOrder(updated);
      },
      () => {
        // Falha transitória silenciosa na atualização automática; o botão de atualizar continua disponível
      },
      { tokenHash: firebaseTokenHash },
    );
    return unsub;
  }, [token, hasLoadedOrder, isTerminalOrder, firebaseTokenHash]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0D11] text-[#F3F4F6] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#12151C] border border-[#232834] rounded-2xl p-6 text-center space-y-2">
          <p className="text-sm font-semibold text-[#F3F4F6]">
            Localizando seu pedido...
          </p>
          <p className="text-xs text-[#9CA3AF]">
            Conectando ao acompanhamento em tempo real.
          </p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#0B0D11] text-[#F3F4F6] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#12151C] border border-[#232834] rounded-2xl p-6 text-center space-y-4">
          <AlertCircle className="w-8 h-8 text-[#EF4444] mx-auto" />
          <div className="space-y-1">
            <h1 className="text-base font-bold text-[#F3F4F6]">
              Pedido não encontrado
            </h1>
            <p className="text-xs text-[#9CA3AF]">
              {error ||
                'O link de acompanhamento informado é inválido ou não existe.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void loadInitial()}
              className="min-h-[42px] px-4 rounded-xl bg-[#F5B731] text-[#0B0D11] text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </button>
            {onBackToMenu && (
              <button
                type="button"
                onClick={() => onBackToMenu('')}
                className="min-h-[42px] px-4 rounded-xl border border-[#232834] text-xs font-semibold text-[#F3F4F6] cursor-pointer"
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

  const storeWhatsappUrl = order.storeWhatsapp
    ? buildWhatsappUrl(
        order.storeWhatsapp,
        `Olá ${order.storeName}, gostaria de falar sobre meu pedido ${formatOrderNumber(order.orderNumber)}.`,
      )
    : null;

  return (
    <div className="min-h-screen bg-[#0B0D11] text-[#F3F4F6] py-6 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Top Action & Title */}
        <div className="flex items-center justify-between gap-3">
          {onBackToMenu && (
            <button
              type="button"
              onClick={() => onBackToMenu(order.storeSlug)}
              className="min-h-[40px] px-3 rounded-xl border border-[#232834] hover:border-[#F5B731]/50 bg-[#12151C] text-xs font-semibold text-[#D1D5DB] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao cardápio
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => setPrintingOpen(true)}
              aria-label={`Imprimir pedido ${formatOrderNumber(order.orderNumber)}`}
              className="min-h-[40px] px-3 rounded-xl border border-[#232834] hover:border-[#F5B731]/50 bg-[#12151C] text-xs font-semibold text-[#D1D5DB] hover:text-[#F5B731] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir
            </button>
            <button
              type="button"
              onClick={() => void loadInitial()}
              className="min-h-[40px] px-3 rounded-xl border border-[#232834] bg-[#12151C] text-xs font-medium text-[#9CA3AF] hover:text-[#F3F4F6] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Atualizar
            </button>
          </div>
        </div>

        {/* Status Callout Card */}
        <section className="bg-[#12151C] border border-[#232834] rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#232834] pb-4">
            <div>
              <p className="text-xs text-[#9CA3AF]">{order.storeName}</p>
              <h1 className="text-xl sm:text-2xl font-bold text-[#F3F4F6] font-mono tabular-nums mt-0.5">
                Pedido {formatOrderNumber(order.orderNumber)}
              </h1>
              <p className="text-xs text-[#9CA3AF] font-mono tabular-nums mt-1">
                Realizado em {formatDateTimeBR(order.createdAtMs)}
              </p>
            </div>

            <span
              data-testid="tracking-current-status"
              className={`text-xs sm:text-sm font-bold px-3 py-1.5 rounded-lg border ${
                isNegativeTerminal
                  ? 'bg-[#EF4444]/10 border-[#EF4444]/40 text-[#FCA5A5]'
                  : order.status === 'completed'
                    ? 'bg-[#22C55E]/10 border-[#22C55E]/40 text-[#86EFAC]'
                    : 'bg-[#F5B731]/10 border-[#F5B731]/40 text-[#F5B731]'
              }`}
            >
              {ORDER_STATUS_LABELS[order.status]}
            </span>
          </div>

          <p className="text-sm text-[#D1D5DB]">
            {STATUS_DESCRIPTIONS[order.status]}
          </p>

          {isNegativeTerminal && order.rejectionReason && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 space-y-1"
            >
              <p className="text-xs font-bold text-[#FCA5A5]">
                Motivo informado pelo estabelecimento:
              </p>
              <p className="text-sm text-[#F3F4F6]">{order.rejectionReason}</p>
            </div>
          )}

          {/* Stepper */}
          {!isNegativeTerminal && (
            <div className="pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                {steps.map((step, idx) => {
                  const done = currentStepIndex >= idx;
                  const current = currentStepIndex === idx;
                  return (
                    <div
                      key={step}
                      className={`p-2.5 rounded-xl border text-center space-y-1 ${
                        current
                          ? 'bg-[#F5B731]/12 border-[#F5B731] text-[#F5B731]'
                          : done
                            ? 'bg-[#22C55E]/10 border-[#22C55E]/40 text-[#86EFAC]'
                            : 'bg-[#0B0D11] border-[#232834] text-[#6B7280]'
                      }`}
                    >
                      <div className="flex justify-center">
                        {done ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Clock className="w-4 h-4" />
                        )}
                      </div>
                      <p className="text-[11px] font-semibold leading-tight">
                        {ORDER_STATUS_LABELS[step]}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Optional Pix Copy-and-Paste Card */}
        {shouldShowOrderPixPaymentBox(order) && (
          <section
            data-testid="tracking-pix-card"
            className="bg-[#12151C] border border-[#F5B731]/40 rounded-2xl p-5 sm:p-6 space-y-3.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h2 className="text-sm font-bold text-[#F3F4F6]">
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
              <span className="font-mono tabular-nums text-sm font-bold text-[#F5B731] bg-[#F5B731]/10 border border-[#F5B731]/30 px-2.5 py-1 rounded-lg">
                {formatCurrencyBRL(order.totalAmount)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#0B0D11] border border-[#232834] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-[#9CA3AF]">Chave Pix da loja</p>
                <p
                  data-testid="tracking-pix-key-value"
                  className="text-sm font-mono text-[#F3F4F6] break-all select-all mt-0.5"
                >
                  {order.storePixKey}
                </p>
              </div>

              <button
                type="button"
                data-testid="copy-pix-key-btn"
                onClick={() => void handleCopyPixKey(order.storePixKey)}
                className={`min-h-[42px] px-4 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
                  copiedPix
                    ? 'bg-[#22C55E] text-[#0B0D11]'
                    : 'bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11]'
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

        {/* Order Details & Summary */}
        <section className="bg-[#12151C] border border-[#232834] rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#232834] pb-3">
            <ShoppingBag className="w-4 h-4 text-[#F5B731]" />
            <h2 className="text-sm font-bold text-[#F3F4F6]">
              Resumo do Pedido
            </h2>
          </div>

          <div className="divide-y divide-[#232834]">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3 text-xs"
              >
                <div className="space-y-0.5 min-w-0">
                  <p className="font-semibold text-[#F3F4F6]">
                    {item.quantity}x {item.itemName}
                  </p>
                  {item.itemNote && (
                    <p className="text-[#9CA3AF]">Obs: {item.itemNote}</p>
                  )}
                </div>
                <span className="font-mono tabular-nums font-bold text-[#F3F4F6] shrink-0">
                  {formatCurrencyBRL(item.lineTotal)}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-[#232834] space-y-1.5 text-xs">
            <div className="flex justify-between text-[#9CA3AF]">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums text-[#F3F4F6]">
                {formatCurrencyBRL(order.subtotalAmount)}
              </span>
            </div>
            <div className="flex justify-between text-[#9CA3AF]">
              <span>
                {order.fulfillmentType === 'delivery'
                  ? 'Taxa de entrega'
                  : 'Retirada no balcão'}
              </span>
              <span className="font-mono tabular-nums text-[#F3F4F6]">
                {order.deliveryFee <= 0
                  ? 'Grátis'
                  : formatCurrencyBRL(order.deliveryFee)}
              </span>
            </div>
            <div className="flex justify-between text-base font-bold text-[#F5B731] pt-1">
              <span>Total</span>
              <span className="font-mono tabular-nums">
                {formatCurrencyBRL(order.totalAmount)}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] space-y-2 text-xs">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-[#F5B731] shrink-0 mt-0.5" />
              <div>
                <p className="text-[#9CA3AF]">
                  {order.fulfillmentType === 'delivery'
                    ? 'Endereço de entrega'
                    : 'Local de retirada'}
                </p>
                <p className="font-semibold text-[#F3F4F6]">
                  {order.fulfillmentType === 'delivery'
                    ? `${order.deliveryAddress}${
                        order.deliveryReference
                          ? ` · Ref: ${order.deliveryReference}`
                          : ''
                      }`
                    : order.storeAddress || 'Retirada no balcão da loja'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 pt-1 border-t border-[#232834]">
              <Package className="w-4 h-4 text-[#F5B731] shrink-0 mt-0.5" />
              <div>
                <p className="text-[#9CA3AF]">Forma de pagamento</p>
                <p className="font-semibold text-[#F3F4F6]">
                  {order.paymentMethod}
                  {order.paymentMethod === 'Dinheiro' && order.changeFor
                    ? ` · Troco para ${formatCurrencyBRL(order.changeFor)}`
                    : ''}
                </p>
                {order.customerNote && (
                  <p className="text-[#9CA3AF] mt-1">
                    Observação: {order.customerNote}
                  </p>
                )}
              </div>
            </div>
          </div>

          {storeWhatsappUrl && (
            <a
              href={storeWhatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[44px] px-4 rounded-xl border border-[#22C55E]/40 hover:border-[#22C55E] bg-[#0B0D11] text-xs font-bold text-[#86EFAC] inline-flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              Falar com {order.storeName} no WhatsApp
            </a>
          )}
        </section>

        {/* Timeline */}
        {order.statusHistory.length > 0 && (
          <section className="bg-[#12151C] border border-[#232834] rounded-2xl p-5 sm:p-6 space-y-3">
            <h2 className="text-sm font-bold text-[#F3F4F6]">
              Histórico de atualizações
            </h2>
            <div className="space-y-2.5">
              {order.statusHistory.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-start justify-between gap-3 text-xs border-b border-[#232834] last:border-b-0 pb-2 last:pb-0"
                >
                  <div>
                    <p className="font-semibold text-[#F3F4F6]">
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
          </section>
        )}
      </div>

      <OrderPrintModal
        order={printingOpen ? fromPublicTrackingRecord(order) : null}
        allowKitchenToggle={false}
        onClose={() => setPrintingOpen(false)}
      />
    </div>
  );
}
