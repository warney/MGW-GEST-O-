import { useEffect, useState, type FormEvent } from 'react';
import { ExternalLink, FolderOpen, Megaphone, Plus, RefreshCw, Search, Users } from 'lucide-react';
import { StatusIndicator } from '../components/StatusIndicator';
import {
  createAdminMgwPartnerCampaign,
  createAdminMgwPartnerMaterial,
  fetchAdminMgwPartnerCampaigns,
  fetchAdminMgwPartnerLeads,
  fetchAdminMgwPartnerMaterials,
  fetchMgwPartnerCrmOverview,
  setAdminMgwPartnerCampaignStatus,
  setAdminMgwPartnerMaterialActive,
  type MgwPartnerCampaignRecord,
  type MgwPartnerCrmOverview,
  type MgwPartnerLeadAdminRecord,
  type MgwPartnerMaterialRecord,
} from '../services/adminApi';
import { formatDateBr } from '../services/rbac';

interface Props {
  mfaVerified: boolean;
  onRequestMfa: () => void;
}

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/30';

const categories = [
  ['social', 'Redes sociais'],
  ['whatsapp', 'WhatsApp'],
  ['video', 'Vídeo'],
  ['banner', 'Banner'],
  ['presentation', 'Apresentação'],
  ['tutorial', 'Tutorial'],
  ['document', 'Documento'],
  ['general', 'Geral'],
] as const;

const stages: Record<string, string> = {
  new: 'Novo',
  contacted: 'Em contato',
  demo_scheduled: 'Demonstração agendada',
  demo_completed: 'Demonstração realizada',
  awaiting_decision: 'Aguardando decisão',
  converted: 'Convertido',
  not_converted: 'Não convertido',
};

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70);
}

