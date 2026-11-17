import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Layers,
  MapPin,
  MessageCircle,
  Minus,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import {
  createPublicOnlineOrder,
  fetchPublicDigitalMenu,
} from '../services/dataService';
import type {
  OnlineOrderCartItem,
  OnlineOrderFulfillment,
  OnlineOrderPaymentMethod,
  PublicCatalogCombo,
  PublicCatalogProduct,
  PublicDigitalMenuPayload,
} from '../types/finance';
import { formatCurrencyBRL } from '../utils/finance';
import {
  buildWhatsappUrl,
  computeCartSummary,
  validateCheckoutPayload,
} from '../utils/onlineOrders';

interface PublicMenuViewProps {
  slug?: string;
  onOrderCreated: (trackingToken: string) => void;
}

type MenuCategoryFilter =
  | 'all'
  | 'combos'
  | 'Lanche'
  | 'Bebida'
  | 'Adicional'
  | 'Outro';

type CheckoutStep = 'cart' | 'details' | 'review';

export function PublicMenuView({ slug, onOrderCreated }: PublicMenuViewProps) {
  const [payload, setPayload] = useState<PublicDigitalMenuPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] =
    useState<MenuCategoryFilter>('all');

  const [cart, setCart] = useState<OnlineOrderCartItem[]>([]);
  const [fulfillmentType, setFulfillmentType] =
    useState<OnlineOrderFulfillment>('delivery');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryReference, setDeliveryReference] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<OnlineOrderPaymentMethod>('Pix');
  const [changeForInput, setChangeForInput] = useState('');
  const [customerNote, setCustomerNote] = useState('');

  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>('cart');
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadMenu() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetchPublicDigitalMenu(slug);
      setPayload(res);
      if (res.store) {
        if (!res.store.acceptsDelivery && res.store.acceptsPickup) {
          setFulfillmentType('pickup');
        } else if (res.store.acceptsDelivery) {
          setFulfillmentType('delivery');
        }
      }
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar o cardápio agora.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMenu();
  }, [slug]);

  const store = payload?.store ?? null;
  const products = payload?.products ?? [];
  const combos = payload?.combos ?? [];

  const cartSummary = useMemo(() => {
    if (!store) {
      return {
        lines: [],
        missingItems: [],
        totalItemsCount: 0,
        subtotal: 0,
        deliveryFee: 0,
        totalAmount: 0,
        minimumOrderAmount: 0,
        belowMinimum: false,
        missingForMinimum: 0,
      };
    }
    return computeCartSummary(cart, products, combos, store, fulfillmentType);
  }, [cart, products, combos, store, fulfillmentType]);

  function getItemQuantity(kind: 'product' | 'combo', id: string): number {
    return cart.find((item) => item.kind === kind && item.id === id)?.quantity ?? 0;
  }

  function updateItemQuantity(
    kind: 'product' | 'combo',
    id: string,
    delta: number,
  ) {
    setCheckoutError(null);
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.kind === kind && i.id === id);
      if (idx === -1) {
        if (delta <= 0) return prev;
        return [...prev, { kind, id, quantity: delta, note: '' }];
      }
      const nextQty = prev[idx].quantity + delta;
      if (nextQty <= 0) {
        return prev.filter((_, i) => i !== idx);
      }
      return prev.map((entry, i) =>
        i === idx ? { ...entry, quantity: Math.min(99, nextQty) } : entry,
      );
    });
  }

  function updateItemNote(
    kind: 'product' | 'combo',
    id: string,
    note: string,
  ) {
    setCart((prev) =>
      prev.map((entry) =>
        entry.kind === kind && entry.id === id
          ? { ...entry, note: note.slice(0, 200) }
          : entry,
      ),
    );
  }

  function removeItem(kind: 'product' | 'combo', id: string) {
    setCart((prev) => prev.filter((i) => !(i.kind === kind && i.id === id)));
  }

  const normalizedQuery = searchTerm.trim().toLowerCase();

  const filteredCombos = useMemo<PublicCatalogCombo[]>(() => {
    if (categoryFilter !== 'all' && categoryFilter !== 'combos') return [];
    if (!normalizedQuery) return combos;
    return combos.filter((c) => {
      const itemsText = c.items.map((i) => i.productName).join(' ');
      return `${c.name} ${c.description} ${itemsText}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [combos, categoryFilter, normalizedQuery]);

  const filteredProducts = useMemo<PublicCatalogProduct[]>(() => {
    if (categoryFilter === 'combos') return [];
    return products.filter((p) => {
      if (categoryFilter !== 'all' && p.category !== categoryFilter) {
        return false;
      }
      if (!normalizedQuery) return true;
      return `${p.name} ${p.category}`.toLowerCase().includes(normalizedQuery);
    });
  }, [products, categoryFilter, normalizedQuery]);

  function parsedChangeForValue(): number | null {
    if (paymentMethod !== 'Dinheiro') return null;
    const raw = changeForInput.trim().replace(',', '.');
    if (!raw) return null;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  function handleAdvanceToReview(e: React.FormEvent) {
    e.preventDefault();
    if (!store) return;

    const validation = validateCheckoutPayload(
      {
        slug: store.slug,
        customerName,
        customerPhone,
        fulfillmentType,
        deliveryAddress,
        deliveryReference,
        paymentMethod,
        changeFor: parsedChangeForValue(),
        customerNote,
      },
      cartSummary,
      store,
    );

    if (!validation.valid) {
      setCheckoutError(validation.error ?? 'Verifique os dados do pedido.');
      return;
    }

    setCheckoutError(null);
    setCheckoutStep('review');
  }

  async function handleConfirmOrder() {
    if (!store || submitting) return;

    const payloadToSend = {
      slug: store.slug,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      fulfillmentType,
      deliveryAddress:
        fulfillmentType === 'delivery' ? deliveryAddress.trim() : '',
      deliveryReference:
        fulfillmentType === 'delivery' ? deliveryReference.trim() : '',
      paymentMethod,
      changeFor: parsedChangeForValue(),
      customerNote: customerNote.trim(),
      items: cartSummary.lines.map((line) => ({
        kind: line.kind,
        id: line.id,
        quantity: line.quantity,
        note: line.note,
      })),
    };

    const validation = validateCheckoutPayload(payloadToSend, cartSummary, store);
    if (!validation.valid) {
      setCheckoutError(validation.error ?? 'Revise os dados do pedido.');
      return;
    }

    setCheckoutError(null);
    setSubmitting(true);
    try {
      const response = await createPublicOnlineOrder(payloadToSend);
      onOrderCreated(response.trackingToken);
    } catch (err) {
      setCheckoutError(
        err instanceof Error
          ? err.message
          : 'Erro ao enviar seu pedido. Tente novamente.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0D11] text-[#F3F4F6] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#12151C] border border-[#232834] rounded-2xl p-6 text-center space-y-2">
          <p className="text-sm font-semibold text-[#F3F4F6]">
            Carregando cardápio digital...
          </p>
          <p className="text-xs text-[#9CA3AF]">
            Preparando produtos, combos e preços atualizados.
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#0B0D11] text-[#F3F4F6] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#12151C] border border-[#232834] rounded-2xl p-6 text-center space-y-4">
          <AlertCircle className="w-8 h-8 text-[#EF4444] mx-auto" />
          <div className="space-y-1">
            <h1 className="text-base font-bold text-[#F3F4F6]">
              Não foi possível abrir o cardápio
            </h1>
            <p className="text-xs text-[#9CA3AF]">{loadError}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadMenu()}
            className="min-h-[44px] px-5 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!payload?.found || !store || !store.isActive) {
    return (
      <div className="min-h-screen bg-[#0B0D11] text-[#F3F4F6] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#12151C] border border-[#232834] rounded-2xl p-6 text-center space-y-3">
          <Store className="w-8 h-8 text-[#F5B731] mx-auto" />
          <h1 className="text-lg font-bold text-[#F3F4F6]">
            Cardápio indisponível no momento
          </h1>
          <p className="text-xs text-[#9CA3AF]">
            {store && !store.isActive
              ? `${store.storeName} ainda não ativou os pedidos online ou pausou o cardápio digital temporariamente.`
              : 'Nenhum cardápio digital foi encontrado neste endereço.'}
          </p>
        </div>
      </div>
    );
  }

  const whatsappStoreUrl = store.phoneWhatsapp
    ? buildWhatsappUrl(
        store.phoneWhatsapp,
        `Olá ${store.storeName}! Estou no cardápio digital.`,
      )
    : null;

  const isClosed = !store.isOpen;

  const cartPanelContent = (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-[#232834] pb-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-[#F5B731]" />
          <h2 className="text-sm font-bold text-[#F3F4F6]">
            {checkoutStep === 'cart'
              ? 'Sua Sacola'
              : checkoutStep === 'details'
                ? 'Entrega e Pagamento'
                : 'Revisar e Confirmar Pedido'}
          </h2>
        </div>
        {cartSummary.totalItemsCount > 0 && (
          <span className="text-xs font-mono tabular-nums text-[#9CA3AF]">
            {cartSummary.totalItemsCount}{' '}
            {cartSummary.totalItemsCount === 1 ? 'item' : 'itens'}
          </span>
        )}
      </div>

      {isClosed && (
        <div className="p-3 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs text-[#FCA5A5]">
          A lanchonete está fechada no momento. Você pode consultar o cardápio, mas o envio de pedidos está temporariamente indisponível.
        </div>
      )}

      {cartSummary.missingItems.length > 0 && (
        <div className="p-3 rounded-xl bg-[#F5B731]/10 border border-[#F5B731]/30 text-xs text-[#FCD34D]">
          Alguns itens selecionados ficaram indisponíveis e foram removidos do cálculo.
        </div>
      )}

      {checkoutError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs text-[#FCA5A5]"
        >
          {checkoutError}
        </div>
      )}

      {cartSummary.lines.length === 0 ? (
        <div className="py-8 text-center space-y-2">
          <ShoppingBag className="w-7 h-7 text-[#6B7280] mx-auto" />
          <p className="text-sm font-medium text-[#D1D5DB]">
            Sua sacola está vazia
          </p>
          <p className="text-xs text-[#9CA3AF]">
            Escolha combos ou produtos do cardápio para começar seu pedido.
          </p>
        </div>
      ) : checkoutStep === 'cart' ? (
        <>
          <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
            {cartSummary.lines.map((line) => (
              <div
                key={`${line.kind}-${line.id}`}
                className="p-3 rounded-xl bg-[#0B0D11] border border-[#232834] space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#F3F4F6] truncate">
                      {line.name}
                    </p>
                    <p className="text-[11px] text-[#9CA3AF] font-mono tabular-nums">
                      {formatCurrencyBRL(line.unitPrice)} cada · Total{' '}
                      <span className="text-[#F5B731] font-semibold">
                        {formatCurrencyBRL(line.lineTotal)}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateItemQuantity(line.kind, line.id, -1)}
                      aria-label={`Remover 1 ${line.name}`}
                      className="w-8 h-8 rounded-lg bg-[#181C24] border border-[#232834] flex items-center justify-center text-[#F3F4F6] hover:border-[#F5B731]/50 cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-6 text-center text-xs font-mono font-bold tabular-nums text-[#F3F4F6]">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateItemQuantity(line.kind, line.id, 1)}
                      aria-label={`Adicionar 1 ${line.name}`}
                      className="w-8 h-8 rounded-lg bg-[#181C24] border border-[#232834] flex items-center justify-center text-[#F3F4F6] hover:border-[#F5B731]/50 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(line.kind, line.id)}
                      aria-label={`Excluir ${line.name} do carrinho`}
                      className="w-8 h-8 rounded-lg text-[#9CA3AF] hover:text-[#F87171] flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  maxLength={200}
                  value={line.note}
                  onChange={(e) =>
                    updateItemNote(line.kind, line.id, e.target.value)
                  }
                  placeholder="Observação do item (ex: sem cebola, bem passado)"
                  aria-label={`Observação para ${line.name}`}
                  className="w-full min-h-[34px] px-2.5 rounded-lg bg-[#12151C] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-xs text-[#F3F4F6] placeholder:text-[#6B7280]"
                />
              </div>
            ))}
          </div>

          {/* Fulfillment selector */}
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-[#D1D5DB]">
              Como deseja receber?
            </span>
            <div className="grid grid-cols-2 gap-2">
              {store.acceptsDelivery && (
                <button
                  type="button"
                  onClick={() => setFulfillmentType('delivery')}
                  className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                    fulfillmentType === 'delivery'
                      ? 'bg-[#F5B731] border-[#F5B731] text-[#0B0D11]'
                      : 'bg-[#0B0D11] border-[#232834] text-[#D1D5DB]'
                  }`}
                >
                  Entrega ({store.deliveryFee <= 0 ? 'Grátis' : formatCurrencyBRL(store.deliveryFee)})
                </button>
              )}
              {store.acceptsPickup && (
                <button
                  type="button"
                  onClick={() => setFulfillmentType('pickup')}
                  className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                    fulfillmentType === 'pickup'
                      ? 'bg-[#F5B731] border-[#F5B731] text-[#0B0D11]'
                      : 'bg-[#0B0D11] border-[#232834] text-[#D1D5DB]'
                  }`}
                >
                  Retirada no balcão
                </button>
              )}
            </div>
          </div>

          {/* Totals */}
          <div className="p-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] space-y-1.5 text-xs">
            <div className="flex justify-between text-[#9CA3AF]">
              <span>Subtotal dos itens</span>
              <span className="font-mono tabular-nums text-[#F3F4F6]">
                {formatCurrencyBRL(cartSummary.subtotal)}
              </span>
            </div>
            <div className="flex justify-between text-[#9CA3AF]">
              <span>
                {fulfillmentType === 'delivery' ? 'Taxa de entrega' : 'Retirada'}
              </span>
              <span className="font-mono tabular-nums text-[#F3F4F6]">
                {fulfillmentType === 'pickup' || cartSummary.deliveryFee <= 0
                  ? 'Grátis'
                  : formatCurrencyBRL(cartSummary.deliveryFee)}
              </span>
            </div>
            <div className="flex justify-between text-sm font-bold text-[#F3F4F6] pt-1.5 border-t border-[#232834]">
              <span>Total</span>
              <span className="text-[#F5B731] font-mono tabular-nums">
                {formatCurrencyBRL(cartSummary.totalAmount)}
              </span>
            </div>
          </div>

          {cartSummary.belowMinimum && (
            <p className="text-xs text-[#F5B731] font-mono tabular-nums">
              Faltam {formatCurrencyBRL(cartSummary.missingForMinimum)} para atingir o pedido mínimo de{' '}
              {formatCurrencyBRL(cartSummary.minimumOrderAmount)}.
            </p>
          )}

          <button
            type="button"
            disabled={isClosed || cartSummary.belowMinimum}
            onClick={() => {
              setCheckoutError(null);
              setCheckoutStep('details');
            }}
            className="w-full min-h-[46px] px-4 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-sm font-bold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isClosed
              ? 'Loja fechada no momento'
              : 'Continuar para entrega e pagamento'}
          </button>
        </>
      ) : checkoutStep === 'details' ? (
        <form onSubmit={handleAdvanceToReview} className="space-y-3">
          <button
            type="button"
            onClick={() => {
              setCheckoutError(null);
              setCheckoutStep('cart');
            }}
            className="text-xs text-[#F5B731] hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar para sacola
          </button>

          <div>
            <label
              htmlFor="ck-name"
              className="block text-xs font-medium text-[#D1D5DB] mb-1"
            >
              Seu nome *
            </label>
            <input
              id="ck-name"
              type="text"
              required
              maxLength={80}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Ex: João Silva"
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
            />
          </div>

          <div>
            <label
              htmlFor="ck-phone"
              className="block text-xs font-medium text-[#D1D5DB] mb-1"
            >
              WhatsApp / Telefone *
            </label>
            <input
              id="ck-phone"
              type="tel"
              required
              maxLength={24}
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              className="w-full min-h-[44px] px-3 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6] font-mono"
            />
          </div>

          {fulfillmentType === 'delivery' && (
            <>
              <div>
                <label
                  htmlFor="ck-address"
                  className="block text-xs font-medium text-[#D1D5DB] mb-1"
                >
                  Endereço completo para entrega *
                </label>
                <input
                  id="ck-address"
                  type="text"
                  required
                  maxLength={200}
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Rua, número, bairro"
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
                />
              </div>

              <div>
                <label
                  htmlFor="ck-reference"
                  className="block text-xs font-medium text-[#D1D5DB] mb-1"
                >
                  Complemento / ponto de referência (opcional)
                </label>
                <input
                  id="ck-reference"
                  type="text"
                  maxLength={140}
                  value={deliveryReference}
                  onChange={(e) => setDeliveryReference(e.target.value)}
                  placeholder="Apto, casa dos fundos, próximo a..."
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
                />
              </div>
            </>
          )}

          <div>
            <span className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
              Forma de pagamento *
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(['Pix', 'Dinheiro', 'Cartão'] as const).map((pm) => (
                <button
                  key={pm}
                  type="button"
                  onClick={() => setPaymentMethod(pm)}
                  className={`min-h-[42px] px-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                    paymentMethod === pm
                      ? 'bg-[#F5B731] border-[#F5B731] text-[#0B0D11]'
                      : 'bg-[#0B0D11] border-[#232834] text-[#D1D5DB]'
                  }`}
                >
                  {pm}
                </button>
              ))}
            </div>
          </div>

          {paymentMethod === 'Dinheiro' && (
            <div>
              <label
                htmlFor="ck-change"
                className="block text-xs font-medium text-[#D1D5DB] mb-1"
              >
                Troco para quanto? (deixe vazio se não precisar)
              </label>
              <input
                id="ck-change"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={changeForInput}
                onChange={(e) => setChangeForInput(e.target.value)}
                placeholder={`Ex: ${Math.ceil(cartSummary.totalAmount / 10) * 10}`}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6] font-mono tabular-nums"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="ck-note"
              className="block text-xs font-medium text-[#D1D5DB] mb-1"
            >
              Observação geral do pedido (opcional)
            </label>
            <textarea
              id="ck-note"
              rows={2}
              maxLength={240}
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              placeholder="Algum recado extra para a cozinha ou entrega?"
              className="w-full px-3 py-2 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
            />
          </div>

          <button
            type="submit"
            disabled={isClosed}
            className="w-full min-h-[46px] px-4 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-sm font-bold cursor-pointer transition-colors disabled:opacity-50"
          >
            Revisar pedido
          </button>
        </form>
      ) : (
        /* Final Confirmation Step */
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => {
              setCheckoutError(null);
              setCheckoutStep('details');
            }}
            className="text-xs text-[#F5B731] hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Alterar dados
          </button>

          <div className="p-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] space-y-2.5 text-xs">
            <div>
              <p className="text-[#9CA3AF]">Cliente</p>
              <p className="font-semibold text-[#F3F4F6]">
                {customerName.trim()} · {customerPhone.trim()}
              </p>
            </div>

            <div>
              <p className="text-[#9CA3AF]">Recebimento</p>
              <p className="font-semibold text-[#F3F4F6]">
                {fulfillmentType === 'delivery'
                  ? `Entrega: ${deliveryAddress.trim()}${
                      deliveryReference.trim()
                        ? ` (${deliveryReference.trim()})`
                        : ''
                    }`
                  : `Retirada no balcão${store.address ? ` · ${store.address}` : ''}`}
              </p>
            </div>

            <div>
              <p className="text-[#9CA3AF]">Pagamento</p>
              <p className="font-semibold text-[#F3F4F6]">
                {paymentMethod}
                {paymentMethod === 'Dinheiro' && parsedChangeForValue()
                  ? ` · Troco para ${formatCurrencyBRL(parsedChangeForValue()!)}`
                  : ''}
              </p>
            </div>

            <div className="border-t border-[#232834] pt-2 space-y-1">
              <p className="text-[#9CA3AF] font-medium">Itens:</p>
              {cartSummary.lines.map((line) => (
                <div
                  key={`${line.kind}-${line.id}`}
                  className="flex justify-between gap-2 text-[#F3F4F6]"
                >
                  <span className="truncate">
                    {line.quantity}x {line.name}
                    {line.note ? ` (${line.note})` : ''}
                  </span>
                  <span className="font-mono tabular-nums shrink-0">
                    {formatCurrencyBRL(line.lineTotal)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-[#232834] pt-2 space-y-1">
              <div className="flex justify-between text-[#9CA3AF]">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">
                  {formatCurrencyBRL(cartSummary.subtotal)}
                </span>
              </div>
              <div className="flex justify-between text-[#9CA3AF]">
                <span>Entrega</span>
                <span className="font-mono tabular-nums">
                  {cartSummary.deliveryFee <= 0
                    ? 'Grátis'
                    : formatCurrencyBRL(cartSummary.deliveryFee)}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold text-[#F5B731] pt-1">
                <span>Total a pagar</span>
                <span className="font-mono tabular-nums">
                  {formatCurrencyBRL(cartSummary.totalAmount)}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={submitting || isClosed}
            onClick={() => void handleConfirmOrder()}
            className="w-full min-h-[48px] px-4 rounded-xl bg-[#22C55E] hover:bg-[#16A34A] text-[#0B0D11] text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            {submitting ? 'Enviando pedido...' : 'Confirmar Pedido'}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0B0D11] text-[#F3F4F6] pb-24 lg:pb-12">
      {/* Storefront Header */}
      <header className="bg-[#12151C] border-b border-[#232834]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#F5B731]/15 border border-[#F5B731]/30 text-[#F5B731] font-display font-bold text-sm">
                  M
                </span>
                <h1 className="text-xl sm:text-2xl font-bold text-[#F3F4F6]">
                  {store.storeName}
                </h1>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                    isClosed ? 'text-[#F87171]' : 'text-[#22C55E]'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isClosed ? 'bg-[#EF4444]' : 'bg-[#22C55E]'
                    }`}
                  />
                  {isClosed ? 'Fechado no momento' : 'Aberto para pedidos'}
                </span>
              </div>

              {store.description && (
                <p className="text-xs sm:text-sm text-[#9CA3AF]">
                  {store.description}
                </p>
              )}
            </div>

            {whatsappStoreUrl && (
              <a
                href={whatsappStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] px-4 rounded-xl border border-[#232834] hover:border-[#22C55E]/50 bg-[#0B0D11] text-xs font-semibold text-[#F3F4F6] inline-flex items-center gap-2 self-start sm:self-center shrink-0"
              >
                <MessageCircle className="w-4 h-4 text-[#22C55E]" />
                Falar no WhatsApp
              </a>
            )}
          </div>

          {/* Unboxed Metadata Bar */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#9CA3AF] pt-1 border-t border-[#232834]">
            {store.openingHours && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#F5B731]" />
                {store.openingHours}
              </span>
            )}
            {store.address && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#F5B731]" />
                {store.address}
              </span>
            )}
            {store.phoneWhatsapp && (
              <span className="inline-flex items-center gap-1.5 font-mono">
                <Phone className="w-3.5 h-3.5 text-[#F5B731]" />
                {store.phoneWhatsapp}
              </span>
            )}
            <span className="font-mono tabular-nums">
              {store.acceptsDelivery
                ? store.deliveryFee <= 0
                  ? 'Entrega grátis'
                  : `Entrega ${formatCurrencyBRL(store.deliveryFee)}`
                : 'Somente retirada'}
              {store.minimumOrderAmount > 0
                ? ` · Mínimo ${formatCurrencyBRL(store.minimumOrderAmount)}`
                : ''}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Catalog Column */}
        <div className="lg:col-span-7 space-y-5">
          {/* Search & Category Tabs */}
          <div className="bg-[#12151C] border border-[#232834] rounded-2xl p-4 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Buscar no cardápio"
                placeholder="Buscar combos, lanches ou bebidas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6] placeholder:text-[#6B7280]"
              />
            </div>

            <div
              role="tablist"
              aria-label="Filtrar categoria do cardápio"
              className="flex flex-wrap gap-1.5"
            >
              {(
                [
                  { id: 'all', label: 'Todos' },
                  { id: 'combos', label: 'Combos' },
                  { id: 'Lanche', label: 'Lanches' },
                  { id: 'Bebida', label: 'Bebidas' },
                  { id: 'Adicional', label: 'Adicionais' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={categoryFilter === tab.id}
                  onClick={() => setCategoryFilter(tab.id)}
                  className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    categoryFilter === tab.id
                      ? 'bg-[#F5B731] text-[#0B0D11]'
                      : 'bg-[#0B0D11] border border-[#232834] text-[#D1D5DB] hover:border-[#374151]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredCombos.length === 0 && filteredProducts.length === 0 && (
            <div className="bg-[#12151C] border border-[#232834] rounded-2xl p-8 text-center space-y-2">
              <p className="text-sm font-semibold text-[#F3F4F6]">
                Nenhum item encontrado neste filtro
              </p>
              <p className="text-xs text-[#9CA3AF]">
                Tente buscar outro nome ou selecione a aba "Todos".
              </p>
            </div>
          )}

          {/* Combos */}
          {filteredCombos.length > 0 && (
            <section aria-labelledby="public-combos-heading" className="space-y-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#F5B731]" />
                <h2
                  id="public-combos-heading"
                  className="text-sm font-bold text-[#F3F4F6]"
                >
                  Combos Especiais
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {filteredCombos.map((combo) => {
                  const qty = getItemQuantity('combo', combo.id);
                  const itemsSummary = combo.items
                    .map((i) => `${i.quantity}x ${i.productName}`)
                    .join(' + ');

                  return (
                    <article
                      key={combo.id}
                      className="bg-[#12151C] border border-[#232834] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <h3 className="text-sm sm:text-base font-bold text-[#F3F4F6]">
                          {combo.name}
                        </h3>
                        {combo.description && (
                          <p className="text-xs text-[#9CA3AF]">
                            {combo.description}
                          </p>
                        )}
                        {itemsSummary && (
                          <p className="text-xs text-[#D1D5DB]">
                            Inclui: {itemsSummary}
                          </p>
                        )}
                        <p className="text-base font-bold text-[#F5B731] font-mono tabular-nums pt-0.5">
                          {formatCurrencyBRL(combo.salePrice)}
                        </p>
                      </div>

                      <div className="shrink-0 self-end sm:self-center">
                        {qty === 0 ? (
                          <button
                            type="button"
                            onClick={() => updateItemQuantity('combo', combo.id, 1)}
                            className="min-h-[44px] px-4 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            Adicionar
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-2 bg-[#0B0D11] border border-[#F5B731]/50 rounded-xl p-1">
                            <button
                              type="button"
                              onClick={() =>
                                updateItemQuantity('combo', combo.id, -1)
                              }
                              aria-label={`Diminuir ${combo.name}`}
                              className="w-9 h-9 rounded-lg bg-[#181C24] flex items-center justify-center text-[#F3F4F6] cursor-pointer"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-6 text-center text-sm font-mono font-bold tabular-nums text-[#F5B731]">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateItemQuantity('combo', combo.id, 1)
                              }
                              aria-label={`Aumentar ${combo.name}`}
                              className="w-9 h-9 rounded-lg bg-[#F5B731] flex items-center justify-center text-[#0B0D11] cursor-pointer"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {/* Products */}
          {filteredProducts.length > 0 && (
            <section aria-labelledby="public-products-heading" className="space-y-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-[#F5B731]" />
                <h2
                  id="public-products-heading"
                  className="text-sm font-bold text-[#F3F4F6]"
                >
                  Produtos Individuais
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredProducts.map((product) => {
                  const qty = getItemQuantity('product', product.id);
                  return (
                    <article
                      key={product.id}
                      className="bg-[#12151C] border border-[#232834] rounded-2xl p-4 flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-wider text-[#9CA3AF]">
                          {product.category}
                        </p>
                        <h3 className="text-sm font-bold text-[#F3F4F6]">
                          {product.name}
                        </h3>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-base font-bold text-[#F5B731] font-mono tabular-nums">
                          {formatCurrencyBRL(product.unitPrice)}
                        </span>

                        {qty === 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateItemQuantity('product', product.id, 1)
                            }
                            className="min-h-[42px] px-3.5 rounded-xl bg-[#181C24] border border-[#232834] hover:border-[#F5B731] text-xs font-bold text-[#F3F4F6] inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#F5B731]" />
                            Adicionar
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 bg-[#0B0D11] border border-[#F5B731]/50 rounded-xl p-1">
                            <button
                              type="button"
                              onClick={() =>
                                updateItemQuantity('product', product.id, -1)
                              }
                              aria-label={`Diminuir ${product.name}`}
                              className="w-8 h-8 rounded-lg bg-[#181C24] flex items-center justify-center text-[#F3F4F6] cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-5 text-center text-xs font-mono font-bold tabular-nums text-[#F5B731]">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                updateItemQuantity('product', product.id, 1)
                              }
                              aria-label={`Aumentar ${product.name}`}
                              className="w-8 h-8 rounded-lg bg-[#F5B731] flex items-center justify-center text-[#0B0D11] cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Unified Responsive Cart & Checkout (Desktop Sticky Sidebar + Mobile Drawer Sheet) */}
        <aside
          aria-label="Sacola e finalização do pedido"
          className={
            mobileCartOpen
              ? 'fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 lg:static lg:inset-auto lg:z-auto lg:bg-transparent lg:backdrop-blur-none lg:block lg:col-span-5'
              : 'hidden lg:block lg:col-span-5 sticky top-4'
          }
        >
          <div
            className={
              mobileCartOpen
                ? 'w-full max-w-lg max-h-[92vh] overflow-y-auto bg-[#12151C] border-t sm:border border-[#232834] rounded-t-2xl sm:rounded-2xl p-5 space-y-4 lg:max-w-none lg:max-h-none lg:overflow-visible lg:border lg:rounded-2xl'
                : 'bg-[#12151C] border border-[#232834] rounded-2xl p-5'
            }
          >
            {mobileCartOpen && (
              <div className="flex items-center justify-between lg:hidden">
                <span className="text-xs font-semibold text-[#9CA3AF]">
                  {store.storeName}
                </span>
                <button
                  type="button"
                  onClick={() => setMobileCartOpen(false)}
                  aria-label="Fechar sacola"
                  className="w-9 h-9 rounded-lg border border-[#232834] flex items-center justify-center text-[#9CA3AF] hover:text-[#F3F4F6] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {cartPanelContent}
          </div>
        </aside>
      </main>

      {/* Mobile Bottom Sacola Bar */}
      {cartSummary.totalItemsCount > 0 && !mobileCartOpen && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 p-3 bg-[#0B0D11]/95 backdrop-blur-md border-t border-[#232834]">
          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            className="w-full min-h-[48px] px-4 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-sm font-bold flex items-center justify-between cursor-pointer"
          >
            <span className="inline-flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              Ver sacola ({cartSummary.totalItemsCount})
            </span>
            <span className="font-mono tabular-nums">
              {formatCurrencyBRL(cartSummary.totalAmount)}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
