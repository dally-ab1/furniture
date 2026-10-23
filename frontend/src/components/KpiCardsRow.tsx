import React from 'react';
import { 
  TrendingUp, 
  Wallet, 
  BarChart3, 
  User, 
  Truck, 
  ArrowUpRight 
} from 'lucide-react';

export interface KpiData {
  todaySales: number;
  todaySalesTrend: string;
  paymentsReceived: number;
  paymentsReceivedTrend: string;
  estimatedGrossProfit: number;
  estimatedGrossProfitTrend: string;
  customerOutstanding: number;
  customerOutstandingTrend: string;
  supplierOutstanding: number;
  supplierOutstandingTrend: string;
}

interface KpiCardsRowProps {
  data: KpiData;
}

export const KpiCardsRow: React.FC<KpiCardsRowProps> = ({ data }) => {
  const formatCurrency = (val: number) => {
    return `ETB ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const cards = [
    {
      label: "Today's Sales",
      value: formatCurrency(data.todaySales),
      trend: data.todaySalesTrend,
      trendType: 'positive',
      icon: TrendingUp,
      iconBg: 'bg-[#EAF3EC]',
      iconColor: 'text-[#276749]',
    },
    {
      label: 'Payments Received',
      value: formatCurrency(data.paymentsReceived),
      trend: data.paymentsReceivedTrend,
      trendType: 'positive',
      icon: Wallet,
      iconBg: 'bg-[#EBF2FA]',
      iconColor: 'text-[#2563EB]',
    },
    {
      label: 'Estimated Gross Profit',
      value: formatCurrency(data.estimatedGrossProfit),
      trend: data.estimatedGrossProfitTrend,
      trendType: 'positive',
      icon: BarChart3,
      iconBg: 'bg-[#F3E8FF]',
      iconColor: 'text-[#9333EA]',
    },
    {
      label: 'Customer Outstanding',
      value: formatCurrency(data.customerOutstanding),
      trend: data.customerOutstandingTrend,
      trendType: 'negative', // Debt increase is red
      icon: User,
      iconBg: 'bg-[#FFF4ED]',
      iconColor: 'text-[#EA580C]',
    },
    {
      label: 'Supplier Outstanding',
      value: formatCurrency(data.supplierOutstanding),
      trend: data.supplierOutstandingTrend,
      trendType: 'negative', // Payable increase is red
      icon: Truck,
      iconBg: 'bg-[#FEE2E2]',
      iconColor: 'text-[#DC2626]',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className="bg-white rounded-2xl border border-[#E3E7E1] p-4.5 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow"
          >
            {/* Icon & Label */}
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className={`w-8 h-8 rounded-lg ${card.iconBg} ${card.iconColor} flex items-center justify-center shrink-0`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium text-[#69736B] leading-tight">
                  {card.label}
                </span>
              </div>

              {/* Amount */}
              <div className="text-xl font-bold text-[#202820] tracking-tight tabular-nums mb-2">
                {card.value}
              </div>
            </div>

            {/* Trend Indicator */}
            <div className="flex items-center gap-1.5 text-[11px] font-medium">
              <span
                className={`flex items-center gap-0.5 ${
                  card.trendType === 'positive' ? 'text-[#276749]' : 'text-[#DC2626]'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
                {card.trend.split(' ')[0]}
              </span>
              <span className="text-[#69736B]">
                {card.trend.substring(card.trend.indexOf(' ') + 1)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
