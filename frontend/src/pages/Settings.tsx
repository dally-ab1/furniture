import React, { useState, useEffect } from 'react';
import {
  Building2, Save, MapPin,
  CheckCircle2, Loader2, Map
} from 'lucide-react';
import { authFetch, API_BASE } from '../services/api';


interface Location {
  id: string;
  name: string;
  type: string;
  address: string | null;
  is_active: boolean;
}

export const Settings: React.FC = () => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form fields
  const [companyName, setCompanyName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [tinNumber, setTinNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    async function loadSettings() {
      try {
        const [setRes, locRes] = await Promise.all([
          authFetch(`${API_BASE}/settings`),
          authFetch(`${API_BASE}/products/locations`),
        ]);

        const [setJson, locJson] = await Promise.all([
          setRes.json(),
          locRes.json(),
        ]);

        if (setJson.success && setJson.data) {
          const s = setJson.data;
          setCompanyName(s.company_name || '');
          setBrandName(s.brand_name || '');
          setTinNumber(s.tin_number || '');
          setPhone(s.phone || '');
          setEmail(s.email || '');
          setAddress(s.address || '');
        }

        if (locJson.success) {
          setLocations(locJson.data || []);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    try {
      const res = await authFetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          brandName,
          tinNumber,
          phone,
          email,
          address,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update company settings');
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-[#276749]" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#202820]">Company Settings</h1>
        <p className="text-sm text-[#69736B] mt-0.5">
          Manage single-company business profile, Ethiopian tax identity, and physical business locations
        </p>
      </div>

      {saveSuccess && (
        <div className="p-4 bg-[#DCFCE7] border border-[#BBF7D0] rounded-2xl flex items-center gap-3 text-xs font-semibold text-[#15803D] animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Company settings successfully saved to Supabase database.
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Company Identity Surface */}
        <div className="bg-white rounded-2xl border border-[#E3E7E1] p-6 shadow-2xs space-y-5">
          <div className="flex items-center gap-3 border-b border-[#E3E7E1] pb-4">
            <div className="w-10 h-10 rounded-xl bg-[#EAF3EC] text-[#276749] flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#202820]">Business Identity</h2>
              <p className="text-xs text-[#69736B]">Official legal name and brand name shown on customer sales invoices</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                Company Legal Name *
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="FurniERP Furniture Manufacturing & Retail"
                className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                Brand / Commercial Name
              </label>
              <input
                type="text"
                value={brandName}
                onChange={e => setBrandName(e.target.value)}
                placeholder="FurniERP"
                className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                TIN Number (Ethiopian Tax ID)
              </label>
              <input
                type="text"
                value={tinNumber}
                onChange={e => setTinNumber(e.target.value)}
                placeholder="0012345678"
                className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                Primary Phone Number
              </label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+251 11 551 2233"
                className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                Official Business Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="info@furnierp.et"
                className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#202820] mb-1.5">
              Headquarters / Main Office Address
            </label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Jigjiga, Somali Region, Ethiopia"
              className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-3.5 bg-[#FAFBF9] rounded-xl border border-[#E3E7E1]">
              <div className="text-xs font-semibold text-[#202820]">Operating Currency</div>
              <div className="text-sm font-bold text-[#276749] mt-0.5">Ethiopian Birr (ETB) — Fixed</div>
              <div className="text-[11px] text-[#69736B] mt-1">Single-currency ERP compliance enforced across all modules</div>
            </div>

            <div className="p-3.5 bg-[#FAFBF9] rounded-xl border border-[#E3E7E1]">
              <div className="text-xs font-semibold text-[#202820]">Database Architecture</div>
              <div className="text-sm font-bold text-[#202820] mt-0.5">Single-Company Postgres Database</div>
              <div className="text-[11px] text-[#69736B] mt-1">No multi-tenant overhead or data leakage risks</div>
            </div>
          </div>
        </div>

        {/* Operating Business Locations */}
        <div className="bg-white rounded-2xl border border-[#E3E7E1] p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-3 border-b border-[#E3E7E1] pb-4">
            <div className="w-10 h-10 rounded-xl bg-[#EBF2FA] text-[#2563EB] flex items-center justify-center">
              <Map className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#202820]">Operating Inventory Locations</h2>
              <p className="text-xs text-[#69736B]">Physical inventory locations configured in the system</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {locations.map(loc => (
              <div key={loc.id} className="p-4 bg-[#FAFBF9] rounded-xl border border-[#E3E7E1] flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm text-[#202820]">{loc.name}</div>
                  <div className="text-xs text-[#69736B] mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> {loc.address || 'Jigjiga'}
                  </div>
                  <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EAF3EC] text-[#276749]">
                    Type: {loc.type}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-[#15803D] bg-[#DCFCE7] px-2.5 py-1 rounded-full">
                    Active
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#276749] hover:bg-[#234A34] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Company Settings
          </button>
        </div>
      </form>
    </div>
  );
};

export default Settings;
