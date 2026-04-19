import React, { useState, useEffect } from 'react';
import { LogOut, Globe } from 'lucide-react';
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
    <nav style={{
      background: 'linear-gradient(90deg, #fff0f3, #fde8e8)',
      borderBottom: '1px solid rgba(242,199,199,0.5)',
      boxShadow: '0 4px 24px rgba(255,183,197,0.25), 0 1px 0 rgba(255,255,255,0.8)',
      backdropFilter: 'blur(20px)',
      position: 'sticky', top: 0, zIndex: 100,
      padding: '0 24px',
      height: '64px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between'
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: 40, height: 40,
          background: 'linear-gradient(135deg, #FFB7C5, #F2C7C7)',
          borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(255,183,197,0.5), inset 0 1px 0 rgba(255,255,255,0.6)',
          fontSize: 20
        }}>🥛</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{
            color: '#2D1B1B', fontWeight: 800, fontSize: 20,
            letterSpacing: '-0.5px',
            lineHeight: 1
          }}>{dcsName}</span>
          <span style={{ color: '#c44d6e', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>
            Dairy Collection System
          </span>
        </div>
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div className="hidden md:flex flex-col items-end mr-4">
          <span style={{ color: '#2D1B1B', fontSize: 13, fontWeight: 600 }}>
            {currentTime.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          <span style={{ color: '#6B4C4C', fontSize: 11 }}>
            {currentTime.toLocaleTimeString('en-IN')}
          </span>
        </div>

        <button
          onClick={toggleLanguage}
          className="btn-3d"
          style={{ padding: '6px 12px', fontSize: 12, background: 'rgba(242,199,199,0.3)', boxShadow: 'none', border: '1px solid rgba(242,199,199,0.6)' }}
        >
          <Globe size={14} />
          {language === 'en' ? 'EN' : 'हि'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {userIsAdmin && <span className="badge-3d">ADMIN</span>}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ color: '#2D1B1B', fontSize: 13, fontWeight: 700 }}>{user?.displayName || 'User'}</span>
            <span style={{ color: '#6B4C4C', fontSize: 11 }}>{user?.email}</span>
          </div>
          <button className="btn-3d" style={{ padding: '8px 16px', fontSize: 13, background: 'linear-gradient(145deg, #FFB7C5, #f090a8)' }}
            onClick={handleLogout}>
            <LogOut size={14} />
            {t('logout')}
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
