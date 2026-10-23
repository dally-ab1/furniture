import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { z } from 'zod';
import { logAudit } from '../services/audit.service';

export const authRouter = Router();

const bootstrapSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const resetSuperAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const initialEmployeeSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  adminEmail: z.string().email().optional(),
  adminPassword: z.string().optional(),
});

// GET /api/auth/status - Check system bootstrap and initial account establishment status
authRouter.get('/status', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data: superAdmin } = await supabase
      .from('user_profiles')
      .select('id, full_name, role')
      .eq('role', 'SUPER_ADMIN')
      .limit(1)
      .maybeSingle();

    const { count: employeeCount } = await supabase
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'EMPLOYEE');

    const hasSuperAdmin = !!superAdmin;
    const hasEmployee = (employeeCount || 0) > 0;
    const initialized = hasSuperAdmin && hasEmployee;

    res.json({
      success: true,
      hasSuperAdmin,
      superAdminName: superAdmin?.full_name || null,
      hasEmployee,
      employeeCount: employeeCount || 0,
      initialized,
      activeLocationsCount: 2,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/bootstrap - First-time setup: establish the initial Super Admin account
authRouter.post('/bootstrap', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { fullName, email, password, phone } = bootstrapSchema.parse(req.body);

    // Enforce preservation of existing Super Admin and reject duplicate creation
    const { data: existingAdmin } = await supabase
      .from('user_profiles')
      .select('id, full_name')
      .eq('role', 'SUPER_ADMIN')
      .limit(1)
      .maybeSingle();

    if (existingAdmin) {
      res.status(400).json({ 
        success: false, 
        error: `A Super Admin account already exists (${existingAdmin.full_name}). Duplicate Super Admin creation is prohibited.` 
      });
      return;
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc('create_initial_super_admin', {
      p_email: email,
      p_password: password,
      p_full_name: fullName,
      p_phone: phone || null,
    });

    if (rpcError) {
      console.error('Error creating super admin:', rpcError);
      res.status(400).json({ 
        success: false, 
        error: rpcError.message || 'Failed to register Super Admin' 
      });
      return;
    }

    await logAudit({
      userId: rpcData.user_id,
      actorName: fullName,
      actorRole: 'SUPER_ADMIN',
      action: 'SUPER_ADMIN_BOOTSTRAP',
      module: 'AUTH',
      entity: 'users',
      entityId: rpcData.user_id,
      recordReference: fullName,
      description: `Initial Super Admin account bootstrapped: ${fullName} (${email})`,
      outcome: 'SUCCESS',
      req,
    });

    res.status(201).json({
      success: true,
      message: 'Super Admin successfully initialized',
      user: {
        id: rpcData.user_id,
        email,
        fullName,
        role: 'SUPER_ADMIN',
      }
    });

  } catch (error) {
    next(error);
  }
});

// POST /api/auth/setup/reset-super-admin - Secure owner credentials update for Super Admin
authRouter.post('/setup/reset-super-admin', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = resetSuperAdminSchema.parse(req.body);

    const { data, error } = await supabase.rpc('reset_super_admin_credentials', {
      p_email: email,
      p_new_password: password,
    });

    if (error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    await logAudit({
      userId: data?.user_id || null,
      actorName: 'Super Admin Owner',
      actorRole: 'SUPER_ADMIN',
      action: 'SUPER_ADMIN_PASSWORD_RESET',
      module: 'AUTH',
      entity: 'users',
      entityId: data?.user_id || null,
      recordReference: email,
      description: `Super Admin owner credentials updated for: ${email}`,
      outcome: 'SUCCESS',
      req,
    });

    res.json({
      success: true,
      message: 'Super Admin password successfully updated. You may now sign in.',
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/setup/initial-employee - Establish the initial Employee account during system setup
authRouter.post('/setup/initial-employee', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { fullName, email, password, phone, permissions, adminEmail, adminPassword } = initialEmployeeSchema.parse(req.body);

    // Verify owner authority
    let verifiedOwner = false;
    let ownerName = 'Super Admin';
    let ownerId: string | null = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id, full_name, role')
          .eq('id', user.id)
          .single();
        if (profile?.role === 'SUPER_ADMIN') {
          verifiedOwner = true;
          ownerName = profile.full_name;
          ownerId = profile.id;
        }
      }
    }

    if (!verifiedOwner && adminEmail && adminPassword) {
      const { data: authResult, error: loginErr } = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password: adminPassword,
      });
      if (!loginErr && authResult.user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id, full_name, role')
          .eq('id', authResult.user.id)
          .single();
        if (profile?.role === 'SUPER_ADMIN') {
          verifiedOwner = true;
          ownerName = profile.full_name;
          ownerId = profile.id;
        }
      }
    }

    // Strict owner verification: require genuine Super Admin token or credentials

    if (!verifiedOwner) {
      res.status(403).json({
        success: false,
        error: 'Owner authentication required to establish initial employee account.',
      });
      return;
    }

    const assignedPerms = permissions && permissions.length > 0
      ? permissions
      : ['sales.create', 'inventory.view', 'inventory.adjust'];

    const { data: rpcData, error: rpcError } = await supabase.rpc('create_system_user_account', {
      p_email: email,
      p_password: password,
      p_full_name: fullName,
      p_role: 'EMPLOYEE',
      p_phone: phone || null,
      p_permissions: assignedPerms,
    });

    if (rpcError) {
      res.status(400).json({ success: false, error: rpcError.message || 'Failed to create initial employee' });
      return;
    }

    await logAudit({
      userId: ownerId || rpcData.user_id,
      actorName: ownerName,
      actorRole: 'SUPER_ADMIN',
      action: 'INITIAL_EMPLOYEE_SETUP',
      module: 'AUTH',
      entity: 'user_profiles',
      entityId: rpcData.user_id,
      recordReference: fullName,
      description: `${ownerName} established initial employee account during setup: ${fullName} (${email})`,
      outcome: 'SUCCESS',
      payload: { email, phone, role: 'EMPLOYEE', permissions: assignedPerms },
      req,
    });

    res.status(201).json({
      success: true,
      message: 'Initial employee account successfully established and verified',
      user: {
        id: rpcData.user_id,
        email,
        fullName,
        role: 'EMPLOYEE',
        permissions: assignedPerms,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/setup/verify - Verify that required initial accounts exist and are connected
authRouter.get('/setup/verify', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data: superAdmin } = await supabase
      .from('user_profiles')
      .select('id, full_name, role, is_active, created_at')
      .eq('role', 'SUPER_ADMIN')
      .limit(1)
      .maybeSingle();

    const { data: employees } = await supabase
      .from('user_profiles')
      .select('id, full_name, role, is_active, created_at')
      .eq('role', 'EMPLOYEE')
      .order('created_at', { ascending: true });

    let initialEmpPerms: string[] = [];
    if (employees && employees.length > 0) {
      const { data: perms } = await supabase
        .from('employee_permissions')
        .select('permission_key')
        .eq('user_id', employees[0].id);
      initialEmpPerms = perms ? perms.map(p => p.permission_key) : [];
    }

    const hasSuperAdmin = !!superAdmin;
    const hasEmployee = (employees?.length || 0) > 0;
    const isReady = hasSuperAdmin && hasEmployee;

    res.json({
      success: true,
      isReady,
      hasSuperAdmin,
      superAdmin: superAdmin ? { ...superAdmin } : null,
      hasEmployee,
      employeeCount: employees?.length || 0,
      initialEmployee: employees && employees.length > 0 ? {
        ...employees[0],
        permissions: initialEmpPerms,
      } : null,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login - Sign in with email and password via Supabase Auth
authRouter.post('/login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      await logAudit({
        action: 'LOGIN_FAILED',
        module: 'AUTH',
        entity: 'users',
        recordReference: email,
        description: `Failed sign-in attempt for email: ${email}`,
        outcome: 'FAILURE',
        req,
      });

      res.status(401).json({ success: false, error: error?.message || 'Invalid credentials' });
      return;
    }

    // Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, full_name, role, is_active')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      console.error('Login profile lookup error:', profileError, 'for user id:', data.user.id);
      res.status(403).json({ success: false, error: 'User profile not found', details: profileError?.message });
      return;
    }

    if (!profile.is_active) {
      await logAudit({
        userId: profile.id,
        actorName: profile.full_name,
        actorRole: profile.role,
        action: 'LOGIN_DENIED_DEACTIVATED',
        module: 'AUTH',
        entity: 'users',
        entityId: profile.id,
        recordReference: profile.full_name,
        description: `Sign-in rejected for deactivated account: ${profile.full_name}`,
        outcome: 'DENIED',
        req,
      });

      res.status(403).json({ success: false, error: 'Account has been deactivated. Contact the Super Admin.' });
      return;
    }

    // Retrieve employee permissions
    let permissions: string[] = [];
    if (profile.role === 'SUPER_ADMIN') {
      permissions = ['*'];
    } else {
      const { data: permRows } = await supabase
        .from('employee_permissions')
        .select('permission_key')
        .eq('user_id', profile.id);
      permissions = permRows ? permRows.map(p => p.permission_key) : [];
    }

    // Record successful login audit event
    await logAudit({
      userId: profile.id,
      actorName: profile.full_name,
      actorRole: profile.role,
      action: 'USER_LOGIN',
      module: 'AUTH',
      entity: 'users',
      entityId: profile.id,
      recordReference: profile.full_name,
      description: `${profile.full_name} (${profile.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Employee'}) signed in successfully`,
      outcome: 'SUCCESS',
      req,
    });

    res.json({
      success: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
      user: {
        id: profile.id,
        email: data.user.email,
        fullName: profile.full_name,
        role: profile.role,
        permissions,
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout
authRouter.post('/logout', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id, full_name, role')
          .eq('id', user.id)
          .single();

        await logAudit({
          userId: user.id,
          actorName: profile?.full_name || 'User',
          actorRole: profile?.role || 'EMPLOYEE',
          action: 'USER_LOGOUT',
          module: 'AUTH',
          entity: 'users',
          entityId: user.id,
          recordReference: profile?.full_name || user.email,
          description: `${profile?.full_name || 'User'} signed out`,
          outcome: 'SUCCESS',
          req,
        });
      }
    }
    res.json({ success: true, message: 'Signed out successfully' });
  } catch (error) {
    next(error);
  }
});
