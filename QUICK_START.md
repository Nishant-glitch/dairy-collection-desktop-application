# 🚀 DCS Pro - Quick Start Guide

## Step 1: Install & Run
```bash
npm install
npm run dev
```

## Step 2: Enable Firebase Authentication
1. Go to: https://console.firebase.google.com
2. Select project: **farmerdb-ba9b0**
3. Click **Authentication** → **Sign-in method**
4. Enable **Email/Password** provider
5. Click **Save**

## Step 3: Create Your Account
1. Application opens at: http://localhost:5173
2. Click **"खाता बनाएं / Create Account"** tab
3. Fill in:
   - **Name**: `Admin User` (or your name)
   - **Mobile Number**: `9876543210` (any 10-digit number)
   - **Password**: `admin123` (min 6 characters)
4. Click **"खाता बनाएं / Create Account"**
5. ✅ Done! You're logged in!

## Step 4: Start Using DCS Pro
You now have access to:
- ✅ **Dashboard** - View statistics and charts
- ✅ **Farmer Master** - Add/manage farmers
- ✅ **Milk Collection** - Record daily milk entries
- ✅ **Payments** - Process farmer payments with UPI
- ✅ **Reports** - Generate and print reports

---

## 📱 Login Next Time

### Use Mobile Number + Password:
1. Open app
2. Enter Mobile: `9876543210`
3. Enter Password: `admin123`
4. Click **Login**
5. ✅ Logged in!

---

## ⚡ Key Features to Try

### 1. Add a Farmer
```
Dashboard → Farmer Master → Add Farmer
Fill farmer details → Save
```

### 2. Record Milk Collection
```
Dashboard → Milk Collection
Enter Farmer Code → Qty → FAT → SNF → Save
(SMS sent automatically!)
```

### 3. Process Payment
```
Dashboard → Payment Register
Select Month → Calculate → Pay via PhonePe or QR
```

---

## 🐛 Common Issues

### Error: "Firebase Authentication not configured"
**Fix:** Enable Email/Password in Firebase Console (Step 2 above)

### Error: "No account found"
**Fix:** Create account first using "खाता बनाएं" tab

### Can't login?
**Fix:** Check mobile number (10 digits, starts with 6-9) and password

---

## 📚 More Help

- **Login Guide**: [LOGIN_GUIDE.md](./LOGIN_GUIDE.md)
- **Firebase Setup**: [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)
- **Full README**: [README.md](./README.md)
- **Troubleshooting**: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

---

## 🎯 You're All Set!

Now you can:
- ✅ Create accounts with mobile numbers
- ✅ Login without email
- ✅ Manage dairy operations
- ✅ Send SMS to farmers
- ✅ Process UPI payments
- ✅ Generate reports

**Happy Dairy Management!** 🐄🥛
