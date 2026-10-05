import { motion } from 'motion/react';
import { Sparkles, Plus, ArrowUpRight, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { MarketSuggestion } from '../types';

interface Props {
  suggestions: MarketSuggestion[];
  isSuggesting: boolean;
  onFetchSuggestions: () => void;
  onAddToWatchlist: (symbol: string) => void;
}

export default function SuggestionsTab({ suggestions, isSuggesting, onFetchSuggestions, onAddToWatchlist }: Props) {
  return (
    <motion.div
      key="suggestions"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="space-y-6"
    >
      <div className="bg-gradient-to-r from-blue-700 to-indigo-700 rounded-2xl p-7 text-white relative overflow-hidden">
        <div className="relative z-10">
          <h3 className="text-2xl font-bold mb-2">Market Discovery</h3>
          <p className="text-blue-200 max-w-md mb-5 text-sm">
            AI scans current news, economic trends, and global events to find assets suited for a Roth IRA's long-term horizon.
          </p>
          <button
            onClick={onFetchSuggestions}
            disabled={isSuggesting}
            className="bg-white text-blue-700 font-bold px-5 py-2.5 rounded-xl hover:bg-blue-50 transition-all flex items-center gap-2 text-sm shadow-lg shadow-blue-900/30"
          >
            <RefreshCw className={cn("w-4 h-4", isSuggesting && "animate-spin")} />
            {isSuggesting ? 'Scanning Markets...' : 'Generate Suggestions'}
          </button>
        </div>
        <Sparkles className="absolute right-[-16px] bottom-[-16px] w-48 h-48 text-white/10 rotate-12" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {suggestions.map((s, idx) => (
          <motion.div
            key={s.symbol}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
            className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 hover:border-zinc-700 transition-all group"
          >
            <div className="flex justify-between items-start mb-5">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xl font-black text-zinc-100 font-mono">{s.symbol}</span>
                  <span className="text-[10px] font-bold bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded">TRENDING</span>
                </div>
                <h4 className="text-zinc-500 font-medium text-sm">{s.name}</h4>
              </div>
              <button
                onClick={() => onAddToWatchlist(s.symbol)}
                className="p-2 bg-zinc-800 rounded-xl text-zinc-500 group-hover:bg-blue-600 group-hover:text-white transition-all"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-1.5">The Trend</p>
                <div className="flex items-center gap-2 text-zinc-300 font-medium text-sm">
                  <ArrowUpRight className="w-4 h-4 text-emerald-400 shrink-0" />
                  {s.trend}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-1.5">AI Thesis</p>
                <p className="text-sm text-zinc-400 leading-relaxed">{s.reason}</p>
              </div>
              {s.keyFactors && s.keyFactors.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {s.keyFactors.map((factor, i) => (
                    <span key={i} className="px-2 py-0.5 bg-zinc-800 text-zinc-400 border border-zinc-700 text-[9px] font-bold rounded uppercase tracking-wider">
                      {factor}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ))}
        {!isSuggesting && suggestions.length === 0 && (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-zinc-600">
            <Sparkles className="w-12 h-12 mb-4 opacity-10" />
            <p className="font-medium text-sm">Click the button above to discover opportunities</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
