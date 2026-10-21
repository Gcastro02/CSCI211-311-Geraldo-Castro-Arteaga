import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { HelpCircle, Info, LayoutGrid, Pause, Play, RefreshCw, RotateCcw, SkipForward } from 'lucide-react';
import { ExperienceLevel } from '../../types';
import {
  PracticeMarket,
  PracticeScenario,
  PracticeSession,
  SCENARIOS,
  ScenarioAsset,
  ScenarioGoal,
  accountState,
  advance,
  buildCustomScenario,
  buildMarket,
  buyAndHoldValue,
  closeAt,
  drawdownFromHigh,
  findScenario,
  goalStatus,
  isFinished,
  isValidSession,
  maxBuyShares,
  mysteryLabels,
  orderImpact,
  placeOrder,
  rescaleForMystery,
  scenarioStartDay,
  startSession,
  visibleBars,
  type OrderImpact,
  type OrderSide,
} from '../../lib/practice';
import { BOT_RULES, BotDecision, runBot } from '../../lib/practiceBot';
import { getDailyBars } from '../../services/openaiService';
import { DEFAULT_RISK_THRESHOLD } from '../../lib/portfolioMath';
import { needsOrderConfirmation, showsContextNotes } from '../../lib/level';
import { cn, localIsoDate, parseDay } from '../../lib/utils';
import { Change } from '../ui/Change';
import { LineChart } from '../ui/LineChart';

/** Separate from every `roth_ira_*` key: practice never touches real data. */
const STORAGE_KEY = 'practice_session';

const SPEEDS = [
  { label: '1×', ms: 600 },
  { label: '2×', ms: 300 },
  { label: '5×', ms: 120 },
];

// ---------------------------------------------------------------------------
// Loading prices

/** Markets per scenario, kept for the page's lifetime so revisiting doesn't refetch. */
const marketCache = new Map<string, PracticeMarket>();
const marketKey = (s: PracticeScenario) => [s.id, s.start, s.end, s.assets.map(a => a.symbol).join('+')].join('|');

/** Fetch every asset and align them. Lists the symbols that came back empty. */
async function loadMarket(scenario: PracticeScenario): Promise<{ market?: PracticeMarket; missing?: string[] }> {
  const key = marketKey(scenario);
  const cached = marketCache.get(key);
  if (cached) return { market: cached };

  const rows = await Promise.all(
    scenario.assets.map(asset => getDailyBars(asset.symbol, scenario.historyStart, scenario.end).catch(() => [])),
  );
  const missing = scenario.assets.filter((_, i) => rows[i].length === 0).map(a => a.symbol);
  if (missing.length) return { missing };

  const market = buildMarket(Object.fromEntries(scenario.assets.map((asset, i) => [asset.symbol, rows[i]])));
  if (!market) return { missing: scenario.assets.map(a => a.symbol) };
  const startDay = scenarioStartDay(market, scenario);
  // At least two weeks to trade, or it isn't much of a practice.
  if (startDay < 0 || market.dates.length - startDay < 10) return { missing: scenario.assets.map(a => a.symbol) };

  marketCache.set(key, market);
  return { market };
}

const readSaved = (): PracticeSession | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const scenarioOf = (session: PracticeSession | null) =>
  session ? session.custom ?? findScenario(session.scenarioId) ?? null : null;

// ---------------------------------------------------------------------------
// Wording

