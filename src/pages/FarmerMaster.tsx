import React, { useState, useEffect, useRef } from 'react';
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
  const [importing, setImporting] = useState(false);
  const farmerImportRef = useRef<HTMLInputElement>(null);
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

  const handleFarmerImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImporting(true);
    
    try {
      const XLSX = await import('xlsx');
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: '',
            raw: false,
          }) as any[][];

          const farmersToImport: any[] = [];

          for (let i = 0; i < json.length; i++) {
            const row = json[i];
            const codeRaw = String(row[0] || '').trim();
            const name = String(row[5] || '').trim();
            const address = String(row[9] || '').trim();

            if (!codeRaw || !name) continue;

            // Parse code as integer
            const codeNum = parseInt(parseFloat(codeRaw).toString());
            if (isNaN(codeNum) || codeNum <= 0) continue;
            if (name.toLowerCase().includes('member') || 
                name.toLowerCase().includes('total')) continue;

            farmersToImport.push({
              code: String(codeNum),
              farmerName: name,
              address: address,
            });
          }

          if (farmersToImport.length === 0) {
            alert('No farmers found in file!');
            setImporting(false);
            return;
          }

          // Confirm before import
          const confirm_import = window.confirm(
            `Found ${farmersToImport.length} farmers.\nImport all to Firebase?\n\nNote: Existing farmers with same code will be updated.`
          );
          
          if (!confirm_import) {
            setImporting(false);
            return;
          }

          // Save all farmers to Firebase
          let saved = 0;
          let failed = 0;

          for (const farmer of farmersToImport) {
            try {
              await set(ref(database, up(`farmers/${farmer.code}`)), {
                farmerName: farmer.farmerName,
                address: farmer.address,
                aadharNo: '',
                bankName: '',
                bankAC: '',
                ifscCode: '',
                branchAddress: '',
                mobileNo: '',
                upiId: '',
              });
              saved++;
            } catch (err) {
              failed++;
              console.error(`Failed to save farmer ${farmer.code}:`, err);
            }
          }

          alert(`✅ Import complete!\n${saved} farmers imported successfully.${failed > 0 ? `\n${failed} failed.` : ''}`);
          
        } catch (err: any) {
          console.error('Parse error:', err);
          alert('Error reading file: ' + err.message);
        } finally {
          setImporting(false);
          e.target.value = '';
        }
      };

      reader.onerror = () => {
        alert('Failed to read file!');
        setImporting(false);
      };

      reader.readAsArrayBuffer(file);

    } catch (err: any) {
      alert('Import error: ' + err.message);
      setImporting(false);
    }
  };

  return (
    <div className="page-wrapper animate-fadeIn">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <h1 className="page-title" style={{ marginBottom: 0 }}>{t('farmerMaster')}</h1>
        <div className="flex items-center">
          <button
            onClick={() => farmerImportRef.current?.click()}
            style={{
              background: 'rgba(56,189,248,0.15)',
              border: '1px solid rgba(56,189,248,0.3)',
              borderRadius: 10, padding: '9px 18px',
              color: '#38bdf8', fontWeight: 600,
              fontSize: 13, cursor: 'pointer',
              marginRight: 8,
              display: 'flex', alignItems: 'center', gap: 8
            }}
          >
            📂 Import Excel
          </button>
          <input
            ref={farmerImportRef}
            type="file"
            accept=".xls,.xlsx"
            style={{ display: 'none' }}
            onChange={handleFarmerImport}
          />
          <button
            onClick={handleAdd}
            className="btn-3d"
            style={{ padding: '10px 20px' }}
          >
            <Plus size={16} />
            Add Farmer
          </button>
        </div>
      </div>

      {importing && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 16
        }}>
          <div style={{
            background: '#1e293b', borderRadius: 16,
            padding: '32px 40px', textAlign: 'center',
            border: '1px solid rgba(148,163,184,0.2)'
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
            <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 700 }}>
              Importing farmers...
            </div>
            <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 8 }}>
              Please wait, do not close the page
            </div>
          </div>
        </div>
      )}

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

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textTransform: 'uppercase' }}>Farmer Code</p>
                  <p style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>{viewFarmer.farmerCode}</p>
                </div>
                <div>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textTransform: 'uppercase' }}>Farmer Name</p>
                  <p style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>{viewFarmer.farmerName}</p>
                </div>
              </div>

              <div>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textTransform: 'uppercase' }}>Address</p>
                <p style={{ color: 'white', fontSize: 14 }}>{viewFarmer.address || 'N/A'}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textTransform: 'uppercase' }}>Aadhar No</p>
                  <p style={{ color: 'white', fontSize: 14 }}>{viewFarmer.aadharNo || 'N/A'}</p>
                </div>
                <div>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textTransform: 'uppercase' }}>Mobile No</p>
                  <p style={{ color: 'white', fontSize: 14 }}>{viewFarmer.mobileNo || 'N/A'}</p>
                </div>
              </div>

              <div style={{ paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <h3 style={{ color: '#4ade80', fontSize: 13, fontWeight: 800, marginBottom: '12px' }}>BANK INFORMATION</h3>
                <div className="grid grid-cols-2 gap-y-4 gap-x-4">
                  <div>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>BANK NAME</p>
                    <p style={{ color: 'white', fontSize: 14 }}>{viewFarmer.bankName || 'N/A'}</p>
                  </div>
                  <div>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>ACCOUNT NO</p>
                    <p style={{ color: 'white', fontSize: 14 }}>{viewFarmer.bankAC || 'N/A'}</p>
                  </div>
                  <div>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>IFSC CODE</p>
                    <p style={{ color: 'white', fontSize: 14 }}>{viewFarmer.ifscCode || 'N/A'}</p>
                  </div>
                  <div>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>UPI ID</p>
                    <p style={{ color: 'white', fontSize: 14 }}>{viewFarmer.upiId || 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '24px' }}>
              <button onClick={() => setShowViewModal(false)} className="btn-secondary w-full" style={{ padding: '12px' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FarmerMaster;
