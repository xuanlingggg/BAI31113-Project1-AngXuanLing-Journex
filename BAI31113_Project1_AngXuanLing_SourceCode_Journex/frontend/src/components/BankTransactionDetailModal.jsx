import React, { useState, useEffect } from 'react';
import { 
  X, 
  Landmark, 
  ArrowDownLeft, 
  ArrowUpRight, 
  ExternalLink 
} from 'lucide-react';
import { formatDisplayDate } from './DocumentDetailModal';

export default function BankTransactionDetailModal({ 
  isOpen, 
  onClose, 
  transaction, 
  onUpdate, 
  allDocuments = [],
  onViewDocument 
}) {
  if (!isOpen || !transaction) return null;

  const [detailData, setDetailData] = useState(transaction);
  const [loading, setLoading] = useState(false);

  // Fetch full details dynamically
  const fetchFullDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bank-ingestion/transactions/${transaction.bank_transaction_id || transaction.id}`);
      if (res.ok) {
        const data = await res.json();
        setDetailData(data);
      }
    } catch (err) {
      console.error('Error fetching bank transaction details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFullDetails();
  }, [transaction]);

  const moneyIn = parseFloat(detailData.money_in || 0);
  const moneyOut = parseFloat(detailData.money_out || 0);
  const isMoneyIn = moneyIn > 0;
  const pdfUrl = `/api/bank-ingestion/transactions/${detailData.bank_transaction_id}/pdf`;

  const formatMoney = (val) => {
    const num = parseFloat(val || 0);
    return `RM ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content-large" onClick={(e) => e.stopPropagation()}>
        
        {/* MODAL HEADER */}
        <div className="modal-header">
          {/* Left: Identifier, Title, and Subtitle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
            <span className="doc-id-pill" style={{ fontSize: '0.95rem', backgroundColor: '#E5F5F7', color: '#147D8C', border: '1px solid rgba(20, 125, 140, 0.35)' }}>
              {detailData.bank_transaction_id}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                  {detailData.description || 'Bank Transaction'}
                </h3>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0 0' }}>
                <span>Date: <strong>{formatDisplayDate(detailData.transaction_date)}</strong></span>
                <span style={{ margin: '0 0.5rem' }}>·</span>
                <span>Bank: <strong style={{ color: 'var(--badge-bank-text)' }}>{detailData.bank_name || 'ABC Bank'}</strong> ({detailData.account_id || detailData.account_number || '4320-6210-4821'})</span>
                <span style={{ margin: '0 0.5rem' }}>·</span>
                <span>Company: <strong style={{ color: 'var(--primary-color)' }}>NextTech Solutions Sdn Bhd</strong></span>
              </p>
            </div>
          </div>

          {/* Right: Prominent Amount Banner, Badges, and Close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
            {/* Prominent Amount */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              backgroundColor: isMoneyIn ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
              border: `1px solid ${isMoneyIn ? 'rgba(21, 128, 61, 0.25)' : 'rgba(185, 28, 28, 0.25)'}`,
              color: isMoneyIn ? 'var(--status-success-text)' : 'var(--status-error-text)',
              fontWeight: 700,
              fontSize: '0.95rem'
            }}>
              {isMoneyIn ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
              <span>{isMoneyIn ? `+${formatMoney(moneyIn)} received` : `-${formatMoney(moneyOut)} paid`}</span>
            </div>

            {/* Source Badge */}
            <span className="badge-record-bank">
              <Landmark size={12} style={{ color: 'var(--badge-bank-text)' }} />
              <span>ABC Bank Feed</span>
            </span>

            {/* Review Status Badge */}
            <span className={`status-badge ${detailData.review_status === 'APPROVED' ? 'APPROVED' : 'NEEDS_REVIEW'}`}>
              {detailData.review_status === 'APPROVED' ? 'APPROVED' : 'NEEDS_REVIEW'}
            </span>

            {/* Close Button */}
            <button 
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.25rem' }}
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="modal-body" style={{ padding: '1rem' }}>
          <div className="side-by-side-container">
            
            {/* LEFT PANEL: Bank Statement Receipt Preview */}
            <div className="preview-pane">
              <div className="preview-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--badge-bank-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Landmark size={14} style={{ color: 'var(--badge-bank-text)' }} />
                  </div>
                  <span>ABC BANK STATEMENT RECEIPT PREVIEW</span>
                </div>
                <a 
                  href={pdfUrl} 
                  target="_blank" 
                  rel="noreferrer" 
                  style={{ color: 'var(--primary-color)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 600 }}
                >
                  <span>Open Fullscreen</span>
                  <ExternalLink size={12} />
                </a>
              </div>

              <iframe 
                src={pdfUrl} 
                title={`Bank Statement Receipt - ${detailData.bank_transaction_id}`} 
                className="preview-frame" 
              />
            </div>

            {/* RIGHT PANEL: Structured Bank Transaction Details */}
            <div className="data-pane">
              
              {/* TRANSACTION OVERVIEW */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--badge-bank-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Landmark size={14} style={{ color: 'var(--badge-bank-text)' }} />
                  </div>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Transaction Overview
                  </span>
                </div>

                <div className="field-group">
                  {/* 1. Transaction ID */}
                  <div className="field-card">
                    <div className="field-label">Transaction ID</div>
                    <div className="field-value" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--badge-bank-text)' }}>
                      {detailData.bank_transaction_id}
                    </div>
                  </div>

                  {/* 2. Transaction Date */}
                  <div className="field-card">
                    <div className="field-label">Transaction Date</div>
                    <div className="field-value" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                      {formatDisplayDate(detailData.transaction_date)}
                    </div>
                  </div>

                  {/* 3. Description / Counterparty */}
                  <div className="field-card" style={{ gridColumn: 'span 2' }}>
                    <div className="field-label">Description / Counterparty</div>
                    <div className="field-value" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {detailData.description}
                    </div>
                  </div>

                  {/* 4. Bank Reference / Cheque No */}
                  <div className="field-card">
                    <div className="field-label">Bank Reference / Cheque No</div>
                    <div className="field-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {detailData.reference || '—'}
                    </div>
                  </div>

                  {/* 5. Money Flow Direction */}
                  <div className="field-card">
                    <div className="field-label">Money Flow Direction</div>
                    <div className="field-value" style={{ color: isMoneyIn ? 'var(--status-success-text)' : 'var(--status-error-text)', fontWeight: 700 }}>
                      {isMoneyIn ? `+${formatMoney(moneyIn)} (Money In)` : `-${formatMoney(moneyOut)} (Money Out)`}
                    </div>
                  </div>

                  {/* 6. Running Balance */}
                  <div className="field-card">
                    <div className="field-label">Running Balance</div>
                    <div className="field-value" style={{ color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      {formatMoney(detailData.running_balance)}
                    </div>
                  </div>

                  {/* 7. Currency */}
                  <div className="field-card">
                    <div className="field-label">Currency</div>
                    <div className="field-value" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {detailData.currency || 'MYR'} (Malaysian Ringgit)
                    </div>
                  </div>

                  {/* 8. Bank Name & Account */}
                  <div className="field-card" style={{ gridColumn: 'span 2' }}>
                    <div className="field-label">Bank Name & Account</div>
                    <div className="field-value" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {detailData.bank_name || 'ABC Bank'} • {detailData.account_id || detailData.account_number || '4320-6210-4821'}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div style={{ 
          padding: '0.85rem 1.5rem', 
          borderTop: '1px solid var(--border-color)', 
          display: 'flex', 
          justifyContent: 'flex-end',
          alignItems: 'center'
        }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Close Detail View
          </button>
        </div>

      </div>
    </div>
  );
}
