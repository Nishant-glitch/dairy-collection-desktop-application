import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../db/db';
import { Settings as SettingsIcon, Save, RefreshCw, MessageSquare, Shield, Bell, Database } from 'lucide-react';

const Settings: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'sms' | 'backup'>('general');

  // General Settings
  const [dairyName, setDairyName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');

  // SMS Settings
  const [smsApiKey, setSmsApiKey] = useState('');
  const [smsSenderId, setSmsSenderId] = useState('');
  const [testMobile, setTestMobile] = useState('');
  const [testingSMS, setTestingSMS] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await db.settings.toArray();
      const s = settings[0] || {};
      
      setDairyName(s.dairyName || '');
      setOwnerName(s.ownerName || '');
      setAddress(s.address || '');
      setPhone(s.phone || '');
      setSmsApiKey(s.smsApiKey || '');
      setSmsSenderId(s.smsSenderId || '');
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const existing = await db.settings.toArray();
      const settingsData = {
        dairyName,
        ownerName,
        address,
        phone,
        smsApiKey,
        smsSenderId,
        updatedAt: new Date(),
      };

      if (existing.length > 0) {
        await db.settings.update(existing[0].id!, settingsData);
      } else {
        await db.settings.add(settingsData);
      }
      alert('Settings saved successfully!');
    } catch (err) {
      console.error('Error saving settings:', err);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
          <p className="text-gray-600">Configure your dairy collection system</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save All Changes
        </button>
      </div>

      <div className="flex gap-4 mb-8 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('general')}
          className={`pb-4 px-2 flex items-center gap-2 font-medium transition-colors ${
            activeTab === 'general' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Database className="w-4 h-4" />
          General
        </button>
        <button
          onClick={() => setActiveTab('sms')}
          className={`pb-4 px-2 flex items-center gap-2 font-medium transition-colors ${
            activeTab === 'sms' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          SMS Configuration
        </button>
        <button
          onClick={() => setActiveTab('backup')}
          className={`pb-4 px-2 flex items-center gap-2 font-medium transition-colors ${
            activeTab === 'backup' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Shield className="w-4 h-4" />
          Backup & Security
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {activeTab === 'general' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dairy Name</label>
                <input
                  type="text"
                  value={dairyName}
                  onChange={(e) => setDairyName(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Krishna Dairy"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner Name</label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. John Doe"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={3}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Complete dairy address..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. 9876543210"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sms' && (
          <div className="space-y-6">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 mb-6">
              <div className="flex gap-3">
                <Bell className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <p className="text-sm text-blue-800">
                  Configure Fast2SMS API to send automatic collection alerts to farmers. 
                  Get your API key from <a href="https://www.fast2sms.com" target="_blank" rel="noopener noreferrer" className="underline font-bold">Fast2SMS Dashboard</a>.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fast2SMS API Key</label>
                <input
                  type="password"
                  value={smsApiKey}
                  onChange={(e) => setSmsApiKey(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Paste your API key here"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sender ID (DLT)</label>
                <input
                  type="text"
                  value={smsSenderId}
                  onChange={(e) => setSmsSenderId(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. DAIRYS"
                />
              </div>

              <div className="pt-6 border-t border-gray-100">
                <h3 className="text-lg font-medium text-gray-800 mb-4">Test SMS Configuration</h3>
                <div className="flex gap-4">
                  <input
                    type="text"
                    value={testMobile}
                    onChange={(e) => setTestMobile(e.target.value)}
                    className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Enter 10-digit mobile number"
                  />
                  <button
                    onClick={handleTestSMS}
                    disabled={testingSMS || !smsApiKey}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {testingSMS ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Send Test SMS'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'backup' && (
          <div className="space-y-6">
            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-100">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> Data is stored locally on this device. Regular backups are recommended to prevent data loss.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button className="p-4 border border-gray-200 rounded-xl hover:bg-gray-50 text-left transition-colors">
                <h4 className="font-bold text-gray-800 mb-1">Export Database</h4>
                <p className="text-sm text-gray-500">Download a backup file of all your records.</p>
              </button>
              <button className="p-4 border border-gray-200 rounded-xl hover:bg-gray-50 text-left transition-colors">
                <h4 className="font-bold text-gray-800 mb-1">Import Database</h4>
                <p className="text-sm text-gray-500">Restore data from a previous backup file.</p>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
