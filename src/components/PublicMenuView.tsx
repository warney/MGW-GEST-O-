import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  CupSoda,
  Layers,
  MapPin,
  MessageCircle,
  Minus,
  Package,
  Phone,
  Plus,
  PlusCircle,
  QrCode,
  RefreshCw,
  Search,
  Share2,
  ShoppingBag,
  ShoppingCart,
  Store,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import {
  createPublicOnlineOrder,
  fetchPublicDigitalMenu,
} from '../services/dataService';
import type {
  OnlineOrderCartItem,
  OnlineOrderFulfillment,
  OnlineOrderPaymentMethod,
  ProductCategory,
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
import {
  buildCartStorageKey,
  computeCashChangeAmount,
  computeMenuCategoryCounts,
  CUSTOMER_PROFILE_STORAGE_KEY,
  formatComboComposition,
  getStoreMonogram,
  parseStoredCart,
  parseStoredCustomerProfile,
  serializeStoredCart,
  serializeStoredCustomerProfile,
  shouldShowComboComposition,
} from '../utils/menuPresentation';

interface PublicMenuViewProps {
  slug?: string;
  onOrderCreated: (trackingToken: string) => void;
}

type MenuCategoryFilter = 'all' | 'combos' | string;

type CheckoutStep = 'cart' | 'details' | 'review';

type InspectItemState =
  | { kind: 'combo'; combo: PublicCatalogCombo }
  | { kind: 'product'; product: PublicCatalogProduct }
  | null;

function CategoryGlyph({
  category,
  className = 'w-6 h-6 text-[#F5B731]',
}: {
  category: ProductCategory | 'combo';
  className?: string;
}) {
  if (category === 'combo') return <Layers className={className} />;
  if (category === 'Bebida') return <CupSoda className={className} />;
  if (category === 'Adicional') return <PlusCircle className={className} />;
  if (category === 'Outro') return <Package className={className} />;
  return <UtensilsCrossed className={className} />;
}

export function PublicMenuView({ slug, onOrderCreated }: PublicMenuViewProps) {
  const initialStoredProfile = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      return parseStoredCustomerProfile(
        window.localStorage.getItem(CUSTOMER_PROFILE_STORAGE_KEY),
      );
    } catch {
      return null;
    }
  }, []);

  const [payload, setPayload] = useState<PublicDigitalMenuPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] =
    useState<MenuCategoryFilter>('all');

  const [cart, setCart] = useState<OnlineOrderCartItem[]>([]);
  const restoredCartSlugRef = useRef<string | null>(null);

  const [fulfillmentType, setFulfillmentType] =
    useState<OnlineOrderFulfillment>(
      initialStoredProfile?.fulfillmentType ?? 'delivery',
    );
  const [customerName, setCustomerName] = useState(
    initialStoredProfile?.customerName ?? '',
  );
  const [customerPhone, setCustomerPhone] = useState(
    initialStoredProfile?.customerPhone ?? '',
  );
  const [deliveryAddress, setDeliveryAddress] = useState(
    initialStoredProfile?.deliveryAddress ?? '',
  );
  const [deliveryReference, setDeliveryReference] = useState(
    initialStoredProfile?.deliveryReference ?? '',
  );
  const [paymentMethod, setPaymentMethod] =
    useState<OnlineOrderPaymentMethod>(
      initialStoredProfile?.paymentMethod ?? 'Pix',
    );
  const [changeForInput, setChangeForInput] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [hasSavedProfile, setHasSavedProfile] = useState(
    Boolean(
      initialStoredProfile?.customerName ||
        initialStoredProfile?.customerPhone ||
        initialStoredProfile?.deliveryAddress,
    ),
  );

  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>('cart');
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const [inspectItem, setInspectItem] = useState<InspectItemState>(null);
  const [modalQty, setModalQty] = useState(1);
  const [modalNote, setModalNote] = useState('');
  const [modalAddonSelections, setModalAddonSelections] = useState<Record<string, string[]>>({});
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  function markImageBroken(url?: string) {
    if (!url) return;
    setBrokenImages((prev) => (prev[url] ? prev : { ...prev, [url]: true }));
  }

  function hasUsableImage(url?: string): url is string {
    return Boolean(url && !brokenImages[url]);
  }

  async function loadMenu() {
    setLoading(true);
    setLoadError(null);
    restoredCartSlugRef.current = null;
    try {
      const res = await fetchPublicDigitalMenu(slug);
      setPayload(res);
      if (res.store) {
        // A instalação pública abre o último cardápio visitado, sem expor o painel de gestão.
        try {
          window.localStorage.setItem('mgw_public_menu_last_slug', res.store.slug);
        } catch {
          // O cardápio continua funcionando mesmo com storage bloqueado.
        }
        if (!res.store.acceptsDelivery && res.store.acceptsPickup) {
          setFulfillmentType('pickup');
        } else if (res.store.acceptsDelivery && !res.store.acceptsPickup) {
          setFulfillmentType('delivery');
        }

        const validProductIds = new Set(res.products.map((p) => p.id));
        const validComboIds = new Set(res.combos.map((c) => c.id));
        const cartKey = buildCartStorageKey(res.store.slug);
        try {
          const savedCart = parseStoredCart(window.localStorage.getItem(cartKey));
          const reconciledCart = savedCart.filter((entry) =>
            entry.kind === 'combo'
              ? validComboIds.has(entry.id)
              : validProductIds.has(entry.id),
          );
          if (reconciledCart.length > 0) {
            setCart(reconciledCart);
          }
        } catch {
          // Ignora bloqueio de storage
        }
        restoredCartSlugRef.current = res.store.slug;
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

  useEffect(() => {
    if (!store) return;
    const prevTitle = document.title;
    document.title = `${store.storeName} — Cardápio Digital`;
    return () => {
      document.title = prevTitle;
    };
  }, [store]);

  useEffect(() => {
    if (!store || restoredCartSlugRef.current !== store.slug) return;
    try {
      const cartKey = buildCartStorageKey(store.slug);
      if (cart.length === 0) {
        window.localStorage.removeItem(cartKey);
      } else {
        window.localStorage.setItem(cartKey, serializeStoredCart(cart));
      }
    } catch {
      // Ignora erro de storage
    }
  }, [cart, store]);

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

  const categoryCounts = useMemo(
    () => computeMenuCategoryCounts(products, combos.length),
    [products, combos.length],
  );

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

  function addItemFromDetailModal(
    kind: 'product' | 'combo',
    id: string,
    quantityToAdd: number,
    note: string,
    selectedAddons: Array<{ groupId: string; optionIds: string[] }> = [],
  ) {
    setCheckoutError(null);
    const cleanNote = note.trim().slice(0, 200);
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.kind === kind && i.id === id);
      if (idx === -1) {
        return [
          ...prev,
          { kind, id, quantity: Math.min(99, Math.max(1, quantityToAdd)), note: cleanNote, selectedAddons },
        ];
      }
      const nextQty = Math.min(99, prev[idx].quantity + quantityToAdd);
      return prev.map((entry, i) =>
        i === idx
          ? { ...entry, quantity: nextQty, note: cleanNote || entry.note, selectedAddons }
          : entry,
      );
    });
    setInspectItem(null);
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

  function openItemInspector(item: InspectItemState) {
    if (!item) return;
    const id = item.kind === 'combo' ? item.combo.id : item.product.id;
    const existing = cart.find((c) => c.kind === item.kind && c.id === id);
    setModalQty(1);
    setModalNote(existing?.note ?? '');
    setModalAddonSelections(Object.fromEntries((existing?.selectedAddons || []).map((s) => [s.groupId, s.optionIds])));
    setInspectItem(item);
  }

  async function handleShareStore() {
    if (!store || typeof window === 'undefined') return;
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${store.storeName} — Cardápio Digital`,
          text: store.description || `Peça online em ${store.storeName}`,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback para copiar link se usuário cancelar ou não suportar
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2400);
    } catch {
      // Ignora erro de clipboard bloqueado
    }
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

  function persistCustomerProfile() {
    try {
      window.localStorage.setItem(
        CUSTOMER_PROFILE_STORAGE_KEY,
        serializeStoredCustomerProfile({
          customerName,
          customerPhone,
          fulfillmentType,
          deliveryAddress,
          deliveryReference,
          paymentMethod,
        }),
      );
      setHasSavedProfile(true);
    } catch {
      // Ignora erro de storage
    }
  }

  function clearSavedCustomerProfile() {
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryAddress('');
    setDeliveryReference('');
    setHasSavedProfile(false);
    try {
      window.localStorage.removeItem(CUSTOMER_PROFILE_STORAGE_KEY);
    } catch {
      // Ignora erro de storage
    }
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

    persistCustomerProfile();
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
      items: cart.map((item) => ({
        kind: item.kind,
        id: item.id,
        quantity: item.quantity,
        note: item.note || '',
        selectedAddons: item.kind === 'product' ? (item.selectedAddons || []) : [],
      })),
    };

    const validation = validateCheckoutPayload(payloadToSend, cartSummary, store);
    if (!validation.valid) {
      setCheckoutError(validation.error ?? 'Revise os dados do pedido.');
      return;
    }

    persistCustomerProfile();
    setCheckoutError(null);
    setSubmitting(true);
    try {
      const response = await createPublicOnlineOrder(payloadToSend);
      try {
        window.localStorage.removeItem(buildCartStorageKey(store.slug));
      } catch {
        // Ignora erro de storage
      }
      setCart([]);
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
      <div className="min-h-screen bg-[#0B0D11] text-[#F3F4F6] p-4 sm:p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="h-44 rounded-2xl bg-[#12151C] border border-[#232834] animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-4">
              <div className="h-24 rounded-2xl bg-[#12151C] border border-[#232834] animate-pulse" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-32 rounded-2xl bg-[#12151C] border border-[#232834] animate-pulse"
                  />
                ))}
              </div>
            </div>
            <div className="hidden lg:block lg:col-span-5 h-72 rounded-2xl bg-[#12151C] border border-[#232834] animate-pulse" />
          </div>
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
            className="min-h-[44px] px-5 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-sm font-bold inline-flex items-center gap-2 cursor-pointer transition-colors"
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
  const parsedChangeFor = parsedChangeForValue();
  const cashChangeReturn = computeCashChangeAmount(
    parsedChangeFor,
    cartSummary.totalAmount,
  );
  const minimumProgressPct =
    cartSummary.minimumOrderAmount > 0
      ? Math.min(
          100,
          Math.round((cartSummary.subtotal / cartSummary.minimumOrderAmount) * 100),
        )
      : 100;

  const categoryTabs: Array<{ id: MenuCategoryFilter; label: string; count: number }> = [
    { id: 'all', label: 'Todos', count: categoryCounts.all },
    { id: 'combos', label: 'Combos', count: categoryCounts.combos },
    ...Array.from(new Set(products.map((p) => p.category))).sort((a, b) => a.localeCompare(b, 'pt-BR')).map((category) => ({
      id: category,
      label: category,
      count: products.filter((p) => p.category === category).length,
    })),
  ];

  const cartPanelContent = (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-[#232834] pb-3">
        <div className="space-y-0.5">
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
          <div className="flex items-center gap-1.5 text-[11px] text-[#9CA3AF]">
            <span className={checkoutStep === 'cart' ? 'text-[#F5B731] font-semibold' : ''}>
              1. Sacola
            </span>
            <span aria-hidden="true">·</span>
            <span className={checkoutStep === 'details' ? 'text-[#F5B731] font-semibold' : ''}>
              2. Dados
            </span>
            <span aria-hidden="true">·</span>
            <span className={checkoutStep === 'review' ? 'text-[#F5B731] font-semibold' : ''}>
              3. Confirmar
            </span>
          </div>
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
        <div className="py-8 text-center space-y-2.5">
          <div className="w-12 h-12 rounded-2xl bg-[#181C24] border border-[#232834] flex items-center justify-center mx-auto">
            <ShoppingBag className="w-5 h-5 text-[#F5B731]" />
          </div>
          <p className="text-sm font-semibold text-[#F3F4F6]">
            Sua sacola está vazia
          </p>
          <p className="text-xs text-[#9CA3AF] max-w-[240px] mx-auto">
            Escolha combos ou lanches do cardápio para montar seu pedido em segundos.
          </p>
        </div>
      ) : checkoutStep === 'cart' ? (
        <>
          <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
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
                    {line.selectedAddons.map((group) => (
                      <p key={group.groupId} className="text-[11px] text-[#D1D5DB] mt-1">
                        <span className="text-[#F5B731]">{group.groupName}:</span>{' '}
                        {group.options.map((option) => option.name).join(', ')}
                      </p>
                    ))}
                    <p className="text-[11px] text-[#9CA3AF] font-mono tabular-nums mt-0.5">
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
                      className="w-8 h-8 rounded-lg bg-[#181C24] border border-[#232834] flex items-center justify-center text-[#F3F4F6] hover:border-[#F5B731]/50 cursor-pointer transition-colors"
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
                      className="w-8 h-8 rounded-lg bg-[#181C24] border border-[#232834] flex items-center justify-center text-[#F3F4F6] hover:border-[#F5B731]/50 cursor-pointer transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(line.kind, line.id)}
                      aria-label={`Excluir ${line.name} do carrinho`}
                      className="w-8 h-8 rounded-lg text-[#9CA3AF] hover:text-[#F87171] flex items-center justify-center cursor-pointer transition-colors"
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
                  className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                    fulfillmentType === 'delivery'
                      ? 'bg-[#F5B731] border-[#F5B731] text-[#0B0D11]'
                      : 'bg-[#0B0D11] border-[#232834] text-[#D1D5DB] hover:border-[#374151]'
                  }`}
                >
                  Entrega ({store.deliveryFee <= 0 ? 'Grátis' : formatCurrencyBRL(store.deliveryFee)})
                </button>
              )}
              {store.acceptsPickup && (
                <button
                  type="button"
                  onClick={() => setFulfillmentType('pickup')}
                  className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                    fulfillmentType === 'pickup'
                      ? 'bg-[#F5B731] border-[#F5B731] text-[#0B0D11]'
                      : 'bg-[#0B0D11] border-[#232834] text-[#D1D5DB] hover:border-[#374151]'
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
            <div className="p-3 rounded-xl bg-[#F5B731]/10 border border-[#F5B731]/30 space-y-1.5">
              <p className="text-xs text-[#F5B731] font-mono tabular-nums">
                Faltam {formatCurrencyBRL(cartSummary.missingForMinimum)} para atingir o pedido mínimo de{' '}
                {formatCurrencyBRL(cartSummary.minimumOrderAmount)}.
              </p>
              <div className="h-1.5 rounded-full bg-[#0B0D11] overflow-hidden">
                <div
                  className="h-full bg-[#F5B731] rounded-full transition-all duration-200"
                  style={{ width: `${minimumProgressPct}%` }}
                />
              </div>
            </div>
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
          <div className="flex items-center justify-between gap-2">
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

            {hasSavedProfile && (
              <button
                type="button"
                onClick={clearSavedCustomerProfile}
                className="text-[11px] text-[#9CA3AF] hover:text-[#F3F4F6] underline cursor-pointer"
              >
                Limpar dados salvos
              </button>
            )}
          </div>

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
              {([
                { id: 'Pix', icon: QrCode },
                { id: 'Dinheiro', icon: Banknote },
                { id: 'Cartão', icon: CreditCard },
              ] as const).map(({ id: pm, icon: PayIcon }) => (
                <button
                  key={pm}
                  type="button"
                  onClick={() => setPaymentMethod(pm)}
                  className={`min-h-[44px] px-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    paymentMethod === pm
                      ? 'bg-[#F5B731] border-[#F5B731] text-[#0B0D11]'
                      : 'bg-[#0B0D11] border-[#232834] text-[#D1D5DB] hover:border-[#374151]'
                  }`}
                >
                  <PayIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>{pm}</span>
                </button>
              ))}
            </div>
            {paymentMethod === 'Pix' && store.pixKey.trim().length > 0 && (
              <p className="text-[11px] text-[#9CA3AF] mt-1.5">
                Após enviar o pedido, você poderá copiar a chave Pix ou pagar na entrega/retirada.
              </p>
            )}
          </div>

          {paymentMethod === 'Dinheiro' && (
            <div className="space-y-1">
              <label
                htmlFor="ck-change"
                className="block text-xs font-medium text-[#D1D5DB]"
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
              {cashChangeReturn !== null && (
                <p className="text-[11px] text-[#22C55E] font-mono tabular-nums">
                  Troco a levar: {formatCurrencyBRL(cashChangeReturn)}
                </p>
              )}
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
                {paymentMethod === 'Dinheiro' && parsedChangeFor
                  ? ` · Troco para ${formatCurrencyBRL(parsedChangeFor)}`
                  : ''}
              </p>
            </div>

            <div className="border-t border-[#232834] pt-2 space-y-1">
              <p className="text-[#9CA3AF] font-medium">Itens</p>
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
    <div className="min-h-screen bg-[#0B0D11] text-[#F3F4F6] pb-24 lg:pb-14">
      {/* Editorial Dark & Gold Storefront Hero */}
      <header className="relative overflow-hidden bg-gradient-to-b from-[#171B24] via-[#12151C] to-[#0B0D11] border-b border-[#232834]">
        {hasUsableImage(store.bannerUrl) ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <img
              src={store.bannerUrl}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => markImageBroken(store.bannerUrl)}
              className="w-full h-full object-cover opacity-45"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0B0D11]/70 via-[#0B0D11]/85 to-[#0B0D11]" />
          </div>
        ) : (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top_right,rgba(245,183,49,0.14),transparent_65%)]"
          />
        )}
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-4 sm:pt-7 sm:pb-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5 sm:gap-4 min-w-0">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden bg-gradient-to-br from-[#F5B731]/25 via-[#181C24] to-[#0B0D11] border border-[#F5B731]/35 flex items-center justify-center text-[#F5B731] font-display font-extrabold text-xl sm:text-2xl shadow-sm shrink-0">
                {hasUsableImage(store.logoUrl) ? (
                  <img
                    src={store.logoUrl}
                    alt={`Logo de ${store.storeName}`}
                    referrerPolicy="no-referrer"
                    onError={() => markImageBroken(store.logoUrl)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span aria-hidden="true">{getStoreMonogram(store.storeName)}</span>
                )}
              </div>

              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[#F3F4F6] truncate">
                    {store.storeName}
                  </h1>
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold shrink-0 ${
                      isClosed ? 'text-[#F87171]' : 'text-[#22C55E]'
                    }`}
                  >
                    {isClosed ? (
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>
                      {isClosed ? 'Fechado no momento' : 'Aberto para pedidos'}
                    </span>
                  </span>
                </div>

                {store.description && (
                  <p className="text-xs sm:text-sm text-[#9CA3AF] line-clamp-2 max-w-2xl leading-relaxed">
                    {store.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-center">
              <PWAInstallButton
                appName="MGW Cardápio Digital"
                installLabel="Instalar cardápio"
              />
              <button
                type="button"
                onClick={() => void handleShareStore()}
                aria-label="Compartilhar link do cardápio"
                className="min-h-[40px] px-3 rounded-xl border border-[#232834] hover:border-[#374151] bg-[#12151C]/90 text-xs font-semibold text-[#D1D5DB] hover:text-[#F3F4F6] inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                {shareCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#22C55E]" />
                    <span className="text-[#22C55E]">Link copiado</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5 text-[#F5B731]" />
                    <span>Compartilhar</span>
                  </>
                )}
              </button>

              {whatsappStoreUrl && (
                <a
                  href={whatsappStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Falar no WhatsApp da loja"
                  className="min-h-[40px] px-3.5 rounded-xl border border-[#22C55E]/35 hover:border-[#22C55E] bg-[#22C55E]/10 hover:bg-[#22C55E]/15 text-xs font-semibold text-[#F3F4F6] inline-flex items-center gap-1.5 shrink-0 transition-colors whitespace-nowrap"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-[#22C55E]" />
                  <span>Falar no WhatsApp</span>
                </a>
              )}
            </div>
          </div>

          {/* Unboxed Hairline Store Info Strip */}
          <div className="pt-3 border-t border-[#232834]/90 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#9CA3AF]">
            {store.openingHours && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#F5B731] shrink-0" />
                <span>{store.openingHours}</span>
              </span>
            )}
            {store.address && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#F5B731] shrink-0" />
                <span>{store.address}</span>
              </span>
            )}
            {store.phoneWhatsapp && (
              <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                <Phone className="w-3.5 h-3.5 text-[#F5B731] shrink-0" />
                <span>{store.phoneWhatsapp}</span>
              </span>
            )}
            <span className="font-mono tabular-nums text-[#D1D5DB]">
              {store.acceptsDelivery
                ? store.deliveryFee <= 0
                  ? 'Entrega grátis'
                  : `Entrega ${formatCurrencyBRL(store.deliveryFee)}`
                : 'Somente retirada'}
              {store.acceptsDelivery && store.acceptsPickup ? ' · Retirada disponível' : ''}
              {store.minimumOrderAmount > 0
                ? ` · Pedido mín. ${formatCurrencyBRL(store.minimumOrderAmount)}`
                : ''}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-7 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Catalog Column */}
        <div className="lg:col-span-7 space-y-6 min-w-0">
          {/* Search & Single-Line Category Filter Bar */}
          <div className="bg-[#12151C] border border-[#232834] rounded-2xl p-3 sm:p-4 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Buscar no cardápio"
                placeholder="Buscar combos, lanches ou bebidas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full min-h-[44px] pl-10 pr-9 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6] placeholder:text-[#6B7280]"
              />
              {searchTerm.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Limpar busca"
                  className="w-8 h-8 rounded-lg text-[#9CA3AF] hover:text-[#F3F4F6] flex items-center justify-center absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div
              role="tablist"
              aria-label="Filtrar categoria do cardápio"
              data-testid="menu-category-tabs"
              className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
            >
              {categoryTabs.map((tab) => {
                const isSelected = categoryFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-label={tab.label}
                    aria-selected={isSelected}
                    onClick={() => setCategoryFilter(tab.id)}
                    className={`min-h-[38px] px-3 sm:px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-[#F5B731] text-[#0B0D11]'
                        : 'bg-[#0B0D11] border border-[#232834] text-[#D1D5DB] hover:border-[#374151] hover:text-[#F3F4F6]'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      aria-hidden="true"
                      className={`text-[11px] font-mono tabular-nums ${
                        isSelected ? 'text-[#0B0D11]/75' : 'text-[#6B7280]'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {filteredCombos.length === 0 && filteredProducts.length === 0 && (
            <div className="bg-[#12151C] border border-[#232834] rounded-2xl p-8 text-center space-y-2.5">
              <Search className="w-6 h-6 text-[#6B7280] mx-auto" />
              <p className="text-sm font-semibold text-[#F3F4F6]">
                Nenhum item encontrado neste filtro
              </p>
              <p className="text-xs text-[#9CA3AF]">
                Tente buscar outro nome ou selecione a aba &quot;Todos&quot;.
              </p>
              {(searchTerm || categoryFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setCategoryFilter('all');
                  }}
                  className="min-h-[40px] px-4 rounded-xl border border-[#232834] hover:border-[#F5B731]/60 text-xs font-semibold text-[#F5B731] cursor-pointer transition-colors"
                >
                  Mostrar todo o cardápio
                </button>
              )}
            </div>
          )}

          {/* Featured Combos */}
          {filteredCombos.length > 0 && (
            <section aria-labelledby="public-combos-heading" className="space-y-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#F5B731]" />
                  <h2
                    id="public-combos-heading"
                    className="font-display text-base sm:text-lg font-bold text-[#F3F4F6]"
                  >
                    Combos Especiais
                  </h2>
                </div>
                <span className="text-xs font-mono tabular-nums text-[#9CA3AF]">
                  {filteredCombos.length}{' '}
                  {filteredCombos.length === 1 ? 'opção' : 'opções'}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3.5">
                {filteredCombos.map((combo) => {
                  const qty = getItemQuantity('combo', combo.id);
                  const itemsSummary = formatComboComposition(combo.items);
                  const showComposition = shouldShowComboComposition(
                    combo.description,
                    combo.items,
                  );

                  return (
                    <article
                      key={combo.id}
                      data-testid={`menu-combo-card-${combo.id}`}
                      className="group bg-[#12151C] border border-[#232834] hover:border-[#F5B731]/40 rounded-2xl p-3.5 sm:p-4 transition-colors duration-150"
                    >
                      <div className="flex items-start gap-3.5">
                        <button
                          type="button"
                          onClick={() =>
                            openItemInspector({ kind: 'combo', combo })
                          }
                          aria-label={`Ver detalhes de ${combo.name}`}
                          className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-gradient-to-br from-[#1C212E] via-[#141821] to-[#0B0D11] border border-[#262C3A] flex flex-col items-center justify-center shrink-0 cursor-pointer group-hover:border-[#F5B731]/35 transition-colors"
                        >
                          {hasUsableImage(combo.imageUrl) ? (
                            <img
                              src={combo.imageUrl}
                              alt={combo.name}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={() => markImageBroken(combo.imageUrl)}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                          ) : (
                            <>
                              <CategoryGlyph
                                category="combo"
                                className="w-6 h-6 text-[#F5B731]"
                              />
                              <span className="text-[10px] font-medium text-[#9CA3AF] mt-1">
                                Combo
                              </span>
                            </>
                          )}
                        </button>

                        <div className="flex-1 min-w-0 flex flex-col justify-between gap-2.5">
                          <div className="space-y-1 min-w-0">
                            <button
                              type="button"
                              onClick={() =>
                                openItemInspector({ kind: 'combo', combo })
                              }
                              className="text-left w-full cursor-pointer"
                            >
                              <h3 className="text-sm sm:text-base font-bold text-[#F3F4F6] group-hover:text-[#F5B731] transition-colors leading-snug">
                                {combo.name}
                              </h3>
                            </button>

                            {combo.description && (
                              <p className="text-xs text-[#9CA3AF] leading-relaxed line-clamp-2">
                                {combo.description}
                              </p>
                            )}
                            {showComposition && itemsSummary && (
                              <p className="text-xs text-[#D1D5DB] line-clamp-2">
                                Inclui: {itemsSummary}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-3 pt-1">
                            <span className="text-base sm:text-lg font-bold text-[#F5B731] font-mono tabular-nums">
                              {formatCurrencyBRL(combo.salePrice)}
                            </span>

                            {qty === 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  updateItemQuantity('combo', combo.id, 1)
                                }
                                className="min-h-[40px] px-4 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 whitespace-nowrap"
                              >
                                <Plus className="w-4 h-4" />
                                Adicionar
                              </button>
                            ) : (
                              <div className="inline-flex items-center gap-2 bg-[#0B0D11] border border-[#F5B731]/55 rounded-xl p-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateItemQuantity('combo', combo.id, -1)
                                  }
                                  aria-label={`Diminuir ${combo.name}`}
                                  className="w-8 h-8 rounded-lg bg-[#181C24] hover:bg-[#232834] flex items-center justify-center text-[#F3F4F6] cursor-pointer transition-colors"
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
                                  className="w-8 h-8 rounded-lg bg-[#F5B731] hover:bg-[#FCD34D] flex items-center justify-center text-[#0B0D11] cursor-pointer transition-colors"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {/* Individual Products */}
          {filteredProducts.length > 0 && (
            <section aria-labelledby="public-products-heading" className="space-y-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-[#F5B731]" />
                  <h2
                    id="public-products-heading"
                    className="font-display text-base sm:text-lg font-bold text-[#F3F4F6]"
                  >
                    Produtos Individuais
                  </h2>
                </div>
                <span className="text-xs font-mono tabular-nums text-[#9CA3AF]">
                  {filteredProducts.length}{' '}
                  {filteredProducts.length === 1 ? 'item' : 'itens'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {filteredProducts.map((product) => {
                  const qty = getItemQuantity('product', product.id);
                  return (
                    <article
                      key={product.id}
                      className="group bg-[#12151C] border border-[#232834] hover:border-[#F5B731]/40 rounded-2xl p-4 flex flex-col justify-between gap-3.5 transition-colors duration-150"
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            openItemInspector({ kind: 'product', product })
                          }
                          aria-label={`Ver detalhes de ${product.name}`}
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-gradient-to-br from-[#1C212E] via-[#141821] to-[#0B0D11] border border-[#262C3A] flex items-center justify-center shrink-0 cursor-pointer group-hover:border-[#F5B731]/35 transition-colors"
                        >
                          {hasUsableImage(product.imageUrl) ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={() => markImageBroken(product.imageUrl)}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                          ) : (
                            <CategoryGlyph
                              category={product.category}
                              className="w-5 h-5 text-[#F5B731]"
                            />
                          )}
                        </button>

                        <div className="min-w-0 space-y-1 flex-1">
                          <p className="text-[11px] font-medium uppercase tracking-wider text-[#9CA3AF]">
                            {product.category}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              openItemInspector({ kind: 'product', product })
                            }
                            className="text-left w-full cursor-pointer"
                          >
                            <h3 className="text-sm sm:text-[15px] font-bold text-[#F3F4F6] group-hover:text-[#F5B731] transition-colors leading-snug">
                              {product.name}
                            </h3>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#232834]/70">
                        <span className="text-base font-bold text-[#F5B731] font-mono tabular-nums">
                          {formatCurrencyBRL(product.unitPrice)}
                        </span>

                        {qty === 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateItemQuantity('product', product.id, 1)
                            }
                            className="min-h-[40px] px-3.5 rounded-xl bg-[#181C24] border border-[#232834] hover:border-[#F5B731] text-xs font-bold text-[#F3F4F6] inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#F5B731]" />
                            Adicionar
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 bg-[#0B0D11] border border-[#F5B731]/55 rounded-xl p-1">
                            <button
                              type="button"
                              onClick={() =>
                                updateItemQuantity('product', product.id, -1)
                              }
                              aria-label={`Diminuir ${product.name}`}
                              className="w-8 h-8 rounded-lg bg-[#181C24] hover:bg-[#232834] flex items-center justify-center text-[#F3F4F6] cursor-pointer transition-colors"
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
                              className="w-8 h-8 rounded-lg bg-[#F5B731] hover:bg-[#FCD34D] flex items-center justify-center text-[#0B0D11] cursor-pointer transition-colors"
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

      {/* Storefront Footer */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-6 border-t border-[#232834]/70 text-xs text-[#6B7280] flex flex-wrap items-center justify-between gap-2">
        <span>{store.storeName} · Pedido online direto com a loja</span>
        {store.address && <span>{store.address}</span>}
      </footer>

      {/* Quick Item Inspector Modal */}
      {inspectItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Detalhes do item"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full max-w-md bg-[#12151C] border-t sm:border border-[#232834] rounded-t-2xl sm:rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#1C212E] to-[#0B0D11] border border-[#262C3A] flex items-center justify-center shrink-0">
                  <CategoryGlyph
                    category={
                      inspectItem.kind === 'combo'
                        ? 'combo'
                        : inspectItem.product.category
                    }
                    className="w-5 h-5 text-[#F5B731]"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#9CA3AF]">
                    {inspectItem.kind === 'combo'
                      ? 'Combo especial'
                      : inspectItem.product.category}
                  </p>
                  <h3 className="font-display text-base font-bold text-[#F3F4F6] leading-snug">
                    {inspectItem.kind === 'combo'
                      ? inspectItem.combo.name
                      : inspectItem.product.name}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInspectItem(null)}
                aria-label="Fechar detalhes do item"
                className="w-9 h-9 rounded-lg border border-[#232834] flex items-center justify-center text-[#9CA3AF] hover:text-[#F3F4F6] cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {hasUsableImage(
              inspectItem.kind === 'combo'
                ? inspectItem.combo.imageUrl
                : inspectItem.product.imageUrl,
            ) && (
              <div className="w-full h-44 sm:h-52 rounded-xl overflow-hidden border border-[#232834] bg-[#0B0D11]">
                <img
                  src={
                    inspectItem.kind === 'combo'
                      ? inspectItem.combo.imageUrl
                      : inspectItem.product.imageUrl
                  }
                  alt={
                    inspectItem.kind === 'combo'
                      ? inspectItem.combo.name
                      : inspectItem.product.name
                  }
                  referrerPolicy="no-referrer"
                  onError={() =>
                    markImageBroken(
                      inspectItem.kind === 'combo'
                        ? inspectItem.combo.imageUrl
                        : inspectItem.product.imageUrl,
                    )
                  }
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {inspectItem.kind === 'combo' && (
              <div className="p-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] space-y-1.5 text-xs">
                {inspectItem.combo.description && (
                  <p className="text-[#D1D5DB] leading-relaxed">
                    {inspectItem.combo.description}
                  </p>
                )}
                {inspectItem.combo.items.length > 0 && (
                  <p className="text-[#9CA3AF]">
                    Composição: {formatComboComposition(inspectItem.combo.items)}
                  </p>
                )}
              </div>
            )}

            {inspectItem.kind === 'product' && (inspectItem.product.addonGroups || []).filter((g) => g.active).map((group) => {
              const selectedIds = modalAddonSelections[group.id] || [];
              const toggleOption = (optionId: string) => {
                setModalAddonSelections((prev) => {
                  const current = prev[group.id] || [];
                  const exists = current.includes(optionId);
                  const next = exists ? current.filter((id) => id !== optionId) : group.maxSelect === 1 ? [optionId] : current.length < group.maxSelect ? [...current, optionId] : current;
                  return { ...prev, [group.id]: next };
                });
              };
              return (
                <section key={group.id} className="rounded-xl border border-[#343B49] bg-[#0B0D11] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs text-[#F3F4F6]">{group.name}</strong>
                    <span className="text-[10px] text-[#9CA3AF]">{group.isRequired ? 'Obrigatório' : 'Opcional'} · escolha {group.minSelect} a {group.maxSelect}</span>
                  </div>
                  {group.options.filter((o) => o.active).map((option) => {
                    const checked = selectedIds.includes(option.id);
                    return <label key={option.id} className="flex items-center justify-between gap-3 py-1 text-xs text-[#D1D5DB] cursor-pointer">
                      <span className="flex items-center gap-2"><input type={group.maxSelect === 1 ? 'radio' : 'checkbox'} name={`addon-${group.id}`} checked={checked} onChange={() => toggleOption(option.id)} className="accent-[#F5B731]"/>{option.name}</span>
                      <span className="font-mono">{option.price > 0 ? `+${formatCurrencyBRL(option.price)}` : 'Grátis'}</span>
                    </label>;
                  })}
                </section>
              );
            })}
            <div>
              <label
                htmlFor="modal-item-note"
                className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
              >
                Observação (opcional)
              </label>
              <input
                id="modal-item-note"
                type="text"
                maxLength={200}
                value={modalNote}
                onChange={(e) => setModalNote(e.target.value)}
                placeholder="Ex: sem cebola, maionese à parte..."
                className="w-full min-h-[42px] px-3 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="inline-flex items-center gap-2 bg-[#0B0D11] border border-[#232834] rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setModalQty((q) => Math.max(1, q - 1))}
                  aria-label="Diminuir quantidade"
                  className="w-9 h-9 rounded-lg bg-[#181C24] flex items-center justify-center text-[#F3F4F6] cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-6 text-center text-sm font-mono font-bold tabular-nums text-[#F3F4F6]">
                  {modalQty}
                </span>
                <button
                  type="button"
                  onClick={() => setModalQty((q) => Math.min(99, q + 1))}
                  aria-label="Aumentar quantidade"
                  className="w-9 h-9 rounded-lg bg-[#181C24] flex items-center justify-center text-[#F3F4F6] cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (inspectItem.kind === 'product') {
                    const invalid = (inspectItem.product.addonGroups || []).find((g) => g.active && ((modalAddonSelections[g.id] || []).length < g.minSelect || (modalAddonSelections[g.id] || []).length > g.maxSelect));
                    if (invalid) { setCheckoutError(`Selecione entre ${invalid.minSelect} e ${invalid.maxSelect} opções em ${invalid.name}.`); return; }
                  }
                  setCheckoutError(null);
                  addItemFromDetailModal(
                    inspectItem.kind,
                    inspectItem.kind === 'combo'
                      ? inspectItem.combo.id
                      : inspectItem.product.id,
                    modalQty,
                    modalNote,
                    inspectItem.kind === 'product' ? (inspectItem.product.addonGroups || []).filter((g) => (modalAddonSelections[g.id] || []).length > 0).map((g) => ({ groupId: g.id, optionIds: modalAddonSelections[g.id] || [] })) : [],
                  );
                }}
                className="flex-1 min-h-[46px] px-4 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-xs sm:text-sm font-bold inline-flex items-center justify-between gap-2 cursor-pointer transition-colors"
              >
                <span>Adicionar à sacola</span>
                <span className="font-mono tabular-nums">
                  {formatCurrencyBRL(
                    (inspectItem.kind === 'combo'
                      ? inspectItem.combo.salePrice
                      : inspectItem.product.unitPrice) * modalQty,
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Sacola Bar */}
      {cartSummary.totalItemsCount > 0 && !mobileCartOpen && !inspectItem && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-4 py-2.5 bg-[#0B0D11]/95 backdrop-blur-md border-t border-[#232834]">
          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            className="w-full min-h-[46px] px-4 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-sm font-bold flex items-center justify-between cursor-pointer transition-colors"
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
