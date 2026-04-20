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
        <div className="modal-3d animate-fadeIn" style={{ padding: '24px 28px', maxWidth: '420px', width: '90%' }}>
          <h2 className="modal-title" style={{ color: 'white', fontWeight: 800, fontSize: 18, marginBottom: 16 }}>Start Collection Session</h2>
          
          <div className="space-y-4">
            <div>
              <label className="label-text">Date</label>
              <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className="input-3d" style={{ padding: '8px 12px' }} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-text">Shift</label>
                <div className="flex gap-2">
                  <button onClick={() => setSessionShift('Morning')} className={sessionShift === 'Morning' ? 'btn-3d w-full' : 'btn-secondary w-full'} style={{ height: '36px', fontSize: '13px' }}>Morning</button>
                  <button onClick={() => setSessionShift('Evening')} className={sessionShift === 'Evening' ? 'btn-3d w-full' : 'btn-secondary w-full'} style={{ height: '36px', fontSize: '13px' }}>Evening</button>
                </div>
              </div>
              <div>
                <label className="label-text">Mode</label>
                <div className="flex gap-2">
                  <button onClick={() => setSessionMode('SNF')} className={sessionMode === 'SNF' ? 'btn-3d w-full' : 'btn-secondary w-full'} style={{ height: '36px', fontSize: '13px' }}>SNF</button>
                  <button onClick={() => setSessionMode('CLR')} className={sessionMode === 'CLR' ? 'btn-3d w-full' : 'btn-secondary w-full'} style={{ height: '36px', fontSize: '13px' }}>CLR</button>
                </div>
              </div>
            </div>

            <div className="flex gap-4 p-3 glass-card" style={{ marginBottom: 0, gap: '16px' }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={printEnabled} onChange={(e) => setPrintEnabled(e.target.checked)} className="w-4 h-4" style={{ accentColor: '#4ade80' }} />
                <span style={{ color: 'white', fontSize: 13 }}>Print Slips</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={smsEnabled} onChange={(e) => setSmsEnabled(e.target.checked)} className="w-4 h-4" style={{ accentColor: '#4ade80' }} />
                <span style={{ color: 'white', fontSize: 13 }}>Send SMS</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => onNavigate('dashboard')}
                className="btn-secondary"
                style={{ flex: 1, height: '40px' }}
              >
                ✕ Cancel
              </button>
              <button onClick={handleStartSession} className="btn-3d" style={{ flex: 2, height: '40px' }}>
                🚀 Start Collection
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'linear-gradient(135deg, #0a1f0f 0%, #0d2d18 100%)', overflowY: 'auto' }}>
      {/* Top Bar */}
      <div style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '8px 24px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 4px 24px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg, #4ade80, #1a5c2e)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(74,222,128,0.4)' }}>🥛</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, padding: '4px 12px', color: '#4ade80', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Calendar size={14} /> {sessionDate}</div>
            <div style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, padding: '4px 12px', color: '#4ade80', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={14} /> {sessionShift}</div>
            <div style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, padding: '4px 12px', color: '#4ade80', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Zap size={14} /> {sessionMode} Mode</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 16 }}>
            {printEnabled && <div style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, padding: '4px 12px', color: '#4ade80', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Printer size={14} /> Print On</div>}
            {smsEnabled && <div style={{ background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, padding: '4px 12px', color: '#4ade80', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><MessageSquare size={14} /> SMS On</div>}
          </div>
          <button onClick={() => onNavigate('dashboard')} className="btn-secondary">
            <X size={18} /> Close Session
          </button>
        </div>
      </div>

      <div className="p-6 flex gap-6">
        {/* Left Form */}
        <div style={{ width: '380px', flexShrink: 0 }} className="space-y-6">
          <div className="glass-card animate-fadeIn" style={{ padding: 24 }}>
            <h3 className="modal-title" style={{ border: 'none', marginBottom: 20, padding: 0, color: 'white', fontWeight: 800, fontSize: 18 }}>
              <Droplet color="#4ade80" /> {isModifying ? 'Modify Entry' : 'New Collection'}
            </h3>
            
            <div className="space-y-3">
              <div>
                <label className="label-text">Farmer Code</label>
                <input
                  ref={farmerCodeRef}
                  type="number"
                  value={farmerCode}
                  onChange={(e) => handleFarmerCodeChange(e.target.value)}
                  onKeyDown={handleFarmerCodeKeyDown}
                  className="input-3d"
                  style={{ padding: '8px 12px' }}
                  placeholder="Enter Farmer Code"
                />
                
                {farmerFound && (
                  <div className="farmer-found-box mt-3">
                    <span style={{ color: '#4ade80', fontSize: 11 }}>✓ Farmer Found</span>
                    <div style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>{farmerName}</div>
                  </div>
                )}
                
                {farmerCode.length > 0 && !farmerFound && (
                  <div style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>Farmer not found</div>
                )}
                
                {warningMessage && <p style={{ color: '#f87171', fontSize: 12, marginTop: 4, fontWeight: 600 }}>{warningMessage}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text">Quantity (L)</label>
                  <input ref={qtyRef} type="number" value={qty} onChange={(e) => setQty(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fatRef.current?.focus()} className="input-3d" style={{ padding: '8px 12px' }} placeholder="0.00" />
                </div>
                <div>
                  <label className="label-text">FAT %</label>
                  <input ref={fatRef} type="number" value={fat} onChange={(e) => setFat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && snfClrRef.current?.focus()} className="input-3d" style={{ padding: '8px 12px' }} placeholder="0.0" />
                </div>
              </div>

              <div>
                <label className="label-text">{sessionMode} %</label>
                <input ref={snfClrRef} type="number" value={snfClr} onChange={(e) => setSnfClr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveOrUpdate()} className="input-3d" style={{ padding: '8px 12px' }} placeholder="0.0" />
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div style={{ background: 'linear-gradient(135deg, #1e3a5f, #1e40af)', borderRadius: 14, padding: 16, border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 8px 32px rgba(30,64,175,0.4)' }}>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Rate / L</p>
                  <p style={{ color: '#4ade80', fontSize: 20, fontWeight: 800 }}>₹{rate.toFixed(2)}</p>
                </div>
                <div style={{ background: 'linear-gradient(135deg, #1a5c2e, #16a34a)', borderRadius: 14, padding: 16, border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 8px 32px rgba(22,163,74,0.3)' }}>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Total Amount</p>
                  <p style={{ color: '#4ade80', fontSize: 20, fontWeight: 800 }}>₹{amount.toFixed(2)}</p>
                </div>
              </div>

              <button onClick={handleSaveOrUpdate} className="btn-3d w-full" style={{ fontSize: 18, padding: 16, marginTop: 12, background: 'linear-gradient(135deg, #4ade80, #16a34a)', boxShadow: '0 8px 24px rgba(74,222,128,0.5)', color: '#0a1f0f', fontWeight: 800 }}>
                {isModifying ? 'Update Entry' : 'Save Collection'}
              </button>
              
              {isModifying && (
                <button onClick={clearForm} className="w-full text-slate-400 hover:text-white text-sm font-semibold transition py-2">Cancel Modification</button>
              )}
            </div>
          </div>

          <div className="glass-card" style={{ padding: '14px 16px', background: 'linear-gradient(135deg, #1a5c2e, #16a34a)' }}>
            <h3 style={{ color: 'white', fontWeight: 800, fontSize: 15, marginBottom: 12 }}>Session Summary</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>Total Liters</p>
                <p style={{ color: 'white', fontSize: 18, fontWeight: 800 }}>{totalQty.toFixed(2)} L</p>
              </div>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>Total Amount</p>
                <p style={{ color: 'white', fontSize: 18, fontWeight: 800 }}>{formatIndianCurrency(totalAmount)}</p>
              </div>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>Avg FAT</p>
                <p style={{ color: 'white', fontSize: 15, fontWeight: 700 }}>{avgFat.toFixed(2)} %</p>
              </div>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>Avg {sessionMode}</p>
                <p style={{ color: 'white', fontSize: 15, fontWeight: 700 }}>{avgSnfClr.toFixed(2)} %</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Table */}
        <div style={{ flex: 1 }}>
          <div className="glass-card animate-fadeIn" style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: 'white', fontWeight: 800, fontSize: 20 }}>Today's Entries <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 400 }}>({todayEntries.length})</span></h3>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: 12, maxHeight: 'calc(100vh - 200px)' }}>
              <div className="table-container">
                <table className="w-full table-3d">
                  <thead className="table-header" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
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
                      <tr key={entry.farmerCode} className="table-row">
                        <td className="px-4 py-2" style={{ padding: '8px 12px' }}>
                          <div style={{ fontWeight: 700, color: 'white' }}>{entry.farmerCode}</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{entry.farmerName}</div>
                        </td>
                        <td className="px-4 py-2 text-right font-semibold" style={{ color: 'white', padding: '8px 12px' }}>{entry.qty.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right" style={{ color: 'rgba(255,255,255,0.85)', padding: '8px 12px' }}>{entry.fat.toFixed(1)}</td>
                        <td className="px-4 py-2 text-right" style={{ color: 'rgba(255,255,255,0.85)', padding: '8px 12px' }}>{(entry.snf || entry.clr || 0).toFixed(1)}</td>
                        <td className="px-4 py-2 text-right" style={{ color: 'rgba(255,255,255,0.85)', padding: '8px 12px' }}>₹{entry.rate.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right font-bold" style={{ color: '#4ade80', padding: '8px 12px' }}>₹{entry.amount.toFixed(2)}</td>
                        <td className="px-4 py-2" style={{ padding: '8px 12px' }}>
                          <div className="flex justify-center gap-2">
                            <button onClick={() => handleModify(entry)} className="btn-success" style={{ padding: 6 }} title="Edit"><Edit2 size={14} /></button>
                            <button onClick={() => handleDelete(entry.farmerCode)} className="btn-danger" style={{ padding: 6 }} title="Delete"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {todayEntries.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center" style={{ color: 'rgba(255,255,255,0.5)' }}>No entries yet for this session</td>
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
        <div style={{ position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #4ade80, #16a34a)', color: '#0a1f0f', padding: '12px 24px', borderRadius: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 32px rgba(74,222,128,0.5)', zIndex: 10000 }}>
          <CheckCircle size={20} /> Entry Saved Successfully!
        </div>
      )}
    </div>
  );
};

export default MilkCollection;
