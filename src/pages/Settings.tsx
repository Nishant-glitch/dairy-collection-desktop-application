import React, { useState, useEffect } from 'react';
import { ref, get, set } from 'firebase/database';
import { database } from '../firebase/config';
import { up, isAdmin } from '../utils/userDb';
import { MessageSquare, Save, RefreshCw, Bell, Shield, Send } from 'lucide-react';
import axios from 'axios';

const Settings: React.FC = () => {
  const [smsApiKey, setSmsApiKey] = useState('');
  const [smsSenderId, setSmsSenderId] = useState('');
  const [testMobile, setTestMobile] = useState('');
  const [testingSMS, setTestingSMS] = useState(false);
  const [saving, setSaving] = useState(false);
  const [language, setLanguage] = useState('English');
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const snap = await get(ref(database, up('settings/sms')));
      if (snap.exists()) {
        setSmsApiKey(snap.val().apiKey || '');
        setSmsSenderId(snap.val().senderId || '');
      }
      const prefSnap = await get(ref(database, up('settings/preferences')));
      if (prefSnap.exists()) {
        setLanguage(prefSnap.val().language || 'English');
        setDateFormat(prefSnap.val().dateFormat || 'DD/MM/YYYY');
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  };

  const handleSaveSMS = async () => {
    setSaving(true);
    try {
      await set(ref(database, up('settings/sms')), {
        apiKey: smsApiKey,
        senderId: smsSenderId,
        updatedAt: Date.now(),
      });
      alert('✅ SMS Settings saved!');
    } catch (err) {
      alert('❌ Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePreferences = async () => {
    try {
      await set(ref(database, up('settings/preferences')), {
        language,
        dateFormat,
        updatedAt: Date.now(),
      });
      alert('✅ Preferences saved!');
    } catch (err) {
      alert('❌ Failed to save preferences');
    }
  };

  const handleTestSMS = async () => {
    if (!smsApiKey.trim()) {
      alert('Please enter SMS API Key first!');
      return;
    }
    if (!/^\d{10}$/.test(testMobile.trim())) {
      alert('Please enter valid 10-digit number!');
      return;
    }

    setTestingSMS(true);
    try {
      const msg = encodeURIComponent(
        'Test SMS from DCS Pro. Your SMS is working!'
      );
      const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${smsApiKey.trim()}&route=q&message=${msg}&language=english&flash=0&numbers=${testMobile.trim()}`;
      
      const res = await fetch(url, { method: 'GET' });
      const data = await res.json();
      
      if (data?.return === true) {
        alert('✅ Test SMS sent to ' + testMobile + '!');
      } else {
        alert('❌ Failed: ' + JSON.stringify(data?.message || data));
      }
    } catch (err: any) {
      alert('❌ Error: ' + (err.message || 'Unknown'));
    } finally {
      setTestingSMS(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ color: '#f1f5f9', fontSize: 26, fontWeight: 800, marginBottom: 24 }}>
        ⚙️ Settings
      </h1>

      {/* SMS Configuration */}
      <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <MessageSquare style={{ color: '#4ade80', width: 22, height: 22 }} />
          <h2 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700 }}>SMS Configuration</h2>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="label-text">SMS API KEY</label>
          <input
            type="password"
            value={smsApiKey}
            onChange={(e) => setSmsApiKey(e.target.value)}
            placeholder="Paste your Fast2SMS API Key"
            className="input-field"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label className="label-text">SMS SENDER ID</label>
            <input
              type="text"
              value={smsSenderId}
              onChange={(e) => setSmsSenderId(e.target.value)}
              placeholder="e.g. DAIRYS"
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text">TEST SMS TO</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={testMobile}
                onChange={(e) => setTestMobile(e.target.value)}
                placeholder="10-digit mobile"
                className="input-field"
                style={{ flex: 1 }}
              />
              <button
                onClick={handleTestSMS}
                disabled={testingSMS}
                title="Send Test SMS"
                style={{
                  background: 'rgba(74,222,128,0.2)',
                  border: '1px solid rgba(74,222,128,0.4)',
                  borderRadius: 10, padding: '0 14px',
                  color: '#4ade80', cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                }}
              >
                {testingSMS ? <RefreshCw style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} /> : <Send style={{ width: 18, height: 18 }} />}
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={handleSaveSMS}
          disabled={saving}
          className="btn-primary"
          style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}
        >
          <Save style={{ width: 16, height: 16 }} />
          {saving ? 'Saving...' : 'Save SMS Settings'}
        </button>
      </div>

      {/* App Preferences */}
      <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
        <h2 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>
          🌐 App Preferences
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 20 }}>
          <div>
            <label className="label-text">LANGUAGE</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="input-field">
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
            </select>
          </div>
          <div>
            <label className="label-text">DATE FORMAT</label>
            <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} className="input-field">
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </div>
        </div>
        <button
          onClick={handleSavePreferences}
          className="btn-primary"
          style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}
        >
          <Save style={{ width: 16, height: 16 }} />
          Save Preferences
        </button>
      </div>

      {/* Account Info — Admin only */}
      {isAdmin() && (
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <Shield style={{ color: '#f59e0b', width: 22, height: 22 }} />
            <h2 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700 }}>Account Information</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label className="label-text">EMAIL</label>
              <input type="text" value="admin@nishant.com" readOnly className="input-field" style={{ opacity: 0.7 }} />
            </div>
            <div>
              <label className="label-text">ROLE</label>
              <input type="text" value="Administrator" readOnly className="input-field" style={{ opacity: 0.7 }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
