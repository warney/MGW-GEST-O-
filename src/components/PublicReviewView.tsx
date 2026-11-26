import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, LoaderCircle, Star } from 'lucide-react';
import {
  fetchPublicReviewInvitation,
  submitPublicEstablishmentReview,
} from '../services/dataService';

interface PublicReviewViewProps {
  token: string;
  onBackToMenu?: () => void;
}

export function PublicReviewView({ token, onBackToMenu }: PublicReviewViewProps) {
  const [invitation, setInvitation] = useState<{ valid: boolean; storeName?: string; orderCode?: string } | null>(null);
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void fetchPublicReviewInvitation(token)
      .then((result) => { if (active) setInvitation(result); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Não foi possível validar o convite.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rating < 1 || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await submitPublicEstablishmentReview({ token, rating, comment });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar sua avaliação.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0A0C10] text-[#F3F4F6] px-4 py-8 flex items-center justify-center">
      <section className="w-full max-w-md rounded-3xl border border-[#282D3A] bg-[#14171F] p-5 sm:p-7 shadow-2xl">
        <div className="text-center space-y-2 mb-7">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-[#F5B900]/15 border border-[#F5B900]/30 flex items-center justify-center">
            <Star className="w-6 h-6 text-[#F5B900] fill-[#F5B900]" />
          </div>
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#F5B900]">MGW Cardápio Digital</p>
          <h1 className="text-2xl font-extrabold text-white">Como foi sua experiência?</h1>
          {invitation?.valid && <p className="text-sm text-[#9CA3AF]">{invitation.storeName} · Pedido {invitation.orderCode}</p>}
        </div>

        {loading ? (
          <div className="py-10 text-center space-y-3">
            <LoaderCircle className="w-7 h-7 animate-spin text-[#F5B900] mx-auto" />
            <p className="text-sm text-[#9CA3AF]">Validando seu convite...</p>
          </div>
        ) : submitted ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto" />
            <h2 className="text-xl font-bold text-white">Obrigado pela avaliação!</h2>
            <p className="text-sm text-[#A0A8B8]">Sua opinião foi enviada ao estabelecimento e ajuda outras pessoas a escolherem melhor.</p>
            {onBackToMenu && <button onClick={onBackToMenu} className="mt-4 min-h-11 px-5 rounded-xl bg-[#F5B900] text-[#0B0D11] font-extrabold text-sm">Voltar ao cardápio</button>}
          </div>
        ) : !invitation?.valid ? (
          <div className="py-7 text-center space-y-3">
            <h2 className="text-lg font-bold text-white">Convite indisponível</h2>
            <p className="text-sm text-[#9CA3AF]">{error || 'Este link já foi utilizado, expirou ou não é válido.'}</p>
            {onBackToMenu && <button onClick={onBackToMenu} className="mt-3 min-h-11 px-5 rounded-xl border border-[#3A4050] text-white font-semibold text-sm">Voltar ao cardápio</button>}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="text-center space-y-3">
              <p className="text-sm text-[#D1D5DB]">Toque nas estrelas para avaliar seu pedido</p>
              <div className="flex justify-center gap-2" role="radiogroup" aria-label="Nota da avaliação">
                {[1,2,3,4,5].map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} ${value === 1 ? 'estrela' : 'estrelas'}`} onMouseEnter={() => setHoveredRating(value)} onMouseLeave={() => setHoveredRating(0)} onFocus={() => setHoveredRating(value)} onBlur={() => setHoveredRating(0)} onClick={() => setRating(value)} className="p-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B900]">
                    <Star className={`w-9 h-9 sm:w-10 sm:h-10 transition-colors ${value <= (hoveredRating || rating) ? 'text-[#F5B900] fill-[#F5B900]' : 'text-[#4B5563]'}`} />
                  </button>
                ))}
              </div>
              <p className="text-xs font-semibold text-[#F5B900] min-h-4">{['','Muito ruim','Ruim','Regular','Boa','Excelente'][rating]}</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="review-comment" className="block text-sm font-semibold text-white">Conte um pouco mais <span className="text-[#9CA3AF] font-normal">(opcional)</span></label>
              <textarea id="review-comment" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1200} rows={4} placeholder="O que você achou do atendimento, produto ou entrega?" className="w-full resize-y rounded-xl bg-[#0D1017] border border-[#343B4B] focus:border-[#F5B900] focus:outline-none focus:ring-1 focus:ring-[#F5B900] p-3 text-sm text-white placeholder:text-[#737B8C]" />
              <p className="text-right text-[11px] text-[#8B93A3]">{comment.length}/1200</p>
            </div>

            {error && <p role="alert" className="text-xs text-red-300 bg-red-950/30 border border-red-900/60 rounded-lg p-3">{error}</p>}
            <button type="submit" disabled={rating < 1 || submitting} className="w-full min-h-12 rounded-xl bg-[#F5B900] hover:bg-[#FFC928] disabled:opacity-40 disabled:cursor-not-allowed text-[#0B0D11] font-extrabold text-sm flex items-center justify-center gap-2">
              {submitting ? <><LoaderCircle className="w-4 h-4 animate-spin" /> Enviando...</> : 'Enviar avaliação'}
            </button>
            <p className="text-center text-[11px] leading-relaxed text-[#8B93A3]">Avaliação vinculada a um pedido concluído. Após o envio, não será possível editá-la.</p>
          </form>
        )}
      </section>
    </main>
  );
}
