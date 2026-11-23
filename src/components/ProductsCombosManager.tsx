import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../lib/supabase';
import {
  AlertCircle,
  Check,
  ChevronDown,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  Link2,
  Loader2,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react';
import { deleteTenantMenuImage } from '../services/storageService';
import type {
  ComboInput,
  ComboProductItem,
  ComboRecord,
  ProductCategory,
  ProductInput,
  ProductRecord,
} from '../types/finance';
import {
  buildCatalogCategories,
  buildSelectableCategoryNames,
  computeCatalogStats,
  filterAddonGroupsForCatalog,
  filterCombosForCatalog,
  filterProductsForCatalog,
  validateAddonGroupRules,
  type AddonGroupRuleInput,
  type CatalogAddonGroup,
  type CatalogAddonOption,
  type CatalogCategoryRecord,
  type CatalogSectionTab,
  type CatalogStatusFilter,
  type RawCategoryRow,
} from '../utils/catalogSummary';
import { formatCurrencyBRL } from '../utils/finance';
import { generateDraftEntityId } from '../utils/imageUpload';
import {
  AddonGroupFormModal,
  AddonOptionEditModal,
  CatalogConfirmDeleteModal,
  CategoryFormModal,
  ComboFormModal,
  ProductFormModal,
} from './CatalogModals';

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
  isLoading?: boolean;
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
  isLoading = false,
}: ProductsCombosManagerProps) {
  const effectiveWorkspaceId = workspaceId || 'mgw_lanches';

  const [sectionTab, setSectionTab] = useState<CatalogSectionTab>('products');
  const [feedback, setFeedback] = useState<{
    text: string;
    type: 'ok' | 'err';
  } | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  // Remote catalog data (categories, addon groups, options, links)
  const [rawCategories, setRawCategories] = useState<RawCategoryRow[]>([]);
  const [addonGroups, setAddonGroups] = useState<CatalogAddonGroup[]>([]);
  const [addonGroupRules, setAddonGroupRules] = useState<
    Record<string, AddonGroupRuleInput>
  >({});
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(false);

  // Search & filters per section
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('all');
  const [productStatusFilter, setProductStatusFilter] =
    useState<CatalogStatusFilter>('all');

  const [comboSearch, setComboSearch] = useState('');
  const [comboStatusFilter, setComboStatusFilter] =
    useState<CatalogStatusFilter>('all');

  const [categorySearch, setCategorySearch] = useState('');
  const [addonSearch, setAddonSearch] = useState('');

  // Quick inline option add drafts per group
  const [optionDrafts, setOptionDrafts] = useState<
    Record<string, { name: string; price: string }>
  >({});

  // Product modal state
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(
    null,
  );
  const [draftProductId, setDraftProductId] = useState('');
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState<ProductCategory>('Lanche');
  const [prodPrice, setProdPrice] = useState(String(defaultXSaladaPrice));
  const [prodCountsXSalada, setProdCountsXSalada] = useState(false);
  const [prodActive, setProdActive] = useState(true);
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [prodImagePath, setProdImagePath] = useState('');
  const [uploadingProdImage, setUploadingProdImage] = useState(false);
  const [selectedAddonGroupIds, setSelectedAddonGroupIds] = useState<string[]>(
    [],
  );
  const [savingProduct, setSavingProduct] = useState(false);
  const [productModalError, setProductModalError] = useState<string | null>(
    null,
  );
  const [brokenProductImages, setBrokenProductImages] = useState<
    Record<string, boolean>
  >({});

  // Combo modal state
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
  const [comboModalError, setComboModalError] = useState<string | null>(null);
  const [brokenComboImages, setBrokenComboImages] = useState<
    Record<string, boolean>
  >({});

  // Category modal state
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<CatalogCategoryRecord | null>(null);
  const [categoryNameDraft, setCategoryNameDraft] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryModalError, setCategoryModalError] = useState<string | null>(
    null,
  );

  // Addon Group modal state
  const [addonGroupModalOpen, setAddonGroupModalOpen] = useState(false);
  const [editingAddonGroup, setEditingAddonGroup] =
    useState<CatalogAddonGroup | null>(null);
  const [addonGroupNameDraft, setAddonGroupNameDraft] = useState('');
  const [addonGroupRuleDraft, setAddonGroupRuleDraft] =
    useState<AddonGroupRuleInput>({
      isRequired: false,
      minSelect: 0,
      maxSelect: 1,
    });
  const [addonGroupLinkedProductIds, setAddonGroupLinkedProductIds] = useState<
    string[]
  >([]);
  const [savingAddonGroup, setSavingAddonGroup] = useState(false);
  const [addonGroupModalError, setAddonGroupModalError] = useState<
    string | null
  >(null);

  // Addon Option edit modal state
  const [editingAddonOption, setEditingAddonOption] = useState<{
    option: CatalogAddonOption;
    groupName: string;
  } | null>(null);
  const [addonOptionNameDraft, setAddonOptionNameDraft] = useState('');
  const [addonOptionPriceDraft, setAddonOptionPriceDraft] = useState('');
  const [savingAddonOption, setSavingAddonOption] = useState(false);
  const [addonOptionModalError, setAddonOptionModalError] = useState<
    string | null
  >(null);

  // Unified delete confirmation state
  const [confirmDelete, setConfirmDelete] = useState<{
    kind: 'category' | 'addon_group' | 'addon_option';
    title: string;
    description: string;
    confirmLabel: string;
    id: string;
    name?: string;
    active?: boolean;
  } | null>(null);
  const [deletingEntity, setDeletingEntity] = useState(false);

  const showNotice = useCallback(
    (text: string, type: 'ok' | 'err' = 'ok') => {
      setFeedback({ text, type });
      setTimeout(() => {
        setFeedback((prev) => (prev?.text === text ? null : prev));
      }, 4500);
    },
    [],
  );

  const refreshCustomCatalog = useCallback(async () => {
    if (!workspaceId) return;
    setLoadingCatalog(true);
    setCatalogError(null);
    try {
      const supabase = getSupabaseClient();
      const [catsRes, groupsRes, linksRes] = await Promise.all([
        supabase
          .from('product_categories')
          .select('id,name,sort_order,active')
          .eq('tenant_id', workspaceId)
          .order('sort_order'),
        supabase
          .from('addon_groups')
          .select(
            'id,name,is_required,min_select,max_select,active,sort_order,addon_options(id,group_id,name,price,active,sort_order)',
          )
          .eq('tenant_id', workspaceId)
          .eq('active', true)
          .order('sort_order'),
        supabase
          .from('product_addon_groups')
          .select('product_id,group_id')
          .eq('tenant_id', workspaceId),
      ]);

      if (catsRes.error) throw catsRes.error;
      if (groupsRes.error) throw groupsRes.error;

      setRawCategories(
        (catsRes.data || []).map((r) => ({
          id: String(r.id),
          name: String(r.name),
          sort_order: Number(r.sort_order) || 0,
          active: r.active !== false,
        })),
      );

      const linksByGroup = new Map<string, string[]>();
      if (!linksRes.error && Array.isArray(linksRes.data)) {
        for (const row of linksRes.data) {
          const gid = String(row.group_id);
          const pid = String(row.product_id);
          const list = linksByGroup.get(gid) ?? [];
          list.push(pid);
          linksByGroup.set(gid, list);
        }
      }

      const mappedGroups: CatalogAddonGroup[] = (groupsRes.data || []).map(
        (r: Record<string, unknown>) => {
          const id = String(r.id);
          const rawOpts = Array.isArray(r.addon_options)
            ? (r.addon_options as Array<Record<string, unknown>>)
            : [];
          const options: CatalogAddonOption[] = rawOpts
            .filter((o) => o.active !== false)
            .map((o) => ({
              id: String(o.id),
              groupId: String(o.group_id || id),
              name: String(o.name),
              price: Number(o.price) || 0,
              active: o.active !== false,
              sortOrder: Number(o.sort_order) || 0,
            }))
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR'));

          return {
            id,
            name: String(r.name),
            isRequired: Boolean(r.is_required),
            minSelect: Number(r.min_select) || 0,
            maxSelect: Math.max(1, Number(r.max_select) || 1),
            active: r.active !== false,
            sortOrder: Number(r.sort_order) || 0,
            options,
            linkedProductIds: linksByGroup.get(id) ?? [],
          };
        },
      );

      setAddonGroups(mappedGroups);
      setAddonGroupRules(
        Object.fromEntries(
          mappedGroups.map((g) => [
            g.id,
            {
              isRequired: g.isRequired,
              minSelect: g.minSelect,
              maxSelect: g.maxSelect,
            },
          ]),
        ),
      );
    } catch (err) {
      setCatalogError(
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar categorias e adicionais.',
      );
    } finally {
      setLoadingCatalog(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void refreshCustomCatalog();
  }, [refreshCustomCatalog]);

  const categories = useMemo(
    () => buildCatalogCategories(rawCategories, products),
    [rawCategories, products],
  );

  const selectableCategoryNames = useMemo(
    () => buildSelectableCategoryNames(categories),
    [categories],
  );

  const filteredProducts = useMemo(
    () =>
      filterProductsForCatalog(products, {
        search: productSearch,
        category: productCategoryFilter,
        status: productStatusFilter,
      }),
    [products, productSearch, productCategoryFilter, productStatusFilter],
  );

  const filteredCombos = useMemo(
    () =>
      filterCombosForCatalog(combos, {
        search: comboSearch,
        status: comboStatusFilter,
      }),
    [combos, comboSearch, comboStatusFilter],
  );

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, categorySearch]);

  const filteredAddonGroups = useMemo(
    () => filterAddonGroupsForCatalog(addonGroups, addonSearch),
    [addonGroups, addonSearch],
  );

  const catalogStats = useMemo(
    () => computeCatalogStats(products, combos, categories, addonGroups),
    [products, combos, categories, addonGroups],
  );

  const productNameById = useMemo(
    () => new Map(products.map((p) => [p.id, p.name])),
    [products],
  );

  // ---------------- PRODUCT HANDLERS ----------------
  function openNewProduct() {
    setEditingProduct(null);
    setDraftProductId(generateDraftEntityId('prod'));
    setProdName('');
    setProdCategory(selectableCategoryNames[0] || 'Lanche');
    setProdPrice('');
    setProdCountsXSalada(false);
    setProdActive(true);
    setProdImageUrl('');
    setProdImagePath('');
    setSelectedAddonGroupIds([]);
    setProductModalError(null);
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
    setProductModalError(null);

    const prelinked = addonGroups
      .filter((g) => g.linkedProductIds.includes(p.id))
      .map((g) => g.id);
    setSelectedAddonGroupIds(prelinked);
    setProductFormOpen(true);

    if (workspaceId) {
      void getSupabaseClient()
        .from('product_addon_groups')
        .select('group_id')
        .eq('tenant_id', workspaceId)
        .eq('product_id', p.id)
        .then(({ data, error }) => {
          if (!error && data) {
            setSelectedAddonGroupIds(data.map((row) => String(row.group_id)));
          }
        });
    }
  }

  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (savingProduct || uploadingProdImage) return;
    setProductModalError(null);

    const cleanName = prodName.trim();
    const parsedPrice = Number(String(prodPrice).replace(',', '.'));
    if (!cleanName) {
      setProductModalError('Informe o nome do produto.');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setProductModalError('Informe um preço válido para o produto.');
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
        showNotice('Produto atualizado com sucesso.');
      } else {
        savedProductId = await onCreateProduct({
          ...payload,
          preferredId: draftProductId || undefined,
        });
        showNotice('Produto cadastrado com sucesso.');
      }

      if (workspaceId) {
        const supabase = getSupabaseClient();
        const { error: clearLinksError } = await supabase
          .from('product_addon_groups')
          .delete()
          .eq('tenant_id', workspaceId)
          .eq('product_id', savedProductId);
        if (clearLinksError) throw clearLinksError;

        if (selectedAddonGroupIds.length > 0) {
          const { error: linkError } = await supabase
            .from('product_addon_groups')
            .insert(
              selectedAddonGroupIds.map((groupId, index) => ({
                tenant_id: workspaceId,
                product_id: savedProductId,
                group_id: groupId,
                sort_order: index,
              })),
            );
          if (linkError) throw linkError;
        }
        await refreshCustomCatalog();
      }

      setProductFormOpen(false);
      setEditingProduct(null);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao salvar produto.';
      setProductModalError(msg);
      showNotice(msg, 'err');
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
      showNotice(
        p.active
          ? `Produto "${p.name}" desativado.`
          : `Produto "${p.name}" reativado.`,
      );
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Erro ao atualizar produto.',
        'err',
      );
    }
  }

  // ---------------- COMBO HANDLERS ----------------
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
    setComboModalError(null);
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
    setSelectedProdToAdd(activeProducts[0]?.id ?? products[0]?.id ?? '');
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
    setComboModalError(null);
    const firstAvail =
      products.find((p) => p.active)?.id ?? products[0]?.id ?? '';
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
    setComboModalError(null);

    const cleanName = comboName.trim();
    const parsedPrice = Number(String(comboPrice).replace(',', '.'));
    const parsedCost = comboCost.trim()
      ? Number(String(comboCost).replace(',', '.'))
      : 0;

    if (!cleanName) {
      setComboModalError('Informe o nome do combo.');
      return;
    }
    if (comboItems.length === 0) {
      setComboModalError('Adicione pelo menos 1 produto na composição do combo.');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setComboModalError('Informe um preço de venda válido para o combo.');
      return;
    }
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      setComboModalError(
        'Informe um custo estimado válido (ou deixe em branco).',
      );
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
      const msg = err instanceof Error ? err.message : 'Erro ao salvar combo.';
      setComboModalError(msg);
      showNotice(msg, 'err');
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
      showNotice(
        c.active ? `Combo "${c.name}" desativado.` : `Combo "${c.name}" reativado.`,
      );
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Erro ao atualizar combo.',
        'err',
      );
    }
  }

  // ---------------- CATEGORY HANDLERS ----------------
  function openNewCategoryModal() {
    setEditingCategory(null);
    setCategoryNameDraft('');
    setCategoryModalError(null);
    setCategoryModalOpen(true);
  }

  function openEditCategoryModal(cat: CatalogCategoryRecord) {
    setEditingCategory(cat);
    setCategoryNameDraft(cat.name);
    setCategoryModalError(null);
    setCategoryModalOpen(true);
  }

  async function handleSaveCategory(e: React.FormEvent) {
    e.preventDefault();
    if (savingCategory) return;
    setCategoryModalError(null);

    const name = categoryNameDraft.trim();
    if (!name || name.length > 60) {
      setCategoryModalError(
        'Informe um nome válido para a categoria (até 60 caracteres).',
      );
      return;
    }

    const duplicate = categories.some(
      (c) =>
        c.name.toLowerCase() === name.toLowerCase() &&
        c.name.toLowerCase() !== editingCategory?.name.toLowerCase(),
    );
    if (duplicate) {
      setCategoryModalError('Já existe uma categoria com este nome.');
      return;
    }

    setSavingCategory(true);
    try {
      const supabase = getSupabaseClient();
      if (editingCategory?.id) {
        const { error } = await supabase
          .from('product_categories')
          .update({ name, updated_at: new Date().toISOString() })
          .eq('id', editingCategory.id)
          .eq('tenant_id', workspaceId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('product_categories').insert({
          tenant_id: workspaceId,
          name,
          sort_order: categories.length,
        });
        if (error) throw error;
      }

      // Preserve existing product-category association when a category is renamed
      if (
        editingCategory &&
        editingCategory.name.toLowerCase() !== name.toLowerCase()
      ) {
        const linkedProducts = products.filter(
          (p) =>
            p.category.trim().toLowerCase() ===
            editingCategory.name.trim().toLowerCase(),
        );
        for (const prod of linkedProducts) {
          await onUpdateProduct(prod.id, {
            name: prod.name,
            category: name,
            unitPrice: prod.unitPrice,
            countsAsXSalada: prod.countsAsXSalada,
            active: prod.active,
            imageUrl: prod.imageUrl || '',
            imagePath: prod.imagePath || '',
          });
        }
      }

      await refreshCustomCatalog();
      showNotice(
        editingCategory
          ? 'Categoria atualizada com sucesso.'
          : 'Categoria criada com sucesso.',
      );
      setCategoryModalOpen(false);
      setEditingCategory(null);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Falha ao salvar categoria.';
      setCategoryModalError(msg);
      showNotice(msg, 'err');
    } finally {
      setSavingCategory(false);
    }
  }

  async function handleToggleCategoryActive(cat: CatalogCategoryRecord) {
    if (!cat.id) {
      // Persist legacy category first if toggling
      setCatalogBusy(true);
      try {
        const { error } = await getSupabaseClient()
          .from('product_categories')
          .insert({
            tenant_id: workspaceId,
            name: cat.name,
            sort_order: cat.sortOrder,
            active: !cat.active,
          });
        if (error) throw error;
        await refreshCustomCatalog();
        showNotice(`Categoria "${cat.name}" atualizada.`);
      } catch (err) {
        showNotice(
          err instanceof Error ? err.message : 'Erro ao atualizar categoria.',
          'err',
        );
      } finally {
        setCatalogBusy(false);
      }
      return;
    }

    setCatalogBusy(true);
    try {
      const { error } = await getSupabaseClient()
        .from('product_categories')
        .update({ active: !cat.active, updated_at: new Date().toISOString() })
        .eq('id', cat.id)
        .eq('tenant_id', workspaceId);
      if (error) throw error;
      await refreshCustomCatalog();
      showNotice(
        cat.active
          ? `Categoria "${cat.name}" desativada.`
          : `Categoria "${cat.name}" reativada.`,
      );
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Erro ao atualizar categoria.',
        'err',
      );
    } finally {
      setCatalogBusy(false);
    }
  }

  // ---------------- ADDON GROUP & OPTION HANDLERS ----------------
  function openNewAddonGroupModal() {
    setEditingAddonGroup(null);
    setAddonGroupNameDraft('');
    setAddonGroupRuleDraft({ isRequired: false, minSelect: 0, maxSelect: 1 });
    setAddonGroupLinkedProductIds([]);
    setAddonGroupModalError(null);
    setAddonGroupModalOpen(true);
  }

  function openEditAddonGroupModal(group: CatalogAddonGroup) {
    setEditingAddonGroup(group);
    setAddonGroupNameDraft(group.name);
    setAddonGroupRuleDraft({
      isRequired: group.isRequired,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
    });
    setAddonGroupLinkedProductIds([...group.linkedProductIds]);
    setAddonGroupModalError(null);
    setAddonGroupModalOpen(true);
  }

  async function handleSaveAddonGroup(e: React.FormEvent) {
    e.preventDefault();
    if (savingAddonGroup) return;
    setAddonGroupModalError(null);

    const name = addonGroupNameDraft.trim();
    if (!name || name.length > 80) {
      setAddonGroupModalError(
        'Informe um nome válido para o grupo (até 80 caracteres).',
      );
      return;
    }
    const ruleValidation = validateAddonGroupRules(addonGroupRuleDraft);
    if (ruleValidation) {
      setAddonGroupModalError(ruleValidation);
      return;
    }

    setSavingAddonGroup(true);
    try {
      const supabase = getSupabaseClient();
      let targetGroupId = editingAddonGroup?.id || '';

      if (editingAddonGroup) {
        const { error } = await supabase
          .from('addon_groups')
          .update({
            name,
            is_required: addonGroupRuleDraft.isRequired,
            min_select: addonGroupRuleDraft.minSelect,
            max_select: addonGroupRuleDraft.maxSelect,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingAddonGroup.id)
          .eq('tenant_id', workspaceId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('addon_groups')
          .insert({
            tenant_id: workspaceId,
            name,
            is_required: addonGroupRuleDraft.isRequired,
            min_select: addonGroupRuleDraft.minSelect,
            max_select: addonGroupRuleDraft.maxSelect,
            sort_order: addonGroups.length,
          })
          .select('id')
          .single();
        if (error) throw error;
        targetGroupId = String((data as { id: string }).id);
      }

      if (targetGroupId) {
        const { error: clearErr } = await supabase
          .from('product_addon_groups')
          .delete()
          .eq('tenant_id', workspaceId)
          .eq('group_id', targetGroupId);
        if (clearErr) throw clearErr;

        if (addonGroupLinkedProductIds.length > 0) {
          const { error: insertLinkErr } = await supabase
            .from('product_addon_groups')
            .insert(
              addonGroupLinkedProductIds.map((productId, idx) => ({
                tenant_id: workspaceId,
                product_id: productId,
                group_id: targetGroupId,
                sort_order: idx,
              })),
            );
          if (insertLinkErr) throw insertLinkErr;
        }
      }

      await refreshCustomCatalog();
      showNotice(
        editingAddonGroup
          ? 'Grupo de adicionais atualizado.'
          : 'Grupo de adicionais criado.',
      );
      setAddonGroupModalOpen(false);
      setEditingAddonGroup(null);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Falha ao salvar grupo de adicionais.';
      setAddonGroupModalError(msg);
      showNotice(msg, 'err');
    } finally {
      setSavingAddonGroup(false);
    }
  }

  async function handleSaveInlineGroupRules(groupId: string) {
    const rule = addonGroupRules[groupId] || {
      isRequired: false,
      minSelect: 0,
      maxSelect: 1,
    };
    const validationErr = validateAddonGroupRules(rule);
    if (validationErr) {
      showNotice(validationErr, 'err');
      return;
    }

    setCatalogBusy(true);
    try {
      const { error } = await getSupabaseClient()
        .from('addon_groups')
        .update({
          is_required: rule.isRequired,
          min_select: rule.minSelect,
          max_select: rule.maxSelect,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', workspaceId)
        .eq('id', groupId);
      if (error) throw error;
      showNotice('Regras do grupo atualizadas.');
      await refreshCustomCatalog();
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Erro ao atualizar regras.',
        'err',
      );
    } finally {
      setCatalogBusy(false);
    }
  }

  async function addAddonOption(groupId: string) {
    const draft = optionDrafts[groupId];
    const name = draft?.name.trim() || '';
    const price = Number(String(draft?.price || '0').replace(',', '.'));
    if (!name || name.length > 80) {
      showNotice('Informe o nome do adicional ou sabor.', 'err');
      return;
    }
    if (!Number.isFinite(price) || price < 0 || price > 10000) {
      showNotice('Informe um preço válido para o adicional.', 'err');
      return;
    }
    setCatalogBusy(true);
    try {
      const group = addonGroups.find((g) => g.id === groupId);
      const { error } = await getSupabaseClient()
        .from('addon_options')
        .insert({
          tenant_id: workspaceId,
          group_id: groupId,
          name,
          price,
          sort_order: group?.options.length ?? 0,
        });
      if (error) throw error;
      setOptionDrafts((prev) => ({
        ...prev,
        [groupId]: { name: '', price: '' },
      }));
      await refreshCustomCatalog();
      showNotice('Opção adicionada com sucesso.');
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Falha ao adicionar opção.',
        'err',
      );
    } finally {
      setCatalogBusy(false);
    }
  }

  function openEditAddonOptionModal(
    option: CatalogAddonOption,
    groupName: string,
  ) {
    setEditingAddonOption({ option, groupName });
    setAddonOptionNameDraft(option.name);
    setAddonOptionPriceDraft(String(option.price));
    setAddonOptionModalError(null);
  }

  async function handleSaveAddonOptionEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAddonOption || savingAddonOption) return;
    setAddonOptionModalError(null);

    const name = addonOptionNameDraft.trim();
    const price = Number(String(addonOptionPriceDraft || '0').replace(',', '.'));
    if (!name || name.length > 80) {
      setAddonOptionModalError('Informe um nome válido (até 80 caracteres).');
      return;
    }
    if (!Number.isFinite(price) || price < 0 || price > 10000) {
      setAddonOptionModalError('Informe um preço válido entre R$ 0,00 e R$ 10.000,00.');
      return;
    }

    setSavingAddonOption(true);
    try {
      const { error } = await getSupabaseClient()
        .from('addon_options')
        .update({
          name,
          price,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingAddonOption.option.id)
        .eq('tenant_id', workspaceId);
      if (error) throw error;
      await refreshCustomCatalog();
      showNotice('Opção atualizada com sucesso.');
      setEditingAddonOption(null);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao atualizar opção.';
      setAddonOptionModalError(msg);
      showNotice(msg, 'err');
    } finally {
      setSavingAddonOption(false);
    }
  }

  // ---------------- DELETE CONFIRM HANDLER ----------------
  async function handleExecuteConfirmDelete() {
    if (!confirmDelete || deletingEntity) return;
    setDeletingEntity(true);
    try {
      const supabase = getSupabaseClient();
      if (confirmDelete.kind === 'category') {
        const { error } = await supabase
          .from('product_categories')
          .delete()
          .eq('id', confirmDelete.id)
          .eq('tenant_id', workspaceId);
        if (error) throw error;
        showNotice(`Categoria "${confirmDelete.name || ''}" excluída.`);
      } else if (confirmDelete.kind === 'addon_group') {
        const { error } = await supabase
          .from('addon_groups')
          .delete()
          .eq('id', confirmDelete.id)
          .eq('tenant_id', workspaceId);
        if (error) throw error;
        showNotice(`Grupo "${confirmDelete.name || ''}" excluído.`);
      } else if (confirmDelete.kind === 'addon_option') {
        const { error } = await supabase
          .from('addon_options')
          .delete()
          .eq('id', confirmDelete.id)
          .eq('tenant_id', workspaceId);
        if (error) throw error;
        showNotice(`Opção "${confirmDelete.name || ''}" excluída.`);
      }
      await refreshCustomCatalog();
      setConfirmDelete(null);
    } catch (err) {
      showNotice(
        err instanceof Error
          ? err.message
          : 'Não foi possível concluir a exclusão. Verifique suas permissões.',
        'err',
      );
    } finally {
      setDeletingEntity(false);
    }
  }

  async function handleSeedCatalog() {
    if (isSeeding) return;
    setIsSeeding(true);
    try {
      await onSeedCatalog();
      showNotice('Produtos e Combos 1 a 4 iniciais criados!');
    } catch (err) {
      showNotice(
        err instanceof Error
          ? err.message
          : 'Erro ao carregar catálogo inicial.',
        'err',
      );
    } finally {
      setIsSeeding(false);
    }
  }

  function renderPrimaryHeaderAction() {
    switch (sectionTab) {
      case 'products':
        return (
          <button
            type="button"
            onClick={openNewProduct}
            className="mgw-btn-primary whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Novo Produto</span>
          </button>
        );
      case 'combos':
        return (
          <button
            type="button"
            onClick={openNewCombo}
            disabled={products.length === 0}
            className="mgw-btn-primary whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Novo Combo</span>
          </button>
        );
      case 'categories':
        return (
          <button
            type="button"
            onClick={openNewCategoryModal}
            className="mgw-btn-primary whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Nova Categoria</span>
          </button>
        );
      case 'addons':
        return (
          <button
            type="button"
            onClick={openNewAddonGroupModal}
            className="mgw-btn-primary whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Novo Grupo</span>
          </button>
        );
    }
  }

  if (isLoading) {
    return (
      <div
        className="space-y-5"
        aria-busy="true"
        aria-label="Carregando Produtos e Catálogo"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="mgw-skeleton h-7 w-36 rounded-lg" />
            <div className="mgw-skeleton h-4 w-52 rounded-lg" />
          </div>
          <div className="mgw-skeleton h-10 w-36 rounded-xl" />
        </div>
        <div className="mgw-skeleton h-11 w-full max-w-md rounded-xl" />
        <div className="mgw-skeleton h-14 w-full rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="mgw-skeleton h-64 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 1. Cabeçalho da Tela de Catálogo (Produtos / Combos / Categorias / Adicionais) */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#172033] tracking-tight">
            Produtos
          </h2>
          <p className="text-xs sm:text-sm text-[#778094] mt-0.5">
            Gerencie{' '}
            <span className="font-semibold text-[#172033]">seu cardápio</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {renderPrimaryHeaderAction()}
        </div>
      </section>

      {/* Quick Seed Banner when empty */}
      {products.length === 0 && combos.length === 0 && (
        <section className="bg-[#FFFBEB] border border-[#FDE68A] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#172033] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#D97706]" />
              <span>Catálogo inicial de exemplo</span>
            </h3>
            <p className="text-xs text-[#778094] leading-relaxed">
              Cadastre manualmente seus itens ou crie com 1 toque os produtos
              base (X-Salada e Refrigerantes) e os Combos 1 a 4 para editar como
              quiser.
            </p>
          </div>
          <button
            type="button"
            disabled={isSeeding}
            onClick={() => void handleSeedCatalog()}
            className="mgw-btn-primary whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            {isSeeding ? 'Criando...' : 'Criar catálogo inicial'}
          </button>
        </section>
      )}

      {/* Feedback Toast */}
      {feedback && (
        <div
          role="status"
          className={`px-4 py-3 rounded-2xl border text-xs sm:text-[13px] font-medium flex items-center gap-2.5 ${
            feedback.type === 'ok'
              ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#16A36A]'
              : 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
          }`}
        >
          {feedback.type === 'ok' ? (
            <Check className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Catalog Sync Error Banner */}
      {catalogError && (
        <div
          role="alert"
          className="px-4 py-3 rounded-2xl bg-[#FEF2F2] border border-[#FECACA] text-xs sm:text-sm text-[#B91C1C] flex flex-wrap items-center justify-between gap-2.5"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">
              Não foi possível sincronizar categorias e adicionais:{' '}
              {catalogError}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void refreshCustomCatalog()}
            className="min-h-[34px] px-3 rounded-lg bg-white border border-[#FECACA] text-xs font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] inline-flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Tentar novamente</span>
          </button>
        </div>
      )}

      {/* 2. Navegação Segmentada das 4 Áreas (Produtos, Combos, Categorias, Adicionais) */}
      <div
        role="tablist"
        aria-label="Áreas do catálogo de produtos"
        className="inline-flex flex-wrap p-1 bg-white border border-[#E8EAF0] rounded-xl gap-1 shadow-[0_1px_2px_rgba(23,32,51,0.03)] max-w-full"
      >
        <button
          type="button"
          role="tab"
          aria-selected={sectionTab === 'products'}
          onClick={() => setSectionTab('products')}
          className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
            sectionTab === 'products'
              ? 'bg-[#FFF2BE] text-[#172033] font-bold shadow-[inset_0_0_0_1px_rgba(245,185,0,0.28)]'
              : 'text-[#778094] hover:text-[#172033]'
          }`}
        >
          <Package className="w-3.5 h-3.5 shrink-0" />
          <span>Produtos</span>
          <span className="font-mono tabular-nums text-[11px] opacity-80">
            ({catalogStats.totalProductsCount})
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={sectionTab === 'combos'}
          onClick={() => setSectionTab('combos')}
          className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
            sectionTab === 'combos'
              ? 'bg-[#FFF2BE] text-[#172033] font-bold shadow-[inset_0_0_0_1px_rgba(245,185,0,0.28)]'
              : 'text-[#778094] hover:text-[#172033]'
          }`}
        >
          <Layers className="w-3.5 h-3.5 shrink-0" />
          <span>Combos</span>
          <span className="font-mono tabular-nums text-[11px] opacity-80">
            ({catalogStats.totalCombosCount})
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={sectionTab === 'categories'}
          onClick={() => setSectionTab('categories')}
          className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
            sectionTab === 'categories'
              ? 'bg-[#FFF2BE] text-[#172033] font-bold shadow-[inset_0_0_0_1px_rgba(245,185,0,0.28)]'
              : 'text-[#778094] hover:text-[#172033]'
          }`}
        >
          <Tag className="w-3.5 h-3.5 shrink-0" />
          <span>Categorias</span>
          <span className="font-mono tabular-nums text-[11px] opacity-80">
            ({catalogStats.totalCategoriesCount})
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={sectionTab === 'addons'}
          onClick={() => setSectionTab('addons')}
          className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
            sectionTab === 'addons'
              ? 'bg-[#FFF2BE] text-[#172033] font-bold shadow-[inset_0_0_0_1px_rgba(245,185,0,0.28)]'
              : 'text-[#778094] hover:text-[#172033]'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
          <span>Adicionais</span>
          <span className="font-mono tabular-nums text-[11px] opacity-80">
            ({catalogStats.totalAddonGroupsCount})
          </span>
        </button>
      </div>

      {/* ==================== TAB 1: PRODUTOS ==================== */}
      {sectionTab === 'products' && (
        <div className="space-y-4">
          {/* Toolbar de Busca e Filtros (fiel à referência) */}
          <div className="bg-white border border-[#E8EAF0] rounded-2xl p-3 sm:p-3.5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col md:flex-row gap-2.5">
            <div className="relative flex-1 min-w-0">
              <Search
                className="w-4 h-4 text-[#778094] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Buscar produtos"
                placeholder="Buscar produtos..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full min-h-[42px] pl-10 pr-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] focus:bg-white focus:border-[#F5B900] focus:outline-none text-xs sm:text-sm text-[#172033] placeholder:text-[#778094]"
              />
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
              <div className="relative flex-1 sm:flex-initial min-w-[180px]">
                <select
                  aria-label="Filtrar por categoria"
                  value={productCategoryFilter}
                  onChange={(e) => setProductCategoryFilter(e.target.value)}
                  className="w-full appearance-none min-h-[42px] pl-3.5 pr-9 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] focus:bg-white focus:border-[#F5B900] focus:outline-none text-xs sm:text-[13px] font-semibold text-[#172033] cursor-pointer"
                >
                  <option value="all">Todas as categorias</option>
                  {categories.map((cat) => (
                    <option key={cat.name} value={cat.name}>
                      {cat.name} ({cat.productCount})
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="w-4 h-4 text-[#778094] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
              </div>

              <div className="relative flex-1 sm:flex-initial min-w-[136px]">
                <select
                  aria-label="Filtrar por disponibilidade"
                  value={productStatusFilter}
                  onChange={(e) =>
                    setProductStatusFilter(e.target.value as CatalogStatusFilter)
                  }
                  className="w-full appearance-none min-h-[42px] pl-3.5 pr-8 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] focus:bg-white focus:border-[#F5B900] focus:outline-none text-xs sm:text-[13px] font-semibold text-[#172033] cursor-pointer"
                >
                  <option value="all">Todos ({catalogStats.totalProductsCount})</option>
                  <option value="active">
                    Ativos ({catalogStats.activeProductsCount})
                  </option>
                  <option value="inactive">
                    Inativos (
                    {catalogStats.totalProductsCount -
                      catalogStats.activeProductsCount}
                    )
                  </option>
                </select>
                <ChevronDown
                  className="w-4 h-4 text-[#778094] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>

          {products.length === 0 ? (
            <div className="bg-white border border-[#E8EAF0] rounded-2xl p-10 text-center space-y-3 shadow-[0_2px_8px_rgba(23,32,51,0.04)]">
              <div className="w-12 h-12 rounded-2xl bg-[#F7F8FC] border border-[#E8EAF0] text-[#778094] flex items-center justify-center mx-auto">
                <PackagePlus className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-[#172033]">
                  Nenhum produto cadastrado ainda.
                </p>
                <p className="text-xs text-[#778094] max-w-md mx-auto">
                  Cadastre seus lanches, pastéis e bebidas para utilizá-los nas
                  vendas, combos e no cardápio digital.
                </p>
              </div>
              <button
                type="button"
                onClick={openNewProduct}
                className="mgw-btn-primary inline-flex"
              >
                <Plus className="w-4 h-4" />
                <span>Cadastrar primeiro produto</span>
              </button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white border border-[#E8EAF0] rounded-2xl p-8 text-center space-y-2.5 shadow-[0_2px_8px_rgba(23,32,51,0.04)]">
              <p className="text-sm font-bold text-[#172033]">
                Nenhum produto encontrado para os filtros aplicados.
              </p>
              <button
                type="button"
                onClick={() => {
                  setProductSearch('');
                  setProductCategoryFilter('all');
                  setProductStatusFilter('all');
                }}
                className="mgw-btn-secondary"
              >
                Limpar filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProducts.map((p) => {
                const imgBroken = Boolean(brokenProductImages[p.id]);
                const linkedGroupsCount = addonGroups.filter((g) =>
                  g.linkedProductIds.includes(p.id),
                ).length;

                return (
                  <article
                    key={p.id}
                    className={`bg-white border border-[#E8EAF0] hover:border-[#D5D9E4] rounded-2xl overflow-hidden shadow-[0_2px_8px_rgba(23,32,51,0.04)] transition-all flex flex-col ${
                      p.active ? '' : 'opacity-75'
                    }`}
                  >
                    {/* Product Media */}
                    <div className="aspect-[4/3] bg-[#F7F8FC] border-b border-[#E8EAF0] overflow-hidden relative flex items-center justify-center">
                      {p.imageUrl && !imgBroken ? (
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenProductImages((prev) => ({
                              ...prev,
                              [p.id]: true,
                            }))
                          }
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-[#778094] gap-1.5">
                          <div className="w-11 h-11 rounded-2xl bg-white border border-[#E8EAF0] flex items-center justify-center">
                            <ImageIcon className="w-5 h-5 text-[#778094]" />
                          </div>
                          <span className="text-[11px] font-medium">
                            Sem imagem
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Product Body */}
                    <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <h3 className="text-sm font-bold text-[#172033] truncate">
                          {p.name}
                        </h3>
                        <p className="text-xs text-[#778094] flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-[#172033]/80">
                            {p.category}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`font-semibold ${
                              p.active ? 'text-[#16A36A]' : 'text-[#778094]'
                            }`}
                          >
                            {p.active ? 'Disponível' : 'Inativo'}
                          </span>
                          {linkedGroupsCount > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {linkedGroupsCount}{' '}
                                {linkedGroupsCount === 1 ? 'grupo' : 'grupos'}
                              </span>
                            </>
                          )}
                        </p>
                      </div>

                      <div className="pt-2.5 border-t border-[#E8EAF0] flex items-center justify-between gap-2">
                        <span className="text-base font-extrabold text-[#172033] font-mono tabular-nums">
                          {formatCurrencyBRL(p.unitPrice)}
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditProduct(p)}
                            aria-label={`Editar produto ${p.name}`}
                            className="min-h-[34px] px-2.5 rounded-lg bg-white border border-[#E8EAF0] hover:border-[#F5B900] text-xs font-semibold text-[#172033] inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5 text-[#778094]" />
                            <span>Editar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleProductActive(p)}
                            aria-label={
                              p.active
                                ? `Desativar produto ${p.name}`
                                : `Ativar produto ${p.name}`
                            }
                            title={p.active ? 'Desativar produto' : 'Ativar produto'}
                            className={`w-8 h-[34px] rounded-lg border flex items-center justify-center cursor-pointer transition-colors ${
                              p.active
                                ? 'bg-white border-[#E8EAF0] hover:border-[#FECACA] hover:bg-[#FEF2F2] text-[#778094] hover:text-[#E35D62]'
                                : 'bg-[#ECFDF5] border-[#A7F3D0] text-[#16A36A] hover:bg-[#D1FAE5]'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 2: COMBOS ==================== */}
      {sectionTab === 'combos' && (
        <div className="space-y-4">
          {products.length === 0 && (
            <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-2xl p-4 text-xs text-[#172033]">
              Cadastre primeiro os produtos (ex: X-Salada, Refrigerante 250 ml)
              na aba{' '}
              <button
                type="button"
                onClick={() => setSectionTab('products')}
                className="font-bold underline cursor-pointer"
              >
                Produtos
              </button>{' '}
              ou clique em <strong>Criar catálogo inicial</strong> acima para
              montar combos.
            </div>
          )}

          {/* Toolbar de Combos */}
          <div className="bg-white border border-[#E8EAF0] rounded-2xl p-3 sm:p-3.5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1 min-w-0">
              <Search
                className="w-4 h-4 text-[#778094] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Buscar combos"
                placeholder="Buscar combos por nome ou itens..."
                value={comboSearch}
                onChange={(e) => setComboSearch(e.target.value)}
                className="w-full min-h-[42px] pl-10 pr-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] focus:bg-white focus:border-[#F5B900] focus:outline-none text-xs sm:text-sm text-[#172033] placeholder:text-[#778094]"
              />
            </div>

            <div className="relative sm:min-w-[156px]">
              <select
                aria-label="Filtrar status de combos"
                value={comboStatusFilter}
                onChange={(e) =>
                  setComboStatusFilter(e.target.value as CatalogStatusFilter)
                }
                className="w-full appearance-none min-h-[42px] pl-3.5 pr-8 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] focus:bg-white focus:border-[#F5B900] focus:outline-none text-xs sm:text-[13px] font-semibold text-[#172033] cursor-pointer"
              >
                <option value="all">Todos ({catalogStats.totalCombosCount})</option>
                <option value="active">
                  Ativos ({catalogStats.activeCombosCount})
                </option>
                <option value="inactive">
                  Inativos (
                  {catalogStats.totalCombosCount - catalogStats.activeCombosCount}
                  )
                </option>
              </select>
              <ChevronDown
                className="w-4 h-4 text-[#778094] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
            </div>
          </div>

          {combos.length === 0 ? (
            <div className="bg-white border border-[#E8EAF0] rounded-2xl p-10 text-center space-y-3 shadow-[0_2px_8px_rgba(23,32,51,0.04)]">
              <div className="w-12 h-12 rounded-2xl bg-[#F7F8FC] border border-[#E8EAF0] text-[#778094] flex items-center justify-center mx-auto">
                <Layers className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-[#172033]">
                  Nenhum combo cadastrado ainda.
                </p>
                <p className="text-xs text-[#778094] max-w-md mx-auto">
                  Agrupe lanches e bebidas em combos promocionais para agilizar
                  o registro de vendas e destacar ofertas no cardápio digital.
                </p>
              </div>
              <button
                type="button"
                disabled={products.length === 0}
                onClick={openNewCombo}
                className="mgw-btn-primary inline-flex disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>Criar primeiro combo</span>
              </button>
            </div>
          ) : filteredCombos.length === 0 ? (
            <div className="bg-white border border-[#E8EAF0] rounded-2xl p-8 text-center space-y-2.5 shadow-[0_2px_8px_rgba(23,32,51,0.04)]">
              <p className="text-sm font-bold text-[#172033]">
                Nenhum combo encontrado para os filtros aplicados.
              </p>
              <button
                type="button"
                onClick={() => {
                  setComboSearch('');
                  setComboStatusFilter('all');
                }}
                className="mgw-btn-secondary"
              >
                Limpar filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredCombos.map((c) => {
                const xSaladasInCombo = c.items.reduce(
                  (acc, i) => (i.countsAsXSalada ? acc + i.quantity : acc),
                  0,
                );
                const imgBroken = Boolean(brokenComboImages[c.id]);

                return (
                  <article
                    key={c.id}
                    className={`bg-white border border-[#E8EAF0] hover:border-[#D5D9E4] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] transition-all flex flex-col justify-between gap-4 ${
                      c.active ? '' : 'opacity-75'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-14 h-14 rounded-xl border border-[#E8EAF0] bg-[#F7F8FC] overflow-hidden flex items-center justify-center shrink-0">
                          {c.imageUrl && !imgBroken ? (
                            <img
                              src={c.imageUrl}
                              alt={c.name}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setBrokenComboImages((prev) => ({
                                  ...prev,
                                  [c.id]: true,
                                }))
                              }
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="w-5 h-5 text-[#778094]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-bold text-[#172033] truncate">
                              {c.name}
                            </h3>
                            <span
                              className={`text-[11px] font-semibold ${
                                c.active ? 'text-[#16A36A]' : 'text-[#778094]'
                              }`}
                            >
                              · {c.active ? 'Ativo' : 'Inativo'}
                            </span>
                          </div>
                          <p className="text-xs text-[#778094] mt-1 line-clamp-2">
                            {c.description ||
                              c.items
                                .map((i) => `${i.quantity}x ${i.productName}`)
                                .join(' + ')}
                          </p>
                        </div>
                      </div>

                      <span className="text-base font-extrabold text-[#172033] font-mono tabular-nums shrink-0">
                        {formatCurrencyBRL(c.salePrice)}
                      </span>
                    </div>

                    {/* Composição resumida */}
                    <div className="bg-[#F7F8FC] border border-[#E8EAF0] rounded-xl px-3 py-2 text-[11px] text-[#778094] space-y-1">
                      <p className="font-semibold text-[#172033]">
                        Composição ({c.items.length}{' '}
                        {c.items.length === 1 ? 'item' : 'itens'})
                      </p>
                      <p className="truncate">
                        {c.items
                          .map((i) => `${i.quantity}× ${i.productName}`)
                          .join(' · ')}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-[#E8EAF0] flex items-center justify-between gap-2 text-[11px] text-[#778094]">
                      <span className="font-mono tabular-nums truncate">
                        {xSaladasInCombo > 0
                          ? `${xSaladasInCombo} X-Salada${
                              xSaladasInCombo > 1 ? 's' : ''
                            }`
                          : 'Sem X-Salada'}
                        {c.estimatedCost > 0
                          ? ` · Custo est. ${formatCurrencyBRL(c.estimatedCost)}`
                          : ''}
                      </span>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditCombo(c)}
                          aria-label={`Editar combo ${c.name}`}
                          className="min-h-[34px] px-2.5 rounded-lg bg-white border border-[#E8EAF0] hover:border-[#F5B900] text-xs font-semibold text-[#172033] inline-flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5 text-[#778094]" />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleComboActive(c)}
                          aria-label={
                            c.active
                              ? `Desativar combo ${c.name}`
                              : `Ativar combo ${c.name}`
                          }
                          className={`min-h-[34px] px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                            c.active
                              ? 'bg-white border-[#E8EAF0] hover:border-[#FECACA] hover:bg-[#FEF2F2] text-[#778094] hover:text-[#E35D62]'
                              : 'bg-[#ECFDF5] border-[#A7F3D0] text-[#16A36A] hover:bg-[#D1FAE5]'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                          <span>{c.active ? 'Desativar' : 'Ativar'}</span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 3: CATEGORIAS ==================== */}
      {sectionTab === 'categories' && (
        <div className="space-y-4">
          {/* Toolbar de Categorias */}
          <div className="bg-white border border-[#E8EAF0] rounded-2xl p-3 sm:p-3.5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="relative flex-1 min-w-0">
              <Search
                className="w-4 h-4 text-[#778094] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Buscar categorias"
                placeholder="Buscar categoria..."
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                className="w-full min-h-[42px] pl-10 pr-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] focus:bg-white focus:border-[#F5B900] focus:outline-none text-xs sm:text-sm text-[#172033] placeholder:text-[#778094]"
              />
            </div>

            <div className="text-xs text-[#778094] font-mono tabular-nums px-1 shrink-0">
              {catalogStats.activeCategoriesCount} ativas de{' '}
              {catalogStats.totalCategoriesCount}
            </div>
          </div>

          {loadingCatalog ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="mgw-skeleton h-32 rounded-2xl" />
              ))}
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="bg-white border border-[#E8EAF0] rounded-2xl p-10 text-center space-y-3 shadow-[0_2px_8px_rgba(23,32,51,0.04)]">
              <div className="w-12 h-12 rounded-2xl bg-[#F7F8FC] border border-[#E8EAF0] text-[#778094] flex items-center justify-center mx-auto">
                <FolderOpen className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-[#172033]">
                Nenhuma categoria encontrada.
              </p>
              <button
                type="button"
                onClick={openNewCategoryModal}
                className="mgw-btn-primary inline-flex"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Categoria</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCategories.map((cat) => (
                <article
                  key={cat.id || cat.name}
                  className={`bg-white border border-[#E8EAF0] hover:border-[#D5D9E4] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between gap-4 transition-all ${
                    cat.active ? '' : 'opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-[#FFFBEB] border border-[#FDE68A] text-[#B38300] flex items-center justify-center shrink-0">
                        <Tag className="w-[18px] h-[18px]" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-bold text-[#172033] truncate">
                          {cat.name}
                        </h3>
                        <p className="text-xs text-[#778094] mt-0.5 font-mono tabular-nums">
                          {cat.productCount}{' '}
                          {cat.productCount === 1
                            ? 'produto associado'
                            : 'produtos associados'}
                          {' · '}
                          <span
                            className={
                              cat.active
                                ? 'text-[#16A36A] font-semibold'
                                : 'text-[#778094] font-semibold'
                            }
                          >
                            {cat.active ? 'Ativa' : 'Inativa'}
                          </span>
                        </p>
                      </div>
                    </div>

                    {cat.productCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setProductCategoryFilter(cat.name);
                          setSectionTab('products');
                        }}
                        className="text-xs font-bold text-[#D97706] hover:text-[#B45309] whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Ver produtos
                      </button>
                    )}
                  </div>

                  <div className="pt-3 border-t border-[#E8EAF0] flex flex-wrap items-center justify-end gap-1.5">
                    <button
                      type="button"
                      disabled={catalogBusy}
                      onClick={() => openEditCategoryModal(cat)}
                      aria-label={`Editar categoria ${cat.name}`}
                      className="min-h-[34px] px-2.5 rounded-lg bg-white border border-[#E8EAF0] hover:border-[#F5B900] text-xs font-semibold text-[#172033] inline-flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5 text-[#778094]" />
                      <span>Editar</span>
                    </button>

                    {cat.id && (
                      <button
                        type="button"
                        disabled={catalogBusy}
                        onClick={() => void handleToggleCategoryActive(cat)}
                        aria-label={
                          cat.active
                            ? `Desativar categoria ${cat.name}`
                            : `Ativar categoria ${cat.name}`
                        }
                        className="min-h-[34px] px-2.5 rounded-lg bg-white border border-[#E8EAF0] hover:border-[#D5D9E4] text-xs font-semibold text-[#778094] hover:text-[#172033] inline-flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{cat.active ? 'Desativar' : 'Ativar'}</span>
                      </button>
                    )}

                    {cat.id && (
                      <button
                        type="button"
                        disabled={catalogBusy}
                        onClick={() =>
                          setConfirmDelete({
                            kind: 'category',
                            id: cat.id!,
                            name: cat.name,
                            title: `Excluir categoria "${cat.name}"?`,
                            description:
                              cat.productCount > 0
                                ? `Esta categoria possui ${cat.productCount} produto(s) associado(s). A exclusão remove apenas a categoria da lista de cadastro; o nome salvo nos produtos não é apagado.`
                                : 'A categoria será removida permanentemente da lista deste estabelecimento.',
                            confirmLabel: 'Excluir categoria',
                          })
                        }
                        aria-label={`Excluir categoria ${cat.name}`}
                        className="w-8 h-[34px] rounded-lg bg-white border border-[#E8EAF0] hover:border-[#FECACA] hover:bg-[#FEF2F2] text-[#778094] hover:text-[#E35D62] flex items-center justify-center cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 4: ADICIONAIS ==================== */}
      {sectionTab === 'addons' && (
        <div className="space-y-4">
          {/* Toolbar de Adicionais */}
          <div className="bg-white border border-[#E8EAF0] rounded-2xl p-3 sm:p-3.5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="relative flex-1 min-w-0">
              <Search
                className="w-4 h-4 text-[#778094] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Buscar grupos ou adicionais"
                placeholder="Buscar grupos, sabores ou adicionais..."
                value={addonSearch}
                onChange={(e) => setAddonSearch(e.target.value)}
                className="w-full min-h-[42px] pl-10 pr-3.5 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] focus:bg-white focus:border-[#F5B900] focus:outline-none text-xs sm:text-sm text-[#172033] placeholder:text-[#778094]"
              />
            </div>

            <div className="text-xs text-[#778094] font-mono tabular-nums px-1 shrink-0">
              {catalogStats.totalAddonGroupsCount} grupos ·{' '}
              {catalogStats.totalAddonOptionsCount} opções
            </div>
          </div>

          {loadingCatalog ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="mgw-skeleton h-52 rounded-2xl" />
              ))}
            </div>
          ) : filteredAddonGroups.length === 0 ? (
            <div className="bg-white border border-[#E8EAF0] rounded-2xl p-10 text-center space-y-3 shadow-[0_2px_8px_rgba(23,32,51,0.04)]">
              <div className="w-12 h-12 rounded-2xl bg-[#F7F8FC] border border-[#E8EAF0] text-[#778094] flex items-center justify-center mx-auto">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-[#172033]">
                  {addonGroups.length === 0
                    ? 'Nenhum grupo de adicionais cadastrado ainda.'
                    : 'Nenhum grupo encontrado para a busca informada.'}
                </p>
                <p className="text-xs text-[#778094] max-w-md mx-auto">
                  Crie grupos como Sabores, Molhos ou Adicionais Extras e defina
                  obrigatoriedade, limites e vínculos com seus produtos.
                </p>
              </div>
              <button
                type="button"
                onClick={openNewAddonGroupModal}
                className="mgw-btn-primary inline-flex"
              >
                <Plus className="w-4 h-4" />
                <span>Criar grupo de adicionais</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {filteredAddonGroups.map((g) => {
                const rule = addonGroupRules[g.id] || {
                  isRequired: g.isRequired,
                  minSelect: g.minSelect,
                  maxSelect: g.maxSelect,
                };
                const linkedNames = g.linkedProductIds
                  .map((pid) => productNameById.get(pid))
                  .filter(Boolean) as string[];

                return (
                  <article
                    key={g.id}
                    className="bg-white border border-[#E8EAF0] rounded-2xl p-4 sm:p-5 shadow-[0_2px_8px_rgba(23,32,51,0.04)] flex flex-col justify-between gap-4"
                  >
                    {/* Header do Grupo */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-base font-extrabold text-[#172033] truncate">
                          {g.name}
                        </h3>
                        <p className="text-xs text-[#778094] mt-0.5 font-mono tabular-nums">
                          {g.options.length}{' '}
                          {g.options.length === 1 ? 'opção' : 'opções'} ·{' '}
                          <span
                            className={
                              g.isRequired
                                ? 'text-[#B45309] font-semibold'
                                : 'text-[#778094]'
                            }
                          >
                            {g.isRequired ? 'Obrigatório' : 'Opcional'}
                          </span>{' '}
                          · Mín. {g.minSelect} / Máx. {g.maxSelect}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditAddonGroupModal(g)}
                          aria-label={`Editar grupo ${g.name}`}
                          className="min-h-[34px] px-2.5 rounded-lg bg-white border border-[#E8EAF0] hover:border-[#F5B900] text-xs font-semibold text-[#172033] inline-flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5 text-[#778094]" />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDelete({
                              kind: 'addon_group',
                              id: g.id,
                              name: g.name,
                              title: `Excluir grupo "${g.name}"?`,
                              description: `Todas as ${g.options.length} opção(ões) deste grupo e os vínculos com ${g.linkedProductIds.length} produto(s) serão removidos permanentemente.`,
                              confirmLabel: 'Excluir grupo',
                            })
                          }
                          aria-label={`Excluir grupo ${g.name}`}
                          className="w-8 h-[34px] rounded-lg bg-white border border-[#E8EAF0] hover:border-[#FECACA] hover:bg-[#FEF2F2] text-[#778094] hover:text-[#E35D62] flex items-center justify-center cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Produtos vinculados */}
                    <div className="bg-[#F7F8FC] border border-[#E8EAF0] rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex items-center gap-2 text-xs">
                        <Link2
                          className="w-3.5 h-3.5 text-[#778094] shrink-0"
                          aria-hidden="true"
                        />
                        <span className="text-[#778094] truncate">
                          {linkedNames.length === 0 ? (
                            'Nenhum produto vinculado ainda'
                          ) : (
                            <>
                              <strong className="text-[#172033]">
                                {linkedNames.length}{' '}
                                {linkedNames.length === 1
                                  ? 'produto'
                                  : 'produtos'}
                                :
                              </strong>{' '}
                              {linkedNames.join(', ')}
                            </>
                          )}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openEditAddonGroupModal(g)}
                        className="text-[11px] font-bold text-[#D97706] hover:text-[#B45309] whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Vincular produtos
                      </button>
                    </div>

                    {/* Regras rápidas de obrigatoriedade e seleção */}
                    <div className="rounded-xl border border-[#E8EAF0] bg-[#F7F8FC]/50 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <label className="inline-flex items-center gap-2 font-medium text-[#172033] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rule.isRequired}
                          onChange={(e) => {
                            const nextReq = e.target.checked;
                            setAddonGroupRules((prev) => ({
                              ...prev,
                              [g.id]: {
                                ...rule,
                                isRequired: nextReq,
                                minSelect: nextReq
                                  ? Math.max(1, rule.minSelect || 1)
                                  : Math.min(rule.minSelect, rule.maxSelect),
                              },
                            }));
                          }}
                          className="w-4 h-4 accent-[#F5B900] rounded"
                        />
                        <span>Obrigatório</span>
                      </label>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <label className="inline-flex items-center gap-1.5 text-[#778094] font-medium">
                          <span>Mín</span>
                          <input
                            type="number"
                            min={0}
                            max={30}
                            value={rule.minSelect}
                            onChange={(e) =>
                              setAddonGroupRules((prev) => ({
                                ...prev,
                                [g.id]: {
                                  ...rule,
                                  minSelect: Math.max(
                                    0,
                                    Math.trunc(Number(e.target.value) || 0),
                                  ),
                                },
                              }))
                            }
                            className="w-14 min-h-[34px] px-2 rounded-lg bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-xs font-mono tabular-nums text-[#172033]"
                          />
                        </label>

                        <label className="inline-flex items-center gap-1.5 text-[#778094] font-medium">
                          <span>Máx</span>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={rule.maxSelect}
                            onChange={(e) =>
                              setAddonGroupRules((prev) => ({
                                ...prev,
                                [g.id]: {
                                  ...rule,
                                  maxSelect: Math.max(
                                    1,
                                    Math.trunc(Number(e.target.value) || 1),
                                  ),
                                },
                              }))
                            }
                            className="w-14 min-h-[34px] px-2 rounded-lg bg-white border border-[#E8EAF0] focus:border-[#F5B900] focus:outline-none text-xs font-mono tabular-nums text-[#172033]"
                          />
                        </label>

                        <button
                          type="button"
                          disabled={catalogBusy}
                          onClick={() => void handleSaveInlineGroupRules(g.id)}
                          className="min-h-[34px] px-3 rounded-lg bg-white border border-[#E8EAF0] hover:border-[#F5B900] text-xs font-bold text-[#172033] cursor-pointer transition-colors disabled:opacity-50"
                        >
                          Salvar regras
                        </button>
                      </div>
                    </div>

                    {/* Lista de opções / sabores do grupo */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-[#172033]">
                        Opções e sabores
                      </p>
                      {g.options.length === 0 ? (
                        <p className="text-xs text-[#778094] py-2">
                          Nenhuma opção adicionada ainda neste grupo.
                        </p>
                      ) : (
                        <div className="divide-y divide-[#E8EAF0] border border-[#E8EAF0] rounded-xl overflow-hidden">
                          {g.options.map((opt) => (
                            <div
                              key={opt.id}
                              className="px-3.5 py-2.5 flex items-center justify-between gap-2 bg-white hover:bg-[#F7F8FC]/60 transition-colors"
                            >
                              <div className="min-w-0 flex items-center gap-2">
                                <span className="text-xs sm:text-[13px] font-semibold text-[#172033] truncate">
                                  {opt.name}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs font-bold font-mono tabular-nums text-[#172033]">
                                  {opt.price > 0
                                    ? `+ ${formatCurrencyBRL(opt.price)}`
                                    : 'Grátis'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openEditAddonOptionModal(opt, g.name)
                                  }
                                  aria-label={`Editar opção ${opt.name}`}
                                  className="w-7 h-7 rounded-lg border border-[#E8EAF0] hover:border-[#F5B900] text-[#778094] hover:text-[#172033] flex items-center justify-center cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmDelete({
                                      kind: 'addon_option',
                                      id: opt.id,
                                      name: opt.name,
                                      title: `Excluir opção "${opt.name}"?`,
                                      description: `Esta opção será removida permanentemente do grupo "${g.name}".`,
                                      confirmLabel: 'Excluir opção',
                                    })
                                  }
                                  aria-label={`Excluir opção ${opt.name}`}
                                  className="w-7 h-7 rounded-lg border border-[#E8EAF0] hover:border-[#FECACA] hover:bg-[#FEF2F2] text-[#778094] hover:text-[#E35D62] flex items-center justify-center cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Formulário rápido para adicionar nova opção no grupo */}
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_116px_auto] gap-2 pt-1">
                      <input
                        type="text"
                        maxLength={80}
                        aria-label={`Nova opção para ${g.name}`}
                        value={optionDrafts[g.id]?.name || ''}
                        onChange={(e) =>
                          setOptionDrafts((p) => ({
                            ...p,
                            [g.id]: {
                              name: e.target.value,
                              price: p[g.id]?.price || '',
                            },
                          }))
                        }
                        placeholder="Nova opção ou sabor..."
                        className="min-h-[40px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] focus:bg-white focus:border-[#F5B900] focus:outline-none text-xs text-[#172033] placeholder:text-[#778094]"
                      />
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        step="0.01"
                        inputMode="decimal"
                        aria-label={`Preço da opção em ${g.name}`}
                        value={optionDrafts[g.id]?.price || ''}
                        onChange={(e) =>
                          setOptionDrafts((p) => ({
                            ...p,
                            [g.id]: {
                              name: p[g.id]?.name || '',
                              price: e.target.value,
                            },
                          }))
                        }
                        placeholder="Preço (R$)"
                        className="min-h-[40px] px-3 rounded-xl bg-[#F7F8FC] border border-[#E8EAF0] focus:bg-white focus:border-[#F5B900] focus:outline-none text-xs font-mono tabular-nums text-[#172033] placeholder:text-[#778094]"
                      />
                      <button
                        type="button"
                        disabled={
                          catalogBusy || !optionDrafts[g.id]?.name?.trim()
                        }
                        onClick={() => void addAddonOption(g.id)}
                        className="mgw-btn-primary min-h-[40px] whitespace-nowrap disabled:opacity-50"
                      >
                        {catalogBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        <span>Adicionar</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== MODAIS DE ETAPA 5 ==================== */}
      <ProductFormModal
        open={productFormOpen}
        editingProduct={editingProduct}
        draftProductId={draftProductId}
        workspaceId={effectiveWorkspaceId}
        prodName={prodName}
        onProdNameChange={setProdName}
        prodCategory={prodCategory}
        onProdCategoryChange={setProdCategory}
        selectableCategories={selectableCategoryNames}
        prodPrice={prodPrice}
        onProdPriceChange={setProdPrice}
        prodCountsXSalada={prodCountsXSalada}
        onProdCountsXSaladaChange={setProdCountsXSalada}
        prodActive={prodActive}
        onProdActiveChange={setProdActive}
        prodImageUrl={prodImageUrl}
        prodImagePath={prodImagePath}
        onProdImageChange={({ url, path }) => {
          setProdImageUrl(url);
          setProdImagePath(path);
        }}
        uploadingImage={uploadingProdImage}
        onUploadingImageChange={setUploadingProdImage}
        addonGroups={addonGroups}
        selectedAddonGroupIds={selectedAddonGroupIds}
        onToggleAddonGroupId={(groupId, checked) =>
          setSelectedAddonGroupIds((prev) =>
            checked ? [...prev, groupId] : prev.filter((id) => id !== groupId),
          )
        }
        saving={savingProduct}
        errorMessage={productModalError}
        onClose={() => {
          setProductFormOpen(false);
          setEditingProduct(null);
          setProductModalError(null);
        }}
        onSubmit={(e) => void handleSaveProduct(e)}
      />

      <ComboFormModal
        open={comboFormOpen}
        editingCombo={editingCombo}
        draftComboId={draftComboId}
        workspaceId={effectiveWorkspaceId}
        products={products}
        comboName={comboName}
        onComboNameChange={setComboName}
        comboPrice={comboPrice}
        onComboPriceChange={setComboPrice}
        comboCost={comboCost}
        onComboCostChange={setComboCost}
        comboDescription={comboDescription}
        onComboDescriptionChange={setComboDescription}
        comboActive={comboActive}
        onComboActiveChange={setComboActive}
        comboImageUrl={comboImageUrl}
        comboImagePath={comboImagePath}
        onComboImageChange={({ url, path }) => {
          setComboImageUrl(url);
          setComboImagePath(path);
        }}
        uploadingImage={uploadingComboImage}
        onUploadingImageChange={setUploadingComboImage}
        comboItems={comboItems}
        selectedProdToAdd={selectedProdToAdd}
        onSelectedProdToAddChange={setSelectedProdToAdd}
        onAddProductToCombo={handleAddProductToCombo}
        onUpdateComboItemQty={handleUpdateComboItemQty}
        saving={savingCombo}
        errorMessage={comboModalError}
        onClose={() => {
          setComboFormOpen(false);
          setEditingCombo(null);
          setComboModalError(null);
        }}
        onSubmit={(e) => void handleSaveCombo(e)}
      />

      <CategoryFormModal
        open={categoryModalOpen}
        editingCategory={editingCategory}
        nameDraft={categoryNameDraft}
        onNameDraftChange={setCategoryNameDraft}
        saving={savingCategory}
        errorMessage={categoryModalError}
        onClose={() => {
          setCategoryModalOpen(false);
          setEditingCategory(null);
          setCategoryModalError(null);
        }}
        onSubmit={(e) => void handleSaveCategory(e)}
      />

      <AddonGroupFormModal
        open={addonGroupModalOpen}
        editingGroup={editingAddonGroup}
        nameDraft={addonGroupNameDraft}
        onNameDraftChange={setAddonGroupNameDraft}
        ruleDraft={addonGroupRuleDraft}
        onRuleDraftChange={setAddonGroupRuleDraft}
        products={products}
        linkedProductIds={addonGroupLinkedProductIds}
        onToggleLinkedProduct={(productId, checked) =>
          setAddonGroupLinkedProductIds((prev) =>
            checked
              ? [...prev, productId]
              : prev.filter((id) => id !== productId),
          )
        }
        saving={savingAddonGroup}
        errorMessage={addonGroupModalError}
        onClose={() => {
          setAddonGroupModalOpen(false);
          setEditingAddonGroup(null);
          setAddonGroupModalError(null);
        }}
        onSubmit={(e) => void handleSaveAddonGroup(e)}
      />

      <AddonOptionEditModal
        open={Boolean(editingAddonOption)}
        option={editingAddonOption?.option ?? null}
        groupName={editingAddonOption?.groupName ?? ''}
        nameDraft={addonOptionNameDraft}
        onNameDraftChange={setAddonOptionNameDraft}
        priceDraft={addonOptionPriceDraft}
        onPriceDraftChange={setAddonOptionPriceDraft}
        saving={savingAddonOption}
        errorMessage={addonOptionModalError}
        onClose={() => {
          setEditingAddonOption(null);
          setAddonOptionModalError(null);
        }}
        onSubmit={(e) => void handleSaveAddonOptionEdit(e)}
      />

      <CatalogConfirmDeleteModal
        open={Boolean(confirmDelete)}
        title={confirmDelete?.title ?? ''}
        description={confirmDelete?.description ?? ''}
        confirmLabel={confirmDelete?.confirmLabel}
        busy={deletingEntity}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void handleExecuteConfirmDelete()}
      />
    </div>
  );
}
