# 🥛 DCS Pro - Dairy Collection System

A complete desktop web application for managing dairy milk collection, farmer payments, deductions, and comprehensive reporting system.

![DCS Pro](https://img.shields.io/badge/DCS-Pro-green?style=for-the-badge)
![React](https://img.shields.io/badge/React-18-blue?style=for-the-badge&logo=react)
![Firebase](https://img.shields.io/badge/Firebase-Realtime-orange?style=for-the-badge&logo=firebase)
![TailwindCSS](https://img.shields.io/badge/Tailwind-CSS-38bdf8?style=for-the-badge&logo=tailwindcss)

---

## ✨ Features

### 🔐 Authentication
- **Mobile Number + Password** login system
- **Create Account** feature built-in
- No email required - just use mobile number
- Remember me functionality
- Secure Firebase authentication
- Bilingual (Hindi + English) interface

### 📊 Dashboard
- Real-time collection statistics
- Today's collection (Liters + Amount)
- Monthly totals
- Interactive charts (Last 7 days, Monthly comparison)
- Recent entries overview
- Live clock display

### 🎯 Master Data Management

#### DCS Master
- Society information management
- Contact details
- UPI configuration for payments

#### Farmer Master
- Complete farmer database
- Auto-sync from Firebase
- Search by code or name
- Add/Edit/Delete farmers
- Bank account details
- UPI ID management
- Mobile numbers for SMS

#### Rate Chart Master
- PDF upload for automatic rate extraction
- Manual rate chart entry
- FAT and SNF based pricing
- Multiple rate slabs support
- Active rate chart preview

### 🥛 Daily Milk Collection (Keyboard-First Design)
- **Complete keyboard navigation** - No mouse needed!
- Date and shift selection (Morning/Evening)
- Instant farmer lookup by code
- Auto-focus and Tab/Enter navigation
- Automatic rate calculation from FAT+SNF
- Real-time amount calculation
- **Instant SMS** to farmer after each entry
- Live collection table
- Shift totals and averages
- Edit/Delete entries
- Close shift functionality

### 💰 Deduction Manager
- Multiple deduction types:
  - Animal Feed/Chara
  - Medicine/Dawai
  - Custom deductions
- Farmer-wise deduction tracking
- Pending vs Settled status
- Carry-forward logic for large deductions
- Deduction history

### 💸 Payment Register
- Monthly payment calculation
- Gross amount calculation
- Auto-deduction processing
- Net payable amount

#### 🎯 Dual UPI Payment Options:
1. **PhonePe Deep Link**
   - Opens PhonePe app directly
   - Pre-filled payment amount
   - One-click payment initiation

2. **QR Code Payment**
   - Universal UPI QR code
   - Works with any UPI app
   - Farmer can scan to receive payment

- Custom amount override
- Payment status tracking
- Bulk SMS notifications
- Payment register PDF export

### 📄 Reports
- Member Code List
- Shift Summary Reports
- Member-wise Periodical Reports
- Rate Chart Print
- Individual Milk Slips
- Deduction Summary
- All reports printable as PDF

### 📱 SMS Integration (Fast2SMS)
- Automatic SMS on milk collection
- Payment confirmation SMS
- Bilingual support (Hindi + English)
- SMS logging and tracking
- Failed SMS retry mechanism

### 🌐 Bilingual Support
- Hindi (हिंदी)
- English
- Toggle between languages
- Complete UI translation

---

## 🛠️ Tech Stack

- **Frontend**: React 18 + Vite
- **Styling**: TailwindCSS
- **Database**: Firebase Realtime Database
- **Authentication**: Firebase Authentication
- **Charts**: Recharts
- **PDF Generation**: jsPDF + html2canvas
- **QR Code**: qrcode.react
- **SMS**: Fast2SMS API
- **Icons**: Lucide React
- **Language**: TypeScript

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- Firebase project (already configured)
- Fast2SMS account (optional, for SMS)

### Installation

1. **Clone/Extract the project**

2. **Install dependencies**
```bash
npm install
```

3. **Configure Firebase** ⚠️ **IMPORTANT**
   - See [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) for detailed instructions
   - Enable Firebase Authentication
   - Create first user
   - Set database rules

4. **Run development server**
```bash
npm run dev
```

5. **Build for production**
```bash
npm run build
```

The built files will be in `dist/` directory.

---

## 🔥 Firebase Setup (CRITICAL)

Before using the application, you MUST:

1. **Enable Email/Password Authentication**
   - Go to Firebase Console → Authentication → Sign-in method
   - Enable "Email/Password"

2. **Create Account via Application**
   - Run the app: `npm run dev`
   - Click "खाता बनाएं / Create Account" tab
   - Enter Name, Mobile Number (10 digits), Password
   - No need to manually create users in Firebase Console!

3. **Set Database Rules**
   - Go to Realtime Database → Rules
   - Set rules to allow authenticated access

**See [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) and [LOGIN_GUIDE.md](./LOGIN_GUIDE.md) for detailed instructions!**

---

## 📱 SMS Configuration

### Fast2SMS Setup

1. The API key is already configured in the code
2. To update or change:
   - Go to Settings page in the app
   - Enter your Fast2SMS API key
   - Test SMS functionality

### SMS Templates

**Milk Collection SMS:**
```
प्रिय [Name], आज [Date] [Shift] पाली में आपका दूध जमा हुआ:
दूध: [Qty] लीटर | FAT: [FAT]% | SNF: [SNF]%
दर: ₹[Rate]/लीटर | राशि: ₹[Amount]
- [DCS Name]
```

**Payment Confirmation SMS:**
```
आपका [Month] दूध भुगतान ₹[Amount] प्राप्त हुआ।
- [DCS Name]
```

---

## 💡 Usage Guide

### First Time Setup

1. **Login** with Firebase credentials
2. **Configure DCS Master**
   - Add society name, address
   - Set UPI details for payments
3. **Add Farmers**
   - Use Farmer Master to add farmers
   - Or sync from existing Firebase data
4. **Upload Rate Chart**
   - Upload PDF or enter manually
   - Verify FAT/SNF ranges and rates

### Daily Operations

1. **Morning/Evening Milk Collection**
   - Select date and shift
   - Enter farmer code → Press Enter
   - Enter Qty → Tab
   - Enter FAT → Tab
   - Enter SNF → Tab
   - Rate and amount auto-calculate
   - Press Enter to save
   - SMS sent automatically!

2. **Managing Deductions**
   - Add deductions for feed, medicine, etc.
   - Track pending amounts
   - System auto-deducts from monthly payment

3. **Monthly Payments**
   - Select month
   - Calculate payments
   - Choose payment method:
     - PhonePe: Opens app with amount
     - QR Code: Farmer scans to receive
   - Mark as paid
   - SMS confirmation sent

---

## 🎨 UI/UX Features

- **Color Theme**: Deep Green (#1B5E20) - Dairy/Nature theme
- **Font**: Poppins - Clean and modern
- **Keyboard First**: Complete keyboard navigation in milk collection
- **Responsive**: Works on desktop and tablets
- **Toast Notifications**: Success/Error/Warning messages
- **Loading States**: Visual feedback for all operations
- **Indian Formatting**: ₹ symbol, DD-MMM-YYYY dates
- **Live Clock**: Always visible in navbar
- **Auto-focus**: Smart cursor movement in forms

---

## 📊 Database Structure

```
/farmers/{farmerId}
  - farmerCode
  - farmerName
  - address
  - aadharNo
  - bankName
  - bankAC
  - branchAddress
  - mobileNo
  - upiId

/milkCollection/{date}/{shift}/{farmerId}
  - fat
  - snf
  - qty
  - rate
  - amount
  - timestamp

/deductions/{farmerId}/{id}
  - type
  - amount
  - date
  - description
  - status
  - remaining

/payments/{month}/{farmerId}
  - grossAmount
  - totalDeductions
  - netAmount
  - status
  - paidOn

/dcsInfo
  - name, address, code, phone
  - upiId, upiName

/rateChart/{id}
  - fatFrom, fatTo
  - snfFrom, snfTo
  - rate

/smsLog/{id}
  - farmerId, message
  - status, timestamp
```

---

## 🔑 Keyboard Shortcuts

### Milk Collection Screen
- `Tab` - Move to next field
- `Enter` - Submit/Move to next
- `Esc` - Clear form
- Auto-focus on Farmer Code field

### General
- `Ctrl/Cmd + S` - Save (where applicable)
- `Esc` - Close modals

---

## 🎯 Key Features Explained

### 1. Automatic Rate Calculation
- System looks up rate from rate chart
- Based on FAT and SNF ranges
- Instant calculation: Amount = Rate × Qty
- No manual entry needed!

### 2. Carry-Forward Deductions
- If deduction > monthly gross
- Remaining amount carries to next month
- Automatic tracking
- Full history maintained

### 3. UPI Payment Integration
- **PhonePe**: `phonepe://pay?pa=[UPI]&...`
- **QR Code**: Universal UPI string
- Fallback to mobile@ybl if no UPI ID
- Custom amount override support

### 4. Bilingual System
- Complete Hindi translation
- Toggle in navbar
- Persists across sessions
- Both UI and reports

---

## 📦 Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Navbar.tsx
│   └── Sidebar.tsx
├── contexts/            # React contexts
│   └── LanguageContext.tsx
├── firebase/            # Firebase configuration
│   └── config.ts
├── locales/             # Translation files
│   ├── en.json
│   └── hi.json
├── pages/               # Main application pages
│   ├── Dashboard.tsx
│   ├── Login.tsx
│   ├── MilkCollection.tsx
│   ├── PaymentRegister.tsx
│   ├── FarmerMaster.tsx
│   ├── DCSMaster.tsx
│   ├── RateChartMaster.tsx
│   ├── DeductionManager.tsx
│   ├── Reports.tsx
│   └── Settings.tsx
├── services/            # External services
│   └── sms.ts
├── utils/               # Utility functions
│   └── rateCalculator.ts
└── App.tsx              # Main app component
```

---

## 🔒 Security Notes

- All Firebase operations require authentication
- Database rules restrict access to authenticated users
- SMS API key should be kept secure
- Update production rules before deployment
- Use environment variables for sensitive data

---

## 🐛 Troubleshooting

### "auth/configuration-not-found"
→ Firebase Authentication not enabled. See FIREBASE_SETUP.md

### "Database permission denied"
→ Update Firebase Realtime Database rules

### "SMS not sending"
→ Check Fast2SMS API key in Settings

### "Rate not calculating"
→ Upload/configure Rate Chart in Master Menu

### "Farmer not found"
→ Add farmers in Farmer Master or sync from Firebase

---

## 📈 Future Enhancements

- [ ] Electron desktop app (.exe)
- [ ] Offline mode support
- [ ] Excel import/export
- [ ] Advanced analytics
- [ ] Multi-language support (Marathi, Gujarati, etc.)
- [ ] WhatsApp integration
- [ ] Mobile app (React Native)

---

## 📄 License

This project is proprietary software for dairy collection management.

---

## 🆘 Support

For issues or questions:
1. Check FIREBASE_SETUP.md
2. Review browser console (F12)
3. Verify Firebase configuration
4. Check database rules

---

## 👨‍💻 Development

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

### Build Output

Production build creates optimized single-file HTML in `dist/` directory.

---

## 🎉 Credits

Built with ❤️ for Indian Dairy Farmers

**Technologies:**
- React Team
- Firebase Team
- Vercel (Vite)
- TailwindCSS Team
- Recharts
- Fast2SMS

---

**Happy Dairy Management! 🐄🥛**

---

## 📞 Quick Reference

- **Default Login**: Create in Firebase Console
- **Database**: Firebase Realtime Database
- **SMS Provider**: Fast2SMS (India)
- **Payment**: UPI (PhonePe + QR)
- **Language**: Hindi + English
- **Theme**: Deep Green (#1B5E20)

---

*Last Updated: 2026*
