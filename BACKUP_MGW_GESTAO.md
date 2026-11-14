# BACKUP DE SEGURANÇA — MGW GESTÃO (PRÉ-MIGRAÇÃO SAAS)

## 1. Identificação da Versão de Segurança

- **Data do backup:** `2026-11-14`
- **Projeto:** MGW GESTÃO (`package.json` → `name: "react-example"`, `version: "0.0.0"`)
- **Etapa:** Etapa 2 — Preparação do Projeto e Backup de Segurança (versão 100% funcional em Firebase antes da migração SaaS para Supabase/Vercel/Mercado Pago)
- **Estado do Git:** **Não há repositório Git (`.git`) inicializado nem repositório GitHub remoto conectado** neste ambiente (`/app/applet`). Nenhuma operação Git (`git init`, `branch`, `tag`) foi simulada.
- **Branch e Tag de segurança:** **Não aplicável neste ambiente** (ao conectar o GitHub em máquina local/CI, recomenda-se imediatamente criar a branch `backup/pre-saas-migration` e a tag `pre-saas-migration-2026-11-14` a partir deste pacote restaurado).

---

## 2. Localização dos Arquivos de Segurança

Todos os artefatos de backup gerados nesta etapa estão armazenados em:

- `backups/mgw-gestao-pre-saas-2026-11-14.tar.gz` — Pacote compactado integral para download e guarda externa (excluindo `node_modules/`, `dist/`, `.env` privados e a própria pasta `backups/`).
- `backups/mgw-gestao-pre-saas-2026-11-14.sha256` — Hash criptográfico SHA-256 para validação de integridade do pacote.
- `backups/MANIFEST_2026-11-14.txt` — Lista exata de todos os arquivos contidos no pacote `.tar.gz`.
- `BACKUP_MGW_GESTAO.md` — Este documento de referência e restauração.

---

## 3. Inventário de Arquivos Protegidos

### 3.1 Código-fonte e Interface React (`src/`)
- `src/App.tsx` e `src/main.tsx` e `src/index.css`
- **Telas e componentes (`src/components/`):**
  - `Charts.tsx`, `DashboardView.tsx`, `ExpenseModal.tsx`, `ExpensesView.tsx`, `LoginScreen.tsx`, `ProductsCombosManager.tsx`, `ReportsView.tsx`, `SaleModal.tsx`, `SalesView.tsx`, `SettingsView.tsx`
- **Serviços e Regras de Negócio:**
  - `src/firebase.ts`
  - `src/services/firestoreService.ts`
  - `src/types/finance.ts`
  - `src/utils/finance.ts`, `src/utils/finance.test.ts`, `src/utils/exporters.ts`

### 3.2 Configuração, Dependências e Firebase
- `package.json` e `bun.lock` (`package-lock.json` não existe neste projeto; o lockfile ativo é `bun.lock`)
- `vite.config.ts` e `tsconfig.json`
- `index.html`, `metadata.json`, `.gitignore` e `.env.example` (somente placeholders, sem segredos)
- `firestore.rules` e `firebase-blueprint.json`
- `firebase-applet-config.json` (contém apenas configuração cliente Web do Firebase necessária para compilação e execução da versão original; nenhuma chave privada Admin SDK ou token secreto existe no projeto)
- `public/assets/aistudio/Screenshot_20261114_000529_Chrome_856aa83d.jpg`

### 3.3 Arquivos SQL da Etapa 1 Preservados (`supabase/`)
- `supabase/migrations/20261114000001_initial_saas_schema.sql`
- `supabase/seeds/001_founding_tenants.sql`
- `supabase/README.md`

### 3.4 Itens Propositalmente Excluídos do Pacote de Backup
- `node_modules/` (recriável via `npm install` / `bun install`)
- `dist/` (recriável via `npm run build`)
- Quaisquer arquivos `.env`, `.env.local`, `.env.production` (não existem no workspace; mantidos bloqueados no `.gitignore`)
- Arquivos internos temporários do runtime (`.aistudio/`, `backups/`)

---

## 4. Auditoria de Credenciais e Segurança

- **Arquivos `.env` privados:** Nenhum arquivo `.env` com segredos existe no ambiente; apenas `.env.example` com placeholders documentados.
- **Chaves privadas / Service Accounts:** Nenhuma chave privada (`serviceAccountKey.json`, `SUPABASE_SERVICE_ROLE_KEY`, tokens privados ou senhas de banco) existe no repositório.
- **Atenção ao subir para GitHub público:** Caso o código seja enviado a um repositório GitHub **público**, avalie manter o repositório **privado** ou mover parâmetros de `firebase-applet-config.json` após a migração, embora esse arquivo contenha apenas identificadores públicos do SDK Web (protegidos pelas regras em `firestore.rules`).

---

## 5. Situação do Backup dos Dados Firebase (Firestore e Authentication)

