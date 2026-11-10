import { useRef, useState, type FormEvent } from 'react';
import { Moon, Search, Settings, Sun } from 'lucide-react';
import { SymbolMatch, cleanSearchInput, resolveSearch } from '../../lib/symbolSearch';
import { cn } from '../../lib/utils';
import { searchSymbols } from '../../services/openaiService';
import { SymbolInput } from '../ui/SymbolInput';

export const APP_NAME = 'Paper Trail';

export type Tab = 'home' | 'holdings' | 'activity' | 'watchlist' | 'charts' | 'practice' | 'detailed' | 'suggestions' | 'settings';

/** Top-level destinations. The stock page ('detailed') is reached by search or by clicking a ticker. */
export const NAV_ITEMS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'holdings', label: 'Portfolio' },
  { id: 'activity', label: 'Activity' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'charts', label: 'Charts' },
  { id: 'practice', label: 'Practice' },
  { id: 'suggestions', label: 'Discover' },
];

interface AppHeaderProps {
  activeTab: Tab;
  onNavigate: (tab: Tab) => void;
  /** Called with an upper-cased ticker when the search box is submitted. */
  onSearch: (symbol: string) => void;
  theme: 'LIGHT' | 'DARK';
  onToggleTheme: () => void;
  /** The experience level's name, shown as a chip that opens Settings. */
  levelLabel: string;
}

export function AppHeader({ activeTab, onNavigate, onSearch, theme, onToggleTheme, levelLabel }: AppHeaderProps) {
  const [query, setQuery] = useState('');
  const latestQuery = useRef(query);
  latestQuery.current = query;

  const go = (symbol: string) => {
    onSearch(symbol);
    setQuery('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!cleanSearchInput(trimmed)) return;
    // Looked up here so a name resolves even when Enter beats the suggestions.
    // If the lookup fails, what was typed is still tried as a ticker.
    const found = await searchSymbols(trimmed).catch(() => [] as SymbolMatch[]);
    // Typing on while that was looked up means they've moved on.
    if (latestQuery.current.trim() !== trimmed) return;
    go(resolveSearch(trimmed, found));
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-7 gap-y-3 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="font-mono text-[15px] font-medium tracking-tight text-ink"
        >
          {APP_NAME}
        </button>

        <nav aria-label="Primary" className="flex flex-wrap gap-1">
          {NAV_ITEMS.map(item => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px border-b-2 px-3 py-2.5 text-sm transition-colors',
                  active
                    ? 'border-accent font-semibold text-accent'
                    : 'border-transparent text-ink-2 hover:text-ink',
                )}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <form role="search" onSubmit={handleSubmit} className="relative flex min-w-[220px] flex-[1_1_280px]">
          <label htmlFor="ticker-search" className="sr-only">Search stocks and funds by company name or ticker</label>
          <Search className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <SymbolInput
            id="ticker-search"
            type="search"
            value={query}
            onChange={setQuery}
            onSelect={go}
            placeholder="Search a company or ticker, e.g. Apple"
            className="h-11 w-full rounded-full border border-edge bg-surface pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </form>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            title="Experience level — change it in Settings"
            className="mr-1 h-8 rounded-full bg-accent-tint px-3 text-xs font-medium text-accent hover:underline"
          >
            {levelLabel}
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'DARK' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface hover:text-ink"
          >
            {theme === 'DARK' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            aria-label="Settings"
            aria-current={activeTab === 'settings' ? 'page' : undefined}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-surface',
              activeTab === 'settings' ? 'text-accent' : 'text-ink-2 hover:text-ink',
            )}
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
