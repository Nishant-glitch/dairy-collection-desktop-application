import React, { useState, useEffect } from 'react';
import { ref, get, set } from 'firebase/database';
import { auth, database } from '../firebase/config';
import { up, isAdmin } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { MessageSquare, Settings as SettingsIcon, User, Lock, Save, Send } from 'lucide-react';
import { updatePassword } from 'firebase/auth';

const Settings: React.FC = () => {
  const { t, language, setLanguage } = useLanguage();
  const user = auth.currentUser;
  
  // SMS Settings
  const [smsApiKey, setSmsApiKey] = useState('');
  const [smsSenderId, setSmsSenderId] = useState('');
  const [testMobile, setTestMobile] = useState('');
  const [testingSMS, setTestingSMS] = useState(false);

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
    
    if (smsSnap.exists()) {
      const data = smsSnap.val();
      setSmsApiKey(data.apiKey || '');
      setSmsSenderId(data.senderId || '');
    }
    if (prefSnap.exists()) setPreferences(prev => ({ ...prev, ...prefSnap.val() }));
  };

  const saveSmsSettings = async () => {
    await set(ref(database, up('settings/sms')), {
      apiKey: smsApiKey.trim(),
      senderId: smsSenderId.trim(),
      updatedAt: Date.now(),
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

  const handleTestSMS = async () => {
    const apiKey = smsApiKey.trim();
    const mobile = testMobile.trim();
    const senderId = smsSenderId.trim() || 'DAIRYS';

    if (!apiKey) {
      alert('Please enter SMS API Key first!');
      return;
    }

    if (!/^\d{10}$/.test(mobile)) {
      alert('Please enter a valid 10-digit mobile number!');
      return;
    }

    setTestingSMS(true);

    try {
      const response = await fetch('/api/send-sms', {
  method: 'POST',
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    number: testNumber,
    message: message
  })
});
        body: JSON.stringify({
          route: 'q',
          message: 'Test SMS from DCS Pro Dairy Collection System. Your SMS is working correctly!',
          language: 'english',
          flash: 0,
          numbers: mobile,
        }),
      });

      const result = await response.json();
      console.log('SMS result:', result);

      if (result.return === true) {
        alert('✅ Test SMS sent successfully to ' + mobile + '!');
      } else {
        alert('❌ SMS failed: ' + (result.message?.[0] || JSON.stringify(result)));
      }
    } catch (err: any) {
      alert('❌ Error sending SMS: ' + err.message);
    } finally {
      setTestingSMS(false);
    }
  };

  return (
    <div className="page-wrapper animate-fadeIn">
      <h1 className="page-title"><SettingsIcon /> {t('settings')}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SECTION 1 — SMS Settings */}
        <div className="lg:col-span-2 glass-card" style={{ padding: '24px' }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <MessageSquare className="text-blue-400" size={20} />
            </div>
            <h2 className="text-lg font-bold text-white">SMS Configuration</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '16px' }}>
            <div className="md:col-span-2" style={{ marginBottom: '16px' }}>
              <label className="label-text" style={{ marginBottom: '6px' }}>SMS API Key</label>
              <input 
                type="password" 
                value={smsApiKey} 
                onChange={e => setSmsApiKey(e.target.value)}
                className="input-3d" 
                style={{ padding: '10px 14px', fontSize: '14px' }}
                placeholder="Enter your API Key"
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label className="label-text" style={{ marginBottom: '6px' }}>SMS Sender ID</label>
              <input 
                type="text" 
                value={smsSenderId} 
                onChange={e => setSmsSenderId(e.target.value)}
                className="input-3d" 
                style={{ padding: '10px 14px', fontSize: '14px' }}
                placeholder="e.g. DAIRYS"
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label className="label-text" style={{ marginBottom: '6px' }}>Test SMS to</label>
              <div className="flex" style={{ gap: '16px' }}>
                <input 
                  type="text" 
                  value={testMobile} 
                  onChange={e => setTestMobile(e.target.value)}
                  className="input-3d" 
                  style={{ padding: '10px 14px', fontSize: '14px' }}
                  placeholder="Mobile Number"
                />
                <button
                  onClick={handleTestSMS}
                  disabled={testingSMS}
                  title="Send Test SMS"
                  style={{
                    background: testingSMS ? 'rgba(148,163,184,0.2)' : 'rgba(74,222,128,0.2)',
                    border: '1px solid rgba(74,222,128,0.4)',
                    borderRadius: 8, padding: '10px 14px',
                    color: '#4ade80', cursor: testingSMS ? 'not-allowed' : 'pointer',
                    fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  {testingSMS ? '⏳' : '📤'}
                </button>
              </div>
            </div>
          </div>
          
          <div style={{ marginTop: '20px', display: 'block', marginLeft: 'auto', width: 'fit-content' }}>
            <button onClick={saveSmsSettings} className="btn-3d" style={{ padding: '10px 24px', minHeight: '40px', fontSize: '14px' }}>
              <Save size={18} /> Save SMS Settings
            </button>
          </div>
        </div>

        {/* SECTION 3 — Account Info */}
        {isAdmin() && (
          <div className="glass-card" style={{ padding: '24px' }}>
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
                  style={{ padding: '9px 12px', fontSize: '14px' }}
                />
                <button onClick={handleChangePassword} className="btn-secondary w-full" style={{ padding: '10px 16px', fontSize: '14px', minHeight: '40px' }}>
                  Update Password
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 2 — App Preferences */}
        <div className="lg:col-span-3 glass-card" style={{ padding: '24px', marginTop: 16 }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-green-500/20 rounded-lg flex items-center justify-center">
              <SettingsIcon className="text-green-400" size={18} />
            </div>
            <h2 className="text-base font-bold text-white">App Preferences</h2>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            <div>
              <label className="label-text" style={{ marginBottom: '6px' }}>Language</label>
              <select 
                value={preferences.language}
                onChange={e => setPreferences({...preferences, language: e.target.value})}
                className="input-3d"
                style={{ padding: '10px 14px', fontSize: '14px', appearance: 'none' }}
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
              </select>
            </div>
            <div>
              <label className="label-text" style={{ marginBottom: '6px' }}>Date Format</label>
              <select 
                value={preferences.dateFormat} 
                onChange={e => setPreferences({...preferences, dateFormat: e.target.value})}
                className="input-3d"
                style={{ padding: '10px 14px', fontSize: '14px', appearance: 'none' }}
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>
            <div>
              <label className="label-text" style={{ marginBottom: '6px' }}>Currency Symbol</label>
              <input 
                type="text" 
                value={preferences.currencySymbol} 
                onChange={e => setPreferences({...preferences, currencySymbol: e.target.value})}
                className="input-3d" 
                style={{ padding: '10px 14px', fontSize: '14px' }}
              />
            </div>
            <div>
              <label className="label-text" style={{ marginBottom: '6px' }}>Decimal Places</label>
              <input 
                type="number" 
                value={preferences.decimalPlaces} 
                onChange={e => setPreferences({...preferences, decimalPlaces: parseInt(e.target.value) || 0})}
                className="input-3d" 
                style={{ padding: '10px 14px', fontSize: '14px' }}
              />
            </div>
          </div>
          
          <div style={{ marginTop: '20px', display: 'block', marginLeft: 'auto', width: 'fit-content' }}>
            <button onClick={savePreferences} className="btn-3d" style={{ padding: '10px 24px', minHeight: '40px', fontSize: '14px' }}>
              <Save size={16} /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
