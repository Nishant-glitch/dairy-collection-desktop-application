import React, { useState, useEffect, useMemo } from 'react';
import { ref, onValue, get } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { Droplet, TrendingUp, Users, Clock, Table, AlertTriangle, CheckCircle2, Trophy, Star } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useLanguage } from '../contexts/LanguageContext';
import { formatIndianCurrency } from '../utils/rateCalculator';
import { flattenMilkCollection } from '../utils/quality';

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
  const [mcData, setMcData] = useState<any>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
  const [leaderTab, setLeaderTab] = useState<'qty' | 'quality'>('qty');

  useEffect(() => {
    const unsubscribe = loadDashboardData();
    loadActiveRateChart();
    return unsubscribe;
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
    const unsubToday = onValue(todayRef, (snapshot) => {
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
    const unsubMonth = onValue(collectionRef, (snapshot) => {
      let monthQty = 0;
      let monthAmount = 0;
      const last10Days: any[] = [];
      const entries: any[] = [];

      // Keep the full milkCollection tree for the leaderboard.
      setMcData(snapshot.exists() ? snapshot.val() : null);

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

          if (index < 10) {
            let dayQty = 0;
            const shifts = data[date];
            Object.values(shifts).forEach((shift: any) => {
              Object.values(shift).forEach((entry: any) => {
                dayQty += parseFloat(entry.qty || 0);
              });
            });

            last10Days.push({
              date: date.substring(8, 10),
              qty: dayQty,
            });
          }
        });
      }

      setStats((prev) => ({ ...prev, monthQty, monthAmount }));
      setRecentEntries(entries);
      setChartData(last10Days.reverse());
    });

    // Load total farmers
    const farmersRef = ref(database, up('farmers'));
    const unsubFarmers = onValue(farmersRef, (snapshot) => {
      const totalFarmers = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
      setStats((prev) => ({ ...prev, totalFarmers }));
    });

    // Detach all listeners when the component unmounts to avoid leaks/stale data
    return () => {
      unsubToday();
      unsubMonth();
      unsubFarmers();
    };
  };

  // Month options: distinct YYYY-MM present in data + current month.
  const monthOptions = useMemo(() => {
    const set = new Set<string>([new Date().toISOString().substring(0, 7)]);
    if (mcData) Object.keys(mcData).forEach((d) => set.add(d.substring(0, 7)));
    return Array.from(set).sort().reverse();
  }, [mcData]);

  // Leaderboards for the selected month.
  const { topByQty, topByQuality } = useMemo(() => {
    const empty = { topByQty: [] as any[], topByQuality: [] as any[] };
    if (!mcData) return empty;
    const all = flattenMilkCollection(mcData).filter((e) => e.date.startsWith(selectedMonth));

    const agg: Record<string, { name: string; qty: number; amount: number; fatSum: number; snfSum: number; snfCount: number; count: number }> = {};
    all.forEach((e) => {
      const a = agg[e.farmerCode] || (agg[e.farmerCode] = { name: e.farmerName, qty: 0, amount: 0, fatSum: 0, snfSum: 0, snfCount: 0, count: 0 });
      a.qty += e.qty;
      a.amount += e.amount;
      a.fatSum += e.fat;
      a.count += 1;
      if (e.snf != null && e.snf > 0) { a.snfSum += e.snf; a.snfCount += 1; }
    });

    const rows = Object.entries(agg).map(([code, a]) => ({
      code, name: a.name, qty: a.qty, amount: a.amount, count: a.count,
      avgFat: a.count ? a.fatSum / a.count : 0,
      avgSnf: a.snfCount ? a.snfSum / a.snfCount : 0,
    }));

    const topByQty = [...rows].sort((x, y) => y.qty - x.qty).slice(0, 10);
    // Quality needs a minimum sample so a single lucky entry doesn't top it.
    const topByQuality = rows
      .filter((r) => r.count >= 5)
      .sort((x, y) => (y.avgFat + y.avgSnf) - (x.avgFat + x.avgSnf))
      .slice(0, 10);
    return { topByQty, topByQuality };
  }, [mcData, selectedMonth]);

  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`);
  const monthLabel = (m: string) => new Date(m + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div className="page-wrapper animate-fadeIn" style={{ padding: '24px 28px' }}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4" style={{ marginBottom: '20px' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>{t('dashboard')}</h1>
        
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
              <p style={{ color: 'var(--ink-2)', fontSize: 11 }}>Loading...</p>
            ) : activeRateChart ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <p style={{ color: 'var(--ink)', fontSize: 12, fontWeight: 700 }}>Effective: {activeRateChart.effectiveFrom}</p>
                <CheckCircle2 size={12} color="#4ade80" />
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <p style={{ color: 'var(--red)', fontSize: 12, fontWeight: 700 }}>No chart uploaded</p>
                <AlertTriangle size={12} color="#f87171" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 stats-grid" style={{ gap: '20px' }}>
        <div className="stat-card-blue" style={{ height: 'auto', padding: '22px 24px' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="label-text" style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px' }}>{t('todayCollection')}</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{stats.todayQty.toFixed(2)}</p>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 }}>{t('liters')}</p>
              <p style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginTop: 4 }}>{formatIndianCurrency(stats.todayAmount)}</p>
            </div>
            <Droplet className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.85)' }} />
          </div>
        </div>

        <div className="stat-card-green" style={{ height: 'auto', padding: '22px 24px' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="label-text" style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px' }}>{t('thisMonth')}</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{stats.monthQty.toFixed(2)}</p>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 }}>{t('liters')}</p>
              <p style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginTop: 4 }}>{formatIndianCurrency(stats.monthAmount)}</p>
            </div>
            <TrendingUp className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.85)' }} />
          </div>
        </div>

        <div className="stat-card-purple" style={{ height: 'auto', padding: '22px 24px' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="label-text" style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px' }}>{t('totalFarmers')}</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{stats.totalFarmers}</p>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 }}>Registered</p>
            </div>
            <Users className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.85)' }} />
          </div>
        </div>

        <div className="stat-card-orange" style={{ height: 'auto', padding: '22px 24px' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="label-text" style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px' }}>{t('pendingPayments')}</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{stats.pendingPayments}</p>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 }}>Farmers</p>
            </div>
            <Clock className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.85)' }} />
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ marginTop: '20px' }}>
        <div className="glass-card" style={{ padding: '20px 24px' }}>
          <h2 style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Last 10 Days Collection</h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} style={{ padding: '16px' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#475569', fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ background: 'var(--surface-2)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 12, color: 'var(--ink)' }}
                itemStyle={{ color: 'var(--brand)' }}
              />
              <Legend wrapperStyle={{ paddingTop: 20 }} />
              <Line type="monotone" dataKey="qty" stroke="#4ade80" strokeWidth={3} dot={{ fill: '#4ade80', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, strokeWidth: 0 }} name="Liters" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card" style={{ padding: '20px 24px' }}>
          <h2 style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Last 10 Days Comparison</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} style={{ padding: '16px' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#475569', fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ background: 'var(--surface-2)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 12, color: 'var(--ink)' }}
                itemStyle={{ color: 'var(--brand)' }}
              />
              <Legend wrapperStyle={{ paddingTop: 20 }} />
              <Bar dataKey="qty" fill="#4ade80" radius={[6, 6, 0, 0]} name="Liters" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Farmers Leaderboard */}
      <div className="glass-card" style={{ padding: '20px 24px', marginTop: '20px' }}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3" style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Trophy size={20} color="#f59e0b" />
            <h2 style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700 }}>Top Farmers — {monthLabel(selectedMonth)}</h2>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 10, padding: 4 }}>
              <button
                onClick={() => setLeaderTab('qty')}
                style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none',
                  background: leaderTab === 'qty' ? 'var(--brand)' : 'transparent', color: leaderTab === 'qty' ? '#fff' : 'var(--ink-2)' }}
              >🏆 Quantity</button>
              <button
                onClick={() => setLeaderTab('quality')}
                style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none',
                  background: leaderTab === 'quality' ? 'var(--brand)' : 'transparent', color: leaderTab === 'quality' ? '#fff' : 'var(--ink-2)' }}
              >⭐ Quality</button>
            </div>
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="input-field" style={{ padding: '6px 10px', width: 'auto', fontSize: 13 }}>
              {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
        </div>

        <div className="table-container" style={{ maxHeight: 420, overflowY: 'auto' }}>
          {leaderTab === 'qty' ? (
            topByQty.length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>Is mahine ka koi data nahi.</p>
            ) : (
              <table className="w-full table-3d">
                <thead className="table-header">
                  <tr>
                    <th style={{ padding: '10px 14px', fontSize: 13, textAlign: 'left', width: 60 }}>Rank</th>
                    <th style={{ padding: '10px 14px', fontSize: 13, textAlign: 'left' }}>Farmer</th>
                    <th style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right' }}>Qty (L)</th>
                    <th style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {topByQty.map((r, i) => (
                    <tr key={r.code} className="table-row" style={{ background: i < 3 ? 'rgba(245,158,11,0.06)' : undefined }}>
                      <td style={{ padding: '10px 14px', fontSize: 15, textAlign: 'left' }}>{medal(i)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{r.name} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({r.code})</span></td>
                      <td style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right', color: 'var(--ink)', fontWeight: 700 }}>{r.qty.toFixed(1)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right', color: 'var(--brand)', fontWeight: 700 }}>{formatIndianCurrency(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            topByQuality.length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>Is mahine 5+ entries wale farmers nahi (quality ranking ke liye).</p>
            ) : (
              <table className="w-full table-3d">
                <thead className="table-header">
                  <tr>
                    <th style={{ padding: '10px 14px', fontSize: 13, textAlign: 'left', width: 60 }}>Rank</th>
                    <th style={{ padding: '10px 14px', fontSize: 13, textAlign: 'left' }}>Farmer</th>
                    <th style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right' }}>Avg FAT</th>
                    <th style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right' }}>Avg SNF</th>
                    <th style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right' }}>Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {topByQuality.map((r, i) => (
                    <tr key={r.code} className="table-row" style={{ background: i < 3 ? 'rgba(245,158,11,0.06)' : undefined }}>
                      <td style={{ padding: '10px 14px', fontSize: 15, textAlign: 'left' }}>{medal(i)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{i < 3 && <Star size={13} color="#f59e0b" fill="#f59e0b" />}{r.name} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({r.code})</span></span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right', color: 'var(--ink)', fontWeight: 700 }}>{r.avgFat.toFixed(1)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right', color: 'var(--ink)', fontWeight: 700 }}>{r.avgSnf > 0 ? r.avgSnf.toFixed(1) : '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right', color: 'var(--ink-2)' }}>{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 10 }}>
          Quality ranking: sirf {5}+ entries wale farmers (avg FAT + SNF ke hisaab se).
        </p>
      </div>

      {/* Recent Entries */}
      <div className="glass-card" style={{ padding: '20px 24px', marginTop: '20px' }}>
        <h2 style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Recent Collections</h2>
        <div className="table-container" style={{ maxHeight: '320px', overflowY: 'auto' }}>
          <table className="w-full table-3d">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3" style={{ padding: '12px 16px', fontSize: '14px' }}>Date</th>
                <th className="px-4 py-3" style={{ padding: '12px 16px', fontSize: '14px' }}>Shift</th>
                <th className="px-4 py-3" style={{ padding: '12px 16px', fontSize: '14px' }}>Farmer ID</th>
                <th className="px-4 py-3 text-right" style={{ padding: '12px 16px', fontSize: '14px' }}>Qty (L)</th>
                <th className="px-4 py-3 text-right" style={{ padding: '12px 16px', fontSize: '14px' }}>FAT %</th>
                <th className="px-4 py-3 text-right" style={{ padding: '12px 16px', fontSize: '14px' }}>SNF %</th>
                <th className="px-4 py-3 text-right" style={{ padding: '12px 16px', fontSize: '14px' }}>Rate</th>
                <th className="px-4 py-3 text-right" style={{ padding: '12px 16px', fontSize: '14px' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {recentEntries.map((entry, index) => (
                <tr key={index} className="table-row">
                  <td className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--ink)' }}>{entry.date}</td>
                  <td className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--ink)' }}>{entry.shift}</td>
                  <td className="px-4 py-[9px]" style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--ink)', fontWeight: 'bold' }}>{entry.farmerId}</td>
                  <td className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--ink)' }}>{parseFloat(entry.qty).toFixed(2)}</td>
                  <td className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--ink)' }}>{parseFloat(entry.fat).toFixed(2)}</td>
                  <td className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--ink)' }}>{parseFloat(entry.snf || entry.clr || 0).toFixed(2)}</td>
                  <td className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--ink)' }}>₹{parseFloat(entry.rate).toFixed(2)}</td>
                  <td className="px-4 py-[9px] text-right" style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 'bold', color: 'var(--brand)' }}>
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
