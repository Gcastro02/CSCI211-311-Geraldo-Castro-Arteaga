/**
 * Whether a symbol is a fund rather than a single company. Single-position
 * limits are about one company's bad news moving a whole account; a fund
 * holding hundreds of companies doesn't carry that risk, so it is exempt.
 */

/** Well-known funds, for when no quote has said what a symbol is. */
export const KNOWN_FUNDS = new Set([
  'SPY', 'VOO', 'IVV', 'VTI', 'QQQ', 'DIA', 'IWM', 'GLD', 'SLV', 'TLT', 'AGG', 'BND', 'VEA', 'VWO', 'EFA',
  'SCHD', 'VGT', 'XLK', 'XLF', 'ARKK', 'VT', 'VXUS', 'SCHB', 'SCHX', 'SPLG', 'RSP', 'IAU', 'BNDX', 'VNQ', 'VIG',
]);

/**
 * A quote's word wins when there is one (Yahoo marks ETFs and mutual funds);
 * otherwise fall back to the list above.
 */
export const isFund = (symbol: string, quotedAsFund?: Record<string, boolean>): boolean => {
  const key = symbol.trim().toUpperCase();
  return quotedAsFund?.[key] ?? KNOWN_FUNDS.has(key);
};
