import React, { useState, useEffect } from 'react';
import { 
  Receipt, 
  Search, 
  RefreshCw, 
  Eye, 
  AlertCircle, 
  FileText, 
  CheckCircle2, 
  BookOpen, 
  Layers, 
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  LayoutDashboard,
  Scale,
  Users,
  Building,
  CreditCard,
  Package,
  Landmark,
  CalendarClock,
  TrendingUp,
  TrendingDown,
  Activity
} from 'lucide-react';
import TransactionDetailModal from '../components/TransactionDetailModal';
import DocumentDetailModal from '../components/DocumentDetailModal';
import BankTransactionDetailModal from '../components/BankTransactionDetailModal';
import AccountingDateFilter from '../components/AccountingDateFilter';
import OpeningBalancesPage from './OpeningBalancesPage';
import ReceivablesPage from './ReceivablesPage';
import PayablesPage from './PayablesPage';
import OtherCreditorsPage from './OtherCreditorsPage';
import InventoryPage from './InventoryPage';
import AccrualsPrepaymentsPage from './AccrualsPrepaymentsPage';

const BOOKS_OF_PRIME_ENTRY = [
  { id: 'Sales Day Book', name: 'Sales Day Book', category: 'Credit sales', desc: 'Records all credit sales of goods or services to customers.', subtitle: 'Record of Credit Sales' },
  { id: 'Sales Returns Day Book', name: 'Sales Returns Day Book', category: 'Sales returns', desc: 'Records returns of goods or services from credit customers.', subtitle: 'Record of Sales Returns' },
  { id: 'Purchases Day Book', name: 'Purchases Day Book', category: 'Credit purchases', desc: 'Records all credit purchases of inventory, hardware, or office equipment.', subtitle: 'Record of Credit Purchases' },
  { id: 'Purchases Returns Day Book', name: 'Purchases Returns Day Book', category: 'Purchase returns', desc: 'Records returns of goods or inventory back to suppliers.', subtitle: 'Record of Purchases Returns' },
  { id: 'Cash Book', name: 'Cash Book', category: 'Cash & bank receipts / payments', desc: 'The Cash Book records cash and bank receipts and payments. It serves as both a book of prime entry and a ledger.', subtitle: 'Record of Cash and Bank Receipts and Payments' },
  { id: 'General Journal', name: 'General Journal', category: 'Non-routine & adjustments', desc: 'Records non-routine transactions, capital introductions, and accounting adjustments.', subtitle: 'Record of Non-routine Transactions & Adjustments' },
];

const COA_STRUCTURE = [
  { category: 'CAPITAL', filterType: 'Equity', codePrefixes: ['100'] },
  { category: 'RETAINED EARNING', filterType: 'Equity', codePrefixes: ['150', '151'] },
  { category: 'FIXED ASSETS', filterType: 'Asset', codePrefixes: ['200'] },
  { category: 'OTHER ASSETS', filterType: 'Asset', codePrefixes: ['210'] },
  { category: 'CURRENT ASSETS', filterType: 'Asset', codePrefixes: ['300', '305', '310', '320', '330', '340'] },
  { category: 'CURRENT LIABILITIES', filterType: 'Liability', codePrefixes: ['400', '405', '410', '420', '430', '440', '490'] },
  { category: 'SALES', filterType: 'Revenue', codePrefixes: ['500'] },
  { category: 'SALES ADJUSTMENTS', filterType: 'Sales Adjustment', codePrefixes: ['510', '520'] },
  { category: 'OTHER INCOMES', filterType: 'Revenue', codePrefixes: ['530', '540'] },
  { category: 'COST OF GOODS SOLD', filterType: 'Cost of Sales', codePrefixes: ['600', '610', '612', '615', '620'] },
  { category: 'EXPENSES', filterType: 'Expense', codePrefixes: ['901', '902', '903', '904', '905', '906', '907', '908', '909', '910', '911', '912', '913', '914', '915'] },
  { category: 'TAXATION', filterType: 'Taxation', codePrefixes: ['950'] }
];

const WORKSPACE_TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, desc: 'Comprehensive overview of books of prime entry, transactions, and recent activity.' },
  { id: 'transactions', label: 'Accounting Transactions', icon: Receipt, desc: 'View and manage recorded accounting transactions and supporting documents.' },
  { id: 'bank_transactions', label: 'Bank Transactions', icon: Landmark, desc: 'View imported ABC Bank transactions, Money In, Money Out, matching and reconciliation status.' },
  { id: 'books', label: 'Books of Prime Entry', icon: BookOpen, desc: 'Access sales, purchase, cash, and bank journals and registers.' },
  { id: 'accounts', label: 'Chart of Accounts', icon: Layers, desc: "View and manage the company's accounting accounts and codes." },
  { id: 'opening_balances', label: 'Opening Balances', icon: Scale, desc: 'View opening balances, opening journal entry, and related supporting documents.' },
  { id: 'receivables', label: 'Accounts Receivable', icon: Users, desc: 'Manage customer invoices, receipts, and outstanding balances.' },
  { id: 'payables', label: 'Accounts Payable', icon: Building, desc: 'Manage supplier invoices, payments, and outstanding balances.' },
  { id: 'other_creditors', label: 'Other Creditors', icon: CreditCard, desc: 'Manage other creditor records, liabilities, and repayment terms.' },
  { id: 'inventory', label: 'Inventory', icon: Package, desc: 'Manage stock items, stock quantities, unit costs, and stock movements.' },
  { id: 'accruals_prepayments', label: 'Accruals & Prepayments', icon: CalendarClock, desc: 'Manage accrued expenses, prepaid expenses, and monthly amortizations.' },
];

const ACCOUNTING_MODULES = [
  {
    id: 'accounts',
    name: 'Chart of Accounts',
    shortDesc: 'Manage account categories and sub-accounts, and view related transactions.',
    icon: Layers,
    badgeColor: '#8B5CF6',
    badgeBg: 'rgba(139, 92, 246, 0.1)'
  },
  {
    id: 'books',
    name: 'Books of Prime Entry',
    shortDesc: 'Access sales, purchase, cash, and bank books.',
    icon: BookOpen,
    badgeColor: '#2563EB',
    badgeBg: '#EFF6FF'
  },
  {
    id: 'opening_balances',
    name: 'Opening Balances',
    shortDesc: 'View opening balances, opening journal information, and related supporting documents.',
    icon: Scale,
    badgeColor: '#0EA5E9',
    badgeBg: 'rgba(14, 165, 233, 0.1)'
  },
  {
    id: 'receivables',
    name: 'Accounts Receivable',
    shortDesc: 'Manage customer invoices, receipts, and outstanding balances.',
    icon: Users,
    badgeColor: '#10B981',
    badgeBg: 'rgba(16, 185, 129, 0.1)'
  },
  {
    id: 'payables',
    name: 'Accounts Payable',
    shortDesc: 'Manage supplier invoices, payments, and outstanding balances.',
    icon: Building,
    badgeColor: '#F59E0B',
    badgeBg: 'rgba(245, 158, 11, 0.1)'
  },
  {
    id: 'other_creditors',
    name: 'Other Creditors',
    shortDesc: 'Manage other creditor records, liabilities, and repayment terms.',
    icon: CreditCard,
    badgeColor: '#EC4899',
    badgeBg: 'rgba(236, 72, 153, 0.1)'
  },
  {
    id: 'inventory',
    name: 'Inventory',
    shortDesc: 'Manage stock items, stock quantities, unit costs, and stock movements.',
    icon: Package,
    badgeColor: '#2563EB',
    badgeBg: '#EFF6FF'
  },
  {
    id: 'accruals_prepayments',
    name: 'Accruals & Prepayments',
    shortDesc: 'Manage accrued expenses, prepaid expenses, and monthly amortizations.',
    icon: CalendarClock,
    badgeColor: '#8B5CF6',
    badgeBg: 'rgba(139, 92, 246, 0.1)'
  }
];

