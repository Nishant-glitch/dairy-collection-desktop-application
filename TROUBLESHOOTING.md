# 🔧 Troubleshooting Guide - DCS Pro

## Common Issues and Solutions

---

## 🔥 Firebase Authentication Issues

### ❌ Error: "Firebase: Error (auth/configuration-not-found)"

**Cause**: Firebase Authentication is not enabled

**Solution**:
1. Go to Firebase Console
2. Select project: farmerdb-ba9b0
3. Click Authentication → Sign-in method
4. Enable "Email/Password"
5. Save

**See**: [FIREBASE_ERROR_FIX.md](./FIREBASE_ERROR_FIX.md) for detailed guide

---

### ❌ Error: "auth/user-not-found"

**Cause**: User doesn't exist in Firebase

**Solution**:
1. Go to Firebase Console
2. Click Authentication → Users
3. Click "Add user"
4. Create user with email/password
5. Try login again

---

### ❌ Error: "auth/wrong-password"

**Cause**: Incorrect password

**Solution**:
1. Double-check password
2. Password is case-sensitive
3. Minimum 6 characters required
4. Or reset password in Firebase Console

---

### ❌ Error: "auth/invalid-email"

**Cause**: Email format is wrong

**Solution**:
- Use valid email format: user@example.com
- No spaces allowed
- Must contain @ and domain

---

### ❌ Error: "auth/too-many-requests"

**Cause**: Too many failed login attempts

**Solution**:
1. Wait 15-30 minutes
2. Or reset password in Firebase Console
3. Clear browser cache
4. Try again

---

## 💾 Database Issues

### ❌ Error: "PERMISSION_DENIED: Permission denied"

**Cause**: Database rules not configured

**Solution**:
1. Go to Firebase Console
2. Click Realtime Database → Rules
3. Set rules to:
```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```
4. Click Publish

---

### ❌ Data Not Saving

**Possible Causes**:
1. Not logged in
2. Database rules too restrictive
3. Internet connection issue
4. Invalid data format

**Solutions**:
1. Verify you're logged in
2. Check database rules
3. Check internet connection
4. Open browser console (F12) for errors

---

### ❌ Data Not Loading

**Solutions**:
1. Check internet connection
2. Verify Firebase database URL is correct
3. Check if data exists in Firebase Console
4. Clear browser cache
5. Refresh page

---

## 📱 SMS Issues

### ❌ SMS Not Sending

**Possible Causes**:
1. Invalid Fast2SMS API key
2. API key expired/exhausted
3. Invalid mobile number
4. Network issue

**Solutions**:
1. Verify API key in Settings page
2. Check Fast2SMS account balance
3. Ensure mobile number is 10 digits
4. Test with "Test SMS" in Settings
5. Check browser console for API errors

---

### ❌ SMS Sending but Not Received

**Solutions**:
1. Check if mobile number is correct
2. Check DND (Do Not Disturb) settings
3. Wait 1-2 minutes (can be delayed)
4. Check SMS Log in Firebase
5. Verify Fast2SMS account status

---

### ❌ SMS Shows Error in Console

**Check**:
1. API key is correct
2. Fast2SMS service is online
3. Internet connection works
4. Phone number format is valid

---

## 💰 Payment Issues

### ❌ UPI QR Code Not Generating

**Solutions**:
1. Check if farmer has UPI ID set
2. Verify amount is valid number
3. Ensure qrcode.react library is installed
4. Check browser console for errors

---

### ❌ PhonePe Link Not Opening

**Possible Causes**:
1. PhonePe not installed
2. Wrong URL format
3. Browser blocking deep link

**Solutions**:
1. Install PhonePe app
2. Try QR code method instead
3. Use different browser
4. Check UPI ID format

---

### ❌ Payment Not Recording

**Solutions**:
1. Check if "Mark as Paid" button clicked
2. Verify database permissions
3. Check internet connection
4. Look for errors in browser console

