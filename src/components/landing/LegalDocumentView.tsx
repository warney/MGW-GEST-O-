import { ArrowLeft, Shield, FileText } from 'lucide-react';

interface LegalDocumentViewProps {
  kind: 'terms' | 'privacy';
  onNavigate: (path: string) => void;
}

export function LegalDocumentView({
  kind,
  onNavigate,
}: LegalDocumentViewProps) {
  const isTerms = kind === 'terms';

  return (
    <div className="min-h-screen bg-[#0B0D11] text-[#F3F4F6] flex flex-col">
      <header className="sticky top-0 z-30 border-b border-[#232834] bg-[#0B0D11]/90 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#D1D5DB] hover:text-[#F5B731] min-h-[44px] cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            Voltar para o MGW Gestão
          </button>

          <button
            type="button"
            onClick={() => onNavigate('/cadastro')}
            className="min-h-[40px] px-4 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-xs sm:text-sm font-bold cursor-pointer transition-colors whitespace-nowrap shrink-0"
          >
            Começar teste grátis
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-10 sm:py-14">
        <div className="mb-8 space-y-3 border-b border-[#232834] pb-6">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F5B731]">
            {isTerms ? (
              <FileText className="w-4 h-4" />
            ) : (
              <Shield className="w-4 h-4" />
            )}
            <span>{isTerms ? 'Termos de Uso' : 'Política de Privacidade'}</span>
          </div>
          <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-[#F9FAFB]">
            {isTerms
              ? 'Termos de Uso do MGW Gestão'
              : 'Política de Privacidade do MGW Gestão'}
          </h1>
          <p className="text-sm text-[#9CA3AF]">
            Condições aplicáveis ao acesso e uso da plataforma MGW Gestão e do
            Cardápio Digital integrado.
          </p>
        </div>

        {isTerms ? (
          <article className="space-y-6 text-sm sm:text-base leading-relaxed text-[#D1D5DB]">
            <section className="space-y-2">
              <h2 className="font-display text-lg font-bold text-[#F3F4F6]">
                1. Objeto e funcionamento do serviço
              </h2>
              <p>
                O MGW Gestão é um sistema online voltado à organização operacional
                de lanchonetes, hamburguerias, pastelarias e estabelecimentos de
                alimentação rápida. O acesso inclui controle de vendas, despesas,
                cadastro de produtos, combos, categorias, adicionais, relatórios,
                central de pedidos e cardápio digital compartilhável.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-lg font-bold text-[#F3F4F6]">
                2. Período de teste e assinatura
              </h2>
              <p>
                Novos cadastros recebem 3 dias gratuitos para testar os recursos
                do sistema com o seu próprio catálogo, sem exigência de cartão de
                crédito na criação da conta. Após o período de teste, a
                continuidade do acesso ao painel segue o plano mensal de R$ 49,90
                por mês.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-lg font-bold text-[#F3F4F6]">
                3. Responsabilidade sobre dados e pedidos
              </h2>
              <p>
                Cada estabelecimento é responsável pelas informações cadastradas em
                seu catálogo, pelos preços exibidos no cardápio digital e pelo
                atendimento dos pedidos recebidos de seus clientes, incluindo o
                recebimento dos pagamentos combinados diretamente no atendimento,
                na entrega ou na retirada.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-lg font-bold text-[#F3F4F6]">
                4. Acesso, segurança da conta e encerramento
              </h2>
              <p>
                O acesso ao painel requer autenticação válida e é isolado por
                estabelecimento conforme as permissões da conta. Recomendamos
                manter seu e-mail e senha protegidos e restringir o acesso de
                membros da equipe ao papel adequado na operação.
              </p>
            </section>
          </article>
        ) : (
          <article className="space-y-6 text-sm sm:text-base leading-relaxed text-[#D1D5DB]">
            <section className="space-y-2">
              <h2 className="font-display text-lg font-bold text-[#F3F4F6]">
                1. Dados coletados para operação
              </h2>
              <p>
                Para viabilizar o acesso autenticado e a operação da lanchonete,
                o MGW Gestão armazena informações cadastrais da conta (nome,
                e-mail e nome do estabelecimento), registros operacionais lançados
                pelo usuário (produtos, combos, categorias, adicionais, vendas,
                despesas e configurações) e dados informados pelos clientes no
                envio de pedidos online.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-lg font-bold text-[#F3F4F6]">
                2. Isolamento entre estabelecimentos
              </h2>
              <p>
                A base de dados utiliza autenticação e regras de segurança por
                estabelecimento (Row Level Security no banco PostgreSQL), de modo
                que os dados internos de vendas, despesas e pedidos de uma loja não
                fiquem acessíveis a outros estabelecimentos cadastrados na
                plataforma.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-lg font-bold text-[#F3F4F6]">
                3. Informações públicas do cardápio digital
              </h2>
              <p>
                Apenas os dados configurados para exibição pública da loja — como
                nome, descrição, horário, endereço, WhatsApp, itens ativos e taxas
                do cardápio — ficam visíveis na página pública do estabelecimento.
                Relatórios, despesas e registros administrativos permanecem
                restritos aos usuários autenticados da loja.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-lg font-bold text-[#F3F4F6]">
                4. Armazenamento e contato
              </h2>
              <p>
                Os dados são armazenados em infraestrutura na nuvem (Supabase) e
                utilizados exclusivamente para o funcionamento dos módulos do MGW
                Gestão. Solicitações relacionadas à conta ou à exclusão de dados
                podem ser tratadas diretamente pelos canais oficiais de suporte
                informados no ambiente da conta.
              </p>
            </section>
          </article>
        )}

        <div className="mt-10 pt-6 border-t border-[#232834] flex flex-wrap items-center gap-4 text-xs text-[#9CA3AF]">
          <button
            type="button"
            onClick={() => onNavigate(isTerms ? '/privacidade' : '/termos')}
            className="text-[#F5B731] hover:underline cursor-pointer"
          >
            {isTerms
              ? 'Ler Política de Privacidade'
              : 'Ler Termos de Uso'}
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => onNavigate('/login')}
            className="hover:text-[#F3F4F6] cursor-pointer"
          >
            Entrar no sistema
          </button>
        </div>
      </main>
    </div>
  );
}
