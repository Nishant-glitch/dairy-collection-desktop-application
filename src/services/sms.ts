import { ref, get, push } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';

// Fallback credentials are read from build-time env vars, never hard-coded.
// The primary source remains the per-user SMS settings stored in Firebase.
const DEFAULT_AUTH_KEY = import.meta.env.VITE_MSG91_AUTH_KEY || '';
const DEFAULT_TEMPLATE_ID = import.meta.env.VITE_MSG91_TEMPLATE_ID || '';

export const sendSMS = async ({
  farmerId,
  mobile,
  farmerName,
  qty,
  fat,
  amount,
}: {
  farmerId: string;
  mobile: string;
  farmerName: string;
  qty: string | number;
  fat: string | number;
  amount: string | number;
}): Promise<boolean> => {
  try {
    const settingsSnap = await get(ref(database, up('settings/sms')));
    const authKey = settingsSnap.exists() && settingsSnap.val().apiKey
      ? settingsSnap.val().apiKey
      : DEFAULT_AUTH_KEY;
    const templateId = settingsSnap.exists() && settingsSnap.val().templateId
      ? settingsSnap.val().templateId
      : DEFAULT_TEMPLATE_ID;

    if (!authKey || !templateId) {
      console.error('SMS not configured: missing MSG91 auth key / template id. Set them in Settings.');
      return false;
    }

    const cleanMobile = mobile.replace(/^\+91/, '').replace(/\s/g, '');
    if (!/^\d{10}$/.test(cleanMobile)) {
      throw new Error('Invalid mobile: ' + mobile);
    }

    await fetch('https://api.msg91.com/api/v5/flow/', {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'authkey': authKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template_id: templateId,
        short_url: '0',
        mobiles: '91' + cleanMobile,
        name: farmerName,
        qty: String(qty),
        fat: String(fat),
        amount: String(amount),
      }),
    });

    // no-cors = opaque response, assume success
    const success = true;

    await push(ref(database, up('smsLog')), {
      farmerId,
      mobile: cleanMobile,
      farmerName,
      qty: String(qty),
      fat: String(fat),
      amount: String(amount),
      status: 'sent',
      response: 'Opaque response (no-cors)',
      timestamp: Date.now(),
    });

    return success;
  } catch (error: any) {
    console.error('SMS Error:', error);
    return false;
  }
};

export const sendCollectionSMS = async (
  farmerName: string,
  farmerId: string,
  mobile: string,
  date: string,
  shift: string,
  qty: number,
  fat: number,
  snf: number,
  rate: number,
  amount: number,
  dcsName: string
) => {
  // This function is kept for compatibility but now calls the new sendSMS
  return sendSMS({
    farmerId,
    mobile,
    farmerName,
    qty,
    fat,
    amount: amount.toFixed(2),
  });
};

export const sendPaymentSMS = async (
  farmerName: string,
  farmerId: string,
  mobile: string,
  month: string,
  amount: number,
  dcsName: string
) => {
  // Payment SMS would need a different template in MSG91 flow
  // For now, we'll use the same sendSMS or handle it differently
  console.warn('sendPaymentSMS not yet updated for MSG91 flow templates');
  return false;
};
