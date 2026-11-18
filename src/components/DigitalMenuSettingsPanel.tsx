import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  Save,
  Store,
} from 'lucide-react';
import type {
  DigitalMenuSettings,
  DigitalMenuSettingsInput,
  DeliveryZone,
  DeliveryZoneInput,
} from '../types/finance';
import { formatCurrencyBRL } from '../utils/finance';
import { sanitizeMenuSlug } from '../utils/onlineOrders';

interface DigitalMenuSettingsPanelProps {
  settings: DigitalMenuSettings;
  deliveryZones: DeliveryZone[];
  onSaveDeliveryZone: (input: DeliveryZoneInput, id?: string) => Promise<void>;
  activeProductsCount: number;
  activeCombosCount: number;
  onSave: (input: DigitalMenuSettingsInput) => Promise<void>;
  onPreviewPublicMenu?: (slug: string) => void;
}

export function DigitalMenuSettingsPanel({
  settings,
  deliveryZones,
  onSaveDeliveryZone,
  activeProductsCount,
  activeCombosCount,
  onSave,
  onPreviewPublicMenu,
}: DigitalMenuSettingsPanelProps) {
  const [isActive, setIsActive] = useState(settings.isActive);
  const [isOpen, setIsOpen] = useState(settings.isOpen);
  const [storeName, setStoreName] = useState(settings.storeName);
  const [slug, setSlug] = useState(settings.slug);
  const [description, setDescription] = useState(settings.description);
  const [phoneWhatsapp, setPhoneWhatsapp] = useState(settings.phoneWhatsapp);
  const [address, setAddress] = useState(settings.address);
  const [openingHours, setOpeningHours] = useState(settings.openingHours);
  const [deliveryFee, setDeliveryFee] = useState(String(settings.deliveryFee));
  const [minimumOrderAmount, setMinimumOrderAmount] = useState(
    String(settings.minimumOrderAmount),
  );
  const [acceptsDelivery, setAcceptsDelivery] = useState(settings.acceptsDelivery);
  const [acceptsPickup, setAcceptsPickup] = useState(settings.acceptsPickup);
  const [zoneName, setZoneName] = useState('');
  const [zoneFee, setZoneFee] = useState('');
  const [zoneSaving, setZoneSaving] = useState(false);
  const [zoneEditingId, setZoneEditingId] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsActive(settings.isActive);
    setIsOpen(settings.isOpen);
    setStoreName(settings.storeName);
    setSlug(settings.slug);
    setDescription(settings.description);
    setPhoneWhatsapp(settings.phoneWhatsapp);
    setAddress(settings.address);
    setOpeningHours(settings.openingHours);
    setDeliveryFee(String(settings.deliveryFee));
    setMinimumOrderAmount(String(settings.minimumOrderAmount));
    setAcceptsDelivery(settings.acceptsDelivery);
    setAcceptsPickup(settings.acceptsPickup);
  }, [settings]);

  const normalizedSlug = useMemo(
    () => sanitizeMenuSlug(slug || storeName || settings.slug, settings.slug),
    [slug, storeName, settings.slug],
  );

  const shareUrls = useMemo(() => {
    const origin =
      typeof window !== 'undefined' && window.location.origin
        ? window.location.origin
        : '';
    const demoSuffix =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('demo') === '1'
        ? '?demo=1'
        : '';
    return {
      slugPath: `/cardapio/${normalizedSlug}${demoSuffix}`,
      slugFull: `${origin}/cardapio/${normalizedSlug}${demoSuffix}`,
      defaultFull: `${origin}/cardapio${demoSuffix}`,
    };
  }, [normalizedSlug]);

  async function handleCopyLink(text: string) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement('input');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    } catch {
      setError('Não foi possível copiar o link automaticamente.');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSaving) return;

    const cleanName = storeName.trim();
    const cleanSlug = sanitizeMenuSlug(slug || cleanName, settings.slug);
    const parsedDeliveryFee = Number(String(deliveryFee).replace(',', '.'));
    const parsedMinimumOrder = Number(
      String(minimumOrderAmount).replace(',', '.'),
    );

    if (!cleanName) {
      setError('Informe o nome público da loja para o cardápio.');
      return;
    }
    if (!cleanSlug) {
      setError('Informe um slug válido (letras e números separados por hífen).');
      return;
    }
    if (!Number.isFinite(parsedDeliveryFee) || parsedDeliveryFee < 0) {
      setError('Informe uma taxa de entrega válida (0 ou maior).');
      return;
    }
    if (!Number.isFinite(parsedMinimumOrder) || parsedMinimumOrder < 0) {
      setError('Informe um valor de pedido mínimo válido (0 ou maior).');
      return;
    }
    if (!acceptsDelivery && !acceptsPickup) {
      setError('Selecione pelo menos uma modalidade: Entrega ou Retirada.');
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await onSave({
        isActive,
        isOpen,
        storeName: cleanName,
        slug: cleanSlug,
        description: description.trim(),
        phoneWhatsapp: phoneWhatsapp.trim(),
        address: address.trim(),
        openingHours: openingHours.trim(),
        deliveryFee: Math.round(parsedDeliveryFee * 100) / 100,
        minimumOrderAmount: Math.round(parsedMinimumOrder * 100) / 100,
        acceptsDelivery,
        acceptsPickup,
      });
      setSlug(cleanSlug);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 3500);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao salvar configurações do cardápio digital.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="max-w-3xl bg-[#12151C] border border-[#232834] rounded-2xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-[#232834] pb-4">
        <div>
          <h2 className="text-lg font-bold text-[#F3F4F6] flex items-center gap-2">
            <Globe className="w-5 h-5 text-[#F5B731]" />
            Cardápio Digital e Pedidos Online
          </h2>
          <p className="text-xs text-[#9CA3AF] mt-1">
            Sincronizado automaticamente com seus produtos e combos ativos ({activeCombosCount}{' '}
            combo{activeCombosCount === 1 ? '' : 's'} · {activeProductsCount} produto
            {activeProductsCount === 1 ? '' : 's'}).
          </p>
        </div>

        <span
          className={`text-xs font-semibold shrink-0 ${
            !isActive
              ? 'text-[#9CA3AF]'
              : isOpen
                ? 'text-[#22C55E]'
                : 'text-[#F5B731]'
          }`}
        >
          {!isActive
            ? 'Cardápio desativado'
            : isOpen
              ? 'Loja aberta para pedidos'
              : 'Loja fechada (somente visualização)'}
        </span>
      </div>

      {/* Shareable Public Link Card */}
      <div className="bg-[#0B0D11] border border-[#232834] rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-[#F3F4F6]">
              Link público do cardápio
            </p>
            <p className="text-[11px] text-[#9CA3AF]">
              Compartilhe com seus clientes no WhatsApp, Instagram ou balcão.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void handleCopyLink(shareUrls.slugFull)}
              className="min-h-[40px] px-3.5 rounded-lg border border-[#232834] hover:border-[#F5B731]/50 bg-[#12151C] text-xs font-semibold text-[#F3F4F6] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#22C55E]" />
                  Link copiado
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#F5B731]" />
                  Copiar link
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (onPreviewPublicMenu) {
                  onPreviewPublicMenu(normalizedSlug);
                } else {
                  window.location.assign(shareUrls.slugPath);
                }
              }}
              className="min-h-[40px] px-3.5 rounded-lg bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir cardápio
            </button>
          </div>
        </div>

        <div className="px-3 py-2 rounded-lg bg-[#12151C] border border-[#232834] text-xs font-mono text-[#D1D5DB] truncate">
          {shareUrls.slugFull}
        </div>
        <p className="text-[11px] text-[#9CA3AF] font-mono truncate">
          Link direto alternativo: {shareUrls.defaultFull}
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {error && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs text-[#FCA5A5]"
          >
            {error}
          </div>
        )}

        {savedToast && (
          <div
            role="status"
            className="p-3 rounded-xl bg-[#22C55E]/10 border border-[#22C55E]/30 text-xs text-[#86EFAC] flex items-center gap-2"
          >
            <Check className="w-4 h-4 shrink-0" />
            <span>Configurações do cardápio digital salvas com sucesso.</span>
          </div>
        )}

        {/* Quick Toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-start gap-3 p-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#F5B731] cursor-pointer"
            />
            <div>
              <span className="block text-sm font-semibold text-[#F3F4F6]">
                Ativar cardápio digital
              </span>
              <span className="block text-xs text-[#9CA3AF] mt-0.5">
                Quando desativado, o link público exibe cardápio indisponível.
              </span>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] cursor-pointer">
            <input
              type="checkbox"
              checked={isOpen}
              onChange={(e) => setIsOpen(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#22C55E] cursor-pointer"
            />
            <div>
              <span className="block text-sm font-semibold text-[#F3F4F6]">
                Loja aberta agora
              </span>
              <span className="block text-xs text-[#9CA3AF] mt-0.5">
                Se fechado, o cliente navega no cardápio sem finalizar pedido.
              </span>
            </div>
          </label>
        </div>

        {/* Store Identity & Slug */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="dm-store-name"
              className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
            >
              Nome público da loja
            </label>
            <input
              id="dm-store-name"
              type="text"
              maxLength={80}
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              required
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
            />
          </div>

          <div>
            <label
              htmlFor="dm-slug"
              className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
            >
              Slug / endereço do cardápio
            </label>
            <input
              id="dm-slug"
              type="text"
              maxLength={60}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="mgw-lanches"
              required
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6] font-mono"
            />
            <p className="text-[11px] text-[#9CA3AF] mt-1 font-mono">
              URL final: /cardapio/{normalizedSlug}
            </p>
          </div>
        </div>

        <div>
          <label
            htmlFor="dm-description"
            className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
          >
            Descrição curta da lanchonete
          </label>
          <textarea
            id="dm-description"
            rows={2}
            maxLength={300}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Lanches artesanais, combos especiais e entrega rápida."
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="dm-whatsapp"
              className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
            >
              WhatsApp da loja
            </label>
            <input
              id="dm-whatsapp"
              type="tel"
              maxLength={32}
              value={phoneWhatsapp}
              onChange={(e) => setPhoneWhatsapp(e.target.value)}
              placeholder="(11) 99999-9999"
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6] font-mono"
            />
          </div>

          <div>
            <label
              htmlFor="dm-hours"
              className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
            >
              Horário de funcionamento
            </label>
            <input
              id="dm-hours"
              type="text"
              maxLength={160}
              value={openingHours}
              onChange={(e) => setOpeningHours(e.target.value)}
              placeholder="Terça a Domingo · 18h às 23h30"
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="dm-address"
            className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
          >
            Endereço para retirada / referência
          </label>
          <input
            id="dm-address"
            type="text"
            maxLength={240}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Rua Principal, 123 - Centro"
            className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6]"
          />
        </div>

        {/* Fees & Rules */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="dm-delivery-fee"
              className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
            >
              Taxa geral antiga (substituída por bairro)
            </label>
            <input
              id="dm-delivery-fee"
              type="number"
              min="0"
              step="0.50"
              inputMode="decimal"
              value={deliveryFee}
              disabled
              onChange={(e) => setDeliveryFee(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6] font-mono tabular-nums"
            />
            <p className="text-[11px] text-[#9CA3AF] mt-1 font-mono tabular-nums">
              {Number(deliveryFee || 0) <= 0
                ? 'As taxas agora são definidas por bairro abaixo.'
                : 'Valor legado; não é aplicado aos novos pedidos.'}
            </p>
          </div>

          <div>
            <label
              htmlFor="dm-min-order"
              className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
            >
              Pedido mínimo (R$)
            </label>
            <input
              id="dm-min-order"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={minimumOrderAmount}
              onChange={(e) => setMinimumOrderAmount(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] focus:border-[#F5B731] focus:outline-none text-sm text-[#F3F4F6] font-mono tabular-nums"
            />
            <p className="text-[11px] text-[#9CA3AF] mt-1">
              0 para não exigir valor mínimo em itens.
            </p>
          </div>
        </div>

        {/* Delivery zones */}
        <section className="rounded-xl border border-[#232834] bg-[#0B0D11] p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-[#F3F4F6]">Taxas por bairro</h3>
            <p className="text-xs text-[#9CA3AF] mt-1">Cadastre cada bairro e sua taxa. O valor será validado no servidor no momento do pedido.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-2">
            <input value={zoneName} onChange={(e) => setZoneName(e.target.value)} maxLength={100} placeholder="Nome do bairro" className="min-h-[42px] px-3 rounded-lg bg-[#12151C] border border-[#232834] text-sm text-[#F3F4F6]" />
            <input value={zoneFee} onChange={(e) => setZoneFee(e.target.value)} type="number" min="0" max="1000" step="0.5" inputMode="decimal" placeholder="Taxa R$" className="min-h-[42px] px-3 rounded-lg bg-[#12151C] border border-[#232834] text-sm text-[#F3F4F6]" />
            <button type="button" disabled={zoneSaving || !zoneName.trim() || zoneFee === ''} onClick={async () => {
              const fee = Number(zoneFee.replace(',', '.'));
              if (!Number.isFinite(fee) || fee < 0 || fee > 1000) { setError('Informe uma taxa válida entre R$ 0,00 e R$ 1.000,00.'); return; }
              setZoneSaving(true); setError(null);
              try { await onSaveDeliveryZone({ name: zoneName.trim(), deliveryFee: fee, active: zoneEditingId ? deliveryZones.find((zone) => zone.id === zoneEditingId)?.active ?? true : true, sortOrder: zoneEditingId ? deliveryZones.find((zone) => zone.id === zoneEditingId)?.sortOrder ?? 0 : deliveryZones.length }, zoneEditingId ?? undefined); setZoneName(''); setZoneFee(''); setZoneEditingId(null); }
              catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar o bairro.'); }
              finally { setZoneSaving(false); }
            }} className="min-h-[42px] px-4 rounded-lg bg-[#F5B731] text-[#0B0D11] text-xs font-bold disabled:opacity-50">{zoneSaving ? 'Salvando...' : zoneEditingId ? 'Salvar edição' : 'Adicionar'}</button>
            {zoneEditingId && <button type="button" onClick={() => { setZoneEditingId(null); setZoneName(''); setZoneFee(''); }} className="min-h-[42px] px-3 rounded-lg border border-[#232834] text-xs text-[#D1D5DB]">Cancelar</button>}
          </div>
          {deliveryZones.length === 0 ? <p className="text-xs text-[#9CA3AF]">Nenhum bairro cadastrado. Cadastre os bairros atendidos para liberar pedidos por entrega.</p> : (
            <div className="divide-y divide-[#232834]">
              {deliveryZones.map((zone) => <div key={zone.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0"><p className="text-sm text-[#F3F4F6] font-medium truncate">{zone.name}</p><p className="text-xs text-[#9CA3AF]">{formatCurrencyBRL(zone.deliveryFee)}</p></div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => { setZoneEditingId(zone.id); setZoneName(zone.name); setZoneFee(String(zone.deliveryFee)); }} className="text-xs font-semibold px-3 py-2 rounded-lg border border-[#232834] text-[#D1D5DB]">Editar</button>
                  <button type="button" disabled={zoneSaving} onClick={async () => { setZoneSaving(true); try { await onSaveDeliveryZone({ name: zone.name, deliveryFee: zone.deliveryFee, active: !zone.active, sortOrder: zone.sortOrder }, zone.id); } catch (err) { setError(err instanceof Error ? err.message : 'Falha ao atualizar bairro.'); } finally { setZoneSaving(false); } }} className={zone.active ? 'text-xs font-semibold px-3 py-2 rounded-lg border border-[#22C55E]/40 text-[#86EFAC]' : 'text-xs font-semibold px-3 py-2 rounded-lg border border-[#6B7280]/40 text-[#9CA3AF]'}>{zone.active ? 'Ativo' : 'Inativo'}</button>
                </div>
              </div>)}
            </div>
          )}
        </section>

        {/* Fulfillment Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <label className="flex items-center gap-3 p-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] cursor-pointer">
            <input
              type="checkbox"
              checked={acceptsDelivery}
              onChange={(e) => setAcceptsDelivery(e.target.checked)}
              className="w-4 h-4 accent-[#F5B731] cursor-pointer"
            />
            <Store className="w-4 h-4 text-[#F5B731] shrink-0" />
            <span className="text-sm font-medium text-[#F3F4F6]">
              Aceitar pedidos para Entrega
            </span>
          </label>

          <label className="flex items-center gap-3 p-3.5 rounded-xl bg-[#0B0D11] border border-[#232834] cursor-pointer">
            <input
              type="checkbox"
              checked={acceptsPickup}
              onChange={(e) => setAcceptsPickup(e.target.checked)}
              className="w-4 h-4 accent-[#F5B731] cursor-pointer"
            />
            <Store className="w-4 h-4 text-[#22C55E] shrink-0" />
            <span className="text-sm font-medium text-[#F3F4F6]">
              Aceitar Retirada no balcão
            </span>
          </label>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto min-h-[46px] px-6 rounded-xl bg-[#F5B731] hover:bg-[#FCD34D] text-[#0B0D11] text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Salvando...' : 'Salvar Cardápio Digital'}
          </button>
        </div>
      </form>
    </section>
  );
}
