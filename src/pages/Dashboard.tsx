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

  const statLabelStyle: React.CSSProperties = { color: '#6B4C4C', fontSize: 13, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' };
  const statValueStyle: React.CSSProperties = { fontSize: 36, fontWeight: 800, color: '#2D1B1B', lineHeight: 1 };

  return (
    <div className="p-6 space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 style={{ color: '#2D1B1B', fontWeight: 800, fontSize: 28 }}>{t('dashboard')}</h1>
        
        {/* Rate Chart Status Card */}
        <div className="glass-card" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            padding: 8, borderRadius: 10,
            background: activeRateChart ? 'rgba(213,243,216,0.3)' : 'rgba(255,183,197,0.2)'
          }}>
            <Table size={20} color={activeRateChart ? '#2D9E4F' : '#c44d6e'} />
          </div>
          <div>
            <p style={{ color: '#6B4C4C', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Rate Chart</p>
            {loadingRateChart ? (
              <p style={{ color: '#6B4C4C', fontSize: 13 }}>Loading...</p>
            ) : activeRateChart ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <p style={{ color: '#2D1B1B', fontSize: 13, fontWeight: 700 }}>Effective: {activeRateChart.effectiveFrom}</p>
                <CheckCircle2 size={14} color="#2D9E4F" />
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <p style={{ color: '#c44d6e', fontSize: 13, fontWeight: 700 }}>No chart uploaded</p>
                <AlertTriangle size={14} color="#c44d6e" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="stat-card-3d" style={{ background: 'linear-gradient(135deg, #F2C7C7, #f0a0b0)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p style={statLabelStyle}>{t('todayCollection')}</p>
              <p style={statValueStyle}>{stats.todayQty.toFixed(2)}</p>
              <p style={{ color: '#6B4C4C', fontSize: 12, marginTop: 4 }}>{t('liters')}</p>
              <p style={{ color: '#2D1B1B', fontSize: 18, fontWeight: 700, marginTop: 8 }}>{formatIndianCurrency(stats.todayAmount)}</p>
            </div>
            <Droplet className="w-12 h-12" style={{ color: 'rgba(242,199,199,0.3)' }} />
          </div>
        </div>

        <div className="stat-card-3d" style={{ background: 'linear-gradient(135deg, #D5F3D8, #a8ddb0)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p style={statLabelStyle}>{t('thisMonth')}</p>
              <p style={statValueStyle}>{stats.monthQty.toFixed(2)}</p>
              <p style={{ color: '#6B4C4C', fontSize: 12, marginTop: 4 }}>{t('liters')}</p>
              <p style={{ color: '#2D1B1B', fontSize: 18, fontWeight: 700, marginTop: 8 }}>{formatIndianCurrency(stats.monthAmount)}</p>
            </div>
            <TrendingUp className="w-12 h-12" style={{ color: 'rgba(213,243,216,0.4)' }} />
          </div>
        </div>

        <div className="stat-card-3d" style={{ background: 'linear-gradient(135deg, #FFB7C5, #f090a8)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p style={statLabelStyle}>{t('totalFarmers')}</p>
              <p style={statValueStyle}>{stats.totalFarmers}</p>
              <p style={{ color: '#6B4C4C', fontSize: 12, marginTop: 4 }}>Registered</p>
            </div>
            <Users className="w-12 h-12" style={{ color: 'rgba(255,183,197,0.3)' }} />
          </div>
        </div>

        <div className="stat-card-3d" style={{ background: 'linear-gradient(135deg, #fde8c8, #f0c080)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p style={statLabelStyle}>{t('pendingPayments')}</p>
              <p style={statValueStyle}>{stats.pendingPayments}</p>
              <p style={{ color: '#6B4C4C', fontSize: 12, marginTop: 4 }}>Farmers</p>
            </div>
            <Clock className="w-12 h-12" style={{ color: 'rgba(240,192,128,0.3)' }} />
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card" style={{ padding: 24 }}>
          <h2 style={{ color: '#2D1B1B', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Last 7 Days Collection</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(242,199,199,0.3)" vertical={false} />
              <XAxis dataKey="date" stroke="#6B4C4C" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#6B4C4C" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ background: '#ffffff', border: '1px solid rgba(242,199,199,0.6)', borderRadius: 12, color: '#2D1B1B' }}
                itemStyle={{ color: '#FFB7C5' }}
              />
              <Legend wrapperStyle={{ paddingTop: 20 }} />
              <Line type="monotone" dataKey="qty" stroke="#FFB7C5" strokeWidth={3} dot={{ fill: '#FFB7C5', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, strokeWidth: 0 }} name="Liters" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card" style={{ padding: 24 }}>
          <h2 style={{ color: '#2D1B1B', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Monthly Comparison</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(242,199,199,0.3)" vertical={false} />
              <XAxis dataKey="date" stroke="#6B4C4C" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#6B4C4C" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ background: '#ffffff', border: '1px solid rgba(242,199,199,0.6)', borderRadius: 12, color: '#2D1B1B' }}
                itemStyle={{ color: '#FFB7C5' }}
              />
              <Legend wrapperStyle={{ paddingTop: 20 }} />
              <Bar dataKey="qty" fill="#FFB7C5" radius={[6, 6, 0, 0]} name="Liters" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Entries */}
      <div className="glass-card" style={{ padding: 24 }}>
        <h2 style={{ color: '#2D1B1B', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Recent Collections</h2>
        <div className="overflow-x-auto table-3d">
          <table className="w-full">
            <thead>
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
                <tr key={index}>
                  <td className="px-4 py-3">{entry.date}</td>
                  <td className="px-4 py-3">{entry.shift}</td>
                  <td className="px-4 py-3">{entry.farmerId}</td>
                  <td className="px-4 py-3 text-right">{parseFloat(entry.qty).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">{parseFloat(entry.fat).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">{parseFloat(entry.snf || entry.clr || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">₹{parseFloat(entry.rate).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-semibold" style={{ color: '#FFB7C5' }}>
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
