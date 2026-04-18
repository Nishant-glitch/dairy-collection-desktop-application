import React, { useState, useEffect } from 'react';
import { ref, get, set } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { Save } from 'lucide-react';

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
    <div className="p-6">
      <h1 className="text-3xl font-bold text-green-900 mb-6">{t('dcsMaster')}</h1>

      <div className="bg-white rounded-xl shadow-lg p-6 max-w-2xl">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Society Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Society Code
            </label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">UPI ID</label>
            <input
              type="text"
              value={formData.upiId}
              onChange={(e) => setFormData({ ...formData, upiId: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
              placeholder="example@upi"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              UPI Account Name
            </label>
            <input
              type="text"
              value={formData.upiName}
              onChange={(e) => setFormData({ ...formData, upiName: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
            />
          </div>

          <button
            onClick={handleSave}
            className="w-full bg-green-800 text-white py-3 rounded-lg font-semibold hover:bg-green-900 transition flex items-center justify-center space-x-2"
          >
            <Save className="w-5 h-5" />
            <span>{t('save')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DCSMaster;
