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
  /**
   * Total positions on the x-axis. When larger than `points.length` the points
   * fill the left part and the rest stays empty — practice mode uses this to
   * show the whole scenario's length without revealing what happens later.
   */
  slots?: number;
  /** Draw a labeled vertical marker at this point index. */
  markerIndex?: number;
  markerLabel?: string;
  /** Shown over the empty part of the timeline when `slots` leaves room. */
  futureCaption?: string;
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
export function LineChart({
  points,
  ariaLabel,
  formatValue,
  formatDate,
  height = 260,
  mode = 'line',
  baseline,
  slots,
  markerIndex,
  markerLabel,
  futureCaption,
}: LineChartProps) {
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

    const total = Math.max(slots ?? points.length, points.length);
    const step = WIDTH / total;
    // Lines run edge to edge; candles sit in the middle of equal slots so the
    // first and last bodies are not cut in half.
    const x = (i: number) => (candles ? step * (i + 0.5) : (i / (total - 1)) * WIDTH);
    const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
    const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const lastX = x(points.length - 1);

    return {
      x,
      y,
      line,
      total,
      lastX,
      area: `0,${height} ${line} ${lastX.toFixed(1)},${height}`,
      baseY: y(reference),
      bodyWidth: Math.max(step * 0.6, 0.5),
      up: points[points.length - 1].value >= reference,
    };
  }, [points, height, candles, baseline, slots]);

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
    // Positions past the last point (the empty future) snap to the last point.
    const index = candles ? Math.floor(ratio * geometry.total) : Math.round(ratio * (geometry.total - 1));
    setHoverIndex(Math.min(index, points.length - 1));
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
          {geometry.lastX < WIDTH - 1 && (
            <rect x={geometry.lastX} y={0} width={WIDTH - geometry.lastX} height={height} style={{ fill: 'var(--surface)' }} />
          )}
          {markerIndex != null && markerIndex < points.length && (
            <line
              x1={geometry.x(markerIndex)}
              x2={geometry.x(markerIndex)}
              y1={0}
              y2={height}
              strokeWidth={1}
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
              style={{ stroke: 'var(--muted)' }}
            />
          )}
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

        {futureCaption && geometry.lastX < WIDTH * 0.85 && (
          <span
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 px-3 text-xs italic text-muted"
            style={{ left: `${(geometry.lastX / WIDTH) * 100}%` }}
          >
            {futureCaption}
          </span>
        )}

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

      {slots ? (
        // Timeline mode: label the first point, the marker and today where they sit.
        <div className="relative mt-1.5 h-4 text-xs text-muted">
          {[0, markerIndex, points.length - 1]
            .filter((i, k, all): i is number => i != null && i < points.length && all.indexOf(i) === k)
            .map(i => {
              const leftPct = (geometry.x(i) / WIDTH) * 100;
              return (
                <span
                  key={i}
                  className="absolute whitespace-nowrap"
                  style={{ left: `${leftPct}%`, transform: i === 0 ? undefined : 'translateX(-50%)' }}
                >
                  {formatDate(points[i].date)}
                  {i === markerIndex && markerLabel ? ` · ${markerLabel}` : ''}
                </span>
              );
            })}
        </div>
      ) : (
        <div className="mt-1.5 flex justify-between text-xs text-muted">
          {labelIndexes.map(i => (
            <span key={i}>{formatDate(points[i].date)}</span>
          ))}
        </div>
      )}
    </div>
  );
}
