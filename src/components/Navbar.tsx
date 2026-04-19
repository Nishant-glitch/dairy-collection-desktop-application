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
      background: 'linear-gradient(90deg, #0a0f1e, #0f172a)',
      borderBottom: '1px solid rgba(245,158,11,0.2)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 1px 0 rgba(245,158,11,0.1)',
      position: 'sticky', top: 0, zIndex: 100,
      padding: '0 24px',
      height: '64px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between'
    }}>
      {/* Left: Logo & DCS Info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: 40, height: 40,
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
            fontSize: 20
          }}>🥛</div>
        </div>

        <div style={{ textAlign: 'left' }}>
          <div style={{ color: '#fcd34d', fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>
            {dcsInfo.name || 'DCS Pro'}
          </div>
          <div style={{ color: '#94a3b8', fontSize: 11 }}>
            Code: {dcsInfo.code || '—'} | {dcsInfo.phone || ''}
          </div>
        </div>
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div className="hidden md:flex flex-col items-end mr-4">
          <span style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600 }}>
            {currentTime.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          <span style={{ color: '#94a3b8', fontSize: 11 }}>
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
            <span style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              borderRadius: '20px',
              padding: '2px 10px',
              fontSize: '11px',
              fontWeight: 700,
              color: '#0f172a',
              boxShadow: '0 2px 8px rgba(245,158,11,0.4)'
            }}>ADMIN</span>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 700 }}>{user?.displayName || 'User'}</span>
            <span style={{ color: '#94a3b8', fontSize: 11 }}>{user?.email}</span>
          </div>
          <button className="btn-primary" style={{ padding: '8px 16px', fontSize: 13 }}
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
