import axios from 'axios';
import { ref, push, get } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';

const FAST2SMS_ENDPOINT = 'https://www.fast2sms.com/dev/bulkV2';
const DEFAULT_API_KEY = 'pljS6DHLkMGf1nqXeaTQJVuwg0di3sYrOE5NtvoWKU79CPcbhR4jTr9MAEeFKpwZBg2O3htxLmQqbXyY';

export interface SMSParams {
  farmerId: string;
  mobile: string;
  message: string;
}

export const sendSMS = async ({ farmerId, mobile, message }: SMSParams): Promise<boolean> => {
  try {
    // Load API key from Firebase settings
    const settingsRef = ref(database, up('settings'));
    const settingsSnap = await get(settingsRef);
    
    let apiKey = DEFAULT_API_KEY;
    if (settingsSnap.exists()) {
      const settings = settingsSnap.val();
      // Look for the first settings object since it's an array/object in Firebase
      const settingsData = Object.values(settings)[0] as any;
      if (settingsData && settingsData.smsApiKey) {
        apiKey = settingsData.smsApiKey;
      }
    }

    // Clean mobile number (remove +91 if present)
    const cleanMobile = mobile.replace(/^\+91/, '').replace(/\s/g, '');
    
    // Validate mobile number (10 digits)
    if (!/^\d{10}$/.test(cleanMobile)) {
      throw new Error('Invalid mobile number format');
    }

    const response = await axios.post(
      FAST2SMS_ENDPOINT,
      {
        route: 'q',
        message: message,
        language: 'unicode',
        flash: 0,
        numbers: cleanMobile,
      },
      {
        headers: {
          authorization: apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    // Log SMS to Firebase
    const smsLogRef = ref(database, up('smsLog'));
    await push(smsLogRef, {
      farmerId,
      mobile: cleanMobile,
      message,
      status: response.data?.return === true ? 'success' : 'failed',
      response: JSON.stringify(response.data),
      timestamp: Date.now(),
    });

    return response.data?.return === true;
  } catch (error: any) {
    console.error('SMS sending failed:', error);
    
    // Log failure to Firebase
    try {
      const smsLogRef = ref(database, up('smsLog'));
      await push(smsLogRef, {
        farmerId,
        mobile,
        message,
        status: 'failed',
        response: error.response?.data ? JSON.stringify(error.response.data) : (error.message || 'Unknown error'),
        timestamp: Date.now(),
      });
    } catch (logError) {
      console.error('Failed to log SMS error:', logError);
    }

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
