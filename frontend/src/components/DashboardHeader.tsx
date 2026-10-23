import React from 'react';
import { Calendar, MapPin, ChevronDown } from 'lucide-react';

interface DashboardHeaderProps {
  currentLocation?: string;
  onLocationChange?: (location: string) => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  currentLocation = 'Main Shop',
}) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      {/* Title & Greeting */}
      <div>
        <p className="text-sm font-medium text-[#69736B]">Good morning,</p>
        <h1 className="text-2xl md:text-[26px] font-bold text-[#202820] tracking-tight leading-snug">
          Welcome back, Super Admin!
        </h1>
        <p className="text-xs md:text-sm text-[#69736B] mt-0.5">
          Here's what's happening with your business today.
        </p>
      </div>

      {/* Header Context Controls */}
      <div className="flex items-center gap-3">
        {/* Date Selector Badge */}
        <div className="flex items-center gap-2.5 bg-white border border-[#E3E7E1] rounded-xl px-3.5 py-2 shadow-2xs">
          <Calendar className="w-4 h-4 text-[#69736B]" />
          <div className="text-left">
            <div className="text-xs font-semibold text-[#202820] leading-tight">
              Apr 27, 2025
            </div>
            <div className="text-[10px] text-[#69736B] leading-none">
              (Today)
            </div>
          </div>
        </div>

        {/* Location Selector Badge */}
        <button 
          className="flex items-center gap-2.5 bg-white border border-[#E3E7E1] hover:border-[#276749] rounded-xl px-3.5 py-2 shadow-2xs transition-colors group text-left"
        >
          <MapPin className="w-4 h-4 text-[#276749]" />
          <div>
            <div className="text-xs font-semibold text-[#202820] group-hover:text-[#276749] leading-tight transition-colors">
              {currentLocation}
            </div>
            <div className="text-[10px] text-[#69736B] leading-none">
              Shop & Warehouse
            </div>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-[#69736B] ml-1" />
        </button>
      </div>
    </div>
  );
};
