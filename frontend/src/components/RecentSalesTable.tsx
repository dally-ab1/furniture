import React from 'react';
import { ShoppingCart } from 'lucide-react';

export interface RecentSale {
  id: string;
  invoice_number: string;
  customer: string;
  amount: number;
  status: 'PAID' | 'PARTIAL' | 'CREDIT';
  time: string;
}

interface RecentSalesTableProps {
  sales?: RecentSale[];
  onViewAll?: () => void;
}

export const RecentSalesTable: React.FC<RecentSalesTableProps> = ({
  sales = [
    { id: '1', invoice_number: 'INV-00124', customer: 'Walk-in Customer', amount: 5250.00, status: 'PAID', time: '10:42 AM' },
    { id: '2', invoice_number: 'INV-00123', customer: 'Abebe Kebede', amount: 12800.00, status: 'PAID', time: '09:15 AM' },
    { id: '3', invoice_number: 'INV-00122', customer: 'Mekdes Tadesse', amount: 8600.00, status: 'PARTIAL', time: 'Yesterday' },
    { id: '4', invoice_number: 'INV-00121', customer: 'Liya Mamo', amount: 15400.00, status: 'PAID', time: 'Yesterday' },
    { id: '5', invoice_number: 'INV-00120', customer: 'Daniel Girma', amount: 7200.00, status: 'CREDIT', time: 'Yesterday' },
  ],
  onViewAll,
}) => {
  const getStatusBadge = (status: RecentSale['status']) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#EAF3EC] text-[#276749]">
            Paid
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#FEF3C7] text-[#92400E]">
            Partial
          </span>
        );
      case 'CREDIT':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#EFF6FF] text-[#1D4ED8]">
            Credit
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5 shadow-2xs flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-[#276749]" />
          <h3 className="font-bold text-sm text-[#202820]">Recent Sales</h3>
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
              <th className="pb-2.5 font-medium">Invoice #</th>
              <th className="pb-2.5 font-medium">Customer</th>
              <th className="pb-2.5 font-medium">Amount</th>
              <th className="pb-2.5 font-medium">Status</th>
              <th className="pb-2.5 font-medium text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F2ED] text-xs">
            {sales.map((sale) => (
              <tr key={sale.id} className="hover:bg-[#F7F7F2]/50 transition-colors">
                <td className="py-2.5 font-medium text-[#202820]">{sale.invoice_number}</td>
                <td className="py-2.5 text-[#69736B] truncate max-w-[110px]">{sale.customer}</td>
                <td className="py-2.5 font-semibold text-[#202820] tabular-nums">
                  ETB {sale.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2.5">{getStatusBadge(sale.status)}</td>
                <td className="py-2.5 text-right text-[#69736B] tabular-nums">{sale.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
