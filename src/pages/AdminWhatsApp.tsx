import { useState, useEffect } from 'react';
import { ref, get, set, update } from 'firebase/database';
import { database } from '../firebase/config';
import { isAdmin } from '../utils/userDb';
import { MessageSquare, Check, X, RefreshCw, Wallet, Save } from 'lucide-react';

// Admin dashboard for the WhatsApp wallet system:
//   1. Approve/reject pending recharge requests from societies (top-ups the
//      admin-only whatsappWallets/{uid}/balance node).
//   2. Configure the recharge UPI (visible to every society's Settings page)
//      and the per-message cost.
// No message sending here — that's a later step; this is only the money
// side of the multi-society WhatsApp foundation.

interface Request {
  uid: string;
  key: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: number;
  approvedAt?: number;
  societyLabel: string;
  balance: number;
}

const AdminWhatsApp: React.FC = () => {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string>('');

  // Config (recharge UPI + per-message price). Editable from this page.
  const [cfg, setCfg] = useState({ rechargeUpiId: '', rechargeUpiName: '', costPerMessage: 0.33 });
  const [savingCfg, setSavingCfg] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [reqSnap, usersSnap, walletsSnap, cfgSnap] = await Promise.all([
        get(ref(database, 'whatsappRechargeRequests')),
        get(ref(database, 'users')),
        get(ref(database, 'whatsappWallets')),
        get(ref(database, 'whatsappConfig')),
      ]);

      const users = usersSnap.exists() ? usersSnap.val() : {};
      const wallets = walletsSnap.exists() ? walletsSnap.val() : {};
      const c = cfgSnap.exists() ? cfgSnap.val() : {};
      setCfg({
        rechargeUpiId: c.rechargeUpiId || '',
        rechargeUpiName: c.rechargeUpiName || '',
        costPerMessage: typeof c.costPerMessage === 'number' && c.costPerMessage > 0 ? c.costPerMessage : 0.33,
      });

      // Flatten whatsappRechargeRequests/{uid}/{key} into a single sortable
      // list, joined against users (for the society label) and wallets (for
      // current balance context).
      const all: Request[] = [];
      const reqRoot = reqSnap.exists() ? reqSnap.val() : {};
      Object.keys(reqRoot).forEach((uid) => {
        const perSociety = reqRoot[uid] || {};
        const u = users[uid] || {};
        const name = u.dcsInfo?.name || u.name || 'Unknown Society';
        const code = u.dcsInfo?.code ? ` (${u.dcsInfo.code})` : '';
        const balance = typeof wallets[uid]?.balance === 'number' ? wallets[uid].balance : 0;
        Object.keys(perSociety).forEach((key) => {
          const r = perSociety[key] || {};
          all.push({
            uid, key,
            amount: Number(r.amount) || 0,
            status: (r.status as Request['status']) || 'pending',
            requestedAt: Number(r.requestedAt) || 0,
            approvedAt: r.approvedAt ? Number(r.approvedAt) : undefined,
            societyLabel: `${name}${code}`,
            balance,
          });
        });
      });
      // Pending first, then newest first within each status.
      all.sort((a, b) => {
        const av = a.status === 'pending' ? 0 : 1;
        const bv = b.status === 'pending' ? 0 : 1;
        return av - bv || b.requestedAt - a.requestedAt;
      });
      setRequests(all);
    } catch (e) {
      console.error('Failed to load WhatsApp admin data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const handleApprove = async (r: Request) => {
    if (r.status !== 'pending') return;
    if (!confirm(`₹${r.amount} balance add karein "${r.societyLabel}" ke wallet mein?\n\nCurrent balance: ₹${r.balance.toFixed(2)}\nAfter approval:  ₹${(r.balance + r.amount).toFixed(2)}`)) return;
    setBusyKey(r.key);
    try {
      // Two-part write: bump the balance, mark the request approved. Kept
      // sequential (not a multi-path atomic update) so a re-attempt after a
      // partial failure won't double-credit — request status flip runs last.
      await set(ref(database, `whatsappWallets/${r.uid}/balance`), r.balance + r.amount);
      await set(ref(database, `whatsappWallets/${r.uid}/updatedAt`), Date.now());
      await update(ref(database, `whatsappRechargeRequests/${r.uid}/${r.key}`), {
        status: 'approved',
        approvedAt: Date.now(),
      });
      await loadAll();
    } catch (e) {
      console.error(e);
      alert('❌ Approve failed. Rules check karein.');
    } finally {
      setBusyKey('');
    }
  };

  const handleReject = async (r: Request) => {
    if (r.status !== 'pending') return;
    if (!confirm(`Reject this recharge request?\n\n${r.societyLabel} — ₹${r.amount}`)) return;
    setBusyKey(r.key);
    try {
      await update(ref(database, `whatsappRechargeRequests/${r.uid}/${r.key}`), {
        status: 'rejected',
        approvedAt: Date.now(),
      });
      await loadAll();
    } catch (e) {
      console.error(e);
      alert('❌ Reject failed.');
    } finally {
      setBusyKey('');
    }
  };

  const handleSaveCfg = async () => {
    setSavingCfg(true);
    try {
      await set(ref(database, 'whatsappConfig'), {
        rechargeUpiId: cfg.rechargeUpiId.trim(),
        rechargeUpiName: cfg.rechargeUpiName.trim(),
        costPerMessage: Number(cfg.costPerMessage) || 0.33,
        updatedAt: Date.now(),
      });
      alert('✅ WhatsApp config saved. Sabhi societies ke Settings mein turant update ho jayega.');
    } catch (e) {
      console.error(e);
      alert('❌ Save failed.');
    } finally {
      setSavingCfg(false);
    }
  };

  if (!isAdmin()) {
    return (
      <div className="page-wrapper animate-fadeIn">
        <div className="error-box">Access denied. Ye page sirf admin ke liye hai.</div>
      </div>
    );
  }

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="page-wrapper animate-fadeIn">
      <h1 className="page-title"><MessageSquare color="#16a34a" /> WhatsApp Wallet — Admin</h1>

      {/* Config */}
      <div className="glass-card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Wallet size={18} style={{ color: 'var(--brand)' }} />
          <h2 style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 700 }}>Recharge Config</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <label className="label-text">Admin UPI ID</label>
            <input className="input-field" value={cfg.rechargeUpiId} onChange={(e) => setCfg({ ...cfg, rechargeUpiId: e.target.value })} placeholder="admin@upi" />
          </div>
          <div>
            <label className="label-text">UPI Display Name</label>
            <input className="input-field" value={cfg.rechargeUpiName} onChange={(e) => setCfg({ ...cfg, rechargeUpiName: e.target.value })} placeholder="DCS Pro Admin" />
          </div>
          <div>
            <label className="label-text">Cost per message (₹)</label>
            <input className="input-field" type="number" step="0.01" min="0.01" value={cfg.costPerMessage} onChange={(e) => setCfg({ ...cfg, costPerMessage: parseFloat(e.target.value) || 0 })} />
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-primary" onClick={handleSaveCfg} disabled={savingCfg} style={{ padding: '8px 18px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Save size={14} /> {savingCfg ? 'Saving...' : 'Save Config'}
          </button>
        </div>
        <p style={{ color: 'var(--ink-2)', fontSize: 11, marginTop: 10 }}>
          Society ke Settings mein QR + cost/msg live update ho jayenge. Cost/msg change karne se PURANE balance affect nahi hote — sirf naye messages iss rate se debit honge.
        </p>
      </div>

      {/* Requests header */}
      <div className="glass-card" style={{ padding: 18, marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 700 }}>
            Recharge Requests <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· {requests.length} total, {pendingCount} pending</span>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 11 }}>Society se payment mile toh Approve, warna Reject. Approve karte hi wallet mein balance add ho jayega.</div>
        </div>
        <button className="btn-secondary" onClick={loadAll} disabled={loading} style={{ padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Requests table */}
      <div className="table-container">
        <table className="table-3d" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead className="table-header">
            <tr>
              <th>Society</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th style={{ textAlign: 'right' }}>Balance (current)</th>
              <th>Requested</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const busy = busyKey === r.key;
              const pending = r.status === 'pending';
              return (
                <tr key={`${r.uid}_${r.key}`} className="table-row">
                  <td>
                    <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{r.societyLabel}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 11 }}>{r.uid}</div>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: '#166534' }}>₹{r.amount.toFixed(2)}</td>
                  <td style={{ textAlign: 'right' }}>₹{r.balance.toFixed(2)}</td>
                  <td>{r.requestedAt ? new Date(r.requestedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                  <td>
                    {r.status === 'pending' && <span style={{ padding: '3px 10px', borderRadius: 999, background: 'rgba(217,119,6,0.15)', color: '#b45309', fontSize: 11, fontWeight: 800 }}>Pending</span>}
                    {r.status === 'approved' && <span style={{ padding: '3px 10px', borderRadius: 999, background: 'rgba(22,163,74,0.15)', color: '#166534', fontSize: 11, fontWeight: 800 }}>Approved</span>}
                    {r.status === 'rejected' && <span style={{ padding: '3px 10px', borderRadius: 999, background: 'rgba(220,38,38,0.15)', color: '#b91c1c', fontSize: 11, fontWeight: 800 }}>Rejected</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {pending && (
                        <>
                          <button className="btn-success" onClick={() => handleApprove(r)} disabled={busy} style={{ padding: '6px 10px' }}>
                            <Check size={13} /> Approve
                          </button>
                          <button className="btn-danger" onClick={() => handleReject(r)} disabled={busy} style={{ padding: '6px 10px' }}>
                            <X size={13} /> Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {requests.length === 0 && (
              <tr className="table-row">
                <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
                  {loading ? 'Loading...' : 'Koi recharge request nahi.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminWhatsApp;
