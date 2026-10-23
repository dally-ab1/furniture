import React, { useEffect, useState } from 'react';
import { DashboardHeader } from '../components/DashboardHeader';
import { KpiCardsRow } from '../components/KpiCardsRow';
import type { KpiData } from '../components/KpiCardsRow';
import { SalesOverviewChart } from '../components/SalesOverviewChart';
import { RecentSalesTable } from '../components/RecentSalesTable';
import type { RecentSale } from '../components/RecentSalesTable';
import { LowStockAlerts } from '../components/LowStockAlerts';
import type { LowStockItem } from '../components/LowStockAlerts';
import { ProductionOrdersTable } from '../components/ProductionOrdersTable';
import type { ProductionOrder } from '../components/ProductionOrdersTable';
import { QuickActionsGrid } from '../components/QuickActionsGrid';
import { RecentActivityStream } from '../components/RecentActivityStream';
import type { ActivityItem } from '../components/RecentActivityStream';
import { api } from '../services/api';

interface DashboardProps {
  onNavigateTab?: (tab: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigateTab }) => {
  const [kpiData, setKpiData] = useState<KpiData>({
    todaySales: 48750.00,
    todaySalesTrend: '+12% vs. yesterday',
    paymentsReceived: 32400.00,
    paymentsReceivedTrend: '+18% vs. yesterday',
    estimatedGrossProfit: 18320.00,
    estimatedGrossProfitTrend: '+10% vs. yesterday',
    customerOutstanding: 27600.00,
    customerOutstandingTrend: '+5% vs. last week',
    supplierOutstanding: 42300.00,
    supplierOutstandingTrend: '+8% vs. last week',
  });

  const [salesOverview, setSalesOverview] = useState<any[]>([]);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [summary, overview, sales, stock, prod, act] = await Promise.all([
          api.getDashboardSummary(),
          api.getSalesOverview(),
          api.getRecentSales(),
          api.getLowStockAlerts(),
          api.getProductionOrders(),
          api.getRecentActivity(),
        ]);

        if (summary) setKpiData(summary);
        if (overview) setSalesOverview(overview);
        if (sales) setRecentSales(sales);
        if (stock) setLowStock(stock);
        if (prod) setProductionOrders(prod);
        if (act) setRecentActivity(act);
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      }
    }

    loadDashboard();
  }, []);

  const handleQuickAction = (actionId: string) => {
    switch (actionId) {
      case 'new_sale':
        onNavigateTab && onNavigateTab('sales');
        break;
      case 'add_product':
        onNavigateTab && onNavigateTab('inventory');
        break;
      case 'stock_intake':
        onNavigateTab && onNavigateTab('inventory');
        break;
      case 'new_production':
        onNavigateTab && onNavigateTab('manufacturing');
        break;
      case 'view_reports':
        onNavigateTab && onNavigateTab('reports');
        break;
      case 'customer_order':
        onNavigateTab && onNavigateTab('sales');
        break;
      default:
        break;
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto">
      {/* Header with Greeting & Date/Location pickers */}
      <DashboardHeader currentLocation="Main Shop" />

      {/* Row 1: 5 KPI Summary Cards */}
      <KpiCardsRow data={kpiData} />

      {/* Row 2: Sales Overview, Recent Sales, Low Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
        <div className="lg:col-span-5">
          <SalesOverviewChart data={salesOverview} />
        </div>
        <div className="lg:col-span-4">
          <RecentSalesTable 
            sales={recentSales} 
            onViewAll={() => onNavigateTab && onNavigateTab('sales')} 
          />
        </div>
        <div className="lg:col-span-3">
          <LowStockAlerts 
            items={lowStock} 
            onViewAll={() => onNavigateTab && onNavigateTab('inventory')} 
          />
        </div>
      </div>

      {/* Row 3: Production Orders, Quick Actions, Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5">
          <ProductionOrdersTable 
            orders={productionOrders} 
            onViewAll={() => onNavigateTab && onNavigateTab('manufacturing')} 
          />
        </div>
        <div className="lg:col-span-3">
          <QuickActionsGrid onActionClick={handleQuickAction} />
        </div>
        <div className="lg:col-span-4">
          <RecentActivityStream 
            activities={recentActivity} 
            onViewAll={() => onNavigateTab && onNavigateTab('reports')} 
          />
        </div>
      </div>
    </div>
  );
};
