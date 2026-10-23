const fs = require('fs');
const path = 'C:/Users/engab/Music/Furniture/backend/src/routes/settings.routes.ts';
let content = fs.readFileSync(path, 'utf8');

const targetPostUsers = // POST /api/settings/users - Create an employee or administrator account
settingsRouter.post('/users', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password, fullName, phone, role } = req.body;

    if (!email || !password || !fullName) {
      res.status(400).json({ success: false, error: 'Email, password, and full name are required' });
      return;
    }

    // 1. Create Supabase Auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: role || 'EMPLOYEE' },
    });

    if (authError) {
      res.status(400).json({ success: false, error: authError.message });
      return;
    }

    // 2. Create User Profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        id: authData.user.id,
        full_name: fullName,
        role: role || 'EMPLOYEE',
        phone: phone || null,
        is_active: true,
      })
      .select()
      .single();

    if (profileError) throw profileError;

    // Record Audit Event
    await logAudit({
      req,
      action: 'EMPLOYEE_CREATED',
      module: 'USERS',
      entity: 'user_profiles',
      entityId: profile.id,
      recordReference: fullName,
      description: \\ created new \ account: \\,
      payload: { email, phone, role: role || 'EMPLOYEE' },
    });

    res.status(201).json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
});;

const replacementPostUsers = // POST /api/settings/users - Create an employee or administrator account
settingsRouter.post('/users', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password, fullName, phone, role, permissions } = req.body;

    if (!email || !password || !fullName) {
      res.status(400).json({ success: false, error: 'Email, password, and full name are required' });
      return;
    }

    const assignedRole = role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'EMPLOYEE';
    const assignedPerms = assignedRole === 'EMPLOYEE' && Array.isArray(permissions) ? permissions : [];

    // Atomically create user account, profile, and permissions in PostgreSQL
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_system_user_account', {
      p_email: email,
      p_password: password,
      p_full_name: fullName,
      p_role: assignedRole,
      p_phone: phone || null,
      p_permissions: assignedPerms,
    });

    if (rpcError) {
      console.error('Account creation RPC error:', rpcError);
      res.status(400).json({
        success: false,
        error: rpcError.message || 'Failed to create user account',
      });
      return;
    }

    // Fetch the newly created user profile
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
      description: \\ created new \ account: \ (\)\,
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

    if (role === 'SUPER_ADMIN') {
      const { data: existingAdmin } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('role', 'SUPER_ADMIN')
        .neq('id', id)
        .maybeSingle();

      if (existingAdmin) {
        res.status(400).json({
          success: false,
          error: 'A Super Admin account already exists. FurniERP permits only one system owner.',
        });
        return;
      }
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
      description: \\ changed role for \ from \ to \\,
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

    if (existing.role === 'SUPER_ADMIN' && !isActive) {
      res.status(400).json({ success: false, error: 'Cannot deactivate the primary Super Admin account.' });
      return;
    }

    const { data: updated, error: updateError } = await supabase
      .from('user_profiles')
      .update({ is_active: !!isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    const action = isActive ? 'EMPLOYEE_REACTIVATED' : 'EMPLOYEE_DEACTIVATED';
    const description = \\ \ account: \\;

    await logAudit({
      req,
      action,
      module: 'USERS',
      entity: 'user_profiles',
      entityId: id,
      recordReference: existing.full_name,
      description: reason ? \\. Reason: \\ : description,
      reason: reason || null,
      payload: { oldStatus: existing.is_active, newStatus: !!isActive },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});;

if (content.includes(targetPostUsers)) {
  content = content.replace(targetPostUsers, replacementPostUsers);
  fs.writeFileSync(path, content, 'utf8');
  console.log('Successfully patched settings.routes.ts');
} else {
  console.error('Target post users snippet not found!');
}
