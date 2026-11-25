import React from 'react';
import { X, BookOpen, FileText, ArrowRight, CheckCircle2, AlertTriangle, Layers, ExternalLink } from 'lucide-react';
import { formatDisplayDate } from './DocumentDetailModal';

export default function TransactionDetailModal({ 
  transaction, 
  isOpen, 
  onClose, 
  onViewDocument,
  onSelectBook,
  onSelectAccount
}) {
  if (!isOpen || !transaction) return null;

  const analysis = transaction.accounting_analysis || {};
  const selectedAccounts = analysis.selected_accounts || [];
  const isBankStmt = transaction.document_type === 'Bank Statement' || transaction.document_type === 'Bank Transaction Record' || (transaction.source_document && transaction.source_document.toLowerCase().includes('bank'));

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '800px', width: '90%' }}>
        
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span className="doc-id-pill" style={{ 
              fontSize: '0.9rem', 
              backgroundColor: isBankStmt ? '#E5F5F7' : '#EFF6FF', 
              color: isBankStmt ? '#147D8C' : '#2563EB', 
              border: isBankStmt ? '1px solid #BCE3E8' : '1px solid #BFDBFE' 
            }}>
              {transaction.transaction_id}
            </span>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Accounting Transaction Detail</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Source Document: <strong style={{ color: 'var(--text-primary)' }}>{transaction.source_document}</strong> ({transaction.document_id})
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {(() => {
              const isBankStmt = transaction.document_type === 'Bank Statement' || transaction.document_type === 'Bank Transaction Record';
              const isReview = transaction.needs_review && !isBankStmt;
              const statusText = isBankStmt ? 'Pending Reconciliation' : (isReview ? 'Needs Review' : transaction.status);
              const statusBadge = isBankStmt ? 'RECONCILIATION_PENDING' : (isReview ? 'ERROR' : (transaction.status === 'Completed' ? 'EXTRACTED' : 'PROCESSING'));
              return (
                <span className={`status-badge ${statusBadge}`}>
                  {statusText}
                </span>
              );
            })()}
            <button 
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Section 1: Transaction Metadata */}
          <div style={{ 
            backgroundColor: '#F8FAFC', 
            border: '1px solid var(--border-color)', 
            borderRadius: '8px', 
            padding: '1rem' 
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.75rem', letterSpacing: '0.05em' }}>
              Transaction Summary
            </div>
            
            <div className="field-group">
              <div className="field-card">
                <div className="field-label">Transaction ID</div>
                <div className="field-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-color)', fontWeight: 600 }}>
                  {transaction.transaction_id}
                </div>
              </div>

              <div className="field-card">
                <div className="field-label">Source Document ID</div>
                <div className="field-value" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{transaction.document_id}</span>
                  {onViewDocument && (
                    <button
                      onClick={() => onViewDocument(transaction.document_id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary-color)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.2rem',
                        fontSize: '0.75rem',
                        padding: 0,
                        fontWeight: 500
                      }}
                    >
                      <span>View Source</span>
                      <ExternalLink size={12} />
                    </button>
                  )}
                </div>
              </div>

              <div className="field-card">
                <div className="field-label">Document Type</div>
                <div className="field-value" style={{ fontWeight: 600 }}>
                  {transaction.document_type}
                </div>
              </div>

              <div className="field-card">
                <div className="field-label">Transaction Date</div>
                <div className="field-value">
                  {formatDisplayDate(transaction.transaction_date)}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Accounting Agent Result */}
          <div style={{ 
            backgroundColor: '#FFFFFF', 
            border: '1px solid var(--border-color)', 
            borderRadius: '8px', 
            padding: '1rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary-color)', marginBottom: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <BookOpen size={16} />
              <span>Accounting Agent Analysis</span>
            </div>

            <div className="field-group" style={{ marginBottom: '1rem' }}>
              <div className="field-card" style={{ backgroundColor: '#F8FAFC' }}>
                <div className="field-label" style={{ color: 'var(--text-secondary)' }}>1. Accounting Event</div>
                <div className="field-value" style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.95rem' }}>
                  {transaction.accounting_event}
                </div>
              </div>

              <div className="field-card" style={{ backgroundColor: '#F8FAFC' }}>
                <div className="field-label" style={{ color: 'var(--text-secondary)' }}>2. Book of Prime Entry</div>
                <div className="field-value" style={{ color: 'var(--status-success-text)', fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{transaction.book_of_prime_entry}</span>
                  {onSelectBook && (
                    <button
                      onClick={() => {
                        onClose();
                        onSelectBook(transaction.book_of_prime_entry);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#38bdf8',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.2rem',
                        padding: 0
                      }}
                    >
                      <span>View Book</span>
                      <ArrowRight size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {transaction.needs_review && (
              <div style={{ 
                backgroundColor: 'var(--status-warning-bg)', 
                border: '1px solid #FCD34D', 
                color: 'var(--status-warning-text)', 
                borderRadius: '6px', 
                padding: '0.75rem', 
                fontSize: '0.85rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <AlertTriangle size={18} />
                <div>
                  <strong>Attention Required:</strong> {transaction.review_reason || 'Confidence score below threshold or unverified account selection.'}
                </div>
              </div>
            )}

            {/* Section 3: Selected Accounts */}
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                3. Selected Accounts from Company Chart of Accounts ({selectedAccounts.length})
              </div>

              {selectedAccounts.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No accounts selected.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.65rem' }}>
                  {selectedAccounts.map((acc, idx) => (
                    <div key={idx} style={{ 
                      backgroundColor: '#F8FAFC', 
                      padding: '0.75rem', 
                      borderRadius: '6px', 
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--primary-color)' }}>
                            {acc.account_code}
                          </span>
                          <span className="status-badge EXTRACTED" style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}>
                            {acc.account_type}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.35rem' }}>
                          {acc.account_name}
                        </div>
                      </div>
                      
                      {onSelectAccount && (
                        <button
                          onClick={() => {
                            onClose();
                            onSelectAccount(acc);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#38bdf8',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                            marginTop: '0.5rem',
                            padding: 0,
                            alignSelf: 'flex-start'
                          }}
                        >
                          <span>View Account</span>
                          <ArrowRight size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer Note Banner */}
          <div style={{ 
            backgroundColor: '#EFF6FF', 
            border: '1px solid #BFDBFE', 
            borderRadius: '6px', 
            padding: '0.75rem', 
            fontSize: '0.75rem', 
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <CheckCircle2 size={16} style={{ color: 'var(--primary-color)', flexShrink: 0 }} />
            <span>
              <strong>Automatic Processing Complete:</strong> Transaction generated automatically upon document verification. Journal entry creation (Debit/Credit determination) will be performed in subsequent General Ledger stages.
            </span>
          </div>

        </div>

        {/* Footer actions */}
        <div style={{ 
          padding: '0.85rem 1.25rem', 
          borderTop: '1px solid var(--border-color)', 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          {onViewDocument ? (
            <button 
              className="btn btn-secondary" 
              onClick={() => onViewDocument(transaction.document_id)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <FileText size={15} />
              <span>View Source Document</span>
            </button>
          ) : <div />}

          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
