import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { z } from 'zod';
import { requireSuperAdmin } from '../middleware/auth';
import { logAudit, queryAuditLogs, exportAuditLogsCSV, buildDiff, AuditModule } from '../services/audit.service';

export const settingsRouter = Router();

// Only Super Admin can access or modify company settings, user accounts, and global audit history
settingsRouter.use(requireSuperAdmin);

export const MAX_SUPER_ADMINS = 5;

// Helper to count active, non-deleted Super Admin accounts
async function getActiveSuperAdminCount(excludeUserId?: string): Promise<number> {
  let query = supabase
    .from('user_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'SUPER_ADMIN')
    .eq('is_active', true)
    .is('deleted_at', null);

  if (excludeUserId) {
    query = query.neq('id', excludeUserId);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}


const updateSettingsSchema = z.object({
  companyName: z.string().min(2),
  brandName: z.string().optional(),
  tinNumber: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().min(2, 'Display name must be at least 2 characters').optional(),
  username: z.string().min(3, 'Username must be at least 3 characters').max(30).optional(),
  email: z.string().email('Invalid email address format').optional(),
  phone: z.string().nullable().optional(),
  role: z.enum(['SUPER_ADMIN', 'EMPLOYEE']).optional(),
  isActive: z.boolean().optional(),
  reason: z.string().optional(),
});

const resetUserPasswordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(6).optional(),
  reason: z.string().optional(),
});

const updatePermissionsSchema = z.object({
  permissions: z.array(z.string()),
  reason: z.string().optional(),
});

// GET /api/settings - Company Settings
settingsRouter.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data: settings, error } = await supabase
      .from('company_settings')
      .select('*')
      .limit(1)
      .single();

    if (error) throw error;
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
});

// PUT /api/settings - Update Company Settings
settingsRouter.put('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = updateSettingsSchema.parse(req.body);

    const { data: current } = await supabase
      .from('company_settings')
      .select('*')
      .limit(1)
      .single();

    let query;
    if (current?.id) {
      query = supabase
        .from('company_settings')
        .update({
          company_name: validated.companyName,
          brand_name: validated.brandName || null,
          tin_number: validated.tinNumber || null,
          phone: validated.phone || null,
          email: validated.email || null,
          address: validated.address || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', current.id);
    } else {
      query = supabase
        .from('company_settings')
        .insert({
          company_name: validated.companyName,
          brand_name: validated.brandName || null,
          tin_number: validated.tinNumber || null,
          phone: validated.phone || null,
          email: validated.email || null,
          address: validated.address || null,
          currency: 'ETB',
        });
    }

    const { data, error } = await query.select().single();
    if (error) throw error;

    // Record Audit Trail with safe field-level diff
    const diff = buildDiff(
      current ? {
        company_name: current.company_name,
        brand_name: current.brand_name,
        tin_number: current.tin_number,
        phone: current.phone,
        email: current.email,
        address: current.address,
      } : null,
      {
        company_name: validated.companyName,
        brand_name: validated.brandName || null,
        tin_number: validated.tinNumber || null,
        phone: validated.phone || null,
        email: validated.email || null,
        address: validated.address || null,
      }
    );

    await logAudit({
      req,
      action: 'COMPANY_SETTINGS_UPDATED',
      module: 'SETTINGS',
      entity: 'company_settings',
      entityId: data.id,
      recordReference: data.company_name,
      description: `${req.user?.full_name || 'Super Admin'} updated company configuration: ${data.company_name}`,
      payload: diff,
    });

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /api/settings/users - List all system users with their active permissions
settingsRouter.get('/users', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data: users, error: usersError } = await supabase
      .from('user_profiles')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (usersError) throw usersError;

    // Fetch all employee permissions
    const { data: permissions } = await supabase
      .from('employee_permissions')
      .select('user_id, permission_key');

    const permMap = new Map<string, string[]>();
    (permissions || []).forEach(p => {
      const existing = permMap.get(p.user_id) || [];
      existing.push(p.permission_key);
      permMap.set(p.user_id, existing);
    });

    const enriched = (users || []).map(u => ({
      ...u,
      is_owner: u.is_owner === true || u.username === 'abdallah' || u.id === 'a07dfa6a-a70c-4fbc-9086-38ac8f32e62e',
      permissions: u.role === 'SUPER_ADMIN' ? ['*'] : (permMap.get(u.id) || []),
    }));

    res.json({ success: true, data: enriched });
  } catch (error) {
    next(error);
  }
});

