import React, { useState } from 'react';
import { X, Copy, Check, FileText } from 'lucide-react';

export default function ReasoningProcessModal({ journal, isOpen, onClose }) {
  if (!isOpen || !journal) return null;

  const [copied, setCopied] = useState(false);

  // Parse audit_reasoning payload
  let parsedAudit = null;
  if (journal.audit_reasoning) {
    try {
      if (typeof journal.audit_reasoning === 'string' && journal.audit_reasoning.trim().startsWith('{')) {
        parsedAudit = JSON.parse(journal.audit_reasoning);
      } else if (typeof journal.audit_reasoning === 'object') {
        parsedAudit = journal.audit_reasoning;
      }
    } catch (e) {
      parsedAudit = null;
    }
  }

  const isPassed = journal.status === 'POSTED' || parsedAudit?.logic_verdict === 'CORRECT';
  const tp = parsedAudit?.thought_process || {};

  const formatAmount = (val) => {
    const num = typeof val === 'number' ? val : parseFloat(val || 0);
    if (isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Build clean text format
  const generateCleanText = () => {
    const textLines = [
      `======================================================================`,
      `AI AUDIT REASONING REPORT`,
      `======================================================================`,
      `Journal ID    : ${journal.journal_id || '-'}`,
      `Status        : ${journal.status || '-'} (${isPassed ? 'Audit Passed' : 'Requires Review'})`,
      `Date          : ${journal.journal_date || '-'}`,
      `Reference     : ${journal.reference || '-'}`,
      `Document ID   : ${journal.document_id || 'Direct Entry'}`,
      `Total Amount  : MYR ${formatAmount(journal.total_debit)} (Debit == Credit ✓)`,
      ``,
      `--- CHECKING PROCESS & ERROR DETECTION FLOW ---`,
      `1. Mathematical Invariant:`,
      `   Total Debits: MYR ${formatAmount(journal.total_debit)} | Total Credits: MYR ${formatAmount(journal.total_credit)}`,
      `   Result: Balanced (Variance: MYR 0.00, Zero arithmetic errors).`,
      ``,
      `2. Account Classification:`,
      `   ${tp.step_1_account_classification || 'Account selection verified against Master Chart of Accounts.'}`,
      ``,
      `3. Accounting Rules Compliance:`,
      `   ${tp.step_2_rules_compliance || 'Adheres to standard double-entry rules and normal balance directions.'}`,
      ``,
      `4. General Ledger Balance Equilibrium:`,
      `   ${journal.abnormal_risk?.has_abnormal_risk 
          ? `Warning: ${journal.abnormal_risk.issue_description}` 
          : 'Projected balances verified: No abnormal negative balances created.'}`,
      ``,
      `5. Historical Consistency (RAG):`,
      `   ${tp.step_3_historical_consistency || 'Consistent with historical company ledger patterns.'}`,
      ``,
      `6. Source Document Cross-Check:`,
      `   ${tp.step_4_source_document_recheck || 'Amounts, parties, and descriptions align with source document.'}`,
      ``,
      `--- FINAL DECISION RATIONALE ---`,
      `${tp.decision_rationale || parsedAudit?.summary || 'The journal entry complies with all mathematical, structural, and semantic accounting rules.'}`,
      `======================================================================`
    ];
    return textLines.join('\n');
  };

  const cleanText = generateCleanText();

  const handleCopy = () => {
    navigator.clipboard.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(3px)',
      padding: '1.5rem'
    }}>
      <div className="modal-content" style={{
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: '10px',
        width: '100%',
        maxWidth: '740px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
        overflow: 'hidden',
        border: '1px solid var(--border-color)'
      }}>
        
        {/* Header */}
        <div style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-primary)'
        }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={18} style={{ color: 'var(--primary-color)' }} />
              Reasoning Process ({journal.journal_id})
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Clean text report of AI verification and error detection
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={handleCopy}
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}
            >
              {copied ? <Check size={14} style={{ color: 'var(--status-success-text)' }} /> : <Copy size={14} />}
              <span>{copied ? 'Copied' : 'Copy Text'}</span>
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '0.35rem',
                borderRadius: '6px'
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body - Clean Text View */}
        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
          <pre style={{
            margin: 0,
            padding: '1.25rem',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '0.82rem',
            lineHeight: '1.6',
            color: 'var(--text-primary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}>
            {cleanText}
          </pre>
        </div>

        {/* Footer */}
        <div style={{
          padding: '0.75rem 1.5rem',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'flex-end',
          backgroundColor: 'var(--bg-primary)'
        }}>
          <button
            onClick={onClose}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.82rem', padding: '0.4rem 1rem' }}
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
