import React, { useState, useEffect, useRef } from 'react';
import { ref, get, set, push } from 'firebase/database';
import { database } from '../firebase/config';
import { isAdmin } from '../utils/userDb';
import { FileSpreadsheet, History, X, Table as TableIcon, ShieldCheck, Plus, Trash2, Save, RotateCcw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getRawExcelData, formatTo2Decimal } from '../utils/excelParser';

export const getRateFromMap = (fat: number, snf: number, config: any): number => {
  if (!config || !config.rateMap) return 0;
  
  const fatValues = config.fatValues.map(Number).sort((a: number, b: number) => a - b);
  const snfValues = config.snfValues.map(Number).sort((a: number, b: number) => a - b);
  
  if (fatValues.length === 0 || snfValues.length === 0) return 0;

  const cappedFat = Math.min(fat, fatValues[fatValues.length - 1]);
  const closestFat = fatValues.reduce((prev: number, curr: number) =>
    Math.abs(curr - cappedFat) < Math.abs(prev - cappedFat) ? curr : prev
  );
  
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
  
  // Manual Entry State
  const [snfList, setSnfList] = useState<string[]>(['7.5', '7.6', '7.7']);
  const [fatList, setFatList] = useState<string[]>(['2.5', '2.6', '2.7']);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [editMode, setEditMode] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const userIsAdmin = isAdmin();

  useEffect(() => {
    loadCurrentConfig();
  }, []);

  const loadCurrentConfig = async () => {
    const snap = await get(ref(database, 'globalRateConfig/current'));
    if (snap.exists()) {
      const config = snap.val();
      setCurrentConfig(config);
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

  const validateInput = (value: string) => {
    return /^\d*\.?\d{0,2}$/.test(value);
  };

  const updateRate = (fat: any, snf: any, value: any) => {
    const fatNum = Number(fat);
    const snfNum = Number(snf);

    if (isNaN(fatNum) || isNaN(snfNum)) return;

    let num = Number(value);
    if (isNaN(num)) return;

    num = Number(num.toFixed(2));

    const key = `${fatNum}-${snfNum}`;

    setRates(prev => ({
      ...prev,
      [key]: num
    }));
  };

  const handleRateBlur = (fat: any, snf: any, value: any) => {
    if (value === "") return;
    updateRate(fat, snf, value);
  };

  const updateFatValue = (index: number, value: string) => {
    if (!validateInput(value)) return;
    const newList = [...fatList];
    newList[index] = value;
    setFatList(newList);
  };

  const updateSnfValue = (index: number, value: string) => {
    if (!validateInput(value)) return;
    const newList = [...snfList];
    newList[index] = value;
    setSnfList(newList);
  };

  const addFatRow = () => setFatList([...fatList, ""]);
  const addSnfColumn = () => setSnfList([...snfList, ""]);
  
  const deleteFatRow = (index: number) => {
    if (fatList.length <= 1) return;
    setFatList(fatList.filter((_, i) => i !== index));
  };

  const deleteSnfColumn = (index: number) => {
    if (snfList.length <= 1) return;
    setSnfList(snfList.filter((_, i) => i !== index));
  };

  const handleExcelImport = async (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result as ArrayBuffer;
      const raw = getRawExcelData(data);
      if (raw.length > 1) {
        const newSnfs = raw[0].slice(1).map(String);
        const newFats = raw.slice(1).map(row => String(row[0]));
        const newRates: Record<string, number> = {};
        
        raw.slice(1).forEach((row, rIdx) => {
          const fat = row[0];
          row.slice(1).forEach((val, cIdx) => {
            const snf = raw[0][cIdx + 1];
            if (val !== "") {
              const fatNum = Number(fat);
              const snfNum = Number(snf);
              if (!isNaN(fatNum) && !isNaN(snfNum)) {
                const key = `${fatNum}-${snfNum}`;
                newRates[key] = Number(Number(val).toFixed(2));
              }
            }
          });
        });

        setSnfList(newSnfs);
        setFatList(newFats);
        setRates(newRates);
        setEditMode(true);
        setShowImportPopup(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSaveAndPublish = async () => {
    try {
      const result: any[] = [];

      fatList.forEach(fat => {
        const fatNum = Number(fat);
        if (isNaN(fatNum)) return;

        snfList.forEach(snf => {
          const snfNum = Number(snf);
          if (isNaN(snfNum)) return;

          const key = `${fatNum}-${snfNum}`;
          let rate = rates[key];

          if (rate === undefined || (rate as any) === "") return;

          rate = Number(rate);
          if (isNaN(rate)) return;

          result.push({
            fat: fatNum,
            snf: snfNum,
            rate: Number(rate.toFixed(2))
          });
        });
      });

      console.log("PUBLISH DATA:", result);

      if (result.length === 0) {
        alert("No valid data to publish");
        return;
      }

      // Convert result back to the format the application expects for storage
      const validFats = [...new Set(result.map(r => r.fat))].sort((a, b) => a - b);
      const validSnfs = [...new Set(result.map(r => r.snf))].sort((a, b) => a - b);
      
      const rateMap: Record<number, Record<number, number>> = {};
      result.forEach(item => {
        if (!rateMap[item.fat]) rateMap[item.fat] = {};
        rateMap[item.fat][item.snf] = item.rate;
      });

      const config = {
        rateMap,
        snfValues: validSnfs,
        fatValues: validFats,
        effectiveFrom: effectiveDate,
        importedAt: Date.now(),
        type: 'manual',
      };

      await set(ref(database, 'globalRateConfig/current'), config);
      await push(ref(database, 'globalRateConfig/history'), config);

      setCurrentConfig(config);
      setEditMode(false);
      alert(`✓ Rate chart published successfully!`);

    } catch (err) {
      console.error('Save error:', err);
      alert('Failed to publish rate chart.');
    }
  };

  const EditableGrid = () => (
    <div className="glass-card overflow-hidden animate-fadeIn">
      <div style={{ padding: 20, background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ color: 'white', fontWeight: 800, fontSize: 18 }}>Manual Rate Entry</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Effective From:</label>
            <input 
              type="date" 
              value={effectiveDate} 
              onChange={(e) => setEffectiveDate(e.target.value)} 
              className="input-3d" 
              style={{ padding: '4px 10px', fontSize: 12, width: 140 }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={addFatRow} className="btn-secondary" style={{ padding: '8px 12px', fontSize: 12 }}><Plus size={14} /> FAT Row</button>
          <button onClick={addSnfColumn} className="btn-secondary" style={{ padding: '8px 12px', fontSize: 12 }}><Plus size={14} /> SNF Column</button>
          <button onClick={() => setEditMode(false)} className="btn-secondary" style={{ padding: '8px 12px', fontSize: 12, background: 'rgba(248,113,113,0.1)', color: '#f87171' }}><RotateCcw size={14} /> Cancel</button>
          <button onClick={handleSaveAndPublish} className="btn-3d" style={{ padding: '8px 16px', fontSize: 12 }}><Save size={14} /> Save & Publish</button>
        </div>
      </div>
      <div style={{ overflow: 'auto', maxHeight: 600 }}>
        <table className="w-full text-sm border-collapse table-3d">
          <thead>
            <tr className="table-header">
              <th style={{ padding: 8, border: '1px solid rgba(255,255,255,0.1)', color: 'white', position: 'sticky', left: 0, zIndex: 30, background: '#1e293b', minWidth: 100 }}>FAT \ SNF</th>
              {snfList.map((snf, idx) => (
                <th key={idx} style={{ padding: 4, border: '1px solid rgba(255,255,255,0.1)', minWidth: 80 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                    <input 
                      type="number"
                      step="0.01"
                      value={snf} 
                      onChange={(e) => updateSnfValue(idx, e.target.value)}
                      onBlur={(e) => {
                        if (e.target.value !== "") {
                          const formatted = Number(e.target.value).toFixed(2);
                          updateSnfValue(idx, formatted);
                        }
                      }}
                      className="table-input"
                      placeholder="SNF"
                      style={{ textAlign: 'center', background: snf === "" || isNaN(Number(snf)) ? 'rgba(248,113,113,0.2)' : 'transparent' }}
                    />
                    <button onClick={() => deleteSnfColumn(idx)} style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={12} /></button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fatList.map((fat, rIdx) => (
              <tr key={rIdx} className="table-row">
                <th style={{ padding: 4, border: '1px solid rgba(255,255,255,0.1)', position: 'sticky', left: 0, zIndex: 10, background: '#1e293b' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button onClick={() => deleteFatRow(rIdx)} style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={12} /></button>
                    <input 
                      type="number"
                      step="0.01"
                      value={fat} 
                      onChange={(e) => updateFatValue(rIdx, e.target.value)}
                      onBlur={(e) => {
                        if (e.target.value !== "") {
                          const formatted = Number(e.target.value).toFixed(2);
                          updateFatValue(rIdx, formatted);
                        }
                      }}
                      className="table-input"
                      placeholder="FAT"
                      style={{ textAlign: 'center', background: fat === "" || isNaN(Number(fat)) ? 'rgba(248,113,113,0.2)' : 'transparent' }}
                    />
                  </div>
                </th>
                {snfList.map((snf, cIdx) => {
                  const fatNum = Number(fat);
                  const snfNum = Number(snf);
                  const key = `${fatNum}-${snfNum}`;
                  const val = rates[key] !== undefined ? rates[key] : "";
                  return (
                    <td key={cIdx} style={{ padding: 2, border: '1px solid rgba(255,255,255,0.1)' }}>
                      <input 
                        type="number"
                        step="0.01"
                        value={val} 
                        onChange={(e) => updateRate(fat, snf, e.target.value)}
                        onBlur={(e) => handleRateBlur(fat, snf, e.target.value)}
                        className="table-input"
                        placeholder="0.00"
                        style={{ 
                          textAlign: 'center', 
                          background: isNaN(Number(val)) && val !== "" ? 'rgba(248,113,113,0.2)' : 'transparent'
                        }}
                      />
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

  const RateTable = ({ config }: { config: any }) => {
    if (!config || !config.rateMap) return null;
    return (
      <div className="glass-card overflow-hidden">
        <div style={{ padding: 20, background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: 'white', fontWeight: 800, fontSize: 18 }}>Rate Chart — Effective {config.effectiveFrom}</h3>
          </div>
        </div>
        <div style={{ overflow: 'auto', maxHeight: 600 }}>
          <table className="w-full text-sm border-collapse table-3d">
            <thead>
              <tr className="table-header">
                <th style={{ padding: 12, border: '1px solid rgba(255,255,255,0.1)', color: 'white', position: 'sticky', left: 0, zIndex: 30, minWidth: 80 }}>FAT \ SNF</th>
                {config.snfValues.map((snf: number) => (
                  <th key={snf} style={{ padding: 12, border: '1px solid rgba(255,255,255,0.1)', color: 'white', textAlign: 'center' }}>{snf.toFixed(2)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.fatValues.map((fat: number) => (
                <tr key={fat} className="table-row">
                  <th style={{ padding: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: 'white', position: 'sticky', left: 0, zIndex: 10, textAlign: 'center' }}>{fat.toFixed(2)}</th>
                  {config.snfValues.map((snf: number) => {
                    const rate = config.rateMap[fat]?.[snf] || 0;
                    return (
                      <td key={`${fat}-${snf}`} style={{ padding: 12, border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', color: 'rgba(255,255,255,0.85)' }}>
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
          <p style={{ color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>Manual entry system with strict 2-decimal precision.</p>
        </div>
        {userIsAdmin && (
          <div className="flex gap-3">
            <button onClick={() => setEditMode(true)} className="btn-3d"><Plus size={20} /> New Manual Entry</button>
            <button onClick={() => setShowImportPopup(true)} className="btn-secondary"><FileSpreadsheet size={20} /> Import Excel</button>
            <button onClick={loadHistory} className="btn-secondary"><History size={20} /> History</button>
          </div>
        )}
      </div>

      {!userIsAdmin && (
        <div className="glass-card" style={{ background: 'rgba(74,222,128,0.1)', borderColor: 'rgba(74,222,128,0.3)', padding: 16, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <ShieldCheck color="#4ade80" size={24} />
          <p style={{ color: '#4ade80', fontWeight: 600 }}>Global Rate Chart — Read Only Access</p>
        </div>
      )}

      {editMode ? (
        <EditableGrid />
      ) : currentConfig ? (
        <div className="space-y-4">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#4ade80', fontWeight: 800, fontSize: 14, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 12 }}>
            <TableIcon size={18} /> Current Active Rate Chart
          </div>
          <RateTable config={currentConfig} />
        </div>
      ) : (
        <div className="glass-card" style={{ height: '180px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.15)', padding: '20px' }}>
          <h3 style={{ color: 'white', fontSize: 14, fontWeight: 800 }}>No Rate Chart Found</h3>
          <button onClick={() => setEditMode(true)} className="btn-3d" style={{ marginTop: 12 }}>Create New Chart</button>
        </div>
      )}

      {showImportPopup && (
        <div className="modal-overlay">
          <div className="modal-3d animate-fadeIn" style={{ maxWidth: 400, padding: 28, width: '90%' }}>
            <div className="flex justify-between items-center mb-6">
              <h2 style={{ fontSize: 20, fontWeight: 'bold', color: 'white' }}>Import Excel (Legacy)</h2>
              <button onClick={() => setShowImportPopup(false)} style={{ color: 'rgba(255,255,255,0.6)', background: 'none', border: 'none' }}><X size={24} /></button>
            </div>
            <div onClick={() => fileInputRef.current?.click()} style={{ border: '2px dashed rgba(74,222,128,0.4)', borderRadius: 12, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <FileSpreadsheet style={{ width: 48, height: 48, color: '#4ade80' }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Click to Upload Excel</div>
            </div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleExcelImport(file);
              e.target.value = '';
            }} />
          </div>
        </div>
      )}

      {showHistoryModal && (
        <div className="modal-overlay">
          <div className="modal-3d animate-fadeIn" style={{ maxWidth: 500, padding: 28, width: '90%' }}>
            <div className="flex justify-between items-center mb-8" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 'bold', color: 'white' }}>Rate Chart History</h2>
              <button onClick={() => setShowHistoryModal(false)} style={{ color: 'rgba(255,255,255,0.6)', background: 'none', border: 'none' }}><X size={24} /></button>
            </div>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              {history.map((config, idx) => (
                <div key={idx} className="glass-card p-4 flex items-center justify-between hover:border-green-500/30 transition-colors cursor-pointer" onClick={() => { setViewingConfig(config); setShowHistoryModal(false); }}>
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

      {viewingConfig && (
        <div className="modal-overlay">
          <div className="modal-3d animate-fadeIn" style={{ maxWidth: '90%', width: 1000, padding: 32 }}>
            <div className="flex justify-between items-center mb-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 'bold', color: 'white' }}>Historical Rate Chart</h2>
              <button onClick={() => setViewingConfig(null)} style={{ color: 'rgba(255,255,255,0.6)', background: 'none', border: 'none' }}><X size={24} /></button>
            </div>
            <RateTable config={viewingConfig} />
          </div>
        </div>
      )}
    </div>
  );
};

export default RateChart;
