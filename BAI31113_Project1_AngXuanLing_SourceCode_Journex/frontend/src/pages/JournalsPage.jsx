import React, { useState, useEffect } from 'react';
import ReasoningProcessModal from '../components/ReasoningProcessModal';
import { 
  BookOpen, 
  RefreshCw, 
  AlertCircle, 
  Search,
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  Brain,
  Trash2
} from 'lucide-react';

export default function JournalsPage() {
  const [journals, setJournals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [reasoningJournal, setReasoningJournal] = useState(null);
  const [isReasoningModalOpen, setIsReasoningModalOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [activeCompanyId, setActiveCompanyId] = useState(() => localStorage.getItem('active_company_id') || '');

  useEffect(() => {
    const handleCompanyUpdate = () => {
      const cid = localStorage.getItem('active_company_id') || '';
      setActiveCompanyId(cid);
    };
    window.addEventListener('company-updated', handleCompanyUpdate);
    return () => window.removeEventListener('company-updated', handleCompanyUpdate);
  }, []);

  const fetchJournals = async (compId = activeCompanyId) => {
    setLoading(true);
    setError(null);
    try {
      const cid = (typeof compId === 'string' && compId) ? compId : (localStorage.getItem('active_company_id') || '');
      const url = cid ? `/api/journals/?company_id=${encodeURIComponent(cid)}` : '/api/journals/';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch journals (${res.status})`);
      const data = await res.json();
      setJournals(data.journals || []);
    } catch (err) {
      console.error('Error fetching journals:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelJournal = async (journal) => {
    const jid = journal.journal_id;
    if (!window.confirm(`Are you sure you want to cancel and reject transaction "${jid}" (${journal.description || 'Journal Entry'})?\n\nThis will remove the draft journal entry and its staged transaction from the company records.`)) {
      return;
    }

    try {
      setCancellingId(jid);
      const res = await fetch(`/api/journals/${encodeURIComponent(jid)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to cancel transaction');
      }
      fetchJournals();
    } catch (err) {
      alert(`Error cancelling transaction: ${err.message}`);
    } finally {
      setCancellingId(null);
    }
  };

  useEffect(() => {
    fetchJournals(activeCompanyId);
  }, [activeCompanyId]);

  const formatAmount = (val) => {
    const num = typeof val === 'number' ? val : parseFloat(val || 0);
    if (isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const filteredJournals = journals.filter((j) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (j.journal_id && j.journal_id.toLowerCase().includes(q)) ||
      (j.reference && j.reference.toLowerCase().includes(q)) ||
      (j.description && j.description.toLowerCase().includes(q))
    );
  });

  return (
    <div className="page-container" style={{ padding: '1.5rem 2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <BookOpen size={24} style={{ color: 'var(--primary-color)' }} />
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Journal Entries</h2>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            View double-entry journals automatically generated from document processing.
          </p>
        </div>

        <button 
          className="btn btn-secondary" 
          onClick={fetchJournals}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem' }}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div style={{ 
          backgroundColor: 'var(--status-error-bg)', 
          border: '1px solid rgba(185, 28, 28, 0.25)', 
          color: 'var(--status-error-text)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div style={{ marginBottom: '1rem', position: 'relative', width: '300px' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
        <input 
          type="text" 
          placeholder="Search journals..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '0.6rem 1rem 0.6rem 2.2rem',
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            color: 'var(--text-primary)',
            fontSize: '0.85rem'
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading journals...</div>
        ) : filteredJournals.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            No journal entries found.
          </div>
        ) : (
          filteredJournals.map((journal) => (
            <div key={journal.id} style={{ 
              backgroundColor: 'var(--bg-card)', 
              border: '1px solid var(--border-color)', 
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              {/* Journal Header */}
              <div style={{ 
                padding: '1rem 1.5rem', 
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'var(--bg-primary)'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.3rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1.05rem' }}>{journal.journal_id}</span>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      padding: '0.15rem 0.5rem', 
                      borderRadius: '12px', 
                      backgroundColor: journal.status === 'POSTED' ? 'var(--status-success-bg)' : 'var(--status-warning-bg)',
                      color: journal.status === 'POSTED' ? 'var(--status-success-text)' : 'var(--status-warning-text)',
                      border: `1px solid ${journal.status === 'POSTED' ? 'rgba(21, 128, 61, 0.25)' : 'rgba(180, 83, 9, 0.25)'}`,
                      fontWeight: 600
                    }}>
                      {journal.status}
                    </span>
                    {journal.abnormal_risk?.has_abnormal_risk && (
                      <span style={{ 
                        fontSize: '0.75rem', 
                        padding: '0.15rem 0.5rem', 
                        borderRadius: '12px', 
                        backgroundColor: 'rgba(239, 68, 68, 0.12)',
                        color: 'var(--status-error-text)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        <AlertTriangle size={12} /> Action Required: Missing Document
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <span>Date: {journal.journal_date}</span>
                    <span style={{ margin: '0 0.5rem' }}>|</span>
                    <span>Ref: {journal.reference || '-'}</span>
                    <span style={{ margin: '0 0.5rem' }}>|</span>
                    <span>Transaction Ref: {journal.transaction_id}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>{journal.description}</div>
                    {(journal.audit_reasoning || journal.status === 'POSTED') && (
                      <button
                        onClick={() => {
                          setReasoningJournal(journal);
                          setIsReasoningModalOpen(true);
                        }}
                        className="btn btn-secondary btn-sm"
                        style={{
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          backgroundColor: 'rgba(37, 99, 235, 0.08)',
                          color: 'var(--primary-color)',
                          border: '1px solid rgba(37, 99, 235, 0.25)',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                        title="View the entire AI error detection flow and decision making"
                      >
                        <Brain size={13} /> Reasoning Process
                      </button>
                    )}
                    {journal.status !== 'POSTED' && (
                      <button
                        onClick={() => handleCancelJournal(journal)}
                        disabled={cancellingId === journal.journal_id}
                        className="btn btn-secondary btn-sm"
                        style={{
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          backgroundColor: 'rgba(239, 68, 68, 0.08)',
                          color: 'var(--status-error-text)',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                        title="Cancel and delete this unposted transaction"
                      >
                        <Trash2 size={13} /> {cancellingId === journal.journal_id ? 'Cancelling...' : 'Cancel Transaction'}
                      </button>
                    )}
                  </div>
                  {!journal.is_balanced && (
                    <div style={{ color: 'var(--status-error-text)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-end' }}>
                      <AlertCircle size={14} /> Unbalanced
                    </div>
                  )}
                </div>
              </div>

              {/* Human Guidance & Missing Document Request Card */}
              {journal.abnormal_risk?.has_abnormal_risk && (
                <div style={{
                  padding: '0.85rem 1.5rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.04)',
                  borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
                  fontSize: '0.85rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--status-error-text)', fontWeight: 700, marginBottom: '0.35rem' }}>
                    <AlertTriangle size={15} /> General Ledger Abnormal Balance Guard Triggered
                  </div>
                  <div style={{ color: 'var(--text-primary)', marginBottom: '0.3rem', lineHeight: 1.45 }}>
                    <strong>Conflict:</strong> {journal.abnormal_risk.issue_description}
                  </div>
                  <div style={{ color: 'var(--primary-color)', marginBottom: '0.3rem', lineHeight: 1.45 }}>
                    <strong>Required Document:</strong> {journal.abnormal_risk.missing_document_description}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    <strong>Recommendation:</strong> {journal.abnormal_risk.recommended_action}
                  </div>
                </div>
              )}

              {/* Journal Lines Table */}
              <div style={{ padding: '0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem 1.5rem', fontWeight: 600 }}>Account</th>
                      <th style={{ padding: '0.75rem 1.5rem', fontWeight: 600, textAlign: 'right' }}>Debit (MYR)</th>
                      <th style={{ padding: '0.75rem 1.5rem', fontWeight: 600, textAlign: 'right' }}>Credit (MYR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journal.lines && journal.lines.map((line, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem 1.5rem', color: 'var(--text-primary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {line.debit > 0 ? (
                              <ArrowUpRight size={14} style={{ color: 'var(--primary-color)' }} />
                            ) : (
                              <ArrowDownRight size={14} style={{ color: 'var(--status-success-text)', marginLeft: '1rem' }} />
                            )}
                            <span><span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{line.account_code}</span> - {line.account_name}</span>
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem 1.5rem', textAlign: 'right', color: 'var(--text-primary)' }}>
                          {line.debit > 0 ? formatAmount(line.debit) : ''}
                        </td>
                        <td style={{ padding: '0.75rem 1.5rem', textAlign: 'right', color: 'var(--text-primary)' }}>
                          {line.credit > 0 ? formatAmount(line.credit) : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: 'var(--bg-primary)' }}>
                      <td style={{ padding: '0.75rem 1.5rem', fontWeight: 700, textAlign: 'right', color: 'var(--text-secondary)' }}>TOTAL</td>
                      <td style={{ padding: '0.75rem 1.5rem', fontWeight: 700, textAlign: 'right', color: 'var(--text-primary)' }}>
                        {formatAmount(journal.total_debit)}
                      </td>
                      <td style={{ padding: '0.75rem 1.5rem', fontWeight: 700, textAlign: 'right', color: 'var(--text-primary)' }}>
                        {formatAmount(journal.total_credit)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* AI AUDIT REASONING */}
              {journal.audit_reasoning && (() => {
                let parsed = null;
                try {
                  if (typeof journal.audit_reasoning === 'string' && journal.audit_reasoning.trim().startsWith('{')) {
                    parsed = JSON.parse(journal.audit_reasoning);
                  }
                } catch (e) {
                  parsed = null;
                }
                const tp = parsed?.thought_process;
                const summaryText = tp?.decision_rationale || parsed?.summary || (typeof journal.audit_reasoning === 'string' ? journal.audit_reasoning : '');

                return (
                  <div style={{ padding: '0.75rem 1.5rem', backgroundColor: 'var(--bg-primary)', borderTop: '1px solid var(--border-color)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)', marginRight: '0.5rem' }}>AI Reasoning:</span>
                    <span style={{ color: 'var(--text-primary)' }}>{summaryText}</span>
                  </div>
                );
              })()}
            </div>
          ))
        )}
      </div>
      {/* Reasoning Process Modal */}
      <ReasoningProcessModal
        isOpen={isReasoningModalOpen}
        onClose={() => {
          setIsReasoningModalOpen(false);
          setReasoningJournal(null);
        }}
        journal={reasoningJournal}
      />
    </div>
  );
}
