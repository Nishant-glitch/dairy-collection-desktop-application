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
import Deductions from './pages/Deductions';
import PaymentRegister from './pages/PaymentRegister';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import { Milk } from 'lucide-react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0a1f0f 0%, #0d2d18 40%, #0f3d20 100%)' }}>
        <div className="flex flex-col items-center gap-6">
          <div className="animate-bounce" style={{ width: 80, height: 80, background: 'linear-gradient(135deg, #4ade80, #1a5c2e)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 20px 40px rgba(74,222,128,0.2)' }}>
            <Milk color="white" size={40} />
          </div>
          <div style={{ color: 'white', fontSize: 24, fontWeight: 800, letterSpacing: '1px' }}>DCS PRO</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <LanguageProvider>
        <Login onLogin={() => setIsAuthenticated(true)} />
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
        return <MilkCollection />;
      case 'deductions':
        return <Deductions />;
      case 'payment-register':
        return <PaymentRegister />;
      case 'reports':
        return <Reports />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <LanguageProvider>
      <div className="min-h-screen" style={{ background: 'transparent' }}>
        <Navbar />
        <div className="flex">
          <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
          <main className="flex-1" style={{ minHeight: 'calc(100vh - 64px)' }}>
            {renderPage()}
          </main>
        </div>
      </div>
    </LanguageProvider>
  );
}

export default App;
