import React, { useState, useEffect } from 'react';
import { ref, get, set } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { Save, Building2 } from 'lucide-react';

const DCSMaster: React.FC = () => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    phone: '',
    upiId: '',
    upiName: '',
  });

  useEffect(() => {
    loadDCSInfo();
  }, []);

  const loadDCSInfo = async () => {
    const dcsRef = ref(database, up('dcsInfo'));
    const snapshot = await get(dcsRef);
    if (snapshot.exists()) {
      setFormData(snapshot.val());
    }
  };

  const handleSave = async () => {
    const dcsRef = ref(database, up('dcsInfo'));
    await set(dcsRef, formData);
    alert('DCS information saved successfully!');
  };

  return (
    <div className="p-6 animate-fadeIn">
      <h1 className="page-title">{t('dcsMaster')}</h1>

      <div className="glass-card" style={{ padding: 32, maxWidth: 650 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div style={{ width: 48, height: 48, background: 'linear-gradient(135deg, #4ade80, #1a5c2e)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(74,222,128,0.3)' }}>
            <Building2 color="#0a1f0f" size={24} />
          </div>
          <div>
            <h2 style={{ color: 'white', fontSize: 20, fontWeight: 800 }}>Society Information</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Configure your dairy collection center details</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label-text">Society Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input-3d"
                placeholder="Full Name of Society"
              />
            </div>

            <div>
              <label className="label-text">Society Code</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="input-3d"
                placeholder="DCS001"
              />
            </div>
          </div>

          <div>
            <label className="label-text">Address</label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="input-3d"
              rows={3}
              placeholder="Complete physical address"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label-text">Phone Number</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="input-3d"
                placeholder="Contact Number"
              />
            </div>
          </div>

          <div style={{ padding: 20, background: 'rgba(255,255,255,0.05)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ color: '#4ade80', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 20 }}>Payment Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="label-text">UPI ID</label>
                <input
                  type="text"
                  value={formData.upiId}
                  onChange={(e) => setFormData({ ...formData, upiId: e.target.value })}
                  className="input-3d"
                  placeholder="example@upi"
                />
              </div>

              <div>
                <label className="label-text">UPI Account Name</label>
                <input
                  type="text"
                  value={formData.upiName}
                  onChange={(e) => setFormData({ ...formData, upiName: e.target.value })}
                  className="input-3d"
                  placeholder="Display Name for UPI"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleSave}
            className="btn-3d w-full"
            style={{ padding: 16, fontSize: 16, marginTop: 12 }}
          >
            <Save size={20} />
            <span>{t('save')} Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DCSMaster;
