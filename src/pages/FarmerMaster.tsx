import React, { useState, useEffect } from 'react';
import { ref, onValue, set, remove } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { Plus, Edit2, Trash2, Eye, X } from 'lucide-react';

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

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-green-900">{t('farmerMaster')}</h1>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 bg-green-700 text-white px-4 py-2 rounded-lg hover:bg-green-800"
        >
          <Plus size={20} />
          Add Farmer
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by Code or Name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-green-50">
              <tr>
                <th className="px-4 py-3 text-left">Code</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Mobile</th>
                <th className="px-4 py-3 text-left">Bank Name</th>
                <th className="px-4 py-3 text-left">Bank A/C</th>
                <th className="px-4 py-3 text-left">IFSC Code</th>
                <th className="px-4 py-3 text-left">UPI ID</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredFarmers.map((farmer) => (
                <tr key={farmer.farmerCode} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">{farmer.farmerCode}</td>
                  <td className="px-4 py-3">{farmer.farmerName}</td>
                  <td className="px-4 py-3">{farmer.mobileNo}</td>
                  <td className="px-4 py-3">{farmer.bankName}</td>
                  <td className="px-4 py-3">{farmer.bankAC}</td>
                  <td className="px-4 py-3">{farmer.ifscCode}</td>
                  <td className="px-4 py-3">{farmer.upiId}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleView(farmer)}
                        className="text-blue-600 hover:text-blue-800"
                        title="View"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        onClick={() => handleEdit(farmer)}
                        className="text-green-600 hover:text-green-800"
                        title="Edit"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(farmer.farmerCode)}
                        className="text-red-600 hover:text-red-800"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-green-900">
                  {isEditing ? 'Edit Farmer' : 'Add New Farmer'}
                </h2>
                <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">
                  <X size={24} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Farmer Code *
                  </label>
                  <input
                    type="text"
                    value={formData.farmerCode}
                    onChange={(e) => setFormData({ ...formData, farmerCode: e.target.value })}
                    disabled={isEditing}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none disabled:bg-gray-100"
                    placeholder="e.g. F001"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Farmer Name *
                  </label>
                  <input
                    type="text"
                    value={formData.farmerName}
                    onChange={(e) => setFormData({ ...formData, farmerName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="Full Name"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                    rows={2}
                    placeholder="Complete Address"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Aadhar No</label>
                  <input
                    type="text"
                    value={formData.aadharNo}
                    onChange={(e) => setFormData({ ...formData, aadharNo: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="1234 5678 9012"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Mobile No</label>
                  <input
                    type="text"
                    value={formData.mobileNo}
                    onChange={(e) => setFormData({ ...formData, mobileNo: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="9876543210"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Bank Name</label>
                  <input
                    type="text"
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="e.g. State Bank of India"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Bank A/C</label>
                  <input
                    type="text"
                    value={formData.bankAC}
                    onChange={(e) => setFormData({ ...formData, bankAC: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="Account Number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">IFSC Code</label>
                  <input
                    type="text"
                    value={formData.ifscCode}
                    onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value.toUpperCase() })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none uppercase"
                    placeholder="e.g. SBIN0001234"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Branch Address
                  </label>
                  <input
                    type="text"
                    value={formData.branchAddress}
                    onChange={(e) => setFormData({ ...formData, branchAddress: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="Bank Branch Address"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">UPI ID</label>
                  <input
                    type="text"
                    value={formData.upiId}
                    onChange={(e) => setFormData({ ...formData, upiId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="example@upi"
                  />
                </div>
              </div>

              <div className="flex gap-4 mt-6">
                <button
                  onClick={handleSave}
                  className="flex-1 bg-green-700 text-white px-6 py-3 rounded-lg hover:bg-green-800 font-semibold"
                >
                  {isEditing ? 'Update' : 'Save'}
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-gray-500 text-white px-6 py-3 rounded-lg hover:bg-gray-600 font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && viewFarmer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-green-900">Farmer Details</h2>
                <button onClick={() => setShowViewModal(false)} className="text-gray-500 hover:text-gray-700">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex border-b pb-2">
                  <div className="w-1/3 font-semibold text-gray-700">Farmer Code:</div>
                  <div className="w-2/3 text-gray-900">{viewFarmer.farmerCode}</div>
                </div>
                <div className="flex border-b pb-2">
                  <div className="w-1/3 font-semibold text-gray-700">Name:</div>
                  <div className="w-2/3 text-gray-900">{viewFarmer.farmerName}</div>
                </div>
                <div className="flex border-b pb-2">
                  <div className="w-1/3 font-semibold text-gray-700">Address:</div>
                  <div className="w-2/3 text-gray-900">{viewFarmer.address || '-'}</div>
                </div>
                <div className="flex border-b pb-2">
                  <div className="w-1/3 font-semibold text-gray-700">Aadhar No:</div>
                  <div className="w-2/3 text-gray-900">{viewFarmer.aadharNo || '-'}</div>
                </div>
                <div className="flex border-b pb-2">
                  <div className="w-1/3 font-semibold text-gray-700">Mobile No:</div>
                  <div className="w-2/3 text-gray-900">{viewFarmer.mobileNo || '-'}</div>
                </div>
                <div className="flex border-b pb-2">
                  <div className="w-1/3 font-semibold text-gray-700">Bank Name:</div>
                  <div className="w-2/3 text-gray-900">{viewFarmer.bankName || '-'}</div>
                </div>
                <div className="flex border-b pb-2">
                  <div className="w-1/3 font-semibold text-gray-700">Bank A/C:</div>
                  <div className="w-2/3 text-gray-900">{viewFarmer.bankAC || '-'}</div>
                </div>
                <div className="flex border-b pb-2">
                  <div className="w-1/3 font-semibold text-gray-700">IFSC Code:</div>
                  <div className="w-2/3 text-gray-900">{viewFarmer.ifscCode || '-'}</div>
                </div>
                <div className="flex border-b pb-2">
                  <div className="w-1/3 font-semibold text-gray-700">Branch Address:</div>
                  <div className="w-2/3 text-gray-900">{viewFarmer.branchAddress || '-'}</div>
                </div>
                <div className="flex border-b pb-2">
                  <div className="w-1/3 font-semibold text-gray-700">UPI ID:</div>
                  <div className="w-2/3 text-gray-900">{viewFarmer.upiId || '-'}</div>
                </div>
              </div>

              <div className="flex gap-4 mt-6">
                <button
                  onClick={handleEditFromView}
                  className="flex-1 bg-green-700 text-white px-6 py-3 rounded-lg hover:bg-green-800 font-semibold"
                >
                  Edit
                </button>
                <button
                  onClick={() => setShowViewModal(false)}
                  className="flex-1 bg-gray-500 text-white px-6 py-3 rounded-lg hover:bg-gray-600 font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FarmerMaster;
