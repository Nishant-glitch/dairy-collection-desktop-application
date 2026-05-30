import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, set, get, remove } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { formatIndianCurrency } from '../utils/rateCalculator';
import { sendSMS } from '../services/sms';
import { X, Edit2, Trash2, CheckCircle, Droplet, Clock, Calendar, Zap, Printer, MessageSquare } from 'lucide-react';
import { getRateFromMap } from '../utils/rateCalculator';

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
  const [duplicateWarning, setDuplicateWarning] = useState<{show: boolean, message: string}>({show: false, message: ''});

  const [todayEntries, setTodayEntries] = useState<Entry[]>([]);
  const [activeRateConfig, setActiveRateConfig] = useState<any>(null);
  const [dcsInfo, setDcsInfo] = useState<any>({});
  const [farmers, setFarmers] = useState<any>({});
  const [fatMin, setFatMin] = useState<number>(2.5);
  const [fatMax, setFatMax] = useState<number>(15.0);
  const [snfMin, setSnfMin] = useState<number>(7.5);
  const [snfMax, setSnfMax] = useState<number>(15.0);

  const farmerCodeRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const fatRef = useRef<HTMLInputElement>(null);
  const snfClrRef = useRef<HTMLInputElement>(null);
  const fetchTimerRef = useRef<any>(null);

  const safeNum = (val: any): number => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
  };

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
    if (!qty || !fat || !snfClr || !activeRateConfig) {
      setRate(0);
      setAmount(0);
      return;
    }
    try {
      const r = getRateFromMap(
        parseFloat(fat) || 0,
        parseFloat(snfClr) || 0,
        activeRateConfig
      );
      setRate(r || 0);
      setAmount(safeNum(r) * (parseFloat(qty) || 0));
    } catch (err) {
      console.error('Rate calc error:', err);
      setRate(0);
      setAmount(0);
    }
  }, [qty, fat, snfClr, activeRateConfig]);

  const getConfigForDate = async (collectionDate: string) => {
    // First try: load from current (always the latest uploaded rate chart)
    const currentSnap = await get(ref(database, 'globalRateConfig/current'));
    if (currentSnap.exists()) {
      return currentSnap.val();
    }

    // Fallback: search history by date
    const historySnap = await get(ref(database, 'globalRateConfig/history'));
    if (!historySnap.exists()) return null;

    const configs = Object.values(historySnap.val()) as any[];
    configs.sort((a: any, b: any) =>
      new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
    );
    return configs.find((c: any) => c.effectiveFrom <= collectionDate)
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
      console.warn('No rate config found for date:', sessionDate);
      setFatMin(2.5);
      setFatMax(15.0);
      setSnfMin(7.5);
      setSnfMax(15.0);
      return;
    }
    setActiveRateConfig(config);

    // Safe extraction with fallback
    const fatVals = (config.fatValues || []).map(Number).filter((n: any) => !isNaN(n)).sort((a: number, b: number) => a - b);
    const snfVals = (config.snfValues || []).map(Number).filter((n: any) => !isNaN(n)).sort((a: number, b: number) => a - b);

    if (fatVals.length > 0) {
      setFatMin(fatVals[0]);
      setFatMax(fatVals[fatVals.length - 1]);
    } else {
      setFatMin(2.5);
      setFatMax(15.0);
    }
    if (snfVals.length > 0) {
      setSnfMin(snfVals[0]);
      setSnfMax(snfVals[snfVals.length - 1]);
    } else {
      setSnfMin(7.5);
      setSnfMax(15.0);
    }

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

    const fatVal = parseFloat(fat);
    const snfVal = parseFloat(snfClr);

    const FIXED_FAT_MIN = 2.5;
    const FIXED_FAT_MAX = 15.0;
    const FIXED_SNF_MIN = 7.5;
    const FIXED_SNF_MAX = 15.0;

    if (fatVal < FIXED_FAT_MIN || fatVal > FIXED_FAT_MAX) {
      const popup = document.createElement('div');
      popup.innerHTML = `
        <div style="position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px)">
          <div style="background:linear-gradient(145deg,#1a0a0a,#2d1010);border:1px solid rgba(248,113,113,0.4);border-radius:16px;padding:32px;max-width:360px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.6)">
            <div style="font-size:40px;margin-bottom:12px">❌</div>
            <h3 style="color:#f87171;font-size:18px;font-weight:800;margin-bottom:8px">Invalid FAT Value</h3>
            <p style="color:rgba(255,255,255,0.7);font-size:14px;margin-bottom:6px">Allowed Range: <strong style="color:white">${FIXED_FAT_MIN} – ${FIXED_FAT_MAX}</strong></p>
            <p style="color:rgba(255,255,255,0.5);font-size:13px;margin-bottom:24px">Entered: <strong style="color:#f87171">${fatVal}</strong></p>
            <button onclick="this.closest('div[style*=inset]').remove()" style="background:linear-gradient(135deg,#ef4444,#b91c1c);border:none;border-radius:10px;color:white;font-weight:700;font-size:14px;padding:12px 32px;cursor:pointer;width:100%">OK</button>
          </div>
        </div>`;
      document.body.appendChild(popup.firstElementChild!);
      fatRef.current?.focus();
      return;
    }

    if (snfVal < FIXED_SNF_MIN || snfVal > FIXED_SNF_MAX) {
      const popup = document.createElement('div');
      popup.innerHTML = `
        <div style="position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px)">
          <div style="background:linear-gradient(145deg,#1a0a0a,#2d1010);border:1px solid rgba(248,113,113,0.4);border-radius:16px;padding:32px;max-width:360px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.6)">
            <div style="font-size:40px;margin-bottom:12px">❌</div>
            <h3 style="color:#f87171;font-size:18px;font-weight:800;margin-bottom:8px">Invalid ${sessionMode} Value</h3>
            <p style="color:rgba(255,255,255,0.7);font-size:14px;margin-bottom:6px">Allowed Range: <strong style="color:white">${FIXED_SNF_MIN} – ${FIXED_SNF_MAX}</strong></p>
            <p style="color:rgba(255,255,255,0.5);font-size:13px;margin-bottom:24px">Entered: <strong style="color:#f87171">${snfVal}</strong></p>
            <button onclick="this.closest('div[style*=inset]').remove()" style="background:linear-gradient(135deg,#ef4444,#b91c1c);border:none;border-radius:10px;color:white;font-weight:700;font-size:14px;padding:12px 32px;cursor:pointer;width:100%">OK</button>
          </div>
        </div>`;
      document.body.appendChild(popup.firstElementChild!);
      snfClrRef.current?.focus();
      return;
    }

    // Prevent duplicate entry if not modifying
    if (!isModifying && todayEntries.find(e => e.farmerCode === farmerCode)) {
      alert('⚠️ Entry already exists! Use Modify button from the table.');
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

    if (smsEnabled) {
      // Fetch farmer mobile from Firebase
      const farmerSnap = await get(ref(database, up(`farmers/${farmerCode}`)));
      const farmerMobile = farmerSnap.exists() ? farmerSnap.val().mobileNo : '';
      
      if (farmerMobile) {
        await sendSMS({
          farmerId: farmerCode,
          mobile: farmerMobile,
          farmerName: farmerName,
          qty: qty,
          fat: fat,
          amount: (amount || 0).toFixed(2),
        });
      }
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
        <p><strong>Rate:</strong> ₹${(rate || 0).toFixed(2)}/Liter</p>
        <p style="font-size: 18px;"><strong>Amount:</strong> ₹${(amount || 0).toFixed(2)}</p>
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
    setDuplicateWarning({show: false, message: ''});
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
      setDuplicateWarning({show: false, message: ''});
    }
  };

  const handleFarmerCodeChange = (code: string) => {
    setFarmerCode(code);
    setDuplicateWarning({show: false, message: ''});
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

  const handleFarmerCodeKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (farmerFound) {
        // Check if entry already exists
        const existingEntrySnap = await get(
          ref(database, up(`milkCollection/${sessionDate}/${sessionShift}/${farmerCode}`))
        );

        if (existingEntrySnap.exists()) {
          const existing = existingEntrySnap.val();
          // Show warning - do NOT allow fresh save
          setDuplicateWarning({
            show: true,
            message: `⚠️ Entry already exists for ${existing.farmerName}!\nQty: ${existing.qty}L | FAT: ${existing.fat}% | Rate: ₹${(existing.rate || 0).toFixed(2)}\n\nPlease use the 'Modify' button in the table below to update this entry.`
          });
          return;
        }
        qtyRef.current?.focus();
      }
    }
  };

  const totalQty = (todayEntries || []).reduce((sum, e) => sum + safeNum(e?.qty), 0);
  const totalAmount = (todayEntries || []).reduce((sum, e) => sum + safeNum(e?.amount), 0);
  const avgFat = (todayEntries || []).length > 0
    ? (todayEntries || []).reduce((sum, e) => sum + safeNum(e?.fat), 0) / todayEntries.length
    : 0;
  const avgSnfClr = (todayEntries || []).length > 0
    ? (todayEntries || []).reduce((sum, e) => sum + safeNum(e?.snf || e?.clr), 0) / todayEntries.length
    : 0;

  if (showSessionSetup) {
    return (
      <div className="page-wrapper flex items-center justify-center min-h-[80vh]">
        <div className="modal-3d animate-fadeIn" style={{ maxWidth: 450, padding: 32, width: '90%' }}>
          <div className="text-center mb-8">
            <div style={{ width: 64, height: 64, background: 'rgba(74,222,128,0.1)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Droplet color="#4ade80" size={32} />
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 900, color: 'white' }}>Start Collection</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 4 }}>Set up your milk collection session</p>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-text" style={{ marginBottom: 8, display: 'block', fontSize: 12 }}>Session Date</label>
                <div className="relative">
                  <Calendar size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }} />
                  <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className="input-3d" style={{ paddingLeft: 40 }} />
                </div>
              </div>
              <div>
                <label className="label-text" style={{ marginBottom: 8, display: 'block', fontSize: 12 }}>Shift</label>
                <div className="relative">
                  <Clock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }} />
                  <select value={sessionShift} onChange={(e: any) => setSessionShift(e.target.value)} className="input-3d" style={{ paddingLeft: 40 }}>
                    <option value="Morning">Morning</option>
                    <option value="Evening">Evening</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="label-text" style={{ marginBottom: 12, display: 'block', fontSize: 12 }}>Collection Mode</label>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setSessionMode('SNF')} className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${sessionMode === 'SNF' ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}>
                  <Zap size={20} />
                  <span className="font-bold text-sm">FAT + SNF</span>
                </button>
                <button onClick={() => setSessionMode('CLR')} className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${sessionMode === 'CLR' ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}>
                  <Droplet size={20} />
                  <span className="font-bold text-sm">FAT + CLR</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div onClick={() => setPrintEnabled(!printEnabled)} className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${printEnabled ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' : 'bg-white/5 border-white/10 text-slate-500'}`}>
                <Printer size={18} />
                <span className="font-bold text-xs">Auto Print</span>
              </div>
              <div onClick={() => setSmsEnabled(!smsEnabled)} className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${smsEnabled ? 'bg-purple-500/10 border-purple-500/50 text-purple-400' : 'bg-white/5 border-white/10 text-slate-500'}`}>
                <MessageSquare size={18} />
                <span className="font-bold text-xs">Send SMS</span>
              </div>
            </div>

            <button onClick={handleStartSession} className="btn-3d w-full py-4 text-lg mt-4">
              Start Collection Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrapper animate-fadeIn">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Entry Form */}
        <div style={{ width: '400px', flexShrink: 0 }}>
          <div className="glass-card sticky top-24" style={{ padding: '16px 22px 22px 22px' }}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-white font-black text-xl tracking-tight">Milk Entry</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="bg-green-500/20 text-green-400 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">{sessionShift}</span>
                  <span className="text-slate-500 text-[10px] font-bold">{sessionDate}</span>
                </div>
              </div>
              <button onClick={() => setShowSessionSetup(true)} className="p-2 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="label-text" style={{ display: 'block', marginBottom: '8px', fontSize: '11px', letterSpacing: '0.5px' }}>Farmer Code</label>
                  {warningMessage && <span className="text-[10px] text-amber-500 animate-pulse font-bold">{warningMessage}</span>}
                </div>
                <input
                  ref={farmerCodeRef}
                  type="number"
                  value={farmerCode}
                  onChange={(e) => handleFarmerCodeChange(e.target.value)}
                  onKeyDown={handleFarmerCodeKeyDown}
                  className={`input-3d ${farmerFound ? 'border-green-500/50 bg-green-500/5' : ''}`}
                  style={{ padding: '11px 14px', fontSize: '14px' }}
                  placeholder="Enter Code"
                />
                {farmerName && (
                  <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '10px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', display: 'flex', alignItems: 'center', gap: '8px' }} className="animate-fadeIn">
                    <CheckCircle size={14} className="text-green-500" />
                    <span className="text-white font-bold text-sm truncate">{farmerName}</span>
                  </div>
                )}
              </div>

              {duplicateWarning.show && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs whitespace-pre-line leading-relaxed animate-bounce">
                  {duplicateWarning.message}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="label-text" style={{ display: 'block', marginBottom: '8px', fontSize: '11px', letterSpacing: '0.5px' }}>Quantity (L)</label>
                  <input
                    ref={qtyRef}
                    type="number"
                    step="0.1"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fatRef.current?.focus()}
                    className="input-3d"
                    style={{ padding: '11px 14px', fontSize: '14px' }}
                    placeholder="0.0"
                  />
                </div>
                <div>
                  <label className="label-text" style={{ display: 'block', marginBottom: '8px', fontSize: '11px', letterSpacing: '0.5px' }}>FAT (%)</label>
                  <input
                    ref={fatRef}
                    type="number"
                    step="0.1"
                    value={fat}
                    onChange={(e) => setFat(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && snfClrRef.current?.focus()}
                    className="input-3d"
                    style={{ padding: '11px 14px', fontSize: '14px' }}
                    placeholder="0.0"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="label-text" style={{ display: 'block', marginBottom: '8px', fontSize: '11px', letterSpacing: '0.5px' }}>{sessionMode} (%)</label>
                  <span className="text-[10px] text-slate-500 font-bold">Range: {snfMin} - {snfMax}</span>
                </div>
                <input
                  ref={snfClrRef}
                  type="number"
                  step="0.1"
                  value={snfClr}
                  onChange={(e) => setSnfClr(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveOrUpdate()}
                  className="input-3d"
                  style={{ padding: '11px 14px', fontSize: '14px' }}
                  placeholder="0.0"
                />
              </div>

              <div style={{ padding: '16px 18px', borderRadius: '14px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Rate / Liter</span>
                  <span className="text-white font-black text-lg">₹{safeNum(rate).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-white/5">
                  <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Total Amount</span>
                  <span className="text-green-400 font-black text-2xl">₹{safeNum(amount).toFixed(2)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', paddingTop: '6px' }}>
                <button
                  onClick={clearForm}
                  className="btn-secondary flex-1 py-3"
                >
                  Clear
                </button>
                <button
                  onClick={handleSaveOrUpdate}
                  className={`btn-3d flex-[2] py-3 ${isModifying ? 'from-amber-500 to-orange-600' : ''}`}
                >
                  {isModifying ? 'Update Entry' : 'Save Entry'}
                </button>
              </div>
            </div>
          </div>

          {/* Session Summary — SEPARATE card below, NOT inside glass-card */}
          <div className="glass-card" style={{ marginTop: '14px', padding: '16px 20px' }}>
            <p style={{
              fontSize: '11px', fontWeight: 800,
              color: 'rgba(255,255,255,0.45)',
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
              marginBottom: '14px',
              paddingBottom: '10px',
              borderBottom: '1px solid rgba(255,255,255,0.07)'
            }}>Session Summary</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '12px 14px' }}>
                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Total QTY</p>
                <p style={{ fontSize: '18px', fontWeight: 900, color: 'white' }}>{totalQty.toFixed(2)} <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>L</span></p>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '12px 14px' }}>
                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Avg FAT</p>
                <p style={{ fontSize: '18px', fontWeight: 900, color: 'white' }}>{avgFat.toFixed(2)}<span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>%</span></p>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '12px 14px' }}>
                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Avg SNF</p>
                <p style={{ fontSize: '18px', fontWeight: 900, color: 'white' }}>{avgSnfClr.toFixed(2)}<span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>%</span></p>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '12px 14px' }}>
                <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>Total Amount</p>
                <p style={{ fontSize: '18px', fontWeight: 900, color: '#4ade80' }}>₹{totalAmount.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Entries Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
          {/* Recent Entries Table */}
          <div className="glass-card overflow-hidden">
            <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="text-white font-bold flex items-center gap-2">
                <Clock size={16} className="text-amber-500" /> Recent Entries
              </h3>
              <span className="bg-white/5 text-slate-400 px-3 py-1 rounded-full text-[10px] font-bold">
                {(todayEntries || []).length} Records
              </span>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-sm z-10">
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                    <th style={{ padding: '12px 16px', fontWeight: 900, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.4)' }}>Code</th>
                    <th style={{ padding: '12px 16px', fontWeight: 900, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.4)' }}>Farmer Name</th>
                    <th style={{ padding: '12px 16px', fontWeight: 900, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.4)' }}>Qty</th>
                    <th style={{ padding: '12px 16px', fontWeight: 900, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.4)' }}>FAT</th>
                    <th style={{ padding: '12px 16px', fontWeight: 900, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.4)' }}>{sessionMode}</th>
                    <th style={{ padding: '12px 16px', fontWeight: 900, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.4)' }}>Rate</th>
                    <th style={{ padding: '12px 16px', fontWeight: 900, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.4)' }}>Amount</th>
                    <th style={{ padding: '12px 16px', fontWeight: 900, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.4)' }} className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(todayEntries || []).sort((a,b) => b.timestamp - a.timestamp).map((entry) => {
                    if (!entry) return null;
                    return (
                      <tr key={entry.farmerCode} className="hover:bg-white/[0.02] transition-colors group">
                        <td style={{ padding: '12px 16px' }}><span className="bg-white/5 px-2 py-1 rounded font-mono text-white text-xs">{entry.farmerCode}</span></td>
                        <td style={{ padding: '12px 16px' }} className="font-bold text-slate-300 text-sm">{entry.farmerName}</td>
                        <td style={{ padding: '12px 16px' }} className="font-black text-white text-sm">{safeNum(entry.qty).toFixed(1)}</td>
                        <td style={{ padding: '12px 16px' }} className="text-slate-400 text-sm">{safeNum(entry.fat).toFixed(1)}</td>
                        <td style={{ padding: '12px 16px' }} className="text-slate-400 text-sm">{safeNum(entry.snf || entry.clr).toFixed(1)}</td>
                        <td style={{ padding: '12px 16px' }} className="text-slate-400 text-sm">₹{safeNum(entry.rate).toFixed(2)}</td>
                        <td style={{ padding: '12px 16px' }} className="font-black text-green-400 text-sm">₹{safeNum(entry.amount).toFixed(2)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleModify(entry)}
                              className="p-2 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white transition-all"
                              title="Edit"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(entry.farmerCode)}
                              className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {(todayEntries || []).length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-500 font-medium italic">
                        No entries recorded for this session yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {showSavedMessage && (
        <div className="fixed bottom-8 right-8 bg-green-500 text-white px-6 py-3 rounded-2xl shadow-2xl shadow-green-500/40 flex items-center gap-3 animate-fadeUp z-50">
          <CheckCircle size={20} />
          <span className="font-bold">Entry Saved Successfully!</span>
        </div>
      )}
    </div>
  );
};

export default MilkCollection;
