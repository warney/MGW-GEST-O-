import { useState } from 'react';
import {
  Check,
  Image as ImageIcon,
  Minus,
  PackagePlus,
  Pencil,
  Plus,
  Power,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { deleteTenantMenuImage } from '../services/storageService';
import {
  type ComboInput,
  type ComboProductItem,
  type ComboRecord,
  PRODUCT_CATEGORIES,
  type ProductCategory,
  type ProductInput,
  type ProductRecord,
} from '../types/finance';
import { formatCurrencyBRL } from '../utils/finance';
import { generateDraftEntityId } from '../utils/imageUpload';
import { ImageUploadField } from './ImageUploadField';

interface ProductsCombosManagerProps {
  workspaceId: string;
  products: ProductRecord[];
  combos: ComboRecord[];
  defaultXSaladaPrice: number;
  onCreateProduct: (input: ProductInput) => Promise<string>;
  onUpdateProduct: (productId: string, input: ProductInput) => Promise<void>;
  onCreateCombo: (input: ComboInput) => Promise<string>;
  onUpdateCombo: (comboId: string, input: ComboInput) => Promise<void>;
  onSeedCatalog: () => Promise<void>;
}

export function ProductsCombosManager({
  workspaceId,
  products,
  combos,
  defaultXSaladaPrice,
  onCreateProduct,
  onUpdateProduct,
  onCreateCombo,
  onUpdateCombo,
  onSeedCatalog,
}: ProductsCombosManagerProps) {
  const effectiveWorkspaceId = workspaceId || 'mgw_lanches';
  const [sectionTab, setSectionTab] = useState<'combos' | 'products'>('combos');
  const [feedback, setFeedback] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  // Product form state
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null);
  const [draftProductId, setDraftProductId] = useState('');
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState<ProductCategory>('Lanche');
  const [prodPrice, setProdPrice] = useState(String(defaultXSaladaPrice));
  const [prodCountsXSalada, setProdCountsXSalada] = useState(false);
  const [prodActive, setProdActive] = useState(true);
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [prodImagePath, setProdImagePath] = useState('');
  const [uploadingProdImage, setUploadingProdImage] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

  // Combo form state
  const [comboFormOpen, setComboFormOpen] = useState(false);
  const [editingCombo, setEditingCombo] = useState<ComboRecord | null>(null);
  const [draftComboId, setDraftComboId] = useState('');
  const [comboName, setComboName] = useState('');
  const [comboDescription, setComboDescription] = useState('');
  const [comboPrice, setComboPrice] = useState('');
  const [comboCost, setComboCost] = useState('');
  const [comboActive, setComboActive] = useState(true);
  const [comboImageUrl, setComboImageUrl] = useState('');
  const [comboImagePath, setComboImagePath] = useState('');
  const [uploadingComboImage, setUploadingComboImage] = useState(false);
  const [comboItems, setComboItems] = useState<ComboProductItem[]>([]);
  const [selectedProdToAdd, setSelectedProdToAdd] = useState('');
  const [savingCombo, setSavingCombo] = useState(false);

  function showNotice(text: string, type: 'ok' | 'err' = 'ok') {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 4000);
  }

  function openNewProduct() {
    setEditingProduct(null);
    setDraftProductId(generateDraftEntityId('prod'));
    setProdName('');
    setProdCategory('Bebida');
    setProdPrice('');
    setProdCountsXSalada(false);
    setProdActive(true);
    setProdImageUrl('');
    setProdImagePath('');
    setProductFormOpen(true);
  }

  function openEditProduct(p: ProductRecord) {
    setEditingProduct(p);
    setDraftProductId(p.id);
    setProdName(p.name);
    setProdCategory(p.category);
    setProdPrice(String(p.unitPrice));
    setProdCountsXSalada(p.countsAsXSalada);
    setProdActive(p.active);
    setProdImageUrl(p.imageUrl || '');
    setProdImagePath(p.imagePath || '');
    setProductFormOpen(true);
  }

  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (savingProduct || uploadingProdImage) return;

    const cleanName = prodName.trim();
    const parsedPrice = Number(String(prodPrice).replace(',', '.'));
    if (!cleanName) {
      showNotice('Informe o nome do produto.', 'err');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      showNotice('Informe um preço válido para o produto.', 'err');
      return;
    }

    const previousSavedPath = editingProduct?.imagePath || '';
    setSavingProduct(true);
    try {
      const payload: ProductInput = {
        name: cleanName,
        category: prodCategory,
        unitPrice: parsedPrice,
        countsAsXSalada: prodCountsXSalada,
        active: prodActive,
        imageUrl: prodImageUrl,
        imagePath: prodImagePath,
      };
      if (editingProduct) {
        await onUpdateProduct(editingProduct.id, payload);
        if (previousSavedPath && previousSavedPath !== prodImagePath) {
          void deleteTenantMenuImage(effectiveWorkspaceId, previousSavedPath);
        }
        showNotice('Produto atualizado.');
      } else {
        await onCreateProduct({
          ...payload,
          preferredId: draftProductId || undefined,
        });
        showNotice('Produto cadastrado.');
      }
      setProductFormOpen(false);
      setEditingProduct(null);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Erro ao salvar produto.', 'err');
    } finally {
      setSavingProduct(false);
    }
  }

  async function handleToggleProductActive(p: ProductRecord) {
    try {
      await onUpdateProduct(p.id, {
        name: p.name,
        category: p.category,
        unitPrice: p.unitPrice,
        countsAsXSalada: p.countsAsXSalada,
        active: !p.active,
        imageUrl: p.imageUrl || '',
        imagePath: p.imagePath || '',
      });
      showNotice(p.active ? `Produto "${p.name}" desativado.` : `Produto "${p.name}" reativado.`);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Erro ao atualizar produto.', 'err');
    }
  }

  function openNewCombo() {
    setEditingCombo(null);
    setDraftComboId(generateDraftEntityId('combo'));
    setComboName('');
    setComboDescription('');
    setComboPrice('');
    setComboCost('');
    setComboActive(true);
    setComboImageUrl('');
    setComboImagePath('');
    const activeProducts = products.filter((p) => p.active);
    const firstX = activeProducts.find((p) => p.countsAsXSalada);
    setComboItems(
      firstX
        ? [
            {
              productId: firstX.id,
              productName: firstX.name,
              quantity: 1,
              countsAsXSalada: firstX.countsAsXSalada,
            },
          ]
        : [],
    );
    setSelectedProdToAdd(activeProducts[0]?.id ?? '');
    setComboFormOpen(true);
  }

  function openEditCombo(c: ComboRecord) {
    setEditingCombo(c);
    setDraftComboId(c.id);
    setComboName(c.name);
    setComboDescription(c.description);
    setComboPrice(String(c.salePrice));
    setComboCost(c.estimatedCost > 0 ? String(c.estimatedCost) : '');
    setComboActive(c.active);
    setComboImageUrl(c.imageUrl || '');
    setComboImagePath(c.imagePath || '');
    setComboItems(c.items.map((item) => ({ ...item })));
    const firstAvail = products.find((p) => p.active)?.id ?? products[0]?.id ?? '';
    setSelectedProdToAdd(firstAvail);
    setComboFormOpen(true);
  }

  function handleAddProductToCombo() {
    if (!selectedProdToAdd) return;
    const prod = products.find((p) => p.id === selectedProdToAdd);
    if (!prod) return;

    setComboItems((prev) => {
      const existing = prev.find((i) => i.productId === prod.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === prod.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          productId: prod.id,
          productName: prod.name,
          quantity: 1,
          countsAsXSalada: prod.countsAsXSalada,
        },
      ];
    });
  }

  function handleUpdateComboItemQty(productId: string, delta: number) {
    setComboItems((prev) =>
      prev
        .map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + delta }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  async function handleSaveCombo(e: React.FormEvent) {
    e.preventDefault();
    if (savingCombo || uploadingComboImage) return;

    const cleanName = comboName.trim();
    const parsedPrice = Number(String(comboPrice).replace(',', '.'));
    const parsedCost = comboCost.trim()
      ? Number(String(comboCost).replace(',', '.'))
      : 0;

    if (!cleanName) {
      showNotice('Informe o nome do combo.', 'err');
      return;
    }
    if (comboItems.length === 0) {
      showNotice('Adicione pelo menos 1 produto na composição do combo.', 'err');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      showNotice('Informe um preço de venda válido para o combo.', 'err');
      return;
    }
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      showNotice('Informe um custo estimado válido (ou deixe em branco).', 'err');
      return;
    }

    const autoDescription =
      comboDescription.trim() ||
      comboItems.map((i) => `${i.quantity} ${i.productName}`).join(' + ');

    const previousSavedPath = editingCombo?.imagePath || '';
    setSavingCombo(true);
    try {
      const payload: ComboInput = {
        name: cleanName,
        description: autoDescription,
        items: comboItems,
        salePrice: parsedPrice,
        estimatedCost: parsedCost,
        active: comboActive,
        imageUrl: comboImageUrl,
        imagePath: comboImagePath,
      };
      if (editingCombo) {
        await onUpdateCombo(editingCombo.id, payload);
        if (previousSavedPath && previousSavedPath !== comboImagePath) {
          void deleteTenantMenuImage(effectiveWorkspaceId, previousSavedPath);
        }
        showNotice('Combo atualizado (vendas antigas permanecem preservadas).');
      } else {
        await onCreateCombo({
          ...payload,
          preferredId: draftComboId || undefined,
        });
        showNotice('Combo cadastrado com sucesso.');
      }
      setComboFormOpen(false);
      setEditingCombo(null);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Erro ao salvar combo.', 'err');
    } finally {
      setSavingCombo(false);
    }
  }

  async function handleToggleComboActive(c: ComboRecord) {
    try {
      await onUpdateCombo(c.id, {
        name: c.name,
        description: c.description,
        items: c.items,
        salePrice: c.salePrice,
        estimatedCost: c.estimatedCost,
        active: !c.active,
        imageUrl: c.imageUrl || '',
        imagePath: c.imagePath || '',
      });
      showNotice(c.active ? `Combo "${c.name}" desativado.` : `Combo "${c.name}" reativado.`);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Erro ao atualizar combo.', 'err');
    }
  }

  async function handleSeedCatalog() {
    if (isSeeding) return;
    setIsSeeding(true);
    try {
      await onSeedCatalog();
      showNotice('Produtos e Combos 1 a 4 iniciais criados!');
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Erro ao carregar catálogo inicial.', 'err');
    } finally {
      setIsSeeding(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Quick Seed Banner if catalog is empty */}
      {products.length === 0 && combos.length === 0 && (
        <section className="bg-[#12151C] border border-[#F5B731]/30 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#F3F4F6] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#F5B731]" />
              Catálogo inicial de exemplo
            </h3>
            <p className="text-xs text-[#9CA3AF]">
              Cadastre manualmente abaixo ou crie com 1 toque os produtos base (X-Salada, Refris 250 ml, 1 L, 1,5 L) e os Combos 1 a 4 para editar como quiser.
            </p>
          </div>
          <button
            type="button"
            disabled={isSeeding}
            onClick={() => void handleSeedCatalog()}
            className="min-h-[44px] px-4 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            {isSeeding ? 'Criando...' : 'Criar catálogo inicial'}
          </button>
        </section>
      )}

      {feedback && (
        <div
          role="status"
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-[#22C55E]/10 border-[#22C55E]/30 text-[#86EFAC]'
              : 'bg-[#EF4444]/10 border-[#EF4444]/30 text-[#FCA5A5]'
          }`}
        >
          <Check className="w-4 h-4 shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Sub-navigation between Combos & Products */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Gerenciar combos ou produtos"
          className="inline-flex p-1 bg-[#12151C] border border-[#232834] rounded-xl self-start"
        >
          <button
            type="button"
            role="tab"
            aria-selected={sectionTab === 'combos'}
            onClick={() => setSectionTab('combos')}
            className={`min-h-[38px] px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              sectionTab === 'combos'
                ? 'bg-[#F5B731] text-[#0B0D11]'
                : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
            }`}
          >
            Combos ({combos.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sectionTab === 'products'}
            onClick={() => setSectionTab('products')}
            className={`min-h-[38px] px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              sectionTab === 'products'
                ? 'bg-[#F5B731] text-[#0B0D11]'
                : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
            }`}
          >
            Produtos ({products.length})
          </button>
        </div>

        {sectionTab === 'combos' ? (
          <button
            type="button"
            onClick={openNewCombo}
            disabled={products.length === 0}
            className="min-h-[44px] px-4 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Novo Combo
          </button>
        ) : (
          <button
            type="button"
            onClick={openNewProduct}
            className="min-h-[44px] px-4 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <PackagePlus className="w-4 h-4" />
            Novo Produto
          </button>
        )}
      </div>

      {/* COMBOS TAB */}
      {sectionTab === 'combos' && (
        <div className="space-y-4">
          {products.length === 0 && (
            <p className="text-xs text-[#9CA3AF] bg-[#12151C] border border-[#232834] rounded-xl p-4">
              Cadastre primeiro os produtos (ex: X-Salada, Refrigerante 250 ml) na aba{' '}
              <button
                type="button"
                onClick={() => setSectionTab('products')}
                className="text-[#F5B731] underline font-semibold cursor-pointer"
              >
                Produtos
              </button>{' '}
              ou clique em <strong>Criar catálogo inicial</strong> acima para montar combos.
            </p>
          )}

          {comboFormOpen && (
            <form
              onSubmit={(e) => void handleSaveCombo(e)}
              className="bg-[#12151C] border border-[#F5B731]/40 rounded-2xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#232834] pb-3">
                <h3 className="text-sm font-bold text-[#F3F4F6]">
                  {editingCombo ? `Editar ${editingCombo.name}` : 'Cadastrar Novo Combo'}
                </h3>
                <button
                  type="button"
                  onClick={() => setComboFormOpen(false)}
                  aria-label="Fechar formulário de combo"
                  className="min-w-[38px] min-h-[38px] rounded-lg border border-[#232834] flex items-center justify-center text-[#9CA3AF] hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="combo-name" className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
                    Nome do combo
                  </label>
                  <input
                    id="combo-name"
                    type="text"
                    maxLength={80}
                    placeholder="Ex: Combo 1, Combo Família"
                    value={comboName}
                    onChange={(e) => setComboName(e.target.value)}
                    required
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="combo-price" className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
                      Preço de venda (R$)
                    </label>
                    <input
                      id="combo-price"
                      type="number"
                      min="0.01"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="27,00"
                      value={comboPrice}
                      onChange={(e) => setComboPrice(e.target.value)}
                      required
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6] font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label htmlFor="combo-cost" className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
                      Custo est. (opcional)
                    </label>
                    <input
                      id="combo-cost"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={comboCost}
                      onChange={(e) => setComboCost(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6] font-mono tabular-nums"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="combo-desc" className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
                  Descrição (opcional — preenchida automaticamente se vazio)
                </label>
                <input
                  id="combo-desc"
                  type="text"
                  maxLength={240}
                  placeholder="Ex: 2 X-Saladas + 1 Refrigerante Tuchaua 1 L"
                  value={comboDescription}
                  onChange={(e) => setComboDescription(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
                />
              </div>

              <ImageUploadField
                label="Foto do combo (opcional)"
                helperText="Exibida no cardápio digital para destacar este combo."
                workspaceId={effectiveWorkspaceId}
                folder="combos"
                entityHint={comboName || editingCombo?.id || 'combo'}
                entityId={editingCombo?.id || draftComboId}
                preset="catalog"
                valueUrl={comboImageUrl}
                valuePath={comboImagePath}
                savedPath={editingCombo?.imagePath || ''}
                onChange={({ url, path }) => {
                  setComboImageUrl(url);
                  setComboImagePath(path);
                }}
                onUploadingChange={setUploadingComboImage}
                disabled={savingCombo}
              />

              {/* Products Composition */}
              <div className="space-y-3 pt-2 border-t border-[#232834]">
                <p className="text-xs font-semibold text-[#D1D5DB]">
                  Produtos que compõem este combo
                </p>

                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    aria-label="Selecionar produto para adicionar ao combo"
                    value={selectedProdToAdd}
                    onChange={(e) => setSelectedProdToAdd(e.target.value)}
                    className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {!p.active ? '(Inativo)' : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddProductToCombo}
                    className="min-h-[44px] px-4 rounded-xl border border-[#F5B731]/50 hover:bg-[#F5B731]/10 text-[#F5B731] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar produto
                  </button>
                </div>

                {comboItems.length === 0 ? (
                  <p className="text-xs text-[#9CA3AF]">
                    Nenhum produto adicionado ao combo ainda.
                  </p>
                ) : (
                  <div className="divide-y divide-[#232834] border border-[#232834] rounded-xl bg-[#0B0D11]/60">
                    {comboItems.map((item) => (
                      <div
                        key={item.productId}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-medium text-[#F3F4F6] truncate">
                            {item.productName}
                          </p>
                          {item.countsAsXSalada && (
                            <p className="text-[11px] text-[#22C55E]">
                              Contabiliza como X-Salada
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleUpdateComboItemQty(item.productId, -1)}
                            aria-label={`Diminuir quantidade de ${item.productName}`}
                            className="w-9 h-9 rounded-lg border border-[#232834] flex items-center justify-center text-[#D1D5DB] hover:border-[#F5B731] cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-7 text-center text-sm font-bold font-mono tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateComboItemQty(item.productId, 1)}
                            aria-label={`Aumentar quantidade de ${item.productName}`}
                            className="w-9 h-9 rounded-lg border border-[#232834] flex items-center justify-center text-[#D1D5DB] hover:border-[#F5B731] cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateComboItemQty(item.productId, -item.quantity)}
                            aria-label={`Remover ${item.productName} do combo`}
                            className="w-9 h-9 rounded-lg border border-[#232834] flex items-center justify-center text-[#9CA3AF] hover:text-[#EF4444] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label className="inline-flex items-center gap-2.5 text-xs text-[#D1D5DB] cursor-pointer">
                <input
                  type="checkbox"
                  checked={comboActive}
                  onChange={(e) => setComboActive(e.target.checked)}
                  className="w-4 h-4 accent-[#F5B731]"
                />
                Combo ativo (disponível na tela de Nova Venda)
              </label>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="submit"
                  disabled={savingCombo || uploadingComboImage}
                  className="min-h-[44px] px-5 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-xs font-bold cursor-pointer disabled:opacity-60"
                >
                  {savingCombo
                    ? 'Salvando...'
                    : uploadingComboImage
                      ? 'Enviando foto...'
                      : editingCombo
                        ? 'Salvar Alterações'
                        : 'Cadastrar Combo'}
                </button>
                <button
                  type="button"
                  onClick={() => setComboFormOpen(false)}
                  className="min-h-[44px] px-4 rounded-xl border border-[#232834] text-xs font-medium text-[#D1D5DB] cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {combos.length === 0 ? (
            <div className="bg-[#12151C] border border-[#232834] rounded-2xl p-8 text-center space-y-2">
              <p className="text-sm font-medium text-[#D1D5DB]">
                Nenhum combo cadastrado ainda.
              </p>
              <p className="text-xs text-[#9CA3AF]">
                Crie quantos combos desejar para agilizar o registro de vendas no celular.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {combos.map((c) => {
                const xSaladasInCombo = c.items.reduce(
                  (acc, i) => (i.countsAsXSalada ? acc + i.quantity : acc),
                  0,
                );
                return (
                  <div
                    key={c.id}
                    className={`bg-[#12151C] border rounded-2xl p-4 space-y-3 ${
                      c.active ? 'border-[#232834]' : 'border-[#232834]/50 opacity-70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl border border-[#232834] bg-[#0B0D11] overflow-hidden flex items-center justify-center shrink-0">
                          {c.imageUrl ? (
                            <img
                              src={c.imageUrl}
                              alt={c.name}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="w-4 h-4 text-[#6B7280]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-[#F3F4F6] truncate">
                              {c.name}
                            </h4>
                            <span
                              className={`text-[11px] font-semibold ${
                                c.active ? 'text-[#22C55E]' : 'text-[#9CA3AF]'
                              }`}
                            >
                              · {c.active ? 'Ativo' : 'Inativo'}
                            </span>
                          </div>
                          <p className="text-xs text-[#9CA3AF] mt-0.5">
                            {c.description || c.items.map((i) => `${i.quantity}x ${i.productName}`).join(' + ')}
                          </p>
                        </div>
                      </div>
                      <span className="text-base font-bold text-[#F5B731] font-mono tabular-nums shrink-0">
                        {formatCurrencyBRL(c.salePrice)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#232834] text-[11px] text-[#9CA3AF]">
                      <span className="font-mono tabular-nums">
                        {xSaladasInCombo > 0
                          ? `${xSaladasInCombo} X-Salada${xSaladasInCombo > 1 ? 's' : ''}`
                          : 'Sem X-Salada'}
                        {c.estimatedCost > 0
                          ? ` · Custo est. ${formatCurrencyBRL(c.estimatedCost)}`
                          : ''}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditCombo(c)}
                          aria-label={`Editar combo ${c.name}`}
                          className="min-h-[38px] px-3 rounded-lg border border-[#232834] hover:border-[#F5B731]/60 text-xs text-[#D1D5DB] hover:text-[#F5B731] inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleComboActive(c)}
                          aria-label={c.active ? `Desativar combo ${c.name}` : `Ativar combo ${c.name}`}
                          className="min-h-[38px] px-3 rounded-lg border border-[#232834] hover:border-[#374151] text-xs text-[#D1D5DB] inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Power className="w-3.5 h-3.5" />
                          {c.active ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* PRODUCTS TAB */}
      {sectionTab === 'products' && (
        <div className="space-y-4">
          {productFormOpen && (
            <form
              onSubmit={(e) => void handleSaveProduct(e)}
              className="bg-[#12151C] border border-[#F5B731]/40 rounded-2xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#232834] pb-3">
                <h3 className="text-sm font-bold text-[#F3F4F6]">
                  {editingProduct ? `Editar ${editingProduct.name}` : 'Cadastrar Produto'}
                </h3>
                <button
                  type="button"
                  onClick={() => setProductFormOpen(false)}
                  aria-label="Fechar formulário de produto"
                  className="min-w-[38px] min-h-[38px] rounded-lg border border-[#232834] flex items-center justify-center text-[#9CA3AF] hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="prod-name" className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
                    Nome do produto
                  </label>
                  <input
                    id="prod-name"
                    type="text"
                    maxLength={80}
                    placeholder="Ex: X-Salada, Refrigerante Tuchaua 250 ml"
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    required
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
                  />
                </div>

                <div>
                  <label htmlFor="prod-cat" className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
                    Categoria
                  </label>
                  <select
                    id="prod-cat"
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value as ProductCategory)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
                  >
                    {PRODUCT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div>
                  <label htmlFor="prod-price" className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
                    Preço de venda individual (R$)
                  </label>
                  <input
                    id="prod-price"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value)}
                    required
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6] font-mono tabular-nums"
                  />
                </div>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2.5 text-xs text-[#D1D5DB] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prodCountsXSalada}
                      onChange={(e) => setProdCountsXSalada(e.target.checked)}
                      className="w-4 h-4 accent-[#F5B731]"
                    />
                    Contabiliza como X-Salada nos indicadores
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-[#D1D5DB] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prodActive}
                      onChange={(e) => setProdActive(e.target.checked)}
                      className="w-4 h-4 accent-[#F5B731]"
                    />
                    Produto ativo
                  </label>
                </div>
              </div>

              <ImageUploadField
                label="Foto do produto (opcional)"
                helperText="Exibida nos cards e detalhes do cardápio digital."
                workspaceId={effectiveWorkspaceId}
                folder="products"
                entityHint={prodName || editingProduct?.id || 'produto'}
                entityId={editingProduct?.id || draftProductId}
                preset="catalog"
                valueUrl={prodImageUrl}
                valuePath={prodImagePath}
                savedPath={editingProduct?.imagePath || ''}
                onChange={({ url, path }) => {
                  setProdImageUrl(url);
                  setProdImagePath(path);
                }}
                onUploadingChange={setUploadingProdImage}
                disabled={savingProduct}
              />

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="submit"
                  disabled={savingProduct || uploadingProdImage}
                  className="min-h-[44px] px-5 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-xs font-bold cursor-pointer disabled:opacity-60"
                >
                  {savingProduct
                    ? 'Salvando...'
                    : uploadingProdImage
                      ? 'Enviando foto...'
                      : editingProduct
                        ? 'Salvar Produto'
                        : 'Cadastrar Produto'}
                </button>
                <button
                  type="button"
                  onClick={() => setProductFormOpen(false)}
                  className="min-h-[44px] px-4 rounded-xl border border-[#232834] text-xs font-medium text-[#D1D5DB] cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {products.length === 0 ? (
            <div className="bg-[#12151C] border border-[#232834] rounded-2xl p-8 text-center space-y-2">
              <p className="text-sm font-medium text-[#D1D5DB]">
                Nenhum produto cadastrado ainda.
              </p>
              <p className="text-xs text-[#9CA3AF]">
                Cadastre seus lanches e bebidas para utilizá-los em vendas individuais e na montagem de combos.
              </p>
            </div>
          ) : (
            <div className="bg-[#12151C] border border-[#232834] rounded-2xl divide-y divide-[#232834]">
              {products.map((p) => (
                <div
                  key={p.id}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    p.active ? '' : 'opacity-65'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl border border-[#232834] bg-[#0B0D11] overflow-hidden flex items-center justify-center shrink-0">
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-[#6B7280]" />
                      )}
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#F3F4F6] truncate">
                          {p.name}
                        </span>
                        <span
                          className={`text-[11px] font-semibold ${
                            p.active ? 'text-[#22C55E]' : 'text-[#9CA3AF]'
                          }`}
                        >
                          · {p.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      <p className="text-xs text-[#9CA3AF] font-mono tabular-nums">
                        {p.category} · {formatCurrencyBRL(p.unitPrice)}
                        {p.countsAsXSalada ? ' · Conta como X-Salada' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditProduct(p)}
                      aria-label={`Editar produto ${p.name}`}
                      className="min-h-[38px] px-3 rounded-lg border border-[#232834] hover:border-[#F5B731]/60 text-xs text-[#D1D5DB] hover:text-[#F5B731] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggleProductActive(p)}
                      aria-label={p.active ? `Desativar produto ${p.name}` : `Ativar produto ${p.name}`}
                      className="min-h-[38px] px-3 rounded-lg border border-[#232834] hover:border-[#374151] text-xs text-[#D1D5DB] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Power className="w-3.5 h-3.5" />
                      {p.active ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