---

## 🧮 Rate Calculation Issues

### ❌ Rate Not Auto-Calculating

**Possible Causes**:
1. Rate chart not configured
2. FAT/SNF values out of range
3. No matching rate found

**Solutions**:
1. Go to Rate Chart Master
2. Add rates for your FAT/SNF ranges
3. Ensure ranges overlap properly
4. Check rate chart data in Firebase

---

### ❌ Wrong Rate Calculated

**Solutions**:
1. Verify rate chart entries
2. Check FAT/SNF ranges
3. Ensure no overlapping ranges
4. Review rate calculator logic

---

## 👨‍🌾 Farmer Issues

### ❌ Farmer Not Found

**Solutions**:
1. Check farmer code is correct
2. Add farmer in Farmer Master
3. Sync from Firebase if data exists
4. Verify farmer exists in database

---

### ❌ Farmer Data Not Syncing

**Solutions**:
1. Click "Sync from Website" button
2. Check internet connection
3. Verify Firebase database has farmer data
4. Check database permissions

---

## 📊 Dashboard/Charts Issues

### ❌ Charts Not Displaying

**Solutions**:
1. Add some collection data first
2. Wait for data to load
3. Check if Recharts library loaded
4. Refresh page
5. Clear cache

---

### ❌ Wrong Data in Charts

**Solutions**:
1. Check date range filter
2. Verify collection entries
3. Check calculation logic
4. Refresh data

---

## ⌨️ Keyboard Navigation Issues

### ❌ Tab/Enter Not Working in Milk Collection

**Solutions**:
1. Click on Farmer Code field first
2. Ensure browser focus is on form
3. Don't use browser shortcuts simultaneously
4. Check if any modals are open

---

### ❌ Auto-Focus Not Working

**Solutions**:
1. Refresh page
2. Close and reopen collection form
3. Click manually once
4. Check browser console for errors

---

## 🌐 Language/Translation Issues

### ❌ Language Not Changing

**Solutions**:
1. Click language toggle in navbar
2. Refresh page
3. Clear browser cache
4. Check translation files exist

---

### ❌ Some Text Not Translated

**This is normal**:
- Some technical terms kept in English
- Farmer names stay as entered
- Numbers and amounts not translated

---

## 🖨️ Printing/PDF Issues

### ❌ Print Preview Blank

**Solutions**:
1. Wait for data to load completely
2. Try different browser
3. Check printer settings
4. Use "Save as PDF" option

---

### ❌ PDF Not Generating

**Solutions**:
1. Ensure jsPDF library loaded
2. Check browser console
3. Try smaller data set
4. Update browser

---

## 🔄 Performance Issues

### ❌ App Running Slow

**Solutions**:
1. Clear browser cache
2. Close unused tabs
3. Check internet speed
4. Reduce data range in reports
5. Use latest browser version

---

### ❌ Firebase Quota Exceeded

**Solutions**:
1. Check Firebase usage in console
2. Upgrade Firebase plan if needed
3. Optimize database queries
4. Remove old unnecessary data

---

## 🖥️ Browser Issues

### ❌ App Not Loading

**Solutions**:
1. Clear cache and cookies
2. Disable browser extensions
3. Try incognito mode
4. Use supported browser:
   - Chrome (recommended)
   - Firefox
   - Edge
   - Safari

---

### ❌ Weird Display/Styling Issues

**Solutions**:
1. Hard refresh: Ctrl+Shift+R
2. Clear cache
3. Ensure TailwindCSS loaded
4. Check browser zoom (should be 100%)

---

## 🔍 Debugging Steps

### General Debugging Process:

1. **Open Browser Console** (F12)
   - Look for red errors
   - Read error messages
   - Check network tab

2. **Check Firebase Console**
   - Verify data exists
   - Check authentication status
   - Review database rules

3. **Verify Internet**
   - Test connection
   - Check firewall/proxy
   - Try different network

