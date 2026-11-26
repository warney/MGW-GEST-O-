import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  Layers,
  MapPin,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  type ComboRecord,
  type DeliveryCustomerAddressRecord,
  type DeliveryCustomerRecord,
  normalizePaymentMethod,
  PAYMENT_METHODS,
  type PaymentMethod,
  type ProductRecord,
  type SaleInput,
  type SaleOrderDraftItem,
  type SaleRecord,
} from '../types/finance';
import {
  buildSaleInputFromOrder,
  calculateSaleTotal,
  formatCurrencyBRL,
  formatDateBR,
  formatSaleCustomerAddressLine,
  getLocalTodayDate,
  hasSaleCustomerDetails,
  roundCurrency,
} from '../utils/finance';
import { formatCustomerPhoneBR, normalizeCustomerPhone } from '../utils/deliveryCustomers';
import { fromSaleRecord, type PrintPaperFormat } from '../utils/orderPrint';
import { OrderPrintModal } from './OrderPrintModal';

interface SaleModalProps {
  isOpen: boolean;
  editingSale: SaleRecord | null;
  defaultUnitPrice: number;
  establishmentName?: string;
  storePhone?: string;
  storeAddress?: string;
  products: ProductRecord[];
  combos: ComboRecord[];
  deliveryCustomers?: DeliveryCustomerRecord[];
  deliveryCustomerAddresses?: DeliveryCustomerAddressRecord[];
  onClose: () => void;
  onSubmit: (input: SaleInput, editingId?: string) => Promise<SaleRecord | void>;
  onRequestPrintSale?: (sale: SaleRecord, preferredFormat?: PrintPaperFormat) => void;
}

function buildDraftFromSale(sale: SaleRecord): SaleOrderDraftItem[] {
  if (sale.items && sale.items.length > 0) {
    return sale.items.map((item) => ({
      kind: item.kind,
      refId: item.refId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      estimatedUnitCost: item.estimatedUnitCost,
      components: item.components.map((c) => ({
        productId: c.productId,
        productName: c.productName,
        quantityPerUnit: c.quantityPerUnit,
        countsAsXSalada: c.countsAsXSalada,
      })),
    }));
  }

  return [
    {
      kind: 'product',
      refId: 'legacy-xsalada',
      name: 'X-Salada',
      quantity: Math.max(1, sale.quantity),
      unitPrice: sale.unitPrice,
      estimatedUnitCost: 0,
      components: [
        {
          productId: 'legacy-xsalada',
          productName: 'X-Salada',
          quantityPerUnit: 1,
          countsAsXSalada: true,
        },
      ],
    },
  ];
}

