import { AlertCircle } from 'lucide-react';

/** Inline error for one dashboard section, with a retry action. */
export function SectionError({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-subtle)] p-4 text-sm">
      <span className="flex items-center gap-3 text-[var(--text-muted)]">
        <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" aria-hidden />
        {message}
      </span>
      <button type="button" onClick={onRetry} className="shrink-0 text-xs uppercase tracking-widest text-[#D4AF37] hover:text-[#E5C048]">
        {retryLabel}
      </button>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-[var(--border-subtle)] ${className}`} />;
}
