import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { UserSettings } from '../../types';
import { cn } from '../../lib/utils';

const NEWS_SOURCES = ['Bloomberg', 'Reuters', 'CNBC', 'WSJ', 'Financial Times', 'Yahoo Finance'];

interface SettingsScreenProps {
  settings: UserSettings;
  onUpdate: (patch: Partial<UserSettings>) => void;
  aiEnabled: boolean;
  formatCurrency: (amount: number) => string;
}

/** One labeled setting: a title, a line of explanation, then its control. */
function Setting({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-3 border-t border-line py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:gap-10">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A row of mutually exclusive choices. */
function Choice<T extends string | boolean>({ label, options, value, onChange }: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(option => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            'h-10 rounded-full border px-4 text-sm font-medium transition-colors',
            value === option.value ? 'border-accent bg-accent-tint text-accent' : 'border-edge text-ink-2 hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsScreen({ settings, onUpdate, aiEnabled, formatCurrency }: SettingsScreenProps) {
  const isRoth = settings.accountType === 'ROTH_IRA';
  const overrides = Object.entries(settings.contributionLimitOverrides).sort(([a], [b]) => Number(b) - Number(a));

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section aria-labelledby="settings-account" className="mt-8">
        <h2 id="settings-account" className="text-lg font-semibold">Account</h2>
        <div className="mt-3">
          <Setting
            title="Account type"
            description="Roth IRA adds contribution-limit tracking and tax years on Activity, and tells the AI the account’s tax rules."
          >
            <Choice
              label="Account type"
              value={settings.accountType}
              onChange={accountType => onUpdate({ accountType })}
              options={[{ value: 'BROKERAGE', label: 'Brokerage' }, { value: 'ROTH_IRA', label: 'Roth IRA' }]}
            />
          </Setting>
        </div>
      </section>

      <section aria-labelledby="settings-display" className="mt-10">
        <h2 id="settings-display" className="text-lg font-semibold">Appearance</h2>
        <div className="mt-3">
          <Setting title="Theme" description="Also switchable from the sun/moon button in the header.">
            <Choice
              label="Theme"
              value={settings.themeMode}
              onChange={themeMode => onUpdate({ themeMode })}
              options={[{ value: 'DARK', label: 'Dark' }, { value: 'LIGHT', label: 'Light' }]}
            />
          </Setting>
          <Setting title="Date format" description="How dates appear across the app.">
            <Choice
              label="Date format"
              value={settings.dateFormat}
              onChange={dateFormat => onUpdate({ dateFormat })}
              options={[
                { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
                { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
                { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
              ]}
            />
          </Setting>
          <Setting title="Currency symbol" description="The symbol and number format used for money.">
            <label htmlFor="currency" className="sr-only">Currency symbol</label>
            <select
              id="currency"
              value={settings.currency}
              onChange={e => onUpdate({ currency: e.target.value })}
              className="h-11 w-full max-w-xs rounded-lg border border-edge bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
            >
              <option value="USD">USD — US dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — British pound</option>
              <option value="JPY">JPY — Japanese yen</option>
              <option value="CAD">CAD — Canadian dollar</option>
              <option value="AUD">AUD — Australian dollar</option>
            </select>
            {/* Market data arrives in USD and there is no FX conversion, so any
                other choice relabels the same numbers. */}
            {settings.currency !== 'USD' && (
              <p className="mt-2 rounded-lg bg-note px-3 py-2 text-sm text-note-ink">
                Prices are quoted in US dollars and are <strong>not converted</strong>. {settings.currency} only changes
                the symbol and formatting.
              </p>
            )}
          </Setting>
        </div>
      </section>

      <section aria-labelledby="settings-ai" className="mt-10">
        <h2 id="settings-ai" className="text-lg font-semibold">AI and news</h2>
        <div className="mt-3">
          <Setting
            title="Investment horizon"
            description={
              <>
                Shapes the AI’s research and ideas{!aiEnabled && ' (AI features are currently off)'}.
                {isRoth && ' A Roth IRA is a retirement account, so long term usually fits.'}
              </>
            }
          >
            <Choice
              label="Investment horizon"
              value={settings.investmentHorizon}
              onChange={investmentHorizon => onUpdate({ investmentHorizon })}
              options={[
                { value: 'LONG_TERM', label: 'Long term' },
                { value: 'BOTH', label: 'Both' },
                { value: 'SHORT_TERM', label: 'Short term' },
              ]}
            />
          </Setting>
          <Setting title="Preferred news sources" description="Headlines from these publishers are listed first. Others still appear after them.">
            <div role="group" aria-label="Preferred news sources" className="flex flex-wrap gap-2">
              {NEWS_SOURCES.map(source => {
                const selected = settings.preferredNewsSources.includes(source);
                return (
                  <button
                    key={source}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onUpdate({
                      preferredNewsSources: selected
                        ? settings.preferredNewsSources.filter(s => s !== source)
                        : [...settings.preferredNewsSources, source],
                    })}
                    className={cn(
                      'h-10 rounded-full border px-4 text-sm font-medium transition-colors',
                      selected ? 'border-accent bg-accent-tint text-accent' : 'border-edge text-ink-2 hover:text-ink',
                    )}
                  >
                    {source}
                  </button>
                );
              })}
            </div>
          </Setting>
        </div>
      </section>

      {isRoth && (
        <section aria-labelledby="settings-roth" className="mt-10">
          <h2 id="settings-roth" className="text-lg font-semibold">Roth IRA</h2>
          <div className="mt-3">
            <Setting
              title="Catch-up contributions"
              description="People aged 50 and over may contribute an extra catch-up amount each year. This raises the limit used on Activity."
            >
              <Choice
                label="Catch-up eligibility"
                value={settings.catchUpEligible}
                onChange={catchUpEligible => onUpdate({ catchUpEligible })}
                options={[{ value: false, label: 'Under 50' }, { value: true, label: '50 or over' }]}
              />
            </Setting>
            <Setting
              title="Limits you’ve set"
              description="Contribution limits you confirmed for years this app doesn’t have published figures for."
            >
              {overrides.length === 0 ? (
                <p className="text-sm text-muted">None. Set one from Activity when a year’s limit is unverified.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {overrides.map(([year, amount]) => (
                    <li key={year} className="flex h-10 items-center gap-2 rounded-full border border-edge pl-4 pr-1 text-sm">
                      {year}: {formatCurrency(amount)}
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...settings.contributionLimitOverrides };
                          delete next[Number(year)];
                          onUpdate({ contributionLimitOverrides: next });
                        }}
                        aria-label={`Remove the ${year} limit`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-down"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Setting>
          </div>
        </section>
      )}

      <section aria-labelledby="settings-data" className="mt-10">
        <h2 id="settings-data" className="text-lg font-semibold">Your data</h2>
        <p className="mt-3 max-w-2xl border-t border-line pt-5 text-sm leading-relaxed text-ink-2">
          Your holdings, watchlist, activity and settings are stored only in this browser. Nothing is saved on a
          server, and clearing this site’s data removes them. Prices and news come from Yahoo Finance.
          {aiEnabled && ' AI research sends the symbols you ask about to OpenAI — and, for a review of your holdings, their share counts and average costs.'}
        </p>
      </section>
    </div>
  );
}
