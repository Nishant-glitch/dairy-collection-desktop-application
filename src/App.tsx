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
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Subscribe from './pages/Subscribe';
import AdminSubscriptions from './pages/AdminSubscriptions';
import { hasAccess } from './utils/subscription';
import { Milk } from 'lucide-react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [hasSubAccess, setHasSubAccess] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    setCheckingAccess(true);
    hasAccess().then((ok) => {
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

  if (loading) {
    return loadingScreen;
  }

  if (!isAuthenticated) {
    return (
      <LanguageProvider>
        <Login onLogin={() => setIsAuthenticated(true)} />
      </LanguageProvider>
    );
  }

  if (checkingAccess) {
    return loadingScreen;
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
      case 'reports':
        return <Reports />;
      case 'settings':
        return <Settings />;
      case 'admin-subscriptions':
        return <AdminSubscriptions />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <LanguageProvider>
      <div className="min-h-screen flex flex-col app-shell">
        <Navbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
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

export default App;
