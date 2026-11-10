import { useEffect, useState, type KeyboardEvent } from 'react';
import { SymbolMatch, cleanSearchInput } from '../../lib/symbolSearch';
import { cn } from '../../lib/utils';
import { checkSymbol, searchSymbols } from '../../services/openaiService';

interface SymbolInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** A suggestion was clicked, or picked with the arrow keys and Enter. */
  onSelect: (symbol: string) => void;
  /** Offered while the box is empty: the symbols already in use. */
  quickPicks?: string[];
  type?: 'text' | 'search';
  placeholder?: string;
  className?: string;
}

/**
 * A text box for a company name or ticker, with suggestions as you type. Enter
 * without a highlighted suggestion is left to the surrounding form.
 */
export function SymbolInput({ id, value, onChange, onSelect, quickPicks, type = 'text', placeholder, className }: SymbolInputProps) {
  const [matches, setMatches] = useState<SymbolMatch[]>([]);
  const [open, setOpen] = useState(false);
  /** The suggestion picked with the arrow keys; -1 means what was typed. */
  const [highlighted, setHighlighted] = useState(-1);

  // A moment after typing stops, so each keystroke isn't its own request.
  // Failures just mean no list; the form's own check still runs.
  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchSymbols(trimmed)
        .then(found => {
          if (cancelled) return;
          setMatches(found);
          setHighlighted(-1);
        })
        .catch(() => { if (!cancelled) setMatches([]); });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  const options: Array<Pick<SymbolMatch, 'symbol'> & Partial<SymbolMatch>> = value.trim()
    ? matches
    : (quickPicks ?? []).slice(0, 6).map(symbol => ({ symbol }));
  const showList = open && options.length > 0;

  const choose = (symbol: string) => {
    setOpen(false);
    setHighlighted(-1);
    onSelect(symbol);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      // Browsers clear a search box on Escape. With a list open it should only
      // close the list; a second Escape can still clear the text.
      if (showList) event.preventDefault();
      setOpen(false);
      setHighlighted(-1);
    } else if (event.key === 'Enter') {
      const picked = showList ? options[highlighted]?.symbol : undefined;
      if (picked) {
        event.preventDefault();
        choose(picked);
      } else {
        setOpen(false);
      }
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && options.length > 0) {
      event.preventDefault();
      setOpen(true);
      // Steps through the list and back to the typed text at either end.
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlighted(current => ((current + 1 + step + options.length + 1) % (options.length + 1)) - 1);
    }
  };

  return (
    <div className="relative w-full">
      <input
        id={id}
        type={type}
        value={value}
        onChange={event => { onChange(event.target.value); setOpen(true); setHighlighted(-1); }}
        onFocus={() => setOpen(true)}
        // Delayed so a click on a suggestion lands before the list closes.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${id}-suggestions`}
        aria-autocomplete="list"
        aria-activedescendant={showList && highlighted >= 0 ? `${id}-option-${highlighted}` : undefined}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className={className}
      />
      {showList && (
        <ul
          id={`${id}-suggestions`}
          role="listbox"
          aria-label="Matching stocks and funds"
          className="absolute left-0 top-full z-50 mt-1 w-full min-w-[280px] overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg"
        >
          {options.map((option, i) => (
            <li
              key={option.symbol}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={event => { event.preventDefault(); choose(option.symbol); }}
              onMouseEnter={() => setHighlighted(i)}
              className={cn('flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2 text-sm', i === highlighted && 'bg-chip')}
            >
              <span className="w-16 shrink-0 font-mono text-[13px] font-medium text-ink">{option.symbol}</span>
              <span className="min-w-0 flex-1 truncate text-ink-2">{option.name}</span>
              {option.kind && <span className="shrink-0 text-xs text-muted">{option.kind}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface SymbolProblem {
  typed: string;
  matches: SymbolMatch[];
  lookupFailed: boolean;
}

/**
 * Checking a symbol before a form saves it, so a typo doesn't become a holding
 * with no price. `known` symbols are already in use and need no check.
 */
export function useSymbolCheck(known: string[] = []) {
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<SymbolProblem | null>(null);

  /** The symbol to save, or null after recording what's wrong with it. */
  const check = async (raw: string): Promise<string | null> => {
    const typed = cleanSearchInput(raw);
    setProblem(null);
    if (known.includes(typed)) return typed;
    setChecking(true);
    const result = await checkSymbol(typed);
    setChecking(false);
    if (result.symbol) return result.symbol;
    setProblem({ typed, matches: result.matches, lookupFailed: result.lookupFailed });
    return null;
  };

  return { check, checking, problem, clearProblem: () => setProblem(null) };
}

/** What to do about a symbol that couldn't be confirmed. Choosing finishes the form's action. */
export function SymbolProblemNotice({ problem, onChoose }: { problem: SymbolProblem; onChoose: (symbol: string) => void }) {
  const { typed, matches, lookupFailed } = problem;
  return (
    <div role="alert" className="mt-3 max-w-xl rounded-lg bg-surface px-4 py-3 text-sm">
      <p className="font-medium">
        {lookupFailed ? `Couldn’t check “${typed}” right now.` : `“${typed}” isn’t a ticker we can find.`}
      </p>
      {matches.length > 0 ? (
        <>
          <p className="mt-1 text-ink-2">Did you mean:</p>
          <ul className="mt-1">
            {matches.slice(0, 5).map(match => (
              <li key={match.symbol} className="border-t border-line-soft first:border-t-0">
                <button
                  type="button"
                  onClick={() => onChoose(match.symbol)}
                  className="flex min-h-11 w-full items-center gap-3 rounded py-2 text-left hover:text-accent"
                >
                  <span className="w-16 shrink-0 font-mono text-[13px] font-medium">{match.symbol}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-2">{match.name}</span>
                  <span className="shrink-0 text-xs text-muted">{match.kind}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        !lookupFailed && <p className="mt-1 text-ink-2">Nothing similar turned up. Check the spelling.</p>
      )}
      <button type="button" onClick={() => onChoose(typed)} className="mt-2 text-sm text-accent hover:underline">
        Use “{typed}” anyway
      </button>
      <span className="ml-2 text-xs text-muted">The app may not have a live price for it.</span>
    </div>
  );
}
