import { supabase } from '../lib/supabase';

const API_BASE = 'http://localhost:5000/api';

export class ApiError extends Error {
  public status: number;
  public statusText: string;
  public data: any;
  public isAuthError: boolean;
  public isForbidden: boolean;
  public isValidationError: boolean;
  public isServerError: boolean;
  public isNetworkError: boolean;

  constructor(message: string, status: number, statusText: string, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.data = data;
    this.isAuthError = status === 401;
    this.isForbidden = status === 403;
    this.isValidationError = status === 400 || status === 422;
    this.isServerError = status >= 500;
    this.isNetworkError = status === 0;
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    };
  }
  return { 'Content-Type': 'application/json' };
}

export async function authFetch(url: string, options?: RequestInit): Promise<Response> {
  const headers = await getAuthHeaders();
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...(options?.headers || {}),
      },
    });

    if (res.status === 401) {
      console.warn(`[authFetch] 401 Unauthorized for ${url}`);
    } else if (res.status === 403) {
      console.warn(`[authFetch] 403 Forbidden for ${url}`);
    }

    return res;
  } catch (err: any) {
    throw new ApiError(
      err.message || 'Network connection failed. Verify the backend server is running.',
      0,
      'NETWORK_FAILURE'
    );
  }
}

export async function apiRequest<T = any>(url: string, options?: RequestInit): Promise<T> {
  const res = await authFetch(url, options);
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON or empty response
  }

  if (!res.ok) {
    const message = body?.error || body?.message || `Request failed (${res.status} ${res.statusText})`;
    throw new ApiError(message, res.status, res.statusText, body);
  }

  return body;
}

export const api = {
  async getDashboardSummary() {
    const res = await authFetch(`${API_BASE}/dashboard/summary`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(err.error || 'Failed to fetch dashboard summary', res.status, res.statusText, err);
    }
    const json = await res.json();
    return json.data;
  },

  async getSalesOverview() {
    const res = await authFetch(`${API_BASE}/dashboard/sales-overview`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(err.error || 'Failed to fetch sales overview', res.status, res.statusText, err);
    }
    const json = await res.json();
    return json.data;
  },

  async getRecentSales() {
    const res = await authFetch(`${API_BASE}/dashboard/recent-sales`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(err.error || 'Failed to fetch recent sales', res.status, res.statusText, err);
    }
    const json = await res.json();
    return json.data;
  },

  async getLowStockAlerts() {
    const res = await authFetch(`${API_BASE}/dashboard/low-stock`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(err.error || 'Failed to fetch low stock alerts', res.status, res.statusText, err);
    }
    const json = await res.json();
    return json.data;
  },

  async getProductionOrders() {
    const res = await authFetch(`${API_BASE}/dashboard/production-orders`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(err.error || 'Failed to fetch production orders', res.status, res.statusText, err);
    }
    const json = await res.json();
    return json.data;
  },

  async getRecentActivity() {
    const res = await authFetch(`${API_BASE}/dashboard/recent-activity`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(err.error || 'Failed to fetch recent activity', res.status, res.statusText, err);
    }
    const json = await res.json();
    return json.data;
  }
};
