import React, { useState, useEffect } from 'react';
import { ref, get, set } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { Save, Calculator, Table as TableIcon } from 'lucide-react';
import { calculateFormulaRate } from '../utils/rateCalculator';

const RateChart: React.FC = () => {
  const { t } = useLanguage();
  const [formula, setFormula] = useState({
    fatRate: 0,
    snfRate: 0,
    fatTierEnabled: false,
    fatTierUpto: 0,
    fatRateBelow: 0,
    fatRateAbove: 0,
    snfTierEnabled: false,
    snfTierUpto: 0,
    snfRateBelow: 0,
    snfRateAbove: 0,
    adjustmentEnabled: false,
    adjFatFrom: 0,
    adjFatTo: 0,
    adjAmount: 0,
  });

  const [previewSettings, setPreviewSettings] = useState({
    fatFrom: 3.0,
    fatTo: 5.0,
    fatStep: 0.1,
    snfFrom: 7.5,
    snfTo: 9.0,
    snfStep: 0.1,
  });

  const [previewTable, setPreviewTable] = useState<{ fat: number; snf: number; rate: number }[][]>([]);
  const [fatValues, setFatValues] = useState<number[]>([]);
  const [snfValues, setSnfValues] = useState<number[]>([]);

  const [calcFat, setCalcFat] = useState('');
  const [calcSnf, setCalcSnf] = useState('');
  const [calcQty, setCalcQty] = useState('');

  useEffect(() => {
    loadFormula();
  }, []);

  const loadFormula = async () => {
    const snap = await get(ref(database, up('rateFormula')));
    if (snap.exists()) {
      setFormula(snap.val());
    }
  };

  const handleSaveFormula = async () => {
    await set(ref(database, up('rateFormula')), formula);
    alert('Formula saved successfully!');
  };

  const generatePreview = () => {
    const fats: number[] = [];
    for (let f = previewSettings.fatFrom; f <= previewSettings.fatTo + 0.01; f += previewSettings.fatStep) {
      fats.push(Math.round(f * 10) / 10);
    }

    const snfs: number[] = [];
    for (let s = previewSettings.snfFrom; s <= previewSettings.snfTo + 0.01; s += previewSettings.snfStep) {
      snfs.push(Math.round(s * 10) / 10);
    }

    const table = fats.map((f) =>
      snfs.map((s) => ({
        fat: f,
        snf: s,
        rate: calculateFormulaRate(f, s, formula),
      }))
    );

    setFatValues(fats);
    setSnfValues(snfs);
    setPreviewTable(table);
  };

  const getRateColor = (rate: number) => {
    if (rate === 0) return 'bg-white';
    if (rate < 30) return 'bg-red-100';
    if (rate < 45) return 'bg-yellow-100';
    return 'bg-green-100';
  };

  const liveRate = calculateFormulaRate(parseFloat(calcFat) || 0, parseFloat(calcSnf) || 0, formula);
  const liveAmount = liveRate * (parseFloat(calcQty) || 0);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold text-green-900">{t('rateChart')}</h1>

      {/* Section 1: Formula Settings */}
      <div className="bg-white rounded-xl shadow-lg p-6 border-t-4 border-green-600">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Save className="w-5 h-5 text-green-600" />
            Rate Formula Settings
          </h2>
          <button
            onClick={handleSaveFormula}
            className="bg-green-700 text-white px-6 py-2 rounded-lg hover:bg-green-800 transition flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Formula
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Basic Rates */}
          <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold text-green-800 border-b pb-2">Basic Rates</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700">FAT Rate (₹ per point)</label>
              <input
                type="number"
                step="0.01"
                value={formula.fatRate}
                onChange={(e) => setFormula({ ...formula, fatRate: parseFloat(e.target.value) || 0 })}
                className="w-full mt-1 px-3 py-2 border rounded-md outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">SNF Rate (₹ per point)</label>
              <input
                type="number"
                step="0.01"
                value={formula.snfRate}
                onChange={(e) => setFormula({ ...formula, snfRate: parseFloat(e.target.value) || 0 })}
                className="w-full mt-1 px-3 py-2 border rounded-md outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          {/* FAT Tier */}
          <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-semibold text-green-800">FAT Tier</h3>
              <input
                type="checkbox"
                checked={formula.fatTierEnabled}
                onChange={(e) => setFormula({ ...formula, fatTierEnabled: e.target.checked })}
                className="w-4 h-4 text-green-600"
              />
            </div>
            {formula.fatTierEnabled && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">FAT Tier Upto %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formula.fatTierUpto}
                    onChange={(e) => setFormula({ ...formula, fatTierUpto: parseFloat(e.target.value) || 0 })}
                    className="w-full mt-1 px-3 py-2 border rounded-md outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Rate Below Tier</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formula.fatRateBelow}
                    onChange={(e) => setFormula({ ...formula, fatRateBelow: parseFloat(e.target.value) || 0 })}
                    className="w-full mt-1 px-3 py-2 border rounded-md outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Rate Above Tier</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formula.fatRateAbove}
                    onChange={(e) => setFormula({ ...formula, fatRateAbove: parseFloat(e.target.value) || 0 })}
                    className="w-full mt-1 px-3 py-2 border rounded-md outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* SNF Tier */}
          <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-semibold text-green-800">SNF Tier</h3>
              <input
                type="checkbox"
                checked={formula.snfTierEnabled}
                onChange={(e) => setFormula({ ...formula, snfTierEnabled: e.target.checked })}
                className="w-4 h-4 text-green-600"
              />
            </div>
            {formula.snfTierEnabled && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">SNF Tier Upto %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formula.snfTierUpto}
                    onChange={(e) => setFormula({ ...formula, snfTierUpto: parseFloat(e.target.value) || 0 })}
                    className="w-full mt-1 px-3 py-2 border rounded-md outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Rate Below Tier</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formula.snfRateBelow}
                    onChange={(e) => setFormula({ ...formula, snfRateBelow: parseFloat(e.target.value) || 0 })}
                    className="w-full mt-1 px-3 py-2 border rounded-md outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Rate Above Tier</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formula.snfRateAbove}
                    onChange={(e) => setFormula({ ...formula, snfRateAbove: parseFloat(e.target.value) || 0 })}
                    className="w-full mt-1 px-3 py-2 border rounded-md outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Extra Adjustment */}
          <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-semibold text-green-800">Extra Adjustment</h3>
              <input
                type="checkbox"
                checked={formula.adjustmentEnabled}
                onChange={(e) => setFormula({ ...formula, adjustmentEnabled: e.target.checked })}
                className="w-4 h-4 text-green-600"
              />
            </div>
            {formula.adjustmentEnabled && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">FAT From %</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formula.adjFatFrom}
                      onChange={(e) => setFormula({ ...formula, adjFatFrom: parseFloat(e.target.value) || 0 })}
                      className="w-full mt-1 px-3 py-2 border rounded-md outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">FAT To %</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formula.adjFatTo}
                      onChange={(e) => setFormula({ ...formula, adjFatTo: parseFloat(e.target.value) || 0 })}
                      className="w-full mt-1 px-3 py-2 border rounded-md outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Adjustment Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formula.adjAmount}
                    onChange={(e) => setFormula({ ...formula, adjAmount: parseFloat(e.target.value) || 0 })}
                    className="w-full mt-1 px-3 py-2 border rounded-md outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Section 2: Preview Table */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-lg p-6 border-t-4 border-blue-600">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <TableIcon className="w-5 h-5 text-blue-600" />
              Rate Preview Table
            </h2>
            <button
              onClick={generatePreview}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Generate Preview
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6 p-4 bg-blue-50 rounded-lg">
            <div>
              <label className="block text-xs font-bold text-blue-800 uppercase">FAT From - To</label>
              <div className="flex gap-2 mt-1">
                <input
                  type="number"
                  step="0.1"
                  value={previewSettings.fatFrom}
                  onChange={(e) => setPreviewSettings({ ...previewSettings, fatFrom: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
                <input
                  type="number"
                  step="0.1"
                  value={previewSettings.fatTo}
                  onChange={(e) => setPreviewSettings({ ...previewSettings, fatTo: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-blue-800 uppercase">SNF From - To</label>
              <div className="flex gap-2 mt-1">
                <input
                  type="number"
                  step="0.1"
                  value={previewSettings.snfFrom}
                  onChange={(e) => setPreviewSettings({ ...previewSettings, snfFrom: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
                <input
                  type="number"
                  step="0.1"
                  value={previewSettings.snfTo}
                  onChange={(e) => setPreviewSettings({ ...previewSettings, snfTo: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-blue-800 uppercase">Steps (FAT | SNF)</label>
              <div className="flex gap-2 mt-1">
                <input
                  type="number"
                  step="0.1"
                  value={previewSettings.fatStep}
                  onChange={(e) => setPreviewSettings({ ...previewSettings, fatStep: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
                <input
                  type="number"
                  step="0.1"
                  value={previewSettings.snfStep}
                  onChange={(e) => setPreviewSettings({ ...previewSettings, snfStep: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
            </div>
          </div>

          <div className="overflow-auto max-h-[500px] border rounded-lg">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-gray-100 z-10">
                <tr>
                  <th className="border p-2 bg-gray-200">FAT \ SNF</th>
                  {snfValues.map((s) => (
                    <th key={s} className="border p-2">
                      {s.toFixed(1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewTable.map((row, i) => (
                  <tr key={i}>
                    <td className="border p-2 font-bold bg-gray-50 sticky left-0">{fatValues[i].toFixed(1)}</td>
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

        {/* Section 3: Live Calculator */}
        <div className="bg-white rounded-xl shadow-lg p-6 border-t-4 border-orange-500 h-fit">
          <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-orange-500" />
            Live Rate Calculator
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Enter FAT %</label>
              <input
                type="number"
                step="0.1"
                value={calcFat}
                onChange={(e) => setCalcFat(e.target.value)}
                className="w-full mt-1 px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="e.g. 4.5"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Enter SNF %</label>
              <input
                type="number"
                step="0.1"
                value={calcSnf}
                onChange={(e) => setCalcSnf(e.target.value)}
                className="w-full mt-1 px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="e.g. 8.5"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Enter Quantity (L)</label>
              <input
                type="number"
                step="0.1"
                value={calcQty}
                onChange={(e) => setCalcQty(e.target.value)}
                className="w-full mt-1 px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="e.g. 10"
              />
            </div>

            <div className="mt-6 p-4 bg-orange-50 rounded-xl border border-orange-200 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium">Calculated Rate:</span>
                <span className="text-2xl font-bold text-orange-700">₹{liveRate.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-orange-200">
                <span className="text-gray-600 font-medium">Total Amount:</span>
                <span className="text-2xl font-bold text-green-700">₹{liveAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RateChart;
