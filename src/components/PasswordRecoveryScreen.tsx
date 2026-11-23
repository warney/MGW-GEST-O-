import { useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';

interface PasswordRecoveryScreenProps {
  onSave: (password: string) => Promise<void>;
  errorMessage?: string | null;
}

export function PasswordRecoveryScreen({ onSave, errorMessage }: PasswordRecoveryScreenProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    if (password.length < 8) {
      setLocalError('A nova senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setLocalError('As senhas não conferem.');
      return;
    }
    setSaving(true);
    try {
      await onSave(password);
      setPassword('');
      setConfirmation('');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Não foi possível atualizar a senha.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-[#111827] flex items-center justify-center p-4">
      <main className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-[#FFFFFF] p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#EAB308]/30 bg-[#EAB308]/10 text-[#EAB308]">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Criar nova senha</h1>
            <p className="text-xs text-[#6B7280]">MGW GESTÃO</p>
          </div>
        </div>
        <p className="mb-5 text-sm leading-relaxed text-[#6B7280]">
          Escolha uma nova senha para recuperar o acesso à sua conta.
        </p>
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          <div>
            <label htmlFor="new-password" className="mb-1.5 block text-xs font-medium text-[#4B5563]">Nova senha</label>
            <input id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required className="min-h-[46px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 text-sm outline-none focus:border-[#EAB308]" />
          </div>
          <div>
            <label htmlFor="confirm-new-password" className="mb-1.5 block text-xs font-medium text-[#4B5563]">Confirmar nova senha</label>
            <input id="confirm-new-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={8} required className="min-h-[46px] w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 text-sm outline-none focus:border-[#EAB308]" />
          </div>
          {(localError || errorMessage) && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{localError || errorMessage}</p>}
          <button type="submit" disabled={saving} className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#EAB308] text-sm font-semibold text-[#F9FAFB] disabled:opacity-60">
            <Lock className="h-4 w-4" />{saving ? 'Salvando...' : 'Atualizar senha'}
          </button>
        </form>
      </main>
    </div>
  );
}
