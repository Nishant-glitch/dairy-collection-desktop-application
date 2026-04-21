import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, set, get, remove } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { formatIndianCurrency } from '../utils/rateCalculator';
import { sendCollectionSMS } from '../services/sms';
import { X, Edit2, Trash2, CheckCircle, Droplet, Clock, Calendar, Zap, Printer, MessageSquare } from 'lucide-react';
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

interface MilkCollectionProps {
  onNavigate: (page: string) => void;
}

const MilkCollection: React.FC<MilkCollectionProps> = ({ onNavigate }) => {
  const { t } = useLanguage();
  const [showSessionSetup, setShowSessionSetup] = useState(true);
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [sessionShift, setSessionShift] = useState<'Morning' | 'Evening'>('Morning');
  const [sessionMode, setSessionMode] = useState<'SNF' | 'CLR'>('SNF');
  const [printEnabled, setPrintEnabled] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);
  
  const [farmerCode, setFarmerCode] = useState('');
  const [farmerName, setFarmerName] = useState('');
  const [farmerFound, setFarmerFound] = useState(false);
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
  const fetchTimerRef = useRef<any>(null);

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
    const snap = await get(ref(database, 'globalRateConfig/history'));
    if (!snap.exists()) return null;
    const configs = Object.values(snap.val()) as any[];
    configs.sort((a, b) =>
      new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
    );
    return configs.find(c => c.effectiveFrom <= collectionDate)
      || configs[configs.length - 1];
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
      alert('No rate chart found for this date. Please contact admin to upload a rate chart.');
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

    if (!farmerFound) {
      alert('Farmer not found! Please enter a valid farmer code.');
      farmerCodeRef.current?.focus();
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
    setFarmerFound(false);
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
    setFarmerFound(true);
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

  const handleFarmerCodeChange = (code: string) => {
    setFarmerCode(code);
    if (code.length >= 1) {
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
      fetchTimerRef.current = setTimeout(async () => {
        const snap = await get(ref(database, up(`farmers/${code}`)));
        if (snap.exists()) {
          setFarmerName(snap.val().farmerName || snap.val().name);
          setFarmerFound(true);
          setWarningMessage(todayEntries.find(ent => ent.farmerCode === code) ? 'Already entered today' : '');
        } else {
          setFarmerName('');
          setFarmerFound(false);
          setWarningMessage('');
        }
      }, 300);
    } else {
      setFarmerName('');
      setFarmerFound(false);
      setWarningMessage('');
    }
  };

  const handleFarmerCodeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (farmerFound) {
        qtyRef.current?.focus();
      } else if (farmerCode.length > 0) {
        alert('Farmer not found!');
        farmerCodeRef.current?.focus();
      }
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
      <div className="modal-overlay">
        <div className="modal-3d animate-fadeIn" style={{ padding: '28px', maxWidth: '420px', width: '90%' }}>
          <h2 className="modal-title" style={{ color: 'white', fontWeight: 800, fontSize: 18, marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Start Collection Session</h2>
          
          <div className="space-y-4">
            <div style={{ marginBottom: '16px' }}>
              <label className="label-text" style={{ marginBottom: '6px' }}>Date</label>
              <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className="input-3d" style={{ padding: '10px 14px', fontSize: '14px' }} />
            </div>

            <div className="grid grid-cols-2 gap-4" style={{ marginBottom: '16px' }}>
              <div>
                <label className="label-text" style={{ marginBottom: '8px' }}>Shift</label>
                <div className="flex gap-2" style={{ gap: '8px' }}>
                  <button onClick={() => setSessionShift('Morning')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${sessionShift === 'Morning' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-white/5 text-white/60 hover:bg-white/10'}`} style={{ padding: '8px 16px', fontSize: '13px' }}>Morning</button>
                  <button onClick={() => setSessionShift('Evening')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${sessionShift === 'Evening' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-white/5 text-white/60 hover:bg-white/10'}`} style={{ padding: '8px 16px', fontSize: '13px' }}>Evening</button>
                </div>
              </div>
              <div>
                <label className="label-text" style={{ marginBottom: '8px' }}>Mode</label>
                <div className="flex gap-2" style={{ gap: '8px' }}>
                  <button onClick={() => setSessionMode('SNF')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${sessionMode === 'SNF' ? 'bg-green-500 text-white shadow-lg shadow-green-500/30' : 'bg-white/5 text-white/60 hover:bg-white/10'}`} style={{ padding: '8px 16px', fontSize: '13px' }}>SNF</button>
                  <button onClick={() => setSessionMode('CLR')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${sessionMode === 'CLR' ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30' : 'bg-white/5 text-white/60 hover:bg-white/10'}`} style={{ padding: '8px 16px', fontSize: '13px' }}>CLR</button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6" style={{ marginTop: '4px', marginBottom: '20px', gap: '20px' }}>
              <label className="flex items-center gap-2 cursor-pointer group" style={{ fontSize: '14px' }}>
                <input type="checkbox" checked={printEnabled} onChange={(e) => setPrintEnabled(e.target.checked)} className="w-4 h-4 rounded border-white/10 bg-white/5 text-blue-500 focus:ring-blue-500/30" />
                <span className="text-white/70 group-hover:text-white transition-colors">Print Slips</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group" style={{ fontSize: '14px' }}>
                <input type="checkbox" checked={smsEnabled} onChange={(e) => setSmsEnabled(e.target.checked)} className="w-4 h-4 rounded border-white/10 bg-white/5 text-blue-500 focus:ring-blue-500/30" />
                <span className="text-white/70 group-hover:text-white transition-colors">Send SMS</span>
              </label>
            </div>

            <div className="flex gap-3" style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
              <button onClick={() => onNavigate('dashboard')} className="btn-secondary" style={{ flex: 1, padding: '12px', minHeight: '40px', fontSize: '14px', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleStartSession} className="btn-3d" style={{ flex: 2, padding: '12px', minHeight: '40px', fontSize: '14px', fontWeight: 600 }}>Start Collection</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrapper animate-fadeIn" style={{ padding: '20px' }}>
      <div className="flex flex-col lg:flex-row" style={{ gap: '20px' }}>
        {/* Left Panel: Entry Form */}
        <div className="w-full lg:w-1/3">
          <div className="glass-card" style={{ padding: '20px 24px' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: '20px' }}>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Droplet className="text-blue-400" size={20} />
                New Entry
              </h2>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                <div className={`w-2 h-2 rounded-full ${sessionShift === 'Morning' ? 'bg-blue-400' : 'bg-orange-400'}`} />
                <span className="text-xs font-bold text-white/70">{sessionShift}</span>
              </div>
            </div>

            <div className="space-y-0">
              <div className="relative" style={{ marginBottom: '16px' }}>
                <label className="label-text" style={{ marginBottom: '8px', fontSize: '12px' }}>Farmer Code</label>
                <input
                  ref={farmerCodeRef}
                  type="text"
                  value={farmerCode}
                  onChange={(e) => handleFarmerCodeChange(e.target.value)}
                  onKeyDown={handleFarmerCodeKeyDown}
                  className={`input-3d ${warningMessage ? 'border-orange-500/50' : ''}`}
                  style={{ padding: '11px 14px' }}
                  placeholder="Enter Code"
                  autoFocus
                />
                {warningMessage && (
                  <p className="absolute -bottom-5 left-0 text-[10px] text-orange-400 font-medium">{warningMessage}</p>
                )}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label className="label-text" style={{ marginBottom: '8px', fontSize: '12px' }}>Farmer Name</label>
                <input
                  type="text"
                  value={farmerName}
                  readOnly
                  className="input-3d bg-white/5 text-white/50"
                  style={{ padding: '11px 14px' }}
                  placeholder="Farmer Name"
                />
              </div>

              <div className="grid grid-cols-2" style={{ gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label className="label-text" style={{ marginBottom: '8px', fontSize: '12px' }}>Quantity (L)</label>
                  <input
                    ref={qtyRef}
                    type="number"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fatRef.current?.focus()}
                    className="input-3d"
                    style={{ padding: '11px 14px' }}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="label-text" style={{ marginBottom: '8px', fontSize: '12px' }}>FAT %</label>
                  <input
                    ref={fatRef}
                    type="number"
                    value={fat}
                    onChange={(e) => setFat(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && snfClrRef.current?.focus()}
                    className="input-3d"
                    style={{ padding: '11px 14px' }}
                    placeholder="0.0"
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label className="label-text" style={{ marginBottom: '8px', fontSize: '12px' }}>{sessionMode} %</label>
                <input
                  ref={snfClrRef}
                  type="number"
                  value={snfClr}
                  onChange={(e) => setSnfClr(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveOrUpdate()}
                  className="input-3d"
                  style={{ padding: '11px 14px' }}
                  placeholder="0.0"
                />
              </div>

              <div className="rounded-xl bg-white/5 border border-white/10">
                <div className="flex justify-between items-center" style={{ padding: '10px 14px', marginBottom: '8px' }}>
                  <span className="text-white/50 text-sm">Rate per Liter</span>
                  <span className="text-white font-bold">₹{rate.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center border-t border-white/5" style={{ padding: '10px 14px', marginBottom: '20px' }}>
                  <span className="text-white/50 text-sm">Total Amount</span>
                  <span className="text-2xl font-black text-green-400">{formatIndianCurrency(amount)}</span>
                </div>
              </div>

              <div className="flex" style={{ gap: '12px', paddingTop: '8px' }}>
                <button onClick={clearForm} className="btn-secondary" style={{ flex: 1, padding: '12px' }}>Clear</button>
                <button
                  onClick={handleSaveOrUpdate}
                  className={`btn-3d relative overflow-hidden ${showSavedMessage ? 'bg-green-500' : ''}`}
                  style={{ flex: 2, padding: '12px' }}
                >
                  {showSavedMessage ? (
                    <span className="flex items-center justify-center gap-2">
                      <CheckCircle size={18} /> Saved
                    </span>
                  ) : (
                    isModifying ? 'Update Entry' : 'Save Entry'
                  )}
                </button>
              </div>
            </div>

            {/* Session Summary section */}
            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 className="font-bold text-white/40 uppercase tracking-wider" style={{ marginBottom: '14px', fontSize: '13px' }}>Session Summary</h3>
              <div className="grid grid-cols-2" style={{ gap: '12px' }}>
                <div className="rounded-xl bg-white/5 border border-white/10" style={{ padding: '14px 16px', borderRadius: '10px' }}>
                  <p className="text-white/40 uppercase" style={{ fontSize: '11px', marginBottom: '4px' }}>Total Qty</p>
                  <p className="text-white" style={{ fontSize: '22px', fontWeight: 700 }}>{totalQty.toFixed(2)} <span className="text-xs font-normal text-white/40">L</span></p>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10" style={{ padding: '14px 16px', borderRadius: '10px' }}>
                  <p className="text-white/40 uppercase" style={{ fontSize: '11px', marginBottom: '4px' }}>Total Amount</p>
                  <p className="text-green-400" style={{ fontSize: '22px', fontWeight: 700 }}>₹{totalAmount.toFixed(0)}</p>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10" style={{ padding: '14px 16px', borderRadius: '10px' }}>
                  <p className="text-white/40 uppercase" style={{ fontSize: '11px', marginBottom: '4px' }}>Avg FAT</p>
                  <p className="text-blue-400" style={{ fontSize: '22px', fontWeight: 700 }}>{avgFat.toFixed(2)}%</p>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10" style={{ padding: '14px 16px', borderRadius: '10px' }}>
                  <p className="text-white/40 uppercase" style={{ fontSize: '11px', marginBottom: '4px' }}>Avg {sessionMode}</p>
                  <p className="text-purple-400" style={{ fontSize: '22px', fontWeight: 700 }}>{avgSnfClr.toFixed(2)}%</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Entries List */}
        <div className="w-full lg:w-2/3">
          <div className="glass-card h-full flex flex-col" style={{ padding: '20px 24px' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: '4px' }}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <Clock size={20} />
                </div>
                <div>
                  <h2 className="font-bold text-white" style={{ fontSize: '20px' }}>Recent Entries</h2>
                </div>
              </div>
              <button
                onClick={() => setShowSessionSetup(true)}
                className="p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 transition-colors"
                title="Change Session"
              >
                <Calendar size={20} />
              </button>
            </div>
            <p className="text-white/40" style={{ marginBottom: '16px', fontSize: '12px' }}>{sessionDate} | {sessionShift} Shift</p>

            <div className="flex-1 overflow-auto">
              <table className="w-full table-3d">
                <thead className="table-header sticky top-0 z-10">
                  <tr>
                    <th className="text-left" style={{ padding: '11px 14px', fontSize: '12px', fontWeight: 700 }}>Farmer</th>
                    <th className="text-right" style={{ padding: '11px 14px', fontSize: '12px', fontWeight: 700 }}>Qty</th>
                    <th className="text-right" style={{ padding: '11px 14px', fontSize: '12px', fontWeight: 700 }}>FAT</th>
                    <th className="text-right" style={{ padding: '11px 14px', fontSize: '12px', fontWeight: 700 }}>{sessionMode}</th>
                    <th className="text-right" style={{ padding: '11px 14px', fontSize: '12px', fontWeight: 700 }}>Rate</th>
                    <th className="text-right" style={{ padding: '11px 14px', fontSize: '12px', fontWeight: 700 }}>Amount</th>
                    <th className="text-center" style={{ padding: '11px 14px', fontSize: '12px', fontWeight: 700 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {todayEntries.sort((a, b) => b.timestamp - a.timestamp).map((entry) => (
                    <tr key={entry.farmerCode} className="table-row group">
                      <td style={{ padding: '11px 14px', fontSize: '14px' }}>
                        <div className="flex flex-col">
                          <span className="text-white font-bold">{entry.farmerCode}</span>
                          <span className="text-[10px] text-white/40 truncate max-w-[120px]">{entry.farmerName}</span>
                        </div>
                      </td>
                      <td className="text-right font-bold text-white" style={{ padding: '11px 14px', fontSize: '14px' }}>{entry.qty.toFixed(2)}</td>
                      <td className="text-right text-blue-400" style={{ padding: '11px 14px', fontSize: '14px' }}>{entry.fat.toFixed(1)}</td>
                      <td className="text-right text-purple-400" style={{ padding: '11px 14px', fontSize: '14px' }}>{(entry.snf || entry.clr || 0).toFixed(1)}</td>
                      <td className="text-right text-white/60" style={{ padding: '11px 14px', fontSize: '14px' }}>₹{entry.rate.toFixed(2)}</td>
                      <td className="text-right font-bold text-green-400" style={{ padding: '11px 14px', fontSize: '14px' }}>₹{entry.amount.toFixed(2)}</td>
                      <td style={{ padding: '11px 14px', fontSize: '14px' }}>
                        <div className="flex items-center justify-center" style={{ gap: '8px' }}>
                          <button
                            onClick={() => handleModify(entry)}
                            className="p-1.5 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(entry.farmerCode)}
                            className="p-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {todayEntries.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center" style={{ padding: '40px', fontSize: '14px' }}>
                        <div className="flex flex-col items-center gap-3 text-white/20">
                          <Zap size={48} strokeWidth={1} />
                          <p>No entries for this session yet.</p>
                        </div>
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
