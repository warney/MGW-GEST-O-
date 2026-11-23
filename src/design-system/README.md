# MGW Gestão — Design System

## Direção aprovada
- Tema claro, minimalista e profissional.
- Inter como tipografia principal.
- Amarelo MGW como acento, reservado a ações e estados selecionados.
- Navegação desktop fixa e densidade confortável.
- Superfícies brancas, canvas cinza-claro, bordas discretas e sombras leves.
- Transições curtas e respeito a `prefers-reduced-motion`.

## Regras de migração
1. Aplicar o tema novo somente ao painel autenticado de gestão.
2. Manter Landing, Login/Onboarding e Cardápio Digital como superfícies separadas até suas etapas próprias.
3. Não alterar regras de negócio, cálculos financeiros, RBAC, isolamento multi-tenant, consultas Supabase ou fluxos de pedidos durante a migração visual.
4. Preservar estados de carregamento, vazio, erro, sucesso e acessibilidade.
5. Migrar por etapas pequenas e validar build, testes e impressão antes de integrar.

## Tokens
Os tokens iniciais estão em `tokens.css`. São opt-in pela classe `.mgw-app-theme`; as telas legadas continuam com o tema atual até migrarem, evitando uma troca global incompleta.
