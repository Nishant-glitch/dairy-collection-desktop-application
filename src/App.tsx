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
      <div className="min-h-screen flex items-center justify-center bg-[#0f172a]">
        <div className="flex flex-col items-center gap-6">
          <div className="animate-bounce" style={{ width: 80, height: 80, background: 'linear-gradient(135deg, #f59e0b, #d97706)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 20px 40px rgba(245,158,11,0.2)' }}>
            <Milk color="#0f172a" size={40} />
          </div>
          <div style={{ color: '#f1f5f9', fontSize: 24, fontWeight: 800, letterSpacing: '1px' }}>DCS PRO</div>
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
        return <MilkCollection onNavigate={setCurrentPage} />;
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
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex flex-1">
          <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
          <main className="flex-1 overflow-x-hidden">
            {renderPage()}
          </main>
        </div>
      </div>
    </LanguageProvider>
  );
}

export default App;
