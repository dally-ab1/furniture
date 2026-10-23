import React from 'react';
import { 
  Clock, 
  ShoppingCart, 
  ClipboardCheck, 
  Truck, 
  Cog, 
  CreditCard 
} from 'lucide-react';

export interface ActivityItem {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  time: string;
  color: 'green' | 'orange' | 'blue' | 'purple';
}

interface RecentActivityStreamProps {
  activities?: ActivityItem[];
  onViewAll?: () => void;
}

export const RecentActivityStream: React.FC<RecentActivityStreamProps> = ({
  activities = [
    { id: '1', type: 'sale', title: 'New sale completed', subtitle: 'INV-00124 • ETB 5,250.00', time: '10:42 AM', color: 'green' },
    { id: '2', type: 'adjustment', title: 'Stock adjustment', subtitle: 'Raw Material - Timber • -10 pcs', time: '09:30 AM', color: 'orange' },
    { id: '3', type: 'purchase', title: 'Purchase received', subtitle: 'SUP-0005 • ETB 18,000.00', time: 'Yesterday', color: 'blue' },
    { id: '4', type: 'production', title: 'Production completed', subtitle: 'PRD-0007 • 20 pcs', time: 'Yesterday', color: 'purple' },
    { id: '5', type: 'payment', title: 'Payment received', subtitle: 'Customer: Mekdes Tadesse • ETB 8,600.00', time: 'Yesterday', color: 'green' },
  ],
  onViewAll,
}) => {
  const getIcon = (type: string, _color?: string) => {
    switch (type) {
      case 'sale':
        return (
          <div className="w-7 h-7 rounded-full bg-[#EAF3EC] text-[#276749] flex items-center justify-center shrink-0">
            <ShoppingCart className="w-3.5 h-3.5" />
          </div>
        );
      case 'adjustment':
        return (
          <div className="w-7 h-7 rounded-full bg-[#FFF4ED] text-[#EA580C] flex items-center justify-center shrink-0">
            <ClipboardCheck className="w-3.5 h-3.5" />
          </div>
        );
      case 'purchase':
        return (
          <div className="w-7 h-7 rounded-full bg-[#EBF2FA] text-[#2563EB] flex items-center justify-center shrink-0">
            <Truck className="w-3.5 h-3.5" />
          </div>
        );
      case 'production':
        return (
          <div className="w-7 h-7 rounded-full bg-[#F3E8FF] text-[#9333EA] flex items-center justify-center shrink-0">
            <Cog className="w-3.5 h-3.5" />
          </div>
        );
      case 'payment':
        return (
          <div className="w-7 h-7 rounded-full bg-[#EAF3EC] text-[#276749] flex items-center justify-center shrink-0">
            <CreditCard className="w-3.5 h-3.5" />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5 shadow-2xs flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#276749]" />
          <h3 className="font-bold text-sm text-[#202820]">Recent Activity</h3>
        </div>
        <button 
          onClick={onViewAll}
          className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] transition-colors"
        >
          View all
        </button>
      </div>

      {/* Activity Timeline List */}
      <div className="space-y-3">
        {activities.map((act) => (
          <div key={act.id} className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              {getIcon(act.type, act.color)}
              <div>
                <p className="text-xs font-semibold text-[#202820] leading-tight">
                  {act.title}
                </p>
                <p className="text-[11px] text-[#69736B] leading-tight mt-0.5">
                  {act.subtitle}
                </p>
              </div>
            </div>
            <span className="text-[11px] text-[#69736B] shrink-0 tabular-nums">
              {act.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
