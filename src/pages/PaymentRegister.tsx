import React, { useState, useEffect } from 'react';
import { ref, get, set, onValue } from 'firebase/database';
import { database } from '../firebase/config';
import { up } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { formatIndianCurrency } from '../utils/rateCalculator';
import { sendPaymentSMS } from '../services/sms';
import { Smartphone, QrCode, Check, Calculator, X } from 'lucide-react';
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

  const labelStyle: React.CSSProperties = { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'block' };

  return (
    <div className="p-6 animate-fadeIn">
      <h1 style={{ color: 'white', fontWeight: 800, fontSize: 28, textShadow: '0 2px 8px rgba(0,0,0,0.3)', marginBottom: 24 }}>{t('paymentRegister')}</h1>

      <div className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
        <div className="flex flex-col md:flex-row gap-6 items-end">
          <div className="flex-1 w-full">
            <label style={labelStyle}>Select Payment Month</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="input-3d w-full"
            />
          </div>
          <button
            onClick={calculatePayments}
            className="btn-3d w-full md:w-auto"
            style={{ padding: '12px 32px' }}
          >
            <Calculator size={20} />
            Calculate Payments
          </button>
        </div>
      </div>

      {payments.length > 0 && (
        <div className="glass-card" style={{ padding: 24 }}>
          <div className="table-3d overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-4 py-3">Farmer Code</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3 text-right">Gross Amount</th>
                  <th className="px-4 py-3 text-right">Deductions</th>
                  <th className="px-4 py-3 text-right">Net Payable</th>
                  <th className="px-4 py-3 text-right">Pay Amount</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.farmerId}>
                    <td className="px-4 py-3 font-bold">{payment.farmerId}</td>
                    <td className="px-4 py-3">{payment.farmerName}</td>
                    <td className="px-4 py-3 text-right" style={{ color: '#4ade80', fontWeight: 600 }}>
                      {formatIndianCurrency(payment.grossAmount)}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: '#ef4444' }}>
                      {formatIndianCurrency(payment.deductions)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold" style={{ color: 'white' }}>
                      {formatIndianCurrency(payment.netPayable)}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={payment.customAmount}
                        onChange={(e) =>
                          handleCustomAmount(payment.farmerId, parseFloat(e.target.value) || 0)
                        }
                        className="input-3d w-28 text-right"
                        disabled={payment.isPaid}
                        style={{ opacity: payment.isPaid ? 0.5 : 1 }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {payment.isPaid ? (
                        <div style={{ color: '#4ade80', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <div style={{ width: 20, height: 20, background: 'rgba(74,222,128,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={12} />
                          </div>
                          PAID
                        </div>
                      ) : (
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => handlePayViaPhonePe(payment)} className="btn-3d" style={{ padding: '6px 12px', fontSize: 12, background: 'linear-gradient(145deg, #7c3aed, #4c1d95)', boxShadow: '0 4px 12px rgba(124,58,237,0.3)' }} title="Pay via PhonePe"><Smartphone size={14} /> PhonePe</button>
                          <button onClick={() => handleShowQR(payment)} className="btn-3d" style={{ padding: '6px 12px', fontSize: 12, background: 'linear-gradient(145deg, #2563eb, #1e3a5f)', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }} title="Show QR Code"><QrCode size={14} /> QR</button>
                          <button onClick={() => markAsPaid(payment)} className="btn-3d" style={{ padding: '6px 12px', fontSize: 12 }} title="Mark as Paid"><Check size={14} /> Paid</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot style={{ background: 'rgba(74, 222, 128, 0.05)', fontWeight: 800 }}>
                <tr>
                  <td colSpan={2} className="px-4 py-4" style={{ color: 'white' }}>TOTAL</td>
                  <td className="px-4 py-4 text-right" style={{ color: '#4ade80' }}>
                    {formatIndianCurrency(payments.reduce((sum, p) => sum + p.grossAmount, 0))}
                  </td>
                  <td className="px-4 py-4 text-right" style={{ color: '#ef4444' }}>
                    {formatIndianCurrency(payments.reduce((sum, p) => sum + p.deductions, 0))}
                  </td>
                  <td className="px-4 py-4 text-right" style={{ color: 'white', fontSize: 18 }}>
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
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="modal-3d animate-fadeIn" style={{ padding: 32, textAlign: 'center', maxWidth: 400, width: '90%' }}>
            <div className="flex justify-between items-center mb-6">
              <h3 style={{ color: 'white', fontWeight: 800, fontSize: 20 }}>Scan to Pay</h3>
              <button onClick={() => setShowQR({ show: false, data: '', farmer: '' })} className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition">
                <X size={24} />
              </button>
            </div>
            <p style={{ color: '#4ade80', fontWeight: 700, marginBottom: 24, fontSize: 18 }}>{showQR.farmer}</p>
            <div style={{ background: 'white', padding: 24, borderRadius: 20, display: 'inline-block', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
              <QRCodeSVG value={showQR.data} size={220} />
            </div>
            <button
              onClick={() => setShowQR({ show: false, data: '', farmer: '' })}
              className="btn-3d w-full mt-10"
              style={{ background: 'rgba(255,255,255,0.05)', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.1)' }}
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
