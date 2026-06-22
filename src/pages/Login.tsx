import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, database } from '../firebase/config';
import { ref, set } from 'firebase/database';
import { Milk, User, Lock, Phone, ArrowRight } from 'lucide-react';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isCreateAccount, setIsCreateAccount] = useState(false);
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    createAdminIfNotExists();
  }, []);

  const createAdminIfNotExists = async () => {
    // Admin credentials must NOT be hard-coded in the source. They are only
    // read from build-time env vars purely to bootstrap the account on a fresh
    // Firebase project. In normal operation the admin already exists, so these
    // are left blank and this becomes a no-op (login behaviour is unchanged).
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
    const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) return;
    try {
      await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
    } catch (e: any) {
      if (e.code !== 'auth/email-already-in-use') {
        console.error(e);
      }
    }
  };

  const mobileToEmail = (mobile: string) => {
    return `${mobile}@dcspro.com`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const isAdminLogin = mobileNumber === 'admin@nishant.com';
    if (!isAdminLogin && !/^[6-9]\d{9}$/.test(mobileNumber)) {
      setError('कृपया वैध 10 अंकों का मोबाइल नंबर दर्ज करें\nPlease enter valid 10-digit mobile number');
      setLoading(false);
      return;
    }

    try {
      const email = isAdminLogin ? mobileNumber : mobileToEmail(mobileNumber);
      await signInWithEmailAndPassword(auth, email, password);
      if (rememberMe) {
        localStorage.setItem('rememberedMobile', mobileNumber);
      }
      onLogin();
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.code === 'auth/wrong-password') {
        setError('❌ गलत पासवर्ड / Incorrect password');
      } else if (err.code === 'auth/user-not-found') {
        setError('❌ इस मोबाइल नंबर से कोई खाता नहीं मिला\nNo account found with this mobile number');
      } else {
        setError(err.message || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (!/^[6-9]\d{9}$/.test(mobileNumber)) {
      setError('कृपया वैध 10 अंकों का मोबाइल नंबर दर्ज करें\nPlease enter valid 10-digit mobile number');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('पासवर्ड कम से कम 6 अक्षरों का होना चाहिए\nPassword must be at least 6 characters');
      setLoading(false);
      return;
    }

    if (!name.trim()) {
      setError('कृपया नाम दर्ज करें / Please enter name');
      setLoading(false);
      return;
    }

    try {
      const email = mobileToEmail(mobileNumber);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      await updateProfile(userCredential.user, {
        displayName: name
      });

      await set(ref(database, `users/${userCredential.user.uid}`), {
        name: name,
        mobileNumber: mobileNumber,
        email: email,
        createdAt: new Date().toISOString(),
        role: 'user'
      });

      setSuccess('✅ खाता सफलतापूर्वक बनाया गया!\nAccount created successfully!');
      setTimeout(() => onLogin(), 1500);

    } catch (err: any) {
      console.error('Account creation error:', err);
      setError(err.message || 'Account creation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #0f172a, #1a1f35)' }}>
      <div className="max-w-md w-full animate-fadeUp">
        {/* Logo and Branding */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-24 h-24 glass-card mb-6" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', borderRadius: 24, boxShadow: '0 20px 40px rgba(245,158,11,0.2)' }}>
            <Milk className="w-14 h-14 text-[#0f172a]" />
          </div>
          <h1 className="text-5xl font-black text-white mb-2 tracking-tighter" style={{ textShadow: '0 0 20px rgba(245,158,11,0.3)' }}>DCS Pro</h1>
          <p className="text-amber-500 font-bold text-lg uppercase tracking-widest">Dairy Collection System</p>
        </div>

        {/* Auth Card */}
        <div className="glass-card" style={{ padding: '28px 32px' }}>
          {/* Toggle Buttons */}
          <div className="flex p-1 glass-card" style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 14, marginBottom: '24px' }}>
            <button
              type="button"
              onClick={() => { setIsCreateAccount(false); setError(''); setSuccess(''); }}
              className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all ${!isCreateAccount ? 'btn-primary' : 'text-slate-400 hover:text-white'}`}
            >
              LOGIN
            </button>
            <button
              type="button"
              onClick={() => { setIsCreateAccount(true); setError(''); setSuccess(''); }}
              className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all ${isCreateAccount ? 'btn-primary' : 'text-slate-400 hover:text-white'}`}
            >
              SIGN UP
            </button>
          </div>

          <form onSubmit={isCreateAccount ? handleCreateAccount : handleLogin}>
            {isCreateAccount && (
              <div style={{ marginBottom: '18px' }}>
                <label className="label-text" style={{ marginBottom: '8px', fontSize: '12px' }}>Full Name</label>
                <div className="relative">
                  <User size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input-field"
                    style={{ padding: '12px 14px', paddingLeft: 44, fontSize: '14px' }}
                    placeholder="Enter your name"
                    required
                  />
                </div>
              </div>
            )}

            <div style={{ marginBottom: '18px' }}>
              <label className="label-text" style={{ marginBottom: '8px', fontSize: '12px' }}>Mobile Number / Admin ID</label>
              <div className="relative">
                <Phone size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  className="input-field"
                  style={{ padding: '12px 14px', paddingLeft: 44, fontSize: '14px' }}
                  placeholder="9876543210"
                  required
                />
              </div>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label className="label-text" style={{ marginBottom: '8px', fontSize: '12px' }}>Password</label>
              <div className="relative">
                <Lock size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  style={{ padding: '12px 14px', paddingLeft: 44, fontSize: '14px' }}
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {!isCreateAccount && (
              <div className="flex items-center" style={{ marginTop: '4px', marginBottom: '20px' }}>
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 rounded border-none bg-black/50"
                />
                <label htmlFor="rememberMe" className="ml-3 text-sm text-slate-400 cursor-pointer">
                  Remember Me
                </label>
              </div>
            )}

            {error && <div className="error-box" style={{ marginBottom: '18px' }}>{error}</div>}
            {success && <div className="farmer-found-box" style={{ color: '#4ade80', fontSize: 13, whiteSpace: 'pre-line', marginBottom: '18px' }}>{success}</div>}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
              style={{ marginTop: '8px', padding: '13px', width: '100%', fontSize: 16 }}
            >
              {loading ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="animate-spin h-5 w-5 border-2 border-[#0f172a]/30 border-t-[#0f172a] rounded-full" />
                  Processing...
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  {isCreateAccount ? 'Create Account' : 'Sign In'}
                  <ArrowRight size={18} />
                </div>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center text-slate-600 text-xs" style={{ marginTop: '24px' }}>
          <p>© 2026 DCS Pro - Premium Dairy Solutions</p>
          <p className="mt-1">Encrypted & Secure Session</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
