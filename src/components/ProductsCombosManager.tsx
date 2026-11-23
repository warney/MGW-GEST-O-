import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../lib/supabase';
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
  const [customCategories, setCustomCategories] = useState<string[]>(PRODUCT_CATEGORIES.slice());
  const [categoryDraft, setCategoryDraft] = useState('');
  const [addonGroups, setAddonGroups] = useState<Array<{ id: string; name: string; options: Array<{ id: string; name: string; price: number }> }>>([]);
  const [addonGroupDraft, setAddonGroupDraft] = useState('');
  const [optionDrafts, setOptionDrafts] = useState<Record<string, { name: string; price: string }>>({});
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [selectedAddonGroupIds, setSelectedAddonGroupIds] = useState<string[]>([]);
  const [addonGroupRules, setAddonGroupRules] = useState<Record<string, { isRequired: boolean; minSelect: number; maxSelect: number }>>({});

  async function refreshCustomCatalog() {
    if (!workspaceId) return;
    const supabase = getSupabaseClient();
    const [cats, groups] = await Promise.all([
      supabase.from('product_categories').select('name').eq('tenant_id', workspaceId).eq('active', true).order('sort_order'),
      supabase.from('addon_groups').select('id,name,addon_options(id,name,price)').eq('tenant_id', workspaceId).eq('active', true).order('sort_order'),
    ]);
    if (!cats.error && cats.data?.length) setCustomCategories(cats.data.map((r) => String(r.name)));
    if (!groups.error) setAddonGroups((groups.data || []).map((r: any) => ({
      id: String(r.id), name: String(r.name), isRequired: Boolean(r.is_required), minSelect: Number(r.min_select) || 0, maxSelect: Number(r.max_select) || 1,
      options: Array.isArray(r.addon_options) ? r.addon_options.map((o: any) => ({ id: String(o.id), name: String(o.name), price: Number(o.price) || 0 })) : [],
    })));
    if (!groups.error) setAddonGroupRules(Object.fromEntries((groups.data || []).map((g: any) => [String(g.id), { isRequired: Boolean(g.is_required), minSelect: Number(g.min_select) || 0, maxSelect: Number(g.max_select) || 1 }])));
  }

  useEffect(() => { void refreshCustomCatalog(); }, [workspaceId]);

  async function addCustomCategory() {
    const name = categoryDraft.trim();
    if (!name || name.length > 60 || customCategories.some((v) => v.toLowerCase() === name.toLowerCase())) return;
    setCatalogBusy(true);
    try {
      const { error } = await getSupabaseClient().from('product_categories').insert({ tenant_id: workspaceId, name, sort_order: customCategories.length });
      if (error) throw error;
      setCategoryDraft('');
      await refreshCustomCatalog();
      showNotice('Categoria criada.');
    } catch (error) { showNotice(error instanceof Error ? error.message : 'Falha ao criar categoria.', 'err'); }
    finally { setCatalogBusy(false); }
  }

  async function addAddonGroup() {
    const name = addonGroupDraft.trim();
    if (!name || name.length > 80) return;
    setCatalogBusy(true);
    try {
      const { error } = await getSupabaseClient().from('addon_groups').insert({ tenant_id: workspaceId, name, is_required: false, min_select: 0, max_select: 1 });
      if (error) throw error;
      setAddonGroupDraft('');
      await refreshCustomCatalog();
      showNotice('Grupo criado.');
    } catch (error) { showNotice(error instanceof Error ? error.message : 'Falha ao criar grupo.', 'err'); }
    finally { setCatalogBusy(false); }
  }

  async function addAddonOption(groupId: string) {
    const draft = optionDrafts[groupId];
    const name = draft?.name.trim() || '';
    const price = Number(String(draft?.price || '0').replace(',', '.'));
    if (!name || !Number.isFinite(price) || price < 0 || price > 10000) return;
    setCatalogBusy(true);
    try {
      const { error } = await getSupabaseClient().from('addon_options').insert({ tenant_id: workspaceId, group_id: groupId, name, price });
      if (error) throw error;
      setOptionDrafts((prev) => ({ ...prev, [groupId]: { name: '', price: '' } }));
      await refreshCustomCatalog();
      showNotice('Opção adicionada.');
    } catch (error) { showNotice(error instanceof Error ? error.message : 'Falha ao adicionar opção.', 'err'); }
    finally { setCatalogBusy(false); }
  }

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
    setProdCategory(customCategories[0] || 'Bebida');
    setProdPrice('');
    setProdCountsXSalada(false);
    setProdActive(true);
    setProdImageUrl('');
    setProdImagePath('');
    setSelectedAddonGroupIds([]);
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
    setSelectedAddonGroupIds([]);
    void getSupabaseClient().from('product_addon_groups').select('group_id').eq('tenant_id', workspaceId).eq('product_id', p.id).then(({ data, error }) => { if (!error) setSelectedAddonGroupIds((data || []).map((row) => String(row.group_id))); });
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
      let savedProductId = editingProduct?.id || draftProductId;
      if (editingProduct) {
        await onUpdateProduct(editingProduct.id, payload);
        if (previousSavedPath && previousSavedPath !== prodImagePath) {
          void deleteTenantMenuImage(effectiveWorkspaceId, previousSavedPath);
        }
        showNotice('Produto atualizado.');
      } else {
        savedProductId = await onCreateProduct({
          ...payload,
          preferredId: draftProductId || undefined,
        });
        showNotice('Produto cadastrado.');
      }
      const supabase = getSupabaseClient();
      const { error: clearLinksError } = await supabase.from('product_addon_groups').delete().eq('tenant_id', workspaceId).eq('product_id', savedProductId);
      if (clearLinksError) throw clearLinksError;
      if (selectedAddonGroupIds.length) {
        const { error: linkError } = await supabase.from('product_addon_groups').insert(selectedAddonGroupIds.map((groupId, index) => ({ tenant_id: workspaceId, product_id: savedProductId, group_id: groupId, sort_order: index })));
        if (linkError) throw linkError;
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
        <section className="bg-[#FFFFFF] border border-[#EAB308]/30 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#111827] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#EAB308]" />
              Catálogo inicial de exemplo
            </h3>
            <p className="text-xs text-[#6B7280]">
              Cadastre manualmente abaixo ou crie com 1 toque os produtos base (X-Salada, Refris 250 ml, 1 L, 1,5 L) e os Combos 1 a 4 para editar como quiser.
            </p>
          </div>
          <button
            type="button"
            disabled={isSeeding}
            onClick={() => void handleSeedCatalog()}
            className="min-h-[44px] px-4 rounded-xl bg-[#EAB308] hover:bg-[#F5C842] text-[#F9FAFB] text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
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
          className="inline-flex p-1 bg-[#FFFFFF] border border-[#E5E7EB] rounded-xl self-start"
        >
          <button
            type="button"
            role="tab"
            aria-selected={sectionTab === 'combos'}
            onClick={() => setSectionTab('combos')}
            className={`min-h-[38px] px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              sectionTab === 'combos'
                ? 'bg-[#EAB308] text-[#F9FAFB]'
                : 'text-[#6B7280] hover:text-[#111827]'
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
                ? 'bg-[#EAB308] text-[#F9FAFB]'
                : 'text-[#6B7280] hover:text-[#111827]'
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
            className="min-h-[44px] px-4 rounded-xl bg-[#EAB308] hover:bg-[#F5C842] text-[#F9FAFB] text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Novo Combo
          </button>
        ) : (
          <button
            type="button"
            onClick={openNewProduct}
            className="min-h-[44px] px-4 rounded-xl bg-[#EAB308] hover:bg-[#F5C842] text-[#F9FAFB] text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
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
            <p className="text-xs text-[#6B7280] bg-[#FFFFFF] border border-[#E5E7EB] rounded-xl p-4">
              Cadastre primeiro os produtos (ex: X-Salada, Refrigerante 250 ml) na aba{' '}
              <button
                type="button"
                onClick={() => setSectionTab('products')}
                className="text-[#EAB308] underline font-semibold cursor-pointer"
              >
                Produtos
              </button>{' '}
              ou clique em <strong>Criar catálogo inicial</strong> acima para montar combos.
            </p>
          )}

          {comboFormOpen && (
            <form
              onSubmit={(e) => void handleSaveCombo(e)}
              className="bg-[#FFFFFF] border border-[#EAB308]/40 rounded-2xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
                <h3 className="text-sm font-bold text-[#111827]">
                  {editingCombo ? `Editar ${editingCombo.name}` : 'Cadastrar Novo Combo'}
                </h3>
                <button
                  type="button"
                  onClick={() => setComboFormOpen(false)}
                  aria-label="Fechar formulário de combo"
                  className="min-w-[38px] min-h-[38px] rounded-lg border border-[#E5E7EB] flex items-center justify-center text-[#6B7280] hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="combo-name" className="block text-xs font-medium text-[#4B5563] mb-1.5">
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
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="combo-price" className="block text-xs font-medium text-[#4B5563] mb-1.5">
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
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label htmlFor="combo-cost" className="block text-xs font-medium text-[#4B5563] mb-1.5">
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
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] font-mono tabular-nums"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="combo-desc" className="block text-xs font-medium text-[#4B5563] mb-1.5">
                  Descrição (opcional — preenchida automaticamente se vazio)
                </label>
                <input
                  id="combo-desc"
                  type="text"
                  maxLength={240}
                  placeholder="Ex: 2 X-Saladas + 1 Refrigerante Tuchaua 1 L"
                  value={comboDescription}
                  onChange={(e) => setComboDescription(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827]"
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
              <div className="space-y-3 pt-2 border-t border-[#E5E7EB]">
                <p className="text-xs font-semibold text-[#4B5563]">
                  Produtos que compõem este combo
                </p>

                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    aria-label="Selecionar produto para adicionar ao combo"
                    value={selectedProdToAdd}
                    onChange={(e) => setSelectedProdToAdd(e.target.value)}
                    className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827]"
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
                    className="min-h-[44px] px-4 rounded-xl border border-[#EAB308]/50 hover:bg-[#EAB308]/10 text-[#EAB308] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar produto
                  </button>
                </div>

                {comboItems.length === 0 ? (
                  <p className="text-xs text-[#6B7280]">
                    Nenhum produto adicionado ao combo ainda.
                  </p>
                ) : (
                  <div className="divide-y divide-[#E5E7EB] border border-[#E5E7EB] rounded-xl bg-[#F9FAFB]/60">
                    {comboItems.map((item) => (
                      <div
                        key={item.productId}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-medium text-[#111827] truncate">
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
                            className="w-9 h-9 rounded-lg border border-[#E5E7EB] flex items-center justify-center text-[#4B5563] hover:border-[#EAB308] cursor-pointer"
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
                            className="w-9 h-9 rounded-lg border border-[#E5E7EB] flex items-center justify-center text-[#4B5563] hover:border-[#EAB308] cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateComboItemQty(item.productId, -item.quantity)}
                            aria-label={`Remover ${item.productName} do combo`}
                            className="w-9 h-9 rounded-lg border border-[#E5E7EB] flex items-center justify-center text-[#6B7280] hover:text-[#EF4444] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label className="inline-flex items-center gap-2.5 text-xs text-[#4B5563] cursor-pointer">
                <input
                  type="checkbox"
                  checked={comboActive}
                  onChange={(e) => setComboActive(e.target.checked)}
                  className="w-4 h-4 accent-[#EAB308]"
                />
                Combo ativo (disponível na tela de Nova Venda)
              </label>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="submit"
                  disabled={savingCombo || uploadingComboImage}
                  className="min-h-[44px] px-5 rounded-xl bg-[#EAB308] hover:bg-[#F5C842] text-[#F9FAFB] text-xs font-bold cursor-pointer disabled:opacity-60"
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
                  className="min-h-[44px] px-4 rounded-xl border border-[#E5E7EB] text-xs font-medium text-[#4B5563] cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {combos.length === 0 ? (
            <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-8 text-center space-y-2">
              <p className="text-sm font-medium text-[#4B5563]">
                Nenhum combo cadastrado ainda.
              </p>
              <p className="text-xs text-[#6B7280]">
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
                    className={`bg-[#FFFFFF] border rounded-2xl p-4 space-y-3 ${
                      c.active ? 'border-[#E5E7EB]' : 'border-[#E5E7EB]/50 opacity-70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] overflow-hidden flex items-center justify-center shrink-0">
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
                            <h4 className="text-sm font-bold text-[#111827] truncate">
                              {c.name}
                            </h4>
                            <span
                              className={`text-[11px] font-semibold ${
                                c.active ? 'text-[#22C55E]' : 'text-[#6B7280]'
                              }`}
                            >
                              · {c.active ? 'Ativo' : 'Inativo'}
                            </span>
                          </div>
                          <p className="text-xs text-[#6B7280] mt-0.5">
                            {c.description || c.items.map((i) => `${i.quantity}x ${i.productName}`).join(' + ')}
                          </p>
                        </div>
                      </div>
                      <span className="text-base font-bold text-[#EAB308] font-mono tabular-nums shrink-0">
                        {formatCurrencyBRL(c.salePrice)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E5E7EB] text-[11px] text-[#6B7280]">
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
                          className="min-h-[38px] px-3 rounded-lg border border-[#E5E7EB] hover:border-[#EAB308]/60 text-xs text-[#4B5563] hover:text-[#EAB308] inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleComboActive(c)}
                          aria-label={c.active ? `Desativar combo ${c.name}` : `Ativar combo ${c.name}`}
                          className="min-h-[38px] px-3 rounded-lg border border-[#E5E7EB] hover:border-[#374151] text-xs text-[#4B5563] inline-flex items-center gap-1.5 cursor-pointer"
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

      {sectionTab === 'products' && (
        <section className="space-y-4 bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-4">
          <div><h3 className="text-sm font-bold text-white">Categorias personalizadas</h3><p className="text-xs text-[#6B7280]">Crie categorias como Pastéis, Kikão, Porções e Bebidas.</p></div>
          <div className="flex gap-2"><input value={categoryDraft} onChange={(e) => setCategoryDraft(e.target.value)} maxLength={60} placeholder="Nova categoria" className="flex-1 min-h-[42px] px-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] text-sm text-white"/><button type="button" disabled={catalogBusy || !categoryDraft.trim()} onClick={() => void addCustomCategory()} className="px-4 rounded-xl bg-[#EAB308] text-[#F9FAFB] text-xs font-bold disabled:opacity-50">Criar</button></div>
          <div className="flex flex-wrap gap-2">{customCategories.map((v) => <span key={v} className="px-3 py-1.5 rounded-full bg-[#F9FAFB] border border-[#343B49] text-xs text-white">{v}</span>)}</div>
          <div className="border-t border-[#E5E7EB] pt-4 space-y-3"><h3 className="text-sm font-bold text-white">Grupos de adicionais</h3>
            <div className="flex gap-2"><input value={addonGroupDraft} onChange={(e) => setAddonGroupDraft(e.target.value)} maxLength={80} placeholder="Ex.: Sabores de pastel" className="flex-1 min-h-[42px] px-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] text-sm text-white"/><button type="button" disabled={catalogBusy || !addonGroupDraft.trim()} onClick={() => void addAddonGroup()} className="px-4 rounded-xl border border-[#EAB308] text-[#EAB308] text-xs font-bold">Criar grupo</button></div>
            {addonGroups.map((g) => <div key={g.id} className="rounded-xl border border-[#343B49] p-3 space-y-2"><strong className="text-sm text-white">{g.name}</strong>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-[#4B5563]">
                <label className="flex items-center gap-2"><input type="checkbox" checked={addonGroupRules[g.id]?.isRequired ?? false} onChange={(e) => setAddonGroupRules((prev) => ({ ...prev, [g.id]: { ...(prev[g.id] || { minSelect: 0, maxSelect: 1 }), isRequired: e.target.checked, minSelect: e.target.checked ? Math.max(1, prev[g.id]?.minSelect || 1) : Math.min(prev[g.id]?.minSelect || 0, prev[g.id]?.maxSelect || 1) } }))}/>Obrigatório</label>
                <label> Mínimo <input type="number" min="0" max="30" value={addonGroupRules[g.id]?.minSelect ?? 0} onChange={(e) => setAddonGroupRules((prev) => ({ ...prev, [g.id]: { ...(prev[g.id] || { isRequired: false, maxSelect: 1 }), minSelect: Math.max(0, Number(e.target.value) || 0) } }))} className="w-14 ml-1 bg-[#F9FAFB] border border-[#343B49] rounded px-1 py-1"/></label>
                <label> Máximo <input type="number" min="1" max="30" value={addonGroupRules[g.id]?.maxSelect ?? 1} onChange={(e) => setAddonGroupRules((prev) => ({ ...prev, [g.id]: { ...(prev[g.id] || { isRequired: false, minSelect: 0 }), maxSelect: Math.max(1, Number(e.target.value) || 1) } }))} className="w-14 ml-1 bg-[#F9FAFB] border border-[#343B49] rounded px-1 py-1"/></label>
                <button type="button" onClick={() => { const rule = addonGroupRules[g.id] || { isRequired: false, minSelect: 0, maxSelect: 1 }; if (rule.minSelect > rule.maxSelect || (rule.isRequired && rule.minSelect < 1)) { showNotice('Revise mínimo e máximo deste grupo.', 'err'); return; } void getSupabaseClient().from('addon_groups').update({ is_required: rule.isRequired, min_select: rule.minSelect, max_select: rule.maxSelect }).eq('tenant_id', workspaceId).eq('id', g.id).then(({ error }) => { if (error) showNotice(error.message, 'err'); else { showNotice('Regras do grupo atualizadas.'); void refreshCustomCatalog(); } }); }} className="text-[#EAB308] underline">Salvar regras</button>
              </div><div className="flex flex-wrap gap-2">{g.options.map((o) => <span key={o.id} className="text-xs px-2 py-1 rounded bg-[#F9FAFB] text-[#4B5563]">{o.name} · {formatCurrencyBRL(o.price)}</span>)}</div><div className="grid grid-cols-1 sm:grid-cols-[1fr_110px_auto] gap-2"><input value={optionDrafts[g.id]?.name || ''} onChange={(e) => setOptionDrafts((p) => ({ ...p, [g.id]: { name: e.target.value, price: p[g.id]?.price || '' } }))} placeholder="Opção" className="min-h-[40px] px-3 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] text-xs text-white"/><input type="number" min="0" step="0.01" value={optionDrafts[g.id]?.price || ''} onChange={(e) => setOptionDrafts((p) => ({ ...p, [g.id]: { name: p[g.id]?.name || '', price: e.target.value } }))} placeholder="Preço" className="min-h-[40px] px-3 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] text-xs text-white"/><button type="button" disabled={catalogBusy || !optionDrafts[g.id]?.name?.trim()} onClick={() => void addAddonOption(g.id)} className="px-3 rounded-lg bg-[#EAB308] text-[#F9FAFB] text-xs font-bold">Adicionar</button></div></div>)}
          </div>
        </section>
      )}

      {/* PRODUCTS TAB */}
      {sectionTab === 'products' && (
        <div className="space-y-4">
          {productFormOpen && (
            <form
              onSubmit={(e) => void handleSaveProduct(e)}
              className="bg-[#FFFFFF] border border-[#EAB308]/40 rounded-2xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
                <h3 className="text-sm font-bold text-[#111827]">
                  {editingProduct ? `Editar ${editingProduct.name}` : 'Cadastrar Produto'}
                </h3>
                <button
                  type="button"
                  onClick={() => setProductFormOpen(false)}
                  aria-label="Fechar formulário de produto"
                  className="min-w-[38px] min-h-[38px] rounded-lg border border-[#E5E7EB] flex items-center justify-center text-[#6B7280] hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="prod-name" className="block text-xs font-medium text-[#4B5563] mb-1.5">
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
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827]"
                  />
                </div>

                <div>
                  <label htmlFor="prod-cat" className="block text-xs font-medium text-[#4B5563] mb-1.5">
                    Categoria
                  </label>
                  <select
                    id="prod-cat"
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value as ProductCategory)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827]"
                  >
                    {customCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <section className="rounded-xl border border-[#343B49] bg-[#F9FAFB] p-3 space-y-2">
                <div><h4 className="text-xs font-bold text-[#111827]">Grupos de adicionais deste produto</h4><p className="text-[11px] text-[#6B7280]">Selecione os grupos que o cliente poderá escolher no cardápio. Um grupo pode ser reutilizado em vários produtos.</p></div>
                {addonGroups.length === 0 ? <p className="text-xs text-[#6B7280]">Crie primeiro um grupo de adicionais nesta tela.</p> : addonGroups.map((group) => <label key={group.id} className="flex items-center gap-2 py-1 text-xs text-[#4B5563]"><input type="checkbox" checked={selectedAddonGroupIds.includes(group.id)} onChange={(e) => setSelectedAddonGroupIds((prev) => e.target.checked ? [...prev, group.id] : prev.filter((id) => id !== group.id))} className="accent-[#EAB308]"/><span>{group.name} · {group.options.length} opções</span></label>)}
              </section>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div>
                  <label htmlFor="prod-price" className="block text-xs font-medium text-[#4B5563] mb-1.5">
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
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] focus:border-[#EAB308] focus:outline-none text-sm text-[#111827] font-mono tabular-nums"
                  />
                </div>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2.5 text-xs text-[#4B5563] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prodCountsXSalada}
                      onChange={(e) => setProdCountsXSalada(e.target.checked)}
                      className="w-4 h-4 accent-[#EAB308]"
                    />
                    Contabiliza como X-Salada nos indicadores
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-[#4B5563] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prodActive}
                      onChange={(e) => setProdActive(e.target.checked)}
                      className="w-4 h-4 accent-[#EAB308]"
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
                  className="min-h-[44px] px-5 rounded-xl bg-[#EAB308] hover:bg-[#F5C842] text-[#F9FAFB] text-xs font-bold cursor-pointer disabled:opacity-60"
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
                  className="min-h-[44px] px-4 rounded-xl border border-[#E5E7EB] text-xs font-medium text-[#4B5563] cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {products.length === 0 ? (
            <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl p-8 text-center space-y-2">
              <p className="text-sm font-medium text-[#4B5563]">
                Nenhum produto cadastrado ainda.
              </p>
              <p className="text-xs text-[#6B7280]">
                Cadastre seus lanches e bebidas para utilizá-los em vendas individuais e na montagem de combos.
              </p>
            </div>
          ) : (
            <div className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl divide-y divide-[#E5E7EB]">
              {products.map((p) => (
                <div
                  key={p.id}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    p.active ? '' : 'opacity-65'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] overflow-hidden flex items-center justify-center shrink-0">
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
                        <span className="text-sm font-semibold text-[#111827] truncate">
                          {p.name}
                        </span>
                        <span
                          className={`text-[11px] font-semibold ${
                            p.active ? 'text-[#22C55E]' : 'text-[#6B7280]'
                          }`}
                        >
                          · {p.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      <p className="text-xs text-[#6B7280] font-mono tabular-nums">
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
                      className="min-h-[38px] px-3 rounded-lg border border-[#E5E7EB] hover:border-[#EAB308]/60 text-xs text-[#4B5563] hover:text-[#EAB308] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggleProductActive(p)}
                      aria-label={p.active ? `Desativar produto ${p.name}` : `Ativar produto ${p.name}`}
                      className="min-h-[38px] px-3 rounded-lg border border-[#E5E7EB] hover:border-[#374151] text-xs text-[#4B5563] inline-flex items-center gap-1.5 cursor-pointer"
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
