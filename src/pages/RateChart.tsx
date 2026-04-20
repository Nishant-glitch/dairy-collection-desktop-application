import React, { useState, useEffect, useRef } from 'react';
import { ref, get, set, push } from 'firebase/database';
import { database } from '../firebase/config';
import { isAdmin } from '../utils/userDb';
import { FileSpreadsheet, History, X, Table as TableIcon, ShieldCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseDairyExcel } from '../utils/excelParser';

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

  const handleExcelImport = async (file: File, effectiveFrom: string) => {
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target?.result as ArrayBuffer;
          const { rateMap, snfValues, fatValues } = parseDairyExcel(data);

          const config = {
            rateMap,
            snfValues,
            fatValues,
            effectiveFrom,
            importedAt: Date.now(),
            type: 'excel',
            fileName: file.name,
          };

          // Save to Firebase
          await set(ref(database, 'globalRateConfig/current'), config);
          await push(ref(database, 'globalRateConfig/history'), config);

          setCurrentConfig(config);
          setSelectedFile(null);
          setShowImportPopup(false);
          alert(`✓ Rate chart published successfully!\nFile: ${file.name}\nEffective from: ${effectiveFrom}\nFAT values: ${fatValues.length} | SNF values: ${snfValues.length}`);

        } catch (parseError) {
          console.error('Parse error:', parseError);
          alert('Could not read Excel file. Please ensure it is a valid .xlsx or .xls file.');
        }
      };
      reader.onerror = () => alert('Failed to read file.');
      reader.readAsArrayBuffer(file);
    } catch (err) {
      console.error('Import error:', err);
      alert('Import failed. Please try again.');
    }
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
            <div className="flex justify-between items-center" style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <h2 style={{ fontSize: 20, fontWeight: 'bold', color: 'white' }}>Import & Publish Chart</h2>
              <button onClick={() => { setShowImportPopup(false); setSelectedFile(null); }} style={{ color: 'rgba(255,255,255,0.6)', cursor: 'pointer', background: 'none', border: 'none' }}>
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="label-text" style={{ marginBottom: '8px', fontSize: '12px' }}>Effective From Date</label>
                <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="input-3d" style={{ padding: '10px 14px', marginBottom: '20px' }} />
              </div>

              <div onClick={() => fileInputRef.current?.click()} style={{
                border: '2px dashed rgba(74,222,128,0.4)',
                borderRadius: 12, padding: '32px 20px',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 12,
                cursor: 'pointer', marginBottom: 16,
                background: selectedFile ? 'rgba(74,222,128,0.08)' : 'transparent',
                transition: 'all 0.2s'
              }}>
                <FileSpreadsheet style={{ width: 48, height: 48, color: '#4ade80' }} />
                <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>
                  {selectedFile ? '✓ File Selected' : 'Click to Upload Excel'}
                </div>
                <div style={{ fontSize: 13, color: '#94a3b8' }}>
                  Supports .xlsx and .xls formats
                </div>
              </div>

              {/* Show selected file name */}
              {selectedFile && (
                <div style={{
                  background: 'rgba(74,222,128,0.1)',
                  border: '1px solid rgba(74,222,128,0.3)',
                  borderRadius: 10, padding: '10px 14px',
                  marginBottom: 16,
                  display: 'flex', alignItems: 'center', gap: 10
                }}>
                  <FileSpreadsheet style={{ width: 18, height: 18, color: '#4ade80' }} />
                  <span style={{ fontSize: 14, color: '#4ade80', fontWeight: 600 }}>
                    {selectedFile.name}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                    style={{
                      marginLeft: 'auto', background: 'none', border: 'none',
                      color: '#f87171', cursor: 'pointer', fontSize: 18, lineHeight: 1
                    }}
                  >×</button>
                </div>
              )}

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setSelectedFile(file);
                  e.target.value = '';
                }}
              />

              {/* Upload & Publish button — only show when file selected */}
              {selectedFile && (
                <button
                  onClick={() => handleExcelImport(selectedFile, effectiveDate)}
                  style={{
                    width: '100%', padding: '13px',
                    background: 'linear-gradient(135deg, #4ade80, #16a34a)',
                    border: 'none', borderRadius: 10,
                    color: '#0f172a', fontWeight: 700, fontSize: 15,
                    cursor: 'pointer', marginTop: 8,
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 8
                  }}
                >
                  🚀 Upload & Publish Rate Chart
                </button>
              )}
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
