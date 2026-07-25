import React, { useState, useEffect } from 'react';
import { LogOut, Globe, Menu, Wifi, WifiOff } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { signOut } from 'firebase/auth';
import { auth, database } from '../firebase/config';
import { isAdmin, up } from '../utils/userDb';
import { ref, onValue } from 'firebase/database';
import { useConnection } from '../hooks/useConnection';
import FarmerLookup from './FarmerLookup';
import CalculatorWidget from './CalculatorWidget';

interface NavbarProps {
  onMenuToggle: () => void;
  onNavigate?: (page: string) => void;
}

const Navbar: React.FC<NavbarProps> = ({ onMenuToggle, onNavigate }) => {
  const { language, setLanguage, t } = useLanguage();
  const [currentTime, setCurrentTime] = useState(new Date());
  const user = auth.currentUser;
  const userIsAdmin = isAdmin();
  const [dcsInfo, setDcsInfo] = useState<any>({});
  const online = useConnection();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    const dcsRef = ref(database, up('dcsInfo'));
    const unsubscribe = onValue(dcsRef, snap => {
      if (snap.exists()) setDcsInfo(snap.val());
    });

    return () => {
      clearInterval(timer);
      unsubscribe();
    };
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
      background: 'rgba(255,255,255,0.85)',
      borderBottom: '1px solid var(--line)',
      boxShadow: 'var(--shadow-sm)',
      backdropFilter: 'blur(12px)',
      position: 'sticky', top: 0, zIndex: 100,
      padding: '0 24px',
      height: '56px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between'
    }}>
      {/* Logo & Hamburger */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button 
          onClick={onMenuToggle}
          className="hamburger hidden"
          style={{ 
            background: 'transparent', border: 'none', color: 'var(--ink)', 
            cursor: 'pointer', padding: '4px', marginRight: '8px' 
          }}
        >
          <Menu size={24} />
        </button>
        <div style={{
          width: 32, height: 32,
          background: 'linear-gradient(135deg, #4ade80, #1a5c2e)',
          borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(74,222,128,0.4), inset 0 1px 0 var(--line)',
          fontSize: 16
        }}>🥛</div>
        <span style={{
          color: 'var(--ink)', fontWeight: 800, fontSize: 16,
          letterSpacing: '-0.5px',
          textShadow: '0 0 20px rgba(74,222,128,0.3)'
        }} className="hidden md:block">DCS Pro</span>
      </div>

      {/* DCS Info in Center */}
      <div className="navbar-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <span style={{ color: 'var(--ink)', fontSize: '14px', fontWeight: 700 }}>{dcsInfo.name || 'Dairy Collection System'}</span>
        <div style={{ display: 'flex', gap: '12px', color: 'var(--ink-2)', fontSize: '11px' }}>
          <span>Code: {dcsInfo.code || '---'}</span>
          <span>Ph: {dcsInfo.phone || '---'}</span>
        </div>
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Online / offline indicator */}
        <div
          title={online ? 'Online' : 'Offline — entries local pe save ho rahi hain, internet aane par sync hongi'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999,
            background: online ? 'rgba(22,163,74,0.1)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${online ? 'rgba(22,163,74,0.35)' : 'rgba(239,68,68,0.4)'}`,
            color: online ? '#15803d' : '#b91c1c', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
          }}
        >
          {online ? <Wifi size={13} /> : <WifiOff size={13} />}
          <span className="hidden md:inline">{online ? 'Online' : 'Offline'}</span>
        </div>

        {/* Quick tools: farmer lookup + calculator (available on every page) */}
        <FarmerLookup onNavigate={onNavigate} />
        <CalculatorWidget />

        <div className="hidden md:flex flex-col items-end mr-4">
          <span style={{ color: 'var(--ink)', fontSize: 12, fontWeight: 600 }}>
            {currentTime.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          <span style={{ color: 'var(--ink-2)', fontSize: 11 }}>
            {currentTime.toLocaleTimeString('en-IN')}
          </span>
        </div>

        <button
          onClick={toggleLanguage}
          className="btn-secondary"
          style={{ padding: '6px 12px', fontSize: 12 }}
        >
          <Globe size={14} />
          {language === 'en' ? 'EN' : 'हि'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {userIsAdmin && (
            <span className="badge-3d">ADMIN</span>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ color: 'var(--ink)', fontSize: 13, fontWeight: 700 }}>{user?.displayName || 'User'}</span>
            <span className="navbar-email" style={{ color: 'var(--ink-2)', fontSize: 11, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</span>
          </div>
          <button className="btn-3d" style={{ padding: '8px 16px', fontSize: 13 }}
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
