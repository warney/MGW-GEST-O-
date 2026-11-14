import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  type ComboInput,
  type ComboProductItem,
  type ComboRecord,
  DEFAULT_SHOP_SETTINGS,
  EXPENSE_CATEGORIES,
  type ExpenseInput,
  type ExpenseRecord,
  MGW_WORKSPACE,
  normalizePaymentMethod,
  PAYMENT_METHODS,
  PRODUCT_CATEGORIES,
  type ProductInput,
  type ProductRecord,
  type SaleInput,
  type SaleLineItemSnapshot,
  type SaleRecord,
  type ShopSettings,
  type WorkspaceAccess,
} from '../types/finance';
import { calculateSaleTotal, roundCurrency } from '../utils/finance';

const SHARED_SETTINGS_ID = 'mgw_lanches';

function getSettingsTarget(workspace: WorkspaceAccess) {
  if (workspace.id === 'gf_lanches') {
    return {
      ref: doc(db, 'workspaces', 'gf_lanches', 'settings', 'main'),
      path: 'workspaces/gf_lanches/settings/main',
      supportsLegacyMigration: false,
    };
  }
  return {
    ref: doc(db, 'settings', SHARED_SETTINGS_ID),
    path: `settings/${SHARED_SETTINGS_ID}`,
    supportsLegacyMigration: true,
  };
}

function getCollectionTarget(
  workspace: WorkspaceAccess,
  name: 'products' | 'combos' | 'sales' | 'expenses',
) {
  if (workspace.id === 'gf_lanches') {
    return {
      ref: collection(db, 'workspaces', 'gf_lanches', name),
      path: `workspaces/gf_lanches/${name}`,
    };
  }
  return {
    ref: collection(db, name),
    path: name,
  };
}

function getDocTarget(
  workspace: WorkspaceAccess,
  name: 'products' | 'combos' | 'sales' | 'expenses',
  docId: string,
) {
  if (workspace.id === 'gf_lanches') {
    return {
      ref: doc(db, 'workspaces', 'gf_lanches', name, docId),
      path: `workspaces/gf_lanches/${name}/${docId}`,
    };
  }
  return {
    ref: doc(db, name, docId),
    path: `${name}/${docId}`,
  };
}

function timestampToMs(ts: unknown): number {
  if (ts instanceof Timestamp) return ts.toMillis();
  return Date.now();
}

function sanitizeDateStr(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  throw new Error('Data inválida. Use o formato AAAA-MM-DD.');
}

function parseComboItems(raw: unknown): ComboProductItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .slice(0, 30)
    .map((entry) => ({
      productId: String(entry.productId || ''),
      productName: String(entry.productName || 'Produto'),
      quantity: Math.max(1, Math.trunc(Number(entry.quantity) || 1)),
      countsAsXSalada: Boolean(entry.countsAsXSalada),
    }));
}

function parseSaleItems(raw: unknown): SaleLineItemSnapshot[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const parsed = raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .slice(0, 50)
    .map((entry) => {
      const compsRaw = Array.isArray(entry.components) ? entry.components : [];
      const components = compsRaw
        .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
        .slice(0, 30)
        .map((c) => ({
          productId: String(c.productId || ''),
          productName: String(c.productName || 'Produto'),
          quantityPerUnit: Math.max(1, Math.trunc(Number(c.quantityPerUnit) || 1)),
          totalQuantity: Math.max(1, Math.trunc(Number(c.totalQuantity) || 1)),
          countsAsXSalada: Boolean(c.countsAsXSalada),
        }));

      return {
        kind: (entry.kind === 'combo' ? 'combo' : 'product') as 'combo' | 'product',
        refId: String(entry.refId || ''),
        name: String(entry.name || 'Item'),
        quantity: Math.max(1, Math.trunc(Number(entry.quantity) || 1)),
        unitPrice: Number(entry.unitPrice) || 0,
        lineTotal: Number(entry.lineTotal) || 0,
        estimatedUnitCost: Number(entry.estimatedUnitCost) || 0,
        xSaladasPerUnit: Math.max(0, Math.trunc(Number(entry.xSaladasPerUnit) || 0)),
        components,
      };
    });
  return parsed.length > 0 ? parsed : undefined;
}

