import React, { useState, useEffect } from 'react';
import { ref, onValue, set, remove } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { Plus, Edit2, Trash2, Eye, X, Search } from 'lucide-react';

interface Farmer {
  farmerCode: string;
  farmerName: string;
  address: string;
  aadharNo: string;
  bankName: string;
  bankAC: string;
  ifscCode: string;
  branchAddress: string;
  mobileNo: string;
  upiId: string;
}

const FarmerMaster: React.FC = () => {
  const { t } = useLanguage();
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [filteredFarmers, setFilteredFarmers] = useState<Farmer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewFarmer, setViewFarmer] = useState<Farmer | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Farmer>({
    farmerCode: '',
    farmerName: '',
    address: '',
    aadharNo: '',
    bankName: '',
    bankAC: '',
    ifscCode: '',
    branchAddress: '',
    mobileNo: '',
    upiId: '',
  });

  useEffect(() => {
    loadFarmers();
  }, []);

  useEffect(() => {
    filterFarmers();
  }, [searchTerm, farmers]);

  const loadFarmers = () => {
    const farmersRef = ref(database, up('farmers'));
    onValue(farmersRef, (snapshot) => {
      const farmerArray: Farmer[] = [];
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.keys(data).forEach((code) => {
          farmerArray.push({ farmerCode: code, ...data[code] });
        });
      }
      setFarmers(farmerArray);
    });
  };

  const filterFarmers = () => {
    if (!searchTerm) {
      setFilteredFarmers(farmers);
      return;
    }
    const filtered = farmers.filter(
      (f) =>
        f.farmerCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.farmerName.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredFarmers(filtered);
  };

  const handleAdd = () => {
    setIsEditing(false);
    setFormData({
      farmerCode: '',
      farmerName: '',
      address: '',
      aadharNo: '',
      bankName: '',
      bankAC: '',
      ifscCode: '',
      branchAddress: '',
      mobileNo: '',
      upiId: '',
    });
    setShowModal(true);
  };

  const handleEdit = (farmer: Farmer) => {
    setIsEditing(true);
    setFormData(farmer);
    setShowModal(true);
  };

  const handleView = (farmer: Farmer) => {
    setViewFarmer(farmer);
    setShowViewModal(true);
  };

  const handleSave = async () => {
    if (!formData.farmerCode || !formData.farmerName) {
      alert('Farmer Code and Name are required!');
      return;
    }

    const farmerRef = ref(database, up(`farmers/${formData.farmerCode}`));
    await set(farmerRef, {
      farmerName: formData.farmerName,
      address: formData.address,
      aadharNo: formData.aadharNo,
      bankName: formData.bankName,
      bankAC: formData.bankAC,
      ifscCode: formData.ifscCode,
      branchAddress: formData.branchAddress,
      mobileNo: formData.mobileNo,
      upiId: formData.upiId,
    });

    setShowModal(false);
  };

  const handleDelete = async (code: string) => {
    if (confirm('Are you sure you want to delete this farmer?')) {
      const farmerRef = ref(database, up(`farmers/${code}`));
      await remove(farmerRef);
    }
  };

  return (
    <div className="p-6 animate-fadeUp">
      <div className="flex justify-between items-center mb-8">
        <h1 className="page-title">{t('farmerMaster')}</h1>
        <button
          onClick={handleAdd}
          className="btn-primary"
        >
          <Plus size={20} />
          Add Farmer
        </button>
      </div>

      <div className="glass-card" style={{ padding: 24 }}>
        <div className="mb-6 relative">
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
            <Search size={18} />
          </div>
          <input
            type="text"
            placeholder="Search by Code or Name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field"
            style={{ paddingLeft: 40 }}
          />
        </div>

        <div className="table-container overflow-x-auto">
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Mobile</th>
                <th className="px-4 py-3">Bank Name</th>
                <th className="px-4 py-3">Bank A/C</th>
                <th className="px-4 py-3">IFSC Code</th>
                <th className="px-4 py-3">UPI ID</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredFarmers.map((farmer) => (
                <tr key={farmer.farmerCode} className="table-row">
                  <td className="px-4 py-3 font-bold text-white">{farmer.farmerCode}</td>
                  <td className="px-4 py-3 text-slate-300">{farmer.farmerName}</td>
                  <td className="px-4 py-3 text-slate-300">{farmer.mobileNo}</td>
                  <td className="px-4 py-3 text-slate-300">{farmer.bankName}</td>
                  <td className="px-4 py-3 text-slate-300">{farmer.bankAC}</td>
                  <td className="px-4 py-3 text-slate-300">{farmer.ifscCode}</td>
                  <td className="px-4 py-3 text-slate-300">{farmer.upiId}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => handleView(farmer)} className="btn-info" style={{ padding: 6 }} title="View"><Eye size={16} /></button>
                      <button onClick={() => handleEdit(farmer)} className="btn-success" style={{ padding: 6 }} title="Edit"><Edit2 size={16} /></button>
                      <button onClick={() => handleDelete(farmer.farmerCode)} className="btn-danger" style={{ padding: 6 }} title="Delete"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredFarmers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-20 text-center">
                    <p style={{ color: '#64748b', fontSize: 16 }}>No farmers found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-box animate-fadeUp" style={{ maxWidth: 800 }}>
            <div className="flex justify-between items-center mb-8 border-b border-slate-700 pb-4">
              <h2 className="text-xl font-bold text-white">
                {isEditing ? 'Edit Farmer' : 'Add New Farmer'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition">
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="label-text">Farmer Code *</label>
                <input
                  type="text"
                  value={formData.farmerCode}
                  onChange={(e) => setFormData({ ...formData, farmerCode: e.target.value })}
                  disabled={isEditing}
                  className="input-field"
                  style={{ opacity: isEditing ? 0.6 : 1 }}
                  placeholder="e.g. F001"
                />
              </div>

              <div>
                <label className="label-text">Farmer Name *</label>
                <input
                  type="text"
                  value={formData.farmerName}
                  onChange={(e) => setFormData({ ...formData, farmerName: e.target.value })}
                  className="input-field"
                  placeholder="Full Name"
                />
              </div>

              <div className="md:col-span-2">
                <label className="label-text">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="input-field"
                  rows={2}
                  placeholder="Complete Address"
                />
              </div>

              <div>
                <label className="label-text">Aadhar No</label>
                <input
                  type="text"
                  value={formData.aadharNo}
                  onChange={(e) => setFormData({ ...formData, aadharNo: e.target.value })}
                  className="input-field"
                  placeholder="1234 5678 9012"
                />
              </div>

              <div>
                <label className="label-text">Mobile No</label>
                <input
                  type="text"
                  value={formData.mobileNo}
                  onChange={(e) => setFormData({ ...formData, mobileNo: e.target.value })}
                  className="input-field"
                  placeholder="9876543210"
                />
              </div>

              <div className="md:col-span-2 mt-4 p-4 glass-card" style={{ background: 'rgba(148,163,184,0.05)' }}>
                <h3 style={{ color: '#f59e0b', fontSize: 14, fontWeight: 800, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '1px' }}>Bank Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="label-text">Bank Name</label>
                    <input type="text" value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} className="input-field" placeholder="Bank Name" />
                  </div>
                  <div>
                    <label className="label-text">Account Number</label>
                    <input type="text" value={formData.bankAC} onChange={(e) => setFormData({ ...formData, bankAC: e.target.value })} className="input-field" placeholder="A/C Number" />
                  </div>
                  <div>
                    <label className="label-text">IFSC Code</label>
                    <input type="text" value={formData.ifscCode} onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value })} className="input-field" placeholder="IFSC" />
                  </div>
                  <div>
                    <label className="label-text">UPI ID</label>
                    <input type="text" value={formData.upiId} onChange={(e) => setFormData({ ...formData, upiId: e.target.value })} className="input-field" placeholder="example@upi" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-10">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} className="btn-primary flex-1">Save Farmer</button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && viewFarmer && (
        <div className="modal-overlay">
          <div className="modal-box animate-fadeUp">
            <div className="flex justify-between items-center mb-8 border-b border-slate-700 pb-4">
              <h2 className="text-xl font-bold text-white">Farmer Details</h2>
              <button onClick={() => setShowViewModal(false)} className="text-slate-400 hover:text-white transition">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-4 p-4 glass-card" style={{ background: 'rgba(245,158,11,0.1)' }}>
                <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center text-2xl font-black text-amber-500">
                  {viewFarmer.farmerCode}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{viewFarmer.farmerName}</h3>
                  <p className="text-slate-400">{viewFarmer.mobileNo}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="label-text">Aadhar Number</p>
                  <p className="text-white font-medium">{viewFarmer.aadharNo || '—'}</p>
                </div>
                <div>
                  <p className="label-text">UPI ID</p>
                  <p className="text-white font-medium">{viewFarmer.upiId || '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="label-text">Address</p>
                  <p className="text-white font-medium">{viewFarmer.address || '—'}</p>
                </div>
              </div>

              <div className="p-4 glass-card" style={{ background: 'rgba(148,163,184,0.05)' }}>
                <h4 className="text-amber-500 text-xs font-bold uppercase mb-4">Bank Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="label-text">Bank Name</p>
                    <p className="text-white font-medium">{viewFarmer.bankName || '—'}</p>
                  </div>
                  <div>
                    <p className="label-text">Account No</p>
                    <p className="text-white font-medium">{viewFarmer.bankAC || '—'}</p>
                  </div>
                  <div>
                    <p className="label-text">IFSC Code</p>
                    <p className="text-white font-medium">{viewFarmer.ifscCode || '—'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button onClick={() => setShowViewModal(false)} className="btn-secondary flex-1">Close</button>
              <button onClick={() => { setShowViewModal(false); handleEdit(viewFarmer); }} className="btn-primary flex-1">Edit Farmer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FarmerMaster;
