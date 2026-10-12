import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Info, Pause, Play, RefreshCw, RotateCcw, SkipForward } from 'lucide-react';
import { PriceData } from '../../types';
import {
  PracticeScenario,
  PracticeSession,
  SCENARIOS,
  accountState,
  advance,
  buyAndHoldValue,
  drawdownFromHigh,
  findScenario,
  firstIndexOnOrAfter,
  isFinished,
  isValidSession,
  maxBuyShares,
  placeOrder,
  startSession,
  visibleBars,
} from '../../lib/practice';
import { getDailyBars } from '../../services/openaiService';
import { cn, parseDay } from '../../lib/utils';
import { Change } from '../ui/Change';
import { LineChart } from '../ui/LineChart';

/** Separate from every `roth_ira_*` key: practice never touches real data. */
const STORAGE_KEY = 'practice_session';
const PLAY_INTERVAL_MS = 600;

/** Bars per scenario, kept for the page's lifetime so revisiting doesn't refetch. */
const barCache = new Map<string, PriceData[]>();

const readSaved = (): unknown => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const longDate = (date: string) =>
  parseDay(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const shortDate = (date: string) =>
  parseDay(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Plain-language read on how far the market has fallen from its high so far. */
const coachNote = (drawdown: number) => {
  const pct = Math.abs(drawdown * 100).toFixed(1);
  if (drawdown > -0.05) {
    return {
      title: drawdown > -0.0005 ? 'It’s at its highest close so far.' : `It’s ${pct}% below its high so far.`,
      body: 'Small dips like this happen all the time. SPY holds the 500 largest US companies, so it moves with the market as a whole.',
    };
  }
  if (drawdown > -0.1) {
    return { title: `It’s ${pct}% below its high.`, body: 'Drops of 5–10% happen in most years. Notice how it feels to watch your account fall — that feeling is part of what you’re practicing.' };
  }
  if (drawdown > -0.2) {
    return { title: `It’s ${pct}% below its high — a “correction”.`, body: 'A fall of 10% or more is called a correction. Some investors sell to stop further losses; others hold or buy at lower prices. Neither is automatically right.' };
  }
  return { title: `It’s ${pct}% below its high — a “bear market”.`, body: 'A fall of 20% or more is a bear market. Selling locks in the loss; holding means riding it out without knowing where the bottom is. Decide, then see what happens.' };
};

/** '+1.23%' or '−1.23%' (a true minus sign, like the rest of the app). */
const signedPct = (fraction: number) => `${fraction >= 0 ? '+' : '−'}${Math.abs(fraction * 100).toFixed(2)}%`;

interface PracticeScreenProps {
  formatCurrency: (amount: number) => string;
}

export function PracticeScreen({ formatCurrency }: PracticeScreenProps) {
  const [saved] = useState(readSaved);
  const savedScenario = findScenario((saved as PracticeSession | null)?.scenarioId ?? '');
  const [scenario] = useState<PracticeScenario>(savedScenario ?? SCENARIOS[0]);
  const [bars, setBars] = useState<PriceData[] | null>(() => barCache.get(scenario.id) ?? null);
  const [loadError, setLoadError] = useState(false);
  /** Bumped by "Try again" to re-run the fetch. */
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [restored, setRestored] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [sharesInput, setSharesInput] = useState('');
  const [orderError, setOrderError] = useState<string | null>(null);
  const [showTips, setShowTips] = useState(true);

  // Load the scenario's bars once.
  useEffect(() => {
    if (barCache.has(scenario.id)) {
      setBars(barCache.get(scenario.id)!);
      return;
    }
    let cancelled = false;
    setBars(null);
    setLoadError(false);
    getDailyBars(scenario.symbol, scenario.historyStart, scenario.end)
      .then(rows => {
        if (cancelled) return;
        if (rows.length < 2 || firstIndexOnOrAfter(rows, scenario.start) < 0) {
          setLoadError(true);
          return;
        }
        barCache.set(scenario.id, rows);
        setBars(rows);
      })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [scenario, loadAttempt]);

  // Resume a saved session once its bars are here, if it still fits them.
  useEffect(() => {
    if (restored || !bars) return;
    if (savedScenario?.id === scenario.id && isValidSession(saved, bars)) setSession(saved);
    setRestored(true);
  }, [bars, restored]);

  useEffect(() => {
    if (!restored) return;
    try {
      if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage full or blocked: the session still works, it just won't resume.
    }
  }, [session, restored]);

  const finished = Boolean(session && bars && isFinished(session, bars));

  // Auto-advance one day per tick while playing.
  useEffect(() => {
    if (!playing || !bars) return;
    if (finished) {
      setPlaying(false);
      return;
    }
    const timer = setInterval(() => {
      setSession(prev => (prev ? advance(prev, bars, 1) : prev));
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [playing, bars, finished]);

  const startDay = bars ? firstIndexOnOrAfter(bars, scenario.start) : -1;

  // Everything below reads prices through `visibleBars` only.
  const seen = useMemo(() => (session && bars ? visibleBars(bars, session.day) : []), [session, bars]);
  const points = useMemo(() => seen.map(bar => ({ date: bar.date, value: bar.close ?? bar.price })), [seen]);

  const begin = () => {
    if (!bars) return;
    setSession(startSession(scenario, bars));
    setSharesInput('');
    setOrderError(null);
  };

  const restart = () => {
    if (!window.confirm('Restart this scenario? Your practice trades will be cleared.')) return;
    setPlaying(false);
    begin();
  };

  const step = (days: number) => {
    if (!session || !bars) return;
    setOrderError(null);
    setSession(advance(session, bars, days));
  };

  // ---------------------------------------------------------------------------
  // Before a session: pick a scenario.
  if (!session || !bars) {
    const tradingDays = bars && startDay >= 0 ? bars.length - startDay : null;
    return (
      <div className="flex max-w-3xl flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold">Practice</h1>
          <p className="mt-1 text-sm text-ink-2">
            Trade play money through real market history, one day at a time. Nothing here touches your real portfolio.
          </p>
        </div>

        <ul className="space-y-2 text-sm text-ink-2">
          <li>• You see each day as it happened — and nothing after it, so hindsight can’t help you.</li>
          <li>• Orders fill at that day’s closing price.</li>
          <li>• At the end, you’re compared with simply buying on day one and holding.</li>
        </ul>

        <section aria-label="Scenarios">
          {SCENARIOS.map(option => (
            <div key={option.id} className="rounded-lg border border-line p-5">
              <p className="text-xs font-medium text-accent">Scenario</p>
              <h2 className="mt-1 text-lg font-semibold">{option.name}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{option.summary}</p>
              <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm">
                <div><dt className="inline text-muted">Trade </dt><dd className="inline font-mono font-medium">{option.symbol}</dd></div>
                <div><dt className="inline text-muted">Starting cash </dt><dd className="inline font-medium">{formatCurrency(option.startingCash)}</dd></div>
                {tradingDays && option.id === scenario.id && (
                  <div><dt className="inline text-muted">Length </dt><dd className="inline font-medium">{tradingDays} trading days</dd></div>
                )}
              </dl>
              <p className="mt-1 text-xs text-muted">{option.symbol}: {option.symbolName}</p>
              {loadError && option.id === scenario.id ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <p className="text-sm text-down">Couldn’t load the price history.</p>
                  <button type="button" onClick={() => setLoadAttempt(n => n + 1)} className="h-11 rounded-full border border-edge px-5 text-sm font-medium text-accent hover:bg-surface">
                    Try again
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={begin}
                  disabled={!bars || option.id !== scenario.id}
                  className="mt-4 flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-on-accent hover:bg-accent-strong disabled:opacity-60"
                >
                  {!bars && <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {bars ? 'Start' : 'Loading prices…'}
                </button>
              )}
            </div>
          ))}
        </section>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // During and after a session.
  const today = bars[session.day];
  const account = accountState(session, bars, scenario);
  const holdValue = buyAndHoldValue(bars, scenario, session.day);
  const holdReturn = holdValue / scenario.startingCash - 1;
  const previousClose = session.day > 0 ? (bars[session.day - 1].close ?? bars[session.day - 1].price) : account.price;
  const dayMove = account.price - previousClose;
  const startClose = bars[startDay].close ?? bars[startDay].price;
  const trades = session.transactions.filter(tx => tx.type === 'BUY' || tx.type === 'SELL');
  const note = coachNote(drawdownFromHigh(bars, session.day));
  const lead = account.value - holdValue;
  const sharesNum = Number(sharesInput);
  const preview = sharesInput && Number.isFinite(sharesNum) && sharesNum > 0 ? sharesNum * account.price : null;

  const submit = (side: 'BUY' | 'SELL') => (event?: FormEvent) => {
    event?.preventDefault();
    const result = placeOrder(session, bars, scenario, side, Number(sharesInput));
    if (result.error) {
      setOrderError(result.error);
      return;
    }
    setSession(result.session!);
    setSharesInput('');
    setOrderError(null);
  };

  const controlClass =
    'flex h-11 items-center gap-2 rounded-full border border-edge px-4 text-sm font-medium text-ink hover:bg-surface disabled:opacity-50';

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            Practice · {scenario.name} · <span className="font-mono">{scenario.symbol}</span>
            <span className="rounded-full bg-note px-2.5 py-0.5 text-xs font-medium text-note-ink">Play money</span>
          </p>
          <h1 className="mt-1 text-[28px] font-medium tracking-tight">{longDate(today.date)}</h1>
          <p className="mt-0.5 text-sm text-muted">
            Day {session.day - startDay + 1} of {bars.length - startDay} · orders fill at the day’s closing price
          </p>
        </div>
        <div role="group" aria-label="Time controls" className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPlaying(p => !p)} disabled={finished} className={controlClass}>
            {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
            {playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" onClick={() => step(1)} disabled={finished || playing} className={controlClass}>Next day</button>
          <button type="button" onClick={() => step(5)} disabled={finished || playing} className={controlClass}>Next week</button>
          <button type="button" onClick={() => step(bars.length)} disabled={finished || playing} className={controlClass}>
            <SkipForward className="h-4 w-4" aria-hidden="true" /> To the end
          </button>
          <button type="button" onClick={restart} className="flex h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-accent hover:bg-surface">
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Restart
          </button>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-8">
          {/* Price and chart */}
          <section aria-label={`${scenario.symbol} so far`}>
            <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
              <span className="font-mono text-sm text-muted">{scenario.symbol}</span>
              <span className="text-[36px] font-medium leading-tight tracking-tight">{formatCurrency(account.price)}</span>
              {session.day > 0 && (
                <span className="text-[15px]">
                  <Change amount={dayMove} percent={(dayMove / previousClose) * 100} formatCurrency={formatCurrency} /> today
                </span>
              )}
            </div>
            <div className="mt-6">
              <LineChart
                points={points}
                height={300}
                slots={bars.length}
                markerIndex={startDay}
                markerLabel="you start"
                baseline={startClose}
                futureCaption={finished ? undefined : 'Later days are hidden'}
                ariaLabel={`${scenario.symbol} closing prices up to ${longDate(today.date)}. Later days are hidden.`}
                formatValue={formatCurrency}
                formatDate={shortDate}
              />
            </div>
          </section>

          {showTips && (
            <aside aria-label="What’s happening" className="flex items-start gap-3.5 rounded-lg bg-surface px-[18px] py-4">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
              <div className="flex-1 text-sm leading-relaxed">
                <strong className="font-semibold">{note.title}</strong>{' '}
                <span className="text-ink-2">{note.body}</span>
              </div>
              <button type="button" onClick={() => setShowTips(false)} className="shrink-0 text-xs text-muted hover:text-ink">Hide</button>
            </aside>
          )}

          <section aria-labelledby="practice-trades">
            <h2 id="practice-trades" className="text-lg font-semibold">Your trades</h2>
            {trades.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No trades yet. Holding cash is a choice too.</p>
            ) : (
              <ul className="mt-2">
                {[...trades].reverse().map(tx => (
                  <li key={tx.id} className="flex flex-wrap justify-between gap-3 border-b border-line-soft py-2.5 text-sm">
                    <span>
                      <span className={cn('font-semibold', tx.type === 'BUY' ? 'text-up' : 'text-down')}>
                        {tx.type === 'BUY' ? 'Bought' : 'Sold'}
                      </span>{' '}
                      {tx.shares} {tx.symbol}
                    </span>
                    <span className="text-muted">
                      {shortDate(tx.date)} · {formatCurrency(tx.pricePerShare ?? 0)} · {formatCurrency(tx.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6 self-start">
          {finished && (
            <section aria-labelledby="practice-results" className="rounded-lg border border-accent p-5">
              <h2 id="practice-results" className="text-lg font-semibold">Scenario complete</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                You finished at <strong className="text-ink">{formatCurrency(account.value)}</strong>{' '}
                ({signedPct(account.returnPct)}). Buying on day one and holding would have ended at{' '}
                <strong className="text-ink">{formatCurrency(holdValue)}</strong> ({signedPct(holdReturn)}).{' '}
                {Math.abs(lead) < 0.005
                  ? 'You matched buy-and-hold.'
                  : lead > 0
                    ? `You beat it by ${formatCurrency(lead)}.`
                    : `Buy-and-hold came out ${formatCurrency(-lead)} ahead this time.`}
              </p>
              <p className="mt-2 text-sm text-muted">
                {trades.length} trade{trades.length === 1 ? '' : 's'}
                {account.realized !== 0 && ` · realized ${account.realized > 0 ? '+' : '−'}${formatCurrency(Math.abs(account.realized))}`}
              </p>
              <button
                type="button"
                onClick={() => { setPlaying(false); begin(); }}
                className="mt-4 h-11 rounded-full bg-accent px-5 text-sm font-medium text-on-accent hover:bg-accent-strong"
              >
                Try again
              </button>
            </section>
          )}

          <section aria-labelledby="practice-account" className="rounded-lg border border-line p-5">
            <h2 id="practice-account" className="text-sm font-medium text-muted">Your practice account</h2>
            <p className="mt-1 text-[32px] font-medium leading-tight tracking-tight">{formatCurrency(account.value)}</p>
            <p className="mt-0.5 text-sm">
              <Change amount={account.value - scenario.startingCash} percent={account.returnPct * 100} formatCurrency={formatCurrency} /> since you started
            </p>
            <dl className="mt-4 text-sm">
              <div className="flex justify-between border-t border-line-soft py-2"><dt className="text-ink-2">Cash</dt><dd>{formatCurrency(account.cash)}</dd></div>
              <div className="flex justify-between border-t border-line-soft py-2">
                <dt className="text-ink-2">{scenario.symbol} shares</dt>
                <dd>{account.shares}{account.shares > 0 && <span className="text-muted"> · avg {formatCurrency(account.averageCost)}</span>}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-line-soft py-2">
                <dt className="text-ink-2">Buy and hold</dt>
                <dd className="text-right">
                  {formatCurrency(holdValue)}{' '}
                  <span className={holdReturn >= 0 ? 'text-up' : 'text-down'}>({holdReturn >= 0 ? '+' : '−'}{Math.abs(holdReturn * 100).toFixed(2)}%)</span>
                </dd>
              </div>
            </dl>
            <p className="mt-1 text-xs text-muted">
              Buy and hold = all {formatCurrency(scenario.startingCash)} into {scenario.symbol} on day one, never sold.
            </p>
          </section>

          {!finished && (
            <section aria-labelledby="practice-order" className="rounded-lg border border-line p-5">
              <h2 id="practice-order" className="text-sm font-medium text-muted">Place an order</h2>
              <form onSubmit={submit('BUY')} className="mt-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label htmlFor="practice-shares" className="text-sm text-ink-2">Shares of {scenario.symbol}</label>
                    <input
                      id="practice-shares"
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={sharesInput}
                      onChange={e => { setSharesInput(e.target.value); setOrderError(null); }}
                      placeholder="0"
                      className="mt-1 h-11 w-full rounded-lg border border-edge bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setSharesInput(String(maxBuyShares(account.cash, account.price)))}
                    className="h-11 rounded-full px-3 text-sm font-medium text-accent hover:bg-canvas"
                  >
                    Max
                  </button>
                  <button
                    type="button"
                    onClick={() => setSharesInput(String(account.shares))}
                    disabled={account.shares === 0}
                    className="h-11 rounded-full px-3 text-sm font-medium text-accent hover:bg-canvas disabled:text-muted"
                  >
                    All
                  </button>
                </div>
                <p className="mt-2 min-h-5 text-xs text-muted">
                  {preview != null && `≈ ${formatCurrency(preview)} at today’s close of ${formatCurrency(account.price)}`}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="submit" disabled={playing} className="h-11 rounded-full bg-accent text-sm font-medium text-on-accent hover:bg-accent-strong disabled:opacity-50">
                    Buy
                  </button>
                  <button type="button" onClick={() => submit('SELL')()} disabled={playing} className="h-11 rounded-full border border-edge text-sm font-medium text-ink hover:bg-surface disabled:opacity-50">
                    Sell
                  </button>
                </div>
                {playing && <p className="mt-2 text-xs text-muted">Pause to trade.</p>}
                {orderError && <p role="alert" className="mt-2 text-sm font-medium text-down">{orderError}</p>}
              </form>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
