import React, { useState, useEffect } from 'react';
import { ref, get, set, onValue } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { formatIndianCurrency } from '../utils/rateCalculator';
import { sendPaymentSMS } from '../services/sms';
import { Smartphone, QrCode, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface PaymentEntry {
  farmerId: string;
  farmerName: string;
  mobile: string;
  upiId: string;
  grossAmount: number;
  deductions: number;
  netPayable: number;
  customAmount: number;
  isPaid: boolean;
}

const PaymentRegister: React.FC = () => {
  const { t } = useLanguage();
  const [month, setMonth] = useState(new Date().toISOString().substring(0, 7));
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [farmers, setFarmers] = useState<any>({});
  const [dcsInfo, setDcsInfo] = useState<any>({});
  const [showQR, setShowQR] = useState<{ show: boolean; data: string; farmer: string }>({
    show: false,
    data: '',
    farmer: '',
  });

  useEffect(() => {
    loadFarmers();
    loadDCSInfo();
  }, []);

  const loadFarmers = () => {
    const farmersRef = ref(database, up('farmers'));
    onValue(farmersRef, (snapshot) => {
      if (snapshot.exists()) {
        setFarmers(snapshot.val());
      }
    });
  };

  const loadDCSInfo = async () => {
    const dcsRef = ref(database, up('dcsInfo'));
    const snapshot = await get(dcsRef);
    if (snapshot.exists()) {
      setDcsInfo(snapshot.val());
    }
  };

  const calculatePayments = async () => {
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const collectionRef = ref(database, up('milkCollection'));
    const snapshot = await get(collectionRef);

    const farmerPayments: { [key: string]: PaymentEntry } = {};

    if (snapshot.exists()) {
      const data = snapshot.val();
      Object.keys(data).forEach((date) => {
        if (date >= startDate && date <= endDate) {
          const shifts = data[date];
          Object.values(shifts).forEach((shift: any) => {
            Object.keys(shift).forEach((farmerId) => {
              const entry = shift[farmerId];
              if (!farmerPayments[farmerId]) {
                const farmer = farmers[farmerId] || {};
                farmerPayments[farmerId] = {
                  farmerId,
                  farmerName: farmer.farmerName || 'Unknown',
                  mobile: farmer.mobileNo || '',
                  upiId: farmer.upiId || `${farmer.mobileNo}@ybl`,
                  grossAmount: 0,
                  deductions: 0,
                  netPayable: 0,
                  customAmount: 0,
                  isPaid: false,
                };
              }
              farmerPayments[farmerId].grossAmount += parseFloat(entry.amount || 0);
            });
          });
        }
      });
    }

    // Load deductions from grossEntries
    const grossEntriesRef = ref(database, up('grossEntries'));
    const grossEntriesSnapshot = await get(grossEntriesRef);
    if (grossEntriesSnapshot.exists()) {
      const grossEntriesData = grossEntriesSnapshot.val();
      Object.keys(grossEntriesData).forEach((farmerId) => {
        if (farmerPayments[farmerId]) {
          const entries = grossEntriesData[farmerId];
          let totalDeduction = 0;
          Object.values(entries).forEach((entry: any) => {
            totalDeduction += parseFloat(entry.amount || 0);
          });
          farmerPayments[farmerId].deductions = totalDeduction;
        }
      });
    }

    // Calculate net payable
    Object.keys(farmerPayments).forEach((farmerId) => {
      const payment = farmerPayments[farmerId];
      payment.netPayable = payment.grossAmount - payment.deductions;
      payment.customAmount = payment.netPayable;
    });

    setPayments(Object.values(farmerPayments));
  };

  const handleCustomAmount = (farmerId: string, amount: number) => {
    setPayments((prev) =>
      prev.map((p) => (p.farmerId === farmerId ? { ...p, customAmount: amount } : p))
    );
  };

  const handlePayViaPhonePe = (payment: PaymentEntry) => {
    const upiId = payment.upiId || `${payment.mobile}@ybl`;
    const amount = payment.customAmount;
    const name = payment.farmerName;
    const note = `Milk Payment ${month}`;

    const deepLink = `phonepe://pay?pa=${upiId}&pn=${encodeURIComponent(
      name
    )}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;

    window.location.href = deepLink;
  };

  const handleShowQR = (payment: PaymentEntry) => {
    const upiId = payment.upiId || `${payment.mobile}@ybl`;
    const amount = payment.customAmount;
    const name = payment.farmerName;
    const note = `Milk ${month}`;

    const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(
      name
    )}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;

    setShowQR({
      show: true,
      data: upiString,
      farmer: `${payment.farmerName} - ${formatIndianCurrency(amount)}`,
    });
  };

  const markAsPaid = async (payment: PaymentEntry) => {
    const paymentRef = ref(database, up(`payments/${month}/${payment.farmerId}`));
    await set(paymentRef, {
      grossAmount: payment.grossAmount,
      totalDeductions: payment.deductions,
      netAmount: payment.customAmount,
      status: 'paid',
      paidOn: Date.now(),
    });

    // Send SMS
    if (payment.mobile) {
      await sendPaymentSMS(
        payment.farmerName,
        payment.farmerId,
        payment.mobile,
        month,
        payment.customAmount,
        dcsInfo.name || 'DCS'
      );
    }

    setPayments((prev) =>
      prev.map((p) => (p.farmerId === payment.farmerId ? { ...p, isPaid: true } : p))
    );

    alert('Payment marked as paid and SMS sent!');
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold text-green-900 mb-6">{t('paymentRegister')}</h1>

      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Month</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
            />
          </div>
          <button
            onClick={calculatePayments}
            className="bg-green-700 text-white px-6 py-2 rounded-lg hover:bg-green-800 font-semibold"
          >
            Calculate Payments
          </button>
        </div>
      </div>

      {payments.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-green-50">
                <tr>
                  <th className="px-4 py-3 text-left">Farmer Code</th>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-right">Gross Amount</th>
                  <th className="px-4 py-3 text-right">Deductions</th>
                  <th className="px-4 py-3 text-right">Net Payable</th>
                  <th className="px-4 py-3 text-right">Custom Amount</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.farmerId} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">{payment.farmerId}</td>
                    <td className="px-4 py-3">{payment.farmerName}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700">
                      {formatIndianCurrency(payment.grossAmount)}
                    </td>
                    <td className="px-4 py-3 text-right text-red-600">
                      {formatIndianCurrency(payment.deductions)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      {formatIndianCurrency(payment.netPayable)}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={payment.customAmount}
                        onChange={(e) =>
                          handleCustomAmount(payment.farmerId, parseFloat(e.target.value) || 0)
                        }
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-right"
                        disabled={payment.isPaid}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {payment.isPaid ? (
                        <span className="text-green-600 font-semibold flex items-center justify-center gap-1">
                          <Check size={16} /> Paid
                        </span>
                      ) : (
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => handlePayViaPhonePe(payment)}
                            className="flex items-center gap-1 bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700 text-sm"
                            title="Pay via PhonePe"
                          >
                            <Smartphone size={14} />
                            PhonePe
                          </button>
                          <button
                            onClick={() => handleShowQR(payment)}
                            className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 text-sm"
                            title="Show QR Code"
                          >
                            <QrCode size={14} />
                            QR
                          </button>
                          <button
                            onClick={() => markAsPaid(payment)}
                            className="flex items-center gap-1 bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 text-sm"
                            title="Mark as Paid"
                          >
                            <Check size={14} />
                            Paid
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-green-100 font-bold">
                <tr>
                  <td colSpan={2} className="px-4 py-3">
                    TOTAL
                  </td>
                  <td className="px-4 py-3 text-right text-green-700">
                    {formatIndianCurrency(payments.reduce((sum, p) => sum + p.grossAmount, 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-red-600">
                    {formatIndianCurrency(payments.reduce((sum, p) => sum + p.deductions, 0))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatIndianCurrency(payments.reduce((sum, p) => sum + p.netPayable, 0))}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQR.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-8 text-center">
            <h3 className="text-xl font-bold mb-4">Scan to Pay</h3>
            <p className="text-gray-700 mb-4">{showQR.farmer}</p>
            <div className="bg-white p-4 inline-block">
              <QRCodeSVG value={showQR.data} size={256} />
            </div>
            <button
              onClick={() => setShowQR({ show: false, data: '', farmer: '' })}
              className="mt-6 bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentRegister;
