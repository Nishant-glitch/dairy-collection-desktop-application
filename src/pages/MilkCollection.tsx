import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, set, get, remove } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { calculateFormulaRate, formatIndianCurrency } from '../utils/rateCalculator';
import { sendCollectionSMS } from '../services/sms';
import { X, Edit2, Trash2 } from 'lucide-react';

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

  const [todayEntries, setTodayEntries] = useState<Entry[]>([]);
  const [rateFormula, setRateFormula] = useState<any>(null);
  const [dcsInfo, setDcsInfo] = useState<any>({});
  const [farmers, setFarmers] = useState<any>({});

  const farmerCodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadRateFormula();
    loadDCSInfo();
    loadFarmers();
  }, []);

  useEffect(() => {
    if (!showSessionSetup) {
      loadTodayEntries();
    }
  }, [showSessionSetup, sessionDate, sessionShift]);

  useEffect(() => {
    if (qty && fat && snfClr && rateFormula) {
      const calculatedRate = calculateFormulaRate(parseFloat(fat), parseFloat(snfClr), rateFormula);
      setRate(calculatedRate);
      setAmount(calculatedRate * parseFloat(qty));
    } else {
      setRate(0);
      setAmount(0);
    }
  }, [qty, fat, snfClr, rateFormula]);

  const loadRateFormula = async () => {
    const snap = await get(ref(database, up('rateFormula')));
    if (snap.exists()) setRateFormula(snap.val());
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

  const handleStartSession = () => {
    setShowSessionSetup(false);
    setTimeout(() => {
      farmerCodeRef.current?.focus();
    }, 100);
  };

  const handleCloseSession = () => {
    setShowSessionSetup(true);
    clearForm();
  };

  const handleFarmerCodeEnter = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && farmerCode) {
      const farmer = farmers[farmerCode];
      if (!farmer) {
        alert('Farmer not found!');
        return;
      }

      // Check if entry already exists
      const existingEntry = todayEntries.find((entry) => entry.farmerCode === farmerCode);
      
      if (existingEntry) {
        setWarningMessage(`Entry already exists for ${farmer.farmerName}. Use Modify or Delete from table.`);
        setFarmerName(farmer.farmerName);
        setQty(existingEntry.qty.toString());
        setFat(existingEntry.fat.toString());
        if (sessionMode === 'SNF') {
          setSnfClr(existingEntry.snf?.toString() || '');
        } else {
          setSnfClr(existingEntry.clr?.toString() || '');
        }
        setIsModifying(true);
      } else {
        setWarningMessage('');
        setFarmerName(farmer.farmerName);
        setIsModifying(false);
        document.getElementById('qty-input')?.focus();
      }
    }
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

    // Print if enabled
    if (printEnabled) {
      printSlip();
    }

    // Send SMS if enabled
    if (smsEnabled && farmers[farmerCode]?.mobileNo) {
      const snfValue = sessionMode === 'SNF' ? parseFloat(snfClr) : parseFloat(snfClr);
      await sendCollectionSMS(
        farmerName,
        farmerCode,
        farmers[farmerCode].mobileNo,
        sessionDate,
        sessionShift,
        parseFloat(qty),
        parseFloat(fat),
        snfValue,
        rate,
        amount,
        dcsInfo.name || 'DCS'
      );
    }

    clearForm();
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
    if (sessionMode === 'SNF') {
      setSnfClr(entry.snf?.toString() || '');
    } else {
      setSnfClr(entry.clr?.toString() || '');
    }
    setIsModifying(true);
    setWarningMessage('');
    farmerCodeRef.current?.focus();
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Shift</label>
              <select
                value={sessionShift}
                onChange={(e) => setSessionShift(e.target.value as 'Morning' | 'Evening')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
              >
                <option value="Morning">Morning</option>
                <option value="Evening">Evening</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Mode</label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="SNF"
                    checked={sessionMode === 'SNF'}
                    onChange={() => setSessionMode('SNF')}
                    className="mr-2"
                  />
                  SNF
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="CLR"
                    checked={sessionMode === 'CLR'}
                    onChange={() => setSessionMode('CLR')}
                    className="mr-2"
                  />
                  CLR
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Print Receipt</label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={printEnabled}
                    onChange={() => setPrintEnabled(true)}
                    className="mr-2"
                  />
                  Yes
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={!printEnabled}
                    onChange={() => setPrintEnabled(false)}
                    className="mr-2"
                  />
                  No
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Send SMS</label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={smsEnabled}
                    onChange={() => setSmsEnabled(true)}
                    className="mr-2"
                  />
                  Yes
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={!smsEnabled}
                    onChange={() => setSmsEnabled(false)}
                    className="mr-2"
                  />
                  No
                </label>
              </div>
            </div>
          </div>

          <button
            onClick={handleStartSession}
            className="w-full mt-6 bg-green-700 text-white px-6 py-3 rounded-lg hover:bg-green-800 font-bold text-lg"
          >
            Start Collection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-hidden">
      {/* Top Bar */}
      <div className="bg-green-800 text-white px-6 py-4 flex justify-between items-center">
        <div className="flex gap-8 text-lg">
          <span><strong>Date:</strong> {sessionDate}</span>
          <span><strong>Shift:</strong> {sessionShift}</span>
          <span><strong>Mode:</strong> {sessionMode}</span>
        </div>
        <button
          onClick={handleCloseSession}
          className="flex items-center gap-2 bg-red-600 px-4 py-2 rounded hover:bg-red-700"
        >
          <X size={20} />
          Close Session
        </button>
      </div>

      <div className="flex h-[calc(100vh-72px)]">
        {/* LEFT PANEL - Entry Form */}
        <div className="w-1/3 border-r p-6 overflow-y-auto">
          <h2 className="text-2xl font-bold text-green-900 mb-6">Entry Form</h2>

          {warningMessage && (
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded mb-4">
              {warningMessage}
            </div>
          )}

          {farmerName && !warningMessage && (
            <div className="bg-green-100 border border-green-400 text-green-800 px-4 py-3 rounded mb-4 font-semibold">
              {farmerName}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Farmer Code</label>
              <input
                ref={farmerCodeRef}
                type="text"
                value={farmerCode}
                onChange={(e) => setFarmerCode(e.target.value)}
                onKeyDown={handleFarmerCodeEnter}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-lg"
                placeholder="Enter code and press ENTER"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Quantity (Liters)</label>
              <input
                id="qty-input"
                type="number"
                step="0.01"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-lg"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">FAT %</label>
              <input
                type="number"
                step="0.01"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-lg"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{sessionMode} %</label>
              <input
                type="number"
                step="0.01"
                value={snfClr}
                onChange={(e) => setSnfClr(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-lg"
                placeholder="0.00"
              />
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex justify-between mb-2">
                <span className="font-medium">Rate (₹/Liter):</span>
                <span className="text-xl font-bold text-blue-700">₹{rate.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Amount:</span>
                <span className="text-2xl font-bold text-green-700">{formatIndianCurrency(amount)}</span>
              </div>
            </div>

            <button
              onClick={handleSaveOrUpdate}
              disabled={!farmerCode || !qty || !fat || !snfClr}
              className="w-full bg-green-700 text-white px-6 py-4 rounded-lg hover:bg-green-800 font-bold text-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isModifying ? 'Update Entry' : 'Save Entry'}
            </button>
          </div>
        </div>

        {/* RIGHT PANEL - Entries Table */}
        <div className="flex-1 p-6 overflow-y-auto">
          <h2 className="text-2xl font-bold text-green-900 mb-6">Today's Entries</h2>

          <div className="overflow-x-auto mb-6">
            <table className="w-full">
              <thead className="bg-green-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-right">Qty (L)</th>
                  <th className="px-3 py-2 text-right">FAT%</th>
                  <th className="px-3 py-2 text-right">{sessionMode}%</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {todayEntries.map((entry) => (
                  <tr key={entry.farmerCode} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2">{entry.farmerCode}</td>
                    <td className="px-3 py-2">{entry.farmerName}</td>
                    <td className="px-3 py-2 text-right">{entry.qty.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{entry.fat.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{(entry.snf || entry.clr || 0).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">₹{entry.rate.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-semibold">₹{entry.amount.toFixed(2)}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => handleModify(entry)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Modify"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(entry.farmerCode)}
                          className="text-red-600 hover:text-red-800"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary Card */}
          <div className="bg-green-100 border-2 border-green-600 rounded-lg p-6">
            <h3 className="text-xl font-bold text-green-900 mb-4">Shift Summary</h3>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-600">Total Qty</div>
                <div className="text-2xl font-bold text-green-700">{totalQty.toFixed(2)} L</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Total Amount</div>
                <div className="text-2xl font-bold text-green-700">{formatIndianCurrency(totalAmount)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Avg FAT</div>
                <div className="text-2xl font-bold text-green-700">{avgFat.toFixed(2)}%</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Avg {sessionMode}</div>
                <div className="text-2xl font-bold text-green-700">{avgSnfClr.toFixed(2)}%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MilkCollection;
