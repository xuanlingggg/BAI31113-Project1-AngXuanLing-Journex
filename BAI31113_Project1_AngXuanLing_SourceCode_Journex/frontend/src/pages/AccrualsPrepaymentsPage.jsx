import React, { useState, useEffect } from 'react';
import { 
  CalendarClock, 
  Plus, 
  RefreshCw, 
  Search, 
  ArrowUpRight, 
  ArrowDownRight, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  TrendingUp, 
  TrendingDown, 
  FileText,
  Calendar,
  Layers,
  ChevronRight,
  RotateCcw,
  Ban,
  Check
} from 'lucide-react';

export default function AccrualsPrepaymentsPage({ embedMode = false, dateFilter = null, onViewDocument = null }) {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [selectedType, setSelectedType] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [scheduleItems, setScheduleItems] = useState([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  // Action Modals
  const [actionType, setActionType] = useState(null); // 'AMORTIZE', 'SETTLE', 'REVERSE', 'CANCEL'
  const [actionAmount, setActionAmount] = useState('');
  const [actionDate, setActionDate] = useState(new Date().toISOString().split('T')[0]);
  const [actionNotes, setActionNotes] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Create Form State
  const [formData, setFormData] = useState({
    transaction_type: 'ACCRUED_EXPENSE',
    title: '',
    description: '',
    vendor_customer_name: '',
    original_amount: '',
    currency: 'MYR',
    exchange_rate: '1.0',
    transaction_date: new Date().toISOString().split('T')[0],
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    target_account_code: '907-0000',
    balance_sheet_account_code: '',
    bank_account_code: '310-1000',
    auto_reverse: false,
    auto_reverse_date: ''
  });

  const [coaAccounts, setCoaAccounts] = useState([]);
  const [activeCompanyId, setActiveCompanyId] = useState(() => localStorage.getItem('active_company_id') || '');

  useEffect(() => {
    const handleCompanyUpdate = () => {
      const cid = localStorage.getItem('active_company_id') || '';
      setActiveCompanyId(cid);
    };
    window.addEventListener('company-updated', handleCompanyUpdate);
    return () => window.removeEventListener('company-updated', handleCompanyUpdate);
  }, []);

  const fetchData = async (compId = activeCompanyId) => {
    setLoading(true);
    setError(null);
    try {
      const cid = (typeof compId === 'string' && compId) ? compId : (localStorage.getItem('active_company_id') || '');
      const qs = cid ? `?company_id=${encodeURIComponent(cid)}` : '';
      const [sumRes, recRes, coaRes] = await Promise.all([
        fetch(`/api/accruals-prepayments/summary${qs}`),
        fetch(`/api/accruals-prepayments/${qs}`),
        fetch(`/api/company/accounts${qs}`)
      ]);

      if (sumRes.ok) {
        const sumData = await sumRes.json();
        setSummary(sumData);
      }
      if (recRes.ok) {
        const recData = await recRes.json();
        setRecords(recData);
      }
      if (coaRes.ok) {
        const coaData = await coaRes.json();
        setCoaAccounts(Array.isArray(coaData) ? coaData : (coaData.accounts || coaData.chart_of_accounts || []));
      }
    } catch (err) {
      console.error('Error fetching accruals:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(activeCompanyId);
  }, [activeCompanyId]);

  const openRecordDetails = async (rec) => {
    setSelectedRecord(rec);
    setLoadingSchedule(true);
    setScheduleItems([]);
    try {
      const res = await fetch(`/api/accruals-prepayments/${rec.id}/schedule-preview`);
      if (res.ok) {
        const data = await res.json();
        setScheduleItems(data);
      }
    } catch (err) {
      console.error('Error fetching schedule preview:', err);
    } finally {
      setLoadingSchedule(false);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        company_id: activeCompanyId || localStorage.getItem('active_company_id') || 'COMP-000001',
        original_amount: parseFloat(formData.original_amount),
        exchange_rate: parseFloat(formData.exchange_rate || 1.0),
        balance_sheet_account_code: formData.balance_sheet_account_code || null,
        auto_reverse_date: formData.auto_reverse ? formData.auto_reverse_date : null
      };

      const res = await fetch('/api/accruals-prepayments/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create record');
      }

      setIsCreateOpen(false);
      setFormData({
        transaction_type: 'ACCRUED_EXPENSE',
        title: '',
        description: '',
        vendor_customer_name: '',
        original_amount: '',
        currency: 'MYR',
        exchange_rate: '1.0',
        transaction_date: new Date().toISOString().split('T')[0],
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        target_account_code: '907-0000',
        balance_sheet_account_code: '',
        bank_account_code: '310-1000',
        auto_reverse: false,
        auto_reverse_date: ''
      });
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleActionSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRecord) return;
    setSubmittingAction(true);
    try {
      let endpoint = '';
      let body = {};

      if (actionType === 'AMORTIZE') {
        endpoint = `/api/accruals-prepayments/${selectedRecord.id}/adjust`;
        body = {
          adjustment_date: actionDate,
          amount: parseFloat(actionAmount),
          notes: actionNotes
        };
      } else if (actionType === 'SETTLE') {
        endpoint = `/api/accruals-prepayments/${selectedRecord.id}/settle`;
        body = {
          settlement_date: actionDate,
          amount: parseFloat(actionAmount),
          bank_account_code: '310-1000',
          notes: actionNotes
        };
      } else if (actionType === 'REVERSE') {
        endpoint = `/api/accruals-prepayments/${selectedRecord.id}/reverse`;
        body = {
          reversal_date: actionDate,
          notes: actionNotes
        };
      } else if (actionType === 'CANCEL') {
        endpoint = `/api/accruals-prepayments/${selectedRecord.id}/cancel`;
        body = {
          cancellation_date: actionDate,
          refund_amount: actionAmount ? parseFloat(actionAmount) : null,
          notes: actionNotes
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Action failed');
      }

      setActionType(null);
      setActionAmount('');
      setActionNotes('');

      // Refresh single record details
      const recRes = await fetch(`/api/accruals-prepayments/${selectedRecord.id}`);
      if (recRes.ok) {
        const updatedRec = await recRes.json();
        setSelectedRecord(updatedRec);
      }
      fetchData();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const formatCurrency = (amt) => {
    const val = typeof amt === 'number' ? amt : parseFloat(amt || 0);
    return isNaN(val) ? '0.00' : val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const filteredRecords = records.filter((r) => {
    if (selectedType !== 'ALL' && r.transaction_type !== selectedType) return false;
    if (selectedStatus !== 'ALL' && r.status !== selectedStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (r.title || '').toLowerCase().includes(q);
      const matchNum = (r.transaction_number || '').toLowerCase().includes(q);
      const matchVendor = (r.vendor_customer_name || '').toLowerCase().includes(q);
      if (!matchTitle && !matchNum && !matchVendor) return false;
    }
    return true;
  });

  const getTypeBadge = (type) => {
    switch (type) {
      case 'ACCRUED_EXPENSE':
        return <span style={{ background: '#fef2f2', color: '#b91c1c', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>Accrued Expense</span>;
      case 'PREPAID_EXPENSE':
        return <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>Prepaid Expense</span>;
      case 'ACCRUED_INCOME':
        return <span style={{ background: '#f0fdf4', color: '#15803d', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>Accrued Income</span>;
      case 'DEFERRED_INCOME':
        return <span style={{ background: '#faf5ff', color: '#7e22ce', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>Deferred Income</span>;
      default:
        return <span>{type}</span>;
    }
  };

  const getStatusBadge = (status, isReversed) => {
    if (isReversed) {
      return <span style={{ background: '#f1f5f9', color: '#475569', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>REVERSED</span>;
    }
    switch (status) {
      case 'ACTIVE':
        return <span style={{ background: '#ecfdf5', color: '#047857', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>ACTIVE</span>;
      case 'PARTIALLY_ADJUSTED':
        return <span style={{ background: '#fffbeb', color: '#b45309', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>PARTIAL</span>;
      case 'FULLY_ADJUSTED':
        return <span style={{ background: '#f8fafc', color: '#64748b', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>SETTLED</span>;
      case 'CANCELLED':
        return <span style={{ background: '#fef2f2', color: '#991b1b', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>CANCELLED</span>;
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div style={{ padding: embedMode ? '0' : '1.5rem', maxWidth: embedMode ? '100%' : '1400px', margin: '0 auto' }}>
      {/* Header / Sub-Toolbar */}
      <div style={{ display: 'flex', justifyContent: embedMode ? 'flex-end' : 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        {!embedMode && (
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Accruals & Prepayments</h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
              Manage period adjustments, prepaid asset amortizations, accrued liabilities, and deferred income.
            </p>
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {!embedMode && (
            <button 
              onClick={fetchData} 
              className="btn btn-outline"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <RefreshCw size={15} /> Refresh
            </button>
          )}
          <button 
            onClick={() => setIsCreateOpen(true)}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Plus size={16} /> New Accrual / Prepayment
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ background: '#fff', padding: '1.2rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
              <span>ACCRUED EXPENSES</span>
              <ArrowDownRight size={16} color="#ef4444" />
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a', marginTop: '0.5rem' }}>
              RM {formatCurrency(summary.total_accrued_expenses)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>Current liabilities (Account 410-0000)</div>
          </div>

          <div style={{ background: '#fff', padding: '1.2rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
              <span>PREPAID EXPENSES</span>
              <ArrowUpRight size={16} color="#3b82f6" />
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a', marginTop: '0.5rem' }}>
              RM {formatCurrency(summary.total_prepaid_expenses)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>Current & non-current prepaid assets</div>
          </div>

          <div style={{ background: '#fff', padding: '1.2rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
              <span>ACCRUED INCOME</span>
              <TrendingUp size={16} color="#10b981" />
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a', marginTop: '0.5rem' }}>
              RM {formatCurrency(summary.total_accrued_income)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>Unbilled revenue receivables</div>
          </div>

          <div style={{ background: '#fff', padding: '1.2rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
              <span>DEFERRED INCOME</span>
              <TrendingDown size={16} color="#8b5cf6" />
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a', marginTop: '0.5rem' }}>
              RM {formatCurrency(summary.total_deferred_income)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>Customer advance revenue liabilities</div>
          </div>
        </div>
      )}

      {/* Tabs & Filters */}
      <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          {/* Type Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {[
              { id: 'ALL', label: 'All Records' },
              { id: 'ACCRUED_EXPENSE', label: 'Accrued Expenses' },
              { id: 'PREPAID_EXPENSE', label: 'Prepaid Expenses' },
              { id: 'ACCRUED_INCOME', label: 'Accrued Income' },
              { id: 'DEFERRED_INCOME', label: 'Deferred Income' }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedType(t.id)}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: selectedType === t.id ? 600 : 500,
                  background: selectedType === t.id ? '#0f172a' : '#f1f5f9',
                  color: selectedType === t.id ? '#fff' : '#475569',
                  cursor: 'pointer'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search & Status Filter */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search description, number, vendor..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ padding: '0.4rem 0.6rem 0.4rem 2rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem', width: '240px' }}
              />
            </div>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="PARTIALLY_ADJUSTED">Partially Adjusted</option>
              <option value="FULLY_ADJUSTED">Fully Adjusted</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Data Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 600 }}>
                <th style={{ padding: '0.75rem 1rem' }}>TXN ID</th>
                <th style={{ padding: '0.75rem 1rem' }}>TITLE & PARTY</th>
                <th style={{ padding: '0.75rem 1rem' }}>TYPE</th>
                <th style={{ padding: '0.75rem 1rem' }}>COVERAGE PERIOD</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>TOTAL AMOUNT</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>RECOGNIZED</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>OUTSTANDING</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>STATUS</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    <RefreshCw className="spin" size={24} style={{ margin: '0 auto 0.5rem auto' }} />
                    <div>Loading records...</div>
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                    No accrual or prepayment records found.
                  </td>
                </tr>
              ) : (
                filteredRecords.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }} className="table-row-hover">
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                      {r.transaction_number}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.title}</div>
                      {r.vendor_customer_name && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{r.vendor_customer_name}</div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {getTypeBadge(r.transaction_type)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#475569' }}>
                      {r.start_date} to {r.end_date}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                      RM {formatCurrency(r.amount_myr)}
                      {r.currency !== 'MYR' && (
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>({r.currency} {formatCurrency(r.original_amount)})</div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#047857', fontWeight: 500 }}>
                      RM {formatCurrency(r.total_recognized_amount * r.exchange_rate)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: r.remaining_balance > 0 ? '#b91c1c' : '#64748b', fontWeight: 600 }}>
                      RM {formatCurrency(r.remaining_balance * r.exchange_rate)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      {getStatusBadge(r.status, r.is_reversed)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <button
                          onClick={() => openRecordDetails(r)}
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                        >
                          Inspect
                        </button>
                        {r.supporting_document_id && (
                          <button
                            type="button"
                            onClick={() => {
                              if (onViewDocument) {
                                onViewDocument(r.supporting_document_id);
                              } else {
                                window.open(`/api/documents/${encodeURIComponent(r.supporting_document_id)}/file`, '_blank');
                              }
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                            title="View Supporting Document"
                          >
                            <FileText size={11} />
                            <span>Doc</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MODAL */}
      {isCreateOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', width: '680px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '10px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>New Accrual / Prepayment</h2>
              <button onClick={() => setIsCreateOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleCreateSubmit} style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.3rem' }}>Transaction Type *</label>
                <select
                  value={formData.transaction_type}
                  onChange={e => {
                    const newType = e.target.value;
                    let targetCode = '907-0000';
                    if (newType === 'ACCRUED_INCOME' || newType === 'DEFERRED_INCOME') {
                      targetCode = '500-0000';
                    }
                    setFormData({ ...formData, transaction_type: newType, target_account_code: targetCode });
                  }}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  <option value="ACCRUED_EXPENSE">Accrued Expense (Incurred now, pay later)</option>
                  <option value="PREPAID_EXPENSE">Prepaid Expense (Paid in advance, amortize over time)</option>
                  <option value="ACCRUED_INCOME">Accrued Income (Earned now, collect later)</option>
                  <option value="DEFERRED_INCOME">Deferred Income (Customer advance, recognize as earned)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.3rem' }}>Title / Service Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. December Electricity Bill, Annual Commercial Insurance"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.3rem' }}>Party (Vendor / Customer)</label>
                  <input
                    type="text"
                    placeholder="e.g. TNB, Allianz, Client Sdn Bhd"
                    value={formData.vendor_customer_name}
                    onChange={e => setFormData({ ...formData, vendor_customer_name: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.3rem' }}>Transaction Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.transaction_date}
                    onChange={e => setFormData({ ...formData, transaction_date: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.3rem' }}>Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={formData.original_amount}
                    onChange={e => setFormData({ ...formData, original_amount: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.3rem' }}>Currency</label>
                  <input
                    type="text"
                    value={formData.currency}
                    onChange={e => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.3rem' }}>Rate</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.exchange_rate}
                    onChange={e => setFormData({ ...formData, exchange_rate: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.3rem' }}>Coverage Start Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.start_date}
                    onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.3rem' }}>Coverage End Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.end_date}
                    onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.3rem' }}>
                    {formData.transaction_type.includes('EXPENSE') ? 'Target Expense Account *' : 'Target Revenue Account *'}
                  </label>
                  <select
                    value={formData.target_account_code}
                    onChange={e => setFormData({ ...formData, target_account_code: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  >
                    {coaAccounts
                      .filter(a => formData.transaction_type.includes('EXPENSE') ? a.account_type === 'Expense' : a.account_type === 'Revenue')
                      .map(a => (
                        <option key={a.account_code} value={a.account_code}>
                          {a.account_code} - {a.account_name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.3rem' }}>Bank / Cash Account</label>
                  <select
                    value={formData.bank_account_code}
                    onChange={e => setFormData({ ...formData, bank_account_code: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  >
                    <option value="310-1000">310-1000 - CASH AT BANK</option>
                    <option value="320-0000">320-0000 - CASH IN HAND</option>
                  </select>
                </div>
              </div>

              {formData.transaction_type.startsWith('ACCRUED') && (
                <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.auto_reverse}
                      onChange={e => setFormData({ ...formData, auto_reverse: e.target.checked })}
                    />
                    Enable Automatic Reversal on subsequent period
                  </label>
                  {formData.auto_reverse && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748b' }}>Reversal Date</label>
                      <input
                        type="date"
                        value={formData.auto_reverse_date}
                        onChange={e => setFormData({ ...formData, auto_reverse_date: e.target.value })}
                        style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                      />
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <button type="button" onClick={() => setIsCreateOpen(false)} className="btn btn-outline">Cancel</button>
                <button type="submit" className="btn btn-primary">Create & Post Recognition Journal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL & ACTION MODAL */}
      {selectedRecord && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', width: '850px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '10px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a' }}>{selectedRecord.transaction_number}</span>
                  {getTypeBadge(selectedRecord.transaction_type)}
                  {getStatusBadge(selectedRecord.status, selectedRecord.is_reversed)}
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: '#334155', marginTop: '0.25rem' }}>{selectedRecord.title}</div>
                {selectedRecord.vendor_customer_name && (
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Party: {selectedRecord.vendor_customer_name}</div>
                )}
              </div>
              <button onClick={() => setSelectedRecord(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            {/* Quick Financial Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginTop: '1rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '6px' }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>TOTAL AMOUNT</div>
                <div style={{ fontSize: '1rem', fontWeight: 700 }}>RM {formatCurrency(selectedRecord.amount_myr)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>RECOGNIZED</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#047857' }}>RM {formatCurrency(selectedRecord.total_recognized_amount * selectedRecord.exchange_rate)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>OUTSTANDING BALANCE</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: selectedRecord.remaining_balance > 0 ? '#b91c1c' : '#64748b' }}>
                  RM {formatCurrency(selectedRecord.remaining_balance * selectedRecord.exchange_rate)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>COVERAGE PERIOD</div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>{selectedRecord.start_date} to {selectedRecord.end_date}</div>
              </div>
            </div>

            {/* Action Buttons Bar */}
            {selectedRecord.status !== 'FULLY_ADJUSTED' && selectedRecord.status !== 'CANCELLED' && !selectedRecord.is_reversed && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', padding: '0.75rem', background: '#f1f5f9', borderRadius: '6px' }}>
                {(selectedRecord.transaction_type === 'PREPAID_EXPENSE' || selectedRecord.transaction_type === 'DEFERRED_INCOME') && (
                  <button
                    onClick={() => {
                      setActionType('AMORTIZE');
                      setActionAmount(selectedRecord.remaining_balance.toString());
                    }}
                    className="btn btn-primary btn-sm"
                  >
                    Post Period Amortization
                  </button>
                )}
                {(selectedRecord.transaction_type === 'ACCRUED_EXPENSE' || selectedRecord.transaction_type === 'ACCRUED_INCOME') && (
                  <>
                    <button
                      onClick={() => {
                        setActionType('SETTLE');
                        setActionAmount(selectedRecord.remaining_balance.toString());
                      }}
                      className="btn btn-primary btn-sm"
                    >
                      Record Cash Settlement / Payment
                    </button>
                    <button
                      onClick={() => {
                        setActionType('REVERSE');
                        setActionAmount(selectedRecord.remaining_balance.toString());
                      }}
                      className="btn btn-outline btn-sm"
                      style={{ color: '#b91c1c' }}
                    >
                      Post Period Reversal
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    setActionType('CANCEL');
                    setActionAmount(selectedRecord.remaining_balance.toString());
                  }}
                  className="btn btn-outline btn-sm"
                  style={{ color: '#64748b' }}
                >
                  Cancel / Refund
                </button>
              </div>
            )}

            {/* Action Input Form Drawer */}
            {actionType && (
              <form onSubmit={handleActionSubmit} style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #3b82f6', borderRadius: '6px', background: '#eff6ff' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1d4ed8', marginBottom: '0.5rem' }}>
                  Action: {actionType === 'AMORTIZE' ? 'Post Period Amortization' : actionType === 'SETTLE' ? 'Record Settlement Payment' : actionType === 'REVERSE' ? 'Post Accounting Reversal' : 'Cancel & Refund'}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>Action Date *</label>
                    <input
                      type="date"
                      required
                      value={actionDate}
                      onChange={e => setActionDate(e.target.value)}
                      style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  {actionType !== 'REVERSE' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>Amount (Max: {selectedRecord.remaining_balance}) *</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        max={selectedRecord.remaining_balance}
                        value={actionAmount}
                        onChange={e => setActionAmount(e.target.value)}
                        style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      />
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '0.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>Notes / Audit Explanation</label>
                  <input
                    type="text"
                    placeholder="e.g. October monthly amortization, settlement payment voucher"
                    value={actionNotes}
                    onChange={e => setActionNotes(e.target.value)}
                    style={{ width: '100%', padding: '0.4rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <button type="button" onClick={() => setActionType(null)} className="btn btn-outline btn-sm">Cancel</button>
                  <button type="submit" disabled={submittingAction} className="btn btn-primary btn-sm">
                    {submittingAction ? 'Posting...' : 'Confirm & Post Journal'}
                  </button>
                </div>
              </form>
            )}

            {/* Amortization Schedule Preview */}
            {(selectedRecord.transaction_type === 'PREPAID_EXPENSE' || selectedRecord.transaction_type === 'DEFERRED_INCOME') && (
              <div style={{ marginTop: '1.5rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
                  Calculated Monthly Amortization Schedule
                </h3>
                {loadingSchedule ? (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b' }}>Calculating schedule...</div>
                ) : (
                  <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '0.5rem 0.75rem' }}>#</th>
                          <th style={{ padding: '0.5rem 0.75rem' }}>Period</th>
                          <th style={{ padding: '0.5rem 0.75rem' }}>Date Range</th>
                          <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>Days</th>
                          <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Allocated Amount</th>
                          <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Remaining Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scheduleItems.map(item => (
                          <tr key={item.period_index} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.5rem 0.75rem', color: '#64748b' }}>{item.period_index}</td>
                            <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{item.period_name}</td>
                            <td style={{ padding: '0.5rem 0.75rem', color: '#475569' }}>{item.start_date} to {item.end_date}</td>
                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>{item.days_in_period}</td>
                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>RM {formatCurrency(item.allocated_amount_myr)}</td>
                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#64748b' }}>RM {formatCurrency(item.remaining_balance_after)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Audit History & Linked Journals */}
            <div style={{ marginTop: '1.5rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
                Adjustment History & Linked Journal Entries
              </h3>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '0.5rem 0.75rem' }}>Event Type</th>
                      <th style={{ padding: '0.5rem 0.75rem' }}>Date</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Amount</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Balance After</th>
                      <th style={{ padding: '0.5rem 0.75rem' }}>Journal ID</th>
                      <th style={{ padding: '0.5rem 0.75rem' }}>Audit Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedRecord.history || []).map(h => (
                      <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{h.adjustment_type}</td>
                        <td style={{ padding: '0.5rem 0.75rem', color: '#475569' }}>{h.adjustment_date}</td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>RM {formatCurrency(h.amount_myr)}</td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: '#64748b' }}>RM {formatCurrency(h.balance_after)}</td>
                        <td style={{ padding: '0.5rem 0.75rem', color: '#2563eb', fontFamily: 'monospace' }}>{h.journal_id || 'N/A'}</td>
                        <td style={{ padding: '0.5rem 0.75rem', color: '#64748b' }}>{h.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
              <button onClick={() => setSelectedRecord(null)} className="btn btn-outline">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
