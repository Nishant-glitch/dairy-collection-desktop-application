import React, { useState, useEffect } from 'react';
import { ref, onValue, get } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { Droplet, TrendingUp, Users, Clock, Table, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useLanguage } from '../contexts/LanguageContext';
import { formatIndianCurrency } from '../utils/rateCalculator';

const Dashboard: React.FC = () => {
  const { t } = useLanguage();
  const [stats, setStats] = useState({
    todayQty: 0,
    todayAmount: 0,
    monthQty: 0,
    monthAmount: 0,
    totalFarmers: 0,
    pendingPayments: 0,
  });
  const [recentEntries, setRecentEntries] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [activeRateChart, setActiveRateChart] = useState<any>(null);
  const [loadingRateChart, setLoadingRateChart] = useState(true);

  useEffect(() => {
    loadDashboardData();
    loadActiveRateChart();
  }, []);

  const loadActiveRateChart = async () => {
    try {
      const snap = await get(ref(database, 'globalRateConfig/current'));
      if (snap.exists()) {
        setActiveRateChart(snap.val());
      }
    } catch (error) {
      console.error('Error loading rate chart:', error);
    } finally {
      setLoadingRateChart(false);
    }
  };

  const loadDashboardData = () => {
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.substring(0, 7);

    // Load today's collection
    const todayRef = ref(database, up(`milkCollection/${today}`));
    onValue(todayRef, (snapshot) => {
      let todayQty = 0;
      let todayAmount = 0;

      if (snapshot.exists()) {
        const data = snapshot.val();
        Object.values(data).forEach((shift: any) => {
          Object.values(shift).forEach((entry: any) => {
            todayQty += parseFloat(entry.qty || 0);
            todayAmount += parseFloat(entry.amount || 0);
          });
        });
      }

      setStats((prev) => ({ ...prev, todayQty, todayAmount }));
    });

    // Load month's collection
    const collectionRef = ref(database, up('milkCollection'));
    onValue(collectionRef, (snapshot) => {
      let monthQty = 0;
      let monthAmount = 0;
      const last7Days: any[] = [];
      const entries: any[] = [];

      if (snapshot.exists()) {
        const data = snapshot.val();
        const dates = Object.keys(data).sort().reverse();

        dates.forEach((date, index) => {
          if (date.startsWith(currentMonth)) {
            const shifts = data[date];
            Object.keys(shifts).forEach((shift) => {
              Object.keys(shifts[shift]).forEach((farmerId) => {
                const entry = shifts[shift][farmerId];
                monthQty += parseFloat(entry.qty || 0);
                monthAmount += parseFloat(entry.amount || 0);

                if (entries.length < 10) {
                  entries.push({
                    date,
                    shift,
                    farmerId,
                    ...entry,
                  });
                }
              });
            });
          }

          if (index < 7) {
            let dayQty = 0;
            const shifts = data[date];
            Object.values(shifts).forEach((shift: any) => {
              Object.values(shift).forEach((entry: any) => {
                dayQty += parseFloat(entry.qty || 0);
              });
            });

            last7Days.push({
              date: date.substring(8, 10),
              qty: dayQty,
            });
          }
        });
      }

      setStats((prev) => ({ ...prev, monthQty, monthAmount }));
      setRecentEntries(entries);
      setChartData(last7Days.reverse());
    });

    // Load total farmers
    const farmersRef = ref(database, up('farmers'));
    onValue(farmersRef, (snapshot) => {
      const totalFarmers = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
      setStats((prev) => ({ ...prev, totalFarmers }));
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-green-900">{t('dashboard')}</h1>
        
        {/* Rate Chart Status Card */}
        <div className="bg-white rounded-xl shadow-md px-4 py-2 border border-gray-200 flex items-center gap-4">
          <div className={`p-2 rounded-lg ${activeRateChart ? 'bg-green-100' : 'bg-orange-100'}`}>
            <Table size={20} className={activeRateChart ? 'text-green-600' : 'text-orange-600'} />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Active Rate Chart</p>
            {loadingRateChart ? (
              <p className="text-sm text-gray-400">Loading...</p>
            ) : activeRateChart ? (
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-gray-800">Effective: {activeRateChart.effectiveFrom}</p>
                <CheckCircle2 size={14} className="text-green-500" />
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-orange-600">No chart uploaded</p>
                <AlertTriangle size={14} className="text-orange-500" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm">{t('todayCollection')}</p>
              <p className="text-3xl font-bold mt-2">{stats.todayQty.toFixed(2)}</p>
              <p className="text-sm mt-1">{t('liters')}</p>
              <p className="text-lg font-semibold mt-2">{formatIndianCurrency(stats.todayAmount)}</p>
            </div>
            <Droplet className="w-12 h-12 text-blue-200" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm">{t('thisMonth')}</p>
              <p className="text-3xl font-bold mt-2">{stats.monthQty.toFixed(2)}</p>
              <p className="text-sm mt-1">{t('liters')}</p>
              <p className="text-lg font-semibold mt-2">{formatIndianCurrency(stats.monthAmount)}</p>
            </div>
            <TrendingUp className="w-12 h-12 text-green-200" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm">{t('totalFarmers')}</p>
              <p className="text-3xl font-bold mt-2">{stats.totalFarmers}</p>
              <p className="text-sm mt-1">Registered</p>
            </div>
            <Users className="w-12 h-12 text-purple-200" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm">{t('pendingPayments')}</p>
              <p className="text-3xl font-bold mt-2">{stats.pendingPayments}</p>
              <p className="text-sm mt-1">Farmers</p>
            </div>
            <Clock className="w-12 h-12 text-orange-200" />
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Last 7 Days Collection</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="qty" stroke="#1B5E20" strokeWidth={2} name="Liters" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Monthly Comparison</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="qty" fill="#1B5E20" name="Liters" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Entries */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Recent Collections</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-green-50 text-green-900">
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Shift</th>
                <th className="px-4 py-3 text-left">Farmer ID</th>
                <th className="px-4 py-3 text-right">Qty (L)</th>
                <th className="px-4 py-3 text-right">FAT %</th>
                <th className="px-4 py-3 text-right">SNF %</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {recentEntries.map((entry, index) => (
                <tr key={index} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">{entry.date}</td>
                  <td className="px-4 py-3">{entry.shift}</td>
                  <td className="px-4 py-3">{entry.farmerId}</td>
                  <td className="px-4 py-3 text-right">{parseFloat(entry.qty).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">{parseFloat(entry.fat).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">{parseFloat(entry.snf || entry.clr || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">₹{parseFloat(entry.rate).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatIndianCurrency(entry.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
