import React from 'react';
import { 
  Zap, 
  ShoppingCart, 
  Package, 
  Cog, 
  Wallet, 
  BarChart3,
  Hammer
} from 'lucide-react';

interface QuickActionsGridProps {
  onActionClick?: (actionId: string) => void;
}

export const QuickActionsGrid: React.FC<QuickActionsGridProps> = ({ onActionClick }) => {
  const actions = [
    { id: 'new_sale', label: 'New Sale', icon: ShoppingCart },
    { id: 'add_product', label: 'Add Product', icon: Package },
    { id: 'stock_intake', label: 'Stock Intake', icon: Package },
    { id: 'new_production', label: 'New Production', icon: Cog },
    { id: 'add_expense', label: 'Add Expense', icon: Wallet },
    { id: 'view_reports', label: 'View Reports', icon: BarChart3 },
    { id: 'customer_order', label: 'Customer Order', icon: Hammer },
  ];

  return (
    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5 shadow-2xs flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4 text-[#276749]" />
        <h3 className="font-bold text-sm text-[#202820]">Quick Actions</h3>
      </div>

      {/* Grid of 6 buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 flex-1">
        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <button
              key={act.id}
              onClick={() => onActionClick && onActionClick(act.id)}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#F7F7F2] border border-[#E3E7E1] hover:border-[#276749] hover:bg-white text-[#202820] transition-all group shadow-2xs hover:shadow-xs"
            >
              <Icon className="w-5 h-5 text-[#276749] group-hover:scale-110 transition-transform mb-1.5" />
              <span className="text-xs font-semibold leading-tight text-center">
                {act.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
