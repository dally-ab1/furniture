import { Request } from 'express';
import { supabase } from '../config/supabase';

export type AuditModule =
  | 'AUTH'
  | 'USERS'
  | 'SALES'
  | 'PURCHASES'
  | 'INVENTORY'
  | 'MANUFACTURING'
  | 'FINANCE'
  | 'SUPPLIERS'
  | 'SETTINGS'
  | 'RECOVERY';

export interface LogAuditOptions {
  req?: Request;
  userId?: string | null;
  actorName?: string | null;
  actorRole?: 'SUPER_ADMIN' | 'EMPLOYEE' | string | null;
  action: string;
  module: AuditModule;
  entity: string;
  entityId?: string | null;
  recordReference?: string | null;
  description: string;
  payload?: Record<string, any> | null;
  outcome?: 'SUCCESS' | 'FAILURE' | 'DENIED';
  reason?: string | null;
  ipAddress?: string | null;
}

export interface AuditLogFilters {
  userId?: string;
  role?: string;
  module?: string;
  action?: string;
  outcome?: string;
  entity?: string;
  entityId?: string;
  recordReference?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

// Strip sensitive fields (passwords, tokens, secrets) from audit payloads
function sanitizePayload(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizePayload);

  const sanitized: Record<string, any> = {};
  const sensitiveKeys = ['password', 'token', 'access_token', 'refresh_token', 'secret', 'authorization'];

  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizePayload(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Record a reliable, persistent audit log event into public.audit_logs.
 * Extracts authenticated user context and IP from req whenever provided.
 */
export async function logAudit(options: LogAuditOptions): Promise<void> {
  try {
    let finalUserId = options.userId;
    let finalActorName = options.actorName;
    let finalActorRole = options.actorRole;
    let finalIp = options.ipAddress;

    if (options.req) {
      const req = options.req;
      if (req.user) {
        if (!finalUserId) finalUserId = req.user.id;
        if (!finalActorName) finalActorName = req.user.full_name;
        if (!finalActorRole) finalActorRole = req.user.role;
      }
      if (!finalIp) {
        const xForwarded = req.headers['x-forwarded-for'];
        finalIp = typeof xForwarded === 'string'
          ? xForwarded.split(',')[0].trim()
          : (req.socket?.remoteAddress || req.ip || null);
      }
    }

    // Fallback display name if user is unauthenticated or bootstrap
    if (!finalActorName) {
      if (finalUserId) {
        // Look up user name if not already snapshotted
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('full_name, role')
          .eq('id', finalUserId)
          .single();
        if (profile) {
          finalActorName = profile.full_name;
          finalActorRole = profile.role;
        } else {
          finalActorName = 'System / Employee';
        }
      } else {
        finalActorName = 'System Guest';
      }
    }

    if (!finalActorRole) {
      finalActorRole = 'EMPLOYEE';
    }

    const row = {
      user_id: finalUserId || null,
      actor_name: finalActorName,
      actor_role: finalActorRole,
      action: options.action.toUpperCase(),
      entity: options.entity.toLowerCase(),
      module: options.module.toUpperCase(),
      entity_id: options.entityId || null,
      record_reference: options.recordReference || null,
      description: options.description,
      outcome: options.outcome || 'SUCCESS',
      reason: options.reason || null,
      payload: sanitizePayload(options.payload || {}),
      ip_address: finalIp || null,
    };

    const { error } = await supabase.from('audit_logs').insert(row);
    if (error) {
      console.error('Audit Log insert error:', error.message, row);
    }
  } catch (err) {
    console.error('Unexpected error recording audit log:', err);
  }
}

/**
 * Query audit logs with multi-dimensional filtering, searching, and server-side pagination.
 */
export async function queryAuditLogs(filters: AuditLogFilters) {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 25));
  const offset = (page - 1) * limit;

  let query = supabase
    .from('audit_logs')
    .select(`
      id, user_id, actor_name, actor_role, action, module, entity, entity_id,
      record_reference, description, outcome, reason, payload, ip_address, created_at,
      user_profile:user_profiles!audit_logs_user_id_fkey (id, full_name, role)
    `, { count: 'exact' });

  if (filters.userId) {
    query = query.eq('user_id', filters.userId);
  }

  if (filters.role && filters.role !== 'ALL') {
    query = query.eq('actor_role', filters.role);
  }

