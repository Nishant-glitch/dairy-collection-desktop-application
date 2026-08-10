import { useState, useEffect } from 'react';
import { ref, get, set } from 'firebase/database';
import { database, auth } from '../firebase/config';
import { isAdmin } from '../utils/userDb';
import { RotateCcw, PlayCircle, ShieldAlert, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';

// Admin-only recovery tool for the pre-fix B/F data model.
//
// Old code stored one balance per farmer (single slot), so finalizing the
// same month twice — or finalizing the currently-viewed month at all — wiped
// the reference the next month needed. This tool REPLAYS every farmer's
// month-by-month net (gross − deductions, rolling forward) from their earliest
// activity and populates the new per-month path:
//     farmerBalances/{code}/{yyyy-MM} = { balance, finalizedAt, finalizedBy }
// Dry-run first so the admin can preview EXACTLY which cells will change
// before any write happens.
//
// Assumption for the recompute: B/F for each farmer's earliest recorded month
// is 0 (no unrecorded prior carry). If a society has hand-adjusted balances
// or brought a farmer over mid-history, those adjustments aren't in the raw
// data and won't be reproduced — the tool intentionally does NOT touch the
// legacy scalar record, so admins can fall back to it if needed.

interface Society { uid: string; label: string; }

interface PlanRow {
  farmerCode: string;
  farmerName: string;
  month: string;
  gross: number;
  deductions: number;
  balance: number; // rolling net after applying this month
  before: number | null; // what the new per-month path currently reads (null = not written yet)
  changed: boolean;
}

interface RecoverySummary {
  societyUid: string;
  societyLabel: string;
  rows: PlanRow[];
  totalRows: number;
  changedRows: number;
  farmersTouched: number;
  monthsTouched: number;
}

const AdminRecoverBalances: React.FC = () => {
  const [societies, setSocieties] = useState<Society[]>([]);
  const [selectedUid, setSelectedUid] = useState('');
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<RecoverySummary | null>(null);
  const [wroteMsg, setWroteMsg] = useState('');
  const [expandUnchanged, setExpandUnchanged] = useState(false);

  useEffect(() => {
    (async () => {
      if (!isAdmin()) return;
      const snap = await get(ref(database, 'users'));
      if (!snap.exists()) return;
      const users = snap.val();
      const list = Object.keys(users).map((uid) => {
        const u = users[uid] || {};
        const name = u.dcsInfo?.name || u.name || 'Unknown Society';
        const code = u.dcsInfo?.code ? ` (${u.dcsInfo.code})` : '';
        return { uid, label: `${name}${code}` };
      }).sort((a, b) => a.label.localeCompare(b.label));
      setSocieties(list);
      setSelectedUid(list[0]?.uid || '');
    })();
  }, []);

  // Build the recovery plan from a society's raw data. Pure function — no
  // writes — used for both dry-run preview AND as the source of the eventual
  // write. Same input -> same plan, so what you see is what you get.
  const buildPlan = async (uid: string): Promise<RecoverySummary> => {
    const [mcSnap, geSnap, balSnap, farmersSnap, dcsSnap] = await Promise.all([
      get(ref(database, `users/${uid}/milkCollection`)),
      get(ref(database, `users/${uid}/grossEntries`)),
      get(ref(database, `users/${uid}/farmerBalances`)),
      get(ref(database, `users/${uid}/farmers`)),
      get(ref(database, `users/${uid}/dcsInfo`)),
    ]);
    const mc = mcSnap.exists() ? mcSnap.val() : {};
    const ge = geSnap.exists() ? geSnap.val() : {};
    const balances = balSnap.exists() ? balSnap.val() : {};
    const farmers = farmersSnap.exists() ? farmersSnap.val() : {};
    const dcs = dcsSnap.exists() ? dcsSnap.val() : {};
    const societyLabel = `${dcs.name || 'Unknown'}${dcs.code ? ` (${dcs.code})` : ''}`;

    // Collect per-farmer per-month totals from milk + gross-entries.
    const perFarmerMonth: Record<string, Record<string, { gross: number; deductions: number }>> = {};
    const touch = (code: string, month: string): { gross: number; deductions: number } => {
      if (!perFarmerMonth[code]) perFarmerMonth[code] = {};
      if (!perFarmerMonth[code][month]) perFarmerMonth[code][month] = { gross: 0, deductions: 0 };
      return perFarmerMonth[code][month];
    };

    // milkCollection/{date}/{shift}/{code} = { amount, ... }
    Object.keys(mc).forEach((date) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      const month = date.substring(0, 7);
      const shifts = mc[date] || {};
      Object.values(shifts).forEach((shift: any) => {
        if (!shift || typeof shift !== 'object') return;
        Object.keys(shift).forEach((code) => {
          const amount = parseFloat(shift[code]?.amount || 0);
          if (!isFinite(amount)) return;
          touch(code, month).gross += amount;
        });
      });
    });

    // grossEntries — nested {code}/{entryId}={date, amount} OR legacy flat.
    Object.keys(ge).forEach((code) => {
      const bucket = ge[code];
      if (!bucket || typeof bucket !== 'object') return;
      if (typeof bucket.date === 'string') return; // legacy flat entry — skip
      Object.values(bucket).forEach((entry: any) => {
        if (!entry?.date || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) return;
        const month = entry.date.substring(0, 7);
        const amount = parseFloat(entry.amount || 0);
        if (!isFinite(amount)) return;
        touch(code, month).deductions += amount;
      });
    });

    // Roll forward: for each farmer, walk months in ascending order,
    // net = gross − deductions + carry.
    const rows: PlanRow[] = [];
    const farmerCodes = Object.keys(perFarmerMonth).sort();
    for (const code of farmerCodes) {
      const months = Object.keys(perFarmerMonth[code]).sort();
      let carry = 0;
      for (const m of months) {
        const { gross, deductions } = perFarmerMonth[code][m];
        const net = gross - deductions + carry;
        // What's currently at the new per-month path for this row?
        const existing = balances[code]?.[m];
        const before = existing && typeof existing.balance === 'number' ? existing.balance : null;
        // "changed" if either the value differs from what's already stored, or
        // there's nothing stored yet. Rounded to 2dp for float noise.
        const changed = before == null || Math.abs(before - net) > 0.005;
        rows.push({
          farmerCode: code,
          farmerName: farmers[code]?.farmerName || farmers[code]?.name || 'Unknown',
          month: m, gross, deductions, balance: net, before, changed,
        });
        carry = net;
      }
    }

    const changedRows = rows.filter((r) => r.changed).length;
    const farmersTouched = new Set(rows.filter((r) => r.changed).map((r) => r.farmerCode)).size;
    const monthsTouched = new Set(rows.filter((r) => r.changed).map((r) => r.month)).size;

    return {
      societyUid: uid, societyLabel, rows,
      totalRows: rows.length, changedRows, farmersTouched, monthsTouched,
    };
  };

  const handleDryRun = async () => {
    if (!selectedUid) return;
    setLoading(true);
    setWroteMsg('');
    setSummary(null);
    try {
      const s = await buildPlan(selectedUid);
      setSummary(s);
    } catch (e) {
      console.error('Dry run failed:', e);
      alert('❌ Dry run failed. Check console.');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!summary) return;
    const { changedRows, societyLabel } = summary;
    if (changedRows === 0) {
      alert('Kuch bhi update karne ki zaroorat nahi — sab already correct hai.');
      return;
    }
    if (!confirm(`WRITE ${changedRows} balance rows for "${societyLabel}"?\n\nYe naye per-month path (farmerBalances/{code}/{month}) mein likhega. Legacy scalar record touch nahi hoga — safety fallback ke liye.\n\nContinue?`)) return;
    setRunning(true);
    setWroteMsg('');
    try {
      const finalizedAt = Date.now();
      const finalizedBy = `${auth.currentUser?.email || 'admin'} (recover-balances)`;
      let wrote = 0, failed = 0;
      // Sequential writes so a mid-batch failure gives us an accurate wrote count
      // in the summary and doesn't overwhelm RTDB with parallel puts.
      for (const r of summary.rows) {
        if (!r.changed) continue;
        try {
          await set(
            ref(database, `users/${summary.societyUid}/farmerBalances/${r.farmerCode}/${r.month}`),
            { balance: r.balance, finalizedAt, finalizedBy }
          );
          wrote++;
        } catch (e) {
          console.error('Write failed for', r.farmerCode, r.month, e);
          failed++;
        }
      }
      // Also log the recovery run itself so future audit can see what happened.
      try {
        await set(ref(database, `users/${summary.societyUid}/bfResetLog/recover_${finalizedAt}`), {
          scope: 'recover',
          resetAt: finalizedAt,
          resetBy: auth.currentUser?.email || auth.currentUser?.uid || 'admin',
          rowsAttempted: changedRows,
          rowsWritten: wrote,
          rowsFailed: failed,
        });
      } catch { /* audit failure is non-fatal */ }
      setWroteMsg(`✅ ${wrote} rows wrote${failed ? `, ${failed} failed (check console)` : ''}. Refreshing plan…`);
      const s = await buildPlan(summary.societyUid);
      setSummary(s);
    } catch (e) {
      console.error('Execute failed:', e);
      alert('❌ Execute failed. Check console.');
    } finally {
      setRunning(false);
    }
  };

  if (!isAdmin()) {
    return (
      <div className="page-wrapper animate-fadeIn">
        <div className="error-box">Access denied. Ye page sirf admin ke liye hai.</div>
      </div>
    );
  }

  return (
    <div className="page-wrapper animate-fadeIn">
      <h1 className="page-title"><RotateCcw color="#dc2626" /> Recover Farmer Balances</h1>

      <div className="glass-card" style={{ padding: 18, marginBottom: 18, borderLeft: '4px solid #f59e0b' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <ShieldAlert size={20} color="#b45309" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--ink)' }}>Ye tool kya karta hai:</strong> Society ke poore milk-collection + gross-entries history se har farmer ka month-by-month rolling net compute karta hai, aur naye per-month path <code>farmerBalances/{'{code}/{yyyy-MM}'}</code> mein likhta hai. Purana single-slot record touch nahi hota — safety fallback ke liye.
            <br /><br />
            <strong style={{ color: 'var(--ink)' }}>Assumption:</strong> Har farmer ka pehla recorded month ka B/F = 0 (matlab DCS Pro pehle koi legacy carry-over nahi tha). Agar society ne manually kisi ka B/F adjust kiya hai to wo yahan reproduce nahi hoga.
            <br /><br />
            <strong style={{ color: '#dc2626' }}>Zaroor dry-run pehle chalayein.</strong> Preview mein exact plan dikhega — kya likhega, kya skip karega — us ke baad hi Execute dabayein.
          </div>
        </div>
      </div>

      <div className="glass-card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label className="label-text">Society</label>
            <select className="input-field" value={selectedUid} onChange={(e) => { setSelectedUid(e.target.value); setSummary(null); setWroteMsg(''); }} style={{ width: '100%' }}>
              {societies.map((s) => (<option key={s.uid} value={s.uid}>{s.label}</option>))}
            </select>
          </div>
          <button className="btn-secondary" onClick={handleDryRun} disabled={!selectedUid || loading || running} style={{ padding: '10px 18px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? 'Computing…' : 'Dry Run (Preview)'}
          </button>
          <button
            onClick={handleExecute}
            disabled={!summary || summary.changedRows === 0 || running}
            style={{
              padding: '10px 18px', fontWeight: 800, fontSize: 13,
              background: summary && summary.changedRows > 0 && !running ? '#16a34a' : '#a1a1aa',
              color: '#fff', border: 'none', borderRadius: 10,
              cursor: summary && summary.changedRows > 0 && !running ? 'pointer' : 'not-allowed',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <PlayCircle size={14} /> {running ? 'Writing…' : `Execute (${summary?.changedRows || 0} rows)`}
          </button>
        </div>
        {wroteMsg && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.35)', color: '#166534', borderRadius: 8, fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={14} /> {wroteMsg}
          </div>
        )}
      </div>

      {summary && (
        <>
          <div className="glass-card" style={{ padding: 18, marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Stat label="Society" value={summary.societyLabel} />
            <Stat label="Total rows in plan" value={String(summary.totalRows)} />
            <Stat label="Rows that will change" value={String(summary.changedRows)} highlight={summary.changedRows > 0} />
            <Stat label="Farmers touched" value={String(summary.farmersTouched)} />
            <Stat label="Months touched" value={String(summary.monthsTouched)} />
          </div>

          <div className="glass-card" style={{ padding: 0, overflowX: 'auto' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <strong style={{ fontSize: 14 }}>Plan Preview</strong>
              <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={expandUnchanged} onChange={(e) => setExpandUnchanged(e.target.checked)} />
                Show unchanged rows
              </label>
            </div>
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
                  <th style={cellHead}>Farmer</th>
                  <th style={cellHead}>Month</th>
                  <th style={{ ...cellHead, textAlign: 'right' }}>Gross</th>
                  <th style={{ ...cellHead, textAlign: 'right' }}>Deductions</th>
                  <th style={{ ...cellHead, textAlign: 'right' }}>New Balance</th>
                  <th style={{ ...cellHead, textAlign: 'right' }}>Currently Stored</th>
                  <th style={cellHead}></th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.filter((r) => expandUnchanged || r.changed).slice(0, 500).map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--line-2)', background: r.changed ? 'rgba(217,119,6,0.05)' : undefined }}>
                    <td style={cellBody}>
                      <div style={{ fontWeight: 700 }}>{r.farmerCode}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.farmerName}</div>
                    </td>
                    <td style={cellBody}>{r.month}</td>
                    <td style={{ ...cellBody, textAlign: 'right', color: '#16a34a' }}>₹{r.gross.toFixed(2)}</td>
                    <td style={{ ...cellBody, textAlign: 'right', color: '#dc2626' }}>₹{r.deductions.toFixed(2)}</td>
                    <td style={{ ...cellBody, textAlign: 'right', fontWeight: 800, color: r.balance < 0 ? '#dc2626' : '#166534' }}>
                      {r.balance < 0 ? '-' : ''}₹{Math.abs(r.balance).toFixed(2)}
                    </td>
                    <td style={{ ...cellBody, textAlign: 'right', color: 'var(--muted)' }}>
                      {r.before == null ? '(none)' : `₹${r.before.toFixed(2)}`}
                    </td>
                    <td style={cellBody}>
                      {r.changed
                        ? <span style={{ padding: '2px 8px', borderRadius: 999, background: 'rgba(217,119,6,0.15)', color: '#b45309', fontSize: 11, fontWeight: 800 }}>WILL WRITE</span>
                        : <span style={{ padding: '2px 8px', borderRadius: 999, background: 'rgba(148,163,184,0.15)', color: '#64748b', fontSize: 11, fontWeight: 800 }}>OK</span>}
                    </td>
                  </tr>
                ))}
                {summary.rows.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Is society ka koi milk / gross entry data nahi mila.</td></tr>
                )}
              </tbody>
            </table>
            {summary.rows.filter((r) => expandUnchanged || r.changed).length > 500 && (
              <div style={{ padding: 12, textAlign: 'center', color: 'var(--muted)', fontSize: 12, borderTop: '1px solid var(--line)' }}>
                Preview truncated to first 500 rows. Execute writes ALL {summary.rows.filter((r) => r.changed).length} changed rows.
              </div>
            )}
          </div>

          {summary.changedRows === 0 && summary.totalRows > 0 && (
            <div className="glass-card" style={{ padding: 16, marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', color: '#166534' }}>
              <CheckCircle2 size={18} /> Sab already correct hai — kuch write karne ki zaroorat nahi.
            </div>
          )}
          {summary.totalRows === 0 && (
            <div className="glass-card" style={{ padding: 16, marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', color: '#b45309' }}>
              <AlertTriangle size={18} /> Is society mein compute karne ke liye koi milk-collection / gross-entries data nahi hai.
            </div>
          )}
        </>
      )}
    </div>
  );
};

const cellHead: React.CSSProperties = { padding: '10px 14px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink-2)' };
const cellBody: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: 'var(--ink)' };

const Stat: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div style={{ minWidth: 140 }}>
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--ink-2)' }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 800, color: highlight ? '#b45309' : 'var(--ink)' }}>{value}</div>
  </div>
);

export default AdminRecoverBalances;