export function subscribeSettings(
  ownerId: string,
  onData: (settings: ShopSettings) => void,
  onError: (err: Error) => void,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): () => void {
  const { ref, path } = getSettingsTarget(workspace);
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        onData({
          ownerId: String(d.ownerId || ownerId),
          establishmentName: String(
            d.establishmentName || workspace.defaultEstablishmentName,
          ),
          xSaladaPrice: Number(d.xSaladaPrice) || DEFAULT_SHOP_SETTINGS.xSaladaPrice,
          dailyGoal: Number(d.dailyGoal) || 0,
          monthlyGoal: Number(d.monthlyGoal) || 0,
          startDate: String(d.startDate || DEFAULT_SHOP_SETTINGS.startDate),
        });
      } else {
        void ensureDefaultSettings(ownerId, workspace).catch((err) =>
          onError(err instanceof Error ? err : new Error(String(err))),
        );
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    },
  );
}

export async function ensureDefaultSettings(
  ownerId: string,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): Promise<void> {
  const { ref, path, supportsLegacyMigration } = getSettingsTarget(workspace);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      let legacyData: Record<string, unknown> | null = null;
      if (supportsLegacyMigration) {
        const legacyRef = doc(db, 'settings', ownerId);
        const legacySnap = await getDoc(legacyRef);
        legacyData = legacySnap.exists()
          ? (legacySnap.data() as Record<string, unknown>)
          : null;
      }

      await setDoc(ref, {
        ownerId,
        establishmentName:
          legacyData && typeof legacyData.establishmentName === 'string'
            ? legacyData.establishmentName
            : workspace.defaultEstablishmentName,
        xSaladaPrice:
          legacyData && typeof legacyData.xSaladaPrice === 'number'
            ? legacyData.xSaladaPrice
            : DEFAULT_SHOP_SETTINGS.xSaladaPrice,
        dailyGoal:
          legacyData && typeof legacyData.dailyGoal === 'number'
            ? legacyData.dailyGoal
            : DEFAULT_SHOP_SETTINGS.dailyGoal,
        monthlyGoal:
          legacyData && typeof legacyData.monthlyGoal === 'number'
            ? legacyData.monthlyGoal
            : DEFAULT_SHOP_SETTINGS.monthlyGoal,
        startDate:
          legacyData && typeof legacyData.startDate === 'string'
            ? legacyData.startDate
            : DEFAULT_SHOP_SETTINGS.startDate,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveSettingsToFirestore(
  ownerId: string,
  input: Omit<ShopSettings, 'ownerId'>,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): Promise<void> {
  const { ref, path } = getSettingsTarget(workspace);
  const establishmentName = input.establishmentName.trim().slice(0, 80);
  const xSaladaPrice = roundCurrency(Number(input.xSaladaPrice));
  const dailyGoal = roundCurrency(Math.max(0, Number(input.dailyGoal)));
  const monthlyGoal = roundCurrency(Math.max(0, Number(input.monthlyGoal)));
  const startDate = sanitizeDateStr(input.startDate);

  if (!establishmentName) {
    throw new Error('Informe o nome do estabelecimento.');
  }
  if (!Number.isFinite(xSaladaPrice) || xSaladaPrice <= 0 || xSaladaPrice > 10000) {
    throw new Error('Informe um preço válido para o X-Salada.');
  }

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        establishmentName,
        xSaladaPrice,
        dailyGoal,
        monthlyGoal,
        startDate,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId,
        establishmentName,
        xSaladaPrice,
        dailyGoal,
        monthlyGoal,
        startDate,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ==================== PRODUCTS ====================

export function subscribeProducts(
  onData: (products: ProductRecord[]) => void,
  onError: (err: Error) => void,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): () => void {
  const { ref, path } = getCollectionTarget(workspace, 'products');
  return onSnapshot(
    query(ref),
    (snapshot) => {
      const items: ProductRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: String(data.ownerId || ''),
          name: String(data.name || ''),
          category: PRODUCT_CATEGORIES.includes(data.category)
            ? data.category
            : 'Outro',
          unitPrice: Number(data.unitPrice) || 0,
          countsAsXSalada: Boolean(data.countsAsXSalada),
          active: data.active !== false,
          createdAtMs: timestampToMs(data.createdAt),
          updatedAtMs: timestampToMs(data.updatedAt),
        };
      });
      items.sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    },
  );
}

export async function createProductInFirestore(
  ownerId: string,
  input: ProductInput,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): Promise<string> {
  const name = input.name.trim().slice(0, 80);
  const unitPrice = roundCurrency(Math.max(0, Number(input.unitPrice)));
  if (!name) {
    throw new Error('Informe o nome do produto.');
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 10000) {
    throw new Error('Informe um preço válido para o produto.');
  }

  const { ref, path } = getCollectionTarget(workspace, 'products');
  try {
    const docRef = await addDoc(ref, {
      ownerId,
      name,
      category: input.category,
      unitPrice,
      countsAsXSalada: Boolean(input.countsAsXSalada),
      active: Boolean(input.active),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    return '';
  }
}

export async function updateProductInFirestore(
  productId: string,
  input: ProductInput,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): Promise<void> {
  const name = input.name.trim().slice(0, 80);
  const unitPrice = roundCurrency(Math.max(0, Number(input.unitPrice)));
  if (!name) {
    throw new Error('Informe o nome do produto.');
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 10000) {
    throw new Error('Informe um preço válido para o produto.');
  }

  const { ref, path } = getDocTarget(workspace, 'products', productId);
  try {
    await updateDoc(ref, {
      name,
      category: input.category,
      unitPrice,
      countsAsXSalada: Boolean(input.countsAsXSalada),
      active: Boolean(input.active),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteProductInFirestore(
  productId: string,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): Promise<void> {
  const { ref, path } = getDocTarget(workspace, 'products', productId);
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ==================== COMBOS ====================

export function subscribeCombos(
  onData: (combos: ComboRecord[]) => void,
  onError: (err: Error) => void,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): () => void {
  const { ref, path } = getCollectionTarget(workspace, 'combos');
  return onSnapshot(
    query(ref),
    (snapshot) => {
      const items: ComboRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: String(data.ownerId || ''),
          name: String(data.name || ''),
          description: String(data.description || ''),
          items: parseComboItems(data.items),
          salePrice: Number(data.salePrice) || 0,
          estimatedCost: Number(data.estimatedCost) || 0,
          active: data.active !== false,
          createdAtMs: timestampToMs(data.createdAt),
          updatedAtMs: timestampToMs(data.updatedAt),
        };
      });
      items.sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    },
  );
}

export async function createComboInFirestore(
  ownerId: string,
  input: ComboInput,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): Promise<string> {
  const name = input.name.trim().slice(0, 80);
  const description = input.description.trim().slice(0, 240);
  const salePrice = roundCurrency(Number(input.salePrice));
  const estimatedCost = roundCurrency(Math.max(0, Number(input.estimatedCost || 0)));
  const cleanItems = input.items
    .filter((i) => i.productId && i.quantity >= 1)
    .slice(0, 30)
    .map((i) => ({
      productId: i.productId,
      productName: i.productName.trim().slice(0, 80),
      quantity: Math.max(1, Math.trunc(i.quantity)),
      countsAsXSalada: Boolean(i.countsAsXSalada),
    }));

  if (!name) {
    throw new Error('Informe o nome do combo.');
  }
  if (cleanItems.length === 0) {
    throw new Error('Adicione pelo menos 1 produto ao combo.');
  }
  if (!Number.isFinite(salePrice) || salePrice <= 0 || salePrice > 100000) {
    throw new Error('Informe um preço de venda válido para o combo.');
  }

  const { ref, path } = getCollectionTarget(workspace, 'combos');
  try {
    const docRef = await addDoc(ref, {
      ownerId,
      name,
      description,
      items: cleanItems,
      salePrice,
      estimatedCost,
      active: Boolean(input.active),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    return '';
  }
}

export async function updateComboInFirestore(
  comboId: string,
  input: ComboInput,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): Promise<void> {
  const name = input.name.trim().slice(0, 80);
  const description = input.description.trim().slice(0, 240);
  const salePrice = roundCurrency(Number(input.salePrice));
  const estimatedCost = roundCurrency(Math.max(0, Number(input.estimatedCost || 0)));
  const cleanItems = input.items
    .filter((i) => i.productId && i.quantity >= 1)
    .slice(0, 30)
    .map((i) => ({
      productId: i.productId,
      productName: i.productName.trim().slice(0, 80),
      quantity: Math.max(1, Math.trunc(i.quantity)),
      countsAsXSalada: Boolean(i.countsAsXSalada),
    }));

  if (!name) {
    throw new Error('Informe o nome do combo.');
  }
  if (cleanItems.length === 0) {
    throw new Error('Adicione pelo menos 1 produto ao combo.');
  }
  if (!Number.isFinite(salePrice) || salePrice <= 0 || salePrice > 100000) {
    throw new Error('Informe um preço de venda válido para o combo.');
  }

  const { ref, path } = getDocTarget(workspace, 'combos', comboId);
  try {
    await updateDoc(ref, {
      name,
      description,
      items: cleanItems,
      salePrice,
      estimatedCost,
      active: Boolean(input.active),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteComboInFirestore(
  comboId: string,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): Promise<void> {
  const { ref, path } = getDocTarget(workspace, 'combos', comboId);
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function seedDefaultCatalogInFirestore(
  ownerId: string,
  xSaladaPrice: number,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): Promise<void> {
  const basePrice = xSaladaPrice > 0 ? roundCurrency(xSaladaPrice) : 22;

  const pXSaladaId = await createProductInFirestore(
    ownerId,
    {
      name: 'X-Salada',
      category: 'Lanche',
      unitPrice: basePrice,
      countsAsXSalada: true,
      active: true,
    },
    workspace,
  );
  const pRefri250Id = await createProductInFirestore(
    ownerId,
    {
      name: 'Refrigerante Tuchaua 250 ml',
      category: 'Bebida',
      unitPrice: 5,
      countsAsXSalada: false,
      active: true,
    },
    workspace,
  );
  const pRefri1LId = await createProductInFirestore(
    ownerId,
    {
      name: 'Refrigerante Tuchaua 1 litro',
      category: 'Bebida',
      unitPrice: 10,
      countsAsXSalada: false,
      active: true,
    },
    workspace,
  );
  const pRefri15LId = await createProductInFirestore(
    ownerId,
    {
      name: 'Refrigerante Tuchaua 1,5 litro',
      category: 'Bebida',
      unitPrice: 13,
      countsAsXSalada: false,
      active: true,
    },
    workspace,
  );

  const examples: ComboInput[] = [
    {
      name: 'COMBO 1',
      description: '1 X-Salada + 1 Refrigerante Tuchaua 250 ml',
      items: [
        { productId: pXSaladaId, productName: 'X-Salada', quantity: 1, countsAsXSalada: true },
        { productId: pRefri250Id, productName: 'Refrigerante Tuchaua 250 ml', quantity: 1, countsAsXSalada: false },
      ],
      salePrice: roundCurrency(basePrice + 4),
      estimatedCost: 0,
      active: true,
    },
    {
      name: 'COMBO 2',
      description: '2 X-Saladas + 1 Refrigerante Tuchaua 1 litro',
      items: [
        { productId: pXSaladaId, productName: 'X-Salada', quantity: 2, countsAsXSalada: true },
        { productId: pRefri1LId, productName: 'Refrigerante Tuchaua 1 litro', quantity: 1, countsAsXSalada: false },
      ],
      salePrice: roundCurrency(basePrice * 2 + 7),
      estimatedCost: 0,
      active: true,
    },
    {
      name: 'COMBO 3',
      description: '3 X-Saladas + 1 Refrigerante Tuchaua 1 litro',
      items: [
        { productId: pXSaladaId, productName: 'X-Salada', quantity: 3, countsAsXSalada: true },
        { productId: pRefri1LId, productName: 'Refrigerante Tuchaua 1 litro', quantity: 1, countsAsXSalada: false },
      ],
      salePrice: roundCurrency(basePrice * 3 + 7),
      estimatedCost: 0,
      active: true,
    },
    {
      name: 'COMBO 4',
      description: '4 X-Saladas + 1 Refrigerante Tuchaua 1,5 litro',
      items: [
        { productId: pXSaladaId, productName: 'X-Salada', quantity: 4, countsAsXSalada: true },
        { productId: pRefri15LId, productName: 'Refrigerante Tuchaua 1,5 litro', quantity: 1, countsAsXSalada: false },
      ],
      salePrice: roundCurrency(basePrice * 4 + 9),
      estimatedCost: 0,
      active: true,
    },
  ];

  for (const combo of examples) {
    await createComboInFirestore(ownerId, combo, workspace);
  }
}

// ==================== SALES ====================

export function subscribeSales(
  onData: (sales: SaleRecord[]) => void,
  onError: (err: Error) => void,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): () => void {
  const { ref, path } = getCollectionTarget(workspace, 'sales');
  const q = query(ref);
  return onSnapshot(
    q,
    (snapshot) => {
      const items: SaleRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        const parsedItems = parseSaleItems(data.items);
        return {
          id: d.id,
          ownerId: String(data.ownerId),
          date: String(data.date),
          quantity: Number(data.quantity) || 0,
          unitPrice: Number(data.unitPrice) || 0,
          totalAmount: Number(data.totalAmount) || 0,
          paymentMethod: normalizePaymentMethod(
            typeof data.paymentMethod === 'string' ? data.paymentMethod : 'Dinheiro',
          ),
          note: String(data.note || ''),
          saleMode:
            data.saleMode === 'combo' ||
            data.saleMode === 'mixed' ||
            data.saleMode === 'individual'
              ? data.saleMode
              : undefined,
          xSaladaCount:
            typeof data.xSaladaCount === 'number' ? data.xSaladaCount : undefined,
          combosCount:
            typeof data.combosCount === 'number' ? data.combosCount : undefined,
          items: parsedItems,
          createdAtMs: timestampToMs(data.createdAt),
          updatedAtMs: timestampToMs(data.updatedAt),
        };
      });
      items.sort((a, b) =>
        b.date !== a.date
          ? b.date.localeCompare(a.date)
          : b.createdAtMs - a.createdAtMs,
      );
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    },
  );
}

export async function createSaleInFirestore(
  ownerId: string,
  input: SaleInput,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): Promise<void> {
  const quantity = Math.max(1, Math.trunc(Number(input.quantity)));
  const totalAmount =
    input.items && input.items.length > 0
      ? roundCurrency(
          input.items.reduce((acc, item) => acc + item.lineTotal, 0),
        )
      : calculateSaleTotal(quantity, roundCurrency(Number(input.unitPrice)));
  const unitPrice =
    input.items && input.items.length > 0
      ? roundCurrency(totalAmount / quantity)
      : roundCurrency(Number(input.unitPrice));
  const date = sanitizeDateStr(input.date);
  const note = input.note.trim().slice(0, 240);

  if (quantity < 1 || quantity > 10000) {
    throw new Error('A quantidade deve ser de pelo menos 1 item.');
  }
  if (unitPrice <= 0 || totalAmount <= 0) {
    throw new Error('O valor total da venda deve ser maior que zero.');
  }

  const payload: Record<string, unknown> = {
    ownerId,
    date,
    quantity,
    unitPrice,
    totalAmount,
    paymentMethod: input.paymentMethod,
    note,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.saleMode) payload.saleMode = input.saleMode;
  if (typeof input.xSaladaCount === 'number') {
    payload.xSaladaCount = Math.max(0, Math.trunc(input.xSaladaCount));
  }
  if (typeof input.combosCount === 'number') {
    payload.combosCount = Math.max(0, Math.trunc(input.combosCount));
  }
  if (input.items && input.items.length > 0) {
    payload.items = input.items.slice(0, 50);
  }

  const { ref, path } = getCollectionTarget(workspace, 'sales');
  try {
    await addDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateSaleInFirestore(
  saleId: string,
  input: SaleInput,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): Promise<void> {
  const quantity = Math.max(1, Math.trunc(Number(input.quantity)));
  const totalAmount =
    input.items && input.items.length > 0
      ? roundCurrency(
          input.items.reduce((acc, item) => acc + item.lineTotal, 0),
        )
      : calculateSaleTotal(quantity, roundCurrency(Number(input.unitPrice)));
  const unitPrice =
    input.items && input.items.length > 0
      ? roundCurrency(totalAmount / quantity)
      : roundCurrency(Number(input.unitPrice));
  const date = sanitizeDateStr(input.date);
  const note = input.note.trim().slice(0, 240);

  if (quantity < 1 || quantity > 10000) {
    throw new Error('A quantidade deve ser de pelo menos 1 item.');
  }
  if (unitPrice <= 0 || totalAmount <= 0) {
    throw new Error('O valor total da venda deve ser maior que zero.');
  }

  const payload: Record<string, unknown> = {
    date,
    quantity,
    unitPrice,
    totalAmount,
    paymentMethod: input.paymentMethod,
    note,
    updatedAt: serverTimestamp(),
  };

  if (input.saleMode) payload.saleMode = input.saleMode;
  if (typeof input.xSaladaCount === 'number') {
    payload.xSaladaCount = Math.max(0, Math.trunc(input.xSaladaCount));
  }
  if (typeof input.combosCount === 'number') {
    payload.combosCount = Math.max(0, Math.trunc(input.combosCount));
  }
  if (input.items && input.items.length > 0) {
    payload.items = input.items.slice(0, 50);
  }

  const { ref, path } = getDocTarget(workspace, 'sales', saleId);
  try {
    await updateDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteSaleInFirestore(
  saleId: string,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): Promise<void> {
  const { ref, path } = getDocTarget(workspace, 'sales', saleId);
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ==================== EXPENSES ====================

export function subscribeExpenses(
  onData: (expenses: ExpenseRecord[]) => void,
  onError: (err: Error) => void,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): () => void {
  const { ref, path } = getCollectionTarget(workspace, 'expenses');
  const q = query(ref);
  return onSnapshot(
    q,
    (snapshot) => {
      const items: ExpenseRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: String(data.ownerId),
          description: String(data.description || ''),
          amount: Number(data.amount) || 0,
          category: EXPENSE_CATEGORIES.includes(data.category)
            ? data.category
            : 'Outros',
          date: String(data.date),
          paymentMethod: PAYMENT_METHODS.includes(data.paymentMethod)
            ? data.paymentMethod
            : normalizePaymentMethod(
                typeof data.paymentMethod === 'string'
                  ? data.paymentMethod
                  : 'Dinheiro',
              ),
          note: String(data.note || ''),
          createdAtMs: timestampToMs(data.createdAt),
          updatedAtMs: timestampToMs(data.updatedAt),
        };
      });
      items.sort((a, b) =>
        b.date !== a.date
          ? b.date.localeCompare(a.date)
          : b.createdAtMs - a.createdAtMs,
      );
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    },
  );
}

export async function createExpenseInFirestore(
  ownerId: string,
  input: ExpenseInput,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): Promise<void> {
  const description = input.description.trim().slice(0, 160);
  const amount = roundCurrency(Number(input.amount));
  const date = sanitizeDateStr(input.date);
  const note = input.note.trim().slice(0, 240);

  if (!description) {
    throw new Error('Informe a descrição da despesa.');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('O valor da despesa deve ser maior que zero.');
  }

  const { ref, path } = getCollectionTarget(workspace, 'expenses');
  try {
    await addDoc(ref, {
      ownerId,
      description,
      amount,
      category: input.category,
      date,
      paymentMethod: input.paymentMethod,
      note,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateExpenseInFirestore(
  expenseId: string,
  input: ExpenseInput,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): Promise<void> {
  const description = input.description.trim().slice(0, 160);
  const amount = roundCurrency(Number(input.amount));
  const date = sanitizeDateStr(input.date);
  const note = input.note.trim().slice(0, 240);

  if (!description) {
    throw new Error('Informe a descrição da despesa.');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('O valor da despesa deve ser maior que zero.');
  }

  const { ref, path } = getDocTarget(workspace, 'expenses', expenseId);
  try {
    await updateDoc(ref, {
      description,
      amount,
      category: input.category,
      date,
      paymentMethod: input.paymentMethod,
      note,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteExpenseInFirestore(
  expenseId: string,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): Promise<void> {
  const { ref, path } = getDocTarget(workspace, 'expenses', expenseId);
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
