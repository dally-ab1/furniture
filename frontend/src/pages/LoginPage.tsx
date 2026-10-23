import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Armchair, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';

export const LoginPage: React.FC<{
  onSwitchToRegister?: () => void;
}> = ({ onSwitchToRegister }) => {
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await signIn(identifier, password);
      if (result.error) {
        setError(result.error);
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F2] flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-[#276749]/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[#276749]/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-[420px]">
        {/* Logo & Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[#276749] rounded-2xl mb-4 shadow-lg shadow-[#276749]/20">
            <Armchair className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#202820] tracking-tight">
            FurniERP
          </h1>
          <p className="text-sm text-[#69736B] mt-1">
            Furniture Business Management
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl border border-[#E3E7E1] shadow-xl shadow-black/[0.03] p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-[#202820]">
              Welcome back
            </h2>
            <p className="text-sm text-[#69736B] mt-0.5">
              Sign in to your account to continue
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="flex items-start gap-2.5 p-3 mb-5 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username or Email Field */}
            <div>
              <label htmlFor="login-identifier" className="block text-xs font-medium text-[#202820] mb-1.5">
                Username or Email
              </label>
              <input
                id="login-identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. abdallah or admin@furnierp.com"
                required
                autoComplete="username"
                autoFocus
                className="w-full h-11 px-3.5 rounded-xl border border-[#E3E7E1] bg-white text-sm text-[#202820]
                  placeholder:text-[#9CA3AF] outline-none
                  focus:border-[#276749] focus:ring-2 focus:ring-[#276749]/10
                  transition-all duration-200"
              />
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-[#202820] mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  minLength={8}
                  className="w-full h-11 px-3.5 pr-10 rounded-xl border border-[#E3E7E1] bg-white text-sm text-[#202820]
                    placeholder:text-[#9CA3AF] outline-none
                    focus:border-[#276749] focus:ring-2 focus:ring-[#276749]/10
                    transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#69736B] transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting || !identifier || !password}
              className="w-full h-11 rounded-xl bg-[#276749] hover:bg-[#1F5439] active:bg-[#1A4830]
                text-white font-semibold text-sm
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200 shadow-sm shadow-[#276749]/20
                flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>

            {onSwitchToRegister && (
              <div className="pt-3 text-center">
                <button
                  type="button"
                  onClick={onSwitchToRegister}
                  className="text-xs text-[#276749] hover:text-[#1F5439] font-medium hover:underline transition-colors"
                >
                  Need to register or initialize Super Admin? Click here
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[#9CA3AF] mt-6">
          FurniERP &copy; {new Date().getFullYear()} &middot; Ethiopian Birr (ETB)
        </p>
      </div>
    </div>
  );
};
