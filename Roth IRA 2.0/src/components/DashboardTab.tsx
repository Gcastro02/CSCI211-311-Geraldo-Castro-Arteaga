import { motion } from 'motion/react';
import { AlertCircle, RefreshCw, Sparkles, Wallet, Newspaper } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { cn } from '../lib/utils';
import { formatCurrency, formatDate } from '../lib/formatters';
import { PortfolioData, StockAnalysis, UserSettings, NewsItem, ContributionRecord } from '../types';
import ExpandableText from './ExpandableText';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const darkTooltip = {
  borderRadius: '6px', border: '1px solid #27272a',
  background: '#18181b', color: '#f4f4f5', fontSize: '11px',
};

interface Props {
  portfolio: PortfolioData;
  currentPrices: Record<string, number>;
  analyses: Record<string, StockAnalysis>;
  settings: UserSettings;
  isAnalyzing: boolean;
  totalValue: number;
  chartData: { name: string; value: number }[];
  generalNews: NewsItem[];
  loadingGeneralNews: boolean;
  contribution: ContributionRecord;
  contributionInput: string;
  setContributionInput: (v: string) => void;
  setContribution: React.Dispatch<React.SetStateAction<ContributionRecord>>;
  setPortfolio: React.Dispatch<React.SetStateAction<PortfolioData>>;
  cashInput: string;
  setCashInput: (v: string) => void;
  onRunPortfolioAnalysis: () => void;
  onFetchGeneralNews: () => void;
  addNotification: (msg: string, type: 'success' | 'info') => void;
}

