import { ShieldAlert, ShieldCheck, Info } from 'lucide-react';
import { cn } from '../lib/utils';
import { RiskAudit } from '../lib/portfolioMath';

interface RiskAuditCardProps {
  audit: RiskAudit;
  formatCurrency: (amount: number) => string;
}

const DIVERSIFICATION_COPY: Record<RiskAudit['diversification'], string> = {
  CONCENTRATED: 'A large share of the portfolio sits in very few positions.',
  MODERATE: 'Holdings are somewhat concentrated but not extreme.',
  DIVERSIFIED: 'Value is spread reasonably evenly across positions.',
};

/**
 * Position concentration against the risk threshold — the bot's
 * `performRiskAudit`, which flagged any position over 25% of portfolio value.
 *
 * Pure arithmetic over data already on screen: no API call, no API key.
 */
export function RiskAuditCard({ audit, formatCurrency }: RiskAuditCardProps) {
  const hasPositions = audit.positions.length > 0;
  const breaches = audit.overLimit.length;
  const limitPct = (audit.riskThreshold * 100).toFixed(0);

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-2">
          {breaches > 0
            ? <ShieldAlert className="w-5 h-5 text-amber-500" />
            : <ShieldCheck className="w-5 h-5 text-emerald-500" />}
          <h3 className="font-bold text-lg">Risk & Diversification</h3>
        </div>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 px-2 py-1 rounded-md">
          {limitPct}% limit
        </span>
      </div>

      {!hasPositions ? (
        <p className="text-sm text-slate-500 italic">Add holdings to see concentration analysis.</p>
      ) : (
        <>
          <div className="mb-5 p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <p className={cn(
              'text-sm font-bold mb-1',
              breaches > 0 ? 'text-amber-700' : 'text-emerald-700',
            )}>
              {breaches > 0
                ? `${breaches} position${breaches === 1 ? '' : 's'} over the ${limitPct}% limit`
                : `All positions within the ${limitPct}% limit`}
            </p>
            <p className="text-xs text-slate-500">
              {DIVERSIFICATION_COPY[audit.diversification]} Cash is {(audit.cashWeight * 100).toFixed(1)}% of the portfolio.
            </p>
          </div>

          <div className="space-y-3">
            {audit.positions.map(position => (
              <div key={position.symbol}>
                <div className="flex justify-between items-baseline mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{position.symbol}</span>
                    {position.estimated && (
                      <span
                        className="text-[9px] font-bold text-slate-400 uppercase tracking-wider"
                        title="No live quote — valued at your average cost"
                      >
                        est.
                      </span>
                    )}
                    {position.overLimit && (
                      <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded uppercase tracking-wider">
                        over limit
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-slate-400">{formatCurrency(position.value)}</span>
                    <span className={cn(
                      'text-sm font-bold tabular-nums',
                      position.overLimit ? 'text-amber-600' : 'text-slate-700',
                    )}>
                      {(position.weight * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Bar fills relative to the limit, so the marker sits at 100%. */}
                <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={cn(
                      'absolute inset-y-0 left-0 rounded-full transition-all',
                      position.overLimit ? 'bg-amber-500' : 'bg-blue-500',
                    )}
                    style={{ width: `${Math.min(100, (position.weight / audit.riskThreshold) * 100)}%` }}
                  />
                </div>

                {position.overLimit && (
                  <p className="text-[10px] text-amber-700 mt-1">
                    {formatCurrency(position.excessValue)} above the limit — trimming that much brings it back to {limitPct}%.
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2 mt-5 pt-4 border-t border-slate-100">
            <Info className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Concentration index {audit.concentrationIndex.toFixed(2)} ({audit.diversification.toLowerCase()}).
              Positions valued with live quotes where available, otherwise your average cost.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
