import { cn } from '../lib/utils';
import { RiskAudit } from '../lib/portfolioMath';

interface RiskAuditCardProps {
  audit: RiskAudit;
  formatCurrency: (amount: number) => string;
  onOpenStock?: (symbol: string) => void;
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
export function RiskAuditCard({ audit, formatCurrency, onOpenStock }: RiskAuditCardProps) {
  const breaches = audit.overLimit.length;
  const limitPct = (audit.riskThreshold * 100).toFixed(0);

  return (
    <section aria-labelledby="risk-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="risk-heading" className="text-lg font-semibold">Risk and diversification</h2>
        <span className="text-xs text-muted">Limit: {limitPct}% per position</span>
      </div>

      {audit.positions.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Add holdings to see how concentrated they are.</p>
      ) : (
        <>
          <p className="mt-2 text-sm">
            <span className={cn('font-semibold', breaches > 0 ? 'text-warn-ink' : 'text-up')}>
              {breaches > 0
                ? `${breaches} position${breaches === 1 ? '' : 's'} over the ${limitPct}% limit.`
                : `Every position is within the ${limitPct}% limit.`}
            </span>{' '}
            <span className="text-ink-2">
              {DIVERSIFICATION_COPY[audit.diversification]} Cash is {(audit.cashWeight * 100).toFixed(1)}% of the portfolio.
            </span>
          </p>

          <ul className="mt-4">
            {audit.positions.map(position => (
              <li key={position.symbol} className="border-b border-line-soft py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex items-center gap-2">
                    {onOpenStock ? (
                      <button
                        type="button"
                        onClick={() => onOpenStock(position.symbol)}
                        className="font-mono text-[13px] font-medium hover:text-accent"
                      >
                        {position.symbol}
                      </button>
                    ) : (
                      <span className="font-mono text-[13px] font-medium">{position.symbol}</span>
                    )}
                    {position.estimated && (
                      <span className="text-xs text-muted" title="No live quote — valued at your average cost">est.</span>
                    )}
                  </span>
                  <span className="flex items-baseline gap-3 text-sm">
                    <span className="text-muted">{formatCurrency(position.value)}</span>
                    <span className={cn('w-14 text-right font-medium', position.overLimit && 'text-warn-ink')}>
                      {(position.weight * 100).toFixed(1)}%
                    </span>
                  </span>
                </div>

                {/* Bar fills relative to the limit, so a full bar means "at the limit". */}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line-soft">
                  <div
                    className={cn('h-full rounded-full', position.overLimit ? 'bg-warn' : 'bg-accent')}
                    style={{ width: `${Math.min(100, (position.weight / audit.riskThreshold) * 100)}%` }}
                  />
                </div>

                {position.overLimit && (
                  <p className="mt-1.5 text-xs text-warn-ink">
                    {formatCurrency(position.excessValue)} above the limit — that much would bring it back to {limitPct}%.
                  </p>
                )}
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs leading-relaxed text-muted">
            Concentration index {audit.concentrationIndex.toFixed(2)} ({audit.diversification.toLowerCase()}): 0 is
            perfectly spread out, 1 is everything in one holding. Valued at live prices where available, otherwise
            your average cost.
          </p>
        </>
      )}
    </section>
  );
}
