import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { getStockPriceHistory } from '../services/openaiService';

const INDICES = [
  { symbol: '^GSPC', label: 'S&P 500' },
  { symbol: '^IXIC', label: 'NASDAQ' },
  { symbol: '^DJI', label: 'DOW' },
];

interface IndexData {
  price: number;
  change: number;
  changePct: number;
}

export default function MarketIndices() {
  const [data, setData] = useState<Record<string, IndexData>>({});

  const load = async () => {
    await Promise.all(INDICES.map(async ({ symbol }) => {
      try {
        const history = await getStockPriceHistory(symbol, '1D');
        if (history.length > 1) {
          const open = history[0].close ?? history[0].price ?? 0;
          const current = history[history.length - 1].close ?? history[history.length - 1].price ?? 0;
          if (open > 0 && current > 0) {
            const change = current - open;
            const changePct = (change / open) * 100;
            setData(prev => ({ ...prev, [symbol]: { price: current, change, changePct } }));
          }
        }
      } catch {}
    }));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bg-black/50 border-b border-zinc-800/60 px-6 py-1.5 flex items-center gap-8 overflow-x-auto no-scrollbar">
      {INDICES.map(({ symbol, label }) => {
        const d = data[symbol];
        const isUp = !d || d.change >= 0;
        return (
          <div key={symbol} className="flex items-center gap-2 shrink-0">
            <span className="text-zinc-500 text-[11px] font-bold uppercase tracking-wide">{label}</span>
            {d ? (
              <>
                <span className="text-zinc-200 text-[11px] font-mono">
                  {d.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className={cn('text-[11px] font-bold flex items-center gap-0.5', isUp ? 'text-emerald-400' : 'text-rose-400')}>
                  {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {isUp ? '+' : ''}{d.changePct.toFixed(2)}%
                </span>
              </>
            ) : (
              <span className="text-zinc-700 text-[11px] animate-pulse">—</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
