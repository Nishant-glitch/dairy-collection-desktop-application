import React from 'react';
import {
  LayoutDashboard,
  Users,
  Building2,
  FileText,
  Droplet,
  Wallet,
  Receipt,
  BarChart3,
  Settings,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, isOpen, onClose }) => {
  const { t } = useLanguage();

  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: t('dashboard') },
    { id: 'dcs-master', icon: Building2, label: t('dcsMaster') },
    { id: 'farmer-master', icon: Users, label: t('farmerMaster') },
    { id: 'rate-chart', icon: FileText, label: t('rateChart') },
    { id: 'milk-collection', icon: Droplet, label: t('milkCollection') },
    { id: 'deductions', icon: Wallet, label: t('deductions') },
    { id: 'payment-register', icon: Receipt, label: t('paymentRegister') },
    { id: 'reports', icon: BarChart3, label: t('reports') },
    { id: 'settings', icon: Settings, label: t('settings') },
  ];

  return (
    <aside 
      className={`sidebar ${isOpen ? 'open' : ''}`}
      style={{
        background: 'linear-gradient(180deg, #051208 0%, #0a1f0f 100%)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '4px 0 24px rgba(0,0,0,0.5)',
        width: 200, minHeight: 'calc(100vh - 56px)',
        padding: '20px 12px',
        display: 'flex', flexDirection: 'column', gap: 4
      }}
    >
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => {
                onNavigate(item.id);
                onClose();
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 8,
                height: '40px',
                background: isActive
                  ? 'linear-gradient(135deg, rgba(74,222,128,0.3), rgba(45,158,79,0.25))'
                  : 'transparent',
                border: isActive
                  ? '1px solid rgba(74,222,128,0.4)'
                  : '1px solid transparent',
                boxShadow: isActive
                  ? '0 4px 16px rgba(74,222,128,0.2), inset 0 1px 0 rgba(255,255,255,0.1)'
                  : 'none',
                color: isActive ? '#4ade80' : 'rgba(255,255,255,0.6)',
                fontWeight: isActive ? 700 : 500,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'left',
                width: '100%',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <Icon style={{ width: 16, height: 16, color: isActive ? '#4ade80' : 'inherit' }} />
              {item.label}
              {isActive && (
                <div style={{
                  marginLeft: 'auto', width: 6, height: 6,
                  borderRadius: '50%', background: '#4ade80',
                  boxShadow: '0 0 8px #4ade80'
                }} />
              )}
            </button>
          );
        })}
      </nav>
      <div style={{ marginTop: 'auto', padding: '10px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>
        v1.0.0
      </div>
    </aside>
  );
};

export default Sidebar;
