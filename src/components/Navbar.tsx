import React, { useState, useEffect } from 'react';
import { LogOut, Milk, Globe, User } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { isAdmin } from '../utils/userDb';

interface NavbarProps {
  dcsName?: string;
}

const Navbar: React.FC<NavbarProps> = ({ dcsName = 'DCS Pro' }) => {
  const { language, setLanguage, t } = useLanguage();
  const [currentTime, setCurrentTime] = useState(new Date());
  const user = auth.currentUser;
  const userIsAdmin = isAdmin();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    window.location.reload();
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'hi' : 'en');
  };

  return (
    <nav className="bg-green-900 text-white shadow-lg">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="bg-white p-2 rounded-lg">
              <Milk className="w-6 h-6 text-green-900" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{dcsName}</h1>
              <p className="text-xs text-green-200">Dairy Collection System</p>
            </div>
          </div>

          <div className="flex items-center space-x-6">
            {/* User Info & Admin Badge */}
            <div className="flex items-center gap-3 border-r border-green-700 pr-6 mr-2">
              <div className="bg-green-800 p-2 rounded-full">
                <User size={16} />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold truncate max-w-[150px]">
                    {user?.displayName || 'User'}
                  </span>
                  {userIsAdmin && (
                    <span className="bg-red-500 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full shadow-sm">
                      Admin
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-green-300 truncate max-w-[150px]">
                  {user?.email}
                </div>
              </div>
            </div>

            <div className="text-right hidden md:block">
              <div className="text-sm font-semibold">
                {currentTime.toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </div>
              <div className="text-xs text-green-200">
                {currentTime.toLocaleTimeString('en-IN')}
              </div>
            </div>

            <button
              onClick={toggleLanguage}
              className="flex items-center space-x-2 bg-green-800 hover:bg-green-700 px-4 py-2 rounded-lg transition"
            >
              <Globe className="w-4 h-4" />
              <span className="text-sm font-semibold">
                {language === 'en' ? 'EN' : 'हि'}
              </span>
            </button>

            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm">{t('logout')}</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
