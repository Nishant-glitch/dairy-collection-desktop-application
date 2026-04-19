import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, db } from '../firebase/config';
import { ref, set } from 'firebase/database';
import { Milk } from 'lucide-react';

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
      // If already exists, ignore error
      if (e.code !== 'auth/email-already-in-use') {
        console.error(e);
      }
    }
  };

  // Convert mobile number to email format for Firebase
  const mobileToEmail = (mobile: string) => {
    return `${mobile}@dcspro.com`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    // Validate mobile number or admin email
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
      
      if (err.code === 'auth/configuration-not-found') {
        setError('⚠️ Firebase Authentication not configured!\n\nPlease follow these steps:\n1. Go to Firebase Console (console.firebase.google.com)\n2. Select project: farmerdb-ba9b0\n3. Click Authentication → Sign-in method\n4. Enable "Email/Password" provider\n5. Try creating an account or logging in again');
      } else if (err.code === 'auth/user-not-found') {
        setError('❌ इस मोबाइल नंबर से कोई खाता नहीं मिला\nNo account found with this mobile number\n\nPlease create an account first.');
      } else if (err.code === 'auth/wrong-password') {
        setError('❌ गलत पासवर्ड / Incorrect password');
      } else if (err.code === 'auth/invalid-email') {
        setError('❌ Invalid mobile number format');
      } else if (err.code === 'auth/too-many-requests') {
        setError('⚠️ Too many failed attempts. Please try again later.');
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

    // Validate mobile number
    if (!/^[6-9]\d{9}$/.test(mobileNumber)) {
      setError('कृपया वैध 10 अंकों का मोबाइल नंबर दर्ज करें\nPlease enter valid 10-digit mobile number');
      setLoading(false);
      return;
    }

    // Validate password
    if (password.length < 6) {
      setError('पासवर्ड कम से कम 6 अक्षरों का होना चाहिए\nPassword must be at least 6 characters');
      setLoading(false);
      return;
    }

    // Validate name
    if (!name.trim()) {
      setError('कृपया नाम दर्ज करें / Please enter name');
      setLoading(false);
      return;
    }

    try {
      const email = mobileToEmail(mobileNumber);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Update user profile with name
      await updateProfile(userCredential.user, {
        displayName: name
      });

      // Save user data to database
      await set(ref(db, `users/${userCredential.user.uid}`), {
        name: name,
        mobileNumber: mobileNumber,
        email: email,
        createdAt: new Date().toISOString(),
        role: 'user'
      });

      setSuccess('✅ खाता सफलतापूर्वक बनाया गया!\nAccount created successfully!\n\nLogging you in...');
      
      // Auto login after 1.5 seconds
      setTimeout(() => {
        onLogin();
      }, 1500);

    } catch (err: any) {
      console.error('Account creation error:', err);
      
      if (err.code === 'auth/email-already-in-use') {
        setError('❌ यह मोबाइल नंबर पहले से पंजीकृत है\nThis mobile number is already registered\n\nPlease login instead.');
      } else if (err.code === 'auth/weak-password') {
        setError('❌ पासवर्ड बहुत कमजोर है\nPassword is too weak\n\nUse at least 6 characters.');
      } else if (err.code === 'auth/configuration-not-found') {
        setError('⚠️ Firebase Authentication not configured!\n\nPlease follow these steps:\n1. Go to Firebase Console (console.firebase.google.com)\n2. Select project: farmerdb-ba9b0\n3. Click Authentication → Sign-in method\n4. Enable "Email/Password" provider\n5. Try again');
      } else {
        setError(err.message || 'Account creation failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo and Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full mb-4 shadow-lg">
            <Milk className="w-12 h-12 text-green-800" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">DCS Pro</h1>
          <p className="text-green-100 text-lg">Dairy Collection System</p>
          <p className="text-green-200 text-sm mt-1">डेयरी संग्रह प्रणाली</p>
        </div>

        {/* Login/Create Account Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Toggle Buttons */}
          <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => {
                setIsCreateAccount(false);
                setError('');
                setSuccess('');
              }}
              className={`flex-1 py-2 px-4 rounded-md font-medium transition-all ${
                !isCreateAccount
                  ? 'bg-green-800 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              लॉगिन / Login
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreateAccount(true);
                setError('');
                setSuccess('');
              }}
              className={`flex-1 py-2 px-4 rounded-md font-medium transition-all ${
                isCreateAccount
                  ? 'bg-green-800 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              खाता बनाएं / Create Account
            </button>
          </div>

          <form onSubmit={isCreateAccount ? handleCreateAccount : handleLogin} className="space-y-4">
            {/* Name Field (only for create account) */}
            {isCreateAccount && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  नाम / Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-800 focus:border-transparent outline-none transition-all"
                  placeholder="अपना नाम दर्ज करें / Enter your name"
                  required
                />
              </div>
            )}

            {/* Mobile Number Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                मोबाइल नंबर / Mobile Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-800 focus:border-transparent outline-none transition-all"
                placeholder="10 अंकों का मोबाइल नंबर / 10-digit mobile number"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Example: 9876543210 or admin@nishant.com</p>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                पासवर्ड / Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-800 focus:border-transparent outline-none transition-all"
                placeholder={isCreateAccount ? "कम से कम 6 अक्षर / Min 6 characters" : "पासवर्ड दर्ज करें / Enter password"}
                required
                minLength={6}
              />
            </div>

            {/* Remember Me (only for login) */}
            {!isCreateAccount && (
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 text-green-800 border-gray-300 rounded focus:ring-green-800"
                />
                <label htmlFor="rememberMe" className="ml-2 text-sm text-gray-700">
                  मुझे याद रखें / Remember Me
                </label>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm whitespace-pre-line">
                {error}
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm whitespace-pre-line">
                {success}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-800 hover:bg-green-900 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {isCreateAccount ? 'खाता बनाया जा रहा है...' : 'लॉगिन हो रहा है...'}
                </span>
              ) : (
                isCreateAccount ? 'खाता बनाएं / Create Account' : 'लॉगिन / Login'
              )}
            </button>
          </form>

          {/* Help Text */}
          <div className="mt-6 text-center text-sm text-gray-600">
            <p className="mb-2">
              {isCreateAccount 
                ? '✓ कोई भी 10 अंकों का मोबाइल नंबर उपयोग करें'
                : '✓ पंजीकृत मोबाइल नंबर से लॉगिन करें'
              }
            </p>
            <p className="text-xs text-gray-500">
              {isCreateAccount
                ? 'Use any valid 10-digit mobile number to create account'
                : 'Login with your registered mobile number'
              }
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-green-100 text-sm">
          <p>© 2024 DCS Pro - Dairy Collection System</p>
          <p className="text-xs mt-1">Powered by Firebase & React</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
