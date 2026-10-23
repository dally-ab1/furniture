import React, { useState, useEffect } from 'react';
import { 
  Armchair, AlertCircle, Loader2, CheckCircle2, ShieldCheck, 
  ArrowRight, UserCheck, Shield
} from 'lucide-react';

const API_BASE = 'http://localhost:5000/api';

const DEFAULT_EMPLOYEE_PERMISSIONS = [
  { key: 'sales.create', label: 'Create POS Sales & Orders', module: 'Sales' },
  { key: 'inventory.view', label: 'View Stock & Products', module: 'Inventory' },
  { key: 'inventory.adjust', label: 'Adjust Stock & Material Intake', module: 'Inventory' },
  { key: 'sales.discount', label: 'Apply POS Discounts', module: 'Sales' },
  { key: 'manufacturing.view', label: 'View Production Orders', module: 'Manufacturing' },
];

export const BootstrapPage: React.FC<{ 
  onComplete: () => void;
  onSwitchToLogin?: () => void;
}> = ({ onComplete, onSwitchToLogin }) => {

  // Initialization check
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [systemStatus, setSystemStatus] = useState<{
    hasSuperAdmin: boolean;
    superAdminName: string | null;
    hasEmployee: boolean;
    employeeCount: number;
    initialized: boolean;
  } | null>(null);

  // Setup Step: 1 = Super Admin, 2 = Initial Employee, 3 = Complete & Verify
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Super Admin form state
  const [adminForm, setAdminForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
  });

  // Step 2: Employee form state
  const [employeeForm, setEmployeeForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    permissions: ['sales.create', 'inventory.view', 'inventory.adjust'],
  });

  // Owner credentials to authorize employee creation if admin already existed
  const [ownerAuth, setOwnerAuth] = useState({
    email: '',
    password: '',
  });

  // Feedback states
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verifiedAccounts, setVerifiedAccounts] = useState<{
    superAdmin: any;
    initialEmployee: any;
  } | null>(null);

  // Check system status on mount
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch(`${API_BASE}/auth/status`);
        const data = await res.json();
        setSystemStatus(data);

        if (data.initialized) {
          setStep(3);
          loadVerifiedDetails();
        } else if (data.hasSuperAdmin && !data.hasEmployee) {
          // Super admin is established, prompt for step 2 (Employee creation)
          setStep(2);
        } else {
          setStep(1);
        }
      } catch (err) {
        console.error('Failed to check auth status:', err);
      } finally {
        setCheckingStatus(false);
      }
    }
    checkStatus();
  }, []);

  const loadVerifiedDetails = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/setup/verify`);
      const data = await res.json();
      if (data.success && data.isReady) {
        setVerifiedAccounts({
          superAdmin: data.superAdmin,
          initialEmployee: data.initialEmployee,
        });
      }
    } catch (err) {
      console.error('Failed to load verified accounts:', err);
    }
  };

  // Handle Step 1: Super Admin Bootstrap
  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (adminForm.password !== adminForm.confirmPassword) {
      setError('Super Admin passwords do not match.');
      return;
    }

    if (adminForm.password.length < 8) {
      setError('Super Admin password must be at least 8 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: adminForm.fullName,
          email: adminForm.email,
          password: adminForm.password,
          phone: adminForm.phone || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to initialize Super Admin.');
      }

      // Save owner auth for Step 2
      setOwnerAuth({
        email: adminForm.email,
        password: adminForm.password,
      });

      // Move to Step 2: Employee setup
      setStep(2);
    } catch (err: any) {
      setError(err.message || 'Error initializing Super Admin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Step 2: Initial Employee Establishment
  const handleEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (employeeForm.password !== employeeForm.confirmPassword) {
      setError('Employee passwords do not match.');
      return;
    }

    if (employeeForm.password.length < 6) {
      setError('Employee password must be at least 6 characters.');
      return;
    }

    if (employeeForm.email.toLowerCase() === (ownerAuth.email || adminForm.email).toLowerCase()) {
      setError('Employee email must be different from Super Admin email.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/setup/initial-employee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: employeeForm.fullName,
          email: employeeForm.email,
          password: employeeForm.password,
          phone: employeeForm.phone || undefined,
          permissions: employeeForm.permissions,
          adminEmail: ownerAuth.email || adminForm.email || undefined,
          adminPassword: ownerAuth.password || adminForm.password || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to establish initial employee.');
      }

      // Step 3: Verification
      await loadVerifiedDetails();
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Error establishing initial employee.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePermission = (key: string) => {
    setEmployeeForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter(k => k !== key)
        : [...prev.permissions, key]
    }));
  };

  if (checkingStatus) {
    return (
      <div className="min-h-screen bg-[#F7F7F2] flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-[#276749]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7F2] flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-[#276749]/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[#276749]/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-[540px]">
        {/* Logo & Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[#276749] rounded-2xl mb-3 shadow-lg shadow-[#276749]/20">
            <Armchair className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#202820] tracking-tight">
            FurniERP Setup
          </h1>
          <p className="text-xs text-[#69736B] mt-0.5">
            Initial Company & Account Architecture
          </p>
        </div>

        {/* Stepper Progress */}
        <div className="bg-white rounded-2xl border border-[#E3E7E1] shadow-xl shadow-black/[0.03] p-6 mb-4">
          <div className="flex items-center justify-between relative">
            <div className={`flex items-center gap-2 text-xs font-semibold ${step >= 1 ? 'text-[#276749]' : 'text-gray-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                step > 1 ? 'bg-[#276749] text-white' : step === 1 ? 'border-2 border-[#276749] text-[#276749]' : 'bg-gray-100 text-gray-400'
              }`}>
                1
              </div>
              <span>Super Admin</span>
            </div>

            <div className="flex-1 h-0.5 mx-3 bg-[#E3E7E1]" />

            <div className={`flex items-center gap-2 text-xs font-semibold ${step >= 2 ? 'text-[#276749]' : 'text-gray-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                step > 2 ? 'bg-[#276749] text-white' : step === 2 ? 'border-2 border-[#276749] text-[#276749]' : 'bg-gray-100 text-gray-400'
              }`}>
                2
              </div>
              <span>Initial Employee</span>
            </div>

            <div className="flex-1 h-0.5 mx-3 bg-[#E3E7E1]" />

            <div className={`flex items-center gap-2 text-xs font-semibold ${step === 3 ? 'text-[#276749]' : 'text-gray-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                step === 3 ? 'bg-[#276749] text-white' : 'bg-gray-100 text-gray-400'
              }`}>
                3
              </div>
              <span>Verified</span>
            </div>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl border border-[#E3E7E1] shadow-xl shadow-black/[0.03] p-6">
          {error && (
            <div className="flex items-start gap-2.5 p-3 mb-5 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 1: SUPER ADMIN ESTABLISHMENT                                         */}
          {/* ========================================================================= */}
          {step === 1 && (
            <div>
              <div className="flex items-start gap-2.5 p-3 mb-5 bg-[#EAF3EC] border border-[#D1E7D5] rounded-xl">
                <ShieldCheck className="w-4 h-4 mt-0.5 text-[#276749] shrink-0" />
                <div className="text-xs text-[#276749]">
                  <span className="font-semibold">Step 1 of 2: Super Admin Owner.</span> Establish the primary owner account with full authority over POS, inventory, manufacturing, and user accounts.
                </div>
              </div>

              <form onSubmit={handleAdminSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1">
                    Super Admin Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={adminForm.fullName}
                    onChange={e => setAdminForm({ ...adminForm, fullName: e.target.value })}
                    placeholder="e.g. Abdallah Farah"
                    className="w-full h-10 px-3 rounded-xl border border-[#E3E7E1] text-xs text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1">
                    Super Admin Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={adminForm.email}
                    onChange={e => setAdminForm({ ...adminForm, email: e.target.value })}
                    placeholder="owner@furnierp.com"
                    className="w-full h-10 px-3 rounded-xl border border-[#E3E7E1] text-xs text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1">
                    Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={adminForm.phone}
                    onChange={e => setAdminForm({ ...adminForm, phone: e.target.value })}
                    placeholder="+251 9XX XXX XXXX"
                    className="w-full h-10 px-3 rounded-xl border border-[#E3E7E1] text-xs text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#202820] mb-1">
                      Password *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={adminForm.password}
                      onChange={e => setAdminForm({ ...adminForm, password: e.target.value })}
                      placeholder="Min. 8 characters"
                      className="w-full h-10 px-3 rounded-xl border border-[#E3E7E1] text-xs text-[#202820] focus:border-[#276749] focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#202820] mb-1">
                      Confirm Password *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={adminForm.confirmPassword}
                      onChange={e => setAdminForm({ ...adminForm, confirmPassword: e.target.value })}
                      placeholder="Repeat password"
                      className="w-full h-10 px-3 rounded-xl border border-[#E3E7E1] text-xs text-[#202820] focus:border-[#276749] focus:outline-hidden"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 rounded-xl bg-[#276749] hover:bg-[#1F5439] text-white font-semibold text-xs mt-3 flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Register Super Admin & Continue'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 2: INITIAL EMPLOYEE ESTABLISHMENT                                    */}
          {/* ========================================================================= */}
          {step === 2 && (
            <div>
              <div className="flex items-start gap-2.5 p-3 mb-5 bg-[#EBF2FA] border border-[#BFDBFE] rounded-xl">
                <UserCheck className="w-4 h-4 mt-0.5 text-[#2563EB] shrink-0" />
                <div className="text-xs text-[#2563EB]">
                  <span className="font-semibold">Step 2 of 2: Initial Employee Account.</span> Establish the first employee account and configure operations permissions before normal ERP use.
                </div>
              </div>

              {systemStatus?.hasSuperAdmin && !ownerAuth.email && (
                <div className="p-3 mb-4 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                  <div className="text-xs font-semibold text-[#202820]">
                    Super Admin Authentication (Owner Authority Verification)
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="email"
                      placeholder="Super Admin Email"
                      value={ownerAuth.email}
                      onChange={e => setOwnerAuth({ ...ownerAuth, email: e.target.value })}
                      className="h-9 px-2.5 bg-white border border-[#E3E7E1] rounded-lg text-xs"
                    />
                    <input
                      type="password"
                      placeholder="Super Admin Password"
                      value={ownerAuth.password}
                      onChange={e => setOwnerAuth({ ...ownerAuth, password: e.target.value })}
                      className="h-9 px-2.5 bg-white border border-[#E3E7E1] rounded-lg text-xs"
                    />
                  </div>
                </div>
              )}

              <form onSubmit={handleEmployeeSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1">
                    Employee Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={employeeForm.fullName}
                    onChange={e => setEmployeeForm({ ...employeeForm, fullName: e.target.value })}
                    placeholder="e.g. Mohamed Ahmed"
                    className="w-full h-10 px-3 rounded-xl border border-[#E3E7E1] text-xs text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1">
                    Employee Email (Login Identifier) *
                  </label>
                  <input
                    type="email"
                    required
                    value={employeeForm.email}
                    onChange={e => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                    placeholder="employee@furnierp.com"
                    className="w-full h-10 px-3 rounded-xl border border-[#E3E7E1] text-xs text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#202820] mb-1">
                      Password *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={employeeForm.password}
                      onChange={e => setEmployeeForm({ ...employeeForm, password: e.target.value })}
                      placeholder="Min. 6 characters"
                      className="w-full h-10 px-3 rounded-xl border border-[#E3E7E1] text-xs text-[#202820] focus:border-[#276749] focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#202820] mb-1">
                      Confirm Password *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={employeeForm.confirmPassword}
                      onChange={e => setEmployeeForm({ ...employeeForm, confirmPassword: e.target.value })}
                      placeholder="Repeat password"
                      className="w-full h-10 px-3 rounded-xl border border-[#E3E7E1] text-xs text-[#202820] focus:border-[#276749] focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Permissions checklist */}
                <div className="pt-2">
                  <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                    Initial Employee Permissions ({employeeForm.permissions.length} granted)
                  </label>
                  <div className="space-y-1.5 p-2 bg-[#FAFBF9] border border-[#E3E7E1] rounded-xl max-h-40 overflow-y-auto">
                    {DEFAULT_EMPLOYEE_PERMISSIONS.map(p => {
                      const checked = employeeForm.permissions.includes(p.key);
                      return (
                        <label
                          key={p.key}
                          className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePermission(p.key)}
                            className="rounded-sm border-gray-300 text-[#276749] focus:ring-[#276749]"
                          />
                          <span className="font-medium text-[#202820]">{p.label}</span>
                          <span className="text-[10px] text-[#8C948D] ml-auto font-mono">({p.module})</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 rounded-xl bg-[#276749] hover:bg-[#1F5439] text-white font-semibold text-xs mt-3 flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Establish Employee Account & Finalize Setup'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 3: VERIFIED & SYSTEM READY                                           */}
          {/* ========================================================================= */}
          {step === 3 && (
            <div className="text-center py-2 space-y-5">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-[#EAF3EC] rounded-2xl">
                <CheckCircle2 className="w-7 h-7 text-[#276749]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#202820]">Initial Setup Verified!</h2>
                <p className="text-xs text-[#69736B] mt-1">
                  FurniERP has verified both required accounts in the database and authentication provider.
                </p>
              </div>

              {/* Verified accounts card */}
              <div className="space-y-2 text-left">
                <div className="p-3 bg-[#FAFBF9] border border-[#E3E7E1] rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Shield className="w-4 h-4 text-[#276749]" />
                    <div>
                      <div className="text-xs font-bold text-[#202820]">
                        {verifiedAccounts?.superAdmin?.full_name || systemStatus?.superAdminName || 'Super Admin'}
                      </div>
                      <div className="text-[11px] text-[#69736B]">System Owner & Administrator</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-[#276749] bg-[#EAF3EC] px-2 py-0.5 rounded-full border border-[#C8DEC9]">
                    Verified
                  </span>
                </div>

                <div className="p-3 bg-[#FAFBF9] border border-[#E3E7E1] rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <UserCheck className="w-4 h-4 text-[#2563EB]" />
                    <div>
                      <div className="text-xs font-bold text-[#202820]">
                        {verifiedAccounts?.initialEmployee?.full_name || 'Initial Employee'}
                      </div>
                      <div className="text-[11px] text-[#69736B]">
                        Operations Staff ({verifiedAccounts?.initialEmployee?.permissions?.length || 3} permissions)
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-[#2563EB] bg-[#EBF2FA] px-2 py-0.5 rounded-full border border-[#BFDBFE]">
                    Verified
                  </span>
                </div>
              </div>

              <button
                onClick={onComplete}
                className="w-full h-11 rounded-xl bg-[#276749] hover:bg-[#1F5439] text-white font-semibold text-xs shadow-sm transition-colors"
              >
                Proceed to FurniERP Login
              </button>
            </div>
          )}

          {/* Switch to login link */}
          {onSwitchToLogin && step !== 3 && (
            <div className="pt-3 text-center border-t border-[#E3E7E1] mt-4">
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="text-xs text-[#276749] hover:underline font-medium inline-flex items-center gap-1"
              >
                Already initialized? Return to Sign In <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
