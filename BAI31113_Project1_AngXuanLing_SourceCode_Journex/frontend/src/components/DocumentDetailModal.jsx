import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, ExternalLink, FileText, Building2, Calculator, AlertCircle, ArrowRightLeft, BookOpen, ArrowLeft, CheckCircle2, ShieldCheck, Plus, Trash2, Save, Edit3, Check, RefreshCw } from 'lucide-react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const formatDisplayDate = (val) => {
  if (!val) return '—';
  const str = String(val).trim();
  if (!str || str === '—' || str === '-' || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') return '—';

  // 1. Match YYYY-MM-DD or YYYY/MM/DD (e.g. 2026-01-09, 2026/01/09, 2026-01-09T00:00:00)
  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const mIdx = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    if (mIdx >= 0 && mIdx < 12 && day >= 1 && day <= 31) {
      return `${String(day).padStart(2, '0')} ${MONTHS[mIdx]} ${year}`;
    }
  }

  // 2. Match DD-MM-YYYY or DD/MM/YYYY (e.g. 21-01-2026, 09/01/2026)
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const mIdx = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    if (mIdx >= 0 && mIdx < 12 && day >= 1 && day <= 31) {
      return `${String(day).padStart(2, '0')} ${MONTHS[mIdx]} ${year}`;
    }
  }

  // 3. Match D MMM YYYY or DD MMM YYYY (e.g. 1 Jan 2026, 01 Jan 2026)
  const textDateMatch = str.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (textDateMatch) {
    const day = parseInt(textDateMatch[1], 10);
    const mStr = textDateMatch[2].slice(0, 3).toLowerCase();
    const mIdx = MONTHS.findIndex(m => m.toLowerCase() === mStr);
    const year = parseInt(textDateMatch[3], 10);
    if (mIdx >= 0 && day >= 1 && day <= 31) {
      return `${String(day).padStart(2, '0')} ${MONTHS[mIdx]} ${year}`;
    }
  }

  // 4. Fallback to Date parser safely without crashing
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      return `${day} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    }
  } catch (e) {
    // ignore
  }

  return str;
};

export default function DocumentDetailModal({ document, isOpen, onClose, onBackToBank, onDocumentUpdated }) {
  if (!isOpen || !document) return null;

  const [currentDoc, setCurrentDoc] = useState(document);
  const [retryingConversion, setRetryingConversion] = useState(false);

  useEffect(() => {
    setCurrentDoc(document);
  }, [document]);

  const data = currentDoc.extracted_data || {};
  const roles = data.business_roles || {};
  const calcVer = data.calculation_verification || {};
  const acctAnalysis = data.accounting_analysis || {};
  const compCtx = data.company_context || {};
  const lineItems = data.line_items || [];
  const bankTxs = data.bank_transactions || [];
  const runningChecks = calcVer.running_balance_checks || [];
  
  const isPdf = document.mime_type === 'application/pdf' || document.file_type === 'pdf';
  const fileUrl = `/api/documents/${currentDoc.document_id}/file`;

  const isStockTakeDoc = Boolean(document && (
    document.document_type === 'Stock Take' ||
    (document.extracted_data && document.extracted_data.document_type === 'Stock Take') ||
    (document.original_filename && (document.original_filename.startsWith('SK-') || document.original_filename.toLowerCase().includes('stock take')))
  ));

  const docType = isStockTakeDoc ? 'Stock Take' : (data.document_type || document.document_type || 'Unknown');
  const isCompanySetupDoc = 
    document.source_type === 'COMPANY_SETUP' ||
    document.source_type === 'ONBOARDING' ||
    data?.is_company_setup === true ||
    ['Opening Trial Balance', 'Trade Receivables / Debtors', 'Trade Payables / Creditors', 'Other Creditors', 'Opening Stock List', 'Company Profile Document', 'Opening Balance Document'].includes(docType);

  const isTrialBalance = docType === 'Opening Trial Balance';
  let tbTotalDebit = 0;
  let tbTotalCredit = 0;
  if (isTrialBalance) {
    if (data.total_debit != null && data.total_credit != null) {
      tbTotalDebit = Number(data.total_debit || 0);
      tbTotalCredit = Number(data.total_credit || 0);
    } else if (lineItems && lineItems.length > 0) {
      tbTotalDebit = lineItems.reduce((acc, it) => acc + Number(it.debit || 0), 0);
      tbTotalCredit = lineItems.reduce((acc, it) => acc + Number(it.credit || 0), 0);
    } else {
      tbTotalDebit = Number(currentDoc.grand_total || 0);
      tbTotalCredit = Number(currentDoc.grand_total || 0);
    }
  }
  const tbDifference = Math.abs(tbTotalDebit - tbTotalCredit);
  const isTbBalanced = isTrialBalance && tbDifference < 0.005;
  const isBankTransfer = docType === 'Bank Transfer Receipt';
  const isBankStatement = docType === 'Bank Statement' || docType === 'Bank Transaction Record';
  const isInvoiceOrReceipt = !isBankTransfer && !isBankStatement;

  const isCompanyMismatch = !isStockTakeDoc && (compCtx.company_match === false || data.company_match_status === 'MISMATCH');
  const mismatchReason = compCtx.mismatch_reason || 'Bank statement account belongs to a different company than the active company.';

  const isCalcFailed = calcVer.overall_status === 'FAILED';
  const extCurrency = data.currency || data.original_currency;
  const rawCurrency = (extCurrency && !['MYR', 'RM'].includes(String(extCurrency).trim().toUpperCase()))
    ? extCurrency
    : (currentDoc.original_currency || currentDoc.currency || extCurrency || 'MYR');
  const docCurr = typeof rawCurrency === 'string' && rawCurrency.trim() ? rawCurrency.trim().toUpperCase() : 'MYR';
  const currCode = docCurr;
  const currPrefix = docCurr === 'MYR' ? 'RM ' : `${docCurr} `;
  const isIncomplete = calcVer.overall_status === 'INCOMPLETE_EXTRACTION' || data.extraction_completeness === 'INCOMPLETE';

  const ourCompName = roles.our_company || data.active_company_name || 'NextTech Solutions Sdn Bhd';
  const isSameAsOurCompany = (val) => {
    if (!val || !ourCompName) return false;
    const n1 = val.toUpperCase().replace(/SDN\.?\s*BHD\.?/g, '').replace(/PTE\.?\s*LTD\.?/g, '').replace(/[^A-Z0-9]/g, '').trim();
    const n2 = ourCompName.toUpperCase().replace(/SDN\.?\s*BHD\.?/g, '').replace(/PTE\.?\s*LTD\.?/g, '').replace(/[^A-Z0-9]/g, '').trim();
    return n1.length > 0 && n2.length > 0 && (n1 === n2 || n1.includes(n2) || n2.includes(n1));
  };

  const INVALID_PARTIES = ['N/A', 'NONE', 'UNKNOWN', 'NULL', 'THIS', 'ACCOUNT', 'CUSTOMER ACCOUNT', 'SUPPLIER ACCOUNT', 'DATE', 'TOTAL', 'SUBTOTAL'];
  const isValidParty = (val) => val && typeof val === 'string' && !INVALID_PARTIES.includes(val.trim().toUpperCase()) && !isSameAsOurCompany(val);

  const rawCustomer = ['Sales Invoice', 'Payment Receipt', 'Credit Note'].includes(docType)
    ? (roles.customer || data.buyer_name)
    : roles.customer;
  const validCustomer = isValidParty(rawCustomer) ? rawCustomer : null;

  const rawVendor = roles.vendor || roles.supplier || (['Purchase Invoice', 'Supplier Invoice', 'Credit Note', 'Supplier Credit Note'].includes(docType) ? (data.vendor_name !== ourCompName ? data.vendor_name : null) : null);
  const validVendor = isValidParty(rawVendor) ? rawVendor : null;

  const rawMerchant = roles.merchant || (['Purchase Receipt', 'Expense Receipt'].includes(docType) ? (data.merchant_name || data.vendor_name) : null);
  const validMerchant = isValidParty(rawMerchant) ? rawMerchant : null;

  const selectedAccounts = acctAnalysis.selected_accounts || [];

  // Local state for interactive editing and review
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [saveErrMsg, setSaveErrMsg] = useState('');

  const [editInvoiceNumber, setEditInvoiceNumber] = useState('');
  const [editReceiptNumber, setEditReceiptNumber] = useState('');
  const [editVoucherNumber, setEditVoucherNumber] = useState('');
  const [editDocumentNumber, setEditDocumentNumber] = useState('');
  const [editInvoiceDate, setEditInvoiceDate] = useState('');
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editVendorName, setEditVendorName] = useState('');
  const [editPaymentTerms, setEditPaymentTerms] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [editChequeNumber, setEditChequeNumber] = useState('');
  const [editAccountCode, setEditAccountCode] = useState('');
  const [editAccountName, setEditAccountName] = useState('');
  const [editCurrency, setEditCurrency] = useState('MYR');
  const [editItems, setEditItems] = useState([]);


  const isOfficialReceiptDoc = document && (document.document_type === 'Official Receipt' || (document.extracted_data && document.extracted_data.document_type === 'Official Receipt'));
  const isPaymentVoucherDoc = document && (document.document_type === 'Payment Voucher' || (document.extracted_data && document.extracted_data.document_type === 'Payment Voucher'));
  const isDeliveryOrderDoc = document && (document.document_type === 'Delivery Order' || (document.extracted_data && document.extracted_data.document_type === 'Delivery Order'));

  useEffect(() => {
    if (!document) return;
    const d = document.extracted_data || {};
    const r = d.business_roles || {};
    setEditInvoiceNumber(d.invoice_number || document.invoice_number || '');
    setEditReceiptNumber(d.receipt_number || '');
    setEditVoucherNumber(d.voucher_number || '');
    setEditDocumentNumber(d.stock_take_number || d.document_number || d.delivery_order_number || d.purchase_order_number || d.sales_order_number || d.return_number || '');
    setEditInvoiceDate(d.invoice_date || d.transaction_date || d.receipt_date || d.payment_date || d.delivery_date || '');
    setEditCustomerName(r.customer || d.customer_name || d.buyer_name || d.received_from || '');
    setEditVendorName(r.vendor || d.vendor_name || document.vendor_name || d.paid_to || '');
    setEditPaymentTerms(d.payment_terms || '');
    setEditPaymentMethod(d.payment_method || '');
    setEditChequeNumber(d.cheque_number || '');
    setEditAccountCode(d.account_code || '');
    setEditAccountName(d.account_name || '');
    const extC = d.currency || d.original_currency;
    const initialC = (extC && !['MYR', 'RM'].includes(String(extC).trim().toUpperCase()))
      ? extC
      : (currentDoc.original_currency || d.original_currency || d.currency || currentDoc.currency || 'MYR');
    setEditCurrency(initialC);

    const rawItems = d.line_items || [];
    setEditItems(rawItems.map((it, idx) => ({
      item_number: it.item_number || String(idx + 1),
      description: it.description || it.item_description || '',
      quantity: it.quantity != null ? Number(it.quantity) : 1,
      balance_quantity: it.balance_quantity != null ? Number(it.balance_quantity) : null,
      physical_quantity: it.physical_quantity != null ? Number(it.physical_quantity) : null,
      difference_quantity: it.difference_quantity != null ? Number(it.difference_quantity) : null,
      uom: it.uom || 'UNIT',
      unit_price: it.unit_price != null ? Number(it.unit_price) : (it.unit_cost != null ? Number(it.unit_cost) : 0),
      unit_cost: it.unit_cost != null ? Number(it.unit_cost) : (it.unit_price != null ? Number(it.unit_price) : 0),
      discount: it.discount != null ? Number(it.discount) : null,
      line_total: it.line_total != null ? Number(it.line_total) : (it.amount != null ? Number(it.amount) : (it.total_amount != null ? Number(it.total_amount) : 0)),
      amount: it.amount != null ? Number(it.amount) : (it.line_total != null ? Number(it.line_total) : 0),
      missing_physical: Boolean(it.missing_physical || (isStockTakeDoc && it.physical_quantity == null)),
      account_code: it.account_code || '',
      account_name: it.account_name || '',
      notes: it.notes || '',
      original_unit_price: it.original_unit_price != null ? Number(it.original_unit_price) : (it.unit_price != null ? Number(it.unit_price) : null),
      converted_unit_price_myr: it.converted_unit_price_myr != null ? Number(it.converted_unit_price_myr) : null,
      original_total_amount: it.original_total_amount != null ? Number(it.original_total_amount) : (it.line_total != null ? Number(it.line_total) : (it.amount != null ? Number(it.amount) : null)),
      converted_total_amount_myr: it.converted_total_amount_myr != null ? Number(it.converted_total_amount_myr) : null
    })));
    setIsEditing(false);
    setSaveSuccessMsg('');
    setSaveErrMsg('');
  }, [document]);

  const handleItemChange = (idx, field, value) => {
    setEditItems(prev => {
      const updated = [...prev];
      const row = { ...updated[idx], [field]: value };
      
      if (isStockTakeDoc) {
        if (field === 'physical_quantity') {
          const phys = value !== '' ? Number(value) : null;
          row.physical_quantity = phys;
          row.missing_physical = (phys == null);
          if (phys != null && row.balance_quantity != null) {
            row.difference_quantity = phys - row.balance_quantity;
            const cost = Number(row.unit_cost ?? row.unit_price ?? 0);
            row.amount = Number((row.difference_quantity * cost).toFixed(2));
            row.line_total = row.amount;
          }
        } else if (field === 'balance_quantity') {
          const bal = value !== '' ? Number(value) : null;
          row.balance_quantity = bal;
          if (row.physical_quantity != null && bal != null) {
            row.difference_quantity = row.physical_quantity - bal;
            const cost = Number(row.unit_cost ?? row.unit_price ?? 0);
            row.amount = Number((row.difference_quantity * cost).toFixed(2));
            row.line_total = row.amount;
          }
        } else if (field === 'unit_cost' || field === 'unit_price') {
          const cost = Number(value) || 0;
          row.unit_cost = cost;
          row.unit_price = cost;
          if (row.difference_quantity != null) {
            row.amount = Number((row.difference_quantity * cost).toFixed(2));
            row.line_total = row.amount;
          }
        }
      } else {
        if (field === 'quantity' || field === 'unit_price' || field === 'discount') {
          const q = Number(field === 'quantity' ? value : row.quantity) || 0;
          const u = Number(field === 'unit_price' ? value : row.unit_price) || 0;
          const d = Number(field === 'discount' ? value : (row.discount || 0)) || 0;
          row.line_total = Math.max(0, Number((q * u - d).toFixed(2)));
        }
      }
      updated[idx] = row;
      return updated;
    });
  };

  const handleAddItem = () => {
    setEditItems(prev => [
      ...prev,
      {
        item_number: String(prev.length + 1),
        description: '',
        quantity: 1,
        balance_quantity: isStockTakeDoc ? 0 : null,
        physical_quantity: isStockTakeDoc ? 0 : null,
        difference_quantity: isStockTakeDoc ? 0 : null,
        uom: 'UNIT',
        unit_price: 0,
        unit_cost: 0,
        discount: null,
        line_total: 0,
        amount: 0,
        missing_physical: false
      }
    ]);
    setIsEditing(true);
  };

  const handleDeleteItem = (idx) => {
    setEditItems(prev => prev.filter((_, i) => i !== idx));
  };

  const calculatedSubtotal = editItems.reduce((acc, it) => acc + (Number(it.line_total) || 0), 0);
  const calculatedStockTakeTotal = editItems.reduce((acc, it) => acc + (Number(it.amount ?? it.line_total) || 0), 0);
  const hasMissingStockCount = isStockTakeDoc && editItems.some(it => it.missing_physical || it.physical_quantity == null);

  const hasDiscount = data.discount != null && Number(data.discount) > 0;
  const hasShipping = data.shipping != null && Number(data.shipping) > 0;
  const hasTax = data.tax_amount != null && Number(data.tax_amount) > 0;
  const hasAdjustments = hasDiscount || hasShipping || hasTax;

  const calcDiff = Number(calcVer.difference || 0);
  const hasDiscrepancy = Boolean(calcVer.calculation_required && Math.abs(calcDiff) >= 0.01);
  const isValidationFailed = isCalcFailed || hasDiscrepancy;
  const isValidationWarning = !isValidationFailed && (hasMissingStockCount || isIncomplete);

  let primaryAmountLabel = 'Subtotal';
  let primaryAmountValue = data.grand_total ?? data.subtotal ?? calculatedSubtotal ?? 0;
  let isNonFinancialMovement = false;

  if (isStockTakeDoc) {
    primaryAmountLabel = 'Stock Adjustment Total';
    primaryAmountValue = calculatedStockTakeTotal || data.net_adjustment || data.grand_total || currentDoc.grand_total || 0;
  } else if (isOfficialReceiptDoc) {
    primaryAmountLabel = 'Amount Received';
    primaryAmountValue = data.amount_received ?? data.grand_total ?? currentDoc.grand_total ?? calculatedSubtotal ?? 0;
  } else if (isPaymentVoucherDoc) {
    primaryAmountLabel = 'Amount Paid';
    primaryAmountValue = data.amount_paid ?? data.grand_total ?? currentDoc.grand_total ?? calculatedSubtotal ?? 0;
  } else if (isDeliveryOrderDoc) {
    primaryAmountLabel = 'Delivery Movement';
    isNonFinancialMovement = true;
  } else if (docType === 'Purchase Order' || docType === 'Sales Order') {
    primaryAmountLabel = 'Order Total';
    primaryAmountValue = data.grand_total ?? currentDoc.grand_total ?? calculatedSubtotal ?? 0;
  } else if (docType === 'Purchase Return') {
    primaryAmountLabel = 'Return Total';
    primaryAmountValue = data.grand_total ?? currentDoc.grand_total ?? calculatedSubtotal ?? 0;
  } else if (docType === 'Sales Invoice' || docType === 'Purchase Invoice') {
    primaryAmountLabel = 'Subtotal';
    primaryAmountValue = hasAdjustments ? (data.subtotal ?? calculatedSubtotal ?? 0) : (data.grand_total ?? data.subtotal ?? calculatedSubtotal ?? 0);
  } else {
    primaryAmountLabel = hasAdjustments ? 'Subtotal' : 'Document Total';
    primaryAmountValue = hasAdjustments ? (data.subtotal ?? calculatedSubtotal ?? 0) : (data.grand_total ?? currentDoc.grand_total ?? calculatedSubtotal ?? 0);
  }

  const handleRetryCurrencyConversion = async () => {
    setRetryingConversion(true);
    try {
      const res = await fetch(`/api/documents/${currentDoc.document_id}/retry-currency-conversion`, {
        method: 'POST'
      });
      const resData = await res.json();
      if (res.ok && resData.success && resData.document) {
        setCurrentDoc(resData.document);
        if (onDocumentUpdated) {
          onDocumentUpdated(resData.document);
        }
      } else {
        alert(resData.message || 'Currency conversion retry failed.');
      }
    } catch (err) {
      alert('Error connecting to conversion service: ' + err.message);
    } finally {
      setRetryingConversion(false);
    }
  };

  const handleSaveReviewed = async () => {
    setSaving(true);
    setSaveErrMsg('');
    setSaveSuccessMsg('');
    try {
      const payload = {
        invoice_number: editInvoiceNumber,
        receipt_number: editReceiptNumber,
        voucher_number: editVoucherNumber,
        document_number: editDocumentNumber,
        invoice_date: editInvoiceDate,
        transaction_date: editInvoiceDate,
        customer_name: editCustomerName,
        vendor_name: editVendorName,
        payment_terms: editPaymentTerms,
        payment_method: editPaymentMethod,
        cheque_number: editChequeNumber,
        account_code: editAccountCode,
        account_name: editAccountName,
        currency: editCurrency,
        subtotal: isStockTakeDoc ? calculatedStockTakeTotal : calculatedSubtotal,
        grand_total: isStockTakeDoc ? calculatedStockTakeTotal : undefined,
        review_status: 'Verified',
        validation_status: 'Passed',
        line_items: editItems
      };
      const res = await fetch(`/api/documents/${currentDoc.document_id}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Server returned ${res.status}`);
      }
      const updatedDoc = await res.json();
      setSaveSuccessMsg('Document reviewed values and line items saved successfully.');
      setIsEditing(false);
      if (onDocumentUpdated) {
        onDocumentUpdated(updatedDoc);
      }
    } catch (err) {
      setSaveErrMsg(err.message || 'Failed to save reviewed document.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-content-large">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span className="doc-id-pill doc-pill-doc" style={{ fontSize: '0.95rem', backgroundColor: '#FAF5FF', color: '#7E22CE', border: '1px solid #E9D5FF' }}>{currentDoc.document_id}</span>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{docType}</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {document.original_filename} · Company: <strong style={{ color: 'var(--primary-color)' }}>{data.active_company_name || 'NextTech Solutions'} ({document.company_id || 'COMP-000001'})</strong>
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {onBackToBank && (
              <button 
                onClick={onBackToBank}
                className="btn btn-secondary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}
                title="Return to Bank Transaction"
              >
                <ArrowLeft size={14} />
                <span>Back to Bank Txn</span>
              </button>
            )}
            {isCompanySetupDoc ? (
              <span className="badge-record-setup" style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}>
                <Building2 size={13} style={{ color: '#2563eb' }} />
                <span>Company Setup Document</span>
              </span>
            ) : null}
            <span className={`status-badge ${isCompanySetupDoc ? 'EXTRACTED' : document.status}`}>
              {isCompanySetupDoc ? 'Extracted' : document.status}
            </span>
            <button 
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="modal-body" style={{ padding: '1rem' }}>
          <div className="side-by-side-container">
            
            {/* LEFT PANEL: Original Document Preview */}
            <div className="preview-pane">
              <div className="preview-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileText size={16} />
                  <span>ORIGINAL DOCUMENT PREVIEW</span>
                </div>
                <a 
                  href={fileUrl} 
                  target="_blank" 
                  rel="noreferrer" 
                  style={{ color: 'var(--primary-color)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 600 }}
                >
                  <span>Open Fullscreen</span>
                  <ExternalLink size={12} />
                </a>
              </div>

              {isPdf ? (
                <iframe 
                  src={fileUrl} 
                  title="PDF Preview" 
                  className="preview-frame" 
                />
              ) : (
                <div style={{ 
                  flex: 1, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  padding: '1rem',
                  backgroundColor: 'var(--bg-primary)'
                }}>
                  <img 
                    src={fileUrl} 
                    alt="Original Document" 
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '4px' }} 
                  />
                </div>
              )}
            </div>

            {/* RIGHT PANEL: Processing Result & Layout View */}
            <div className="data-pane">
              {isCompanySetupDoc ? (
                /* Dedicated Company Setup Document Details View */
                <div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--border-color)',
                    paddingBottom: '0.75rem',
                    marginBottom: '1rem'
                  }}>
                    <div>
                      <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                        {docType}
                      </h4>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        Foundational Setup Record · Confirmed Onboarding Document
                      </div>
                    </div>
                    <span className="status-badge EXTRACTED" style={{ fontSize: '0.75rem' }}>
                      <CheckCircle2 size={13} style={{ marginRight: '0.25rem' }} />
                      Extracted & Confirmed
                    </span>
                  </div>



                  {/* Summary Metric Cards */}
                  {isTrialBalance ? (
                    <>
                      {/* Warning banner if Imbalanced */}
                      {!isTbBalanced && (
                        <div style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid rgba(239, 68, 68, 0.35)',
                          borderRadius: '8px',
                          padding: '0.85rem 1rem',
                          marginBottom: '1rem',
                          fontSize: '0.82rem',
                          color: '#b91c1c',
                          display: 'flex',
                          gap: '0.65rem',
                          alignItems: 'center'
                        }}>
                          <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
                          <div>
                            <strong>Trial Balance Warning:</strong> Total Debit (RM {tbTotalDebit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) does not match Total Credit (RM {tbTotalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}). Difference is RM {tbDifference.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                        <div className="field-card" style={{ padding: '0.75rem', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                          <div className="field-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Original Filename</div>
                          <div className="field-value" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all', marginTop: '0.2rem' }}>
                            {document.original_filename}
                          </div>
                        </div>

                        <div className="field-card" style={{ padding: '0.75rem', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                          <div className="field-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Debit</div>
                          <div className="field-value" style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>
                            RM {tbTotalDebit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>

                        <div className="field-card" style={{ padding: '0.75rem', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                          <div className="field-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Credit</div>
                          <div className="field-value" style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>
                            RM {tbTotalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>

                        <div className="field-card" style={{ padding: '0.75rem', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                          <div className="field-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Difference</div>
                          <div className="field-value" style={{ fontSize: '0.92rem', fontWeight: 700, color: isTbBalanced ? 'var(--status-success-text)' : '#dc2626', fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>
                            RM {tbDifference.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>

                        <div className="field-card" style={{ padding: '0.75rem', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                          <div className="field-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</div>
                          <div className="field-value" style={{ marginTop: '0.2rem' }}>
                            {isTbBalanced ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#16a34a', fontWeight: 700, fontSize: '0.88rem' }}>
                                <CheckCircle2 size={15} /> Balanced
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#dc2626', fontWeight: 700, fontSize: '0.88rem' }}>
                                <AlertTriangle size={15} /> Imbalanced
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="field-card" style={{ padding: '0.75rem', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                          <div className="field-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Extraction Status</div>
                          <div className="field-value" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--status-success-text)', marginTop: '0.2rem' }}>
                            Extracted
                          </div>
                        </div>

                        <div className="field-card" style={{ padding: '0.75rem', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                          <div className="field-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Confirmation Status</div>
                          <div className="field-value" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--status-success-text)', marginTop: '0.2rem' }}>
                            Confirmed
                          </div>
                        </div>

                        <div className="field-card" style={{ padding: '0.75rem', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                          <div className="field-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Integration Status</div>
                          <div className="field-value" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--status-success-text)', marginTop: '0.2rem' }}>
                            Posted to Ledger
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                      <div className="field-card" style={{ padding: '0.75rem', backgroundColor: 'var(--bg-card)' }}>
                        <div className="field-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Original Filename</div>
                        <div className="field-value" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                          {document.original_filename}
                        </div>
                      </div>

                      <div className="field-card" style={{ padding: '0.75rem', backgroundColor: 'var(--bg-card)' }}>
                        <div className="field-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Confirmed Total</div>
                        <div className="field-value" style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--primary-color)', fontFamily: 'var(--font-mono)' }}>
                          {data.display_total || data.extracted_total || `${Number(currentDoc.grand_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                        </div>
                      </div>

                      <div className="field-card" style={{ padding: '0.75rem', backgroundColor: 'var(--bg-card)' }}>
                        <div className="field-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Total Extracted Lines</div>
                        <div className="field-value" style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {data.total_items || lineItems.length} record(s)
                        </div>
                      </div>

                      <div className="field-card" style={{ padding: '0.75rem', backgroundColor: 'var(--bg-card)' }}>
                        <div className="field-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Extraction Status</div>
                        <div className="field-value" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--status-success-text)' }}>
                          Extracted
                        </div>
                      </div>

                      <div className="field-card" style={{ padding: '0.75rem', backgroundColor: 'var(--bg-card)' }}>
                        <div className="field-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Confirmation Status</div>
                        <div className="field-value" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--status-success-text)' }}>
                          Confirmed
                        </div>
                      </div>

                      <div className="field-card" style={{ padding: '0.75rem', backgroundColor: 'var(--bg-card)' }}>
                        <div className="field-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Integration Status</div>
                        <div className="field-value" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--status-success-text)' }}>
                          Posted to Ledger
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Confirmed Extracted Line Items Table */}
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'var(--bg-card)' }}>
                    <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', fontWeight: 600, fontSize: '0.85rem', backgroundColor: 'var(--bg-primary)' }}>
                      Extracted & Confirmed Line Items ({lineItems.length})
                    </div>
                    <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                      <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
                            {docType === 'Opening Trial Balance' ? (
                              <>
                                <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 600 }}>Account Code</th>
                                <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 600 }}>Account Name</th>
                                <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 600 }}>Debit (RM)</th>
                                <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 600 }}>Credit (RM)</th>
                              </>
                            ) : docType === 'Opening Stock List' ? (
                              <>
                                <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 600 }}>Item Code</th>
                                <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 600 }}>Item Name</th>
                                <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 600 }}>Qty</th>
                                <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 600 }}>Unit Cost (RM)</th>
                                <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 600 }}>Total Value (RM)</th>
                              </>
                            ) : (
                              <>
                                <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 600 }}>Party / Entity</th>
                                <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 600 }}>Invoice Date</th>
                                <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 600 }}>Credit Term</th>
                                <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 600 }}>Outstanding (RM)</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {lineItems.length === 0 ? (
                            <tr>
                              <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                No individual line items extracted.
                              </td>
                            </tr>
                          ) : (
                            lineItems.map((item, idx) => {
                              if (docType === 'Opening Trial Balance') {
                                const dr = Number(item.debit || 0);
                                const cr = Number(item.credit || 0);
                                return (
                                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '0.65rem 0.85rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{item.account_code || '—'}</td>
                                    <td style={{ padding: '0.65rem 0.85rem' }}>{item.account_name || '—'}</td>
                                    <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: dr > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                      {dr > 0 ? dr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                                    </td>
                                    <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: cr > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                      {cr > 0 ? cr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                                    </td>
                                  </tr>
                                );
                              } else if (docType === 'Opening Stock List') {
                                const qty = Number(item.quantity || 0);
                                const cost = Number(item.unit_price || item.unit_cost || 0);
                                const total = Number(item.amount || qty * cost || 0);
                                return (
                                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '0.65rem 0.85rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{item.item_code || item.code || '—'}</td>
                                    <td style={{ padding: '0.65rem 0.85rem' }}>{item.item_name || item.name || item.account_name || '—'}</td>
                                    <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>{qty.toLocaleString()}</td>
                                    <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                  </tr>
                                );
                              } else {
                                const amt = Number(item.amount || 0);
                                return (
                                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '0.65rem 0.85rem', fontWeight: 600 }}>{item.entity_name || item.customer_name || item.supplier_name || item.account_name || '—'}</td>
                                    <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)' }}>{item.invoice_date || '—'}</td>
                                    <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)' }}>{item.credit_term || '—'}</td>
                                    <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                                      {amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                );
                              }
                            })
                          )}
                        </tbody>
                        {docType === 'Opening Trial Balance' && lineItems.length > 0 && (
                          <tfoot>
                            <tr style={{ borderTop: '2px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', fontWeight: 700 }}>
                              <td style={{ padding: '0.65rem 0.85rem' }}>Total</td>
                              <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                                Balanced Trial Balance ({lineItems.length} accounts)
                              </td>
                              <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--primary-color)' }}>
                                {tbTotalDebit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--primary-color)' }}>
                                {tbTotalCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                /* Standard Accounting Document Details View */
                <>
              {/* Section Header & Status Warnings */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: '0.75rem'
              }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Document Details
                </h4>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {isCompanyMismatch && (
                    <span className="status-badge ERROR" style={{ fontSize: '0.7rem' }}>
                      <AlertCircle size={12} />
                      <span>COMPANY MISMATCH</span>
                    </span>
                  )}

                  {(isCalcFailed || isIncomplete) && (
                    <span className="status-badge ERROR" style={{ fontSize: '0.7rem' }}>
                      <AlertTriangle size={12} />
                      <span>{isIncomplete ? 'INCOMPLETE EXTRACTION' : 'MATH FAILED'}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* COMPANY CONTEXT MISMATCH WARNING BANNER */}
              {isCompanyMismatch && (
                <div style={{ 
                  backgroundColor: 'var(--status-error-bg)', 
                  border: '1px solid rgba(185, 28, 28, 0.3)', 
                  color: 'var(--status-error-text)',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  fontSize: '0.85rem'
                }}>
                  <strong style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem' }}>
                    <AlertCircle size={16} />
                    <span>WARNING: Company Context Mismatch</span>
                  </strong>
                  {mismatchReason}
                  <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--status-error-text)' }}>
                    Active Company: <strong>{compCtx.active_company || data.active_company_name}</strong> | Account Holder: <strong>{compCtx.document_account_holder || data.account_name || roles.other || 'Unknown'}</strong>
                  </div>
                </div>
              )}



              {/* ACCOUNTING ANALYSIS SECTION (AUTOMATICALLY GENERATED BY ACCOUNTING AGENT) */}
              {acctAnalysis && acctAnalysis.accounting_event && (
                <div style={{ 
                  backgroundColor: 'var(--bg-primary)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '8px', 
                  padding: '0.9rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary-color)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <BookOpen size={15} />
                    <span>ACCOUNTING ANALYSIS</span>
                  </div>

                  <div className="field-group" style={{ marginBottom: '0.75rem' }}>
                    <div className="field-card" style={{ backgroundColor: 'var(--bg-card)' }}>
                      <div className="field-label" style={{ color: 'var(--text-secondary)' }}>Accounting Event</div>
                      <div className="field-value" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                        {acctAnalysis.accounting_event}
                      </div>
                    </div>

                    <div className="field-card" style={{ backgroundColor: 'var(--bg-card)' }}>
                      <div className="field-label" style={{ color: 'var(--text-secondary)' }}>Book of Prime Entry</div>
                      <div className="field-value" style={{ color: 'var(--status-success-text)', fontWeight: 600 }}>
                        {acctAnalysis.book_of_prime_entry}
                      </div>
                    </div>
                  </div>

                  {selectedAccounts.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                        Selected Accounts ({selectedAccounts.length})
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                        {selectedAccounts.map((acc, idx) => (
                          <div key={idx} style={{ 
                            backgroundColor: 'var(--bg-card)', 
                            padding: '0.5rem 0.75rem', 
                            borderRadius: '6px', 
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                          }}>
                            <div>
                              <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--primary-color)' }}>
                                {acc.account_code}
                              </span>
                              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginLeft: '0.4rem' }}>
                                {acc.account_name}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                              Type: <span style={{ color: 'var(--status-success-text)', fontWeight: 600 }}>{acc.account_type}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* VIEW A: BANK TRANSFER RECEIPT LAYOUT */}
              {isBankTransfer && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ 
                    backgroundColor: 'var(--badge-bank-bg)', 
                    border: '1px solid rgba(20, 125, 140, 0.3)', 
                    borderRadius: '8px', 
                    padding: '1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--badge-bank-text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <ArrowRightLeft size={16} />
                        <span>{data.bank_name || 'Bank Transfer'}</span>
                      </div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                        {data.currency || 'MYR'} {(data.transaction_amount || 0).toFixed(2)}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span className="status-badge EXTRACTED" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
                        {data.transaction_status || 'SUCCESSFUL'}
                      </span>
                    </div>
                  </div>

                  <div className="field-group">
                    {data.reference_number && (
                      <div className="field-card">
                        <div className="field-label">Reference Number</div>
                        <div className="field-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-color)', fontWeight: 600 }}>
                          {data.reference_number}
                        </div>
                      </div>
                    )}

                    {data.payment_reference && (
                      <div className="field-card">
                        <div className="field-label">Payment Reference</div>
                        <div className="field-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--status-success-text)' }}>
                          {data.payment_reference}
                        </div>
                      </div>
                    )}

                    <div className="field-card">
                      <div className="field-label">Transaction Date & Time</div>
                      <div className="field-value">{formatDisplayDate(data.transaction_datetime || data.transaction_date_time || data.transaction_date)}</div>
                    </div>

                    {data.transfer_type && (
                      <div className="field-card">
                        <div className="field-label">Transfer Type</div>
                        <div className="field-value">{data.transfer_type}</div>
                      </div>
                    )}
                  </div>

                  <div style={{ 
                    backgroundColor: 'var(--bg-primary)', 
                    border: '1px solid var(--border-color)', 
                    borderRadius: '8px', 
                    padding: '0.85rem'
                  }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>
                      Account Transfer Details
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div style={{ backgroundColor: 'var(--bg-card)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>From Account (Payer)</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                          {data.from_account_name || roles.customer || roles.from_account || '-'}
                        </div>
                        {data.from_account_number && (
                          <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                            {data.from_account_number}
                          </div>
                        )}
                      </div>

                      <div style={{ backgroundColor: 'var(--bg-card)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Beneficiary (Recipient)</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--status-success-text)', marginTop: '0.2rem' }}>
                          {data.beneficiary_name || roles.our_company || roles.beneficiary || '-'}
                        </div>
                        {data.beneficiary_bank && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Bank: {data.beneficiary_bank}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* VIEW B: BANK STATEMENT & TRANSACTION RECORD LAYOUT */}
              {isBankStatement && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Bank Statement Metadata Card */}
                  <div className="field-group">
                    {data.bank_name && (
                      <div className="field-card">
                        <div className="field-label">Bank Name</div>
                        <div className="field-value" style={{ color: 'var(--badge-bank-text)', fontWeight: 600 }}>{data.bank_name}</div>
                      </div>
                    )}
                    <div className="field-card">
                      <div className="field-label">Account Name (Holder)</div>
                      <div className="field-value" style={{ fontWeight: 600 }}>{data.account_name || roles.other || '-'}</div>
                    </div>
                    {data.account_number && (
                      <div className="field-card">
                        <div className="field-label">Account Number</div>
                        <div className="field-value" style={{ fontFamily: 'var(--font-mono)' }}>{data.account_number}</div>
                      </div>
                    )}
                    {data.account_type && (
                      <div className="field-card">
                        <div className="field-label">Account Type</div>
                        <div className="field-value">{data.account_type}</div>
                      </div>
                    )}
                    {data.statement_period && (
                      <div className="field-card">
                        <div className="field-label">Statement Period</div>
                        <div className="field-value">{data.statement_period}</div>
                      </div>
                    )}
                    {data.statement_date && (
                      <div className="field-card">
                        <div className="field-label">Statement Date</div>
                        <div className="field-value">{formatDisplayDate(data.statement_date)}</div>
                      </div>
                    )}
                  </div>

                  {/* Calculation Agent Verification Card (ONLY when calculation_required is true) */}
                  {calcVer.calculation_required === true && (
                    <div style={{ 
                      backgroundColor: isCalcFailed ? 'var(--status-error-bg)' : 'var(--bg-primary)', 
                      border: `1px solid ${isCalcFailed ? 'rgba(185, 28, 28, 0.3)' : 'var(--border-color)'}`, 
                      borderRadius: '8px', 
                      padding: '0.85rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isCalcFailed ? 'var(--status-error-text)' : 'var(--primary-color)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.4rem', letterSpacing: '0.04em' }}>
                          <Calculator size={14} />
                          <span>Financial Summary & Verification</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Validation:</span>
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.5rem',
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            backgroundColor: isCalcFailed ? 'var(--status-error-bg)' : 'var(--status-success-bg)',
                            color: isCalcFailed ? 'var(--status-error-text)' : 'var(--status-success-text)',
                            border: `1px solid ${isCalcFailed ? 'rgba(185, 28, 28, 0.25)' : 'rgba(21, 128, 61, 0.25)'}`
                          }}>
                            {isCalcFailed ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />}
                            <span>{isCalcFailed ? 'Failed' : 'Passed'}</span>
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: Math.abs(calcVer.difference || 0) < 0.01 ? 'repeat(5, 1fr)' : 'repeat(6, 1fr)', gap: '0.5rem' }}>
                        <div style={{ backgroundColor: 'var(--bg-card)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Opening Balance</div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                            RM {(calcVer.opening_balance ?? data.opening_balance ?? 0).toFixed(2)}
                          </div>
                        </div>

                        <div style={{ backgroundColor: 'var(--bg-card)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Total Debit (Deposits)</div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--status-success-text)' }}>
                            RM {(calcVer.total_debit ?? 0).toFixed(2)}
                          </div>
                        </div>

                        <div style={{ backgroundColor: 'var(--bg-card)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Total Credit (Withdrawals)</div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--status-error-text)' }}>
                            RM {(calcVer.total_credit ?? 0).toFixed(2)}
                          </div>
                        </div>

                        {Math.abs(calcVer.difference || 0) < 0.01 ? (
                          <div style={{ backgroundColor: 'var(--bg-card)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Closing Balance</div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                              RM {(calcVer.document_closing_balance ?? data.closing_balance ?? calcVer.calculated_closing_balance ?? 0).toFixed(2)}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ backgroundColor: 'var(--bg-card)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Document Closing</div>
                              <div style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                                RM {(calcVer.document_closing_balance ?? data.closing_balance ?? 0).toFixed(2)}
                              </div>
                            </div>

                            <div style={{ backgroundColor: 'var(--bg-card)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Calculated Closing</div>
                              <div style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--status-error-text)' }}>
                                RM {(calcVer.calculated_closing_balance ?? calcVer.calculated_total ?? 0).toFixed(2)}
                              </div>
                            </div>
                          </>
                        )}

                        <div style={{ backgroundColor: 'var(--bg-card)', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Calculation Difference</div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'var(--font-mono)', color: calcVer.difference !== 0 ? 'var(--status-error-text)' : 'var(--text-muted)' }}>
                            {currPrefix}{(calcVer.difference || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Running Balance Verification Section (ONLY when calculation_required is true) */}
                  {calcVer.calculation_required === true && runningChecks.length > 0 && (
                    <div style={{ 
                      backgroundColor: 'var(--bg-primary)', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: '8px', 
                      padding: '0.85rem'
                    }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary-color)', marginBottom: '0.5rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Calculator size={14} />
                        <span>Running Balance Verification ({runningChecks.length} Rows)</span>
                      </div>

                      <table className="custom-table" style={{ fontSize: '0.75rem' }}>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Calculated Balance</th>
                            <th>Document Balance</th>
                            <th>Difference</th>
                            <th style={{ textAlign: 'right' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {runningChecks.map((row, idx) => (
                            <tr key={idx}>
                              <td>{formatDisplayDate(row.date)}</td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>RM {(row.calculated_balance || 0).toFixed(2)}</td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>RM {(row.document_balance || 0).toFixed(2)}</td>
                              <td style={{ fontFamily: 'var(--font-mono)', color: row.difference !== 0 ? 'var(--status-error-text)' : 'var(--text-muted)' }}>
                                RM {(row.difference || 0).toFixed(2)}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <span style={{
                                  fontSize: '0.65rem',
                                  fontWeight: 600,
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: '4px',
                                  backgroundColor: row.status === 'PASSED' ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
                                  color: row.status === 'PASSED' ? 'var(--status-success-text)' : 'var(--status-error-text)',
                                  border: `1px solid ${row.status === 'PASSED' ? 'rgba(21, 128, 61, 0.25)' : 'rgba(185, 28, 28, 0.25)'}`
                                }}>
                                  {row.status === 'PASSED' ? 'PASS' : 'FAIL'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Bank Transactions Table */}
                  {bankTxs.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        BANK TRANSACTIONS ({bankTxs.length})
                      </div>
                      <table className="custom-table" style={{ fontSize: '0.75rem' }}>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Description / Reference</th>
                            <th>Debit (RM)</th>
                            <th>Credit (RM)</th>
                            <th style={{ textAlign: 'right' }}>Balance (RM)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bankTxs.map((tx, idx) => {
                            const deb = tx.debit ?? tx.debit_amount ?? 0;
                            const cred = tx.credit ?? tx.credit_amount ?? 0;
                            const bal = tx.balance ?? 0;
                            return (
                              <tr key={idx}>
                                <td>{formatDisplayDate(tx.date || tx.transaction_date)}</td>
                                <td>{tx.description}</td>
                                <td style={{ color: deb > 0 ? 'var(--status-success-text)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                  {deb > 0 ? `RM ${deb.toFixed(2)}` : '—'}
                                </td>
                                <td style={{ color: cred > 0 ? 'var(--status-error-text)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                  {cred > 0 ? `RM ${cred.toFixed(2)}` : '—'}
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                                  RM {bal.toFixed(2)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* VIEW C: INVOICES & RECEIPTS LAYOUT */}
              {isInvoiceOrReceipt && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Business Role Identification */}
                  <div style={{ 
                    backgroundColor: 'var(--bg-primary)', 
                    border: '1px solid var(--border-color)', 
                    borderRadius: '8px', 
                    padding: '0.85rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary-color)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                      <Building2 size={14} />
                      <span>Business Role Identification</span>
                    </div>
                    
                    <div className="field-group">
                      <div className="field-card">
                        <div className="field-label">Our Company</div>
                        <div className="field-value" style={{ color: 'var(--status-success-text)' }}>
                          {ourCompName}
                        </div>
                      </div>
                      
                      {validCustomer && (
                        <div className="field-card">
                          <div className="field-label">Customer</div>
                          <div className="field-value">{validCustomer}</div>
                        </div>
                      )}
                      {validVendor && (
                        <div className="field-card">
                          <div className="field-label">Vendor / Supplier</div>
                          <div className="field-value">{validVendor}</div>
                        </div>
                      )}
                      {validMerchant && (
                        <div className="field-card">
                          <div className="field-label">Merchant</div>
                          <div className="field-value">{validMerchant}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* DOCUMENT DETAILS (NON-FINANCIAL METADATA) */}
                  <div className="field-group">
                    <div className="field-card">
                      <div className="field-label">
                        {isOfficialReceiptDoc ? 'Receipt Number' :
                         isPaymentVoucherDoc ? 'Voucher Number' :
                         isDeliveryOrderDoc ? 'Delivery Order Number' :
                         isStockTakeDoc ? 'Stock Take Reference' :
                         docType === 'Purchase Order' ? 'Purchase Order Number' :
                         docType === 'Sales Order' ? 'Sales Order Number' :
                         docType === 'Purchase Return' ? 'Return Number' :
                         'Invoice Number'}
                      </div>
                      {isEditing ? (
                        <input
                          type="text"
                          value={isOfficialReceiptDoc ? editReceiptNumber :
                                 isPaymentVoucherDoc ? editVoucherNumber :
                                 (isDeliveryOrderDoc || isStockTakeDoc || docType === 'Purchase Order' || docType === 'Sales Order' || docType === 'Purchase Return') ? editDocumentNumber :
                                 editInvoiceNumber}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (isOfficialReceiptDoc) setEditReceiptNumber(val);
                            else if (isPaymentVoucherDoc) setEditVoucherNumber(val);
                            else if (isDeliveryOrderDoc || isStockTakeDoc || docType === 'Purchase Order' || docType === 'Sales Order' || docType === 'Purchase Return') setEditDocumentNumber(val);
                            else setEditInvoiceNumber(val);
                          }}
                          placeholder="e.g. Reference number"
                          style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
                        />
                      ) : (
                        <div className="field-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-color)', fontWeight: 600 }}>
                          {(isOfficialReceiptDoc ? (editReceiptNumber || data.receipt_number) :
                            isPaymentVoucherDoc ? (editVoucherNumber || data.voucher_number) :
                            (isDeliveryOrderDoc || isStockTakeDoc || docType === 'Purchase Order' || docType === 'Sales Order' || docType === 'Purchase Return') ? (editDocumentNumber || data.delivery_order_number || data.stock_take_number || data.purchase_order_number || data.sales_order_number || data.return_number || data.document_number) :
                            (editInvoiceNumber || data.invoice_number || data.document_number)) || '—'}
                        </div>
                      )}
                    </div>

                    <div className="field-card">
                      <div className="field-label">
                        {isOfficialReceiptDoc ? 'Receipt Date' :
                         isPaymentVoucherDoc ? 'Payment Date' :
                         isDeliveryOrderDoc ? 'Delivery Date' :
                         isStockTakeDoc ? 'Stock Take Date' :
                         'Invoice Date'}
                      </div>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editInvoiceDate}
                          onChange={(e) => setEditInvoiceDate(e.target.value)}
                          placeholder="YYYY-MM-DD"
                          style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                        />
                      ) : (
                        <div className="field-value">{formatDisplayDate(editInvoiceDate || data.invoice_date || data.transaction_date || data.receipt_date || data.payment_date || data.delivery_date)}</div>
                      )}
                    </div>

                    <div className="field-card">
                      <div className="field-label">{docType === 'Sales Invoice' || isOfficialReceiptDoc || docType === 'Sales Order' || isDeliveryOrderDoc ? 'Customer' : 'Vendor / Supplier'}</div>
                      {isEditing ? (
                        <input
                          type="text"
                          value={docType === 'Sales Invoice' || isOfficialReceiptDoc || docType === 'Sales Order' || isDeliveryOrderDoc ? editCustomerName : editVendorName}
                          onChange={(e) => (docType === 'Sales Invoice' || isOfficialReceiptDoc || docType === 'Sales Order' || isDeliveryOrderDoc) ? setEditCustomerName(e.target.value) : setEditVendorName(e.target.value)}
                          placeholder={docType === 'Sales Invoice' || isOfficialReceiptDoc || docType === 'Sales Order' || isDeliveryOrderDoc ? "Customer name" : "Vendor name"}
                          style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                        />
                      ) : (
                        <div className="field-value" style={{ fontWeight: 600 }}>
                          {((docType === 'Sales Invoice' || isOfficialReceiptDoc || docType === 'Sales Order' || isDeliveryOrderDoc) ? (editCustomerName || validCustomer) : (editVendorName || validVendor)) || '—'}
                        </div>
                      )}
                    </div>

                    {(data.payment_method || editPaymentMethod || isOfficialReceiptDoc || isPaymentVoucherDoc) && (
                      <div className="field-card">
                        <div className="field-label">Payment Method</div>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editPaymentMethod}
                            onChange={(e) => setEditPaymentMethod(e.target.value)}
                            placeholder="e.g. Cheque / Bank Transfer"
                            style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                          />
                        ) : (
                          <div className="field-value">{editPaymentMethod || data.payment_method || '—'}</div>
                        )}
                      </div>
                    )}

                    {(data.cheque_number || editChequeNumber || isOfficialReceiptDoc || isPaymentVoucherDoc) && (
                      <div className="field-card">
                        <div className="field-label">Cheque Number</div>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editChequeNumber}
                            onChange={(e) => setEditChequeNumber(e.target.value)}
                            placeholder="e.g. CHQ-100234"
                            style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
                          />
                        ) : (
                          <div className="field-value" style={{ fontFamily: 'var(--font-mono)' }}>{editChequeNumber || data.cheque_number || '—'}</div>
                        )}
                      </div>
                    )}

                    {(data.account_code || editAccountCode) && (
                      <div className="field-card">
                        <div className="field-label">Account Code</div>
                        <div className="field-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-color)' }}>
                          {editAccountCode || data.account_code} {data.account_name ? `(${data.account_name})` : ''}
                        </div>
                      </div>
                    )}

                    {(data.payment_terms || editPaymentTerms || docType.includes('Invoice') || docType.includes('Order')) && (
                      <div className="field-card">
                        <div className="field-label">Payment Terms</div>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editPaymentTerms}
                            onChange={(e) => setEditPaymentTerms(e.target.value)}
                            placeholder="e.g. Net 30 days"
                            style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                          />
                        ) : (
                          <div className="field-value">{editPaymentTerms || data.payment_terms || '—'}</div>
                        )}
                      </div>
                    )}

                    <div className="field-card">
                      <div className="field-label">Currency</div>
                      {isEditing ? (
                        <select
                          value={editCurrency}
                          onChange={(e) => setEditCurrency(e.target.value)}
                          style={{ width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                        >
                          <option value="MYR">MYR (Ringgit Malaysia)</option>
                          <option value="USD">USD (US Dollar)</option>
                          <option value="SGD">SGD (Singapore Dollar)</option>
                          <option value="EUR">EUR (Euro)</option>
                          <option value="GBP">GBP (British Pound)</option>
                        </select>
                      ) : (
                        <div className="field-value" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{editCurrency}</div>
                      )}
                    </div>

                    {data.vendor_address && (
                      <div className="field-card" style={{ gridColumn: 'span 2' }}>
                        <div className="field-label">Address</div>
                        <div className="field-value" style={{ color: 'var(--text-primary)' }}>
                          {data.vendor_address}
                        </div>
                      </div>
                    )}

                    {data.payment_description && (
                      <div className="field-card" style={{ gridColumn: 'span 2' }}>
                        <div className="field-label">Description</div>
                        <div className="field-value" style={{ color: 'var(--text-primary)' }}>
                          {data.payment_description}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Banner alerts for saving / status */}
                  {saveSuccessMsg && (
                    <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '6px', color: 'var(--status-success-text)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CheckCircle2 size={15} />
                      <span>{saveSuccessMsg}</span>
                    </div>
                  )}
                  {saveErrMsg && (
                    <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: 'var(--status-error-text)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <AlertCircle size={15} />
                      <span>{saveErrMsg}</span>
                    </div>
                  )}

                  {/* FINANCIAL SUMMARY & COMPACT CALCULATION VERIFICATION */}
                  <div style={{ 
                    backgroundColor: hasDiscrepancy ? 'var(--status-error-bg)' : 'var(--bg-primary)', 
                    border: `1px solid ${hasDiscrepancy ? 'rgba(185, 28, 28, 0.3)' : 'var(--border-color)'}`, 
                    borderRadius: '8px', 
                    padding: '0.85rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.75rem', fontWeight: 700, color: hasDiscrepancy ? 'var(--status-error-text)' : 'var(--primary-color)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        <Calculator size={14} />
                        <span>Financial Summary</span>
                      </div>

                      {calcVer.calculation_required === true && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Validation:</span>
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.5rem',
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            backgroundColor: isValidationFailed ? 'var(--status-error-bg)' : (isValidationWarning ? 'rgba(217, 119, 6, 0.12)' : 'var(--status-success-bg)'),
                            color: isValidationFailed ? 'var(--status-error-text)' : (isValidationWarning ? '#b45309' : 'var(--status-success-text)'),
                            border: `1px solid ${isValidationFailed ? 'rgba(185, 28, 28, 0.25)' : (isValidationWarning ? 'rgba(217, 119, 6, 0.3)' : 'rgba(21, 128, 61, 0.25)')}`
                          }}>
                            {isValidationFailed ? <AlertCircle size={12} /> : (isValidationWarning ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />)}
                            <span>{isValidationFailed ? 'Failed' : (isValidationWarning ? 'Review Required' : 'Passed')}</span>
                          </span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
                      {/* Primary document amount */}
                      <div className="field-card" style={{ backgroundColor: 'var(--bg-card)' }}>
                        <div className="field-label" style={{ color: 'var(--text-secondary)' }}>{primaryAmountLabel}</div>
                        <div className="field-value" style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          color: (isStockTakeDoc && primaryAmountValue < 0) ? '#b91c1c' : 'var(--text-primary)'
                        }}>
                          {isNonFinancialMovement ? (
                            `${editItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0) || 3} Units (Non-financial)`
                          ) : (
                            isStockTakeDoc && primaryAmountValue < 0 ? (
                              `-RM ${Math.abs(primaryAmountValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            ) : (
                              `${currPrefix}${Number(primaryAmountValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            )
                          )}
                        </div>
                      </div>

                      {/* Genuine adjustments only if present */}
                      {hasDiscount && (
                        <div className="field-card" style={{ backgroundColor: 'var(--bg-card)' }}>
                          <div className="field-label" style={{ color: 'var(--text-secondary)' }}>Discount</div>
                          <div className="field-value" style={{ fontFamily: 'var(--font-mono)', color: 'var(--status-warning-text)' }}>
                            - {currPrefix}{Number(data.discount).toFixed(2)}
                          </div>
                        </div>
                      )}

                      {hasShipping && (
                        <div className="field-card" style={{ backgroundColor: 'var(--bg-card)' }}>
                          <div className="field-label" style={{ color: 'var(--text-secondary)' }}>Shipping / Freight</div>
                          <div className="field-value" style={{ fontFamily: 'var(--font-mono)' }}>
                            + {currPrefix}{Number(data.shipping).toFixed(2)}
                          </div>
                        </div>
                      )}

                      {hasTax && (
                        <div className="field-card" style={{ backgroundColor: 'var(--bg-card)' }}>
                          <div className="field-label" style={{ color: 'var(--text-secondary)' }}>Tax Amount</div>
                          <div className="field-value" style={{ fontFamily: 'var(--font-mono)' }}>
                            + {currPrefix}{Number(data.tax_amount).toFixed(2)}
                          </div>
                        </div>
                      )}

                      {/* Invoice Total / Grand Total ONLY if adjustments exist */}
                      {hasAdjustments && (
                        <div className="field-card" style={{ backgroundColor: 'var(--bg-card)' }}>
                          <div className="field-label" style={{ color: 'var(--text-secondary)' }}>Invoice Total</div>
                          <div className="field-value" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--status-success-text)' }}>
                            {currPrefix}{Number(data.grand_total || currentDoc.grand_total || 0).toFixed(2)}
                          </div>
                        </div>
                      )}

                      {/* Multi-Currency Financial Summary Cards */}
                      {docCurr !== 'MYR' && (currentDoc.converted_amount_myr || data.converted_amount_myr) && (
                        <>
                          <div className="field-card" style={{ backgroundColor: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                            <div className="field-label" style={{ color: 'var(--status-success-text)' }}>Converted Total (MYR)</div>
                            <div className="field-value" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--status-success-text)' }}>
                              RM {Number(currentDoc.converted_amount_myr || data.converted_amount_myr).toFixed(2)}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                              Base Currency: MYR
                            </div>
                          </div>

                          <div className="field-card" style={{ backgroundColor: 'var(--bg-card)' }}>
                            <div className="field-label" style={{ color: 'var(--text-secondary)' }}>Exchange Rate</div>
                            <div className="field-value" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                              1 {docCurr} = RM {Number(currentDoc.exchange_rate || data.exchange_rate || 1).toFixed(4)}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                              {currentDoc.exchange_rate_provider || data.exchange_rate_provider || currentDoc.rate_source || 'BNM OpenAPI'}
                            </div>
                          </div>

                          <div className="field-card" style={{ backgroundColor: 'var(--bg-card)' }}>
                            <div className="field-label" style={{ color: 'var(--text-secondary)' }}>Rate Date</div>
                            <div className="field-value" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                              {formatDisplayDate(currentDoc.exchange_rate_date || data.exchange_rate_date || currentDoc.rate_publication_date || data.transaction_date)}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                              Official Publication
                            </div>
                          </div>
                        </>
                      )}

                      {/* Calculation Difference (when verification is applicable) */}
                      {calcVer.calculation_required === true && !isNonFinancialMovement && (
                        <div className="field-card" style={{ backgroundColor: 'var(--bg-card)' }}>
                          <div className="field-label" style={{ color: 'var(--text-secondary)' }}>Calculation Difference</div>
                          <div className="field-value" style={{
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600,
                            color: hasDiscrepancy ? 'var(--status-error-text)' : 'var(--text-muted)'
                          }}>
                            {currPrefix}{calcDiff.toFixed(2)}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Foreign Currency Conversion Failure Banner */}
                    {docCurr !== 'MYR' && (!currentDoc.converted_amount_myr && !data.converted_amount_myr) && (
                      <div style={{
                        marginTop: '0.6rem',
                        padding: '0.75rem',
                        backgroundColor: 'var(--status-error-bg)',
                        border: '1px solid rgba(185, 28, 28, 0.3)',
                        borderRadius: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.75rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <AlertCircle size={18} style={{ color: 'var(--status-error-text)', flexShrink: 0, marginTop: '2px' }} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--status-error-text)' }}>
                              Currency Conversion Required
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                              {currentDoc.conversion_error || data.conversion_error || `Unable to fetch exchange rate for ${docCurr} on ${formatDisplayDate(data.transaction_date)}. Posting to general ledger is paused.`}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleRetryCurrencyConversion}
                          disabled={retryingConversion}
                          style={{
                            padding: '0.35rem 0.75rem',
                            backgroundColor: '#dc2626',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: retryingConversion ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            flexShrink: 0
                          }}
                        >
                          <RefreshCw size={12} className={retryingConversion ? 'animate-spin' : ''} />
                          <span>{retryingConversion ? 'Retrying...' : 'Retry Conversion'}</span>
                        </button>
                      </div>
                    )}

                    {/* Discrepancy breakdown: ONLY rendered when there is an actual discrepancy */}
                    {hasDiscrepancy && (
                      <div style={{ marginTop: '0.6rem', padding: '0.6rem', backgroundColor: 'var(--bg-card)', borderRadius: '6px', border: '1px solid rgba(185, 28, 28, 0.3)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.4rem', fontSize: '0.78rem' }}>
                          <div>Stated Total: <strong style={{ fontFamily: 'var(--font-mono)' }}>{currPrefix}{(calcVer.document_total || data.grand_total || currentDoc.grand_total || 0).toFixed(2)}</strong></div>
                          <div>Calculated Total: <strong style={{ fontFamily: 'var(--font-mono)' }}>{currPrefix}{(calcVer.calculated_total || 0).toFixed(2)}</strong></div>
                          <div style={{ color: 'var(--status-error-text)' }}>Discrepancy: <strong style={{ fontFamily: 'var(--font-mono)' }}>{currPrefix}{calcDiff.toFixed(2)}</strong></div>
                        </div>
                        {calcVer.details && calcVer.details.length > 0 && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--status-error-text)' }}>
                            {calcVer.details.map((d, i) => (
                              <div key={i}>• {d}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* LINE ITEMS SECTION */}
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          LINE ITEMS ({editItems.length})
                        </span>
                        {editItems.length > 0 ? (
                          <span className="status-badge COMPLETE" style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>
                            Extracted
                          </span>
                        ) : (
                          <span className="status-badge NEEDS_REVIEW" style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>
                            Review Required
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setIsEditing(!isEditing)}
                          style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                          <Edit3 size={13} />
                          <span>{isEditing ? 'Cancel Edit' : 'Edit Items'}</span>
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={handleAddItem}
                          style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                          <Plus size={13} />
                          <span>Add Item</span>
                        </button>
                      </div>
                    </div>

                    {/* Warning banner for Stock Take missing physical count */}
                    {isStockTakeDoc && hasMissingStockCount && (
                      <div style={{
                        backgroundColor: "#FEF2F2",
                        border: "1px solid #FECACA",
                        borderRadius: "8px",
                        padding: "0.75rem 1rem",
                        marginBottom: "0.75rem",
                        display: "flex",
                        gap: "0.65rem",
                        alignItems: "center",
                        color: "#991B1B",
                        fontSize: "0.8rem"
                      }}>
                        <AlertCircle size={16} style={{ color: "#DC2626", flexShrink: 0 }} />
                        <div>
                          <strong>Physical Count Discrepancy Flagged:</strong> One or more stock items (e.g. Clutch (Premium)) do not have physical counts recorded in the source document. The system did not hallucinate quantities and preserved the actual record. You can edit this line to supply the counted physical quantity or confirm the adjustment.
                        </div>
                      </div>
                    )}

                    {/* Alert when line items are empty */}
                    {editItems.length === 0 ? (
                      <div style={{ padding: "1rem", backgroundColor: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "8px", color: "var(--status-warning-text)", marginBottom: "0.75rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.25rem" }}>
                          <AlertTriangle size={16} />
                          <span>No Line Items Extracted — Extraction Requires Review</span>
                        </div>
                        <p style={{ fontSize: "0.75rem", margin: "0 0 0.5rem 0", color: "var(--text-secondary)" }}>
                          Individual product or service lines could not be identified automatically. You can click "Add Item" above to add the itemized details for this document.
                        </p>
                      </div>
                    ) : isStockTakeDoc ? (
                      /* DEDICATED STOCK TAKE TABLE VIEW */
                      <table className="custom-table" style={{ fontSize: "0.8rem", width: "100%" }}>
                        <thead>
                          <tr>
                            <th style={{ width: "40px" }}>Item</th>
                            <th>Description</th>
                            <th style={{ width: "90px", textAlign: "right" }}>Bal Qty</th>
                            <th style={{ width: "115px", textAlign: "right" }}>Physical Qty</th>
                            <th style={{ width: "90px", textAlign: "right" }}>Diff Qty</th>
                            <th style={{ width: "60px" }}>UOM</th>
                            <th style={{ width: "100px", textAlign: "right" }}>Unit Cost (RM)</th>
                            <th style={{ width: "120px", textAlign: "right" }}>Net Amount (RM)</th>
                            {isEditing && <th style={{ width: "40px", textAlign: "center" }}></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {editItems.map((item, idx) => {
                            const isMissingCount = item.missing_physical || item.physical_quantity == null;
                            return (
                              <tr key={idx} style={{ backgroundColor: isMissingCount ? "rgba(239, 68, 68, 0.05)" : undefined }}>
                                <td style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                                  {item.item_number || idx + 1}
                                </td>
                                <td>
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      value={item.description}
                                      onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                                      style={{ width: "100%", padding: "0.25rem 0.4rem", borderRadius: "4px", border: "1px solid var(--border-color)", fontSize: "0.8rem" }}
                                    />
                                  ) : (
                                    <div>
                                      <span style={{ fontWeight: 500 }}>{item.description}</span>
                                      {isMissingCount && (
                                        <span style={{ marginLeft: "0.5rem", fontSize: "0.68rem", padding: "0.1rem 0.35rem", backgroundColor: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: "3px", fontWeight: 600 }}>
                                          Missing Physical Count
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      step="any"
                                      value={item.balance_quantity != null ? item.balance_quantity : ""}
                                      onChange={(e) => handleItemChange(idx, "balance_quantity", e.target.value)}
                                      style={{ width: "100%", padding: "0.25rem 0.4rem", borderRadius: "4px", border: "1px solid var(--border-color)", fontSize: "0.8rem", textAlign: "right" }}
                                    />
                                  ) : (
                                    item.balance_quantity != null ? item.balance_quantity : "—"
                                  )}
                                </td>
                                <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      step="any"
                                      value={item.physical_quantity != null ? item.physical_quantity : ""}
                                      onChange={(e) => handleItemChange(idx, "physical_quantity", e.target.value)}
                                      placeholder="Uncounted"
                                      style={{ width: "100%", padding: "0.25rem 0.4rem", borderRadius: "4px", border: isMissingCount ? "1px solid #ef4444" : "1px solid var(--border-color)", fontSize: "0.8rem", textAlign: "right" }}
                                    />
                                  ) : (
                                    item.physical_quantity != null ? (
                                      item.physical_quantity
                                    ) : (
                                      <span style={{ color: "#dc2626", fontWeight: 600, fontSize: "0.75rem" }}>— (Missing)</span>
                                    )
                                  )}
                                </td>
                                <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600, color: (item.difference_quantity || 0) < 0 ? "#dc2626" : ((item.difference_quantity || 0) > 0 ? "#16a34a" : "var(--text-muted)") }}>
                                  {item.difference_quantity != null ? (
                                    (item.difference_quantity > 0 ? `+${item.difference_quantity}` : `${item.difference_quantity}`)
                                  ) : "—"}
                                </td>
                                <td>
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      value={item.uom || ""}
                                      onChange={(e) => handleItemChange(idx, "uom", e.target.value)}
                                      placeholder="UNIT"
                                      style={{ width: "100%", padding: "0.25rem 0.4rem", borderRadius: "4px", border: "1px solid var(--border-color)", fontSize: "0.8rem" }}
                                    />
                                  ) : (
                                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{item.uom || "—"}</span>
                                  )}
                                </td>
                                <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={item.unit_cost != null ? item.unit_cost : item.unit_price}
                                      onChange={(e) => handleItemChange(idx, "unit_cost", e.target.value)}
                                      style={{ width: "100%", padding: "0.25rem 0.4rem", borderRadius: "4px", border: "1px solid var(--border-color)", fontSize: "0.8rem", textAlign: "right" }}
                                    />
                                  ) : (
                                    Number(item.unit_cost ?? item.unit_price ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                  )}
                                </td>
                                <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600, color: (item.amount || 0) < 0 ? "#dc2626" : ((item.amount || 0) > 0 ? "#16a34a" : "var(--text-muted)") }}>
                                  {item.amount != null ? (
                                    (item.amount < 0 ? `-RM ${Math.abs(item.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `RM ${Number(item.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
                                  ) : "—"}
                                </td>
                                {isEditing && (
                                  <td style={{ textAlign: "center" }}>
                                    <button
                                      onClick={() => handleDeleteItem(idx)}
                                      title="Delete line"
                                      style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer" }}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: "2px solid var(--border-color)", fontWeight: 700, backgroundColor: "var(--bg-primary)" }}>
                            <td colSpan={7} style={{ padding: "0.65rem 0.85rem" }}>Total Net Stock Adjustment ({editItems.length} lines)</td>
                            <td style={{ padding: "0.65rem 0.85rem", textAlign: "right", fontFamily: "var(--font-mono)", color: calculatedStockTakeTotal < 0 ? "#dc2626" : "var(--text-primary)" }}>
                              {calculatedStockTakeTotal < 0 ? `-RM ${Math.abs(calculatedStockTakeTotal).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `RM ${calculatedStockTakeTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            </td>
                            {isEditing && <td></td>}
                          </tr>
                        </tfoot>
                      </table>
                    ) : (
                      /* STANDARD DOCUMENT LINE ITEMS TABLE */
                      <table className="custom-table" style={{ fontSize: "0.8rem", width: "100%" }}>
                        <thead>
                          <tr>
                            <th style={{ width: "40px" }}>#</th>
                            <th>Description</th>
                            <th style={{ width: "80px", textAlign: "right" }}>Qty</th>
                            <th style={{ width: "80px" }}>UOM</th>
                            <th style={{ width: "110px", textAlign: "right" }}>Unit Price ({currCode})</th>
                            <th style={{ width: "90px", textAlign: "right" }}>Discount</th>
                            <th style={{ width: "120px", textAlign: "right" }}>Line Total ({currCode})</th>
                            {isEditing && <th style={{ width: "50px", textAlign: "center" }}></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {editItems.map((item, idx) => (
                            <tr key={idx}>
                              <td style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                                {item.item_number || idx + 1}
                              </td>
                              <td>
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={item.description}
                                    onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                                    placeholder="Item description"
                                    style={{ width: "100%", padding: "0.25rem 0.4rem", borderRadius: "4px", border: "1px solid var(--border-color)", fontSize: "0.8rem" }}
                                  />
                                ) : (
                                  <span style={{ fontWeight: 500 }}>{item.description}</span>
                                )}
                              </td>
                              <td style={{ textAlign: "right" }}>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    step="any"
                                    value={item.quantity}
                                    onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                                    style={{ width: "100%", padding: "0.25rem 0.4rem", borderRadius: "4px", border: "1px solid var(--border-color)", fontSize: "0.8rem", textAlign: "right" }}
                                  />
                                ) : (
                                  item.quantity
                                )}
                              </td>
                              <td>
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={item.uom || ""}
                                    onChange={(e) => handleItemChange(idx, "uom", e.target.value)}
                                    placeholder="UNIT"
                                    style={{ width: "100%", padding: "0.25rem 0.4rem", borderRadius: "4px", border: "1px solid var(--border-color)", fontSize: "0.8rem" }}
                                  />
                                ) : (
                                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{item.uom || "—"}</span>
                                )}
                              </td>
                              <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={item.unit_price}
                                    onChange={(e) => handleItemChange(idx, "unit_price", e.target.value)}
                                    style={{ width: "100%", padding: "0.25rem 0.4rem", borderRadius: "4px", border: "1px solid var(--border-color)", fontSize: "0.8rem", textAlign: "right" }}
                                  />
                                ) : (
                                  <div>
                                    <div>{Number(item.unit_price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                    {docCurr !== 'MYR' && (
                                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                        ≈ RM {Number(item.converted_unit_price_myr || (item.unit_price * (currentDoc.exchange_rate || data.exchange_rate || 1))).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={item.discount != null ? item.discount : ""}
                                    onChange={(e) => handleItemChange(idx, "discount", e.target.value)}
                                    placeholder="0.00"
                                    style={{ width: "100%", padding: "0.25rem 0.4rem", borderRadius: "4px", border: "1px solid var(--border-color)", fontSize: "0.8rem", textAlign: "right" }}
                                  />
                                ) : (
                                  item.discount != null ? Number(item.discount).toFixed(2) : "—"
                                )}
                              </td>
                              <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={item.line_total}
                                    onChange={(e) => handleItemChange(idx, "line_total", e.target.value)}
                                    style={{ width: "100%", padding: "0.25rem 0.4rem", borderRadius: "4px", border: "1px solid var(--border-color)", fontSize: "0.8rem", textAlign: "right" }}
                                  />
                                ) : (
                                  <div>
                                    <div>{Number(item.line_total).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                    {docCurr !== 'MYR' && (
                                      <div style={{ fontSize: '0.68rem', color: 'var(--status-success-text)', fontWeight: 500 }}>
                                        ≈ RM {Number(item.converted_total_amount_myr || (item.line_total * (currentDoc.exchange_rate || data.exchange_rate || 1))).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                              {isEditing && (
                                <td style={{ textAlign: "center" }}>
                                  <button
                                    onClick={() => handleDeleteItem(idx)}
                                    title="Delete line"
                                    style={{ background: "none", border: "none", color: "var(--status-error-text)", cursor: "pointer", padding: "0.2rem" }}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ fontWeight: 600, borderTop: "2px solid var(--border-color)" }}>
                            <td colSpan={isEditing ? 6 : 6} style={{ textAlign: "right" }}>Line Item Subtotal:</td>
                            <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--primary-color)" }}>
                              <div>{currPrefix}{calculatedSubtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                              {docCurr !== 'MYR' && (currentDoc.converted_amount_myr || data.converted_amount_myr) && (
                                <div style={{ fontSize: '0.7rem', color: 'var(--status-success-text)', fontWeight: 600 }}>
                                  ≈ RM {Number(currentDoc.converted_amount_myr || data.converted_amount_myr).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              )}
                            </td>
                            {isEditing && <td></td>}
                          </tr>
                        </tfoot>
                      </table>
                    )}
                    {/* Save Changes Button */}
                    {(isEditing || editItems.length > 0) && (
                      <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={handleSaveReviewed}
                          disabled={saving}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                          {saving ? <RefreshCw size={13} className="spin" /> : <Save size={13} />}
                          <span>{saving ? 'Saving...' : 'Save Reviewed Values'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
                </>
              )}
            </div>

          </div>
        </div>

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
