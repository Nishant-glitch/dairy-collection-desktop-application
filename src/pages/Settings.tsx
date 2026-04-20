import React, { useState, useEffect } from 'react';
import { ref, get, set } from 'firebase/database';
import { auth, database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { MessageSquare, Settings as SettingsIcon, User, Lock, Save, Send } from 'lucide-react';
import { updatePassword } from 'firebase/auth';

const Settings: React.FC = () => {
  const { t, language, setLanguage } = useLanguage();
  const user = auth.currentUser;
  
  // SMS Settings
  const [smsSettings, setSmsSettings] = useState({
    apiKey: '',
    senderId: '',
    testNumber: '',
  });

  // App Preferences
  const [preferences, setPreferences] = useState({
    language: language,
    dateFormat: 'DD/MM/YYYY',
    currencySymbol: '₹',
    decimalPlaces: 2,
  });

  // Password change
  const [passwordData, setPasswordData] = useState({
    current: '',
    new: '',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const smsRef = ref(database, up('settings/sms'));
    const prefRef = ref(database, up('settings/preferences'));
    
    const [smsSnap, prefSnap] = await Promise.all([get(smsRef), get(prefRef)]);
    
    if (smsSnap.exists()) setSmsSettings(prev => ({ ...prev, ...smsSnap.val() }));
    if (prefSnap.exists()) setPreferences(prev => ({ ...prev, ...prefSnap.val() }));
  };

  const saveSmsSettings = async () => {
    await set(ref(database, up('settings/sms')), {
      apiKey: smsSettings.apiKey,
      senderId: smsSettings.senderId,
    });
    alert('SMS settings saved!');
  };

  const savePreferences = async () => {
    await set(ref(database, up('settings/preferences')), preferences);
    setLanguage(preferences.language as 'en' | 'hi');
    alert('Preferences saved!');
  };

  const handleChangePassword = async () => {
    if (!passwordData.new) return;
    try {
      if (user) {
        await updatePassword(user, passwordData.new);
        alert('Password updated successfully!');
        setPasswordData({ current: '', new: '' });
      }
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  };

  const handleSendTestSms = () => {
    alert('Test SMS functionality would be triggered here for: ' + smsSettings.testNumber);
  };

  return (
    <div className="page-wrapper animate-fadeIn">
      <h1 className="page-title"><SettingsIcon /> {t('settings')}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SECTION 1 — SMS Settings */}
        <div className="lg:col-span-2 glass-card" style={{ padding: 24 }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <MessageSquare className="text-blue-400" size={20} />
            </div>
            <h2 className="text-lg font-bold text-white">SMS Configuration</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="label-text">SMS API Key</label>
              <input 
                type="password" 
                value={smsSettings.apiKey} 
                onChange={e => setSmsSettings({...smsSettings, apiKey: e.target.value})}
                className="input-3d" 
                placeholder="Enter your API Key"
              />
            </div>
            <div>
              <label className="label-text">SMS Sender ID</label>
              <input 
                type="text" 
                value={smsSettings.senderId} 
                onChange={e => setSmsSettings({...smsSettings, senderId: e.target.value})}
                className="input-3d" 
                placeholder="e.g. DAIRYP"
              />
            </div>
            <div>
              <label className="label-text">Test SMS to</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={smsSettings.testNumber} 
                  onChange={e => setSmsSettings({...smsSettings, testNumber: e.target.value})}
                  className="input-3d" 
                  placeholder="Mobile Number"
                />
                <button onClick={handleSendTestSms} className="btn-secondary" style={{ padding: '0 12px' }}>
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
          
          <div className="mt-8 flex justify-end">
            <button onClick={saveSmsSettings} className="btn-3d" style={{ padding: '10px 24px' }}>
              <Save size={18} /> Save SMS Settings
            </button>
          </div>
        </div>

        {/* SECTION 3 — Account Info */}
        <div className="glass-card" style={{ padding: 24 }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
              <User className="text-purple-400" size={20} />
            </div>
            <h2 className="text-lg font-bold text-white">Account Information</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="label-text">Email Address</label>
              <div className="input-3d bg-white/5 border-white/5 text-white/50 cursor-not-allowed">
                {user?.email}
              </div>
            </div>
            <div>
              <label className="label-text">Role</label>
              <div className="input-3d bg-white/5 border-white/5 text-white/50 cursor-not-allowed">
                Admin
              </div>
            </div>
            <div>
              <label className="label-text">Member Since</label>
              <div className="input-3d bg-white/5 border-white/5 text-white/50 cursor-not-allowed">
                {user?.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : '---'}
              </div>
            </div>
            
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '16px 0' }}></div>
            
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Lock size={14} /> Change Password
            </h3>
            <div className="space-y-2">
              <input 
                type="password" 
                placeholder="New Password" 
                value={passwordData.new}
                onChange={e => setPasswordData({...passwordData, new: e.target.value})}
                className="input-3d" 
                style={{ padding: '9px 12px' }}
              />
              <button onClick={handleChangePassword} className="btn-secondary w-full" style={{ padding: '10px 16px', fontSize: '14px' }}>
                Update Password
              </button>
            </div>
          </div>
        </div>

        {/* SECTION 2 — App Preferences */}
        <div className="lg:col-span-3 glass-card" style={{ padding: 20, marginTop: 16 }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-green-500/20 rounded-lg flex items-center justify-center">
              <SettingsIcon className="text-green-400" size={18} />
            </div>
            <h2 className="text-base font-bold text-white">App Preferences</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="label-text">Language</label>
              <select 
                value={preferences.language}
                onChange={e => setPreferences({...preferences, language: e.target.value})}
                className="input-3d"
                style={{ padding: '9px 12px', appearance: 'none' }}
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
              </select>
            </div>
            <div>
              <label className="label-text">Date Format</label>
              <select 
                value={preferences.dateFormat} 
                onChange={e => setPreferences({...preferences, dateFormat: e.target.value})}
                className="input-3d"
                style={{ appearance: 'none' }}
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>
            <div>
              <label className="label-text">Currency Symbol</label>
              <input 
                type="text" 
                value={preferences.currencySymbol} 
                onChange={e => setPreferences({...preferences, currencySymbol: e.target.value})}
                className="input-3d" 
              />
            </div>
            <div>
              <label className="label-text">Decimal Places</label>
              <input 
                type="number" 
                value={preferences.decimalPlaces} 
                onChange={e => setPreferences({...preferences, decimalPlaces: parseInt(e.target.value) || 0})}
                className="input-3d" 
              />
            </div>
          </div>
          
          <div className="mt-6 flex justify-end">
            <button onClick={savePreferences} className="btn-3d" style={{ padding: '10px 20px', fontSize: '14px' }}>
              <Save size={16} /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
