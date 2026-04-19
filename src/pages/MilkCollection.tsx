import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, set, get, remove } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { formatIndianCurrency } from '../utils/rateCalculator';
import { sendCollectionSMS } from '../services/sms';
import { X, Edit2, Trash2, CheckCircle } from 'lucide-react';
import { getRateFromMap } from './RateChart';

interface Entry {
  farmerCode: string;
  farmerName: string;
  qty: number;
  fat: number;
  snf?: number;
  clr?: number;
  rate: number;
  amount: number;
  timestamp: number;
}

const MilkCollection: React.FC = () => {
  const { } = useLanguage();
  const [showSessionSetup, setShowSessionSetup] = useState(true);
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [sessionShift, setSessionShift] = useState<'Morning' | 'Evening'>('Morning');
  const [sessionMode, setSessionMode] = useState<'SNF' | 'CLR'>('SNF');
  const [printEnabled, setPrintEnabled] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);
  
  const [farmerCode, setFarmerCode] = useState('');
  const [farmerName, setFarmerName] = useState('');
  const [qty, setQty] = useState('');
  const [fat, setFat] = useState('');
  const [snfClr, setSnfClr] = useState('');
  const [rate, setRate] = useState(0);
  const [amount, setAmount] = useState(0);
  const [isModifying, setIsModifying] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [showSavedMessage, setShowSavedMessage] = useState(false);

  const [todayEntries, setTodayEntries] = useState<Entry[]>([]);
  const [activeRateConfig, setActiveRateConfig] = useState<any>(null);
  const [dcsInfo, setDcsInfo] = useState<any>({});
  const [farmers, setFarmers] = useState<any>({});

  const farmerCodeRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const fatRef = useRef<HTMLInputElement>(null);
  const snfClrRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDCSInfo();
    loadFarmers();
  }, []);

  useEffect(() => {
    if (!showSessionSetup) {
      loadTodayEntries();
    }
  }, [showSessionSetup, sessionDate, sessionShift]);

  useEffect(() => {
    if (qty && fat && snfClr && activeRateConfig) {
      const calculatedRate = getRateFromMap(parseFloat(fat), parseFloat(snfClr), activeRateConfig);
      setRate(calculatedRate);
      setAmount(calculatedRate * parseFloat(qty));
    } else {
      setRate(0);
      setAmount(0);
    }
  }, [qty, fat, snfClr, activeRateConfig]);

  const getConfigForDate = async (collectionDate: string) => {
    const snap = await get(ref(database, up('rateConfig/history')));
    if (!snap.exists()) return null;
    const configs = Object.values(snap.val()) as any[];
    configs.sort((a, b) =>
      new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
    );
    return configs.find(c => c.effectiveFrom <= collectionDate) || configs[configs.length - 1];
  };

  const loadDCSInfo = async () => {
    const dcsRef = ref(database, up('dcsInfo'));
    const snapshot = await get(dcsRef);
    if (snapshot.exists()) {
      setDcsInfo(snapshot.val());
    }
  };

  const loadFarmers = () => {
    const farmersRef = ref(database, up('farmers'));
    onValue(farmersRef, (snapshot) => {
      if (snapshot.exists()) {
        setFarmers(snapshot.val());
      }
    });
  };

  const loadTodayEntries = () => {
    const entriesRef = ref(database, up(`milkCollection/${sessionDate}/${sessionShift}`));
    onValue(entriesRef, (snapshot) => {
      const entries: Entry[] = [];
      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.keys(data).forEach((code) => {
          entries.push({ farmerCode: code, ...data[code] });
        });
      }
      setTodayEntries(entries);
    });
  };

  const handleStartSession = async () => {
    const config = await getConfigForDate(sessionDate);
    if (!config) {
      alert('No rate chart found for this date. Please import a rate chart first.');
      return;
    }
    setActiveRateConfig(config);
    setShowSessionSetup(false);
    setTimeout(() => {
      farmerCodeRef.current?.focus();
    }, 100);
  };

  const handleSaveOrUpdate = async () => {
    if (!farmerCode || !qty || !fat || !snfClr) {
      alert('All fields are required!');
      return;
    }

    const entryData: any = {
      farmerName,
      qty: parseFloat(qty),
      fat: parseFloat(fat),
      rate,
      amount,
      timestamp: Date.now(),
    };

    if (sessionMode === 'SNF') {
      entryData.snf = parseFloat(snfClr);
    } else {
      entryData.clr = parseFloat(snfClr);
    }

    const entryRef = ref(database, up(`milkCollection/${sessionDate}/${sessionShift}/${farmerCode}`));
    await set(entryRef, entryData);

    if (printEnabled) {
      printSlip();
    }

    if (smsEnabled && farmers[farmerCode]?.mobileNo) {
      await sendCollectionSMS(
        farmerName,
        farmerCode,
        farmers[farmerCode].mobileNo,
        sessionDate,
        sessionShift,
        parseFloat(qty),
        parseFloat(fat),
        parseFloat(snfClr),
        rate,
        amount,
        dcsInfo.name || 'DCS'
      );
    }

    clearForm();
    setShowSavedMessage(true);
    setTimeout(() => setShowSavedMessage(false), 1500);
    farmerCodeRef.current?.focus();
  };

  const printSlip = () => {
    const printContent = `
      <div id="milk-print-slip" style="padding: 20px; font-family: Arial;">
        <h2 style="text-align: center;">${dcsInfo.name || 'DCS Pro'}</h2>
        <h3 style="text-align: center;">Milk Collection Receipt</h3>
        <hr/>
        <p><strong>Date:</strong> ${sessionDate} | <strong>Shift:</strong> ${sessionShift}</p>
        <p><strong>Farmer Code:</strong> ${farmerCode}</p>
        <p><strong>Farmer Name:</strong> ${farmerName}</p>
        <hr/>
        <p><strong>Quantity:</strong> ${qty} Liters</p>
        <p><strong>FAT:</strong> ${fat}%</p>
        <p><strong>${sessionMode}:</strong> ${snfClr}%</p>
        <p><strong>Rate:</strong> ₹${rate.toFixed(2)}/Liter</p>
        <p style="font-size: 18px;"><strong>Amount:</strong> ₹${amount.toFixed(2)}</p>
        <hr/>
        <p style="text-align: center; font-size: 12px;">Thank you!</p>
      </div>
    `;
    
    const printWindow = window.open('', '', 'width=400,height=600');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
      printWindow.close();
    }
  };

  const clearForm = () => {
    setFarmerCode('');
    setFarmerName('');
    setQty('');
    setFat('');
    setSnfClr('');
    setRate(0);
    setAmount(0);
    setIsModifying(false);
    setWarningMessage('');
  };

  const handleModify = (entry: Entry) => {
    setFarmerCode(entry.farmerCode);
    setFarmerName(entry.farmerName);
    setQty(entry.qty.toString());
    setFat(entry.fat.toString());
    setSnfClr((entry.snf || entry.clr || '').toString());
    setIsModifying(true);
    setWarningMessage('');
    qtyRef.current?.focus();
  };

  const handleDelete = async (code: string) => {
    if (confirm('Are you sure you want to delete this entry?')) {
      const entryRef = ref(database, up(`milkCollection/${sessionDate}/${sessionShift}/${code}`));
      await remove(entryRef);
    }
  };

  const totalQty = todayEntries.reduce((sum, e) => sum + e.qty, 0);
  const totalAmount = todayEntries.reduce((sum, e) => sum + e.amount, 0);
  const avgFat = todayEntries.length > 0 ? todayEntries.reduce((sum, e) => sum + e.fat, 0) / todayEntries.length : 0;
  const avgSnfClr = todayEntries.length > 0 
    ? todayEntries.reduce((sum, e) => sum + (e.snf || e.clr || 0), 0) / todayEntries.length 
    : 0;

  if (showSessionSetup) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
          <h2 className="text-2xl font-bold text-green-900 mb-6 text-center">Start Collection Session</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Shift</label>
              <div className="flex gap-4">
                <button
                  onClick={() => setSessionShift('Morning')}
                  className={`flex-1 py-2 rounded-lg font-semibold border-2 transition ${
                    sessionShift === 'Morning' ? 'bg-green-100 border-green-600 text-green-800' : 'border-gray-200 text-gray-600'
                  }`}
                >
                  Morning
                </button>
                <button
                  onClick={() => setSessionShift('Evening')}
                  className={`flex-1 py-2 rounded-lg font-semibold border-2 transition ${
                    sessionShift === 'Evening' ? 'bg-green-100 border-green-600 text-green-800' : 'border-gray-200 text-gray-600'
                  }`}
                >
                  Evening
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Mode</label>
              <div className="flex gap-4">
                <button
                  onClick={() => setSessionMode('SNF')}
                  className={`flex-1 py-2 rounded-lg font-semibold border-2 transition ${
                    sessionMode === 'SNF' ? 'bg-green-100 border-green-600 text-green-800' : 'border-gray-200 text-gray-600'
                  }`}
                >
                  SNF
                </button>
                <button
                  onClick={() => setSessionMode('CLR')}
                  className={`flex-1 py-2 rounded-lg font-semibold border-2 transition ${
                    sessionMode === 'CLR' ? 'bg-green-100 border-green-600 text-green-800' : 'border-gray-200 text-gray-600'
                  }`}
                >
                  CLR
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Print Receipt</span>
              <button
                onClick={() => setPrintEnabled(!printEnabled)}
                className={`w-12 h-6 rounded-full transition relative ${printEnabled ? 'bg-green-600' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${printEnabled ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Send SMS</span>
              <button
                onClick={() => setSmsEnabled(!smsEnabled)}
                className={`w-12 h-6 rounded-full transition relative ${smsEnabled ? 'bg-green-600' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${smsEnabled ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setShowSessionSetup(false)}
                className="flex-1 bg-white border border-gray-300 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleStartSession}
                className="flex-1 bg-green-700 text-white font-bold py-3 rounded-xl hover:bg-green-800 transition shadow-lg"
              >
                Start Collection
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-green-900">Milk Collection</h1>
          <p className="text-gray-600">{sessionDate} | {sessionShift} Shift | {sessionMode} Mode</p>
        </div>
        <button
          onClick={() => setShowSessionSetup(true)}
          className="bg-green-100 text-green-800 px-4 py-2 rounded-lg font-semibold hover:bg-green-200 transition"
        >
          Change Session
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Collection Form */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl shadow-lg p-6 border-t-4 border-green-600 relative">
            {showSavedMessage && (
              <div className="absolute top-4 right-4 flex items-center gap-1 text-green-600 font-bold animate-bounce">
                <CheckCircle size={20} />
                <span>Saved!</span>
              </div>
            )}
            <h2 className="text-xl font-bold text-gray-800 mb-6">{isModifying ? 'Modify Entry' : 'New Collection'}</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Farmer Code</label>
                <input
                  ref={farmerCodeRef}
                  type="text"
                  value={farmerCode}
                  onChange={(e) => setFarmerCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && farmerCode) {
                      const farmer = farmers[farmerCode];
                      if (!farmer) {
                        alert('Farmer not found!');
                        return;
                      }
                      setFarmerName(farmer.farmerName);
                      const existing = todayEntries.find(e => e.farmerCode === farmerCode);
                      if (existing) {
                        setWarningMessage('Entry already exists! Modifying existing entry.');
                        setQty(existing.qty.toString());
                        setFat(existing.fat.toString());
                        setSnfClr((existing.snf || existing.clr || '').toString());
                        setIsModifying(true);
                      } else {
                        setWarningMessage('');
                        setIsModifying(false);
                      }
                      qtyRef.current?.focus();
                    }
                  }}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none font-bold text-lg"
                  placeholder="Enter code & press Enter"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Farmer Name</label>
                <input
                  type="text"
                  value={farmerName}
                  readOnly
                  className="w-full px-4 py-2 bg-gray-50 border rounded-lg outline-none text-gray-600 font-medium"
                />
                {warningMessage && <p className="text-xs text-orange-600 mt-1 font-semibold">{warningMessage}</p>}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Qty (Ltr)</label>
                  <input
                    ref={qtyRef}
                    type="number"
                    step="0.1"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        fatRef.current?.focus();
                      }
                    }}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">FAT %</label>
                  <input
                    ref={fatRef}
                    type="number"
                    step="0.1"
                    value={fat}
                    onChange={(e) => setFat(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        snfClrRef.current?.focus();
                      }
                    }}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{sessionMode} %</label>
                  <input
                    ref={snfClrRef}
                    type="number"
                    step="0.1"
                    value={snfClr}
                    onChange={(e) => setSnfClr(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveOrUpdate();
                      }
                    }}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none font-bold"
                  />
                </div>
              </div>

              <div className="bg-green-50 p-4 rounded-xl border border-green-100 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-green-700 font-medium uppercase">Rate / Ltr</p>
                  <p className="text-2xl font-bold text-green-900">₹{rate.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-green-700 font-medium uppercase">Total Amount</p>
                  <p className="text-2xl font-bold text-green-900">₹{amount.toFixed(2)}</p>
                </div>
              </div>

              <div className="flex gap-3">
                {isModifying && (
                  <button
                    onClick={clearForm}
                    className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-200 transition"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleSaveOrUpdate}
                  className="flex-[2] bg-green-700 text-white font-bold py-3 rounded-xl hover:bg-green-800 transition shadow-lg flex items-center justify-center gap-2"
                >
                  {isModifying ? 'Update Entry' : 'Save Entry'}
                </button>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-md border-l-4 border-blue-500">
              <p className="text-xs text-gray-500 font-bold uppercase">Total Qty</p>
              <p className="text-xl font-bold text-gray-800">{totalQty.toFixed(1)} L</p>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-md border-l-4 border-green-500">
              <p className="text-xs text-gray-500 font-bold uppercase">Total Amt</p>
              <p className="text-xl font-bold text-gray-800">₹{totalAmount.toFixed(0)}</p>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-md border-l-4 border-orange-500">
              <p className="text-xs text-gray-500 font-bold uppercase">Avg FAT</p>
              <p className="text-xl font-bold text-gray-800">{avgFat.toFixed(1)}%</p>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-md border-l-4 border-purple-500">
              <p className="text-xs text-gray-500 font-bold uppercase">Avg {sessionMode}</p>
              <p className="text-xl font-bold text-gray-800">{avgSnfClr.toFixed(1)}%</p>
            </div>
          </div>
        </div>

        {/* Entries Table */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
              <h2 className="font-bold text-gray-800">Today's Collections ({todayEntries.length})</h2>
              <div className="text-sm font-medium text-gray-500">
                Sorted by latest first
              </div>
            </div>
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="p-4 border-b text-sm font-bold text-gray-600">Farmer</th>
                    <th className="p-4 border-b text-sm font-bold text-gray-600 text-center">Qty</th>
                    <th className="p-4 border-b text-sm font-bold text-gray-600 text-center">FAT/SNF</th>
                    <th className="p-4 border-b text-sm font-bold text-gray-600 text-center">Rate</th>
                    <th className="p-4 border-b text-sm font-bold text-gray-600 text-right">Amount</th>
                    <th className="p-4 border-b text-sm font-bold text-gray-600 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {todayEntries.sort((a, b) => b.timestamp - a.timestamp).map((entry) => (
                    <tr key={entry.farmerCode} className="hover:bg-green-50 transition">
                      <td className="p-4">
                        <p className="font-bold text-gray-800">{entry.farmerCode}</p>
                        <p className="text-xs text-gray-500">{entry.farmerName}</p>
                      </td>
                      <td className="p-4 text-center font-semibold text-blue-700">{entry.qty.toFixed(1)}</td>
                      <td className="p-4 text-center">
                        <span className="text-gray-700">{entry.fat.toFixed(1)}</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-gray-700">{(entry.snf || entry.clr || 0).toFixed(1)}</span>
                      </td>
                      <td className="p-4 text-center font-medium text-gray-600">₹{entry.rate.toFixed(2)}</td>
                      <td className="p-4 text-right font-bold text-green-700">₹{entry.amount.toFixed(2)}</td>
                      <td className="p-4">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => handleModify(entry)}
                            className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition"
                            title="Modify"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => handleDelete(entry.farmerCode)}
                            className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition"
                            title="Delete"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {todayEntries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-gray-500 italic">
                        No entries for this shift yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MilkCollection;
