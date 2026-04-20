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
    <div className="page-wrapper animate-fadeIn">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <h1 className="page-title" style={{ marginBottom: 0 }}>{t('farmerMaster')}</h1>
        <button
          onClick={handleAdd}
          className="btn-3d"
          style={{ padding: '10px 20px' }}
        >
          <Plus size={16} />
          Add Farmer
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
              placeholder="Search by Code or Name..."
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
                <th className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '13px' }}>Code</th>
                <th className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '13px' }}>Name</th>
                <th className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '13px' }}>Mobile</th>
                <th className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '13px' }}>Bank Name</th>
                <th className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '13px' }}>Bank A/C</th>
                <th className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '13px' }}>IFSC Code</th>
                <th className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '13px' }}>UPI ID</th>
                <th className="px-4 py-[9px] text-center" style={{ padding: '12px 16px', fontSize: '13px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredFarmers.map((farmer) => (
                <tr key={farmer.farmerCode} className="table-row" style={{ height: 'auto' }}>
                  <td className="px-4 py-[9px]" style={{ padding: '12px 16px', fontWeight: 'bold', color: 'white', fontSize: '14px' }}>{farmer.farmerCode}</td>
                  <td className="px-4 py-[9px]" style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.85)', fontSize: '14px' }}>{farmer.farmerName}</td>
                  <td className="px-4 py-[9px]" style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.85)', fontSize: '14px' }}>{farmer.mobileNo}</td>
                  <td className="px-4 py-[9px]" style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.85)', fontSize: '14px' }}>{farmer.bankName}</td>
                  <td className="px-4 py-[9px]" style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.85)', fontSize: '14px' }}>{farmer.bankAC}</td>
                  <td className="px-4 py-[9px]" style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.85)', fontSize: '14px' }}>{farmer.ifscCode}</td>
                  <td className="px-4 py-[9px]" style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.85)', fontSize: '14px' }}>{farmer.upiId}</td>
                  <td className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '14px' }}>
                    <div className="flex justify-center gap-2">
                      <button onClick={() => handleView(farmer)} className="btn-info" style={{ width: '28px', height: '28px', padding: 0 }} title="View"><Eye size={14} /></button>
                      <button onClick={() => handleEdit(farmer)} className="btn-success" style={{ width: '28px', height: '28px', padding: 0 }} title="Edit"><Edit2 size={14} /></button>
                      <button onClick={() => handleDelete(farmer.farmerCode)} className="btn-danger" style={{ width: '28px', height: '28px', padding: 0 }} title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredFarmers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-20 text-center">
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>No farmers found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: '12px', fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
          Showing {filteredFarmers.length} farmers
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-3d animate-fadeIn" style={{ maxWidth: 800, padding: '28px', width: '90%' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: 20, fontWeight: 'bold', color: 'white' }}>
                {isEditing ? 'Edit Farmer' : 'Add New Farmer'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ color: 'rgba(255,255,255,0.6)', cursor: 'pointer', background: 'none', border: 'none' }}>
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '16px' }}>
              <div>
                <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>Farmer Code *</label>
                <input
                  type="text"
                  value={formData.farmerCode}
                  onChange={(e) => setFormData({ ...formData, farmerCode: e.target.value })}
                  disabled={isEditing}
                  className="input-3d"
                  style={{ opacity: isEditing ? 0.6 : 1, padding: '10px 14px', fontSize: '14px' }}
                  placeholder="e.g. F001"
                />
              </div>

              <div>
                <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>Farmer Name *</label>
                <input
                  type="text"
                  value={formData.farmerName}
                  onChange={(e) => setFormData({ ...formData, farmerName: e.target.value })}
                  className="input-3d"
                  style={{ padding: '10px 14px', fontSize: '14px' }}
                  placeholder="Full Name"
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

              <div>
                <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>Aadhar No</label>
                <input
                  type="text"
                  value={formData.aadharNo}
                  onChange={(e) => setFormData({ ...formData, aadharNo: e.target.value })}
                  className="input-3d"
                  style={{ padding: '10px 14px', fontSize: '14px' }}
                  placeholder="1234 5678 9012"
                />
              </div>

              <div>
                <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>Mobile No</label>
                <input
                  type="text"
                  value={formData.mobileNo}
                  onChange={(e) => setFormData({ ...formData, mobileNo: e.target.value })}
                  className="input-3d"
                  style={{ padding: '10px 14px', fontSize: '14px' }}
                  placeholder="9876543210"
                />
              </div>

              <div className="md:col-span-2" style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <h3 style={{ color: '#4ade80', fontSize: 14, fontWeight: 800, marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>BANK DETAILS</h3>
                <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '16px' }}>
                  <div>
                    <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>Bank Name</label>
                    <input type="text" value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} className="input-3d" style={{ padding: '10px 14px', fontSize: '14px' }} placeholder="Bank Name" />
                  </div>
                  <div>
                    <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>Account Number</label>
                    <input type="text" value={formData.bankAC} onChange={(e) => setFormData({ ...formData, bankAC: e.target.value })} className="input-3d" style={{ padding: '10px 14px', fontSize: '14px' }} placeholder="A/C Number" />
                  </div>
                  <div>
                    <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>IFSC Code</label>
                    <input type="text" value={formData.ifscCode} onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value })} className="input-3d" style={{ padding: '10px 14px', fontSize: '14px' }} placeholder="IFSC" />
                  </div>
                  <div>
                    <label className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>UPI ID</label>
                    <input type="text" value={formData.upiId} onChange={(e) => setFormData({ ...formData, upiId: e.target.value })} className="input-3d" style={{ padding: '10px 14px', fontSize: '14px' }} placeholder="name@upi" />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowModal(false)} className="btn-secondary" style={{ flex: 1, padding: '12px', minHeight: '40px', fontSize: '14px', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleSave} className="btn-3d" style={{ flex: 2, padding: '12px', minHeight: '40px', fontSize: '14px', fontWeight: 600 }}>Save Farmer</button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && viewFarmer && (
        <div className="modal-overlay">
          <div className="modal-3d animate-fadeIn" style={{ padding: '28px', width: '90%', maxWidth: '600px' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px' }}>
              <h2 style={{ fontSize: 20, fontWeight: 'bold', color: 'white' }}>Farmer Details</h2>
              <button onClick={() => setShowViewModal(false)} style={{ color: 'rgba(255,255,255,0.6)', cursor: 'pointer', background: 'none', border: 'none' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="flex items-center gap-4 p-4 glass-card">
                <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg, #4ade80, #1a5c2e)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 'bold', color: '#0a1f0f' }}>
                  {viewFarmer.farmerCode}
                </div>
                <div>
                  <h3 style={{ fontSize: 20, fontWeight: 'bold', color: 'white' }}>{viewFarmer.farmerName}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.6)' }}>{viewFarmer.mobileNo}</p>
                </div>
              </div>

              <div className="grid grid-cols-2" style={{ gap: '16px' }}>
                <div>
                  <p className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>Aadhar Number</p>
                  <p style={{ color: 'white', fontWeight: '500', fontSize: '14px' }}>{viewFarmer.aadharNo || '—'}</p>
                </div>
                <div>
                  <p className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>UPI ID</p>
                  <p style={{ color: 'white', fontWeight: '500', fontSize: '14px' }}>{viewFarmer.upiId || '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>Address</p>
                  <p style={{ color: 'white', fontWeight: '500', fontSize: '14px' }}>{viewFarmer.address || '—'}</p>
                </div>
              </div>

              <div className="p-4 glass-card">
                <h4 style={{ color: '#4ade80', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '16px' }}>Bank Information</h4>
                <div className="grid grid-cols-2" style={{ gap: '16px' }}>
                  <div>
                    <p className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>Bank Name</p>
                    <p style={{ color: 'white', fontWeight: '500', fontSize: '14px' }}>{viewFarmer.bankName || '—'}</p>
                  </div>
                  <div>
                    <p className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>Account No</p>
                    <p style={{ color: 'white', fontWeight: '500', fontSize: '14px' }}>{viewFarmer.bankAC || '—'}</p>
                  </div>
                  <div>
                    <p className="label-text" style={{ marginBottom: '6px', fontSize: '12px' }}>IFSC Code</p>
                    <p style={{ color: 'white', fontWeight: '500', fontSize: '14px' }}>{viewFarmer.ifscCode || '—'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowViewModal(false)} className="btn-secondary" style={{ flex: 1, padding: '12px', minHeight: '40px', fontSize: '14px', fontWeight: 600 }}>Close</button>
              <button onClick={() => { setShowViewModal(false); handleEdit(viewFarmer); }} className="btn-3d" style={{ flex: 2, padding: '12px', minHeight: '40px', fontSize: '14px', fontWeight: 600 }}>Edit Farmer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FarmerMaster;
