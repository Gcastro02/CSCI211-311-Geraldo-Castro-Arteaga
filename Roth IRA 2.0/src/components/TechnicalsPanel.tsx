import { Info, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { TechnicalSnapshot, scoreTechnicals } from '../lib/indicators';

const formatPct = (value: number | null, digits = 1) =>
  value === null ? '—' : `${value >= 0 ? '+' : '−'}${Math.abs(value * 100).toFixed(digits)}%`;

const formatNum = (value: number | null, digits = 2) =>
  value === null ? '—' : value.toFixed(digits);

/** Text color for a -1..+1 (or -100..+100 scaled down) signal. */
const toneFor = (score: number) =>
  score > 0.2 ? 'text-up' : score < -0.2 ? 'text-down' : 'text-muted';

const barFor = (score: number) =>
  score > 0.2 ? 'bg-up' : score < -0.2 ? 'bg-down' : 'bg-muted';

const BIAS_COPY: Record<'BULLISH' | 'NEUTRAL' | 'BEARISH', string> = {
  BULLISH: 'Lean positive',
  NEUTRAL: 'Mixed',
  BEARISH: 'Lean negative',
};

interface TechnicalsPanelProps {
  snapshot?: TechnicalSnapshot;
  loading?: boolean;
  /** Show a one-line meaning under each indicator. */
  explain?: boolean;
}

/**
 * Measured technical indicators for one symbol.
 *
 * Everything shown here is computed locally from OHLCV bars — no model and no
 * language model involved — so it stays accurate even with AI features off.
 */
export function TechnicalsPanel({ snapshot, loading = false, explain = false }: TechnicalsPanelProps) {
  if (loading) {
    return (
      <p className="flex items-center gap-2 py-4 text-sm text-muted">
        <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
        Computing indicators from price history…
      </p>
    );
  }

  if (!snapshot) {
    return (
      <p className="flex items-start gap-2 py-4 text-sm text-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Not enough price history to compute indicators for this symbol.
      </p>
    );
  }

  const { score, bias, components } = scoreTechnicals(snapshot);

  const metrics = [
    { label: 'RSI (14-day)', value: formatNum(snapshot.rsi14, 1), meaning: 'How fast the price has moved lately, 0–100. Above 70 it rose quickly; below 30 it fell quickly.' },
    { label: '20-day average', value: formatNum(snapshot.sma20), meaning: 'Average closing price over the last 20 trading days.' },
    { label: 'vs 20-day average', value: formatPct(snapshot.closeVsSma20), meaning: 'How far today’s price is above or below that average.' },
    { label: 'Bollinger position', value: snapshot.bbPosition === null ? '—' : `${(snapshot.bbPosition * 100).toFixed(0)}%`, meaning: 'Where the price sits in its usual recent range: 0% the bottom, 100% the top.' },
    { label: 'MACD histogram', value: formatNum(snapshot.macdHistogram), meaning: 'Positive when short-term momentum is running ahead of its recent trend.' },
    { label: '5-day return', value: formatPct(snapshot.return5d), meaning: 'Price change over the last 5 trading days (one week).' },
    { label: '20-day return', value: formatPct(snapshot.return20d), meaning: 'Price change over the last 20 trading days (about a month).' },
    { label: 'Volatility (annual)', value: formatPct(snapshot.annualizedVolatility, 0).replace('+', ''), meaning: 'How much the price typically swings over a year. Higher means a bumpier ride.' },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-ink-2">
          Overall:{' '}
          <span className={cn('font-semibold', toneFor(score / 100))}>
            {BIAS_COPY[bias]} ({score > 0 ? '+' : ''}{score})
          </span>
        </p>
        <p className="text-xs text-muted">Score runs from −100 to +100</p>
      </div>

      <ul className="mt-3 space-y-2">
        {components.map(component => (
          <li key={component.label} className="flex items-center gap-3 text-sm">
            {/* Centre-anchored bar: negative grows left, positive grows right. */}
            <div className="relative h-1.5 w-16 shrink-0 rounded-full bg-line-soft" aria-hidden="true">
              <div
                className={cn('absolute top-0 h-1.5 rounded-full', barFor(component.score))}
                style={{
                  left: component.score >= 0 ? '50%' : `${50 + component.score * 50}%`,
                  width: `${Math.abs(component.score) * 50}%`,
                }}
              />
            </div>
            <span className="shrink-0 font-medium">{component.label}</span>
            <span className="truncate text-muted">{component.detail}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-8">
        {metrics.map(metric => (
          <div key={metric.label} className="border-t border-line py-3">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-sm text-ink-2">{metric.label}</dt>
              <dd className="text-[15px] font-medium">{metric.value}</dd>
            </div>
            {explain && <p className="mt-1 text-xs leading-relaxed text-muted">{metric.meaning}</p>}
          </div>
        ))}
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        Computed from {snapshot.barsUsed} daily prices through {snapshot.asOf}. These describe recent price
        behavior; they don’t predict it.
      </p>
    </div>
  );
}
