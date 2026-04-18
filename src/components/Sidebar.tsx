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
    <aside className="bg-green-800 text-white w-64 min-h-screen p-4">
      <nav className="space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition ${
                isActive
                  ? 'bg-green-700 text-white shadow-lg'
                  : 'hover:bg-green-700 text-green-100'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
