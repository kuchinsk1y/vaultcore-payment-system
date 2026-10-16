interface Props {
  title: string;
  subtitle?: string;
  /** Right-aligned controls in the header (buttons, toggles). */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Common frame for dashboard pages: same width, spacing, entrance animation and heading style,
 * so every page lines up with the others.
 */
export function PageShell({ title, subtitle, actions, children }: Props) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6 duration-700">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-serif text-3xl tracking-widest uppercase text-[var(--text-main)]">{title}</h1>
          {subtitle && <p className="text-base text-[var(--text-muted)]">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </div>
  );
}
