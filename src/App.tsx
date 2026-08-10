import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase/config';
import { LanguageProvider } from './contexts/LanguageContext';
import Login from './pages/Login';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import DCSMaster from './pages/DCSMaster';
import FarmerMaster from './pages/FarmerMaster';
import RateChart from './pages/RateChart';
import MilkCollection from './pages/MilkCollection';
import RateCalculator from './pages/RateCalculator';
import BMCMaster from './pages/BMCMaster';
import BMCEntry from './pages/BMCEntry';
import Deductions from './pages/Deductions';
import PaymentRegister from './pages/PaymentRegister';
import CashBook from './pages/CashBook';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Subscribe from './pages/Subscribe';
import AdminSubscriptions from './pages/AdminSubscriptions';
import AdminWhatsApp from './pages/AdminWhatsApp';
import AdminRecoverBalances from './pages/AdminRecoverBalances';
import Passbook from './pages/Passbook';
import { hasAccessWithOfflineFallback, type AccessDecision } from './utils/subscription';
import { initSyncService } from './services/syncService';
import { Milk, WifiOff } from 'lucide-react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [hasSubAccess, setHasSubAccess] = useState(false);
  const [accessDecision, setAccessDecision] = useState<AccessDecision | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Start the offline auto-sync service once. It watches the RTDB connection,
  // the browser online event and the queue, and flushes any IndexedDB-queued
  // milk-collection entries to Firebase whenever the network is available —
  // even after the app was closed and reopened while offline. Idempotent.
  useEffect(() => {
    initSyncService();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    setCheckingAccess(true);
    // Offline-resilient: races the live Firebase check against a 2s timeout
    // and falls back to a localStorage-cached verdict. Without this, an
    // offline RTDB `get()` hangs forever and the splash never leaves.
    hasAccessWithOfflineFallback(2000).then((decision) => {
      setAccessDecision(decision);
      const ok =
        (decision.kind === 'live' && decision.hasAccess) ||
        (decision.kind === 'cache-fresh' && decision.hasAccess) ||
        (decision.kind === 'cache-grace' && decision.hasAccess);
      setHasSubAccess(ok);
      setCheckingAccess(false);
    });
  }, [isAuthenticated]);

  const loadingScreen = (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAF9]">
      <div className="flex flex-col items-center gap-6">
        <div className="animate-bounce" style={{ width: 80, height: 80, background: 'linear-gradient(135deg, #f59e0b, #d97706)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 20px 40px rgba(245,158,11,0.2)' }}>
          <Milk color="#0f172a" size={40} />
        </div>
        <div style={{ color: 'var(--ink)', fontSize: 24, fontWeight: 800, letterSpacing: '1px' }}>DCS PRO</div>
      </div>
    </div>
  );

  // Public, no-login route: /passbook/{societyUid}. Checked before the auth
  // gate so farmers can open it without an account. No React Router needed —
  // the app is state-routed, so we match the pathname directly.
  const passbookMatch = window.location.pathname.match(/^\/passbook\/([^/]+)\/?$/);
  if (passbookMatch) {
    return (
      <LanguageProvider>
        <Passbook societyUid={decodeURIComponent(passbookMatch[1])} />
      </LanguageProvider>
    );
  }

  if (loading) {
    return loadingScreen;
  }

  if (!isAuthenticated) {
    // First-time offline: without a cached Firebase Auth session the user
    // simply cannot sign in, so show a clear message instead of a login form
    // that would just spin.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return (
        <LanguageProvider>
          <FirstLoginOfflineScreen />
        </LanguageProvider>
      );
    }
    return (
      <LanguageProvider>
        <Login onLogin={() => setIsAuthenticated(true)} />
      </LanguageProvider>
    );
  }

  if (checkingAccess) {
    return loadingScreen;
  }

  // Authenticated but we've never verified subscription online on this device.
  if (accessDecision?.kind === 'no-cache') {
    return (
      <LanguageProvider>
        <VerifySubscriptionOfflineScreen />
      </LanguageProvider>
    );
  }

  if (!hasSubAccess) {
    return (
      <LanguageProvider>
        <Subscribe />
      </LanguageProvider>
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'dcs-master':
        return <DCSMaster />;
      case 'farmer-master':
        return <FarmerMaster />;
      case 'rate-chart':
        return <RateChart />;
      case 'milk-collection':
        return <MilkCollection onNavigate={setCurrentPage} />;
      case 'rate-calculator':
        return <RateCalculator />;
      case 'bmc-master':
        return <BMCMaster />;
      case 'bmc-entry':
        return <BMCEntry />;
      case 'deductions':
        return <Deductions />;
      case 'payment-register':
        return <PaymentRegister />;
      case 'cash-book':
        return <CashBook />;
      case 'reports':
        return <Reports />;
      case 'settings':
        return <Settings />;
      case 'admin-subscriptions':
        return <AdminSubscriptions />;
      case 'admin-whatsapp':
        return <AdminWhatsApp />;
      case 'admin-recover-balances':
        return <AdminRecoverBalances />;
      default:
        return <Dashboard />;
    }
  };

  const graceBanner = accessDecision?.kind === 'cache-grace' ? (
    <div
      role="status"
      style={{
        background: '#b45309', color: '#fff',
        padding: '6px 14px', fontSize: 12, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        flexShrink: 0,
      }}
    >
      <WifiOff size={13} />
      Offline mode — subscription {accessDecision.daysLeft} {accessDecision.daysLeft === 1 ? 'din' : 'din'} mein verify karni hogi
    </div>
  ) : null;

  return (
    <LanguageProvider>
      <div className="min-h-screen flex flex-col app-shell">
        {graceBanner}
        <Navbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} onNavigate={setCurrentPage} />
        <div className="flex flex-1 relative app-body-row">
          <Sidebar 
            currentPage={currentPage} 
            onNavigate={setCurrentPage} 
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
          {sidebarOpen && (
            <div 
              className="md:hidden fixed inset-0 bg-black/50 z-40"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          <main className="flex-1 overflow-x-hidden main-content">
            {renderPage()}
          </main>
        </div>
      </div>
    </LanguageProvider>
  );
}