export default function TransactionsPage({ initialTab = 'overview', onNavigate }) {
  const resolveTab = (t) => {
    if (!t || t === 'transactions' || t === 'accounting_workspace') return 'overview';
    if (t === 'chart_of_accounts') return 'accounts';
    return t;
  };

  const [activeTab, setActiveTab] = useState(() => resolveTab(initialTab));

  useEffect(() => {
    if (initialTab) {
      const resolved = resolveTab(initialTab);
      if (resolved !== activeTab) {
        setActiveTab(resolved);
        setSelectedBook(null);
        setSelectedAccount(null);
      }
    }
  }, [initialTab]);

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    setSelectedBook(null);
    setSelectedAccount(null);
    if (onNavigate) {
      onNavigate(tabId === 'overview' ? 'transactions' : tabId);
    }
  };

  const getModuleInfo = (tabId) => {
    const mod = ACCOUNTING_MODULES.find(m => m.id === tabId);
    if (mod) return mod;
    const tab = WORKSPACE_TABS.find(t => t.id === tabId || (tabId === 'all' && t.id === 'transactions'));
    if (tab) {
      return {
        id: tab.id,
        name: tab.label,
        shortDesc: tab.desc,
        icon: tab.icon,
        badgeColor: '#10B981',
        badgeBg: 'rgba(16, 185, 129, 0.1)'
      };
    }
    return null;
  };

  const handleRefreshActiveTab = () => {
    fetchData();
    window.dispatchEvent(new CustomEvent('company-updated', { detail: { company_id: localStorage.getItem('active_company_id') } }));
  };

  const [transactions, setTransactions] = useState([]);
  const [financialMetrics, setFinancialMetrics] = useState({
    totalIncome: 0,
    totalExpenses: 0,
    accountsReceivable: 0,
    accountsPayable: 0
  });
  const [dateFilter, setDateFilter] = useState({
    mode: 'ALL',
    month: String(new Date().getMonth() + 1).padStart(2, '0'),
    year: String(new Date().getFullYear()),
    specific_date: '',
    from_date: '',
    to_date: '',
    as_at_date: '',
    label: 'All Dates (Full History)'
  });
  const [chartOfAccounts, setChartOfAccounts] = useState([]);
  const [bankTransactions, setBankTransactions] = useState([]);
  const [selectedBankTx, setSelectedBankTx] = useState(null);
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [bankDirectionFilter, setBankDirectionFilter] = useState('ALL');
  const [bankSearchQuery, setBankSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selection states for subviews
  const [selectedBook, setSelectedBook] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [bookSearchQuery, setBookSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [dateFilterError, setDateFilterError] = useState(null);
  const [bookSummary, setBookSummary] = useState(null);
  const [loadingBookSummary, setLoadingBookSummary] = useState(false);

  const fetchBookSummary = async (bookName, fDate, tDate) => {
    if (!bookName) return;
    setLoadingBookSummary(true);
    try {
      let url = `/api/transactions/book-summary?book_name=${encodeURIComponent(bookName)}`;
      if (fDate) url += `&from_date=${fDate}`;
      if (tDate) url += `&to_date=${tDate}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setBookSummary(data);
      }
    } catch (err) {
      console.error('Error fetching book summary from Calculation Agent:', err);
    } finally {
      setLoadingBookSummary(false);
    }
  };

  useEffect(() => {
    if (selectedBook) {
      fetchBookSummary(selectedBook, fromDate, toDate);
    } else {
      setBookSummary(null);
    }
  }, [selectedBook]);

  const handleApplyDateFilter = () => {
    if (fromDate && toDate && fromDate > toDate) {
      setDateFilterError('From Date cannot be later than To Date.');
      return;
    }
    setDateFilterError(null);
    if (selectedBook) {
      fetchBookSummary(selectedBook, fromDate, toDate);
    }
  };

  const handleClearDateFilter = () => {
    setFromDate('');
    setToDate('');
    setDateFilterError(null);
    if (selectedBook) {
      fetchBookSummary(selectedBook, '', '');
    }
  };

  const handleExportPDF = () => {
    if (!selectedBook) return;
    let url = `/api/transactions/export-pdf?book_name=${encodeURIComponent(selectedBook)}`;
    if (fromDate) url += `&from_date=${fromDate}`;
    if (toDate) url += `&to_date=${toDate}`;
    window.open(url, '_blank');
  };

  // Helper formatting and extraction functions for Books of Prime Entry
  const formatAmount = (val) => {
    const num = typeof val === 'number' ? val : parseFloat(val || 0);
    if (isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getTxnDetails = (txn, defaultRole = 'Party') => {
    const ext = txn.extracted_data || {};
    const roles = ext.business_roles || {};

    let cand = '';
    if (defaultRole === 'Customer') {
      cand = ext.customer_name || ext.buyer_name || roles.buyer || roles.customer;
    } else if (defaultRole === 'Vendor') {
      cand = ext.vendor_name || ext.supplier_name || roles.vendor || roles.supplier;
    }

    if (!cand) {
      cand = (
        ext.customer_name ||
        ext.buyer_name ||
        ext.vendor_name ||
        ext.supplier_name ||
        roles.customer ||
        roles.buyer ||
        roles.vendor ||
        roles.supplier ||
        ''
      );
    }

    if (cand && String(cand).trim().toLowerCase() !== 'lumpur' && String(cand).trim().length > 2) {
      return String(cand).trim();
    }

    return txn.source_document || 'Account Party';
  };

  const getTxnFolio = (txn, bookName = '') => {
    const activeBook = bookName || selectedBook || '';
    const selectedAccs = txn.accounting_analysis?.selected_accounts || [];
    if (selectedAccs.length > 0) {
      if (activeBook.includes('Sales')) {
        const debtor = selectedAccs.find(a => String(a.account_code || '').startsWith('300'));
        if (debtor) return debtor.account_code;
      } else if (activeBook.includes('Purchases')) {
        const creditor = selectedAccs.find(a => String(a.account_code || '').startsWith('400'));
        if (creditor) return creditor.account_code;
      }
      return selectedAccs[0].account_code || '—';
    }
    return '—';
  };

  const getTxnReferenceNo = (txn, type = 'invoice') => {
    const ext = txn.extracted_data || {};
    if (type === 'invoice') {
      return ext.invoice_number || txn.source_document || '—';
    } else if (type === 'credit_note') {
      return ext.credit_note_number || ext.reference_number || txn.source_document || '—';
    }
    return txn.source_document || '—';
  };

  const parseDate = (val) => {
    if (!val) return null;
    if (val instanceof Date) return val;
    const str = String(val).trim();
    if (!str || str === '—' || str === '-' || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') return null;

    // 1. YYYY-MM-DD or YYYY/MM/DD
    const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (ymd) {
      return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    }

    // 2. DD-MM-YYYY or DD/MM/YYYY
    const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmy) {
      return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    }

    // 3. Named month string (e.g. "8 December 2025" or "31 Jan 2026")
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }

    return null;
  };

  const isDateInRange = (targetVal, fDateStr, tDateStr) => {
    const fDate = parseDate(fDateStr);
    const tDate = parseDate(tDateStr);
    if (!fDate && !tDate) return true;

    const tObj = parseDate(targetVal);
    if (!tObj) return false;

    if (fDate && tObj.getTime() < fDate.getTime()) return false;
    if (tDate && tObj.getTime() > tDate.getTime()) return false;
    return true;
  };

  const getFilteredBookTransactions = (bookName) => {
    const baseList = bookSummary?.transactions || transactions.filter(t => t.book_of_prime_entry === bookName);
    return baseList.filter(t => {
      const docType = (t.document_type || '').toLowerCase();
      const bope = (t.book_of_prime_entry || '').toLowerCase();
      if (
        docType.includes('bank statement') ||
        docType.includes('bank transaction record') ||
        bope.includes('bank statement')
      ) {
        return false;
      }

      if (!isDateInRange(t.transaction_date, fromDate, toDate)) return false;

      if (bookSearchQuery) {
        const q = bookSearchQuery.toLowerCase();
        const details = getTxnDetails(t, 'Generic').toLowerCase();
        const invNo = (t.extracted_data?.invoice_number || '').toLowerCase();
        const rcNo = (t.extracted_data?.receipt_number || '').toLowerCase();
        const cnNo = (t.extracted_data?.credit_note_number || '').toLowerCase();
        const srcDoc = (t.source_document || '').toLowerCase();
        const docId = (t.document_id || '').toLowerCase();
        const txnId = (t.transaction_id || '').toLowerCase();
        const event = (t.accounting_event || '').toLowerCase();

        const matches = (
          details.includes(q) ||
          invNo.includes(q) ||
          rcNo.includes(q) ||
          cnNo.includes(q) ||
          srcDoc.includes(q) ||
          docId.includes(q) ||
          txnId.includes(q) ||
          event.includes(q)
        );
        if (!matches) return false;
      }

      return true;
    });
  };

  const formatDisplayDate = (val) => {
    const d = parseDate(val);
    if (!d) return val || '';
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthStr = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${monthStr} ${year}`;
  };

  const formatPeriodHeader = (fStr, tStr) => {
    if (fStr && tStr) {
      return `${formatDisplayDate(fStr)} – ${formatDisplayDate(tStr)}`;
    } else if (fStr) {
      return `From ${formatDisplayDate(fStr)}`;
    } else if (tStr) {
      return `Up to ${formatDisplayDate(tStr)}`;
    }
    return `All Recorded Transactions`;
  };

  const getCashBookSections = (txns) => {
    const receipts = [];
    const payments = [];

    txns.forEach(t => {
      const docType = (t.document_type || '').toLowerCase();
      const event = (t.accounting_event || '').toLowerCase();
      const bope = (t.book_of_prime_entry || '').toLowerCase();

      // Exclude Bank Statement and Bank Transaction Record from Cash Book entries
      if (
        docType.includes('bank statement') || 
        docType.includes('bank transaction record') ||
        bope.includes('bank statement')
      ) {
        return;
      }

      const isReceipt = (
        docType === 'payment receipt' ||
        (docType.includes('receipt') && !docType.includes('purchase') && !docType.includes('expense') && !docType.includes('supplier')) ||
        event.includes('received') || 
        event.includes('inflow') ||
        event.includes('customer payment') ||
        event.includes('sales payment')
      ) && !(
        docType.includes('purchase') ||
        docType.includes('expense') ||
        event.includes('purchase') ||
        event.includes('expense') ||
        event.includes('supplier') ||
        event.includes('vendor') ||
        event.includes('outflow')
      );

      if (isReceipt) {
        receipts.push(t);
      } else {
        payments.push(t);
      }
    });

    return { receipts, payments };
  };

  const getCashBookAmounts = (txn) => {
    const ext = txn.extracted_data || {};
    const method = (ext.payment_method || '').toLowerCase();
    const docType = (txn.document_type || '').toLowerCase();
    const transferType = (ext.transfer_type || '').toLowerCase();
    const folio = getTxnFolio(txn);

    let totalAmt = typeof txn.amount === 'number' ? txn.amount : parseFloat(txn.amount || 0);
    if ((!totalAmt || totalAmt === 0) && ext) {
      totalAmt = parseFloat(ext.transaction_amount || ext.grand_total || ext.total_amount || ext.amount_received || 0);
    }

    const isCashInHand = (
      (method.includes('cash') && !method.includes('bank')) ||
      folio.includes('320-') ||
      folio.includes('330-') ||
      method.includes('petty')
    );

    const isBank = (
      method.includes('bank') ||
      method.includes('transfer') ||
      method.includes('card') ||
      method.includes('duitnow') ||
      method.includes('ibg') ||
      method.includes('cheque') ||
      docType.includes('bank') ||
      transferType.length > 0 ||
      folio.includes('310-')
    );

    if (totalAmt > 0) {
      if (isCashInHand) {
        return { cash: totalAmt, bank: null, hasAmount: true };
      } else {
        return { cash: null, bank: totalAmt, hasAmount: true };
      }
    } else {
      return { cash: null, bank: null, hasAmount: false };
    }
  };

  // Collapsible parent accounts state in COA table
  const [expandedParents, setExpandedParents] = useState({});

  // Modal states
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);

  const fetchData = async (overrideFrom = null, overrideTo = null) => {
    setLoading(true);
    setError(null);
    try {
      const activeCid = localStorage.getItem('active_company_id') || '';
      let txnUrl = '/api/transactions/';
      const fDate = overrideFrom !== null ? overrideFrom : dateFilter.from_date;
      const tDate = overrideTo !== null ? overrideTo : dateFilter.to_date;
      const params = [];
      if (activeCid) params.push(`company_id=${encodeURIComponent(activeCid)}`);
      if (fDate) params.push(`from_date=${encodeURIComponent(fDate)}`);
      if (tDate) params.push(`to_date=${encodeURIComponent(tDate)}`);
      if (params.length > 0) txnUrl += `?${params.join('&')}`;

      const subParams = [];
      if (activeCid) subParams.push(`company_id=${encodeURIComponent(activeCid)}`);
      if (fDate) subParams.push(`from_date=${encodeURIComponent(fDate)}`);
      if (tDate) subParams.push(`to_date=${encodeURIComponent(tDate)}`);
      const subQs = subParams.length > 0 ? `?${subParams.join('&')}` : '';

      let recUrl = `/api/company/receivables${subQs}`;
      let payUrl = `/api/company/payables${subQs}`;
      let coaUrl = activeCid ? `/api/company/chart-of-accounts?company_id=${encodeURIComponent(activeCid)}` : '/api/company/chart-of-accounts';
      let plUrl = `/api/ledger/profit_loss${subQs}`;
      let bankUrl = activeCid ? `/api/bank-ingestion/transactions?company_id=${encodeURIComponent(activeCid)}&limit=100` : '/api/bank-ingestion/transactions?limit=100';

      const [txnRes, coaRes, plRes, recRes, payRes, bankRes] = await Promise.allSettled([
        fetch(txnUrl),
        fetch(coaUrl),
        fetch(plUrl),
        fetch(recUrl),
        fetch(payUrl),
        fetch(bankUrl)
      ]);

      // 1. Transactions
      if (txnRes.status === 'fulfilled' && txnRes.value.ok) {
        const txnData = await txnRes.value.json();
        setTransactions(txnData.transactions || []);
      }

      // 2. Chart of Accounts
      if (coaRes.status === 'fulfilled' && coaRes.value.ok) {
        const coaData = await coaRes.value.json();
        setChartOfAccounts(coaData.chart_of_accounts || []);
      }

      // 3. Overview financial metrics
      let inc = 0;
      let exp = 0;
      let ar = 0;
      let ap = 0;

      if (plRes.status === 'fulfilled' && plRes.value.ok) {
        const plData = await plRes.value.json();
        inc = Number(plData.total_revenue || 0);
        exp = Number((plData.total_cogs || 0) + (plData.total_expenses || 0));
      }

      if (recRes.status === 'fulfilled' && recRes.value.ok) {
        const recData = await recRes.value.json();
        ar = Number(recData.total_outstanding || 0);
      }

      if (payRes.status === 'fulfilled' && payRes.value.ok) {
        const payData = await payRes.value.json();
        ap = Number(payData.total_outstanding || 0);
      }

      setFinancialMetrics({
        totalIncome: inc,
        totalExpenses: exp,
        accountsReceivable: ar,
        accountsPayable: ap
      });

    } catch (err) {
      console.error('Error fetching workspace data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyWorkspaceDateFilter = (newFilter) => {
    setDateFilter(newFilter);
    fetchData(newFilter.from_date, newFilter.to_date);
    if (selectedBook) {
      fetchBookSummary(selectedBook, newFilter.from_date, newFilter.to_date);
    }
  };

  const handleResetWorkspaceDateFilter = () => {
    const defaultFilter = {
      mode: 'ALL',
      month: String(new Date().getMonth() + 1).padStart(2, '0'),
      year: String(new Date().getFullYear()),
      specific_date: '',
      from_date: '',
      to_date: '',
      as_at_date: '',
      label: 'All Dates (Full History)'
    };
    setDateFilter(defaultFilter);
    fetchData('', '');
    if (selectedBook) {
      fetchBookSummary(selectedBook, '', '');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchDocumentDetail = async (docId) => {
    try {
      const res = await fetch(`/api/documents/${docId}`);
      if (!res.ok) throw new Error('Document not found');
      const docData = await res.json();
      setSelectedDoc(docData);
    } catch (err) {
      alert(`Could not load document ${docId}: ${err.message}`);
    }
  };

  const toggleParentExpand = (accountCode, e) => {
    if (e) e.stopPropagation();
    setExpandedParents(prev => ({
      ...prev,
      [accountCode]: !prev[accountCode]
    }));
  };

  // Helper counts
  const getBookTxnCount = (bookName) => {
    return transactions.filter(t => {
      if (t.book_of_prime_entry !== bookName) return false;
      const docType = (t.document_type || '').toLowerCase();
      const bope = (t.book_of_prime_entry || '').toLowerCase();
      if (docType.includes('bank statement') || docType.includes('bank transaction record') || bope.includes('bank statement')) {
        return false;
      }
      return true;
    }).length;
  };

  // Filtered transactions for "All Transactions"
  const filteredTransactions = transactions.filter((txn) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (txn.transaction_id && txn.transaction_id.toLowerCase().includes(q)) ||
      (txn.source_document && txn.source_document.toLowerCase().includes(q)) ||
      (txn.document_type && txn.document_type.toLowerCase().includes(q)) ||
      (txn.accounting_event && txn.accounting_event.toLowerCase().includes(q)) ||
      (txn.book_of_prime_entry && txn.book_of_prime_entry.toLowerCase().includes(q))
    );
  });

  // Filtered transactions for a selected Book of Prime Entry
  const bookTransactions = selectedBook 
    ? transactions.filter(t => t.book_of_prime_entry === selectedBook)
    : [];

  const parseDateTuple = (val) => {
    if (!val) return [0, 0, 0];
    const s = String(val).trim();
    const m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
    
    const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    for (const [mName, mNum] of Object.entries(months)) {
      if (s.toLowerCase().includes(mName)) {
        const nums = (s.match(/\d+/g) || []).map(Number);
        if (nums.length >= 2) {
          const year = nums.find(n => n > 1900) || 2026;
          const day = nums.find(n => n <= 31 && n !== year) || 1;
          return [year, mNum, day];
        }
      }
    }
    return [0, 0, 0];
  };

  // Filtered transactions for a selected Account (sorted newest first by business transaction_date)
  const accountTransactions = selectedAccount
    ? transactions
        .filter(t => {
          const docType = (t.document_type || '').toLowerCase();
          const bope = (t.book_of_prime_entry || '').toLowerCase();
          if (docType.includes('bank statement') || bope.includes('bank statement')) {
            return false;
          }
          if (dateFilter.from_date || dateFilter.to_date) {
            if (!isDateInRange(t.transaction_date, dateFilter.from_date, dateFilter.to_date)) {
              return false;
            }
          }
          const selAccs = t.accounting_analysis?.selected_accounts || [];
          return selAccs.some(a => a.account_code === selectedAccount.account_code);
        })
        .sort((a, b) => {
          const tupleA = parseDateTuple(a.transaction_date);
          const tupleB = parseDateTuple(b.transaction_date);
          if (tupleA[0] !== tupleB[0]) return tupleB[0] - tupleA[0];
          if (tupleA[1] !== tupleB[1]) return tupleB[1] - tupleA[1];
          if (tupleA[2] !== tupleB[2]) return tupleB[2] - tupleA[2];
          return (b.document_id || '').localeCompare(a.document_id || '');
        })
    : [];

  // Collapsible category groups state
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const toggleGroupCollapse = (groupCategory, e) => {
    if (e) e.stopPropagation();
    setCollapsedGroups(prev => ({
      ...prev,
      [groupCategory]: !prev[groupCategory]
    }));
  };

  // Build Structured COA Groups for Formal Accounting Table (matching database parent_id & Master COA order)
  const structuredCOAGroups = COA_STRUCTURE.map(groupMeta => {
    const groupHeader = chartOfAccounts.find(g => g.is_group && g.account_name.toUpperCase() === groupMeta.category.toUpperCase());
    
    const groupAccounts = chartOfAccounts.filter(acc => {
      if (acc.is_group) return false;
      if (groupHeader && acc.parent_id === groupHeader.id) return true;
      const codePrefix = acc.account_code.split('-')[0];
      return groupMeta.codePrefixes.includes(codePrefix);
    }).sort((a, b) => (a.display_order || 0) - (b.display_order || 0) || a.account_code.localeCompare(b.account_code));

    const uniqueAccounts = Array.from(new Set(groupAccounts.map(a => a.account_code)))
      .map(code => groupAccounts.find(a => a.account_code === code));

    return {
      category: groupMeta.category,
      accounts: uniqueAccounts
    };
  }).filter(g => g.accounts.length > 0);

  return (
    <div className="page-container" style={{ padding: '1.5rem 2rem' }}>
      
      {/* Top Header */}
      {(() => {
        const curMod = getModuleInfo(activeTab);
        return (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ 
                  backgroundColor: '#EFF6FF', 
                  color: 'var(--primary-color)', 
                  padding: '0.55rem', 
                  borderRadius: '8px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}>
                  <LayoutDashboard size={22} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Accounting Workspace
                    {activeTab !== 'overview' && curMod && (
                      <span style={{ fontSize: '1.05rem', fontWeight: 500, color: 'var(--text-secondary)', marginLeft: '0.65rem' }}>
                        — {curMod.name}
                      </span>
                    )}
                  </h2>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem', marginBottom: 0 }}>
                    {activeTab === 'overview' 
                      ? "Manage your company's accounting records and daily financial activities." 
                      : (curMod?.shortDesc || "Manage your company's accounting records and daily financial activities.")}
                  </p>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              {activeTab !== 'overview' && (
                <button
                  className="btn btn-secondary"
                  onClick={() => handleTabClick('overview')}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', fontSize: '0.85rem' }}
                >
                  <ArrowLeft size={14} />
                  <span>Back to Overview</span>
                </button>
              )}

              <button 
                className="btn btn-secondary" 
                onClick={handleRefreshActiveTab}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', fontSize: '0.85rem' }}
              >
                <RefreshCw size={14} className={loading ? 'spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        );
      })()}

      {/* Clean Module Navigation Bar */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem', 
        borderBottom: '1px solid var(--border-color)', 
        marginBottom: '1.25rem',
        paddingBottom: '0.75rem'
      }}>
        {/* Navigation Tabs: Overview & Active Module */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => handleTabClick('overview')}
            style={{
              padding: '0.5rem 0.95rem',
              borderRadius: '7px',
              fontSize: '0.85rem',
              fontWeight: activeTab === 'overview' ? 700 : 500,
              cursor: 'pointer',
              backgroundColor: activeTab === 'overview' ? 'var(--accent-primary)' : 'transparent',
              color: activeTab === 'overview' ? '#ffffff' : 'var(--text-secondary)',
              border: activeTab === 'overview' ? '1px solid var(--accent-primary)' : '1px solid transparent',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              transition: 'all 0.15s ease'
            }}
          >
            <LayoutDashboard size={15} />
            <span>Overview</span>
          </button>

          {activeTab !== 'overview' && (() => {
            const currentMod = getModuleInfo(activeTab);
            const Icon = currentMod?.icon || LayoutDashboard;
            return (
              <div
                style={{
                  padding: '0.5rem 0.95rem',
                  borderRadius: '7px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  backgroundColor: 'var(--accent-primary)',
                  color: '#ffffff',
                  border: '1px solid var(--accent-primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem'
                }}
              >
                <Icon size={15} />
                <span>{currentMod?.name || activeTab}</span>
              </div>
            );
          })()}
        </div>

        {/* Dropdown Selector: "Select a module" */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="top-module-selector" style={{ fontSize: '0.835rem', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            Select a module:
          </label>
          <div style={{ position: 'relative', minWidth: '240px' }}>
            <select
              id="top-module-selector"
              className="input-field"
              value={activeTab === 'overview' ? '' : activeTab}
              onChange={(e) => {
                if (e.target.value) {
                  handleTabClick(e.target.value);
                } else {
                  handleTabClick('overview');
                }
              }}
              style={{
                padding: '0.45rem 2.2rem 0.45rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontSize: '0.835rem',
                fontWeight: 500,
                cursor: 'pointer',
                width: '100%',
                appearance: 'none',
                WebkitAppearance: 'none'
              }}
            >
              <option value="">Select a module</option>
              {ACCOUNTING_MODULES.map((m, idx) => (
                <option key={m.id} value={m.id}>
                  {idx + 1}. {m.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }} />
          </div>
        </div>
      </div>

      {/* Consistent Workspace Date Filter Bar */}
      <AccountingDateFilter
        currentFilter={dateFilter}
        onApplyFilter={handleApplyWorkspaceDateFilter}
        onResetFilter={handleResetWorkspaceDateFilter}
      />

      {/* Error Banner */}
      {error && (
        <div style={{ 
          backgroundColor: 'rgba(244, 63, 94, 0.1)', 
          border: '1px solid #f43f5e', 
          color: '#f43f5e',
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

      {/* ========================================================================= */}
      {/* SECTION 1: OVERVIEW MAIN ENTRY POINT & DASHBOARD */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Overview Summary Cards: Total Income, Total Expenses, Receivables, Payables */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Financial Overview & Key Balances
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0' }}>
                  Live metrics calculated from confirmed journals and subsidiary ledgers.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              
              {/* Card 1: Total Income */}
              <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                      Total Income
                    </span>
                    <div style={{ fontSize: '1.55rem', fontWeight: 700, color: '#10B981', marginTop: '0.35rem', fontFamily: 'var(--font-mono)' }}>
                      RM {formatAmount(financialMetrics.totalIncome)}
                    </div>
                  </div>
                  <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10B981', padding: '0.55rem', borderRadius: '8px' }}>
                    <TrendingUp size={20} />
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.6rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                  Recognized revenue & sales turnover
                </div>
              </div>

              {/* Card 2: Total Expenses */}
              <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                      Total Expenses
                    </span>
                    <div style={{ fontSize: '1.55rem', fontWeight: 700, color: '#EF4444', marginTop: '0.35rem', fontFamily: 'var(--font-mono)' }}>
                      RM {formatAmount(financialMetrics.totalExpenses)}
                    </div>
                  </div>
                  <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#EF4444', padding: '0.55rem', borderRadius: '8px' }}>
                    <TrendingDown size={20} />
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.6rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                  Cost of sales & operational expenditures
                </div>
              </div>

              {/* Card 3: Accounts Receivable */}
              <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                      Accounts Receivable
                    </span>
                    <div style={{ fontSize: '1.55rem', fontWeight: 700, color: '#2563EB', marginTop: '0.35rem', fontFamily: 'var(--font-mono)' }}>
                      RM {formatAmount(financialMetrics.accountsReceivable)}
                    </div>
                  </div>
                  <div style={{ backgroundColor: '#EFF6FF', color: '#2563EB', padding: '0.55rem', borderRadius: '8px' }}>
                    <Users size={20} />
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.6rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Customer debtors balance</span>
                  <button 
                    onClick={() => handleTabClick('receivables')}
                    style={{ background: 'none', border: 'none', color: 'var(--primary-color)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                  >
                    View →
                  </button>
                </div>
              </div>

              {/* Card 4: Accounts Payable */}
              <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                      Accounts Payable
                    </span>
                    <div style={{ fontSize: '1.55rem', fontWeight: 700, color: '#F59E0B', marginTop: '0.35rem', fontFamily: 'var(--font-mono)' }}>
                      RM {formatAmount(financialMetrics.accountsPayable)}
                    </div>
                  </div>
                  <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#F59E0B', padding: '0.55rem', borderRadius: '8px' }}>
                    <Building size={20} />
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.6rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Trade creditors payable</span>
                  <button 
                    onClick={() => handleTabClick('payables')}
                    style={{ background: 'none', border: 'none', color: 'var(--primary-color)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                  >
                    View →
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Section 2: Accounting Modules */}
          <div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '1rem',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Accounting Modules
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0' }}>
                  Select an accounting module from the dropdown or click any module card below.
                </p>
              </div>

              {/* Dropdown Selector inside Accounting Modules section */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <label htmlFor="overview-module-select" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                  Select a module:
                </label>
                <div style={{ position: 'relative', minWidth: '270px' }}>
                  <select
                    id="overview-module-select"
                    className="input-field"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleTabClick(e.target.value);
                      }
                    }}
                    style={{
                      padding: '0.55rem 2.4rem 0.55rem 0.95rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      width: '100%',
                      appearance: 'none',
                      WebkitAppearance: 'none'
                    }}
                  >
                    <option value="">Select a module</option>
                    {ACCOUNTING_MODULES.map((m, idx) => (
                      <option key={m.id} value={m.id}>
                        {idx + 1}. {m.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={15} style={{ position: 'absolute', right: '0.85rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }} />
                </div>
              </div>
            </div>

            {/* Clean, Unified 8-Module Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              {ACCOUNTING_MODULES.map((mod, idx) => {
                const Icon = mod.icon;
                return (
                  <div
                    key={mod.id}
                    className="card"
                    onClick={() => handleTabClick(mod.id)}
                    style={{
                      padding: '1.25rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'all 0.18s ease',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--primary-color)';
                      e.currentTarget.style.boxShadow = '0 4px 14px rgba(37, 99, 235, 0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-color)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <div style={{ backgroundColor: mod.badgeBg, color: mod.badgeColor, padding: '0.5rem', borderRadius: '8px' }}>
                            <Icon size={20} />
                          </div>
                          <div>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              Module #{idx + 1}
                            </span>
                            <h4 style={{ fontSize: '0.975rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                              {mod.name}
                            </h4>
                          </div>
                        </div>
                      </div>
                      <p style={{ fontSize: '0.815rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0', lineHeight: 1.45 }}>
                        {mod.shortDesc}
                      </p>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.65rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--primary-color)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span>Open {mod.name}</span>
                        <ArrowRight size={13} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Accounting Activity Section */}
          <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Recent Accounting Activity
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                  Latest transactions extracted and assigned by the Accounting Agent.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('transactions')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary-color)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem'
                }}
              >
                <span>View All Transactions</span>
                <ArrowRight size={14} />
              </button>
            </div>

            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <RefreshCw size={20} className="spin" style={{ marginBottom: '0.5rem' }} />
                <div>Loading recent activity...</div>
              </div>
            ) : transactions.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Receipt size={32} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>No Transactions Recorded Yet</div>
                <div style={{ fontSize: '0.8rem' }}>Upload documents to generate accounting activity.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Source Document</th>
                      <th>Book of Prime Entry</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.slice(0, 5).map((txn) => {
                      const isBankStmt = txn.document_type === 'Bank Statement' || txn.document_type === 'Bank Transaction Record';
                      const isReview = txn.needs_review && !isBankStmt;
                      const statusText = isBankStmt ? 'Pending Reconciliation' : (isReview ? 'Needs Review' : txn.status);
                      const statusBadge = isBankStmt ? 'RECONCILIATION_PENDING' : (isReview ? 'ERROR' : (txn.status === 'Completed' ? 'EXTRACTED' : 'PROCESSING'));
                      return (
                        <tr key={txn.transaction_id}>
                          <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {formatDisplayDate(txn.transaction_date)}
                          </td>
                          <td>
                            {txn.document_id ? (
                              <button
                                onClick={() => fetchDocumentDetail(txn.document_id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  color: 'var(--primary-color)',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  fontSize: '0.875rem',
                                  textAlign: 'left'
                                }}
                              >
                                {txn.source_document}
                              </button>
                            ) : (
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{txn.source_document}</span>
                            )}
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              {txn.transaction_id}
                            </div>
                          </td>
                          <td>
                            <button
                              onClick={() => {
                                setActiveTab('books');
                                setSelectedBook(txn.book_of_prime_entry);
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--status-success-text)',
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                padding: 0,
                                textAlign: 'left'
                              }}
                              title="Click to view book"
                            >
                              {txn.book_of_prime_entry}
                            </button>
                          </td>
                          <td>
                            <span className={`status-badge ${statusBadge}`}>
                              {statusText}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'flex-end' }}>
                              <button
                                className="btn btn-secondary"
                                onClick={() => setSelectedTxn(txn)}
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                              >
                                <Eye size={12} />
                                <span>View Details</span>
                              </button>
                              {txn.document_id && (
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => fetchDocumentDetail(txn.document_id)}
                                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                  title="View original supporting document"
                                >
                                  <FileText size={12} />
                                  <span>View Doc</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            
            <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setActiveTab('transactions')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary-color)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem'
                }}
              >
                <span>View All Transactions →</span>
              </button>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: ALL TRANSACTIONS */}
      {/* ========================================================================= */}
      {(activeTab === 'transactions' || activeTab === 'all') && (
        <div>
          {/* Search Bar */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '450px' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text"
                className="input-field"
                placeholder="Search by Transaction ID, document, accounting event, or BOPE..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '2.4rem' }}
              />
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <RefreshCw size={24} className="spin" style={{ marginBottom: '0.5rem' }} />
                <div>Loading accounting transactions...</div>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Receipt size={36} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
                <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Accounting Transactions Found</h4>
                <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  {searchQuery ? 'No transactions match your search filter.' : 'Upload an accounting document to automatically generate transactions.'}
                </p>
              </div>
            ) : (
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Transaction ID</th>
                    <th>Source Document</th>
                    <th>Document Type</th>
                    <th>Accounting Event</th>
                    <th>Book of Prime Entry</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((txn) => {
                    const isBankStmt = txn.document_type === 'Bank Statement' || txn.document_type === 'Bank Transaction Record';
                    const isStockTake = txn.document_type === 'Stock Take' || (txn.source_document || '').includes('SK-');
                    const isReview = txn.needs_review && !isBankStmt && !isStockTake;
                    const statusText = isBankStmt ? 'Pending Reconciliation' : (isStockTake ? 'Pending Approval' : (isReview ? 'Needs Review' : txn.status));
                    const statusBadge = isBankStmt ? 'RECONCILIATION_PENDING' : (isStockTake ? 'DRAFT' : (isReview ? 'ERROR' : (txn.status === 'Completed' ? 'EXTRACTED' : 'PROCESSING')));
                    return (
                      <tr key={txn.transaction_id}>
                        <td>
                          <span className="doc-id-pill" style={{ backgroundColor: isBankStmt ? '#E5F5F7' : '#EFF6FF', color: isBankStmt ? '#147D8C' : 'var(--primary-color)', border: isBankStmt ? '1px solid #BCE3E8' : '1px solid #BFDBFE' }}>
                            {txn.transaction_id}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{txn.source_document}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{txn.document_id}</div>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{txn.document_type}</span>
                        </td>
                        <td>
                          <div style={{ maxWidth: '280px', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                            {txn.accounting_event}
                          </div>
                        </td>
                        <td>
                          <button
                            onClick={() => {
                              if ((txn.book_of_prime_entry || '').includes('Inventory')) {
                                setActiveTab('inventory');
                              } else {
                                setActiveTab('books');
                                setSelectedBook(txn.book_of_prime_entry);
                              }
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--status-success-text)',
                              fontWeight: 600,
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              padding: 0,
                              textAlign: 'left'
                            }}
                            title="Click to view all transactions in this Book of Prime Entry"
                          >
                            {txn.book_of_prime_entry}
                          </button>
                        </td>
                        <td>
                          <span className={`status-badge ${statusBadge}`}>
                            {statusText}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {formatDisplayDate(txn.transaction_date)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-secondary"
                              onClick={() => setSelectedTxn(txn)}
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                              <Eye size={13} />
                              <span>View Details</span>
                            </button>
                            {txn.document_id && (
                              <button
                                className="btn btn-secondary"
                                onClick={() => fetchDocumentDetail(txn.document_id)}
                                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                title="View original supporting document and extracted breakdown"
                              >
                                <FileText size={13} />
                                <span>View Document</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      
      {/* ========================================================================= */}
      {/* TAB: BANK TRANSACTIONS */}
      {/* ========================================================================= */}
      {activeTab === 'bank_transactions' && (
        <div>
          {/* Header controls: Search & Direction Filter */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '420px' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text"
                className="input-field"
                placeholder="Search bank transaction ID, description, or account..."
                value={bankSearchQuery}
                onChange={(e) => setBankSearchQuery(e.target.value)}
                style={{ paddingLeft: '2.4rem' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Direction:</span>
              <button
                className={`btn btn-sm ${bankDirectionFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setBankDirectionFilter('ALL')}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
              >
                All ({bankTransactions.length})
              </button>
              <button
                className={`btn btn-sm ${bankDirectionFilter === 'IN' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setBankDirectionFilter('IN')}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
              >
                Money In ({bankTransactions.filter(t => Number(t.money_in || 0) > 0).length})
              </button>
              <button
                className={`btn btn-sm ${bankDirectionFilter === 'OUT' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setBankDirectionFilter('OUT')}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
              >
                Money Out ({bankTransactions.filter(t => Number(t.money_out || 0) > 0).length})
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {(() => {
              const filteredBank = bankTransactions.filter((tx) => {
                if (bankDirectionFilter === 'IN' && !(Number(tx.money_in || 0) > 0)) return false;
                if (bankDirectionFilter === 'OUT' && !(Number(tx.money_out || 0) > 0)) return false;
                if (!bankSearchQuery) return true;
                const q = bankSearchQuery.toLowerCase();
                return (
                  (tx.bank_transaction_id || '').toLowerCase().includes(q) ||
                  (tx.description || '').toLowerCase().includes(q) ||
                  (tx.account_number || '').toLowerCase().includes(q) ||
                  (tx.suggested_account_name || '').toLowerCase().includes(q)
                );
              });

              if (loading) {
                return (
                  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw size={24} className="spin" style={{ marginBottom: '0.5rem' }} />
                    <div>Loading bank transactions...</div>
                  </div>
                );
              }

              if (filteredBank.length === 0) {
                return (
                  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Landmark size={36} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
                    <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Bank Transactions Found</h4>
                    <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                      {bankSearchQuery ? 'No transactions match your search filter.' : 'No imported bank transactions recorded for this company.'}
                    </p>
                  </div>
                );
              }

              return (
                <div style={{ overflowX: 'auto' }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Bank Txn ID</th>
                        <th>Account No</th>
                        <th>Date</th>
                        <th>Description</th>
                        <th style={{ textAlign: 'right' }}>Money In</th>
                        <th style={{ textAlign: 'right' }}>Money Out</th>
                        <th>Extraction</th>
                        <th>Matching</th>
                        <th>Reconciliation</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBank.map((tx) => {
                        const mIn = Number(tx.money_in || 0);
                        const mOut = Number(tx.money_out || 0);
                        const isMatched = tx.match_status === 'MATCHED' && tx.matched_document_id;
                        return (
                          <tr key={tx.id || tx.bank_transaction_id}>
                            <td>
                              <span className="doc-id-pill" style={{ backgroundColor: '#E5F5F7', color: '#147D8C', border: '1px solid #BCE3E8' }}>
                                {tx.bank_transaction_id}
                              </span>
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              {tx.account_number || '4320-6210-4821'}
                            </td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {formatDisplayDate(tx.transaction_date)}
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)', maxWidth: '280px' }}>
                                {tx.description}
                              </div>
                              {tx.reference && tx.reference !== '-' && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ref: {tx.reference}</div>
                              )}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: mIn > 0 ? '#059669' : 'var(--text-muted)' }}>
                              {mIn > 0 ? `RM ${formatAmount(mIn)}` : '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: mOut > 0 ? '#DC2626' : 'var(--text-muted)' }}>
                              {mOut > 0 ? `RM ${formatAmount(mOut)}` : '—'}
                            </td>
                            <td>
                              <span className="status-badge EXTRACTED" style={{ fontSize: '0.75rem' }}>
                                Extracted
                              </span>
                            </td>
                            <td>
                              <span className={`status-badge ${isMatched ? 'EXTRACTED' : 'UNMATCHED'}`} style={{ fontSize: '0.75rem' }}>
                                {isMatched ? 'Matched' : 'Unmatched'}
                              </span>
                            </td>
                            <td>
                              <span className={`status-badge ${tx.reconciliation_status === 'RECONCILED' ? 'EXTRACTED' : 'RECONCILIATION_PENDING'}`} style={{ fontSize: '0.75rem' }}>
                                {tx.reconciliation_status === 'RECONCILED' ? 'Reconciled' : 'Unreconciled'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'flex-end' }}>
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => {
                                    setSelectedBankTx(tx);
                                    setIsBankModalOpen(true);
                                  }}
                                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                >
                                  <Eye size={12} />
                                  <span>View Details</span>
                                </button>
                                {tx.matched_document_id && (
                                  <button
                                    className="btn btn-secondary"
                                    onClick={() => fetchDocumentDetail(tx.matched_document_id)}
                                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                    title="View matched supporting document"
                                  >
                                    <FileText size={12} />
                                    <span>View Doc</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>

          {/* Bank Transaction Detail Modal */}
          {selectedBankTx && (
            <BankTransactionDetailModal
              isOpen={isBankModalOpen}
              onClose={() => {
                setIsBankModalOpen(false);
                setSelectedBankTx(null);
              }}
              transaction={selectedBankTx}
              onViewDocument={(docId) => {
                setIsBankModalOpen(false);
                fetchDocumentDetail(docId);
              }}
            />
          )}
        </div>
      )}


      {/* ========================================================================= */}
      {/* TAB 2: BOOKS OF PRIME ENTRY */}
      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* TAB 2: BOOKS OF PRIME ENTRY */}
      {/* ========================================================================= */}
      {activeTab === 'books' && (
        <div>
          {!selectedBook ? (
            /* Main List of Books of Prime Entry Grid */
            <div>
              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>BOOKS OF PRIME ENTRY</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Books of first entry where accounting events are initially classified before General Ledger posting. Select a book to inspect its formal accounting format.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                {BOOKS_OF_PRIME_ENTRY.map((book) => {
                  const count = getBookTxnCount(book.name);
                  return (
                    <div 
                      key={book.id}
                      onClick={() => {
                        setSelectedBook(book.name);
                        setBookSearchQuery('');
                        setBookDateFilter('');
                      }}
                      style={{ 
                        backgroundColor: 'var(--bg-card)', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: '10px', 
                        padding: '1.25rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--primary-color)';
                        e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                        e.currentTarget.style.backgroundColor = 'var(--bg-card)';
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{book.name}</h4>
                          <span className="doc-id-pill" style={{ 
                            fontSize: '0.75rem', 
                            backgroundColor: count > 0 ? 'rgba(52, 211, 153, 0.15)' : 'rgba(148, 163, 184, 0.1)', 
                            color: count > 0 ? '#34d399' : '#94a3b8',
                            border: `1px solid ${count > 0 ? '#34d399' : 'var(--border-color)'}`
                          }}>
                            {count} transaction{count === 1 ? '' : 's'}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary-color)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                          {book.category}
                        </div>

                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                          {book.desc}
                        </p>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: '#60a5fa', marginTop: '1rem', fontWeight: 600 }}>
                        <span>Explore Book Transactions</span>
                        <ChevronRight size={14} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Selected Book Specialized Accounting View */
            (() => {
              const currentBookMeta = BOOKS_OF_PRIME_ENTRY.find(b => b.name === selectedBook) || {
                name: selectedBook,
                subtitle: 'Record of Accounting Transactions'
              };
              const filteredBookTxns = getFilteredBookTransactions(selectedBook);

              return (
                <div>
                  {/* Top Bar with Back Button & Book Title */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => {
                          setSelectedBook(null);
                          setBookSearchQuery('');
                          setFromDate('');
                          setToDate('');
                          setBookSummary(null);
                        }}
                        style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <ArrowLeft size={15} />
                        <span>Back to Books List</span>
                      </button>

                      <div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                          {selectedBook}
                        </h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--primary-color)', fontWeight: 500, marginTop: '0.1rem' }}>
                          {currentBookMeta.subtitle || currentBookMeta.desc}
                        </p>
                      </div>
                    </div>
                  </div>

                    {/* Filter & Export Control Bar */}
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '1rem',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: '#F8FAFC',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '0.85rem 1.25rem',
                      marginBottom: '1rem'
                    }}>
                      {/* Left: Date Range Inputs */}
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>From Date</label>
                          <input 
                            type="date" 
                            className="input-field" 
                            value={fromDate} 
                            onChange={(e) => { setFromDate(e.target.value); setDateFilterError(null); }}
                            style={{ fontSize: '0.8rem', height: '34px', padding: '0.2rem 0.6rem' }}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>To Date</label>
                          <input 
                            type="date" 
                            className="input-field" 
                            value={toDate} 
                            onChange={(e) => { setToDate(e.target.value); setDateFilterError(null); }}
                            style={{ fontSize: '0.8rem', height: '34px', padding: '0.2rem 0.6rem' }}
                          />
                        </div>

                        <button
                          className="btn btn-primary"
                          onClick={handleApplyDateFilter}
                          disabled={loadingBookSummary}
                          style={{ alignSelf: 'flex-end', height: '34px', fontSize: '0.8rem', padding: '0 0.85rem' }}
                        >
                          {loadingBookSummary ? <RefreshCw size={13} className="spin" /> : 'Apply Filter'}
                        </button>

                        {(fromDate || toDate) && (
                          <button
                            className="btn btn-secondary"
                            onClick={handleClearDateFilter}
                            style={{ alignSelf: 'flex-end', height: '34px', fontSize: '0.8rem', padding: '0 0.65rem' }}
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {/* Right: Search & Export PDF */}
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', width: '220px' }}>
                          <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                          <input 
                            type="text"
                            className="input-field"
                            placeholder="Search transactions..."
                            value={bookSearchQuery}
                            onChange={(e) => setBookSearchQuery(e.target.value)}
                            style={{ paddingLeft: '2.2rem', fontSize: '0.8rem', height: '34px' }}
                          />
                        </div>

                        <button
                          className="btn"
                          onClick={handleExportPDF}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            height: '34px',
                            fontSize: '0.8rem',
                            backgroundColor: '#0284c7',
                            color: '#ffffff',
                            border: 'none',
                            fontWeight: 600,
                            padding: '0 1rem',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                        >
                          <FileText size={15} />
                          <span>Export PDF</span>
                        </button>
                      </div>

                      {dateFilterError && (
                        <div style={{ width: '100%', color: '#f43f5e', fontSize: '0.8rem', fontWeight: 600, marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <AlertCircle size={14} />
                          <span>{dateFilterError}</span>
                        </div>
                      )}
                    </div>

                  {/* Active Period & Calculation Agent Status Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--primary-color)', fontWeight: 600 }}>
                      Period: {formatPeriodHeader(fromDate, toDate)}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--status-success-text)', fontWeight: 600, backgroundColor: 'rgba(52, 211, 153, 0.1)', padding: '0.2rem 0.65rem', borderRadius: '4px', border: '1px solid rgba(52, 211, 153, 0.3)' }}>
                      <CheckCircle2 size={13} />
                      <span>Calculation: Verified</span>
                    </div>
                  </div>

                  {/* ========================================================================= */}
                  {/* BOOK TYPE 1: SALES DAY BOOK */}
                  {/* ========================================================================= */}
                  {selectedBook === 'Sales Day Book' && (
                    <div className="card" style={{ padding: 0, overflowY: 'auto', maxHeight: '520px', border: '1px solid var(--border-color)' }}>
                      {filteredBookTxns.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                          <BookOpen size={36} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
                          <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Credit Sales Recorded</h4>
                          <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                            {bookSearchQuery || fromDate || toDate ? 'No credit sales match your current search/date criteria.' : 'No verified credit sales documents belong to Sales Day Book yet.'}
                          </p>
                        </div>
                      ) : (
                        <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead style={{ position: 'sticky', top: 0, zIndex: 5, backgroundColor: '#F8FAFC' }}>
                            <tr>
                              <th style={{ width: '120px' }}>Date</th>
                              <th>Details</th>
                              <th style={{ width: '160px' }}>Invoice No.</th>
                              <th style={{ width: '140px' }}>Folio</th>
                              <th style={{ width: '140px', textAlign: 'right' }}>Amount (RM)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredBookTxns.map((txn) => (
                              <tr key={txn.transaction_id}>
                                <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                  {formatDisplayDate(txn.transaction_date)}
                                </td>
                                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {getTxnDetails(txn, 'Customer')}
                                </td>
                                <td>
                                  <button
                                    onClick={() => fetchDocumentDetail(txn.document_id)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      padding: 0,
                                      color: 'var(--primary-color)',
                                      fontFamily: 'var(--font-mono)',
                                      fontSize: '0.85rem',
                                      fontWeight: 600,
                                      textDecoration: 'underline',
                                      textUnderlineOffset: '3px',
                                      cursor: 'pointer'
                                    }}
                                    title="Click to view full Document Details & Source Preview"
                                  >
                                    {getTxnReferenceNo(txn, 'invoice')}
                                  </button>
                                </td>
                                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-color)', fontWeight: 600, fontSize: '0.85rem' }}>
                                  {getTxnFolio(txn)}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                                  {formatAmount(txn.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 5, backgroundColor: '#F8FAFC' }}>
                            <tr style={{ backgroundColor: '#F8FAFC', borderTop: '2px solid var(--border-color)' }}>
                              <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                                TOTAL
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--status-success-text)', fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}>
                                {formatAmount(bookSummary?.calculation?.total_amount ?? filteredBookTxns.reduce((s, t) => s + (t.amount || 0), 0))}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* BOOK TYPE 2: SALES RETURNS DAY BOOK */}
                  {/* ========================================================================= */}
                  {selectedBook === 'Sales Returns Day Book' && (
                    <div className="card" style={{ padding: 0, overflowY: 'auto', maxHeight: '520px', border: '1px solid var(--border-color)' }}>
                      {filteredBookTxns.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                          <BookOpen size={36} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
                          <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Sales Returns Recorded</h4>
                          <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                            {bookSearchQuery || fromDate || toDate ? 'No sales returns match your current search/date criteria.' : 'No verified customer credit notes belong to Sales Returns Day Book yet.'}
                          </p>
                        </div>
                      ) : (
                        <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead style={{ position: 'sticky', top: 0, zIndex: 5, backgroundColor: '#F8FAFC' }}>
                            <tr>
                              <th style={{ width: '120px' }}>Date</th>
                              <th>Details</th>
                              <th style={{ width: '160px' }}>Credit Note No.</th>
                              <th style={{ width: '140px' }}>Folio</th>
                              <th style={{ width: '140px', textAlign: 'right' }}>Amount (RM)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredBookTxns.map((txn) => (
                              <tr key={txn.transaction_id}>
                                <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                  {formatDisplayDate(txn.transaction_date)}
                                </td>
                                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {getTxnDetails(txn, 'Customer')}
                                </td>
                                <td>
                                  <button
                                    onClick={() => fetchDocumentDetail(txn.document_id)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      padding: 0,
                                      color: 'var(--primary-color)',
                                      fontFamily: 'var(--font-mono)',
                                      fontSize: '0.85rem',
                                      fontWeight: 600,
                                      textDecoration: 'underline',
                                      textUnderlineOffset: '3px',
                                      cursor: 'pointer'
                                    }}
                                    title="Click to view full Document Details & Source Preview"
                                  >
                                    {getTxnReferenceNo(txn, 'credit_note')}
                                  </button>
                                </td>
                                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-color)', fontWeight: 600, fontSize: '0.85rem' }}>
                                  {getTxnFolio(txn)}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                                  {formatAmount(txn.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 5, backgroundColor: '#F8FAFC' }}>
                            <tr style={{ backgroundColor: '#F8FAFC', borderTop: '2px solid var(--border-color)' }}>
                              <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                                TOTAL
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--status-success-text)', fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}>
                                {formatAmount(bookSummary?.calculation?.total_amount ?? filteredBookTxns.reduce((s, t) => s + (t.amount || 0), 0))}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* BOOK TYPE 3: PURCHASES DAY BOOK */}
                  {/* ========================================================================= */}
                  {selectedBook === 'Purchases Day Book' && (
                    <div className="card" style={{ padding: 0, overflowY: 'auto', maxHeight: '520px', border: '1px solid var(--border-color)' }}>
                      {filteredBookTxns.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                          <BookOpen size={36} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
                          <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Credit Purchases Recorded</h4>
                          <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                            {bookSearchQuery || fromDate || toDate ? 'No credit purchases match your current search/date criteria.' : 'No verified purchase invoices belong to Purchases Day Book yet.'}
                          </p>
                        </div>
                      ) : (
                        <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead style={{ position: 'sticky', top: 0, zIndex: 5, backgroundColor: '#F8FAFC' }}>
                            <tr>
                              <th style={{ width: '120px' }}>Date</th>
                              <th>Details</th>
                              <th style={{ width: '160px' }}>Invoice No.</th>
                              <th style={{ width: '140px' }}>Folio</th>
                              <th style={{ width: '140px', textAlign: 'right' }}>Amount (RM)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredBookTxns.map((txn) => (
                              <tr key={txn.transaction_id}>
                                <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                  {formatDisplayDate(txn.transaction_date)}
                                </td>
                                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {getTxnDetails(txn, 'Vendor')}
                                </td>
                                <td>
                                  <button
                                    onClick={() => fetchDocumentDetail(txn.document_id)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      padding: 0,
                                      color: 'var(--primary-color)',
                                      fontFamily: 'var(--font-mono)',
                                      fontSize: '0.85rem',
                                      fontWeight: 600,
                                      textDecoration: 'underline',
                                      textUnderlineOffset: '3px',
                                      cursor: 'pointer'
                                    }}
                                    title="Click to view full Document Details & Source Preview"
                                  >
                                    {getTxnReferenceNo(txn, 'invoice')}
                                  </button>
                                </td>
                                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-color)', fontWeight: 600, fontSize: '0.85rem' }}>
                                  {getTxnFolio(txn)}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                                  {formatAmount(txn.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 5, backgroundColor: '#F8FAFC' }}>
                            <tr style={{ backgroundColor: '#F8FAFC', borderTop: '2px solid var(--border-color)' }}>
                              <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                                TOTAL
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--status-success-text)', fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}>
                                {formatAmount(bookSummary?.calculation?.total_amount ?? filteredBookTxns.reduce((s, t) => s + (t.amount || 0), 0))}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* BOOK TYPE 4: PURCHASES RETURNS DAY BOOK */}
                  {/* ========================================================================= */}
                  {selectedBook === 'Purchases Returns Day Book' && (
                    <div className="card" style={{ padding: 0, overflowY: 'auto', maxHeight: '520px', border: '1px solid var(--border-color)' }}>
                      {filteredBookTxns.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                          <BookOpen size={36} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
                          <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Purchases Returns Recorded</h4>
                          <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                            {bookSearchQuery || fromDate || toDate ? 'No purchase returns match your current search/date criteria.' : 'No verified supplier credit notes belong to Purchases Returns Day Book yet.'}
                          </p>
                        </div>
                      ) : (
                        <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead style={{ position: 'sticky', top: 0, zIndex: 5, backgroundColor: '#F8FAFC' }}>
                            <tr>
                              <th style={{ width: '120px' }}>Date</th>
                              <th>Details</th>
                              <th style={{ width: '160px' }}>Credit Note No.</th>
                              <th style={{ width: '140px' }}>Folio</th>
                              <th style={{ width: '140px', textAlign: 'right' }}>Amount (RM)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredBookTxns.map((txn) => (
                              <tr key={txn.transaction_id}>
                                <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                  {formatDisplayDate(txn.transaction_date)}
                                </td>
                                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {getTxnDetails(txn, 'Vendor')}
                                </td>
                                <td>
                                  <button
                                    onClick={() => fetchDocumentDetail(txn.document_id)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      padding: 0,
                                      color: 'var(--primary-color)',
                                      fontFamily: 'var(--font-mono)',
                                      fontSize: '0.85rem',
                                      fontWeight: 600,
                                      textDecoration: 'underline',
                                      textUnderlineOffset: '3px',
                                      cursor: 'pointer'
                                    }}
                                    title="Click to view full Document Details & Source Preview"
                                  >
                                    {getTxnReferenceNo(txn, 'credit_note')}
                                  </button>
                                </td>
                                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-color)', fontWeight: 600, fontSize: '0.85rem' }}>
                                  {getTxnFolio(txn)}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                                  {formatAmount(txn.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 5, backgroundColor: '#F8FAFC' }}>
                            <tr style={{ backgroundColor: '#F8FAFC', borderTop: '2px solid var(--border-color)' }}>
                              <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                                TOTAL
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--status-success-text)', fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}>
                                {formatAmount(bookSummary?.calculation?.total_amount ?? filteredBookTxns.reduce((s, t) => s + (t.amount || 0), 0))}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* BOOK TYPE 5: CASH BOOK (Two-Sided Traditional Format) */}
                  {/* ========================================================================= */}
                  {selectedBook === 'Cash Book' && (
                    (() => {
                      const { receipts, payments } = getCashBookSections(filteredBookTxns);
                      const isFiltered = Boolean(fromDate || toDate || bookSearchQuery);
                      
                      const totalReceiptsCash = bookSummary?.calculation?.total_receipts_cash ?? 0;
                      const totalReceiptsBank = bookSummary?.calculation?.total_receipts_bank ?? 0;
                      
                      const totalPaymentsCash = bookSummary?.calculation?.total_payments_cash ?? 0;
                      const totalPaymentsBank = bookSummary?.calculation?.total_payments_bank ?? 0;

                      return (
                        <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '1.25rem', alignItems: 'start' }}>
                          
                          {/* 1. LEFT SIDE: CASH INFLOW */}
                          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
                            <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border-color)', backgroundColor: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.05em', textTransform: 'uppercase', margin: 0 }}>
                                CASH INFLOW
                              </h4>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({receipts.length} {receipts.length === 1 ? 'entry' : 'entries'})</span>
                            </div>

                            {receipts.length === 0 ? (
                              <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                <BookOpen size={28} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                                <div>No Cash Book transactions available.</div>
                              </div>
                            ) : (
                              <div style={{ overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' }}>
                                <table className="custom-table cash-book-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                  <thead style={{ position: 'sticky', top: 0, zIndex: 5, backgroundColor: '#F8FAFC' }}>
                                    <tr>
                                      <th style={{ width: '90px' }}>Date</th>
                                      <th>Details</th>
                                      <th style={{ width: '85px', textAlign: 'center' }}>F</th>
                                      <th style={{ width: '45px', textAlign: 'center' }}>Dis</th>
                                      <th style={{ width: '95px', textAlign: 'right' }}>Cash (RM)</th>
                                      <th style={{ width: '95px', textAlign: 'right' }}>Bank (RM)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {receipts.map((txn) => {
                                      const { cash, bank } = getCashBookAmounts(txn);
                                      return (
                                        <tr key={txn.transaction_id}>
                                          <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                            {formatDisplayDate(txn.transaction_date)}
                                          </td>
                                          <td>
                                            <button
                                              onClick={() => fetchDocumentDetail(txn.document_id)}
                                              style={{
                                                background: 'none',
                                                border: 'none',
                                                padding: 0,
                                                color: 'var(--text-primary)',
                                                fontWeight: 600,
                                                fontSize: '0.8rem',
                                                textAlign: 'left',
                                                textDecoration: 'underline',
                                                textUnderlineOffset: '2px',
                                                cursor: 'pointer'
                                              }}
                                              title="Click to view full Document Details & Source Preview"
                                            >
                                              {getTxnDetails(txn, 'Customer')}
                                            </button>
                                          </td>
                                          <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.8rem' }}>
                                            —
                                          </td>
                                          <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                            —
                                          </td>
                                          <td className={`amount-cell ${cash ? '' : 'is-empty'}`} style={{ textAlign: 'right', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                                            {cash ? formatAmount(cash) : '—'}
                                          </td>
                                          <td className={`amount-cell ${bank ? '' : 'is-empty'}`} style={{ textAlign: 'right', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                                            {bank ? formatAmount(bank) : '—'}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 5, backgroundColor: '#F8FAFC' }}>
                                    <tr style={{ backgroundColor: '#F8FAFC', borderTop: '2px solid var(--border-color)' }}>
                                      <td colSpan={4} className="total-label" style={{ textAlign: 'right', fontWeight: 700, letterSpacing: '0.05em', fontSize: '0.78rem' }}>
                                        TOTAL
                                      </td>
                                      <td className="total-amount" style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
                                        {totalReceiptsCash > 0 ? formatAmount(totalReceiptsCash) : '0.00'}
                                      </td>
                                      <td className="total-amount" style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
                                        {totalReceiptsBank > 0 ? formatAmount(totalReceiptsBank) : '0.00'}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            )}
                          </div>

                          {/* 2. RIGHT SIDE: CASH OUTFLOW */}
                          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
                            <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border-color)', backgroundColor: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.05em', textTransform: 'uppercase', margin: 0 }}>
                                CASH OUTFLOW
                              </h4>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({payments.length} {payments.length === 1 ? 'entry' : 'entries'})</span>
                            </div>

                            {payments.length === 0 ? (
                              <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                <BookOpen size={28} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                                <div>No Cash Book transactions available.</div>
                              </div>
                            ) : (
                              <div style={{ overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' }}>
                                <table className="custom-table cash-book-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                  <thead style={{ position: 'sticky', top: 0, zIndex: 5, backgroundColor: '#F8FAFC' }}>
                                    <tr>
                                      <th style={{ width: '90px' }}>Date</th>
                                      <th>Details</th>
                                      <th style={{ width: '85px', textAlign: 'center' }}>F</th>
                                      <th style={{ width: '45px', textAlign: 'center' }}>Dis</th>
                                      <th style={{ width: '95px', textAlign: 'right' }}>Cash (RM)</th>
                                      <th style={{ width: '95px', textAlign: 'right' }}>Bank (RM)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {payments.map((txn) => {
                                      const { cash, bank } = getCashBookAmounts(txn);
                                      return (
                                        <tr key={txn.transaction_id}>
                                          <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                            {formatDisplayDate(txn.transaction_date)}
                                          </td>
                                          <td>
                                            <button
                                              onClick={() => fetchDocumentDetail(txn.document_id)}
                                              style={{
                                                background: 'none',
                                                border: 'none',
                                                padding: 0,
                                                color: 'var(--text-primary)',
                                                fontWeight: 600,
                                                fontSize: '0.8rem',
                                                textAlign: 'left',
                                                textDecoration: 'underline',
                                                textUnderlineOffset: '2px',
                                                cursor: 'pointer'
                                              }}
                                              title="Click to view full Document Details & Source Preview"
                                            >
                                              {getTxnDetails(txn, 'Vendor')}
                                            </button>
                                          </td>
                                          <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.8rem' }}>
                                            —
                                          </td>
                                          <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                            —
                                          </td>
                                          <td className={`amount-cell ${cash ? '' : 'is-empty'}`} style={{ textAlign: 'right', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                                            {cash ? formatAmount(cash) : '—'}
                                          </td>
                                          <td className={`amount-cell ${bank ? '' : 'is-empty'}`} style={{ textAlign: 'right', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                                            {bank ? formatAmount(bank) : '—'}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 5, backgroundColor: '#F8FAFC' }}>
                                    <tr style={{ backgroundColor: '#F8FAFC', borderTop: '2px solid var(--border-color)' }}>
                                      <td colSpan={4} className="total-label" style={{ textAlign: 'right', fontWeight: 700, letterSpacing: '0.05em', fontSize: '0.78rem' }}>
                                        TOTAL
                                      </td>
                                      <td className="total-amount" style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
                                        {totalPaymentsCash > 0 ? formatAmount(totalPaymentsCash) : '0.00'}
                                      </td>
                                      <td className="total-amount" style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
                                        {totalPaymentsBank > 0 ? formatAmount(totalPaymentsBank) : '0.00'}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            )}
                          </div>

                        </div>

                        {/* Dedicated Cash Book Summary Table */}
                        <div style={{ marginTop: '1.5rem', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden', maxWidth: '520px' }}>
                          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', backgroundColor: '#F8FAFC' }}>
                            <h5 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Cash Book Net Movement Summary
                            </h5>
                          </div>
                          <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#F8FAFC' }}>
                                <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: 600 }}>Summary</th>
                                <th style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 600 }}>Cash</th>
                                <th style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 600 }}>Bank</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td style={{ padding: '0.65rem 1rem', fontWeight: 500 }}>Total receipts</td>
                                <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>RM {formatAmount(totalReceiptsCash)}</td>
                                <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#059669' }}>RM {formatAmount(totalReceiptsBank)}</td>
                              </tr>
                              <tr>
                                <td style={{ padding: '0.65rem 1rem', fontWeight: 500 }}>Total payments</td>
                                <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>RM {formatAmount(totalPaymentsCash)}</td>
                                <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#DC2626' }}>RM {formatAmount(totalPaymentsBank)}</td>
                              </tr>
                              <tr style={{ backgroundColor: '#F8FAFC', borderTop: '2px solid var(--border-color)', fontWeight: 700 }}>
                                <td style={{ padding: '0.75rem 1rem' }}>Net movement</td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>RM {formatAmount(totalReceiptsCash - totalPaymentsCash)}</td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: (totalReceiptsBank - totalPaymentsBank) >= 0 ? '#059669' : '#DC2626' }}>RM {formatAmount(totalReceiptsBank - totalPaymentsBank)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        </>
                      );
                    })()
                  )}

                  {/* ========================================================================= */}
                  {/* BOOK TYPE 6: GENERAL JOURNAL */}
                  {/* ========================================================================= */}
                  {selectedBook === 'General Journal' && (
                    <div className="card" style={{ padding: 0, overflowY: 'auto', maxHeight: '520px', border: '1px solid var(--border-color)' }}>
                      {filteredBookTxns.length === 0 ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                          <BookOpen size={36} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
                          <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Journal Entries Recorded</h4>
                          <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                            {bookSearchQuery || fromDate || toDate ? 'No journal entries match your search/date criteria.' : 'No non-routine transactions or manual journal adjustments recorded in General Journal yet.'}
                          </p>
                        </div>
                      ) : (
                        <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead style={{ position: 'sticky', top: 0, zIndex: 5, backgroundColor: '#F8FAFC' }}>
                            <tr>
                              <th style={{ width: '120px' }}>Date</th>
                              <th>Details</th>
                              <th>Account to be Debited</th>
                              <th>Account to be Credited</th>
                              <th style={{ width: '110px' }}>Folio</th>
                              <th style={{ width: '130px', textAlign: 'right' }}>Debit (RM)</th>
                              <th style={{ width: '130px', textAlign: 'right' }}>Credit (RM)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredBookTxns.map((txn) => (
                              <React.Fragment key={txn.transaction_id}>
                                <tr>
                                  <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {formatDisplayDate(txn.transaction_date)}
                                  </td>
                                  <td>
                                    <button
                                      onClick={() => fetchDocumentDetail(txn.document_id)}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
                                        color: 'var(--text-primary)',
                                        fontWeight: 600,
                                        fontSize: '0.85rem',
                                        textAlign: 'left',
                                        textDecoration: 'underline',
                                        textUnderlineOffset: '3px',
                                        cursor: 'pointer'
                                      }}
                                      title="Click to view full Document Details & Source Preview"
                                    >
                                      {getTxnDetails(txn, 'Generic')}
                                    </button>
                                  </td>
                                  <td style={{ fontSize: '0.85rem', color: 'var(--primary-color)' }}>
                                    {txn.accounting_analysis?.selected_accounts?.[0]?.account_name || '—'}
                                  </td>
                                  <td style={{ fontSize: '0.85rem', color: '#a7f3d0' }}>
                                    {txn.accounting_analysis?.selected_accounts?.[1]?.account_name || '—'}
                                  </td>
                                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    {getTxnFolio(txn)}
                                  </td>
                                  <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.875rem' }}>
                                    {formatAmount(txn.amount)}
                                  </td>
                                  <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.875rem' }}>
                                    {formatAmount(txn.amount)}
                                  </td>
                                </tr>
                                {/* Narrative Explanation Sub-row */}
                                <tr style={{ backgroundColor: '#F8FAFC' }}>
                                  <td></td>
                                  <td colSpan={6} style={{ padding: '0.4rem 1rem', fontSize: '0.75rem', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                                    Narrative: {txn.accounting_event || 'Record of non-routine accounting event'}
                                  </td>
                                </tr>
                              </React.Fragment>
                            ))}
                          </tbody>
                          <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 5, backgroundColor: '#F8FAFC' }}>
                            <tr style={{ backgroundColor: '#F8FAFC', borderTop: '2px solid var(--border-color)' }}>
                              <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                                TOTAL
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--status-success-text)', fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}>
                                {formatAmount(bookSummary?.calculation?.total_debit ?? 0)}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--status-success-text)', fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}>
                                {formatAmount(bookSummary?.calculation?.total_credit ?? 0)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  )}

                </div>
              );
            })()
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CHART OF ACCOUNTS (FORMAL TABLE: Description | Acc. No. | Special | Account Type | Up-to-Date Balance) */}
      {/* ========================================================================= */}
      {activeTab === 'accounts' && (
        <div>
          {!selectedAccount ? (
            /* Formal Accounting System Table View matching user prompt columns */
            <div>
              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>CHART OF ACCOUNTS</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Manage account categories and sub-accounts, and view related transactions.
                </p>
              </div>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '0.85rem 1.25rem' }}>Description</th>
                      <th style={{ width: '160px', padding: '0.85rem 1rem' }}>Acc. No.</th>
                      <th style={{ width: '110px', textAlign: 'center', padding: '0.85rem 1rem' }}>Special</th>
                      <th style={{ width: '150px', padding: '0.85rem 1rem' }}>Account Type</th>
                      <th style={{ width: '180px', textAlign: 'center', padding: '0.85rem 1rem' }}>Up-to-Date Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {structuredCOAGroups.map((group) => {
                      const isCollapsed = !!collapsedGroups[group.category];
                      const groupHeaderAcc = group.groupHeader;

                      return (
                        <React.Fragment key={group.category}>
                          {/* Category Section Header Row */}
                          <tr 
                            onClick={(e) => toggleGroupCollapse(group.category, e)}
                            style={{ 
                              backgroundColor: '#F1F5F9', 
                              borderTop: '1px solid var(--border-color)', 
                              borderBottom: '1px solid var(--border-color)',
                              cursor: 'pointer',
                              userSelect: 'none'
                            }}
                            title="Click to expand/collapse sub-accounts"
                          >
                            {/* Column 1: Description with expand icon */}
                            <td style={{ padding: '0.65rem 1.25rem', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.85rem', letterSpacing: '0.05em' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ color: 'var(--primary-color)', display: 'inline-flex', alignItems: 'center' }}>
                                  {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                </span>
                                <span>{group.category}</span>
                                <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#94a3b8', marginLeft: '0.25rem' }}>
                                  ({group.accounts.length})
                                </span>
                              </div>
                            </td>

                            {/* Column 2: Acc. No. */}
                            <td style={{ padding: '0.65rem 1rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#64748b', fontSize: '0.8rem' }}>
                              {groupHeaderAcc ? groupHeaderAcc.account_code : '—'}
                            </td>

                            {/* Column 3: Special */}
                            <td style={{ padding: '0.65rem 1rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              —
                            </td>

                            {/* Column 4: Account Type */}
                            <td style={{ padding: '0.65rem 1rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                              <span className="status-badge EXTRACTED" style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem' }}>
                                {groupHeaderAcc ? groupHeaderAcc.account_type : (group.accounts[0]?.account_type || '—')}
                              </span>
                            </td>

                            {/* Column 5: Up-to-Date Balance */}
                            <td style={{ padding: '0.65rem 1rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                              —
                            </td>
                          </tr>

                          {/* Sub-account Rows */}
                          {!isCollapsed && group.accounts.map((acc) => (
                            <tr 
                              key={acc.account_code}
                              onClick={() => setSelectedAccount(acc)}
                              style={{ 
                                cursor: 'pointer', 
                                transition: 'background-color 0.15s ease',
                                borderBottom: '1px solid var(--border-color)'
                              }}
                              title={`Click to view details and transactions referencing account ${acc.account_code}`}
                            >
                              {/* Column 1: Description */}
                              <td style={{ padding: '0.75rem 1.25rem', paddingLeft: '2.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                                  <span style={{ color: '#64748b', fontSize: '0.8rem' }}>↳</span>
                                  <span>{acc.account_name}</span>
                                </div>
                              </td>

                              {/* Column 2: Acc. No. */}
                              <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--primary-color)', fontSize: '0.85rem' }}>
                                {acc.account_code}
                              </td>

                              {/* Column 3: Special */}
                              <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: (acc.special_code || acc.special) ? '#fbbf24' : 'var(--text-muted)', fontWeight: (acc.special_code || acc.special) ? 600 : 400 }}>
                                {(acc.special_code || acc.special) || '—'}
                              </td>

                              {/* Column 4: Account Type */}
                              <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                                <span className="status-badge EXTRACTED" style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem' }}>
                                  {acc.account_type}
                                </span>
                              </td>

                              {/* Column 5: Up-to-Date Balance */}
                              <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                —
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Selected Account Details & Referencing Transactions */
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setSelectedAccount(null)}
                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <ArrowLeft size={15} />
                  <span>Back to Chart of Accounts</span>
                </button>
              </div>

              {/* Account Details Header Card */}
              <div className="card" style={{ backgroundColor: '#FFFFFF', border: '1px solid var(--primary-color)', padding: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary-color)', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
                  ACCOUNT DETAILS
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.3rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--primary-color)' }}>
                    {selectedAccount.account_code}
                  </span>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {selectedAccount.account_name}
                  </h3>
                  <span className="status-badge EXTRACTED" style={{ fontSize: '0.75rem' }}>
                    {selectedAccount.account_type}
                  </span>
                  {(selectedAccount.special_code || selectedAccount.special) && (
                    <span className="status-badge PROCESSING" style={{ fontSize: '0.75rem', color: '#fbbf24', borderColor: '#78350f' }}>
                      Special: {selectedAccount.special_code || selectedAccount.special}
                    </span>
                  )}
                  <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    Currency: MYR
                  </span>
                </div>
                {selectedAccount.description && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                    {selectedAccount.description}
                  </p>
                )}
              </div>

              {/* Referencing Transactions List */}
              <div style={{ marginBottom: '0.75rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  TRANSACTIONS USING THIS ACCOUNT ({accountTransactions.length})
                </h4>
              </div>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {accountTransactions.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Layers size={36} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
                    <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>TRANSACTIONS USING THIS ACCOUNT (0)</h4>
                    <p style={{ fontSize: '0.85rem', marginTop: '0.35rem', color: 'var(--text-secondary)' }}>
                      No transactions currently reference this account.
                    </p>
                  </div>
                ) : (
                  <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '0.85rem 1.25rem', width: '140px' }}>Date</th>
                        <th style={{ padding: '0.85rem 1rem', width: '160px' }}>Document</th>
                        <th style={{ padding: '0.85rem 1rem', width: '160px' }}>Document ID</th>
                        <th style={{ padding: '0.85rem 1rem', width: '180px' }}>Document Type</th>
                        <th style={{ padding: '0.85rem 1rem' }}>Accounting Event</th>
                        <th style={{ textAlign: 'right', padding: '0.85rem 1.25rem', width: '130px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountTransactions.map((txn) => (
                        <tr key={txn.transaction_id || txn.document_id}>
                          <td style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, padding: '0.75rem 1.25rem' }}>
                            {formatDisplayDate(txn.transaction_date)}
                          </td>
                          <td style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary-color)', padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)' }}>
                            {txn.source_document || '—'}
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', padding: '0.75rem 1rem' }}>
                            {txn.document_id || '—'}
                          </td>
                          <td style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)', padding: '0.75rem 1rem' }}>
                            {txn.document_type || 'Unknown'}
                          </td>
                          <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '350px', padding: '0.75rem 1rem' }}>
                            {txn.accounting_event || 'Unspecified'}
                          </td>
                          <td style={{ textAlign: 'right', padding: '0.75rem 1.25rem' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end' }}>
                              <button
                                className="btn btn-secondary"
                                onClick={() => setSelectedTxn(txn)}
                                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                              >
                                <Eye size={13} />
                                <span>View Details</span>
                              </button>
                              {txn.document_id && (
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => fetchDocumentDetail(txn.document_id)}
                                  style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                  title="View original supporting document"
                                >
                                  <FileText size={13} />
                                  <span>View Doc</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: OPENING BALANCES */}
      {/* ========================================================================= */}
      {activeTab === 'opening_balances' && (
        <OpeningBalancesPage embedMode={true} dateFilter={dateFilter} onViewDocument={fetchDocumentDetail} />
      )}

      {/* ========================================================================= */}
      {/* TAB 5: ACCOUNTS RECEIVABLE */}
      {/* ========================================================================= */}
      {activeTab === 'receivables' && (
        <ReceivablesPage embedMode={true} dateFilter={dateFilter} onViewDocument={fetchDocumentDetail} />
      )}

      {/* ========================================================================= */}
      {/* TAB 6: ACCOUNTS PAYABLE */}
      {/* ========================================================================= */}
      {activeTab === 'payables' && (
        <PayablesPage embedMode={true} dateFilter={dateFilter} onViewDocument={fetchDocumentDetail} />
      )}

      {/* ========================================================================= */}
      {/* TAB 7: OTHER CREDITORS */}
      {/* ========================================================================= */}
      {activeTab === 'other_creditors' && (
        <OtherCreditorsPage embedMode={true} dateFilter={dateFilter} onViewDocument={fetchDocumentDetail} />
      )}

      {/* ========================================================================= */}
      {/* TAB 8: INVENTORY */}
      {/* ========================================================================= */}
      {activeTab === 'inventory' && (
        <InventoryPage embedMode={true} dateFilter={dateFilter} onViewDocument={fetchDocumentDetail} />
      )}

      {/* ========================================================================= */}
      {/* TAB 9: ACCRUALS & PREPAYMENTS */}
      {/* ========================================================================= */}
      {activeTab === 'accruals_prepayments' && (
        <AccrualsPrepaymentsPage embedMode={true} dateFilter={dateFilter} onViewDocument={fetchDocumentDetail} />
      )}

      {/* ========================================================================= */}
      {/* MODALS */}
      {/* ========================================================================= */}
      
      {/* Transaction Detail Modal */}
      {selectedTxn && (
        <TransactionDetailModal
          transaction={selectedTxn}
          isOpen={!!selectedTxn}
          onClose={() => setSelectedTxn(null)}
          onViewDocument={(docId) => fetchDocumentDetail(docId)}
          onSelectBook={(bookName) => {
            setActiveTab('books');
            setSelectedBook(bookName);
          }}
          onSelectAccount={(acc) => {
            setActiveTab('accounts');
            // Find account object in chartOfAccounts or construct fallback
            const targetAcc = chartOfAccounts.find(a => a.account_code === acc.account_code) || {
              account_code: acc.account_code,
              account_name: acc.account_name,
              account_type: acc.account_type,
              description: ''
            };
            setSelectedAccount(targetAcc);
          }}
        />
      )}

      {/* Source Document Detail Modal */}
      {selectedDoc && (
        <DocumentDetailModal
          document={selectedDoc}
          isOpen={!!selectedDoc}
          onClose={() => setSelectedDoc(null)}
        />
      )}

    </div>
  );
}
