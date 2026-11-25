import React from 'react';
import { Eye, Trash2, FileCode, CheckCircle, AlertCircle, Clock } from 'lucide-react';

export default function DocumentList({ documents, categoryTab, onSelectDocument, onDeleteDocument }) {
  if (!documents || documents.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
        <FileCode size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>No Documents Uploaded Yet</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>
          Upload your invoices, receipts, or bank statements to begin the document processing and extraction pipeline.
        </p>
      </div>
    );
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'EXTRACTED':
      case 'COMPLETED':
        return <CheckCircle size={14} />;
      case 'ERROR':
        return <AlertCircle size={14} />;
      case 'PROCESSING':
        return <Clock size={14} className="animate-spin" />;
      default:
        return <Clock size={14} />;
    }
  };

  const isBankingView = categoryTab === 'BANKING';

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Document ID</th>
              <th>Document Type</th>
              <th>File Name</th>
              <th>{isBankingView ? 'Bank / Account' : 'Vendor / Party'}</th>
              <th>{isBankingView ? 'Amount' : 'Grand Total'}</th>
              <th>Status</th>
              <th>Uploaded Date</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => {
              const data = doc.extracted_data || {};
              const summary = doc.display_summary || data.display_summary || {};
              const roles = data.business_roles || doc.business_roles || {};
              
              const INVALID_PARTIES = ['N/A', 'NONE', 'UNKNOWN', 'NULL', 'LUMPUR', 'KUALA LUMPUR', 'MALAYSIA', 'SINGAPORE', 'BANK', 'PAYMENT METHOD', 'DATE', '/ TO', 'TO', 'RECEIVED BY / TO'];
              const isInvalid = (val) => !val || typeof val !== 'string' || INVALID_PARTIES.includes(val.trim().toUpperCase()) || val.trim() === '-' || val.trim().startsWith('/') || val.trim().endsWith(':');

              let rawParty = summary.party;
              if (isInvalid(rawParty)) {
                if (doc.document_type === 'Official Receipt') {
                  rawParty = roles.customer || data.customer_name || data.received_from || data.buyer_name;
                } else if (doc.document_type === 'Payment Voucher') {
                  rawParty = roles.vendor || data.vendor_name || data.paid_to;
                } else if (doc.document_type === 'Stock Take') {
                  rawParty = 'Internal Stock Adjustment';
                } else if (doc.document_type === 'Delivery Order') {
                  rawParty = roles.customer || data.customer_name || data.buyer_name;
                } else if (doc.document_type === 'Sales Order' || doc.document_type === 'SO') {
                  rawParty = roles.customer || data.customer_name || data.buyer_name;
                } else if (doc.document_type === 'Purchase Order' || doc.document_type === 'PO' || doc.document_type === 'Purchase Return' || doc.document_type === 'PR') {
                  rawParty = roles.vendor || roles.supplier || data.vendor_name || doc.vendor_name;
                } else if (doc.document_type === 'Credit Note' || doc.document_type === 'Supplier Credit Note') {
                  rawParty = roles.supplier || roles.vendor || (data.vendor_name && data.vendor_name !== data.active_company_name ? data.vendor_name : null) || roles.customer || data.buyer_name;
                } else if (doc.document_type === 'Sales Invoice') {
                  rawParty = roles.customer || data.buyer_name;
                } else if (doc.document_type === 'Purchase Invoice' || doc.document_type === 'Supplier Invoice') {
                  rawParty = roles.supplier || roles.vendor || data.vendor_name || doc.vendor_name;
                } else {
                  rawParty = doc.vendor_name || data.vendor_name || data.buyer_name || data.account_name || (data.from_account_name ? `${data.from_account_name} -> ${data.beneficiary_name}` : null);
                }
              }

              const isPartyInvalid = isInvalid(rawParty);
              const displayParty = isPartyInvalid ? '-' : rawParty.trim();

              const amtVal = summary.amount !== undefined && summary.amount !== null && summary.amount !== 0
                ? summary.amount
                : (doc.grand_total || data.grand_total || data.transaction_amount || data.closing_balance || 0);

              const currCode = doc.currency || data.currency || 'MYR';
              const currPrefix = currCode === 'MYR' ? 'RM ' : `${currCode} `;
              const isNegative = amtVal < 0;
              const absVal = Math.abs(amtVal);
              let formattedAmt = '-';
              if (doc.document_type === 'Stock Take') {
                formattedAmt = isNegative
                  ? `-${currPrefix}${absVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `${currPrefix}${absVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              } else if (doc.document_type === 'Delivery Order') {
                formattedAmt = `${amtVal} units`;
              } else if (amtVal > 0 || isBankingView || doc.document_type === 'Bank Statement' || doc.document_type === 'Bank Transfer Receipt') {
                formattedAmt = `${currPrefix}${amtVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              } else if (amtVal !== 0) {
                formattedAmt = isNegative
                  ? `-${currPrefix}${absVal.toFixed(2)}`
                  : `${currPrefix}${amtVal.toFixed(2)}`;
              }

              return (
                <tr key={doc.document_id}>
                  <td>
                    <span className="doc-id-pill doc-pill-doc" style={{ backgroundColor: '#FAF5FF', color: '#7E22CE', border: '1px solid #E9D5FF' }}>{doc.document_id}</span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 500 }}>{doc.document_type || 'Unknown'}</span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {doc.original_filename}
                  </td>
                  <td>{displayParty}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    <div>{formattedAmt}</div>
                    {currCode !== 'MYR' && (doc.converted_amount_myr || data.converted_amount_myr) && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--status-success-text)', fontWeight: 500, marginTop: '2px' }}>
                        ≈ RM {(doc.converted_amount_myr || data.converted_amount_myr).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`status-badge ${doc.status}`}>
                      {getStatusIcon(doc.status)}
                      <span>{doc.status}</span>
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {doc.created_at || 'Just now'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => onSelectDocument(doc)}
                        title="View Original & Extracted Data"
                      >
                        <Eye size={14} />
                        <span>View</span>
                      </button>
                      <button 
                        className="btn btn-secondary btn-sm"
                        style={{ color: '#f43f5e' }}
                        onClick={() => onDeleteDocument(doc.document_id)}
                        title="Delete Document"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
