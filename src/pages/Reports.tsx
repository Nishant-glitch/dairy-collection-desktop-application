import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { BarChart3 } from 'lucide-react';

const Reports: React.FC = () => {
  const { t } = useLanguage();

  return (
    <div className="p-6 animate-fadeIn">
      <h1 style={{ color: 'white', fontWeight: 800, fontSize: 28, textShadow: '0 2px 8px rgba(0,0,0,0.3)', marginBottom: 24 }}>{t('reports')}</h1>
      <div className="glass-card" style={{ padding: 64, textAlign: 'center', borderStyle: 'dashed' }}>
        <div style={{ width: 80, height: 80, background: 'rgba(74, 222, 128, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <BarChart3 color="#4ade80" size={40} />
        </div>
        <h3 style={{ color: 'white', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Reports Module</h3>
        <p style={{ color: 'rgba(255,255,255,0.5)', maxWidth: 400, margin: '0 auto' }}>
          This feature is currently under development. Soon you will be able to generate detailed analytics and PDF reports.
        </p>
      </div>
    </div>
  );
};

export default Reports;
