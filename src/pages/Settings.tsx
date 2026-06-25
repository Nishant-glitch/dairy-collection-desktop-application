import React, { useState, useEffect } from 'react';
import { ref, get, set } from 'firebase/database';
import { database } from '../firebase/config';
import { up, isAdmin } from '../utils/userDb';
import { MessageSquare, Save, RefreshCw, Bell, Shield, Send } from 'lucide-react';
import axios from 'axios';

const Settings: React.FC = () => {
  const [smsApiKey, setSmsApiKey] = useState(import.meta.env.VITE_MSG91_AUTH_KEY || '');
  const [smsTemplateId, setSmsTemplateId] = useState(import.meta.env.VITE_MSG91_TEMPLATE_ID || '');
  const [testMobile, setTestMobile] = useState('');
  const [testingSMS, setTestingSMS] = useState(false);
  const [saving, setSaving] = useState(false);
  const [language, setLanguage] = useState('English');
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');
  const [bmcBill, setBmcBill] = useState({ unionName: '', route: '', salesSthan: '', headLoadRate: '', nextBillNo: 1 });
  const [savingBill, setSavingBill] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const snap = await get(ref(database, up('settings/sms')));
      if (snap.exists()) {
        setSmsApiKey(snap.val().apiKey || import.meta.env.VITE_MSG91_AUTH_KEY || '');
        setSmsTemplateId(snap.val().templateId || import.meta.env.VITE_MSG91_TEMPLATE_ID || '');
      }
      const prefSnap = await get(ref(database, up('settings/preferences')));
      if (prefSnap.exists()) {
        setLanguage(prefSnap.val().language || 'English');
        setDateFormat(prefSnap.val().dateFormat || 'DD/MM/YYYY');
      }
      const billSnap = await get(ref(database, up('settings/bmcBill')));
      if (billSnap.exists()) {
        setBmcBill({ unionName: '', route: '', salesSthan: '', headLoadRate: '', nextBillNo: 1, ...billSnap.val() });
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  };

  const handleSaveBmcBill = async () => {
    setSavingBill(true);
    try {
      await set(ref(database, up('settings/bmcBill')), {
        unionName: bmcBill.unionName,
        route: bmcBill.route,
        salesSthan: bmcBill.salesSthan,
        headLoadRate: bmcBill.headLoadRate,
        nextBillNo: parseInt(String(bmcBill.nextBillNo)) || 1,
        updatedAt: Date.now(),
      });
      alert('✅ BMC Bill settings saved!');
    } catch (err) {
      alert('❌ Failed to save BMC Bill settings');
    } finally {
      setSavingBill(false);
    }
  };

  const handleSaveSMS = async () => {
    setSaving(true);
    try {
      await set(ref(database, up('settings/sms')), {
        apiKey: smsApiKey,
        templateId: smsTemplateId,
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
    if (!testMobile.trim() || !/^\d{10}$/.test(testMobile.trim())) {
      alert('Please enter valid 10-digit number!');
      return;
    }
    setTestingSMS(true);
    try {
      const authKey = smsApiKey.trim() || import.meta.env.VITE_MSG91_AUTH_KEY || '';
      const templateId = smsTemplateId.trim() || import.meta.env.VITE_MSG91_TEMPLATE_ID || '';
      if (!authKey || !templateId) {
        alert('❌ SMS API Key / Template ID not set. Please enter and save them first.');
        setTestingSMS(false);
        return;
      }
      await fetch('https://api.msg91.com/api/v5/flow/', {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'authkey': authKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template_id: templateId,
          short_url: '0',
          mobiles: '91' + testMobile.trim(),
          name: 'Test Farmer',
          qty: '5.00',
          fat: '4.5',
          amount: '100.00',
        }),
      });
      alert('✅ SMS request sent! Check your phone.');
    } catch (err: any) {
      alert('❌ Error: ' + err.message);
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
            <label className="label-text">SMS TEMPLATE ID</label>
            <input
              type="text"
              value={smsTemplateId}
              onChange={(e) => setSmsTemplateId(e.target.value)}
              placeholder="Paste your MSG91 Template ID"
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

      {/* BMC Bill Header Settings */}
      <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
        <h2 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
          🧾 BMC Bill (Union Format) Settings
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 20 }}>
          Header fields for the BMC Payment Register printout. Society name/code come from DCS Master.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 16 }}>
          <div>
            <label className="label-text">UNION NAME</label>
            <input
              type="text"
              value={bmcBill.unionName}
              onChange={(e) => setBmcBill({ ...bmcBill, unionName: e.target.value })}
              placeholder="e.g. Mithila Dugdh Utpadak Sahkari Sangh Ltd."
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text">ROUTE</label>
            <input
              type="text"
              value={bmcBill.route}
              onChange={(e) => setBmcBill({ ...bmcBill, route: e.target.value })}
              placeholder="Route name / number"
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text">SALES STHAN / LOCATION CODE</label>
            <input
              type="text"
              value={bmcBill.salesSthan}
              onChange={(e) => setBmcBill({ ...bmcBill, salesSthan: e.target.value })}
              placeholder="Sales sthan / location code"
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text">HEAD LOAD RATE</label>
            <input
              type="text"
              value={bmcBill.headLoadRate}
              onChange={(e) => setBmcBill({ ...bmcBill, headLoadRate: e.target.value })}
              placeholder="Display only — no calculation"
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text">NEXT BILL NO.</label>
            <input
              type="number"
              value={bmcBill.nextBillNo}
              onChange={(e) => setBmcBill({ ...bmcBill, nextBillNo: parseInt(e.target.value) || 1 })}
              placeholder="1"
              className="input-field"
            />
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4 }}>
              Auto-increments each time a BMC bill is generated.
            </p>
          </div>
        </div>
        <button
          onClick={handleSaveBmcBill}
          disabled={savingBill}
          className="btn-primary"
          style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}
        >
          <Save style={{ width: 16, height: 16 }} />
          {savingBill ? 'Saving...' : 'Save BMC Bill Settings'}
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
