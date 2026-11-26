import { useEffect, useState } from 'react';
import { MessageCircle, ShieldCheck, Star } from 'lucide-react';
import { fetchPublicEstablishmentReviews, type PublicEstablishmentReviewsPayload } from '../services/dataService';

interface PublicMenuReviewsProps {
  slug: string;
}

function Stars({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'lg' }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star key={value} className={`${size === 'lg' ? 'w-5 h-5' : 'w-3.5 h-3.5'} ${value <= Math.round(rating) ? 'fill-[#F5B900] text-[#F5B900]' : 'text-[#4B5563]'}`} />
      ))}
    </span>
  );
}

function formatReviewDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export function PublicMenuReviews({ slug }: PublicMenuReviewsProps) {
  const [data, setData] = useState<PublicEstablishmentReviewsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchPublicEstablishmentReviews(slug)
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Não foi possível carregar as avaliações.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  if (loading) {
    return <section aria-label="Avaliações dos clientes" className="rounded-2xl border border-[#262B38] bg-[#14171F] p-5"><p className="text-sm text-[#9CA3AF]">Carregando avaliações...</p></section>;
  }
  if (error) {
    return <section aria-label="Avaliações dos clientes" className="rounded-2xl border border-[#262B38] bg-[#14171F] p-5"><p className="text-sm text-[#9CA3AF]">As avaliações estarão disponíveis em instantes.</p></section>;
  }
  if (!data?.found || data.totalReviews === 0) return null;

  return (
    <section id="avaliacoes" aria-label="Avaliações dos clientes" className="rounded-2xl border border-[#262B38] bg-[#14171F] p-4 sm:p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-[#F5B900]">Opinião de quem pediu</p>
          <h2 className="mt-1 text-lg sm:text-xl font-extrabold text-white">Avaliações dos clientes</h2>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-[#0B0D11] border border-[#343B4B] px-3 py-2">
          <span className="text-2xl font-black text-white tabular-nums">{data.averageRating.toFixed(1).replace('.', ',')}</span>
          <div className="space-y-0.5">
            <Stars rating={data.averageRating} />
            <p className="text-[10px] text-[#9CA3AF]">{data.totalReviews} {data.totalReviews === 1 ? 'avaliação' : 'avaliações'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4">
        <div className="space-y-2" aria-label="Distribuição das notas">
          {[5, 4, 3, 2, 1].map((rating) => {
            const count = data.distribution[String(rating) as keyof typeof data.distribution] || 0;
            const percent = data.totalReviews ? (count / data.totalReviews) * 100 : 0;
            return (
              <div key={rating} className="flex items-center gap-2 text-xs">
                <span className="w-3 text-[#D1D5DB]">{rating}</span>
                <Star className="w-3 h-3 fill-[#F5B900] text-[#F5B900]" />
                <div className="h-2 flex-1 rounded-full bg-[#2A3040] overflow-hidden"><div className="h-full rounded-full bg-[#F5B900]" style={{ width: `${percent}%` }} /></div>
                <span className="w-6 text-right text-[#9CA3AF] tabular-nums">{count}</span>
              </div>
            );
          })}
        </div>
        <div className="space-y-3">
          {data.reviews.slice(0, 8).map((review) => (
            <article key={review.id} className="rounded-xl border border-[#2A3040] bg-[#0D1017] p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2"><Stars rating={review.rating} /><span className="text-[11px] text-[#9CA3AF]">{formatReviewDate(review.submittedAt)}</span></div>
                {review.verified && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300"><ShieldCheck className="w-3.5 h-3.5" /> Pedido verificado</span>}
              </div>
              {review.comment && <p className="text-sm leading-relaxed text-[#E5E7EB] whitespace-pre-wrap break-words">{review.comment}</p>}
              {review.reply && <div className="rounded-lg border-l-2 border-[#F5B900] bg-[#191D27] p-3"><p className="flex items-center gap-1.5 text-[11px] font-bold text-[#F5B900]"><MessageCircle className="w-3.5 h-3.5" /> Resposta do estabelecimento</p><p className="mt-1.5 text-xs leading-relaxed text-[#D1D5DB] whitespace-pre-wrap break-words">{review.reply}</p></div>}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
