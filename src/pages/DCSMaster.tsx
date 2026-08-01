import React, { useState, useEffect } from 'react';
import { ref, get, set, remove } from 'firebase/database';
import { database } from '../firebase/config';
import { up, getUid } from '../utils/userDb';
import { useLanguage } from '../contexts/LanguageContext';
import { Save, Building2 } from 'lucide-react';

const DCSMaster: React.FC = () => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    phone: '',
    upiId: '',
    upiName: '',
  });
  // The code that was on the record when the form loaded, so on save we know
  // whether the code changed and can remove the old societyCodeIndex entry.
  const [originalCode, setOriginalCode] = useState('');

  useEffect(() => {
    loadDCSInfo();
  }, []);

  const loadDCSInfo = async () => {
    const dcsRef = ref(database, up('dcsInfo'));
    const snapshot = await get(dcsRef);
    if (snapshot.exists()) {
      const val = snapshot.val();
      setFormData(val);
      setOriginalCode(String(val.code || '').trim());
    }
  };

  // Kept in sync with dcsInfo.code so the central WhatsApp bot can resolve
  // "farmer typed code XYZ" to the owning society uid in one lookup.
  // societyCodeIndex/{code} = uid. Rules ensure a society can only claim
  // codes that are unclaimed (or already theirs).
  const syncCodeIndex = async (oldCode: string, newCode: string, uid: string) => {
    const oldC = oldCode.trim();
    const newC = newCode.trim();
    if (oldC === newC) return; // nothing to change
    if (oldC) {
      try { await remove(ref(database, `societyCodeIndex/${oldC}`)); }
      catch (e) { console.error('Failed to remove old code index entry:', e); }
    }
    if (newC) {
      try { await set(ref(database, `societyCodeIndex/${newC}`), uid); }
      catch (e) {
        // Most likely cause: another society already owns this code.
        console.error('Failed to claim new code index entry:', e);
        throw new Error(
          `Code "${newC}" already claimed by another society. Kripya doosra code chunein.`
        );
      }
    }
  };

  const handleSave = async () => {
    const uid = getUid();
    const newCode = String(formData.code || '').trim();
    try {
      // Claim the new code FIRST — if this fails (collision), we haven't yet
      // written dcsInfo, so the user sees the collision error before their
      // society record is mutated.
      await syncCodeIndex(originalCode, newCode, uid);
      await set(ref(database, up('dcsInfo')), formData);
      setOriginalCode(newCode);
      alert('DCS information saved successfully!');
    } catch (e: any) {
      alert(e?.message || 'Save failed. Kripya dobara try karein.');
    }
  };

  return (
    <div className="page-wrapper animate-fadeIn">
      <h1 className="page-title">{t('dcsMaster')}</h1>

      <div className="glass-card" style={{ padding: 20, maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg, #4ade80, #1a5c2e)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(74,222,128,0.3)' }}>
            <Building2 color="#0a1f0f" size={20} />
          </div>
          <div>
            <h2 style={{ color: 'var(--ink)', fontSize: 18, fontWeight: 800 }}>Society Information</h2>
            <p style={{ color: 'var(--ink-2)', fontSize: 11 }}>Configure your dairy collection center details</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 form-grid">
            <div>
              <label className="label-text">Society Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input-3d"
                placeholder="Full Name of Society"
              />
            </div>

            <div>
              <label className="label-text">Society Code</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="input-3d"
                placeholder="DCS001"
              />
            </div>

            <div>
              <label className="label-text">Phone Number</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="input-3d"
                placeholder="Contact Number"
              />
            </div>

            <div>
              <label className="label-text">UPI ID</label>
              <input
                type="text"
                value={formData.upiId}
                onChange={(e) => setFormData({ ...formData, upiId: e.target.value })}
                className="input-3d"
                placeholder="example@upi"
              />
            </div>

            <div>
              <label className="label-text">UPI Account Name</label>
              <input
                type="text"
                value={formData.upiName}
                onChange={(e) => setFormData({ ...formData, upiName: e.target.value })}
                className="input-3d"
                placeholder="Display Name for UPI"
              />
            </div>
            
            <div className="col-span-1 md:col-span-2">
              <div style={{ height: '1px', background: 'var(--surface-2)', margin: '8px 0' }}></div>
            </div>

            <div className="col-span-1 md:col-span-2">
              <label className="label-text">Address</label>
              <textarea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="input-3d"
                rows={2}
                placeholder="Complete physical address"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={handleSave}
              className="btn-3d"
              style={{ padding: '10px 28px', width: 'auto', float: 'right' }}
            >
              <Save size={16} />
              <span>{t('save')} Settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DCSMaster;
