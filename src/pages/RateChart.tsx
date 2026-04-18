import React, { useState, useEffect } from 'react';
import { ref, onValue, set, push, remove } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { Plus, Trash2, Upload } from 'lucide-react';

interface RateEntry {
  id: string;
  fatFrom: number;
  fatTo: number;
  snfFrom: number;
  snfTo: number;
  rate: number;
}

const RateChart: React.FC = () => {
  const { t } = useLanguage();
  const [rateChart, setRateChart] = useState<RateEntry[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    fatFrom: '',
    fatTo: '',
    snfFrom: '',
    snfTo: '',
    rate: '',
  });

  useEffect(() => {
    loadRateChart();
  }, []);

  const loadRateChart = () => {
    const rateRef = ref(database, up('rateChart'));
    onValue(rateRef, (snapshot) => {
      const rateArray: RateEntry[] = [];
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.keys(data).forEach((key) => {
          rateArray.push({ id: key, ...data[key] });
        });
      }
      setRateChart(rateArray);
    });
  };

  const handleAdd = async () => {
    if (!formData.fatFrom || !formData.fatTo || !formData.snfFrom || !formData.snfTo || !formData.rate) {
      alert('All fields are required!');
      return;
    }

    const rateRef = ref(database, up('rateChart'));
    const newRateRef = push(rateRef);
    await set(newRateRef, {
      fatFrom: parseFloat(formData.fatFrom),
      fatTo: parseFloat(formData.fatTo),
      snfFrom: parseFloat(formData.snfFrom),
      snfTo: parseFloat(formData.snfTo),
      rate: parseFloat(formData.rate),
    });

    setShowModal(false);
    setFormData({ fatFrom: '', fatTo: '', snfFrom: '', snfTo: '', rate: '' });
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this rate entry?')) {
      const rateRef = ref(database, up(`rateChart/${id}`));
      await remove(rateRef);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-green-900">{t('rateChart')}</h1>
        <div className="flex space-x-3">
          <button
            onClick={() => alert('PDF Upload feature - Connect with pdf-parse library')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center space-x-2"
          >
            <Upload className="w-5 h-5" />
            <span>{t('uploadPDF')}</span>
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-green-800 text-white px-4 py-2 rounded-lg hover:bg-green-900 transition flex items-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>{t('add')}</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Active Rate Chart</h2>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-green-50">
              <tr>
                <th className="px-4 py-3 text-left">FAT Range</th>
                <th className="px-4 py-3 text-left">SNF Range</th>
                <th className="px-4 py-3 text-right">Rate (₹/Liter)</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rateChart.map((entry) => (
                <tr key={entry.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {entry.fatFrom.toFixed(1)} - {entry.fatTo.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3">
                    {entry.snfFrom.toFixed(1)} - {entry.snfTo.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-green-900">
                    ₹{entry.rate.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-2xl font-bold text-green-900 mb-4">Add Rate Entry</h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    FAT From %
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.fatFrom}
                    onChange={(e) => setFormData({ ...formData, fatFrom: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    FAT To %
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.fatTo}
                    onChange={(e) => setFormData({ ...formData, fatTo: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    SNF From %
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.snfFrom}
                    onChange={(e) => setFormData({ ...formData, snfFrom: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    SNF To %
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.snfTo}
                    onChange={(e) => setFormData({ ...formData, snfTo: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rate (₹/Liter)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.rate}
                  onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={handleAdd}
                className="flex-1 bg-green-800 text-white py-2 rounded-lg hover:bg-green-900 transition"
              >
                {t('save')}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600 transition"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RateChart;
