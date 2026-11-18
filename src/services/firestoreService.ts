import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  type ComboInput,
  type ComboProductItem,
  type ComboRecord,
  type CreatePublicOrderPayload,
  type CreatePublicOrderResponse,
  DEFAULT_SHOP_SETTINGS,
  type DigitalMenuSettings,
  type DigitalMenuSettingsInput,
  EXPENSE_CATEGORIES,
  type ExpenseInput,
  type ExpenseRecord,
  MGW_WORKSPACE,
  normalizePaymentMethod,
  type OnlineOrderFulfillment,
  type OnlineOrderItemSnapshot,
  type OnlineOrderPaymentMethod,
  type OnlineOrderRecord,
  type OnlineOrderStatus,
  type OnlineOrderStatusEvent,
  PAYMENT_METHODS,
  PRODUCT_CATEGORIES,
  type ProductInput,
  type ProductRecord,
  type PublicCatalogCombo,
  type PublicCatalogProduct,
  type PublicDigitalMenuPayload,
  type PublicOrderTrackingRecord,
  type SaleInput,
  type SaleLineItemSnapshot,
  type SaleOrigin,
  type SaleRecord,
  type ShopSettings,
  type WorkspaceAccess,
} from '../types/finance';
import { calculateSaleTotal, roundCurrency } from '../utils/finance';
import {
  isValidEntityId,
  sanitizeOptionalImagePath,
  sanitizeOptionalImageUrl,
} from '../utils/imageUpload';
import {
  buildSaleInputFromCompletedOrder,
  computeCartSummary,
  DEFAULT_DIGITAL_MENU_SETTINGS,
  formatOrderNumber,
  generateTrackingSecretToken,
  normalizePixKeyInput,
  ORDER_STATUS_LABELS,
  sanitizeMenuSlug,
  sha256Hex,
  validateCheckoutPayload,
  validateOrderStatusTransition,
} from '../utils/onlineOrders';

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
          imageUrl: sanitizeOptionalImageUrl(
            typeof data.imageUrl === 'string' ? data.imageUrl : '',
          ),
          imagePath: sanitizeOptionalImagePath(
            typeof data.imagePath === 'string' ? data.imagePath : '',
            workspace.id,
          ),
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

