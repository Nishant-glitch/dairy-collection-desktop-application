import React, { useState, useEffect } from 'react';
import { ref, get, set, push } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { Save } from 'lucide-react';
import { calcCowRate, calcBuffaloRate, calcMixedRate } from '../utils/rateCalculator';

type TabType = 'cow' | 'buffalo' | 'mixed' | 'calculator';

const RateChart: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('cow');

  // Cow config
  const [cowConfig, setCowConfig] = useState({
    fatFrom: 3.0,
    fatTo: 5.9,
    fatStep: 0.1,
    fatPerKg: 396,
    snfFrom: 7.5,
    snfTo: 8.5,
    snfStep: 0.1,
    snfPerKg: 264,
    effectiveFrom: new Date().toISOString().split('T')[0],
  });

  // Buffalo config
  const [buffaloConfig, setBuffaloConfig] = useState({
    fatFrom: 3.0,
    fatTo: 12.0,
    fatStep: 0.1,
    fatPerKg: 280,
    snfFrom: 8.0,
    snfTo: 10.0,
    snfStep: 0.1,
    snfPerKg: 200,
    effectiveFrom: new Date().toISOString().split('T')[0],
  });

  // Preview tables
  const [cowTable, setCowTable] = useState<{ fat: number; snf: number; rate: number }[][]>([]);
  const [buffaloTable, setBuffaloTable] = useState<{ fat: number; snf: number; rate: number }[][]>([]);
  const [mixedTable, setMixedTable] = useState<{ fat: number; snf: number; rate: number; type: 'cow' | 'buffalo' }[][]>([]);
  const [cowFatValues, setCowFatValues] = useState<number[]>([]);
  const [cowSnfValues, setCowSnfValues] = useState<number[]>([]);
  const [buffaloFatValues, setBuffaloFatValues] = useState<number[]>([]);
  const [buffaloSnfValues, setBuffaloSnfValues] = useState<number[]>([]);
  const [mixedFatValues, setMixedFatValues] = useState<number[]>([]);
  const [mixedSnfValues, setMixedSnfValues] = useState<number[]>([]);
  const [activeMixedChart, setActiveMixedChart] = useState<any>(null);

  // Live calculator
  const [calcMode, setCalcMode] = useState<'cow' | 'buffalo' | 'mix'>('cow');
  const [calcFat, setCalcFat] = useState('');
  const [calcSnf, setCalcSnf] = useState('');
  const [calcQty, setCalcQty] = useState('');

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    const cowRef = await get(ref(database, up('rateConfig/cow/current')));
    if (cowRef.exists()) setCowConfig(cowRef.val());

    const buffaloRef = await get(ref(database, up('rateConfig/buffalo/current')));
    if (buffaloRef.exists()) setBuffaloConfig(buffaloRef.val());

    const mixedRef = await get(ref(database, up('rateConfig/mixed/current')));
    if (mixedRef.exists()) setActiveMixedChart(mixedRef.val());
  };

  const saveCowConfig = async () => {
    const configData = { ...cowConfig, savedAt: Date.now() };
    await set(ref(database, up('rateConfig/cow/current')), configData);
    await push(ref(database, up('rateConfig/cow/history')), configData);
    generateCowTable();
    alert('Cow rate config saved successfully!');
  };

  const saveBuffaloConfig = async () => {
    const configData = { ...buffaloConfig, savedAt: Date.now() };
    await set(ref(database, up('rateConfig/buffalo/current')), configData);
    await push(ref(database, up('rateConfig/buffalo/history')), configData);
    generateBuffaloTable();
    alert('Buffalo rate config saved successfully!');
  };

  const generateCowTable = () => {
    const fats: number[] = [];
    for (let f = cowConfig.fatFrom; f <= cowConfig.fatTo + 0.01; f += cowConfig.fatStep) {
      fats.push(Math.round(f * 10) / 10);
    }

    const snfs: number[] = [];
    for (let s = cowConfig.snfFrom; s <= cowConfig.snfTo + 0.01; s += cowConfig.snfStep) {
      snfs.push(Math.round(s * 10) / 10);
    }

    const table = fats.map((f) =>
      snfs.map((s) => ({
        fat: f,
        snf: s,
        rate: calcCowRate(f, s, cowConfig),
      }))
    );

    setCowFatValues(fats);
    setCowSnfValues(snfs);
    setCowTable(table);
  };

  const generateBuffaloTable = () => {
    const fats: number[] = [];
    for (let f = buffaloConfig.fatFrom; f <= buffaloConfig.fatTo + 0.01; f += buffaloConfig.fatStep) {
      fats.push(Math.round(f * 10) / 10);
    }

    const snfs: number[] = [];
    for (let s = buffaloConfig.snfFrom; s <= buffaloConfig.snfTo + 0.01; s += buffaloConfig.snfStep) {
      snfs.push(Math.round(s * 10) / 10);
    }

    const table = fats.map((f) =>
      snfs.map((s) => ({
        fat: f,
        snf: s,
        rate: calcBuffaloRate(f, s, buffaloConfig),
      }))
    );

    setBuffaloFatValues(fats);
    setBuffaloSnfValues(snfs);
    setBuffaloTable(table);
  };

  const generateMixedTable = () => {
    const minFat = Math.min(cowConfig.fatFrom, buffaloConfig.fatFrom);
    const maxFat = Math.max(cowConfig.fatTo, buffaloConfig.fatTo);
    const minSnf = Math.min(cowConfig.snfFrom, buffaloConfig.snfFrom);
    const maxSnf = Math.max(cowConfig.snfTo, buffaloConfig.snfTo);
    const step = Math.min(cowConfig.fatStep, buffaloConfig.fatStep);

    const fats: number[] = [];
    for (let f = minFat; f <= maxFat + 0.01; f += step) {
      fats.push(Math.round(f * 10) / 10);
    }

    const snfs: number[] = [];
    for (let s = minSnf; s <= maxSnf + 0.01; s += step) {
      snfs.push(Math.round(s * 10) / 10);
    }

    const table = fats.map((f) =>
      snfs.map((s) => {
        let type: 'cow' | 'buffalo' = 'buffalo';
        let rate = 0;
        if (f <= cowConfig.fatTo && s <= cowConfig.snfTo) {
          type = 'cow';
          rate = calcCowRate(f, s, cowConfig);
        } else {
          type = 'buffalo';
          rate = calcBuffaloRate(f, s, buffaloConfig);
        }
        return { fat: f, snf: s, rate, type };
      })
    );

    setMixedFatValues(fats);
    setMixedSnfValues(snfs);
    setMixedTable(table);
  };

  const setAsActiveMixed = async () => {
    const mixedConfig = {
      cowConfig,
      buffaloConfig,
      effectiveFrom: new Date().toISOString().split('T')[0],
      savedAt: Date.now(),
    };
    await set(ref(database, up('rateConfig/mixed/current')), mixedConfig);
    await push(ref(database, up('rateConfig/mixed/history')), mixedConfig);
    setActiveMixedChart(mixedConfig);
    alert('Mixed chart set as active!');
  };

  const getRateColor = (rate: number) => {
    if (rate === 0) return 'bg-white';
    if (rate < 30) return 'bg-red-100';
    if (rate < 45) return 'bg-yellow-100';
    return 'bg-green-100';
  };

  const getCellBgColor = (type: 'cow' | 'buffalo', rate: number) => {
    if (type === 'cow') {
      if (rate < 30) return 'bg-blue-100';
      if (rate < 45) return 'bg-blue-50';
      return 'bg-blue-200';
    } else {
      if (rate < 30) return 'bg-orange-100';
      if (rate < 45) return 'bg-orange-50';
      return 'bg-orange-200';
    }
  };

  const cowRate = calcCowRate(parseFloat(calcFat) || 0, parseFloat(calcSnf) || 0, cowConfig);
  const buffaloRate = calcBuffaloRate(parseFloat(calcFat) || 0, parseFloat(calcSnf) || 0, buffaloConfig);
  const mixedRate = calcMixedRate(parseFloat(calcFat) || 0, parseFloat(calcSnf) || 0, cowConfig, buffaloConfig);
  const liveRate = calcMode === 'cow' ? cowRate : calcMode === 'buffalo' ? buffaloRate : mixedRate;
  const liveAmount = liveRate * (parseFloat(calcQty) || 0);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold text-green-900 mb-6">Rate Chart Management</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-300">
        <button
          onClick={() => setActiveTab('cow')}
          className={`px-4 py-3 font-semibold transition ${
            activeTab === 'cow'
              ? 'text-green-700 border-b-2 border-green-700'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          🐄 Cow Rate
        </button>
        <button
          onClick={() => setActiveTab('buffalo')}
          className={`px-4 py-3 font-semibold transition ${
            activeTab === 'buffalo'
              ? 'text-green-700 border-b-2 border-green-700'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          🐃 Buffalo Rate
        </button>
        <button
          onClick={() => setActiveTab('mixed')}
          className={`px-4 py-3 font-semibold transition ${
            activeTab === 'mixed'
              ? 'text-green-700 border-b-2 border-green-700'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          📊 Mixed Chart
        </button>
        <button
          onClick={() => setActiveTab('calculator')}
          className={`px-4 py-3 font-semibold transition ${
            activeTab === 'calculator'
              ? 'text-green-700 border-b-2 border-green-700'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          🧮 Live Calculator
        </button>
      </div>

      {/* TAB 1: COW RATE */}
      {activeTab === 'cow' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-lg p-6 border-t-4 border-green-600">
            <h2 className="text-xl font-bold text-gray-800 mb-6">Cow Rate Configuration</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">FAT From %</label>
                <input
                  type="number"
                  step="0.1"
                  value={cowConfig.fatFrom}
                  onChange={(e) => setCowConfig({ ...cowConfig, fatFrom: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">FAT To %</label>
                <input
                  type="number"
                  step="0.1"
                  value={cowConfig.fatTo}
                  onChange={(e) => setCowConfig({ ...cowConfig, fatTo: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">FAT Step</label>
                <input
                  type="number"
                  step="0.1"
                  value={cowConfig.fatStep}
                  onChange={(e) => setCowConfig({ ...cowConfig, fatStep: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">FAT per KG (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={cowConfig.fatPerKg}
                  onChange={(e) => setCowConfig({ ...cowConfig, fatPerKg: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SNF From %</label>
                <input
                  type="number"
                  step="0.1"
                  value={cowConfig.snfFrom}
                  onChange={(e) => setCowConfig({ ...cowConfig, snfFrom: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SNF To %</label>
                <input
                  type="number"
                  step="0.1"
                  value={cowConfig.snfTo}
                  onChange={(e) => setCowConfig({ ...cowConfig, snfTo: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SNF Step</label>
                <input
                  type="number"
                  step="0.1"
                  value={cowConfig.snfStep}
                  onChange={(e) => setCowConfig({ ...cowConfig, snfStep: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SNF per KG (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={cowConfig.snfPerKg}
                  onChange={(e) => setCowConfig({ ...cowConfig, snfPerKg: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Effective From Date</label>
              <input
                type="date"
                value={cowConfig.effectiveFrom}
                onChange={(e) => setCowConfig({ ...cowConfig, effectiveFrom: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <button
              onClick={saveCowConfig}
              className="bg-green-700 text-white px-6 py-2 rounded-lg hover:bg-green-800 transition flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save & Generate Cow Chart
            </button>
          </div>

          {/* Cow Rate Table */}
          {cowTable.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Cow Rate Chart (Effective from {cowConfig.effectiveFrom})</h3>
              <div className="overflow-auto max-h-[500px] border rounded-lg">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-gray-100 z-10">
                    <tr>
                      <th className="border p-2 bg-gray-200">FAT \ SNF</th>
                      {cowSnfValues.map((s) => (
                        <th key={s} className="border p-2">
                          {s.toFixed(1)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cowTable.map((row, i) => (
                      <tr key={i}>
                        <td className="border p-2 font-bold bg-gray-50 sticky left-0">{cowFatValues[i].toFixed(1)}</td>
                        {row.map((cell, j) => (
                          <td key={j} className={`border p-2 text-center font-medium ${getRateColor(cell.rate)}`}>
                            {cell.rate.toFixed(2)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BUFFALO RATE */}
      {activeTab === 'buffalo' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-lg p-6 border-t-4 border-orange-600">
            <h2 className="text-xl font-bold text-gray-800 mb-6">Buffalo Rate Configuration</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">FAT From %</label>
                <input
                  type="number"
                  step="0.1"
                  value={buffaloConfig.fatFrom}
                  onChange={(e) => setBuffaloConfig({ ...buffaloConfig, fatFrom: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">FAT To %</label>
                <input
                  type="number"
                  step="0.1"
                  value={buffaloConfig.fatTo}
                  onChange={(e) => setBuffaloConfig({ ...buffaloConfig, fatTo: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">FAT Step</label>
                <input
                  type="number"
                  step="0.1"
                  value={buffaloConfig.fatStep}
                  onChange={(e) => setBuffaloConfig({ ...buffaloConfig, fatStep: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">FAT per KG (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={buffaloConfig.fatPerKg}
                  onChange={(e) => setBuffaloConfig({ ...buffaloConfig, fatPerKg: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SNF From %</label>
                <input
                  type="number"
                  step="0.1"
                  value={buffaloConfig.snfFrom}
                  onChange={(e) => setBuffaloConfig({ ...buffaloConfig, snfFrom: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SNF To %</label>
                <input
                  type="number"
                  step="0.1"
                  value={buffaloConfig.snfTo}
                  onChange={(e) => setBuffaloConfig({ ...buffaloConfig, snfTo: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SNF Step</label>
                <input
                  type="number"
                  step="0.1"
                  value={buffaloConfig.snfStep}
                  onChange={(e) => setBuffaloConfig({ ...buffaloConfig, snfStep: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SNF per KG (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={buffaloConfig.snfPerKg}
                  onChange={(e) => setBuffaloConfig({ ...buffaloConfig, snfPerKg: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Effective From Date</label>
              <input
                type="date"
                value={buffaloConfig.effectiveFrom}
                onChange={(e) => setBuffaloConfig({ ...buffaloConfig, effectiveFrom: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <button
              onClick={saveBuffaloConfig}
              className="bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700 transition flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save & Generate Buffalo Chart
            </button>
          </div>

          {/* Buffalo Rate Table */}
          {buffaloTable.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Buffalo Rate Chart (Effective from {buffaloConfig.effectiveFrom})</h3>
              <div className="overflow-auto max-h-[500px] border rounded-lg">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-gray-100 z-10">
                    <tr>
                      <th className="border p-2 bg-gray-200">FAT \ SNF</th>
                      {buffaloSnfValues.map((s) => (
                        <th key={s} className="border p-2">
                          {s.toFixed(1)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {buffaloTable.map((row, i) => (
                      <tr key={i}>
                        <td className="border p-2 font-bold bg-gray-50 sticky left-0">{buffaloFatValues[i].toFixed(1)}</td>
                        {row.map((cell, j) => (
                          <td key={j} className={`border p-2 text-center font-medium ${getRateColor(cell.rate)}`}>
                            {cell.rate.toFixed(2)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MIXED CHART */}
      {activeTab === 'mixed' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">Mixed Rate Chart</h2>
              <div className="flex gap-2">
                <button
                  onClick={generateMixedTable}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                  Generate Mixed Chart
                </button>
                <button
                  onClick={setAsActiveMixed}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
                >
                  Set as Active
                </button>
              </div>
            </div>

            {mixedTable.length > 0 && (
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  Cow FAT per KG: ₹{cowConfig.fatPerKg} | Cow SNF per KG: ₹{cowConfig.snfPerKg} | Buffalo FAT per KG: ₹{buffaloConfig.fatPerKg} | Buffalo SNF per KG: ₹{buffaloConfig.snfPerKg}
                </p>
                <div className="overflow-auto max-h-[500px] border rounded-lg">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 bg-gray-100 z-10">
                      <tr>
                        <th className="border p-2 bg-gray-200">FAT \ SNF</th>
                        {mixedSnfValues.map((s) => (
                          <th key={s} className="border p-2">
                            {s.toFixed(1)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {mixedTable.map((row, i) => (
                        <tr key={i}>
                          <td className="border p-2 font-bold bg-gray-50 sticky left-0">{mixedFatValues[i].toFixed(1)}</td>
                          {row.map((cell, j) => (
                            <td key={j} className={`border p-2 text-center font-medium ${getCellBgColor(cell.type, cell.rate)}`}>
                              {cell.rate.toFixed(2)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: LIVE CALCULATOR */}
      {activeTab === 'calculator' && (
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-md">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Live Rate Calculator</h2>

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setCalcMode('cow')}
              className={`flex-1 py-2 rounded-lg font-semibold transition ${
                calcMode === 'cow'
                  ? 'bg-green-700 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              🐄 Cow
            </button>
            <button
              onClick={() => setCalcMode('buffalo')}
              className={`flex-1 py-2 rounded-lg font-semibold transition ${
                calcMode === 'buffalo'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              🐃 Buffalo
            </button>
            <button
              onClick={() => setCalcMode('mix')}
              className={`flex-1 py-2 rounded-lg font-semibold transition ${
                calcMode === 'mix'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              🔀 Mix
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Enter FAT %</label>
              <input
                type="number"
                step="0.1"
                value={calcFat}
                onChange={(e) => setCalcFat(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-green-500"
                placeholder="e.g. 4.5"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Enter SNF %</label>
              <input
                type="number"
                step="0.1"
                value={calcSnf}
                onChange={(e) => setCalcSnf(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-green-500"
                placeholder="e.g. 8.5"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Enter Quantity (L)</label>
              <input
                type="number"
                step="0.1"
                value={calcQty}
                onChange={(e) => setCalcQty(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-green-500"
                placeholder="e.g. 10"
              />
            </div>

            <div className="mt-6 p-4 bg-green-50 rounded-xl border border-green-200 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium">Calculated Rate:</span>
                <span className="text-2xl font-bold text-green-700">₹{liveRate.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-green-200">
                <span className="text-gray-600 font-medium">Total Amount:</span>
                <span className="text-2xl font-bold text-green-700">₹{liveAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Final Active Rate Chart - Always Visible */}
      {activeMixedChart && (
        <div className="mt-12 bg-gradient-to-r from-green-50 to-blue-50 rounded-xl shadow-lg p-6 border-t-4 border-green-600">
          <h2 className="text-2xl font-bold text-green-900 mb-2">📊 Final Active Rate Chart</h2>
          <p className="text-sm text-gray-600 mb-6">Effective from {activeMixedChart.effectiveFrom} — This chart is used for Milk Collection</p>

          {mixedTable.length > 0 && (
            <div className="overflow-auto max-h-[600px] border rounded-lg">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-gray-100 z-10">
                  <tr>
                    <th className="border p-2 bg-gray-200">FAT \ SNF</th>
                    {mixedSnfValues.map((s) => (
                      <th key={s} className="border p-2">
                        {s.toFixed(1)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mixedTable.map((row, i) => (
                    <tr key={i}>
                      <td className="border p-2 font-bold bg-gray-50 sticky left-0">{mixedFatValues[i].toFixed(1)}</td>
                      {row.map((cell, j) => (
                        <td key={j} className={`border p-2 text-center font-medium ${getCellBgColor(cell.type, cell.rate)}`}>
                          {cell.rate.toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RateChart;