// POST /api/settings/users - Create an employee or administrator account
settingsRouter.post('/users', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password, fullName, phone, role, permissions, username } = req.body;

    if (!email || !password || !fullName) {
      res.status(400).json({ success: false, error: 'Email, password, and full name are required' });
      return;
    }

    // Normalize and validate username
    const rawUsername = (username && typeof username === 'string' && username.trim())
      ? username.trim()
      : (email.split('@')[0] || '').trim();

    const cleanUsername = rawUsername.toLowerCase();

    if (cleanUsername.length < 3 || cleanUsername.length > 30) {
      res.status(400).json({
        success: false,
        error: 'Username must be between 3 and 30 characters in length',
      });
      return;
    }

    if (!/^[a-z0-9._-]+$/.test(cleanUsername)) {
      res.status(400).json({
        success: false,
        error: 'Username may only contain letters, numbers, underscores, dots, or hyphens',
      });
      return;
    }

    // Validate username uniqueness
    const { data: existingUserWithUsername } = await supabase
      .from('user_profiles')
      .select('id, full_name, username')
      .ilike('username', cleanUsername)
      .maybeSingle();

    if (existingUserWithUsername) {
      res.status(400).json({
        success: false,
        error: `Username "${cleanUsername}" is already taken. Please choose another username.`,
      });
      return;
    }

    const assignedRole = role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'EMPLOYEE';
    const assignedPerms = assignedRole === 'EMPLOYEE' && Array.isArray(permissions) ? permissions : [];

    // Enforce Super Admin limit (maximum 5 active Super Admins)
    if (assignedRole === 'SUPER_ADMIN') {
      const activeAdminCount = await getActiveSuperAdminCount();

      if (activeAdminCount >= MAX_SUPER_ADMINS) {
        await logAudit({
          req,
          action: 'SUPER_ADMIN_CREATION_REJECTED',
          module: 'USERS',
          entity: 'user_profiles',
          recordReference: email,
          description: `Super Admin creation rejected for ${email}: Maximum limit of ${MAX_SUPER_ADMINS} active Super Admin accounts reached.`,
          outcome: 'DENIED',
          reason: `Super Admin limit reached (${MAX_SUPER_ADMINS} active accounts)`,
        });

        res.status(400).json({
          success: false,
          error: `Maximum limit of ${MAX_SUPER_ADMINS} active Super Admin accounts reached. Cannot create another Super Admin account.`,
        });
        return;
      }
    }

    // Atomically create user account, auth identity, profile, and permissions in PostgreSQL
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_system_user_account', {
      p_email: email,
      p_password: password,
      p_full_name: fullName,
      p_role: assignedRole,
      p_phone: phone || null,
      p_permissions: assignedPerms,
      p_username: cleanUsername,
    });

    if (rpcError) {
      console.error('Account creation RPC error:', rpcError);
      await logAudit({
        req,
        action: assignedRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN_CREATION_FAILED' : 'EMPLOYEE_CREATION_FAILED',
        module: 'USERS',
        entity: 'user_profiles',
        recordReference: email,
        description: `Failed attempt by ${req.user?.full_name || 'Super Admin'} to create ${assignedRole} account for ${email}: ${rpcError.message}`,
        outcome: rpcError.message.includes('already exists') ? 'DENIED' : 'FAILURE',
        reason: rpcError.message,
      });

      res.status(400).json({
        success: false,
        error: rpcError.message || 'Failed to create user account',
      });
      return;
    }

    // Fetch newly created user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', rpcData.user_id)
      .single();

    if (profileError) throw profileError;

    // Record Audit Event with creator identity
    await logAudit({
      req,
      action: assignedRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN_CREATED' : 'EMPLOYEE_CREATED',
      module: 'USERS',
      entity: 'user_profiles',
      entityId: profile.id,
      recordReference: fullName,
      description: `${req.user?.full_name || 'Super Admin'} created new ${assignedRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Employee'} account: ${fullName} (${email})`,
      payload: { email, phone, role: assignedRole, permissions: assignedPerms },
    });

    res.status(201).json({
      success: true,
      data: {
        ...profile,
        permissions: assignedRole === 'SUPER_ADMIN' ? ['*'] : assignedPerms,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/settings/users/:id/role - Update user role with single-owner verification
settingsRouter.put('/users/:id/role', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { role, reason } = req.body;

    if (!role || !['SUPER_ADMIN', 'EMPLOYEE'].includes(role)) {
      res.status(400).json({ success: false, error: 'Valid role is required (SUPER_ADMIN or EMPLOYEE)' });
      return;
    }

    const { data: existing, error: findError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      res.status(404).json({ success: false, error: 'User account not found' });
      return;
    }

    // Permanent Security Safeguard: Protect Primary Owner account (Abdallah)
    if (existing.is_owner || existing.username === 'abdallah' || id === 'a07dfa6a-a70c-4fbc-9086-38ac8f32e62e') {
      if (role !== 'SUPER_ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Permanent Security Safeguard: The Primary Owner account (Abdallah) is permanently protected and cannot be demoted.',
        });
        return;
      }
    }

    if (role === 'SUPER_ADMIN' && existing.role !== 'SUPER_ADMIN') {
      const activeAdminCount = await getActiveSuperAdminCount(id);

      if (activeAdminCount >= MAX_SUPER_ADMINS) {
        res.status(400).json({
          success: false,
          error: `Maximum limit of ${MAX_SUPER_ADMINS} active Super Admin accounts reached. Cannot promote this user to Super Admin.`,
        });
        return;
      }
    }

    if (role === 'EMPLOYEE' && existing.role === 'SUPER_ADMIN' && existing.is_active) {
      const remainingAdmins = await getActiveSuperAdminCount(id);
      if (remainingAdmins < 1) {
        res.status(400).json({
          success: false,
          error: 'Cannot demote this Super Admin account. At least one active Super Admin must remain in the system.',
        });
        return;
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('user_profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    await logAudit({
      req,
      action: 'EMPLOYEE_ROLE_CHANGED',
      module: 'USERS',
      entity: 'user_profiles',
      entityId: id,
      recordReference: updated.full_name,
      description: `${req.user?.full_name || 'Super Admin'} changed role for ${existing.full_name} from ${existing.role} to ${role}`,
      reason: reason || null,
      payload: { oldRole: existing.role, newRole: role },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// PUT /api/settings/users/:id/status - Toggle active/deactivated status
settingsRouter.put('/users/:id/status', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { isActive, reason } = req.body;

    const { data: existing, error: findError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    // Permanent Security Safeguard: Protect Primary Owner account (Abdallah)
    if (existing.is_owner || existing.username === 'abdallah' || id === 'a07dfa6a-a70c-4fbc-9086-38ac8f32e62e') {
      if (!isActive) {
        res.status(403).json({
          success: false,
          error: 'Permanent Security Safeguard: The Primary Owner account (Abdallah) is permanently protected and cannot be deactivated.',
        });
        return;
      }
    }

    if (existing.role === 'SUPER_ADMIN' && !isActive) {
      const remainingAdmins = await getActiveSuperAdminCount(id);
      if (remainingAdmins < 1) {
        res.status(400).json({
          success: false,
          error: 'Cannot deactivate this Super Admin account. At least one active Super Admin must remain in the system.',
        });
        return;
      }
    }

    if (existing.role === 'SUPER_ADMIN' && isActive && !existing.is_active) {
      const activeAdminCount = await getActiveSuperAdminCount(id);
      if (activeAdminCount >= MAX_SUPER_ADMINS) {
        res.status(400).json({
          success: false,
          error: `Cannot reactivate Super Admin account. Maximum limit of ${MAX_SUPER_ADMINS} active Super Admin accounts reached.`,
        });
        return;
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('user_profiles')
      .update({ is_active: !!isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    const action = isActive ? 'EMPLOYEE_REACTIVATED' : 'EMPLOYEE_DEACTIVATED';
    const description = `${req.user?.full_name || 'Super Admin'} ${isActive ? 'reactivated' : 'deactivated'} account: ${existing.full_name}`;

    await logAudit({
      req,
      action,
      module: 'USERS',
      entity: 'user_profiles',
      entityId: id,
      recordReference: existing.full_name,
      description: reason ? `${description}. Reason: ${reason}` : description,
      reason: reason || null,
      payload: { oldStatus: existing.is_active, newStatus: !!isActive },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// PUT /api/settings/users/:id - Update user profile details (uses RPC for username/email atomicity)
settingsRouter.put('/users/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const validated = updateUserSchema.parse(req.body);

    const { data: existing, error: findError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      res.status(404).json({ success: false, error: 'User account not found' });
      return;
    }

    // Permanent Security Safeguard: Protect Primary Owner account (Abdallah)
    if (existing.is_owner || existing.username === 'abdallah' || id === 'a07dfa6a-a70c-4fbc-9086-38ac8f32e62e') {
      if (validated.role && validated.role !== 'SUPER_ADMIN') {
        res.status(403).json({
          success: false,
          error: 'Permanent Security Safeguard: The Primary Owner account (Abdallah) is permanently protected and cannot be demoted.',
        });
        return;
      }
      if (validated.isActive === false) {
        res.status(403).json({
          success: false,
          error: 'Permanent Security Safeguard: The Primary Owner account (Abdallah) is permanently protected and cannot be deactivated.',
        });
        return;
      }
    }

    if (validated.role === 'SUPER_ADMIN' && existing.role !== 'SUPER_ADMIN') {
      const activeAdminCount = await getActiveSuperAdminCount(id);
      if (activeAdminCount >= MAX_SUPER_ADMINS) {
        res.status(400).json({
          success: false,
          error: `Maximum limit of ${MAX_SUPER_ADMINS} active Super Admin accounts reached. Cannot promote this user to Super Admin.`,
        });
        return;
      }
    }

    if (validated.role === 'EMPLOYEE' && existing.role === 'SUPER_ADMIN' && existing.is_active) {
      const remainingAdmins = await getActiveSuperAdminCount(id);
      if (remainingAdmins < 1) {
        res.status(400).json({
          success: false,
          error: 'Cannot demote this Super Admin account. At least one active Super Admin must remain in the system.',
        });
        return;
      }
    }

    if (validated.isActive === false && existing.role === 'SUPER_ADMIN' && existing.is_active) {
      const remainingAdmins = await getActiveSuperAdminCount(id);
      if (remainingAdmins < 1) {
        res.status(400).json({
          success: false,
          error: 'Cannot deactivate this Super Admin account. At least one active Super Admin must remain in the system.',
        });
        return;
      }
    }

    if (validated.isActive === true && existing.role === 'SUPER_ADMIN' && !existing.is_active) {
      const activeAdminCount = await getActiveSuperAdminCount(id);
      if (activeAdminCount >= MAX_SUPER_ADMINS) {
        res.status(400).json({
          success: false,
          error: `Cannot reactivate Super Admin account. Maximum limit of ${MAX_SUPER_ADMINS} active Super Admin accounts reached.`,
        });
        return;
      }
    }

    const hasProfileChange = validated.fullName !== undefined || validated.username !== undefined ||
                             validated.email !== undefined || validated.phone !== undefined;
    let updated: any = existing;

    if (hasProfileChange && !validated.role && validated.isActive === undefined) {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('update_user_account_profile', {
        p_user_id: id,
        p_full_name: validated.fullName || existing.full_name,
        p_username: validated.username || existing.username || '',
        p_phone: validated.phone !== undefined ? validated.phone : existing.phone,
        p_email: validated.email || null,
      });

      if (rpcError) {
        const errMsg = rpcError.message || 'Failed to update profile';
        res.status(400).json({ success: false, error: errMsg });
        return;
      }

      const rpcData = rpcResult as any;
      if (rpcData && rpcData.success) {
        updated = {
          id: rpcData.user_id || id,
          full_name: rpcData.full_name,
          username: rpcData.username,
          email: rpcData.email,
          phone: rpcData.phone,
          role: rpcData.role,
          is_active: rpcData.is_active,
          updated_at: rpcData.updated_at,
        };
      } else {
        res.status(400).json({ success: false, error: rpcData?.error || 'Profile update failed' });
        return;
      }
    } else {
      const updates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (validated.fullName !== undefined) updates.full_name = validated.fullName;
      if (validated.phone !== undefined) updates.phone = validated.phone;
      if (validated.role !== undefined) updates.role = validated.role;
      if (validated.isActive !== undefined) updates.is_active = validated.isActive;

      const { data: directUpdated, error: updateError } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;
      updated = directUpdated;
    }

    let action = 'USER_PROFILE_UPDATED';
    let description = `${req.user?.full_name || 'Super Admin'} updated profile for ${existing.full_name}`;

    if (validated.isActive !== undefined && validated.isActive !== existing.is_active) {
      if (validated.isActive) {
        action = 'EMPLOYEE_REACTIVATED';
        description = `${req.user?.full_name || 'Super Admin'} reactivated employee account: ${existing.full_name}`;
      } else {
        action = 'EMPLOYEE_DEACTIVATED';
        description = `${req.user?.full_name || 'Super Admin'} deactivated employee account: ${existing.full_name}`;
      }
    } else if (validated.role && validated.role !== existing.role) {
      action = 'EMPLOYEE_ROLE_CHANGED';
      description = `${req.user?.full_name || 'Super Admin'} changed role for ${existing.full_name} from ${existing.role} to ${validated.role}`;
    }

    const diff = buildDiff(
      { full_name: existing.full_name, username: existing.username, email: existing.email, phone: existing.phone, role: existing.role, is_active: existing.is_active },
      { full_name: updated.full_name, username: updated.username, email: updated.email, phone: updated.phone, role: updated.role, is_active: updated.is_active }
    );

    await logAudit({
      req,
      action,
      module: 'USERS',
      entity: 'user_profiles',
      entityId: id,
      recordReference: updated.full_name,
      description: validated.reason ? `${description}. Reason: ${validated.reason}` : description,
      reason: validated.reason || null,
      payload: diff,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// POST /api/settings/users/:id/password - Admin password reset (no knowledge of current password needed)
settingsRouter.post('/users/:id/password', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id: targetUserId } = req.params;
    const adminId = req.user?.id;
    if (!adminId) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const validated = resetUserPasswordSchema.parse(req.body);

    if (validated.confirmPassword && validated.password !== validated.confirmPassword) {
      res.status(400).json({ success: false, error: 'Passwords do not match' });
      return;
    }

    const { data: targetUser, error: findErr } = await supabase
      .from('user_profiles')
      .select('full_name, username, role')
      .eq('id', targetUserId)
      .single();

    if (findErr || !targetUser) {
      res.status(404).json({ success: false, error: 'Target user not found' });
      return;
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc('admin_reset_user_password', {
      p_admin_id: adminId,
      p_target_user_id: targetUserId,
      p_new_password: validated.password,
    });

    if (rpcError) {
      const errMsg = rpcError.message || 'Password reset failed';
      res.status(400).json({ success: false, error: errMsg });
      return;
    }

    // Audit log — NEVER log the password itself
    await logAudit({
      req,
      action: 'USER_PASSWORD_RESET',
      module: 'USERS',
      entity: 'user_profiles',
      entityId: targetUserId,
      recordReference: targetUser.full_name,
      description: `${req.user?.full_name || 'Super Admin'} reset password for ${targetUser.full_name} (@${targetUser.username || 'N/A'})${validated.reason ? '. Reason: ' + validated.reason : ''}`,
      reason: validated.reason || null,
      payload: { target_role: targetUser.role, target_username: targetUser.username },
    });

    res.json({
      success: true,
      message: `Password has been reset successfully for ${targetUser.full_name}. The user must sign in with their new password.`,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/settings/users/:id/permissions - Get employee permissions
settingsRouter.get('/users/:id/permissions', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('employee_permissions')
      .select('permission_key')
      .eq('user_id', id);

    if (error) throw error;
    res.json({ success: true, data: (data || []).map(p => p.permission_key) });
  } catch (error) {
    next(error);
  }
});

// PUT /api/settings/users/:id/permissions - Grant or revoke permissions for an employee
settingsRouter.put('/users/:id/permissions', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { permissions, reason } = updatePermissionsSchema.parse(req.body);

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('full_name, role')
      .eq('id', id)
      .single();

    if (!userProfile) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    // Fetch old permissions for diff
    const { data: oldPerms } = await supabase
      .from('employee_permissions')
      .select('permission_key')
      .eq('user_id', id);
    const oldList = (oldPerms || []).map(p => p.permission_key).sort();

    // Remove existing permissions
    await supabase.from('employee_permissions').delete().eq('user_id', id);

    // Insert new permissions
    if (permissions.length > 0) {
      const rows = permissions.map(key => ({
        user_id: id,
        permission_key: key,
      }));
      const { error: insertError } = await supabase.from('employee_permissions').insert(rows);
      if (insertError) throw insertError;
    }

    const newList = [...permissions].sort();

    await logAudit({
      req,
      action: 'EMPLOYEE_PERMISSIONS_CHANGED',
      module: 'USERS',
      entity: 'employee_permissions',
      entityId: id,
      recordReference: userProfile.full_name,
      description: `${req.user?.full_name || 'Super Admin'} updated permissions for ${userProfile.full_name} (${newList.length} granted)`,
      reason: reason || null,
      payload: {
        target_user: userProfile.full_name,
        old_permissions: oldList,
        new_permissions: newList,
        added: newList.filter(p => !oldList.includes(p)),
        removed: oldList.filter(p => !newList.includes(p)),
      },
    });

    res.json({ success: true, permissions: newList });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// AUDIT LOG QUERY & EXPORT ENDPOINTS
// ============================================================================

// GET /api/settings/audit-logs - Central Activity History with filtering, search & pagination
settingsRouter.get('/audit-logs', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      userId,
      role,
      module,
      action,
      outcome,
      entity,
      entityId,
      recordReference,
      search,
      startDate,
      endDate,
      page,
      limit,
    } = req.query as Record<string, string>;

    const result = await queryAuditLogs({
      userId,
      role,
      module,
      action,
      outcome,
      entity,
      entityId,
      recordReference,
      search,
      startDate,
      endDate,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 25,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// GET /api/settings/audit-logs/export - Export audit logs to CSV
settingsRouter.get('/audit-logs/export', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      userId,
      role,
      module,
      action,
      outcome,
      search,
      startDate,
      endDate,
    } = req.query as Record<string, string>;

    const csvData = await exportAuditLogsCSV({
      userId,
      role,
      module,
      action,
      outcome,
      search,
      startDate,
      endDate,
    });

    // Record audit event for sensitive log export
    await logAudit({
      req,
      action: 'AUDIT_LOGS_EXPORTED',
      module: 'SETTINGS',
      entity: 'audit_logs',
      description: `${req.user?.full_name || 'Super Admin'} exported system activity audit logs to CSV`,
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="FurniERP_Audit_Trail_${new Date().toISOString().split('T')[0]}.csv"`);
    res.status(200).send(csvData);
  } catch (error) {
    next(error);
  }
});

// GET /api/settings/users/:id/audit-logs - Individual user activity history
settingsRouter.get('/users/:id/audit-logs', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { page, limit } = req.query as Record<string, string>;

    const result = await queryAuditLogs({
      userId: id,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 25,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// GET /api/settings/audit-logs/record/:entity/:entityId - Record-level activity trail
settingsRouter.get('/audit-logs/record/:entity/:entityId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { entity, entityId } = req.params;
    const result = await queryAuditLogs({
      entity,
      entityId,
      limit: 50,
    });

    res.json({ success: true, data: result.data });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/settings/users/:id - Soft-delete employee account
settingsRouter.delete('/users/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const { data: existing, error: findError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (findError || !existing) {
      res.status(404).json({ success: false, error: 'User not found or already deleted' });
      return;
    }

    // Permanent Security Safeguard: Protect Primary Owner account (Abdallah)
    if (existing.is_owner || existing.username === 'abdallah' || id === 'a07dfa6a-a70c-4fbc-9086-38ac8f32e62e') {
      res.status(403).json({
        success: false,
        error: 'Permanent Security Safeguard: The Primary Owner account (Abdallah) is permanently protected and cannot be deleted.',
      });
      return;
    }

    if (existing.role === 'SUPER_ADMIN') {
      if (req.user?.id === id) {
        res.status(400).json({ success: false, error: 'You cannot delete your own Super Admin account.' });
        return;
      }

      const remainingAdmins = await getActiveSuperAdminCount(id);
      if (remainingAdmins < 1) {
        res.status(400).json({
          success: false,
          error: 'Cannot delete this Super Admin account. At least one active Super Admin must remain in the system.',
        });
        return;
      }
    }

    const { data: updated, error: updateError } = await supabase
      .rpc('soft_delete_user_profile', {
        p_user_id: id,
        p_deleted_by: req.user?.id || null,
        p_reason: reason || 'Soft deleted by Super Admin',
      });

    if (updateError) throw updateError;
    if (!updated || (Array.isArray(updated) && updated.length === 0)) {
      res.status(400).json({ success: false, error: 'Cannot delete this user. They may already be deleted or are a Super Admin.' });
      return;
    }
    const deletedUser = Array.isArray(updated) ? updated[0] : updated;

    await logAudit({
      req,
      action: 'USER_DELETED',
      module: 'USERS',
      entity: 'user_profiles',
      entityId: id,
      recordReference: existing.full_name,
      description: `Soft-deleted ${existing.role === 'SUPER_ADMIN' ? 'Super Admin' : 'employee'} account: ${existing.full_name} (${existing.email || existing.phone || (existing.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Employee')})${reason ? '. Reason: ' + reason : ''}`,
      reason: reason || null,
      payload: { userId: id, name: existing.full_name, role: existing.role },
    });

    res.json({ success: true, message: `${existing.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Employee'} account moved to Recovery Center`, data: deletedUser });
  } catch (error) {
    next(error);
  }
});
