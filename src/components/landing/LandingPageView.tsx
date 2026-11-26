import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import {
  ArrowRight,
  BellRing,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Handshake,
  Layers,
  LayoutDashboard,
  Lock,
  Menu,
  Pause,
  Play,
  Printer,
  Receipt,
  ShieldCheck,
  Smartphone,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { PhoneFrame } from './DeviceFrames';

interface LandingPageViewProps {
  onNavigate: (path: string) => void;
}

const CAROUSEL_INTERVAL_MS = 5000;

const MGW_LOGO_SRC =
  '/assets/aistudio/file_00000000e09c820e834438573c1d9cd3_cbe7fd03.png';

const SCREENSHOT_DASHBOARD_MOBILE =
  '/assets/aistudio/Screenshot_20261126_110435_Chrome_a422f7af.jpg';
const SCREENSHOT_DASHBOARD_FULL =
  '/assets/aistudio/Screenshot_20261126_110532_Chrome_d9ff9a78.jpg';
const SCREENSHOT_ORDERS_FULL =
  '/assets/aistudio/Screenshot_20261126_110558_Chrome_4e8c81b8.jpg';
const SCREENSHOT_EXPENSES_FULL =
  '/assets/aistudio/Screenshot_20261126_110546_Chrome_476c2cac.jpg';
const SCREENSHOT_MENU_HERO =
  '/assets/aistudio/Screenshot_20261126_110637_Chrome_7fbc777d.jpg';
const SCREENSHOT_MENU_CATALOG =
  '/assets/aistudio/Screenshot_20261126_110647_Chrome_f840394a.jpg';

interface MenuShowcaseSlide {
  step: string;
  label: string;
  title: string;
  description: string;
  highlights: string[];
  src: string;
  alt: string;
  cropTopPercent: number;
  caption: string;
}

const MENU_SHOWCASE_SLIDES: MenuShowcaseSlide[] = [
  {
    step: '01',
    label: 'Vitrine da Loja',
    title: 'Seu cardápio próprio no celular, sem taxa por pedido',
    description:
      'Seu cliente acessa pelo link no WhatsApp ou Instagram e já visualiza horário de funcionamento, endereço, entrega grátis condicional e retirada no balcão.',
    highlights: [
      'Link exclusivo da sua loja sem depender de aplicativos terceiros',
      'Regra visível de entrega grátis por valor mínimo do pedido',
      'Botão direto para WhatsApp e compartilhamento em um toque',
    ],
    src: SCREENSHOT_MENU_HERO,
    alt: 'Tela real do topo do Cardápio Digital MGW Burger com horários, entrega grátis condicional, busca e ofertas',
    cropTopPercent: 4.6,
    caption: 'Cardápio Digital · Cabeçalho da loja, regras de entrega e busca',
  },
  {
    step: '02',
    label: 'Ofertas e Combos',
    title: 'Carrossel de ofertas, busca rápida e Combos Especiais',
    description:
      'Destaque promoções do dia logo na abertura, organize filtros por categoria com contagem de itens e exiba seus combos com foto e botão imediato de adicionar.',
    highlights: [
      'Banners promocionais rotativos em destaque no topo do cardápio',
      'Filtros inteligentes por categoria (Combos, Bebidas, Lanches)',
      'Busca instantânea por nome do lanche, combo ou bebida',
    ],
    src: SCREENSHOT_MENU_HERO,
    alt: 'Tela real do Cardápio Digital mostrando ofertas especiais, filtros por categoria e Combos Especiais',
    cropTopPercent: 4.6,
    caption: 'Cardápio Digital · Ofertas especiais e seção Combos Especiais',
  },
  {
    step: '03',
    label: 'Catálogo e Carrinho',
    title: 'Bebidas em grid horizontal, lanches e carrinho sempre visível',
    description:
      'Navegação fluida com rolagem rápida entre bebidas geladas e lanches individuais, mantendo o resumo Meu Pedido e Ver Carrinho fixo no rodapé.',
    highlights: [
      'Cards compactos de bebidas com adição em um toque (+)',
      'Descrições completas de combos para compartilhar e lanches',
      'Sacola fixa com contagem de itens e acesso rápido ao checkout',
    ],
    src: SCREENSHOT_MENU_CATALOG,
    alt: 'Tela real do catálogo do Cardápio Digital com Combo 6, Bebidas Geladas, X-Salada, X-Salsicha e carrinho fixo',
    cropTopPercent: 4.6,
    caption: 'Cardápio Digital · Bebidas Geladas, Lanches e barra Meu Pedido',
  },
  {
    step: '04',
    label: 'Chegada no Painel',
    title: 'Do carrinho do cliente direto para a Central de Pedidos',
    description:
      'Assim que o cliente finaliza o pedido no celular, ele entra na fila do seu painel com notificação push, alerta sonoro, bairro e botão para atribuir entregador.',
    highlights: [
      'Notificações Push ativas e alerta sonoro para não perder pedidos',
      'Etapas claras: Em Preparo, Prontos, Saiu para entrega e Entregues',
      'Atribuição direta de entregador e acompanhamento em tempo real',
    ],
    src: SCREENSHOT_ORDERS_FULL,
    alt: 'Tela real da Central de Pedidos do MGW Gestão com alertas ativos, etapas e tabela de pedidos',
    cropTopPercent: 11.5,
    caption: 'MGW Gestão · Central de Pedidos integrada ao Cardápio Digital',
  },
];

interface SystemSlideItem {
  id: string;
  name: string;
  eyebrow: string;
  headline: string;
  description: string;
  points: string[];
  src: string;
  alt: string;
  cropTopPercent: number;
  icon: typeof LayoutDashboard;
}

const SYSTEM_CAROUSEL_SLIDES: SystemSlideItem[] = [
  {
    id: 'dashboard-completo',
    name: 'Dashboard & Margem',
    eyebrow: '01 · Visão Executiva',
    headline: 'Faturamento, gráfico de 7 dias e Saúde Financeira na mesma tela',
    description:
      'Acompanhe o ritmo diário da lanchonete com indicadores de hoje, acumulado do mês, meta configurada e cálculo automático da margem líquida.',
    points: [
      'Cards de Faturamento, Despesas, Lucro e Pedidos com comparativo',
      'Gráfico de barras dos últimos 7 dias e rosca de Saúde Financeira',
      'Indicadores de hoje e acumulado do mês com barra de meta',
    ],
    src: SCREENSHOT_DASHBOARD_FULL,
    alt: 'Tela real do Dashboard completo do MGW Gestão com faturamento de 7 dias, saúde financeira e metas',
    cropTopPercent: 11.5,
    icon: LayoutDashboard,
  },
  {
    id: 'dashboard-mobile',
    name: 'Painel no Celular',
    eyebrow: '02 · Mobilidade Total',
    headline: 'Controle o caixa e registre uma nova venda de qualquer lugar',
    description:
      'Interface pensada para quem está no balcão ou acompanhando a loja fora do horário de pico: barra inferior direta e botão + Venda sempre acessível.',
    points: [
      'Navegação rápida por ícones entre Início, Pedidos, Vendas e Despesas',
      'Botão + Venda no topo para lançamento rápido no balcão',
      'Filtro de período (Hoje, 7 dias, Últimos 30 dias) em um toque',
    ],
    src: SCREENSHOT_DASHBOARD_MOBILE,
    alt: 'Tela real do Dashboard mobile do MGW Gestão com saudação e resumo financeiro no celular',
    cropTopPercent: 4.6,
    icon: Smartphone,
  },
  {
    id: 'central-pedidos',
    name: 'Pedidos & Delivery',
    eyebrow: '03 · Operação & Despacho',
    headline: 'Central de Pedidos com Push, alerta sonoro e gestão de entregas',
    description:
      'Veja todos os pedidos organizados por status, filtre rapidamente por número ou cliente e atribua entregadores próprios ou terceirizados direto na linha do pedido.',
    points: [
      'Contadores imediatos: Pedidos Hoje, Em Preparo, Prontos e Entregues',
      'Bairro, forma de pagamento e itens visíveis sem abrir modais extras',
      'Atribuição de entregador e acompanhamento até a entrega final',
    ],
    src: SCREENSHOT_ORDERS_FULL,
    alt: 'Tela real da Central de Pedidos com notificações push, alerta sonoro, contadores e tabela com entregador',
    cropTopPercent: 11.5,
    icon: ClipboardList,
  },
  {
    id: 'despesas-csv',
    name: 'Despesas & Custos',
    eyebrow: '04 · Controle de Custos',
    headline: 'Enxergue cada centavo gasto com insumos, bebidas, gás e entregas',
    description:
      'Classifique compras por categoria, acompanhe a distribuição visual no gráfico de rosca, busque no histórico completo e exporte CSV quando precisar.',
    points: [
      'Distribuição percentual por categoria (Ingredientes, Bebidas, Gás, Transporte)',
      'Últimas despesas com edição rápida e histórico pesquisável',
      'Exportação em CSV com um clique para conferência contábil',
    ],
    src: SCREENSHOT_EXPENSES_FULL,
    alt: 'Tela real do módulo de Despesas do MGW Gestão com gráfico de categorias, últimas despesas e Exportar CSV',
    cropTopPercent: 11.5,
    icon: Receipt,
  },
];

const PLAN_BENEFITS = [
  'Painel de gestão com gráfico de 7 dias, metas e saúde financeira',
  'Cardápio Digital com link da loja, banners de ofertas, combos e adicionais',
  'Central de Pedidos em tempo real com notificações Push e alerta sonoro',
  'Nova Venda Rápida no balcão com dados do cliente e cupom térmico 58mm / 80mm',
  'MGW Delivery completo: entregadores, despacho e taxas por bairro/região',
  'Controle de despesas por categoria, histórico pesquisável e exportação CSV',
  'Acesso no computador e no celular com isolamento seguro por estabelecimento',
];

const FAQ_ITEMS = [
  {
    question: 'Tem comissão ou taxa por pedido no Cardápio Digital?',
    answer:
      'Não. Você paga apenas a assinatura fixa de R$ 49,90 por mês. Todos os pedidos feitos pelo seu Cardápio Digital vão 100% para o seu faturamento, sem comissão por venda.',
  },
  {
    question: 'Preciso instalar algum programa no computador ou celular?',
    answer:
      'Não. O MGW Gestão roda direto no navegador do computador, tablet ou celular. Você também pode instalar como aplicativo PWA na tela inicial com um toque.',
  },
  {
    question: 'Meus clientes precisam baixar aplicativo para fazer pedido?',
    answer:
      'Não. Seu cliente abre o link do Cardápio Digital direto pelo WhatsApp ou Instagram, escolhe combos, adicionais e pagamento e acompanha o status pelo navegador.',
  },
  {
    question: 'Consigo controlar entregas e entregadores no sistema?',
    answer:
      'Sim. O MGW Delivery permite cadastrar entregadores próprios ou terceirizados, configurar taxas de entrega por bairro ou região e atribuir pedidos na Central de Pedidos e Despacho.',
  },
  {
    question: 'O sistema imprime cupom das vendas e dos pedidos?',
    answer:
      'Sim. Tanto os pedidos online quanto a Nova Venda Rápida no balcão possuem impressão térmica formatada para bobinas de 58mm e 80mm, incluindo os dados do cliente quando informados.',
  },
  {
    question: 'Como funciona o período de teste gratuito de 3 dias?',
    answer:
      'Ao criar sua conta em poucos passos, você libera 3 dias grátis para cadastrar seus produtos, combos, taxas e testar a rotina completa sem precisar informar cartão de crédito.',
  },
  {
    question: 'Meus dados e os da minha equipe ficam protegidos?',
    answer:
      'Sim. O sistema usa autenticação individual e banco PostgreSQL com isolamento por estabelecimento (Row Level Security) e níveis de permissão distintos para proprietário, gerência e equipe.',
  },
];

interface MgwBrandLogoProps {
  variant?: 'compact' | 'full';
  className?: string;
}

function MgwBrandLogo({ variant = 'compact', className = '' }: MgwBrandLogoProps) {
  const [imgFailed, setImgFailed] = useState(false);

  if (imgFailed) {
    return (
      <span className="font-display font-extrabold tracking-tight text-white whitespace-nowrap">
        MGW <span className="text-[#F5B731]">GESTÃO</span>
      </span>
    );
  }

  // Exact non-transparent artwork bounds inside 1536x1024 transparent PNG:
  // Full artwork: x=63..1472 (1409px), y=255..682 (427px)
  // Compact mark (without tagline): x=63..1472 (1409px), y=255..605 (350px)
  const cropW = 1409;
  const cropH = variant === 'compact' ? 350 : 427;
  const widthPct = (1536 / cropW) * 100;
  const heightPct = (1024 / cropH) * 100;
  const leftPct = -(63 / cropW) * 100;
  const topPct = -(255 / cropH) * 100;

  return (
    <span
      className={`relative block overflow-hidden select-none shrink-0 ${className}`}
      style={{ aspectRatio: `${cropW} / ${cropH}` }}
    >
      <img
        src={MGW_LOGO_SRC}
        alt="MGW Gestão"
        loading="eager"
        decoding="sync"
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        style={{
          position: 'absolute',
          maxWidth: 'none',
          width: `${widthPct}%`,
          height: `${heightPct}%`,
          left: `${leftPct}%`,
          top: `${topPct}%`,
        }}
        className="pointer-events-none block"
      />
    </span>
  );
}

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

function ScrollReveal({ children, className = '', delay = 0 }: ScrollRevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.14 }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function LandingPageView({ onNavigate }: LandingPageViewProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerElevated, setHeaderElevated] = useState(false);

  // Carousel 1 — Cardápio Digital (5s auto-advance)
  const [activeMenuSlide, setActiveMenuSlide] = useState(0);
  const [isMenuPaused, setIsMenuPaused] = useState(false);
  const [isMenuHovered, setIsMenuHovered] = useState(false);

  // Carousel 2 — Sistema MGW Gestão (5s auto-advance)
  const [activeSystemSlide, setActiveSystemSlide] = useState(0);
  const [isSystemPaused, setIsSystemPaused] = useState(false);
  const [isSystemHovered, setIsSystemHovered] = useState(false);

  // FAQ
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // Touch swipe tracking
  const menuTouchStartX = useRef<number | null>(null);
  const systemTouchStartX = useRef<number | null>(null);

  // Scroll tracking for top progress bar & hero parallax
  const heroRef = useRef<HTMLElement | null>(null);
  const { scrollY, scrollYProgress } = useScroll();
  const smoothScrollProgress = useSpring(scrollYProgress, {
    stiffness: 220,
    damping: 32,
    restDelta: 0.001,
  });

  useMotionValueEvent(scrollY, 'change', (latest) => {
    const next = latest > 24;
    setHeaderElevated((prev) => (prev === next ? prev : next));
  });

  const { scrollYProgress: heroScrollProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroBackPhoneY = useTransform(heroScrollProgress, [0, 1], [0, 32]);
  const heroFrontPhoneY = useTransform(heroScrollProgress, [0, 1], [0, -24]);

  // Automatic 5-second rotation for Cardápio Digital carousel
  useEffect(() => {
    if (isMenuPaused || isMenuHovered) return;
    const timer = window.setInterval(() => {
      setActiveMenuSlide((prev) => (prev + 1) % MENU_SHOWCASE_SLIDES.length);
    }, CAROUSEL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isMenuPaused, isMenuHovered]);

  // Automatic 5-second rotation for MGW Gestão carousel
  useEffect(() => {
    if (isSystemPaused || isSystemHovered) return;
    const timer = window.setInterval(() => {
      setActiveSystemSlide((prev) => (prev + 1) % SYSTEM_CAROUSEL_SLIDES.length);
    }, CAROUSEL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isSystemPaused, isSystemHovered]);

  const currentMenuSlide = MENU_SHOWCASE_SLIDES[activeMenuSlide];
  const currentSystemSlide = SYSTEM_CAROUSEL_SLIDES[activeSystemSlide];

  function scrollToSection(id: string) {
    setMobileMenuOpen(false);
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function handleTouchStart(ref: { current: number | null }, e: TouchEvent) {
    ref.current = e.touches[0]?.clientX ?? null;
  }

  function handleMenuTouchEnd(e: TouchEvent) {
    if (menuTouchStartX.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? menuTouchStartX.current;
    const diff = endX - menuTouchStartX.current;
    menuTouchStartX.current = null;
    if (Math.abs(diff) < 42) return;
    setActiveMenuSlide((prev) =>
      diff < 0
        ? (prev + 1) % MENU_SHOWCASE_SLIDES.length
        : (prev - 1 + MENU_SHOWCASE_SLIDES.length) % MENU_SHOWCASE_SLIDES.length,
    );
  }

  function handleSystemTouchEnd(e: TouchEvent) {
    if (systemTouchStartX.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? systemTouchStartX.current;
    const diff = endX - systemTouchStartX.current;
    systemTouchStartX.current = null;
    if (Math.abs(diff) < 42) return;
    setActiveSystemSlide((prev) =>
      diff < 0
        ? (prev + 1) % SYSTEM_CAROUSEL_SLIDES.length
        : (prev - 1 + SYSTEM_CAROUSEL_SLIDES.length) %
          SYSTEM_CAROUSEL_SLIDES.length,
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="mgw-landing min-h-screen bg-[#F7F8FC] text-[#172033] overflow-x-clip">
        {/* Elegant Scroll Progress Indicator */}
        <motion.div
          aria-hidden="true"
          style={{ scaleX: smoothScrollProgress }}
          className="fixed top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#F5B731] via-[#FFD15C] to-[#F5B731] origin-left z-50 pointer-events-none"
        />

        {/* STICKY DARK NAVY HEADER (Strict 3-Zone Contract) */}
        <header
          className={`sticky top-0 z-40 transition-colors duration-200 border-b ${
            headerElevated
              ? 'bg-[#172033]/95 border-white/12 shadow-[0_12px_36px_rgba(9,13,22,0.32)] backdrop-blur-md'
              : 'bg-[#172033] border-white/8'
          }`}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[72px] flex items-center justify-between gap-4 md:gap-8">
            {/* Zone 1: Clean Brand Logo */}
            <a
              href="#topo"
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              aria-label="MGW Gestão — Voltar ao topo"
              className="flex items-center shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B731] rounded-lg"
            >
              <MgwBrandLogo variant="compact" className="h-8 sm:h-9" />
            </a>

            {/* Zone 2: 5 concise single-line links */}
            <nav
              aria-label="Navegação principal"
              className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300"
            >
              <button
                type="button"
                onClick={() => scrollToSection('cardapio')}
                className="hover:text-[#F5B731] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Cardápio
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('sistema')}
                className="hover:text-[#F5B731] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Sistema
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('preco')}
                className="hover:text-[#F5B731] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Preço
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('duvidas')}
                className="hover:text-[#F5B731] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Dúvidas
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/login')}
                className="text-white hover:text-[#F5B731] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Entrar
              </button>
            </nav>

            {/* Zone 3: Primary CTA + Mobile Toggle */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onNavigate('/cadastro')}
                className="hidden sm:inline-flex min-h-[42px] px-4 rounded-xl bg-[#F5B731] hover:bg-[#FFD059] text-[#111827] text-xs sm:text-sm font-bold items-center gap-1.5 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 shadow-[0_6px_20px_rgba(245,183,49,0.28)] whitespace-nowrap shrink-0"
              >
                Testar 3 dias grátis
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                aria-expanded={mobileMenuOpen}
                aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
                className="md:hidden min-w-[44px] min-h-[44px] rounded-xl border border-white/15 bg-white/5 text-white flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors"
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
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="md:hidden border-t border-white/10 bg-[#141C2E] px-4 py-4 space-y-1.5"
              >
                <button
                  type="button"
                  onClick={() => scrollToSection('cardapio')}
                  className="w-full min-h-[44px] px-3 rounded-xl text-left text-sm font-medium text-slate-200 hover:bg-white/5 hover:text-[#F5B731] cursor-pointer"
                >
                  Cardápio Digital
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('sistema')}
                  className="w-full min-h-[44px] px-3 rounded-xl text-left text-sm font-medium text-slate-200 hover:bg-white/5 hover:text-[#F5B731] cursor-pointer"
                >
                  Sistema e Delivery
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('preco')}
                  className="w-full min-h-[44px] px-3 rounded-xl text-left text-sm font-medium text-slate-200 hover:bg-white/5 hover:text-[#F5B731] cursor-pointer"
                >
                  Preço e teste grátis
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('duvidas')}
                  className="w-full min-h-[44px] px-3 rounded-xl text-left text-sm font-medium text-slate-200 hover:bg-white/5 hover:text-[#F5B731] cursor-pointer"
                >
                  Perguntas frequentes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onNavigate('/parceiros/cadastro');
                  }}
                  className="w-full min-h-[44px] px-3 rounded-xl text-left text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-[#F5B731] cursor-pointer"
                >
                  Seja parceiro MGW
                </button>
                <div className="pt-3 mt-2 border-t border-white/10 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigate('/login');
                    }}
                    className="min-h-[44px] px-3 rounded-xl border border-white/15 bg-white/5 text-sm font-semibold text-white cursor-pointer"
                  >
                    Entrar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigate('/cadastro');
                    }}
                    className="min-h-[44px] px-3 rounded-xl bg-[#F5B731] text-[#111827] text-sm font-bold cursor-pointer"
                  >
                    Testar grátis
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        <main id="topo">
          {/* SEÇÃO 1 — HERO (Dark Navy Architectural Surface + Layered Dual-Screen Parallax) */}
          <section
            ref={heroRef}
            className="relative overflow-hidden bg-gradient-to-b from-[#172033] via-[#131B2D] to-[#0E1523] text-white pt-12 pb-16 sm:pt-16 sm:pb-24 lg:pt-20 lg:pb-24 border-b border-white/10"
          >
            {/* Subtle architectural gold glow */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-40 right-[-10%] w-[640px] h-[640px] rounded-full bg-[radial-gradient(circle,rgba(245,183,49,0.16)_0%,rgba(245,183,49,0.03)_42%,transparent_70%)]"
            />

            <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
              {/* Left Copy */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="lg:col-span-6 space-y-6"
              >
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#F5B731]">
                  Sistema de Gestão · Cardápio Digital · Delivery
                </p>

                <h1 className="font-display text-3xl sm:text-5xl lg:text-[52px] font-extrabold tracking-[-0.03em] leading-[1.07] text-white max-w-2xl">
                  Cardápio Digital próprio e gestão completa do balcão à entrega.
                </h1>

                <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
                  Venda pelo link da sua lanchonete com{' '}
                  <strong className="text-white font-semibold">
                    0% de comissão por pedido
                  </strong>
                  , receba na Central de Pedidos com alerta sonoro, organize
                  entregadores e acompanhe seu lucro em tempo real.
                </p>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => onNavigate('/cadastro')}
                    className="min-h-[50px] px-6 rounded-xl bg-[#F5B731] hover:bg-[#FFD059] text-[#111827] text-sm sm:text-base font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 shadow-[0_10px_28px_rgba(245,183,49,0.3)] whitespace-nowrap shrink-0"
                  >
                    Começar 3 dias grátis
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => scrollToSection('cardapio')}
                    className="min-h-[50px] px-5 rounded-xl border border-white/20 hover:border-[#F5B731]/65 bg-white/5 hover:bg-white/10 text-white text-sm sm:text-base font-semibold inline-flex items-center justify-center cursor-pointer transition-colors whitespace-nowrap shrink-0"
                  >
                    Ver Cardápio em ação
                  </button>
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-x-6 gap-y-2.5 text-xs sm:text-sm text-slate-300">
                  <span className="inline-flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#F5B731] shrink-0" />
                    Sem cartão de crédito
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#F5B731] shrink-0" />
                    R$ 49,90/mês após o teste
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#F5B731] shrink-0" />
                    Celular e computador
                  </span>
                </div>

                <div className="pt-1 text-xs sm:text-sm text-slate-400 flex flex-wrap items-center gap-3">
                  <span>Já usa o MGW?</span>
                  <button
                    type="button"
                    onClick={() => onNavigate('/login')}
                    className="text-[#F5B731] hover:underline font-semibold cursor-pointer"
                  >
                    Entrar no painel
                  </button>
                  <span aria-hidden="true" className="text-slate-600">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigate('/mgw-gestao')}
                    className="text-slate-300 hover:text-white hover:underline cursor-pointer"
                  >
                    Detalhes dos módulos
                  </button>
                </div>
              </motion.div>

              {/* Right Layered Visual Composition (Real Screens with Scroll Parallax) */}
              <motion.div
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.7,
                  delay: 0.12,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="lg:col-span-6 relative flex items-center justify-center min-w-0"
              >
                <div className="relative w-full max-w-[520px] mx-auto flex items-center justify-center gap-3 sm:gap-5 py-2">
                  {/* Back Phone: Real Dashboard Completo */}
                  <motion.div
                    style={{ y: heroBackPhoneY }}
                    className="w-[48%] sm:w-[235px] shrink-0 translate-y-4 sm:translate-y-6"
                  >
                    <PhoneFrame
                      src={SCREENSHOT_DASHBOARD_FULL}
                      alt="Tela real do Dashboard MGW Gestão com faturamento de 7 dias, saúde financeira e indicadores de hoje"
                      variant="light"
                      cropTopPercent={11.5}
                      cropBottomPercent={2.2}
                      priority
                    />
                  </motion.div>

                  {/* Front Phone: Real Cardápio Digital MGW Burger */}
                  <motion.div
                    style={{ y: heroFrontPhoneY }}
                    className="w-[50%] sm:w-[248px] shrink-0 -translate-y-2 sm:-translate-y-4 z-10"
                  >
                    <PhoneFrame
                      src={SCREENSHOT_MENU_HERO}
                      alt="Tela real do Cardápio Digital MGW Burger com entrega grátis acima de R$ 65,00, ofertas especiais e combos"
                      variant="dark"
                      cropTopPercent={4.6}
                      cropBottomPercent={2.2}
                      priority
                    />
                  </motion.div>
                </div>
              </motion.div>
            </div>
          </section>

          {/* SEÇÃO 2 — ANCORAGEM DE VALOR (Light Surface · Claim-to-Proof Adjacency) */}
          <section className="bg-white border-b border-[#E8EAF0] py-10 sm:py-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                <ScrollReveal delay={0}>
                  <div className="flex items-start gap-4">
                    <span className="font-mono text-2xl sm:text-3xl font-extrabold text-[#B87D00] tabular-nums shrink-0">
                      0%
                    </span>
                    <div className="space-y-1">
                      <h2 className="font-display text-base font-bold text-[#172033]">
                        Comissão por pedido
                      </h2>
                      <p className="text-sm text-[#596579] leading-relaxed">
                        Receba direto pelo seu link no WhatsApp e Instagram sem
                        dividir margem com aplicativos intermediários.
                      </p>
                    </div>
                  </div>
                </ScrollReveal>

                <ScrollReveal delay={0.08}>
                  <div className="flex items-start gap-4 md:border-l md:border-[#E8EAF0] md:pl-8">
                    <span className="font-mono text-2xl sm:text-3xl font-extrabold text-[#172033] tabular-nums shrink-0">
                      3 dias
                    </span>
                    <div className="space-y-1">
                      <h2 className="font-display text-base font-bold text-[#172033]">
                        Grátis para testar
                      </h2>
                      <p className="text-sm text-[#596579] leading-relaxed">
                        Cadastre produtos, combos, entregadores e taxas de bairro
                        reais sem precisar informar cartão de crédito.
                      </p>
                    </div>
                  </div>
                </ScrollReveal>

                <ScrollReveal delay={0.16}>
                  <div className="flex items-start gap-4 md:border-l md:border-[#E8EAF0] md:pl-8">
                    <span className="font-mono text-2xl sm:text-3xl font-extrabold text-[#172033] tabular-nums shrink-0">
                      R$ 49,90
                    </span>
                    <div className="space-y-1">
                      <h2 className="font-display text-base font-bold text-[#172033]">
                        Tudo incluído no mês
                      </h2>
                      <p className="text-sm text-[#596579] leading-relaxed">
                        Painel financeiro, Cardápio Digital, Central de Pedidos,
                        Delivery e impressão 58mm/80mm em uma assinatura única.
                      </p>
                    </div>
                  </div>
                </ScrollReveal>
              </div>
            </div>
          </section>

          {/* SEÇÃO 3 — DARK SHOWCASE: CARDÁPIO DIGITAL (Carrossel Automático 5s) */}
          <section
            id="cardapio"
            onMouseEnter={() => setIsMenuHovered(true)}
            onMouseLeave={() => setIsMenuHovered(false)}
            onFocus={() => setIsMenuHovered(true)}
            onBlur={() => setIsMenuHovered(false)}
            className="scroll-mt-20 relative overflow-hidden bg-[#11151D] text-white py-16 sm:py-24 border-b border-white/10"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[780px] h-[360px] bg-[radial-gradient(ellipse,rgba(245,183,49,0.11)_0%,transparent_70%)]"
            />

            <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
              <ScrollReveal className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                <div className="max-w-2xl space-y-3">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#F5B731]">
                    Cardápio Digital integrado
                  </p>
                  <h2 className="font-display text-2xl sm:text-4xl lg:text-[40px] font-extrabold tracking-tight leading-tight text-white">
                    Uma vitrine que dá vontade de pedir — direto no navegador.
                  </h2>
                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                    Veja como seus clientes navegam pelo novo Cardápio Digital
                    da MGW e como cada pedido chega instantaneamente no seu
                    painel.
                  </p>
                </div>

                {/* Carousel Controls + 5s Auto-play Indicator */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsMenuPaused((p) => !p)}
                    aria-label={
                      isMenuPaused
                        ? 'Retomar carrossel automático'
                        : 'Pausar carrossel automático'
                    }
                    className="min-h-[42px] px-3.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-200 inline-flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    {isMenuPaused ? (
                      <>
                        <Play className="w-3.5 h-3.5 text-[#F5B731]" />
                        Continuar
                      </>
                    ) : (
                      <>
                        <Pause className="w-3.5 h-3.5 text-[#F5B731]" />
                        Auto 5s
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setActiveMenuSlide(
                        (prev) =>
                          (prev - 1 + MENU_SHOWCASE_SLIDES.length) %
                          MENU_SHOWCASE_SLIDES.length,
                      )
                    }
                    aria-label="Slide anterior do Cardápio Digital"
                    className="min-w-[44px] min-h-[44px] rounded-xl border border-white/15 bg-white/5 hover:border-[#F5B731]/60 text-white flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveMenuSlide(
                        (prev) => (prev + 1) % MENU_SHOWCASE_SLIDES.length,
                      )
                    }
                    aria-label="Próximo slide do Cardápio Digital"
                    className="min-w-[44px] min-h-[44px] rounded-xl border border-white/15 bg-white/5 hover:border-[#F5B731]/60 text-white flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </ScrollReveal>

              {/* Carousel Grid */}
              <div
                onTouchStart={(e) => handleTouchStart(menuTouchStartX, e)}
                onTouchEnd={handleMenuTouchEnd}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center"
              >
                {/* Left Step Selector */}
                <div className="order-2 lg:order-1 lg:col-span-6 space-y-3">
                  {MENU_SHOWCASE_SLIDES.map((slide, index) => {
                    const isActive = index === activeMenuSlide;
                    return (
                      <button
                        key={slide.step}
                        type="button"
                        onClick={() => setActiveMenuSlide(index)}
                        aria-pressed={isActive}
                        className={`relative w-full text-left rounded-2xl border p-4 sm:p-5 transition-all duration-200 cursor-pointer overflow-hidden ${
                          isActive
                            ? 'bg-[#19202D] border-[#F5B731]/70 shadow-[0_14px_34px_rgba(0,0,0,0.32)]'
                            : 'bg-white/[0.03] border-white/10 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-start gap-3.5">
                          <span
                            className={`font-mono text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 ${
                              isActive
                                ? 'bg-[#F5B731] text-[#111827]'
                                : 'bg-white/10 text-slate-300'
                            }`}
                          >
                            {slide.step}
                          </span>

                          <div className="min-w-0 space-y-1.5 flex-1">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#F5B731]">
                              {slide.label}
                            </p>
                            <h3 className="font-display text-base sm:text-lg font-bold text-white leading-snug">
                              {slide.title}
                            </h3>
                            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                              {slide.description}
                            </p>

                            {isActive && (
                              <ul className="pt-2 space-y-1.5">
                                {slide.highlights.map((item) => (
                                  <li
                                    key={item}
                                    className="flex items-start gap-2 text-xs text-slate-200"
                                  >
                                    <Check className="w-3.5 h-3.5 text-[#F5B731] shrink-0 mt-0.5" />
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>

                        {/* 5s Animated Progress Hairline */}
                        {isActive && !isMenuPaused && !isMenuHovered && (
                          <motion.div
                            key={`menu-progress-${activeMenuSlide}`}
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{
                              duration: CAROUSEL_INTERVAL_MS / 1000,
                              ease: 'linear',
                            }}
                            className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#F5B731] origin-left"
                          />
                        )}
                      </button>
                    );
                  })}

                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onNavigate('/cadastro')}
                      className="min-h-[46px] px-5 rounded-xl bg-[#F5B731] hover:bg-[#FFD059] text-[#111827] text-sm font-bold inline-flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      Criar meu Cardápio Digital
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('/cardapio-digital')}
                      className="min-h-[46px] px-4 rounded-xl border border-white/15 hover:border-white/35 text-sm font-semibold text-slate-200 cursor-pointer transition-colors"
                    >
                      Explorar recursos do cardápio
                    </button>
                  </div>
                </div>

                {/* Right Animated Device Display */}
                <div className="order-1 lg:order-2 lg:col-span-6 flex flex-col items-center">
                  <div className="w-full max-w-[310px] sm:max-w-[330px]">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentMenuSlide.step}
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -24 }}
                        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <PhoneFrame
                          src={currentMenuSlide.src}
                          alt={currentMenuSlide.alt}
                          variant={
                            currentMenuSlide.step === '04' ? 'light' : 'dark'
                          }
                          cropTopPercent={currentMenuSlide.cropTopPercent}
                          cropBottomPercent={2.2}
                        />
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  <p className="mt-4 text-xs text-slate-400 text-center">
                    {currentMenuSlide.caption} ·{' '}
                    <span className="font-mono tabular-nums text-slate-300">
                      0{activeMenuSlide + 1}/0{MENU_SHOWCASE_SLIDES.length}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* SEÇÃO 4 — LIGHT SAAS: MGW GESTÃO POR DENTRO (Carrossel Automático 5s + Bento Grid) */}
          <section
            id="sistema"
            onMouseEnter={() => setIsSystemHovered(true)}
            onMouseLeave={() => setIsSystemHovered(false)}
            onFocus={() => setIsSystemHovered(true)}
            onBlur={() => setIsSystemHovered(false)}
            className="scroll-mt-20 py-16 sm:py-24 bg-[#F7F8FC] border-b border-[#E8EAF0]"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-14">
              <ScrollReveal className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                <div className="max-w-2xl space-y-3">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#946500]">
                    MGW Gestão por dentro
                  </p>
                  <h2 className="font-display text-2xl sm:text-4xl lg:text-[40px] font-extrabold tracking-tight leading-tight text-[#172033]">
                    Do caixa ao despacho do entregador, tudo em telas limpas.
                  </h2>
                  <p className="text-sm sm:text-base text-[#596579] leading-relaxed">
                    Acompanhe as telas reais atualizadas do painel: visão
                    executiva, operação rápida no celular, Central de Pedidos e
                    controle completo de despesas.
                  </p>
                </div>

                {/* Carousel Controls */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsSystemPaused((p) => !p)}
                    aria-label={
                      isSystemPaused
                        ? 'Retomar carrossel do sistema'
                        : 'Pausar carrossel do sistema'
                    }
                    className="min-h-[42px] px-3.5 rounded-xl border border-[#DCE1EA] bg-white hover:border-[#F5B731] text-xs font-semibold text-[#344054] inline-flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    {isSystemPaused ? (
                      <>
                        <Play className="w-3.5 h-3.5 text-[#A87500]" />
                        Continuar
                      </>
                    ) : (
                      <>
                        <Pause className="w-3.5 h-3.5 text-[#A87500]" />
                        Auto 5s
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setActiveSystemSlide(
                        (prev) =>
                          (prev - 1 + SYSTEM_CAROUSEL_SLIDES.length) %
                          SYSTEM_CAROUSEL_SLIDES.length,
                      )
                    }
                    aria-label="Tela anterior do MGW Gestão"
                    className="min-w-[44px] min-h-[44px] rounded-xl border border-[#DCE1EA] bg-white hover:border-[#F5B731] text-[#172033] flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveSystemSlide(
                        (prev) => (prev + 1) % SYSTEM_CAROUSEL_SLIDES.length,
                      )
                    }
                    aria-label="Próxima tela do MGW Gestão"
                    className="min-w-[44px] min-h-[44px] rounded-xl border border-[#DCE1EA] bg-white hover:border-[#F5B731] text-[#172033] flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </ScrollReveal>

              {/* System Carousel Card */}
              <ScrollReveal>
                <div className="space-y-5">
                  {/* Interactive Tabs */}
                  <div
                    role="tablist"
                    aria-label="Telas reais do MGW Gestão"
                    className="flex flex-nowrap sm:flex-wrap overflow-x-auto gap-2 pb-1"
                  >
                    {SYSTEM_CAROUSEL_SLIDES.map((item, index) => {
                      const Icon = item.icon;
                      const isActive = index === activeSystemSlide;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => setActiveSystemSlide(index)}
                          className={`relative overflow-hidden min-h-[44px] px-4 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                            isActive
                              ? 'bg-[#172033] border-[#172033] text-white shadow-[0_8px_22px_rgba(23,32,51,0.16)]'
                              : 'bg-white border-[#E4E7EE] text-[#475467] hover:border-[#F5B731]/70 hover:text-[#172033]'
                          }`}
                        >
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? 'text-[#F5B731]' : 'text-[#946500]'
                            }`}
                          />
                          {item.name}
                          {isActive &&
                            !isSystemPaused &&
                            !isSystemHovered && (
                              <motion.span
                                key={`sys-progress-${activeSystemSlide}`}
                                initial={{ scaleX: 0 }}
                                animate={{ scaleX: 1 }}
                                transition={{
                                  duration: CAROUSEL_INTERVAL_MS / 1000,
                                  ease: 'linear',
                                }}
                                className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#F5B731] origin-left"
                              />
                            )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Slide Panel */}
                  <div
                    onTouchStart={(e) => handleTouchStart(systemTouchStartX, e)}
                    onTouchEnd={handleSystemTouchEnd}
                    className="bg-white border border-[#E5E8F0] rounded-3xl p-5 sm:p-8 lg:p-10 shadow-[0_16px_48px_rgba(16,24,40,0.05)] grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center"
                  >
                    <div className="lg:col-span-6 space-y-5">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={currentSystemSlide.id}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -12 }}
                          transition={{
                            duration: 0.28,
                            ease: [0.16, 1, 0.3, 1],
                          }}
                          className="space-y-4"
                        >
                          <p className="font-mono text-xs font-bold uppercase tracking-wider text-[#946500]">
                            {currentSystemSlide.eyebrow}
                          </p>
                          <h3 className="font-display text-xl sm:text-3xl font-extrabold text-[#172033] leading-snug">
                            {currentSystemSlide.headline}
                          </h3>
                          <p className="text-sm sm:text-base text-[#596579] leading-relaxed">
                            {currentSystemSlide.description}
                          </p>
                          <ul className="space-y-2.5 pt-1 text-sm text-[#344054]">
                            {currentSystemSlide.points.map((point) => (
                              <li
                                key={point}
                                className="flex items-start gap-2.5"
                              >
                                <Check className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                                <span>{point}</span>
                              </li>
                            ))}
                          </ul>
                        </motion.div>
                      </AnimatePresence>

                      <div className="pt-2 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => onNavigate('/cadastro')}
                          className="min-h-[46px] px-5 rounded-xl bg-[#F5B731] hover:bg-[#FFD059] text-[#111827] text-sm font-bold inline-flex items-center gap-2 cursor-pointer transition-colors"
                        >
                          Testar na prática por 3 dias
                          <ArrowRight className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onNavigate('/mgw-gestao')}
                          className="min-h-[46px] px-4 rounded-xl border border-[#DCE1EA] hover:border-[#F5B731] text-sm font-semibold text-[#344054] cursor-pointer transition-colors"
                        >
                          Ver visão completa
                        </button>
                      </div>
                    </div>

                    <div className="lg:col-span-6 flex justify-center">
                      <div className="w-full max-w-[290px] sm:max-w-[310px]">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={currentSystemSlide.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{
                              duration: 0.35,
                              ease: [0.16, 1, 0.3, 1],
                            }}
                          >
                            <PhoneFrame
                              src={currentSystemSlide.src}
                              alt={currentSystemSlide.alt}
                              variant="light"
                              cropTopPercent={currentSystemSlide.cropTopPercent}
                              cropBottomPercent={2.2}
                            />
                          </motion.div>
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollReveal>

              {/* Asymmetric Bento Grid — Complete Operational Capabilities */}
              <div className="space-y-6">
                <ScrollReveal>
                  <div className="max-w-2xl space-y-2">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#946500]">
                      Operação Conectada
                    </p>
                    <h3 className="font-display text-xl sm:text-3xl font-extrabold text-[#172033]">
                      Recursos pensados para cada etapa do atendimento
                    </h3>
                  </div>
                </ScrollReveal>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Wide Bento Card 1 */}
                  <ScrollReveal className="md:col-span-2" delay={0}>
                    <article className="h-full bg-white border border-[#E5E8F0] hover:border-[#F5B731]/70 rounded-2xl p-6 sm:p-7 transition-colors flex flex-col justify-between gap-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2 max-w-xl">
                          <p className="font-mono text-xs font-bold text-[#946500]">
                            01 · Balcão e Impressão Térmica
                          </p>
                          <h4 className="font-display text-lg sm:text-xl font-bold text-[#172033]">
                            Nova Venda Rápida com cliente vinculado e cupom 58mm
                            / 80mm
                          </h4>
                          <p className="text-sm text-[#596579] leading-relaxed">
                            Registre combos e itens avulsos no balcão em
                            segundos, selecione um cliente já salvo no MGW
                            Delivery ou preencha endereço opcional e imprima o
                            comprovante térmico limpo para balcão e entrega.
                          </p>
                        </div>
                        <span className="w-11 h-11 rounded-xl bg-[#FFF6DC] text-[#946500] flex items-center justify-center shrink-0">
                          <Printer className="w-5 h-5" />
                        </span>
                      </div>

                      <div className="pt-4 border-t border-[#ECEFF5] flex flex-wrap gap-x-6 gap-y-2 text-xs sm:text-sm font-medium text-[#344054]">
                        <span className="inline-flex items-center gap-1.5">
                          <Check className="w-4 h-4 text-[#16A34A]" />
                          Pix, Dinheiro e Cartão
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Check className="w-4 h-4 text-[#16A34A]" />
                          Cupom 58mm e 80mm
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Check className="w-4 h-4 text-[#16A34A]" />
                          Reimpressão no histórico
                        </span>
                      </div>
                    </article>
                  </ScrollReveal>

                  {/* Standard Bento Card 2 */}
                  <ScrollReveal className="md:col-span-1" delay={0.08}>
                    <article className="h-full bg-white border border-[#E5E8F0] hover:border-[#F5B731]/70 rounded-2xl p-6 sm:p-7 transition-colors flex flex-col justify-between gap-5">
                      <div className="space-y-3">
                        <span className="w-11 h-11 rounded-xl bg-[#FFF6DC] text-[#946500] flex items-center justify-center">
                          <Truck className="w-5 h-5" />
                        </span>
                        <p className="font-mono text-xs font-bold text-[#946500]">
                          02 · MGW Delivery
                        </p>
                        <h4 className="font-display text-lg font-bold text-[#172033]">
                          Entregadores, despacho e taxas por bairro
                        </h4>
                        <p className="text-sm text-[#596579] leading-relaxed">
                          Cadastre motoboys próprios ou terceirizados, defina
                          taxas por região e acompanhe cada rota até a conclusão.
                        </p>
                      </div>
                    </article>
                  </ScrollReveal>

                  {/* Standard Bento Card 3 */}
                  <ScrollReveal className="md:col-span-1" delay={0.08}>
                    <article className="h-full bg-white border border-[#E5E8F0] hover:border-[#F5B731]/70 rounded-2xl p-6 sm:p-7 transition-colors flex flex-col justify-between gap-5">
                      <div className="space-y-3">
                        <span className="w-11 h-11 rounded-xl bg-[#FFF6DC] text-[#946500] flex items-center justify-center">
                          <Layers className="w-5 h-5" />
                        </span>
                        <p className="font-mono text-xs font-bold text-[#946500]">
                          03 · Catálogo Inteligente
                        </p>
                        <h4 className="font-display text-lg font-bold text-[#172033]">
                          Produtos, combos, categorias e adicionais
                        </h4>
                        <p className="text-sm text-[#596579] leading-relaxed">
                          Crie grupos de sabores ou adicionais obrigatórios e
                          pausáveis em um clique, refletindo na hora no cardápio.
                        </p>
                      </div>
                    </article>
                  </ScrollReveal>

                  {/* Wide Bento Card 4 */}
                  <ScrollReveal className="md:col-span-2" delay={0.14}>
                    <article className="h-full bg-white border border-[#E5E8F0] hover:border-[#F5B731]/70 rounded-2xl p-6 sm:p-7 transition-colors flex flex-col justify-between gap-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2 max-w-xl">
                          <p className="font-mono text-xs font-bold text-[#946500]">
                            04 · Segurança, Equipe e Alertas em Tempo Real
                          </p>
                          <h4 className="font-display text-lg sm:text-xl font-bold text-[#172033]">
                            Permissões por cargo, Push ativo e isolamento por
                            loja
                          </h4>
                          <p className="text-sm text-[#596579] leading-relaxed">
                            Dados protegidos em PostgreSQL com Row Level
                            Security (RLS), acesso distinto para proprietário,
                            gerente e atendentes, mais aviso sonoro e Push para
                            nenhum pedido passar batido.
                          </p>
                        </div>
                        <span className="w-11 h-11 rounded-xl bg-[#FFF6DC] text-[#946500] flex items-center justify-center shrink-0">
                          <ShieldCheck className="w-5 h-5" />
                        </span>
                      </div>

                      <div className="pt-4 border-t border-[#ECEFF5] flex flex-wrap gap-x-6 gap-y-2 text-xs sm:text-sm font-medium text-[#344054]">
                        <span className="inline-flex items-center gap-1.5">
                          <BellRing className="w-4 h-4 text-[#946500]" />
                          Push + Alerta Sonoro
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-[#946500]" />
                          Papéis na equipe
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Lock className="w-4 h-4 text-[#946500]" />
                          Isolamento RLS por loja
                        </span>
                      </div>
                    </article>
                  </ScrollReveal>
                </div>
              </div>
            </div>
          </section>

          {/* SEÇÃO 5 — PREÇO SIMPLES E TRANSPARENTE */}
          <section
            id="preco"
            className="scroll-mt-20 py-16 sm:py-24 bg-white border-b border-[#E8EAF0]"
          >
            <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-10">
              <ScrollReveal className="text-center space-y-3 max-w-2xl mx-auto">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#946500]">
                  Preço simples e transparente
                </p>
                <h2 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-[#172033]">
                  Um único plano com todos os módulos liberados.
                </h2>
                <p className="text-sm sm:text-base text-[#596579]">
                  Sem planos confusos, sem limite de pedidos e sem taxa sobre as
                  suas vendas. Comece grátis por 3 dias.
                </p>
              </ScrollReveal>

              <ScrollReveal delay={0.08}>
                <div className="bg-[#F9FAFC] border border-[#E2D2A2] rounded-3xl p-6 sm:p-10 grid grid-cols-1 md:grid-cols-12 gap-8 items-center shadow-[0_24px_64px_rgba(16,24,40,0.06)]">
                  <div className="md:col-span-5 min-w-0 space-y-5 md:border-r md:border-[#E5E8F0] md:pr-8">
                    <div className="space-y-1">
                      <p className="font-display text-lg font-bold text-[#172033]">
                        Plano Completo MGW
                      </p>
                      <p className="text-xs font-medium text-[#596579]">
                        Painel + Cardápio Digital + Delivery
                      </p>
                    </div>

                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-mono tabular-nums text-4xl sm:text-[46px] font-extrabold tracking-tight text-[#172033]">
                        R$ 49,90
                      </span>
                      <span className="text-sm font-medium text-[#596579]">
                        / mês
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-[#15803D]">
                      3 dias grátis para testar · Sem cartão de crédito
                    </p>

                    <div className="space-y-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => onNavigate('/cadastro')}
                        className="w-full min-h-[50px] px-5 rounded-xl bg-[#F5B731] hover:bg-[#FFD059] text-[#111827] text-sm sm:text-base font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 shadow-[0_8px_22px_rgba(214,157,28,0.25)] whitespace-nowrap"
                      >
                        Começar 3 dias grátis
                        <ArrowRight className="w-4 h-4 shrink-0" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onNavigate('/login')}
                        className="w-full min-h-[44px] px-4 rounded-xl border border-[#DCE1EA] bg-white hover:border-[#F5B731] text-xs sm:text-sm font-semibold text-[#344054] cursor-pointer transition-colors whitespace-nowrap"
                      >
                        Já tenho conta · Entrar no sistema
                      </button>
                    </div>
                  </div>

                  <div className="md:col-span-7 min-w-0 space-y-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#596579]">
                      O que já vem incluído desde o primeiro dia
                    </p>
                    <ul className="space-y-3 text-sm text-[#344054] leading-relaxed">
                      {PLAN_BENEFITS.map((benefit) => (
                        <li key={benefit} className="flex items-start gap-2.5">
                          <Check className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                          <span className="min-w-0">{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </section>

          {/* SEÇÃO 6 — PERGUNTAS FREQUENTES */}
          <section
            id="duvidas"
            className="scroll-mt-20 py-16 sm:py-24 bg-[#F7F8FC] border-b border-[#E8EAF0]"
          >
            <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-8">
              <ScrollReveal className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#946500]">
                  Perguntas frequentes
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#172033]">
                  Dúvidas comuns antes de começar
                </h2>
              </ScrollReveal>

              <div className="space-y-3">
                {FAQ_ITEMS.map((item, idx) => {
                  const isOpen = openFaqIndex === idx;
                  return (
                    <div
                      key={item.question}
                      className="bg-white border border-[#E5E8F0] rounded-2xl overflow-hidden transition-colors hover:border-[#F5B731]/60"
                    >
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                        className="w-full min-h-[58px] px-5 py-4 text-left flex items-center justify-between gap-4 cursor-pointer"
                      >
                        <span className="font-display text-sm sm:text-base font-bold text-[#172033]">
                          {item.question}
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 text-[#946500] shrink-0 transition-transform duration-200 ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{
                              duration: 0.24,
                              ease: [0.16, 1, 0.3, 1],
                            }}
                            className="overflow-hidden"
                          >
                            <div className="px-5 pb-4 pt-2 text-sm text-[#596579] leading-relaxed border-t border-[#ECEFF5]">
                              {item.answer}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* SEÇÃO 7 — PORTAL DO PARCEIRO + CHAMADA FINAL (Transição Elegante Dark Navy) */}
          <section className="bg-[#131B2D] text-white py-16 sm:py-20 border-b border-white/10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-12">
              {/* Partner Portal Callout */}
              <ScrollReveal>
                <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div className="flex items-start gap-4 max-w-2xl">
                    <span className="w-11 h-11 rounded-xl bg-[#F5B731]/15 border border-[#F5B731]/35 text-[#F5B731] flex items-center justify-center shrink-0">
                      <Handshake className="w-5 h-5" />
                    </span>
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold uppercase tracking-wider text-[#F5B731]">
                        Programa de Parceiros MGW
                      </p>
                      <h3 className="font-display text-lg sm:text-xl font-bold text-white">
                        Indique lanchonetes e acompanhe oportunidades no Portal
                        do Parceiro
                      </h3>
                      <p className="text-sm text-slate-300 leading-relaxed">
                        Compartilhe seu link de indicação, acompanhe leads e
                        acesse materiais de divulgação em um ambiente dedicado.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => onNavigate('/parceiros/cadastro')}
                      className="min-h-[44px] px-5 rounded-xl bg-white text-[#172033] hover:bg-slate-100 text-sm font-bold cursor-pointer transition-colors whitespace-nowrap"
                    >
                      Quero ser parceiro
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('/parceiros/login')}
                      className="min-h-[44px] px-4 rounded-xl border border-white/20 hover:border-[#F5B731] text-sm font-semibold text-white cursor-pointer transition-colors whitespace-nowrap"
                    >
                      Área do parceiro
                    </button>
                  </div>
                </div>
              </ScrollReveal>

              {/* Final CTA */}
              <ScrollReveal className="max-w-3xl mx-auto text-center space-y-6 pt-2">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#F5B731]">
                  Pronto para começar hoje
                </p>
                <h2 className="font-display text-2xl sm:text-4xl lg:text-[42px] font-extrabold tracking-tight leading-tight text-white">
                  Sua lanchonete organizada e vendendo direto no seu Cardápio
                  Digital.
                </h2>
                <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto leading-relaxed">
                  Experimente gratuitamente por 3 dias sem cartão de crédito.
                  Depois, apenas{' '}
                  <strong className="text-[#F5B731] font-mono tabular-nums">
                    R$ 49,90/mês
                  </strong>{' '}
                  com tudo liberado.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => onNavigate('/cadastro')}
                    className="w-full sm:w-auto min-h-[52px] px-7 rounded-xl bg-[#F5B731] hover:bg-[#FFD059] text-[#111827] text-sm sm:text-base font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 shadow-[0_12px_30px_rgba(245,183,49,0.28)]"
                  >
                    Começar meu teste grátis
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('/login')}
                    className="w-full sm:w-auto min-h-[52px] px-6 rounded-xl border border-white/20 hover:border-white/40 bg-white/5 text-sm font-semibold text-white cursor-pointer transition-colors"
                  >
                    Entrar no sistema
                  </button>
                </div>
              </ScrollReveal>
            </div>
          </section>
        </main>

        {/* RODAPÉ OFICIAL DARK NAVY (Exibe Logo Completa com Slogan Oficial) */}
        <footer className="bg-[#172033] text-slate-300 py-12 sm:py-14">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row md:items-start justify-between gap-10">
            <div className="space-y-4 max-w-sm">
              <MgwBrandLogo variant="full" className="w-[210px] sm:w-[235px]" />
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Plataforma completa de gestão, cardápio digital sem comissão e
                operação de delivery para lanchonetes, hamburguerias e operações
                rápidas de alimentação.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3 text-xs sm:text-sm">
              <button
                type="button"
                onClick={() => onNavigate('/cadastro')}
                className="text-left hover:text-[#F5B731] cursor-pointer transition-colors"
              >
                Criar conta grátis
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/login')}
                className="text-left hover:text-[#F5B731] cursor-pointer transition-colors"
              >
                Entrar no sistema
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/mgw-gestao')}
                className="text-left hover:text-[#F5B731] cursor-pointer transition-colors"
              >
                MGW Gestão
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/cardapio-digital')}
                className="text-left hover:text-[#F5B731] cursor-pointer transition-colors"
              >
                Cardápio Digital
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/parceiros/cadastro')}
                className="text-left hover:text-[#F5B731] cursor-pointer transition-colors"
              >
                Seja parceiro MGW
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/parceiros/login')}
                className="text-left hover:text-[#F5B731] cursor-pointer transition-colors"
              >
                Área do parceiro
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/termos')}
                className="text-left hover:text-[#F5B731] cursor-pointer transition-colors"
              >
                Termos de uso
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/privacidade')}
                className="text-left hover:text-[#F5B731] cursor-pointer transition-colors"
              >
                Privacidade
              </button>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400">
            <span>
              © {new Date().getFullYear()} MGW Gestão. Todos os direitos
              reservados.
            </span>
            <span className="font-mono tabular-nums">
              R$ 49,90/mês · 3 dias grátis sem cartão
            </span>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
