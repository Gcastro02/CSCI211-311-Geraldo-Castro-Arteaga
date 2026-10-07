import { useMemo, useState, type PointerEvent } from 'react';

export interface LinePoint {
  date: string;
  /** The close, for price series. */
  value: number;
  /** Optional OHLC, needed only for candle mode. */
  open?: number;
  high?: number;
  low?: number;
}

interface LineChartProps {
  points: LinePoint[];
  /** Accessible summary of what the chart shows. */
  ariaLabel: string;
  formatValue: (value: number) => string;
  formatDate: (date: string) => string;
  height?: number;
  /** Candles fall back to a line when the points carry no OHLC. */
  mode?: 'line' | 'candles';
  /**
   * Value for the dashed reference line, which also decides up/down coloring.
   * Defaults to the first point; an intraday chart passes the previous close.
   */
  baseline?: number;
}

const WIDTH = 1000;
const AXIS_LABELS = 4;

/**
 * Price-style chart: green when the period ended up, red when down, with a
 * dashed line at the starting value and a hover readout. Draws a line by
 * default, or candles when `mode="candles"` and the points carry OHLC.
 *
 * Plain SVG rather than Recharts so colors come straight from the theme
 * tokens and follow a theme switch without re-rendering.
 */
export function LineChart({ points, ariaLabel, formatValue, formatDate, height = 260, mode = 'line', baseline }: LineChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const candles = mode === 'candles' && points.some(p => p.open != null && p.high != null && p.low != null);

  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const reference = baseline ?? points[0].value;
    const highs = points.map(p => (candles ? p.high ?? p.value : p.value));
    const lows = points.map(p => (candles ? p.low ?? p.value : p.value));
    // Keep the reference line on the chart even when price never reached it.
    let lo = Math.min(...lows, reference);
    let hi = Math.max(...highs, reference);
    const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.01 || 1;
    lo -= pad;
    hi += pad;

    const step = WIDTH / points.length;
    // Lines run edge to edge; candles sit in the middle of equal slots so the
    // first and last bodies are not cut in half.
    const x = (i: number) => (candles ? step * (i + 0.5) : (i / (points.length - 1)) * WIDTH);
    const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
    const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');

    return {
      x,
      y,
      line,
      area: `0,${height} ${line} ${WIDTH},${height}`,
      baseY: y(reference),
      bodyWidth: Math.max(step * 0.6, 0.5),
      up: points[points.length - 1].value >= reference,
    };
  }, [points, height, candles, baseline]);

  if (!geometry) {
    return (
      <div className="flex items-center justify-center text-sm text-muted" style={{ height }}>
        Not enough price history to draw a chart.
      </div>
    );
  }

  const color = geometry.up ? 'var(--up)' : 'var(--down)';
  const labelIndexes = Array.from({ length: AXIS_LABELS }, (_, k) =>
    Math.round((k / (AXIS_LABELS - 1)) * (points.length - 1)),
  );
  const hovered = hoverIndex != null ? points[hoverIndex] : null;
  const hoverLeftPct = hoverIndex != null ? (geometry.x(hoverIndex) / WIDTH) * 100 : 0;

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    setHoverIndex(
      candles
        ? Math.min(Math.floor(ratio * points.length), points.length - 1)
        : Math.round(ratio * (points.length - 1)),
    );
  };

  return (
    <div>
      <div
        className="relative touch-none"
        style={{ height }}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={ariaLabel}
          className="block h-full w-full overflow-visible"
        >
          <line
            x1={0}
            x2={WIDTH}
            y1={geometry.baseY}
            y2={geometry.baseY}
            strokeWidth={1}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
            style={{ stroke: 'var(--grid)' }}
          />
          {candles ? (
            points.map((p, i) => {
              const open = p.open ?? p.value;
              const high = p.high ?? Math.max(open, p.value);
              const low = p.low ?? Math.min(open, p.value);
              const candleColor = p.value >= open ? 'var(--up)' : 'var(--down)';
              const top = geometry.y(Math.max(open, p.value));
              const bottom = geometry.y(Math.min(open, p.value));
              const cx = geometry.x(i);
              return (
                <g key={`${p.date}-${i}`} style={{ stroke: candleColor, fill: candleColor }}>
                  <line x1={cx} x2={cx} y1={geometry.y(high)} y2={geometry.y(low)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  <rect
                    x={cx - geometry.bodyWidth / 2}
                    width={geometry.bodyWidth}
                    y={top}
                    height={Math.max(bottom - top, 0.8)}
                    strokeWidth={0}
                  />
                </g>
              );
            })
          ) : (
            <>
              <polygon points={geometry.area} style={{ fill: color, fillOpacity: 0.1 }} />
              <polyline
                points={geometry.line}
                strokeWidth={2}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                style={{ fill: 'none', stroke: color }}
              />
            </>
          )}
        </svg>

        {hovered && (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-grid"
              style={{ left: `${hoverLeftPct}%` }}
            />
            {!candles && (
              <div
                className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-canvas"
                style={{ left: `${hoverLeftPct}%`, top: `${(geometry.y(hovered.value) / height) * 100}%`, background: color }}
              />
            )}
            <div
              className="pointer-events-none absolute -top-2 whitespace-nowrap rounded border border-line bg-surface px-2 py-1 text-xs"
              style={{
                left: `${hoverLeftPct}%`,
                transform: `translate(${hoverLeftPct > 80 ? '-100%' : hoverLeftPct < 20 ? '0' : '-50%'}, -100%)`,
              }}
            >
              {candles && hovered.open != null ? (
                <span className="text-ink">
                  O {formatValue(hovered.open)} · H {formatValue(hovered.high ?? hovered.value)} · L{' '}
                  {formatValue(hovered.low ?? hovered.value)} · C <span className="font-medium">{formatValue(hovered.value)}</span>
                </span>
              ) : (
                <span className="font-medium text-ink">{formatValue(hovered.value)}</span>
              )}
              <span className="ml-2 text-muted">{formatDate(hovered.date)}</span>
            </div>
          </>
        )}
      </div>

      <div className="mt-1.5 flex justify-between text-xs text-muted">
        {labelIndexes.map(i => (
          <span key={i}>{formatDate(points[i].date)}</span>
        ))}
      </div>
    </div>
  );
}
