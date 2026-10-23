import React from 'react';
import { Armchair, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

interface LoadingScreenProps {
  error?: string | null;
  onRetry?: () => void;
  message?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ 
  error, 
  onRetry, 
  message = 'Loading FurniERP...' 
}) => {
  return (
    <div className="min-h-screen bg-[#F7F7F2] flex flex-col items-center justify-center p-6">
      <div className="inline-flex items-center justify-center w-14 h-14 bg-[#276749] rounded-2xl mb-5 shadow-lg shadow-[#276749]/20">
        <Armchair className="w-7 h-7 text-white" />
      </div>

      {error ? (
        <div className="max-w-md w-full bg-white border border-[#E3E7E1] rounded-2xl p-6 shadow-sm text-center space-y-4">
          <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-[#202820] text-base">Connection Issue</h3>
            <p className="text-xs text-[#69736B] mt-1">{error}</p>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#276749] hover:bg-[#234A34] text-white text-xs font-semibold rounded-xl transition-colors shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Connection
            </button>
          )}
        </div>
      ) : (
        <>
          <Loader2 className="w-6 h-6 text-[#276749] animate-spin mb-3" />
          <p className="text-sm text-[#69736B] font-medium">{message}</p>
        </>
      )}
    </div>
  );
};