// -------- Offline-only screens --------
// Shown when the user cannot proceed without internet. Deliberately static
// (no Firebase calls) so they can never themselves hang offline.

const offlineFrame: React.CSSProperties = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 24, background: '#F4F7F5',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", Roboto, sans-serif',
};
const offlineCard: React.CSSProperties = {
  maxWidth: 480, background: '#fff', borderRadius: 16,
  padding: 32, boxShadow: '0 18px 48px rgba(16,40,28,0.12)',
  border: '1px solid #E6ECE8', textAlign: 'center',
};

const FirstLoginOfflineScreen: React.FC = () => (
  <div style={offlineFrame}>
    <div style={offlineCard}>
      <div style={{
        width: 64, height: 64, margin: '0 auto 16px',
        background: 'rgba(217,119,6,0.12)', borderRadius: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <WifiOff size={32} color="#b45309" />
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#11211A', marginBottom: 10 }}>
        Internet chahiye
      </h1>
      <p style={{ fontSize: 14, color: '#4B5C53', lineHeight: 1.6, marginBottom: 6 }}>
        Pehli baar login karne ke liye internet zaroori hai.
      </p>
      <p style={{ fontSize: 14, color: '#4B5C53', lineHeight: 1.6 }}>
        Ek baar login ho jaane ke baad app offline bhi khulegi aur milk collection entries local pe save hongi.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 20, padding: '10px 20px', border: 'none', borderRadius: 10,
          background: '#18A558', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}
      >
        Retry
      </button>
    </div>
  </div>
);

const VerifySubscriptionOfflineScreen: React.FC = () => (
  <div style={offlineFrame}>
    <div style={offlineCard}>
      <div style={{
        width: 64, height: 64, margin: '0 auto 16px',
        background: 'rgba(217,119,6,0.12)', borderRadius: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <WifiOff size={32} color="#b45309" />
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#11211A', marginBottom: 10 }}>
        Subscription verify karni hai
      </h1>
      <p style={{ fontSize: 14, color: '#4B5C53', lineHeight: 1.6 }}>
        Is device pe subscription ek baar bhi online verify nahi hui. Kripya ek baar internet se connect karein — uske baad app offline bhi kaam karegi.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 20, padding: '10px 20px', border: 'none', borderRadius: 10,
          background: '#18A558', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}
      >
        Retry
      </button>
    </div>
  </div>
);

export default App;
