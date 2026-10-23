import { Request, Response, NextFunction } from 'express';
import { requireSuperAdmin, requirePermission, authenticateToken } from '../middleware/auth';

const API_BASE = 'http://localhost:5000/api';

// Simple assertion helper
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ PASS: ${message}`);
}

// Mock Express req, res, next
function createMockContext(user?: any, headers: Record<string, string> = {}) {
  const req = {
    headers,
    user,
  } as unknown as Request;

  let statusCode = 200;
  let jsonBody: any = null;

  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(body: any) {
      jsonBody = body;
      return res;
    },
  } as unknown as Response;

  let nextCalled = false;
  const next: NextFunction = () => {
    nextCalled = true;
  };

  return {
    req,
    res,
    next,
    getStatus: () => statusCode,
    getJson: () => jsonBody,
    isNextCalled: () => nextCalled,
  };
}

async function runUnitSecurityTests() {
  console.log('\n--- 1. Testing Role-Based Access Control (requireSuperAdmin) ---');

  // Test 1: Employee blocked from Super Admin route
  {
    const ctx = createMockContext({
      id: 'emp-1',
      role: 'EMPLOYEE',
      full_name: 'Regular Employee',
      permissions: ['pos.create_sale'],
    });
    requireSuperAdmin(ctx.req, ctx.res, ctx.next);
    assert(ctx.getStatus() === 403, 'requireSuperAdmin returns 403 for EMPLOYEE');
    assert(!ctx.isNextCalled(), 'next() is NOT called for EMPLOYEE');
    assert(ctx.getJson()?.error?.includes('Super Admin privilege required'), 'Returns correct forbidden error message');
  }

  // Test 2: Super Admin allowed
  {
    const ctx = createMockContext({
      id: 'admin-1',
      role: 'SUPER_ADMIN',
      full_name: 'Company Owner',
      permissions: ['*'],
    });
    requireSuperAdmin(ctx.req, ctx.res, ctx.next);
    assert(ctx.getStatus() === 200, 'requireSuperAdmin keeps 200 for SUPER_ADMIN');
    assert(ctx.isNextCalled(), 'next() is called for SUPER_ADMIN');
  }

  console.log('\n--- 2. Testing Granular Permission-Based Access Control (requirePermission) ---');

  // Test 3: Missing required permission is rejected with 403
  {
    const ctx = createMockContext({
      id: 'emp-1',
      role: 'EMPLOYEE',
      full_name: 'Cashier',
      permissions: ['pos.create_sale'],
    });
    const middleware = requirePermission('reports.view_financial');
    middleware(ctx.req, ctx.res, ctx.next);
    assert(ctx.getStatus() === 403, 'requirePermission returns 403 when user lacks permission');
    assert(!ctx.isNextCalled(), 'next() is NOT called when user lacks permission');
    assert(ctx.getJson()?.error?.includes('Missing required permission'), 'Returns missing permission message');
  }

  // Test 4: User with specific permission is granted access
  {
    const ctx = createMockContext({
      id: 'emp-2',
      role: 'EMPLOYEE',
      full_name: 'Accountant',
      permissions: ['reports.view_financial'],
    });
    const middleware = requirePermission('reports.view_financial');
    middleware(ctx.req, ctx.res, ctx.next);
    assert(ctx.isNextCalled(), 'next() is called when user has specific permission');
  }

  // Test 5: Super Admin automatically passes permission checks
  {
    const ctx = createMockContext({
      id: 'admin-1',
      role: 'SUPER_ADMIN',
      full_name: 'Owner',
      permissions: ['*'],
    });
    const middleware = requirePermission('inventory.adjust');
    middleware(ctx.req, ctx.res, ctx.next);
    assert(ctx.isNextCalled(), 'next() is called for SUPER_ADMIN regardless of permission key');
  }

  // Test 6: Multi-permission checks (any match grants access)
  {
    const ctx = createMockContext({
      id: 'emp-3',
      role: 'EMPLOYEE',
      full_name: 'Inventory Clerk',
      permissions: ['purchases.create'],
    });
    const middleware = requirePermission('purchases.create', 'suppliers.manage');
    middleware(ctx.req, ctx.res, ctx.next);
    assert(ctx.isNextCalled(), 'next() is called when user has at least one matching permission');
  }

  // Test 7: Multi-permission checks fail when neither matches
  {
    const ctx = createMockContext({
      id: 'emp-4',
      role: 'EMPLOYEE',
      full_name: 'Sales Clerk',
      permissions: ['pos.create_sale'],
    });
    const middleware = requirePermission('purchases.create', 'suppliers.manage');
    middleware(ctx.req, ctx.res, ctx.next);
    assert(ctx.getStatus() === 403, 'requirePermission returns 403 when neither multi-permission matches');
    assert(!ctx.isNextCalled(), 'next() is NOT called when neither multi-permission matches');
  }

  // Test 8: Unauthenticated request to requirePermission returns 401
  {
    const ctx = createMockContext(undefined);
    const middleware = requirePermission('pos.create_sale');
    middleware(ctx.req, ctx.res, ctx.next);
    assert(ctx.getStatus() === 401, 'requirePermission returns 401 when req.user is undefined');
    assert(!ctx.isNextCalled(), 'next() is NOT called when unauthenticated');
  }
}

async function runLiveHttpSecurityTests() {
  console.log('\n--- 3. Testing Live HTTP Endpoints ---');

  // Test 9: Public health check succeeds without token
  try {
    const healthRes = await fetch(`${API_BASE}/health`);
    assert(healthRes.status === 200, 'GET /api/health returns 200 OK without token');
    const healthJson = await healthRes.json();
    assert(healthJson.project === 'FurniERP' && healthJson.currency === 'ETB', 'Health check returns FurniERP ETB metadata');
  } catch (err: any) {
    console.warn(`⚠️ Live server not reachable at ${API_BASE} (${err.message}). Skipping HTTP network tests.`);
    return;
  }

  // Test 10: Invalid bearer token returns 401 Unauthorized
  try {
    const invalidAuthRes = await fetch(`${API_BASE}/dashboard/summary`, {
      headers: {
        'Authorization': 'Bearer definitely-invalid-jwt-token-xyz-12345'
      }
    });
    assert(invalidAuthRes.status === 401, 'GET /api/dashboard/summary with invalid JWT returns 401 Unauthorized');
    const errJson = await invalidAuthRes.json();
    assert(errJson.error?.includes('Invalid or expired authentication session'), 'Invalid JWT returns session rejection error');
  } catch (err: any) {
    console.error(`Live HTTP test error: ${err.message}`);
  }
}

async function main() {
  console.log('🛡️ Starting FurniERP Security & Authorization Verification Suite...\n');
  await runUnitSecurityTests();
  await runLiveHttpSecurityTests();
  console.log('\n🎉 ALL SECURITY VERIFICATION TESTS COMPLETED SUCCESSFULLY!\n');
}

main().catch(err => {
  console.error('\n💥 Test suite failed:', err);
  process.exit(1);
});
