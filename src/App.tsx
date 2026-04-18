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
      <div className="min-h-screen bg-green-900 flex items-center justify-center">
        <div className="text-white text-2xl">Loading...</div>
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
      <div className="min-h-screen bg-gray-100">
        <Navbar />
        <div className="flex">
          <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
          <main className="flex-1">
            {renderPage()}
          </main>
        </div>
      </div>
    </LanguageProvider>
  );
}

export default App;
