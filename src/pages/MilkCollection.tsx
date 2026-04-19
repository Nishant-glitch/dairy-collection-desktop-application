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

const MilkCollection: React.FC = () => {
  const { t } = useLanguage();
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

  const labelStyle: React.CSSProperties = { color: '#6B4C4C', fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' };
  const chipStyle: React.CSSProperties = { background: 'rgba(255,183,197,0.2)', border: '1px solid rgba(255,183,197,0.5)', color: '#c44d6e', borderRadius: 8, padding: '4px 12px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 };

  if (showSessionSetup) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="modal-3d animate-fadeIn" style={{ padding: 32, maxWidth: 450, width: '90%' }}>
          <h2 style={{ color: '#2D1B1B', fontWeight: 800, fontSize: 24, marginBottom: 24, textAlign: 'center' }}>Start Collection Session</h2>
          
          <div className="space-y-6">
            <div>
              <label style={{ color: '#6B4C4C', fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Date</label>
              <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className="input-3d w-full" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={{ color: '#6B4C4C', fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Shift</label>
                <div className="flex gap-2">
                  <button onClick={() => setSessionShift('Morning')} className="btn-3d w-full" style={{ background: sessionShift === 'Morning' ? undefined : 'rgba(242,199,199,0.2)', boxShadow: sessionShift === 'Morning' ? undefined : 'none', border: sessionShift === 'Morning' ? undefined : '1px solid rgba(242,199,199,0.4)' }}>Morning</button>
                  <button onClick={() => setSessionShift('Evening')} className="btn-3d w-full" style={{ background: sessionShift === 'Evening' ? undefined : 'rgba(242,199,199,0.2)', boxShadow: sessionShift === 'Evening' ? undefined : 'none', border: sessionShift === 'Evening' ? undefined : '1px solid rgba(242,199,199,0.4)' }}>Evening</button>
                </div>
              </div>
              <div>
                <label style={{ color: '#6B4C4C', fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Mode</label>
                <div className="flex gap-2">
                  <button onClick={() => setSessionMode('SNF')} className="btn-3d w-full" style={{ background: sessionMode === 'SNF' ? undefined : 'rgba(242,199,199,0.2)', boxShadow: sessionMode === 'SNF' ? undefined : 'none', border: sessionMode === 'SNF' ? undefined : '1px solid rgba(242,199,199,0.4)' }}>SNF</button>
                  <button onClick={() => setSessionMode('CLR')} className="btn-3d w-full" style={{ background: sessionMode === 'CLR' ? undefined : 'rgba(242,199,199,0.2)', boxShadow: sessionMode === 'CLR' ? undefined : 'none', border: sessionMode === 'CLR' ? undefined : '1px solid rgba(242,199,199,0.4)' }}>CLR</button>
                </div>
              </div>
            </div>

            <div className="flex gap-4 p-4 glass-card" style={{ background: 'rgba(242,199,199,0.15)' }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={printEnabled} onChange={(e) => setPrintEnabled(e.target.checked)} className="w-4 h-4 accent-pink-500" />
                <span style={{ color: '#2D1B1B', fontSize: 14 }}>Print Slips</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={smsEnabled} onChange={(e) => setSmsEnabled(e.target.checked)} className="w-4 h-4 accent-pink-500" />
                <span style={{ color: '#2D1B1B', fontSize: 14 }}>Send SMS</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                onClick={() => setShowSessionSetup(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: 12,
                  background: 'rgba(242,199,199,0.3)',
                  border: '1px solid rgba(242,199,199,0.6)',
                  color: '#6B4C4C',
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                ✕ Cancel
              </button>
              <button onClick={handleStartSession} className="btn-3d animate-pulse-glow" style={{ flex: 2, padding: '12px', fontSize: 15 }}>
                🚀 Start Collection
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'linear-gradient(135deg, #fff0f3 0%, #fde8e8 50%, #e8f5ea 100%)', overflowY: 'auto' }}>
      {/* Top Bar */}
      <div style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(242,199,199,0.4)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 4px 16px rgba(255,183,197,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg, #FFB7C5, #F2C7C7)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(255,183,197,0.3)' }}>🥛</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: 'rgba(255,183,197,0.2)', border: '1px solid rgba(255,183,197,0.5)', color: '#c44d6e', borderRadius: 8, padding: '4px 12px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Calendar size={14} /> {sessionDate}</div>
            <div style={{ background: 'rgba(255,183,197,0.2)', border: '1px solid rgba(255,183,197,0.5)', color: '#c44d6e', borderRadius: 8, padding: '4px 12px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={14} /> {sessionShift}</div>
            <div style={{ background: 'rgba(255,183,197,0.2)', border: '1px solid rgba(255,183,197,0.5)', color: '#c44d6e', borderRadius: 8, padding: '4px 12px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Zap size={14} /> {sessionMode} Mode</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 16 }}>
            {printEnabled && <div style={{ background: 'rgba(255,183,197,0.2)', border: '1px solid rgba(255,183,197,0.5)', color: '#c44d6e', borderRadius: 8, padding: '4px 12px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Printer size={14} /> Print On</div>}
            {smsEnabled && <div style={{ background: 'rgba(255,183,197,0.2)', border: '1px solid rgba(255,183,197,0.5)', color: '#c44d6e', borderRadius: 8, padding: '4px 12px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><MessageSquare size={14} /> SMS On</div>}
          </div>
          <button onClick={() => setShowSessionSetup(true)} className="btn-3d" style={{ padding: '8px 16px', background: 'rgba(242,199,199,0.3)', color: '#6B4C4C', border: '1px solid rgba(242,199,199,0.6)', boxShadow: 'none' }}>
            <X size={18} /> Close Session
          </button>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form */}
        <div className="lg:col-span-4 space-y-6">
          <div className="glass-card animate-fadeIn" style={{ padding: 24 }}>
            <h3 style={{ color: '#2D1B1B', fontWeight: 800, fontSize: 20, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Droplet color="#FFB7C5" /> {isModifying ? 'Modify Entry' : 'New Collection'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label style={labelStyle}>Farmer Code</label>
                <div className="flex gap-2">
                  <input
                    ref={farmerCodeRef}
                    type="number"
                    value={farmerCode}
                    onChange={(e) => {
                      setFarmerCode(e.target.value);
                      const f = farmers[e.target.value];
                      if (f) {
                        setFarmerName(f.name);
                        setWarningMessage(todayEntries.find(ent => ent.farmerCode === e.target.value) ? 'Already entered today' : '');
                        qtyRef.current?.focus();
                      } else {
                        setFarmerName('');
                        setWarningMessage('');
                      }
                    }}
                    className="input-3d w-24"
                    placeholder="ID"
                  />
                  <input
                    type="text"
                    value={farmerName}
                    readOnly
                    className="input-3d flex-1"
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}
                    placeholder="Farmer Name"
                  />
                </div>
                {warningMessage && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 4, fontWeight: 600 }}>{warningMessage}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label style={labelStyle}>Quantity (L)</label>
                  <input ref={qtyRef} type="number" value={qty} onChange={(e) => setQty(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fatRef.current?.focus()} className="input-3d w-full" placeholder="0.00" />
                </div>
                <div>
                  <label style={labelStyle}>FAT %</label>
                  <input ref={fatRef} type="number" value={fat} onChange={(e) => setFat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && snfClrRef.current?.focus()} className="input-3d w-full" placeholder="0.0" />
                </div>
              </div>

              <div>
                <label style={labelStyle}>{sessionMode} %</label>
                <input ref={snfClrRef} type="number" value={snfClr} onChange={(e) => setSnfClr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveOrUpdate()} className="input-3d w-full" placeholder="0.0" />
              </div>

              <div className="grid grid-cols-2 gap-4 mt-6">
                <div style={{ background: 'linear-gradient(135deg, #D5F3D8, #b8e8be)', borderRadius: 16, padding: 16, border: '1px solid rgba(213,243,216,0.8)', boxShadow: '0 8px 24px rgba(213,243,216,0.4)' }}>
                  <p style={{ color: '#6B4C4C', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Rate / L</p>
                  <p style={{ color: '#2D1B1B', fontSize: 24, fontWeight: 800 }}>₹{rate.toFixed(2)}</p>
                </div>
                <div style={{ background: 'linear-gradient(135deg, #FFB7C5, #f090a8)', borderRadius: 16, padding: 16, border: '1px solid rgba(255,183,197,0.8)', boxShadow: '0 8px 24px rgba(255,183,197,0.4)' }}>
                  <p style={{ color: '#6B4C4C', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Total Amount</p>
                  <p style={{ color: '#2D1B1B', fontSize: 24, fontWeight: 800 }}>₹{amount.toFixed(2)}</p>
                </div>
              </div>

              <button onClick={handleSaveOrUpdate} className="btn-3d w-full" style={{ background: 'linear-gradient(135deg, #FFB7C5, #f090a8)', color: '#2D1B1B', fontWeight: 800, fontSize: 18, padding: 16, marginTop: 12, boxShadow: '0 8px 24px rgba(255,183,197,0.5)' }}>
                {isModifying ? 'Update Entry' : 'Save Collection'}
              </button>
              
              {isModifying && (
                <button onClick={clearForm} className="w-full text-white/50 hover:text-white text-sm font-semibold transition py-2">Cancel Modification</button>
              )}
            </div>
          </div>

          <div className="glass-card" style={{ padding: 24, background: 'linear-gradient(135deg, #FFB7C5, #f090a8)' }}>
            <h3 style={{ color: '#2D1B1B', fontWeight: 800, fontSize: 16, marginBottom: 16 }}>Session Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p style={{ color: '#6B4C4C', fontSize: 12 }}>Total Liters</p>
                <p style={{ color: '#2D1B1B', fontSize: 20, fontWeight: 800 }}>{totalQty.toFixed(2)} L</p>
              </div>
              <div>
                <p style={{ color: '#6B4C4C', fontSize: 12 }}>Total Amount</p>
                <p style={{ color: '#2D1B1B', fontSize: 20, fontWeight: 800 }}>{formatIndianCurrency(totalAmount)}</p>
              </div>
              <div>
                <p style={{ color: '#6B4C4C', fontSize: 12 }}>Avg FAT</p>
                <p style={{ color: '#2D1B1B', fontSize: 16, fontWeight: 700 }}>{avgFat.toFixed(2)} %</p>
              </div>
              <div>
                <p style={{ color: '#6B4C4C', fontSize: 12 }}>Avg {sessionMode}</p>
                <p style={{ color: '#2D1B1B', fontSize: 16, fontWeight: 700 }}>{avgSnfClr.toFixed(2)} %</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Table */}
        <div className="lg:col-span-8">
          <div className="glass-card animate-fadeIn" style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(242,199,199,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#2D1B1B', fontWeight: 800, fontSize: 20 }}>Today's Entries <span style={{ color: '#6B4C4C', fontSize: 14, fontWeight: 400 }}>({todayEntries.length})</span></h3>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              <div className="table-3d">
                <table className="w-full">
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      <th className="px-4 py-3">Farmer</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">FAT</th>
                      <th className="px-4 py-3 text-right">{sessionMode}</th>
                      <th className="px-4 py-3 text-right">Rate</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayEntries.sort((a, b) => b.timestamp - a.timestamp).map((entry) => (
                      <tr key={entry.farmerCode}>
                        <td className="px-4 py-3">
                          <div style={{ fontWeight: 700, color: '#2D1B1B' }}>{entry.farmerCode}</div>
                          <div style={{ fontSize: 11, color: '#6B4C4C' }}>{entry.farmerName}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold" style={{ color: '#2D1B1B' }}>{entry.qty.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right" style={{ color: '#2D1B1B' }}>{entry.fat.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right" style={{ color: '#2D1B1B' }}>{(entry.snf || entry.clr || 0).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right" style={{ color: '#2D1B1B' }}>₹{entry.rate.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-bold" style={{ color: '#FFB7C5' }}>{formatIndianCurrency(entry.amount)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-2">
                            <button onClick={() => handleModify(entry)} className="p-2 rounded-lg hover:bg-pink-100 text-pink-600 hover:text-pink-700 transition"><Edit2 size={16} /></button>
                            <button onClick={() => handleDelete(entry.farmerCode)} className="p-2 rounded-lg hover:bg-red-100 text-red-600 hover:text-red-700 transition"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {todayEntries.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-20 text-center">
                          <Droplet size={48} className="mx-auto mb-4" style={{ color: 'rgba(242,199,199,0.2)' }} />
                          <p style={{ color: '#6B4C4C', fontSize: 16 }}>No entries for this session yet.</p>
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

      {showSavedMessage && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'linear-gradient(135deg, #D5F3D8, #a8ddb0)', color: '#2D1B1B', fontWeight: 800, padding: '12px 24px', borderRadius: 12, boxShadow: '0 8px 32px rgba(213,243,216,0.5)', animation: 'slideIn 0.3s ease', zIndex: 99999, display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle size={20} /> Entry Saved Successfully!
        </div>
      )}
    </div>
  );
};

export default MilkCollection;
