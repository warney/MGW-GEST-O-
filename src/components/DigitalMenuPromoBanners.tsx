import { useEffect, useMemo, useState } from 'react';
import { ImagePlus, Loader2, Save, Trash2, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { getSupabaseClient } from '../lib/supabase';
import { deleteTenantMenuImage, uploadTenantMenuImage } from '../services/storageService';
import type { PublicCatalogCombo, PublicCatalogProduct } from '../types/finance';

type PromoAction = 'none' | 'product' | 'combo';
interface PromoBanner {
  id: string;
  tenant_id: string;
  sort_order: number;
  image_url: string;
  image_path: string;
  is_active: boolean;
  click_action: PromoAction;
  target_id: string | null;
  zoom: number;
  position_x: number;
  position_y: number;
  display_interval_seconds: number;
}
interface PublicPromoBanner {
  id: string;
  imageUrl: string;
  zoom: number;
  positionX: number;
  positionY: number;
  clickAction: PromoAction;
  targetId: string | null;
  sortOrder: number;
  displayIntervalSeconds: number;
}
const INTERVALS = [5, 7, 10, 15];

export function PublicMenuPromoCarousel({
  slug,
  onSelectProduct,
  onSelectCombo,
}: {
  slug: string;
  onSelectProduct: (product: PublicCatalogProduct) => void;
  onSelectCombo: (combo: PublicCatalogCombo) => void;
}) {
  const [banners, setBanners] = useState<PublicPromoBanner[]>([]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data, error } = await getSupabaseClient().rpc('get_public_menu_promo_banners', { p_slug: slug });
      if (!alive || error || !Array.isArray(data)) return;
      const rows = data.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
      setBanners(rows.map((row) => ({
        id: String(row.id || ''),
        imageUrl: String(row.imageUrl || ''),
        zoom: Math.min(2.5, Math.max(1, Number(row.zoom) || 1)),
        positionX: Math.min(100, Math.max(0, Number(row.positionX) || 50)),
        positionY: Math.min(100, Math.max(0, Number(row.positionY) || 50)),
        clickAction: row.clickAction === 'product' || row.clickAction === 'combo' ? row.clickAction : 'none',
        targetId: typeof row.targetId === 'string' ? row.targetId : null,
        sortOrder: Number(row.sortOrder) || 0,
        displayIntervalSeconds: INTERVALS.includes(Number(row.displayIntervalSeconds)) ? Number(row.displayIntervalSeconds) : 5,
      })).filter((item) => item.imageUrl).sort((a, b) => a.sortOrder - b.sortOrder));
    };
    void load();
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    if (banners.length < 2) return;
    const interval = banners[active]?.displayIntervalSeconds ?? 5;
    const timer = window.setTimeout(() => setActive((current) => (current + 1) % banners.length), interval * 1000);
    return () => window.clearTimeout(timer);
  }, [banners, active]);

  if (!banners.length) return null;
  const current = banners[active];
  const activate = () => {
    if (!current.targetId) return;
    if (current.clickAction === 'product') {
      // Product/combo lookup is performed against the already loaded public catalog by the parent.
      window.dispatchEvent(new CustomEvent('mgw-promo-target', { detail: { kind: 'product', id: current.targetId } }));
    } else if (current.clickAction === 'combo') {
      window.dispatchEvent(new CustomEvent('mgw-promo-target', { detail: { kind: 'combo', id: current.targetId } }));
    }
  };
  return (
    <section aria-label="Ofertas e promoções" data-testid="menu-promo-carousel" className="space-y-2.5">
      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-xs sm:text-sm font-bold tracking-wide text-white">Ofertas especiais</h2>
        {banners.length > 1 && <span className="text-[10px] font-mono text-[#9CA3AF]">{String(active + 1).padStart(2, '0')} / {String(banners.length).padStart(2, '0')}</span>}
      </div>
      <div className="relative overflow-hidden rounded-xl border border-[#262B38] bg-[#14171F] aspect-[16/5] min-h-[86px] max-h-[156px]">
        <button type="button" onClick={activate} disabled={current.clickAction === 'none' || !current.targetId} aria-label={current.clickAction === 'none' ? 'Banner informativo' : 'Abrir oferta'} className={`absolute inset-0 w-full h-full ${current.clickAction !== 'none' && current.targetId ? 'cursor-pointer' : 'cursor-default'}`}>
          <img src={current.imageUrl} alt="Banner promocional" loading="lazy" className="w-full h-full object-cover" style={{ transform: `scale(${current.zoom})`, objectPosition: `${current.positionX}% ${current.positionY}%` }} />
        </button>
        {banners.length > 1 && <>
          <button type="button" aria-label="Banner anterior" onClick={() => setActive((active - 1 + banners.length) % banners.length)} className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
          <button type="button" aria-label="Próximo banner" onClick={() => setActive((active + 1) % banners.length)} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center"><ChevronRight className="w-4 h-4" /></button>
        </>}
      </div>
      {banners.length > 1 && <div className="flex items-center justify-center gap-1.5" role="tablist" aria-label="Selecionar promoção">
        {banners.map((banner, index) => <button key={banner.id} type="button" role="tab" aria-selected={index === active} aria-label={`Mostrar banner ${index + 1}`} onClick={() => setActive(index)} className={`h-1.5 rounded-full transition-all ${index === active ? 'w-5 bg-[#F5B900]' : 'w-1.5 bg-[#596171]'}`} />)}
      </div>}
    </section>
  );
}