4. **Test in Incognito**
   - Rules out cache issues
   - Tests fresh state

5. **Check Recent Changes**
   - What did you change?
   - Can you undo it?
   - Try previous working version

---

## 🆘 Getting Help

### Before Asking for Help:

1. **Check Documentation**
   - README.md
   - QUICK_START.md
   - FIREBASE_SETUP.md

2. **Collect Information**
   - Exact error message
   - What you were doing
   - Browser and version
   - Screenshots

3. **Try Basic Fixes**
   - Refresh page
   - Clear cache
   - Logout/login
   - Restart browser

### Information to Provide:

- **Error Message**: Exact text
- **Browser**: Chrome/Firefox/etc + version
- **Steps**: What you did before error
- **Screenshot**: If visual issue
- **Console Errors**: From F12 console

---

## 📋 Pre-Flight Checklist

Before reporting an issue, verify:

- [ ] Firebase Authentication enabled
- [ ] User created in Firebase
- [ ] Database rules set
- [ ] Internet connection working
- [ ] Logged in successfully
- [ ] Latest browser version
- [ ] Cache cleared
- [ ] No browser extensions interfering

---

## 🔧 Quick Fixes

### General Issues:
```
1. Ctrl + Shift + R (Hard refresh)
2. F12 → Console tab → Check errors
3. Clear cache and cookies
4. Logout and login again
5. Try incognito mode
```

### Firebase Issues:
```
1. Go to Firebase Console
2. Check Authentication is enabled
3. Check Database rules
4. Verify data exists
5. Check usage quotas
```

### Network Issues:
```
1. Check internet connection
2. Disable VPN/Proxy
3. Try different network
4. Check firewall settings
5. Test with mobile hotspot
```

---

## ⚠️ Known Limitations

### Current Version:

1. **PDF Upload**: Basic parsing only
2. **Offline Mode**: Not available
3. **Multi-user**: Single admin only
4. **Export**: No Excel export yet
5. **Backup**: Manual only

**Note**: These are planned for future updates

---

## 🎯 Prevention Tips

### Best Practices:

1. **Regular Backups**
   - Export data weekly
   - Backup Firebase regularly

2. **Data Entry**
   - Double-check farmer codes
   - Verify FAT/SNF values
   - Review before saving

3. **Maintenance**
   - Clear cache monthly
   - Update browser regularly
   - Check Firebase quotas

4. **Testing**
   - Test SMS with own number first
   - Use dummy data for testing
   - Verify rates before live use

---

## 📞 Emergency Procedures

### If Everything Stops Working:

1. **DON'T PANIC** - Data is safe in Firebase
2. **Check Firebase Console** - Verify data is there
3. **Try Different Browser** - Rule out browser issues
4. **Check Firebase Status** - firebase.google.com/support/status
5. **Wait 10 Minutes** - Sometimes temporary issues
6. **Contact Support** - With error details

---

## ✅ Success Indicators

You'll know things are working when:

- ✅ Login successful without errors
- ✅ Dashboard loads with data
- ✅ Can add/edit farmers
- ✅ Milk collection saves
- ✅ SMS sends successfully
- ✅ Payments process correctly
- ✅ Reports generate
- ✅ No console errors

---

## 🎓 Understanding Error Messages

### Firebase Errors:

- `auth/...` = Authentication issue
- `PERMISSION_DENIED` = Database rules issue
- `network-request-failed` = Internet issue

### Application Errors:

- `Cannot read property...` = Data format issue
- `undefined is not...` = Missing data
- `Failed to fetch` = API/Network issue

### SMS Errors:

- `Invalid API key` = Fast2SMS config
- `Invalid number` = Phone format
- `Insufficient balance` = Fast2SMS account

---

**Remember**: Most issues are simple configuration problems that can be fixed in minutes!

---

*For detailed Firebase setup, see [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)*
*For quick start guide, see [QUICK_START.md](./QUICK_START.md)*
