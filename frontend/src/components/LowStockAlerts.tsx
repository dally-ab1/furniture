import React from 'react';
import { AlertTriangle, Layers, Disc, Wrench, Paintbrush } from 'lucide-react';

export interface LowStockItem {
  id: string;
  name: string;
  category: string;
  currentStock: number;
  minStock: number;
  unit: string;
  icon?: string;
}

interface LowStockAlertsProps {
  items?: LowStockItem[];
  onViewAll?: () => void;
}

export const LowStockAlerts: React.FC<LowStockAlertsProps> = ({
  items = [
    { id: '1', name: 'Oak Wood Plank', category: 'Timber', currentStock: 5, minStock: 20, unit: 'm²', icon: 'wood' },
    { id: '2', name: 'Chair Leg (Wood)', category: 'Hardware', currentStock: 8, minStock: 30, unit: 'pcs', icon: 'chair' },
    { id: '3', name: 'Screw 4x50', category: 'Fasteners', currentStock: 12, minStock: 50, unit: 'pcs', icon: 'screw' },
    { id: '4', name: 'Varnish 1L', category: 'Finishing', currentStock: 3, minStock: 10, unit: 'pcs', icon: 'can' },
    { id: '5', name: 'Foam Sheet', category: 'Upholstery', currentStock: 6, minStock: 20, unit: 'pcs', icon: 'foam' },
  ],
  onViewAll,
}) => {
  const getItemIcon = (iconName?: string) => {
    switch (iconName) {
      case 'wood':
        return <Layers className="w-4 h-4 text-[#8D6E63]" />;
      case 'chair':
        return <Disc className="w-4 h-4 text-[#A1887F]" />;
      case 'screw':
        return <Wrench className="w-4 h-4 text-[#78909C]" />;
      case 'can':
        return <Paintbrush className="w-4 h-4 text-[#E65100]" />;
      default:
        return <Layers className="w-4 h-4 text-[#DCE775]" />;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5 shadow-2xs flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#DC2626]" />
          <h3 className="font-bold text-sm text-[#202820]">Low Stock Alerts</h3>
        </div>
        <button 
          onClick={onViewAll}
          className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] transition-colors"
        >
          View all
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#E3E7E1] text-[11px] font-medium text-[#69736B] uppercase tracking-wider">
              <th className="pb-2.5 font-medium">Product</th>
              <th className="pb-2.5 font-medium text-right">Current Stock</th>
              <th className="pb-2.5 font-medium text-right">Min. Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F2ED] text-xs">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-[#F7F7F2]/50 transition-colors">
                <td className="py-2.5 flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[#F7F7F2] border border-[#E3E7E1] flex items-center justify-center shrink-0">
                    {getItemIcon(item.icon)}
                  </div>
                  <span className="font-medium text-[#202820] truncate max-w-[110px]">
                    {item.name}
                  </span>
                </td>
                <td className="py-2.5 text-right font-bold text-[#DC2626] tabular-nums">
                  {item.currentStock} {item.unit}
                </td>
                <td className="py-2.5 text-right text-[#69736B] tabular-nums">
                  {item.minStock} {item.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
