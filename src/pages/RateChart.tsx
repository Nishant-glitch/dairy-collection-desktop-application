import React, { useState, useEffect, useRef } from 'react';
import { ref, get, set, push } from 'firebase/database';
import { database } from '../firebase/config';
import { isAdmin } from '../utils/userDb';
import { FileSpreadsheet, History, X, Table as TableIcon, ShieldCheck, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

export const getRateFromMap = (fat: number, snf: number, config: any): number => {
  if (!config || !config.rateMap) return 0;
  
  const fatValues = config.fatValues.map(Number).sort((a: number, b: number) => a - b);
  const snfValues = config.snfValues.map(Number).sort((a: number, b: number) => a - b);
  
  if (fatValues.length === 0 || snfValues.length === 0) return 0;

  // Find closest FAT (cap at max)
  const cappedFat = Math.min(fat, fatValues[fatValues.length - 1]);
  const closestFat = fatValues.reduce((prev: number, curr: number) =>
    Math.abs(curr - cappedFat) < Math.abs(prev - cappedFat) ? curr : prev
  );
  
  // Find closest SNF (cap at max)
  const cappedSnf = Math.min(snf, snfValues[snfValues.length - 1]);
  const closestSnf = snfValues.reduce((prev: number, curr: number) =>
    Math.abs(curr - cappedSnf) < Math.abs(prev - cappedSnf) ? curr : prev
  );
  
  // Use sanitized keys for lookup
  const fatKey = closestFat.toFixed(1).replace('.', '_');
  const snfKey = closestSnf.toFixed(1).replace('.', '_');
  
  return config.rateMap[fatKey]?.[snfKey] || 0;
};

const RateChart: React.FC = () => {
  const [currentConfig, setCurrentConfig] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showImportPopup, setShowImportPopup] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [viewingConfig, setViewingConfig] = useState<any>(null);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const userIsAdmin = isAdmin();

  useEffect(() => {
    loadCurrentConfig();
  }, []);

  const loadCurrentConfig = async () => {
    const snap = await get(ref(database, 'globalRateConfig/current'));
    if (snap.exists()) {
      setCurrentConfig(snap.val());
    }
  };

  const loadHistory = async () => {
    const snap = await get(ref(database, 'globalRateConfig/history'));
    if (snap.exists()) {
      const data = snap.val();
      const historyList = Object.values(data).sort((a: any, b: any) => 
        new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
      );
      setHistory(historyList);
    }
    setShowHistoryModal(true);
  };

  const handleFileImport = (file: File, effectiveFrom: string) => {
    if (!file) return;
    
    const reader = new FileReader();
    const isCSV = file.name.toLowerCase().endsWith('.csv');

    reader.onload = async (e) => {
      try {
        let json: any[][] = [];

        if (isCSV) {
          const text = e.target?.result as string;
          const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
          json = lines.map(line => line.split(',').map(c => c.trim()));
        } else {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          json = XLSX.utils.sheet_to_json(sheet, {
            header: 1, defval: 0, raw: false,
          }) as any[][];
        }

        console.log('Total rows parsed:', json.length);
        console.log('First row sample:', json[0]?.slice(0, 5));
        console.log('Second row sample:', json[1]?.slice(0, 5));

        if (!json || json.length < 2) {
          alert('File is empty or invalid format!');
          return;
        }

        // Parse SNF from first row (skip col 0)
        const snfValues: number[] = [];
        for (let i = 1; i < json[0].length; i++) {
          const v = parseFloat(String(json[0][i]));
          if (!isNaN(v)) snfValues.push(v);
        }

        // Parse FAT rows
        const fatValues: number[] = [];
        const rateMap: any = {};

        for (let i = 1; i < json.length; i++) {
          const fat = parseFloat(String(json[i][0]));
          if (isNaN(fat)) continue;
          fatValues.push(fat);
          const fatKey = fat.toFixed(1).replace('.', '_');
          rateMap[fatKey] = {};
          snfValues.forEach((snf, idx) => {
            const rate = parseFloat(String(json[i][idx + 1]));
            const snfKey = snf.toFixed(1).replace('.', '_');
            rateMap[fatKey][snfKey] = isNaN(rate) ? 0 : rate;
          });
        }

        console.log('FAT values count:', fatValues.length);
        console.log('SNF values count:', snfValues.length);

        if (fatValues.length === 0 || snfValues.length === 0) {
          alert('Could not parse FAT or SNF values!');
          return;
        }

        const config = {
          rateMap,
          snfValues,
          fatValues,
          effectiveFrom,
          importedAt: Date.now(),
          type: isCSV ? 'csv' : 'excel',
          fileName: file.name,
        };

        await set(ref(database, 'globalRateConfig/current'), config);
        await push(ref(database, 'globalRateConfig/history'), config);

        setCurrentConfig(config);
        setSelectedFile(null);
        setShowImportPopup(false);
        alert(`✅ Rate chart published!\nFAT rows: ${fatValues.length} | SNF cols: ${snfValues.length}`);

      } catch (err: any) {
        console.error('Import error:', err);
        alert('Import error: ' + err.message);
      }
    };

    reader.onerror = () => alert('Failed to read file!');

    if (isCSV) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  const getCellColor = (rate: number) => {
    if (rate === 0) return 'transparent';
    if (rate < 35) return 'rgba(248, 113, 113, 0.1)';
    if (rate < 45) return 'rgba(245, 158, 11, 0.1)';
    return 'rgba(74, 222, 128, 0.1)';
  };

  const RateTable = ({ config }: { config: any }) => {
    if (!config || !config.rateMap) return null;
    
    return (
      <div className="glass-card overflow-hidden">
        <div style={{ padding: 20, background: 'rgba(148,163,184,0.05)', borderBottom: '1px solid rgba(148,163,184,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: '#f1f5f9', fontWeight: 800, fontSize: 16, marginBottom: 4 }}>
              Rate Chart — Effective from {config.effectiveFrom}
            </h3>
            <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 16 }}>
              Imported on: {new Date(config.importedAt).toLocaleString()} {config.fileName ? `(${config.fileName})` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
              <span style={{ width: 12, height: 12, background: 'rgba(248, 113, 113, 0.2)', border: '1px solid rgba(248, 113, 113, 0.3)', borderRadius: 3 }}></span> Low
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
              <span style={{ width: 12, height: 12, background: 'rgba(245, 158, 11, 0.2)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 3 }}></span> Mid
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
              <span style={{ width: 12, height: 12, background: 'rgba(74, 222, 128, 0.2)', border: '1px solid rgba(74, 222, 128, 0.3)', borderRadius: 3 }}></span> High
            </div>
          </div>
        </div>
        <div style={{ overflow: 'auto', maxHeight: 600 }}>
          <table className="w-full text-sm border-collapse">
            <thead style={{ position: 'sticky', top: 0, zIndex: 20, background: '#0f172a' }}>
              <tr className="table-header">
                <th style={{ padding: '10px 12px', border: '1px solid rgba(148,163,184,0.1)', color: '#fcd34d', position: 'sticky', left: 0, zIndex: 30, minWidth: 80, fontSize: 13 }}>FAT \ SNF</th>
                {config.snfValues.map((snf: number) => (
                  <th key={snf} style={{ padding: '10px 12px', border: '1px solid rgba(148,163,184,0.1)', color: '#fcd34d', textAlign: 'center', minWidth: 60, fontSize: 13 }}>{snf.toFixed(1)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.fatValues.map((fat: number) => {
                const fatKey = fat.toFixed(1).replace('.', '_');
                return (
                  <tr key={fat} className="table-row">
                    <th style={{ padding: '8px 10px', border: '1px solid rgba(148,163,184,0.1)', background: 'rgba(15,23,42,0.8)', color: '#f1f5f9', position: 'sticky', left: 0, zIndex: 10, textAlign: 'center', fontSize: 12 }}>{fat.toFixed(1)}</th>
                    {config.snfValues.map((snf: number) => {
                      const snfKey = snf.toFixed(1).replace('.', '_');
                      const rate = config.rateMap[fatKey]?.[snfKey] || 0;
                      return (
                        <td key={`${fat}-${snf}`} style={{ padding: '8px 10px', border: '1px solid rgba(148,163,184,0.1)', textAlign: 'center', color: '#cbd5e1', background: getCellColor(rate), fontSize: 12 }}>
                          {rate > 0 ? rate.toFixed(2) : '-'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto animate-fadeUp" style={{ padding: 24 }}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="page-title">Rate Chart Management</h1>
          <p style={{ color: '#94a3b8', marginTop: 4 }}>
            {userIsAdmin ? 'Import and manage global rate configurations' : 'Rate chart is managed by admin'}
          </p>
        </div>
        {userIsAdmin && (
          <div className="flex gap-3" style={{ marginBottom: 20 }}>
            <button
              onClick={() => setShowImportPopup(true)}
              className="btn-primary"
            >
              <FileSpreadsheet size={20} />
              Import & Publish
            </button>
            <button
              onClick={loadHistory}
              className="btn-secondary"
            >
              <History size={20} />
              History
            </button>
          </div>
        )}
      </div>

      {!userIsAdmin && (
        <div className="glass-card" style={{ background: 'rgba(56,189,248,0.1)', borderColor: 'rgba(56,189,248,0.3)', padding: 16, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <ShieldCheck color="#38bdf8" size={24} />
          <p style={{ color: '#38bdf8', fontWeight: 600 }}>Global Rate Chart — Read Only Access</p>
        </div>
      )}

      {currentConfig ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f59e0b', fontWeight: 800, fontSize: 14, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 12 }}>
            <TableIcon size={18} />
            Current Active Rate Chart
          </div>
          <div style={{ marginTop: 20, padding: '20px 24px' }}>
            <RateTable config={currentConfig} />
          </div>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: 64, textAlign: 'center', borderStyle: 'dashed' }}>
          <div style={{ width: 80, height: 80, background: 'rgba(245,158,11,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <FileSpreadsheet color="#f59e0b" size={40} />
          </div>
          <h3 style={{ color: '#f1f5f9', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>No Rate Chart Found</h3>
          <p style={{ color: '#94a3b8', marginBottom: 32, maxWidth: 400, margin: '0 auto 32px' }}>
            {userIsAdmin ? 'Please import an Excel or CSV file to publish the rate chart for all users.' : 'No rate chart uploaded yet. Please contact your administrator.'}
          </p>
          {userIsAdmin && (
            <button onClick={() => setShowImportPopup(true)} className="btn-primary" style={{ padding: '12px 32px', fontSize: 16 }}>Import Now</button>
          )}
        </div>
      )}

      {/* Import Popup */}
      {showImportPopup && userIsAdmin && (
        <div className="modal-overlay">
          <div className="modal-box animate-fadeUp" style={{ maxWidth: 450, padding: 28 }}>
            <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="text-xl font-bold text-white">Import & Publish Chart</h2>
              <button onClick={() => setShowImportPopup(false)} className="text-slate-400 hover:text-white transition">
                <X size={24} />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label className="label-text" style={{ marginBottom: 8, fontSize: 12, display: 'block' }}>Effective From Date</label>
                <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="input-field" style={{ padding: '10px 14px', marginBottom: 0 }} />
              </div>

              <div 
                style={{ padding: '32px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, border: '2px dashed rgba(148,163,184,0.3)', borderRadius: 12, textAlign: 'center', transition: 'all 0.3s ease', cursor: 'pointer', ...(selectedFile ? { borderColor: 'rgba(245,158,11,0.5)', background: 'rgba(245,158,11,0.05)' } : {}) }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setSelectedFile(file);
                    e.target.value = '';
                  }}
                />
                {selectedFile ? (
                  <>
                    <FileSpreadsheet className="text-amber-500" size={40} />
                    <p className="text-white font-bold" style={{ fontSize: 15, fontWeight: 600 }}>{selectedFile.name}</p>
                    <p className="text-slate-400" style={{ fontSize: 12, opacity: 0.6 }}>File selected. Click to change.</p>
                  </>
                ) : (
                  <>
                    <Upload className="text-slate-500" size={40} />
                    <p className="text-white font-bold" style={{ fontSize: 15, fontWeight: 600 }}>Click to Upload Excel or CSV</p>
                    <p className="text-slate-400" style={{ fontSize: 12, opacity: 0.6 }}>Supports .xlsx, .xls and .csv formats</p>
                  </>
                )}
              </div>

              {selectedFile && (
                <button 
                  onClick={() => handleFileImport(selectedFile!, effectiveDate)}
                  className="btn-primary w-full py-3"
                >
                  Publish Rate Chart
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="modal-overlay">
          <div className="modal-box animate-fadeUp" style={{ maxWidth: 600 }}>
            <div className="flex justify-between items-center mb-8 border-b border-slate-700 pb-4">
              <h2 className="text-xl font-bold text-white">Rate Chart History</h2>
              <button onClick={() => setShowHistoryModal(false)} className="text-slate-400 hover:text-white transition">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              {history.map((config, idx) => (
                <div 
                  key={idx} 
                  className="glass-card p-4 flex items-center justify-between hover:border-amber-500/30 transition-colors cursor-pointer"
                  onClick={() => {
                    setViewingConfig(config);
                    setShowHistoryModal(false);
                  }}
                >
                  <div>
                    <p className="text-white font-bold">Effective: {config.effectiveFrom}</p>
                    <p className="text-slate-400 text-xs">Imported: {new Date(config.importedAt).toLocaleDateString()} {config.fileName ? `(${config.fileName})` : ''}</p>
                  </div>
                  <button className="btn-info">View Chart</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* View History Config Modal */}
      {viewingConfig && (
        <div className="modal-overlay">
          <div className="modal-box animate-fadeUp" style={{ maxWidth: '90%', width: 1000 }}>
            <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
              <h2 className="text-xl font-bold text-white">Historical Rate Chart</h2>
              <button onClick={() => setViewingConfig(null)} className="text-slate-400 hover:text-white transition">
                <X size={24} />
              </button>
            </div>
            <RateTable config={viewingConfig} />
            <div className="mt-6 flex justify-end">
              <button onClick={() => setViewingConfig(null)} className="btn-secondary">Close View</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RateChart;