function validateAndSanitizeItemImage(
  imageUrlRaw: string | undefined,
  imagePathRaw: string | undefined,
  workspaceId: string,
): { imageUrl: string; imagePath: string } {
  const rawUrl = String(imageUrlRaw || '').trim();
  const imageUrl = sanitizeOptionalImageUrl(rawUrl);
  if (rawUrl && !imageUrl) {
    throw new Error('URL de imagem inválida. Envie uma foto válida.');
  }
  const rawPath = String(imagePathRaw || '').trim();
  const imagePath = sanitizeOptionalImagePath(rawPath, workspaceId);
  if (rawPath && !imagePath) {
    throw new Error('Caminho de imagem inválido para este estabelecimento.');
  }
  return { imageUrl, imagePath };
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
  const { imageUrl, imagePath } = validateAndSanitizeItemImage(
    input.imageUrl,
    input.imagePath,
    workspace.id,
  );

  const { ref, path } = getCollectionTarget(workspace, 'products');
  const preferredId =
    input.preferredId && isValidEntityId(input.preferredId.trim())
      ? input.preferredId.trim()
      : '';
  try {
    const docData = {
      ownerId,
      name,
      category: input.category,
      unitPrice,
      countsAsXSalada: Boolean(input.countsAsXSalada),
      active: Boolean(input.active),
      imageUrl,
      imagePath,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    let createdId = '';
    if (preferredId) {
      const targetDocRef = doc(ref, preferredId);
      await setDoc(targetDocRef, docData);
      createdId = preferredId;
    } else {
      const docRef = await addDoc(ref, docData);
      createdId = docRef.id;
    }
    void syncPublicMenuProjectionInFirestore(workspace).catch(() => {});
    return createdId;
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
  const { imageUrl, imagePath } = validateAndSanitizeItemImage(
    input.imageUrl,
    input.imagePath,
    workspace.id,
  );

  const { ref, path } = getDocTarget(workspace, 'products', productId);
  try {
    await updateDoc(ref, {
      name,
      category: input.category,
      unitPrice,
      countsAsXSalada: Boolean(input.countsAsXSalada),
      active: Boolean(input.active),
      imageUrl,
      imagePath,
      updatedAt: serverTimestamp(),
    });
    void syncPublicMenuProjectionInFirestore(workspace).catch(() => {});
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
    void syncPublicMenuProjectionInFirestore(workspace).catch(() => {});
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
          imageUrl: sanitizeOptionalImageUrl(
            typeof data.imageUrl === 'string' ? data.imageUrl : '',
          ),
          imagePath: sanitizeOptionalImagePath(
            typeof data.imagePath === 'string' ? data.imagePath : '',
            workspace.id,
          ),
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
  const { imageUrl, imagePath } = validateAndSanitizeItemImage(
    input.imageUrl,
    input.imagePath,
    workspace.id,
  );

  const { ref, path } = getCollectionTarget(workspace, 'combos');
  const preferredId =
    input.preferredId && isValidEntityId(input.preferredId.trim())
      ? input.preferredId.trim()
      : '';
  try {
    const docData = {
      ownerId,
      name,
      description,
      items: cleanItems,
      salePrice,
      estimatedCost,
      active: Boolean(input.active),
      imageUrl,
      imagePath,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    let createdId = '';
    if (preferredId) {
      const targetDocRef = doc(ref, preferredId);
      await setDoc(targetDocRef, docData);
      createdId = preferredId;
    } else {
      const docRef = await addDoc(ref, docData);
      createdId = docRef.id;
    }
    void syncPublicMenuProjectionInFirestore(workspace).catch(() => {});
    return createdId;
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
  const { imageUrl, imagePath } = validateAndSanitizeItemImage(
    input.imageUrl,
    input.imagePath,
    workspace.id,
  );

  const { ref, path } = getDocTarget(workspace, 'combos', comboId);
  try {
    await updateDoc(ref, {
      name,
      description,
      items: cleanItems,
      salePrice,
      estimatedCost,
      active: Boolean(input.active),
      imageUrl,
      imagePath,
      updatedAt: serverTimestamp(),
    });
    void syncPublicMenuProjectionInFirestore(workspace).catch(() => {});
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
    void syncPublicMenuProjectionInFirestore(workspace).catch(() => {});
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
          saleOrigin: (data.saleOrigin === 'online' ? 'online' : 'manual') as SaleOrigin,
          onlineOrderId:
            typeof data.onlineOrderId === 'string' ? data.onlineOrderId : null,
          onlineOrderNumber:
            typeof data.onlineOrderNumber === 'number' ? data.onlineOrderNumber : null,
          deliveryFee:
            typeof data.deliveryFee === 'number' ? Number(data.deliveryFee) : 0,
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
  payload.saleOrigin = input.saleOrigin === 'online' ? 'online' : 'manual';
  if (input.onlineOrderId) {
    payload.onlineOrderId = input.onlineOrderId;
  }
  if (typeof input.onlineOrderNumber === 'number') {
    payload.onlineOrderNumber = Math.max(1, Math.trunc(input.onlineOrderNumber));
  }
  if (typeof input.deliveryFee === 'number') {
    payload.deliveryFee = roundCurrency(Math.max(0, input.deliveryFee));
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

// ==================== CARDAPIO DIGITAL & PEDIDOS ONLINE (FIREBASE) ====================

function parseTimestampMs(raw: unknown): number | null {
  if (raw instanceof Timestamp) return raw.toMillis();
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  return null;
}

function getOnlineOrdersTarget(workspace: WorkspaceAccess) {
  if (workspace.id === 'gf_lanches') {
    return {
      ref: collection(db, 'workspaces', 'gf_lanches', 'online_orders'),
      path: 'workspaces/gf_lanches/online_orders',
    };
  }
  return {
    ref: collection(db, 'online_orders'),
    path: 'online_orders',
  };
}

function getOnlineOrderDocTarget(workspace: WorkspaceAccess, orderId: string) {
  if (workspace.id === 'gf_lanches') {
    return {
      ref: doc(db, 'workspaces', 'gf_lanches', 'online_orders', orderId),
      path: `workspaces/gf_lanches/online_orders/${orderId}`,
    };
  }
  return {
    ref: doc(db, 'online_orders', orderId),
    path: `online_orders/${orderId}`,
  };
}

function parseOnlineOrderDoc(id: string, data: Record<string, unknown>): OnlineOrderRecord {
  const orderNumber = Math.max(1, Math.trunc(Number(data.orderNumber) || 1));
  const itemsRaw = Array.isArray(data.items) ? data.items : [];
  const items: OnlineOrderItemSnapshot[] = itemsRaw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .map((entry, idx) => ({
      id: String(entry.id || `item_${idx}`),
      itemKind: (entry.itemKind === 'combo' ? 'combo' : 'product') as 'product' | 'combo',
      refId: String(entry.refId || ''),
      itemName: String(entry.itemName || 'Item'),
      quantity: Math.max(1, Math.trunc(Number(entry.quantity) || 1)),
      unitPrice: roundCurrency(Number(entry.unitPrice) || 0),
      lineTotal: roundCurrency(Number(entry.lineTotal) || 0),
      estimatedUnitCost: roundCurrency(Math.max(0, Number(entry.estimatedUnitCost) || 0)),
      xSaladasPerUnit: Math.max(0, Math.trunc(Number(entry.xSaladasPerUnit) || 0)),
      components: Array.isArray(entry.components)
        ? (entry.components as Record<string, unknown>[]).map((c) => ({
            productId: String(c.productId || ''),
            productName: String(c.productName || 'Produto'),
            quantityPerUnit: Math.max(1, Math.trunc(Number(c.quantityPerUnit) || 1)),
            totalQuantity: Math.max(1, Math.trunc(Number(c.totalQuantity) || 1)),
            countsAsXSalada: Boolean(c.countsAsXSalada),
          }))
        : [],
      itemNote: String(entry.itemNote || ''),
    }));

  const histRaw = Array.isArray(data.statusHistory) ? data.statusHistory : [];
  const statusHistory: OnlineOrderStatusEvent[] = histRaw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .map((entry, idx) => ({
      id: String(entry.id || `hist_${idx}`),
      fromStatus: entry.fromStatus ? (String(entry.fromStatus) as OnlineOrderStatus) : null,
      toStatus: String(entry.toStatus || 'received') as OnlineOrderStatus,
      reason: String(entry.reason || ''),
      actorType:
        entry.actorType === 'customer' || entry.actorType === 'admin'
          ? entry.actorType
          : 'system',
      createdAtMs: Number(entry.createdAtMs) || Date.now(),
    }));

  return {
    id,
    tenantId: String(data.workspaceId || 'mgw_lanches'),
    orderNumber,
    orderCode: String(data.orderCode || formatOrderNumber(orderNumber)),
    tokenHash: String(data.tokenHash || ''),
    status: String(data.status || 'received') as OnlineOrderStatus,
    fulfillmentType: (data.fulfillmentType === 'pickup' ? 'pickup' : 'delivery') as OnlineOrderFulfillment,
    customerName: String(data.customerName || ''),
    customerPhone: String(data.customerPhone || ''),
    deliveryAddress: String(data.deliveryAddress || ''),
    deliveryReference: String(data.deliveryReference || ''),
    paymentMethod: (
      data.paymentMethod === 'Pix' || data.paymentMethod === 'Dinheiro'
        ? data.paymentMethod
        : 'Cartão'
    ) as OnlineOrderPaymentMethod,
    changeFor:
      typeof data.changeFor === 'number' ? roundCurrency(data.changeFor) : null,
    customerNote: String(data.customerNote || ''),
    subtotalAmount: roundCurrency(Number(data.subtotalAmount) || 0),
    deliveryFee: roundCurrency(Number(data.deliveryFee) || 0),
    totalAmount: roundCurrency(Number(data.totalAmount) || 0),
    rejectionReason: String(data.rejectionReason || ''),
    viewedAtMs: parseTimestampMs(data.viewedAtMs),
    acceptedAtMs: parseTimestampMs(data.acceptedAtMs),
    preparingAtMs: parseTimestampMs(data.preparingAtMs),
    readyAtMs: parseTimestampMs(data.readyAtMs),
    dispatchedAtMs: parseTimestampMs(data.dispatchedAtMs),
    completedAtMs: parseTimestampMs(data.completedAtMs),
    cancelledAtMs: parseTimestampMs(data.cancelledAtMs),
    saleId: typeof data.saleId === 'string' ? data.saleId : null,
    createdAtMs: parseTimestampMs(data.createdAt) ?? Date.now(),
    updatedAtMs: parseTimestampMs(data.updatedAt) ?? Date.now(),
    items,
    statusHistory,
  };
}

export async function syncPublicMenuProjectionInFirestore(
  workspace: WorkspaceAccess = MGW_WORKSPACE,
  explicitSettings?: DigitalMenuSettingsInput,
): Promise<void> {
  const settingsRef = doc(db, 'digital_menu_settings', workspace.id);
  let menuConfig = explicitSettings;

  if (!menuConfig) {
    const cfgSnap = await getDoc(settingsRef);
    if (!cfgSnap.exists()) return;
    const d = cfgSnap.data();
    menuConfig = {
      slug: sanitizeMenuSlug(String(d.slug || workspace.id), workspace.id),
      isActive: Boolean(d.isActive),
      isOpen: d.isOpen !== false,
      storeName: String(d.storeName || workspace.defaultEstablishmentName),
      description: String(d.description || ''),
      phoneWhatsapp: String(d.phoneWhatsapp || ''),
      address: String(d.address || ''),
      openingHours: String(d.openingHours || ''),
      pixKey: normalizePixKeyInput(String(d.pixKey || '')),
      deliveryFee: roundCurrency(Math.max(0, Number(d.deliveryFee) || 0)),
      minimumOrderAmount: roundCurrency(Math.max(0, Number(d.minimumOrderAmount) || 0)),
      acceptsDelivery: d.acceptsDelivery !== false,
      acceptsPickup: d.acceptsPickup !== false,
      logoUrl: sanitizeOptionalImageUrl(typeof d.logoUrl === 'string' ? d.logoUrl : ''),
      logoPath: sanitizeOptionalImagePath(
        typeof d.logoPath === 'string' ? d.logoPath : '',
        workspace.id,
      ),
      bannerUrl: sanitizeOptionalImageUrl(typeof d.bannerUrl === 'string' ? d.bannerUrl : ''),
      bannerPath: sanitizeOptionalImagePath(
        typeof d.bannerPath === 'string' ? d.bannerPath : '',
        workspace.id,
      ),
    };
  }

  const [prodSnap, comboSnap] = await Promise.all([
    getDocs(getCollectionTarget(workspace, 'products').ref),
    getDocs(getCollectionTarget(workspace, 'combos').ref),
  ]);

  const activeProducts: PublicCatalogProduct[] = prodSnap.docs
    .map((d) => {
      const p = d.data();
      return {
        id: d.id,
        name: String(p.name || ''),
        category: PRODUCT_CATEGORIES.includes(p.category) ? p.category : 'Outro',
        unitPrice: roundCurrency(Math.max(0, Number(p.unitPrice) || 0)),
        countsAsXSalada: Boolean(p.countsAsXSalada),
        imageUrl: sanitizeOptionalImageUrl(typeof p.imageUrl === 'string' ? p.imageUrl : ''),
        active: p.active !== false,
      };
    })
    .filter((p) => p.active)
    .map(({ active: _active, ...rest }) => rest);

  const activeCombos: PublicCatalogCombo[] = comboSnap.docs
    .map((d) => {
      const c = d.data();
      return {
        id: d.id,
        name: String(c.name || ''),
        description: String(c.description || ''),
        items: parseComboItems(c.items),
        salePrice: roundCurrency(Math.max(0, Number(c.salePrice) || 0)),
        imageUrl: sanitizeOptionalImageUrl(typeof c.imageUrl === 'string' ? c.imageUrl : ''),
        active: c.active !== false,
      };
    })
    .filter((c) => c.active)
    .map(({ active: _active, ...rest }) => rest);

  const slug = sanitizeMenuSlug(menuConfig.slug, workspace.id);
  const publicRef = doc(db, 'public_menus', slug);
  await setDoc(publicRef, {
    workspaceId: workspace.id,
    slug,
    isActive: Boolean(menuConfig.isActive),
    isOpen: Boolean(menuConfig.isOpen),
    storeName: menuConfig.storeName.trim().slice(0, 80),
    description: menuConfig.description.trim().slice(0, 300),
    phoneWhatsapp: menuConfig.phoneWhatsapp.trim().slice(0, 32),
    address: menuConfig.address.trim().slice(0, 240),
    openingHours: menuConfig.openingHours.trim().slice(0, 160),
    pixKey: normalizePixKeyInput(menuConfig.pixKey || ''),
    deliveryFee: roundCurrency(Math.max(0, Math.min(1000, Number(menuConfig.deliveryFee) || 0))),
    minimumOrderAmount: roundCurrency(Math.max(0, Math.min(10000, Number(menuConfig.minimumOrderAmount) || 0))),
    acceptsDelivery: Boolean(menuConfig.acceptsDelivery),
    acceptsPickup: Boolean(menuConfig.acceptsPickup),
    logoUrl: sanitizeOptionalImageUrl(menuConfig.logoUrl),
    bannerUrl: sanitizeOptionalImageUrl(menuConfig.bannerUrl),
    products: activeProducts.slice(0, 150),
    combos: activeCombos.slice(0, 100),
    updatedAt: serverTimestamp(),
  });
}

export function subscribeDigitalMenuSettingsFirestore(
  ownerId: string,
  establishmentName: string,
  onData: (settings: DigitalMenuSettings) => void,
  onError: (err: Error) => void,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): () => void {
  const ref = doc(db, 'digital_menu_settings', workspace.id);
  const path = `digital_menu_settings/${workspace.id}`;
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        onData({
          tenantId: workspace.id,
          slug: sanitizeMenuSlug(String(d.slug || workspace.id), workspace.id),
          isActive: Boolean(d.isActive),
          isOpen: d.isOpen !== false,
          storeName: String(d.storeName || establishmentName || workspace.defaultEstablishmentName),
          description: String(d.description || ''),
          phoneWhatsapp: String(d.phoneWhatsapp || ''),
          address: String(d.address || ''),
          openingHours: String(d.openingHours || ''),
          pixKey: normalizePixKeyInput(String(d.pixKey || '')),
          deliveryFee: roundCurrency(Math.max(0, Number(d.deliveryFee) || 0)),
          minimumOrderAmount: roundCurrency(Math.max(0, Number(d.minimumOrderAmount) || 0)),
          acceptsDelivery: d.acceptsDelivery !== false,
          acceptsPickup: d.acceptsPickup !== false,
          logoUrl: sanitizeOptionalImageUrl(typeof d.logoUrl === 'string' ? d.logoUrl : ''),
          logoPath: sanitizeOptionalImagePath(
            typeof d.logoPath === 'string' ? d.logoPath : '',
            workspace.id,
          ),
          bannerUrl: sanitizeOptionalImageUrl(typeof d.bannerUrl === 'string' ? d.bannerUrl : ''),
          bannerPath: sanitizeOptionalImagePath(
            typeof d.bannerPath === 'string' ? d.bannerPath : '',
            workspace.id,
          ),
          updatedAtMs: parseTimestampMs(d.updatedAt) ?? Date.now(),
        });
      } else {
        onData({
          tenantId: workspace.id,
          ...DEFAULT_DIGITAL_MENU_SETTINGS,
          slug: workspace.id,
          storeName: establishmentName || workspace.defaultEstablishmentName,
        });
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

export async function saveDigitalMenuSettingsFirestore(
  ownerId: string,
  input: DigitalMenuSettingsInput,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): Promise<void> {
  const ref = doc(db, 'digital_menu_settings', workspace.id);
  const path = `digital_menu_settings/${workspace.id}`;
  const slug = sanitizeMenuSlug(input.slug, workspace.id);
  const storeName = input.storeName.trim().slice(0, 80);
  if (!storeName) {
    throw new Error('Informe o nome da loja no cardápio digital.');
  }
  if (!input.acceptsDelivery && !input.acceptsPickup) {
    throw new Error('Selecione ao menos Entrega ou Retirada.');
  }

  const logo = validateAndSanitizeItemImage(input.logoUrl, input.logoPath, workspace.id);
  const banner = validateAndSanitizeItemImage(input.bannerUrl, input.bannerPath, workspace.id);

  try {
    const snap = await getDoc(ref);
    const payload = {
      slug,
      isActive: Boolean(input.isActive),
      isOpen: Boolean(input.isOpen),
      storeName,
      description: input.description.trim().slice(0, 300),
      phoneWhatsapp: input.phoneWhatsapp.trim().slice(0, 32),
      address: input.address.trim().slice(0, 240),
      openingHours: input.openingHours.trim().slice(0, 160),
      pixKey: normalizePixKeyInput(input.pixKey || ''),
      deliveryFee: roundCurrency(Math.max(0, Math.min(1000, Number(input.deliveryFee) || 0))),
      minimumOrderAmount: roundCurrency(
        Math.max(0, Math.min(10000, Number(input.minimumOrderAmount) || 0)),
      ),
      acceptsDelivery: Boolean(input.acceptsDelivery),
      acceptsPickup: Boolean(input.acceptsPickup),
      logoUrl: logo.imageUrl,
      logoPath: logo.imagePath,
      bannerUrl: banner.imageUrl,
      bannerPath: banner.imagePath,
    };

    if (snap.exists()) {
      await setDoc(
        ref,
        {
          ownerId: String(snap.data().ownerId || ownerId),
          ...payload,
          nextOrderSeq: Math.max(1, Math.trunc(Number(snap.data().nextOrderSeq) || 1)),
          createdAt: snap.data().createdAt,
          updatedAt: serverTimestamp(),
        },
        { merge: false },
      );
    } else {
      await setDoc(ref, {
        ownerId,
        ...payload,
        nextOrderSeq: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await syncPublicMenuProjectionInFirestore(workspace, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeOnlineOrdersFirestore(
  onData: (orders: OnlineOrderRecord[]) => void,
  onError: (err: Error) => void,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): () => void {
  const { ref, path } = getOnlineOrdersTarget(workspace);
  return onSnapshot(
    query(ref),
    (snapshot) => {
      const orders = snapshot.docs.map((d) =>
        parseOnlineOrderDoc(d.id, d.data() as Record<string, unknown>),
      );
      orders.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(orders);
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

export async function fetchPublicDigitalMenuFirestore(
  slug?: string,
): Promise<PublicDigitalMenuPayload> {
  const targetSlug = sanitizeMenuSlug(slug || 'mgw_lanches', 'mgw_lanches');
  const snap = await getDoc(doc(db, 'public_menus', targetSlug));
  if (!snap.exists()) {
    return { found: false, store: null, products: [], combos: [] };
  }
  const d = snap.data();
  const isActive = Boolean(d.isActive);
  return {
    found: true,
    store: {
      slug: sanitizeMenuSlug(String(d.slug || targetSlug), targetSlug),
      isActive,
      isOpen: Boolean(d.isOpen),
      storeName: String(d.storeName || 'MGW Lanches'),
      description: String(d.description || ''),
      phoneWhatsapp: String(d.phoneWhatsapp || ''),
      address: String(d.address || ''),
      openingHours: String(d.openingHours || ''),
      pixKey: normalizePixKeyInput(String(d.pixKey || '')),
      deliveryFee: roundCurrency(Math.max(0, Number(d.deliveryFee) || 0)),
      minimumOrderAmount: roundCurrency(Math.max(0, Number(d.minimumOrderAmount) || 0)),
      acceptsDelivery: d.acceptsDelivery !== false,
      acceptsPickup: d.acceptsPickup !== false,
      logoUrl: sanitizeOptionalImageUrl(typeof d.logoUrl === 'string' ? d.logoUrl : ''),
      bannerUrl: sanitizeOptionalImageUrl(typeof d.bannerUrl === 'string' ? d.bannerUrl : ''),
    },
    products:
      isActive && Array.isArray(d.products)
        ? (d.products as PublicCatalogProduct[]).map((p) => ({
            ...p,
            imageUrl: sanitizeOptionalImageUrl(p.imageUrl),
          }))
        : [],
    combos:
      isActive && Array.isArray(d.combos)
        ? (d.combos as PublicCatalogCombo[]).map((c) => ({
            ...c,
            imageUrl: sanitizeOptionalImageUrl(c.imageUrl),
          }))
        : [],
  };
}

export async function createPublicOnlineOrderFirestore(
  payload: CreatePublicOrderPayload,
): Promise<CreatePublicOrderResponse> {
  const targetSlug = sanitizeMenuSlug(payload.slug || 'mgw_lanches', 'mgw_lanches');
  const menuSnap = await getDoc(doc(db, 'public_menus', targetSlug));
  if (!menuSnap.exists()) {
    throw new Error('Cardápio digital não encontrado.');
  }

  const menuData = menuSnap.data();
  const workspaceId = menuData.workspaceId === 'gf_lanches' ? 'gf_lanches' : 'mgw_lanches';
  const menuSettings: DigitalMenuSettingsInput = {
    slug: targetSlug,
    isActive: Boolean(menuData.isActive),
    isOpen: Boolean(menuData.isOpen),
    storeName: String(menuData.storeName || 'MGW Lanches'),
    description: String(menuData.description || ''),
    phoneWhatsapp: String(menuData.phoneWhatsapp || ''),
    address: String(menuData.address || ''),
    openingHours: String(menuData.openingHours || ''),
    pixKey: normalizePixKeyInput(String(menuData.pixKey || '')),
    deliveryFee: roundCurrency(Math.max(0, Number(menuData.deliveryFee) || 0)),
    minimumOrderAmount: roundCurrency(Math.max(0, Number(menuData.minimumOrderAmount) || 0)),
    acceptsDelivery: menuData.acceptsDelivery !== false,
    acceptsPickup: menuData.acceptsPickup !== false,
  };

  const products = Array.isArray(menuData.products)
    ? (menuData.products as PublicCatalogProduct[])
    : [];
  const combos = Array.isArray(menuData.combos)
    ? (menuData.combos as PublicCatalogCombo[])
    : [];

  const cartSummary = computeCartSummary(
    payload.items,
    products,
    combos,
    menuSettings,
    payload.fulfillmentType,
  );
  const check = validateCheckoutPayload(payload, cartSummary, menuSettings);
  if (!check.valid) {
    throw new Error(check.error || 'Dados inválidos no pedido.');
  }

  const trackingToken = generateTrackingSecretToken();
  const tokenHash = await sha256Hex(trackingToken);
  const orderCode = trackingToken.slice(0, 6).toUpperCase();
  const orderNumber = Math.max(
    1,
    Math.trunc((Date.now() - 1700000000000) / 1000) % 99999,
  );
  const orderId = `ord_${Date.now()}_${orderCode.toLowerCase()}`;
  const nowMs = Date.now();

  const comboMap = new Map(combos.map((c) => [c.id, c]));
  const productMap = new Map(products.map((p) => [p.id, p]));

  const orderItems = cartSummary.lines.map((line, idx) => {
    if (line.kind === 'combo') {
      const c = comboMap.get(line.id);
      return {
        id: `it_${idx}_${line.id}`,
        itemKind: 'combo',
        refId: line.id,
        itemName: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        estimatedUnitCost: 0,
        xSaladasPerUnit: line.xSaladasPerUnit,
        components: (c?.items ?? []).map((comp) => ({
          productId: comp.productId,
          productName: comp.productName,
          quantityPerUnit: comp.quantity,
          totalQuantity: comp.quantity * line.quantity,
          countsAsXSalada: comp.countsAsXSalada,
        })),
        itemNote: line.note,
      };
    }

    const p = productMap.get(line.id);
    return {
      id: `it_${idx}_${line.id}`,
      itemKind: 'product',
      refId: line.id,
      itemName: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      estimatedUnitCost: 0,
      xSaladasPerUnit: line.xSaladasPerUnit,
      components: [
        {
          productId: p?.id ?? line.id,
          productName: line.name,
          quantityPerUnit: 1,
          totalQuantity: line.quantity,
          countsAsXSalada: Boolean(p?.countsAsXSalada),
        },
      ],
      itemNote: line.note,
    };
  });

  const initialHistory = [
    {
      id: `hist_${nowMs}`,
      fromStatus: null,
      toStatus: 'received',
      reason: 'Pedido enviado pelo cardápio digital.',
      actorType: 'customer',
      createdAtMs: nowMs,
    },
  ];

  const batch = writeBatch(db);
  const orderRef =
    workspaceId === 'gf_lanches'
      ? doc(db, 'workspaces', 'gf_lanches', 'online_orders', orderId)
      : doc(db, 'online_orders', orderId);
  const trackingRef = doc(db, 'public_order_tracking', tokenHash);

  const deliveryAddress =
    payload.fulfillmentType === 'delivery' ? payload.deliveryAddress.trim().slice(0, 280) : '';
  const deliveryReference =
    payload.fulfillmentType === 'delivery' ? payload.deliveryReference.trim().slice(0, 160) : '';
  const changeFor =
    payload.paymentMethod === 'Dinheiro' &&
    payload.changeFor !== null &&
    payload.changeFor > 0
      ? roundCurrency(payload.changeFor)
      : null;

  batch.set(orderRef, {
    workspaceId,
    menuSlug: targetSlug,
    orderNumber,
    orderCode,
    tokenHash,
    status: 'received',
    fulfillmentType: payload.fulfillmentType,
    customerName: payload.customerName.trim().slice(0, 120),
    customerPhone: payload.customerPhone.trim().slice(0, 32),
    deliveryAddress,
    deliveryReference,
    paymentMethod: payload.paymentMethod,
    changeFor,
    customerNote: payload.customerNote.trim().slice(0, 300),
    subtotalAmount: cartSummary.subtotal,
    deliveryFee: cartSummary.deliveryFee,
    totalAmount: cartSummary.totalAmount,
    rejectionReason: '',
    viewedAtMs: null,
    acceptedAtMs: null,
    preparingAtMs: null,
    readyAtMs: null,
    dispatchedAtMs: null,
    completedAtMs: null,
    cancelledAtMs: null,
    saleId: null,
    items: orderItems,
    statusHistory: initialHistory,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(trackingRef, {
    orderId,
    workspaceId,
    tokenHash,
    orderNumber,
    orderCode,
    status: 'received',
    fulfillmentType: payload.fulfillmentType,
    customerName: payload.customerName.trim().slice(0, 120),
    deliveryAddress,
    deliveryReference,
    paymentMethod: payload.paymentMethod,
    changeFor,
    customerNote: payload.customerNote.trim().slice(0, 300),
    subtotalAmount: cartSummary.subtotal,
    deliveryFee: cartSummary.deliveryFee,
    totalAmount: cartSummary.totalAmount,
    rejectionReason: '',
    storeName: menuSettings.storeName,
    storeSlug: targetSlug,
    storeWhatsapp: menuSettings.phoneWhatsapp,
    storeAddress: menuSettings.address,
    storePixKey: normalizePixKeyInput(menuSettings.pixKey || ''),
    items: orderItems.map((it) => ({
      id: it.id,
      itemKind: it.itemKind,
      refId: it.refId,
      itemName: it.itemName,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      lineTotal: it.lineTotal,
      itemNote: it.itemNote,
    })),
    statusHistory: initialHistory,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();

  return {
    orderId,
    orderNumber,
    orderCode,
    trackingToken,
    tokenHash,
    status: 'received',
    subtotalAmount: cartSummary.subtotal,
    deliveryFee: cartSummary.deliveryFee,
    totalAmount: cartSummary.totalAmount,
  };
}

function mapTrackingSnap(d: Record<string, unknown>): PublicOrderTrackingRecord {
  const orderNumber = Math.max(1, Math.trunc(Number(d.orderNumber) || 1));
  return {
    orderId: String(d.orderId || ''),
    tokenHash: String(d.tokenHash || ''),
    orderNumber,
    orderCode: String(d.orderCode || formatOrderNumber(orderNumber)),
    status: String(d.status || 'received') as OnlineOrderStatus,
    fulfillmentType: (d.fulfillmentType === 'pickup' ? 'pickup' : 'delivery') as OnlineOrderFulfillment,
    customerName: String(d.customerName || ''),
    deliveryAddress: String(d.deliveryAddress || ''),
    deliveryReference: String(d.deliveryReference || ''),
    paymentMethod: (
      d.paymentMethod === 'Pix' || d.paymentMethod === 'Dinheiro' ? d.paymentMethod : 'Cartão'
    ) as OnlineOrderPaymentMethod,
    changeFor: typeof d.changeFor === 'number' ? roundCurrency(d.changeFor) : null,
    customerNote: String(d.customerNote || ''),
    subtotalAmount: roundCurrency(Number(d.subtotalAmount) || 0),
    deliveryFee: roundCurrency(Number(d.deliveryFee) || 0),
    totalAmount: roundCurrency(Number(d.totalAmount) || 0),
    rejectionReason: String(d.rejectionReason || ''),
    storeName: String(d.storeName || 'MGW Lanches'),
    storeSlug: String(d.storeSlug || 'mgw_lanches'),
    storeWhatsapp: String(d.storeWhatsapp || ''),
    storeAddress: String(d.storeAddress || ''),
    storePixKey: normalizePixKeyInput(String(d.storePixKey || '')),
    createdAtMs: parseTimestampMs(d.createdAt) ?? Date.now(),
    updatedAtMs: parseTimestampMs(d.updatedAt) ?? Date.now(),
    items: Array.isArray(d.items)
      ? (d.items as Record<string, unknown>[]).map((it, idx) => ({
          id: String(it.id || `it_${idx}`),
          itemKind: (it.itemKind === 'combo' ? 'combo' : 'product') as 'product' | 'combo',
          refId: String(it.refId || ''),
          itemName: String(it.itemName || 'Item'),
          quantity: Math.max(1, Math.trunc(Number(it.quantity) || 1)),
          unitPrice: roundCurrency(Number(it.unitPrice) || 0),
          lineTotal: roundCurrency(Number(it.lineTotal) || 0),
          itemNote: String(it.itemNote || ''),
        }))
      : [],
    statusHistory: Array.isArray(d.statusHistory)
      ? (d.statusHistory as Record<string, unknown>[]).map((h, idx) => ({
          id: String(h.id || `h_${idx}`),
          fromStatus: h.fromStatus ? (String(h.fromStatus) as OnlineOrderStatus) : null,
          toStatus: String(h.toStatus || 'received') as OnlineOrderStatus,
          reason: String(h.reason || ''),
          createdAtMs: Number(h.createdAtMs) || Date.now(),
        }))
      : [],
  };
}

export async function fetchPublicOrderByTokenFirestore(
  token: string,
): Promise<PublicOrderTrackingRecord | null> {
  const tokenHash = await sha256Hex(token.trim());
  const snap = await getDoc(doc(db, 'public_order_tracking', tokenHash));
  if (!snap.exists()) return null;
  return mapTrackingSnap(snap.data() as Record<string, unknown>);
}

export function subscribePublicOrderByTokenHashFirestore(
  tokenHash: string,
  onUpdate: (order: PublicOrderTrackingRecord | null) => void,
  onError: (err: Error) => void,
): () => void {
  const ref = doc(db, 'public_order_tracking', tokenHash);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      onUpdate(mapTrackingSnap(snap.data() as Record<string, unknown>));
    },
    (err) => {
      onError(err instanceof Error ? err : new Error(String(err)));
    },
  );
}

export async function markOnlineOrderViewedFirestore(
  order: OnlineOrderRecord,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): Promise<void> {
  if (order.viewedAtMs) return;
  const { ref, path } = getOnlineOrderDocTarget(workspace, order.id);
  try {
    await updateDoc(ref, {
      viewedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function transitionOnlineOrderStatusFirestore(
  ownerId: string,
  order: OnlineOrderRecord,
  nextStatus: OnlineOrderStatus,
  reason: string,
  workspace: WorkspaceAccess = MGW_WORKSPACE,
): Promise<void> {
  const check = validateOrderStatusTransition(
    order.status,
    nextStatus,
    order.fulfillmentType,
    reason,
  );
  if (!check.valid) {
    throw new Error(check.error || 'Transição de status inválida.');
  }

  const nowMs = Date.now();
  const cleanReason =
    nextStatus === 'rejected' || nextStatus === 'cancelled'
      ? reason.trim().slice(0, 300)
      : `${ORDER_STATUS_LABELS[nextStatus]}.`;

  const nextHistory: OnlineOrderStatusEvent[] = [
    ...order.statusHistory,
    {
      id: `hist_${nowMs}`,
      fromStatus: order.status,
      toStatus: nextStatus,
      reason: cleanReason,
      actorType: 'admin' as const,
      createdAtMs: nowMs,
    },
  ].slice(-30);

  const deterministicSaleId = `online_${order.id}`;
  const batch = writeBatch(db);
  const { ref: orderRef, path } = getOnlineOrderDocTarget(workspace, order.id);
  const trackingRef = doc(db, 'public_order_tracking', order.tokenHash);

  const orderUpdates: Record<string, unknown> = {
    status: nextStatus,
    viewedAtMs: order.viewedAtMs ?? nowMs,
    statusHistory: nextHistory,
    updatedAt: serverTimestamp(),
  };

  if (nextStatus === 'accepted') orderUpdates.acceptedAtMs = order.acceptedAtMs ?? nowMs;
  if (nextStatus === 'preparing') orderUpdates.preparingAtMs = order.preparingAtMs ?? nowMs;
  if (nextStatus === 'ready') orderUpdates.readyAtMs = order.readyAtMs ?? nowMs;
  if (nextStatus === 'out_for_delivery' || nextStatus === 'ready_for_pickup') {
    orderUpdates.dispatchedAtMs = order.dispatchedAtMs ?? nowMs;
  }
  if (nextStatus === 'completed') {
    orderUpdates.completedAtMs = order.completedAtMs ?? nowMs;
    orderUpdates.saleId = order.saleId ?? deterministicSaleId;
  }
  if (nextStatus === 'rejected' || nextStatus === 'cancelled') {
    orderUpdates.cancelledAtMs = order.cancelledAtMs ?? nowMs;
    orderUpdates.rejectionReason = cleanReason;
  }

  batch.update(orderRef, orderUpdates);
  batch.update(trackingRef, {
    status: nextStatus,
    rejectionReason:
      nextStatus === 'rejected' || nextStatus === 'cancelled'
        ? cleanReason
        : order.rejectionReason,
    statusHistory: nextHistory,
    updatedAt: serverTimestamp(),
  });

  if (nextStatus === 'completed' && !order.saleId) {
    const completedSnapshot: OnlineOrderRecord = {
      ...order,
      status: 'completed',
      completedAtMs: nowMs,
    };
    const saleInput = buildSaleInputFromCompletedOrder(completedSnapshot);
    const saleRef =
      workspace.id === 'gf_lanches'
        ? doc(db, 'workspaces', 'gf_lanches', 'sales', deterministicSaleId)
        : doc(db, 'sales', deterministicSaleId);

    const totalAmount =
      saleInput.items && saleInput.items.length > 0
        ? roundCurrency(saleInput.items.reduce((acc, i) => acc + i.lineTotal, 0))
        : roundCurrency(order.totalAmount);

    batch.set(saleRef, {
      ownerId,
      date: saleInput.date,
      quantity: saleInput.quantity,
      unitPrice: saleInput.unitPrice,
      totalAmount,
      paymentMethod: saleInput.paymentMethod,
      note: saleInput.note,
      saleMode: saleInput.saleMode ?? 'individual',
      xSaladaCount: saleInput.xSaladaCount ?? 0,
      combosCount: saleInput.combosCount ?? 0,
      items: saleInput.items ?? [],
      saleOrigin: 'online',
      onlineOrderId: order.id,
      onlineOrderNumber: order.orderNumber,
      deliveryFee: saleInput.deliveryFee ?? 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
