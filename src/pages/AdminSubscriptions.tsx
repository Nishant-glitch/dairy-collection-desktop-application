import { useState, useEffect } from 'react';
import { ref, get } from 'firebase/database';
import { database } from '../firebase/config';
import { isAdmin } from '../utils/userDb';
import {
  PLANS, PlanKey, Subscription,
  isSubActive, daysLeft, activateSubscription, revokeSubscription,
} from '../utils/subscription';
import { Search, Crown, Check, X, RefreshCw } from 'lucide-react';

interface Row {
  uid: string;
  name: string;
  mobile: string;
  email: string;
  sub: Subscription | null;
}

const AdminSubscriptions: React.FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState<PlanKey>('yearly');
  const [loading, setLoading] = useState(false);
  const [busyUid, setBusyUid] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersSnap, subsSnap] = await Promise.all([
        get(ref(database, 'users')),
        get(ref(database, 'subscriptions')),
      ]);
      const users = usersSnap.exists() ? usersSnap.val() : {};
      const subs = subsSnap.exists() ? subsSnap.val() : {};

      const list: Row[] = Object.keys(users).map((uid) => {
        const u = users[uid] || {};
        return {
          uid,
          name: u.name || u.farmerName || 'Unknown',
          mobile: u.mobileNumber || '',
          email: u.email || '',
          sub: (subs[uid] as Subscription) || null,
        };
      });
      // Active subscriptions sabse upar, phir naam ke hisaab se
      list.sort((a, b) => {
        const av = isSubActive(a.sub) ? 0 : 1;
        const bv = isSubActive(b.sub) ? 0 : 1;
        return av - bv || a.name.localeCompare(b.name);
      });
      setRows(list);
    } catch (e) {
      console.error('Failed to load subscriptions:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleActivate = async (uid: string) => {
    setBusyUid(uid);
    try {
      await activateSubscription(uid, plan);
      await loadData();
    } catch (e) {
      console.error(e);
      alert('Activate failed. Sirf admin hi activate kar sakta hai.');
    } finally {
      setBusyUid('');
    }
  };

  const handleRevoke = async (uid: string) => {
    if (!confirm('Is user ki subscription revoke karein?')) return;
    setBusyUid(uid);
    try {
      await revokeSubscription(uid);
      await loadData();
    } catch (e) {
      console.error(e);
      alert('Revoke failed.');
    } finally {
      setBusyUid('');
    }
  };

  if (!isAdmin()) {
    return (
      <div className="page-wrapper animate-fadeIn">
        <div className="error-box">Access denied. Ye page sirf admin ke liye hai.</div>
      </div>
    );
  }

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || r.mobile.includes(q) || r.email.toLowerCase().includes(q);
  });

  return (
    <div className="page-wrapper animate-fadeIn">
      <h1 className="page-title"><Crown color="#f59e0b" /> Subscriptions</h1>

      <div className="glass-card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }} />
            <input
              className="input-field"
              style={{ paddingLeft: 36 }}
              placeholder="Search naam / mobile / email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="label-text" style={{ marginBottom: 4 }}>Plan</label>
            <select className="input-field" value={plan} onChange={(e) => setPlan(e.target.value as PlanKey)} style={{ minWidth: 160 }}>
              {(Object.keys(PLANS) as PlanKey[]).map((k) => (
                <option key={k} value={k}>{PLANS[k].label} — ₹{PLANS[k].price}</option>
              ))}
            </select>
          </div>
          <button onClick={loadData} className="btn-secondary" style={{ padding: '10px 16px' }} disabled={loading}>
            <RefreshCw size={16} /> {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="table-container">
        <table className="table-3d" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead className="table-header">
            <tr>
              <th>Name</th>
              <th>Mobile</th>
              <th>Status</th>
              <th>Expiry</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const active = isSubActive(r.sub);
              const busy = busyUid === r.uid;
              return (
                <tr key={r.uid} className="table-row">
                  <td>
                    <div style={{ color: 'white', fontWeight: 600 }}>{r.name}</div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{r.email}</div>
                  </td>
                  <td>{r.mobile || '-'}</td>
                  <td>
                    {active
                      ? <span className="success-chip">Active · {daysLeft(r.sub)}d left</span>
                      : <span style={{ color: '#f87171', fontSize: 12, fontWeight: 600 }}>Inactive</span>}
                  </td>
                  <td>{r.sub?.expiresAt ? new Date(r.sub.expiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="btn-success" onClick={() => handleActivate(r.uid)} disabled={busy}>
                        <Check size={14} /> {active ? 'Extend' : 'Activate'}
                      </button>
                      {r.sub && (
                        <button className="btn-danger" onClick={() => handleRevoke(r.uid)} disabled={busy}>
                          <X size={14} /> Revoke
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr className="table-row">
                <td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'rgba(255,255,255,0.4)' }}>
                  {loading ? 'Loading...' : 'No users found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminSubscriptions;
