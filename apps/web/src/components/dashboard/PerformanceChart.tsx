"use client";

import { useLocale, useTranslations } from 'next-intl';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import type { PortfolioItem } from '@/lib/api';
import { formatMajor } from '@/lib/format';
import { isEmptySeries } from '@/lib/portfolio';
import { SectionError, Skeleton } from '@/components/ui/SectionState';

interface Props {
  series: PortfolioItem[] | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  visible: boolean;
}

export function PerformanceChart({ series, loading, error, onRetry, visible }: Props) {
  const t = useTranslations('Dashboard');
  const tc = useTranslations('Common');
  const locale = useLocale();

  const shortDate = (iso: string) => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(iso));

  return (
    <section aria-labelledby="performance-heading" className="surface-premium rounded-xl p-5 lg:col-span-2">
      <h2 id="performance-heading" className="mb-6 font-serif text-xs uppercase tracking-[0.15em] text-[var(--text-muted)]">
        {t('performance')}
      </h2>

      {loading && !series ? (
        <Skeleton className="h-72" />
      ) : error && !series ? (
        <SectionError message={t('sectionError')} retryLabel={tc('retry')} onRetry={onRetry} />
      ) : !series || isEmptySeries(series) ? (
        <div className="flex h-72 items-center justify-center px-6 text-center text-sm text-[var(--text-muted)]">{t('noHistory')}</div>
      ) : (
        <div className={`h-72 w-full transition-[filter] ${visible ? '' : 'blur-md'}`} role="img" aria-label={t('performance')}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#D4AF37" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                stroke="var(--border-subtle)"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                dy={12}
                minTickGap={36}
              />
              <Tooltip
                formatter={(value) => [formatMajor(Number(value), 'EUR', locale), '']}
                labelFormatter={(label) => shortDate(String(label))}
                separator=""
                contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}
                itemStyle={{ color: '#D4AF37', fontSize: 13 }}
                labelStyle={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 6 }}
                cursor={{ stroke: 'var(--border-subtle)', strokeDasharray: '4 4' }}
              />
              <Area type="monotone" dataKey="balance" stroke="#D4AF37" strokeWidth={2} fill="url(#balanceFill)" activeDot={{ r: 5, fill: 'var(--bg-main)', stroke: '#D4AF37', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
