import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, MessageSquarePlus, Send, X } from 'lucide-react';
import { StatusIndicator } from '../components/StatusIndicator';
import {
  createTicket,
  fetchEstablishments,
  fetchTicketMessages,
  fetchTickets,
  replyOrUpdateTicket,
} from '../services/adminApi';
import { canReplySupportTickets, formatDateTimeBr } from '../services/rbac';
import type {
  EstablishmentRecord,
  PlatformRole,
  SupportTicketMessageRecord,
  SupportTicketRecord,
} from '../types/admin';

interface SupportViewProps {
  role: PlatformRole;
  refreshTrigger: number;
  onInspectEstablishment?: (tenantId: string) => void;
  focusedTicketTenantId?: string | null;
  onFocusedTicketTenantConsumed?: () => void;
}

export function SupportView({
  role,
  refreshTrigger,
  onInspectEstablishment,
  focusedTicketTenantId,
  onFocusedTicketTenantConsumed,
}: SupportViewProps) {
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketRecord | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [tenants, setTenants] = useState<EstablishmentRecord[]>([]);
  const [newTicket, setNewTicket] = useState({
    tenantId: '',
    requesterEmail: '',
    subject: '',
    category: 'technical',
    priority: 'medium',
    message: '',
  });
  const [creating, setCreating] = useState(false);

  const canReply = canReplySupportTickets(role);

  const loadTickets = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchTickets(statusFilter, priorityFilter, search);
      setTickets(list);
      if (selectedTicket) {
        const refreshed = list.find((item) => item.id === selectedTicket.id) ?? null;
        setSelectedTicket(refreshed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao listar chamados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTickets();
  }, [refreshTrigger, statusFilter, priorityFilter]);

  useEffect(() => {
    if (!selectedTicket) {
      setMessages([]);
      return;
    }
    fetchTicketMessages(selectedTicket.id)
      .then(setMessages)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar mensagens.'));
  }, [selectedTicket?.id]);

  const handleSendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyText.trim()) return;
    setSendingReply(true);
    setError(null);
    try {
      await replyOrUpdateTicket({
        ticketId: selectedTicket.id,
        message: replyText.trim(),
        isInternalNote,
      });
      setReplyText('');
      const updatedMsgs = await fetchTicketMessages(selectedTicket.id);
      setMessages(updatedMsgs);
      await loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar resposta.');
    } finally {
      setSendingReply(false);
    }
  };

  const handleStatusChange = async (nextStatus: string) => {
    if (!selectedTicket) return;
    setError(null);
    try {
      await replyOrUpdateTicket({
        ticketId: selectedTicket.id,
        status: nextStatus,
      });
      await loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar status.');
    }
  };

  const handlePriorityChange = async (nextPriority: string) => {
    if (!selectedTicket) return;
    setError(null);
    try {
      await replyOrUpdateTicket({
        ticketId: selectedTicket.id,
        priority: nextPriority,
      });
      await loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar prioridade.');
    }
  };

  const openCreateModal = (prefillTenantId?: string) => {
    setCreateOpen(true);
    const applyTenantList = (items: EstablishmentRecord[]) => {
      setTenants(items);
      if (prefillTenantId) {
        const found = items.find((t) => t.id === prefillTenantId);
        setNewTicket((prev) => ({
          ...prev,
          tenantId: prefillTenantId,
          requesterEmail: found?.owner_email || prev.requesterEmail,
        }));
      }
    };

    if (tenants.length === 0) {
      fetchEstablishments('', 'all', 200, 0)
        .then((res) => applyTenantList(res.items))
        .catch(() => {
          /* opcional no formulário */
        });
    } else if (prefillTenantId) {
      applyTenantList(tenants);
    }
  };

  useEffect(() => {
    if (!focusedTicketTenantId) return;
    openCreateModal(focusedTicketTenantId);
    onFocusedTicketTenantConsumed?.();
  }, [focusedTicketTenantId, onFocusedTicketTenantConsumed]);

  const handleCreateTicket = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await createTicket({
        tenantId: newTicket.tenantId || null,
        requesterEmail: newTicket.requesterEmail,
        subject: newTicket.subject,
        category: newTicket.category,
        priority: newTicket.priority,
        initialMessage: newTicket.message,
      });
      setCreateOpen(false);
      setNewTicket({
        tenantId: '',
        requesterEmail: '',
        subject: '',
        category: 'technical',
        priority: 'medium',
        message: '',
      });
      await loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao abrir chamado.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Suporte &amp; Chamados</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Atendimento operacional, histórico por tenant e notas internas da equipe MGW.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
          >
            <option value="all">Todos status</option>
            <option value="open">Abertos</option>
            <option value="in_progress">Em atendimento</option>
            <option value="waiting_client">Aguardando cliente</option>
            <option value="resolved">Resolvidos</option>
            <option value="closed">Encerrados</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
          >
            <option value="all">Todas prioridades</option>
            <option value="urgent">Urgente</option>
            <option value="high">Alta</option>
            <option value="medium">Média</option>
            <option value="low">Baixa</option>
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void loadTickets();
            }}
            placeholder="Buscar assunto/email..."
            className="w-44 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
          />
          {canReply && (
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#F5B731] px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-[#e5a824] cursor-pointer whitespace-nowrap"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              <span>Novo Chamado</span>
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] font-mono text-slate-600 tabular-nums">
        <span>
          Total listado: <strong className="text-slate-900">{tickets.length}</strong>
        </span>
        <span>
          Abertos:{' '}
          <strong className="text-amber-700">
            {tickets.filter((t) => t.status === 'open').length}
          </strong>
        </span>
        <span>
          Em atendimento:{' '}
          <strong className="text-sky-700">
            {tickets.filter((t) => t.status === 'in_progress' || t.status === 'waiting_client').length}
          </strong>
        </span>
        <span>
          Urgentes ativos:{' '}
          <strong className="text-rose-700">
            {tickets.filter((t) => t.priority === 'urgent' && t.status !== 'resolved' && t.status !== 'closed').length}
          </strong>
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <div className="xl:col-span-2 rounded-xl border border-slate-200 bg-white overflow-hidden">
          {loading ? (
            <div className="p-5 space-y-2.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 rounded bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Nenhum chamado registrado até o momento.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {tickets.map((tk) => (
                <button
                  key={tk.id}
                  type="button"
                  onClick={() => setSelectedTicket(tk)}
                  className={`w-full text-left p-4 transition-colors cursor-pointer ${
                    selectedTicket?.id === tk.id ? 'bg-[#F5B731]/12' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-500">
                    <span>#{tk.ticket_number} · {tk.priority.toUpperCase()}</span>
                    <StatusIndicator status={tk.status} />
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-900 truncate">{tk.subject}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500 truncate">
                    {tk.tenant_name || tk.requester_email || 'Sem vínculo'} · {tk.messages_count} msg
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="xl:col-span-3 rounded-xl border border-slate-200 bg-white p-5 flex flex-col justify-between min-h-[420px]">
          {!selectedTicket ? (
            <div className="my-auto text-center text-xs text-slate-500">
              Selecione um chamado à esquerda para acompanhar a thread e registrar respostas.
            </div>
          ) : (
            <div className="flex flex-col h-full justify-between gap-4">
              <div className="pb-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-mono text-slate-500">
                    Chamado #{selectedTicket.ticket_number} · {selectedTicket.category}
                    {selectedTicket.tenant_name ? ` · ${selectedTicket.tenant_name}` : ''}
                  </p>
                  <h2 className="text-sm font-bold text-slate-900">{selectedTicket.subject}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Solicitante: {selectedTicket.requester_email || '—'} · Atualizado em{' '}
                    {formatDateTimeBr(selectedTicket.updated_at)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {selectedTicket.tenant_id && onInspectEstablishment && (
                    <button
                      type="button"
                      onClick={() => onInspectEstablishment(selectedTicket.tenant_id!)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                    >
                      <span>Abrir loja</span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-amber-700" />
                    </button>
                  )}

                  {canReply && (
                    <>
                      <select
                        value={selectedTicket.priority}
                        onChange={(e) => void handlePriorityChange(e.target.value)}
                        aria-label="Prioridade do chamado"
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                      >
                        <option value="low">Prioridade: Baixa</option>
                        <option value="medium">Prioridade: Média</option>
                        <option value="high">Prioridade: Alta</option>
                        <option value="urgent">Prioridade: Urgente</option>
                      </select>

                      <select
                        value={selectedTicket.status}
                        onChange={(e) => void handleStatusChange(e.target.value)}
                        aria-label="Status do chamado"
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                      >
                        <option value="open">Aberto</option>
                        <option value="in_progress">Em atendimento</option>
                        <option value="waiting_client">Aguardando cliente</option>
                        <option value="resolved">Resolvido</option>
                        <option value="closed">Encerrado</option>
                      </select>
                    </>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-3 max-h-72 overflow-y-auto pr-1">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-lg border p-3 text-xs ${
                      msg.is_internal_note
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 mb-1">
                      <span className="font-mono">
                        {msg.sender_email || msg.sender_type}
                        {msg.is_internal_note ? ' · Nota Interna' : ''}
                      </span>
                      <span className="font-mono tabular-nums">{formatDateTimeBr(msg.created_at)}</span>
                    </div>
                    <p className="text-slate-800 whitespace-pre-wrap">{msg.message}</p>
                  </div>
                ))}
              </div>

              {canReply && (
                <form onSubmit={handleSendReply} className="pt-3 border-t border-slate-200 space-y-2.5">
                  <textarea
                    rows={2}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Escreva uma resposta ou nota interna..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isInternalNote}
                        onChange={(e) => setIsInternalNote(e.target.checked)}
                      />
                      <span>Registrar como nota interna (invisível ao cliente)</span>
                    </label>
                    <button
                      type="submit"
                      disabled={sendingReply || !replyText.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#F5B731] px-3.5 py-1.5 text-xs font-semibold text-slate-900 hover:bg-[#e5a824] disabled:opacity-50 cursor-pointer"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>{sendingReply ? 'Enviando...' : 'Registrar'}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {createOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-slate-900">Abrir Novo Chamado</h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateTicket} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Estabelecimento vinculado (opcional)
                </label>
                <select
                  value={newTicket.tenantId}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const found = tenants.find((t) => t.id === selectedId);
                    setNewTicket((t) => ({
                      ...t,
                      tenantId: selectedId,
                      requesterEmail:
                        t.requesterEmail || !found?.owner_email ? t.requesterEmail : found.owner_email,
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-900"
                >
                  <option value="">Sem estabelecimento específico</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.slug})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  E-mail do Cliente / Solicitante
                </label>
                <input
                  type="email"
                  required
                  value={newTicket.requesterEmail}
                  onChange={(e) => setNewTicket((t) => ({ ...t, requesterEmail: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Assunto</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={newTicket.subject}
                  onChange={(e) => setNewTicket((t) => ({ ...t, subject: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Categoria</label>
                  <select
                    value={newTicket.category}
                    onChange={(e) => setNewTicket((t) => ({ ...t, category: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-900"
                  >
                    <option value="technical">Técnico</option>
                    <option value="billing">Cobrança</option>
                    <option value="onboarding">Onboarding</option>
                    <option value="digital_menu">Cardápio Digital</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Prioridade</label>
                  <select
                    value={newTicket.priority}
                    onChange={(e) => setNewTicket((t) => ({ ...t, priority: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-slate-900"
                  >
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Descrição Inicial</label>
                <textarea
                  rows={3}
                  required
                  value={newTicket.message}
                  onChange={(e) => setNewTicket((t) => ({ ...t, message: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-[#F5B731] px-4 py-1.5 font-semibold text-slate-900 hover:bg-[#e5a824] disabled:opacity-50 cursor-pointer"
                >
                  {creating ? 'Criando...' : 'Criar Chamado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
