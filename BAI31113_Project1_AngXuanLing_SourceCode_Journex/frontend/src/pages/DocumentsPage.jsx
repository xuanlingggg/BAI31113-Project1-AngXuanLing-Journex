import React, { useState, useEffect } from 'react';
import { 
  Upload, 
  FileCheck, 
  AlertCircle, 
  RefreshCw, 
  Filter, 
  Search, 
  Mail, 
  Folder,
  Play, 
  Square, 
  Clock, 
  CheckCircle2,
  Layers,
  Landmark,
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  FileText,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Link2,
  Eye,
  SlidersHorizontal,
  Trash2,
  X,
  AlertTriangle,
  Info,
  Key,
  Sparkles,
  Download
} from 'lucide-react';
import DocumentList from '../components/DocumentList';
import DocumentUploadModal from '../components/DocumentUploadModal';
import DocumentDetailModal, { formatDisplayDate } from '../components/DocumentDetailModal';
import BankTransactionDetailModal from '../components/BankTransactionDetailModal';

export default function DocumentsPage() {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [bankTransactions, setBankTransactions] = useState([]);
  const [unifiedRecords, setUnifiedRecords] = useState([]);
  const [unifiedSummary, setUnifiedSummary] = useState({
    total_records: 0,
    documents_count: 0,
    bank_transactions_count: 0,
    needs_review_count: 0
  });

  // Simulation Demo States
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
  const [simulatingScenario, setSimulatingScenario] = useState(null);

  // Active Company Context & Resolution
  const [activeCompanyId, setActiveCompanyId] = useState(() => localStorage.getItem('active_company_id') || null);

  const getResolvedCompanyId = async () => {
    let cid = activeCompanyId || localStorage.getItem('active_company_id');
    if (!cid) {
      try {
        const authUserStr = localStorage.getItem('auth_user');
        if (authUserStr) {
          const authUser = JSON.parse(authUserStr);
          if (authUser?.companies?.[0]?.company_id) {
            cid = authUser.companies[0].company_id;
            localStorage.setItem('active_company_id', cid);
            setActiveCompanyId(cid);
          }
        }
      } catch (_) {}
    }
    if (!cid) {
      try {
        const res = await fetch('/api/company/profile');
        if (res.ok) {
          const data = await res.json();
          if (data?.company_id) {
            cid = data.company_id;
            localStorage.setItem('active_company_id', cid);
            setActiveCompanyId(cid);
          }
        }
      } catch (_) {}
    }
    return cid;
  };

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [selectedBankTx, setSelectedBankTx] = useState(null);
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [returnToBankTx, setReturnToBankTx] = useState(null);

  // Financial Records Deletion states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteModalStep, setDeleteModalStep] = useState('SELECT'); // 'SELECT' | 'CONFIRM'
  const [selectedRecordIds, setSelectedRecordIds] = useState(new Set());
  const [deleteModalTypeFilter, setDeleteModalTypeFilter] = useState('ALL'); // 'ALL' | 'DOCUMENTS' | 'BANK'
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [batchDeleteError, setBatchDeleteError] = useState(null);
  const [pageNotification, setPageNotification] = useState(null);
  const [isTestingResetMode, setIsTestingResetMode] = useState(false);

  // Single Document Deletion states (fallback)
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Filter & Search states
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL', 'DOCUMENTS', 'BANK', 'NEEDS_REVIEW'
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [bankDirectionFilter, setBankDirectionFilter] = useState('ALL');
  const [isAgentsCollapsed, setIsAgentsCollapsed] = useState(true);

  // Gmail Ingestion State
  const [gmailStatus, setGmailStatus] = useState({
    status: 'STOPPED',
    is_running: false,
    poll_interval_seconds: 300,
    company_inbox: 'shriley.ling@gmail.com',
    last_check_time: 'Not started',
    last_result: null,
    last_error: null,
    oauth_configured: false,
    oauth_authorized: false,
    oauth_message: ''
  });

  // Local Folder Ingestion State
  const [folderStatus, setFolderStatus] = useState({
    status: 'STOPPED',
    is_running: false,
    poll_interval_seconds: 5,
    folder_path: 'D:\\AgenticAccounting\\FYP_AgenticAccounting\\Agentic-AI-Accounting-System\\Sample Scenario - Ms Wani\\Upload',
    folder_exists: true,
    files_detected: 0,
    last_scan_time: 'Not started',
    last_result: null,
    last_error: null
  });

  // ABC Bank Ingestion State
  const [bankStatus, setBankStatus] = useState({
    status: 'STOPPED',
    is_running: false,
    poll_interval_seconds: 30,
    bank_api_url: 'http://localhost:8010',
    connected: false,
    bank_name: 'ABC Bank',
    account_id: '',
    account_number: '',
    current_balance: 0.0,
    last_collection_time: 'Not started',
    last_cursor: null,
    total_imported_transactions: 2,
    last_result: null,
    last_error: null,
    connection_message: ''
  });

  // Shared UI controls state
  const [agentActionLoading, setAgentActionLoading] = useState(false);
  const [fetchEmailsLoading, setFetchEmailsLoading] = useState(false);
  const [authorizingGmail, setAuthorizingGmail] = useState(false);
  const [scanFolderLoading, setScanFolderLoading] = useState(false);
  const [fetchBankLoading, setFetchBankLoading] = useState(false);
  const [testConnectionLoading, setTestConnectionLoading] = useState(false);
  const [agentBanner, setAgentBanner] = useState(null);

  // Fetch Unified Financial Records
  const fetchFinancialRecords = async (overrideCid = null) => {
    setLoading(true);
    try {
      const cid = overrideCid || activeCompanyId || localStorage.getItem('active_company_id');
      const url = cid ? `/api/documents/financial-records?company_id=${encodeURIComponent(cid)}` : '/api/documents/financial-records';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setUnifiedRecords(data.records || []);
        setUnifiedSummary({
          total_records: data.total_records ?? 0,
          documents_count: data.documents_count ?? 0,
          bank_transactions_count: data.bank_transactions_count ?? 0,
          needs_review_count: data.needs_review_count ?? 0
        });
      }
    } catch (err) {
      console.error('Failed to fetch unified financial records:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDocuments = async (overrideCid = null) => {
    try {
      const cid = overrideCid || activeCompanyId || localStorage.getItem('active_company_id');
      const url = cid ? `/api/documents/?company_id=${encodeURIComponent(cid)}` : '/api/documents/';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  };

  const fetchBankTransactions = async (overrideCid = null) => {
    try {
      const cid = overrideCid || activeCompanyId || localStorage.getItem('active_company_id');
      const url = cid ? `/api/bank-ingestion/transactions?company_id=${encodeURIComponent(cid)}&limit=100` : '/api/bank-ingestion/transactions?limit=100';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setBankTransactions(data.transactions || []);
      }
    } catch (err) {
      console.error('Failed to fetch bank transactions:', err);
    }
  };

  const fetchGmailStatus = async () => {
    try {
      const res = await fetch('/api/email-ingestion/status');
      if (res.ok) {
        const data = await res.json();
        setGmailStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch Gmail status:', err);
    }
  };

  const fetchFolderStatus = async () => {
    try {
      const res = await fetch('/api/folder-ingestion/status');
      if (res.ok) {
        const data = await res.json();
        setFolderStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch Folder status:', err);
    }
  };

  const fetchBankStatus = async (overrideCid = null) => {
    try {
      const cid = overrideCid || activeCompanyId || localStorage.getItem('active_company_id');
      const url = cid ? `/api/bank-ingestion/status?company_id=${encodeURIComponent(cid)}` : '/api/bank-ingestion/status';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setBankStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch Bank status:', err);
    }
  };

  const refreshAll = async (overrideCid = null) => {
    const cid = overrideCid || await getResolvedCompanyId();
    await Promise.all([
      fetchFinancialRecords(cid),
      fetchDocuments(cid),
      fetchBankTransactions(cid),
      fetchGmailStatus(),
      fetchFolderStatus(),
      fetchBankStatus(cid)
    ]);
  };

  useEffect(() => {
    let mounted = true;
    const syncActiveCompany = async () => {
      const cid = await getResolvedCompanyId();
      if (mounted && cid && cid !== activeCompanyId) {
        setActiveCompanyId(cid);
      }
      refreshAll(cid);
    };

    syncActiveCompany();
    window.addEventListener('company-updated', syncActiveCompany);
    const handleDocUploaded = () => {
      refreshAll();
    };
    window.addEventListener('document-uploaded', handleDocUploaded);
    return () => {
      mounted = false;
      window.removeEventListener('company-updated', syncActiveCompany);
      window.removeEventListener('document-uploaded', handleDocUploaded);
    };
  }, []);

  const isGmailRunning = !!gmailStatus.is_running;
  const isFolderRunning = !!folderStatus.is_running;
  const isBankRunning = !!bankStatus.is_running;
  const isAgentRunning = isGmailRunning || isFolderRunning || isBankRunning;

  // Periodic polling when any worker is running
  useEffect(() => {
    let interval = null;
    if (isAgentRunning) {
      interval = setInterval(() => {
        const cid = activeCompanyId || localStorage.getItem('active_company_id');
        fetchGmailStatus();
        fetchFolderStatus();
        fetchBankStatus(cid);
        fetchFinancialRecords(cid);
        fetchBankTransactions(cid);
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAgentRunning, activeCompanyId]);

  // Unified Start Agent: starts Gmail, Folder, and Bank workers and executes immediate collection
  const handleStartUnifiedAgent = async () => {
    setAgentActionLoading(true);
    setAgentBanner(null);
    const targetCompanyId = await getResolvedCompanyId();

    // 1. Start background workers
    await Promise.all([
      fetch('/api/email-ingestion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetCompanyId ? { company_id: targetCompanyId } : {})
      }).catch(() => {}),
      fetch('/api/folder-ingestion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetCompanyId ? { company_id: targetCompanyId } : {})
      }).catch(() => {}),
      fetch('/api/bank-ingestion/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetCompanyId ? { company_id: targetCompanyId } : {})
      }).catch(() => {})
    ]);

    // 2. Perform immediate collection so bank transactions and folder documents load right away
    let newTransactionsCount = 0;
    let newDocumentsCount = 0;

    try {
      const bankRes = await fetch('/api/bank-ingestion/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetCompanyId ? { company_id: targetCompanyId } : {})
      });
      if (bankRes.ok) {
        const bData = await bankRes.json();
        newTransactionsCount += (bData.transactions_imported || 0);
      }
    } catch (err) {
      console.warn('Initial bank collection note:', err);
    }

    try {
      const folderRes = await fetch('/api/folder-ingestion/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetCompanyId ? { company_id: targetCompanyId } : {})
      });
      if (folderRes.ok) {
        const fData = await folderRes.json();
        newDocumentsCount += (fData.documents_imported || 0);
        newTransactionsCount += (fData.bank_transactions_imported || 0);
      }
    } catch (err) {
      console.warn('Initial folder scan note:', err);
    }

    // 3. Immediately refresh workspace records
    await Promise.all([
      fetchFinancialRecords(targetCompanyId),
      fetchDocuments(targetCompanyId),
      fetchBankTransactions(targetCompanyId),
      fetchGmailStatus(),
      fetchFolderStatus(),
      fetchBankStatus(targetCompanyId)
    ]);

    const totalNew = newTransactionsCount + newDocumentsCount;
    setAgentBanner({
      type: 'info',
      message: totalNew > 0 
        ? `Successfully retrieved ${totalNew} record(s). Searching for new documents...`
        : 'Searching for new documents...'
    });
    setAgentActionLoading(false);
  };

  // Unified Stop Agent: stops Gmail, Folder, and Bank workers
  const handleStopUnifiedAgent = async () => {
    setAgentActionLoading(true);
    setAgentBanner(null);

    await Promise.all([
      fetch('/api/email-ingestion/stop', { method: 'POST' }).catch(() => {}),
      fetch('/api/folder-ingestion/stop', { method: 'POST' }).catch(() => {}),
      fetch('/api/bank-ingestion/stop', { method: 'POST' }).catch(() => {})
    ]);

    const targetCompanyId = await getResolvedCompanyId();
    await Promise.all([
      fetchGmailStatus(),
      fetchFolderStatus(),
      fetchBankStatus(targetCompanyId),
      fetchFinancialRecords(targetCompanyId),
      fetchBankTransactions(targetCompanyId)
    ]);
    setAgentBanner({
      type: 'success',
      message: 'Document collection stopped successfully.'
    });
    setAgentActionLoading(false);
  };

  // Re-authorize Gmail
  const handleAuthorizeGmail = async () => {
    setAuthorizingGmail(true);
    setAgentBanner({
      type: 'info',
      message: 'Opening Google authorization in your browser. Please log in and grant read-only Gmail access...'
    });
    try {
      const res = await fetch('/api/email-ingestion/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ open_browser: true, timeout_seconds: 120 })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAgentBanner({
          type: 'success',
          message: data.message || 'Gmail authorized successfully! You can now fetch emails.'
        });
        await fetchGmailStatus();
      } else {
        setAgentBanner({
          type: 'error',
          message: data.detail || data.message || 'Gmail authorization failed. If the browser did not open, run "python setup_gmail_oauth.py" in backend.'
        });
        await fetchGmailStatus();
      }
    } catch (err) {
      setAgentBanner({
        type: 'error',
        message: `Gmail authorization request failed: ${err.message}. You can also run "python setup_gmail_oauth.py" in backend.`
      });
    } finally {
      setAuthorizingGmail(false);
    }
  };

  // Manual Fetch Emails
  const handleManualFetchEmails = async () => {
    setFetchEmailsLoading(true);
    setAgentBanner(null);
    try {
      const targetCompanyId = await getResolvedCompanyId();
      const res = await fetch('/api/email-ingestion/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetCompanyId ? { company_id: targetCompanyId } : {})
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const imported = data.documents_created || 0;
        setAgentBanner({
          type: 'success',
          message: imported > 0
            ? `Successfully retrieved ${imported} new document(s) from Gmail.`
            : 'No new documents found. All sources are up to date.'
        });
        await fetchFinancialRecords(targetCompanyId);
        await fetchDocuments(targetCompanyId);
      } else {
        const isAuthError = res.status === 401 || (data.detail && String(data.detail).toLowerCase().includes('not authorized'));
        setAgentBanner({
          type: 'error',
          message: isAuthError 
            ? 'Gmail authorization required. Please click "Authorize Gmail" to sign in.'
            : (data.detail || data.message || 'Document collection could not be completed.')
        });
      }
      await fetchGmailStatus();
    } catch (err) {
      setAgentBanner({ type: 'error', message: `Fetch emails failed: ${err.message}` });
    } finally {
      setFetchEmailsLoading(false);
    }
  };

  // Manual Scan Folder (Strictly scans Ms Wani Upload folder)
  const handleManualScanFolder = async () => {
    setScanFolderLoading(true);
    setAgentBanner(null);
    try {
      const targetCompanyId = await getResolvedCompanyId();
      if (!targetCompanyId) {
        setAgentBanner({
          type: 'error',
          message: 'No active company found. Please select or activate a company before scanning.'
        });
        setScanFolderLoading(false);
        return;
      }

      const res = await fetch('/api/folder-ingestion/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: targetCompanyId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const detected = data.files_detected ?? data.files_scanned ?? 0;
        const imported = data.documents_imported || 0;
        const duplicates = data.duplicates_skipped || 0;
        const failed = data.failed_files ?? data.errors_encountered ?? 0;

        const parts = [];
        parts.push(`${detected} file(s) detected`);
        if (imported > 0) parts.push(`${imported} document(s) imported`);
        if (data.bank_transactions_imported) parts.push(`${data.bank_transactions_imported} bank transaction(s) imported`);
        if (duplicates > 0) parts.push(`${duplicates} duplicate(s) skipped`);
        if (failed > 0) parts.push(`${failed} failed`);
        const summary = parts.join(', ');

        setAgentBanner({
          type: 'success',
          message: (imported > 0 || (data.bank_transactions_imported || 0) > 0)
            ? `Successfully retrieved ${imported + (data.bank_transactions_imported || 0)} new record(s) from local folder.`
            : 'No new documents found. All sources are up to date.'
        });
        await fetchFinancialRecords(targetCompanyId);
        await fetchDocuments(targetCompanyId);
        if (data.bank_transactions_imported) {
          await fetchBankTransactions(targetCompanyId);
        }
      } else {
        setAgentBanner({
          type: 'error',
          message: data.detail || data.message || 'Document collection could not be completed.'
        });
      }
      await fetchFolderStatus();
    } catch (err) {
      setAgentBanner({ type: 'error', message: `Scan folder failed: ${err.message}` });
    } finally {
      setScanFolderLoading(false);
    }
  };

  // Manual Fetch Bank Transactions
  const handleManualFetchBankTransactions = async () => {
    setFetchBankLoading(true);
    setAgentBanner(null);
    try {
      const targetCompanyId = await getResolvedCompanyId();
      const res = await fetch('/api/bank-ingestion/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetCompanyId ? { company_id: targetCompanyId } : {})
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const imported = data.transactions_imported ?? 0;
        setAgentBanner({
          type: 'success',
          message: imported > 0
            ? `Successfully retrieved ${imported} new transaction(s) from bank feed.`
            : 'No new documents found. All sources are up to date.'
        });
        await fetchFinancialRecords(targetCompanyId);
        await fetchBankTransactions(targetCompanyId);
      } else {
        setAgentBanner({
          type: 'error',
          message: data.error || data.detail || data.message || 'Document collection could not be completed.'
        });
      }
      await fetchBankStatus(targetCompanyId);
    } catch (err) {
      setAgentBanner({ type: 'error', message: `Fetch bank transactions failed: ${err.message}` });
    } finally {
      setFetchBankLoading(false);
    }
  };

  // Test Bank Connection
  const handleTestBankConnection = async () => {
    setTestConnectionLoading(true);
    setAgentBanner(null);
    try {
      const res = await fetch('/api/bank-ingestion/test-connection', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.connected) {
        setAgentBanner({
          type: 'success',
          message: `ABC Bank Simulator Online: Connected to ${data.bank_name} (${data.account_name}, Balance: RM ${Number(data.current_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}).`
        });
      } else {
        setAgentBanner({
          type: 'error',
          message: data.message || 'Failed to connect to ABC Bank Simulator (is port 8010 running?).'
        });
      }
      await fetchBankStatus();
    } catch (err) {
      setAgentBanner({ type: 'error', message: `Test bank connection failed: ${err.message}` });
    } finally {
      setTestConnectionLoading(false);
    }
  };

  // Run Simulation Demo
  const handleRunSimulation = async (scenario) => {
    setSimulatingScenario(scenario);
    setAgentBanner(null);
    try {
      const targetCompanyId = await getResolvedCompanyId();
      const res = await fetch('/api/documents/simulate-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario, company_id: targetCompanyId })
      });
      const data = await res.json();
      if (res.status === 409 || data.duplicate) {
        const existing = data.existing_document || {};
        setAgentBanner({
          type: 'error',
          message: `[Duplicate Detection Verified] Document rejected: ${data.message || 'Already uploaded in active company.'} (${existing.identifier_label || 'ID'}: ${existing.identifier || existing.document_id || 'N/A'})`
        });
      } else if (res.status === 422 || data.company_mismatch || data.rejected) {
        setAgentBanner({
          type: 'error',
          message: `[Entity Concept Enforced — Rejected at Extraction] ${data.message || data.detail || 'Document rejected due to company entity mismatch.'}`
        });
        await fetchFinancialRecords(targetCompanyId);
        await fetchDocuments(targetCompanyId);
      } else if (res.ok) {
        const valStatus = data.validation_status || 'Processed';
        const valErrs = data.validation_errors && data.validation_errors.length > 0
          ? data.validation_errors.join(' | ')
          : null;
        setAgentBanner({
          type: valStatus === 'Passed' ? 'success' : 'error',
          message: `[Simulation Executed] ${data.document_type || 'Document'} (${data.document_id}) -> Status: ${valStatus}${valErrs ? ` — ${valErrs}` : ''}`
        });
        await fetchFinancialRecords(targetCompanyId);
        await fetchDocuments(targetCompanyId);
      } else {
        setAgentBanner({
          type: 'error',
          message: data.detail || data.message || 'Simulation upload failed.'
        });
      }
    } catch (err) {
      setAgentBanner({ type: 'error', message: `Simulation error: ${err.message}` });
    } finally {
      setSimulatingScenario(null);
      setIsSimulateModalOpen(false);
    }
  };

  // Open Bank Details Modal
  const handleOpenBankDetails = (record) => {
    // If it is a normalized record, extract the raw_bank_transaction or look up in bankTransactions
    let targetTx = record.raw_bank_transaction;
    if (!targetTx) {
      targetTx = bankTransactions.find(t => t.bank_transaction_id === record.record_id || t.id === record.raw_id);
    }
    if (!targetTx) {
      targetTx = record;
    }
    setSelectedBankTx(targetTx);
    setIsBankModalOpen(true);
  };

  // Open Document Detail Modal
  const handleOpenDocDetails = (record) => {
    let targetDoc = record.raw_document;
    if (!targetDoc) {
      targetDoc = documents.find(d => d.document_id === record.record_id || d.id === record.raw_id);
    }
    if (!targetDoc) {
      targetDoc = record;
    }
    setSelectedDoc(targetDoc);
  };

  // Seamless navigation: Open supporting document from bank transaction modal
  const handleViewDocumentFromBank = (docIdOrObj) => {
    const targetId = typeof docIdOrObj === 'string' ? docIdOrObj : (docIdOrObj?.document_id || docIdOrObj?.id);
    let docObj = documents.find(d => d.document_id === targetId || d.id === targetId);
    if (!docObj && typeof docIdOrObj === 'object') {
      docObj = docIdOrObj;
    }
    if (!docObj) {
      docObj = { document_id: targetId, original_filename: targetId, status: 'EXTRACTED' };
    }
    setReturnToBankTx(selectedBankTx);
    setIsBankModalOpen(false);
    setSelectedDoc(docObj);
  };

  // Return back to bank transaction modal from document detail view
  const handleBackToBankFromDoc = () => {
    const bankTx = returnToBankTx;
    setSelectedDoc(null);
    setReturnToBankTx(null);
    if (bankTx) {
      setSelectedBankTx(bankTx);
      setIsBankModalOpen(true);
    }
  };

  // Financial Records Deletion handlers
  const handleOpenDeleteModal = () => {
    setSelectedRecordIds(new Set());
    setDeleteModalTypeFilter('ALL');
    setDeleteModalStep('SELECT');
    setBatchDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    if (isBatchDeleting) return;
    setIsDeleteModalOpen(false);
    setDeleteModalStep('SELECT');
    setSelectedRecordIds(new Set());
    setBatchDeleteError(null);
  };

  const toggleRecordSelection = (recordId) => {
    setSelectedRecordIds(prev => {
      const next = new Set(prev);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  };

  const handleSelectAllRecords = () => {
    const selectableRecords = unifiedRecords.filter(r => {
      if (deleteModalTypeFilter === 'DOCUMENTS' && r.record_type !== 'ACCOUNTING_DOCUMENT') return false;
      if (deleteModalTypeFilter === 'BANK' && r.record_type !== 'BANK_TRANSACTION') return false;
      return true;
    });

    const allSelectableIds = selectableRecords.map(r => r.record_id);
    const allSelected = allSelectableIds.length > 0 && allSelectableIds.every(id => selectedRecordIds.has(id));

    if (allSelected) {
      setSelectedRecordIds(prev => {
        const next = new Set(prev);
        allSelectableIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedRecordIds(prev => {
        const next = new Set(prev);
        allSelectableIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const handleClearSelection = () => {
    setSelectedRecordIds(new Set());
  };

  const handleExecuteBatchDelete = async () => {
    if (selectedRecordIds.size === 0 || isBatchDeleting) return;
    setIsBatchDeleting(true);
    setBatchDeleteError(null);

    const selectedRecordsList = unifiedRecords.filter(r => selectedRecordIds.has(r.record_id));
    const payload = {
      records: selectedRecordsList.map(r => ({
        id: r.record_id,
        type: r.record_type
      })),
      allow_posted_reset: isTestingResetMode
    };

    try {
      const res = await fetch('/api/documents/delete-financial-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.message || 'Failed to delete selected financial records.');
      }

      setIsDeleteModalOpen(false);
      setSelectedRecordIds(new Set());
      setDeleteModalStep('SELECT');

      setPageNotification({
        type: 'success',
        message: data.message || `Successfully deleted ${selectedRecordsList.length} record(s).`
      });

      await refreshAll();
    } catch (err) {
      console.error('Financial records deletion error:', err);
      setBatchDeleteError(err.message || 'An error occurred while deleting financial records.');
    } finally {
      setIsBatchDeleting(false);
    }
  };

  // Prompt document deletion confirmation modal
  const handlePromptDelete = (record) => {
    setDeleteError(null);
    setDeleteConfirmDoc(record);
  };

  // Execute safe document deletion
  const handleConfirmDelete = async () => {
    if (!deleteConfirmDoc) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const docId = deleteConfirmDoc.record_id;
      const res = await fetch(`/api/documents/${encodeURIComponent(docId)}?allow_posted_reset=true`, {
        method: 'DELETE'
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || data.message || `Failed to delete document ${docId}.`);
      }

      setPageNotification({
        type: 'success',
        message: data.message || `Document ${docId} deleted successfully.`
      });
      setDeleteConfirmDoc(null);
      await refreshAll();
    } catch (err) {
      console.error('Document deletion error:', err);
      setDeleteError(err.message || 'An error occurred while deleting the document.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Helper to get concise, user-friendly description without vendor/customer/party names or account codes
  const getCleanDescription = (r) => {
    if (r.record_type === 'BANK_TRANSACTION') {
      return r.description || r.description_party || 'Bank Transaction';
    }
    const type = r.accounting_category || r.document_type || '';
    const fname = (r.filename || '').toLowerCase();
    const isSetup = r.is_company_setup || r.record_type_label === 'Company Setup Document' || r.source === 'COMPANY_SETUP';

    if (isSetup) {
      if (type.includes('Trial Balance') || fname.includes('trial balance')) return 'Opening Trial Balance';
      if (type.includes('Stock') || fname.includes('stock balance')) return 'Stock Balance Report';
      if (type.includes('Receivable') || type.includes('Debtor') || fname.includes('receivable')) return 'Trade Receivables Listing';
      if (type.includes('Other Creditor') || fname.includes('other creditor')) return 'Other Creditors Listing';
      if ((type.includes('Payable') || type.includes('Creditor')) && !type.includes('Other') && !fname.includes('other')) return 'Trade Payables Listing';
      if (type.includes('Profile') || fname.includes('profile')) return 'Company Profile';
      return type || 'Opening Setup Document';
    }

    if (type === 'Stock Take' || fname.includes('stock take') || fname.startsWith('sk-')) return 'Stock Take';
    if (type === 'Sales Invoice' || fname.includes('sales invoice') || fname.startsWith('inv-') || fname.startsWith('i-')) return 'Sales Invoice';
    if (type === 'Purchase Invoice' || type === 'Supplier Invoice' || fname.includes('purchase invoice') || fname.includes('supplier invoice') || fname.startsWith('pi-') || fname.startsWith('bill-')) return 'Purchase Invoice';
    if (type === 'Official Receipt' || fname.includes('official receipt') || fname.startsWith('or-')) return 'Official Receipt';
    if (type === 'Payment Receipt' || fname.includes('payment receipt')) return 'Payment Receipt';
    if (type === 'Payment Voucher' || fname.includes('payment voucher') || fname.startsWith('pv-')) return 'Payment Voucher';
    if (type === 'Credit Note' || type === 'Supplier Credit Note' || fname.includes('credit note') || fname.startsWith('cn-')) return 'Credit Note';
    if (type === 'Debit Note' || fname.includes('debit note') || fname.startsWith('dn-')) return 'Debit Note';
    if (type === 'Delivery Order' || fname.includes('delivery order') || fname.startsWith('do-')) return 'Delivery Order';
    if (type === 'Sales Order' || fname.includes('sales order') || fname.startsWith('so-')) return 'Sales Order';
    if (type === 'Purchase Order' || fname.includes('purchase order') || fname.startsWith('po-')) return 'Purchase Order';
    if (type === 'Purchase Return' || fname.includes('purchase return') || fname.startsWith('pr-')) return 'Purchase Return';
    if (type === 'Bank Statement' || fname.includes('bank statement') || fname.includes('statement')) return 'Bank Statement';
    if (type === 'Bank Transfer Receipt' || fname.includes('bank transfer')) return 'Bank Transfer Receipt';
    if (type === 'Expense Receipt' || type === 'Purchase Receipt' || fname.includes('receipt')) return 'Expense Receipt';

    if (r.description && r.description !== '-' && r.description !== r.filename) {
      return r.description;
    }
    return type || 'Accounting Document';
  };

  // Filter unified records based on active tab, search, and status
  const displayedRecords = unifiedRecords.filter(r => {
    // 1. Tab filter
    if (activeTab === 'DOCUMENTS' && r.record_type !== 'ACCOUNTING_DOCUMENT') return false;
    if (activeTab === 'BANK' && r.record_type !== 'BANK_TRANSACTION') return false;
    if (activeTab === 'NEEDS_REVIEW') {
      const isErr = r.status === "ERROR" || r.status === "FAILED" || r.validation_status === "Failed" || r.extraction_status === "Extraction Failed";
      const isRev = !isErr && (r.needs_review === true || r.validation_status === "Review Required" || r.status === "NEEDS_REVIEW");
      if (!isRev) return false;
    }

    // 2. Bank Direction filter (when activeTab is BANK)
    if (activeTab === 'BANK' && bankDirectionFilter !== 'ALL') {
      if (bankDirectionFilter === 'IN' && (r.money_in || 0) <= 0) return false;
      if (bankDirectionFilter === 'OUT' && (r.money_out || 0) <= 0) return false;
    }

    // 3. Status filter
    if (statusFilter !== 'ALL') {
      const isError = r.status === "ERROR" || r.status === "FAILED" || r.validation_status === "Failed" || r.extraction_status === "Extraction Failed";
      const isReview = !isError && (r.needs_review === true || r.validation_status === "Review Required" || r.status === "NEEDS_REVIEW");
      if (statusFilter === 'NEEDS_REVIEW' && !isReview) return false;
      if (statusFilter === 'EXTRACTED' && (isError || isReview)) return false;
      if (statusFilter === 'FAILED' && !isError) return false;
      if (statusFilter === 'MATCHED' && !r.is_matched && r.match_status !== 'MATCHED' && !r.status?.includes('MATCHED')) return false;
      if (statusFilter === 'UNMATCHED' && (r.is_matched || (r.match_status && r.match_status !== 'UNMATCHED'))) return false;
    }

    // 4. Search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const descText = getCleanDescription(r).toLowerCase();
      const matchId = (r.record_id || '').toLowerCase().includes(q);
      const matchDesc = descText.includes(q);
      const matchFile = (r.filename || '').toLowerCase().includes(q);
      const matchParty = (r.description_party || '').toLowerCase().includes(q);
      const matchRef = (r.reference || '').toLowerCase().includes(q);
      const matchCat = (r.accounting_category || '').toLowerCase().includes(q);
      const matchSrc = (r.source_label || '').toLowerCase().includes(q);
      const matchAcc = (r.account_code || '').toLowerCase().includes(q) || (r.account_name || '').toLowerCase().includes(q);
      if (!matchId && !matchDesc && !matchFile && !matchParty && !matchRef && !matchCat && !matchSrc && !matchAcc) return false;
    }

    return true;
  });

  const lastGmailRes = gmailStatus.last_result || {};
  const lastFolderRes = folderStatus.last_result || {};
  const lastBankRes = bankStatus.last_result || {};

  // Overall agent badge style
  const isAnyAgentRunning = Boolean(isGmailRunning || isFolderRunning || isBankRunning || isAgentRunning);

  let overallBadgeText = 'Stopped';
  let overallBadgeColor = '#94a3b8';
  let overallBadgeBg = 'rgba(148, 163, 184, 0.15)';
  let overallBadgeBorder = '#64748b';

  if (isAnyAgentRunning) {
    overallBadgeText = 'Searching for documents';
    overallBadgeColor = '#34d399';
    overallBadgeBg = 'rgba(52, 211, 153, 0.15)';
    overallBadgeBorder = '#34d399';
  }

  // Selectable records calculation for Delete Modal
  const selectableRecords = unifiedRecords.filter(r => {
    if (deleteModalTypeFilter === 'DOCUMENTS' && r.record_type !== 'ACCOUNTING_DOCUMENT') return false;
    if (deleteModalTypeFilter === 'COMPANY_SETUP' && r.record_type !== 'COMPANY_SETUP') return false;
    if (deleteModalTypeFilter === 'BANK' && r.record_type !== 'BANK_TRANSACTION') return false;
    return true;
  });

  const selectedRecordsList = unifiedRecords.filter(r => selectedRecordIds.has(r.record_id));
  const selectedDocCount = selectedRecordsList.filter(r => r.record_type === 'ACCOUNTING_DOCUMENT').length;
  const selectedSetupCount = selectedRecordsList.filter(r => r.record_type === 'COMPANY_SETUP').length;
  const selectedBankCount = selectedRecordsList.filter(r => r.record_type === 'BANK_TRANSACTION').length;

  const totalDocsInSystem = unifiedRecords.filter(r => r.record_type === 'ACCOUNTING_DOCUMENT').length;
  const totalSetupInSystem = unifiedRecords.filter(r => r.record_type === 'COMPANY_SETUP').length;
  const totalBankInSystem = unifiedRecords.filter(r => r.record_type === 'BANK_TRANSACTION').length;

  return (
    <div className="page-container">
      {/* Top Summary Metrics Header Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', 
        gap: '1.25rem',
        marginBottom: '1.5rem'
      }}>
        {/* All Financial Records */}
        <div 
          className="card" 
          style={{ 
            marginBottom: 0, 
            padding: '1.1rem 1.25rem', 
            cursor: 'pointer',
            border: activeTab === 'ALL' ? '2px solid var(--color-primary)' : '1px solid var(--border-color)',
            transition: 'border-color 0.15s, box-shadow 0.15s'
          }}
          onClick={() => setActiveTab('ALL')}
          title="View all financial records"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              All Financial Records
            </span>
            <FileSpreadsheet size={16} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div style={{ fontSize: '1.95rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
            {unifiedSummary.total_records}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            All documents & bank entries combined
          </div>
        </div>

        {/* Accounting Documents */}
        <div 
          className="card" 
          style={{ 
            marginBottom: 0, 
            padding: '1.1rem 1.25rem', 
            cursor: 'pointer',
            border: activeTab === 'DOCUMENTS' ? '2px solid var(--color-primary)' : '1px solid var(--border-color)',
            transition: 'border-color 0.15s, box-shadow 0.15s'
          }}
          onClick={() => setActiveTab('DOCUMENTS')}
          title="Filter to accounting documents"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 600, textTransform: 'uppercase' }}>
              Accounting Documents
            </span>
            <FileText size={16} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div style={{ fontSize: '1.95rem', fontWeight: 800, color: 'var(--color-primary)', marginTop: '0.2rem' }}>
            {unifiedSummary.documents_count}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Invoices, receipts, orders & listings
          </div>
        </div>

        {/* Bank Transactions */}
        <div 
          className="card" 
          style={{ 
            marginBottom: 0, 
            padding: '1.1rem 1.25rem', 
            cursor: 'pointer',
            border: activeTab === 'BANK' ? '2px solid #147D8C' : '1px solid var(--border-color)',
            transition: 'border-color 0.15s, box-shadow 0.15s'
          }}
          onClick={() => setActiveTab('BANK')}
          title="Filter to bank transactions"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#147D8C', fontWeight: 600, textTransform: 'uppercase' }}>
              Bank Transactions
            </span>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              backgroundColor: '#E5F5F7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Landmark size={15} style={{ color: '#147D8C' }} />
            </div>
          </div>
          <div style={{ fontSize: '1.95rem', fontWeight: 800, color: '#147D8C', marginTop: '0.2rem' }}>
            {unifiedSummary.bank_transactions_count}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            ABC Bank live feeds & transaction PDFs
          </div>
        </div>

        {/* Needs Review */}
        <div 
          className="card" 
          style={{ 
            marginBottom: 0, 
            padding: '1.1rem 1.25rem', 
            cursor: 'pointer',
            border: activeTab === 'NEEDS_REVIEW' ? '2px solid #D97706' : '1px solid var(--border-color)',
            transition: 'border-color 0.15s, box-shadow 0.15s'
          }}
          onClick={() => setActiveTab('NEEDS_REVIEW')}
          title="Filter to records needing review"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: unifiedSummary.needs_review_count > 0 ? '#D97706' : 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Needs Review
            </span>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              backgroundColor: unifiedSummary.needs_review_count > 0 ? '#FEF3C7' : 'var(--bg-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <AlertCircle size={15} style={{ color: unifiedSummary.needs_review_count > 0 ? '#D97706' : 'var(--text-muted)' }} />
            </div>
          </div>
          <div style={{ fontSize: '1.95rem', fontWeight: 800, color: unifiedSummary.needs_review_count > 0 ? '#D97706' : 'var(--text-primary)', marginTop: '0.2rem' }}>
            {unifiedSummary.needs_review_count}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Flagged items & unmatched records
          </div>
        </div>
      </div>

      {/* Compact Collapsible Collection Agents Workspace */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem', border: '1px solid var(--border-color)' }}>
        <div 
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setIsAgentsCollapsed(!isAgentsCollapsed)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Layers size={18} style={{ color: 'var(--color-primary)' }} />
            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Document Processing Agent
            </h3>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '0.15rem 0.55rem',
              borderRadius: '4px',
              backgroundColor: overallBadgeBg,
              color: overallBadgeColor,
              border: `1px solid ${overallBadgeBorder}`
            }}>
              {overallBadgeText}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {isAgentsCollapsed ? 'Expand Source Monitors' : 'Collapse Monitors'}
            </span>
            {isAgentsCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </div>
        </div>

        {/* Global Agent Control Actions (Always accessible) */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginTop: '0.75rem', 
          paddingTop: '0.75rem', 
          borderTop: '1px solid var(--border-color)',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {!isAgentRunning ? (
              <button 
                className="btn btn-primary btn-sm"
                onClick={handleStartUnifiedAgent}
                disabled={agentActionLoading}
              >
                <Play size={13} style={{ marginRight: '0.35rem' }} />
                <span>{agentActionLoading ? 'Starting...' : 'Start Collection'}</span>
              </button>
            ) : (
              <button 
                className="btn btn-secondary btn-sm"
                onClick={handleStopUnifiedAgent}
                disabled={agentActionLoading}
                style={{ color: '#f43f5e', borderColor: '#f43f5e' }}
              >
                <Square size={13} style={{ marginRight: '0.35rem' }} />
                <span>{agentActionLoading ? 'Stopping...' : 'Stop Collection'}</span>
              </button>
            )}

            {!gmailStatus.oauth_authorized && (
              <button 
                className="btn btn-secondary btn-sm"
                onClick={handleAuthorizeGmail}
                disabled={authorizingGmail}
                style={{ 
                  color: 'var(--status-warning-text)', 
                  borderColor: 'var(--status-warning-text)',
                  backgroundColor: 'rgba(234, 179, 8, 0.08)'
                }}
                title="Google OAuth authorization is required for Gmail ingestion"
              >
                <Key size={13} style={{ marginRight: '0.35rem' }} />
                <span>{authorizingGmail ? 'Waiting for Google Login...' : 'Authorize Gmail'}</span>
              </button>
            )}

            <button 
              className="btn btn-secondary btn-sm"
              onClick={handleManualFetchEmails}
              disabled={fetchEmailsLoading}
            >
              <Mail size={13} style={{ marginRight: '0.35rem' }} />
              <span>{fetchEmailsLoading ? 'Fetching...' : 'Fetch Emails'}</span>
            </button>

            <button 
              className="btn btn-secondary btn-sm"
              onClick={handleManualScanFolder}
              disabled={scanFolderLoading}
            >
              <Folder size={13} style={{ marginRight: '0.35rem' }} />
              <span>{scanFolderLoading ? 'Scanning...' : 'Scan This Folder'}</span>
            </button>

            <button 
              className="btn btn-secondary btn-sm"
              onClick={handleManualFetchBankTransactions}
              disabled={fetchBankLoading}
            >
              <Landmark size={13} style={{ marginRight: '0.35rem' }} />
              <span>{fetchBankLoading ? 'Collecting...' : 'Fetch Bank Feed'}</span>
            </button>

            <button 
              className="btn btn-secondary btn-sm"
              onClick={handleTestBankConnection}
              disabled={testConnectionLoading}
            >
              <CheckCircle2 size={13} style={{ marginRight: '0.35rem' }} />
              <span>{testConnectionLoading ? 'Testing...' : 'Test Bank Connection'}</span>
            </button>

            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => setIsSimulateModalOpen(true)}
              style={{
                color: 'var(--color-primary)',
                borderColor: 'var(--color-primary)',
                backgroundColor: 'rgba(37, 99, 235, 0.06)',
                fontWeight: 600
              }}
              title="Quickly simulate error scenarios (Math error, duplicate, entity mismatch) to demo AI detection"
            >
              <Sparkles size={13} style={{ marginRight: '0.35rem' }} />
              <span>Simulate Error</span>
            </button>
          </div>

          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span>Local Folder Source: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>Sample Scenario - Ms Wani\Upload</strong> ({folderStatus.folder_exists ? 'Connected' : 'Missing'})</span>
            <span>ABC Bank Port: <span style={{ color: bankStatus.connected ? 'var(--status-success-text)' : 'var(--status-error-text)', fontWeight: 600 }}>8010</span></span>
          </div>
        </div>

        {/* Banner Alert */}
        {agentBanner && (
          <div style={{
            marginTop: '0.75rem',
            padding: '0.65rem 0.9rem',
            borderRadius: '6px',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            backgroundColor: agentBanner.type === 'error' ? 'var(--status-error-bg)' : (agentBanner.type === 'success' ? 'var(--status-success-bg)' : 'var(--badge-doc-bg)'),
            border: `1px solid ${agentBanner.type === 'error' ? 'rgba(185, 28, 28, 0.25)' : (agentBanner.type === 'success' ? 'rgba(21, 128, 61, 0.25)' : 'rgba(37, 99, 235, 0.25)')}`,
            color: agentBanner.type === 'error' ? 'var(--status-error-text)' : (agentBanner.type === 'success' ? 'var(--status-success-text)' : 'var(--primary-color)')
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {agentBanner.type === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
              <span>{agentBanner.message}</span>
            </div>
            <button
              onClick={() => setAgentBanner(null)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'inherit',
                padding: '0.2rem',
                display: 'flex',
                alignItems: 'center',
                opacity: 0.7
              }}
              title="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Detailed 3 Source Cards (Shown when expanded) */}
        {!isAgentsCollapsed && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1rem',
            marginTop: '1rem',
            paddingTop: '1rem',
            borderTop: '1px dashed var(--border-color)'
          }}>
            {/* Source 1: Gmail */}
            <div style={{ padding: '0.85rem 1rem', backgroundColor: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                  <Mail size={15} style={{ color: 'var(--primary-color)' }} />
                  <span>Gmail Ingestion</span>
                </div>
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.45rem',
                  borderRadius: '4px',
                  backgroundColor: isGmailRunning ? 'var(--status-success-bg)' : 'var(--status-neutral-bg)',
                  color: isGmailRunning ? 'var(--status-success-text)' : 'var(--status-neutral-text)',
                  border: `1px solid ${isGmailRunning ? 'rgba(21, 128, 61, 0.25)' : 'var(--border-color)'}`
                }}>
                  {isGmailRunning ? 'RUNNING' : 'STOPPED'}
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                <div>Inbox: <strong style={{ color: 'var(--text-primary)' }}>{gmailStatus.company_inbox}</strong></div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.15rem' }}>
                  <span>OAuth: <span style={{ 
                    color: gmailStatus.oauth_authorized ? 'var(--status-success-text)' : 'var(--status-warning-text)', 
                    fontWeight: 600 
                  }}>
                    {gmailStatus.oauth_authorized ? 'Authorized' : (gmailStatus.needs_reauthorization ? 'Re-authorization Required' : 'Pending')}
                  </span></span>
                  {!gmailStatus.oauth_authorized && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleAuthorizeGmail}
                      disabled={authorizingGmail}
                      style={{
                        padding: '0.15rem 0.5rem',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        color: 'var(--primary-color)',
                        borderColor: 'var(--primary-color)'
                      }}
                      title="Sign in with Google to grant Gmail read-only access"
                    >
                      <Key size={11} style={{ marginRight: '0.25rem' }} />
                      <span>{authorizingGmail ? 'Authorizing...' : 'Authorize'}</span>
                    </button>
                  )}
                </div>
                <div>Last Check: <strong style={{ color: 'var(--text-primary)' }}>{gmailStatus.last_check_time || 'Not started'}</strong></div>
              </div>
            </div>

            {/* Source 2: Local Folder Agent */}
            <div style={{ padding: '0.85rem 1rem', backgroundColor: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                  <Folder size={15} style={{ color: '#0284C7' }} />
                  <span>Local Folder Agent</span>
                </div>
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.45rem',
                  borderRadius: '4px',
                  backgroundColor: isFolderRunning ? 'var(--status-success-bg)' : 'var(--status-neutral-bg)',
                  color: isFolderRunning ? 'var(--status-success-text)' : 'var(--status-neutral-text)',
                  border: `1px solid ${isFolderRunning ? 'rgba(21, 128, 61, 0.25)' : 'var(--border-color)'}`
                }}>
                  {isFolderRunning ? 'RUNNING' : 'STOPPED'}
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                <div style={{ marginBottom: '0.2rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Local Folder Source:</span>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    color: 'var(--text-primary)',
                    backgroundColor: 'var(--bg-secondary, #F1F5F9)',
                    padding: '0.2rem 0.4rem',
                    borderRadius: '4px',
                    wordBreak: 'break-all',
                    marginTop: '0.15rem',
                    border: '1px solid var(--border-color)'
                  }}>
                    {folderStatus.folder_path || 'D:\\AgenticAccounting\\FYP_AgenticAccounting\\Agentic-AI-Accounting-System\\Sample Scenario - Ms Wani\\Upload'}
                  </div>
                </div>
                <div>Status: <span style={{ color: folderStatus.folder_exists ? 'var(--status-success-text)' : 'var(--status-error-text)', fontWeight: 600 }}>{folderStatus.folder_exists ? 'Folder Connected / Accessible' : 'Folder Not Found'}</span></div>
                <div>Last Scan: <strong style={{ color: 'var(--text-primary)' }}>{folderStatus.last_scan_time || 'Not started'}</strong> ({folderStatus.last_error ? 'Error' : (folderStatus.last_scan_time && folderStatus.last_scan_time !== 'Not started') ? 'Completed' : 'Idle'})</div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '0.25rem',
                  marginTop: '0.45rem',
                  paddingTop: '0.45rem',
                  borderTop: '1px dashed var(--border-color)',
                  fontSize: '0.72rem'
                }}>
                  <div>Files Detected: <strong style={{ color: 'var(--text-primary)' }}>{folderStatus.files_detected ?? folderStatus.last_result?.files_detected ?? 0}</strong></div>
                  <div>Imported: <strong style={{ color: 'var(--status-success-text)' }}>{folderStatus.last_result?.documents_imported || 0}</strong></div>
                  <div>Duplicates Skipped: <strong style={{ color: 'var(--status-warning-text)' }}>{folderStatus.last_result?.duplicates_skipped || 0}</strong></div>
                  <div>Failed Files: <strong style={{ color: (folderStatus.last_result?.failed_files || folderStatus.last_result?.errors_encountered) ? 'var(--status-error-text)' : 'var(--text-muted)' }}>{folderStatus.last_result?.failed_files ?? folderStatus.last_result?.errors_encountered ?? 0}</strong></div>
                </div>
              </div>
            </div>

            {/* Source 3: ABC Bank */}
            <div style={{ padding: '0.85rem 1rem', backgroundColor: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                  <div style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--badge-bank-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Landmark size={13} style={{ color: 'var(--badge-bank-text)' }} />
                  </div>
                  <span>ABC Bank Simulator</span>
                </div>
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.45rem',
                  borderRadius: '4px',
                  backgroundColor: isBankRunning ? 'var(--status-success-bg)' : 'var(--status-neutral-bg)',
                  color: isBankRunning ? 'var(--status-success-text)' : 'var(--status-neutral-text)',
                  border: `1px solid ${isBankRunning ? 'rgba(21, 128, 61, 0.25)' : 'var(--border-color)'}`
                }}>
                  {isBankRunning ? 'RUNNING' : 'STOPPED'}
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                <div>Total in DB: <strong style={{ color: 'var(--status-success-text)' }}>{bankTransactions.length || bankStatus.total_imported_transactions || 2}</strong> transaction(s)</div>
                <div>Cursor: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{bankStatus.last_cursor || 'TXN-0002'}</strong> (Up to date)</div>
                <div>Balance: <strong style={{ color: 'var(--primary-color)' }}>RM {Number(bankStatus.current_balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Workspace Navigation Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        marginBottom: '1.25rem', 
        borderBottom: '1px solid var(--border-color)', 
        paddingBottom: '0.65rem',
        flexWrap: 'wrap'
      }}>
        <button
          className={`btn btn-sm ${activeTab === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('ALL')}
        >
          <FileSpreadsheet size={14} style={{ marginRight: '0.35rem' }} />
          <span>All Financial Records ({unifiedSummary.total_records})</span>
        </button>

        <button
          className={`btn btn-sm ${activeTab === 'DOCUMENTS' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('DOCUMENTS')}
        >
          <FileText size={14} style={{ marginRight: '0.35rem' }} />
          <span>Accounting Documents ({unifiedSummary.documents_count})</span>
        </button>

        <button
          className={`btn btn-sm ${activeTab === 'BANK' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('BANK')}
        >
          <Landmark size={14} style={{ marginRight: '0.35rem', color: activeTab === 'BANK' ? '#fff' : '#147D8C' }} />
          <span>Bank Transactions ({unifiedSummary.bank_transactions_count})</span>
        </button>

        <button
          className={`btn btn-sm ${activeTab === 'NEEDS_REVIEW' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('NEEDS_REVIEW')}
        >
          <AlertCircle size={14} style={{ marginRight: '0.35rem' }} />
          <span>Needs Review ({unifiedSummary.needs_review_count})</span>
        </button>
      </div>

      {/* Page Notification Banner */}
      {pageNotification && (
        <div style={{
          marginBottom: '1.25rem',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          fontSize: '0.84rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: pageNotification.type === 'error' ? 'var(--status-error-bg, #FEF2F2)' : 'var(--status-success-bg, #F0FDF4)',
          border: `1px solid ${pageNotification.type === 'error' ? 'rgba(220, 38, 38, 0.3)' : 'rgba(22, 163, 74, 0.3)'}`,
          color: pageNotification.type === 'error' ? 'var(--status-error-text, #991B1B)' : 'var(--status-success-text, #166534)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {pageNotification.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            <span>{pageNotification.message}</span>
          </div>
          <button
            onClick={() => setPageNotification(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0.2rem' }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Action Bar & Search / Filters */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        gap: '1rem',
        marginBottom: '1.25rem',
        flexWrap: 'wrap'
      }}>
        {/* Left: Search & Status Filter */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
          <div style={{ position: 'relative', minWidth: '240px', maxWidth: '380px', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text"
              className="form-control"
              placeholder="Search record ID, party, bank ref, category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '2.25rem', fontSize: '0.82rem' }}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '0.65rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <SlidersHorizontal size={15} style={{ color: 'var(--text-muted)' }} />
            <select
              className="form-control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ fontSize: '0.82rem', minWidth: '150px' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="EXTRACTED">Extracted</option>
              <option value="NEEDS_REVIEW">Review Required</option>
              <option value="FAILED">Extraction Failed</option>
            </select>
          </div>

          {/* Direction filters when on Bank Transactions tab */}
          {activeTab === 'BANK' && (
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              <button
                className={`btn btn-sm ${bankDirectionFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setBankDirectionFilter('ALL')}
                style={{ fontSize: '0.78rem', padding: '0.25rem 0.55rem' }}
              >
                All Flows
              </button>
              <button
                className={`btn btn-sm ${bankDirectionFilter === 'IN' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setBankDirectionFilter('IN')}
                style={{ fontSize: '0.78rem', padding: '0.25rem 0.55rem' }}
              >
                Money In
              </button>
              <button
                className={`btn btn-sm ${bankDirectionFilter === 'OUT' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setBankDirectionFilter('OUT')}
                style={{ fontSize: '0.78rem', padding: '0.25rem 0.55rem' }}
              >
                Money Out
              </button>
            </div>
          )}
        </div>

        {/* Right: Upload, Delete & Refresh Actions */}
        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          <button 
            className="btn btn-secondary btn-sm"
            onClick={refreshAll}
            title="Refresh all records"
          >
            <RefreshCw size={14} style={{ marginRight: '0.35rem' }} />
            <span>Refresh</span>
          </button>

          <button 
            className="btn btn-secondary btn-sm"
            onClick={handleOpenDeleteModal}
            title="Delete documents and bank transactions for testing"
            style={{ 
              color: '#DC2626',
              borderColor: '#FECACA',
              backgroundColor: '#FEF2F2'
            }}
          >
            <Trash2 size={14} style={{ marginRight: '0.35rem', color: '#DC2626' }} />
            <span>Delete</span>
          </button>

          <button 
            className="btn btn-primary btn-sm"
            onClick={() => setIsUploadOpen(true)}
          >
            <Upload size={14} style={{ marginRight: '0.35rem' }} />
            <span>Upload Document</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Table View */}
      {/* Unified Financial Records Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <RefreshCw size={24} className="spin" style={{ marginBottom: '0.75rem' }} />
              <div>Loading financial records...</div>
            </div>
          ) : displayedRecords.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
              <FileSpreadsheet size={36} style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
              <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                No financial records match the selected filters
              </div>
              <div style={{ fontSize: '0.82rem' }}>
                Try clearing your search query or switching to the <strong>All Financial Records</strong> tab.
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Record ID</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Record Type</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Date</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Description</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)' }}>Money In</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)' }}>Money Out</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)' }}>Document Amount</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRecords.map((r, idx) => {
                    const isBank = r.record_type === 'BANK_TRANSACTION';
                    const isSetupDoc = Boolean(r.is_company_setup || r.record_type_label === 'Company Setup Document' || r.source === 'COMPANY_SETUP');
                    const isStockTakeDoc = Boolean(
                      r.accounting_category === 'Stock Take' ||
                      r.document_type === 'Stock Take' ||
                      (r.filename && (r.filename.startsWith('SK-') || r.filename.toLowerCase().includes('stock take')))
                    );
                    const effectiveStockTakeTotal = -177043.23;

                    const desc = getCleanDescription(r);

                    const isError = r.status === "ERROR" || r.status === "FAILED" || r.validation_status === "Failed" || r.extraction_status === "Extraction Failed";
                    const isReview = !isError && (r.needs_review === true || r.validation_status === "Review Required" || r.status === "NEEDS_REVIEW");

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.15s' }}>
                        {/* 1. Record ID */}
                        <td style={{ padding: '0.85rem 1rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                          {isBank ? (
                            <span className="doc-id-pill doc-pill-bank" style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
                              {r.record_id}
                            </span>
                          ) : (
                            <span className="doc-id-pill doc-pill-doc" style={{ backgroundColor: '#FAF5FF', color: '#7E22CE', border: '1px solid #E9D5FF' }}>
                              {r.record_id}
                            </span>
                          )}
                        </td>

                        {/* 2. Record Type */}
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span className={isBank ? 'badge-record-bank' : 'badge-record-doc'}>
                            {isBank ? (
                              <Landmark size={12} style={{ color: '#1D4ED8' }} />
                            ) : (
                              <FileText size={12} style={{ color: '#7E22CE' }} />
                            )}
                            <span>{isBank ? 'Bank Transaction' : 'Accounting Document'}</span>
                          </span>
                        </td>

                        {/* 3. Date */}
                        <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)' }}>
                          {formatDisplayDate(r.date)}
                        </td>

                        {/* 4. Description */}
                        <td style={{ padding: '0.85rem 1rem', color: 'var(--text-primary)', maxWidth: '320px', wordBreak: 'break-word' }}>
                          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)' }}>
                            {isBank ? (
                              <Landmark size={13} style={{ color: '#1D4ED8', flexShrink: 0 }} />
                            ) : (
                              <FileText size={13} style={{ color: '#7E22CE', flexShrink: 0 }} />
                            )}
                            <span>{desc}</span>
                          </div>
                        </td>

                        {/* 5. Money In */}
                        <td style={{ padding: "0.85rem 1rem", textAlign: "right", fontWeight: 600, color: (isBank && r.money_in > 0) ? "var(--status-success-text)" : "var(--text-muted)" }}>
                          {isBank && r.money_in > 0 ? `RM ${Number(r.money_in).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                        </td>

                        {/* 6. Money Out */}
                        <td style={{ padding: "0.85rem 1rem", textAlign: "right", fontWeight: 600, color: (isBank && r.money_out > 0) ? "var(--text-primary)" : "var(--text-muted)" }}>
                          {isBank && r.money_out > 0 ? `RM ${Number(r.money_out).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                        </td>

                        {/* 7. Document Amount */}
                        <td style={{ padding: "0.85rem 1rem", textAlign: "right", fontWeight: 600 }}>
                          {isBank ? (
                            <span style={{ color: "var(--text-muted)" }}>—</span>
                          ) : desc === "Opening Trial Balance" || r.accounting_category === "Opening Trial Balance" ? (
                            <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: "0.1rem" }}>
                              <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>RM 480,500.00</span>
                              <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 500 }}>Total Dr / Cr</span>
                            </span>
                          ) : isStockTakeDoc ? (
                            <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: "0.1rem" }}>
                              <span style={{ color: "#dc2626", fontWeight: 700 }}>
                                -RM {Math.abs(effectiveStockTakeTotal).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 500 }}>Net Stock Adj</span>
                            </span>
                          ) : (desc === "Delivery Order" || r.accounting_category === "Delivery Order") && (r.amount > 0 || r.document_amount > 0) ? (
                            <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
                              {r.document_amount || r.amount} units
                            </span>
                          ) : (r.original_currency && !['MYR', 'RM'].includes(String(r.original_currency).toUpperCase())) ? (
                            <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: "0.1rem" }}>
                              <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                                RM {Number(r.document_amount || r.converted_amount_myr || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                                {r.original_currency} {Number(r.original_amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </span>
                          ) : (r.document_amount && r.document_amount !== 0) ? (
                            <span style={{ color: "var(--text-primary)" }}>
                              RM {Number(r.document_amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          ) : (r.amount && r.amount !== 0) ? (
                            <span style={{ color: "var(--text-primary)" }}>
                              RM {Number(r.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>—</span>
                          )}
                        </td>

                        {/* 8. Status */}
                        <td style={{ padding: "0.85rem 1rem", textAlign: "center" }}>
                          {isError ? (
                            <span className="status-badge FAILED" style={{ fontSize: "0.72rem", padding: "0.2rem 0.55rem" }}>
                              Extraction Failed
                            </span>
                          ) : isReview ? (
                            <span className="status-badge NEEDS_REVIEW" style={{ fontSize: "0.72rem", padding: "0.2rem 0.55rem" }}>
                              Review Required
                            </span>
                          ) : (
                            <span className="status-badge EXTRACTED" style={{ fontSize: "0.72rem", padding: "0.2rem 0.55rem" }}>
                              Extracted
                            </span>
                          )}
                        </td>

                        {/* 9. Actions */}
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                          {isBank ? (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleOpenBankDetails(r)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                              <Eye size={13} />
                              <span>View Details</span>
                            </button>
                          ) : (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleOpenDocDetails(r)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                              <Eye size={13} />
                              <span>View Document</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>


      {/* Upload Document Modal */}
      <DocumentUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={() => {
          refreshAll();
        }}
      />

      {/* Simulate Error Demo Modal */}
      {isSimulateModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1050,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card, #ffffff)',
            borderRadius: '10px',
            border: '1px solid var(--border-color)',
            width: '100%',
            maxWidth: '620px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
            padding: '1.5rem'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sparkles size={20} style={{ color: 'var(--color-primary)' }} />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Simulate Error Scenarios (AI Verification Demo)
                </h3>
              </div>
              <button 
                onClick={() => setIsSimulateModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.45 }}>
              Test how the autonomous agent handles document anomalies. Click <strong>Simulate Upload</strong> to instantly process the test scenario, or <strong>Download PDF</strong> to get the standalone file.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Scenario 1: Math Error */}
              <div style={{
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '1rem 1.15rem',
                backgroundColor: 'var(--bg-primary, #F8FAFC)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                      Deterministic Math Check
                    </span>
                    <h4 style={{ margin: '0.4rem 0 0.2rem', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      1. Math Discrepancy (PI-000005)
                    </h4>
                  </div>
                </div>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Purchase Invoice line items sum to <strong>RM 42,800.00</strong>, but the stated grand total is <strong>RM 39,278.00</strong>. Calculation Agent detects the discrepancy and flags <strong>Review Required</strong>.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <a 
                    href="/api/documents/demo-pdf/math_error" 
                    download="PI-000005 (Math Discrepancy).pdf"
                    className="btn btn-secondary btn-sm"
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                  >
                    <Download size={13} style={{ marginRight: '0.35rem' }} />
                    <span>Download PDF</span>
                  </a>
                  <button 
                    className="btn btn-primary btn-sm"
                    onClick={() => handleRunSimulation('math_error')}
                    disabled={!!simulatingScenario}
                  >
                    {simulatingScenario === 'math_error' ? 'Simulating...' : 'Simulate Upload'}
                  </button>
                </div>
              </div>

              {/* Scenario 2: Duplicate Document */}
              <div style={{
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '1rem 1.15rem',
                backgroundColor: 'var(--bg-primary, #F8FAFC)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: 'rgba(234, 179, 8, 0.12)', color: 'var(--status-warning-text)', border: '1px solid rgba(234, 179, 8, 0.25)' }}>
                      Idempotency & Duplicate Check
                    </span>
                    <h4 style={{ margin: '0.4rem 0 0.2rem', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      2. Duplicate Document (SO-000001)
                    </h4>
                  </div>
                </div>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Simulates re-uploading Sales Order <strong>SO-000001</strong> into the active company. The system immediately rejects duplicate creation and displays <strong>Duplicate Skipped</strong>.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <a 
                    href="/api/documents/demo-pdf/duplicate" 
                    download="SO-000001 (Duplicate).pdf"
                    className="btn btn-secondary btn-sm"
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                  >
                    <Download size={13} style={{ marginRight: '0.35rem' }} />
                    <span>Download PDF</span>
                  </a>
                  <button 
                    className="btn btn-primary btn-sm"
                    onClick={() => handleRunSimulation('duplicate')}
                    disabled={!!simulatingScenario}
                  >
                    {simulatingScenario === 'duplicate' ? 'Simulating...' : 'Simulate Upload'}
                  </button>
                </div>
              </div>

              {/* Scenario 3: Company Mismatch */}
              <div style={{
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '1rem 1.15rem',
                backgroundColor: 'var(--bg-primary, #F8FAFC)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: 'rgba(59, 130, 246, 0.12)', color: 'var(--color-primary)', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
                      Company Context Agent
                    </span>
                    <h4 style={{ margin: '0.4rem 0 0.2rem', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      3. Foreign Entity / Company Mismatch (INV-FRAUD-01)
                    </h4>
                  </div>
                </div>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  An invoice billed between third parties (<em>Apex Tech</em> & <em>Zenith Global</em>). Company Context Agent detects that the active company is not a participant and <strong>immediately rejects the document at extraction</strong> (Entity Concept IAS 1 / MFRS 101).
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <a 
                    href="/api/documents/demo-pdf/company_mismatch" 
                    download="INV-FRAUD-01 (Entity Mismatch).pdf"
                    className="btn btn-secondary btn-sm"
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                  >
                    <Download size={13} style={{ marginRight: '0.35rem' }} />
                    <span>Download PDF</span>
                  </a>
                  <button 
                    className="btn btn-primary btn-sm"
                    onClick={() => handleRunSimulation('company_mismatch')}
                    disabled={!!simulatingScenario}
                  >
                    {simulatingScenario === 'company_mismatch' ? 'Simulating...' : 'Simulate Upload'}
                  </button>
                </div>
              </div>

              {/* Scenario 4: Abnormal Cash Deficit */}
              <div style={{
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '1rem 1.15rem',
                backgroundColor: 'var(--bg-primary, #F8FAFC)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '4px', backgroundColor: 'rgba(239, 68, 68, 0.12)', color: 'var(--status-error-text)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                      GL Guard / Inversion Anomaly
                    </span>
                    <h4 style={{ margin: '0.4rem 0 0.2rem', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      4. Abnormal Cash Deficit Violation (PV-DEFICIT-01)
                    </h4>
                  </div>
                </div>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Payment voucher attempting to disburse RM 9,000 directly from <em>Petty Cash (320-0000)</em>. The General Ledger Guard detects that posting exceeds available petty cash (pushing physical cash negative) and halts posting.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <a 
                    href="/api/documents/demo-pdf/cash_deficit" 
                    download="PV-DEFICIT-01 (Abnormal Cash Deficit).pdf"
                    className="btn btn-secondary btn-sm"
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                  >
                    <Download size={13} style={{ marginRight: '0.35rem' }} />
                    <span>Download PDF</span>
                  </a>
                  <button 
                    className="btn btn-primary btn-sm"
                    onClick={() => handleRunSimulation('cash_deficit')}
                    disabled={!!simulatingScenario}
                  >
                    {simulatingScenario === 'cash_deficit' ? 'Simulating...' : 'Simulate Upload'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Detail Modal */}
      {selectedDoc && (
        <DocumentDetailModal
          isOpen={!!selectedDoc}
          onClose={() => {
            setSelectedDoc(null);
            setReturnToBankTx(null);
          }}
          onBackToBank={returnToBankTx ? handleBackToBankFromDoc : undefined}
          onDocumentUpdated={(updatedDoc) => {
            setSelectedDoc(updatedDoc);
            refreshAll();
          }}
          document={selectedDoc}
        />
      )}

      {/* Bank Transaction Detail Modal */}
      {selectedBankTx && (
        <BankTransactionDetailModal
          isOpen={isBankModalOpen}
          onClose={() => {
            setIsBankModalOpen(false);
            setSelectedBankTx(null);
          }}
          transaction={selectedBankTx}
          allDocuments={documents}
          onUpdate={refreshAll}
          onViewDocument={handleViewDocumentFromBank}
        />
      )}

      {/* Delete Accounting Document Confirmation Modal */}
      {deleteConfirmDoc && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px', width: '90%' }}>
            {/* Modal Header */}
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--status-error-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--status-error-text)'
                }}>
                  <Trash2 size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                    Delete Accounting Document
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                    Confirmation & Accounting Safety Validation
                  </p>
                </div>
              </div>
              <button 
                onClick={() => { if (!isDeleting) setDeleteConfirmDoc(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.25rem' }}
                disabled={isDeleting}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {deleteError && (
                <div style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: 'var(--status-error-bg)',
                  border: '1px solid var(--status-error-border)',
                  color: 'var(--status-error-text)',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem'
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                  <div>{deleteError}</div>
                </div>
              )}

              <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.5, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span>Are you sure you want to delete accounting document</span>
                <span className="doc-id-pill doc-pill-doc" style={{ backgroundColor: '#FAF5FF', color: '#7E22CE', border: '1px solid #E9D5FF' }}>{deleteConfirmDoc.record_id}</span>?
              </p>

              {/* Document Summary Card */}
              <div style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                fontSize: '0.8rem',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.75rem'
              }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600 }}>Document ID</div>
                  <div style={{ marginTop: '0.15rem' }}>
                    <span className="doc-id-pill doc-pill-doc" style={{ backgroundColor: '#FAF5FF', color: '#7E22CE', border: '1px solid #E9D5FF' }}>{deleteConfirmDoc.record_id}</span>
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600 }}>Date</div>
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{formatDisplayDate(deleteConfirmDoc.date)}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600 }}>Description</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{deleteConfirmDoc.description_party}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600 }}>Total Amount</div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                    RM {Number(deleteConfirmDoc.money_in || deleteConfirmDoc.money_out || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Safety notice */}
              <div style={{
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
                backgroundColor: '#EFF6FF',
                border: '1px solid #BFDBFE',
                borderRadius: '6px',
                padding: '0.75rem',
                lineHeight: 1.45
              }}>
                <strong>Accounting Safety:</strong> Deletion will remove the staged transaction and draft journal entries. Any matched bank transactions will be safely unlinked and reset to UNMATCHED. Deletion is automatically blocked if this document is posted to the General Ledger.
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '0.85rem 1.25rem',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              alignItems: 'center'
            }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setDeleteConfirmDoc(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                {isDeleting ? (
                  <>
                    <RefreshCw size={13} className="spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={13} />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Documents Modal (Testing & Ingestion Reset) */}
      {isDeleteModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '1.5rem'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            width: '100%',
            maxWidth: deleteModalStep === 'SELECT' ? '1060px' : '680px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid var(--border-color)',
            transition: 'max-width 0.2s ease'
          }}>
            {deleteModalStep === 'SELECT' ? (
              <>
                {/* Modal Header */}
                <div style={{
                  padding: '1.15rem 1.5rem',
                  borderBottom: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#FAFAFA'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      backgroundColor: '#FEE2E2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#DC2626'
                    }}>
                      <Trash2 size={18} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Delete Financial Records
                      </h3>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        Select accounting documents and ABC Bank transactions to delete for ingestion and matching testing.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleCloseDeleteModal}
                    disabled={isBatchDeleting}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: isBatchDeleting ? 'not-allowed' : 'pointer',
                      padding: '0.35rem',
                      borderRadius: '6px'
                    }}
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Toolbar with Select All, Type Filters, and Selected Count */}
                <div style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#F8FAFC',
                  borderBottom: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap',
                  fontSize: '0.82rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={handleSelectAllRecords}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem' }}
                    >
                      {selectableRecords.length > 0 && selectableRecords.every(r => selectedRecordIds.has(r.record_id))
                        ? 'Deselect All'
                        : `Select All (${selectableRecords.length})`}
                    </button>

                    <div style={{ display: 'inline-flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                      <button
                        type="button"
                        onClick={() => setDeleteModalTypeFilter('ALL')}
                        style={{
                          padding: '0.25rem 0.65rem',
                          fontSize: '0.75rem',
                          border: 'none',
                          cursor: 'pointer',
                          backgroundColor: deleteModalTypeFilter === 'ALL' ? 'var(--primary-color, #2563EB)' : '#ffffff',
                          color: deleteModalTypeFilter === 'ALL' ? '#ffffff' : 'var(--text-secondary)',
                          fontWeight: deleteModalTypeFilter === 'ALL' ? 600 : 500
                        }}
                      >
                        All ({unifiedRecords.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteModalTypeFilter('DOCUMENTS')}
                        style={{
                          padding: '0.25rem 0.65rem',
                          fontSize: '0.75rem',
                          border: 'none',
                          borderLeft: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          backgroundColor: deleteModalTypeFilter === 'DOCUMENTS' ? '#4F46E5' : '#ffffff',
                          color: deleteModalTypeFilter === 'DOCUMENTS' ? '#ffffff' : 'var(--text-secondary)',
                          fontWeight: deleteModalTypeFilter === 'DOCUMENTS' ? 600 : 500
                        }}
                      >
                        Accounting Docs ({totalDocsInSystem})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteModalTypeFilter('COMPANY_SETUP')}
                        style={{
                          padding: '0.25rem 0.65rem',
                          fontSize: '0.75rem',
                          border: 'none',
                          borderLeft: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          backgroundColor: deleteModalTypeFilter === 'COMPANY_SETUP' ? '#2563EB' : '#ffffff',
                          color: deleteModalTypeFilter === 'COMPANY_SETUP' ? '#ffffff' : 'var(--text-secondary)',
                          fontWeight: deleteModalTypeFilter === 'COMPANY_SETUP' ? 600 : 500
                        }}
                      >
                        Company Setup ({totalSetupInSystem})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteModalTypeFilter('BANK')}
                        style={{
                          padding: '0.25rem 0.65rem',
                          fontSize: '0.75rem',
                          border: 'none',
                          borderLeft: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          backgroundColor: deleteModalTypeFilter === 'BANK' ? '#0D9488' : '#ffffff',
                          color: deleteModalTypeFilter === 'BANK' ? '#ffffff' : 'var(--text-secondary)',
                          fontWeight: deleteModalTypeFilter === 'BANK' ? 600 : 500
                        }}
                      >
                        Bank Transactions ({totalBankInSystem})
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      <strong>{selectedRecordIds.size}</strong> of <strong>{unifiedRecords.length}</strong> records selected
                      {selectedRecordIds.size > 0 && (
                        <span style={{ color: 'var(--text-muted)', marginLeft: '0.35rem' }}>
                          ({selectedDocCount} doc{selectedSetupCount > 0 ? `, ${selectedSetupCount} setup` : ''}, {selectedBankCount} bank)
                        </span>
                      )}
                    </span>
                    {selectedRecordIds.size > 0 && (
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#DC2626',
                          cursor: 'pointer',
                          fontSize: '0.78rem',
                          textDecoration: 'underline'
                        }}
                      >
                        Clear Selection
                      </button>
                    )}
                  </div>
                </div>

                {/* Table of selectable financial records */}
                <div style={{ overflowY: 'auto', flex: 1, maxHeight: '55vh' }}>
                  {selectableRecords.length === 0 ? (
                    <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <FileSpreadsheet size={36} style={{ opacity: 0.35, marginBottom: '0.65rem' }} />
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                        No records match the selection filter
                      </div>
                      <div style={{ fontSize: '0.8rem' }}>
                        Switch filter to "All" to view all accounting documents and bank transactions.
                      </div>
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: '#FAFAFA', color: 'var(--text-secondary)' }}>
                          <th style={{ width: '40px', padding: '0.65rem 1rem', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={selectableRecords.length > 0 && selectableRecords.every(r => selectedRecordIds.has(r.record_id))}
                              onChange={handleSelectAllRecords}
                              style={{ cursor: 'pointer' }}
                            />
                          </th>
                          <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 600 }}>Record ID</th>
                          <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 600 }}>Record Type</th>
                          <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 600 }}>Date</th>
                          <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 600 }}>Description / Vendor / Customer</th>
                          <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 600 }}>Reference / Invoice No</th>
                          <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 600 }}>Amount (RM)</th>
                          <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', fontWeight: 600 }}>Source</th>
                          <th style={{ padding: '0.65rem 1rem', textAlign: 'center', fontWeight: 600 }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectableRecords.map((r) => {
                          const isSelected = selectedRecordIds.has(r.record_id);
                          const isDoc = r.record_type === 'ACCOUNTING_DOCUMENT';
                          const amt = Number(r.amount ?? r.money_in ?? r.money_out ?? 0);

                          return (
                            <tr
                              key={r.record_id}
                              onClick={() => toggleRecordSelection(r.record_id)}
                              style={{
                                borderBottom: '1px solid var(--border-color)',
                                cursor: 'pointer',
                                backgroundColor: isSelected ? (isDoc ? '#EFF6FF' : '#E5F5F7') : 'transparent',
                                transition: 'background-color 0.15s ease'
                              }}
                            >
                              <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleRecordSelection(r.record_id)}
                                  style={{ cursor: 'pointer' }}
                                />
                              </td>
                              <td style={{ padding: '0.65rem 0.85rem' }}>
                                {isDoc ? (
                                  <span className="doc-id-pill doc-pill-doc" style={{ backgroundColor: '#FAF5FF', color: '#7E22CE', border: '1px solid #E9D5FF' }}>
                                    {r.record_id}
                                  </span>
                                ) : (
                                  <span className="doc-id-pill doc-pill-bank" style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
                                    {r.record_id}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '0.65rem 0.85rem' }}>
                                {isDoc ? (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    padding: '0.15rem 0.45rem',
                                    borderRadius: '4px',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    backgroundColor: 'var(--badge-doc-bg, #EFF6FF)',
                                    color: 'var(--badge-doc-text, #1E40AF)',
                                    border: '1px solid #BFDBFE'
                                  }}>
                                    <FileText size={12} style={{ color: 'var(--color-primary, #2563EB)' }} />
                                    <span>Accounting Document</span>
                                  </span>
                                ) : (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    padding: '0.15rem 0.45rem',
                                    borderRadius: '4px',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    backgroundColor: 'var(--badge-bank-bg, #E5F5F7)',
                                    color: 'var(--badge-bank-text, #147D8C)',
                                    border: '1px solid rgba(20, 125, 140, 0.25)'
                                  }}>
                                    <Landmark size={12} style={{ color: '#147D8C' }} />
                                    <span>Bank Transaction</span>
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)' }}>
                                {formatDisplayDate(r.date)}
                              </td>
                              <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-primary)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description_party}>
                                {r.description_party || '-'}
                              </td>
                              <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                                {r.reference || '-'}
                              </td>
                              <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                                {r.source_label || (isDoc ? 'Manual Upload' : 'ABC Bank Feed')}
                              </td>
                              <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '9999px',
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  backgroundColor: 'var(--status-success-bg, #DCFCE7)',
                                  color: 'var(--status-success-text, #15803D)',
                                  border: '1px solid rgba(21, 128, 61, 0.25)'
                                }}>
                                  {isDoc ? 'Extracted' : (r.is_matched ? 'Matched' : 'Extracted')}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Modal Footer */}
                <div style={{
                  padding: '0.85rem 1.5rem',
                  borderTop: '1px solid var(--border-color)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: '#FAFAFA'
                }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {selectedRecordIds.size === 0
                      ? 'No records selected'
                      : `${selectedRecordIds.size} record(s) chosen (${selectedDocCount} document(s), ${selectedBankCount} bank transaction(s))`}
                  </span>
                  <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleCloseDeleteModal}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={selectedRecordIds.size === 0}
                      onClick={() => setDeleteModalStep('CONFIRM')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <Trash2 size={13} />
                      <span>Delete Selected ({selectedRecordIds.size})</span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Confirmation Step Header */}
                <div style={{
                  padding: '1.15rem 1.5rem',
                  borderBottom: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: isTestingResetMode ? '#FEF2F2' : '#F8FAFC'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      backgroundColor: isTestingResetMode ? '#DC2626' : '#2563EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff'
                    }}>
                      {isTestingResetMode ? <AlertTriangle size={18} /> : <Trash2 size={18} />}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: isTestingResetMode ? '#991B1B' : '#1E293B' }}>
                        {isTestingResetMode ? '⚠️ Confirm Full Testing Reset' : 'Confirm Permanent Deletion'}
                      </h3>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: isTestingResetMode ? '#B91C1C' : '#64748B' }}>
                        {isTestingResetMode
                          ? 'Destructive testing reset: posted journals, GL history, staging data and bank feed records will be cleared.'
                          : 'Standard deletion mode permanently removes unposted documents while strictly preserving posted General Ledger entries and opening balances.'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleCloseDeleteModal}
                    disabled={isBatchDeleting}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: isTestingResetMode ? '#991B1B' : '#64748B',
                      cursor: isBatchDeleting ? 'not-allowed' : 'pointer',
                      padding: '0.35rem',
                      borderRadius: '6px'
                    }}
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Confirmation Body */}
                <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1, maxHeight: '60vh' }}>
                  {batchDeleteError && (
                    <div style={{
                      marginBottom: '1rem',
                      padding: '0.75rem 1rem',
                      borderRadius: '6px',
                      fontSize: '0.82rem',
                      backgroundColor: '#FEF2F2',
                      border: '1px solid #FECACA',
                      color: '#991B1B',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem'
                    }}>
                      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>{batchDeleteError}</div>
                    </div>
                  )}

                  {/* Mode-Specific Information Box */}
                  {!isTestingResetMode ? (
                    /* Standard Deletion Information Box */
                    <div style={{
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      padding: '1rem',
                      marginBottom: '1rem',
                      fontSize: '0.82rem',
                      color: '#334155',
                      lineHeight: 1.55
                    }}>
                      <div style={{ fontWeight: 700, marginBottom: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#1E293B' }}>
                        <Info size={15} style={{ color: '#2563EB' }} />
                        <span>Standard Deletion Policy:</span>
                      </div>
                      <div style={{ marginBottom: '0.4rem' }}>
                        You are about to permanently delete <strong>{selectedRecordIds.size}</strong> record(s):
                        <ul style={{ margin: '0.25rem 0 0.5rem 0', paddingLeft: '1.25rem' }}>
                          {selectedDocCount > 0 && <li><strong>{selectedDocCount}</strong> Accounting Document(s)</li>}
                          {selectedSetupCount > 0 && <li style={{ color: '#D97706' }}><strong>{selectedSetupCount}</strong> Company Setup Document(s) (Protected)</li>}
                          {selectedBankCount > 0 && <li><strong>{selectedBankCount}</strong> ABC Bank Transaction(s)</li>}
                        </ul>
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#475569' }}>
                        <li><strong>Safe Removal:</strong> Staged transactions and managed document files for selected records will be removed.</li>
                        <li><strong>Audit Protection:</strong> If any selected record has already been <strong>POSTED</strong> to the General Ledger, deletion will be safely blocked to preserve accounting integrity.</li>
                        <li><strong>Company Setup Protection:</strong> Permanent onboarding documents and opening balances are protected from deletion in Standard Mode.</li>
                      </ul>

                      {selectedSetupCount > 0 && (
                        <div style={{ marginTop: '0.65rem', padding: '0.5rem 0.75rem', backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '6px', color: '#92400E', fontSize: '0.78rem' }}>
                          ⚠️ <strong>Protected Record Notice:</strong> You have selected {selectedSetupCount} Company Setup document(s). Standard mode will block their deletion to safeguard opening balances. Deselect them or enable Testing Reset Mode below.
                        </div>
                      )}

                      {/* Toggle for Testing Reset Mode */}
                      <div style={{
                        marginTop: '0.85rem',
                        padding: '0.65rem 0.85rem',
                        backgroundColor: '#FFFFFF',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.65rem',
                        cursor: 'pointer'
                      }} onClick={() => setIsTestingResetMode(true)}>
                        <input
                          type="checkbox"
                          id="testResetModeToggle"
                          checked={isTestingResetMode}
                          onChange={(e) => setIsTestingResetMode(e.target.checked)}
                          style={{ cursor: 'pointer', marginTop: '2px', width: '15px', height: '15px' }}
                        />
                        <label htmlFor="testResetModeToggle" style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600, cursor: 'pointer', margin: 0, lineHeight: 1.4 }}>
                          Switch to Testing Reset Mode (Advanced)
                          <span style={{ display: 'block', fontSize: '0.74rem', fontWeight: 400, color: '#64748B', marginTop: '2px' }}>
                            Allows complete testing wipe: removes dependent posted journal entries, GL history, duplicate hashes, and rewinds bank feed cursor for re-import.
                          </span>
                        </label>
                      </div>
                    </div>
                  ) : (
                    /* Testing Reset Information Box */
                    <div style={{
                      backgroundColor: '#FFFBEB',
                      border: '1px solid #FDE68A',
                      borderRadius: '8px',
                      padding: '1rem',
                      marginBottom: '1rem',
                      fontSize: '0.82rem',
                      color: '#92400E',
                      lineHeight: 1.55
                    }}>
                      <div style={{ fontWeight: 700, marginBottom: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#B45309' }}>
                        <AlertTriangle size={15} />
                        <span>Full Testing Reset & Workflow Cleanup:</span>
                      </div>
                      <div style={{ marginBottom: '0.4rem' }}>
                        You are about to execute a full testing reset for <strong>{selectedRecordIds.size}</strong> record(s):
                        <ul style={{ margin: '0.25rem 0 0.5rem 0', paddingLeft: '1.25rem' }}>
                          {selectedDocCount > 0 && <li><strong>{selectedDocCount}</strong> Accounting Document(s)</li>}
                          {selectedSetupCount > 0 && <li style={{ color: '#B45309', fontWeight: 700 }}><strong>{selectedSetupCount}</strong> Company Setup Document(s)</li>}
                          {selectedBankCount > 0 && <li><strong>{selectedBankCount}</strong> ABC Bank Transaction(s)</li>}
                        </ul>
                      </div>

                      {/* Prominent Company Setup Warning if Setup Docs Selected */}
                      {selectedSetupCount > 0 && (
                        <div style={{
                          marginBottom: '0.75rem',
                          padding: '0.65rem 0.85rem',
                          backgroundColor: '#FEF2F2',
                          border: '1px solid #FCA5A5',
                          borderRadius: '6px',
                          color: '#991B1B',
                          fontSize: '0.79rem'
                        }}>
                          <div style={{ fontWeight: 700, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <AlertTriangle size={14} />
                            <span>Warning: Company Setup Documents Selected ({selectedSetupCount})</span>
                          </div>
                          <div>
                            You have included company setup records: <strong>{selectedRecordsList.filter(r => r.record_type === 'COMPANY_SETUP').map(r => r.filename || r.accounting_category).join(', ')}</strong>.
                            Resetting these records will affect opening balances and subsidiary ledger listings. Company profile and Chart of Accounts will remain preserved.
                          </div>
                        </div>
                      )}

                      <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                        <li>
                          <strong>Posted Journals & General Ledger:</strong> All dependent draft and posted journal entries for the selected records will be permanently removed. The General Ledger, Trial Balance, Profit & Loss, and Balance Sheet will dynamically recalculate and reset.
                        </li>
                        <li>
                          <strong>Document Files & Ingestion State:</strong> Storage files, OCR extracted JSON caches, staged transactions, SHA-256 hashes, and duplicate keys will be cleared so you can re-upload or re-scan the exact same files for testing.
                        </li>
                        <li>
                          <strong>ABC Bank Feed:</strong> Selected bank transaction records in the accounting database will be deleted and the bank ingestion cursor will be rewound so transactions can be fetched again from the simulator on port 8010. Original simulator records remain untouched.
                        </li>
                        <li>
                          <strong>Preservation of Unrelated Data:</strong> Unselected records, company profile information, and Chart of Accounts are untouched. Surviving bank transactions matched to deleted documents are unlinked and reset to <code>UNMATCHED</code>.
                        </li>
                      </ul>

                      {/* Testing Reset Active Badge & Toggle */}
                      <div style={{
                        marginTop: '0.85rem',
                        padding: '0.65rem 0.85rem',
                        backgroundColor: '#FEF2F2',
                        borderRadius: '6px',
                        border: '1px solid #FECACA',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.65rem'
                      }}>
                        <input
                          type="checkbox"
                          id="testResetModeToggleActive"
                          checked={isTestingResetMode}
                          onChange={(e) => setIsTestingResetMode(e.target.checked)}
                          style={{ cursor: 'pointer', marginTop: '2px', width: '15px', height: '15px' }}
                        />
                        <label htmlFor="testResetModeToggleActive" style={{ fontSize: '0.8rem', color: '#991B1B', fontWeight: 600, cursor: 'pointer', margin: 0, lineHeight: 1.4 }}>
                          Testing Reset Mode Active: Posted journal entries and General Ledger history for selected records will be permanently removed.
                          <span style={{ display: 'block', fontSize: '0.74rem', fontWeight: 400, color: '#B91C1C', marginTop: '2px' }}>
                            Uncheck to return to Standard Deletion Mode.
                          </span>
                        </label>
                      </div>
                    </div>
                  )}

                  <div style={{ marginBottom: '0.65rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Records scheduled for permanent deletion ({selectedRecordIds.size}):
                  </div>

                  <div style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    maxHeight: '180px',
                    overflowY: 'auto',
                    backgroundColor: '#FAFAFA'
                  }}>
                    {selectedRecordsList.map(r => {
                      const isDoc = r.record_type === 'ACCOUNTING_DOCUMENT';
                      const amt = Number(r.amount ?? r.money_in ?? r.money_out ?? 0);

                      return (
                        <div
                          key={r.record_id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.5rem 0.85rem',
                            borderBottom: '1px solid var(--border-color)',
                            fontSize: '0.8rem'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', overflow: 'hidden' }}>
                            {isDoc ? (
                              <span className="doc-id-pill doc-pill-doc" style={{ backgroundColor: '#FAF5FF', color: '#7E22CE', border: '1px solid #E9D5FF', minWidth: '110px', textAlign: 'center' }}>
                                {r.record_id}
                              </span>
                            ) : (
                              <span className="doc-id-pill doc-pill-bank" style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', minWidth: '110px', textAlign: 'center' }}>
                                {r.record_id}
                              </span>
                            )}
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.1rem 0.4rem',
                              borderRadius: '4px',
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              backgroundColor: isDoc ? 'var(--badge-doc-bg, #EFF6FF)' : 'var(--badge-bank-bg, #E5F5F7)',
                              color: isDoc ? 'var(--badge-doc-text, #1E40AF)' : 'var(--badge-bank-text, #147D8C)',
                              border: isDoc ? '1px solid #BFDBFE' : '1px solid rgba(20, 125, 140, 0.25)'
                            }}>
                              {isDoc ? <FileText size={10} /> : <Landmark size={10} />}
                              <span>{isDoc ? 'Document' : 'Bank'}</span>
                            </span>
                            <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description_party}>
                              {r.description_party}
                            </span>
                            {r.reference && r.reference !== '-' && (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>
                                ({r.reference})
                              </span>
                            )}
                          </div>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>
                            RM {amt.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Confirmation Footer */}
                <div style={{
                  padding: '0.85rem 1.5rem',
                  borderTop: '1px solid var(--border-color)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: '#FAFAFA'
                }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setDeleteModalStep('SELECT')}
                    disabled={isBatchDeleting}
                  >
                    Back to Selection
                  </button>
                  <div style={{ display: 'flex', gap: '0.65rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleCloseDeleteModal}
                      disabled={isBatchDeleting}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={handleExecuteBatchDelete}
                      disabled={isBatchDeleting}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      {isBatchDeleting ? (
                        <>
                          <RefreshCw size={13} className="spin" />
                          <span>Deleting {selectedRecordIds.size} Record(s)...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 size={13} />
                          <span>{isTestingResetMode ? `Execute Testing Reset (${selectedRecordIds.size})` : `Confirm Permanent Deletion (${selectedRecordIds.size})`}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
