import React from 'react';
import { Cog } from 'lucide-react';

export interface ProductionOrder {
  id: string;
  order_number: string;
  product: string;
  progress: number; // 0 to 100
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  due_date: string;
}

interface ProductionOrdersTableProps {
  orders?: ProductionOrder[];
  onViewAll?: () => void;
}

export const ProductionOrdersTable: React.FC<ProductionOrdersTableProps> = ({
  orders = [
    { id: '1', order_number: 'PRD-0008', product: 'Dining Table', progress: 60, status: 'IN_PROGRESS', due_date: 'Apr 30, 2025' },
    { id: '2', order_number: 'PRD-0007', product: 'Office Chair', progress: 30, status: 'IN_PROGRESS', due_date: 'May 2, 2025' },
    { id: '3', order_number: 'PRD-0006', product: 'Wardrobe', progress: 0, status: 'PLANNED', due_date: 'May 5, 2025' },
    { id: '4', order_number: 'PRD-0005', product: 'Bookshelf', progress: 100, status: 'COMPLETED', due_date: 'Apr 25, 2025' },
  ],
  onViewAll,
}) => {
  const getStatusBadge = (status: ProductionOrder['status']) => {
    switch (status) {
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#E0F2FE] text-[#0369A1]">
            In Progress
          </span>
        );
      case 'PLANNED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#F3F4F6] text-[#4B5563]">
            Planned
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#EAF3EC] text-[#276749]">
            Completed
          </span>
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
          <Cog className="w-4 h-4 text-[#276749]" />
          <h3 className="font-bold text-sm text-[#202820]">Production Orders</h3>
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
              <th className="pb-2.5 font-medium">Order #</th>
              <th className="pb-2.5 font-medium">Product</th>
              <th className="pb-2.5 font-medium w-36">Progress</th>
              <th className="pb-2.5 font-medium">Status</th>
              <th className="pb-2.5 font-medium text-right">Due Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F2ED] text-xs">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-[#F7F7F2]/50 transition-colors">
                <td className="py-3 font-medium text-[#202820]">{order.order_number}</td>
                <td className="py-3 font-semibold text-[#202820]">{order.product}</td>
                <td className="py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-20 bg-[#E3E7E1] h-1.5 rounded-full overflow-hidden shrink-0">
                      <div 
                        className="bg-[#276749] h-full rounded-full transition-all"
                        style={{ width: `${order.progress}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-[#69736B] tabular-nums">
                      {order.progress}%
                    </span>
                  </div>
                </td>
                <td className="py-3">{getStatusBadge(order.status)}</td>
                <td className="py-3 text-right text-[#69736B] tabular-nums">{order.due_date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
