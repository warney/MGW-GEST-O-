import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  ClipboardCheck,
  Layers3,
  Menu,
  Package,
  ShieldCheck,
  Smartphone,
  Store,
  X,
} from 'lucide-react';
import { useState } from 'react';

interface InstitutionalHomePageViewProps {
  onNavigate: (path: string) => void;
}

const products = [
  {
    number: '01',
    title: 'MGW Gestão',
    eyebrow: 'GESTÃO DO NEGÓCIO',
    description: 'Tenha vendas, despesas, produtos, combos e resultados organizados em um único painel. Mais clareza para acompanhar a operação e decidir os próximos passos.',
    image: '/assets/screenshots/gestao-dashboard.webp',
    alt: 'Painel de indicadores do MGW Gestão',
    points: ['Controle de vendas e despesas', 'Indicadores e relatórios', 'Central de Pedidos integrada'],
    href: '/mgw-gestao',
  },
  {
    number: '02',
    title: 'Cardápio Digital',
    eyebrow: 'SUA LOJA NA INTERNET',
    description: 'Apresente seus produtos com fotos, categorias, combos e adicionais. Seu cliente acessa pelo link da loja, monta o pedido pelo celular e envia em poucos passos.',
    image: '/assets/screenshots/cardapio-catalogo.webp',
    alt: 'Catálogo de produtos no Cardápio Digital MGW',
    points: ['Link próprio para compartilhar', 'Produtos, combos e adicionais', 'Pedidos conectados à gestão'],
    href: '/cardapio-digital',
  },
];

const capabilities = [
  { icon: BarChart3, title: 'Visão da operação', text: 'Acompanhe vendas, despesas e resultados com informações reunidas.' },
  { icon: Package, title: 'Catálogo organizado', text: 'Cadastre produtos, categorias, combos, fotos e adicionais.' },
  { icon: ClipboardCheck, title: 'Pedidos conectados', text: 'Receba os pedidos do cardápio em uma central integrada.' },
  { icon: Smartphone, title: 'Acesso simples', text: 'Use a plataforma no computador, tablet ou celular.' },
  { icon: ShieldCheck, title: 'Controle e segurança', text: 'Informações organizadas por estabelecimento e acesso.' },
  { icon: Layers3, title: 'Tudo em conjunto', text: 'Ferramentas que se complementam no dia a dia do negócio.' },
];

