import React, { useState, useEffect } from 'react';
import { ref, get, set, push } from 'firebase/database';
import { database } from '../firebase/config';
import { isAdmin } from '../utils/userDb';
import { FileSpreadsheet, History, X, Table as TableIcon, ShieldCheck } from 'lucide-react';
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
  
  return config.rateMap[closestFat]?.[closestSnf] || 0;
};

const RateChart: React.FC = () => {
  const [currentConfig, setCurrentConfig] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showImportPopup, setShowImportPopup] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [viewingConfig, setViewingConfig] = useState<any>(null);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
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

  const handleExcelImport = (file: File, effectiveFrom: string) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        
        if (json.length < 2) {
          alert('Invalid Excel format. Please check the template.');
          return;
        }

        const snfValues = json[0].slice(1).map(Number).filter(v => !isNaN(v));
        
        const rateMap: any = {};
        for (let i = 1; i < json.length; i++) {
          const fat = parseFloat(json[i][0]);
          if (isNaN(fat)) continue;
          rateMap[fat] = {};
          snfValues.forEach((snf, idx) => {
            rateMap[fat][snf] = parseFloat(json[i][idx + 1]) || 0;
          });
        }
        
        const fatValues = Object.keys(rateMap).map(Number).sort((a, b) => a - b);

        const config = {
          rateMap,
          snfValues,
          fatValues,
          effectiveFrom,
          importedAt: Date.now(),
          type: 'excel'
        };
        
        await set(ref(database, 'globalRateConfig/current'), config);
        await push(ref(database, 'globalRateConfig/history'), config);
        
        setCurrentConfig(config);
        setShowImportPopup(false);
        alert('✓ Rate chart published! All users will now use this chart.');
      } catch (error) {
        console.error('Error importing Excel:', error);
        alert('Error importing Excel file. Please ensure it follows the required format.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const getCellColor = (rate: number) => {
    if (rate === 0) return 'transparent';
    if (rate < 35) return 'rgba(239, 68, 68, 0.1)';
    if (rate < 45) return 'rgba(234, 179, 8, 0.1)';
    return 'rgba(74, 222, 128, 0.1)';
  };

  const RateTable = ({ config }: { config: any }) => {
    if (!config || !config.rateMap) return null;
    
    return (
      <div className="glass-card overflow-hidden">
        <div style={{ padding: 20, background: 'rgba(74, 222, 128, 0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: 'white', fontWeight: 800, fontSize: 18 }}>
              Rate Chart — Effective from {config.effectiveFrom}
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4 }}>
              Imported on: {new Date(config.importedAt).toLocaleString()}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
              <span style={{ width: 12, height: 12, background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 3 }}></span> Low
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
              <span style={{ width: 12, height: 12, background: 'rgba(234, 179, 8, 0.2)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: 3 }}></span> Mid
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
              <span style={{ width: 12, height: 12, background: 'rgba(74, 222, 128, 0.2)', border: '1px solid rgba(74, 222, 128, 0.3)', borderRadius: 3 }}></span> High
            </div>
          </div>
        </div>
        <div style={{ overflow: 'auto', maxHeight: 600 }}>
          <table className="w-full text-sm border-collapse">
            <thead style={{ position: 'sticky', top: 0, zIndex: 20, background: '#0a1f0f' }}>
              <tr>
                <th style={{ padding: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'linear-gradient(135deg, #1a5c2e, #2d9e4f)', color: 'white', position: 'sticky', left: 0, zIndex: 30, minWidth: 80 }}>FAT \ SNF</th>
                {config.snfValues.map((snf: number) => (
                  <th key={snf} style={{ padding: 12, border: '1px solid rgba(255,255,255,0.1)', color: 'white', textAlign: 'center', minWidth: 60 }}>{snf.toFixed(1)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.fatValues.map((fat: number) => (
                <tr key={fat}>
                  <th style={{ padding: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'white', position: 'sticky', left: 0, zIndex: 10, textAlign: 'center' }}>{fat.toFixed(1)}</th>
                  {config.snfValues.map((snf: number) => {
                    const rate = config.rateMap[fat]?.[snf] || 0;
                    return (
                      <td key={`${fat}-${snf}`} style={{ padding: 12, border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', color: 'rgba(255,255,255,0.8)', background: getCellColor(rate) }}>
                        {rate > 0 ? rate.toFixed(2) : '-'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 style={{ color: 'white', fontWeight: 800, fontSize: 28, textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>Rate Chart Management</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
            {userIsAdmin ? 'Import and manage global rate configurations' : 'Rate chart is managed by admin'}
          </p>
        </div>
        {userIsAdmin && (
          <div className="flex gap-3">
            <button
              onClick={() => setShowImportPopup(true)}
              className="btn-3d"
              style={{ padding: '10px 20px' }}
            >
              <FileSpreadsheet size={20} />
              Import & Publish
            </button>
            <button
              onClick={loadHistory}
              className="btn-3d"
              style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.05)', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <History size={20} />
              History
            </button>
          </div>
        )}
      </div>

      {!userIsAdmin && (
        <div className="glass-card" style={{ background: 'rgba(37, 99, 235, 0.1)', borderColor: 'rgba(37, 99, 235, 0.3)', padding: 16, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <ShieldCheck color="#3b82f6" size={24} />
          <p style={{ color: '#93c5fd', fontWeight: 600 }}>Global Rate Chart — Read Only Access</p>
        </div>
      )}

      {currentConfig ? (
        <div className="space-y-4">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#4ade80', fontWeight: 800, fontSize: 14, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 12 }}>
            <TableIcon size={18} />
            Current Active Rate Chart
          </div>
          <RateTable config={currentConfig} />
        </div>
      ) : (
        <div className="glass-card" style={{ padding: 64, textAlign: 'center', borderStyle: 'dashed' }}>
          <div style={{ width: 80, height: 80, background: 'rgba(74, 222, 128, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <FileSpreadsheet color="#4ade80" size={40} />
          </div>
          <h3 style={{ color: 'white', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>No Rate Chart Found</h3>
          <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 32, maxWidth: 400, margin: '0 auto 32px' }}>
            {userIsAdmin ? 'Please import an Excel file to publish the rate chart for all users.' : 'No rate chart uploaded yet. Please contact your administrator.'}
          </p>
          {userIsAdmin && (
            <button onClick={() => setShowImportPopup(true)} className="btn-3d" style={{ padding: '12px 32px', fontSize: 16 }}>Import Now</button>
          )}
        </div>
      )}

      {/* Import Popup */}
      {showImportPopup && userIsAdmin && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="modal-3d animate-fadeIn" style={{ padding: 32, maxWidth: 450, width: '90%' }}>
            <div className="flex justify-between items-center mb-8">
              <h2 style={{ color: 'white', fontWeight: 800, fontSize: 22 }}>Import & Publish Chart</h2>
              <button onClick={() => setShowImportPopup(false)} className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-6">
              <div>
                <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'block' }}>Effective From Date</label>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="input-3d w-full"
                />
              </div>
              
              <div className="pt-4 flex gap-4">
                <button onClick={() => setShowImportPopup(false)} className="btn-3d flex-1" style={{ background: 'rgba(255,255,255,0.05)', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.1)' }}>Cancel</button>
                <label className="btn-3d flex-1 cursor-pointer">
                  Select & Publish
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleExcelImport(file, effectiveDate);
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="modal-3d animate-fadeIn" style={{ padding: 32, maxWidth: 800, width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex justify-between items-center mb-8">
              <h2 style={{ color: 'white', fontWeight: 800, fontSize: 22 }}>Import History</h2>
              <button onClick={() => setShowHistoryModal(false)} className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition">
                <X size={24} />
              </button>
            </div>

            <div className="table-3d overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="px-4 py-3">Effective Date</th>
                    <th className="px-4 py-3">Imported On</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((config, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-3 font-bold">{config.effectiveFrom}</td>
                      <td className="px-4 py-3">{new Date(config.importedAt).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          <button
                            onClick={() => {
                              setViewingConfig(config);
                              setShowHistoryModal(false);
                            }}
                            className="btn-3d"
                            style={{ padding: '6px 12px', fontSize: 12 }}
                          >
                            View Chart
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <button onClick={() => setShowHistoryModal(false)} className="btn-3d w-full mt-8" style={{ background: 'rgba(255,255,255,0.05)', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.1)' }}>Close</button>
          </div>
        </div>
      )}

      {/* Viewing Config Modal */}
      {viewingConfig && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="modal-3d animate-fadeIn" style={{ padding: 32, maxWidth: 1000, width: '95%', maxHeight: '95vh', overflowY: 'auto' }}>
            <div className="flex justify-between items-center mb-6">
              <h2 style={{ color: 'white', fontWeight: 800, fontSize: 22 }}>Historical Rate Chart</h2>
              <button onClick={() => setViewingConfig(null)} className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition">
                <X size={24} />
              </button>
            </div>
            <RateTable config={viewingConfig} />
            <button onClick={() => setViewingConfig(null)} className="btn-3d w-full mt-8" style={{ background: 'rgba(255,255,255,0.05)', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.1)' }}>Close View</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RateChart;
