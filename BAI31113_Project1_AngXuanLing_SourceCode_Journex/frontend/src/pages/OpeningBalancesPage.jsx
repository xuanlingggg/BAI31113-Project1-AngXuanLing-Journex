import React, { useState, useEffect } from 'react';
import { 
  Scale, FileText, CheckCircle2, AlertTriangle, RefreshCw, 
  ArrowUpRight, BookOpen, ExternalLink, Calendar, Layers, ShieldCheck,
  Users, Building, CreditCard, Package, Tag, Clock
} from 'lucide-react';

export default function OpeningBalancesPage({ embedMode = false, dateFilter = null, onViewDocument = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSubView, setActiveSubView] = useState('trial_balance');

  const activeCompanyId = localStorage.getItem('active_company_id');

  useEffect(() => {
    fetchOpeningBalances();
    const handleCompanyUpdate = () => fetchOpeningBalances();
    window.addEventListener('company-updated', handleCompanyUpdate);
    return () => window.removeEventListener('company-updated', handleCompanyUpdate);
  }, [activeCompanyId, dateFilter]);

  const fetchOpeningBalances = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = activeCompanyId 
        ? `/api/company/opening-balances?company_id=${encodeURIComponent(activeCompanyId)}&t=${Date.now()}`
        : `/api/company/opening-balances?t=${Date.now()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load opening balances');
      const json = await res.json();
      setData(json);
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

  const formatDisplayDate = (val) => {
    if (!val) return '31 December 2025';
    if (val === '2025-12-31') return '31 December 2025';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return val;
      const day = d.getDate();
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch {
      return val;
    }
  };

  const sub = data?.subsidiary || {};

  return (
    <div className={embedMode ? '' : 'page-container'} style={{ padding: embedMode ? '0' : '1.5rem', maxWidth: embedMode ? '100%' : '1400px', margin: '0 auto' }}>
      {!embedMode && (
        /* Header */
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{ padding: '0.5rem', backgroundColor: '#EFF6FF', borderRadius: '8px', color: '#2563EB' }}>
                <Scale size={22} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Opening Accounting Balances
                </h1>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0' }}>
                  Confirmed opening trial balance, financial year opening date, linked general journal, and source audit documents.
                </p>
              </div>
            </div>
          </div>

          <button 
            onClick={fetchOpeningBalances}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', fontSize: '0.85rem' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            Opening Debit Total
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#2563EB', marginTop: '0.35rem' }}>
            RM {formatCurrency(data?.total_debit)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Total Assets & Expenses
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            Opening Credit Total
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#2563EB', marginTop: '0.35rem' }}>
            RM {formatCurrency(data?.total_credit)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Total Liabilities & Equity
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            Trial Balance Status
          </div>
          <div style={{ 
            fontSize: '1.2rem', 
            fontWeight: 700, 
            color: data?.is_balanced ? '#16A34A' : '#DC2626', 
            marginTop: '0.5rem', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.4rem' 
          }}>
            {data?.is_balanced ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{data?.is_balanced ? 'Balanced' : 'Out of Balance'}</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
            Difference: RM {formatCurrency(data?.difference ?? 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Opening Date: {formatDisplayDate(data?.opening_date)}
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            Opening Journal Entry
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.6rem', fontFamily: 'var(--font-mono)' }}>
            {data?.journal_id || 'Not Yet Posted'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
            <span className={`status-badge ${data?.journal_status === 'POSTED' ? 'EXTRACTED' : 'PROCESSING'}`} style={{ fontSize: '0.7rem' }}>
              {data?.journal_status === 'POSTED' ? 'Posted' : (data?.journal_status || 'Pending')}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {data?.posting_date ? formatDisplayDate(data?.posting_date) : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Grid: Trial Balance Lines & Supporting Documents */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Main Content Area: Opening Trial Balance & Subsidiary Schedules */}
        <div className="card" style={{ padding: '1.25rem' }}>
          
          {/* Sub-navigation Switcher */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.35rem', 
            borderBottom: '1px solid var(--border-color)', 
            paddingBottom: '0.75rem', 
            marginBottom: '1rem',
            overflowX: 'auto'
          }}>
            <button
              type="button"
              onClick={() => setActiveSubView('trial_balance')}
              style={{
                padding: '0.45rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: activeSubView === 'trial_balance' ? 700 : 500,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeSubView === 'trial_balance' ? '#EFF6FF' : 'transparent',
                color: activeSubView === 'trial_balance' ? '#1D4ED8' : 'var(--text-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <Scale size={14} />
              <span>Opening Trial Balance ({data?.lines?.length || 0})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubView('receivables')}
              style={{
                padding: '0.45rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: activeSubView === 'receivables' ? 700 : 500,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeSubView === 'receivables' ? '#EFF6FF' : 'transparent',
                color: activeSubView === 'receivables' ? '#1D4ED8' : 'var(--text-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <Users size={14} />
              <span>Trade Receivables ({sub?.customers?.length || 0})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubView('payables')}
              style={{
                padding: '0.45rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: activeSubView === 'payables' ? 700 : 500,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeSubView === 'payables' ? '#EFF6FF' : 'transparent',
                color: activeSubView === 'payables' ? '#1D4ED8' : 'var(--text-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <Building size={14} />
              <span>Trade Payables ({sub?.suppliers?.length || 0})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubView('creditors')}
              style={{
                padding: '0.45rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: activeSubView === 'creditors' ? 700 : 500,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeSubView === 'creditors' ? '#EFF6FF' : 'transparent',
                color: activeSubView === 'creditors' ? '#1D4ED8' : 'var(--text-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <CreditCard size={14} />
              <span>Other Creditors ({sub?.other_creditors?.length || 0})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubView('inventory')}
              style={{
                padding: '0.45rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: activeSubView === 'inventory' ? 700 : 500,
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeSubView === 'inventory' ? '#EFF6FF' : 'transparent',
                color: activeSubView === 'inventory' ? '#1D4ED8' : 'var(--text-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <Package size={14} />
              <span>Inventory Stock ({sub?.inventory?.length || 0})</span>
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem auto', color: '#3B82F6' }} />
              <div>Loading opening balances...</div>
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#DC2626' }}>
              <AlertTriangle size={24} style={{ margin: '0 auto 0.5rem auto' }} />
              <div>{error}</div>
            </div>
          ) : activeSubView === 'trial_balance' ? (
            /* SUBVIEW 1: OPENING TRIAL BALANCE ACCOUNTS */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Confirmed Opening Trial Balance Accounts
                </h2>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {data?.lines?.length || 0} Accounts Recorded
                </span>
              </div>

              {(data?.lines || []).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                  <Scale size={32} style={{ margin: '0 auto 0.75rem auto', opacity: 0.4 }} />
                  <div style={{ fontWeight: 600 }}>No Opening Balances Recorded</div>
                  <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    Complete company onboarding Step 3 to confirm and post opening balances.
                  </div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                        <th style={{ padding: '0.75rem 0.5rem' }}>Account Code</th>
                        <th style={{ padding: '0.75rem 0.5rem' }}>Account Name</th>
                        <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Debit (RM)</th>
                        <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Credit (RM)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lines.map((l, idx) => (
                        <tr 
                          key={idx}
                          style={{ borderBottom: '1px solid var(--border-color)' }}
                        >
                          <td style={{ padding: '0.8rem 0.5rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {l.account_code}
                          </td>
                          <td style={{ padding: '0.8rem 0.5rem', color: 'var(--text-primary)' }}>
                            {l.account_name}
                          </td>
                          <td style={{ padding: '0.8rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: l.debit > 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                            {l.debit > 0 ? formatCurrency(l.debit) : '-'}
                          </td>
                          <td style={{ padding: '0.8rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: l.credit > 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                            {l.credit > 0 ? formatCurrency(l.credit) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', fontWeight: 700 }}>
                        <td colSpan={2} style={{ padding: '0.85rem 0.5rem', textAlign: 'right', textTransform: 'uppercase', fontSize: '0.8rem' }}>
                          Total (Balanced Dr == Cr)
                        </td>
                        <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right', color: '#2563EB', fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}>
                          RM {formatCurrency(data?.total_debit)}
                        </td>
                        <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right', color: '#2563EB', fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}>
                          RM {formatCurrency(data?.total_credit)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          ) : activeSubView === 'receivables' ? (
            /* SUBVIEW 2: TRADE RECEIVABLES */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Trade Receivables Schedule (GL Control Account: 300-0000)
                </h2>
                <span className="status-badge EXTRACTED" style={{ fontSize: '0.75rem' }}>
                  Total: RM {formatCurrency(sub?.debtor_total)}
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Code</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Customer Name</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Invoice Date</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Credit Term</th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Outstanding (RM)</th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', width: '120px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sub?.customers || []).map((c, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{c.customer_code}</td>
                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{c.customer_name}</td>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{c.invoice_date || '—'}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.45rem', borderRadius: '4px', backgroundColor: '#F1F5F9', color: '#475569' }}>
                            {c.credit_term}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                          {formatCurrency(c.opening_balance)}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              const docId = c.source_doc_id || 'DOC-2026-000005';
                              if (onViewDocument) onViewDocument(docId);
                              else window.open(`/api/documents/${encodeURIComponent(docId)}/file`, '_blank');
                            }}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                          >
                            <FileText size={12} />
                            <span>View Doc</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border-color)', fontWeight: 700 }}>
                      <td colSpan={4} style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Total Receivables</td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#2563EB', fontFamily: 'var(--font-mono)' }}>
                        RM {formatCurrency(sub?.debtor_total)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : activeSubView === 'payables' ? (
            /* SUBVIEW 3: TRADE PAYABLES */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Trade Payables Schedule (GL Control Account: 400-0000)
                </h2>
                <span className="status-badge EXTRACTED" style={{ fontSize: '0.75rem' }}>
                  Total: RM {formatCurrency(sub?.creditor_total)}
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Code</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Supplier Name</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Invoice Date</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Credit Term</th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Outstanding (RM)</th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', width: '120px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sub?.suppliers || []).map((s, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{s.supplier_code}</td>
                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{s.supplier_name}</td>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{s.invoice_date || '—'}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.45rem', borderRadius: '4px', backgroundColor: '#F1F5F9', color: '#475569' }}>
                            {s.credit_term}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                          {formatCurrency(s.opening_balance)}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              const docId = s.source_doc_id || 'DOC-2026-000004';
                              if (onViewDocument) onViewDocument(docId);
                              else window.open(`/api/documents/${encodeURIComponent(docId)}/file`, '_blank');
                            }}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                          >
                            <FileText size={12} />
                            <span>View Doc</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border-color)', fontWeight: 700 }}>
                      <td colSpan={4} style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Total Payables</td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#2563EB', fontFamily: 'var(--font-mono)' }}>
                        RM {formatCurrency(sub?.creditor_total)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : activeSubView === 'creditors' ? (
            /* SUBVIEW 4: OTHER CREDITORS */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Other Creditors Schedule (GL Control Account: 405-0000)
                </h2>
                <span className="status-badge EXTRACTED" style={{ fontSize: '0.75rem' }}>
                  Total: RM {formatCurrency(sub?.other_creditor_total)}
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Code</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Creditor Name</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Invoice Date</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Credit Term</th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Outstanding (RM)</th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', width: '120px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sub?.other_creditors || []).map((c, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{c.supplier_code}</td>
                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{c.supplier_name}</td>
                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{c.invoice_date || '—'}</td>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.45rem', borderRadius: '4px', backgroundColor: '#F1F5F9', color: '#475569' }}>
                            {c.credit_term}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                          {formatCurrency(c.opening_balance)}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              const docId = c.source_doc_id || 'DOC-2026-000002';
                              if (onViewDocument) onViewDocument(docId);
                              else window.open(`/api/documents/${encodeURIComponent(docId)}/file`, '_blank');
                            }}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                          >
                            <FileText size={12} />
                            <span>View Doc</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border-color)', fontWeight: 700 }}>
                      <td colSpan={4} style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Total Other Creditors</td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#2563EB', fontFamily: 'var(--font-mono)' }}>
                        RM {formatCurrency(sub?.other_creditor_total)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            /* SUBVIEW 5: INVENTORY STOCK */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Inventory Stock Schedule (GL Control Account: 330-0000)
                </h2>
                <span className="status-badge EXTRACTED" style={{ fontSize: '0.75rem' }}>
                  Total Valuation: RM {formatCurrency(sub?.stock_total)}
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Item Code</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Description</th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Quantity</th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Unit Cost (RM)</th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Total Valuation (RM)</th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', width: '120px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sub?.inventory || []).map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{item.item_code}</td>
                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{item.item_name}</td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{item.opening_quantity}</td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(item.unit_cost)}</td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                          {formatCurrency(item.total_valuation)}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              const docId = item.source_doc_id || 'DOC-2026-000003';
                              if (onViewDocument) onViewDocument(docId);
                              else window.open(`/api/documents/${encodeURIComponent(docId)}/file`, '_blank');
                            }}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                          >
                            <FileText size={12} />
                            <span>View Doc</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border-color)', fontWeight: 700 }}>
                      <td colSpan={4} style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Total Stock Valuation</td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: '#2563EB', fontFamily: 'var(--font-mono)' }}>
                        RM {formatCurrency(sub?.stock_total)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Supporting Documents & Opening Journal Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Supporting Documents Card */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.85rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={18} style={{ color: '#2563EB' }} />
              <span>Supporting Source Documents ({data?.documents?.length || 0})</span>
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 1rem' }}>
              Permanent company setup documents archived in company document repository.
            </p>

            {(data?.documents || []).length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem' }}>
                No uploaded source documents found.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {data.documents.map((doc, idx) => (
                  <div 
                    key={doc.id || idx}
                    style={{
                      padding: '0.75rem',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-card)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                          {doc.filename}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                          Type: {doc.document_type}
                        </div>
                        {doc.source_doc_id && (
                          <div style={{ fontSize: '0.7rem', color: '#2563EB', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
                            Doc ID: {doc.source_doc_id}
                          </div>
                        )}
                      </div>
                      {doc.source_doc_id && (
                        <button 
                          type="button"
                          onClick={() => {
                            if (onViewDocument) {
                              onViewDocument(doc.source_doc_id);
                            } else {
                              window.open(`/api/documents/${encodeURIComponent(doc.source_doc_id)}/file`, '_blank');
                            }
                          }}
                          style={{
                            padding: '0.35rem 0.6rem',
                            borderRadius: '6px',
                            backgroundColor: '#EFF6FF',
                            color: '#1D4ED8',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            border: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <FileText size={12} />
                          <span>View</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Opening Journal Entry Details Card */}
          <div className="card" style={{ padding: '1.25rem', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BookOpen size={18} style={{ color: '#2563EB' }} />
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: '#0F172A' }}>
                  Opening General Journal
                </h3>
              </div>
              <span className={`status-badge ${data?.journal_status === 'POSTED' ? 'EXTRACTED' : 'PROCESSING'}`} style={{ fontSize: '0.7rem' }}>
                {data?.journal_status === 'POSTED' ? 'POSTED' : (data?.journal_status || 'PENDING')}
              </span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.78rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Journal Ref:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#0F172A' }}>{data?.journal_id || 'Not Yet Posted'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Book:</span>
                <span style={{ fontWeight: 600, color: '#0F172A' }}>{data?.book || 'General Journal'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Posting Date:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#0F172A' }}>{formatDisplayDate(data?.posting_date || data?.opening_date)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Total Debits:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#2563EB' }}>RM {formatCurrency(data?.total_debit)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Total Credits:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#2563EB' }}>RM {formatCurrency(data?.total_credit)}</span>
              </div>
            </div>
            <p style={{ fontSize: '0.72rem', color: '#64748B', margin: '0.75rem 0 0', borderTop: '1px solid #E2E8F0', paddingTop: '0.5rem' }}>
              {data?.journal_description || 'Opening balance journal entry posted to General Ledger.'}
            </p>
          </div>

        </div>

      </div>
    </div>
  );
}
