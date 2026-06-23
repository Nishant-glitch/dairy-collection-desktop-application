import React, { useState, useEffect } from 'react';
import { ref, onValue, set, push, remove } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { Plus, Edit2, Trash2, X, Search, Snowflake } from 'lucide-react';

interface BMC {
  bmcId: string;
  name: string;
  code: string;
  address: string;
  createdAt?: number;
}

const emptyForm: BMC = { bmcId: '', name: '', code: '', address: '' };

const BMCMaster: React.FC = () => {
  const { t } = useLanguage();
  const [bmcs, setBmcs] = useState<BMC[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<BMC>(emptyForm);

  useEffect(() => {
    const unsubscribe = loadBMCs();
    return unsubscribe;
  }, []);

  const loadBMCs = () => {
    const bmcRef = ref(database, up('bmcMaster'));
    return onValue(bmcRef, (snapshot) => {
      const list: BMC[] = [];
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.keys(data).forEach((id) => {
          list.push({ bmcId: id, ...data[id] });
        });
      }
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setBmcs(list);
    });
  };

  const filteredBMCs = !searchTerm
    ? bmcs
    : bmcs.filter(
        (b) =>
          (b.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (b.code || '').toLowerCase().includes(searchTerm.toLowerCase())
      );

  const handleAdd = () => {
    setIsEditing(false);
    setFormData(emptyForm);
    setShowModal(true);
  };

  const handleEdit = (bmc: BMC) => {
    setIsEditing(true);
    setFormData(bmc);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('BMC Name is required!');
      return;
    }

    if (isEditing && formData.bmcId) {
      const bmcRef = ref(database, up(`bmcMaster/${formData.bmcId}`));
      await set(bmcRef, {
        name: formData.name.trim(),
        code: formData.code.trim(),
        address: formData.address.trim(),
        createdAt: formData.createdAt || Date.now(),
      });
    } else {
      const newRef = push(ref(database, up('bmcMaster')));
      await set(newRef, {
        name: formData.name.trim(),
        code: formData.code.trim(),
        address: formData.address.trim(),
        createdAt: Date.now(),
      });
    }

    setShowModal(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this BMC?')) {
      const bmcRef = ref(database, up(`bmcMaster/${id}`));
      await remove(bmcRef);
    }
  };

  return (
    <div className="page-wrapper animate-fadeIn">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <h1 className="page-title flex items-center gap-2" style={{ marginBottom: 0 }}>
          <Snowflake size={22} className="text-sky-400" />
          {t('bmcMaster')}
        </h1>
        <button onClick={handleAdd} className="btn-3d" style={{ padding: '10px 20px' }}>
          <Plus size={16} />
          Add BMC
        </button>
      </div>

      <div className="glass-card" style={{ padding: '20px 24px', marginBottom: '20px' }}>
        <div className="flex justify-between items-center gap-4" style={{ marginBottom: '16px' }}>
          <div className="relative flex-1" style={{ maxWidth: '400px' }}>
            <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.6)' }}>
              <Search size={16} />
            </div>
            <input
              type="text"
              placeholder="Search by Name or Code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-3d"
              style={{ paddingLeft: 40, height: '36px', fontSize: '14px' }}
            />
          </div>
        </div>

        <div className="table-container overflow-x-auto" style={{ padding: 0 }}>
          <table className="w-full table-3d">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '13px' }}>Name</th>
                <th className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '13px' }}>Code</th>
                <th className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '13px' }}>Address</th>
                <th className="px-4 py-[9px] text-center" style={{ padding: '12px 16px', fontSize: '13px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBMCs.map((bmc) => (
                <tr key={bmc.bmcId} className="table-row" style={{ height: 'auto' }}>
                  <td className="px-4 py-[9px]" style={{ padding: '12px 16px', fontWeight: 'bold', color: 'white', fontSize: '14px' }}>{bmc.name}</td>
                  <td className="px-4 py-[9px]" style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.85)', fontSize: '14px' }}>{bmc.code || '—'}</td>
                  <td className="px-4 py-[9px]" style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.85)', fontSize: '14px' }}>{bmc.address || '—'}</td>
                  <td className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '14px' }}>
                    <div className="flex justify-center gap-2">
                      <button onClick={() => handleEdit(bmc)} className="btn-success" style={{ width: '28px', height: '28px', padding: 0 }} title="Edit"><Edit2 size={14} /></button>
                      <button onClick={() => handleDelete(bmc.bmcId)} className="btn-danger" style={{ width: '28px', height: '28px', padding: 0 }} title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredBMCs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-20 text-center">
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>No BMCs found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: '12px', fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
          Showing {filteredBMCs.length} BMCs
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-3d animate-fadeIn" style={{ maxWidth: 560, padding: '28px', width: '90%' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: 20, fontWeight: 'bold', color: 'white' }}>
                {isEditing ? 'Edit BMC' : 'Add New BMC'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ color: 'rgba(255,255,255,0.6)', cursor: 'pointer', background: 'none', border: 'none' }}>
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '16px' }}>
              <div>
                <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>BMC Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input-3d"
                  style={{ padding: '10px 14px', fontSize: '14px' }}
                  placeholder="e.g. Central Chilling Center"
                />
              </div>

              <div>
                <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>Code</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="input-3d"
                  style={{ padding: '10px 14px', fontSize: '14px' }}
                  placeholder="e.g. BMC01"
                />
              </div>

              <div className="md:col-span-2">
                <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="input-3d"
                  style={{ padding: '10px 14px', fontSize: '14px' }}
                  rows={2}
                  placeholder="Complete Address"
                />
              </div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowModal(false)} className="btn-secondary" style={{ flex: 1, padding: '12px', minHeight: '40px', fontSize: '14px', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleSave} className="btn-3d" style={{ flex: 2, padding: '12px', minHeight: '40px', fontSize: '14px', fontWeight: 600 }}>Save BMC</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BMCMaster;
