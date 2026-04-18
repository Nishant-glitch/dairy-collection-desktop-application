import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, push, set, remove, get } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { Plus, FileText, BarChart2, X, Edit2, Trash2 } from 'lucide-react';
import { formatIndianCurrency } from '../utils/rateCalculator';

interface GrossEntry {
  id: string;
  date: string;
  item: string;
  category: string;
  pcs: number;
  rate: number;
  amount: number;
  timestamp: number;
}

const Deductions: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'newEntry' | 'grossReport' | 'deductionReport' | null>(null);
  
  // New Entry states
  const [step, setStep] = useState(1);
  const [selectedFarmerCode, setSelectedFarmerCode] = useState('');
  const [selectedFarmerName, setSelectedFarmerName] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [item, setItem] = useState('');
  const [category, setCategory] = useState('Cattle Feed');
  const [pcs, setPcs] = useState('');
  const [entryRate, setEntryRate] = useState('');
  const [isModifyingEntry, setIsModifyingEntry] = useState(false);
  const [entryIdToEdit, setEntryIdToEdit] = useState('');
  const [grossEntries, setGrossEntries] = useState<GrossEntry[]>([]);

  // Report states
  const [reportFarmerCode, setReportFarmerCode] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reportData, setReportData] = useState<any[]>([]);
  const [deductionMonth, setDeductionMonth] = useState(new Date().toISOString().substring(0, 7));
  const [deductionReportData, setDeductionReportData] = useState<any[]>([]);

  const [farmers, setFarmers] = useState<any>({});
  
  const itemRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadFarmers();
  }, []);

  useEffect(() => {
    if (selectedFarmerCode && activeSection === 'newEntry' && step === 2) {
      loadGrossEntries();
    }
  }, [selectedFarmerCode, activeSection, step]);

  const loadFarmers = () => {
    const farmersRef = ref(database, up('farmers'));
    onValue(farmersRef, (snapshot) => {
      if (snapshot.exists()) {
        setFarmers(snapshot.val());
      }
    });
  };

  const loadGrossEntries = () => {
    const grossRef = ref(database, up(`grossEntries/${selectedFarmerCode}`));
    onValue(grossRef, (snapshot) => {
      const entries: GrossEntry[] = [];
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.keys(data).forEach((key) => {
          entries.push({ id: key, ...data[key] });
        });
      }
      setGrossEntries(entries.sort((a, b) => b.timestamp - a.timestamp));
    });
  };

  const handleNewEntryClick = () => {
    setActiveSection('newEntry');
    setStep(1);
    setSelectedFarmerCode('');
    setSelectedFarmerName('');
    setEntryDate(new Date().toISOString().split('T')[0]);
    clearEntryForm();
  };

  const handleGrossReportClick = () => {
    setActiveSection('grossReport');
    setReportFarmerCode('');
    setFromDate('');
    setToDate('');
    setReportData([]);
  };

  const handleDeductionReportClick = () => {
    setActiveSection('deductionReport');
    setDeductionMonth(new Date().toISOString().substring(0, 7));
    setDeductionReportData([]);
  };

  const handleNextStep = () => {
    if (!selectedFarmerCode || !entryDate) {
      alert('Please enter Farmer Code and Date!');
      return;
    }

    const farmer = farmers[selectedFarmerCode];
    if (!farmer) {
      alert('Farmer not found!');
      return;
    }

    setSelectedFarmerName(farmer.farmerName);
    setStep(2);
    setTimeout(() => {
      itemRef.current?.focus();
    }, 100);
  };

  const clearEntryForm = () => {
    setItem('');
    setCategory('Cattle Feed');
    setPcs('');
    setEntryRate('');
    setIsModifyingEntry(false);
    setEntryIdToEdit('');
  };

  const handleSaveEntry = async () => {
    if (!item || !category || !pcs || !entryRate) {
      alert('All fields are required!');
      return;
    }

    const amount = parseFloat(pcs) * parseFloat(entryRate);
    const entryData = {
      date: entryDate,
      item,
      category,
      pcs: parseFloat(pcs),
      rate: parseFloat(entryRate),
      amount,
      timestamp: Date.now(),
    };

    if (isModifyingEntry && entryIdToEdit) {
      const entryRef = ref(database, up(`grossEntries/${selectedFarmerCode}/${entryIdToEdit}`));
      await set(entryRef, entryData);
    } else {
      const grossRef = ref(database, up(`grossEntries/${selectedFarmerCode}`));
      await push(grossRef, entryData);
    }

    clearEntryForm();
    itemRef.current?.focus();
  };

  const handleModifyEntry = (entry: GrossEntry) => {
    setItem(entry.item);
    setCategory(entry.category);
    setPcs(entry.pcs.toString());
    setEntryRate(entry.rate.toString());
    setIsModifyingEntry(true);
    setEntryIdToEdit(entry.id);
    itemRef.current?.focus();
  };

  const handleDeleteEntry = async (id: string) => {
    if (confirm('Are you sure you want to delete this entry?')) {
      const entryRef = ref(database, up(`grossEntries/${selectedFarmerCode}/${id}`));
      await remove(entryRef);
    }
  };

  const handleGenerateGrossReport = async () => {
    const grossEntriesRef = ref(database, up('grossEntries'));
    const snapshot = await get(grossEntriesRef);

    const reportEntries: any[] = [];

    if (snapshot.exists()) {
      const allEntries = snapshot.val();
      Object.keys(allEntries).forEach((farmerId) => {
        const farmerEntries = allEntries[farmerId];
        Object.keys(farmerEntries).forEach((entryId) => {
          const entry = farmerEntries[entryId];
          
          // Filter by farmer code if provided
          if (reportFarmerCode && farmerId !== reportFarmerCode) {
            return;
          }

          // Filter by date range
          if (fromDate && entry.date < fromDate) return;
          if (toDate && entry.date > toDate) return;

          reportEntries.push({
            farmerCode: farmerId,
            farmerName: farmers[farmerId]?.farmerName || 'Unknown',
            ...entry,
          });
        });
      });
    }

    reportEntries.sort((a, b) => a.farmerCode.localeCompare(b.farmerCode) || a.date.localeCompare(b.date));
    setReportData(reportEntries);
  };

  const handleGenerateDeductionReport = async () => {
    const grossEntriesRef = ref(database, up('grossEntries'));
    const snapshot = await get(grossEntriesRef);

    const farmerTotals: any = {};

    if (snapshot.exists()) {
      const allEntries = snapshot.val();
      Object.keys(allEntries).forEach((farmerId) => {
        const farmerEntries = allEntries[farmerId];
        let totalAmount = 0;
        let totalCount = 0;

        Object.values(farmerEntries).forEach((entry: any) => {
          if (entry.date.startsWith(deductionMonth)) {
            totalAmount += entry.amount || 0;
            totalCount++;
          }
        });

        if (totalCount > 0) {
          farmerTotals[farmerId] = {
            farmerCode: farmerId,
            farmerName: farmers[farmerId]?.farmerName || 'Unknown',
            totalEntries: totalCount,
            totalAmount,
          };
        }
      });
    }

    const reportArray = Object.values(farmerTotals).sort((a: any, b: any) =>
      a.farmerCode.localeCompare(b.farmerCode)
    );
    setDeductionReportData(reportArray);
  };

  const totalEntryAmount = grossEntries.reduce((sum, e) => sum + e.amount, 0);
  const entryAmount = pcs && entryRate ? parseFloat(pcs) * parseFloat(entryRate) : 0;

  if (activeSection === null) {
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold text-green-900 mb-8">Deductions</h1>

        <div className="grid grid-cols-3 gap-6">
          {/* Card 1 */}
          <div
            onClick={handleNewEntryClick}
            className="bg-gradient-to-br from-green-500 to-green-700 text-white rounded-xl shadow-lg p-8 cursor-pointer hover:shadow-2xl transform hover:scale-105 transition-all"
          >
            <div className="flex items-center justify-center mb-4">
              <Plus size={64} />
            </div>
            <h2 className="text-2xl font-bold text-center">New Entry</h2>
            <p className="text-center mt-2 opacity-90">Farmer Gross</p>
          </div>

          {/* Card 2 */}
          <div
            onClick={handleGrossReportClick}
            className="bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-xl shadow-lg p-8 cursor-pointer hover:shadow-2xl transform hover:scale-105 transition-all"
          >
            <div className="flex items-center justify-center mb-4">
              <FileText size={64} />
            </div>
            <h2 className="text-2xl font-bold text-center">Farmer Gross</h2>
            <p className="text-center mt-2 opacity-90">Report</p>
          </div>

          {/* Card 3 */}
          <div
            onClick={handleDeductionReportClick}
            className="bg-gradient-to-br from-orange-500 to-orange-700 text-white rounded-xl shadow-lg p-8 cursor-pointer hover:shadow-2xl transform hover:scale-105 transition-all"
          >
            <div className="flex items-center justify-center mb-4">
              <BarChart2 size={64} />
            </div>
            <h2 className="text-2xl font-bold text-center">Deduction</h2>
            <p className="text-center mt-2 opacity-90">Report</p>
          </div>
        </div>
      </div>
    );
  }

  if (activeSection === 'newEntry') {
    if (step === 1) {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
            <h2 className="text-2xl font-bold text-green-900 mb-6">New Gross Entry - Step 1</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Farmer Code</label>
                <input
                  type="text"
                  value={selectedFarmerCode}
                  onChange={(e) => setSelectedFarmerCode(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  placeholder="Enter Farmer Code"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={handleNextStep}
                className="flex-1 bg-green-700 text-white px-6 py-3 rounded-lg hover:bg-green-800 font-semibold"
              >
                Next
              </button>
              <button
                onClick={() => setActiveSection(null)}
                className="flex-1 bg-gray-500 text-white px-6 py-3 rounded-lg hover:bg-gray-600 font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-green-900">
                  Gross Entry — {selectedFarmerName} ({selectedFarmerCode}) — {entryDate}
                </h2>
                <button onClick={() => setActiveSection(null)} className="text-gray-500 hover:text-gray-700">
                  <X size={24} />
                </button>
              </div>

              {/* Entry Form */}
              <div className="bg-gray-50 p-4 rounded-lg mb-6">
                <div className="grid grid-cols-5 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Item Description</label>
                    <input
                      ref={itemRef}
                      type="text"
                      value={item}
                      onChange={(e) => setItem(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-green-500 outline-none"
                      placeholder="Item"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-green-500 outline-none"
                    >
                      <option value="Cattle Feed">Cattle Feed</option>
                      <option value="Money">Money</option>
                      <option value="Medicine">Medicine</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Pcs / Qty</label>
                    <input
                      type="number"
                      step="0.01"
                      value={pcs}
                      onChange={(e) => setPcs(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-green-500 outline-none"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Rate (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={entryRate}
                      onChange={(e) => setEntryRate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-green-500 outline-none"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                    <div className="px-3 py-2 bg-green-100 border border-green-300 rounded font-bold text-green-700">
                      ₹{entryAmount.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-4">
                  <button
                    onClick={handleSaveEntry}
                    className="bg-green-700 text-white px-6 py-2 rounded hover:bg-green-800 font-semibold"
                  >
                    {isModifyingEntry ? 'Update' : 'Save'}
                  </button>
                  <button
                    onClick={() => setActiveSection(null)}
                    className="bg-gray-500 text-white px-6 py-2 rounded hover:bg-gray-600 font-semibold"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Entries Display */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-3">All Entries for {selectedFarmerName}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-2 text-left text-sm">Date</th>
                        <th className="px-3 py-2 text-left text-sm">Item</th>
                        <th className="px-3 py-2 text-left text-sm">Category</th>
                        <th className="px-3 py-2 text-right text-sm">Pcs</th>
                        <th className="px-3 py-2 text-right text-sm">Rate</th>
                        <th className="px-3 py-2 text-right text-sm">Amount</th>
                        <th className="px-3 py-2 text-center text-sm">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grossEntries.map((entry) => (
                        <tr key={entry.id} className="border-b hover:bg-gray-50">
                          <td className="px-3 py-2 text-sm">{entry.date}</td>
                          <td className="px-3 py-2 text-sm">{entry.item}</td>
                          <td className="px-3 py-2 text-sm">{entry.category}</td>
                          <td className="px-3 py-2 text-right text-sm">{entry.pcs}</td>
                          <td className="px-3 py-2 text-right text-sm">₹{entry.rate.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-sm font-semibold">₹{entry.amount.toFixed(2)}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-2 justify-center">
                              <button
                                onClick={() => handleModifyEntry(entry)}
                                className="text-blue-600 hover:text-blue-800"
                                title="Modify"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteEntry(entry.id)}
                                className="text-red-600 hover:text-red-800"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-green-50 font-bold">
                      <tr>
                        <td colSpan={5} className="px-3 py-2 text-right">TOTAL:</td>
                        <td className="px-3 py-2 text-right text-green-700">₹{totalEntryAmount.toFixed(2)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
  }

  if (activeSection === 'grossReport') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-green-900">Farmer Gross Report</h2>
              <button onClick={() => setActiveSection(null)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Farmer Code (Optional)</label>
                  <input
                    type="text"
                    value={reportFarmerCode}
                    onChange={(e) => setReportFarmerCode(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="Leave empty for all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">From Date</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">To Date</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    onClick={handleGenerateGrossReport}
                    className="w-full bg-green-700 text-white px-6 py-2 rounded-lg hover:bg-green-800 font-semibold"
                  >
                    Generate Report
                  </button>
                </div>
              </div>
            </div>

            {reportData.length > 0 && (
              <>
                <div className="overflow-x-auto mb-4">
                  <table className="w-full">
                    <thead className="bg-green-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Farmer Code</th>
                        <th className="px-3 py-2 text-left">Farmer Name</th>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Item</th>
                        <th className="px-3 py-2 text-left">Category</th>
                        <th className="px-3 py-2 text-right">Pcs</th>
                        <th className="px-3 py-2 text-right">Rate</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.map((entry, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="px-3 py-2">{entry.farmerCode}</td>
                          <td className="px-3 py-2">{entry.farmerName}</td>
                          <td className="px-3 py-2">{entry.date}</td>
                          <td className="px-3 py-2">{entry.item}</td>
                          <td className="px-3 py-2">{entry.category}</td>
                          <td className="px-3 py-2 text-right">{entry.pcs}</td>
                          <td className="px-3 py-2 text-right">₹{entry.rate.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-semibold">₹{entry.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-green-100 font-bold">
                      <tr>
                        <td colSpan={7} className="px-3 py-2 text-right">GRAND TOTAL:</td>
                        <td className="px-3 py-2 text-right text-green-700">
                          {formatIndianCurrency(reportData.reduce((sum, e) => sum + e.amount, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <button
                  onClick={() => window.print()}
                  className="bg-blue-700 text-white px-6 py-2 rounded-lg hover:bg-blue-800 font-semibold"
                >
                  Print Report
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (activeSection === 'deductionReport') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-green-900">Deduction Report</h2>
              <button onClick={() => setActiveSection(null)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
                  <input
                    type="month"
                    value={deductionMonth}
                    onChange={(e) => setDeductionMonth(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>

                <button
                  onClick={handleGenerateDeductionReport}
                  className="bg-green-700 text-white px-6 py-2 rounded-lg hover:bg-green-800 font-semibold"
                >
                  Generate Report
                </button>

                <button
                  onClick={() => setActiveSection(null)}
                  className="bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 font-semibold"
                >
                  Back
                </button>
              </div>
            </div>

            {deductionReportData.length > 0 && (
              <>
                <div className="overflow-x-auto mb-4">
                  <table className="w-full">
                    <thead className="bg-orange-50">
                      <tr>
                        <th className="px-4 py-3 text-left">Farmer Code</th>
                        <th className="px-4 py-3 text-left">Farmer Name</th>
                        <th className="px-4 py-3 text-right">Total Entries</th>
                        <th className="px-4 py-3 text-right">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deductionReportData.map((entry: any, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3">{entry.farmerCode}</td>
                          <td className="px-4 py-3">{entry.farmerName}</td>
                          <td className="px-4 py-3 text-right">{entry.totalEntries}</td>
                          <td className="px-4 py-3 text-right font-semibold text-orange-700">
                            {formatIndianCurrency(entry.totalAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-orange-100 font-bold">
                      <tr>
                        <td colSpan={3} className="px-4 py-3 text-right">GRAND TOTAL:</td>
                        <td className="px-4 py-3 text-right text-orange-700">
                          {formatIndianCurrency(deductionReportData.reduce((sum: number, e: any) => sum + e.totalAmount, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <button
                  onClick={() => window.print()}
                  className="bg-blue-700 text-white px-6 py-2 rounded-lg hover:bg-blue-800 font-semibold"
                >
                  Print Report
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default Deductions;
