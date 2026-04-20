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
    <div className="page-wrapper animate-fadeIn">
      <h1 className="page-title">{t('dcsMaster')}</h1>

      <div className="glass-card" style={{ padding: 20, maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg, #4ade80, #1a5c2e)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(74,222,128,0.3)' }}>
            <Building2 color="#0a1f0f" size={20} />
          </div>
          <div>
            <h2 style={{ color: 'white', fontSize: 18, fontWeight: 800 }}>Society Information</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>Configure your dairy collection center details</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 form-grid">
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
            
            <div className="col-span-1 md:col-span-2">
              <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '8px 0' }}></div>
            </div>

            <div className="col-span-1 md:col-span-2">
              <label className="label-text">Address</label>
              <textarea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="input-3d"
                rows={2}
                placeholder="Complete physical address"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={handleSave}
              className="btn-3d"
              style={{ padding: '10px 28px', width: 'auto', float: 'right' }}
            >
              <Save size={16} />
              <span>{t('save')} Settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DCSMaster;
