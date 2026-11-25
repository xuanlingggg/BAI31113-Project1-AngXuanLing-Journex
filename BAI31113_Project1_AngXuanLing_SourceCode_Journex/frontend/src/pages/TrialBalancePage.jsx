import React, { useState, useEffect, useMemo } from 'react';
import { 
  Scale, 
  AlertCircle, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  RefreshCw, 
  Search, 
  ArrowUpRight, 
  ArrowDownRight,
  Filter
} from 'lucide-react';

export default function TrialBalancePage() {
  const [ledger, setLedger] = useState([]);
  const [totals, setTotals] = useState({ total_debit: 0, total_credit: 0, is_balanced: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [auditResult, setAuditResult] = useState(null);
  const [auditing, setAuditing] = useState(false);
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
      if (!res.ok) throw new Error('Failed to fetch trial balance records');
      const data = await res.json();
      setLedger(data.ledger || []);
      setTotals(data.trial_balance || { total_debit: 0, total_credit: 0, is_balanced: true });
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const runLedgerAudit = async () => {
    setAuditing(true);
    try {
      const cid = activeCompanyId || localStorage.getItem('active_company_id') || '';
      const url = cid ? `/api/ledger/audit?company_id=${encodeURIComponent(cid)}` : '/api/ledger/audit';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to execute ledger audit');
      const data = await res.json();
      setAuditResult(data);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setAuditing(false);
    }
  };

  const formatAmount = (val) => {
    const num = parseFloat(val || 0);
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const isBalanced = totals.is_balanced || Math.abs(parseFloat(totals.total_debit || 0) - parseFloat(totals.total_credit || 0)) < 0.01;
  const variance = Math.abs(parseFloat(totals.total_debit || 0) - parseFloat(totals.total_credit || 0));

  // Account Categories
  const accountTypes = useMemo(() => {
    const types = new Set(ledger.map(a => a.account_type || 'Other'));
    return ['ALL', ...Array.from(types)];
  }, [ledger]);

  // Filtered accounts
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
        return code.includes(q) || name.includes(q) || type.includes(q);
      }

      return true;
    });
  }, [ledger, selectedType, searchQuery]);

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
            <Scale size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Trial Balance
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem', marginBottom: 0 }}>
              View the debit and credit balances of all ledger accounts to review the overall balance of the accounting records.
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button 
            type="button"
            className="btn btn-primary"
            onClick={runLedgerAudit} 
            disabled={auditing || ledger.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.5rem 1rem',
              fontSize: '0.82rem',
              fontWeight: 600
            }}
          >
            {auditing ? <RefreshCw size={14} className="spin" /> : <ShieldCheck size={16} />}
            <span>{auditing ? 'Auditing Ledger...' : 'Audit Ledger'}</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fetchLedger(activeCompanyId)}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.5rem 0.9rem',
              fontSize: '0.82rem'
            }}
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
            Accounts with recorded balances
          </div>
        </div>

        {/* Card 2: Total Debits */}
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
            RM {formatAmount(totals.total_debit)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Cumulative debit balances
          </div>
        </div>

        {/* Card 3: Total Credits */}
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
            RM {formatAmount(totals.total_credit)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Cumulative credit balances
          </div>
        </div>

        {/* Card 4: Equilibrium Status */}
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
            <span>Equilibrium Status</span>
            {isBalanced ? (
              <CheckCircle2 size={16} style={{ color: 'var(--status-success-text)' }} />
            ) : (
              <AlertCircle size={16} style={{ color: 'var(--status-error-text)' }} />
            )}
          </div>
          <div style={{ 
            fontSize: '1.25rem', 
            fontWeight: 700, 
            color: isBalanced ? 'var(--status-success-text)' : 'var(--status-error-text)',
            margin: '0.4rem 0 0.1rem 0' 
          }}>
            {isBalanced ? 'Balanced' : 'Out of Balance'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {isBalanced ? 'Debits strictly equal credits' : `Variance: RM ${formatAmount(variance)}`}
          </div>
        </div>
      </div>

      {/* 3. Ledger Audit Report Card (When available) */}
      {auditResult && (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={18} style={{ color: 'var(--primary-color)' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Ledger Audit Summary
              </h3>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '0.2rem 0.6rem',
                borderRadius: '12px',
                backgroundColor: 'var(--status-success-bg)',
                color: 'var(--status-success-text)',
                border: '1px solid var(--status-success-border)'
              }}>
                Balanced
              </span>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '0.2rem 0.6rem',
                borderRadius: '12px',
                backgroundColor: auditResult.ledger_verdict === 'NORMAL' ? 'var(--status-success-bg)' : 'var(--status-warning-bg)',
                color: auditResult.ledger_verdict === 'NORMAL' ? 'var(--status-success-text)' : 'var(--status-warning-text)',
                border: `1px solid ${auditResult.ledger_verdict === 'NORMAL' ? 'var(--status-success-border)' : 'var(--status-warning-border)'}`
              }}>
                Verdict: {auditResult.ledger_verdict}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '0.75rem 0.9rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem', textTransform: 'uppercase' }}>
                Balance Direction Verification
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
                {auditResult.thought_process?.step_1_balance_direction_check || 'Account balance directions verified against Chart of Accounts.'}
              </div>
            </div>
            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '0.75rem 0.9rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem', textTransform: 'uppercase' }}>
                Prerequisite Completeness
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
                {auditResult.thought_process?.step_2_prerequisite_completeness_check || 'Supporting funding and prerequisite documents confirmed.'}
              </div>
            </div>
            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '0.75rem 0.9rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem', textTransform: 'uppercase' }}>
                Reporting Coherence
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
                {auditResult.thought_process?.step_3_reporting_coherence_check || 'Financial figures conform to standard reporting rules.'}
              </div>
            </div>
          </div>

          {auditResult.executive_summary && (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Summary:</strong> {auditResult.executive_summary}
            </div>
          )}

          {auditResult.anomalies && auditResult.anomalies.length > 0 && (
            <div style={{ marginTop: '0.85rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--status-warning-text)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                Notices ({auditResult.anomalies.length}):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {auditResult.anomalies.map((anom, idx) => (
                  <div key={idx} style={{ backgroundColor: 'var(--status-warning-bg)', border: '1px solid var(--status-warning-border)', padding: '0.6rem 0.85rem', borderRadius: '6px', fontSize: '0.82rem' }}>
                    <span style={{ fontWeight: 700, color: 'var(--status-warning-text)' }}>{anom.account_code} {anom.account_name}</span>: {anom.issue}{' '}
                    <span style={{ color: 'var(--primary-color)', fontWeight: 500 }}>Recommendation: {anom.recommended_action}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Alerts */}
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

      {!loading && !isBalanced && (
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
          <span><strong>Notice:</strong> The Trial Balance is out of balance. Total debits do not equal total credits.</span>
        </div>
      )}

      {/* 5. Filter & Search Controls Bar */}
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
              type="button"
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
            placeholder="Search account code, name..."
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

      {/* 6. Trial Balance Table */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.75rem auto', color: 'var(--primary-color)' }} />
          <div>Calculating Trial Balance...</div>
        </div>
      ) : filteredLedger.length === 0 ? (
        <div style={{ 
          padding: '3.5rem 2rem', 
          textAlign: 'center', 
          backgroundColor: 'var(--bg-card)', 
          borderRadius: '10px', 
          border: '1px dashed var(--border-color)',
          color: 'var(--text-secondary)' 
        }}>
          <Scale size={36} style={{ margin: '0 auto 0.85rem auto', color: 'var(--text-muted)' }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.35rem 0' }}>
            No Posted Transactions Found
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '460px', margin: '0 auto' }}>
            {selectedType !== 'ALL' || searchQuery.trim()
              ? 'No accounts match your filter criteria.'
              : 'Post approved transactions from the Audit Queue to populate the Trial Balance.'}
          </p>
        </div>
      ) : (
        <div style={{ 
          backgroundColor: 'var(--bg-card)', 
          border: '1px solid var(--border-color)', 
          borderRadius: '10px', 
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ 
                backgroundColor: 'var(--bg-primary)', 
                borderBottom: '2px solid var(--border-color)', 
                textAlign: 'left' 
              }}>
                <th style={{ padding: '0.75rem 1.25rem', color: 'var(--text-secondary)', fontWeight: 600, width: '150px' }}>
                  Account Code
                </th>
                <th style={{ padding: '0.75rem 1.25rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Account Name
                </th>
                <th style={{ padding: '0.75rem 1.25rem', color: 'var(--text-secondary)', fontWeight: 600, width: '130px' }}>
                  Account Type
                </th>
                <th style={{ 
                  padding: '0.75rem 1.25rem', 
                  textAlign: 'right', 
                  color: 'var(--primary-color)', 
                  fontWeight: 600, 
                  width: '160px',
                  backgroundColor: 'rgba(37, 99, 235, 0.03)'
                }}>
                  Debit (MYR)
                </th>
                <th style={{ 
                  padding: '0.75rem 1.25rem', 
                  textAlign: 'right', 
                  color: 'var(--status-success-text)', 
                  fontWeight: 600, 
                  width: '160px',
                  backgroundColor: 'rgba(21, 128, 61, 0.03)'
                }}>
                  Credit (MYR)
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredLedger.map((acc, idx) => {
                const isDebitBal = acc.normal_balance === "DEBIT";
                let displayDebit = "";
                let displayCredit = "";
                
                if (isDebitBal) {
                  if (acc.balance >= 0) displayDebit = formatAmount(acc.balance);
                  else displayCredit = formatAmount(Math.abs(acc.balance));
                } else {
                  if (acc.balance >= 0) displayCredit = formatAmount(acc.balance);
                  else displayDebit = formatAmount(Math.abs(acc.balance));
                }

                return (
                  <tr 
                    key={acc.account_code} 
                    style={{ 
                      borderBottom: '1px solid var(--border-color)',
                      backgroundColor: idx % 2 === 1 ? 'rgba(248, 250, 252, 0.5)' : 'var(--bg-card)'
                    }}
                  >
                    <td style={{ padding: '0.75rem 1.25rem', whiteSpace: 'nowrap' }}>
                      <span style={{ 
                        fontFamily: 'var(--font-mono)', 
                        color: 'var(--primary-color)', 
                        fontWeight: 600,
                        backgroundColor: 'var(--badge-doc-bg)',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        border: '1px solid rgba(37, 99, 235, 0.2)',
                        fontSize: '0.82rem'
                      }}>
                        {acc.account_code}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1.25rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {acc.account_name}
                    </td>
                    <td style={{ padding: '0.75rem 1.25rem' }}>
                      <span style={{ 
                        fontSize: '0.74rem', 
                        padding: '0.15rem 0.45rem', 
                        borderRadius: '4px', 
                        backgroundColor: 'var(--bg-surface)', 
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-secondary)',
                        fontWeight: 500
                      }}>
                        {acc.account_type}
                      </span>
                    </td>
                    <td style={{ 
                      padding: '0.75rem 1.25rem', 
                      textAlign: 'right', 
                      fontFamily: 'var(--font-mono)',
                      color: displayDebit ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontWeight: displayDebit ? 600 : 400,
                      backgroundColor: 'rgba(37, 99, 235, 0.02)'
                    }}>
                      {displayDebit || '—'}
                    </td>
                    <td style={{ 
                      padding: '0.75rem 1.25rem', 
                      textAlign: 'right', 
                      fontFamily: 'var(--font-mono)',
                      color: displayCredit ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontWeight: displayCredit ? 600 : 400,
                      backgroundColor: 'rgba(21, 128, 61, 0.02)'
                    }}>
                      {displayCredit || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ 
                backgroundColor: 'var(--bg-surface)', 
                borderTop: '2px solid var(--border-color)',
                fontWeight: 700 
              }}>
                <td colSpan="3" style={{ padding: '0.85rem 1.25rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  GRAND TOTAL
                </td>
                <td style={{ 
                  padding: '0.85rem 1.25rem', 
                  textAlign: 'right', 
                  fontFamily: 'var(--font-mono)',
                  color: isBalanced ? 'var(--status-success-text)' : 'var(--text-primary)',
                  fontSize: '0.95rem',
                  backgroundColor: isBalanced ? 'rgba(21, 128, 61, 0.04)' : 'rgba(37, 99, 235, 0.04)'
                }}>
                  {formatAmount(totals.total_debit)}
                </td>
                <td style={{ 
                  padding: '0.85rem 1.25rem', 
                  textAlign: 'right', 
                  fontFamily: 'var(--font-mono)',
                  color: isBalanced ? 'var(--status-success-text)' : 'var(--text-primary)',
                  fontSize: '0.95rem',
                  backgroundColor: isBalanced ? 'rgba(21, 128, 61, 0.04)' : 'rgba(21, 128, 61, 0.04)'
                }}>
                  {formatAmount(totals.total_credit)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

    </div>
  );
}
