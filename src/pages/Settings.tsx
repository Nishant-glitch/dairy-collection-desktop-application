import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';

const Settings: React.FC = () => {
  const { t } = useLanguage();

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold text-green-900 mb-6">{t('settings')}</h1>
      <div className="bg-white rounded-xl shadow-lg p-6">
        <p className="text-gray-600">Settings - SMS API Configuration & Other Settings</p>
      </div>
    </div>
  );
};

export default Settings;
