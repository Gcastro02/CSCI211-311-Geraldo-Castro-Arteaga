import { LIVE_REFRESH_MS } from '../../lib/liveQuotes';
import { cn } from '../../lib/utils';

export interface PriceFreshness {
  marketOpen: boolean;
  /** When the newest price is from, in seconds since 1970. */
  asOf: number | null;
  /** Recent refreshes have failed, so the numbers on screen may be old. */
  stale: boolean;
}

/**
 * How current the prices on screen are. Someone deciding whether to trade needs
 * to know this, so it says when updates have stopped rather than looking live.
 */
export function PriceStatus({ status, className }: { status: PriceFreshness; className?: string }) {
  const seconds = LIVE_REFRESH_MS / 1000;
  const time = status.asOf
    ? new Date(status.asOf * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
    : null;
  return (
    <p className={cn('flex flex-wrap items-center gap-x-2 text-xs', status.stale ? 'font-medium text-warn-ink' : 'text-muted', className)}>
      {status.stale ? (
        <>Prices aren’t updating right now, so these may be out of date. Check your connection.</>
      ) : status.marketOpen ? (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-up" aria-hidden="true" />
          Updating every {seconds} seconds{time && ` · as of ${time}`}. Near live, so confirm at your broker before trading.
        </>
      ) : (
        <>Market closed. Prices are from the latest close.</>
      )}
    </p>
  );
}
