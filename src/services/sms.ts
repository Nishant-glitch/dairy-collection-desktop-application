import axios from 'axios';
import { ref, push, get } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';

const DEFAULT_API_KEY = 'pljS6DHLkMGf1nqXeaTQJVuwg0di3sYrOE5NtvoWKU79CPcbhR4jTr9MAEeFKpwZBg2O3htxLmQqbXyY';

export interface SMSParams {
  farmerId: string;
  mobile: string;
  message: string;
}

export const sendSMS = async ({ farmerId, mobile, message }: SMSParams): Promise<boolean> => {
  try {
    // Load API key from Firebase
    const settingsSnap = await get(ref(database, up('settings/sms')));
    const apiKey = settingsSnap.exists() && settingsSnap.val().apiKey
      ? settingsSnap.val().apiKey
      : DEFAULT_API_KEY;

    const cleanMobile = mobile.replace(/^\+91/, '').replace(/\s/g, '');
    if (!/^\d{10}$/.test(cleanMobile)) {
      throw new Error('Invalid mobile number');
    }

    // Use GET to avoid CORS
    const encodedMsg = encodeURIComponent(message);
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&route=q&message=${encodedMsg}&language=unicode&flash=0&numbers=${cleanMobile}`;
    
    const res = await fetch(url, { method: 'GET' });
    const data = await res.json();

    // Log to Firebase
    await push(ref(database, up('smsLog')), {
      farmerId,
      mobile: cleanMobile,
      message,
      status: data?.return === true ? 'success' : 'failed',
      response: JSON.stringify(data),
      timestamp: Date.now(),
    });

    return data?.return === true;
  } catch (error: any) {
    console.error('SMS failed:', error);
    try {
      await push(ref(database, up('smsLog')), {
        farmerId, mobile, message,
        status: 'failed',
        response: error.message || 'Unknown error',
        timestamp: Date.now(),
      });
    } catch (e) {}
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
  const message = `प्रिय ${farmerName}, आज ${date} ${shift} पाली में आपका दूध जमा हुआ:
दूध: ${qty.toFixed(2)} लीटर | FAT: ${fat.toFixed(2)}% | SNF: ${snf.toFixed(2)}%
दर: ₹${rate.toFixed(2)}/लीटर | राशि: ₹${amount.toFixed(2)}
- ${dcsName}`;

  return sendSMS({ farmerId, mobile, message });
};

export const sendPaymentSMS = async (
  farmerName: string,
  farmerId: string,
  mobile: string,
  month: string,
  amount: number,
  dcsName: string
) => {
  const message = `प्रिय ${farmerName}, आपका ${month} दूध भुगतान ₹${amount.toFixed(2)} प्राप्त हुआ। - ${dcsName}`;

  return sendSMS({ farmerId, mobile, message });
};
