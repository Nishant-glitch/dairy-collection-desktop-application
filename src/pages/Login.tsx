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
    try {
      await createUserWithEmailAndPassword(auth, 'admin@nishant.com', 'nishant@123');
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

  const labelStyle: React.CSSProperties = { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'block' };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #0a1f0f 0%, #0d2d18 40%, #0f3d20 100%)' }}>
      <div className="max-w-md w-full animate-fadeIn">
        {/* Logo and Branding */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-24 h-24 glass-card mb-6" style={{ background: 'linear-gradient(135deg, #4ade80, #1a5c2e)', borderRadius: 24, boxShadow: '0 20px 40px rgba(74,222,128,0.2)' }}>
            <Milk className="w-14 h-14 text-white" />
          </div>
          <h1 className="text-5xl font-black text-white mb-2 tracking-tighter" style={{ textShadow: '0 0 20px rgba(74,222,128,0.3)' }}>DCS Pro</h1>
          <p className="text-green-400 font-bold text-lg uppercase tracking-widest">Dairy Collection System</p>
        </div>

        {/* Auth Card */}
        <div className="glass-card" style={{ padding: 40, border: '1px solid rgba(255,255,255,0.15)' }}>
          {/* Toggle Buttons */}
          <div className="flex mb-8 p-1 glass-card" style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 14 }}>
            <button
              type="button"
              onClick={() => { setIsCreateAccount(false); setError(''); setSuccess(''); }}
              className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all ${!isCreateAccount ? 'btn-3d' : 'text-white/50 hover:text-white'}`}
            >
              LOGIN
            </button>
            <button
              type="button"
              onClick={() => { setIsCreateAccount(true); setError(''); setSuccess(''); }}
              className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all ${isCreateAccount ? 'btn-3d' : 'text-white/50 hover:text-white'}`}
            >
              SIGN UP
            </button>
          </div>

          <form onSubmit={isCreateAccount ? handleCreateAccount : handleLogin} className="space-y-6">
            {isCreateAccount && (
              <div>
                <label style={labelStyle}>Full Name</label>
                <div className="relative">
                  <User size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }} />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input-3d w-full"
                    style={{ paddingLeft: 44 }}
                    placeholder="Enter your name"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label style={labelStyle}>Mobile Number / Admin ID</label>
              <div className="relative">
                <Phone size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }} />
                <input
                  type="text"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  className="input-3d w-full"
                  style={{ paddingLeft: 44 }}
                  placeholder="9876543210"
                  required
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Password</label>
              <div className="relative">
                <Lock size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-3d w-full"
                  style={{ paddingLeft: 44 }}
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {!isCreateAccount && (
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 accent-green-500 rounded border-none bg-black/50"
                />
                <label htmlFor="rememberMe" className="ml-3 text-sm text-white/70 cursor-pointer">
                  Remember Me
                </label>
              </div>
            )}

            {error && <div className="p-4 glass-card" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 13, whiteSpace: 'pre-line' }}>{error}</div>}
            {success && <div className="p-4 glass-card" style={{ background: 'rgba(74,222,128,0.1)', borderColor: 'rgba(74,222,128,0.3)', color: '#86efac', fontSize: 13, whiteSpace: 'pre-line' }}>{success}</div>}

            <button
              type="submit"
              disabled={loading}
              className="btn-3d w-full"
              style={{ padding: 16, fontSize: 16 }}
            >
              {loading ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" />
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
        <div className="text-center mt-10 text-white/30 text-xs">
          <p>© 2026 DCS Pro - Premium Dairy Solutions</p>
          <p className="mt-1">Encrypted & Secure Session</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
