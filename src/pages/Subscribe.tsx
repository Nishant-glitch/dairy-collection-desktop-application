import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Crown, Check, RefreshCw, LogOut, MessageCircle } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { PLANS, PlanKey, getMySubscription, isSubActive } from '../utils/subscription';

// === Payment details — apne hisaab se badlein ===
const UPI_ID = '9153656573@yesfam';
const PAYEE_NAME = 'Nishant Kumar';
const WHATSAPP = '919153656573'; // payment proof bhejne ke liye (country code ke saath)

const Subscribe: React.FC = () => {
  const [plan, setPlan] = useState<PlanKey>('yearly');
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState('');

  const user = auth.currentUser;
  const price = PLANS[plan].price;
  const note = `DCS Pro ${PLANS[plan].label} - ${user?.email || ''}`;
  const upiLink = `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(PAYEE_NAME)}&am=${price}&cu=INR&tn=${encodeURIComponent(note)}`;
  const waText = encodeURIComponent(
    `Namaste, maine DCS Pro ${PLANS[plan].label} (Rs.${price}) ka payment ${UPI_ID} par kar diya hai. Mera account: ${user?.email || ''}. Kripya subscription activate karein.`
  );
  const waLink = `https://wa.me/${WHATSAPP}?text=${waText}`;

  const handleCheck = async () => {
    setChecking(true);
    setMsg('');
    const sub = await getMySubscription();
    if (isSubActive(sub)) {
      window.location.reload();
    } else {
      setMsg('Abhi tak subscription active nahi hui. Payment ke baad admin activate karega — thodi der baad dobara check karein.');
      setChecking(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    window.location.reload();
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 12, fontWeight: 800, color: 'var(--ink-2)',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12,
  };

  return (
    <div className="animate-fadeUp" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: 920, padding: 32 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, margin: '0 auto 14px',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)', borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 12px 32px rgba(245,158,11,0.3)',
          }}>
            <Crown color="#0a1f0f" size={28} />
          </div>
          <h1 className="page-title" style={{ justifyContent: 'center', marginBottom: 6 }}>Subscribe to DCS Pro</h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 13 }}>
            Aapka account abhi active nahi hai. App use karne ke liye subscription activate karwayein.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, alignItems: 'start' }}>
          {/* Left: plans + steps */}
          <div>
            <div style={sectionTitle}>Plan chunein</div>
            {(Object.keys(PLANS) as PlanKey[]).map((k) => {
              const selected = plan === k;
              return (
                <div
                  key={k}
                  onClick={() => setPlan(k)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '14px 16px', borderRadius: 12, marginBottom: 10, cursor: 'pointer',
                    border: selected ? '2px solid #4ade80' : '1px solid var(--line)',
                    background: selected ? 'rgba(74,222,128,0.1)' : 'rgba(0,0,0,0.25)',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      border: selected ? 'none' : '2px solid var(--line)',
                      background: selected ? '#4ade80' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected && <Check size={14} color="#0a1f0f" strokeWidth={3} />}
                    </div>
                    <div>
                      <div style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 15 }}>{PLANS[k].label}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 11 }}>{PLANS[k].days} days validity</div>
                    </div>
                  </div>
                  <div style={{ color: 'var(--brand)', fontWeight: 800, fontSize: 18 }}>₹{PLANS[k].price}</div>
                </div>
              );
            })}

            <div style={{ ...sectionTitle, marginTop: 22 }}>Kaise activate hoga</div>
            <ol style={{ color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.9, paddingLeft: 18, margin: 0 }}>
              <li>Apna plan select karein.</li>
              <li>QR scan karke UPI app se payment karein.</li>
              <li>Payment screenshot WhatsApp par bhejein.</li>
              <li>Admin verify karke activate karega — phir niche "Check karein" dabayein.</li>
            </ol>
          </div>

          {/* Right: QR + actions */}
          <div>
            <div style={sectionTitle}>UPI se payment karein</div>
            <div style={{
              background: '#fff', borderRadius: 16, padding: 20, textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            }}>
              <QRCodeSVG value={upiLink} size={190} includeMargin level="M" />
              <div style={{ color: '#0a1f0f', fontWeight: 800, fontSize: 22, marginTop: 6 }}>₹{price}</div>
              <div style={{ color: '#475569', fontSize: 12, fontWeight: 600 }}>{PAYEE_NAME}</div>
              <div style={{ color: '#64748b', fontSize: 12 }}>{UPI_ID}</div>
            </div>

            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
              style={{ width: '100%', marginTop: 16, padding: '13px', textDecoration: 'none' }}
            >
              <MessageCircle size={18} /> Payment proof bhejein
            </a>

            <button
              onClick={handleCheck}
              disabled={checking}
              className="btn-secondary"
              style={{ width: '100%', marginTop: 10, padding: '13px' }}
            >
              <RefreshCw size={18} /> {checking ? 'Checking...' : 'Payment ho gaya? Check karein'}
            </button>

            {msg && (
              <div className="warning-box" style={{ marginTop: 12, fontSize: 12, whiteSpace: 'pre-line' }}>
                {msg}
              </div>
            )}
          </div>
        </div>

        {/* Footer / logout */}
        <div style={{ borderTop: '1px solid var(--line)', marginTop: 28, paddingTop: 18, textAlign: 'center' }}>
          <span style={{ color: 'var(--muted)', fontSize: 12, marginRight: 12 }}>
            Logged in as {user?.email}
          </span>
          <button onClick={handleLogout} className="btn-secondary" style={{ padding: '8px 18px' }}>
            <LogOut size={14} /> Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default Subscribe;
