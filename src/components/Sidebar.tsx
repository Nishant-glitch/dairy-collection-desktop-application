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
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate }) => {
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
    <aside style={{
      background: 'linear-gradient(180deg, #0a0f1e, #0f172a)',
      borderRight: '1px solid rgba(245,158,11,0.1)',
      boxShadow: '4px 0 20px rgba(0,0,0,0.4)',
      width: 240, minHeight: 'calc(100vh - 64px)',
      padding: '20px 12px',
      display: 'flex', flexDirection: 'column', gap: 4
    }}>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', borderRadius: 12,
                background: isActive
                  ? 'rgba(245,158,11,0.12)'
                  : 'transparent',
                border: isActive
                  ? '1px solid rgba(245,158,11,0.25)'
                  : '1px solid transparent',
                boxShadow: isActive
                  ? '0 4px 16px rgba(245,158,11,0.1)'
                  : 'none',
                color: isActive ? '#fcd34d' : '#64748b',
                fontWeight: isActive ? 700 : 500,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'left',
                width: '100%',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = '#94a3b8';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = '#64748b';
              }}
            >
              <Icon style={{ width: 18, height: 18, color: isActive ? '#f59e0b' : 'inherit' }} />
              {item.label}
              {isActive && (
                <div style={{
                  marginLeft: 'auto', width: 6, height: 6,
                  borderRadius: '50%', background: '#f59e0b',
                  boxShadow: '0 0 8px #f59e0b'
                }} />
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