  if (filters.module && filters.module !== 'ALL') {
    query = query.eq('module', filters.module.toUpperCase());
  }

  if (filters.action && filters.action !== 'ALL') {
    query = query.eq('action', filters.action.toUpperCase());
  }

  if (filters.outcome && filters.outcome !== 'ALL') {
    query = query.eq('outcome', filters.outcome.toUpperCase());
  }

  if (filters.entity) {
    query = query.eq('entity', filters.entity.toLowerCase());
  }

  if (filters.entityId) {
    query = query.eq('entity_id', filters.entityId);
  }

  if (filters.recordReference) {
    query = query.ilike('record_reference', `%${filters.recordReference}%`);
  }

  if (filters.startDate) {
    query = query.gte('created_at', `${filters.startDate}T00:00:00.000Z`);
  }

  if (filters.endDate) {
    query = query.lte('created_at', `${filters.endDate}T23:59:59.999Z`);
  }

  if (filters.search) {
    const s = filters.search.trim();
    query = query.or(`description.ilike.%${s}%,record_reference.ilike.%${s}%,actor_name.ilike.%${s}%,action.ilike.%${s}%`);
  }

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) {
    throw error;
  }

  const formatted = (data || []).map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    actorName: row.actor_name || row.user_profile?.full_name || 'System User',
    actorRole: row.actor_role || row.user_profile?.role || 'EMPLOYEE',
    action: row.action,
    module: row.module || row.entity?.toUpperCase() || 'GENERAL',
    entity: row.entity,
    entityId: row.entity_id,
    recordReference: row.record_reference || row.payload?.order_number || row.payload?.invoice_number || null,
    description: row.description || `${row.actor_name || 'User'} performed ${row.action}`,
    outcome: row.outcome || 'SUCCESS',
    reason: row.reason || row.payload?.reason || null,
    payload: row.payload || {},
    ipAddress: row.ip_address,
    createdAt: row.created_at,
  }));

  const totalCount = count || 0;
  return {
    data: formatted,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit) || 1,
    },
  };
}

/**
 * Generate CSV text string of filtered audit logs
 */
export async function exportAuditLogsCSV(filters: AuditLogFilters): Promise<string> {
  // Query all matching logs up to 1000 for export
  const result = await queryAuditLogs({ ...filters, page: 1, limit: 1000 });
  const rows = result.data;

  const headers = [
    'Date & Time (UTC)',
    'User Name',
    'User Role',
    'Action',
    'Module',
    'Record Reference',
    'Description',
    'Outcome',
    'Reason / Notes',
    'IP Address',
    'Event ID',
  ];

  const escapeCSV = (val: any) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvLines = [headers.join(',')];

  for (const r of rows) {
    csvLines.push([
      escapeCSV(r.createdAt),
      escapeCSV(r.actorName),
      escapeCSV(r.actorRole),
      escapeCSV(r.action),
      escapeCSV(r.module),
      escapeCSV(r.recordReference),
      escapeCSV(r.description),
      escapeCSV(r.outcome),
      escapeCSV(r.reason),
      escapeCSV(r.ipAddress),
      escapeCSV(r.id),
    ].join(','));
  }

  return csvLines.join('\n');
}

/**
 * Helper to compute diff between old and new object states
 */
export function buildDiff(
  oldObj: Record<string, any> | null,
  newObj: Record<string, any> | null,
  ignoredKeys = ['updated_at', 'created_at', 'password']
): { old_values: Record<string, any>; new_values: Record<string, any>; changed_fields: string[] } {
  const oldVals: Record<string, any> = {};
  const newVals: Record<string, any> = {};
  const changed: string[] = [];

  const allKeys = Array.from(new Set([
    ...Object.keys(oldObj || {}),
    ...Object.keys(newObj || {}),
  ]));

  for (const key of allKeys) {
    if (ignoredKeys.includes(key)) continue;

    const valOld = oldObj ? oldObj[key] : undefined;
    const valNew = newObj ? newObj[key] : undefined;

    if (JSON.stringify(valOld) !== JSON.stringify(valNew)) {
      changed.push(key);
      if (valOld !== undefined) oldVals[key] = valOld;
      if (valNew !== undefined) newVals[key] = valNew;
    }
  }

  return {
    old_values: oldVals,
    new_values: newVals,
    changed_fields: changed,
  };
}
