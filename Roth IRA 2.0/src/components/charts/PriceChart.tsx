import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  TickMarkType,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { PriceData } from '../../types';
import { INITIAL_VISIBLE_BARS, movingAverage } from '../../lib/chartData';
import { parseDay } from '../../lib/utils';

export type ChartStyle = 'candles' | 'line';

interface PriceChartProps {
  bars: PriceData[];
  /** Intraday bars carry ISO timestamps; daily and longer carry 'YYYY-MM-DD'. */
  intraday: boolean;
  style: ChartStyle;
  /** Changes when the symbol or bar size does, so the view re-fits; live updates keep it. */
  dataKey: string;
  formatPrice: (value: number) => string;
  ariaLabel: string;
  showVolume?: boolean;
  /** Moving-average periods to draw, e.g. [20, 50]. */
  averages?: number[];
  /** A dashed reference price, such as the prior close on an intraday chart. */
  baseline?: number;
  /** Pixel height; omitted, the chart fills its container. */
  height?: number;
}

/** One color per moving average, from the theme, so they read in both themes. */
const AVERAGE_TOKENS = ['--accent', '--warn', '--muted'];

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';

/** '#5bb974' → 'rgba(91, 185, 116, 0.15)', for translucent fills from theme colors. */
const withAlpha = (hex: string, alpha: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/**
 * A bar's time as the chart library wants it, read from the bar itself: an
 * instant for intraday bars, a calendar day for daily ones. Going by the bar
 * rather than the `intraday` prop matters for the one render where a new bar
 * size has arrived but its bars haven't.
 */
const toTime = (bar: PriceData): Time =>
  bar.date.includes('T') ? (Math.floor(Date.parse(bar.date) / 1000) as UTCTimestamp) : (bar.date.slice(0, 10) as Time);

/**
 * Bars in strictly increasing time, the latest of any repeats kept. The library
 * throws on a repeated or out-of-order time, and a throw there took down the
 * whole app.
 */
const inOrder = (bars: PriceData[]): PriceData[] => {
  const byTime = new Map<string, PriceData>();
  bars.forEach(bar => byTime.set(String(toTime(bar)), bar));
  return Array.from(byTime.values()).sort((a, b) => {
    const ta = toTime(a);
    const tb = toTime(b);
    return typeof ta === 'number' && typeof tb === 'number' ? ta - tb : String(ta).localeCompare(String(tb));
  });
};

/** A chart time as the reader's own clock and calendar shows it. */
const asDate = (time: Time): Date =>
  typeof time === 'number' ? new Date(time * 1000)
    : typeof time === 'string' ? parseDay(time)
      : new Date(time.year, time.month - 1, time.day);

const closeOf = (bar: PriceData) => bar.close ?? bar.price;
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

interface Legend {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  change: number;
}

/**
 * The interactive price chart: drag to scroll back, wheel or pinch to zoom,
 * crosshair with values on both axes, and an OHLC readout. Built on
 * TradingView's Lightweight Charts, styled from the app's theme tokens and
 * restyled when the theme changes.
 */
export function PriceChart(props: PriceChartProps) {
  return (
    <ChartBoundary resetKey={props.dataKey} height={props.height}>
      <PriceChartInner {...props} />
    </ChartBoundary>
  );
}

/** Keeps a chart failure inside the chart's box instead of blanking the page. */
class ChartBoundary extends Component<{ resetKey: string; height?: number; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previous: { resetKey: string }) {
    // A different symbol or bar size gets a fresh try.
    if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }

  componentDidCatch(error: unknown) {
    console.error('Chart failed to draw', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex items-center justify-center text-sm text-muted" style={this.props.height ? { height: this.props.height } : { height: '100%' }}>
        The chart couldn’t be drawn. Try another bar size or range.
      </div>
    );
  }
}

