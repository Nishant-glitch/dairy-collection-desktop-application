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
    if (rate < 35) return 'rgba(248, 113, 113, 0.1)';
    if (rate < 45) return 'rgba(74, 222, 128, 0.1)';
    return 'rgba(74, 222, 128, 0.2)';
  };

  const RateTable = ({ config }: { config: any }) => {
    if (!config || !config.rateMap) return null;
    
    return (
      <div className="glass-card overflow-hidden">
        <div style={{ padding: 20, background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: 'white', fontWeight: 800, fontSize: 18 }}>
              Rate Chart — Effective from {config.effectiveFrom}
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 4 }}>
              Imported on: {new Date(config.importedAt).toLocaleString()}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
              <span style={{ width: 12, height: 12, background: 'rgba(248, 113, 113, 0.2)', border: '1px solid rgba(248, 113, 113, 0.3)', borderRadius: 3 }}></span> Low
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
              <span style={{ width: 12, height: 12, background: 'rgba(74, 222, 128, 0.1)', border: '1px solid rgba(74, 222, 128, 0.3)', borderRadius: 3 }}></span> Mid
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
              <span style={{ width: 12, height: 12, background: 'rgba(74, 222, 128, 0.2)', border: '1px solid rgba(74, 222, 128, 0.3)', borderRadius: 3 }}></span> High
            </div>
          </div>
        </div>
        <div style={{ overflow: 'auto', maxHeight: 600 }}>
          <table className="w-full text-sm border-collapse table-3d">
            <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
              <tr className="table-header">
                <th style={{ padding: 12, border: '1px solid rgba(255,255,255,0.1)', color: 'white', position: 'sticky', left: 0, zIndex: 30, minWidth: 80 }}>FAT \ SNF</th>
                {config.snfValues.map((snf: number) => (
                  <th key={snf} style={{ padding: 12, border: '1px solid rgba(255,255,255,0.1)', color: 'white', textAlign: 'center', minWidth: 60 }}>{snf.toFixed(1)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.fatValues.map((fat: number) => (
                <tr key={fat} className="table-row">
                  <th style={{ padding: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', position: 'sticky', left: 0, zIndex: 10, textAlign: 'center' }}>{fat.toFixed(1)}</th>
                  {config.snfValues.map((snf: number) => {
                    const rate = config.rateMap[fat]?.[snf] || 0;
                    return (
                      <td key={`${fat}-${snf}`} style={{ padding: 12, border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', color: 'rgba(255,255,255,0.85)', background: getCellColor(rate) }}>
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
    <div className="page-wrapper animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="page-title">Rate Chart Management</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
            {userIsAdmin ? 'Import and manage global rate configurations' : 'Rate chart is managed by admin'}
          </p>
        </div>
        {userIsAdmin && (
          <div className="flex gap-3">
            <button
              onClick={() => setShowImportPopup(true)}
              className="btn-3d"
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
        <div className="glass-card" style={{ background: 'rgba(74,222,128,0.1)', borderColor: 'rgba(74,222,128,0.3)', padding: 16, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <ShieldCheck color="#4ade80" size={24} />
          <p style={{ color: '#4ade80', fontWeight: 600 }}>Global Rate Chart — Read Only Access</p>
        </div>
      )}

      {userIsAdmin && (
        <div className="glass-card" style={{ padding: '16px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(74,222,128,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <FileSpreadsheet color="#4ade80" size={24} />
            <div>
              <p style={{ color: 'white', fontSize: '14px', fontWeight: 700 }}>Admin: Upload Rate Chart</p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>Admin can upload rate chart from Excel file. All users will automatically get the updated rates.</p>
            </div>
          </div>
          <button onClick={() => setShowImportPopup(true)} className="btn-3d" style={{ padding: '8px 20px', fontSize: '13px' }}>Import Excel</button>
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
        <div className="glass-card" style={{ height: '180px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.15)', padding: '20px' }}>
          <div style={{ width: 40, height: 40, background: 'rgba(74,222,128,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
            <FileSpreadsheet color="#4ade80" size={20} />
          </div>
          <h3 style={{ color: 'white', fontSize: 14, fontWeight: 800, marginBottom: 4 }}>No Rate Chart Found</h3>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', maxWidth: 400 }}>
            {userIsAdmin ? 'Please import an Excel file to publish the rate chart for all users.' : 'No rate chart uploaded yet. Please contact your administrator.'}
          </p>
        </div>
      )}

      {/* Import Popup */}
      {showImportPopup && userIsAdmin && (
        <div className="modal-overlay">
          <div className="modal-3d animate-fadeIn" style={{ maxWidth: 400, padding: 28, width: '90%' }}>
            <div className="flex justify-between items-center mb-8" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 'bold', color: 'white' }}>Import & Publish Chart</h2>
              <button onClick={() => setShowImportPopup(false)} style={{ color: 'rgba(255,255,255,0.6)', cursor: 'pointer', background: 'none', border: 'none' }}>
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="label-text">Effective From Date</label>
                <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="input-3d" />
              </div>

              <div className="p-8 border-2 border-dashed border-slate-700 rounded-2xl text-center hover:border-green-500/50 transition-colors cursor-pointer relative" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleExcelImport(file, effectiveDate);
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <FileSpreadsheet className="mx-auto mb-4" color="#4ade80" size={48} />
                <p style={{ color: 'white', fontWeight: 'bold' }}>Click to Upload Excel</p>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 8 }}>Supports .xlsx and .xls formats</p>
              </div>

              <div className="p-4 glass-card">
                <h4 style={{ color: '#4ade80', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 8 }}>Required Format</h4>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, lineHeight: 1.6 }}>
                  First row: SNF values (starting from 2nd column)<br/>
                  First column: FAT values (starting from 2nd row)<br/>
                  Cells: Rate per liter
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="modal-overlay">
          <div className="modal-3d animate-fadeIn" style={{ maxWidth: 500, padding: 28, width: '90%' }}>
            <div className="flex justify-between items-center mb-8" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 'bold', color: 'white' }}>Rate Chart History</h2>
              <button onClick={() => setShowHistoryModal(false)} style={{ color: 'rgba(255,255,255,0.6)', cursor: 'pointer', background: 'none', border: 'none' }}>
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              {history.map((config, idx) => (
                <div 
                  key={idx} 
                  className="glass-card p-4 flex items-center justify-between hover:border-green-500/30 transition-colors cursor-pointer"
                  onClick={() => {
                    setViewingConfig(config);
                    setShowHistoryModal(false);
                  }}
                >
                  <div>
                    <p style={{ color: 'white', fontWeight: 'bold' }}>Effective: {config.effectiveFrom}</p>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Imported: {new Date(config.importedAt).toLocaleDateString()}</p>
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
          <div className="modal-3d animate-fadeIn" style={{ maxWidth: '90%', width: 1000, padding: 32 }}>
            <div className="flex justify-between items-center mb-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 'bold', color: 'white' }}>Historical Rate Chart</h2>
              <button onClick={() => setViewingConfig(null)} style={{ color: 'rgba(255,255,255,0.6)', cursor: 'pointer', background: 'none', border: 'none' }}>
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
