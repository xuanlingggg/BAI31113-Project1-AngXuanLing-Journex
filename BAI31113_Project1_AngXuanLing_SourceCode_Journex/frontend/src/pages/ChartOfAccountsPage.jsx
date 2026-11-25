import React, { useState, useEffect } from 'react';
import { 
  Layers, Search, CheckCircle2, AlertTriangle, RefreshCw, 
  ArrowUpRight, ArrowDownRight, Filter, BookOpen, DollarSign
} from 'lucide-react';

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('ALL');

  const activeCompanyId = localStorage.getItem('active_company_id');

  useEffect(() => {
    fetchAccounts();
    const handleCompanyUpdate = () => fetchAccounts();
    window.addEventListener('company-updated', handleCompanyUpdate);
    return () => window.removeEventListener('company-updated', handleCompanyUpdate);
  }, [activeCompanyId]);

  const fetchAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = activeCompanyId 
        ? `/api/company/chart-of-accounts?company_id=${encodeURIComponent(activeCompanyId)}`
        : '/api/company/chart-of-accounts';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load chart of accounts');
      const json = await res.json();
      setAccounts(json.chart_of_accounts || []);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val) => {
    return Number(val || 0).toLocaleString('en-MY', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const totalOpeningDebit = accounts.reduce((acc, a) => acc + (a.opening_debit || 0), 0);
  const totalOpeningCredit = accounts.reduce((acc, a) => acc + (a.opening_credit || 0), 0);
  const isBalanced = Math.abs(totalOpeningDebit - totalOpeningCredit) < 0.01 && totalOpeningDebit > 0;

  const filteredAccounts = accounts.filter((a) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = 
      (a.account_name || '').toLowerCase().includes(q) ||
      (a.account_code || '').toLowerCase().includes(q);
    const matchesType = selectedType === 'ALL' || a.account_type === selectedType;
    return matchesSearch && matchesType;
  });

  const accountTypes = ['ALL', 'Asset', 'Liability', 'Equity', 'Revenue', 'Cost of Sales', 'Expense', 'Taxation'];

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ padding: '0.5rem', backgroundColor: '#EFF6FF', borderRadius: '8px', color: '#2563EB' }}>
              <Layers size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Chart of Accounts (COA)
              </h1>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0' }}>
                Manage account categories and sub-accounts, and view related transactions.
              </p>
            </div>
          </div>
        </div>

        <button 
          onClick={fetchAccounts}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', fontSize: '0.85rem' }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            Active Accounts
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#2563EB', marginTop: '0.35rem' }}>
            {accounts.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Company-Specific Chart of Accounts
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            Total Opening Debit
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.35rem' }}>
            RM {formatCurrency(totalOpeningDebit)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Assets & Expenses
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            Total Opening Credit
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.35rem' }}>
            RM {formatCurrency(totalOpeningCredit)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Liabilities & Equity
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            Opening Balance Status
          </div>
          <div style={{ 
            fontSize: '1.2rem', 
            fontWeight: 700, 
            color: isBalanced ? '#16A34A' : (totalOpeningDebit === 0 ? 'var(--text-secondary)' : '#DC2626'), 
            marginTop: '0.5rem', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.4rem' 
          }}>
            {isBalanced ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{isBalanced ? 'Balanced' : (totalOpeningDebit === 0 ? 'No Opening Balances' : 'Variance')}</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
            Diff: RM {formatCurrency(Math.abs(totalOpeningDebit - totalOpeningCredit))}
          </div>
        </div>
      </div>

      {/* Filter and Table Card */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          {/* Search */}
          <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search account code or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem 0.55rem 2.2rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                fontSize: '0.85rem',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Type Filter Pills */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {accountTypes.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedType(t)}
                style={{
                  padding: '0.35rem 0.65rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: '1px solid var(--border-color)',
                  backgroundColor: selectedType === t ? '#2563EB' : 'var(--bg-card)',
                  color: selectedType === t ? '#FFFFFF' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem auto', color: '#3B82F6' }} />
            <div>Loading chart of accounts...</div>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#DC2626' }}>
            <AlertTriangle size={24} style={{ margin: '0 auto 0.5rem auto' }} />
            <div>{error}</div>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <Layers size={32} style={{ margin: '0 auto 0.75rem auto', opacity: 0.4 }} />
            <div style={{ fontWeight: 600 }}>No Accounts Match Your Criteria</div>
            <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Clear search or category filter to view all chart of accounts.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Account Code</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Account Name</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Classification</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Opening Debit (RM)</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Opening Credit (RM)</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((a, idx) => (
                  <tr 
                    key={a.id || idx}
                    style={{ borderBottom: '1px solid var(--border-color)' }}
                  >
                    <td style={{ padding: '0.8rem 0.5rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {a.account_code}
                    </td>
                    <td style={{ padding: '0.8rem 0.5rem', color: 'var(--text-primary)' }}>
                      {a.account_name}
                      {a.special_code && (
                        <span style={{
                          marginLeft: '0.5rem',
                          fontSize: '0.7rem',
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px',
                          backgroundColor: '#F3F4F6',
                          color: '#4B5563',
                          fontFamily: 'var(--font-mono)'
                        }}>
                          {a.special_code}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.8rem 0.5rem' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        backgroundColor: '#EFF6FF',
                        color: '#1D4ED8',
                        fontWeight: 600,
                        fontSize: '0.75rem'
                      }}>
                        {a.account_type}
                      </span>
                    </td>
                    <td style={{ padding: '0.8rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: (a.opening_debit || 0) > 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {(a.opening_debit || 0) > 0 ? formatCurrency(a.opening_debit) : '-'}
                    </td>
                    <td style={{ padding: '0.8rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: (a.opening_credit || 0) > 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {(a.opening_credit || 0) > 0 ? formatCurrency(a.opening_credit) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', fontWeight: 700 }}>
                  <td colSpan={3} style={{ padding: '0.85rem 0.5rem', textAlign: 'right', textTransform: 'uppercase', fontSize: '0.8rem' }}>
                    Total Opening Balances
                  </td>
                  <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right', color: '#2563EB', fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}>
                    RM {formatCurrency(totalOpeningDebit)}
                  </td>
                  <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right', color: '#2563EB', fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}>
                    RM {formatCurrency(totalOpeningCredit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
