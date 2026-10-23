import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  full_name: string;
  username: string | null;
  role: 'SUPER_ADMIN' | 'EMPLOYEE';
  phone: string | null;
  is_active: boolean;
  permissions?: string[];
}

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  permissions: string[];
  authError: string | null;
  hasPermission: (key: string) => boolean;
  signIn: (identifier: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  retryAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const CACHE_PROFILE_KEY = 'furnierp_cached_profile';
const CACHE_PERMS_KEY = 'furnierp_cached_permissions';

function getCachedProfile(): UserProfile | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getCachedPermissions(): string[] {
  try {
    const raw = sessionStorage.getItem(CACHE_PERMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Compute cached values once on mount (stable references via useState initializer)
  const [cachedProfile] = useState<UserProfile | null>(() => getCachedProfile());
  const [cachedPerms] = useState<string[]>(() => getCachedPermissions());

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(cachedProfile);
  const [session, setSession] = useState<Session | null>(null);
  const [permissions, setPermissions] = useState<string[]>(cachedPerms);
  const [isLoading, setIsLoading] = useState<boolean>(!cachedProfile);
  const [authError, setAuthError] = useState<string | null>(null);

  // Track currently loaded user ID to prevent redundant re-fetching on tab focus
  const loadedUserIdRef = useRef<string | null>(cachedProfile?.id || null);
  const isFetchingRef = useRef<boolean>(false);
  // Ref mirrors for stable useCallback (avoids dependency cycle)
  const profileRef = useRef<UserProfile | null>(cachedProfile);
  const cachedProfileRef = useRef<UserProfile | null>(cachedProfile);

  // Keep profileRef in sync with profile state
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const fetchProfile = useCallback(async (userId: string, isInitial: boolean = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      setAuthError(null);
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name, username, role, phone, is_active')
        .eq('id', userId)
        .single();

      if (error) {
        console.warn('[AuthContext] Warning fetching user profile:', error.message);
        // If we already have a cached profile for this user, keep it rather than logging out on transient network error
        if (!profileRef.current && !cachedProfileRef.current) {
          setAuthError(error.message || 'Failed to load user profile. Verify database connection.');
        }
        return;
      }

      if (!data) {
        console.warn('[AuthContext] No profile data returned for user:', userId);
        return;
      }

      // If user has been deactivated by Super Admin, explicitly sign out
      if (!data.is_active) {
        console.warn('[AuthContext] Account is inactive. Signing out.');
        await supabase.auth.signOut();
        sessionStorage.removeItem(CACHE_PROFILE_KEY);
        sessionStorage.removeItem(CACHE_PERMS_KEY);
        setProfile(null);
        profileRef.current = null;
        setUser(null);
        setSession(null);
        setPermissions([]);
        loadedUserIdRef.current = null;
        return;
      }

      let perms: string[] = [];
      if (data.role === 'SUPER_ADMIN') {
        perms = ['*'];
      } else {
        const { data: permData, error: permErr } = await supabase
          .from('employee_permissions')
          .select('permission_key')
          .eq('user_id', userId);
        
        if (!permErr && permData) {
          perms = permData.map(p => p.permission_key);
        }
      }

      const fullProfile: UserProfile = {
        ...data,
        permissions: perms,
      };

      // Cache profile in sessionStorage for seamless refresh
      try {
        sessionStorage.setItem(CACHE_PROFILE_KEY, JSON.stringify(fullProfile));
        sessionStorage.setItem(CACHE_PERMS_KEY, JSON.stringify(perms));
      } catch {}

      setPermissions(perms);
      setProfile(fullProfile);
      profileRef.current = fullProfile;
      loadedUserIdRef.current = userId;
    } catch (err: any) {
      console.error('[AuthContext] Error in fetchProfile:', err);
      if (!profileRef.current && !cachedProfileRef.current) {
        setAuthError(err.message || 'Network error loading profile.');
      }
    } finally {
      isFetchingRef.current = false;
      if (isInitial) {
        setIsLoading(false);
      }
    }
  }, []); // Stable: uses refs instead of state for checks

  const initAuth = useCallback(async () => {
    try {
      setAuthError(null);
      const { data: { session: currentSession }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.warn('[AuthContext] Error getting initial session:', error.message);
        setIsLoading(false);
        return;
      }

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        // If we have cached profile matching this user, we are already rendered, fetch fresh in background
        const isFresh = loadedUserIdRef.current === currentSession.user.id && !!profileRef.current;
        if (isFresh) {
          setIsLoading(false);
          // Background update
          fetchProfile(currentSession.user.id, false);
        } else {
          await fetchProfile(currentSession.user.id, true);
        }
      } else {
        // No session exists
        sessionStorage.removeItem(CACHE_PROFILE_KEY);
        sessionStorage.removeItem(CACHE_PERMS_KEY);
        setProfile(null);
        profileRef.current = null;
        setPermissions([]);
        setIsLoading(false);
      }
    } catch (err: any) {
      console.error('[AuthContext] Init error:', err);
      setAuthError(err.message || 'Authentication initialization failed.');
      setIsLoading(false);
    }
  }, [fetchProfile]); // Stable: fetchProfile is now stable

  useEffect(() => {
    initAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        // If token refresh event on active session, don't trigger full reload or profile re-fetch
        if (event === 'TOKEN_REFRESHED' && newSession?.user?.id === loadedUserIdRef.current) {
          setSession(newSession);
          return;
        }

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          // Only fetch profile if the user ID is different or not yet loaded
          if (loadedUserIdRef.current !== newSession.user.id) {
            await fetchProfile(newSession.user.id, false);
          }
        } else {
          sessionStorage.removeItem(CACHE_PROFILE_KEY);
          sessionStorage.removeItem(CACHE_PERMS_KEY);
          setProfile(null);
          profileRef.current = null;
          setPermissions([]);
          loadedUserIdRef.current = null;
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount: initAuth and fetchProfile are now stable refs

  const signIn = async (identifier: string, password: string): Promise<{ error: string | null }> => {
    const trimmed = identifier.trim();
    if (!trimmed) {
      return { error: 'Please enter your username or email' };
    }

    let emailToAuth = trimmed;

    // If identifier doesn't contain '@', resolve username to auth email via secure database RPC
    if (!trimmed.includes('@')) {
      try {
        const { data, error: rpcErr } = await supabase.rpc('resolve_login_identifier', {
          p_identifier: trimmed,
        });

        if (rpcErr || !data || (Array.isArray(data) && data.length === 0)) {
          return { error: 'Invalid login credentials' };
        }

        const record = Array.isArray(data) ? data[0] : data;
        if (!record.email || record.is_active === false) {
          return { error: 'Invalid login credentials' };
        }
        emailToAuth = record.email;
      } catch {
        return { error: 'Invalid login credentials' };
      }
    }

    const { data: signInData, error } = await supabase.auth.signInWithPassword({ email: emailToAuth, password });
    if (error) {
      return { error: error.message };
    }

    if (signInData.user) {
      await fetchProfile(signInData.user.id, false);
    }

    return { error: null };
  };

  const signOut = async () => {
    sessionStorage.removeItem(CACHE_PROFILE_KEY);
    sessionStorage.removeItem(CACHE_PERMS_KEY);
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    profileRef.current = null;
    setSession(null);
    setPermissions([]);
    loadedUserIdRef.current = null;
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id, false);
    }
  };

  const retryAuth = async () => {
    setIsLoading(true);
    await initAuth();
  };

  const hasPermission = useCallback((key: string): boolean => {
    if (!profile) return false;
    if (profile.role === 'SUPER_ADMIN') return true;
    if (permissions.includes('*')) return true;
    return permissions.includes(key);
  }, [profile, permissions]);

  const value: AuthState = {
    user,
    profile,
    session,
    isLoading,
    isAuthenticated: !!user && !!profile,
    isSuperAdmin: profile?.role === 'SUPER_ADMIN',
    permissions,
    authError,
    hasPermission,
    signIn,
    signOut,
    refreshProfile,
    retryAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
