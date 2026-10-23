import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';
import { Sidebar } from './components/Sidebar';
import { TopNavbar } from './components/TopNavbar';
import { Dashboard } from './pages/Dashboard';
import { Inventory } from './pages/Inventory';
import { Sales } from './pages/Sales';
import { Customers } from './pages/Customers';
import { Suppliers } from './pages/Suppliers';
import { Manufacturing } from './pages/Manufacturing';
import { Reports } from './pages/Reports';
import { Users } from './pages/Users';
import { Settings } from './pages/Settings';
import { RecoveryCenter } from './pages/RecoveryCenter';
import { LoginPage } from './pages/LoginPage';
import { BootstrapPage } from './pages/BootstrapPage';
import { LoadingScreen } from './components/LoadingScreen';

const API_BASE = 'http://localhost:5000/api';
const VALID_TABS = [
  'dashboard',
  'sales',
  'inventory',
  'manufacturing',
  'customers',
  'suppliers',
  'reports',
  'users',
  'recovery',
  'settings'
];

function getTabFromUrl(): string | null {
  try {
    const path = window.location.pathname.replace(/^\/+/, '').split('/')[0].toLowerCase();
    if (path && VALID_TABS.includes(path)) {
      return path;
    }
  } catch {}
  return null;
}

function getInitialTab(): string {
  const fromUrl = getTabFromUrl();
  if (fromUrl) return fromUrl;

  try {
    const saved = localStorage.getItem('furnierp_active_tab');
    if (saved && VALID_TABS.includes(saved)) {
      return saved;
    }
  } catch {}

  return 'dashboard';
}

export function App() {
  const { isAuthenticated, isLoading, authError, retryAuth } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>(getInitialTab);
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set([getInitialTab()]));
  const [systemInitialized, setSystemInitialized] = useState<boolean | null>(null);
  const [checkingInit, setCheckingInit] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Sync tab navigation with browser URL and localStorage
  const handleTabChange = useCallback((tab: string) => {
    if (!VALID_TABS.includes(tab)) return;
    setCurrentTab(tab);
    setVisitedTabs(prev => new Set(prev).add(tab));
    
    try {
      localStorage.setItem('furnierp_active_tab', tab);
      const targetPath = tab === 'dashboard' ? '/' : `/${tab}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ tab }, '', targetPath);
      }
    } catch {}
  }, []);

  // Listen to browser Back / Forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const tabFromUrl = getTabFromUrl() || 'dashboard';
      setCurrentTab(tabFromUrl);
      setVisitedTabs(prev => new Set(prev).add(tabFromUrl));
      try {
        localStorage.setItem('furnierp_active_tab', tabFromUrl);
      } catch {}
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Check if system has been bootstrapped
  const checkBootstrap = useCallback(async () => {
    setInitError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/status`);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data = await res.json();
      const initialized = data.initialized === true;
      setSystemInitialized(initialized);
      if (!initialized) {
        setAuthMode('register');
      }
    } catch (err: any) {
      console.warn('[App] Bootstrap check fallback:', err.message);
      // If user is already authenticated with session, backend is initialized
      if (isAuthenticated) {
        setSystemInitialized(true);
      } else {
        setInitError('Could not connect to FurniERP backend. Please ensure the server is running on port 5000.');
        setSystemInitialized(true);
      }
    } finally {
      setCheckingInit(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    checkBootstrap();
  }, [checkBootstrap]);

  // Show loading screen or connection error screen
  if (isLoading || checkingInit) {
    if (authError || initError) {
      return (
        <LoadingScreen 
          error={authError || initError} 
          onRetry={() => {
            if (authError) retryAuth();
            if (initError) checkBootstrap();
          }} 
        />
      );
    }
    return <LoadingScreen message="Restoring FurniERP session..." />;
  }

  // Show login or register if not authenticated
  if (!isAuthenticated) {
    if (systemInitialized === false || authMode === 'register') {
      return (
        <BootstrapPage
          onComplete={() => {
            setSystemInitialized(true);
            setAuthMode('login');
          }}
          onSwitchToLogin={() => setAuthMode('login')}
        />
      );
    }

    return (
      <LoginPage
        onSwitchToRegister={() => setAuthMode('register')}
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F7F7F2] font-sans antialiased text-[#202820]">
      {/* Sidebar Navigation */}
      <Sidebar currentTab={currentTab} onTabChange={handleTabChange} />

      {/* Main Workspace Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <TopNavbar />

        {/* Workspace Body: Keep mounted workspaces alive to preserve form drafts, cart, scroll position, and tab state */}
        <main className="flex-1 overflow-y-auto">
          {visitedTabs.has('dashboard') && (
            <div className={currentTab === 'dashboard' ? 'block' : 'hidden'}>
              <Dashboard onNavigateTab={handleTabChange} />
            </div>
          )}
          {visitedTabs.has('sales') && (
            <div className={currentTab === 'sales' ? 'block' : 'hidden'}>
              <Sales />
            </div>
          )}
          {visitedTabs.has('inventory') && (
            <div className={currentTab === 'inventory' ? 'block' : 'hidden'}>
              <Inventory />
            </div>
          )}
          {visitedTabs.has('manufacturing') && (
            <div className={currentTab === 'manufacturing' ? 'block' : 'hidden'}>
              <Manufacturing />
            </div>
          )}
          {visitedTabs.has('customers') && (
            <div className={currentTab === 'customers' ? 'block' : 'hidden'}>
              <Customers />
            </div>
          )}
          {visitedTabs.has('suppliers') && (
            <div className={currentTab === 'suppliers' ? 'block' : 'hidden'}>
              <Suppliers />
            </div>
          )}
          {visitedTabs.has('reports') && (
            <div className={currentTab === 'reports' ? 'block' : 'hidden'}>
              <Reports />
            </div>
          )}
          {visitedTabs.has('users') && (
            <div className={currentTab === 'users' ? 'block' : 'hidden'}>
              <Users />
            </div>
          )}
          {visitedTabs.has('recovery') && (
            <div className={currentTab === 'recovery' ? 'block' : 'hidden'}>
              <RecoveryCenter />
            </div>
          )}
          {visitedTabs.has('settings') && (
            <div className={currentTab === 'settings' ? 'block' : 'hidden'}>
              <Settings />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