export function SaleModal({
  isOpen,
  editingSale,
  defaultUnitPrice,
  establishmentName = 'MGW Lanches',
  storePhone = '',
  storeAddress = '',
  products,
  combos,
  deliveryCustomers = [],
  deliveryCustomerAddresses = [],
  onClose,
  onSubmit,
  onRequestPrintSale,
}: SaleModalProps) {
  const activeCombos = useMemo(() => combos.filter((c) => c.active), [combos]);
  const activeProducts = useMemo(() => {
    const active = products.filter((p) => p.active);
    const hasXSalada = active.some((p) => p.countsAsXSalada);
    if (hasXSalada) return active;

    const fallbackXSalada: ProductRecord = {
      id: 'default-xsalada',
      ownerId: '',
      name: 'X-Salada',
      category: 'Lanche',
      unitPrice: defaultUnitPrice,
      countsAsXSalada: true,
      active: true,
      createdAtMs: 0,
      updatedAtMs: 0,
    };
    return [fallbackXSalada, ...active];
  }, [products, defaultUnitPrice]);

  const [mode, setMode] = useState<'combo' | 'individual'>('combo');
  const [draftItems, setDraftItems] = useState<SaleOrderDraftItem[]>([]);
  const [date, setDate] = useState(getLocalTodayDate());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Pix');
  const [note, setNote] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerNumber, setCustomerNumber] = useState('');
  const [customerNeighborhood, setCustomerNeighborhood] = useState('');
  const [customerComplement, setCustomerComplement] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [completedSale, setCompletedSale] = useState<SaleRecord | null>(null);
  const [printFormat, setPrintFormat] = useState<PrintPaperFormat>('80mm');
  const [localPrintingSale, setLocalPrintingSale] = useState<SaleRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const addressesByCustomer = useMemo(() => {
    const map = new Map<string, DeliveryCustomerAddressRecord[]>();
    for (const addr of deliveryCustomerAddresses) {
      const list = map.get(addr.customerId) ?? [];
      list.push(addr);
      map.set(addr.customerId, list);
    }
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
      map.set(k, list);
    }
    return map;
  }, [deliveryCustomerAddresses]);

  const selectedDeliveryCustomer = useMemo(
    () =>
      customerId
        ? deliveryCustomers.find((c) => c.id === customerId) ?? null
        : null,
    [customerId, deliveryCustomers],
  );

  const selectedCustomerAddresses = useMemo(
    () => (customerId ? addressesByCustomer.get(customerId) ?? [] : []),
    [customerId, addressesByCustomer],
  );

  const filteredDeliveryCustomers = useMemo(() => {
    if (deliveryCustomers.length === 0) return [];
    const q = customerSearch.trim().toLowerCase();
    const digits = normalizeCustomerPhone(customerSearch);
    const list = !q
      ? deliveryCustomers
      : deliveryCustomers.filter((c) => {
          const nameMatch = c.name.toLowerCase().includes(q);
          const phoneMatch =
            digits.length >= 2 &&
            (c.normalizedPhone.includes(digits) || c.phone.includes(q));
          const addrMatch = (addressesByCustomer.get(c.id) ?? []).some((a) =>
            `${a.street} ${a.neighborhood}`.toLowerCase().includes(q),
          );
          return nameMatch || phoneMatch || addrMatch;
        });
    return list.slice(0, 8);
  }, [deliveryCustomers, customerSearch, addressesByCustomer]);

  function resetFormForNewSale() {
    setDate(getLocalTodayDate());
    setPaymentMethod('Pix');
    setNote('');
    setDraftItems([]);
    setCustomerId(null);
    setCustomerName('');
    setCustomerAddress('');
    setCustomerNumber('');
    setCustomerNeighborhood('');
    setCustomerComplement('');
    setCustomerSearch('');
    setShowCustomerPicker(false);
    setCompletedSale(null);
    setLocalPrintingSale(null);
    setMode(activeCombos.length > 0 ? 'combo' : 'individual');
    setError(null);
    setIsSaving(false);
  }

  useEffect(() => {
    if (!isOpen) return;
    setCompletedSale(null);
    setLocalPrintingSale(null);
    setCustomerSearch('');
    setShowCustomerPicker(false);
    if (editingSale) {
      setDate(editingSale.date);
      setPaymentMethod(normalizePaymentMethod(editingSale.paymentMethod));
      setNote(editingSale.note);
      setCustomerId(editingSale.customerId ?? null);
      setCustomerName(editingSale.customerName || '');
      setCustomerAddress(editingSale.customerAddress || '');
      setCustomerNumber(editingSale.customerNumber || '');
      setCustomerNeighborhood(editingSale.customerNeighborhood || '');
      setCustomerComplement(editingSale.customerComplement || '');
      setDraftItems(buildDraftFromSale(editingSale));
      if (editingSale.saleMode === 'individual') {
        setMode('individual');
      } else if (editingSale.saleMode === 'combo') {
        setMode('combo');
      } else {
        setMode(activeCombos.length > 0 ? 'combo' : 'individual');
      }
    } else {
      setDate(getLocalTodayDate());
      setPaymentMethod('Pix');
      setNote('');
      setCustomerId(null);
      setCustomerName('');
      setCustomerAddress('');
      setCustomerNumber('');
      setCustomerNeighborhood('');
      setCustomerComplement('');
      setDraftItems([]);
      setMode(activeCombos.length > 0 ? 'combo' : 'individual');
    }
    setError(null);
    setIsSaving(false);
    // Only reset modal state when opened or switching which sale is edited
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingSale]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  function addComboToCart(combo: ComboRecord) {
    setError(null);
    setDraftItems((prev) => {
      const idx = prev.findIndex((i) => i.kind === 'combo' && i.refId === combo.id);
      if (idx >= 0) {
        return prev.map((item, i) =>
          i === idx ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...prev,
        {
          kind: 'combo',
          refId: combo.id,
          name: combo.name,
          quantity: 1,
          unitPrice: combo.salePrice,
          estimatedUnitCost: combo.estimatedCost,
          components: combo.items.map((c) => ({
            productId: c.productId,
            productName: c.productName,
            quantityPerUnit: c.quantity,
            countsAsXSalada: c.countsAsXSalada,
          })),
        },
      ];
    });
  }

  function addProductToCart(product: ProductRecord) {
    setError(null);
    const effectivePrice =
      product.unitPrice > 0 ? product.unitPrice : defaultUnitPrice;
    setDraftItems((prev) => {
      const idx = prev.findIndex(
        (i) => i.kind === 'product' && i.refId === product.id,
      );
      if (idx >= 0) {
        return prev.map((item, i) =>
          i === idx ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...prev,
        {
          kind: 'product',
          refId: product.id,
          name: product.name,
          quantity: 1,
          unitPrice: effectivePrice,
          estimatedUnitCost: 0,
          components: [
            {
              productId: product.id,
              productName: product.name,
              quantityPerUnit: 1,
              countsAsXSalada: product.countsAsXSalada,
            },
          ],
        },
      ];
    });
  }

  function updateItemQuantity(kind: 'combo' | 'product', refId: string, nextQty: number) {
    setError(null);
    setDraftItems((prev) => {
      if (nextQty <= 0) {
        return prev.filter((i) => !(i.kind === kind && i.refId === refId));
      }
      return prev.map((item) =>
        item.kind === kind && item.refId === refId
          ? { ...item, quantity: Math.trunc(nextQty) }
          : item,
      );
    });
  }

  function updateItemUnitPrice(kind: 'combo' | 'product', refId: string, rawVal: string) {
    const parsed = Number(rawVal.replace(',', '.'));
    setDraftItems((prev) =>
      prev.map((item) =>
        item.kind === kind && item.refId === refId
          ? {
              ...item,
              unitPrice: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
            }
          : item,
      ),
    );
  }

  const orderTotals = draftItems.reduce(
    (acc, item) => {
      const lineTotal = calculateSaleTotal(item.quantity, item.unitPrice);
      const xPerUnit = item.components.reduce(
        (sum, c) => (c.countsAsXSalada ? sum + c.quantityPerUnit : sum),
        0,
      );
      acc.totalAmount = roundCurrency(acc.totalAmount + lineTotal);
      acc.xSaladaCount += xPerUnit * item.quantity;
      if (item.kind === 'combo') acc.combosCount += item.quantity;
      return acc;
    },
    { totalAmount: 0, xSaladaCount: 0, combosCount: 0 },
  );

  function applyAddressFromDeliveryCustomer(addr: DeliveryCustomerAddressRecord | null) {
    if (!addr) {
      setCustomerAddress('');
      setCustomerNumber('');
      setCustomerNeighborhood('');
      setCustomerComplement('');
      return;
    }
    setCustomerAddress(addr.street || '');
    setCustomerNumber(addr.number || '');
    setCustomerNeighborhood(addr.neighborhood || '');
    setCustomerComplement(addr.complement || addr.reference || '');
  }

  function handleSelectDeliveryCustomer(customer: DeliveryCustomerRecord) {
    setCustomerId(customer.id);
    setCustomerName(customer.name);
    const addresses = addressesByCustomer.get(customer.id) ?? [];
    const primary = addresses.find((a) => a.isPrimary) ?? addresses[0] ?? null;
    applyAddressFromDeliveryCustomer(primary);
    setCustomerSearch('');
    setShowCustomerPicker(false);
  }

  function handleClearDeliveryCustomerLink() {
    setCustomerId(null);
    setCustomerSearch('');
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSaving || completedSale) return;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Selecione uma data válida.');
      return;
    }
    if (draftItems.length === 0) {
      setError('Selecione pelo menos um combo ou produto para registrar a venda.');
      return;
    }
    if (draftItems.some((item) => item.unitPrice <= 0 || item.quantity < 1)) {
      setError('Todos os itens devem ter quantidade e valor unitário maiores que zero.');
      return;
    }

    let payload: SaleInput;
    try {
      payload = buildSaleInputFromOrder(
        draftItems,
        date,
        paymentMethod,
        note.trim(),
        {
          customerId,
          customerName,
          customerAddress,
          customerNumber,
          customerNeighborhood,
          customerComplement,
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dados inválidos na venda.');
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const saved = await onSubmit(payload, editingSale?.id);
      if (editingSale) {
        onClose();
        return;
      }

      const now = Date.now();
      const totalAmount =
        payload.items && payload.items.length > 0
          ? roundCurrency(payload.items.reduce((acc, i) => acc + i.lineTotal, 0))
          : calculateSaleTotal(payload.quantity, payload.unitPrice);

      const resolvedSale: SaleRecord = saved ?? {
        id: `local_sale_${now}`,
        ownerId: '',
        ...payload,
        totalAmount,
        saleOrigin: payload.saleOrigin ?? 'manual',
        createdAtMs: now,
        updatedAtMs: now,
      };
      setCompletedSale(resolvedSale);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao salvar a venda.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  function handleTriggerPostSalePrint(saleToPrint: SaleRecord) {
    if (onRequestPrintSale) {
      onRequestPrintSale(saleToPrint, printFormat);
      return;
    }
    setLocalPrintingSale(saleToPrint);
  }

  return createPortal(
    <>
      <div
        className="no-print fixed inset-0 z-50 bg-[#172033]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-modal-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="w-full sm:max-w-2xl bg-[#FFFFFF] border border-[#E8EAF0] rounded-t-3xl sm:rounded-2xl p-4 sm:p-6 max-h-[94vh] overflow-y-auto shadow-[0_18px_42px_rgba(23,32,51,0.18)]">
          <div className="w-10 h-1 bg-[#CBD5E1] rounded-full mx-auto mb-4 sm:hidden" />
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="min-w-0">
              <h2 id="sale-modal-title" className="text-lg font-bold text-[#172033]">
                {completedSale
                  ? 'Venda Registrada'
                  : editingSale
                    ? 'Editar Venda'
                    : 'Nova Venda Rápida'}
              </h2>
              <p className="text-xs text-[#778094] truncate">
                {completedSale
                  ? `Comprovante pronto para impressão · ${establishmentName}`
                  : `Combine combos e produtos individuais no mesmo pedido · ${establishmentName}`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar janela de venda"
              className="min-w-[44px] min-h-[44px] rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] flex items-center justify-center text-[#778094] hover:text-[#172033] transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {completedSale ? (
            <div data-testid="sale-completed-panel" className="space-y-4">
              <div className="rounded-2xl bg-[#ECFDF5] border border-[#A7F3D0] p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#16A36A] shrink-0 mt-0.5" />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-bold text-[#14532D]">
                    Venda salva com sucesso!
                  </p>
                  <p className="text-xs text-[#166534]">
                    Você pode imprimir o comprovante agora ou fechar esta janela sem duplicar o lançamento.
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#778094]">Data e pagamento</span>
                  <span className="font-semibold text-[#172033] font-mono tabular-nums">
                    {formatDateBR(completedSale.date)} · {normalizePaymentMethod(completedSale.paymentMethod)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#778094]">Valor total</span>
                  <span className="text-base font-extrabold text-[#16A36A] font-mono tabular-nums">
                    {formatCurrencyBRL(completedSale.totalAmount)}
                  </span>
                </div>
                {hasSaleCustomerDetails(completedSale) && (
                  <div className="pt-2 border-t border-[#E8EAF0] space-y-0.5 text-[#4B5563]">
                    {completedSale.customerName && (
                      <p>
                        <strong className="text-[#172033]">Cliente:</strong>{' '}
                        {completedSale.customerName}
                      </p>
                    )}
                    {formatSaleCustomerAddressLine(completedSale) && (
                      <p>
                        <strong className="text-[#172033]">Endereço:</strong>{' '}
                        {formatSaleCustomerAddressLine(completedSale)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[#E8EAF0] p-3.5 space-y-2.5 bg-white">
                <p className="text-xs font-semibold text-[#4B5563]">
                  Formato da impressora térmica
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(['80mm', '58mm'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      aria-pressed={printFormat === fmt}
                      onClick={() => setPrintFormat(fmt)}
                      className={`min-h-[40px] px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                        printFormat === fmt
                          ? 'bg-[#FFFBEB] border-[#F5B900] text-[#172033]'
                          : 'bg-[#F7F8FC] border-[#E8EAF0] text-[#4B5563] hover:text-[#172033]'
                      }`}
                    >
                      Térmica {fmt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleTriggerPostSalePrint(completedSale)}
                  className="flex-1 min-h-[46px] px-4 rounded-xl bg-[#F5B900] hover:bg-[#FFC928] text-[#172033] text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Nota</span>
                </button>
                <button
                  type="button"
                  onClick={resetFormForNewSale}
                  className="min-h-[46px] px-4 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] hover:bg-[#F7F8FC] text-sm font-semibold text-[#172033] cursor-pointer transition-colors"
                >
                  Nova Venda
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[46px] px-4 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] hover:bg-[#F7F8FC] text-sm font-semibold text-[#4B5563] cursor-pointer transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => void handleFormSubmit(e)} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#B91C1C]"
            >
              {error}
            </div>
          )}

          {/* Mode Tabs */}
          <div
            role="tablist"
            aria-label="Tipo de seleção de venda"
            className="grid grid-cols-2 p-1 bg-[#F7F8FC] border border-[#E8EAF0] rounded-xl"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'combo'}
              onClick={() => setMode('combo')}
              className={`min-h-[42px] px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                mode === 'combo'
                  ? 'bg-[#F5B900] text-[#172033] shadow-xs'
                  : 'text-[#4B5563] hover:text-[#172033]'
              }`}
            >
              <Layers className="w-4 h-4 shrink-0" />
              Venda por Combo
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={mode === 'individual'}
              onClick={() => setMode('individual')}
              className={`min-h-[42px] px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                mode === 'individual'
                  ? 'bg-[#F5B900] text-[#172033] shadow-xs'
                  : 'text-[#4B5563] hover:text-[#172033]'
              }`}
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              Venda Individual
            </button>
          </div>

          {/* Combo Cards Picker */}
          {mode === 'combo' && (
            <div className="space-y-2.5">
              {activeCombos.length === 0 ? (
                <div className="p-4 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] text-center space-y-2">
                  <p className="text-xs text-[#4B5563]">
                    Nenhum combo ativo cadastrado ainda.
                  </p>
                  <p className="text-[11px] text-[#778094]">
                    Cadastre seus combos em <strong>Ajustes → Produtos e Combos</strong> ou use a aba{' '}
                    <button
                      type="button"
                      onClick={() => setMode('individual')}
                      className="text-[#8A6200] hover:text-[#172033] underline font-semibold cursor-pointer"
                    >
                      Venda Individual
                    </button>
                    .
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activeCombos.map((combo) => {
                    const inCart = draftItems.find(
                      (i) => i.kind === 'combo' && i.refId === combo.id,
                    );
                    const comboDesc =
                      combo.description ||
                      combo.items
                        .map((i) => `${i.quantity} ${i.productName}`)
                        .join(' + ');
                    return (
                      <div
                        key={combo.id}
                        data-testid={`combo-card-${combo.id}`}
                        className={`rounded-xl border p-3.5 flex flex-col justify-between gap-3 transition-colors ${
                          inCart
                            ? 'bg-[#FFFBEB] border-[#F5B900]'
                            : 'bg-[#F7F8FC] border-[#E8EAF0]'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-bold text-[#172033]">
                              {combo.name}
                            </span>
                            <span className="text-sm font-bold text-[#8A6200] font-mono tabular-nums shrink-0">
                              {formatCurrencyBRL(combo.salePrice)}
                            </span>
                          </div>
                          <p className="text-xs text-[#778094] leading-snug">
                            {comboDesc}
                          </p>
                        </div>

                        {inCart ? (
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <span className="text-xs font-semibold text-[#8A6200] font-mono tabular-nums">
                              Subtotal {formatCurrencyBRL(calculateSaleTotal(inCart.quantity, inCart.unitPrice))}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  updateItemQuantity('combo', combo.id, inCart.quantity - 1)
                                }
                                aria-label={`Diminuir quantidade de ${combo.name}`}
                                className="w-9 h-9 rounded-lg border border-[#E8EAF0] bg-[#FFFFFF] flex items-center justify-center text-[#172033] hover:border-[#F5B900] cursor-pointer"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-7 text-center text-sm font-bold font-mono tabular-nums text-[#172033]">
                                {inCart.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateItemQuantity('combo', combo.id, inCart.quantity + 1)
                                }
                                aria-label={`Aumentar quantidade de ${combo.name}`}
                                className="w-9 h-9 rounded-lg bg-[#F5B900] text-[#172033] flex items-center justify-center font-bold hover:bg-[#FFC928] cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addComboToCart(combo)}
                            className="w-full min-h-[40px] px-3 rounded-lg bg-white hover:bg-[#F5B900] text-[#172033] border border-[#E8EAF0] hover:border-[#F5B900] text-xs font-bold transition-colors cursor-pointer"
                          >
                            Selecionar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Individual Products Picker */}
          {mode === 'individual' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {activeProducts.map((prod) => {
                const effectivePrice =
                  prod.unitPrice > 0 ? prod.unitPrice : defaultUnitPrice;
                const inCart = draftItems.find(
                  (i) => i.kind === 'product' && i.refId === prod.id,
                );
                return (
                  <div
                    key={prod.id}
                    data-testid={`product-card-${prod.id}`}
                    className={`rounded-xl border p-3.5 flex flex-col justify-between gap-2.5 transition-colors ${
                      inCart
                        ? 'bg-[#FFFBEB] border-[#F5B900]'
                        : 'bg-[#F7F8FC] border-[#E8EAF0]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#172033] truncate">
                          {prod.name}
                        </p>
                        <p className="text-[11px] text-[#778094]">
                          {prod.category}
                          {prod.countsAsXSalada ? ' · Conta como X-Salada' : ''}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-[#8A6200] font-mono tabular-nums shrink-0">
                        {formatCurrencyBRL(effectivePrice)}
                      </span>
                    </div>

                    {inCart ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <span className="text-xs font-semibold text-[#8A6200] font-mono tabular-nums">
                          {formatCurrencyBRL(calculateSaleTotal(inCart.quantity, inCart.unitPrice))}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              updateItemQuantity('product', prod.id, inCart.quantity - 1)
                            }
                            aria-label={`Diminuir quantidade de ${prod.name}`}
                            className="w-9 h-9 rounded-lg border border-[#E8EAF0] bg-[#FFFFFF] flex items-center justify-center text-[#172033] hover:border-[#F5B900] cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-7 text-center text-sm font-bold font-mono tabular-nums text-[#172033]">
                            {inCart.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateItemQuantity('product', prod.id, inCart.quantity + 1)
                            }
                            aria-label={`Aumentar quantidade de ${prod.name}`}
                            className="w-9 h-9 rounded-lg bg-[#F5B900] text-[#172033] flex items-center justify-center font-bold hover:bg-[#FFC928] cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => addProductToCart(prod)}
                        className="w-full min-h-[40px] px-3 rounded-lg bg-white hover:bg-[#F5B900] text-[#172033] border border-[#E8EAF0] hover:border-[#F5B900] text-xs font-bold transition-colors cursor-pointer"
                      >
                        Selecionar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Selected Order Items & Live Totals */}
          <div className="rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#4B5563]">
                Itens do Pedido ({draftItems.length})
              </span>
              <span className="text-xs text-[#778094] font-mono tabular-nums">
                {orderTotals.xSaladaCount} X-Salada{orderTotals.xSaladaCount === 1 ? '' : 's'}
                {orderTotals.combosCount > 0
                  ? ` · ${orderTotals.combosCount} combo${orderTotals.combosCount === 1 ? '' : 's'}`
                  : ''}
              </span>
            </div>

            {draftItems.length === 0 ? (
              <p className="text-xs text-[#778094] py-1">
                Toque em <strong>Selecionar</strong> acima para adicionar combos ou itens individuais nesta venda.
              </p>
            ) : (
              <div className="divide-y divide-[#E8EAF0]">
                {draftItems.map((item) => (
                  <div
                    key={`${item.kind}:${item.refId}`}
                    className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-[#172033] truncate">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-[#778094] font-mono tabular-nums">
                        {item.kind === 'combo' ? 'Combo' : 'Individual'} · Unit.{' '}
                        {formatCurrencyBRL(item.unitPrice)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
                      <div className="flex items-center gap-1.5">
                        <label
                          htmlFor={`qty-${item.kind}-${item.refId}`}
                          className="sr-only"
                        >
                          Quantidade de {item.name}
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            updateItemQuantity(item.kind, item.refId, item.quantity - 1)
                          }
                          aria-label={`Remover 1 ${item.name}`}
                          className="w-8 h-8 rounded-lg border border-[#E8EAF0] bg-white flex items-center justify-center text-[#4B5563] hover:border-[#F5B900] cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          id={`qty-${item.kind}-${item.refId}`}
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          value={item.quantity}
                          onChange={(e) => {
                            const val = Math.trunc(Number(e.target.value));
                            if (Number.isFinite(val) && val >= 1) {
                              updateItemQuantity(item.kind, item.refId, val);
                            }
                          }}
                          className="w-12 h-8 text-center rounded-lg bg-[#FFFFFF] border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-xs font-bold text-[#172033] font-mono tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateItemQuantity(item.kind, item.refId, item.quantity + 1)
                          }
                          aria-label={`Adicionar 1 ${item.name}`}
                          className="w-8 h-8 rounded-lg border border-[#E8EAF0] bg-white flex items-center justify-center text-[#4B5563] hover:border-[#F5B900] cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2 ml-auto sm:ml-0">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          inputMode="decimal"
                          aria-label={`Preço unitário de ${item.name}`}
                          value={item.unitPrice}
                          onChange={(e) =>
                            updateItemUnitPrice(item.kind, item.refId, e.target.value)
                          }
                          className="w-20 h-8 px-2 rounded-lg bg-[#FFFFFF] border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-xs text-right text-[#172033] font-mono tabular-nums"
                        />

                        <span className="min-w-[72px] text-right text-xs font-bold text-[#172033] font-mono tabular-nums">
                          {formatCurrencyBRL(calculateSaleTotal(item.quantity, item.unitPrice))}
                        </span>

                        <button
                          type="button"
                          onClick={() => updateItemQuantity(item.kind, item.refId, 0)}
                          aria-label={`Excluir ${item.name} do pedido`}
                          className="w-8 h-8 rounded-lg border border-[#E8EAF0] bg-white flex items-center justify-center text-[#778094] hover:text-[#DC2626] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2.5 border-t border-[#E8EAF0] flex items-center justify-between gap-4">
              <span className="text-xs font-semibold text-[#4B5563]">
                Valor total da venda
              </span>
              <span
                data-testid="sale-computed-total"
                className="text-lg font-extrabold text-[#172033] font-mono tabular-nums"
              >
                {formatCurrencyBRL(orderTotals.totalAmount)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="sale-date"
                className="block text-xs font-medium text-[#4B5563] mb-1.5"
              >
                Data da venda
              </label>
              <input
                id="sale-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] font-mono"
              />
            </div>

            <div>
              <label
                htmlFor="sale-payment"
                className="block text-xs font-medium text-[#4B5563] mb-1.5"
              >
                Forma de pagamento
              </label>
              <select
                id="sale-payment"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827]"
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Optional Customer Identification */}
          <div className="rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-[#172033]">
                  Dados do Cliente (opcional)
                </p>
                <p className="text-[11px] text-[#778094]">
                  Preencha para identificar na nota ou selecione um cliente cadastrado no Delivery.
                </p>
              </div>
              {selectedDeliveryCustomer && (
                <button
                  type="button"
                  onClick={handleClearDeliveryCustomerLink}
                  className="text-[11px] font-semibold text-[#8A6200] hover:text-[#172033] underline cursor-pointer"
                >
                  Desvincular cliente
                </button>
              )}
            </div>

            {deliveryCustomers.length > 0 && (
              <div className="space-y-2">
                {selectedDeliveryCustomer ? (
                  <div className="rounded-xl bg-[#FFFBEB] border border-[#F5B900] px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <UserCheck className="w-4 h-4 text-[#8A6200] shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#172033] truncate">
                          {selectedDeliveryCustomer.name}
                        </p>
                        {selectedDeliveryCustomer.phone && (
                          <p className="text-[11px] text-[#778094] font-mono tabular-nums">
                            {formatCustomerPhoneBR(selectedDeliveryCustomer.phone)}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCustomerPicker((prev) => !prev)}
                      className="min-h-[32px] px-2.5 rounded-lg bg-white border border-[#E8EAF0] text-[11px] font-semibold text-[#172033] hover:border-[#F5B900] cursor-pointer"
                    >
                      Trocar cliente
                    </button>
                  </div>
                ) : null}

                {(!selectedDeliveryCustomer || showCustomerPicker) && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="sale-customer-search"
                      className="block text-[11px] font-semibold text-[#4B5563]"
                    >
                      Selecionar cliente cadastrado (MGW Delivery)
                    </label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-[#778094] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="sale-customer-search"
                        type="search"
                        value={customerSearch}
                        onFocus={() => setShowCustomerPicker(true)}
                        onChange={(e) => {
                          setCustomerSearch(e.target.value);
                          setShowCustomerPicker(true);
                        }}
                        placeholder="Buscar por nome, telefone ou bairro..."
                        className="w-full min-h-[40px] pl-8 pr-3 rounded-xl bg-white border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-xs text-[#111827] placeholder:text-[#6B7280]"
                      />
                    </div>

                    {(showCustomerPicker || customerSearch.trim().length > 0) && (
                      <div
                        data-testid="sale-delivery-customer-results"
                        className="rounded-xl bg-white border border-[#E8EAF0] divide-y divide-[#E8EAF0] max-h-44 overflow-y-auto shadow-xs"
                      >
                        {filteredDeliveryCustomers.length === 0 ? (
                          <p className="px-3 py-2.5 text-xs text-[#778094]">
                            Nenhum cliente cadastrado encontrado.
                          </p>
                        ) : (
                          filteredDeliveryCustomers.map((cust) => {
                            const addrs = addressesByCustomer.get(cust.id) ?? [];
                            const primary = addrs.find((a) => a.isPrimary) ?? addrs[0];
                            const addrHint = primary
                              ? [primary.street, primary.number, primary.neighborhood]
                                  .filter(Boolean)
                                  .join(', ')
                              : '';
                            return (
                              <button
                                key={cust.id}
                                type="button"
                                onClick={() => handleSelectDeliveryCustomer(cust)}
                                className="w-full text-left px-3 py-2 hover:bg-[#FFFBEB] transition-colors cursor-pointer flex items-start justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-[#172033] truncate">
                                    {cust.name}
                                  </p>
                                  {addrHint && (
                                    <p className="text-[11px] text-[#778094] truncate flex items-center gap-1">
                                      <MapPin className="w-3 h-3 shrink-0" />
                                      <span className="truncate">{addrHint}</span>
                                    </p>
                                  )}
                                </div>
                                {cust.phone && (
                                  <span className="text-[11px] text-[#778094] font-mono tabular-nums shrink-0">
                                    {formatCustomerPhoneBR(cust.phone)}
                                  </span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}

                {selectedCustomerAddresses.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-[#778094]">Endereços salvos:</span>
                    {selectedCustomerAddresses.map((addr) => (
                      <button
                        key={addr.id}
                        type="button"
                        onClick={() => applyAddressFromDeliveryCustomer(addr)}
                        className="min-h-[28px] px-2.5 rounded-lg bg-white border border-[#E8EAF0] hover:border-[#F5B900] text-[11px] font-semibold text-[#172033] cursor-pointer"
                      >
                        {addr.label || addr.neighborhood || addr.street}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="sale-customer-name"
                  className="block text-xs font-medium text-[#4B5563] mb-1"
                >
                  Nome do cliente
                </label>
                <input
                  id="sale-customer-name"
                  type="text"
                  maxLength={120}
                  placeholder="Ex.: Maria Silva"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] placeholder:text-[#6B7280]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-8">
                  <label
                    htmlFor="sale-customer-address"
                    className="block text-xs font-medium text-[#4B5563] mb-1"
                  >
                    Endereço
                  </label>
                  <input
                    id="sale-customer-address"
                    type="text"
                    maxLength={200}
                    placeholder="Ex.: Rua das Flores"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] placeholder:text-[#6B7280]"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label
                    htmlFor="sale-customer-number"
                    className="block text-xs font-medium text-[#4B5563] mb-1"
                  >
                    Número
                  </label>
                  <input
                    id="sale-customer-number"
                    type="text"
                    maxLength={40}
                    placeholder="Ex.: 120"
                    value={customerNumber}
                    onChange={(e) => setCustomerNumber(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] placeholder:text-[#6B7280]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="sale-customer-neighborhood"
                    className="block text-xs font-medium text-[#4B5563] mb-1"
                  >
                    Bairro
                  </label>
                  <input
                    id="sale-customer-neighborhood"
                    type="text"
                    maxLength={120}
                    placeholder="Ex.: Centro"
                    value={customerNeighborhood}
                    onChange={(e) => setCustomerNeighborhood(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] placeholder:text-[#6B7280]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="sale-customer-complement"
                    className="block text-xs font-medium text-[#4B5563] mb-1"
                  >
                    Complemento
                  </label>
                  <input
                    id="sale-customer-complement"
                    type="text"
                    maxLength={160}
                    placeholder="Ex.: Apto 202, casa dos fundos"
                    value={customerComplement}
                    onChange={(e) => setCustomerComplement(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 rounded-xl bg-white border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] placeholder:text-[#6B7280]"
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="sale-note"
              className="block text-xs font-medium text-[#4B5563] mb-1.5"
            >
              Observação (opcional)
            </label>
            <input
              id="sale-note"
              type="text"
              maxLength={240}
              placeholder="Ex.: Pedido balcão, entrega centro..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] placeholder:text-[#6B7280]"
            />
          </div>

          <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-[#FFFFFF]/95 backdrop-blur-xs border-t border-[#E8EAF0] flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[46px] px-4 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] hover:bg-[#F7F8FC] text-sm font-semibold text-[#4B5563] cursor-pointer transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || draftItems.length === 0}
              className="flex-1 min-h-[46px] px-4 rounded-xl bg-[#F5B900] hover:bg-[#FFC928] text-[#172033] text-sm font-bold cursor-pointer transition-colors disabled:opacity-60"
            >
              {isSaving
                ? 'Salvando...'
                : editingSale
                  ? 'Salvar Alterações'
                  : 'Registrar Venda'}
            </button>
          </div>
        </form>
          )}
        </div>
      </div>

      {localPrintingSale && (
        <OrderPrintModal
          order={fromSaleRecord(localPrintingSale, {
            storeName: establishmentName,
            storePhone,
            storeAddress,
          })}
          allowKitchenToggle={false}
          availableFormats={['80mm', '58mm']}
          initialPaperFormat={printFormat}
          onClose={() => setLocalPrintingSale(null)}
        />
      )}
    </>,
    document.body,
  );
}