### 5.1 Estabelecimentos e Estruturas Mapeadas
1. **MGW Lanches (workspace `mgw_lanches`):**
   - Usuários autorizados: `warney.fernandes22@gmail.com` e `fernandes38mk@gmail.com`
   - Caminhos Firestore:
     - `/settings/mgw_lanches` (e eventual documento legado `/settings/{uid}`)
     - `/products/{productId}`
     - `/combos/{comboId}`
     - `/sales/{saleId}`
     - `/expenses/{expenseId}`
2. **Outro Lanche — Conta Separada (workspace `gf_lanches`):**
   - Usuário autorizado: `gf3163666@gmail.com`
   - Caminhos Firestore:
     - `/workspaces/gf_lanches/settings/main`
     - `/workspaces/gf_lanches/products/{productId}`
     - `/workspaces/gf_lanches/combos/{comboId}`
     - `/workspaces/gf_lanches/sales/{saleId}`
     - `/workspaces/gf_lanches/expenses/{expenseId}`

### 5.2 Situação Técnica da Exportação Neste Ambiente
- **Não foi possível executar a exportação automática** dos documentos do Firestore nem da lista de usuários do Firebase Authentication a partir deste container:
  - O `firebase` CLI (`15.34.1`) está sem conta autenticada (`No authorized accounts, run "firebase login"`).
  - Não há `GOOGLE_APPLICATION_CREDENTIALS` nem chave de Service Account Admin SDK configurada no ambiente.
  - Nenhum dado original, usuário ou regra (`firestore.rules`) foi alterado.

### 5.3 Procedimento Obrigatório para o Proprietário Exportar os Dados Firebase (Antes da Etapa 3)

#### A) Backup integral do Cloud Firestore (via Google Cloud CLI ou Console)
O banco Firestore utiliza o banco nomeado **`ai-studio-5d967d5b-7f64-4596-bbb5-41f0f97efc10`** dentro do projeto **`intelligent-crossing-bmbw7`**.

1. Acesse o **Google Cloud Console** com a conta proprietária (`warney.fernandes22@gmail.com`) no projeto `intelligent-crossing-bmbw7`.
2. Crie ou selecione um bucket no **Cloud Storage** na mesma região do Firestore (ex.: `gs://mgw-gestao-backups-2026`).
3. No **Cloud Shell** do Google Cloud Console, execute:
   ```bash
   gcloud firestore export gs://SEU_BUCKET_BACKUP/firestore-pre-saas-2026-11-14 \
     --project=intelligent-crossing-bmbw7 \
     --database='ai-studio-5d967d5b-7f64-4596-bbb5-41f0f97efc10'
   ```
   *(Isso exporta integralmente `settings`, `products`, `combos`, `sales`, `expenses` e `workspaces` sem alterar nenhum dado em produção).*
4. Opcionalmente, baixe uma cópia local do bucket pelo Cloud Shell:
   ```bash
   gcloud storage cp -r gs://SEU_BUCKET_BACKUP/firestore-pre-saas-2026-11-14 ./firestore-backup
   ```

#### B) Backup dos Usuários do Firebase Authentication
1. Em sua máquina local (ou Cloud Shell) autenticado no Firebase CLI (`firebase login`):
   ```bash
   firebase use intelligent-crossing-bmbw7
   firebase auth:export auth-users-pre-saas-2026-11-14.json --format=json
   ```
2. Confirme no arquivo gerado a presença das 3 contas (`warney.fernandes22@gmail.com`, `fernandes38mk@gmail.com`, `gf3163666@gmail.com`) e guarde o JSON em local seguro offline (não enviar ao GitHub).

---

## 6. Procedimento para Restaurar a Versão Original

Caso qualquer etapa futura precise ser revertida para esta versão exata:

### 6.1 Restauração do Código-Fonte e Dependências
1. Verifique a integridade do arquivo compactado:
   ```bash
   sha256sum -c backups/mgw-gestao-pre-saas-2026-11-14.sha256
   ```
2. Extraia o pacote em uma pasta limpa:
   ```bash
   mkdir -p mgw-gestao-restaurado
   tar -xzf backups/mgw-gestao-pre-saas-2026-11-14.tar.gz -C mgw-gestao-restaurado
   cd mgw-gestao-restaurado
   ```
3. Reinstale as dependências e valide o build:
   ```bash
   npm install
   npm run lint
   npm run build
   ```
4. Para rodar localmente na porta `3000`:
   ```bash
   npm run dev
   ```
5. Se já estiver conectado a um repositório GitHub com a branch/tag de segurança criadas futuramente:
   ```bash
   git checkout pre-saas-migration-2026-11-14
   ```

### 6.2 Restauração do Banco Firestore (se necessário)
No Google Cloud Shell, importe o snapshot exportado na seção 5.3:
```bash
gcloud firestore import gs://SEU_BUCKET_BACKUP/firestore-pre-saas-2026-11-14 \
  --project=intelligent-crossing-bmbw7 \
  --database='ai-studio-5d967d5b-7f64-4596-bbb5-41f0f97efc10'
```
*(Execute apenas se houver necessidade real de rollback de dados).*
