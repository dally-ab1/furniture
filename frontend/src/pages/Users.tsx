import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users as UsersIcon, Trash2, Plus, ShieldCheck, UserCheck,
  X, Loader2, ShieldAlert, History, Search,
  Download, RefreshCw, CheckCircle2, XCircle, AlertCircle,
  ChevronLeft, ChevronRight, Eye, SlidersHorizontal,
  Clock, Edit3, KeyRound, EyeOff, Save, RotateCcw
} from 'lucide-react';
import { authFetch } from '../services/api';

const API_BASE = 'http://localhost:5000/api';

interface UserProfile {
  id: string;
  full_name: string;
  username?: string | null;
  role: 'SUPER_ADMIN' | 'EMPLOYEE';
  phone: string | null;
  is_active: boolean;
  created_at: string;
  email?: string;
  permissions?: string[];
}

interface AuditLogEntry {
  id: string;
  user_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  module: string | null;
  entity: string;
  entity_id: string | null;
  record_reference: string | null;
  description: string | null;
  outcome: 'SUCCESS' | 'FAILURE' | 'DENIED';
  reason: string | null;
  payload: Record<string, any> | null;
  ip_address: string | null;
  created_at: string;
}

const AVAILABLE_PERMISSIONS: { key: string; label: string; module: string; description: string }[] = [
  // Sales & POS
  { key: 'sales.create', label: 'Create POS Sales & Orders', module: 'Sales', description: 'Can create sales orders and checkout invoices' },
  { key: 'sales.cancel', label: 'Cancel Sales & Issue Refunds', module: 'Sales', description: 'Can void or cancel completed sales' },
  { key: 'sales.discount', label: 'Apply Special Discounts', module: 'Sales', description: 'Can override prices or offer promotional discounts' },
  
  // Inventory
  { key: 'inventory.view', label: 'View Stock & Catalog', module: 'Inventory', description: 'Can view inventory levels and physical locations' },
  { key: 'inventory.adjust', label: 'Perform Stock Adjustments', module: 'Inventory', description: 'Can adjust inventory quantities with reasons' },
  { key: 'inventory.transfer', label: 'Inter-warehouse Stock Transfer', module: 'Inventory', description: 'Can move inventory between warehouse and shop' },

  // Suppliers
  { key: 'suppliers.manage', label: 'Manage Suppliers & Debts', module: 'Suppliers', description: 'Can add suppliers and record payments to suppliers' },

  // Manufacturing
  { key: 'manufacturing.view', label: 'View BOMs & Work Orders', module: 'Manufacturing', description: 'Can monitor factory production schedules' },
  { key: 'manufacturing.manage', label: 'Manage Production & Issue Materials', module: 'Manufacturing', description: 'Can create BOMs and issue materials to factory' },

  // Finance & Reports
  { key: 'reports.view_financial', label: 'View P&L & Balance Sheets', module: 'Finance', description: 'Can access confidential financial summaries' },
  { key: 'expenses.record', label: 'Record Operating Expenses', module: 'Finance', description: 'Can log business expenses and receipts' },
];

