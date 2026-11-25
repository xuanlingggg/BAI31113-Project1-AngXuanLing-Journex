import React, { useState, useEffect, useMemo } from 'react';
import { 
  Layers, 
  AlertCircle, 
  ArrowDownRight, 
  ArrowUpRight, 
  Lightbulb, 
  HelpCircle, 
  Info,
  Search,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Filter
} from 'lucide-react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatDisplayDate = (str) => {
  if (!str) return '—';
  const clean = String(str).trim();
  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = MONTHS[parseInt(isoMatch[2], 10) - 1] || isoMatch[2];
    const day = isoMatch[3];
    return `${day} ${month} ${year}`;
  }
  return clean;
};

export default function GeneralLedgerPage() {
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedAccounts, setExpandedAccounts] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('ALL');
  const [activeCompanyId, setActiveCompanyId] = useState(() => localStorage.getItem('active_company_id') || '');

  useEffect(() => {
    const handleCompanyUpdate = () => {
      const cid = localStorage.getItem('active_company_id') || '';
      setActiveCompanyId(cid);
    };
    window.addEventListener('company-updated', handleCompanyUpdate);
    return () => window.removeEventListener('company-updated', handleCompanyUpdate);
  }, []);

  useEffect(() => {
    fetchLedger(activeCompanyId);
  }, [activeCompanyId]);

  const fetchLedger = async (compId = activeCompanyId) => {
    setLoading(true);
    setError(null);
    try {
      const cid = compId || localStorage.getItem('active_company_id') || '';
      const url = cid ? `/api/ledger/?company_id=${encodeURIComponent(cid)}` : '/api/ledger/';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch general ledger records');
      const data = await res.json();
      const ledgerData = data.ledger || [];
      setLedger(ledgerData);
      
      // Expand all accounts by default
      const expanded = {};
      ledgerData.forEach(acc => {
        expanded[acc.account_code] = true;
      });
      setExpandedAccounts(expanded);
      
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleAccount = (code) => {
    setExpandedAccounts(prev => ({
      ...prev,
      [code]: !prev[code]
    }));
  };



  const getAccountAdvice = (acc) => {
    if (acc.abnormal_advice) return acc.abnormal_advice;
    const absBal = `RM ${formatAmount(Math.abs(acc.balance))}`;
    const prefix = String(acc.account_code || '').split('-')[0].trim();
    const nameLower = String(acc.account_name || '').toLowerCase();

    if (prefix.startsWith('300') || nameLower.includes('debtor') || nameLower.includes('receivable')) {
      return {
        issue: `Trade Debtors has an inverted credit balance of ${absBal}. Customer payments or credit notes have been posted before the matching sales invoice was uploaded.`,
        resolution: `Upload the missing customer Sales Invoice (INV) to match the payment, or if this is an advance customer deposit, reclassify the payment credit to '440-0000 DEPOSIT RECEIVED'.`
      };
    }
    if (acc.account_code === '320-0000' || nameLower.includes('cash in hand') || nameLower.includes('petty')) {
      return {
        issue: `Cash in Hand has an inverted credit balance of ${absBal}. Cash expenses were recorded without entering the bank cash withdrawal that funded the petty cash box.`,
        resolution: `Record a cash float voucher (Debit 320-0000 Cash in Hand, Credit 310-1000 Cash at Bank), or verify if the payments were drawn directly from the bank account.`
      };
    }
    if (acc.account_code === '310-1000' || nameLower.includes('bank')) {
      return {
        issue: `Cash at Bank has an inverted credit balance of ${absBal}, indicating an overdrawn bank position.`,
        resolution: `If an approved bank overdraft facility exists, standard accounting reclassifies this to Current Liabilities at period-end. Otherwise, reconcile bank transactions or check for unrecorded customer deposits.`
      };
    }
    if (prefix.startsWith('400') || nameLower.includes('creditor') || nameLower.includes('payable')) {
      return {
        issue: `Trade Creditors has an inverted debit balance of ${absBal}. Supplier payments or return credit notes exceed posted purchase bills.`,
        resolution: `Upload the missing supplier Purchase Invoice, or reclassify the excess payment as a Supplier Prepayment / Advance Deposit asset.`
      };
    }
    if (prefix.startsWith('200') || acc.account_type === 'Asset') {
      return {
        issue: `Fixed Asset account has an inverted credit balance of ${absBal}. An asset return or disposal was recorded without the original purchase invoice on file.`,
        resolution: `Upload the original asset acquisition invoice, or adjust the disposal journal to match historical asset cost.`
      };
    }
    if (prefix.startsWith('500') || acc.account_type === 'Revenue') {
      return {
        issue: `Revenue account has an inverted debit balance of ${absBal} (sales adjustments or returns exceed recorded sales).`,
        resolution: `Route customer returns to '510-0000 RETURN INWARDS' contra-revenue, or verify whether all sales invoices for the period have been posted.`
      };
    }
    if (prefix.startsWith('6') || prefix.startsWith('9') || acc.account_type === 'Expense' || acc.account_type === 'Cost of Sales') {
      return {
        issue: `Expense account has an inverted credit balance of ${absBal} (refunds or credits exceed actual recorded expenses).`,
        resolution: `Check if expense refunds were credited directly here instead of offsetting against the original vendor bill or recorded as other income.`
      };
    }
    return {
      issue: `Closing balance of ${absBal} inverts the account's standard ${acc.normal_balance} normal direction.`,
      resolution: `Expand the transaction history below to verify source documents and debit/credit allocations.`
    };
  };

  const formatAmount = (val) => {
    const num = parseFloat(val || 0);
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // KPI calculations
  const totalDebits = useMemo(() => {
    return ledger.reduce((acc, a) => acc + (parseFloat(a.total_debit) || 0), 0);
  }, [ledger]);

  const totalCredits = useMemo(() => {
    return ledger.reduce((acc, a) => acc + (parseFloat(a.total_credit) || 0), 0);
  }, [ledger]);

  const isEquilibrium = Math.abs(totalDebits - totalCredits) < 0.01;



  // Account Categories
  const accountTypes = useMemo(() => {
    const types = new Set(ledger.map(a => a.account_type || 'Other'));
    return ['ALL', ...Array.from(types)];
  }, [ledger]);

  // Filtered ledger accounts
  const filteredLedger = useMemo(() => {
    return ledger.filter(acc => {
      // Type filter
      if (selectedType !== 'ALL' && acc.account_type !== selectedType) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const code = (acc.account_code || '').toLowerCase();
        const name = (acc.account_name || '').toLowerCase();
        const type = (acc.account_type || '').toLowerCase();
        const txnMatches = (acc.transactions || []).some(t => 
          (t.journal_id || '').toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q)
        );
        return code.includes(q) || name.includes(q) || type.includes(q) || txnMatches;
      }

      return true;
    });
  }, [ledger, selectedType, searchQuery]);

  const targetAccounts = useMemo(() => {
    return filteredLedger.length > 0 ? filteredLedger : ledger;
  }, [filteredLedger, ledger]);

  const allExpanded = useMemo(() => {
    return targetAccounts.length > 0 && targetAccounts.every(acc => expandedAccounts[acc.account_code]);
  }, [targetAccounts, expandedAccounts]);

  const handleToggleAll = () => {
    const allCurrentlyExpanded = targetAccounts.length > 0 && targetAccounts.every(acc => expandedAccounts[acc.account_code]);
    const newState = { ...expandedAccounts };
    targetAccounts.forEach(acc => {
      newState[acc.account_code] = !allCurrentlyExpanded;
    });
    setExpandedAccounts(newState);
  };

  return (
    <div className="page-container" style={{ padding: '1.5rem 2rem' }}>
      
      {/* 1. Page Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start', 
        marginBottom: '1.5rem', 
        flexWrap: 'wrap', 
        gap: '1rem' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: 'var(--badge-doc-bg)',
            color: 'var(--primary-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}>
            <Layers size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              General Ledger
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem', marginBottom: 0 }}>
              View all posted transactions organized by account, including debit and credit entries.
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleToggleAll}
            disabled={targetAccounts.length === 0}
            title={allExpanded ? "Collapse all account sections" : "Expand all account sections"}
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '0.4rem', 
              padding: '0.45rem 0.85rem', 
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: targetAccounts.length === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            {allExpanded ? (
              <ChevronUp size={15} style={{ flexShrink: 0 }} aria-hidden="true" />
            ) : (
              <ChevronDown size={15} style={{ flexShrink: 0 }} aria-hidden="true" />
            )}
            <span>{allExpanded ? 'Collapse All' : 'Expand All'}</span>
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => fetchLedger(activeCompanyId)}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 0.9rem', fontSize: '0.8rem' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. Executive KPI Summary Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', 
        gap: '1rem', 
        marginBottom: '1.5rem' 
      }}>
        {/* Card 1: Active Accounts */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600 }}>
            <span>Active Accounts</span>
            <Layers size={16} style={{ color: 'var(--primary-color)' }} />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0.4rem 0 0.1rem 0' }}>
            {ledger.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Accounts with posted transactions
          </div>
        </div>

        {/* Card 2: Total Ledger Debits */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600 }}>
            <span>Total Debits</span>
            <ArrowUpRight size={16} style={{ color: 'var(--primary-color)' }} />
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', margin: '0.4rem 0 0.1rem 0' }}>
            RM {formatAmount(totalDebits)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Cumulative debit movements
          </div>
        </div>

        {/* Card 3: Total Ledger Credits */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600 }}>
            <span>Total Credits</span>
            <ArrowDownRight size={16} style={{ color: 'var(--status-success-text)' }} />
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', margin: '0.4rem 0 0.1rem 0' }}>
            RM {formatAmount(totalCredits)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Cumulative credit movements
          </div>
        </div>

        {/* Card 4: Ledger Equilibrium */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600 }}>
            <span>Ledger Equilibrium</span>
            {isEquilibrium ? (
              <CheckCircle2 size={16} style={{ color: 'var(--status-success-text)' }} />
            ) : (
              <AlertCircle size={16} style={{ color: 'var(--status-error-text)' }} />
            )}
          </div>
          <div style={{ 
            fontSize: '1.25rem', 
            fontWeight: 700, 
            color: isEquilibrium ? 'var(--status-success-text)' : 'var(--status-error-text)',
            margin: '0.4rem 0 0.1rem 0' 
          }}>
            {isEquilibrium ? 'Balanced' : 'Equilibrium Notice'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {isEquilibrium ? 'Debits strictly equal credits' : `Variance: RM ${formatAmount(Math.abs(totalDebits - totalCredits))}`}
          </div>
        </div>
      </div>

      {/* 3. Error Alert */}
      {error && (
        <div style={{ 
          backgroundColor: 'var(--status-error-bg)', 
          color: 'var(--status-error-text)', 
          border: '1px solid var(--status-error-border)', 
          padding: '0.9rem 1.25rem', 
          borderRadius: '8px', 
          marginBottom: '1.5rem', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem' 
        }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* 4. Controls Bar (Filters & Search) */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexWrap: 'wrap', 
        gap: '1rem', 
        marginBottom: '1.25rem',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '0.85rem'
      }}>
        {/* Category Pills */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {accountTypes.map(type => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              style={{
                padding: '0.35rem 0.8rem',
                borderRadius: '6px',
                border: selectedType === type ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
                backgroundColor: selectedType === type ? 'var(--badge-doc-bg)' : 'var(--bg-card)',
                color: selectedType === type ? 'var(--primary-color)' : 'var(--text-secondary)',
                fontWeight: selectedType === type ? 600 : 500,
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {type === 'ALL' ? 'All Accounts' : type}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search code, account, journal ref..."
            style={{
              width: '100%',
              padding: '0.45rem 0.75rem 0.45rem 2rem',
              fontSize: '0.82rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-primary)',
              outline: 'none'
            }}
          />
        </div>
      </div>

      {/* 5. T-Accounts Grid */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.75rem auto', color: 'var(--primary-color)' }} />
          <div>Loading general ledger records...</div>
        </div>
      ) : filteredLedger.length === 0 ? (
        <div style={{ 
          padding: '3.5rem 2rem', 
          textAlign: 'center', 
          backgroundColor: 'var(--bg-card)', 
          border: '1px dashed var(--border-color)', 
          borderRadius: '10px', 
          color: 'var(--text-secondary)' 
        }}>
          <Layers size={36} style={{ margin: '0 auto 0.85rem auto', color: 'var(--text-muted)' }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.35rem 0' }}>
            No Posted Ledger Transactions
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '460px', margin: '0 auto' }}>
            {selectedType !== 'ALL' || searchQuery.trim()
              ? 'No accounts match your filter criteria.'
              : 'Post approved transactions from the Audit Queue to populate the General Ledger T-Accounts.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(540px, 1fr))', gap: '1.25rem' }}>
          {filteredLedger.map(acc => {
            const isExpanded = !!expandedAccounts[acc.account_code];
            const isInverted = acc.balance < 0;
            const balanceTypeLabel = acc.normal_balance === 'DEBIT' ? 'Debit' : 'Credit';

            return (
              <div 
                key={acc.account_code} 
                style={{ 
                  backgroundColor: 'var(--bg-card)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '10px', 
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}
              >
                {/* Account Header */}
                <div 
                  onClick={() => toggleAccount(acc.account_code)}
                  style={{ 
                    padding: '0.9rem 1.25rem', 
                    backgroundColor: 'var(--bg-card)', 
                    borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                    transition: 'background-color 0.15s ease'
                  }}
                >
                  {/* Left: Code, Name, Type */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                      <span style={{ 
                        fontFamily: 'var(--font-mono)', 
                        fontWeight: 700, 
                        fontSize: '0.9rem',
                        color: 'var(--primary-color)',
                        backgroundColor: 'var(--badge-doc-bg)',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px',
                        border: '1px solid rgba(37, 99, 235, 0.2)'
                      }}>
                        {acc.account_code}
                      </span>
                      <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', margin: 0, fontWeight: 700 }}>
                        {acc.account_name}
                      </h3>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      <span style={{ 
                        backgroundColor: 'var(--bg-surface)', 
                        padding: '0.1rem 0.45rem', 
                        borderRadius: '4px', 
                        border: '1px solid var(--border-color)',
                        fontWeight: 500
                      }}>
                        {acc.account_type}
                      </span>
                      <span>•</span>
                      <span>Normal Direction: <strong style={{ color: 'var(--text-primary)' }}>{balanceTypeLabel}</strong></span>
                      <span>•</span>
                      <span>{acc.transactions.length} movement{acc.transactions.length === 1 ? '' : 's'}</span>
                    </div>
                  </div>

                  {/* Right: Closing Balance & Chevron */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ 
                        fontSize: '1.15rem', 
                        fontWeight: 700, 
                        fontFamily: 'var(--font-mono)',
                        color: isInverted ? '#b45309' : 'var(--text-primary)'
                      }}>
                        RM {formatAmount(Math.abs(acc.balance))}
                      </div>
                      <div style={{ 
                        fontSize: '0.72rem', 
                        color: isInverted ? '#b45309' : 'var(--text-secondary)',
                        fontWeight: isInverted ? 600 : 500
                      }}>
                        {isInverted ? 'Inverted Balance' : `Closing ${balanceTypeLabel}`}
                      </div>
                    </div>

                    <div style={{ 
                      color: 'var(--text-muted)', 
                      display: 'flex', 
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '24px',
                      height: '24px',
                      borderRadius: '4px'
                    }}>
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>
                </div>

                {/* Inverted Balance Resolution Notice */}
                {isInverted && (() => {
                  const adv = getAccountAdvice(acc);
                  return (
                    <div style={{
                      padding: '0.85rem 1.25rem',
                      backgroundColor: 'rgba(245, 158, 11, 0.05)',
                      borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
                      borderLeft: '4px solid #f59e0b',
                      fontSize: '0.82rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#b45309', fontWeight: 600, marginBottom: '0.35rem' }}>
                        <Lightbulb size={15} /> Balance Guidance & Resolution Advice
                      </div>
                      <div style={{ color: 'var(--text-primary)', marginBottom: '0.3rem', lineHeight: 1.45 }}>
                        <strong>What is happening:</strong> {adv.issue}
                      </div>
                      <div style={{ color: 'var(--primary-color)', lineHeight: 1.45 }}>
                        <strong>How to resolve:</strong> {adv.resolution}
                      </div>
                    </div>
                  );
                })()}

                {/* T-Account Table View */}
                {isExpanded && (
                  <div style={{ padding: '0', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                      <thead>
                        <tr style={{ 
                          backgroundColor: 'var(--bg-primary)', 
                          color: 'var(--text-secondary)', 
                          textAlign: 'left', 
                          borderBottom: '1px solid var(--border-color)' 
                        }}>
                          <th style={{ padding: '0.55rem 1rem', fontWeight: 600, width: '100px' }}>Date</th>
                          <th style={{ padding: '0.55rem 1rem', fontWeight: 600, width: '140px' }}>Journal Ref</th>
                          <th style={{ padding: '0.55rem 1rem', fontWeight: 600 }}>Description</th>
                          <th style={{ 
                            padding: '0.55rem 1rem', 
                            textAlign: 'right', 
                            fontWeight: 600, 
                            width: '120px',
                            color: 'var(--primary-color)',
                            backgroundColor: 'rgba(37, 99, 235, 0.03)'
                          }}>
                            Debit (MYR)
                          </th>
                          <th style={{ 
                            padding: '0.55rem 1rem', 
                            textAlign: 'right', 
                            fontWeight: 600, 
                            width: '120px',
                            color: 'var(--status-success-text)',
                            backgroundColor: 'rgba(21, 128, 61, 0.03)'
                          }}>
                            Credit (MYR)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {acc.transactions.map((txn, idx) => {
                          const isDebit = txn.debit > 0;
                          return (
                            <tr 
                              key={idx} 
                              style={{ 
                                borderBottom: '1px solid var(--border-color)',
                                backgroundColor: idx % 2 === 1 ? 'rgba(248, 250, 252, 0.5)' : 'var(--bg-card)'
                              }}
                            >
                              <td style={{ padding: '0.55rem 1rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                {formatDisplayDate(txn.date)}
                              </td>
                              <td style={{ 
                                padding: '0.55rem 1rem', 
                                color: 'var(--primary-color)', 
                                fontFamily: 'var(--font-mono)', 
                                fontWeight: 500,
                                whiteSpace: 'nowrap'
                              }}>
                                {txn.journal_id}
                              </td>
                              <td style={{ padding: '0.55rem 1rem', color: 'var(--text-primary)' }}>
                                {txn.description || '—'}
                              </td>
                              <td style={{ 
                                padding: '0.55rem 1rem', 
                                textAlign: 'right', 
                                fontFamily: 'var(--font-mono)',
                                color: isDebit ? 'var(--text-primary)' : 'var(--text-muted)',
                                fontWeight: isDebit ? 600 : 400,
                                backgroundColor: 'rgba(37, 99, 235, 0.02)'
                              }}>
                                {isDebit ? formatAmount(txn.debit) : '—'}
                              </td>
                              <td style={{ 
                                padding: '0.55rem 1rem', 
                                textAlign: 'right', 
                                fontFamily: 'var(--font-mono)',
                                color: !isDebit ? 'var(--text-primary)' : 'var(--text-muted)',
                                fontWeight: !isDebit ? 600 : 400,
                                backgroundColor: 'rgba(21, 128, 61, 0.02)'
                              }}>
                                {!isDebit ? formatAmount(txn.credit) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ 
                          backgroundColor: 'var(--bg-surface)', 
                          fontWeight: 700, 
                          borderTop: '2px solid var(--border-color)' 
                        }}>
                          <td colSpan="3" style={{ padding: '0.55rem 1rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                            TOTAL MOVEMENTS:
                          </td>
                          <td style={{ 
                            padding: '0.55rem 1rem', 
                            textAlign: 'right', 
                            color: 'var(--text-primary)',
                            fontFamily: 'var(--font-mono)',
                            backgroundColor: 'rgba(37, 99, 235, 0.04)'
                          }}>
                            {formatAmount(acc.total_debit)}
                          </td>
                          <td style={{ 
                            padding: '0.55rem 1rem', 
                            textAlign: 'right', 
                            color: 'var(--text-primary)',
                            fontFamily: 'var(--font-mono)',
                            backgroundColor: 'rgba(21, 128, 61, 0.04)'
                          }}>
                            {formatAmount(acc.total_credit)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
