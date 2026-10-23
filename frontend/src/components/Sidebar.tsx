import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  Home, 
  ShoppingCart, 
  Package, 
  Settings, 
  Users, 
  Truck, 
  BarChart3, 
  UserCheck, 
  LogOut,
  Armchair,
  ShieldCheck,
  User as UserIcon,
  RotateCcw
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onTabChange }) => {
  const { profile, signOut, isSuperAdmin, hasPermission } = useAuth();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'sales', label: 'Sales & POS', icon: ShoppingCart, permission: 'sales.create' },
    { id: 'inventory', label: 'Products & Inventory', icon: Package, permission: 'inventory.view' },
    { id: 'manufacturing', label: 'Manufacturing', icon: Settings, permission: 'manufacturing.view' },
    { id: 'customers', label: 'Customers', icon: Users, permission: 'sales.create' },
    { id: 'suppliers', label: 'Suppliers', icon: Truck, permission: 'suppliers.manage' },
    { id: 'reports', label: 'Finance & Reports', icon: BarChart3, permission: 'reports.view_financial' },
    { id: 'users', label: 'User Management', icon: UserCheck, adminOnly: true },
    { id: 'recovery', label: 'Recovery Center', icon: RotateCcw, adminOnly: true },
    { id: 'settings', label: 'Settings', icon: Settings, adminOnly: true },
  ];

  // Filter nav items based on role and assigned permissions
  const visibleItems = navItems.filter(item => {
    if (item.adminOnly && !isSuperAdmin) return false;
    if (item.permission && !isSuperAdmin && !hasPermission(item.permission)) return false;
    return true;
  });

  return (
    <aside className="w-64 bg-[#1A3325] text-white flex flex-col justify-between shrink-0 min-h-screen select-none border-r border-[#162B1E]">
      <div>
        {/* Brand Header */}
        <div className="px-6 py-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#276749] flex items-center justify-center text-white shadow-inner">
            <Armchair className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="font-bold text-lg leading-tight tracking-tight text-white flex items-center gap-1.5">
              FurniERP
            </div>
            <div className="text-[11px] font-normal text-[#A3B899] leading-tight">
              Furniture Business ERP
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="px-3.5 space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[#234A34] text-white font-semibold shadow-sm'
                    : 'text-[#A3B899] hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#A3B899]'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* User Profile & Sign Out */}
      <div className="px-3.5 pb-4">
        {/* User Info */}
        {profile && (
          <div className="px-3 py-3 mb-2 rounded-xl bg-white/5 border border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#276749] flex items-center justify-center text-white text-xs font-bold uppercase shrink-0">
                {profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">{profile.full_name}</div>
                <div className="flex items-center gap-1 text-[10px] text-[#A3B899]">
                  {isSuperAdmin ? (
                    <ShieldCheck className="w-3 h-3 text-[#48BB78]" />
                  ) : (
                    <UserIcon className="w-3 h-3 text-[#60A5FA]" />
                  )}
                  <span>{isSuperAdmin ? 'Super Admin' : 'Employee'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sign Out Button */}
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-medium
            text-[#A3B899] hover:text-white hover:bg-red-500/10 transition-all"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
