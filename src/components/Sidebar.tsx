import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  Crown,
  Snowflake,
  Calculator,
  BookOpen,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { isAdmin } from '../utils/userDb';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, isOpen, onClose }) => {
  const { t } = useLanguage();

  // On mobile the sidebar is a fixed slide-in drawer. We render it through a
  // portal to <body> so its `position: fixed` is always resolved against the
  // viewport and can never be trapped by a transformed/filtered ancestor
  // (which would make the drawer scroll along with the page). On desktop it
  // stays in-flow as a normal layout column.
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: t('dashboard') },
    { id: 'dcs-master', icon: Building2, label: t('dcsMaster') },
    { id: 'farmer-master', icon: Users, label: t('farmerMaster') },
    { id: 'rate-chart', icon: FileText, label: t('rateChart') },
    { id: 'milk-collection', icon: Droplet, label: t('milkCollection') },
    { id: 'rate-calculator', icon: Calculator, label: 'Rate Calculator' },
    { id: 'bmc-master', icon: Snowflake, label: t('bmcMaster') },
    { id: 'bmc-entry', icon: Snowflake, label: t('bmcEntry') },
    { id: 'deductions', icon: Wallet, label: t('deductions') },
    { id: 'payment-register', icon: Receipt, label: t('paymentRegister') },
    { id: 'cash-book', icon: BookOpen, label: 'Cash Book' },
    { id: 'reports', icon: BarChart3, label: t('reports') },
    { id: 'settings', icon: Settings, label: t('settings') },
  ];

  if (isAdmin()) {
    menuItems.push({ id: 'admin-subscriptions', icon: Crown, label: 'Subscriptions' });
  }

  const sidebar = (
    <aside
      className={`sidebar ${isOpen ? 'open' : ''}`}
      style={{
        background: 'var(--surface)',
        borderRight: '1px solid var(--line)',
        boxShadow: 'var(--shadow-sm)',
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
                background: isActive ? 'var(--brand-soft)' : 'transparent',
                border: isActive
                  ? '1px solid rgba(24,165,88,0.3)'
                  : '1px solid transparent',
                boxShadow: 'none',
                color: isActive ? 'var(--brand-strong)' : 'var(--ink-2)',
                fontWeight: isActive ? 700 : 500,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'left',
                width: '100%',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'var(--ink)';
                  e.currentTarget.style.background = 'var(--surface-2)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'var(--ink-2)';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <Icon style={{ width: 16, height: 16, color: isActive ? 'var(--brand)' : 'inherit' }} />
              {item.label}
              {isActive && (
                <div style={{
                  marginLeft: 'auto', width: 6, height: 6,
                  borderRadius: '50%', background: 'var(--brand)',
                  boxShadow: '0 0 8px var(--brand-ring)'
                }} />
              )}
            </button>
          );
        })}
      </nav>
      <div style={{ marginTop: 'auto', padding: '10px', textAlign: 'center', color: 'var(--muted)', fontSize: '11px' }}>
        v1.0.0
      </div>
    </aside>
  );

  // Portal the drawer to <body> on mobile; keep it in-flow on desktop.
  return isMobile ? createPortal(sidebar, document.body) : sidebar;
};

export default Sidebar;
