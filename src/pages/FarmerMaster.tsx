import React, { useState, useEffect } from 'react';
import { ref, onValue, set, remove } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { Plus, Edit2, Trash2, Eye, X, Search, UserPlus } from 'lucide-react';

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

  const handleEditFromView = () => {
    if (viewFarmer) {
      setShowViewModal(false);
      handleEdit(viewFarmer);
    }
  };

  const labelStyle: React.CSSProperties = { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' };

  return (
    <div className="p-6 animate-fadeIn">
      <div className="flex justify-between items-center mb-8">
        <h1 style={{ color: 'white', fontWeight: 800, fontSize: 28, textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>{t('farmerMaster')}</h1>
        <button
          onClick={handleAdd}
          className="btn-3d"
          style={{ padding: '10px 20px' }}
        >
          <Plus size={20} />
          Add Farmer
        </button>
      </div>

      <div className="glass-card" style={{ padding: 24 }}>
        <div className="mb-6 relative">
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }}>
            <Search size={18} />
          </div>
          <input
            type="text"
            placeholder="Search by Code or Name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-3d w-full"
            style={{ paddingLeft: 40 }}
          />
        </div>

        <div className="table-3d overflow-x-auto">
          <table className="w-full">
            <thead>
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
                <tr key={farmer.farmerCode}>
                  <td className="px-4 py-3 font-bold">{farmer.farmerCode}</td>
                  <td className="px-4 py-3">{farmer.farmerName}</td>
                  <td className="px-4 py-3">{farmer.mobileNo}</td>
                  <td className="px-4 py-3">{farmer.bankName}</td>
                  <td className="px-4 py-3">{farmer.bankAC}</td>
                  <td className="px-4 py-3">{farmer.ifscCode}</td>
                  <td className="px-4 py-3">{farmer.upiId}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => handleView(farmer)} className="p-2 rounded-lg hover:bg-white/10 text-blue-400 hover:text-blue-300 transition" title="View"><Eye size={18} /></button>
                      <button onClick={() => handleEdit(farmer)} className="p-2 rounded-lg hover:bg-white/10 text-green-400 hover:text-green-300 transition" title="Edit"><Edit2 size={18} /></button>
                      <button onClick={() => handleDelete(farmer.farmerCode)} className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 hover:text-red-500 transition" title="Delete"><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredFarmers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-20 text-center">
                    <p style={{ color: 'white/30', fontSize: 16 }}>No farmers found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="modal-3d animate-fadeIn" style={{ padding: 32, maxWidth: 800, width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex justify-between items-center mb-8">
              <h2 style={{ color: 'white', fontWeight: 800, fontSize: 22 }}>
                {isEditing ? 'Edit Farmer' : 'Add New Farmer'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition">
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label style={labelStyle}>Farmer Code *</label>
                <input
                  type="text"
                  value={formData.farmerCode}
                  onChange={(e) => setFormData({ ...formData, farmerCode: e.target.value })}
                  disabled={isEditing}
                  className="input-3d w-full"
                  style={{ opacity: isEditing ? 0.6 : 1 }}
                  placeholder="e.g. F001"
                />
              </div>

              <div>
                <label style={labelStyle}>Farmer Name *</label>
                <input
                  type="text"
                  value={formData.farmerName}
                  onChange={(e) => setFormData({ ...formData, farmerName: e.target.value })}
                  className="input-3d w-full"
                  placeholder="Full Name"
                />
              </div>

              <div className="md:col-span-2">
                <label style={labelStyle}>Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="input-3d w-full"
                  rows={2}
                  placeholder="Complete Address"
                />
              </div>

              <div>
                <label style={labelStyle}>Aadhar No</label>
                <input
                  type="text"
                  value={formData.aadharNo}
                  onChange={(e) => setFormData({ ...formData, aadharNo: e.target.value })}
                  className="input-3d w-full"
                  placeholder="1234 5678 9012"
                />
              </div>

              <div>
                <label style={labelStyle}>Mobile No</label>
                <input
                  type="text"
                  value={formData.mobileNo}
                  onChange={(e) => setFormData({ ...formData, mobileNo: e.target.value })}
                  className="input-3d w-full"
                  placeholder="9876543210"
                />
              </div>

              <div className="md:col-span-2 mt-4 p-4 glass-card" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <h3 style={{ color: '#4ade80', fontSize: 14, fontWeight: 800, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '1px' }}>Bank Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label style={labelStyle}>Bank Name</label>
                    <input type="text" value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} className="input-3d w-full" placeholder="Bank Name" />
                  </div>
                  <div>
                    <label style={labelStyle}>Account Number</label>
                    <input type="text" value={formData.bankAC} onChange={(e) => setFormData({ ...formData, bankAC: e.target.value })} className="input-3d w-full" placeholder="A/C Number" />
                  </div>
                  <div>
                    <label style={labelStyle}>IFSC Code</label>
                    <input type="text" value={formData.ifscCode} onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value })} className="input-3d w-full" placeholder="IFSC0001234" />
                  </div>
                  <div>
                    <label style={labelStyle}>UPI ID</label>
                    <input type="text" value={formData.upiId} onChange={(e) => setFormData({ ...formData, upiId: e.target.value })} className="input-3d w-full" placeholder="username@upi" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-10">
              <button onClick={() => setShowModal(false)} className="btn-3d flex-1" style={{ background: 'rgba(255,255,255,0.05)', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.1)' }}>Cancel</button>
              <button onClick={handleSave} className="btn-3d flex-1">Save Farmer</button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && viewFarmer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="modal-3d animate-fadeIn" style={{ padding: 32, maxWidth: 600, width: '90%' }}>
            <div className="flex justify-between items-center mb-8">
              <h2 style={{ color: 'white', fontWeight: 800, fontSize: 22 }}>Farmer Details</h2>
              <button onClick={() => setShowViewModal(false)} className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-6 p-6 glass-card" style={{ background: 'linear-gradient(135deg, rgba(74,222,128,0.1), transparent)' }}>
                <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg, #4ade80, #1a5c2e)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: 'white', boxShadow: '0 8px 24px rgba(74,222,128,0.3)' }}>
                  {viewFarmer.farmerName.charAt(0)}
                </div>
                <div>
                  <h3 style={{ color: 'white', fontSize: 24, fontWeight: 800 }}>{viewFarmer.farmerName}</h3>
                  <p style={{ color: '#4ade80', fontWeight: 700 }}>Code: {viewFarmer.farmerCode}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                <div>
                  <label style={labelStyle}>Mobile Number</label>
                  <p style={{ color: 'white', fontWeight: 600 }}>{viewFarmer.mobileNo || 'N/A'}</p>
                </div>
                <div>
                  <label style={labelStyle}>Aadhar Number</label>
                  <p style={{ color: 'white', fontWeight: 600 }}>{viewFarmer.aadharNo || 'N/A'}</p>
                </div>
                <div className="col-span-2">
                  <label style={labelStyle}>Address</label>
                  <p style={{ color: 'white', fontWeight: 600 }}>{viewFarmer.address || 'N/A'}</p>
                </div>
                <div className="col-span-2 p-4 glass-card" style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <h4 style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', marginBottom: 12 }}>Bank Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label style={labelStyle}>Bank</label>
                      <p style={{ color: 'white', fontWeight: 600 }}>{viewFarmer.bankName || 'N/A'}</p>
                    </div>
                    <div>
                      <label style={labelStyle}>A/C No</label>
                      <p style={{ color: 'white', fontWeight: 600 }}>{viewFarmer.bankAC || 'N/A'}</p>
                    </div>
                    <div>
                      <label style={labelStyle}>IFSC</label>
                      <p style={{ color: 'white', fontWeight: 600 }}>{viewFarmer.ifscCode || 'N/A'}</p>
                    </div>
                    <div>
                      <label style={labelStyle}>UPI</label>
                      <p style={{ color: '#4ade80', fontWeight: 700 }}>{viewFarmer.upiId || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-10">
              <button onClick={() => setShowViewModal(false)} className="btn-3d flex-1" style={{ background: 'rgba(255,255,255,0.05)', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.1)' }}>Close</button>
              <button onClick={handleEditFromView} className="btn-3d flex-1">Edit Farmer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FarmerMaster;
