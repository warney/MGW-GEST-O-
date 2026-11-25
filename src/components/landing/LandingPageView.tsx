import { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Check,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Globe,
  Layers,
  LayoutDashboard,
  Lock,
  Menu,
  Package,
  PlusCircle,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Store,
  Timer,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { DesktopFrame, PhoneFrame } from './DeviceFrames';

interface LandingPageViewProps {
  onNavigate: (path: string) => void;
}

interface MenuStepItem {
  step: string;
  title: string;
  description: string;
  caption: string;
  kind: 'phone' | 'desktop';
  src: string;
  urlLabel?: string;
}

const DIGITAL_MENU_STEPS: MenuStepItem[] = [
  {
    step: '01',
    title: 'Cliente abre o cardápio pelo celular',
    description:
      'Sem baixar aplicativo. Basta abrir o link da sua lanchonete enviado no WhatsApp ou salvo na bio do Instagram para ver horário, taxa e status aberto.',
    caption: 'Tela inicial do cardápio digital com nome da loja, horário e entrega.',
    kind: 'phone',
    src: '/assets/screenshots/cardapio-inicio.webp',
  },
  {
    step: '02',
    title: 'Visualiza categorias e produtos',
    description:
      'Busca rápida por nome e abas por categoria permitem encontrar combos, lanches, bebidas e adicionais em poucos toques.',
    caption: 'Catálogo organizado com busca e filtro por categoria.',
    kind: 'phone',
    src: '/assets/screenshots/cardapio-catalogo.webp',
  },
  {
    step: '03',
    title: 'Escolhe combos ou itens individuais',
    description:
      'Cada combo mostra descrição, composição e preço atualizado direto do seu cadastro no painel administrativo.',
    caption: 'Combos especiais e itens individuais com botão direto para adicionar.',
    kind: 'phone',
    src: '/assets/screenshots/cardapio-inicio.webp',
  },
  {
    step: '04',
    title: 'Seleciona observações e adicionais',
    description:
      'Ao abrir o item, o cliente escolhe a quantidade, inclui observações de preparo (como "sem cebola") e seleciona grupos de adicionais configurados pela loja.',
    caption: 'Detalhe do item para quantidade, observação e adicionais da lanchonete.',
    kind: 'phone',
    src: '/assets/screenshots/cardapio-item-detalhe.webp',
  },
  {
    step: '05',
    title: 'Adiciona à sacola e escolhe entrega ou retirada',
    description:
      'A sacola calcula subtotal, taxa de entrega ou retirada no balcão e confere o pedido mínimo antes de avançar.',
    caption: 'Sacola do cliente com cálculo automático do subtotal e entrega.',
    kind: 'phone',
    src: '/assets/screenshots/cardapio-carrinho.webp',
  },
  {
    step: '06',
    title: 'Preenche dados e forma de pagamento',
    description:
      'O cliente informa nome, WhatsApp, endereço (quando entrega) e escolhe pagar na entrega ou retirada via Pix, Dinheiro ou Cartão.',
    caption: 'Etapa de entrega e escolha de pagamento na entrega ou retirada.',
    kind: 'phone',
    src: '/assets/screenshots/cardapio-checkout.webp',
  },
  {
    step: '07',
    title: 'Pedido chega direto na Central de Pedidos',
    description:
      'Assim que confirmado, o pedido aparece na fila do painel com alerta sonoro, resumo completo e botão para aceitar, imprimir ou avisar no WhatsApp.',
    caption: 'Central de Pedidos do MGW Gestão recebendo pedidos em tempo real.',
    kind: 'desktop',
    src: '/assets/screenshots/gestao-pedidos.webp',
    urlLabel: 'MGW Gestão · Central de Pedidos Online',
  },
];

interface FastSaleStep {
  step: string;
  title: string;
  description: string;
  urlLabel: string;
  src: string;
}

const FAST_SALE_STEPS: FastSaleStep[] = [
  {
    step: 'Passo 1',
    title: 'Abrir a tela de vendas no painel',
    description:
      'Pelo menu lateral ou pelo botão "Nova Venda" no topo, você inicia o lançamento sem sair da operação.',
    urlLabel: 'MGW Gestão · Histórico de Vendas',
    src: '/assets/screenshots/gestao-vendas.webp',
  },
  {
    step: 'Passo 2',
    title: 'Selecionar o combo desejado',
    description:
      'Os combos cadastrados aparecem em cards prontos para clique ou toque no celular com quantidade e composição.',
    urlLabel: 'MGW Gestão · Nova Venda Rápida',
    src: '/assets/screenshots/gestao-venda-combo.webp',
  },
  {
    step: 'Passo 3',
    title: 'Conferir valor e forma de pagamento',
    description:
      'Subtotal, X-Saladas vendidos no dia e forma de pagamento (Pix, Dinheiro ou Cartão) ficam conferidos antes do envio.',
    urlLabel: 'MGW Gestão · Conferência da Venda',
    src: '/assets/screenshots/gestao-venda-combo.webp',
  },
  {
    step: 'Passo 4',
    title: 'Confirmar venda e atualizar o caixa',
    description:
      'Ao clicar em "Registrar Venda", o faturamento do dia, o resumo financeiro e o ranking de combos atualizam na hora.',
    urlLabel: 'MGW Gestão · Dashboard Financeiro',
    src: '/assets/screenshots/gestao-dashboard.webp',
  },
];

interface SystemModuleItem {
  id: string;
  name: string;
  headline: string;
  description: string;
  highlights: string[];
  urlLabel: string;
  src: string;
  icon: typeof LayoutDashboard;
}

const SYSTEM_MODULES: SystemModuleItem[] = [
  {
    id: 'painel',
    name: 'Painel de gestão',
    headline: 'Visão do dia, da semana e do mês em segundos',
    description:
      'Acompanhe faturamento, despesas, saldo líquido, margem e combos mais vendidos sem precisar abrir planilhas.',
    highlights: [
      'Saúde financeira e margem calculada em tempo real',
      'Resumo de vendas diárias, semanais e mensais',
      'Alerta direto quando chega novo pedido online',
    ],
    urlLabel: 'MGW Gestão · Dashboard',
    src: '/assets/screenshots/gestao-dashboard.webp',
    icon: LayoutDashboard,
  },
  {
    id: 'vendas',
    name: 'Vendas',
    headline: 'Lançamento rápido no balcão e histórico organizado',
    description:
      'Registre combos ou lanches individuais com Pix, Dinheiro ou Cartão e mantenha cada movimento salvo no histórico.',
    highlights: [
      'Registro de combos em poucos cliques',
      'Identificação de venda manual e venda vinda de pedido online',
      'Proteção contra duplicação acidental no caixa',
    ],
    urlLabel: 'MGW Gestão · Vendas',
    src: '/assets/screenshots/gestao-vendas.webp',
    icon: ShoppingBag,
  },
  {
    id: 'produtos',
    name: 'Produtos',
    headline: 'Cadastro de lanches, bebidas, porções e itens avulsos',
    description:
      'Mantenha preços, categoria, imagem e disponibilidade de cada item atualizados tanto para o balcão quanto para o cardápio.',
    highlights: [
      'Ative ou desative produtos sem perder vendas antigas',
      'Upload direto de foto para destacar itens no cardápio',
      'Contagem automática de X-Saladas para acompanhamento operacional',
    ],
    urlLabel: 'MGW Gestão · Produtos',
    src: '/assets/screenshots/gestao-produtos-categorias.webp',
    icon: Package,
  },
  {
    id: 'combos',
    name: 'Combos',
    headline: 'Monte combos com os produtos do seu cardápio',
    description:
      'Combine lanches, batatas e refrigerantes em ofertas prontas para vender rápido no balcão e no celular do cliente.',
    highlights: [
      'Composição vinculada aos produtos cadastrados',
      'Custo estimado opcional para ajudar na margem',
      'Atualização imediata no Cardápio Digital e na Nova Venda',
    ],
    urlLabel: 'MGW Gestão · Combos',
    src: '/assets/screenshots/gestao-combos.webp',
    icon: Layers,
  },
  {
    id: 'categorias',
    name: 'Categorias',
    headline: 'Organize o catálogo com categorias personalizadas',
    description:
      'Além das categorias base, crie seções como Pastéis, Kikão, Porções, Açaí ou Bebidas conforme a realidade da sua casa.',
    highlights: [
      'Criação rápida de novas categorias no painel',
      'Filtros automáticos gerados no Cardápio Digital',
      'Catálogo limpo mesmo quando o cardápio cresce',
    ],
    urlLabel: 'MGW Gestão · Categorias personalizadas',
    src: '/assets/screenshots/gestao-produtos-categorias.webp',
    icon: Sparkles,
  },
  {
    id: 'adicionais',
    name: 'Adicionais',
    headline: 'Grupos de adicionais e sabores configuráveis',
    description:
      'Crie grupos como Sabores de Pastel, Molhos Extras ou Adicionais de Bacon com opções, preços e regras mínimas ou máximas por produto.',
    highlights: [
      'Grupos opcionais ou obrigatórios por produto',
      'Preços individuais para cada opção adicional',
      'Escolhas exibidas no pedido recebido pela cozinha',
    ],
    urlLabel: 'MGW Gestão · Grupos de adicionais',
    src: '/assets/screenshots/gestao-produtos-categorias.webp',
    icon: PlusCircle,
  },
  {
    id: 'pedidos',
    name: 'Pedidos',
    headline: 'Central de Pedidos em tempo real e impressão',
    description:
      'Receba pedidos do Cardápio Digital com aviso sonoro, aceite ou recuse, avance o preparo e imprima a comanda em um clique.',
    highlights: [
      'Fluxo claro: Novo, Aceito, Em preparo, Pronto e Concluído',
      'Botão direto para contato no WhatsApp do cliente',
      'Link público para o cliente acompanhar o status sem ligar',
    ],
    urlLabel: 'MGW Gestão · Pedidos',
    src: '/assets/screenshots/gestao-pedidos.webp',
    icon: ClipboardList,
  },
  {
    id: 'cardapio',
    name: 'Cardápio Digital',
    headline: 'Sua loja online pronta com link próprio e compartilhável',
    description:
      'Configure nome público, horário, endereço, chave Pix, taxa de entrega, retirada no balcão e abra ou feche a loja quando precisar.',
    highlights: [
      'URL dedicada da sua lanchonete (/cardapio/sua-loja)',
      'Botão único para abrir ou fechar o recebimento de pedidos',
      'Instalável no celular como web app sem depender de loja de apps',
    ],
    urlLabel: 'MGW Gestão · Configuração do Cardápio Digital',
    src: '/assets/screenshots/gestao-cardapio-config.webp',
    icon: Globe,
  },
  {
    id: 'despesas',
    name: 'Despesas',
    headline: 'Controle de insumos, compras e custos fixos',
    description:
      'Registre compras de carne, pão, embalagens, gás, energia e entregas para enxergar para onde o dinheiro está indo.',
    highlights: [
      'Classificação por categoria de despesa e forma de pagamento',
      'Histórico organizado para conferir gastos da semana e do mês',
      'Edição e exclusão controladas pelas permissões da conta',
    ],
    urlLabel: 'MGW Gestão · Despesas',
    src: '/assets/screenshots/gestao-despesas.webp',
    icon: Receipt,
  },
  {
    id: 'financeiro',
    name: 'Financeiro',
    headline: 'Saldo líquido e margem calculados automaticamente',
    description:
      'Ao cruzar vendas concluídas e despesas lançadas, o painel mostra se a operação está saudável no dia e no acumulado do mês.',
    highlights: [
      'Comparação direta entre entradas, saídas e sobra líquida',
      'Ticket médio e volume de itens vendidos no período',
      'Conversão automática de pedidos concluídos para o financeiro',
    ],
    urlLabel: 'MGW Gestão · Saúde Financeira',
    src: '/assets/screenshots/gestao-dashboard.webp',
    icon: Wallet,
  },
  {
    id: 'relatorios',
    name: 'Relatórios',
    headline: 'Análise por período para decidir o que priorizar',
    description:
      'Filtre datas específicas para comparar combos, produtos individuais, despesas por categoria e divisão por meio de pagamento.',
    highlights: [
      'Filtro de datas personalizado com totais consolidados',
      'Ranking dos combos e produtos com maior faturamento',
      'Distribuição entre Pix, Dinheiro e Cartão',
    ],
    urlLabel: 'MGW Gestão · Relatórios por Período',
    src: '/assets/screenshots/gestao-relatorios.webp',
    icon: BarChart3,
  },
];

const FAQ_ITEMS = [
  {
    question: 'Preciso instalar algum programa?',
    answer:
      'Não. O MGW Gestão funciona direto no navegador do computador ou do celular. Se desejar, você também pode adicionar o ícone à tela inicial como aplicativo PWA para abrir em um toque.',
  },
  {
    question: 'Funciona no celular?',
    answer:
      'Sim. Todas as telas do painel administrativo — dashboard, pedidos, vendas rápidas, despesas, produtos e relatórios — foram adaptadas para uso no celular e no computador.',
  },
  {
    question: 'Meus clientes precisam baixar aplicativo?',
    answer:
      'Não. O seu cliente acessa o Cardápio Digital direto pelo link compartilhado no WhatsApp, Instagram ou balcão, escolhe os itens e acompanha o pedido pelo navegador.',
  },
  {
    question: 'Posso cadastrar meus próprios produtos e combos?',
    answer:
      'Sim. Você pode cadastrar produtos individuais com foto e preço, além de montar combos combinando seus itens, com ativação e desativação a qualquer momento.',
  },
  {
    question: 'Posso criar categorias e adicionais?',
    answer:
      'Sim. O painel permite criar categorias personalizadas para o cardápio (como Pastéis, Kikão, Porções ou Bebidas) e configurar grupos de adicionais vinculados aos produtos.',
  },
  {
    question: 'Como os pedidos chegam até mim?',
    answer:
      'Os pedidos enviados pelo Cardápio Digital entram imediatamente na Central de Pedidos do painel com alerta sonoro, contagem de não visualizados e opções para aceitar, preparar e imprimir.',
  },
  {
    question: 'Como funciona o período de teste?',
    answer:
      'Ao criar sua conta e cadastrar sua lanchonete em /cadastro, você ganha 3 dias gratuitos para usar os recursos do MGW Gestão com seus produtos reais, sem precisar informar cartão de crédito.',
  },
  {
    question: 'Quanto custa após os 3 dias?',
    answer:
      'A assinatura do MGW Gestão custa R$ 49,90 por mês após o período gratuito de 3 dias, sem planos confusos nem cobrança surpresa no cadastro.',
  },
  {
    question: 'Meus dados ficam seguros?',
    answer:
      'Sim. O acesso exige autenticação individual via Supabase Auth e os registros de cada estabelecimento são isolados no banco PostgreSQL com regras de segurança (Row Level Security) por loja e função.',
  },
];

const PLAN_BENEFITS = [
  'Painel de gestão com saúde financeira e saldo do dia e do mês',
  'Registro ágil de vendas no balcão (combos e produtos individuais)',
  'Cadastro completo de produtos, combos, categorias e adicionais',
  'Cardápio Digital público com link da sua loja para WhatsApp e redes',
  'Central de Pedidos online com alerta sonoro, status e impressão',
  'Controle de despesas e relatórios por período e forma de pagamento',
  'Acesso no computador e no celular com isolamento por estabelecimento',
];

export function LandingPageView({ onNavigate }: LandingPageViewProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeMenuStep, setActiveMenuStep] = useState(0);
  const [activeFastStep, setActiveFastStep] = useState(0);
  const [activeModuleId, setActiveModuleId] = useState(SYSTEM_MODULES[0].id);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const currentMenuStep = DIGITAL_MENU_STEPS[activeMenuStep];
  const currentFastStep = FAST_SALE_STEPS[activeFastStep];
  const currentModule =
    SYSTEM_MODULES.find((m) => m.id === activeModuleId) ?? SYSTEM_MODULES[0];

  function scrollToSection(id: string) {
    setMobileMenuOpen(false);
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  return (
    <div className="mgw-institutional min-h-screen bg-[#F6F7F9] text-[#111827] overflow-x-hidden">
      {/* Sticky Navigation Header (Clean 3-Zone Contract) */}
      <header className="sticky top-0 z-40 border-b border-[#E5E7EB] bg-white/95 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 sm:gap-8">
          <a
            href="#topo"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex items-center gap-2.5 shrink-0"
          >
            <div className="w-9 h-9 rounded-xl bg-[#F5B731]/15 border border-[#F5B731]/35 flex items-center justify-center text-[#A87500] font-display font-bold text-base">
              M
            </div>
            <span className="font-display font-bold text-base sm:text-lg tracking-tight text-[#111827] whitespace-nowrap">
              MGW GESTÃO
            </span>
          </a>

          <nav
            aria-label="Navegação principal"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#4B5563]"
          >
            <button type="button" onClick={() => onNavigate('/mgw-gestao')} className="hover:text-[#A87500] transition-colors cursor-pointer whitespace-nowrap shrink-0">MGW Gestão</button>
            <button type="button" onClick={() => onNavigate('/cardapio-digital')} className="hover:text-[#A87500] transition-colors cursor-pointer whitespace-nowrap shrink-0">Cardápio Digital</button>
            <button type="button" onClick={() => onNavigate('/mgw-gestao')} className="w-full min-h-[44px] px-3 rounded-xl text-left text-sm font-medium text-[#4B5563] hover:bg-[#F3F4F6] hover:text-[#A87500] cursor-pointer">Conhecer MGW Gestão</button>
            <button type="button" onClick={() => onNavigate('/cardapio-digital')} className="w-full min-h-[44px] px-3 rounded-xl text-left text-sm font-medium text-[#4B5563] hover:bg-[#F3F4F6] hover:text-[#A87500] cursor-pointer">Conhecer Cardápio Digital</button>
            <button
              type="button"
              onClick={() => scrollToSection('sistema')}
              className="hover:text-[#A87500] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Sistema
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('cardapio')}
              className="hover:text-[#A87500] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Cardápio
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('preco')}
              className="hover:text-[#A87500] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Preço
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('duvidas')}
              className="hover:text-[#A87500] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Dúvidas
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/login')}
              className="hover:text-[#A87500] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Entrar
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('/cadastro')}
              className="hidden sm:inline-flex min-h-[42px] px-4 rounded-xl bg-[#F5B731] hover:bg-[#F0C85A] text-[#0B0D11] text-xs sm:text-sm font-bold items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              Começar teste grátis
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
              className="md:hidden min-w-[44px] min-h-[44px] rounded-xl border border-[#E5E7EB] bg-white text-[#111827] flex items-center justify-center cursor-pointer"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Drawer Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#E5E7EB] bg-white px-4 py-4 space-y-2">
            <button
              type="button"
              onClick={() => scrollToSection('sistema')}
              className="w-full min-h-[44px] px-3 rounded-xl text-left text-sm font-medium text-[#4B5563] hover:bg-[#F3F4F6] hover:text-[#A87500] cursor-pointer"
            >
              Sistema e funcionalidades
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('cardapio')}
              className="w-full min-h-[44px] px-3 rounded-xl text-left text-sm font-medium text-[#4B5563] hover:bg-[#F3F4F6] hover:text-[#A87500] cursor-pointer"
            >
              Cardápio Digital
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('preco')}
              className="w-full min-h-[44px] px-3 rounded-xl text-left text-sm font-medium text-[#4B5563] hover:bg-[#F3F4F6] hover:text-[#A87500] cursor-pointer"
            >
              Preço e teste grátis
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('duvidas')}
              className="w-full min-h-[44px] px-3 rounded-xl text-left text-sm font-medium text-[#4B5563] hover:bg-[#F3F4F6] hover:text-[#A87500] cursor-pointer"
            >
              Perguntas frequentes
            </button>
            <div className="pt-2 border-t border-[#E5E7EB] grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onNavigate('/login');
                }}
                className="min-h-[44px] px-3 rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] text-sm font-semibold text-[#111827] cursor-pointer"
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onNavigate('/cadastro');
                }}
                className="min-h-[44px] px-3 rounded-xl bg-[#F5B731] text-[#0B0D11] text-sm font-bold cursor-pointer"
              >
                Testar grátis
              </button>
            </div>
          </div>
        )}
      </header>

      <main id="topo">
        {/* SEÇÃO 1 — HERO */}
        <section className="relative pt-10 pb-14 sm:pt-16 sm:pb-20 lg:pt-20 lg:pb-24 border-b border-[#E5E7EB]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-10 items-center">
            <div className="lg:col-span-6 space-y-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#A87500]">
                Sistema de gestão para lanchonetes · Painel + Cardápio Digital
              </p>

              <h1 className="font-display text-3xl sm:text-4xl lg:text-[46px] font-extrabold tracking-[-0.025em] leading-[1.12] text-[#111827]">
                Gestão inteligente para transformar a rotina do seu negócio.
              </h1>

              <p className="text-base sm:text-lg text-[#6B7280] leading-relaxed max-w-xl">
                Organize vendas, acompanhe resultados e receba pedidos online. Com o MGW Gestão e o Cardápio Digital, sua operação fica conectada em uma experiência simples para você e prática para seus clientes.
              </p>

              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center rounded-full border border-[#F5B731]/45 bg-[#FFF8E8] px-3 py-1.5 text-xs font-bold text-[#805800]">
                  3 dias grátis para experimentar
                </span>
                <span className="text-xs sm:text-sm font-medium text-[#667085]">
                  Sem cartão de crédito · Depois R$ 49,90/mês
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => onNavigate('/cadastro')}
                  className="min-h-[48px] px-6 rounded-xl bg-[#F5B731] hover:bg-[#F0C85A] text-[#111827] text-sm sm:text-base font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                >
                  Começar meu teste grátis
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => scrollToSection('sistema')}
                  className="min-h-[48px] px-5 rounded-xl border border-[#E5E7EB] hover:border-[#F5B731]/60 bg-white text-[#111827] text-sm sm:text-base font-semibold inline-flex items-center justify-center cursor-pointer transition-colors whitespace-nowrap shrink-0"
                >
                  Ver como funciona
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 max-w-xl">
                <div className="flex items-center gap-2 text-xs font-medium text-[#475467]">
                  <span className="w-6 h-6 rounded-full bg-[#F5B731]/15 flex items-center justify-center text-[#946500]"><Check className="w-3.5 h-3.5" /></span>
                  Gestão em um só lugar
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-[#475467]">
                  <span className="w-6 h-6 rounded-full bg-[#F5B731]/15 flex items-center justify-center text-[#946500]"><Check className="w-3.5 h-3.5" /></span>
                  Pedidos online
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-[#475467]">
                  <span className="w-6 h-6 rounded-full bg-[#F5B731]/15 flex items-center justify-center text-[#946500]"><Check className="w-3.5 h-3.5" /></span>
                  Cardápio próprio
                </div>
              </div>

              <div className="text-xs sm:text-sm text-[#6B7280] flex flex-wrap items-center gap-2">
                <span>Já utiliza o sistema?</span>
                <button
                  type="button"
                  onClick={() => onNavigate('/login')}
                  className="text-[#A87500] hover:underline font-semibold cursor-pointer"
                >
                  Entrar no sistema
                </button>
              </div>
            </div>

            {/* Layered Real Screenshot Showcase */}
            <div className="lg:col-span-6 relative">
              <DesktopFrame
                src="/assets/screenshots/gestao-dashboard.webp"
                alt="Tela real do Dashboard do MGW Gestão mostrando faturamento do dia, saúde financeira, despesas e combos mais vendidos"
                urlLabel="MGW Gestão · Dashboard"
                priority
                className="w-full"
              />

              {/* Overlapping real mobile Cardápio Digital capture on tablet/desktop */}
              <div className="hidden sm:block sm:w-[168px] lg:w-[184px] sm:absolute sm:-bottom-8 sm:-right-2 lg:-right-4 z-10">
                <PhoneFrame
                  src="/assets/screenshots/cardapio-inicio.webp"
                  alt="Tela real do Cardápio Digital MGW no celular com combos e busca por categorias"
                  priority
                />
              </div>

              {/* Mobile clean secondary strip */}
              <div className="mt-4 sm:hidden grid grid-cols-2 gap-3">
                <PhoneFrame
                  src="/assets/screenshots/cardapio-inicio.webp"
                  alt="Tela real do Cardápio Digital no celular"
                  priority
                  className="w-full"
                />
                <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 flex flex-col justify-between">
                  <div className="space-y-2">
                    <Smartphone className="w-5 h-5 text-[#A87500]" />
                    <p className="font-display text-sm font-bold text-[#111827]">
                      Cardápio Digital integrado
                    </p>
                    <p className="text-xs text-[#6B7280] leading-relaxed">
                      O cliente pede pelo celular e o pedido aparece na fila do
                      seu painel.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => scrollToSection('cardapio')}
                    className="mt-3 text-left text-xs font-semibold text-[#A87500] inline-flex items-center gap-1 cursor-pointer"
                  >
                    Ver passo a passo
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SEÇÃO 2 — FEITO PARA A CORRERIA DA SUA LANCHONETE */}
        <section className="py-14 sm:py-20 border-b border-[#E5E7EB]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-10">
            <div className="max-w-2xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#A87500]">
                Feito para a correria da sua lanchonete
              </p>
              <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#111827]">
                Menos complicação. Mais agilidade no atendimento.
              </h2>
              <p className="text-sm sm:text-base text-[#6B7280] leading-relaxed">
                Quando o balcão enche e os pedidos chegam ao mesmo tempo, cada
                pessoa da operação precisa ver exatamente o que fazer, sem telas
                confusas.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <article className="bg-white border border-[#E5E7EB] rounded-2xl p-6 space-y-4">
                <div className="w-10 h-10 rounded-xl bg-[#F5B731]/12 border border-[#F5B731]/25 flex items-center justify-center text-[#A87500]">
                  <Store className="w-5 h-5" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-display text-lg font-bold text-[#111827]">
                    Proprietário
                  </h3>
                  <p className="text-sm text-[#6B7280] leading-relaxed">
                    Enxerga o caixa do dia, gastos com insumos, margem líquida e
                    combos mais vendidos no celular ou no computador.
                  </p>
                </div>
                <ul className="space-y-2 pt-2 border-t border-[#E5E7EB] text-xs sm:text-sm text-[#4B5563]">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#22C55E] shrink-0" />
                    Saúde financeira em tempo real
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#22C55E] shrink-0" />
                    Relatórios por período sem planilhas
                  </li>
                </ul>
              </article>

              <article className="bg-white border border-[#E5E7EB] rounded-2xl p-6 space-y-4">
                <div className="w-10 h-10 rounded-xl bg-[#F5B731]/12 border border-[#F5B731]/25 flex items-center justify-center text-[#A87500]">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-display text-lg font-bold text-[#111827]">
                    Quem atende
                  </h3>
                  <p className="text-sm text-[#6B7280] leading-relaxed">
                    Lança combos no balcão em poucos cliques e recebe pedidos do
                    cardápio digital com aviso sonoro e endereço conferido.
                  </p>
                </div>
                <ul className="space-y-2 pt-2 border-t border-[#E5E7EB] text-xs sm:text-sm text-[#4B5563]">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#22C55E] shrink-0" />
                    Venda rápida por combo ou produto
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#22C55E] shrink-0" />
                    WhatsApp direto e cálculo de troco
                  </li>
                </ul>
              </article>

              <article className="bg-white border border-[#E5E7EB] rounded-2xl p-6 space-y-4">
                <div className="w-10 h-10 rounded-xl bg-[#F5B731]/12 border border-[#F5B731]/25 flex items-center justify-center text-[#A87500]">
                  <ChefHat className="w-5 h-5" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-display text-lg font-bold text-[#111827]">
                    Quem prepara
                  </h3>
                  <p className="text-sm text-[#6B7280] leading-relaxed">
                    Recebe os itens organizados com quantidade, adicionais e
                    observações do cliente, além de impressão simples para
                    comanda.
                  </p>
                </div>
                <ul className="space-y-2 pt-2 border-t border-[#E5E7EB] text-xs sm:text-sm text-[#4B5563]">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#22C55E] shrink-0" />
                    Status claro: Aceito, Em preparo e Pronto
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#22C55E] shrink-0" />
                    Menos ruído de anotação manual
                  </li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        {/* SEÇÃO 3 — CARDÁPIO DIGITAL INTERATIVO (7 ETAPAS REAIS) */}
        <section
          id="cardapio"
          className="scroll-mt-20 py-14 sm:py-20 border-b border-[#E5E7EB] bg-white"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-10">
            <div className="max-w-3xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#A87500]">
                Cardápio Digital integrado
              </p>
              <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#111827]">
                Uma vitrine digital que transforma visitas em pedidos.
              </h2>
              <p className="text-sm sm:text-base text-[#6B7280] leading-relaxed">
                Seu negócio ganha um espaço próprio na internet: com fotos,
                categorias, produtos, combos e adicionais. O cliente monta o
                pedido pelo celular e você recebe tudo organizado na Central de Pedidos.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl">
              <div className="flex items-center gap-3 rounded-xl border border-[#E7EAF0] bg-white px-4 py-3">
                <span className="w-9 h-9 rounded-lg bg-[#FFF5D9] text-[#946500] flex items-center justify-center"><Smartphone className="w-4 h-4" /></span>
                <span className="text-xs sm:text-sm font-semibold text-[#344054]">Acesso pelo link, sem instalar app</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-[#E7EAF0] bg-white px-4 py-3">
                <span className="w-9 h-9 rounded-lg bg-[#FFF5D9] text-[#946500] flex items-center justify-center"><ShoppingBag className="w-4 h-4" /></span>
                <span className="text-xs sm:text-sm font-semibold text-[#344054]">Produtos, combos e adicionais</span>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-[#E7EAF0] bg-white px-4 py-3">
                <span className="w-9 h-9 rounded-lg bg-[#FFF5D9] text-[#946500] flex items-center justify-center"><ClipboardList className="w-4 h-4" /></span>
                <span className="text-xs sm:text-sm font-semibold text-[#344054]">Pedidos organizados no painel</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Step selector list */}
              <div className="order-2 lg:order-1 lg:col-span-6 space-y-2.5">
                {DIGITAL_MENU_STEPS.map((item, index) => {
                  const isActive = index === activeMenuStep;
                  return (
                    <button
                      key={item.step}
                      type="button"
                      onClick={() => setActiveMenuStep(index)}
                      aria-pressed={isActive}
                      className={`w-full text-left rounded-2xl border p-4 transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-white border-[#F5B731]'
                          : 'bg-white/50 border-[#E5E7EB] hover:border-[#D1D5DB]'
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        <span
                          className={`font-mono text-xs font-bold px-2 py-1 rounded-lg shrink-0 ${
                            isActive
                              ? 'bg-[#F5B731] text-[#0B0D11]'
                              : 'bg-[#F9FAFB] text-[#6B7280]'
                          }`}
                        >
                          {item.step}
                        </span>
                        <div className="min-w-0 space-y-1">
                          <h3
                            className={`font-display text-sm sm:text-base font-bold leading-snug ${
                              isActive ? 'text-[#111827]' : 'text-[#4B5563]'
                            }`}
                          >
                            {item.title}
                          </h3>
                          <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
                            {item.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Active real screenshot preview */}
              <div className="order-1 lg:order-2 min-w-0 lg:col-span-6 lg:sticky lg:top-24 bg-white border border-[#E5E7EB] rounded-2xl p-4 sm:p-6 space-y-5">
                <div className="flex items-start sm:items-center justify-between gap-3 border-b border-[#E5E7EB] pb-3.5">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-[#A87500]">
                      Etapa {currentMenuStep.step} de 07
                    </p>
                    <p className="font-display text-sm sm:text-base font-bold text-[#111827]">
                      {currentMenuStep.title}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMenuStep((prev) =>
                          prev === 0 ? DIGITAL_MENU_STEPS.length - 1 : prev - 1,
                        )
                      }
                      aria-label="Etapa anterior do cardápio"
                      className="min-w-[40px] min-h-[40px] rounded-xl border border-[#E5E7EB] hover:border-[#F5B731] bg-[#F6F7F9] text-[#111827] flex items-center justify-center cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMenuStep(
                          (prev) => (prev + 1) % DIGITAL_MENU_STEPS.length,
                        )
                      }
                      aria-label="Próxima etapa do cardápio"
                      className="min-w-[40px] min-h-[40px] rounded-xl border border-[#E5E7EB] hover:border-[#F5B731] bg-[#F6F7F9] text-[#111827] flex items-center justify-center cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex justify-center">
                  {currentMenuStep.kind === 'phone' ? (
                    <PhoneFrame
                      src={currentMenuStep.src}
                      alt={currentMenuStep.caption}
                      className="w-full max-w-[270px] sm:max-w-[290px]"
                    />
                  ) : (
                    <DesktopFrame
                      src={currentMenuStep.src}
                      alt={currentMenuStep.caption}
                      urlLabel={
                        currentMenuStep.urlLabel || 'MGW Gestão · Pedidos'
                      }
                      className="w-full"
                    />
                  )}
                </div>

                <p className="text-xs text-center text-[#6B7280]">
                  {currentMenuStep.caption}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-[#E8D8AC] bg-[#FFFCF4] px-5 py-5 sm:px-6">
              <div className="space-y-1">
                <p className="text-sm font-bold text-[#252B36]">Uma experiência simples para quem compra. Mais organização para quem vende.</p>
                <p className="text-xs sm:text-sm text-[#667085]">Conheça o conjunto completo de ferramentas da MGW.</p>
              </div>
              <button
                type="button"
                onClick={() => scrollToSection('preco')}
                className="min-h-[44px] px-5 rounded-xl bg-[#F5B731] hover:bg-[#E9AA25] text-[#171717] text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                Conhecer o MGW
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* SEÇÃO 4 — REGISTRO DE VENDAS EM MENOS DE 30 SEGUNDOS */}
        <section id="vendas" className="scroll-mt-20 py-14 sm:py-20 border-b border-[#E5E7EB]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-10">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
              <div className="max-w-2xl space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#A87500]">
                  Agilidade no balcão
                </p>
                <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#111827]">
                  Uma venda de combo pode ser registrada em menos de 30
                  segundos.
                </h2>
                <p className="text-sm sm:text-base text-[#6B7280] leading-relaxed">
                  Veja o fluxo ilustrativo completo em 4 passos simples dentro
                  do painel: selecione o combo, confira a forma de pagamento e
                  confirme direto para o caixa do dia.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono text-[#A87500] shrink-0">
                <Timer className="w-4 h-4 shrink-0" />
                <span>Ilustração do fluxo em 4 passos · Operação direta</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                {FAST_SALE_STEPS.map((step, idx) => {
                  const selected = idx === activeFastStep;
                  return (
                    <button
                      key={step.step}
                      type="button"
                      onClick={() => setActiveFastStep(idx)}
                      aria-pressed={selected}
                      className={`text-left rounded-2xl border p-4 transition-colors cursor-pointer ${
                        selected
                          ? 'bg-white border-[#F5B731]'
                          : 'bg-white/50 border-[#E5E7EB] hover:border-[#D1D5DB]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-mono font-bold text-[#A87500]">
                          {step.step}
                        </span>
                        <span className="text-[11px] font-mono text-[#6B7280]">
                          0{idx + 1}/04
                        </span>
                      </div>
                      <h3 className="font-display text-sm sm:text-base font-bold text-[#111827]">
                        {step.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-[#6B7280] mt-1 leading-relaxed">
                        {step.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="lg:col-span-7 space-y-3">
                <DesktopFrame
                  src={currentFastStep.src}
                  alt={currentFastStep.title}
                  urlLabel={currentFastStep.urlLabel}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B7280] px-1">
                  <span>
                    {currentFastStep.step}: {currentFastStep.title}
                  </span>
                  <span className="font-mono text-[#4B5563]">
                    Pix · Dinheiro · Cartão
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SEÇÃO 5 — TUDO ORGANIZADO EM UM SÓ SISTEMA */}
        <section
          id="sistema"
          className="scroll-mt-20 py-14 sm:py-20 border-b border-[#E5E7EB] bg-white"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-12">
            <div className="max-w-3xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#A87500]">
                Tudo organizado em um só sistema
              </p>
              <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#111827]">
                Mais controle sobre tudo que acontece na sua lanchonete.
              </h2>
              <p className="text-sm sm:text-base text-[#6B7280] leading-relaxed">
                Explore cada módulo real do MGW Gestão. Clique em qualquer área
                abaixo para ver a tela verdadeira e o que você controla no dia a
                dia.
              </p>
            </div>

            {/* Interactive 11-Module Explorer */}
            <div className="space-y-6">
              <div
                role="tablist"
                aria-label="Módulos do MGW Gestão"
                className="flex flex-wrap gap-2.5"
              >
                {SYSTEM_MODULES.map((mod) => {
                  const Icon = mod.icon;
                  const active = mod.id === currentModule.id;
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveModuleId(mod.id)}
                      className={`min-h-[40px] max-w-full px-3 sm:px-3.5 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-[#F5B731] border-[#F5B731] text-[#0B0D11]'
                          : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#F5B731]/50 hover:text-[#111827]'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {mod.name}
                    </button>
                  );
                })}
              </div>

              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-5 space-y-5">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#A87500]">
                      Módulo: {currentModule.name}
                    </p>
                    <h3 className="font-display text-xl sm:text-2xl font-bold text-[#111827] leading-snug">
                      {currentModule.headline}
                    </h3>
                    <p className="text-sm text-[#6B7280] leading-relaxed">
                      {currentModule.description}
                    </p>
                  </div>

                  <ul className="space-y-2.5 text-sm text-[#4B5563]">
                    {currentModule.highlights.map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => onNavigate('/cadastro')}
                    className="min-h-[44px] px-5 rounded-xl bg-[#F5B731] hover:bg-[#F0C85A] text-[#0B0D11] text-sm font-bold inline-flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    Testar na prática por 3 dias
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="lg:col-span-7">
                  <DesktopFrame
                    src={currentModule.src}
                    alt={`Tela real de ${currentModule.name} no MGW Gestão`}
                    urlLabel={currentModule.urlLabel}
                  />
                </div>
              </div>
            </div>

            {/* Editorial Showcase Highlights for Key Pillar Pairs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 space-y-4">
                <DesktopFrame
                  src="/assets/screenshots/gestao-produtos-categorias.webp"
                  alt="Tela de produtos, categorias personalizadas e grupos de adicionais"
                  urlLabel="Produtos · Categorias · Adicionais"
                />
                <div className="space-y-1.5">
                  <h3 className="font-display text-base font-bold text-[#111827]">
                    Produtos, Categorias e Adicionais
                  </h3>
                  <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
                    Crie categorias como Pastéis, Kikão e Porções, cadastre
                    grupos de adicionais e ative ou pause itens sem apagar o
                    histórico.
                  </p>
                </div>
              </div>

              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 space-y-4">
                <DesktopFrame
                  src="/assets/screenshots/gestao-despesas.webp"
                  alt="Tela de lançamento e controle de despesas da lanchonete"
                  urlLabel="Despesas e Custos Operacionais"
                />
                <div className="space-y-1.5">
                  <h3 className="font-display text-base font-bold text-[#111827]">
                    Despesas e Saúde Financeira
                  </h3>
                  <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
                    Lance insumos, entregas e contas fixas para saber o saldo
                    real da operação e não confundir faturamento bruto com lucro.
                  </p>
                </div>
              </div>

              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 space-y-4">
                <DesktopFrame
                  src="/assets/screenshots/gestao-relatorios.webp"
                  alt="Tela de relatórios por período com ranking de combos e pagamentos"
                  urlLabel="Relatórios por Período"
                />
                <div className="space-y-1.5">
                  <h3 className="font-display text-base font-bold text-[#111827]">
                    Relatórios e Cardápio Digital
                  </h3>
                  <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
                    Compare datas, identifique os combos campeões e ajuste taxa
                    de entrega, Pix e horários direto na aba do Cardápio Digital.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SEÇÃO 6 — SEGURANÇA E CONTROLE */}
        <section id="seguranca" className="scroll-mt-20 py-14 sm:py-20 border-b border-[#E5E7EB]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-5 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#A87500]">
                Segurança e controle
              </p>
              <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#111827]">
                Seu estabelecimento, seus dados e seu controle.
              </h2>
              <p className="text-sm sm:text-base text-[#6B7280] leading-relaxed">
                Construído sobre banco PostgreSQL com autenticação dedicada e
                regras de isolamento para que cada loja veja exclusivamente a
                própria operação.
              </p>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 space-y-2">
                <Lock className="w-5 h-5 text-[#A87500]" />
                <h3 className="font-display text-base font-bold text-[#111827]">
                  Acesso autenticado individual
                </h3>
                <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
                  Entrada protegida via conta Google ou e-mail verificado e
                  senha, com recuperação direta quando necessário.
                </p>
              </div>

              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 space-y-2">
                <ShieldCheck className="w-5 h-5 text-[#A87500]" />
                <h3 className="font-display text-base font-bold text-[#111827]">
                  Isolamento entre estabelecimentos
                </h3>
                <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
                  Políticas Row Level Security (RLS) no banco garantem que
                  vendas, despesas e pedidos não se misturem entre contas.
                </p>
              </div>

              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 space-y-2">
                <Users className="w-5 h-5 text-[#A87500]" />
                <h3 className="font-display text-base font-bold text-[#111827]">
                  Controle por papéis na equipe
                </h3>
                <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
                  Permissões distintas por perfil (proprietário, administrador,
                  gerente e equipe) para proteger ações sensíveis e caixa.
                </p>
              </div>

              <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 space-y-2">
                <Smartphone className="w-5 h-5 text-[#A87500]" />
                <h3 className="font-display text-base font-bold text-[#111827]">
                  Sincronizado na nuvem
                </h3>
                <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
                  Acesse pelo notebook no balcão ou pelo celular onde estiver,
                  mantendo os registros salvos no mesmo estabelecimento.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SEÇÃO 7 — PREÇO */}
        <section
          id="preco"
          className="scroll-mt-20 py-14 sm:py-20 border-b border-[#E5E7EB] bg-white"
        >
          <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-8">
            <div className="text-center space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#A87500]">
                Preço simples e transparente
              </p>
              <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#111827]">
                Um único plano com tudo incluído.
              </h2>
              <p className="text-sm sm:text-base text-[#6B7280]">
                Comece com 3 dias gratuitos para testar com os seus produtos, sem
                precisar cadastrar cartão de crédito.
              </p>
            </div>

            <div className="bg-white border border-[#F5B731]/55 rounded-2xl p-5 sm:p-8 lg:p-10 grid grid-cols-1 md:grid-cols-12 gap-6 sm:gap-8 items-center shadow-[0_8px_30px_rgba(17,24,39,0.04)]">
              <div className="md:col-span-6 min-w-0 space-y-4 md:border-r md:border-[#E5E7EB] md:pr-8">
                <p className="font-display text-lg font-bold text-[#111827]">
                  MGW Gestão
                </p>

                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-display text-3xl sm:text-[42px] font-extrabold font-mono tabular-nums text-[#A87500]">
                    R$ 49,90
                  </span>
                  <span className="text-sm text-[#6B7280]">/ mês</span>
                </div>

                <p className="text-sm font-semibold text-[#22C55E]">
                  3 dias grátis para começar · Sem cartão
                </p>

                <div className="pt-2 space-y-2.5">
                  <button
                    type="button"
                    onClick={() => onNavigate('/cadastro')}
                    className="w-full min-h-[48px] px-5 rounded-xl bg-[#F5B731] hover:bg-[#F0C85A] text-[#111827] text-sm sm:text-base font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
                  >
                    Começar meu teste grátis
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('/login')}
                    className="w-full min-h-[42px] px-4 rounded-xl border border-[#E5E7EB] hover:border-[#F5B731]/50 text-xs sm:text-sm font-semibold text-[#4B5563] cursor-pointer transition-colors whitespace-nowrap"
                  >
                    Já tenho conta · Entrar no sistema
                  </button>
                </div>
              </div>

              <div className="md:col-span-6 min-w-0 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                  O que está incluído na assinatura
                </p>
                <ul className="space-y-3 text-sm leading-relaxed text-[#4B5563]">
                  {PLAN_BENEFITS.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 text-[#22C55E] shrink-0 mt-0.5" />
                      <span className="min-w-0">{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* SEÇÃO 8 — PERGUNTAS FREQUENTES */}
        <section
          id="duvidas"
          className="scroll-mt-20 py-14 sm:py-20 border-b border-[#E5E7EB]"
        >
          <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-8">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#A87500]">
                Perguntas frequentes
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#111827]">
                Dúvidas comuns antes de começar
              </h2>
            </div>

            <div className="space-y-3">
              {FAQ_ITEMS.map((item, idx) => {
                const isOpen = openFaqIndex === idx;
                return (
                  <div
                    key={item.question}
                    className="bg-white border border-[#E5E7EB] rounded-2xl overflow-hidden"
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                      className="w-full min-h-[54px] px-5 py-4 text-left flex items-center justify-between gap-4 cursor-pointer hover:bg-[#F9FAFB] transition-colors"
                    >
                      <span className="font-display text-sm sm:text-base font-bold text-[#111827]">
                        {item.question}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-[#A87500] shrink-0 transition-transform duration-200 ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-4 pt-1 text-sm text-[#6B7280] leading-relaxed border-t border-[#E5E7EB]/60">
                        {item.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* SEÇÃO 9 — CHAMADA FINAL */}
        <section id="comece" className="scroll-mt-20 py-14 sm:py-20 border-b border-[#E5E7EB] bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center space-y-6">
            <h2 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-[#111827]">
              Chegou a hora de simplificar a gestão da sua lanchonete.
            </h2>

            <p className="text-sm sm:text-base text-[#6B7280] max-w-xl mx-auto leading-relaxed">
              Organize suas vendas, pedidos online, cardápio digital e
              financeiro em um só painel feito para quem trabalha na operação.
            </p>

            <p className="text-sm sm:text-base font-semibold text-[#111827]">
              <span className="text-[#A87500] font-mono tabular-nums font-bold">
                R$ 49,90 por mês
              </span>{' '}
              · 3 dias grátis · Sem cartão de crédito
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => onNavigate('/cadastro')}
                className="w-full sm:w-auto min-h-[48px] px-7 rounded-xl bg-[#F5B731] hover:bg-[#F0C85A] text-[#111827] text-sm sm:text-base font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                Começar meu teste grátis
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/login')}
                className="w-full sm:w-auto min-h-[48px] px-6 rounded-xl border border-[#E5E7EB] hover:border-[#F5B731]/60 bg-white text-sm font-semibold text-[#111827] cursor-pointer transition-colors"
              >
                Entrar no sistema
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* SEÇÃO 10 — RODAPÉ */}
      <footer className="bg-[#F6F7F9] py-10 sm:py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-2 max-w-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#F5B731]/15 border border-[#F5B731]/35 flex items-center justify-center text-[#A87500] font-display font-bold text-sm">
                M
              </div>
              <span className="font-display font-bold text-base text-[#111827]">
                MGW GESTÃO
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
              Plataforma de gestão e cardápio digital para lanchonetes,
              hamburguerias, pastelarias e operações rápidas de alimentação.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs sm:text-sm text-[#4B5563]">
            <button
              type="button"
              onClick={() => onNavigate('/login')}
              className="hover:text-[#A87500] cursor-pointer transition-colors"
            >
              Entrar no sistema
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/cadastro')}
              className="hover:text-[#A87500] cursor-pointer transition-colors"
            >
              Criar conta
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/parceiros/cadastro')}
              className="hover:text-[#A87500] cursor-pointer transition-colors"
            >
              Seja parceiro MGW
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/parceiros/login')}
              className="hover:text-[#A87500] cursor-pointer transition-colors"
            >
              Área do parceiro
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/termos')}
              className="hover:text-[#A87500] cursor-pointer transition-colors"
            >
              Termos de uso
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/privacidade')}
              className="hover:text-[#A87500] cursor-pointer transition-colors"
            >
              Política de privacidade
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-8 pt-6 border-t border-[#E5E7EB] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#6B7280]">
          <span>© {new Date().getFullYear()} MGW Gestão. Todos os direitos reservados.</span>
          <span>Plano mensal de R$ 49,90 · 3 dias grátis para começar</span>
        </div>
      </footer>
    </div>
  );
}
