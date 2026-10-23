import React from 'react';
import { TrendingUp, ChevronDown } from 'lucide-react';

interface SalesDay {
  date: string;
  amount: number;
}

interface SalesOverviewChartProps {
  data?: SalesDay[];
}

export const SalesOverviewChart: React.FC<SalesOverviewChartProps> = ({
  data = [
    { date: 'Apr 21', amount: 28000 },
    { date: 'Apr 22', amount: 36000 },
    { date: 'Apr 23', amount: 33000 },
    { date: 'Apr 24', amount: 41000 },
    { date: 'Apr 25', amount: 46000 },
    { date: 'Apr 26', amount: 42000 },
    { date: 'Apr 27', amount: 55000 },
  ],
}) => {
  const maxAmount = 80000;
  const yTicks = [80, 60, 40, 20, 0];

  return (
    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5 shadow-2xs flex flex-col justify-between h-full">
      {/* Panel Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#276749]" />
          <h3 className="font-bold text-sm text-[#202820]">Sales Overview</h3>
        </div>

        {/* Period Selector */}
        <button className="flex items-center gap-1.5 text-xs text-[#69736B] hover:text-[#202820] bg-[#F7F7F2] border border-[#E3E7E1] px-2.5 py-1 rounded-lg transition-colors">
          <span>Last 7 days</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      {/* Bar Chart Area */}
      <div className="flex items-end gap-3 h-48 w-full pt-4 relative">
        {/* Y Axis Guide Lines */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-6">
          {yTicks.map((tick) => (
            <div key={tick} className="flex items-center gap-2 w-full">
              <span className="text-[10px] text-[#A0AEC0] font-mono w-6 text-right">
                {tick > 0 ? `${tick}K` : '0'}
              </span>
              <div className="h-[1px] bg-[#F0F2ED] flex-1"></div>
            </div>
          ))}
        </div>

        {/* Bars Container */}
        <div className="flex items-end justify-between flex-1 pl-8 z-10 pb-6 h-full">
          {data.map((day, idx) => {
            const heightPercent = Math.min(100, Math.round((day.amount / maxAmount) * 100));
            const isToday = idx === data.length - 1;
            return (
              <div key={idx} className="flex flex-col items-center flex-1 h-full justify-end group">
                {/* Bar */}
                <div className="w-full max-w-[26px] bg-[#E4EDE5] group-hover:bg-[#CBD5C0] rounded-t-md relative transition-all overflow-hidden" style={{ height: `${heightPercent}%` }}>
                  <div 
                    className={`w-full h-full rounded-t-md transition-all ${
                      isToday ? 'bg-[#276749]' : 'bg-[#276749]/80 group-hover:bg-[#276749]'
                    }`}
                  />
                  {/* Tooltip */}
                  <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-[#202820] text-white text-[10px] py-0.5 px-1.5 rounded shadow pointer-events-none transition-opacity whitespace-nowrap z-20">
                    ETB {day.amount.toLocaleString()}
                  </div>
                </div>

                {/* X Axis Label */}
                <span className="text-[11px] text-[#69736B] font-medium mt-2 absolute -bottom-0">
                  {day.date}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
