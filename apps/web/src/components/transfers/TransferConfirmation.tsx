import { AlertCircle, ShieldCheck } from 'lucide-react';
import type { TransferConfirmationRequired } from '@/lib/api';

interface Props {
  confirmation: TransferConfirmationRequired;
  code: string;
  onCodeChange: (code: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  loading: boolean;
  error: string;
}

/** Second step for large transfers: a one-time code from email or the authenticator app. */
export function TransferConfirmation({ confirmation, code, onCodeChange, onSubmit, onCancel, loading, error }: Props) {
  const viaApp = confirmation.method === 'TOTP';

  return (
    <form onSubmit={onSubmit} className="surface-premium rounded-sm p-8 md:p-12 space-y-8">
      <div className="flex items-start gap-4">
        <ShieldCheck className="w-6 h-6 shrink-0 text-[#D4AF37]" aria-hidden />
        <div>
          <h2 className="font-serif text-lg tracking-[0.1em] uppercase text-[var(--text-main)]">Confirm transfer</h2>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            {viaApp
              ? 'This is a large transfer. Enter the 6-digit code from your authenticator app.'
              : 'This is a large transfer. We emailed you a 6-digit code. Enter it to continue.'}
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-4 border border-[var(--border-subtle)] bg-[var(--bg-main)] flex items-center text-red-900 text-xs tracking-wide">
          <AlertCircle className="w-4 h-4 mr-3 flex-shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label htmlFor="transfer-code" className="block text-[10px] tracking-[0.2em] uppercase text-gray-500 font-medium mb-3">
          Confirmation code
        </label>
        <input
          id="transfer-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          value={code}
          onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          className="input-premium w-full p-4 text-2xl font-serif tracking-[0.5em] text-center tabular-nums"
          required
        />
        <p className="text-xs text-[var(--text-muted)] mt-2">
          The code expires at {new Date(confirmation.expires_at).toLocaleTimeString()}. Never share it with anyone.
        </p>
      </div>

      <div className="flex gap-4">
        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="btn-gold flex-1 py-4 text-xs tracking-[0.1em] uppercase disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {loading ? 'Processing' : 'Confirm and send'}
        </button>
        <button type="button" onClick={onCancel} className="text-xs uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-main)] px-4">
          Cancel
        </button>
      </div>
    </form>
  );
}
