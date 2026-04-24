import { ref, get, push } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';

const DEFAULT_AUTH_KEY = '511304ApFLOfqq69eafe97P1';
const DEFAULT_TEMPLATE_ID = '69eafce28acc315c3a09beb2';

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

    const cleanMobile = mobile.replace(/^\+91/, '').replace(/\s/g, '');
    if (!/^\d{10}$/.test(cleanMobile)) {
      throw new Error('Invalid mobile: ' + mobile);
    }

    const res = await fetch('/api/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authKey,
        templateId,
        mobile: cleanMobile,
        name: farmerName,
        qty: String(qty),
        fat: String(fat),
        amount: String(amount),
      }),
    });
    const data = await res.json();
    const success = data?.type === 'success';

    await push(ref(database, up('smsLog')), {
      farmerId,
      mobile: cleanMobile,
      farmerName,
      qty: String(qty),
      fat: String(fat),
      amount: String(amount),
      status: success ? 'success' : 'failed',
      response: JSON.stringify(data),
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
