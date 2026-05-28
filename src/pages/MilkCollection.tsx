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

    // Extract min/max from config
    if (config) {
      const fatVals = config.fatValues.map(Number).sort((a,b) => a-b);
      const snfVals = config.snfValues.map(Number).sort((a,b) => a-b);
      if (fatVals.length > 0) {
        setFatMin(Math.min(...fatVals));
        setFatMax(Math.max(...fatVals));
      }
      if (snfVals.length > 0) {
        setSnfMin(Math.min(...snfVals));
        setSnfMax(Math.max(...snfVals));
      }
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

    // FAT range check
    if (fatVal < fatMin || fatVal > fatMax) {
      alert(`❌ Invalid FAT value!\nAllowed range: ${fatMin} to ${fatMax}\nEntered: ${fatVal}`);
      fatRef.current?.focus();
      return;
    }

    // SNF range check
    if (snfVal < snfMin || snfVal > snfMax) {
      alert(`❌ Invalid ${sessionMode} value!\nAllowed range: ${snfMin} to ${snfMax}\nEntered: ${snfVal}`);
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
          amount: amount.toFixed(2),
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
            message: `\u26a0\ufe0f Entry already exists for ${existing.farmerName}!\nQty: ${existing.qty}L | FAT: ${existing.fat}% | SNF: ${existing.snf}% | Amount: \u20b9${existing.amount.toFixed(2)}\n\nUse Modify (\u270f\ufe0f) or Delete (\ud83d\uddd1\ufe0f) from the table.`
          });
          setFarmerName(existing.farmerName);
          setIsModifying(true);
          // Pre-fill form with existing data
          setQty(String(existing.qty));
          setFat(String(existing.fat));
          setSnfClr(String(existing.snf || existing.clr || ''));
          setRate(existing.rate);
          setAmount(existing.amount);
          return; // don't focus qty
        }
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
      <div style={{
        minHeight: 'calc(100vh - 56px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'transparent'
      }}>
        <div className="modal-3d animate-fadeIn" style={{ padding: '32px', maxWidth: '460px', width: '100%' }}>
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

            <div className="flex flex-col gap-3" style={{ marginTop: '24px', padding: '4px 2px' }}>
              <button onClick={() => setPrintEnabled(!printEnabled)} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${printEnabled ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-white/5 border-white/10 text-white/40'}`} style={{ marginLeft: '2px', marginRight: '2px' }}>
                <div className="flex items-center gap-3"><Printer size={18} /><span className="text-sm font-bold">Auto-Print Slip</span></div>
                <div className={`w-10 h-5 rounded-full relative transition-all ${printEnabled ? 'bg-amber-500' : 'bg-white/10'}`}><div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${printEnabled ? 'right-1' : 'left-1'}`}></div></div>
              </button>
              <button onClick={() => setSmsEnabled(!smsEnabled)} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${smsEnabled ? 'bg-blue-500/10 border-blue-500/30 text-blue-500' : 'bg-white/5 border-white/10 text-white/40'}`} style={{ marginLeft: '2px', marginRight: '2px' }}>
                <div className="flex items-center gap-3"><MessageSquare size={18} /><span className="text-sm font-bold">Send SMS Alert</span></div>
                <div className={`w-10 h-5 rounded-full relative transition-all ${smsEnabled ? 'bg-blue-500' : 'bg-white/10'}`}><div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${smsEnabled ? 'right-1' : 'left-1'}`}></div></div>
              </button>
            </div>

            <button onClick={handleStartSession} className="btn-3d w-full" style={{ marginTop: '32px', padding: '14px', fontSize: '16px' }}>Start Collection Session</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1400px', margin: '0 auto' }} className="animate-fadeIn">
      {/* Session Info Header */}
      <div className="flex items-center justify-between glass-card border-l-4 border-l-amber-500" style={{ marginBottom: '24px', padding: '14px 20px' }}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Calendar className="text-amber-500" size={20} />
            <span className="text-white font-bold">{sessionDate}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="text-amber-500" size={20} />
            <span className="text-white font-bold">{sessionShift}</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="text-amber-500" size={20} />
            <span className="text-white font-bold">{sessionMode} Mode</span>
          </div>
        </div>
        <button onClick={() => setShowSessionSetup(true)} className="btn-secondary py-1 px-4 text-xs">Change Session</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '28px', alignItems: 'start' }}>
        {/* Entry Form */}
        <div>
          <div className="glass-card sticky top-24" style={{ padding: '24px' }}>
            <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2">
              <Droplet className="text-blue-400" /> New Entry
            </h2>
            
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
                  <div className="mt-2 p-2 rounded-lg bg-white/5 border border-white/10 flex items-center gap-2 animate-fadeIn">
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
                  <span className="text-white font-black text-lg">₹{rate.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-white/5">
                  <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Total Amount</span>
                  <span className="text-green-400 font-black text-2xl">₹{amount.toFixed(2)}</span>
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
        </div>

        {/* Entries Table & Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Stats Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            <div className="glass-card border-b-4 border-b-blue-500" style={{ padding: '16px 18px' }}>
              <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Total Quantity</p>
              <p style={{ fontSize: '22px', fontWeight: 900, color: 'white', marginTop: '6px' }}>{totalQty.toFixed(1)} <span className="text-xs text-slate-500">L</span></p>
            </div>
            <div className="glass-card border-b-4 border-b-green-500" style={{ padding: '16px 18px' }}>
              <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Total Amount</p>
              <p style={{ fontSize: '22px', fontWeight: 900, color: 'white', marginTop: '6px' }} className="text-green-400">₹{totalAmount.toFixed(2)}</p>
            </div>
            <div className="glass-card border-b-4 border-b-amber-500" style={{ padding: '16px 18px' }}>
              <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Avg FAT</p>
              <p style={{ fontSize: '22px', fontWeight: 900, color: 'white', marginTop: '6px' }}>{avgFat.toFixed(2)} <span className="text-xs text-slate-500">%</span></p>
            </div>
            <div className="glass-card border-b-4 border-b-purple-500" style={{ padding: '16px 18px' }}>
              <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Avg {sessionMode}</p>
              <p style={{ fontSize: '22px', fontWeight: 900, color: 'white', marginTop: '6px' }}>{avgSnfClr.toFixed(2)} <span className="text-xs text-slate-500">%</span></p>
            </div>
          </div>

          {/* Recent Entries Table */}
          <div className="glass-card overflow-hidden">
            <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="text-white font-bold flex items-center gap-2">
                <Clock size={16} className="text-amber-500" /> Recent Entries
              </h3>
              <span className="bg-white/5 text-slate-400 px-3 py-1 rounded-full text-[10px] font-bold">
                {todayEntries.length} Records
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
                  {todayEntries.sort((a,b) => b.timestamp - a.timestamp).map((entry) => (
                    <tr key={entry.farmerCode} className="hover:bg-white/[0.02] transition-colors group">
                      <td style={{ padding: '12px 16px' }}><span className="bg-white/5 px-2 py-1 rounded font-mono text-white text-xs">{entry.farmerCode}</span></td>
                      <td style={{ padding: '12px 16px' }} className="font-bold text-slate-300 text-sm">{entry.farmerName}</td>
                      <td style={{ padding: '12px 16px' }} className="font-black text-white text-sm">{entry.qty.toFixed(1)}</td>
                      <td style={{ padding: '12px 16px' }} className="text-slate-400 text-sm">{entry.fat.toFixed(1)}</td>
                      <td style={{ padding: '12px 16px' }} className="text-slate-400 text-sm">{(entry.snf || entry.clr || 0).toFixed(1)}</td>
                      <td style={{ padding: '12px 16px' }} className="text-slate-400 text-sm">₹{entry.rate.toFixed(2)}</td>
                      <td style={{ padding: '12px 16px' }} className="font-black text-green-400 text-sm">₹{entry.amount.toFixed(2)}</td>
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
                  ))}
                  {todayEntries.length === 0 && (
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
