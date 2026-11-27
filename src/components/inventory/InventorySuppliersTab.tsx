import { useMemo, useState, type FormEvent } from 'react';
import {
  Building2,
  Edit3,
  Link2,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ProductRecord,
  ProductSupplierLinkInput,
  ProductSupplierLinkRecord,
  PurchaseOrderRecord,
  SupplierInput,
  SupplierRecord,
} from '../../types/finance';
import { formatCurrencyBRL } from '../../utils/finance';
import { PURCHASE_STATUS_LABELS } from '../../utils/inventory';

interface InventorySuppliersTabProps {
  suppliers: SupplierRecord[];
  productSuppliers: ProductSupplierLinkRecord[];
  products: ProductRecord[];
  purchaseOrders: PurchaseOrderRecord[];
  canWrite: boolean;
  onSaveSupplier: (input: SupplierInput, supplierId?: string) => Promise<string>;
  onUpsertProductLink: (input: ProductSupplierLinkInput) => Promise<string>;
  onDeleteProductLink: (linkId: string) => Promise<void>;
}

export function InventorySuppliersTab({
  suppliers,
  productSuppliers,
  products,
  purchaseOrders,
  canWrite,
  onSaveSupplier,
  onUpsertProductLink,
  onDeleteProductLink,
}: InventorySuppliersTabProps) {
  const [search, setSearch] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(
    suppliers[0]?.id ?? null,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(null);

  const [name, setName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Vínculo rápido de produto ao fornecedor selecionado
  const [linkProductId, setLinkProductId] = useState('');
  const [linkSku, setLinkSku] = useState('');
  const [linkLastCost, setLinkLastCost] = useState('');
  const [linkPreferred, setLinkPreferred] = useState(false);
  const [savingLink, setSavingLink] = useState(false);

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.tradeName.toLowerCase().includes(q) ||
        s.document.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q)
      );
    });
  }, [suppliers, search]);

  const activeSupplier = useMemo(
    () =>
      suppliers.find((s) => s.id === selectedSupplierId) ??
      filteredSuppliers[0] ??
      null,
    [suppliers, selectedSupplierId, filteredSuppliers],
  );

  const supplierLinks = useMemo(
    () =>
      activeSupplier
        ? productSuppliers.filter((ps) => ps.supplierId === activeSupplier.id)
        : [],
    [productSuppliers, activeSupplier],
  );

  const supplierOrders = useMemo(
    () =>
      activeSupplier
        ? purchaseOrders
            .filter((po) => po.supplierId === activeSupplier.id)
            .sort((a, b) => b.createdAtMs - a.createdAtMs)
        : [],
    [purchaseOrders, activeSupplier],
  );

  function openNewSupplier() {
    setEditingSupplier(null);
    setName('');
    setTradeName('');
    setDocument('');
    setPhone('');
    setWhatsapp('');
    setEmail('');
    setAddress('');
    setNotes('');
    setActive(true);
    setFormError(null);
    setModalOpen(true);
  }

  function openEditSupplier(sup: SupplierRecord) {
    setEditingSupplier(sup);
    setName(sup.name);
    setTradeName(sup.tradeName);
    setDocument(sup.document);
    setPhone(sup.phone);
    setWhatsapp(sup.whatsapp);
    setEmail(sup.email);
    setAddress(sup.address);
    setNotes(sup.notes);
    setActive(sup.active);
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSubmitSupplier(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setFormError('Informe o nome / razão social (mínimo 2 caracteres).');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const savedId = await onSaveSupplier(
        {
          name: name.trim(),
          tradeName: tradeName.trim(),
          document: document.trim(),
          phone: phone.trim(),
          whatsapp: whatsapp.trim(),
          email: email.trim(),
          address: address.trim(),
          notes: notes.trim(),
          active,
        },
        editingSupplier?.id,
      );
      setSelectedSupplierId(savedId);
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar fornecedor.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddLink(e: FormEvent) {
    e.preventDefault();
    if (!activeSupplier || !linkProductId) return;
    setSavingLink(true);
    try {
      await onUpsertProductLink({
        productId: linkProductId,
        supplierId: activeSupplier.id,
        supplierSku: linkSku.trim(),
        lastUnitCost: Number(linkLastCost.replace(',', '.')) || 0,
        isPreferred: linkPreferred,
      });
      setLinkSku('');
      setLinkLastCost('');
      setLinkPreferred(false);
    } finally {
      setSavingLink(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#778094] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar fornecedor por nome, fantasia ou CNPJ..."
            className="mgw-input pl-10"
          />
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={openNewSupplier}
            className="mgw-btn-primary min-h-[42px] px-4 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Novo Fornecedor
          </button>
        )}
      </div>

      {filteredSuppliers.length === 0 ? (
        <div className="mgw-card p-8 text-center space-y-3">
          <div className="w-11 h-11 rounded-2xl bg-[#F5F6FA] border border-[#E8EAF0] text-[#778094] flex items-center justify-center mx-auto">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#172033]">
              Nenhum fornecedor cadastrado ainda
            </h3>
            <p className="text-xs text-[#778094] mt-1 max-w-md mx-auto">
              Cadastre suas distribuidoras, atacadistas ou representantes de bebidas para registrar pedidos de compra e acompanhar os últimos custos pagos.
            </p>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={openNewSupplier}
              className="mgw-btn-primary min-h-[40px] px-4 inline-flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Cadastrar Primeiro Fornecedor
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-5 mgw-card divide-y divide-[#E8EAF0] overflow-hidden">
            {filteredSuppliers.map((sup) => {
              const isSelected = activeSupplier?.id === sup.id;
              const linksCount = productSuppliers.filter(
                (ps) => ps.supplierId === sup.id,
              ).length;
              const ordersCount = purchaseOrders.filter(
                (po) => po.supplierId === sup.id,
              ).length;
              return (
                <button
                  key={sup.id}
                  type="button"
                  onClick={() => setSelectedSupplierId(sup.id)}
                  className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                    isSelected ? 'bg-[#FFFBEB]' : 'bg-white hover:bg-[#F5F6FA]/70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#172033] truncate">
                        {sup.name}
                      </p>
                      <p className="text-xs text-[#778094] truncate mt-0.5">
                        {[sup.tradeName, sup.whatsapp || sup.phone, sup.document]
                          .filter(Boolean)
                          .join(' · ') || 'Sem dados complementares'}
                      </p>
                    </div>
                    <span
                      className={`text-[11px] font-semibold shrink-0 ${
                        sup.active ? 'text-[#16A36A]' : 'text-[#778094]'
                      }`}
                    >
                      {sup.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#778094] mt-1.5 tabular-nums">
                    {linksCount} produto{linksCount === 1 ? '' : 's'} vinculado
                    {linksCount === 1 ? '' : 's'} · {ordersCount} compra
                    {ordersCount === 1 ? '' : 's'}
                  </p>
                </button>
              );
            })}
          </div>

          {activeSupplier && (
            <div className="lg:col-span-7 space-y-4">
              <div className="mgw-card p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[#172033]">
                      {activeSupplier.name}
                    </h3>
                    {activeSupplier.tradeName && (
                      <p className="text-xs text-[#778094]">
                        Fantasia: {activeSupplier.tradeName}
                      </p>
                    )}
                  </div>
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => openEditSupplier(activeSupplier)}
                      className="mgw-btn-secondary min-h-[36px] px-3 text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Editar
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-[#778094]">
                  <div>
                    <span className="font-semibold text-[#172033]">CNPJ/CPF:</span>{' '}
                    {activeSupplier.document || '—'}
                  </div>
                  <div>
                    <span className="font-semibold text-[#172033]">Telefone / WhatsApp:</span>{' '}
                    {[activeSupplier.phone, activeSupplier.whatsapp]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </div>
                  <div>
                    <span className="font-semibold text-[#172033]">E-mail:</span>{' '}
                    {activeSupplier.email || '—'}
                  </div>
                  <div>
                    <span className="font-semibold text-[#172033]">Endereço:</span>{' '}
                    {activeSupplier.address || '—'}
                  </div>
                </div>

                {activeSupplier.notes && (
                  <p className="text-xs text-[#778094] bg-[#F5F6FA] rounded-xl p-3 border border-[#E8EAF0]">
                    {activeSupplier.notes}
                  </p>
                )}
              </div>

              <div className="mgw-card p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#778094] flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" />
                    Produtos Vinculados ({supplierLinks.length})
                  </h4>
                </div>

                {supplierLinks.length > 0 ? (
                  <div className="divide-y divide-[#E8EAF0] border border-[#E8EAF0] rounded-xl overflow-hidden">
                    {supplierLinks.map((link) => {
                      const prod = productMap.get(link.productId);
                      return (
                        <div
                          key={link.id}
                          className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs bg-white"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-[#172033] truncate">
                              {prod?.name || 'Produto'}
                              {link.isPreferred ? ' · Fornecedor preferencial' : ''}
                            </p>
                            <p className="text-[#778094] tabular-nums">
                              {link.supplierSku ? `Cód. fornecedor: ${link.supplierSku} · ` : ''}
                              Último custo base: {formatCurrencyBRL(link.lastUnitCost)}
                            </p>
                          </div>
                          {canWrite && (
                            <button
                              type="button"
                              onClick={() => void onDeleteProductLink(link.id)}
                              className="w-8 h-8 rounded-lg border border-[#E8EAF0] text-[#778094] hover:text-[#E35D62] flex items-center justify-center cursor-pointer shrink-0"
                              aria-label="Remover vínculo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-[#778094]">
                    Nenhum produto vinculado a este fornecedor ainda.
                  </p>
                )}

                {canWrite && products.length > 0 && (
                  <form
                    onSubmit={handleAddLink}
                    className="rounded-xl bg-[#F5F6FA] border border-[#E8EAF0] p-3 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                  >
                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-semibold text-[#778094] mb-1">
                        Vincular produto
                      </label>
                      <select
                        value={linkProductId}
                        onChange={(e) => setLinkProductId(e.target.value)}
                        className="mgw-input bg-white"
                        required
                      >
                        <option value="">Selecione um produto...</option>
                        {products
                          .filter((p) => p.active)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-semibold text-[#778094] mb-1">
                        SKU no fornecedor
                      </label>
                      <input
                        type="text"
                        value={linkSku}
                        onChange={(e) => setLinkSku(e.target.value)}
                        placeholder="Opcional"
                        className="mgw-input bg-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-[#778094] mb-1">
                        Custo ref.
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={linkLastCost}
                        onChange={(e) => setLinkLastCost(e.target.value)}
                        placeholder="0.00"
                        className="mgw-input bg-white tabular-nums"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        disabled={savingLink || !linkProductId}
                        className="mgw-btn-secondary w-full min-h-[40px] text-xs cursor-pointer disabled:opacity-50"
                      >
                        Vincular
                      </button>
                    </div>
                    <label className="sm:col-span-12 flex items-center gap-2 text-xs text-[#172033] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={linkPreferred}
                        onChange={(e) => setLinkPreferred(e.target.checked)}
                      />
                      Definir como fornecedor preferencial para este produto
                    </label>
                  </form>
                )}
              </div>

              <div className="mgw-card p-5 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#778094] flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5" />
                  Histórico de Compras ({supplierOrders.length})
                </h4>
                {supplierOrders.length === 0 ? (
                  <p className="text-xs text-[#778094]">
                    Nenhum pedido de compra registrado para este fornecedor.
                  </p>
                ) : (
                  <div className="divide-y divide-[#E8EAF0] border border-[#E8EAF0] rounded-xl overflow-hidden">
                    {supplierOrders.slice(0, 10).map((po) => (
                      <div
                        key={po.id}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs bg-white"
                      >
                        <div>
                          <p className="font-semibold text-[#172033] tabular-nums">
                            Compra #{po.orderNumber} · {PURCHASE_STATUS_LABELS[po.status]}
                          </p>
                          <p className="text-[11px] text-[#778094]">
                            {new Date(po.createdAtMs).toLocaleDateString('pt-BR')}
                            {po.paymentTerms ? ` · ${po.paymentTerms}` : ''}
                          </p>
                        </div>
                        <span className="font-bold text-[#172033] tabular-nums">
                          {formatCurrencyBRL(po.totalAmount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#172033]/50 backdrop-blur-[2px] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-[#E8EAF0] rounded-2xl w-full max-w-lg shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-5 py-4 border-b border-[#E8EAF0] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#172033]">
                {editingSupplier ? 'Editar Fornecedor' : 'Cadastrar Fornecedor'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-9 h-9 rounded-xl border border-[#E8EAF0] text-[#778094] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitSupplier} className="p-5 space-y-3.5 overflow-y-auto">
              {formError && (
                <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3.5 py-2.5 text-xs text-[#E35D62]">
                  {formError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1">
                  Nome / Razão Social *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Distribuidora Central de Bebidas Ltda"
                  className="mgw-input"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#172033] mb-1">
                    Nome Fantasia
                  </label>
                  <input
                    type="text"
                    value={tradeName}
                    onChange={(e) => setTradeName(e.target.value)}
                    className="mgw-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#172033] mb-1">
                    CNPJ / CPF
                  </label>
                  <input
                    type="text"
                    value={document}
                    onChange={(e) => setDocument(e.target.value)}
                    className="mgw-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#172033] mb-1">
                    Telefone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mgw-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#172033] mb-1">
                    WhatsApp
                  </label>
                  <input
                    type="text"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    className="mgw-input"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1">
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mgw-input"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1">
                  Endereço
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="mgw-input"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1">
                  Observações
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mgw-input resize-none"
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-[#172033] cursor-pointer">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Fornecedor ativo
              </label>
              <div className="pt-2 border-t border-[#E8EAF0] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="mgw-btn-secondary min-h-[40px] px-4 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="mgw-btn-primary min-h-[40px] px-5 cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar Fornecedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
