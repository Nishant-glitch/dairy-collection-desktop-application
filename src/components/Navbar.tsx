import React, { useState, useEffect } from 'react';
import { LogOut, Globe } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { signOut } from 'firebase/auth';
import { auth, database } from '../firebase/config';
import { isAdmin, up } from '../utils/userDb';
import { ref, onValue } from 'firebase/database';

interface NavbarProps {
  dcsName?: string;
}

const Navbar: React.FC<NavbarProps> = () => {
  const { language, setLanguage, t } = useLanguage();
  const [currentTime, setCurrentTime] = useState(new Date());
  const user = auth.currentUser;
  const userIsAdmin = isAdmin();
  const [dcsInfo, setDcsInfo] = useState<any>({});

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
      background: 'linear-gradient(90deg, #051208, #0a1f0f)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.05)',
      backdropFilter: 'blur(20px)',
      position: 'sticky', top: 0, zIndex: 100,
      padding: '0 24px',
      height: '60px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between'
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: 36, height: 36,
          background: 'linear-gradient(135deg, #4ade80, #1a5c2e)',
          borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(74,222,128,0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
          fontSize: 18
        }}>🥛</div>
        <span style={{
          color: 'white', fontWeight: 800, fontSize: 18,
          letterSpacing: '-0.5px',
          textShadow: '0 0 20px rgba(74,222,128,0.3)'
        }}>DCS Pro</span>
      </div>

      {/* DCS Info in Center */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <span style={{ color: 'white', fontSize: '14px', fontWeight: 700 }}>{dcsInfo.name || 'Dairy Collection System'}</span>
        <div style={{ display: 'flex', gap: '12px', color: 'rgba(255,255,255,0.6)', fontSize: '11px' }}>
          <span>Code: {dcsInfo.code || '---'}</span>
          <span>Ph: {dcsInfo.phone || '---'}</span>
        </div>
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div className="hidden md:flex flex-col items-end mr-4">
          <span style={{ color: 'white', fontSize: 12, fontWeight: 600 }}>
            {currentTime.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>
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
            <span style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>{user?.displayName || 'User'}</span>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</span>
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
