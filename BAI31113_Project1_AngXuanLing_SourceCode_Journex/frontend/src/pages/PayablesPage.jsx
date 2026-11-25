import React, { useState, useEffect } from 'react';
import { 
  Building, Search, CheckCircle2, AlertTriangle, FileText, 
  ArrowUpRight, RefreshCw, Calendar, Clock, DollarSign
} from 'lucide-react';

export default function PayablesPage({ embedMode = false, dateFilter = null, onViewDocument = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const activeCompanyId = localStorage.getItem('active_company_id');

  useEffect(() => {
    fetchPayables();
    const handleCompanyUpdate = () => fetchPayables();
    window.addEventListener('company-updated', handleCompanyUpdate);
    return () => window.removeEventListener('company-updated', handleCompanyUpdate);
  }, [activeCompanyId, dateFilter]);

  const fetchPayables = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = activeCompanyId 
        ? `/api/company/payables?company_id=${encodeURIComponent(activeCompanyId)}`
        : '/api/company/payables';

      if (dateFilter) {
        if (dateFilter.as_at_date) {
          url += `&as_at_date=${encodeURIComponent(dateFilter.as_at_date)}`;
        } else {
          if (dateFilter.from_date) url += `&from_date=${encodeURIComponent(dateFilter.from_date)}`;
          if (dateFilter.to_date) url += `&to_date=${encodeURIComponent(dateFilter.to_date)}`;
        }
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load accounts payable schedule');
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

  const filteredSuppliers = (data?.suppliers || []).filter((s) => {
    const q = searchTerm.toLowerCase();
    return (
      (s.supplier_name || '').toLowerCase().includes(q) ||
      (s.supplier_code || '').toLowerCase().includes(q) ||
      (s.invoice_no || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className={embedMode ? '' : 'page-container'} style={{ padding: embedMode ? '0' : '1.5rem', maxWidth: embedMode ? '100%' : '1400px', margin: '0 auto' }}>
      {!embedMode && (
      /* Header */
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ padding: '0.5rem', backgroundColor: '#EFF6FF', borderRadius: '8px', color: '#2563EB' }}>
              <Building size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Accounts Payable (Trade Creditors)
              </h1>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0' }}>
                Supplier subsidiary ledger with invoice dates, credit terms, due dates, and GL control tie-out.
              </p>
            </div>
          </div>
        </div>

        <button 
          onClick={fetchPayables}
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
            Total Payables
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#2563EB', marginTop: '0.35rem' }}>
            RM {formatCurrency(data?.total_outstanding)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {data?.total_suppliers || 0} Trade Creditors
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            GL Control (400-0000)
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.35rem' }}>
            RM {formatCurrency(data?.gl_control_balance)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            General Ledger Trade Creditors
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            Status
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: data?.is_reconciled ? '#16A34A' : '#DC2626', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {data?.is_reconciled ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{data?.is_reconciled ? 'Tied Out' : 'Variance'}</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
            Difference: RM {formatCurrency(Math.abs(data?.discrepancy || 0))}
          </div>
        </div>
      </div>

      {/* Search and Table Card */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search supplier, code, or invoice..."
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
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Showing {filteredSuppliers.length} of {data?.suppliers?.length || 0} suppliers
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem auto', color: '#3B82F6' }} />
            <div>Loading accounts payable schedule...</div>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#DC2626' }}>
            <AlertTriangle size={24} style={{ margin: '0 auto 0.5rem auto' }} />
            <div>{error}</div>
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <Building size={32} style={{ margin: '0 auto 0.75rem auto', opacity: 0.4 }} />
            <div style={{ fontWeight: 600 }}>No Accounts Payable Records Found</div>
            <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Confirm your Trade Payables onboarding schedule or upload supplier bills.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Supplier</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Invoice No</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Invoice Date</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Credit Term</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Due Date</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Outstanding Amount (RM)</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', width: '130px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((s, idx) => (
                  <tr 
                    key={s.id || idx}
                    style={{ 
                      borderBottom: '1px solid var(--border-color)',
                      transition: 'background-color 0.15s'
                    }}
                  >
                    <td style={{ padding: '0.85rem 0.5rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.supplier_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                        {s.supplier_code}
                      </div>
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {s.invoice_no}
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem', color: 'var(--text-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Calendar size={13} style={{ color: 'var(--text-secondary)' }} />
                        <span>{s.invoice_date}</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        backgroundColor: '#EFF6FF',
                        color: '#1D4ED8',
                        fontWeight: 600,
                        fontSize: '0.75rem'
                      }}>
                        {s.credit_term}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600, color: '#B45309' }}>
                        <Clock size={13} />
                        <span>{s.due_date}</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {formatCurrency(s.outstanding_balance)}
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem', textAlign: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          const docId = s.source_doc_id || 'DOC-2026-000004';
                          if (onViewDocument) {
                            onViewDocument(docId);
                          } else {
                            window.open(`/api/documents/${encodeURIComponent(docId)}/file`, '_blank');
                          }
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}
                      >
                        <FileText size={13} />
                        <span>View Document</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', fontWeight: 700 }}>
                  <td colSpan={5} style={{ padding: '0.85rem 0.5rem', textAlign: 'right', textTransform: 'uppercase', fontSize: '0.8rem' }}>
                    Total Trade Creditors {data?.as_at_date ? `(As at ${data.as_at_date})` : ''}
                  </td>
                  <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right', color: '#2563EB', fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}>
                    RM {formatCurrency(data?.total_outstanding)}
                  </td>
                  <td style={{ padding: '0.85rem 0.5rem' }}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
