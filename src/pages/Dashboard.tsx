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
    <div className="page-wrapper space-y-4 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="page-title">{t('dashboard')}</h1>
        
        {/* Rate Chart Status Card */}
        <div className="glass-card" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 0 }}>
          <div style={{
            padding: 6, borderRadius: 8,
            background: activeRateChart ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)'
          }}>
            <Table size={16} color={activeRateChart ? '#4ade80' : '#f87171'} />
          </div>
          <div>
            <p className="label-text" style={{ marginBottom: 0, fontSize: '10px' }}>Active Rate Chart</p>
            {loadingRateChart ? (
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>Loading...</p>
            ) : activeRateChart ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <p style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>Effective: {activeRateChart.effectiveFrom}</p>
                <CheckCircle2 size={12} color="#4ade80" />
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <p style={{ color: '#f87171', fontSize: 12, fontWeight: 700 }}>No chart uploaded</p>
                <AlertTriangle size={12} color="#f87171" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stats-grid">
        <div className="stat-card-3d" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2563eb)', height: 'auto', padding: '18px 20px' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="label-text" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px' }}>{t('todayCollection')}</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{stats.todayQty.toFixed(2)}</p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 }}>{t('liters')}</p>
              <p style={{ color: '#4ade80', fontSize: 14, fontWeight: 700, marginTop: 4 }}>{formatIndianCurrency(stats.todayAmount)}</p>
            </div>
            <Droplet className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.1)' }} />
          </div>
        </div>

        <div className="stat-card-3d" style={{ background: 'linear-gradient(135deg, #1a5c2e, #16a34a)', height: 'auto', padding: '18px 20px' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="label-text" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px' }}>{t('thisMonth')}</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{stats.monthQty.toFixed(2)}</p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 }}>{t('liters')}</p>
              <p style={{ color: '#4ade80', fontSize: 14, fontWeight: 700, marginTop: 4 }}>{formatIndianCurrency(stats.monthAmount)}</p>
            </div>
            <TrendingUp className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.1)' }} />
          </div>
        </div>

        <div className="stat-card-3d" style={{ background: 'linear-gradient(135deg, #4c1d95, #7c3aed)', height: 'auto', padding: '18px 20px' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="label-text" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px' }}>{t('totalFarmers')}</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{stats.totalFarmers}</p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 }}>Registered</p>
            </div>
            <Users className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.1)' }} />
          </div>
        </div>

        <div className="stat-card-3d" style={{ background: 'linear-gradient(135deg, #7c2d12, #ea580c)', height: 'auto', padding: '18px 20px' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="label-text" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px' }}>{t('pendingPayments')}</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{stats.pendingPayments}</p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 }}>Farmers</p>
            </div>
            <Clock className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.1)' }} />
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card" style={{ padding: 24 }}>
          <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Last 7 Days Collection</h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} style={{ padding: '16px' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.6)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="rgba(255,255,255,0.6)" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 12, color: 'white' }}
                itemStyle={{ color: '#4ade80' }}
              />
              <Legend wrapperStyle={{ paddingTop: 20 }} />
              <Line type="monotone" dataKey="qty" stroke="#4ade80" strokeWidth={3} dot={{ fill: '#4ade80', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, strokeWidth: 0 }} name="Liters" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card" style={{ padding: 24 }}>
          <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Monthly Comparison</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} style={{ padding: '16px' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.6)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="rgba(255,255,255,0.6)" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 12, color: 'white' }}
                itemStyle={{ color: '#4ade80' }}
              />
              <Legend wrapperStyle={{ paddingTop: 20 }} />
              <Bar dataKey="qty" fill="#4ade80" radius={[6, 6, 0, 0]} name="Liters" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Entries */}
      <div className="glass-card" style={{ padding: 24 }}>
        <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Recent Collections</h2>
        <div className="table-container" style={{ maxHeight: '320px', overflowY: 'auto' }}>
          <table className="w-full table-3d">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Shift</th>
                <th className="px-4 py-3">Farmer ID</th>
                <th className="px-4 py-3 text-right">Qty (L)</th>
                <th className="px-4 py-3 text-right">FAT %</th>
                <th className="px-4 py-3 text-right">SNF %</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {recentEntries.map((entry, index) => (
                <tr key={index} className="table-row">
                  <td className="px-4 py-[9px]" style={{ color: 'rgba(255,255,255,0.85)' }}>{entry.date}</td>
                  <td className="px-4 py-[9px]" style={{ color: 'rgba(255,255,255,0.85)' }}>{entry.shift}</td>
                  <td className="px-4 py-[9px]" style={{ color: 'white', fontWeight: 'bold' }}>{entry.farmerId}</td>
                  <td className="px-4 py-[9px] text-right" style={{ color: 'white' }}>{parseFloat(entry.qty).toFixed(2)}</td>
                  <td className="px-4 py-[9px] text-right" style={{ color: 'rgba(255,255,255,0.85)' }}>{parseFloat(entry.fat).toFixed(2)}</td>
                  <td className="px-4 py-[9px] text-right" style={{ color: 'rgba(255,255,255,0.85)' }}>{parseFloat(entry.snf || entry.clr || 0).toFixed(2)}</td>
                  <td className="px-4 py-[9px] text-right" style={{ color: 'rgba(255,255,255,0.85)' }}>₹{parseFloat(entry.rate).toFixed(2)}</td>
                  <td className="px-4 py-[9px] text-right" style={{ fontWeight: 'bold', color: '#4ade80' }}>
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
