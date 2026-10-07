import { cn } from '../../lib/utils';

/**
 * A signed move with an arrow, so direction never depends on color alone.
 * Shows "▲ +$12.30 (+1.25%)" when given an amount and formatter, else "▲ +1.25%".
 */
export function Change({ amount, percent, formatCurrency, className }: {
  amount?: number;
  percent: number;
  formatCurrency?: (amount: number) => string;
  className?: string;
}) {
  const up = (amount ?? percent) >= 0;
  const pct = `${up ? '+' : '−'}${Math.abs(percent).toFixed(2)}%`;
  return (
    <span className={cn('font-medium', up ? 'text-up' : 'text-down', className)}>
      {up ? '▲' : '▼'}{' '}
      {amount != null && formatCurrency
        ? `${up ? '+' : '−'}${formatCurrency(Math.abs(amount))} (${pct})`
        : pct}
    </span>
  );
}
