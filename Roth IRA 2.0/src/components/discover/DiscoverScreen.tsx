import { Check, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { AccountType, MarketSuggestion } from '../../types';

interface DiscoverScreenProps {
  suggestions: MarketSuggestion[];
  isLoading: boolean;
  /** Undefined when AI features are not configured. */
  onGenerate?: () => void;
  watchlistSymbols: string[];
  onAddToWatchlist: (symbol: string) => void;
  onOpenStock: (symbol: string) => void;
  accountType: AccountType;
}

/**
 * Ideas from the language model, framed as starting points. The model has no
 * live market or news access during a request, so the copy says so rather
 * than implying it scanned today's market.
 */
export function DiscoverScreen({
  suggestions,
  isLoading,
  onGenerate,
  watchlistSymbols,
  onAddToWatchlist,
  onOpenStock,
  accountType,
}: DiscoverScreenProps) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold">Discover</h1>
          <p className="mt-1 text-sm text-ink-2">
            Ideas to research, suggested by a language model for{' '}
            {accountType === 'ROTH_IRA' ? 'a Roth IRA' : 'a brokerage account'} and your investment horizon. The
            model works from what it learned in training — it can’t see today’s prices or news — so open each one
            and check its chart, stats and headlines before acting.
          </p>
        </div>
        {onGenerate && (
          <button
            type="button"
            onClick={onGenerate}
            disabled={isLoading}
            className="flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-on-accent hover:bg-accent-strong disabled:opacity-60"
          >
            {isLoading
              ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            {isLoading ? 'Thinking…' : suggestions.length ? 'New ideas' : 'Suggest ideas'}
          </button>
        )}
      </div>

      {!onGenerate ? (
        <div className="rounded-lg border border-line p-6">
          <h2 className="text-base font-semibold">AI features are off</h2>
          <p className="mt-1 text-sm text-ink-2">
            Discover needs an OpenAI API key. Add <code className="font-mono text-[13px]">VITE_OPENAI_API_KEY</code> to
            the app’s <code className="font-mono text-[13px]">.env</code> file and restart it. Everything else in the
            app works without one.
          </p>
        </div>
      ) : suggestions.length === 0 ? (
        <p className="text-sm text-muted">
          {isLoading ? 'Coming up with ideas…' : 'No ideas yet. Use “Suggest ideas” to get five to look into.'}
        </p>
      ) : (
        <ul className="grid gap-x-10 gap-y-2 md:grid-cols-2">
          {suggestions.map(suggestion => {
            const watched = watchlistSymbols.includes(suggestion.symbol);
            return (
              <li key={suggestion.symbol} className="border-t border-line py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <button
                      type="button"
                      onClick={() => onOpenStock(suggestion.symbol)}
                      className="rounded bg-chip px-1.5 py-0.5 font-mono text-sm font-medium hover:text-accent"
                    >
                      {suggestion.symbol}
                    </button>
                    <h2 className="mt-1.5 text-base font-medium">{suggestion.name}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => !watched && onAddToWatchlist(suggestion.symbol)}
                    disabled={watched}
                    aria-label={watched ? `${suggestion.symbol} is on your watchlist` : `Add ${suggestion.symbol} to watchlist`}
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-edge px-4 text-sm font-medium text-accent hover:bg-surface disabled:border-transparent disabled:text-muted"
                  >
                    {watched ? <Check className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                    {watched ? 'Watching' : 'Watch'}
                  </button>
                </div>
                {suggestion.trend && (
                  <p className="mt-3 text-sm"><span className="text-muted">Trend, as of the model’s training:</span> {suggestion.trend}</p>
                )}
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{suggestion.reason}</p>
                {suggestion.keyFactors?.length ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {suggestion.keyFactors.map((factor, i) => (
                      <li key={i} className="rounded-full border border-line px-3 py-1 text-xs text-ink-2">{factor}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {onGenerate && suggestions.length > 0 && (
        <p className="text-xs text-muted">Written by a language model — ideas to research, not recommendations.</p>
      )}
    </div>
  );
}
