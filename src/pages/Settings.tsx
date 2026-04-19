import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Settings as SettingsIcon } from 'lucide-react';

const Settings: React.FC = () => {
  const { t } = useLanguage();

  return (
    <div className="p-6 animate-fadeUp">
      <h1 className="page-title">{t('settings')}</h1>
      <div className="glass-card" style={{ padding: 64, textAlign: 'center', borderStyle: 'dashed' }}>
        <div style={{ width: 80, height: 80, background: 'rgba(245,158,11,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <SettingsIcon color="#f59e0b" size={40} />
        </div>
        <h3 style={{ color: '#f1f5f9', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>System Settings</h3>
        <p style={{ color: '#94a3b8', maxWidth: 400, margin: '0 auto' }}>
          Configure SMS API, printer settings, and user preferences here. This module is coming soon.
        </p>
      </div>
    </div>
  );
};

export default Settings;
