import { ArrowRight, Check, ClipboardList, LayoutDashboard, ShoppingBag, Sparkles } from 'lucide-react';

type InstitutionalPageKind = 'gestao' | 'cardapio' | 'recursos' | 'planos';

interface InstitutionalPageViewProps {
  kind: InstitutionalPageKind;
  onNavigate: (path: string) => void;
}

const PAGE_CONTENT: Record<InstitutionalPageKind, {
  eyebrow: string; title: string; description: string; image: string; imageAlt: string;
  points: string[]; sectionTitle: string; sectionText: string; features: { title: string; text: string }[];
}> = {
  gestao: {
    eyebrow: 'MGW GESTÃO · CONTROLE DA OPERAÇÃO',
    title: 'Sua operação organizada. Suas decisões mais claras.',
    description: 'Acompanhe vendas, despesas, produtos, pedidos e resultados em um só lugar. Tenha uma visão prática da rotina do seu negócio sem depender de planilhas espalhadas.',
    image: '/assets/screenshots/gestao-dashboard.webp',
    imageAlt: 'Tela real do painel de gestão MGW',
    points: ['Vendas e despesas organizadas', 'Indicadores para acompanhar resultados', 'Central de Pedidos integrada'],
    sectionTitle: 'Tudo conectado à rotina do seu negócio',
    sectionText: 'O MGW Gestão reúne ferramentas essenciais para acompanhar o dia a dia da sua loja, com informações organizadas em um painel.',
    features: [
      { title: 'Visão do negócio', text: 'Acompanhe indicadores de vendas, despesas e desempenho em períodos diferentes.' },
      { title: 'Controle de vendas', text: 'Registre vendas, consulte o histórico e mantenha os movimentos organizados.' },
      { title: 'Pedidos online', text: 'Receba pedidos do Cardápio Digital na Central de Pedidos do sistema.' },
    ],
  },
  cardapio: {
    eyebrow: 'CARDÁPIO DIGITAL · SUA LOJA NA INTERNET',
    title: 'Um cardápio digital que facilita o pedido e valoriza seus produtos.',
    description: 'Apresente seus produtos com fotos, categorias, combos e adicionais. Seu cliente acessa pelo link da loja, monta o pedido no celular e envia sem precisar instalar aplicativo.',
    image: '/assets/screenshots/cardapio-catalogo.webp',
    imageAlt: 'Tela real do Cardápio Digital MGW em um celular',
    points: ['Acesso por link, sem instalação', 'Produtos, combos e adicionais', 'Pedidos integrados ao MGW Gestão'],
    sectionTitle: 'Da escolha ao pedido, em poucos passos',
    sectionText: 'Uma experiência pensada para o cliente navegar com facilidade e para sua equipe receber as informações do pedido organizadas.',
    features: [
      { title: 'Sua identidade', text: 'Apresente a loja com suas informações e identidade visual próprias.' },
      { title: 'Catálogo organizado', text: 'Organize categorias, produtos, combos, fotos e opções adicionais.' },
      { title: 'Pedido conectado', text: 'Os pedidos enviados pelo cardápio chegam à Central de Pedidos do MGW Gestão.' },
    ],
  },
  recursos: {
    eyebrow: 'RECURSOS · FERRAMENTAS INTEGRADAS',
    title: 'As ferramentas essenciais para acompanhar sua operação.',
    description: 'Conheça os recursos do ecossistema MGW para organizar a gestão, apresentar seus produtos e acompanhar os pedidos do seu negócio.',
    image: '/assets/screenshots/gestao-pedidos.webp',
    imageAlt: 'Tela real da Central de Pedidos MGW',
    points: ['Gestão e acompanhamento financeiro', 'Catálogo digital personalizável', 'Central de Pedidos e operação de entregas'],
    sectionTitle: 'Recursos que trabalham em conjunto',
    sectionText: 'Cada ferramenta tem seu papel na operação. A integração ajuda a reduzir tarefas repetitivas e manter as informações reunidas.',
    features: [
      { title: 'Gestão e relatórios', text: 'Vendas, despesas, produtos, combos e indicadores organizados.' },
      { title: 'Cardápio e pedidos', text: 'Catálogo online, personalização de itens, carrinho e envio de pedidos.' },
      { title: 'Acompanhamento de entregas', text: 'Ferramentas de organização de clientes, entregadores, regiões e despacho.' },
    ],
  },
  planos: {
    eyebrow: 'PLANOS · SIMPLES E TRANSPARENTE',
    title: 'Comece com tranquilidade. Conheça o MGW por dentro.',
    description: 'Experimente o MGW Gestão com 3 dias grátis, sem informar cartão de crédito no cadastro. Depois, uma assinatura mensal para continuar usando a plataforma.',
    image: '/assets/screenshots/gestao-dashboard.webp',
    imageAlt: 'Painel do MGW Gestão',
    points: ['3 dias grátis', 'Sem cartão de crédito no cadastro', 'R$ 49,90 por mês após o período grátis'],
    sectionTitle: 'Um plano para sua operação',
    sectionText: 'Tenha acesso aos recursos do MGW Gestão e do Cardápio Digital em uma assinatura mensal.',
    features: [
      { title: 'Teste grátis', text: 'Conheça a plataforma por 3 dias antes de decidir continuar.' },
      { title: 'Mensalidade clara', text: 'Após o teste, a assinatura custa R$ 49,90 por mês.' },
      { title: 'Gestão integrada', text: 'Gestão do negócio e Cardápio Digital conectados na mesma operação.' },
    ],
  },
};

