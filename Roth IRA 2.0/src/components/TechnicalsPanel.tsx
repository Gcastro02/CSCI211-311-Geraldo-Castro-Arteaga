import { Activity, Info, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { TechnicalSnapshot, scoreTechnicals } from '../lib/indicators';

const formatPct = (value: number | null, digits = 1) =>
  value === null ? '--' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`;

const formatNum = (value: number | null, digits = 2) =>
  value === null ? '--' : value.toFixed(digits);

/** Colour ramp shared by the score badge and the per-signal bars. */
const toneFor = (score: number) =>
  score > 0.2
    ? { text: 'text-emerald-700', bg: 'bg-emerald-100', bar: 'bg-emerald-500' }
    : score < -0.2
      ? { text: 'text-rose-700', bg: 'bg-rose-100', bar: 'bg-rose-500' }
      : { text: 'text-slate-600', bg: 'bg-slate-100', bar: 'bg-slate-400' };

interface TechnicalsPanelProps {
  snapshot?: TechnicalSnapshot;
  loading?: boolean;
  /** `compact` drops the metric grid, for cards with less room. */
  variant?: 'full' | 'compact';
}

/**
 * Measured technical indicators for one symbol.
 *
 * Everything shown here is computed locally from OHLCV bars — no model and no
 * language model involved — so it stays accurate even with AI features off.
 */
export function TechnicalsPanel({ snapshot, loading = false, variant = 'full' }: TechnicalsPanelProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 italic py-4">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        Computing indicators from price history...
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex items-start gap-2 text-xs text-slate-400 italic py-4">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Not enough price history to compute indicators for this symbol.
      </div>
    );
  }

  const { score, bias, components } = scoreTechnicals(snapshot);
  const tone = toneFor(score / 100);

  const metrics = [
    { label: 'RSI (14)', value: formatNum(snapshot.rsi14, 1) },
    { label: 'MACD hist.', value: formatNum(snapshot.macdHistogram) },
    { label: 'vs 20d avg', value: formatPct(snapshot.closeVsSma20) },
    { label: 'Band pos.', value: snapshot.bbPosition === null ? '--' : `${(snapshot.bbPosition * 100).toFixed(0)}%` },
    { label: '5d return', value: formatPct(snapshot.return5d) },
    { label: '20d return', value: formatPct(snapshot.return20d) },
    { label: 'Ann. volatility', value: formatPct(snapshot.annualizedVolatility, 0) },
    { label: '20d SMA', value: formatNum(snapshot.sma20) },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-600" />
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Technical Signals</h4>
        </div>
        <span className={cn('text-xs font-bold px-3 py-1 rounded-full', tone.bg, tone.text)}>
          {bias} {score > 0 ? '+' : ''}{score}
        </span>
      </div>

      <div className="space-y-2">
        {components.map(component => {
          const componentTone = toneFor(component.score);
          return (
            <div key={component.label} className="flex items-center gap-3">
              {/* Centre-anchored bar: bearish grows left, bullish grows right. */}
              <div className="relative h-1.5 w-16 shrink-0 rounded-full bg-slate-100">
                <div
                  className={cn('absolute top-0 h-1.5 rounded-full', componentTone.bar)}
                  style={{
                    left: component.score >= 0 ? '50%' : `${50 + component.score * 50}%`,
                    width: `${Math.abs(component.score) * 50}%`,
                  }}
                />
              </div>
              <span className="text-xs font-medium text-slate-700 shrink-0">{component.label}</span>
              <span className="text-[11px] text-slate-400 truncate">{component.detail}</span>
            </div>
          );
        })}
      </div>

      {variant === 'full' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 pt-4 border-t border-slate-100">
          {metrics.map(metric => (
            <div key={metric.label}>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{metric.label}</p>
              <p className="text-sm font-medium text-slate-900">{metric.value}</p>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-slate-400 leading-relaxed">
        Computed locally from {snapshot.barsUsed} daily bars through {snapshot.asOf}. Technical signals
        describe recent price behaviour only — they are not a forecast.
      </p>
    </div>
  );
}
