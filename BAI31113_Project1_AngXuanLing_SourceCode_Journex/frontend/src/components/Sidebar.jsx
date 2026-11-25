import React from 'react';
import { 
  LayoutDashboard, 
  Building2, 
  FileText, 
  Receipt, 
  BookOpen, 
  Layers, 
  Scale, 
  BarChart3, 
  Bot
} from 'lucide-react';

export default function Sidebar({ currentPage, setCurrentPage }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'company_settings', label: 'Company Settings', icon: Building2 },
    { id: 'documents', label: 'Company Documents', icon: FileText },
    { id: 'transactions', label: 'Accounting Workspace', icon: Receipt },
    { id: 'daily_ledger', label: 'Audit Queue', icon: BookOpen },
    { id: 'general_ledger', label: 'General Ledger', icon: Layers },
    { id: 'trial_balance', label: 'Trial Balance', icon: Scale },
    { id: 'reports', label: 'Reports & Statements', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Bot },
  ];

  const isAccountingWorkspaceActive = [
    'transactions',
    'accounting_workspace',
    'overview',
    'books',
    'chart_of_accounts',
    'opening_balances',
    'receivables',
    'payables',
    'other_creditors',
    'inventory',
    'accruals_prepayments',
    'journals'
  ].includes(currentPage);

  return (
    <aside className="sidebar">
      <div className="brand-logo" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <img
          src="/brand/journex-symbol.svg"
          alt="Journex Logo"
          width={34}
          height={34}
          style={{ display: 'block', width: '34px', height: '34px', objectFit: 'contain', flexShrink: 0 }}
        />
        <span style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.3px',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          lineHeight: 1
        }}>
          Journex
        </span>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === 'transactions' 
            ? isAccountingWorkspaceActive 
            : currentPage === item.id;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`nav-link ${isActive ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                setCurrentPage(item.id);
              }}
            >
              <Icon size={17} style={{ flexShrink: 0 }} />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
