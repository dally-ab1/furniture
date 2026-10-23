import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Search, Bell, ChevronDown } from 'lucide-react';

interface TopNavbarProps {
  onSearch?: (query: string) => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({ onSearch }) => {
  const { profile, isSuperAdmin } = useAuth();

  const initials = profile
    ? profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'SA';

  return (
    <header className="h-16 bg-white border-b border-[#E3E7E1] px-8 flex items-center justify-between sticky top-0 z-20">
      {/* Global Search Bar with Ctrl+K badge */}
      <div className="relative w-full max-w-md">
        <Search className="w-4 h-4 text-[#69736B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          placeholder="Search products, customers, suppliers..."
          onChange={(e) => onSearch && onSearch(e.target.value)}
          className="w-full bg-[#F7F7F2] text-sm text-[#202820] placeholder-[#69736B] rounded-lg pl-10 pr-20 py-2 border border-[#E3E7E1] focus:outline-none focus:border-[#276749] focus:ring-1 focus:ring-[#276749] transition-all"
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
          <kbd className="bg-white border border-[#E3E7E1] text-[#69736B] text-[10px] font-mono px-1.5 py-0.5 rounded shadow-2xs">
            Ctrl + K
          </kbd>
        </div>
      </div>

      {/* Right User Actions */}
      <div className="flex items-center gap-5">
        {/* Notification Bell */}
        <button 
          className="relative p-2 rounded-lg text-[#69736B] hover:text-[#202820] hover:bg-[#F7F7F2] transition-colors"
          title="Notifications"
        >
          <Bell className="w-5 h-5" />
          <span className="w-2 h-2 rounded-full bg-red-500 absolute top-2 right-2 ring-2 ring-white"></span>
        </button>

        <div className="h-6 w-[1px] bg-[#E3E7E1]" />

        {/* User Profile */}
        <div className="flex items-center gap-3 cursor-pointer group">
          <div className="w-9 h-9 rounded-full bg-[#202820] text-white flex items-center justify-center font-bold text-xs tracking-wider shadow-xs">
            {initials}
          </div>
          <div className="flex flex-col text-left">
            <span className="text-sm font-semibold text-[#202820] group-hover:text-[#276749] leading-tight transition-colors">
              {profile?.full_name || 'User'}
            </span>
            <span className="text-[11px] text-[#69736B] leading-tight">
              {isSuperAdmin ? 'Owner' : 'Employee'}
            </span>
          </div>
          <ChevronDown className="w-4 h-4 text-[#69736B] group-hover:text-[#202820] transition-colors" />
        </div>
      </div>
    </header>
  );
};