function PriceChartInner({
  bars: rawBars,
  intraday,
  style,
  dataKey,
  formatPrice,
  ariaLabel,
  showVolume = false,
  averages = [],
  baseline,
  height,
}: PriceChartProps) {
  const bars = useMemo(() => inOrder(rawBars), [rawBars]);
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const priceSeries = useRef<ISeriesApi<SeriesType> | null>(null);
  const volumeSeries = useRef<ISeriesApi<'Histogram'> | null>(null);
  const averageSeries = useRef<ISeriesApi<'Line'>[]>([]);
  const baselineLine = useRef<IPriceLine | null>(null);
  /** What was last drawn, so a live tick can update one bar instead of redrawing. */
  const drawn = useRef<{ key: string; style: ChartStyle; length: number; firstDate?: string }>({ key: '', style, length: 0 });
  const [legend, setLegend] = useState<Legend | null>(null);
  const [hoverLegend, setHoverLegend] = useState<Legend | null>(null);
  const [themeVersion, setThemeVersion] = useState(0);
  const formatRef = useRef(formatPrice);
  formatRef.current = formatPrice;

  // The chart itself, created once.
  useEffect(() => {
    if (!container.current) return;
    const created = createChart(container.current, {
      autoSize: true,
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { scaleMargins: { top: 0.1, bottom: 0.25 } },
      timeScale: {
        rightOffset: 4,
        timeVisible: intraday,
        secondsVisible: false,
        // In the reader's own time, like every other time in the app.
        tickMarkFormatter: (time: Time, type: TickMarkType) => {
          const date = asDate(time);
          if (type === TickMarkType.Year) return String(date.getFullYear());
          if (type === TickMarkType.Month) return date.toLocaleDateString('en-US', { month: 'short' });
          if (type === TickMarkType.DayOfMonth) return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        },
      },
      localization: {
        priceFormatter: (value: number) => formatRef.current(value),
        timeFormatter: (time: Time) => asDate(time).toLocaleString('en-US', intraday
          ? { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
          : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
      },
    });
    chart.current = created;

    // Restyle when the theme switches.
    const observer = new MutationObserver(() => setThemeVersion(v => v + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      observer.disconnect();
      created.remove();
      chart.current = null;
      priceSeries.current = null;
      volumeSeries.current = null;
      averageSeries.current = [];
      baselineLine.current = null;
      drawn.current = { key: '', style, length: 0 };
    };
  }, [intraday]);

  // Theme colors.
  useEffect(() => {
    chart.current?.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: token('--canvas') },
        textColor: token('--muted'),
        fontFamily: 'IBM Plex Sans, ui-sans-serif, system-ui, sans-serif',
        attributionLogo: true,
      },
      grid: { vertLines: { color: token('--line-soft') }, horzLines: { color: token('--line-soft') } },
      rightPriceScale: { borderColor: token('--line') },
      timeScale: { borderColor: token('--line') },
      crosshair: {
        vertLine: { color: token('--grid'), labelBackgroundColor: token('--chip') },
        horzLine: { color: token('--grid'), labelBackgroundColor: token('--chip') },
      },
    });
  }, [themeVersion, intraday]);

  // The data, the series that show it, and the readout.
  useEffect(() => {
    const api = chart.current;
    if (!api) return;
    const up = token('--up');
    const down = token('--down');
    const times = bars.map(toTime);
    const lastBar = bars[bars.length - 1];
    const reference = baseline ?? (bars[0] ? closeOf(bars[0]) : 0);
    const rising = lastBar ? closeOf(lastBar) >= reference : true;

    // Recreate the price series when the style changes; otherwise reuse it.
    if (priceSeries.current && drawn.current.style !== style) {
      api.removeSeries(priceSeries.current);
      priceSeries.current = null;
      baselineLine.current = null;
      drawn.current.key = '';
    }
    if (!priceSeries.current) {
      priceSeries.current = style === 'candles'
        ? api.addSeries(CandlestickSeries, {})
        : api.addSeries(AreaSeries, { lineWidth: 2 });
      drawn.current.style = style;
    }
    const series = priceSeries.current;
    if (style === 'candles') {
      series.applyOptions({ upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false });
    } else {
      const color = rising ? up : down;
      series.applyOptions({ lineColor: color, topColor: withAlpha(color, 0.18), bottomColor: withAlpha(color, 0.01) });
    }

    const toPoint = (bar: PriceData, i: number) => style === 'candles'
      ? { time: times[i], open: bar.open ?? closeOf(bar), high: bar.high ?? closeOf(bar), low: bar.low ?? closeOf(bar), close: closeOf(bar) }
      : { time: times[i], value: closeOf(bar) };

    // A live tick changes only the last bar or adds one; redrawing everything
    // would throw away where the reader had scrolled or zoomed to.
    const previous = drawn.current;
    const sameData = previous.key === dataKey && previous.firstDate === bars[0]?.date;
    const liveTick = sameData && (bars.length === previous.length || bars.length === previous.length + 1) && bars.length > 0;
    if (liveTick) {
      series.update(toPoint(lastBar, bars.length - 1) as never);
    } else {
      series.setData(bars.map(toPoint) as never);
    }

    // Volume, on its own scale along the bottom.
    if (showVolume && !volumeSeries.current) {
      volumeSeries.current = api.addSeries(HistogramSeries, { priceScaleId: 'volume', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
      api.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    } else if (!showVolume && volumeSeries.current) {
      api.removeSeries(volumeSeries.current);
      volumeSeries.current = null;
    }
    if (volumeSeries.current) {
      const toVolume = (bar: PriceData, i: number) => ({
        time: times[i],
        value: bar.volume ?? 0,
        color: withAlpha(closeOf(bar) >= (bar.open ?? closeOf(bar)) ? up : down, 0.45),
      });
      if (liveTick && previous.length > 0) volumeSeries.current.update(toVolume(lastBar, bars.length - 1));
      else volumeSeries.current.setData(bars.map(toVolume));
    }

    // Moving averages, redrawn in full: cheap, and each new bar moves the latest value.
    averageSeries.current.forEach(line => api.removeSeries(line));
    const closes = bars.map(closeOf);
    averageSeries.current = averages.map((period, k) => {
      const line = api.addSeries(LineSeries, {
        color: token(AVERAGE_TOKENS[k % AVERAGE_TOKENS.length]),
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: `MA ${period}`,
      });
      const values = movingAverage(closes, period);
      line.setData(values.flatMap((value, i) => (value === null ? [] : [{ time: times[i], value }])));
      return line;
    });

    // The reference line.
    if (baselineLine.current) {
      series.removePriceLine(baselineLine.current);
      baselineLine.current = null;
    }
    if (baseline) {
      baselineLine.current = series.createPriceLine({ price: baseline, color: token('--grid'), lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: '' });
    }

    // A new symbol or bar size opens on its latest stretch.
    if (!sameData && bars.length > 0) {
      if (bars.length > INITIAL_VISIBLE_BARS) {
        api.timeScale().setVisibleLogicalRange({ from: bars.length - INITIAL_VISIBLE_BARS, to: bars.length + 3 });
      } else {
        api.timeScale().fitContent();
      }
    }
    drawn.current = { key: dataKey, style, length: bars.length, firstDate: bars[0]?.date };

    const legendFor = (bar: PriceData, before?: PriceData): Legend => ({
      open: bar.open ?? closeOf(bar),
      high: bar.high ?? closeOf(bar),
      low: bar.low ?? closeOf(bar),
      close: closeOf(bar),
      volume: bar.volume,
      change: before ? closeOf(bar) - closeOf(before) : 0,
    });
    setLegend(lastBar ? legendFor(lastBar, bars[bars.length - 2]) : null);

    // The readout follows the crosshair, and falls back to the latest bar.
    const byTime = new Map(times.map((time, i) => [String(time), i]));
    const onMove = (param: { time?: Time }) => {
      const i = param.time === undefined ? undefined : byTime.get(String(param.time));
      setHoverLegend(i === undefined ? null : legendFor(bars[i], bars[i - 1]));
    };
    api.subscribeCrosshairMove(onMove);
    return () => api.unsubscribeCrosshairMove(onMove);
  }, [bars, style, dataKey, showVolume, averages.join(','), baseline, intraday, themeVersion]);

  const shown = hoverLegend ?? legend;
  const pct = shown && shown.close - shown.change !== 0 ? (shown.change / (shown.close - shown.change)) * 100 : 0;

  return (
    <div className="relative" style={height ? { height } : { height: '100%' }}>
      <div ref={container} role="img" aria-label={ariaLabel} className="absolute inset-0" />
      {shown && (
        <p className="pointer-events-none absolute left-2 top-1.5 z-10 flex flex-wrap gap-x-3 text-[11px] tabular-nums text-muted">
          <span>O <span className="text-ink">{formatPrice(shown.open)}</span></span>
          <span>H <span className="text-ink">{formatPrice(shown.high)}</span></span>
          <span>L <span className="text-ink">{formatPrice(shown.low)}</span></span>
          <span>C <span className="text-ink">{formatPrice(shown.close)}</span></span>
          <span className={shown.change >= 0 ? 'text-up' : 'text-down'}>
            {shown.change >= 0 ? '+' : '−'}{formatPrice(Math.abs(shown.change)).replace(/^-/, '')} ({shown.change >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(2)}%)
          </span>
          {showVolume && shown.volume ? <span>Vol <span className="text-ink">{compact.format(shown.volume)}</span></span> : null}
        </p>
      )}
    </div>
  );
}