export function InstitutionalPageView({ kind, onNavigate }: InstitutionalPageViewProps) {
  const content = PAGE_CONTENT[kind];
  const isMenu = kind === 'cardapio';
  return (
    <div className="mgw-institutional min-h-screen bg-[#F7F8FA] text-[#172033]">
      <header className="sticky top-0 z-40 border-b border-[#E7EAF0] bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <button type="button" onClick={() => onNavigate('/')} className="flex items-center gap-2.5 font-bold tracking-tight text-[#172033]">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#F5B731]/40 bg-[#FFF7E5] text-[#8B6100]">M</span>
            <span>MGW <span className="font-medium text-[#667085]">| Tecnologia para negócios food</span></span>
          </button>
          <nav aria-label="Navegação institucional" className="hidden items-center gap-6 text-sm font-semibold text-[#475467] md:flex">
            <button onClick={() => onNavigate('/mgw-gestao')} type="button" className="hover:text-[#946500]">MGW Gestão</button>
            <button onClick={() => onNavigate('/cardapio-digital')} type="button" className="hover:text-[#946500]">Cardápio Digital</button>
            <button onClick={() => onNavigate('/recursos')} type="button" className="hover:text-[#946500]">Recursos</button>
            <button onClick={() => onNavigate('/planos')} type="button" className="hover:text-[#946500]">Planos</button>
          </nav>
          <nav aria-label="Navegação institucional móvel" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-[#EEF0F4] py-3 text-xs font-semibold text-[#475467] md:hidden">
            <button onClick={() => onNavigate('/mgw-gestao')} type="button">MGW Gestão</button>
            <button onClick={() => onNavigate('/cardapio-digital')} type="button">Cardápio Digital</button>
            <button onClick={() => onNavigate('/recursos')} type="button">Recursos</button>
            <button onClick={() => onNavigate('/planos')} type="button">Planos</button>
          </nav>
          <button type="button" onClick={() => onNavigate('/cadastro')} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#F5B731] px-4 text-sm font-bold text-[#171717] shadow-sm hover:bg-[#E9AA25]">
            Testar grátis <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-[#E7EAF0] bg-white">
          <div className="pointer-events-none absolute -right-32 -top-48 h-[520px] w-[520px] rounded-full border border-[#F5B731]/20 shadow-[0_0_0_50px_rgba(245,183,49,.025),0_0_0_100px_rgba(245,183,49,.018)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
            <div>
              <p className="mb-5 inline-flex rounded-full border border-[#F5B731]/40 bg-[#FFF8E8] px-3 py-2 text-[11px] font-bold tracking-[.12em] text-[#805800]">{content.eyebrow}</p>
              <h1 className="max-w-2xl text-balance text-4xl font-extrabold leading-[1.06] tracking-[-.055em] text-[#151D2D] sm:text-5xl lg:text-[3.65rem]">{content.title}</h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-[#667085] sm:text-lg">{content.description}</p>
              <ul className="mt-7 space-y-3">
                {content.points.map((point) => <li key={point} className="flex items-start gap-3 text-sm font-semibold text-[#344054]"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FFF1C9] text-[#8B6100]"><Check className="h-3.5 w-3.5" /></span>{point}</li>)}
              </ul>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => onNavigate('/cadastro')} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#F5B731] px-6 text-sm font-bold text-[#171717] shadow-[0_8px_22px_rgba(214,157,28,.2)] hover:-translate-y-0.5 hover:bg-[#E9AA25]">Começar teste grátis <ArrowRight className="h-4 w-4" /></button>
                <button type="button" onClick={() => onNavigate('/')} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#E1E6ED] bg-white px-6 text-sm font-semibold text-[#344054] hover:border-[#E8C66D]">Voltar ao site</button>
              </div>
            </div>
            <div className="rounded-[26px] border border-[#E7EAF0] bg-white p-2 shadow-[0_24px_65px_rgba(16,24,40,.12)] sm:p-3">
              <div className="flex h-9 items-center gap-2 border-b border-[#EEF0F4] px-3"><span className="h-2.5 w-2.5 rounded-full bg-[#D0D5DD]" /><span className="h-2.5 w-2.5 rounded-full bg-[#D0D5DD]" /><span className="h-2.5 w-2.5 rounded-full bg-[#D0D5DD]" /><span className="ml-auto text-[11px] font-medium text-[#98A2B3]">{isMenu ? 'Cardápio Digital MGW' : 'MGW Gestão'}</span></div>
              <img src={content.image} alt={content.imageAlt} loading="eager" className={`block w-full rounded-b-2xl ${isMenu ? 'mx-auto max-h-[620px] max-w-[390px] object-contain' : 'aspect-[16/10] object-cover object-top'}`} />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-bold tracking-[.14em] text-[#946500]">FEITO PARA A ROTINA REAL</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-[-.045em] text-[#172033] sm:text-4xl">{content.sectionTitle}</h2>
            <p className="mt-4 leading-7 text-[#667085]">{content.sectionText}</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {content.features.map((feature, index) => {
              const Icon = [LayoutDashboard, ShoppingBag, ClipboardList][index] || Sparkles;
              return <article key={feature.title} className="rounded-2xl border border-[#E7EAF0] bg-white p-6 shadow-[0_8px_26px_rgba(16,24,40,.035)]"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF5D9] text-[#946500]"><Icon className="h-5 w-5" /></span><h3 className="mt-5 text-lg font-bold text-[#172033]">{feature.title}</h3><p className="mt-2 text-sm leading-6 text-[#667085]">{feature.text}</p></article>;
            })}
          </div>
        </section>

        <section className="border-y border-[#E7EAF0] bg-white px-4 py-14 text-center sm:py-20">
          <div className="mx-auto max-w-3xl"><p className="text-xs font-bold tracking-[.14em] text-[#946500]">MGW · GESTÃO E CARDÁPIO DIGITAL</p><h2 className="mt-3 text-3xl font-extrabold tracking-[-.05em] text-[#172033] sm:text-4xl">Dê o próximo passo para organizar seu negócio.</h2><p className="mx-auto mt-4 max-w-xl text-[#667085]">Crie sua conta e conheça as ferramentas MGW na prática.</p><button type="button" onClick={() => onNavigate('/cadastro')} className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#F5B731] px-7 text-sm font-bold text-[#171717] shadow-md hover:bg-[#E9AA25]">Experimentar grátis <ArrowRight className="h-4 w-4" /></button></div>
        </section>
      </main>
      <footer className="bg-[#F1F3F6] px-4 py-8 text-center text-xs text-[#667085]">© {new Date().getFullYear()} MGW. Todos os direitos reservados.</footer>
    </div>
  );
}
