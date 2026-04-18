# 📱 DCS Pro - Login & Account Creation Guide

## ✅ What Changed

The login page now supports **MOBILE NUMBER + PASSWORD** authentication with **account creation** feature.

---

## 🆕 New Features

### 1️⃣ **Create Account (खाता बनाएं)**
- Click on "खाता बनाएं / Create Account" tab
- Enter:
  - **Name** (नाम): Your full name
  - **Mobile Number** (मोबाइल नंबर): 10-digit Indian mobile number (6-9 से शुरू)
  - **Password** (पासवर्ड): Minimum 6 characters
- Click "खाता बनाएं / Create Account"
- Account will be created and you'll be automatically logged in!

### 2️⃣ **Login (लॉगिन)**
- Click on "लॉगिन / Login" tab
- Enter:
  - **Mobile Number**: Your registered 10-digit mobile number
  - **Password**: Your account password
  - ☑️ **Remember Me** (optional): Saves your mobile number
- Click "लॉगिन / Login"

---

## 📋 Example Usage

### Creating First Account:
1. Open the app
2. Click "खाता बनाएं / Create Account"
3. Fill in:
   - Name: `राम कुमार` or `Ram Kumar`
   - Mobile: `9876543210`
   - Password: `mypassword123`
4. Click Create Account
5. ✅ Account created! You're now logged in.

### Logging In Later:
1. Open the app
2. Stay on "लॉगिन / Login" tab
3. Enter:
   - Mobile: `9876543210`
   - Password: `mypassword123`
4. Click Login
5. ✅ Logged in!

---

## 🔧 Technical Details

### How It Works:
- Mobile number is converted to email format: `9876543210@dcspro.com`
- Uses Firebase Email/Password Authentication internally
- User data stored in Firebase Database at `/users/{uid}`
- Display name set to the entered name

### Validation:
- ✅ Mobile must be exactly 10 digits
- ✅ Mobile must start with 6, 7, 8, or 9 (Indian format)
- ✅ Password must be at least 6 characters
- ✅ Name is required for account creation

### Data Stored:
```json
{
  "users": {
    "user_uid_here": {
      "name": "Ram Kumar",
      "mobileNumber": "9876543210",
      "email": "9876543210@dcspro.com",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "role": "admin"
    }
  }
}
```

---

## ⚠️ Important Notes

1. **First Time Setup**:
   - Firebase Authentication must be enabled
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Select project: `farmerdb-ba9b0`
   - Enable Authentication → Email/Password provider

2. **Mobile Number Format**:
   - Must be 10 digits
   - Must start with 6, 7, 8, or 9
   - Only Indian mobile numbers supported
   - Example: `9876543210` ✅
   - Example: `8765432109` ✅
   - Example: `5876543210` ❌ (doesn't start with 6-9)
   - Example: `98765` ❌ (less than 10 digits)

3. **Password Requirements**:
   - Minimum 6 characters
   - Can include letters, numbers, special characters
   - Example: `password123` ✅
   - Example: `abc` ❌ (too short)

4. **Account Uniqueness**:
   - Each mobile number can only create ONE account
   - If mobile already registered, use Login instead
   - Error will show: "यह मोबाइल नंबर पहले से पंजीकृत है"

---

## 🐛 Troubleshooting

### Error: "Firebase Authentication not configured"
**Solution:**
1. Go to Firebase Console
2. Click Authentication → Sign-in method
3. Enable "Email/Password" provider
4. Try again

### Error: "This mobile number is already registered"
**Solution:**
- This mobile is already used
- Use the Login tab instead of Create Account
- Or use a different mobile number

### Error: "No account found with this mobile number"
**Solution:**
- You need to create an account first
- Click "खाता बनाएं / Create Account" tab
- Register with this mobile number

### Error: "Incorrect password"
**Solution:**
- Check your password (case-sensitive)
- Make sure CAPS LOCK is off
- Try resetting password (feature to be added)

---

## 🎯 Quick Start

### For New Users:
```
1. Click "खाता बनाएं / Create Account"
2. Enter Name, Mobile (10 digits), Password (6+ chars)
3. Click Create Account
4. Done! You're logged in.
```

### For Existing Users:
```
1. Stay on "लॉगिन / Login" tab
2. Enter Mobile Number + Password
3. Click Login
4. Done! You're in.
```

---

## 🔐 Security Features

- ✅ Passwords are encrypted by Firebase
- ✅ Mobile numbers validated before submission
- ✅ Remember Me feature for convenience
- ✅ Account locked after too many failed attempts
- ✅ Secure Firebase authentication

---

## 📞 Support

If you face any issues:
1. Check Firebase Console for Authentication status
2. Verify mobile number format (10 digits, starts with 6-9)
3. Ensure password is at least 6 characters
4. Clear browser cache and try again
5. Check internet connection

---

## ✨ Benefits

1. **No Email Required**: Use mobile number directly
2. **Simple & Fast**: Just mobile + password
3. **Bilingual**: Hindi + English support
4. **Remember Me**: Saves mobile for quick login
5. **Auto Login**: After account creation, auto logged in
6. **User Friendly**: Clear error messages in both languages

---

**Enjoy using DCS Pro!** 🐄🥛