export function InstitutionalHomePageView({ onNavigate }: InstitutionalHomePageViewProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = (path: string) => {
    setMenuOpen(false);
    onNavigate(path);
  };

  return (
    <main className="mgw-home min-h-screen overflow-hidden bg-white text-[#172033]">
      <header className="sticky top-0 z-50 border-b border-[#E9ECF1] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[76px] max-w-7xl items-center justify-between gap-5 px-5 sm:px-8">
          <button type="button" onClick={() => navigate('/')} className="flex shrink-0 items-center gap-3 text-left" aria-label="MGW página inicial">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F5B731] text-lg font-black tracking-tight text-[#171717] shadow-sm">M</span>
            <span className="leading-tight">
              <span className="block text-xl font-extrabold tracking-[-.06em] text-[#172033]">MGW</span>
              <span className="block text-[10px] font-semibold tracking-[.11em] text-[#7A8495]">TECNOLOGIA FOOD</span>
            </span>
          </button>

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Navegação principal">
            <button type="button" onClick={() => navigate('/mgw-gestao')} className="text-sm font-semibold text-[#475467] transition hover:text-[#946500]">MGW Gestão</button>
            <button type="button" onClick={() => navigate('/cardapio-digital')} className="text-sm font-semibold text-[#475467] transition hover:text-[#946500]">Cardápio Digital</button>
            <button type="button" onClick={() => navigate('/recursos')} className="text-sm font-semibold text-[#475467] transition hover:text-[#946500]">Recursos</button>
            <button type="button" onClick={() => navigate('/planos')} className="text-sm font-semibold text-[#475467] transition hover:text-[#946500]">Planos</button>
            <button type="button" onClick={() => navigate('/parceiros')} className="text-sm font-semibold text-[#475467] transition hover:text-[#946500]">Parceiros</button>
            <button type="button" onClick={() => navigate('/contato')} className="text-sm font-semibold text-[#475467] transition hover:text-[#946500]">Contato</button>
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <button type="button" onClick={() => navigate('/login')} className="px-3 py-2 text-sm font-bold text-[#475467] transition hover:text-[#946500]">Entrar</button>
            <button type="button" onClick={() => navigate('/cadastro')} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F5B731] px-5 text-sm font-extrabold text-[#171717] shadow-[0_7px_18px_rgba(214,157,28,.18)] transition hover:-translate-y-0.5 hover:bg-[#E9AA25]">
              Começar grátis <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <button type="button" onClick={() => setMenuOpen((open) => !open)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E5E9F0] text-[#344054] lg:hidden" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menuOpen}>
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-[#E9ECF1] bg-white px-5 py-4 shadow-lg lg:hidden">
            <nav className="mx-auto flex max-w-7xl flex-col gap-1" aria-label="Navegação móvel">
              {[
                ['MGW Gestão', '/mgw-gestao'],
                ['Cardápio Digital', '/cardapio-digital'],
                ['Recursos', '/recursos'],
                ['Planos', '/planos'],
                ['Parceiros', '/parceiros'],
                ['Contato', '/contato'],
                ['Entrar', '/login'],
              ].map(([label, path]) => (
                <button key={path} type="button" onClick={() => navigate(path)} className="min-h-11 rounded-lg px-3 text-left text-sm font-semibold text-[#475467] hover:bg-[#F7F8FA]">{label}</button>
              ))}
              <button type="button" onClick={() => navigate('/cadastro')} className="mt-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#F5B731] px-5 text-sm font-extrabold text-[#171717]">Começar grátis <ArrowRight className="h-4 w-4" /></button>
            </nav>
          </div>
        )}
      </header>

      <section className="relative isolate overflow-hidden bg-[#F8F9FB]">
        <div className="pointer-events-none absolute -right-48 -top-52 h-[620px] w-[620px] rounded-full border border-[#EFC66A]/30 shadow-[0_0_0_55px_rgba(245,183,49,.035),0_0_0_110px_rgba(245,183,49,.025)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[.95fr_1.05fr] lg:gap-16 lg:py-28">
          <div className="relative z-10">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#EAD9AF] bg-white px-3.5 py-2 text-[11px] font-extrabold tracking-[.12em] text-[#8A620C] shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[#F5B731]" /> TECNOLOGIA PARA NEGÓCIOS FOOD
            </div>
            <h1 className="max-w-2xl text-balance text-[2.65rem] font-black leading-[1.04] tracking-[-.065em] text-[#172033] sm:text-5xl lg:text-[3.8rem]">
              Sua operação mais organizada. <span className="text-[#B27B0C]">Seu negócio pronto para crescer.</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-[#667085] sm:text-lg">
              Gestão e Cardápio Digital trabalhando juntos para simplificar a rotina, aproximar seus clientes e dar mais clareza às decisões do seu negócio.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => navigate('/cadastro')} className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl bg-[#F5B731] px-6 py-3.5 text-sm font-extrabold text-[#171717] shadow-[0_10px_26px_rgba(214,157,28,.22)] transition hover:-translate-y-0.5 hover:bg-[#E9AA25]">
                Experimente grátis <ArrowRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => navigate('/recursos')} className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl border border-[#DDE2EA] bg-white px-6 py-3.5 text-sm font-bold text-[#344054] transition hover:border-[#E5BD5C] hover:bg-[#FFFCF5]">
                Conheça as soluções <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-[#667085]">
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#A87500]" /> 3 dias para experimentar</span>
              <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#A87500]" /> Sem cartão no cadastro</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[660px]">
            <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-[#F5B731]/20 via-white to-[#E8EDF5] blur-2xl" />
            <div className="relative rounded-[1.6rem] border border-[#E4E8EF] bg-white p-2.5 shadow-[0_28px_80px_rgba(16,24,40,.13)] sm:p-3.5">
              <div className="flex items-center gap-2 border-b border-[#EEF0F4] px-3 pb-3 pt-1">
                <span className="h-2.5 w-2.5 rounded-full bg-[#F0B53A]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#D9DEE7]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#D9DEE7]" />
                <span className="ml-2 text-[10px] font-bold tracking-wide text-[#98A2B3]">MGW GESTÃO · VISÃO GERAL</span>
              </div>
              <img src="/assets/screenshots/gestao-dashboard.webp" alt="Visão geral do painel MGW Gestão" className="block aspect-[1.42/1] w-full rounded-b-xl object-cover object-top" />
              <div className="absolute -bottom-5 -left-4 hidden items-center gap-3 rounded-2xl border border-[#E8EBF0] bg-white px-4 py-3 shadow-[0_12px_35px_rgba(16,24,40,.12)] sm:flex">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF4D7] text-[#946500]"><Store className="h-5 w-5" /></span>
                <span><strong className="block text-xs text-[#273247]">Gestão + Cardápio</strong><small className="text-[10px] text-[#7A8495]">Conectados na sua operação</small></span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#ECEFF3] bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 px-5 py-7 sm:grid-cols-3 sm:px-8">
          {[
            ['Mais organização', 'Informações reunidas para acompanhar a rotina.'],
            ['Mais praticidade', 'Ferramentas acessíveis no computador e celular.'],
            ['Mais conexão', 'Cardápio e gestão trabalhando em conjunto.'],
          ].map(([title, description]) => (
            <div key={title} className="flex items-start gap-3 sm:px-4">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FFF4D7] text-[#946500]"><Check className="h-4 w-4" /></span>
              <span><strong className="block text-sm font-extrabold text-[#273247]">{title}</strong><small className="mt-1 block text-xs leading-5 text-[#7A8495]">{description}</small></span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="text-[11px] font-extrabold tracking-[.16em] text-[#A87500]">O ECOSSISTEMA MGW</p>
          <h2 className="mt-4 text-3xl font-black tracking-[-.055em] text-[#172033] sm:text-4xl">Duas soluções. Uma operação mais conectada.</h2>
          <p className="mt-5 text-sm leading-7 text-[#667085] sm:text-base">Cada ferramenta resolve uma parte importante do dia a dia. Juntas, ajudam você a organizar a operação e oferecer uma experiência melhor aos seus clientes.</p>
        </div>
        <div className="grid gap-7 lg:grid-cols-2">
          {products.map((product) => (
            <article key={product.number} className="group overflow-hidden rounded-[1.6rem] border border-[#E7EAF0] bg-white shadow-[0_12px_40px_rgba(16,24,40,.045)] transition hover:-translate-y-1 hover:shadow-[0_22px_55px_rgba(16,24,40,.09)]">
              <div className="overflow-hidden border-b border-[#EEF0F4] bg-[#F7F8FA] p-4 sm:p-6">
                <img src={product.image} alt={product.alt} className="aspect-[1.65/1] w-full rounded-xl border border-[#E5E9F0] object-cover object-top shadow-sm transition duration-500 group-hover:scale-[1.015]" />
              </div>
              <div className="p-6 sm:p-8">
                <p className="text-[10px] font-extrabold tracking-[.16em] text-[#A87500]">{product.eyebrow}</p>
                <h3 className="mt-2 text-2xl font-black tracking-[-.04em] text-[#172033]">{product.title}</h3>
                <p className="mt-4 text-sm leading-7 text-[#667085]">{product.description}</p>
                <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                  {product.points.map((point) => <li key={point} className="flex items-center gap-2 text-xs font-semibold text-[#475467]"><Check className="h-4 w-4 shrink-0 text-[#A87500]" />{point}</li>)}
                </ul>
                <button type="button" onClick={() => navigate(product.href)} className="mt-7 inline-flex items-center gap-2 text-sm font-extrabold text-[#8A620C] transition hover:gap-3">Conhecer solução <ArrowRight className="h-4 w-4" /></button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-[#F7F8FA] py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-[11px] font-extrabold tracking-[.16em] text-[#A87500]">RECURSOS PARA SUA ROTINA</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-.055em] text-[#172033] sm:text-4xl">O que você precisa, conectado em um só lugar.</h2>
            <p className="mt-5 text-sm leading-7 text-[#667085] sm:text-base">Uma plataforma pensada para acompanhar o funcionamento real de negócios do segmento food.</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border border-[#E7EAF0] bg-white p-6 transition hover:border-[#E8C56F] hover:shadow-[0_12px_32px_rgba(16,24,40,.055)]">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF4D7] text-[#946500]"><Icon className="h-5 w-5" /></span>
                <h3 className="mt-5 text-base font-extrabold text-[#273247]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#7A8495]">{text}</p>
              </article>
            ))}
          </div>
          <div className="mt-9 text-center">
            <button type="button" onClick={() => navigate('/recursos')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DDE2EA] bg-white px-5 text-sm font-bold text-[#344054] transition hover:border-[#E5BD5C]">Ver todos os recursos <ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-2">
        <div className="order-2 overflow-hidden rounded-[1.6rem] border border-[#E7EAF0] bg-white p-3 shadow-[0_20px_60px_rgba(16,24,40,.08)] lg:order-1">
          <img src="/assets/screenshots/gestao-pedidos.webp" alt="Central de Pedidos integrada ao MGW Gestão" className="aspect-[1.45/1] w-full rounded-xl object-cover object-top" />
        </div>
        <div className="order-1 lg:order-2">
          <p className="text-[11px] font-extrabold tracking-[.16em] text-[#A87500]">DA VITRINE À GESTÃO</p>
          <h2 className="mt-4 text-3xl font-black leading-tight tracking-[-.055em] text-[#172033] sm:text-4xl">O pedido chega. Sua equipe acompanha. Você mantém o controle.</h2>
          <p className="mt-5 text-sm leading-7 text-[#667085] sm:text-base">O cliente faz o pedido pelo Cardápio Digital e as informações seguem para a Central de Pedidos do MGW Gestão, ajudando sua equipe a acompanhar cada etapa.</p>
          <ul className="mt-7 space-y-3">
            {['Receba pedidos em uma central organizada', 'Acompanhe o andamento do atendimento', 'Mantenha os dados do pedido acessíveis à equipe'].map((item) => <li key={item} className="flex items-start gap-3 text-sm font-semibold text-[#475467]"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#A87500]" />{item}</li>)}
          </ul>
          <button type="button" onClick={() => navigate('/cardapio-digital')} className="mt-8 inline-flex items-center gap-2 text-sm font-extrabold text-[#8A620C]">Entenda como funciona <ArrowRight className="h-4 w-4" /></button>
        </div>
      </section>

      <section className="border-y border-[#E9ECF1] bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 text-center sm:px-8">
          <p className="text-[11px] font-extrabold tracking-[.16em] text-[#A87500]">COMECE COM TRANQUILIDADE</p>
          <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-black tracking-[-.055em] text-[#172033] sm:text-4xl">Conheça a MGW na prática.</h2>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[#667085] sm:text-base">Crie sua conta e experimente o MGW Gestão por 3 dias, sem informar cartão de crédito no cadastro.</p>
          <div className="mx-auto mt-9 flex max-w-md flex-col justify-center gap-3 sm:flex-row">
            <button type="button" onClick={() => navigate('/cadastro')} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#F5B731] px-6 text-sm font-extrabold text-[#171717] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#E9AA25]">Criar minha conta <ArrowRight className="h-4 w-4" /></button>
            <button type="button" onClick={() => navigate('/planos')} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#DDE2EA] px-6 text-sm font-bold text-[#344054] transition hover:bg-[#F8F9FB]">Conhecer os planos</button>
          </div>
        </div>
      </section>

      <section className="bg-[#172033] px-5 py-16 text-white sm:px-8 sm:py-20">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <p className="text-[11px] font-extrabold tracking-[.16em] text-[#F5C75E]">PROGRAMA DE PARCEIROS</p>
            <h2 className="mt-3 text-2xl font-black tracking-[-.04em] sm:text-3xl">Cresça junto com o ecossistema MGW.</h2>
            <p className="mt-3 text-sm leading-7 text-[#C5CBD5]">Indique negócios, acompanhe seus contatos e conte com materiais de divulgação para desenvolver novas oportunidades.</p>
          </div>
          <button type="button" onClick={() => navigate('/parceiros')} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl bg-[#F5B731] px-6 text-sm font-extrabold text-[#171717] transition hover:bg-[#E9AA25]">Conhecer programa <ArrowRight className="h-4 w-4" /></button>
        </div>
      </section>

      <footer className="bg-[#111827] px-5 py-12 text-[#C5CBD5] sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F5B731] text-lg font-black text-[#171717]">M</span>
              <span><strong className="block text-lg font-black tracking-[-.05em] text-white">MGW</strong><small className="text-[9px] font-bold tracking-[.13em] text-[#AAB2C0]">TECNOLOGIA FOOD</small></span>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-7 text-[#AAB2C0]">Tecnologia para organizar a gestão, conectar pedidos e fortalecer negócios do segmento food.</p>
          </div>
          <div>
            <h3 className="text-xs font-extrabold tracking-[.12em] text-white">SOLUÇÕES</h3>
            <div className="mt-4 flex flex-col gap-3 text-sm">
              <button type="button" onClick={() => navigate('/mgw-gestao')} className="text-left hover:text-[#F5C75E]">MGW Gestão</button>
              <button type="button" onClick={() => navigate('/cardapio-digital')} className="text-left hover:text-[#F5C75E]">Cardápio Digital</button>
              <button type="button" onClick={() => navigate('/recursos')} className="text-left hover:text-[#F5C75E]">Recursos</button>
              <button type="button" onClick={() => navigate('/planos')} className="text-left hover:text-[#F5C75E]">Planos</button>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-extrabold tracking-[.12em] text-white">MGW</h3>
            <div className="mt-4 flex flex-col gap-3 text-sm">
              <button type="button" onClick={() => navigate('/parceiros')} className="text-left hover:text-[#F5C75E]">Programa de Parceiros</button>
              <button type="button" onClick={() => navigate('/contato')} className="text-left hover:text-[#F5C75E]">Contato</button>
              <button type="button" onClick={() => navigate('/termos')} className="text-left hover:text-[#F5C75E]">Termos de uso</button>
              <button type="button" onClick={() => navigate('/privacidade')} className="text-left hover:text-[#F5C75E]">Privacidade</button>
              <button type="button" onClick={() => navigate('/login')} className="text-left hover:text-[#F5C75E]">Entrar no sistema</button>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-10 max-w-7xl border-t border-white/10 pt-6 text-xs text-[#8D97A7]">© {new Date().getFullYear()} MGW. Todos os direitos reservados.</div>
      </footer>
    </main>
  );
}