export const Users: React.FC = () => {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');

  // User accounts state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // Selected User Drawer / Profile
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userProfileTab, setUserProfileTab] = useState<'general' | 'password' | 'profile' | 'permissions' | 'activity'>('general');
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [permReason, setPermReason] = useState('');
  const [permSuccess, setPermSuccess] = useState(false);

  // General Edit state
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [isEditingGeneral, setIsEditingGeneral] = useState(false);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [generalSuccess, setGeneralSuccess] = useState('');
  const [generalError, setGeneralError] = useState('');

  // Password Management state
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordReason, setPasswordReason] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // User-specific audit history
  const [userAuditLogs, setUserAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingUserLogs, setLoadingUserLogs] = useState(false);

  // Add User Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [isUsernameCustomized, setIsUsernameCustomized] = useState(false);
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'EMPLOYEE' | 'SUPER_ADMIN'>('EMPLOYEE');
  const [newAccountPerms, setNewAccountPerms] = useState<string[]>(['sales.create', 'inventory.view']);
  const [submittingUser, setSubmittingUser] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Central Audit Trail state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPages, setAuditPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Central Audit Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilterUser, setSelectedFilterUser] = useState('');
  const [selectedFilterRole, setSelectedFilterRole] = useState('');
  const [selectedFilterModule, setSelectedFilterModule] = useState('');
  const [selectedFilterAction, setSelectedFilterAction] = useState('');
  const [selectedFilterOutcome, setSelectedFilterOutcome] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exportingCsv, setExportingCsv] = useState(false);

  // Diff / Event Detail Modal
  const [inspectEvent, setInspectEvent] = useState<AuditLogEntry | null>(null);

  // 1. Fetch Users
  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await authFetch(`${API_BASE}/settings/users`);
      const json = await res.json();
      if (json.success) setUsers(json.data || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  // 2. Fetch Central Audit Logs
  const fetchAuditLogs = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const params = new URLSearchParams();
      params.append('page', String(currentPage));
      params.append('limit', String(pageSize));
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (selectedFilterUser) params.append('userId', selectedFilterUser);
      if (selectedFilterRole) params.append('role', selectedFilterRole);
      if (selectedFilterModule) params.append('module', selectedFilterModule);
      if (selectedFilterAction) params.append('action', selectedFilterAction);
      if (selectedFilterOutcome) params.append('outcome', selectedFilterOutcome);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await authFetch(`${API_BASE}/settings/audit-logs?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setAuditLogs(json.data || []);
        setAuditTotal(json.pagination?.total || 0);
        setAuditPages(json.pagination?.pages || 1);
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoadingAudit(false);
    }
  }, [
    currentPage, pageSize, searchQuery, selectedFilterUser, selectedFilterRole,
    selectedFilterModule, selectedFilterAction, selectedFilterOutcome, startDate, endDate
  ]);

  // Initial load
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [activeTab, fetchAuditLogs]);

  // Load User Details & Permissions when Drawer opens
  const openUserDrawer = async (user: UserProfile) => {
    setSelectedUser(user);
    setUserProfileTab('general');
    setPermReason('');
    setPermSuccess(false);
    // Populate General Edit fields
    setEditFullName(user.full_name || '');
    setEditUsername(user.username || '');
    setEditEmail(user.email || '');
    setEditPhone(user.phone || '');
    setIsEditingGeneral(false);
    setSavingGeneral(false);
    setGeneralSuccess('');
    setGeneralError('');
    // Reset password state
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordReason('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setSavingPassword(false);
    setPasswordSuccess('');
    setPasswordError('');

    try {
      // Fetch user's permissions
      const res = await authFetch(`${API_BASE}/settings/users/${user.id}/permissions`);
      const json = await res.json();
      if (json.success) {
        setUserPermissions(json.permissions || []);
      }
    } catch (err) {
      console.error('Failed to load user permissions:', err);
    }

    // Pre-fetch user's activity logs
    loadUserActivityLogs(user.id);
  };

  const loadUserActivityLogs = async (userId: string) => {
    setLoadingUserLogs(true);
    try {
      const res = await authFetch(`${API_BASE}/settings/users/${userId}/audit-logs`);
      const json = await res.json();
      if (json.success) {
        setUserAuditLogs(json.data || []);
      }
    } catch (err) {
      console.error('Failed to load user audit logs:', err);
    } finally {
      setLoadingUserLogs(false);
    }
  };

  // === General Edit handlers ===
  const handleStartEditGeneral = () => {
    if (!selectedUser) return;
    setEditFullName(selectedUser.full_name || '');
    setEditUsername(selectedUser.username || '');
    setEditEmail(selectedUser.email || '');
    setEditPhone(selectedUser.phone || '');
    setIsEditingGeneral(true);
    setGeneralSuccess('');
    setGeneralError('');
  };

  const handleCancelGeneral = () => {
    if (!selectedUser) return;
    setEditFullName(selectedUser.full_name || '');
    setEditUsername(selectedUser.username || '');
    setEditEmail(selectedUser.email || '');
    setEditPhone(selectedUser.phone || '');
    setIsEditingGeneral(false);
    setGeneralError('');
  };

  const handleSaveGeneral = async () => {
    if (!selectedUser) return;
    setGeneralError('');
    setGeneralSuccess('');

    // Frontend validation
    if (!editFullName.trim() || editFullName.trim().length < 2) {
      setGeneralError('Display name must be at least 2 characters.');
      return;
    }
    const cleanUsername = editUsername.trim().toLowerCase();
    if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 30) {
      setGeneralError('Username must be between 3 and 30 characters.');
      return;
    }
    if (!/^[a-z0-9._-]+$/.test(cleanUsername)) {
      setGeneralError('Username may only contain letters, numbers, underscores, dots, or hyphens.');
      return;
    }
    if (editEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmail.trim())) {
      setGeneralError('Please enter a valid email address.');
      return;
    }

    setSavingGeneral(true);
    try {
      const res = await authFetch(`${API_BASE}/settings/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: editFullName.trim(),
          username: cleanUsername,
          email: editEmail.trim() || undefined,
          phone: editPhone.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update profile');
      }
      // Update local state
      const updatedData = json.data;
      setSelectedUser(prev => prev ? { ...prev, ...updatedData } : prev);
      setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, ...updatedData } : u));
      setIsEditingGeneral(false);
      setGeneralSuccess('Profile updated successfully and recorded in audit trail.');
      setTimeout(() => setGeneralSuccess(''), 4000);
      // Refresh activity logs
      loadUserActivityLogs(selectedUser.id);
    } catch (err: any) {
      setGeneralError(err.message || 'Error updating profile');
    } finally {
      setSavingGeneral(false);
    }
  };

  // === Password Management handlers ===
  const handleResetPassword = async () => {
    if (!selectedUser) return;
    setPasswordError('');
    setPasswordSuccess('');

    const minLen = selectedUser.role === 'SUPER_ADMIN' ? 8 : 6;
    if (!newPassword || newPassword.length < minLen) {
      setPasswordError(`Password must be at least ${minLen} characters for ${selectedUser.role} accounts.`);
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to reset the password for ${selectedUser.full_name} (@${selectedUser.username || 'N/A'})? They will need to sign in with the new password immediately.`
    );
    if (!confirmed) return;

    setSavingPassword(true);
    try {
      const res = await authFetch(`${API_BASE}/settings/users/${selectedUser.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: newPassword,
          confirmPassword: confirmNewPassword,
          reason: passwordReason.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Password reset failed');
      }
      setPasswordSuccess(json.message || 'Password reset successfully.');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordReason('');
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      // Refresh activity logs
      loadUserActivityLogs(selectedUser.id);
    } catch (err: any) {
      setPasswordError(err.message || 'Error resetting password');
    } finally {
      setSavingPassword(false);
    }
  };

  // Toggle permission checkbox
  const handleTogglePermission = (key: string) => {
    setUserPermissions(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  // Save Permissions
  const handleSavePermissions = async () => {
    if (!selectedUser) return;
    setSavingPermissions(true);
    try {
      const res = await authFetch(`${API_BASE}/settings/users/${selectedUser.id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permissions: userPermissions,
          reason: permReason.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update permissions');
      }
      setPermSuccess(true);
      setTimeout(() => setPermSuccess(false), 3000);
      loadUserActivityLogs(selectedUser.id);
    } catch (err: any) {
      alert(err.message || 'Error updating permissions');
    } finally {
      setSavingPermissions(false);
    }
  };

  // Toggle Account Status (Deactivate / Reactivate)
  const handleToggleUserStatus = async (user: UserProfile) => {
    const actionWord = user.is_active ? 'deactivate' : 'reactivate';
    const activeSuperAdmins = users.filter(u => u.role === 'SUPER_ADMIN' && u.is_active);

    if (user.role === 'SUPER_ADMIN' && user.is_active && activeSuperAdmins.length <= 1) {
      alert('Cannot deactivate this Super Admin account: At least one active Super Admin must remain in the system.');
      return;
    }

    if (user.role === 'SUPER_ADMIN' && !user.is_active && activeSuperAdmins.length >= 5) {
      alert('Cannot reactivate this Super Admin account: Maximum limit of 5 active Super Admin accounts reached.');
      return;
    }

    const reason = window.prompt(`Please enter a reason to ${actionWord} account for ${user.full_name}:`);
    if (reason === null) return; // User cancelled prompt

    try {
      const res = await authFetch(`${API_BASE}/settings/users/${user.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isActive: !user.is_active,
          reason: reason.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Failed to ${actionWord} user`);
      }
      fetchUsers();
      if (selectedUser?.id === user.id) {
        setSelectedUser({ ...selectedUser, is_active: !user.is_active });
        loadUserActivityLogs(user.id);
      }
    } catch (err: any) {
      alert(err.message || `Error updating user status`);
    }
  };

  // Toggle Role (Super Admin vs Employee)
  const handleToggleUserRole = async (user: UserProfile) => {
    const newRole = user.role === 'SUPER_ADMIN' ? 'EMPLOYEE' : 'SUPER_ADMIN';
    const activeSuperAdmins = users.filter(u => u.role === 'SUPER_ADMIN' && u.is_active);

    if (newRole === 'SUPER_ADMIN' && activeSuperAdmins.length >= 5) {
      alert('Cannot promote to Super Admin: Maximum limit of 5 active Super Admin accounts reached.');
      return;
    }

    if (newRole === 'EMPLOYEE' && user.role === 'SUPER_ADMIN' && user.is_active && activeSuperAdmins.length <= 1) {
      alert('Cannot demote this Super Admin account: At least one active Super Admin must remain in the system.');
      return;
    }

    const confirmMsg = `Are you sure you want to change ${user.full_name}'s role to ${newRole}?`;
    if (!window.confirm(confirmMsg)) return;

    const reason = window.prompt(`Please enter an administrative reason for changing role to ${newRole}:`);
    if (reason === null) return;

    try {
      const res = await authFetch(`${API_BASE}/settings/users/${user.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: newRole,
          reason: reason.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update user role');
      }
      fetchUsers();
      if (selectedUser?.id === user.id) {
        setSelectedUser({ ...selectedUser, role: newRole });
        loadUserActivityLogs(user.id);
      }
    } catch (err: any) {
      alert(err.message || 'Error updating user role');
    }
  };

  // Soft-delete user account to Recovery Center
  const handleDeleteUser = async (user: UserProfile) => {
    const activeSuperAdmins = users.filter(u => u.role === 'SUPER_ADMIN' && u.is_active);

    if (user.role === 'SUPER_ADMIN' && user.is_active && activeSuperAdmins.length <= 1) {
      alert('Cannot delete this Super Admin account: At least one active Super Admin must remain in the system.');
      return;
    }

    const roleLabel = user.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Employee';
    const reason = window.prompt(
      `Are you sure you want to move ${roleLabel.toLowerCase()} "${user.full_name}" to the Recovery Center?\n\nEnter deletion reason:`
    );
    if (reason === null) return; // User cancelled

    try {
      const res = await authFetch(`${API_BASE}/settings/users/${user.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to soft-delete user account');
      }
      alert(`${roleLabel} "${user.full_name}" moved to Recovery Center. Super Admin can restore this profile at any time.`);
      setSelectedUser(null);
      fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Error deleting user account');
    }
  };

  // Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password) {
      alert('Please fill out all required fields.');
      return;
    }

    if (role === 'SUPER_ADMIN') {
      const activeAdminCount = users.filter(u => u.role === 'SUPER_ADMIN' && u.is_active).length;
      if (activeAdminCount >= 5) {
        setErrorMsg('Maximum limit of 5 active Super Admin accounts reached. Cannot create another Super Admin account.');
        return;
      }
    }

    setSubmittingUser(true);
    setErrorMsg(null);
    try {
      const res = await authFetch(`${API_BASE}/settings/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email,
          password,
          phone: phone || undefined,
          role,
          permissions: role === 'EMPLOYEE' ? newAccountPerms : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to create user account');
      }

      setShowAddModal(false);
      setFullName('');
      setEmail('');
      setPassword('');
      setPhone('');
      setRole('EMPLOYEE');
      setNewAccountPerms(['sales.create', 'inventory.view']);
      setErrorMsg(null);
      fetchUsers();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmittingUser(false);
    }
  };

  // Export CSV
  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (selectedFilterUser) params.append('userId', selectedFilterUser);
      if (selectedFilterRole) params.append('role', selectedFilterRole);
      if (selectedFilterModule) params.append('module', selectedFilterModule);
      if (selectedFilterAction) params.append('action', selectedFilterAction);
      if (selectedFilterOutcome) params.append('outcome', selectedFilterOutcome);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await authFetch(`${API_BASE}/settings/audit-logs/export?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to export audit logs');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FurniERP_Audit_Trail_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Error exporting CSV');
    } finally {
      setExportingCsv(false);
    }
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedFilterUser('');
    setSelectedFilterRole('');
    setSelectedFilterModule('');
    setSelectedFilterAction('');
    setSelectedFilterOutcome('');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };

  // Calculate audit stats
  const auditStats = useMemo(() => {
    const successCount = auditLogs.filter(l => l.outcome === 'SUCCESS').length;
    const failureCount = auditLogs.filter(l => l.outcome === 'FAILURE' || l.outcome === 'DENIED').length;
    const actorCount = new Set(auditLogs.map(l => l.actor_name || l.user_id)).size;
    return {
      successCount,
      failureCount,
      actorCount,
    };
  }, [auditLogs]);

  return (
    <div className="p-6 max-w-[1500px] mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#202820] flex items-center gap-2.5">
            <span>User Management & System Audit Trail</span>
          </h1>
          <p className="text-sm text-[#69736B] mt-0.5">
            Real-time accountability, employee accounts, granular permissions, and tamper-proof server logs
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 bg-[#E9EFE9] p-1 rounded-xl self-start sm:self-auto border border-[#D5E0D5]">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'users'
                ? 'bg-[#276749] text-white shadow-xs'
                : 'text-[#202820] hover:text-[#276749] hover:bg-[#FAFBF9]/60'
            }`}
          >
            <UsersIcon className="w-4 h-4" />
            <span>Employee Accounts ({users.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'audit'
                ? 'bg-[#276749] text-white shadow-xs'
                : 'text-[#202820] hover:text-[#276749] hover:bg-[#FAFBF9]/60'
            }`}
          >
            <History className="w-4 h-4" />
            <span>System Activity History & Audit Log</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: EMPLOYEE ACCOUNTS                                                  */}
      {/* ========================================================================= */}
      {activeTab === 'users' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Security Architecture Info Banner */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-[#E3E7E1] rounded-2xl p-5 flex items-start gap-4 shadow-2xs hover:border-[#C8DEC9] transition-all">
              <div className="w-11 h-11 rounded-2xl bg-[#EAF3EC] text-[#276749] flex items-center justify-center shrink-0 border border-[#C8DEC9]">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-bold text-[#202820]">SUPER_ADMIN Role (Company Owner)</div>
                  <span className="text-[11px] font-semibold text-[#276749] bg-[#EAF3EC] px-2 py-0.5 rounded-full border border-[#C8DEC9]">
                    {users.filter(u => u.role === 'SUPER_ADMIN' && u.is_active).length} / 5 Active ({users.filter(u => u.role === 'SUPER_ADMIN').length} Total)
                  </span>
                </div>
                <p className="text-xs text-[#69736B] mt-1 leading-relaxed">
                  Full authority across POS sales, purchasing, inventory adjustments, profit reports, user accounts, and company settings.
                </p>
              </div>
            </div>

            <div className="bg-white border border-[#E3E7E1] rounded-2xl p-5 flex items-start gap-4 shadow-2xs hover:border-[#BFDBFE] transition-all">
              <div className="w-11 h-11 rounded-2xl bg-[#EBF2FA] text-[#2563EB] flex items-center justify-center shrink-0 border border-[#BFDBFE]">
                <UserCheck className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-bold text-[#202820]">EMPLOYEE Role (Shop & Warehouse Staff)</div>
                  <span className="text-[11px] font-semibold text-[#2563EB] bg-[#EBF2FA] px-2 py-0.5 rounded-full border border-[#BFDBFE]">
                    {users.filter(u => u.role === 'EMPLOYEE').length} Staff Accounts
                  </span>
                </div>
                <p className="text-xs text-[#69736B] mt-1 leading-relaxed">
                  Authoritative POS checkout and stock receiving. Strict restrictions block viewing profit reports, managing accounts, or silent edits.
                </p>
              </div>
            </div>
          </div>

          {/* Users Table Header */}
          <div className="bg-white rounded-2xl border border-[#E3E7E1] overflow-hidden shadow-2xs">
            <div className="p-5 border-b border-[#E3E7E1] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FAFBF9]">
              <div>
                <h2 className="font-bold text-[#202820] text-base flex items-center gap-2">
                  <span>Authorized Company Users</span>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-[#EAF3EC] text-[#276749] rounded-full border border-[#C8DEC9]">
                    {users.length} Total
                  </span>
                </h2>
                <p className="text-xs text-[#69736B] mt-0.5">
                  Click any user or the Activity & Permissions button to inspect activity trails and configure permissions
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#276749] hover:bg-[#1F5439] active:bg-[#1A4830] text-white text-xs font-semibold rounded-xl shadow-sm shadow-[#276749]/20 transition-all self-start sm:self-auto cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ New Account</span>
              </button>
            </div>

            {loadingUsers ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="w-6 h-6 animate-spin text-[#276749]" />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center p-12 text-[#69736B]">
                <UsersIcon className="w-10 h-10 mx-auto mb-3 text-[#C8CEC7]" />
                <p className="text-sm font-medium">No user accounts found in `user_profiles`.</p>
                <p className="text-xs text-[#8C948D] mt-1">
                  Initialize the Super Admin or create an employee account to begin.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-[#FAFBF9] border-b border-[#E3E7E1] text-[11px] font-semibold uppercase tracking-wider text-[#69736B]">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Contact Phone</th>
                    <th className="py-3 px-4">Account Status</th>
                    <th className="py-3 px-4">Created Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E7E1]">
                  {users.map(u => (
                    <tr
                      key={u.id}
                      onClick={() => openUserDrawer(u)}
                      className="hover:bg-[#FAFBF9]/80 transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-[#202820] group-hover:text-[#276749] transition-colors flex items-center gap-2">
                          <span>{u.full_name}</span>
                          {u.username && (
                            <span className="text-xs font-mono font-medium text-[#276749] bg-[#EAF3EC] px-1.5 py-0.5 rounded-md border border-[#C8DEC9]">
                              @{u.username}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#8C948D] font-mono">{u.id}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        {u.role === 'SUPER_ADMIN' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#EAF3EC] text-[#276749] border border-[#C8DEC9]">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Super Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#EBF2FA] text-[#2563EB] border border-[#BFDBFE]">
                            <UserCheck className="w-3.5 h-3.5" />
                            Employee
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-[#69736B]">
                        {u.phone || '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#15803D]" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#DC2626]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626]" />
                            Deactivated
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-[#8C948D]">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openUserDrawer(u)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#276749] bg-[#EAF3EC] hover:bg-[#D4E8D7] rounded-xl border border-[#C8DEC9] transition-all shadow-2xs cursor-pointer"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            <span>Activity & Permissions</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SYSTEM ACTIVITY HISTORY & AUDIT LOG                                */}
      {/* ========================================================================= */}
      {activeTab === 'audit' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Audit Metrics Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-[#E3E7E1] rounded-2xl p-4 shadow-2xs">
              <span className="text-xs text-[#69736B] font-medium">Total Logged Events</span>
              <div className="text-2xl font-bold text-[#202820] mt-1">{auditTotal.toLocaleString()}</div>
              <span className="text-[11px] text-[#276749] mt-0.5 inline-block">Database audit trail</span>
            </div>

            <div className="bg-white border border-[#E3E7E1] rounded-2xl p-4 shadow-2xs">
              <span className="text-xs text-[#69736B] font-medium">Successful Actions</span>
              <div className="text-2xl font-bold text-[#15803D] mt-1">{auditStats.successCount}</div>
              <span className="text-[11px] text-[#69736B] mt-0.5 inline-block">On current page</span>
            </div>

            <div className="bg-white border border-[#E3E7E1] rounded-2xl p-4 shadow-2xs">
              <span className="text-xs text-[#69736B] font-medium">Security & Denied Events</span>
              <div className="text-2xl font-bold text-[#DC2626] mt-1">{auditStats.failureCount}</div>
              <span className="text-[11px] text-[#DC2626] mt-0.5 inline-block">Requires inspection</span>
            </div>

            <div className="bg-white border border-[#E3E7E1] rounded-2xl p-4 shadow-2xs">
              <span className="text-xs text-[#69736B] font-medium">Active Actors</span>
              <div className="text-2xl font-bold text-[#2563EB] mt-1">{auditStats.actorCount}</div>
              <span className="text-[11px] text-[#69736B] mt-0.5 inline-block">Contributing users</span>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="bg-white rounded-2xl border border-[#E3E7E1] p-5 shadow-2xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#E3E7E1]">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#276749]" />
                <h3 className="font-bold text-[#202820] text-sm">Audit Trail Filters & Criteria</h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetFilters}
                  className="px-3 py-1.5 text-xs text-[#69736B] hover:text-[#202820] hover:bg-[#FAFBF9] rounded-xl border border-[#E3E7E1] transition-colors"
                >
                  Reset Filters
                </button>
                <button
                  onClick={fetchAuditLogs}
                  disabled={loadingAudit}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#202820] bg-[#FAFBF9] hover:bg-[#E3E7E1]/50 rounded-xl border border-[#E3E7E1] transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingAudit ? 'animate-spin text-[#276749]' : ''}`} />
                  Refresh
                </button>
                <button
                  onClick={handleExportCsv}
                  disabled={exportingCsv}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#276749] hover:bg-[#234A34] rounded-xl shadow-xs transition-colors"
                >
                  {exportingCsv ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  Export CSV
                </button>
              </div>
            </div>

            {/* Filter Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Search */}
              <div className="lg:col-span-2 relative">
                <label className="block text-[11px] font-semibold text-[#69736B] mb-1">Search</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#8C948D]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by user, action, record, description..."
                    className="w-full pl-9 pr-3 py-2 bg-white border border-[#E3E7E1] rounded-xl text-xs text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  />
                </div>
              </div>

              {/* User Dropdown */}
              <div>
                <label className="block text-[11px] font-semibold text-[#69736B] mb-1">User / Actor</label>
                <select
                  value={selectedFilterUser}
                  onChange={e => setSelectedFilterUser(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#E3E7E1] rounded-xl text-xs text-[#202820] focus:border-[#276749] focus:outline-hidden"
                >
                  <option value="">All Users</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                  ))}
                </select>
              </div>

              {/* Module Dropdown */}
              <div>
                <label className="block text-[11px] font-semibold text-[#69736B] mb-1">Module</label>
                <select
                  value={selectedFilterModule}
                  onChange={e => setSelectedFilterModule(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#E3E7E1] rounded-xl text-xs text-[#202820] focus:border-[#276749] focus:outline-hidden"
                >
                  <option value="">All Modules</option>
                  <option value="AUTH">Authentication</option>
                  <option value="USERS">Users & Permissions</option>
                  <option value="SALES">Sales & POS</option>
                  <option value="SUPPLIERS">Suppliers</option>
                  <option value="INVENTORY">Inventory & Stock</option>
                  <option value="MANUFACTURING">Manufacturing</option>
                  <option value="FINANCE">Finance & Accounting</option>
                  <option value="SETTINGS">Settings</option>
                </select>
              </div>

              {/* Outcome Dropdown */}
              <div>
                <label className="block text-[11px] font-semibold text-[#69736B] mb-1">Outcome</label>
                <select
                  value={selectedFilterOutcome}
                  onChange={e => setSelectedFilterOutcome(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#E3E7E1] rounded-xl text-xs text-[#202820] focus:border-[#276749] focus:outline-hidden"
                >
                  <option value="">All Outcomes</option>
                  <option value="SUCCESS">Success</option>
                  <option value="FAILURE">Failure</option>
                  <option value="DENIED">Security Denied</option>
                </select>
              </div>

              {/* Date Pickers */}
              <div>
                <label className="block text-[11px] font-semibold text-[#69736B] mb-1">Date Range</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white border border-[#E3E7E1] rounded-lg text-[11px] text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  />
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white border border-[#E3E7E1] rounded-lg text-[11px] text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Central Audit Table */}
          <div className="bg-white rounded-2xl border border-[#E3E7E1] overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-[#E3E7E1] flex items-center justify-between bg-[#FAFBF9]">
              <span className="text-xs font-semibold text-[#202820]">
                Activity Events Log ({auditTotal.toLocaleString()} total)
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#69736B]">Items per page:</span>
                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 bg-white border border-[#E3E7E1] rounded-lg text-xs text-[#202820] focus:outline-hidden"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {loadingAudit ? (
              <div className="flex items-center justify-center p-16">
                <Loader2 className="w-7 h-7 animate-spin text-[#276749]" />
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center p-16 text-[#69736B]">
                <History className="w-10 h-10 mx-auto mb-3 text-[#C8CEC7]" />
                <p className="text-sm font-semibold text-[#202820]">No activity records found</p>
                <p className="text-xs text-[#8C948D] mt-1">
                  Adjust your search or filter parameters to view recorded actions.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAFBF9] border-b border-[#E3E7E1] text-[11px] font-semibold uppercase tracking-wider text-[#69736B]">
                    <tr>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Module</th>
                      <th className="py-3 px-4">Record & Ref</th>
                      <th className="py-3 px-4">Outcome</th>
                      <th className="py-3 px-4 min-w-[280px]">Narrative Description</th>
                      <th className="py-3 px-4 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E7E1]">
                    {auditLogs.map((log) => {
                      const dateObj = new Date(log.created_at);
                      const isSuperAdmin = log.actor_role === 'SUPER_ADMIN';

                      return (
                        <tr
                          key={log.id}
                          onClick={() => setInspectEvent(log)}
                          className="hover:bg-[#FAFBF9]/80 transition-colors cursor-pointer group"
                        >
                          {/* Date & Time */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-semibold text-[#202820]">
                              {dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                            <div className="text-[11px] text-[#8C948D] font-mono">
                              {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </div>
                          </td>

                          {/* Actor */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-bold text-[#202820] group-hover:text-[#276749] transition-colors">
                              {log.actor_name || 'System Actor'}
                            </div>
                            <div className="mt-0.5">
                              {isSuperAdmin ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#EAF3EC] text-[#276749] border border-[#C8DEC9]">
                                  <ShieldCheck className="w-2.5 h-2.5" />
                                  Super Admin
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#EBF2FA] text-[#2563EB] border border-[#BFDBFE]">
                                  <UserCheck className="w-2.5 h-2.5" />
                                  Employee
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Action */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="font-mono text-[11px] font-semibold text-[#202820] bg-[#FAFBF9] px-2 py-1 rounded-md border border-[#E3E7E1]">
                              {log.action}
                            </span>
                          </td>

                          {/* Module */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#F1F3EE] text-[#4F574E] border border-[#E3E7E1]">
                              {log.module || log.entity}
                            </span>
                          </td>

                          {/* Record & Ref */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {log.record_reference ? (
                              <span className="font-semibold font-mono text-xs text-[#276749]">
                                {log.record_reference}
                              </span>
                            ) : (
                              <span className="text-[#8C948D] font-mono text-[11px]">
                                {log.entity_id ? log.entity_id.slice(0, 8) + '...' : '—'}
                              </span>
                            )}
                          </td>

                          {/* Outcome */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {log.outcome === 'SUCCESS' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#EAF3EC] text-[#15803D]">
                                <CheckCircle2 className="w-3 h-3" />
                                Success
                              </span>
                            ) : log.outcome === 'DENIED' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FFFBEB] text-[#D97706]">
                                <AlertCircle className="w-3 h-3" />
                                Denied
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FEF2F2] text-[#DC2626]">
                                <XCircle className="w-3 h-3" />
                                Failure
                              </span>
                            )}
                          </td>

                          {/* Narrative Description */}
                          <td className="py-3.5 px-4">
                            <p className="text-xs text-[#202820] leading-relaxed line-clamp-2">
                              {log.description || log.action}
                            </p>
                            {log.reason && (
                              <p className="text-[11px] text-[#69736B] mt-0.5 italic">
                                Reason: {log.reason}
                              </p>
                            )}
                          </td>

                          {/* Details Button */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => setInspectEvent(log)}
                              className="px-2.5 py-1 text-xs text-[#276749] hover:bg-[#EAF3EC] rounded-lg border border-[#C8DEC9] transition-colors flex items-center gap-1 ml-auto"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            <div className="p-4 border-t border-[#E3E7E1] bg-[#FAFBF9] flex items-center justify-between">
              <span className="text-xs text-[#69736B]">
                Showing page <span className="font-semibold text-[#202820]">{currentPage}</span> of{' '}
                <span className="font-semibold text-[#202820]">{auditPages}</span> ({auditTotal.toLocaleString()} total events)
              </span>

              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage <= 1 || loadingAudit}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="px-3 py-1.5 bg-white border border-[#E3E7E1] rounded-xl text-xs font-semibold text-[#202820] hover:bg-[#FAFBF9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </button>
                <button
                  disabled={currentPage >= auditPages || loadingAudit}
                  onClick={() => setCurrentPage(prev => Math.min(auditPages, prev + 1))}
                  className="px-3 py-1.5 bg-white border border-[#E3E7E1] rounded-xl text-xs font-semibold text-[#202820] hover:bg-[#FAFBF9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DRAWER / MODAL: USER PROFILE & INDIVIDUAL AUDIT HISTORY                   */}
      {/* ========================================================================= */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-[#E3E7E1] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Drawer Header */}
            <div className="px-6 py-5 border-b border-[#E3E7E1] bg-[#FAFBF9] flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-[#202820] flex items-center gap-2">
                      <span>{selectedUser.full_name}</span>
                      {selectedUser.username && (
                        <span className="text-xs font-mono font-medium text-[#276749] bg-[#EAF3EC] px-1.5 py-0.5 rounded-md border border-[#C8DEC9]">
                          @{selectedUser.username}
                        </span>
                      )}
                    </h2>
                  </div>
                  {selectedUser.role === 'SUPER_ADMIN' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EAF3EC] text-[#276749] border border-[#C8DEC9]">
                      <ShieldCheck className="w-3 h-3" />
                      Super Admin
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#EBF2FA] text-[#2563EB] border border-[#BFDBFE]">
                      <UserCheck className="w-3 h-3" />
                      Employee
                    </span>
                  )}
                  {selectedUser.is_active ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#15803D]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#15803D]" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#DC2626]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626]" />
                      Deactivated
                    </span>
                  )}
                </div>
                <div className="text-xs text-[#8C948D] font-mono mt-1">ID: {selectedUser.id}</div>
              </div>

              <button
                onClick={() => setSelectedUser(null)}
                className="w-8 h-8 rounded-lg hover:bg-[#E3E7E1]/50 text-[#8C948D] hover:text-[#202820] flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Subtab Header inside User Profile */}
            <div className="flex border-b border-[#E3E7E1] bg-[#FAFBF9] px-6 overflow-x-auto">
              <button
                onClick={() => setUserProfileTab('general')}
                className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  userProfileTab === 'general'
                    ? 'border-[#276749] text-[#276749]'
                    : 'border-transparent text-[#69736B] hover:text-[#202820]'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                General Details
              </button>
              <button
                onClick={() => setUserProfileTab('password')}
                className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  userProfileTab === 'password'
                    ? 'border-[#276749] text-[#276749]'
                    : 'border-transparent text-[#69736B] hover:text-[#202820]'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                Password
              </button>
              <button
                onClick={() => setUserProfileTab('profile')}
                className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  userProfileTab === 'profile'
                    ? 'border-[#276749] text-[#276749]'
                    : 'border-transparent text-[#69736B] hover:text-[#202820]'
                }`}
              >
                Governance & Role
              </button>
              <button
                onClick={() => setUserProfileTab('permissions')}
                className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  userProfileTab === 'permissions'
                    ? 'border-[#276749] text-[#276749]'
                    : 'border-transparent text-[#69736B] hover:text-[#202820]'
                }`}
              >
                Permissions ({userPermissions.length})
              </button>
              <button
                onClick={() => setUserProfileTab('activity')}
                className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  userProfileTab === 'activity'
                    ? 'border-[#276749] text-[#276749]'
                    : 'border-transparent text-[#69736B] hover:text-[#202820]'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                Activity ({userAuditLogs.length})
              </button>
            </div>

            {/* Subtab Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* SUBTAB: GENERAL DETAILS / EDIT */}
              {userProfileTab === 'general' && (
                <div className="space-y-5">
                  {generalSuccess && (
                    <div className="p-3 bg-[#EAF3EC] border border-[#C8DEC9] rounded-xl text-xs text-[#276749] flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{generalSuccess}</span>
                    </div>
                  )}
                  {generalError && (
                    <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-xs text-[#DC2626] flex items-center gap-2">
                      <XCircle className="w-4 h-4 shrink-0" />
                      <span>{generalError}</span>
                    </div>
                  )}

                  <div className="bg-[#FAFBF9] border border-[#E3E7E1] rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-[#202820]">Account Information</h4>
                        <p className="text-[11px] text-[#69736B] mt-0.5">
                          {isEditingGeneral ? 'Editing account details. Changes are synced across auth and profile.' : 'View and manage the account holder\'s profile information.'}
                        </p>
                      </div>
                      {!isEditingGeneral && (
                        <button
                          onClick={handleStartEditGeneral}
                          className="px-3.5 py-1.5 text-xs font-semibold text-[#276749] bg-[#EAF3EC] hover:bg-[#D4E8D7] rounded-xl border border-[#C8DEC9] flex items-center gap-1.5 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit Details
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="text-[11px] font-semibold text-[#8C948D] uppercase tracking-wider block mb-1.5">
                          Display Name / Full Name <span className="text-red-400">*</span>
                        </label>
                        {isEditingGeneral ? (
                          <input
                            type="text"
                            value={editFullName}
                            onChange={(e) => setEditFullName(e.target.value)}
                            className="w-full px-3 py-2 border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:outline-none focus:border-[#276749] focus:ring-1 focus:ring-[#276749]/20 bg-white"
                            placeholder="Enter full name"
                          />
                        ) : (
                          <p className="text-sm font-bold text-[#202820] py-2">{selectedUser.full_name}</p>
                        )}
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-[#8C948D] uppercase tracking-wider block mb-1.5">
                          Login Username <span className="text-red-400">*</span>
                        </label>
                        {isEditingGeneral ? (
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8C948D] text-sm">@</span>
                            <input
                              type="text"
                              value={editUsername}
                              onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                              className="w-full pl-7 pr-3 py-2 border border-[#E3E7E1] rounded-xl text-sm text-[#202820] font-mono focus:outline-none focus:border-[#276749] focus:ring-1 focus:ring-[#276749]/20 bg-white"
                              placeholder="username"
                              maxLength={30}
                            />
                          </div>
                        ) : (
                          <p className="text-sm font-mono font-bold text-[#276749] py-2">@{selectedUser.username || 'None'}</p>
                        )}
                        {isEditingGeneral && (
                          <p className="text-[10px] text-[#8C948D] mt-1">3-30 characters. Letters, numbers, underscores, dots, or hyphens only.</p>
                        )}
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-[#8C948D] uppercase tracking-wider block mb-1.5">
                          Email Address
                        </label>
                        {isEditingGeneral ? (
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            className="w-full px-3 py-2 border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:outline-none focus:border-[#276749] focus:ring-1 focus:ring-[#276749]/20 bg-white"
                            placeholder="user@example.com"
                          />
                        ) : (
                          <p className="text-sm text-[#202820] py-2">{selectedUser.email || 'No email set'}</p>
                        )}
                        {isEditingGeneral && (
                          <p className="text-[10px] text-[#8C948D] mt-1">Changing email updates the authentication identity. Must be unique across all accounts.</p>
                        )}
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-[#8C948D] uppercase tracking-wider block mb-1.5">
                          Contact Phone
                        </label>
                        {isEditingGeneral ? (
                          <input
                            type="text"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            className="w-full px-3 py-2 border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:outline-none focus:border-[#276749] focus:ring-1 focus:ring-[#276749]/20 bg-white"
                            placeholder="Phone number"
                          />
                        ) : (
                          <p className="text-sm text-[#202820] py-2">{selectedUser.phone || 'No phone registered'}</p>
                        )}
                      </div>
                    </div>

                    {isEditingGeneral && (
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E3E7E1]">
                        <button
                          onClick={handleCancelGeneral}
                          className="px-4 py-2 text-xs font-semibold text-[#69736B] bg-white border border-[#E3E7E1] hover:bg-[#FAFBF9] rounded-xl transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveGeneral}
                          disabled={savingGeneral}
                          className="flex items-center gap-2 px-5 py-2 bg-[#276749] hover:bg-[#234A34] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50"
                        >
                          {savingGeneral ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          Save Changes
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Read-only metadata */}
                  <div className="grid grid-cols-2 gap-4 bg-[#FAFBF9] border border-[#E3E7E1] rounded-2xl p-5">
                    <div>
                      <span className="text-[11px] font-semibold text-[#8C948D] uppercase tracking-wider">System Role</span>
                      <p className="text-sm font-bold text-[#202820] mt-0.5">{selectedUser.role}</p>
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-[#8C948D] uppercase tracking-wider">Account State</span>
                      <p className={`text-sm font-bold mt-0.5 ${selectedUser.is_active ? 'text-[#276749]' : 'text-[#DC2626]'}`}>
                        {selectedUser.is_active ? 'Active' : 'Deactivated'}
                      </p>
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-[#8C948D] uppercase tracking-wider">Account ID</span>
                      <p className="text-[11px] font-mono text-[#69736B] mt-0.5 break-all">{selectedUser.id}</p>
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-[#8C948D] uppercase tracking-wider">Created</span>
                      <p className="text-sm text-[#202820] mt-0.5">{new Date(selectedUser.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* SUBTAB: PASSWORD MANAGEMENT */}
              {userProfileTab === 'password' && (
                <div className="space-y-5">
                  {passwordSuccess && (
                    <div className="p-3 bg-[#EAF3EC] border border-[#C8DEC9] rounded-xl text-xs text-[#276749] flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{passwordSuccess}</span>
                    </div>
                  )}
                  {passwordError && (
                    <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-xs text-[#DC2626] flex items-center gap-2">
                      <XCircle className="w-4 h-4 shrink-0" />
                      <span>{passwordError}</span>
                    </div>
                  )}

                  <div className="bg-[#FAFBF9] border border-[#E3E7E1] rounded-2xl p-5 space-y-4">
                    <div>
                      <h4 className="text-sm font-bold text-[#202820] flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-[#276749]" />
                        Reset Password for {selectedUser.full_name}
                      </h4>
                      <p className="text-[11px] text-[#69736B] mt-1 leading-relaxed">
                        As Super Admin, you can set a new password for this account without knowing their current password.
                        The employee will need to sign in with the new password immediately. Passwords are never logged in audit trails.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="text-[11px] font-semibold text-[#8C948D] uppercase tracking-wider block mb-1.5">
                          New Password <span className="text-red-400">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showNewPassword ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-3 py-2 pr-10 border border-[#E3E7E1] rounded-xl text-sm text-[#202820] font-mono focus:outline-none focus:border-[#276749] focus:ring-1 focus:ring-[#276749]/20 bg-white"
                            placeholder="Enter new password"
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8C948D] hover:text-[#202820] transition-colors"
                          >
                            {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="text-[10px] text-[#8C948D] mt-1">
                          Minimum {selectedUser.role === 'SUPER_ADMIN' ? '8' : '6'} characters for {selectedUser.role} accounts.
                        </p>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-[#8C948D] uppercase tracking-wider block mb-1.5">
                          Confirm Password <span className="text-red-400">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            value={confirmNewPassword}
                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                            className={`w-full px-3 py-2 pr-10 border rounded-xl text-sm text-[#202820] font-mono focus:outline-none focus:ring-1 bg-white ${
                              confirmNewPassword && confirmNewPassword !== newPassword
                                ? 'border-red-300 focus:border-red-400 focus:ring-red-200'
                                : confirmNewPassword && confirmNewPassword === newPassword
                                ? 'border-[#C8DEC9] focus:border-[#276749] focus:ring-[#276749]/20'
                                : 'border-[#E3E7E1] focus:border-[#276749] focus:ring-[#276749]/20'
                            }`}
                            placeholder="Re-enter new password"
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8C948D] hover:text-[#202820] transition-colors"
                          >
                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        {confirmNewPassword && confirmNewPassword !== newPassword && (
                          <p className="text-[10px] text-red-500 mt-1">Passwords do not match.</p>
                        )}
                        {confirmNewPassword && confirmNewPassword === newPassword && newPassword.length >= (selectedUser.role === 'SUPER_ADMIN' ? 8 : 6) && (
                          <p className="text-[10px] text-[#276749] mt-1 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Passwords match.
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-[#8C948D] uppercase tracking-wider block mb-1.5">
                          Reason (Optional)
                        </label>
                        <input
                          type="text"
                          value={passwordReason}
                          onChange={(e) => setPasswordReason(e.target.value)}
                          className="w-full px-3 py-2 border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:outline-none focus:border-[#276749] focus:ring-1 focus:ring-[#276749]/20 bg-white"
                          placeholder="e.g. Employee forgot password"
                        />
                        <p className="text-[10px] text-[#8C948D] mt-1">Recorded in audit trail. The password itself is never logged.</p>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2 border-t border-[#E3E7E1]">
                      <button
                        onClick={handleResetPassword}
                        disabled={savingPassword || !newPassword || !confirmNewPassword || newPassword !== confirmNewPassword}
                        className="flex items-center gap-2 px-5 py-2 bg-[#276749] hover:bg-[#234A34] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {savingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        Reset Password
                      </button>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-1.5">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Security Notice
                    </p>
                    <ul className="list-disc list-inside text-[11px] space-y-0.5 text-amber-700">
                      <li>Password resets take effect immediately</li>
                      <li>The employee's active sessions may require re-authentication</li>
                      <li>Communicate the new password through a secure channel</li>
                      <li>Passwords are encrypted with bcrypt and never stored in plain text</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* SUBTAB 1: GOVERNANCE & ROLE */}
              {userProfileTab === 'profile' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4 bg-[#FAFBF9] border border-[#E3E7E1] rounded-2xl p-5">
                    <div>
                      <span className="text-[11px] font-semibold text-[#8C948D] uppercase tracking-wider">Account Holder</span>
                      <p className="text-sm font-bold text-[#202820] mt-0.5">{selectedUser.full_name}</p>
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-[#8C948D] uppercase tracking-wider">Login Username</span>
                      <p className="text-sm font-mono font-bold text-[#276749] mt-0.5">@{selectedUser.username || 'None'}</p>
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-[#8C948D] uppercase tracking-wider">Contact Phone</span>
                      <p className="text-sm text-[#202820] mt-0.5">{selectedUser.phone || 'None registered'}</p>
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-[#8C948D] uppercase tracking-wider">Created Date</span>
                      <p className="text-sm text-[#202820] mt-0.5">{new Date(selectedUser.created_at).toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-[#8C948D] uppercase tracking-wider">Account State</span>
                      <p className="text-sm font-bold mt-0.5 text-[#202820]">
                        {selectedUser.is_active ? 'Active & Permitted to Login' : 'Deactivated / Login Blocked'}
                      </p>
                    </div>
                  </div>

                  <div className="border border-[#E3E7E1] rounded-2xl p-5 space-y-4">
                    <h4 className="text-sm font-bold text-[#202820]">Administrative Account Governance</h4>
                    <p className="text-xs text-[#69736B]">
                      Role upgrades and account deactivations require server authorization and are permanently recorded in the audit trail.
                    </p>

                    <div className="flex flex-wrap gap-3 pt-2">
                      <button
                        onClick={() => handleToggleUserRole(selectedUser)}
                        className="px-4 py-2 border border-[#E3E7E1] hover:border-[#276749] text-xs font-semibold rounded-xl text-[#202820] hover:text-[#276749] transition-colors"
                      >
                        {selectedUser.role === 'SUPER_ADMIN' ? 'Demote to EMPLOYEE Role' : 'Promote to SUPER_ADMIN Role'}
                      </button>

                      <button
                        onClick={() => handleDeleteUser(selectedUser)}
                        className="px-4 py-2 text-xs font-semibold rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors flex items-center gap-1.5"
                        title="Move to Recovery Center / Recycle Bin"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Move to Recovery Center
                      </button>

                      <button
                        onClick={() => handleToggleUserStatus(selectedUser)}
                        className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-colors ${
                          selectedUser.is_active
                            ? 'border-[#FECACA] bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FEE2E2]'
                            : 'border-[#C8DEC9] bg-[#EAF3EC] text-[#276749] hover:bg-[#D4E8D7]'
                        }`}
                      >
                        {selectedUser.is_active
                          ? (selectedUser.role === 'SUPER_ADMIN' ? 'Deactivate Super Admin' : 'Deactivate Employee Account')
                          : (selectedUser.role === 'SUPER_ADMIN' ? 'Reactivate Super Admin' : 'Reactivate Employee Account')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SUBTAB 2: PERMISSIONS MATRIX */}
              {userProfileTab === 'permissions' && (
                <div className="space-y-6">
                  {permSuccess && (
                    <div className="p-3 bg-[#EAF3EC] border border-[#C8DEC9] rounded-xl text-xs text-[#276749] flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Permissions updated successfully and recorded in audit trail.</span>
                    </div>
                  )}

                  <div className="bg-[#FAFBF9] border border-[#E3E7E1] rounded-xl p-4">
                    <div className="text-xs font-semibold text-[#202820]">Configuring Access Rights</div>
                    <p className="text-[11px] text-[#69736B] mt-0.5">
                      Permissions are enforced strictly at both API endpoints and database policies. Changes take effect on the employee's next request.
                    </p>
                  </div>

                  {/* Group permissions by module */}
                  {['Sales', 'Inventory', 'Suppliers', 'Manufacturing', 'Finance'].map(mod => {
                    const permsInMod = AVAILABLE_PERMISSIONS.filter(p => p.module === mod);
                    return (
                      <div key={mod} className="space-y-2.5">
                        <h5 className="text-xs font-bold text-[#202820] uppercase tracking-wider">{mod} Permissions</h5>
                        <div className="grid grid-cols-1 gap-2">
                          {permsInMod.map(perm => {
                            const isChecked = userPermissions.includes(perm.key);
                            return (
                              <label
                                key={perm.key}
                                className={`flex items-start gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
                                  isChecked
                                    ? 'bg-[#EAF3EC]/40 border-[#276749]/40'
                                    : 'bg-white border-[#E3E7E1] hover:border-[#C8CEC7]'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleTogglePermission(perm.key)}
                                  className="mt-0.5 h-4 w-4 rounded text-[#276749] focus:ring-[#276749] border-[#E3E7E1]"
                                />
                                <div className="text-xs">
                                  <div className="font-semibold text-[#202820]">{perm.label}</div>
                                  <div className="text-[#69736B] text-[11px] mt-0.5">{perm.description}</div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  <div className="pt-2 border-t border-[#E3E7E1] space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#202820] mb-1">
                        Reason for Permission Changes (Audit Comment)
                      </label>
                      <input
                        type="text"
                        value={permReason}
                        onChange={e => setPermReason(e.target.value)}
                        placeholder="e.g. Assigned to warehouse receiving duties"
                        className="w-full px-3.5 py-2 bg-white border border-[#E3E7E1] rounded-xl text-xs text-[#202820] focus:border-[#276749] focus:outline-hidden"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={handleSavePermissions}
                        disabled={savingPermissions}
                        className="flex items-center gap-2 px-5 py-2 bg-[#276749] hover:bg-[#234A34] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
                      >
                        {savingPermissions && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Save Permissions & Record Audit
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SUBTAB 3: USER ACTIVITY HISTORY */}
              {userProfileTab === 'activity' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-[#202820]">Activity Trail for {selectedUser.full_name}</h4>
                      <p className="text-xs text-[#69736B]">Chronological server records attributed to this account</p>
                    </div>
                    <button
                      onClick={() => loadUserActivityLogs(selectedUser.id)}
                      className="px-3 py-1.5 text-xs text-[#276749] bg-[#EAF3EC] hover:bg-[#D4E8D7] rounded-xl border border-[#C8DEC9] flex items-center gap-1.5 transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingUserLogs ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>

                  {loadingUserLogs ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-[#276749]" />
                    </div>
                  ) : userAuditLogs.length === 0 ? (
                    <div className="text-center py-12 text-[#8C948D]">
                      <Clock className="w-9 h-9 mx-auto mb-2 text-[#C8CEC7]" />
                      <p className="text-xs font-medium text-[#202820]">No actions recorded yet for this user</p>
                      <p className="text-[11px] text-[#8C948D] mt-0.5">
                        New sales, receiving, inventory adjustments, or login actions will appear here automatically.
                      </p>
                    </div>
                  ) : (
                    <div className="border border-[#E3E7E1] rounded-xl overflow-hidden divide-y divide-[#E3E7E1]">
                      {userAuditLogs.map(item => {
                        const dateObj = new Date(item.created_at);
                        return (
                          <div
                            key={item.id}
                            onClick={() => setInspectEvent(item)}
                            className="p-3.5 hover:bg-[#FAFBF9] transition-colors cursor-pointer flex items-start justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-xs text-[#202820] font-mono">
                                  {item.action}
                                </span>
                                <span className="px-1.5 py-0.5 text-[10px] rounded bg-[#F1F3EE] text-[#4F574E] border border-[#E3E7E1]">
                                  {item.module}
                                </span>
                                {item.record_reference && (
                                  <span className="font-mono text-xs font-semibold text-[#276749]">
                                    {item.record_reference}
                                  </span>
                                )}
                                {item.outcome === 'SUCCESS' ? (
                                  <span className="text-[10px] font-semibold text-[#15803D] bg-[#EAF3EC] px-1.5 py-0.5 rounded-full">
                                    SUCCESS
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-semibold text-[#DC2626] bg-[#FEF2F2] px-1.5 py-0.5 rounded-full">
                                    {item.outcome}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[#69736B] leading-relaxed">
                                {item.description || item.action}
                              </p>
                              {item.reason && (
                                <p className="text-[11px] text-[#8C948D] italic">
                                  Reason: {item.reason}
                                </p>
                              )}
                            </div>

                            <span className="text-[11px] text-[#8C948D] shrink-0 whitespace-nowrap">
                              {dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' })} {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="px-6 py-3.5 border-t border-[#E3E7E1] bg-[#FAFBF9] flex justify-end">
              <button
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 bg-white border border-[#E3E7E1] hover:bg-[#FAFBF9] text-[#202820] text-xs font-semibold rounded-xl transition-colors"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EVENT DETAIL & BEFORE-AND-AFTER DIFF VIEWER                        */}
      {/* ========================================================================= */}
      {inspectEvent && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-[#E3E7E1] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#E3E7E1] flex items-center justify-between bg-[#FAFBF9]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#EAF3EC] text-[#276749] flex items-center justify-center shrink-0">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-[#202820] text-sm">
                    Audit Event Details & Diff
                  </h3>
                  <p className="text-[11px] text-[#69736B] font-mono">
                    Event ID: {inspectEvent.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectEvent(null)}
                className="w-7 h-7 rounded-lg hover:bg-[#E3E7E1]/50 text-[#8C948D] hover:text-[#202820] flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Event Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-[#FAFBF9] border border-[#E3E7E1] rounded-xl p-4 text-xs">
                <div>
                  <span className="text-[10px] font-semibold text-[#8C948D] uppercase tracking-wider">Actor Name</span>
                  <p className="font-bold text-[#202820] mt-0.5">{inspectEvent.actor_name || 'System Actor'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-[#8C948D] uppercase tracking-wider">Actor Role</span>
                  <p className="font-bold text-[#202820] mt-0.5">{inspectEvent.actor_role || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-[#8C948D] uppercase tracking-wider">Timestamp (Local)</span>
                  <p className="text-[#202820] mt-0.5">{new Date(inspectEvent.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-[#8C948D] uppercase tracking-wider">Action Name</span>
                  <p className="font-mono font-bold text-[#276749] mt-0.5">{inspectEvent.action}</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-[#8C948D] uppercase tracking-wider">Module / Entity</span>
                  <p className="text-[#202820] mt-0.5">{inspectEvent.module || inspectEvent.entity}</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-[#8C948D] uppercase tracking-wider">Record Reference</span>
                  <p className="font-mono text-[#202820] mt-0.5">{inspectEvent.record_reference || 'N/A'}</p>
                </div>
              </div>

              {/* Narrative Statement */}
              <div>
                <span className="text-[11px] font-semibold text-[#69736B] uppercase tracking-wider">Description</span>
                <p className="text-xs text-[#202820] mt-1 p-3 bg-[#FAFBF9] border border-[#E3E7E1] rounded-xl leading-relaxed">
                  {inspectEvent.description || inspectEvent.action}
                </p>
              </div>

              {/* Reason / Comment */}
              {inspectEvent.reason && (
                <div>
                  <span className="text-[11px] font-semibold text-[#69736B] uppercase tracking-wider">Documented Reason</span>
                  <p className="text-xs text-[#202820] mt-1 p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl leading-relaxed">
                    {inspectEvent.reason}
                  </p>
                </div>
              )}

              {/* PERMISSION DIFF SECTION */}
              {inspectEvent.payload && (inspectEvent.payload.added || inspectEvent.payload.removed) && (
                <div className="space-y-3">
                  <span className="text-[11px] font-semibold text-[#69736B] uppercase tracking-wider">Permissions Difference (Before vs After)</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border border-[#C8DEC9] bg-[#EAF3EC]/40 rounded-xl p-3">
                      <span className="text-[11px] font-bold text-[#15803D] flex items-center gap-1">
                        <Plus className="w-3.5 h-3.5" /> Added Permissions ({inspectEvent.payload.added?.length || 0})
                      </span>
                      <div className="mt-2 space-y-1">
                        {inspectEvent.payload.added && inspectEvent.payload.added.length > 0 ? (
                          inspectEvent.payload.added.map((p: string) => (
                            <div key={p} className="text-[11px] font-mono text-[#15803D] bg-white px-2 py-0.5 rounded border border-[#C8DEC9]">
                              + {p}
                            </div>
                          ))
                        ) : (
                          <span className="text-[11px] text-[#8C948D] italic">None added</span>
                        )}
                      </div>
                    </div>

                    <div className="border border-[#FECACA] bg-[#FEF2F2]/40 rounded-xl p-3">
                      <span className="text-[11px] font-bold text-[#DC2626] flex items-center gap-1">
                        <X className="w-3.5 h-3.5" /> Removed Permissions ({inspectEvent.payload.removed?.length || 0})
                      </span>
                      <div className="mt-2 space-y-1">
                        {inspectEvent.payload.removed && inspectEvent.payload.removed.length > 0 ? (
                          inspectEvent.payload.removed.map((p: string) => (
                            <div key={p} className="text-[11px] font-mono text-[#DC2626] bg-white px-2 py-0.5 rounded border border-[#FECACA]">
                              - {p}
                            </div>
                          ))
                        ) : (
                          <span className="text-[11px] text-[#8C948D] italic">None removed</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* FIELD-LEVEL DIFF SECTION */}
              {inspectEvent.payload && inspectEvent.payload.changes && Object.keys(inspectEvent.payload.changes).length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-[#69736B] uppercase tracking-wider">Field Modifications</span>
                  <div className="border border-[#E3E7E1] rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#FAFBF9] border-b border-[#E3E7E1] text-[10px] uppercase font-semibold text-[#69736B]">
                        <tr>
                          <th className="py-2 px-3">Field</th>
                          <th className="py-2 px-3">Before</th>
                          <th className="py-2 px-3">After</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E3E7E1]">
                        {Object.entries(inspectEvent.payload.changes).map(([field, diff]: [string, any]) => (
                          <tr key={field} className="hover:bg-[#FAFBF9]">
                            <td className="py-2 px-3 font-mono font-semibold text-[#202820]">{field}</td>
                            <td className="py-2 px-3 text-[#DC2626] line-through font-mono">{String(diff.from ?? '—')}</td>
                            <td className="py-2 px-3 text-[#15803D] font-bold font-mono">{String(diff.to ?? '—')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* STRUCTURED PAYLOAD */}
              {inspectEvent.payload && Object.keys(inspectEvent.payload).length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-[#69736B] uppercase tracking-wider">Raw Event Payload (JSON)</span>
                  <div className="p-3 bg-[#202820] text-[#E3E7E1] rounded-xl text-[11px] font-mono overflow-x-auto max-h-52">
                    <pre>{JSON.stringify(inspectEvent.payload, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-[#E3E7E1] bg-[#FAFBF9] flex justify-end">
              <button
                onClick={() => setInspectEvent(null)}
                className="px-4 py-1.5 bg-white border border-[#E3E7E1] hover:bg-[#FAFBF9] text-[#202820] text-xs font-semibold rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD EMPLOYEE                                                      */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-[#E3E7E1] shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-[#E3E7E1] flex items-center justify-between bg-[#FAFBF9]">
              <div className="flex items-center gap-2">
                <UsersIcon className="w-5 h-5 text-[#276749]" />
                <h3 className="font-bold text-[#202820]">+ New Account</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-[#8C948D] hover:text-[#202820] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-xl text-xs text-[#DC2626] flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                  Full Legal Name *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="e.g. Solomon Kebede"
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                  Work Email (Supabase Auth Email) *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => {
                    const val = e.target.value;
                    setEmail(val);
                    if (!isUsernameCustomized) {
                      const prefix = val.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
                      setUsername(prefix);
                    }
                  }}
                  placeholder="solomon@furnierp.et"
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-[#202820]">
                    Username (Login Identifier) *
                  </label>
                  <span className="text-[10px] text-[#8C948D]">
                    Entered at sign-in
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[#8C948D] font-mono">@</span>
                  <input
                    type="text"
                    required
                    minLength={3}
                    maxLength={30}
                    value={username}
                    onChange={e => {
                      setIsUsernameCustomized(true);
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''));
                    }}
                    placeholder="solomon"
                    className="w-full pl-8 pr-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm font-mono text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  />
                </div>
                <p className="text-[10px] text-[#8C948D] mt-1">
                  3-30 lowercase characters (letters, numbers, '.', '_', '-')
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                    Temporary Password *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+251 9..."
                    className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                  Account Role *
                </label>
                <select
                  value={role}
                  onChange={e => {
                    const newRole = e.target.value as 'EMPLOYEE' | 'SUPER_ADMIN';
                    setRole(newRole);
                    if (newRole === 'SUPER_ADMIN') setNewAccountPerms([]);
                    else setNewAccountPerms(['sales.create', 'inventory.view']);
                    setErrorMsg(null);
                  }}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#E3E7E1] rounded-xl text-sm text-[#202820] focus:border-[#276749] focus:outline-hidden"
                >
                  <option value="EMPLOYEE">Employee (Sales & Operations Staff)</option>
                  <option value="SUPER_ADMIN">Super Admin (System Owner)</option>
                </select>
              </div>

              {/* Role info banner */}
              {role === 'SUPER_ADMIN' && (
                <div className={`flex items-start gap-2 p-3 rounded-xl text-xs border ${
                  users.filter(u => u.role === 'SUPER_ADMIN' && u.is_active).length >= 5
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}>
                  <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    {users.filter(u => u.role === 'SUPER_ADMIN' && u.is_active).length >= 5
                      ? 'Maximum limit of 5 active Super Admin accounts reached. You cannot create another Super Admin account until an existing Super Admin is demoted, deactivated, or deleted.'
                      : `FurniERP permits up to 5 Super Admin accounts (${users.filter(u => u.role === 'SUPER_ADMIN' && u.is_active).length} of 5 currently active). Super Admin accounts receive full access to all modules.`}
                  </span>
                </div>
              )}

              {/* Permissions editor — visible only for Employee role */}
              {role === 'EMPLOYEE' && (
                <div>
                  <label className="block text-xs font-semibold text-[#202820] mb-1.5">
                    Employee Permissions ({newAccountPerms.length} granted)
                  </label>
                  <div className="space-y-1 p-2.5 bg-[#FAFBF9] border border-[#E3E7E1] rounded-xl max-h-52 overflow-y-auto">
                    {AVAILABLE_PERMISSIONS.map(perm => {
                      const isChecked = newAccountPerms.includes(perm.key);
                      return (
                        <label
                          key={perm.key}
                          className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-white cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setNewAccountPerms(prev =>
                                prev.includes(perm.key)
                                  ? prev.filter(k => k !== perm.key)
                                  : [...prev, perm.key]
                              );
                            }}
                            className="rounded-sm border-gray-300 text-[#276749] focus:ring-[#276749]"
                          />
                          <div className="min-w-0">
                            <div className="font-medium text-[#202820]">{perm.label}</div>
                            <div className="text-[10px] text-[#8C948D]">{perm.description}</div>
                          </div>
                          <span className="text-[10px] text-[#8C948D] font-mono ml-auto shrink-0">{perm.module}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setErrorMsg(null);
                  }}
                  className="px-4 py-2 border border-[#E3E7E1] text-[#69736B] hover:text-[#202820] text-xs font-medium rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingUser}
                  className="px-5 py-2 bg-[#276749] hover:bg-[#234A34] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-2"
                >
                  {submittingUser && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {role === 'SUPER_ADMIN' ? 'Create Super Admin' : 'Create Employee Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