const longDate = (date: string) =>
  parseDay(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const shortDate = (date: string) =>
  parseDay(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const monthYear = (date: string) =>
  parseDay(date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

/** '+1.23%' or '−1.23%' (a true minus sign, like the rest of the app). */
const signedPct = (fraction: number) => `${fraction >= 0 ? '+' : '−'}${Math.abs(fraction * 100).toFixed(2)}%`;

const listJoin = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** Plain-language read on how far an asset has fallen from its high so far. */
const coachNote = (drawdown: number, label: string, isFund: boolean) => {
  const pct = Math.abs(drawdown * 100).toFixed(1);
  if (drawdown > -0.05) {
    return {
      title: drawdown > -0.0005 ? `${label} is at its highest close so far.` : `${label} is ${pct}% below its high so far.`,
      body: isFund
        ? 'Small dips like this happen all the time. It’s a fund holding many companies, so it moves with that part of the market as a whole.'
        : 'Small dips like this happen all the time — and a single company usually swings more than the market as a whole.',
    };
  }
  if (drawdown > -0.1) {
    return { title: `${label} is ${pct}% below its high.`, body: 'Drops of 5–10% happen in most years. Notice how it feels to watch your account fall — that feeling is part of what you’re practicing.' };
  }
  if (drawdown > -0.2) {
    return { title: `${label} is ${pct}% below its high — a “correction”.`, body: 'A fall of 10% or more is called a correction. Some investors sell to stop further losses; others hold or buy at lower prices. Neither is automatically right.' };
  }
  return { title: `${label} is ${pct}% below its high — a “bear market”.`, body: 'A fall of 20% or more is a bear market. Selling locks in the loss; holding means riding it out without knowing where the bottom is. Decide, then see what happens.' };
};

const goalText = (goal: ScenarioGoal, startingCash: number, formatCurrency: (n: number) => string) => {
  switch (goal.kind) {
    case 'MAX_DRAWDOWN':
      return `Never let your account fall more than ${(goal.limit * 100).toFixed(0)}% below ${formatCurrency(startingCash)}.`;
    case 'FINISH_ABOVE':
      return goal.value === startingCash
        ? `Finish with more than the ${formatCurrency(startingCash)} you started with.`
        : `Finish with at least ${formatCurrency(goal.value)}.`;
    case 'BEAT_BUY_AND_HOLD':
      return 'Finish ahead of buy-and-hold.';
  }
};

/** One line on how the player did against each rival; `lead` is the player's value minus theirs. */
const standingsSentence = (rivals: Array<{ name: string; lead: number }>) => {
  const beat = rivals.filter(r => r.lead > 0.005).map(r => r.name);
  const behind = rivals.filter(r => r.lead < -0.005).map(r => r.name);
  const matched = rivals.filter(r => Math.abs(r.lead) <= 0.005).map(r => r.name);
  if (beat.length === 2) return `You beat both ${listJoin(beat)}.`;
  if (behind.length === 2) return `${listJoin(behind).replace(/^t/, 'T')} both finished ahead of you this time.`;
  if (matched.length === 2) return 'You matched both.';
  const first = beat.length ? `You beat ${beat[0]}` : `You matched ${matched[0]}`;
  return behind.length ? `${first}, but ${behind[0]} came out ahead.` : `${first} and matched ${matched[0]}.`;
};

const pct = (fraction: number) => `${(fraction * 100).toFixed(0)}%`;

/** "MACD above…" stays as is; "Trading above…" becomes "trading above…". */
const lowerFirst = (text: string) => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);

const botReason = (decision: BotDecision, formatCurrency: (n: number) => string) => {
  if (decision.kind === 'BUY') {
    const why = listJoin((decision.reasons ?? []).slice(0, 2).map(lowerFirst));
    return `Indicators leaned positive (${pct(decision.confidence ?? 0)} confidence)${why ? `: ${why}` : ''}.`
      + (decision.capped ? ` Kept to ${pct(BOT_RULES.riskLimit)} of the account.` : '');
  }
  const move = Math.abs((decision.returnPct ?? 0) * 100).toFixed(1);
  const cost = formatCurrency(decision.averageCost ?? 0);
  return decision.kind === 'STOP_LOSS'
    ? `Stop-loss: down ${move}% from its average cost of ${cost}.`
    : `Take-profit: up ${move}% from its average cost of ${cost}.`;
};

// ---------------------------------------------------------------------------

interface PracticeScreenProps {
  formatCurrency: (amount: number) => string;
  level: ExperienceLevel;
}

interface PendingOrder {
  symbol: string;
  side: OrderSide;
  shares: number;
  impact: OrderImpact;
  /** Over the single-company limit — the only reason an intermediate is asked. */
  overLimit: boolean;
}

export function PracticeScreen({ formatCurrency, level }: PracticeScreenProps) {
  const [saved] = useState(readSaved);
  const [scenario, setScenario] = useState<PracticeScenario | null>(() => scenarioOf(saved));
  const [baseMarket, setBaseMarket] = useState<PracticeMarket | null>(null);
  const [session, setSession] = useState<PracticeSession | null>(null);
  /** False until a saved session has been restored (or found unusable). */
  const [restored, setRestored] = useState(() => !scenarioOf(saved));
  /** Which scenario card is loading, and any error per card. */
  const [launching, setLaunching] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<{ id: string; message: string } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [sharesInput, setSharesInput] = useState('');
  const [orderError, setOrderError] = useState<string | null>(null);
  const [showTips, setShowTips] = useState(() => showsContextNotes(level));
  /** An order waiting for the player to confirm it, per their level. */
  const [pending, setPending] = useState<PendingOrder | null>(null);
  const [custom, setCustom] = useState({ symbols: 'AAPL, MSFT', start: '2019-01-02', end: '2019-12-31', startingCash: '10000' });
  const [allBotTrades, setAllBotTrades] = useState(false);

  // Resume a saved session: fetch its prices, then check it still fits them.
  useEffect(() => {
    if (restored || !saved || !scenario) return;
    let cancelled = false;
    loadMarket(scenario).then(({ market }) => {
      if (cancelled) return;
      if (market && isValidSession(saved, market)) {
        setBaseMarket(market);
        setSession(saved);
      } else {
        setScenario(null);
      }
      setRestored(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage full or blocked: the session still works, it just won't resume.
    }
  }, [session, restored]);

  const mystery = Boolean(session?.mystery);
  const startDay = baseMarket && scenario ? scenarioStartDay(baseMarket, scenario) : -1;
  // Mystery mode trades on rescaled prices; returns are identical.
  const market = useMemo(
    () => (baseMarket && mystery ? rescaleForMystery(baseMarket, startDay) : baseMarket),
    [baseMarket, mystery, startDay],
  );
  const finished = Boolean(session && market && isFinished(session, market));
  // The bot is replayed once per market rather than on every tick. Each of its
  // decisions sees only bars up to that day (checked by verify:bot), and the
  // screen shows its account and trades only as of the simulated today.
  const bot = useMemo(() => (market && scenario ? runBot(market, scenario) : null), [market, scenario]);

  // Auto-advance one day per tick while playing.
  useEffect(() => {
    if (!playing || !market) return;
    if (finished) {
      setPlaying(false);
      return;
    }
    const timer = setInterval(() => {
      setSession(prev => (prev ? advance(prev, market, 1) : prev));
    }, SPEEDS[speed].ms);
    return () => clearInterval(timer);
  }, [playing, market, finished, speed]);

  const launch = async (next: PracticeScenario, options: { mystery?: boolean; custom?: boolean } = {}) => {
    const cardId = options.mystery ? 'mystery' : next.id;
    setLaunching(cardId);
    setLaunchError(null);
    const { market: loaded, missing } = await loadMarket(next);
    setLaunching(null);
    if (!loaded) {
      setLaunchError({
        id: cardId,
        message: options.custom && missing?.length
          ? `Couldn’t get prices for ${listJoin(missing)} in that period. Check the ticker${missing.length > 1 ? 's' : ''}, or pick dates when ${missing.length > 1 ? 'they all' : 'it'} traded.`
          : 'Couldn’t load the price history. Check your connection and try again.',
      });
      return;
    }
    setScenario(next);
    setBaseMarket(loaded);
    setSession(startSession(next, loaded, options));
    setSelected(next.assets[0].symbol);
    setSharesInput('');
    setOrderError(null);
    setPending(null);
    setPlaying(false);
    setAllBotTrades(false);
    setRestored(true);
  };

  const leave = () => {
    if (session && session.transactions.length > 1 && !finished
      && !window.confirm('Leave this scenario? Your practice trades in it will be cleared.')) return;
    setPlaying(false);
    setSession(null);
    setPending(null);
  };

  // ---------------------------------------------------------------------------
  // Before a session: pick a scenario.
  if (!session || !market || !scenario) {
    if (!restored) {
      return (
        <p className="flex items-center gap-2 py-16 text-sm text-muted">
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> Resuming your practice…
        </p>
      );
    }

    const cardButton = (id: string, label: string, onClick: () => void) => (
      <div className="mt-4">
        <button
          type="button"
          onClick={onClick}
          disabled={launching !== null}
          className="flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-on-accent hover:bg-accent-strong disabled:opacity-60"
        >
          {launching === id && <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {launching === id ? 'Loading prices…' : label}
        </button>
        {launchError?.id === id && <p role="alert" className="mt-2 text-sm text-down">{launchError.message}</p>}
      </div>
    );

    const submitCustom = (event: FormEvent) => {
      event.preventDefault();
      const built = buildCustomScenario({ ...custom, startingCash: Number(custom.startingCash) }, localIsoDate());
      if (built.error) {
        setLaunchError({ id: 'custom', message: built.error });
        return;
      }
      launch(built.scenario!, { custom: true });
    };

    const fieldClass = 'mt-1 h-11 w-full rounded-lg border border-edge bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none';

    return (
      <div className="flex flex-col gap-8">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold">Practice</h1>
          <p className="mt-1 text-sm text-ink-2">
            Trade play money through real market history, one day at a time. Nothing here touches your real portfolio.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-ink-2">
            <li>• You see each day as it happened — and nothing after it, so hindsight can’t help you.</li>
            <li>• Orders fill at that day’s closing price.</li>
            <li>• A bot trades the same days by fixed rules. At the end, you’re compared with it and with buying on day one and holding.</li>
          </ul>
        </div>

        <section aria-label="Scenarios" className="grid gap-4 md:grid-cols-2">
          {SCENARIOS.map(option => (
            <div key={option.id} className="flex flex-col rounded-lg border border-line p-5">
              <p className="text-xs font-medium text-accent">{monthYear(option.start)} – {monthYear(option.end)}</p>
              <h2 className="mt-1 text-lg font-semibold">{option.name}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{option.summary}</p>
              <ul className="mt-3 space-y-0.5 text-sm">
                {option.assets.map(asset => (
                  <li key={asset.symbol}>
                    <span className="font-mono font-medium">{asset.symbol}</span>
                    <span className="text-muted"> — {asset.name}</span>
                  </li>
                ))}
              </ul>
              {level === 'BEGINNER' && option.goal && (
                <p className="mt-3 text-sm"><span className="font-medium">Goal:</span> <span className="text-ink-2">{goalText(option.goal, option.startingCash, formatCurrency)}</span></p>
              )}
              <div className="mt-auto">{cardButton(option.id, `Start with ${formatCurrency(option.startingCash)}`, () => launch(option))}</div>
            </div>
          ))}

          <div className="flex flex-col rounded-lg border border-dashed border-edge p-5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-accent"><HelpCircle className="h-3.5 w-3.5" aria-hidden="true" /> No hindsight</p>
            <h2 className="mt-1 text-lg font-semibold">Mystery scenario</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              One of the scenarios above, picked at random, with its name, dates and tickers hidden. Prices start at 100,
              so their level doesn’t give it away either. You find out which it was at the end.
            </p>
            <div className="mt-auto">
              {cardButton('mystery', 'Start a mystery', () => launch(SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)], { mystery: true }))}
            </div>
          </div>

          {level === 'ADVANCED' && (
            <form onSubmit={submitCustom} className="flex flex-col rounded-lg border border-line p-5" aria-labelledby="custom-heading">
              <p className="text-xs font-medium text-accent">Advanced</p>
              <h2 id="custom-heading" className="mt-1 text-lg font-semibold">Build your own</h2>
              <p className="mt-2 text-sm text-ink-2">Up to three tickers, any stretch from 1994 up to yesterday (three years at most).</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="custom-symbols" className="text-sm text-ink-2">Tickers</label>
                  <input id="custom-symbols" value={custom.symbols} onChange={e => setCustom(c => ({ ...c, symbols: e.target.value }))} className={cn(fieldClass, 'uppercase')} />
                </div>
                <div>
                  <label htmlFor="custom-start" className="text-sm text-ink-2">Start</label>
                  <input id="custom-start" type="date" value={custom.start} onChange={e => setCustom(c => ({ ...c, start: e.target.value }))} className={fieldClass} />
                </div>
                <div>
                  <label htmlFor="custom-end" className="text-sm text-ink-2">End</label>
                  <input id="custom-end" type="date" value={custom.end} onChange={e => setCustom(c => ({ ...c, end: e.target.value }))} className={fieldClass} />
                </div>
                <div>
                  <label htmlFor="custom-cash" className="text-sm text-ink-2">Starting cash</label>
                  <input id="custom-cash" type="number" min="100" step="100" value={custom.startingCash} onChange={e => setCustom(c => ({ ...c, startingCash: e.target.value }))} className={fieldClass} />
                </div>
              </div>
              <div className="mt-4">
                <button
                  type="submit"
                  disabled={launching !== null}
                  className="flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-on-accent hover:bg-accent-strong disabled:opacity-60"
                >
                  {launching === 'custom' && <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {launching === 'custom' ? 'Loading prices…' : 'Build and start'}
                </button>
                {launchError?.id === 'custom' && <p role="alert" className="mt-2 text-sm text-down">{launchError.message}</p>}
              </div>
            </form>
          )}
        </section>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // During and after a session.
  const labels = mystery ? mysteryLabels(scenario) : Object.fromEntries(scenario.assets.map(a => [a.symbol, a.symbol]));
  const asset: ScenarioAsset = scenario.assets.find(a => a.symbol === selected) ?? scenario.assets[0];
  const label = labels[asset.symbol];
  const assetDescription = (a: ScenarioAsset) => (mystery ? (a.isFund ? 'A fund holding many companies' : 'A single company') : a.name);
  const dayLabel = (index: number) => {
    const n = index - startDay + 1;
    // History before trading starts counts down with a true minus sign: Day −20.
    return n >= 1 ? `Day ${n}` : `Day −${1 - n}`;
  };
  const dateIndex = new Map(market.dates.map((d, i) => [d, i]));
  const showDate = (date: string) => (mystery ? dayLabel(dateIndex.get(date) ?? 0) : shortDate(date));

  const today = market.dates[session.day];
  const account = accountState(session, market, scenario);
  const position = account.positions.find(p => p.symbol === asset.symbol)!;
  const holdValue = buyAndHoldValue(market, scenario, session.day);
  const holdReturn = holdValue / scenario.startingCash - 1;
  const price = position.price;
  const previousClose = session.day > 0 ? closeAt(market, asset.symbol, session.day - 1) : price;
  const dayMove = price - previousClose;
  const trades = session.transactions.filter(tx => tx.type === 'BUY' || tx.type === 'SELL');
  const note = coachNote(drawdownFromHigh(market.bars[asset.symbol], session.day), label, asset.isFund);
  const held = account.positions.filter(p => p.shares > 0);
  const goal = level === 'BEGINNER' ? scenario.goal : undefined;
  const goalState = goal ? goalStatus(goal, session, market, scenario) : null;
  const botAccount = accountState(bot!.session, market, scenario, session.day);
  const botTrades = bot!.session.transactions.filter(tx => (tx.type === 'BUY' || tx.type === 'SELL') && tx.date <= today);
  const botDecisions = new Map(bot!.decisions.map(d => [d.txId, d]));
  const shownBotTrades = allBotTrades ? botTrades : botTrades.slice(0, 8);
  const standings = [
    { name: 'You', value: account.value },
    { name: 'The bot', value: botAccount.value },
    { name: 'Buy and hold', value: holdValue },
  ].sort((a, b) => b.value - a.value);
  const rivals = [
    { name: 'the bot', lead: account.value - botAccount.value },
    { name: 'buy-and-hold', lead: account.value - holdValue },
  ];
  const sharesNum = Number(sharesInput);
  const preview = sharesInput && Number.isFinite(sharesNum) && sharesNum > 0 ? sharesNum * price : null;

  // Everything shown reads prices through `visibleBars` only.
  const points = visibleBars(market.bars[asset.symbol], session.day).map(bar => ({ date: bar.date, value: bar.close ?? bar.price }));

  // Concentration limits are about single companies; a fund is exempt.
  const riskLimit = asset.isFund ? Infinity : DEFAULT_RISK_THRESHOLD;

  const step = (days: number) => {
    setOrderError(null);
    setPending(null);
    setSession(advance(session, market, days));
  };

  const restart = () => {
    if (!window.confirm('Restart this scenario? Your practice trades will be cleared.')) return;
    setPlaying(false);
    setPending(null);
    setSession(startSession(scenario, baseMarket!, { mystery, custom: Boolean(session.custom) }));
  };

  const execute = (symbol: string, side: OrderSide, shares: number) => {
    const result = placeOrder(session, market, scenario, symbol, side, shares);
    if (result.error) {
      setOrderError(result.error);
      return;
    }
    setSession(result.session!);
    setSharesInput('');
    setOrderError(null);
    setPending(null);
  };

  const submit = (side: OrderSide) => (event?: FormEvent) => {
    event?.preventDefault();
    const shares = Number(sharesInput);
    const impact = orderImpact(session, market, scenario, asset.symbol, side, shares);
    if (!impact) {
      setOrderError(placeOrder(session, market, scenario, asset.symbol, side, shares).error ?? 'That order can’t be placed.');
      return;
    }
    const overLimit = side === 'BUY' && impact.weightAfter > riskLimit;
    if (needsOrderConfirmation(level, { side, weightAfter: impact.weightAfter }, riskLimit)) {
      setPending({ symbol: asset.symbol, side, shares, impact, overLimit });
      setOrderError(null);
      return;
    }
    execute(asset.symbol, side, shares);
  };

  const controlClass =
    'flex h-11 items-center gap-2 rounded-full border border-edge px-4 text-sm font-medium text-ink hover:bg-surface disabled:opacity-50';
  const yardstick = scenario.assets.length === 1
    ? `all ${formatCurrency(scenario.startingCash)} into ${labels[scenario.assets[0].symbol]} on day one, never sold`
    : `${formatCurrency(scenario.startingCash)} split evenly across ${listJoin(scenario.assets.map(a => labels[a.symbol]))} on day one, never sold`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            Practice · {mystery ? 'Mystery scenario' : scenario.name}
            <span className="rounded-full bg-note px-2.5 py-0.5 text-xs font-medium text-note-ink">Play money</span>
          </p>
          <h1 className="mt-1 text-[28px] font-medium tracking-tight">{mystery ? dayLabel(session.day) : longDate(today)}</h1>
          <p className="mt-0.5 text-sm text-muted">
            Day {session.day - startDay + 1} of {market.dates.length - startDay} · orders fill at the day’s closing price
          </p>
        </div>
        <div role="group" aria-label="Time controls" className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setPending(null); setPlaying(p => !p); }} disabled={finished} className={controlClass}>
            {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
            {playing ? 'Pause' : 'Play'}
          </button>
          <div role="group" aria-label="Play speed" className="flex rounded-full border border-edge p-0.5 text-xs font-medium">
            {SPEEDS.map((option, i) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setSpeed(i)}
                aria-pressed={speed === i}
                aria-label={`Speed ${option.label}`}
                className={cn('h-9 min-w-9 rounded-full px-2 transition-colors', speed === i ? 'bg-chip text-ink' : 'text-muted hover:text-ink')}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => step(1)} disabled={finished || playing} className={controlClass}>Next day</button>
          <button type="button" onClick={() => step(5)} disabled={finished || playing} className={controlClass}>Next week</button>
          <button type="button" onClick={() => step(market.dates.length)} disabled={finished || playing} className={controlClass}>
            <SkipForward className="h-4 w-4" aria-hidden="true" /> To the end
          </button>
          <button type="button" onClick={restart} className="flex h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-accent hover:bg-surface">
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Restart
          </button>
          <button type="button" onClick={leave} className="flex h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-accent hover:bg-surface">
            <LayoutGrid className="h-4 w-4" aria-hidden="true" /> New scenario
          </button>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-8">
          {/* Asset picker, price and chart */}
          <section aria-label={`${label} so far`}>
            {scenario.assets.length > 1 && (
              <div role="tablist" aria-label="Assets" className="mb-5 flex flex-wrap gap-1 border-b border-line">
                {scenario.assets.map(a => {
                  const active = a.symbol === asset.symbol;
                  const close = closeAt(market, a.symbol, session.day);
                  const prev = session.day > 0 ? closeAt(market, a.symbol, session.day - 1) : close;
                  return (
                    <button
                      key={a.symbol}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => { setSelected(a.symbol); setSharesInput(''); setPending(null); setOrderError(null); }}
                      className={cn(
                        '-mb-px flex items-baseline gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors',
                        active ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink',
                      )}
                    >
                      <span className="font-mono font-medium">{labels[a.symbol]}</span>
                      <Change percent={(close / prev - 1) * 100} className="text-xs" />
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
              <span className="font-mono text-sm text-muted">{label}</span>
              <span className="text-[36px] font-medium leading-tight tracking-tight">{formatCurrency(price)}</span>
              {session.day > 0 && (
                <span className="text-[15px]">
                  <Change amount={dayMove} percent={(dayMove / previousClose) * 100} formatCurrency={formatCurrency} /> today
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted">{assetDescription(asset)}{mystery && ' · prices rescaled to start at 100'}</p>
            <div className="mt-6">
              <LineChart
                points={points}
                height={300}
                slots={market.dates.length}
                markerIndex={startDay}
                markerLabel="you start"
                baseline={closeAt(market, asset.symbol, startDay)}
                futureCaption={finished ? undefined : 'Later days are hidden'}
                ariaLabel={`${label} closing prices up to ${mystery ? dayLabel(session.day) : longDate(today)}. Later days are hidden.`}
                formatValue={formatCurrency}
                formatDate={showDate}
              />
            </div>
          </section>

          {!showTips && (
            <button type="button" onClick={() => setShowTips(true)} className="self-start text-sm text-accent hover:underline">
              Show market notes
            </button>
          )}
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
                      {tx.shares} <span className="font-mono">{labels[tx.symbol ?? ''] ?? tx.symbol}</span>
                    </span>
                    <span className="text-muted">
                      {showDate(tx.date)} · {formatCurrency(tx.pricePerShare ?? 0)} · {formatCurrency(tx.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {finished && (
            <section aria-labelledby="practice-bot-trades">
              <h2 id="practice-bot-trades" className="text-lg font-semibold">The bot’s trades</h2>
              {botTrades.length === 0 ? (
                <p className="mt-2 text-sm text-muted">The bot never saw a reason to trade, so it held cash the whole time.</p>
              ) : (
                <>
                  <ul className="mt-2">
                    {shownBotTrades.map(tx => {
                      const decision = botDecisions.get(tx.id);
                      return (
                        <li key={tx.id} className="border-b border-line-soft py-2.5 text-sm">
                          <div className="flex flex-wrap justify-between gap-3">
                            <span>
                              <span className={cn('font-semibold', tx.type === 'BUY' ? 'text-up' : 'text-down')}>
                                {tx.type === 'BUY' ? 'Bought' : 'Sold'}
                              </span>{' '}
                              {tx.shares} <span className="font-mono">{labels[tx.symbol ?? ''] ?? tx.symbol}</span>
                            </span>
                            <span className="text-muted">
                              {showDate(tx.date)} · {formatCurrency(tx.pricePerShare ?? 0)} · {formatCurrency(tx.amount)}
                            </span>
                          </div>
                          {decision && <p className="mt-0.5 text-ink-2">{botReason(decision, formatCurrency)}</p>}
                        </li>
                      );
                    })}
                  </ul>
                  {botTrades.length > shownBotTrades.length && (
                    <button type="button" onClick={() => setAllBotTrades(true)} className="mt-2 text-sm text-accent hover:underline">
                      Show all {botTrades.length} trades
                    </button>
                  )}
                </>
              )}
            </section>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-6 self-start">
          {finished && (
            <section aria-labelledby="practice-results" className="rounded-lg border border-accent p-5">
              <h2 id="practice-results" className="text-lg font-semibold">Scenario complete</h2>
              <ol aria-label="Final standings" className="mt-3 text-sm">
                {standings.map((s, i) => (
                  <li
                    key={s.name}
                    className={cn('flex justify-between gap-3 border-t border-line-soft py-2', s.name === 'You' && 'font-semibold text-ink')}
                  >
                    <span className={s.name === 'You' ? undefined : 'text-ink-2'}>{i + 1}. {s.name}</span>
                    <span className="text-right">
                      {formatCurrency(s.value)}{' '}
                      <span className={s.value >= scenario.startingCash ? 'text-up' : 'text-down'}>
                        ({signedPct(s.value / scenario.startingCash - 1)})
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{standingsSentence(rivals)}</p>
              {goal && goalState && (
                <p className={cn('mt-2 text-sm font-medium', goalState.met ? 'text-up' : 'text-down')}>
                  {goalState.met ? 'Goal met' : 'Goal missed'}: {goalText(goal, scenario.startingCash, formatCurrency)}
                </p>
              )}
              <p className="mt-2 text-sm text-muted">
                {trades.length} trade{trades.length === 1 ? '' : 's'}
                {account.realized !== 0 && ` · realized ${account.realized > 0 ? '+' : '−'}${formatCurrency(Math.abs(account.realized))}`}
              </p>
              {mystery && (
                <div className="mt-3 rounded-lg bg-surface px-4 py-3 text-sm leading-relaxed">
                  <p className="font-semibold">It was {scenario.name.charAt(0).toLowerCase() + scenario.name.slice(1)}</p>
                  <p className="mt-1 text-ink-2">
                    {longDate(market.dates[startDay])} to {longDate(market.dates[market.dates.length - 1])}.{' '}
                    {listJoin(scenario.assets.map(a => `${labels[a.symbol]} was ${a.symbol}`))}.
                  </p>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={restart} className="h-11 rounded-full bg-accent px-5 text-sm font-medium text-on-accent hover:bg-accent-strong">
                  Try again
                </button>
                <button type="button" onClick={leave} className="h-11 rounded-full border border-edge px-5 text-sm font-medium text-ink hover:bg-surface">
                  Another scenario
                </button>
              </div>
            </section>
          )}

          {goal && goalState && !finished && (
            <section aria-labelledby="practice-goal" className="rounded-lg border border-line p-5">
              <h2 id="practice-goal" className="text-sm font-medium text-muted">Your goal</h2>
              <p className="mt-1 text-sm font-medium">{goalText(goal, scenario.startingCash, formatCurrency)}</p>
              <p className={cn('mt-2 text-sm', goalState.met === false ? 'text-down' : 'text-ink-2')}>
                {goal.kind === 'MAX_DRAWDOWN'
                  ? goalState.met === false
                    ? `Missed — your account fell ${Math.abs(goalState.current * 100).toFixed(1)}% below where you started.`
                    : `Lowest point so far: ${goalState.current >= -0.0005 ? 'never below your starting cash' : signedPct(goalState.current)}.`
                  : goal.kind === 'FINISH_ABOVE'
                    ? `Now: ${formatCurrency(goalState.current)}. Judged on the last day.`
                    : `Now ${formatCurrency(Math.abs(goalState.current))} ${goalState.current >= 0 ? 'ahead of' : 'behind'} buy-and-hold. Judged on the last day.`}
              </p>
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
              {held.length === 0 ? (
                <div className="flex justify-between border-t border-line-soft py-2"><dt className="text-ink-2">Shares</dt><dd className="text-muted">None yet</dd></div>
              ) : (
                held.map(p => (
                  <div key={p.symbol} className="flex justify-between gap-3 border-t border-line-soft py-2">
                    <dt className="text-ink-2"><span className="font-mono">{labels[p.symbol]}</span> · {p.shares}</dt>
                    <dd className="text-right">{formatCurrency(p.value)} <span className="text-muted">· avg {formatCurrency(p.averageCost)}</span></dd>
                  </div>
                ))
              )}
              <div className="flex justify-between gap-3 border-t border-line-soft py-2">
                <dt className="text-ink-2">Buy and hold</dt>
                <dd className="text-right">
                  {formatCurrency(holdValue)}{' '}
                  <span className={holdReturn >= 0 ? 'text-up' : 'text-down'}>({signedPct(holdReturn)})</span>
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-line-soft py-2">
                <dt className="text-ink-2">Bot</dt>
                <dd className="text-right">
                  {formatCurrency(botAccount.value)}{' '}
                  <span className={botAccount.returnPct >= 0 ? 'text-up' : 'text-down'}>({signedPct(botAccount.returnPct)})</span>
                </dd>
              </div>
            </dl>
            <p className="mt-1 text-xs text-muted">Buy and hold = {yardstick}.</p>
          </section>

          <details open={level === 'BEGINNER'} className="rounded-lg border border-line p-5">
            <summary className="cursor-pointer text-sm font-medium text-muted hover:text-ink">How the bot trades</summary>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-2">
              {level === 'BEGINNER' ? (
                <li>
                  Each day it looks at the same price history you see — which way prices are trending, and whether they’ve
                  risen or fallen unusually fast — and buys when those signs lean at least {pct(BOT_RULES.minConfidence)} positive.
                </li>
              ) : (
                <li>
                  Each day it scores RSI, MACD, the 20-day average, Bollinger position and the 5/20-day trend from −100 to +100,
                  reads that as a probability, and buys at {pct(BOT_RULES.minConfidence)} or more.
                </li>
              )}
              <li>
                The surer it is, the more it buys. It always keeps {pct(BOT_RULES.cashBuffer)} of its cash, and never puts more
                than {pct(BOT_RULES.riskLimit)} of the account into one company.
              </li>
              <li>
                It sells a whole holding once it’s {pct(BOT_RULES.stopLoss)} below what it paid (a stop-loss) or{' '}
                {pct(BOT_RULES.takeProfit)} above it (taking profit).
              </li>
              <li>
                Like you, it sees nothing after today. Its trades, and why it made each one, are shown at the end.
              </li>
            </ul>
          </details>

          {!finished && (
            <section aria-labelledby="practice-order" className="rounded-lg border border-line p-5">
              <h2 id="practice-order" className="text-sm font-medium text-muted">Place an order</h2>
              <form onSubmit={submit('BUY')} className="mt-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label htmlFor="practice-shares" className="text-sm text-ink-2">Shares of {label}</label>
                    <input
                      id="practice-shares"
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={sharesInput}
                      onChange={e => { setSharesInput(e.target.value); setOrderError(null); setPending(null); }}
                      placeholder="0"
                      className="mt-1 h-11 w-full rounded-lg border border-edge bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setSharesInput(String(maxBuyShares(account.cash, price)))}
                    className="h-11 rounded-full px-3 text-sm font-medium text-accent hover:bg-canvas"
                  >
                    Max
                  </button>
                  <button
                    type="button"
                    onClick={() => setSharesInput(String(position.shares))}
                    disabled={position.shares === 0}
                    className="h-11 rounded-full px-3 text-sm font-medium text-accent hover:bg-canvas disabled:text-muted"
                  >
                    All
                  </button>
                </div>
                <p className="mt-2 min-h-5 text-xs text-muted">
                  {preview != null && `≈ ${formatCurrency(preview)} at today’s close of ${formatCurrency(price)}`}
                </p>
                {pending ? (
                  <div role="region" aria-label="Confirm order" className="mt-2 rounded-lg bg-surface p-4 text-sm leading-relaxed">
                    <p className="font-semibold">{pending.overLimit && level !== 'BEGINNER' ? 'Heads up' : 'Check this order'}</p>
                    <ul className="mt-2 space-y-1.5 text-ink-2">
                      {pending.side === 'BUY' ? (
                        <>
                          <li>
                            Buy {pending.shares} {labels[pending.symbol]} at today’s closing price of {formatCurrency(pending.impact.price)},
                            for {formatCurrency(pending.impact.amount)}.
                          </li>
                          <li>
                            Afterwards {labels[pending.symbol]} will be {(pending.impact.weightAfter * 100).toFixed(0)}% of your account,
                            with {formatCurrency(pending.impact.cashAfter)} left in cash.
                          </li>
                          {pending.overLimit && (
                            <li className="text-warn-ink">
                              That’s above the {(DEFAULT_RISK_THRESHOLD * 100).toFixed(0)}% the app treats as a lot to have in one company.
                            </li>
                          )}
                          {level === 'BEGINNER' && asset.isFund && (
                            <li>{labels[pending.symbol]} is a fund, so one share spreads your money across many companies.</li>
                          )}
                          {level === 'BEGINNER' && (
                            <li>If {labels[pending.symbol]} fell 10% from here, these shares would lose {formatCurrency(pending.impact.amount * 0.1)}.</li>
                          )}
                        </>
                      ) : (
                        <>
                          <li>
                            Sell {pending.shares} {labels[pending.symbol]} at today’s closing price of {formatCurrency(pending.impact.price)},
                            for {formatCurrency(pending.impact.amount)}.
                          </li>
                          <li>
                            {(pending.impact.realizedGain ?? 0) > 0.005
                              ? `That locks in a gain of ${formatCurrency(pending.impact.realizedGain!)} on these shares.`
                              : (pending.impact.realizedGain ?? 0) < -0.005
                                ? `That locks in a loss of ${formatCurrency(-pending.impact.realizedGain!)} on these shares — once sold, they can’t recover it.`
                                : 'You break even on these shares.'}
                          </li>
                          <li>
                            Afterwards you’ll hold {pending.impact.sharesAfter} share{pending.impact.sharesAfter === 1 ? '' : 's'} of{' '}
                            {labels[pending.symbol]} and {formatCurrency(pending.impact.cashAfter)} in cash.
                          </li>
                        </>
                      )}
                    </ul>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => execute(pending.symbol, pending.side, pending.shares)}
                        className="h-11 rounded-full bg-accent text-sm font-medium text-on-accent hover:bg-accent-strong"
                      >
                        Confirm {pending.side === 'BUY' ? 'buy' : 'sale'}
                      </button>
                      <button type="button" onClick={() => setPending(null)} className="h-11 rounded-full border border-edge text-sm font-medium text-ink hover:bg-canvas">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="submit" disabled={playing} className="h-11 rounded-full bg-accent text-sm font-medium text-on-accent hover:bg-accent-strong disabled:opacity-50">
                      Buy
                    </button>
                    <button type="button" onClick={() => submit('SELL')()} disabled={playing} className="h-11 rounded-full border border-edge text-sm font-medium text-ink hover:bg-surface disabled:opacity-50">
                      Sell
                    </button>
                  </div>
                )}
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