export function DigitalMenuPromoManager({
  workspaceId,
  products,
  combos,
}: {
  workspaceId: string;
  products: PublicCatalogProduct[];
  combos: PublicCatalogCombo[];
}) {
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [interval, setInterval] = useState(5);
  const [message, setMessage] = useState('');
  const supabase = useMemo(() => getSupabaseClient(), []);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('digital_menu_promo_banners').select('*').eq('tenant_id', workspaceId).order('sort_order');
    if (error) setMessage(error.message);
    else {
      const rows = (data || []) as PromoBanner[];
      setBanners(rows);
      if (rows[0]?.display_interval_seconds) setInterval(rows[0].display_interval_seconds);
    }
    setLoading(false);
  };
  useEffect(() => { void refresh(); }, [workspaceId]);

  const save = async (banner: PromoBanner) => {
    const { error } = await supabase.from('digital_menu_promo_banners').upsert({
      id: banner.id, tenant_id: workspaceId, sort_order: banner.sort_order,
      image_url: banner.image_url, image_path: banner.image_path, is_active: banner.is_active,
      click_action: banner.click_action, target_id: banner.click_action === 'none' ? null : banner.target_id,
      zoom: banner.zoom, position_x: banner.position_x, position_y: banner.position_y,
      display_interval_seconds: interval, updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) throw error;
  };

  const upload = async (slot: number, file?: File) => {
    if (!file) return;
    setBusy(slot); setMessage('');
    try {
      const uploaded = await uploadTenantMenuImage({ workspaceId, folder: 'branding', entityHint: 'banner', entityId: `promo_${slot}`, file, preset: 'banner' });
      const existing = banners.find((item) => item.sort_order === slot);
      const next: PromoBanner = {
        id: existing?.id || crypto.randomUUID(), tenant_id: workspaceId, sort_order: slot,
        image_url: uploaded.url, image_path: uploaded.path, is_active: true,
        click_action: existing?.click_action || 'none', target_id: existing?.target_id || null,
        zoom: existing?.zoom || 1, position_x: existing?.position_x ?? 50, position_y: existing?.position_y ?? 50,
        display_interval_seconds: interval,
      };
      await save(next);
      if (existing?.image_path && existing.image_path !== uploaded.path) void deleteTenantMenuImage(workspaceId, existing.image_path);
      await refresh();
      setMessage('Banner salvo com sucesso.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível salvar o banner.'); }
    finally { setBusy(null); }
  };

  const patch = async (banner: PromoBanner, changes: Partial<PromoBanner>) => {
    setBusy(banner.sort_order); setMessage('');
    try { await save({ ...banner, ...changes }); await refresh(); setMessage('Configuração salva.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setBusy(null); }
  };

  const remove = async (banner: PromoBanner) => {
    setBusy(banner.sort_order); setMessage('');
    try {
      const { error } = await supabase.from('digital_menu_promo_banners').delete().eq('id', banner.id).eq('tenant_id', workspaceId);
      if (error) throw error;
      if (banner.image_path) void deleteTenantMenuImage(workspaceId, banner.image_path);
      await refresh(); setMessage('Banner removido.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível remover.'); }
    finally { setBusy(null); }
  };

  const targets = (kind: PromoAction) => kind === 'product' ? products.map((p) => ({ id: p.id, name: p.name })) : combos.map((c) => ({ id: c.id, name: c.name }));
  return <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 sm:p-5 space-y-4">
    <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-[#111827]">Banners promocionais</h3><p className="text-xs text-[#6B7280] mt-1">Até 3 imagens horizontais entre a busca e as categorias do cardápio público.</p></div><span className="text-[10px] font-semibold rounded-full bg-[#FEF3C7] text-[#92400E] px-2.5 py-1">Até 3</span></div>
    <div className="max-w-xs space-y-1"><label className="text-xs font-semibold text-[#374151]">Troca automática</label><select value={interval} onChange={async (e) => { const value = Number(e.target.value); setInterval(value); for (const banner of banners) await patch(banner, { display_interval_seconds: value }); }} className="w-full min-h-[40px] rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#111827]">{INTERVALS.map((value) => <option key={value} value={value}>{value} segundos</option>)}</select></div>
    {loading ? <div className="py-6 text-center text-xs text-[#6B7280]"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando banners...</div> : <div className="grid grid-cols-1 gap-4">
      {[1,2,3].map((slot) => {
        const banner = banners.find((item) => item.sort_order === slot);
        return <article key={slot} className="rounded-xl border border-[#E5E7EB] p-3 space-y-3">
          <div className="flex items-center justify-between"><strong className="text-xs text-[#111827]">Banner {slot}</strong>{banner && <button type="button" onClick={() => void remove(banner)} disabled={busy !== null} className="text-xs text-red-600 inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5"/>Remover</button>}</div>
          <div className="relative aspect-[16/5] min-h-[86px] max-h-[150px] overflow-hidden rounded-lg bg-[#F3F4F6] border border-[#E5E7EB]">
            {banner?.image_url ? <img src={banner.image_url} alt={`Prévia do banner ${slot}`} className="w-full h-full object-cover" style={{ transform: `scale(${banner.zoom})`, objectPosition: `${banner.position_x}% ${banner.position_y}%` }} /> : <div className="w-full h-full flex items-center justify-center text-xs text-[#9CA3AF]"><ImagePlus className="w-5 h-5 mr-2"/>Imagem horizontal 16:5</div>}
          </div>
          <label className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-[#E5E7EB] px-3 text-xs font-semibold text-[#374151] cursor-pointer"><ImagePlus className="w-4 h-4"/>{busy === slot ? 'Enviando...' : banner ? 'Trocar imagem' : 'Enviar imagem'}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy !== null} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; void upload(slot, file); }}/></label>
          {banner && <>
            <div className="grid grid-cols-2 gap-3"><label className="text-[11px] text-[#4B5563]">Zoom · {banner.zoom.toFixed(2)}x<input type="range" min="1" max="2.5" step="0.05" value={banner.zoom} onChange={(e) => setBanners((prev) => prev.map((x) => x.id === banner.id ? { ...x, zoom: Number(e.target.value) } : x))} onMouseUp={() => void patch(banner, { zoom: banner.zoom })} onTouchEnd={() => void patch(banner, { zoom: banner.zoom })} className="block w-full accent-[#EAB308]"/></label>
              <label className="text-[11px] text-[#4B5563]">Posição horizontal<input type="range" min="0" max="100" value={banner.position_x} onChange={(e) => setBanners((prev) => prev.map((x) => x.id === banner.id ? { ...x, position_x: Number(e.target.value) } : x))} onMouseUp={() => void patch(banner, { position_x: banner.position_x })} onTouchEnd={() => void patch(banner, { position_x: banner.position_x })} className="block w-full accent-[#EAB308]"/></label>
            </div>
            <label className="block text-[11px] text-[#4B5563]">Posição vertical<input type="range" min="0" max="100" value={banner.position_y} onChange={(e) => setBanners((prev) => prev.map((x) => x.id === banner.id ? { ...x, position_y: Number(e.target.value) } : x))} onMouseUp={() => void patch(banner, { position_y: banner.position_y })} onTouchEnd={() => void patch(banner, { position_y: banner.position_y })} className="block w-full accent-[#EAB308]"/></label>
            <label className="flex items-center gap-2 text-xs text-[#374151]"><input type="checkbox" checked={banner.is_active} onChange={(e) => void patch(banner, { is_active: e.target.checked })} className="accent-[#EAB308]"/>Exibir no cardápio público</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><select value={banner.click_action} onChange={(e) => { const click_action = e.target.value as PromoAction; void patch(banner, { click_action, target_id: click_action === 'none' ? null : '' }); }} className="min-h-[40px] rounded-lg border border-[#E5E7EB] px-2 text-xs text-[#111827]"><option value="none">Sem ação ao clicar</option><option value="product">Abrir produto</option><option value="combo">Abrir combo</option></select>
              {banner.click_action !== 'none' && <select value={banner.target_id || ''} onChange={(e) => void patch(banner, { target_id: e.target.value })} className="min-h-[40px] rounded-lg border border-[#E5E7EB] px-2 text-xs text-[#111827]"><option value="">Selecione o destino</option>{targets(banner.click_action).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
            </div>
          </>}
        </article>;
      })}
    </div>}
    {message && <p role="status" className="text-xs text-[#4B5563]">{message}</p>}
    <p className="text-[10px] text-[#6B7280]">Formato recomendado: 16:5. Imagens JPG, PNG ou WebP de até 8 MB antes da otimização.</p>
  </section>;
}
