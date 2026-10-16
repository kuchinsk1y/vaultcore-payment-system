import { Hexagon } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Shared frame for the public account pages (forgot / reset password, verify email). */
export function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center font-sans p-4 relative overflow-hidden bg-[#0A0A0B]">
      <div className="absolute top-0 right-1/4 w-[800px] h-[800px] bg-gradient-to-bl from-[#C5A059]/[0.03] to-transparent rounded-full pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10 flex flex-col">
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="w-12 h-12 flex items-center justify-center mb-6">
            <Hexagon className="w-10 h-10 text-[#C5A059] stroke-[1]" />
          </div>
          <h1 className="text-3xl font-serif text-white tracking-widest uppercase mb-3">{title}</h1>
          {subtitle && <p className="text-zinc-500 text-xs tracking-[0.2em] uppercase">{subtitle}</p>}
        </div>

        <div className="bg-[#121214] border border-white/[0.06] shadow-2xl rounded-xl p-8 sm:p-10">{children}</div>

        {footer && <div className="text-center text-[11px] uppercase tracking-widest text-zinc-600 mt-10">{footer}</div>}
      </div>
    </div>
  );
}

export const authInputClass =
  'w-full bg-transparent border border-white/[0.08] text-white placeholder-zinc-700 focus:border-[#C5A059]/40 focus:ring-1 focus:ring-[#C5A059]/20 hover:border-white/[0.12] rounded-lg py-3.5 px-4 text-sm transition-all duration-300 outline-none';

export const authButtonClass =
  'w-full py-4 mt-4 flex justify-center items-center gap-2 uppercase tracking-widest text-[10px] bg-[#1C1C1E] text-white border border-[#C5A059]/30 hover:bg-[#252528] hover:border-[#C5A059]/60 shadow-lg shadow-black/40 font-medium rounded-lg transition-all duration-500 ease-out disabled:opacity-50 disabled:cursor-not-allowed';

export function AuthMessage({ kind, children }: { kind: 'error' | 'success'; children: React.ReactNode }) {
  const styles =
    kind === 'error'
      ? 'bg-red-950/20 border-red-900/30 text-red-400'
      : 'bg-emerald-950/20 border-emerald-900/30 text-emerald-400';
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`mb-6 p-4 border rounded-lg text-sm tracking-wide ${styles}`}>
      {children}
    </div>
  );
}
