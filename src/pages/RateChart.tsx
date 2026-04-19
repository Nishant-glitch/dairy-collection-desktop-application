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

        // Parse SNF values from row 0 (skip first cell)
        const snfValues = json[0].slice(1).map(Number).filter(v => !isNaN(v));
        
        // Parse FAT rows
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
        
        // Save to GLOBAL paths
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
    if (rate === 0) return 'bg-white';
    if (rate < 35) return 'bg-red-50';
    if (rate < 45) return 'bg-yellow-50';
    return 'bg-green-50';
  };

  const RateTable = ({ config }: { config: any }) => {
    if (!config || !config.rateMap) return null;
    
    return (
      <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
        <div className="p-4 bg-green-50 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-green-900">
              Rate Chart — Effective from {config.effectiveFrom}
            </h3>
            <p className="text-xs text-green-700">
              Imported on: {new Date(config.importedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex gap-2">
            <div className="flex items-center gap-1 text-xs">
              <span className="w-3 h-3 bg-red-50 border border-red-200 rounded"></span> Low
            </div>
            <div className="flex items-center gap-1 text-xs">
              <span className="w-3 h-3 bg-yellow-50 border border-yellow-200 rounded"></span> Mid
            </div>
            <div className="flex items-center gap-1 text-xs">
              <span className="w-3 h-3 bg-green-50 border border-green-200 rounded"></span> High
            </div>
          </div>
        </div>
        <div className="overflow-auto max-h-[600px]">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="sticky top-0 z-20 bg-gray-100">
              <tr>
                <th className="p-2 border bg-gray-200 sticky left-0 z-30 min-w-[80px]">FAT \ SNF</th>
                {config.snfValues.map((snf: number) => (
                  <th key={snf} className="p-2 border min-w-[60px] text-center">{snf.toFixed(1)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.fatValues.map((fat: number) => (
                <tr key={fat}>
                  <th className="p-2 border bg-gray-100 sticky left-0 z-10 text-center">{fat.toFixed(1)}</th>
                  {config.snfValues.map((snf: number) => {
                    const rate = config.rateMap[fat]?.[snf] || 0;
                    return (
                      <td key={`${fat}-${snf}`} className={`p-2 border text-center ${getCellColor(rate)}`}>
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
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-green-900">Rate Chart Management</h1>
          <p className="text-gray-600">
            {userIsAdmin ? 'Import and manage global rate configurations' : 'Rate chart is managed by admin'}
          </p>
        </div>
        {userIsAdmin && (
          <div className="flex gap-3">
            <button
              onClick={() => setShowImportPopup(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition shadow-md"
            >
              <FileSpreadsheet size={20} />
              Import & Publish
            </button>
            <button
              onClick={loadHistory}
              className="flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 px-4 py-2 rounded-lg transition shadow-sm"
            >
              <History size={20} />
              View Import History
            </button>
          </div>
        )}
      </div>

      {!userIsAdmin && (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 flex items-center gap-3">
          <ShieldCheck className="text-blue-600" size={24} />
          <p className="text-blue-800 font-medium">Global Rate Chart — Read Only Access</p>
        </div>
      )}

      {currentConfig ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-800 font-semibold mb-2">
            <TableIcon size={20} />
            Current Active Rate Chart
          </div>
          <RateTable config={currentConfig} />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center border border-dashed border-gray-300">
          <div className="bg-green-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileSpreadsheet className="text-green-600" size={32} />
          </div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">No Rate Chart Found</h3>
          <p className="text-gray-600 mb-6">
            {userIsAdmin ? 'Please import an Excel file to publish the rate chart.' : 'No rate chart uploaded yet. Contact admin.'}
          </p>
          {userIsAdmin && (
            <button
              onClick={() => setShowImportPopup(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition"
            >
              Import Now
            </button>
          )}
        </div>
      )}

      {/* Import Popup */}
      {showImportPopup && userIsAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">Import & Publish Chart</h2>
              <button onClick={() => setShowImportPopup(false)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Effective From Date</label>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              
              <div className="pt-4 flex gap-3">
                <button
                  onClick={() => setShowImportPopup(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <label className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition text-center cursor-pointer shadow-md">
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
              
              <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
                <p className="font-bold mb-1">Excel Format Guide:</p>
                <ul className="list-disc ml-4 space-y-1">
                  <li>Row 1: Header row (first cell empty, then SNF values)</li>
                  <li>Column 1: FAT values</li>
                  <li>Cells: Rate values</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && userIsAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">Import History</h2>
              <button onClick={() => setShowHistoryModal(false)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-bold">
                  <tr>
                    <th className="px-4 py-3 border-b">Effective From</th>
                    <th className="px-4 py-3 border-b">Imported At</th>
                    <th className="px-4 py-3 border-b text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{item.effectiveFrom}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(item.importedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setViewingConfig(item)}
                          className="text-green-600 hover:text-green-800 font-semibold"
                        >
                          View Chart
                        </button>
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                        No history available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* View Chart Modal (from History) */}
      {viewingConfig && userIsAdmin && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-6xl w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">Historical Rate Chart</h2>
              <button onClick={() => setViewingConfig(null)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            <div className="overflow-auto flex-1">
              <RateTable config={viewingConfig} />
            </div>
            <div className="mt-4 text-right">
              <button
                onClick={() => setViewingConfig(null)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2 rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RateChart;