export function PartnerProgramManagementView({ mfaVerified, onRequestMfa }: Props) {
  const [tab, setTab] = useState<'campaigns' | 'materials' | 'leads'>('campaigns');
  const [campaigns, setCampaigns] = useState<MgwPartnerCampaignRecord[]>([]);
  const [materials, setMaterials] = useState<MgwPartnerMaterialRecord[]>([]);
  const [leads, setLeads] = useState<MgwPartnerLeadAdminRecord[]>([]);
  const [overview, setOverview] = useState<MgwPartnerCrmOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [campaignName, setCampaignName] = useState('');
  const [objective, setObjective] = useState('');
  const [segment, setSegment] = useState('all');
  const [instructions, setInstructions] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const [materialTitle, setMaterialTitle] = useState('');
  const [materialDescription, setMaterialDescription] = useState('');
  const [category, setCategory] = useState('social');
  const [resourceUrl, setResourceUrl] = useState('');
  const [resourceType, setResourceType] = useState('link');
  const [materialCampaign, setMaterialCampaign] = useState('');
  const [leadSearch, setLeadSearch] = useState('');

  async function load() {
    setBusy(true);
    setError('');
    try {
      const [c, m, l, o] = await Promise.all([
        fetchAdminMgwPartnerCampaigns(),
        fetchAdminMgwPartnerMaterials(),
        fetchAdminMgwPartnerLeads(300),
        fetchMgwPartnerCrmOverview(),
      ]);
      setCampaigns(c);
      setMaterials(m);
      setLeads(l);
      setOverview(o);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar a gestão comercial.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function requireMfa() {
    if (mfaVerified) return true;
    onRequestMfa();
    return false;
  }

  async function createCampaign(e: FormEvent) {
    e.preventDefault();
    if (!requireMfa()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const slug = `${slugify(campaignName)}-${Math.random().toString(36).slice(2, 6)}`;
      await createAdminMgwPartnerCampaign({
        slug,
        name: campaignName.trim(),
        objective: objective.trim(),
        targetSegment: segment,
        instructions: instructions.trim(),
        startsAt: startsAt ? new Date(startsAt).toISOString() : new Date().toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      });
      setCampaignName('');
      setObjective('');
      setInstructions('');
      setStartsAt('');
      setEndsAt('');
      setNotice('Campanha criada e disponibilizada aos parceiros.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar a campanha.');
    } finally {
      setBusy(false);
    }
  }

  async function createMaterial(e: FormEvent) {
    e.preventDefault();
    if (!requireMfa()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await createAdminMgwPartnerMaterial({
        title: materialTitle.trim(),
        description: materialDescription.trim(),
        category,
        resourceUrl: resourceUrl.trim(),
        resourceType,
        campaignId: materialCampaign || null,
      });
      setMaterialTitle('');
      setMaterialDescription('');
      setResourceUrl('');
      setMaterialCampaign('');
      setNotice('Material cadastrado na biblioteca.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível cadastrar o material.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleMaterial(item: MgwPartnerMaterialRecord) {
    if (!requireMfa()) return;
    setBusy(true);
    setError('');
    try {
      await setAdminMgwPartnerMaterialActive(item.id, !item.active);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao atualizar material.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleCampaign(item: MgwPartnerCampaignRecord) {
    if (!requireMfa()) return;
    setBusy(true);
    setError('');
    try {
      await setAdminMgwPartnerCampaignStatus(
        item.id,
        item.status === 'active' ? 'ended' : 'active',
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao atualizar campanha.');
    } finally {
      setBusy(false);
    }
  }

  const tabs: Array<{ key: 'campaigns' | 'materials' | 'leads'; label: string; Icon: typeof Megaphone }> = [
    { key: 'campaigns', label: 'Campanhas', Icon: Megaphone },
    { key: 'materials', label: 'Biblioteca', Icon: FolderOpen },
    { key: 'leads', label: 'Interessados', Icon: Users },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-amber-700">Operação comercial</p>
          <h2 className="mt-0.5 text-base font-bold text-slate-900">
            Campanhas, materiais e interessados
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Gestão global do programa de parceiros.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer whitespace-nowrap"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800"
        >
          {notice}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Acessos registrados', overview?.clicks ?? '—'],
          ['Interessados', overview?.leads ?? '—'],
          ['Leads em negociação', overview?.open_leads ?? '—'],
          ['Campanhas ativas', overview?.campaigns_active ?? '—'],
        ].map(([label, value]) => (
          <article key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {busy ? '—' : value}
            </p>
          </article>
        ))}
      </div>

      {overview && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Desempenho por parceiro</h3>
          <div className="space-y-2">
            {overview.by_partner.map((p) => (
              <article
                key={p.partner_id}
                className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1.4fr_repeat(3,0.7fr)] items-center"
              >
                <div>
                  <p className="text-xs font-semibold text-slate-900">{p.partner_name}</p>
                  <p className="text-[11px] font-mono text-slate-500">{p.email}</p>
                </div>
                <p className="text-xs text-slate-600 tabular-nums">
                  <strong className="font-mono text-slate-900">{p.clicks}</strong> acessos
                </p>
                <p className="text-xs text-slate-600 tabular-nums">
                  <strong className="font-mono text-slate-900">{p.leads}</strong> interessados
                </p>
                <p className="text-xs text-slate-600 tabular-nums">
                  <strong className="font-mono text-slate-900">{p.converted_leads}</strong> convertidos
                </p>
              </article>
            ))}
            {!overview.by_partner.length && (
              <p className="text-xs text-slate-500">Ainda não há parceiros cadastrados.</p>
            )}
          </div>
        </section>
      )}

      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {tabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
              tab === key
                ? 'bg-[#F5B731] text-slate-900'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {tab === 'campaigns' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <form
            onSubmit={(e) => void createCampaign(e)}
            className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 h-fit"
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Plus className="h-4 w-4 text-amber-700" />
              <span>Nova campanha</span>
            </h3>
            <label className="block text-xs font-medium text-slate-700">
              <span>Nome</span>
              <input
                className={inputClass}
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                required
                maxLength={140}
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              <span>Objetivo</span>
              <input
                className={inputClass}
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                maxLength={300}
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              <span>Público</span>
              <select
                className={inputClass}
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
              >
                <option value="all">Todos os segmentos</option>
                {[
                  'lanchonete',
                  'hamburgueria',
                  'pizzaria',
                  'acaiteria',
                  'restaurante',
                  'adega',
                  'distribuidora',
                  'padaria',
                  'cafeteria',
                  'sorveteria',
                ].map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-700">
              <span>Instruções</span>
              <textarea
                className={`${inputClass} min-h-20`}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                maxLength={3000}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-medium text-slate-700">
                <span>Início</span>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </label>
              <label className="text-xs font-medium text-slate-700">
                <span>Fim</span>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={busy || !campaignName.trim()}
              className="w-full rounded-lg bg-[#F5B731] px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-[#e5a824] disabled:opacity-50 cursor-pointer"
            >
              Criar campanha
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">
              Campanhas cadastradas ({campaigns.length})
            </h3>
            <div className="divide-y divide-slate-100">
              {campaigns.map((c) => {
                const stats = overview?.by_campaign.find((x) => x.campaign_id === c.id);
                return (
                  <article
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-slate-900">{c.name}</p>
                        <StatusIndicator
                          status={c.status === 'active' ? 'active' : 'closed'}
                          labelOverride={c.status === 'active' ? 'Ativa' : 'Encerrada'}
                        />
                      </div>
                      <p className="text-[11px] font-mono text-slate-500">
                        {c.target_segment === 'all' ? 'Todos os segmentos' : c.target_segment} ·{' '}
                        {c.slug}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
                        {stats?.clicks ?? 0} acessos · {stats?.leads ?? 0} interessados
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleCampaign(c)}
                      disabled={busy}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                    >
                      {c.status === 'active' ? 'Encerrar' : 'Ativar'}
                    </button>
                  </article>
                );
              })}
              {!campaigns.length && (
                <p className="py-4 text-xs text-slate-500">Nenhuma campanha cadastrada.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'materials' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <form
            onSubmit={(e) => void createMaterial(e)}
            className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 h-fit"
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Plus className="h-4 w-4 text-amber-700" />
              <span>Novo material</span>
            </h3>
            <label className="block text-xs font-medium text-slate-700">
              <span>Título</span>
              <input
                className={inputClass}
                value={materialTitle}
                onChange={(e) => setMaterialTitle(e.target.value)}
                required
                maxLength={160}
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              <span>Descrição</span>
              <textarea
                className={`${inputClass} min-h-16`}
                value={materialDescription}
                onChange={(e) => setMaterialDescription(e.target.value)}
                maxLength={1000}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-medium text-slate-700">
                <span>Categoria</span>
                <select
                  className={inputClass}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {categories.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-700">
                <span>Tipo</span>
                <select
                  className={inputClass}
                  value={resourceType}
                  onChange={(e) => setResourceType(e.target.value)}
                >
                  <option value="link">Link</option>
                  <option value="image">Imagem</option>
                  <option value="video">Vídeo</option>
                  <option value="document">Documento</option>
                </select>
              </label>
            </div>
            <label className="block text-xs font-medium text-slate-700">
              <span>URL do arquivo ou conteúdo</span>
              <input
                type="url"
                className={inputClass}
                value={resourceUrl}
                onChange={(e) => setResourceUrl(e.target.value)}
                required
                placeholder="https://..."
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              <span>Associar à campanha</span>
              <select
                className={inputClass}
                value={materialCampaign}
                onChange={(e) => setMaterialCampaign(e.target.value)}
              >
                <option value="">Nenhuma campanha</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={busy || !materialTitle.trim() || !resourceUrl.trim()}
              className="w-full rounded-lg bg-[#F5B731] px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-[#e5a824] disabled:opacity-50 cursor-pointer"
            >
              Cadastrar material
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">
              Biblioteca ({materials.length})
            </h3>
            <div className="divide-y divide-slate-100">
              {materials.map((m) => (
                <article
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-slate-900">{m.title}</p>
                      <StatusIndicator
                        status={m.active ? 'active' : 'suspended'}
                        labelOverride={m.active ? 'Ativo' : 'Inativo'}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {m.category} ·{' '}
                      <a
                        href={m.resource_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-amber-700 hover:underline inline-flex items-center gap-1"
                      >
                        <span>Abrir material</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleMaterial(m)}
                    disabled={busy}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                  >
                    {m.active ? 'Desativar' : 'Ativar'}
                  </button>
                </article>
              ))}
              {!materials.length && (
                <p className="py-4 text-xs text-slate-500">Nenhum material cadastrado.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'leads' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Todos os interessados ({leads.length})
              </h3>
              <p className="text-xs text-slate-500">Visão global exclusiva do Super Admin.</p>
            </div>
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                placeholder="Buscar loja, contato ou cidade..."
                className="w-56 rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
              />
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {leads
              .filter((l) => {
                const q = leadSearch.trim().toLowerCase();
                if (!q) return true;
                return (
                  l.establishment_name.toLowerCase().includes(q) ||
                  l.contact_name.toLowerCase().includes(q) ||
                  (l.city || '').toLowerCase().includes(q) ||
                  (l.segment || '').toLowerCase().includes(q) ||
                  (l.partner_name || '').toLowerCase().includes(q)
                );
              })
              .map((l) => (
                <article
                  key={l.id}
                  className="grid gap-2 p-4 sm:grid-cols-[1.3fr_1fr_1fr] items-center"
                >
                  <div>
                    <p className="text-xs font-semibold text-slate-900">{l.establishment_name}</p>
                    <p className="text-[11px] text-slate-600">
                      {l.contact_name} · {l.phone || l.email || 'Sem contato'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {l.segment}
                      {l.city ? ` · ${l.city}` : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">
                      {l.partner_name || 'Parceiro'}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500">{l.partner_email || ''}</p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs font-semibold text-amber-800">
                      {stages[l.stage] || l.stage}
                    </p>
                    <p className="mt-1 text-[11px] font-mono text-slate-500 tabular-nums">
                      {formatDateBr(l.created_at)}
                    </p>
                  </div>
                </article>
              ))}
            {!leads.length && (
              <p className="p-6 text-center text-xs text-slate-500">
                Nenhum interessado cadastrado.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
