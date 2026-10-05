import { PriceData } from '../types';

export const TREND_UP_COLOR = '#16a34a';
export const TREND_DOWN_COLOR = '#dc2626';

export const getTrendColor = (rows: PriceData[]): string => {
  if (rows.length < 2) return TREND_UP_COLOR;
  const first = rows[0].close ?? rows[0].price;
  const last = rows[rows.length - 1].close ?? rows[rows.length - 1].price;
  return last >= first ? TREND_UP_COLOR : TREND_DOWN_COLOR;
};

export const toCandleRows = (rows: PriceData[]) =>
  rows.map((point, index) => {
    const previousClose = index > 0 ? rows[index - 1].close ?? rows[index - 1].price : point.price;
    const open = point.open ?? previousClose;
    const close = point.close ?? point.price;
    const high = point.high ?? Math.max(open, close);
    const low = point.low ?? Math.min(open, close);
    return {
      ...point,
      open, close, high, low,
      wickBase: low,
      wickHeight: Math.max(high - low, 0.01),
      candleBase: Math.min(open, close),
      candleBody: Math.max(Math.abs(close - open), 0.01),
      isUp: close >= open,
    };
  });

export const renderCandleWick = (props: any) => {
  const { x, y, width, height, payload } = props;
  const color = payload?.isUp ? TREND_UP_COLOR : TREND_DOWN_COLOR;
  return (
    <line
      x1={x + width / 2} x2={x + width / 2}
      y1={y} y2={y + height}
      stroke={color} strokeWidth={1} strokeLinecap="round"
    />
  );
};
