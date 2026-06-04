import { motion } from 'motion/react';
import { Globe, Calendar, Clock, Newspaper, Wallet } from 'lucide-react';
import { cn } from '../lib/utils';
import { UserSettings } from '../types';

interface Props {
  settings: UserSettings;
  setSettings: React.Dispatch<React.SetStateAction<UserSettings>>;
}

export default function SettingsTab({ settings, setSettings }: Props) {
  return (
    <motion.div
      key="settings"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-2xl space-y-4"
    >
      <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
        <div className="space-y-7">
          {/* Currency */}
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-zinc-800 rounded-xl text-blue-400 shrink-0"><Globe className="w-5 h-5" /></div>
            <div className="flex-1">
              <h4 className="font-bold text-zinc-100 mb-0.5">Currency</h4>
              <p className="text-sm text-zinc-500 mb-3">Select your preferred currency for portfolio valuation.</p>
              <select
                value={settings.currency}
                onChange={e => setSettings(prev => ({ ...prev, currency: e.target.value }))}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
                <option value="JPY">JPY - Japanese Yen</option>
                <option value="CAD">CAD - Canadian Dollar</option>
                <option value="AUD">AUD - Australian Dollar</option>
              </select>
            </div>
          </div>

          {/* Date Format */}
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-zinc-800 rounded-xl text-amber-400 shrink-0"><Calendar className="w-5 h-5" /></div>
            <div className="flex-1">
              <h4 className="font-bold text-zinc-100 mb-0.5">Date Format</h4>
              <p className="text-sm text-zinc-500 mb-3">How dates should be displayed across the app.</p>
              <div className="flex gap-2 flex-wrap">
                {(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'] as const).map(format => (
                  <button
                    key={format}
                    onClick={() => setSettings(prev => ({ ...prev, dateFormat: format }))}
                    className={cn(
                      'px-4 py-2 rounded-xl text-sm font-medium border transition-all',
                      settings.dateFormat === format
                        ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'
                    )}
                  >
                    {format}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Investment Horizon */}
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-zinc-800 rounded-xl text-emerald-400 shrink-0"><Clock className="w-5 h-5" /></div>
            <div className="flex-1">
              <h4 className="font-bold text-zinc-100 mb-0.5">Investment Horizon</h4>
              <p className="text-sm text-zinc-500 mb-3">This helps AI tailor recommendations for your goals.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {[
                  { id: 'LONG_TERM', label: 'Long Term' },
                  { id: 'SHORT_TERM', label: 'Short Term' },
                  { id: 'BOTH', label: 'Balanced' },
                ].map(horizon => (
                  <button
                    key={horizon.id}
                    onClick={() => setSettings(prev => ({ ...prev, investmentHorizon: horizon.id as UserSettings['investmentHorizon'] }))}
                    className={cn(
                      'px-4 py-2 rounded-xl text-sm font-medium border transition-all',
                      settings.investmentHorizon === horizon.id
                        ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'
                    )}
                  >
                    {horizon.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Contribution Limit */}
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-zinc-800 rounded-xl text-emerald-400 shrink-0"><Wallet className="w-5 h-5" /></div>
            <div className="flex-1">
              <h4 className="font-bold text-zinc-100 mb-0.5">Contribution Limit</h4>
              <p className="text-sm text-zinc-500 mb-3">IRS allows a higher catch-up limit if you're 50 or older.</p>
              <div className="flex gap-2 flex-wrap">
                {[
                  { id: false, label: 'Under 50 — $7,000 limit' },
                  { id: true, label: 'Age 50+ — $8,000 limit' },
                ].map(option => (
                  <button
                    key={String(option.id)}
                    onClick={() => setSettings(prev => ({ ...prev, age50OrOlder: option.id }))}
                    className={cn(
                      'px-4 py-2 rounded-xl text-sm font-medium border transition-all',
                      settings.age50OrOlder === option.id
                        ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* News Sources */}
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-zinc-800 rounded-xl text-rose-400 shrink-0"><Newspaper className="w-5 h-5" /></div>
            <div className="flex-1">
              <h4 className="font-bold text-zinc-100 mb-0.5">Preferred News Sources</h4>
              <p className="text-sm text-zinc-500 mb-3">AI will prioritize these sources when fetching news.</p>
              <div className="flex flex-wrap gap-2">
                {['Bloomberg', 'Reuters', 'CNBC', 'WSJ', 'Financial Times', 'Yahoo Finance'].map(source => {
                  const isSelected = settings.preferredNewsSources.includes(source);
                  return (
                    <button
                      key={source}
                      onClick={() => setSettings(prev => ({
                        ...prev,
                        preferredNewsSources: isSelected
                          ? prev.preferredNewsSources.filter(s => s !== source)
                          : [...prev.preferredNewsSources, source],
                      }))}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-bold border transition-all',
                        isSelected
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:border-zinc-600 hover:text-zinc-300'
                      )}
                    >
                      {source}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
        <h4 className="font-bold text-zinc-100 mb-2">Data Privacy</h4>
        <p className="text-zinc-500 text-sm leading-relaxed">
          All your portfolio data, watchlist items, and settings are stored locally in your browser's storage.
          We do not store your financial data on our servers. AI analysis is performed on-demand using the
          symbols and amounts you provide.
        </p>
      </div>
    </motion.div>
  );
}