export default function DashboardTab({
  portfolio, currentPrices, analyses, settings, isAnalyzing,
  totalValue, chartData, generalNews, loadingGeneralNews,
  contribution, contributionInput, setContributionInput, setContribution,
  setPortfolio, cashInput, setCashInput,
  onRunPortfolioAnalysis, onFetchGeneralNews, addNotification,
}: Props) {
  const fc = (n: number) => formatCurrency(n, settings.currency);
  const fd = (s?: string) => formatDate(s, settings.dateFormat);

  const limit = settings.age50OrOlder ? 8000 : 7000;
  const pct = Math.min((contribution.contributed / limit) * 100, 100);
  const remaining = Math.max(limit - contribution.contributed, 0);
  const isOver = contribution.contributed > limit;

  return (
    <motion.div
      key="dashboard"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="grid grid-cols-1 lg:grid-cols-3 gap-4"
    >
      {/* Asset Allocation */}
      <div className="lg:col-span-2 bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
        <div className="flex justify-between items-start mb-6">
          <h3 className="font-bold text-zinc-100">Asset Allocation</h3>
          <button
            onClick={onRunPortfolioAnalysis}
            disabled={isAnalyzing || portfolio.holdings.length === 0}
            className="flex items-center gap-2 text-sm font-medium text-blue-400 hover:bg-zinc-800 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
          >
            <Sparkles className={cn("w-4 h-4", isAnalyzing && "animate-spin")} />
            Analyze
          </button>
        </div>
        <div className="h-56 w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={4} dataKey="value" animationDuration={800}>
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={darkTooltip} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-zinc-600">
              <AlertCircle className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Add holdings to see allocation</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
          {chartData.map((item, idx) => (
            <div key={item.name} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
              <span className="text-sm font-medium text-zinc-300 truncate">{item.name}</span>
              <span className="text-xs text-zinc-500 ml-auto shrink-0">{((item.value / totalValue) * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="space-y-4">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 text-white">
          <div className="flex justify-between items-start mb-3">
            <Wallet className="w-6 h-6 opacity-80" />
            <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full">{settings.currency}</span>
          </div>
          <p className="text-blue-200 text-xs mb-1">Available Cash</p>
          <h4 className="text-2xl font-bold font-mono">{fc(portfolio.cashBalance)}</h4>
          <div className="mt-4 flex gap-2">
            <input
              type="number"
              value={cashInput}
              onChange={e => setCashInput(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-white/40 placeholder:text-blue-300"
              placeholder="Update cash..."
            />
            <button
              onClick={() => setPortfolio(prev => ({ ...prev, cashBalance: parseFloat(cashInput) || 0 }))}
              className="bg-white text-blue-600 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-blue-50 transition-colors shrink-0"
            >
              Set
            </button>
          </div>
        </div>

        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
          <h3 className="font-bold text-zinc-100 mb-4 flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            Portfolio Health
          </h3>
          <div className="space-y-2">
            {portfolio.holdings.length === 0 ? (
              <p className="text-sm text-zinc-500 italic">Add holdings to get AI insights.</p>
            ) : (
              portfolio.holdings.slice(0, 3).map(h => (
                <div key={h.symbol} className="flex items-center justify-between p-2.5 bg-zinc-800/60 rounded-xl">
                  <div>
                    <p className="font-bold text-sm text-zinc-200">{h.symbol}</p>
                    <p className="text-[10px] text-zinc-500 uppercase">Recommendation</p>
                  </div>
                  {analyses[h.symbol] ? (
                    <span className={cn(
                      "text-xs font-bold px-2 py-0.5 rounded-md",
                      analyses[h.symbol].recommendation === 'BUY' && "bg-emerald-900/60 text-emerald-400",
                      analyses[h.symbol].recommendation === 'HOLD' && "bg-amber-900/60 text-amber-400",
                      analyses[h.symbol].recommendation === 'SELL' && "bg-rose-900/60 text-rose-400",
                    )}>
                      {analyses[h.symbol].recommendation}
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-600 italic">Pending</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Contribution Tracker */}
      <div className="lg:col-span-3 bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-bold text-zinc-100 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-400" />
              {contribution.year} Roth IRA Contributions
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">Annual limit: {fc(limit)}{settings.age50OrOlder ? ' (age 50+ catch-up)' : ''}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-zinc-100 font-mono">{fc(contribution.contributed)}</p>
            <p className={cn("text-xs font-bold", isOver ? "text-rose-400" : "text-zinc-500")}>
              {isOver ? `Over limit by ${fc(contribution.contributed - limit)}` : `${fc(remaining)} remaining`}
            </p>
          </div>
        </div>
        <div className="w-full bg-zinc-800 rounded-full h-2 mb-4 overflow-hidden">
          <div
            className={cn("h-2 rounded-full transition-all duration-500", isOver ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex gap-3">
          <input
            type="number"
            value={contributionInput}
            onChange={e => setContributionInput(e.target.value)}
            placeholder="Add contribution amount..."
            className="flex-1 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-zinc-100 placeholder:text-zinc-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <button
            onClick={() => {
              const amount = parseFloat(contributionInput);
              if (!amount || amount <= 0) return;
              setContribution(prev => ({ ...prev, contributed: prev.contributed + amount }));
              setContributionInput('');
              addNotification(`Added ${fc(amount)} to ${contribution.year} contributions.`, 'success');
            }}
            className="bg-emerald-600 text-white font-bold px-4 py-2 rounded-xl hover:bg-emerald-700 transition-colors text-sm"
          >
            Add
          </button>
          <button
            onClick={() => { setContribution(prev => ({ ...prev, contributed: 0 })); addNotification('Contribution total reset to $0.', 'info'); }}
            className="bg-zinc-800 text-zinc-400 font-bold px-4 py-2 rounded-xl hover:bg-zinc-700 transition-colors text-sm"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Market News Feed */}
      <div className="lg:col-span-3 bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-zinc-100 flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-blue-400" />
            Market News
          </h3>
          <button onClick={onFetchGeneralNews} disabled={loadingGeneralNews} className="p-2 text-zinc-500 hover:text-blue-400 transition-colors rounded-lg hover:bg-zinc-800" title="Refresh News">
            <RefreshCw className={cn("w-4 h-4", loadingGeneralNews && "animate-spin")} />
          </button>
        </div>
        <div>
          {loadingGeneralNews ? (
            <div className="flex flex-col items-center justify-center py-10 text-zinc-600">
              <RefreshCw className="w-6 h-6 animate-spin mb-3" />
              <p className="text-sm">Fetching latest market headlines...</p>
            </div>
          ) : generalNews.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {generalNews.map((item, idx) => (
                <div key={idx} className="flex flex-col p-4 bg-zinc-800/50 rounded-xl hover:bg-zinc-800 transition-colors border border-zinc-700/50 group">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-zinc-700 rounded text-zinc-400">{item.source}</span>
                    <span className="text-[10px] text-zinc-600">{fd(item.date)}</span>
                  </div>
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-bold text-sm mb-2 text-zinc-200 group-hover:text-blue-400 transition-colors">
                    {item.title}
                  </a>
                  <ExpandableText text={item.snippet} maxChars={150} className="text-xs text-zinc-500 mt-auto" />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-zinc-600 text-sm italic bg-zinc-800/30 rounded-xl border border-zinc-800">
              No recent news available.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
