import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role: 'SUPER_ADMIN' | 'EMPLOYEE';
  full_name: string;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // In development / demo mode, allow optional mock Super Admin fallback if explicitly configured
      if (process.env.ALLOW_DEV_SUPER_ADMIN === 'true') {
        req.user = {
          id: 'a07dfa6a-a70c-4fbc-9086-38ac8f32e62e',
          email: 'admin@furnierp.com',
          role: 'SUPER_ADMIN',
          full_name: 'Super Admin',
          permissions: ['*'],
        };
        return next();
      }
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      res.status(401).json({ error: 'Invalid or expired authentication session' });
      return;
    }

    // Retrieve business user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, full_name, role, is_active')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      res.status(403).json({ error: 'User profile not found for this account' });
      return;
    }

    if (!profile.is_active) {
      res.status(403).json({ error: 'Account has been deactivated. Contact the Super Admin.' });
      return;
    }

    // Retrieve granted employee permissions
    let permissions: string[] = [];
    if (profile.role === 'SUPER_ADMIN') {
      permissions = ['*'];
    } else {
      const { data: permRows } = await supabase
        .from('employee_permissions')
        .select('permission_key')
        .eq('user_id', user.id);
      
      permissions = permRows ? permRows.map(p => p.permission_key) : [];
    }

    req.user = {
      id: profile.id,
      email: user.email,
      role: profile.role as 'SUPER_ADMIN' | 'EMPLOYEE',
      full_name: profile.full_name,
      permissions,
    };

    next();
  } catch (error) {
    res.status(500).json({ error: 'Server authentication failure' });
  }
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Forbidden: Super Admin privilege required' });
    return;
  }
  next();
}

export function requirePermission(...permissionKeys: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (
      req.user.role === 'SUPER_ADMIN' ||
      req.user.permissions.includes('*') ||
      permissionKeys.some(key => req.user!.permissions.includes(key))
    ) {
      return next();
    }

    res.status(403).json({
      error: `Forbidden: Missing required permission (${permissionKeys.join(' or ')})`
    });
  };
}
