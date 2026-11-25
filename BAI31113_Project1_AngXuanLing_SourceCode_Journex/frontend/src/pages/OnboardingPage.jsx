import React, { useState, useEffect } from 'react';
import { formatApiError } from '../utils/apiError';
import { 
  Building2, 
  UploadCloud, 
  FileCheck2, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Scale, 
  Users, 
  Package, 
  Sparkles,
  FileText,
  ShieldCheck,
  RefreshCw,
  Clock,
  Eye,
  ExternalLink,
  X,
  Info,
  Calendar,
  CreditCard,
  Phone,
  Mail,
  MapPin,
  Check,
  AlertTriangle
} from 'lucide-react';

export default function OnboardingPage({ 
  sessionId, 
  companyId, 
  onActivationSuccess, 
  onBackToRegister, 
  onBackToDashboard, 
  onLogout 
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [currentCompanyId, setCurrentCompanyId] = useState(companyId || localStorage.getItem('active_company_id') || null);

  useEffect(() => {
    if (companyId) {
      setCurrentCompanyId(companyId);
    }
  }, [companyId]);

  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [retryingFileId, setRetryingFileId] = useState(null);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState(null);

  // Step 1: Company Profile Form State
  const [companyProfile, setCompanyProfile] = useState({
    company_name: '',
    registration_number: '',
    address: '',
    email: '',
    phone: '',
    currency: 'MYR',
    financial_year: 2026,
    financial_year_start: '2026-01-01',
    financial_year_end: '2026-12-31',
    tax_number: ''
  });

  // Step 2: Uploaded Documents State
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  // Step 3: Extracted Drafts & Validation State
  const [activeTab, setActiveTab] = useState('TRIAL_BALANCE');
  const [drafts, setDrafts] = useState([]);
  const [validation, setValidation] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null); // 'saving', 'saved', null

  // Modals
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // New Draft Modal Form
  const [newDraftForm, setNewDraftForm] = useState({
    category: 'TRIAL_BALANCE',
    account_code: '',
    account_name: '',
    entity_name: '',
    item_code: '',
    invoice_no: '',
    invoice_date: '',
    credit_term: '',
    debit: 0,
    credit: 0,
    quantity: 0,
    unit_cost: 0,
    amount: 0,
    review_status: 'VERIFIED',
    notes: 'Manually added'
  });

  // Load session or company state on mount
  useEffect(() => {
    if (sessionId) {
      loadSessionState();
    } else {
      const cid = companyId || currentCompanyId || localStorage.getItem('active_company_id');
      if (cid) {
        if (!currentCompanyId) setCurrentCompanyId(cid);
        loadCompanyState(cid);
      } else {
        const token = localStorage.getItem('auth_token');
        if (token) {
          fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(me => {
              if (me && me.companies && me.companies.length > 0) {
                const latest = me.companies[me.companies.length - 1].company_id;
                setCurrentCompanyId(latest);
                localStorage.setItem('active_company_id', latest);
                loadCompanyState(latest);
              }
            })
            .catch(err => console.warn('Could not auto-fetch user company:', err));
        }
      }
    }
  }, [sessionId, companyId]);

  const loadSessionState = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/onboarding/session/${sessionId}`);
      if (!res.ok) {
        throw new Error('Failed to retrieve registration session. It may have expired.');
      }
      const data = await res.json();
      if (data.company_data) {
        setCompanyProfile(prev => ({
          ...prev,
          ...data.company_data
        }));
      }
      if (data.uploaded_files) {
        setUploadedFiles(data.uploaded_files);
      }
      if (data.extracted_data) {
        setDrafts(data.extracted_data);
      }
      if (data.validation) {
        setValidation(data.validation);
      }
      if (data.step) {
        setCurrentStep(data.step);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCompanyState = async (targetCid = companyId || currentCompanyId) => {
    if (!targetCid) return;
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/onboarding/company-state?company_id=${targetCid}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.company_data) {
          setCompanyProfile(prev => ({
            ...prev,
            ...data.company_data
          }));
        }
        if (data.uploaded_files && data.uploaded_files.length > 0) {
          setUploadedFiles(data.uploaded_files);
        }
        if (data.extracted_data && data.extracted_data.length > 0) {
          setDrafts(data.extracted_data);
        }
        if (data.validation) {
          setValidation(data.validation);
        }
        if (data.step && data.step > 1) {
          setCurrentStep(data.step);
        }
      }
    } catch (err) {
      console.warn('Failed to load company state:', err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-sync or extract Step 3 data when entering Step 3
  useEffect(() => {
    const targetCid = currentCompanyId || companyId || localStorage.getItem('active_company_id');
    if (currentStep === 3 && drafts.length === 0 && !extracting) {
      (async () => {
        try {
          const token = localStorage.getItem('auth_token');
          const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
          let cid = targetCid;
          if (!cid && token) {
            const meRes = await fetch('/api/auth/me', { headers });
            if (meRes.ok) {
              const me = await meRes.json();
              if (me.companies && me.companies.length > 0) {
                cid = me.companies[me.companies.length - 1].company_id;
                setCurrentCompanyId(cid);
                localStorage.setItem('active_company_id', cid);
              }
            }
          }
          if (cid) {
            const res = await fetch(`/api/onboarding/company-state?company_id=${cid}`, { headers });
            if (res.ok) {
              const data = await res.json();
              if (data.extracted_data && data.extracted_data.length > 0) {
                setDrafts(data.extracted_data);
                if (data.uploaded_files) setUploadedFiles(data.uploaded_files);
                if (data.validation) setValidation(data.validation);
                if (data.company_data) setCompanyProfile(prev => ({ ...prev, ...data.company_data }));
                return;
              }
            }
            await handleProceedToStep3();
          }
        } catch (e) {
          console.error('Error auto-loading Step 3:', e);
        }
      })();
    }
  }, [currentStep, currentCompanyId, companyId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 1 ACTIONS
  // ─────────────────────────────────────────────────────────────────────────────
  const handleSaveStep1 = async (e) => {
    e.preventDefault();
    setError(null);

    if (!companyProfile.company_name.trim()) {
      setError('Company Name is required.');
      return;
    }

    if (sessionId) {
      try {
        setLoading(true);
        const res = await fetch(`/api/onboarding/session/${sessionId}/company`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(companyProfile)
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(formatApiError(data, 'Failed to save company profile.'));
        }
        setCurrentStep(2);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Authenticated persistent Setup Company workflow
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };

      const payload = {
        company_name: companyProfile.company_name.trim(),
        registration_number: companyProfile.registration_number ? companyProfile.registration_number.trim() : null,
        address: companyProfile.address ? companyProfile.address.trim() : null,
        email: companyProfile.email ? companyProfile.email.trim() : null,
        phone: companyProfile.phone ? companyProfile.phone.trim() : null,
        currency: companyProfile.currency || 'MYR',
        financial_year: parseInt(companyProfile.financial_year, 10) || 2026,
        financial_year_start: companyProfile.financial_year_start || null,
        financial_year_end: companyProfile.financial_year_end || null,
        ...(currentCompanyId ? { company_id: currentCompanyId } : {})
      };

      const res = await fetch('/api/onboarding/company', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(formatApiError(data, 'Failed to save company profile.'));
      }

      if (!data.company_id) {
        throw new Error('Company creation succeeded but no company ID was returned.');
      }

      setCurrentCompanyId(data.company_id);
      localStorage.setItem('active_company_id', data.company_id);
      setCurrentStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRegistration = async () => {
    try {
      setLoading(true);
      if (sessionId) {
        await fetch(`/api/onboarding/session/${sessionId}/cancel`, {
          method: 'POST'
        });
      }
      setShowCancelModal(false);
      if (onBackToRegister) {
        onBackToRegister();
      }
    } catch (err) {
      console.error('Error cancelling session:', err);
      setShowCancelModal(false);
      if (onBackToRegister) {
        onBackToRegister();
      }
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 2 ACTIONS: Single General Multi-PDF Upload & Document Status Tracking
  // ─────────────────────────────────────────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (!sessionId && !currentCompanyId) {
      setError('Company ID is missing. Please complete Step 1 to set up your company before uploading documents.');
      e.target.value = null;
      return;
    }

    setIsUploading(true);
    setError(null);

    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setError(`"${file.name}" is not a PDF file. Please upload PDF documents.`);
        continue;
      }

      const token = localStorage.getItem('auth_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const formData = new FormData();
      formData.append('file', file);

      try {
        let res;
        if (sessionId) {
          res = await fetch(`/api/onboarding/session/${sessionId}/upload`, {
            method: 'POST',
            headers,
            body: formData
          });
        } else {
          formData.append('company_id', currentCompanyId);
          formData.append('doc_category', 'TRIAL_BALANCE');
          res = await fetch('/api/onboarding/documents', {
            method: 'POST',
            headers,
            body: formData
          });
        }

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(formatApiError(errData, `Failed to upload ${file.name}`));
        }

        const data = await res.json();
        setUploadedFiles(prev => {
          if (sessionId) {
            const exists = prev.some(f => f.file_id === data.file_id);
            return exists ? prev : [...prev, data];
          } else {
            return [...prev, {
              file_id: String(data.id),
              original_filename: data.original_filename,
              file_size: data.file_size,
              mime_type: data.mime_type,
              status: data.extraction_status
            }];
          }
        });
      } catch (err) {
        setError(err.message);
      }
    }

    setIsUploading(false);
    e.target.value = null;
  };

  const handleDeleteFile = async (fileId) => {
    try {
      if (sessionId) {
        const res = await fetch(`/api/onboarding/session/${sessionId}/files/${fileId}`, {
          method: 'DELETE'
        });
        if (!res.ok) {
          throw new Error('Failed to delete file.');
        }
      }
      setUploadedFiles(prev => prev.filter(f => f.file_id !== fileId));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleProceedToStep3 = async () => {
    setError(null);
    try {
      setExtracting(true);
      let res;
      const token = localStorage.getItem('auth_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      if (sessionId) {
        res = await fetch(`/api/onboarding/session/${sessionId}/extract`, {
          method: 'POST'
        });
      } else {
        const targetCid = currentCompanyId || companyId || localStorage.getItem('active_company_id');
        if (targetCid) {
          res = await fetch(`/api/onboarding/company-extract?company_id=${targetCid}`, {
            method: 'POST',
            headers
          });
        } else {
          setCurrentStep(3);
          return;
        }
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(formatApiError(data, 'Failed to process documents with DocumentProcessingAgent.'));
      }
      if (data.uploaded_files) {
        setUploadedFiles(data.uploaded_files);
      }
      if (data.extracted_data) {
        setDrafts(data.extracted_data);
      }
      if (data.validation) {
        setValidation(data.validation);
      }
      if (data.company_data) {
        setCompanyProfile(prev => ({
          ...prev,
          ...data.company_data
        }));
      }
      setCurrentStep(3);
    } catch (err) {
      setError(err.message);
      // Even with partial warning, proceed so user can inspect and review
      setCurrentStep(3);
    } finally {
      setExtracting(false);
    }
  };

  const handleRetrySingleFile = async (fileId) => {
    try {
      setRetryingFileId(fileId);
      setError(null);
      const token = localStorage.getItem('auth_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      let res;
      if (sessionId) {
        res = await fetch(`/api/onboarding/session/${sessionId}/extract?file_id=${fileId}`, {
          method: 'POST'
        });
      } else if (currentCompanyId) {
        res = await fetch(`/api/onboarding/company-extract?company_id=${currentCompanyId}&file_id=${fileId}`, {
          method: 'POST',
          headers
        });
      } else {
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(formatApiError(data, 'Retry extraction failed.'));
      }
      if (data.uploaded_files) {
        setUploadedFiles(data.uploaded_files);
      }
      if (data.extracted_data) {
        setDrafts(data.extracted_data);
      }
      if (data.validation) {
        setValidation(data.validation);
      }
    } catch (err) {
      setError(`Retry failed: ${err.message}`);
    } finally {
      setRetryingFileId(null);
    }
  };

  const handleViewOriginalPdf = (fileId, docId) => {
    if (sessionId && fileId) {
      window.open(`/api/onboarding/session/${sessionId}/files/${fileId}`, '_blank');
    } else if (fileId || docId) {
      const target = fileId || docId;
      window.open(`/api/onboarding/documents/${target}/file`, '_blank');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 3 ACTIONS: Review, Edit, Reconcile, and Final Confirm
  // ─────────────────────────────────────────────────────────────────────────────
  const triggerValidation = async () => {
    try {
      setValidating(true);
      const token = localStorage.getItem('auth_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const targetCid = currentCompanyId || companyId || localStorage.getItem('active_company_id');

      if (sessionId) {
        const res = await fetch(`/api/onboarding/session/${sessionId}/validate`);
        if (res.ok) {
          const valData = await res.json();
          setValidation(valData);
        }
      } else if (targetCid) {
        // Refresh full company state so drafts, files and validation are all refreshed together!
        const stateRes = await fetch(`/api/onboarding/company-state?company_id=${targetCid}`, { headers });
        if (stateRes.ok) {
          const stateData = await stateRes.json();
          if (stateData.uploaded_files) setUploadedFiles(stateData.uploaded_files);
          if (stateData.extracted_data) setDrafts(stateData.extracted_data);
          if (stateData.validation) setValidation(stateData.validation);
          if (stateData.company_data) setCompanyProfile(prev => ({ ...prev, ...stateData.company_data }));
        } else {
          const res = await fetch(`/api/onboarding/validate?company_id=${targetCid}`, { headers });
          if (res.ok) {
            const valData = await res.json();
            setValidation(valData);
          }
        }
      }
    } catch (err) {
      console.warn('Validation error:', err);
    } finally {
      setValidating(false);
    }
  };

  const saveDraftsToServer = async (updatedDrafts) => {
    try {
      setSaveStatus('saving');
      const token = localStorage.getItem('auth_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };
      let res;
      if (sessionId) {
        res = await fetch(`/api/onboarding/session/${sessionId}/drafts`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(updatedDrafts)
        });
      } else {
        const targetCid = currentCompanyId || companyId || localStorage.getItem('active_company_id');
        if (targetCid) {
          res = await fetch(`/api/onboarding/company-drafts?company_id=${targetCid}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(updatedDrafts)
          });
        } else {
          setSaveStatus(null);
          return;
        }
      }
      if (res.ok) {
        const data = await res.json();
        if (data.validation) {
          setValidation(data.validation);
        }
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(null), 2000);
      } else {
        setSaveStatus(null);
      }
    } catch (err) {
      console.error('Failed to sync drafts:', err);
      setSaveStatus(null);
    }
  };

  const handleDraftFieldChange = (id, field, value) => {
    const updated = drafts.map(item => {
      if (item.id === id) {
        const numVal = ['debit', 'credit', 'quantity', 'unit_cost', 'amount'].includes(field)
          ? parseFloat(value) || 0
          : value;
        return { ...item, [field]: numVal };
      }
      return item;
    });
    setDrafts(updated);
    saveDraftsToServer(updated);
  };

  const handleDeleteDraft = (id) => {
    const updated = drafts.filter(item => item.id !== id);
    setDrafts(updated);
    saveDraftsToServer(updated);
  };

  const handleAddDraft = () => {
    const newItem = {
      ...newDraftForm,
      id: `man_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      category: activeTab,
      review_status: 'VERIFIED',
      source_filename: 'Manual Entry'
    };
    const updated = [...drafts, newItem];
    setDrafts(updated);
    saveDraftsToServer(updated);
    setShowAddModal(false);
    setNewDraftForm({
      category: activeTab,
      account_code: '',
      account_name: '',
      entity_name: '',
      item_code: '',
      invoice_no: '',
      invoice_date: '',
      credit_term: '',
      debit: 0,
      credit: 0,
      quantity: 0,
      unit_cost: 0,
      amount: 0,
      review_status: 'VERIFIED',
      notes: 'Manually added'
    });
  };

  const handleFinalConfirm = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('auth_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };

      if (sessionId) {
        const res = await fetch(`/api/onboarding/session/${sessionId}/confirm`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            confirmation_notes: 'Confirmed and approved for permanent registration.'
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(formatApiError(data, 'Final confirmation failed. Please verify trial balance balance.'));
        }

        setShowConfirmModal(false);
        if (onActivationSuccess) {
          onActivationSuccess(data);
        }
      } else {
        const targetCid = currentCompanyId || companyId || localStorage.getItem('active_company_id');
        if (!targetCid) {
          throw new Error('Company ID is missing. Cannot activate company.');
        }

        const res = await fetch(`/api/onboarding/post?company_id=${targetCid}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            confirmation_notes: 'Confirmed and activated.'
          })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(formatApiError(data, 'Failed to activate company.'));
        }
        setShowConfirmModal(false);
        if (onActivationSuccess) {
          onActivationSuccess(targetCid);
        }
      }
    } catch (err) {
      setError(err.message);
      setShowConfirmModal(false);
    } finally {
      setLoading(false);
    }
  };

  // Filter drafts by category
  const filteredDrafts = drafts.filter(d => {
    if (activeTab === 'TRIAL_BALANCE') return d.category === 'TRIAL_BALANCE';
    if (activeTab === 'DEBTOR') return d.category === 'DEBTOR' || d.category === 'DEBTORS';
    if (activeTab === 'CREDITOR') return d.category === 'CREDITOR' || d.category === 'CREDITORS';
    if (activeTab === 'OTHER_CREDITOR') return d.category === 'OTHER_CREDITOR' || d.category === 'OTHER_CREDITORS';
    if (activeTab === 'STOCK') return d.category === 'STOCK';
    return true;
  });

  // Category counts
  const countTB = drafts.filter(d => d.category === 'TRIAL_BALANCE').length;
  const countDebtors = drafts.filter(d => d.category === 'DEBTOR' || d.category === 'DEBTORS').length;
  const countCreditors = drafts.filter(d => d.category === 'CREDITOR' || d.category === 'CREDITORS').length;
  const countOtherCreditors = drafts.filter(d => d.category === 'OTHER_CREDITOR' || d.category === 'OTHER_CREDITORS').length;
  const countStock = drafts.filter(d => d.category === 'STOCK').length;

  const fmt = (num) => {
    return Number(num || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Render Status Badge for Document
  const renderDocumentStatusBadge = (file) => {
    const st = (file.status || 'UPLOADED').toUpperCase();
    if (st === 'PROCESSING' || retryingFileId === file.file_id) {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '0.75rem',
          fontWeight: '600',
          backgroundColor: '#EEF2FF',
          color: '#4F46E5'
        }}>
          <RefreshCw size={12} className="animate-spin" />
          Processing
        </span>
      );
    }
    if (st === 'EXTRACTED') {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '0.75rem',
          fontWeight: '600',
          backgroundColor: '#ECFDF5',
          color: '#059669'
        }}>
          <CheckCircle2 size={12} />
          {file.document_type || 'Extracted'}
        </span>
      );
    }
    if (st === 'FAILED' || st === 'ERROR') {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '0.75rem',
          fontWeight: '600',
          backgroundColor: '#FEF2F2',
          color: '#DC2626'
        }}>
          <AlertCircle size={12} />
          Failed
        </span>
      );
    }
    // Default: Uploaded
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: '600',
        backgroundColor: '#EFF6FF',
        color: '#2563EB'
      }}>
        <Clock size={12} />
        Uploaded
      </span>
    );
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F8FAFC',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Top Header Bar */}
      <header style={{
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0',
        padding: '0.875rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: '#2563EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF'
          }}>
            <Sparkles size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#0F172A', margin: 0 }}>
              Journex Onboarding
            </h1>
            <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0 }}>
              Guided 3-Step Setup with Autonomous Document Processing Agent
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {onBackToDashboard && (
            <button
              type="button"
              onClick={onBackToDashboard}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#475569',
                fontSize: '0.8125rem',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Exit to Dashboard
            </button>
          )}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid #FCA5A5',
                backgroundColor: '#FEF2F2',
                color: '#DC2626',
                fontSize: '0.8125rem',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Sign Out
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main style={{ flex: 1, maxWidth: '1100px', width: '100%', margin: '0 auto', padding: '2rem 1.5rem' }}>
        
        {/* 3-Step Progress Header */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          padding: '1.5rem 2rem',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            position: 'relative'
          }}>
            {/* Step 1 Indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              opacity: currentStep === 1 ? 1 : 0.8
            }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                backgroundColor: currentStep > 1 ? '#10B981' : (currentStep === 1 ? '#2563EB' : '#E2E8F0'),
                color: currentStep >= 1 ? '#FFFFFF' : '#64748B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
                fontSize: '0.9375rem',
                flexShrink: 0
              }}>
                {currentStep > 1 ? <Check size={20} /> : '1'}
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: '600', color: currentStep === 1 ? '#2563EB' : '#64748B', textTransform: 'uppercase' }}>
                  Step 1
                </span>
                <div style={{ fontSize: '0.9375rem', fontWeight: '600', color: '#0F172A' }}>
                  Company Profile
                </div>
              </div>
            </div>

            {/* Step 2 Indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              opacity: currentStep === 2 ? 1 : 0.8
            }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                backgroundColor: currentStep > 2 ? '#10B981' : (currentStep === 2 ? '#2563EB' : '#E2E8F0'),
                color: currentStep >= 2 ? '#FFFFFF' : '#64748B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
                fontSize: '0.9375rem',
                flexShrink: 0
              }}>
                {currentStep > 2 ? <Check size={20} /> : '2'}
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: '600', color: currentStep === 2 ? '#2563EB' : '#64748B', textTransform: 'uppercase' }}>
                  Step 2
                </span>
                <div style={{ fontSize: '0.9375rem', fontWeight: '600', color: '#0F172A' }}>
                  Upload Documents
                </div>
              </div>
            </div>

            {/* Step 3 Indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              opacity: currentStep === 3 ? 1 : 0.8
            }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                backgroundColor: currentStep === 3 ? '#2563EB' : '#E2E8F0',
                color: currentStep === 3 ? '#FFFFFF' : '#64748B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
                fontSize: '0.9375rem',
                flexShrink: 0
              }}>
                3
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: '600', color: currentStep === 3 ? '#2563EB' : '#64748B', textTransform: 'uppercase' }}>
                  Step 3
                </span>
                <div style={{ fontSize: '0.9375rem', fontWeight: '600', color: '#0F172A' }}>
                  AI Review & Confirmation
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            color: '#B91C1C',
            fontSize: '0.875rem'
          }}>
            <AlertCircle size={20} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>{error}</div>
            <button
              type="button"
              onClick={() => setError(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C' }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            STEP 1: COMPANY PROFILE
        ═══════════════════════════════════════════════════════════════════════ */}
        {currentStep === 1 && (
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '2rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <div style={{ marginBottom: '1.75rem', borderBottom: '1px solid #F1F5F9', paddingBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#0F172A', margin: '0 0 0.25rem 0' }}>
                Step 1: Enter Company Profile
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#64748B', margin: 0 }}>
                Provide your company registration details, statutory reporting currency, and financial year parameters.
              </p>
            </div>

            <form onSubmit={handleSaveStep1}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '1.5rem',
                marginBottom: '2rem'
              }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#334155', marginBottom: '0.5rem' }}>
                    Company Name <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Building2 size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Apex Global Engineering Sdn Bhd"
                      value={companyProfile.company_name}
                      onChange={(e) => setCompanyProfile({ ...companyProfile, company_name: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 38px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.875rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#334155', marginBottom: '0.5rem' }}>
                    SSM / Company Registration Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 202401099881 (1567890-X)"
                    value={companyProfile.registration_number}
                    onChange={(e) => setCompanyProfile({ ...companyProfile, registration_number: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.875rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#334155', marginBottom: '0.5rem' }}>
                    Tax / SST Identification Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. C2891234509 / W10-1808-3200001"
                    value={companyProfile.tax_number}
                    onChange={(e) => setCompanyProfile({ ...companyProfile, tax_number: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.875rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#334155', marginBottom: '0.5rem' }}>
                    Corporate Email
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                    <input
                      type="email"
                      placeholder="finance@company.com"
                      value={companyProfile.email}
                      onChange={(e) => setCompanyProfile({ ...companyProfile, email: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 38px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.875rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#334155', marginBottom: '0.5rem' }}>
                    Contact Phone Number
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                    <input
                      type="text"
                      placeholder="+60 3-8899 7788"
                      value={companyProfile.phone}
                      onChange={(e) => setCompanyProfile({ ...companyProfile, phone: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 38px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.875rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#334155', marginBottom: '0.5rem' }}>
                    Registered Business Address
                  </label>
                  <div style={{ position: 'relative' }}>
                    <MapPin size={18} style={{ position: 'absolute', left: '12px', top: '14px', color: '#94A3B8' }} />
                    <textarea
                      rows={2}
                      placeholder="Suite 18-02, Menara Horizon, Jalan Tun Razak, 50400 Kuala Lumpur"
                      value={companyProfile.address}
                      onChange={(e) => setCompanyProfile({ ...companyProfile, address: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 38px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.875rem',
                        outline: 'none',
                        boxSizing: 'border-box',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#334155', marginBottom: '0.5rem' }}>
                    Base Reporting Currency
                  </label>
                  <div style={{ position: 'relative' }}>
                    <CreditCard size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                    <select
                      value={companyProfile.currency}
                      onChange={(e) => setCompanyProfile({ ...companyProfile, currency: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 38px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.875rem',
                        backgroundColor: '#FFFFFF',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="MYR">MYR - Malaysian Ringgit</option>
                      <option value="SGD">SGD - Singapore Dollar</option>
                      <option value="USD">USD - US Dollar</option>
                      <option value="EUR">EUR - Euro</option>
                      <option value="GBP">GBP - British Pound</option>
                      <option value="AUD">AUD - Australian Dollar</option>
                      <option value="JPY">JPY - Japanese Yen</option>
                      <option value="CNY">CNY - Chinese Yuan</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#334155', marginBottom: '0.5rem' }}>
                    Financial Year (Calendar / Statutory)
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Calendar size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                    <input
                      type="number"
                      value={companyProfile.financial_year}
                      onChange={(e) => setCompanyProfile({ ...companyProfile, financial_year: parseInt(e.target.value) || 2026 })}
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 38px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.875rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#334155', marginBottom: '0.5rem' }}>
                    Financial Year Start Date
                  </label>
                  <input
                    type="date"
                    value={companyProfile.financial_year_start}
                    onChange={(e) => setCompanyProfile({ ...companyProfile, financial_year_start: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.875rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#334155', marginBottom: '0.5rem' }}>
                    Financial Year End Date
                  </label>
                  <input
                    type="date"
                    value={companyProfile.financial_year_end}
                    onChange={(e) => setCompanyProfile({ ...companyProfile, financial_year_end: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.875rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Step 1 Actions */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '1.5rem',
                borderTop: '1px solid #F1F5F9'
              }}>
                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#64748B',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  <ArrowLeft size={16} />
                  <span>Back to Sign In</span>
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '10px 22px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 4px rgba(37,99,235,0.2)'
                  }}
                >
                  <span>{loading ? 'Saving Profile...' : 'Next: Upload Documents'}</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            STEP 2: UPLOAD COMPANY DOCUMENTS (SINGLE GENERAL UPLOAD AREA)
        ═══════════════════════════════════════════════════════════════════════ */}
        {currentStep === 2 && (
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '2rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <div style={{ marginBottom: '1.75rem', borderBottom: '1px solid #F1F5F9', paddingBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#0F172A', margin: '0 0 0.35rem 0' }}>
                Step 2: Upload Your Company Documents
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#64748B', margin: 0, lineHeight: '1.45' }}>
                Upload important company documents to help the AI understand your company's existing accounting information and prepare the initial accounting setup.
              </p>
            </div>

            {/* General Dropzone */}
            <div style={{
              border: '2px dashed #93C5FD',
              backgroundColor: '#EFF6FF',
              borderRadius: '12px',
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: '2rem',
              position: 'relative'
            }}>
              <input
                type="file"
                multiple
                accept=".pdf,application/pdf"
                onChange={handleFileUpload}
                disabled={isUploading}
                style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: 0,
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  width: '100%',
                  height: '100%'
                }}
              />
              <div style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                backgroundColor: '#DBEAFE',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem'
              }}>
                <UploadCloud size={28} />
              </div>
              <h3 style={{ fontSize: '1.0625rem', fontWeight: '600', color: '#1E293B', margin: '0 0 0.35rem 0' }}>
                {isUploading ? 'Uploading selected documents...' : 'Click or drag PDF files here to upload'}
              </h3>
              <p style={{ fontSize: '0.8125rem', color: '#64748B', margin: '0 0 0.75rem 0' }}>
                Upload previous year Trial Balance, Customer / Supplier balances, Stock listing, or SSM profiles.
              </p>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.75rem',
                color: '#2563EB',
                backgroundColor: '#DBEAFE',
                padding: '4px 10px',
                borderRadius: '6px'
              }}>
                <Sparkles size={14} />
                <span>The Document Processing Agent will automatically classify documents and extract opening balances in Step 3</span>
              </div>
            </div>

            {/* Uploaded Documents List */}
            <div style={{ marginBottom: '2rem' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.75rem'
              }}>
                <h4 style={{ fontSize: '0.9375rem', fontWeight: '600', color: '#1E293B', margin: 0 }}>
                  Uploaded Documents ({uploadedFiles.length})
                </h4>
                {uploadedFiles.length === 0 && (
                  <span style={{ fontSize: '0.8125rem', color: '#94A3B8' }}>
                    (Optional: You may also continue without uploading to enter records manually)
                  </span>
                )}
              </div>

              {uploadedFiles.length === 0 ? (
                <div style={{
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '2rem',
                  textAlign: 'center',
                  color: '#94A3B8',
                  fontSize: '0.875rem'
                }}>
                  No documents uploaded yet. Upload your setup PDF documents or click "Next: AI Document Processing & Review" to proceed.
                </div>
              ) : (
                <div style={{
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  overflow: 'hidden'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                    <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: '600' }}>
                      <tr>
                        <th style={{ padding: '10px 14px' }}>Document Name</th>
                        <th style={{ padding: '10px 14px' }}>Size</th>
                        <th style={{ padding: '10px 14px' }}>Processing Status</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadedFiles.map((file, idx) => (
                        <tr key={file.file_id || idx} style={{ borderBottom: idx < uploadedFiles.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                          <td style={{ padding: '12px 14px', color: '#1E293B', fontWeight: '500' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                              <FileText size={18} color="#2563EB" style={{ flexShrink: 0 }} />
                              <div>
                                <div>{file.original_filename}</div>
                                {file.error_message && (
                                  <div style={{ fontSize: '0.75rem', color: '#DC2626', marginTop: '2px' }}>
                                    {file.error_message}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px', color: '#64748B' }}>
                            {formatFileSize(file.file_size)}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            {renderDocumentStatusBadge(file)}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                              {/* View Original PDF Button */}
                              {(sessionId || currentCompanyId) && (
                                <button
                                  type="button"
                                  onClick={() => handleViewOriginalPdf(file.file_id)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#2563EB',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    borderRadius: '4px'
                                  }}
                                  title="View original PDF in new tab"
                                >
                                  <Eye size={16} />
                                </button>
                              )}

                              {/* Retry button if failed */}
                              {(file.status === 'FAILED' || file.status === 'ERROR') && (
                                <button
                                  type="button"
                                  onClick={() => handleRetrySingleFile(file.file_id)}
                                  disabled={retryingFileId === file.file_id}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: '#FFFFFF',
                                    color: '#475569',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                  }}
                                  title="Retry document extraction"
                                >
                                  <RefreshCw size={12} className={retryingFileId === file.file_id ? 'animate-spin' : ''} />
                                  <span>Retry</span>
                                </button>
                              )}

                              {/* Delete button */}
                              <button
                                type="button"
                                onClick={() => handleDeleteFile(file.file_id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#EF4444',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  borderRadius: '4px'
                                }}
                                title="Remove file"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Step 2 Actions */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '1.5rem',
              borderTop: '1px solid #F1F5F9'
            }}>
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#64748B',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                <ArrowLeft size={16} />
                <span>Back to Company Profile</span>
              </button>

              <button
                type="button"
                onClick={handleProceedToStep3}
                disabled={extracting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '10px 22px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: extracting ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 4px rgba(37,99,235,0.2)'
                }}
              >
                {extracting ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Document Processing Agent Extracting Balances...</span>
                  </>
                ) : (
                  <>
                    <span>Next: AI Document Processing & Review</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            STEP 3: AI DOCUMENT PROCESSING, REVIEW AND CONFIRMATION
        ═══════════════════════════════════════════════════════════════════════ */}
        {currentStep === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Header / Intro Card */}
            <div style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              padding: '1.75rem 2rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#0F172A', margin: '0 0 0.35rem 0' }}>
                    Step 3: Review, Edit & Confirm Opening Balances
                  </h2>
                  <p style={{ fontSize: '0.875rem', color: '#64748B', margin: 0 }}>
                    Extracted autonomously by the Document Processing Agent. Review your Trial Balance and subsidiary ledgers, correct any values, or add missing records before final activation.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {saveStatus === 'saving' && (
                    <span style={{ fontSize: '0.75rem', color: '#2563EB', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <RefreshCw size={12} className="animate-spin" /> Saving changes...
                    </span>
                  )}
                  {saveStatus === 'saved' && (
                    <span style={{ fontSize: '0.75rem', color: '#10B981', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Check size={14} /> Saved
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={triggerValidation}
                    disabled={validating}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '8px 14px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#FFFFFF',
                      fontSize: '0.8125rem',
                      fontWeight: '600',
                      color: '#334155',
                      cursor: validating ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <RefreshCw size={14} className={validating ? 'animate-spin' : ''} />
                    <span>Re-validate Balances</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Document Processing Status Overview Card */}
            {uploadedFiles.length > 0 && (
              <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '1.25rem 1.75rem',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#334155' }}>
                    Document Processing Agent Status ({uploadedFiles.length} Documents)
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    Click <Eye size={12} style={{ verticalAlign: 'middle', margin: '0 2px' }} /> to review the original uploaded PDF
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                  {uploadedFiles.map((f, idx) => (
                    <div 
                      key={f.file_id || idx}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid #E2E8F0',
                        backgroundColor: '#F8FAFC',
                        fontSize: '0.8125rem'
                      }}
                    >
                      <FileText size={15} color="#2563EB" />
                      <span style={{ fontWeight: '500', color: '#1E293B', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.original_filename}
                      </span>
                      {renderDocumentStatusBadge(f)}
                      
                      {/* View PDF Button */}
                      {(sessionId || currentCompanyId) && (
                        <button
                          type="button"
                          onClick={() => handleViewOriginalPdf(f.file_id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#2563EB',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          title="Review original uploaded PDF"
                        >
                          <Eye size={14} />
                        </button>
                      )}

                      {/* Retry Single Document if Failed */}
                      {(f.status === 'FAILED' || f.status === 'ERROR') && (
                        <button
                          type="button"
                          onClick={() => handleRetrySingleFile(f.file_id)}
                          disabled={retryingFileId === f.file_id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid #FECACA',
                            backgroundColor: '#FEF2F2',
                            color: '#DC2626',
                            fontSize: '0.7rem',
                            fontWeight: '600',
                            cursor: 'pointer'
                          }}
                          title="Retry processing this document"
                        >
                          <RefreshCw size={10} className={retryingFileId === f.file_id ? 'animate-spin' : ''} />
                          <span>Retry</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Accounting Validation Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '1rem'
            }}>
              {/* Card 1: Trial Balance Balance */}
              <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '10px',
                border: '1px solid',
                borderColor: validation?.tb_balanced ? '#BBF7D0' : '#FED7AA',
                padding: '1.25rem',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#475569' }}>Trial Balance</span>
                  {validation?.tb_balanced ? (
                    <span style={{ color: '#16A34A', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: '700' }}>
                      <CheckCircle2 size={16} /> BALANCED
                    </span>
                  ) : (
                    <span style={{ color: '#EA580C', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: '700' }}>
                      <AlertTriangle size={16} /> DIFF: {fmt(validation?.tb_diff)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '1.125rem', fontWeight: '700', color: '#0F172A', marginBottom: '0.25rem' }}>
                  {fmt(validation?.total_debit || drafts.filter(d => d.category === 'TRIAL_BALANCE').reduce((s, x) => s + (x.debit || 0), 0))} {companyProfile.currency}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  Dr: {fmt(validation?.total_debit)} | Cr: {fmt(validation?.total_credit)}
                </div>
              </div>

              {/* Card 2: Debtors Tie-Out */}
              {(() => {
                const check = validation?.subledger_checks?.find(c => c.category === 'DEBTORS' || c.category?.toUpperCase()?.includes('DEBTOR'));
                const isRec = check ? check.is_reconciled : true;
                return (
                  <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '10px',
                    border: '1px solid',
                    borderColor: isRec ? '#BBF7D0' : '#FED7AA',
                    padding: '1.25rem',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#475569' }}>Trade Debtors</span>
                      {isRec ? (
                        <span style={{ color: '#16A34A', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: '700' }}>
                          <CheckCircle2 size={16} /> TIED OUT
                        </span>
                      ) : (
                        <span style={{ color: '#EA580C', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: '700' }}>
                          <AlertTriangle size={16} /> DIFF: {fmt(check?.difference)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '1.125rem', fontWeight: '700', color: '#0F172A', marginBottom: '0.25rem' }}>
                      {fmt(check?.subledger_total || drafts.filter(d => d.category === 'DEBTOR' || d.category === 'DEBTORS').reduce((s, x) => s + (x.amount || 0), 0))} {companyProfile.currency}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      GL: {fmt(check?.gl_control_amount)} | Sub: {fmt(check?.subledger_total)}
                    </div>
                  </div>
                );
              })()}

              {/* Card 3: Creditors Tie-Out */}
              {(() => {
                const check = validation?.subledger_checks?.find(c => c.category === 'CREDITORS' || (c.category?.toUpperCase()?.includes('CREDITOR') && !c.category?.toUpperCase()?.includes('OTHER')));
                const isRec = check ? check.is_reconciled : true;
                return (
                  <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '10px',
                    border: '1px solid',
                    borderColor: isRec ? '#BBF7D0' : '#FED7AA',
                    padding: '1.25rem',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#475569' }}>Trade Creditors</span>
                      {isRec ? (
                        <span style={{ color: '#16A34A', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: '700' }}>
                          <CheckCircle2 size={16} /> TIED OUT
                        </span>
                      ) : (
                        <span style={{ color: '#EA580C', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: '700' }}>
                          <AlertTriangle size={16} /> DIFF: {fmt(check?.difference)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '1.125rem', fontWeight: '700', color: '#0F172A', marginBottom: '0.25rem' }}>
                      {fmt(check?.subledger_total || drafts.filter(d => d.category === 'CREDITOR' || d.category === 'CREDITORS').reduce((s, x) => s + (x.amount || 0), 0))} {companyProfile.currency}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      GL: {fmt(check?.gl_control_amount)} | Sub: {fmt(check?.subledger_total)}
                    </div>
                  </div>
                );
              })()}

              {/* Card 4: Stock Tie-Out */}
              {(() => {
                const check = validation?.subledger_checks?.find(c => c.category === 'STOCK' || c.category?.toUpperCase()?.includes('STOCK') || c.category?.toUpperCase()?.includes('INVENTORY'));
                const isRec = check ? check.is_reconciled : true;
                return (
                  <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '10px',
                    border: '1px solid',
                    borderColor: isRec ? '#BBF7D0' : '#FED7AA',
                    padding: '1.25rem',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#475569' }}>Stock / Inventory</span>
                      {isRec ? (
                        <span style={{ color: '#16A34A', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: '700' }}>
                          <CheckCircle2 size={16} /> TIED OUT
                        </span>
                      ) : (
                        <span style={{ color: '#EA580C', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: '700' }}>
                          <AlertTriangle size={16} /> DIFF: {fmt(check?.difference)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '1.125rem', fontWeight: '700', color: '#0F172A', marginBottom: '0.25rem' }}>
                      {fmt(check?.subledger_total || drafts.filter(d => d.category === 'STOCK').reduce((s, x) => s + (x.amount || (x.quantity * x.unit_cost) || 0), 0))} {companyProfile.currency}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      GL: {fmt(check?.gl_control_amount)} | Sub: {fmt(check?.subledger_total)}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Categorized Review Tabs & Editable Data Table */}
            <div style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              overflow: 'hidden'
            }}>
              {/* Category Tabs */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                borderBottom: '1px solid #E2E8F0',
                backgroundColor: '#F8FAFC',
                padding: '0 1rem'
              }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('TRIAL_BALANCE')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '1rem 1.25rem',
                    border: 'none',
                    background: 'none',
                    fontWeight: activeTab === 'TRIAL_BALANCE' ? '700' : '500',
                    color: activeTab === 'TRIAL_BALANCE' ? '#2563EB' : '#64748B',
                    borderBottom: activeTab === 'TRIAL_BALANCE' ? '2px solid #2563EB' : '2px solid transparent',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  <Scale size={16} />
                  <span>Trial Balance</span>
                  <span style={{
                    backgroundColor: activeTab === 'TRIAL_BALANCE' ? '#DBEAFE' : '#E2E8F0',
                    color: activeTab === 'TRIAL_BALANCE' ? '#2563EB' : '#475569',
                    fontSize: '0.75rem',
                    padding: '2px 7px',
                    borderRadius: '10px',
                    fontWeight: '700'
                  }}>
                    {countTB}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('DEBTOR')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '1rem 1.25rem',
                    border: 'none',
                    background: 'none',
                    fontWeight: activeTab === 'DEBTOR' ? '700' : '500',
                    color: activeTab === 'DEBTOR' ? '#2563EB' : '#64748B',
                    borderBottom: activeTab === 'DEBTOR' ? '2px solid #2563EB' : '2px solid transparent',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  <Users size={16} />
                  <span>Trade Debtors</span>
                  <span style={{
                    backgroundColor: activeTab === 'DEBTOR' ? '#DBEAFE' : '#E2E8F0',
                    color: activeTab === 'DEBTOR' ? '#2563EB' : '#475569',
                    fontSize: '0.75rem',
                    padding: '2px 7px',
                    borderRadius: '10px',
                    fontWeight: '700'
                  }}>
                    {countDebtors}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('CREDITOR')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '1rem 1.25rem',
                    border: 'none',
                    background: 'none',
                    fontWeight: activeTab === 'CREDITOR' ? '700' : '500',
                    color: activeTab === 'CREDITOR' ? '#2563EB' : '#64748B',
                    borderBottom: activeTab === 'CREDITOR' ? '2px solid #2563EB' : '2px solid transparent',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  <Users size={16} />
                  <span>Trade Creditors</span>
                  <span style={{
                    backgroundColor: activeTab === 'CREDITOR' ? '#DBEAFE' : '#E2E8F0',
                    color: activeTab === 'CREDITOR' ? '#2563EB' : '#475569',
                    fontSize: '0.75rem',
                    padding: '2px 7px',
                    borderRadius: '10px',
                    fontWeight: '700'
                  }}>
                    {countCreditors}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('OTHER_CREDITOR')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '1rem 1.25rem',
                    border: 'none',
                    background: 'none',
                    fontWeight: activeTab === 'OTHER_CREDITOR' ? '700' : '500',
                    color: activeTab === 'OTHER_CREDITOR' ? '#2563EB' : '#64748B',
                    borderBottom: activeTab === 'OTHER_CREDITOR' ? '2px solid #2563EB' : '2px solid transparent',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  <Users size={16} />
                  <span>Other Creditors</span>
                  <span style={{
                    backgroundColor: activeTab === 'OTHER_CREDITOR' ? '#DBEAFE' : '#E2E8F0',
                    color: activeTab === 'OTHER_CREDITOR' ? '#2563EB' : '#475569',
                    fontSize: '0.75rem',
                    padding: '2px 7px',
                    borderRadius: '10px',
                    fontWeight: '700'
                  }}>
                    {countOtherCreditors}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('STOCK')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '1rem 1.25rem',
                    border: 'none',
                    background: 'none',
                    fontWeight: activeTab === 'STOCK' ? '700' : '500',
                    color: activeTab === 'STOCK' ? '#2563EB' : '#64748B',
                    borderBottom: activeTab === 'STOCK' ? '2px solid #2563EB' : '2px solid transparent',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  <Package size={16} />
                  <span>Stock / Inventory</span>
                  <span style={{
                    backgroundColor: activeTab === 'STOCK' ? '#DBEAFE' : '#E2E8F0',
                    color: activeTab === 'STOCK' ? '#2563EB' : '#475569',
                    fontSize: '0.75rem',
                    padding: '2px 7px',
                    borderRadius: '10px',
                    fontWeight: '700'
                  }}>
                    {countStock}
                  </span>
                </button>

                <div style={{ marginLeft: 'auto' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setNewDraftForm(prev => ({ ...prev, category: activeTab }));
                      setShowAddModal(true);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '7px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: '#2563EB',
                      color: '#FFFFFF',
                      fontSize: '0.8125rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={15} />
                    <span>Add Item</span>
                  </button>
                </div>
              </div>

              {/* Editable Table */}
              <div style={{ overflowX: 'auto' }}>
                {filteredDrafts.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: '#94A3B8' }}>
                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9375rem', fontWeight: '500' }}>
                      No items recorded in {activeTab.replace('_', ' ')}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.8125rem' }}>
                      Click "+ Add Item" above to add an opening balance manually.
                    </p>
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
                    <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: '600' }}>
                      <tr>
                        {activeTab === 'TRIAL_BALANCE' && (
                          <>
                            <th style={{ padding: '10px 14px', width: '140px' }}>Account Code</th>
                            <th style={{ padding: '10px 14px' }}>Account Name</th>
                            <th style={{ padding: '10px 14px', width: '140px', textAlign: 'right' }}>Debit ({companyProfile.currency})</th>
                            <th style={{ padding: '10px 14px', width: '140px', textAlign: 'right' }}>Credit ({companyProfile.currency})</th>
                          </>
                        )}
                        {(activeTab === 'DEBTOR' || activeTab === 'CREDITOR' || activeTab === 'OTHER_CREDITOR') && (
                          <>
                            <th style={{ padding: '10px 14px' }}>Entity / Party Name</th>
                            <th style={{ padding: '10px 14px', width: '130px' }}>Invoice No</th>
                            <th style={{ padding: '10px 14px', width: '120px' }}>Date</th>
                            <th style={{ padding: '10px 14px', width: '110px' }}>Terms</th>
                            <th style={{ padding: '10px 14px', width: '140px', textAlign: 'right' }}>Outstanding Amount</th>
                          </>
                        )}
                        {activeTab === 'STOCK' && (
                          <>
                            <th style={{ padding: '10px 14px', width: '120px' }}>Item Code</th>
                            <th style={{ padding: '10px 14px' }}>Description / Name</th>
                            <th style={{ padding: '10px 14px', width: '100px', textAlign: 'right' }}>Quantity</th>
                            <th style={{ padding: '10px 14px', width: '110px', textAlign: 'right' }}>Unit Cost</th>
                            <th style={{ padding: '10px 14px', width: '130px', textAlign: 'right' }}>Total Value</th>
                          </>
                        )}
                        <th style={{ padding: '10px 14px', width: '110px' }}>Status</th>
                        <th style={{ padding: '10px 14px', width: '140px' }}>Source File</th>
                        <th style={{ padding: '10px 14px', width: '50px', textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDrafts.map((item) => (
                        <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          {activeTab === 'TRIAL_BALANCE' && (
                            <>
                              <td style={{ padding: '8px 12px' }}>
                                <input
                                  type="text"
                                  value={item.account_code || ''}
                                  onChange={(e) => handleDraftFieldChange(item.id, 'account_code', e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8125rem',
                                    fontWeight: '600',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <input
                                  type="text"
                                  value={item.account_name || ''}
                                  onChange={(e) => handleDraftFieldChange(item.id, 'account_name', e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8125rem',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.debit || 0}
                                  onChange={(e) => handleDraftFieldChange(item.id, 'debit', e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8125rem',
                                    textAlign: 'right',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.credit || 0}
                                  onChange={(e) => handleDraftFieldChange(item.id, 'credit', e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8125rem',
                                    textAlign: 'right',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </td>
                            </>
                          )}

                          {(activeTab === 'DEBTOR' || activeTab === 'CREDITOR' || activeTab === 'OTHER_CREDITOR') && (
                            <>
                              <td style={{ padding: '8px 12px' }}>
                                <input
                                  type="text"
                                  value={item.entity_name || ''}
                                  onChange={(e) => handleDraftFieldChange(item.id, 'entity_name', e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8125rem',
                                    fontWeight: '500',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <input
                                  type="text"
                                  value={item.invoice_no || ''}
                                  onChange={(e) => handleDraftFieldChange(item.id, 'invoice_no', e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8125rem',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <input
                                  type="text"
                                  placeholder="e.g. 8 December 2025"
                                  value={item.invoice_date || ''}
                                  onChange={(e) => handleDraftFieldChange(item.id, 'invoice_date', e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8125rem',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <input
                                  type="text"
                                  placeholder="e.g. 60 days"
                                  value={item.credit_term || ''}
                                  onChange={(e) => handleDraftFieldChange(item.id, 'credit_term', e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8125rem',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.amount || 0}
                                  onChange={(e) => handleDraftFieldChange(item.id, 'amount', e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8125rem',
                                    textAlign: 'right',
                                    fontWeight: '600',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </td>
                            </>
                          )}

                          {activeTab === 'STOCK' && (
                            <>
                              <td style={{ padding: '8px 12px' }}>
                                <input
                                  type="text"
                                  value={item.item_code || ''}
                                  onChange={(e) => handleDraftFieldChange(item.id, 'item_code', e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8125rem',
                                    fontWeight: '600',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <input
                                  type="text"
                                  value={item.account_name || ''}
                                  onChange={(e) => handleDraftFieldChange(item.id, 'account_name', e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8125rem',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <input
                                  type="number"
                                  step="1"
                                  value={item.quantity || 0}
                                  onChange={(e) => {
                                    const q = parseFloat(e.target.value) || 0;
                                    handleDraftFieldChange(item.id, 'quantity', q);
                                  }}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8125rem',
                                    textAlign: 'right',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.unit_cost || 0}
                                  onChange={(e) => {
                                    const u = parseFloat(e.target.value) || 0;
                                    handleDraftFieldChange(item.id, 'unit_cost', u);
                                  }}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8125rem',
                                    textAlign: 'right',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.amount || (item.quantity * item.unit_cost) || 0}
                                  onChange={(e) => handleDraftFieldChange(item.id, 'amount', e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8125rem',
                                    textAlign: 'right',
                                    fontWeight: '600',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </td>
                            </>
                          )}

                          {/* Status Badge */}
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              backgroundColor: item.review_status === 'VERIFIED' ? '#ECFDF5' : '#FFFBEB',
                              color: item.review_status === 'VERIFIED' ? '#059669' : '#D97706'
                            }}>
                              {item.review_status === 'VERIFIED' ? <Check size={12} /> : <AlertTriangle size={12} />}
                              {item.review_status || 'VERIFIED'}
                            </span>
                          </td>

                          {/* Source File */}
                          <td style={{ padding: '8px 12px', color: '#64748B', fontSize: '0.75rem' }}>
                            <span title={item.source_filename || 'Direct Entry'}>
                              {item.source_filename ? item.source_filename.slice(0, 20) + (item.source_filename.length > 20 ? '...' : '') : 'Manual'}
                            </span>
                          </td>

                          {/* Delete Row */}
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleDeleteDraft(item.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#94A3B8',
                                cursor: 'pointer',
                                padding: '4px',
                                borderRadius: '4px'
                              }}
                              title="Delete row"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Final Confirmation & Company Activation Section */}
            <div style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              padding: '2rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                marginBottom: '1.5rem',
                borderBottom: '1px solid #F1F5F9',
                paddingBottom: '1.25rem'
              }}>
                <div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#0F172A', margin: '0 0 0.25rem 0' }}>
                    Confirm & Complete Company Registration
                  </h3>
                  <p style={{ fontSize: '0.875rem', color: '#64748B', margin: 0 }}>
                    Activating the company will atomically create your account, configure the company workspace, post verified opening journals, and activate the general ledger.
                  </p>
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  backgroundColor: '#EFF6FF',
                  border: '1px solid #DBEAFE',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.8125rem',
                  color: '#1D4ED8',
                  fontWeight: '600'
                }}>
                  <ShieldCheck size={16} />
                  <span>Statutory Integrity Guaranteed</span>
                </div>
              </div>

              {/* Summary Overview */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '1.25rem',
                backgroundColor: '#F8FAFC',
                padding: '1.25rem',
                borderRadius: '8px',
                marginBottom: '1.75rem'
              }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600', textTransform: 'uppercase' }}>Company</span>
                  <div style={{ fontSize: '0.875rem', fontWeight: '700', color: '#1E293B', marginTop: '2px' }}>
                    {companyProfile.company_name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    {companyProfile.registration_number || 'No SSM Provided'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600', textTransform: 'uppercase' }}>Reporting Basis</span>
                  <div style={{ fontSize: '0.875rem', fontWeight: '700', color: '#1E293B', marginTop: '2px' }}>
                    {companyProfile.currency} • FY {companyProfile.financial_year}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    {companyProfile.financial_year_start} to {companyProfile.financial_year_end}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600', textTransform: 'uppercase' }}>Documents</span>
                  <div style={{ fontSize: '0.875rem', fontWeight: '700', color: '#1E293B', marginTop: '2px' }}>
                    {uploadedFiles.length} Uploaded Files
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    {drafts.length} extracted line items
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600', textTransform: 'uppercase' }}>Reconciliation</span>
                  <div style={{
                    fontSize: '0.875rem',
                    fontWeight: '700',
                    color: validation?.tb_balanced ? '#16A34A' : '#EA580C',
                    marginTop: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}>
                    {validation?.tb_balanced ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                    <span>{validation?.tb_balanced ? 'Fully Balanced' : 'Has Discrepancy'}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    Diff: {fmt(validation?.tb_diff)} {companyProfile.currency}
                  </div>
                </div>
              </div>

              {/* Step 3 Actions */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#64748B',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  <ArrowLeft size={16} />
                  <span>Back to Documents</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={loading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.625rem',
                    padding: '12px 28px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: '0.9375rem',
                    fontWeight: '700',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 10px rgba(37,99,235,0.3)'
                  }}
                >
                  <Sparkles size={18} />
                  <span>{loading ? 'Activating Company...' : 'Confirm and Complete Company Registration'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ─────────────────────────────────────────────────────────────────────────────
          MODAL: CANCEL REGISTRATION CONFIRMATION
      ───────────────────────────────────────────────────────────────────────────── */}
      {showCancelModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            maxWidth: '460px',
            width: '100%',
            padding: '1.75rem',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              backgroundColor: '#FEE2E2',
              color: '#DC2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}>
              <AlertTriangle size={24} />
            </div>

            <h3 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#0F172A', margin: '0 0 0.5rem 0' }}>
              Cancel Company Registration?
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#64748B', margin: '0 0 1.5rem 0', lineHeight: '1.45' }}>
              Are you sure you want to cancel? All entered profile information and temporary documents will be permanently discarded, and no user account or company will be created.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                style={{
                  padding: '9px 16px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Stay in Setup
              </button>
              <button
                type="button"
                onClick={handleCancelRegistration}
                disabled={loading}
                style={{
                  padding: '9px 18px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'Cancelling...' : 'Discard & Cancel Registration'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          MODAL: CONFIRM REGISTRATION & ACTIVATION
      ───────────────────────────────────────────────────────────────────────────── */}
      {showConfirmModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            maxWidth: '500px',
            width: '100%',
            padding: '1.75rem',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              backgroundColor: '#DBEAFE',
              color: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem'
            }}>
              <CheckCircle2 size={26} />
            </div>

            <h3 style={{ fontSize: '1.1875rem', fontWeight: '700', color: '#0F172A', margin: '0 0 0.5rem 0' }}>
              Complete Registration & Activate Company?
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#64748B', margin: '0 0 1.25rem 0', lineHeight: '1.5' }}>
              This action will permanently create your company record, register your user account as OWNER, move documents to permanent storage, post official opening balance journal entries, and activate your accounting dashboard.
            </p>

            <div style={{
              backgroundColor: '#F8FAFC',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem',
              fontSize: '0.8125rem',
              color: '#475569',
              border: '1px solid #E2E8F0'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span>Company:</span>
                <span style={{ fontWeight: '600', color: '#1E293B' }}>{companyProfile.company_name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span>Currency & FY:</span>
                <span style={{ fontWeight: '600', color: '#1E293B' }}>{companyProfile.currency} ({companyProfile.financial_year})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Opening Journal Code:</span>
                <span style={{ fontWeight: '600', color: '#2563EB' }}>SRC-OB (Opening Balance)</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                style={{
                  padding: '9px 16px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Review Again
              </button>
              <button
                type="button"
                onClick={handleFinalConfirm}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '10px 20px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '0.875rem',
                  fontWeight: '700',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Activating...</span>
                  </>
                ) : (
                  <span>Yes, Activate Company</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          MODAL: ADD MANUAL ITEM
      ───────────────────────────────────────────────────────────────────────────── */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            maxWidth: '520px',
            width: '100%',
            padding: '1.75rem',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#0F172A', margin: 0 }}>
                Add {activeTab.replace('_', ' ')} Item
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              {activeTab === 'TRIAL_BALANCE' && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                      Account Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 100-0000"
                      value={newDraftForm.account_code}
                      onChange={(e) => setNewDraftForm({ ...newDraftForm, account_code: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                      Account Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Maybank Current Account"
                      value={newDraftForm.account_name}
                      onChange={(e) => setNewDraftForm({ ...newDraftForm, account_name: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                        Debit Amount ({companyProfile.currency})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={newDraftForm.debit}
                        onChange={(e) => setNewDraftForm({ ...newDraftForm, debit: parseFloat(e.target.value) || 0 })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                        Credit Amount ({companyProfile.currency})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={newDraftForm.credit}
                        onChange={(e) => setNewDraftForm({ ...newDraftForm, credit: parseFloat(e.target.value) || 0 })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                </>
              )}

              {(activeTab === 'DEBTOR' || activeTab === 'CREDITOR' || activeTab === 'OTHER_CREDITOR') && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                      Entity / Customer / Supplier Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Syarikat Maju Jaya Sdn Bhd"
                      value={newDraftForm.entity_name}
                      onChange={(e) => setNewDraftForm({ ...newDraftForm, entity_name: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                        Invoice Number
                      </label>
                      <input
                        type="text"
                        placeholder="INV-2025-001"
                        value={newDraftForm.invoice_no}
                        onChange={(e) => setNewDraftForm({ ...newDraftForm, invoice_no: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                        Invoice Date
                      </label>
                      <input type="text" placeholder="e.g. 8 December 2025" value={newDraftForm.invoice_date} onChange={(e) => setNewDraftForm({ ...newDraftForm, invoice_date: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                        Credit Term
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 60 days" value={newDraftForm.credit_term}
                        onChange={(e) => setNewDraftForm({ ...newDraftForm, credit_term: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                        Amount ({companyProfile.currency})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={newDraftForm.amount}
                        onChange={(e) => setNewDraftForm({ ...newDraftForm, amount: parseFloat(e.target.value) || 0 })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'STOCK' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                        Item Code
                      </label>
                      <input
                        type="text"
                        placeholder="ITM-001"
                        value={newDraftForm.item_code}
                        onChange={(e) => setNewDraftForm({ ...newDraftForm, item_code: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                        Item Description
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Copper Wire Coil 2.5mm"
                        value={newDraftForm.account_name}
                        onChange={(e) => setNewDraftForm({ ...newDraftForm, account_name: e.target.value })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                        Quantity
                      </label>
                      <input
                        type="number"
                        value={newDraftForm.quantity}
                        onChange={(e) => {
                          const q = parseFloat(e.target.value) || 0;
                          setNewDraftForm({ ...newDraftForm, quantity: q, amount: q * newDraftForm.unit_cost });
                        }}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                        Unit Cost
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={newDraftForm.unit_cost}
                        onChange={(e) => {
                          const u = parseFloat(e.target.value) || 0;
                          setNewDraftForm({ ...newDraftForm, unit_cost: u, amount: newDraftForm.quantity * u });
                        }}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                        Total Value
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={newDraftForm.amount}
                        onChange={(e) => setNewDraftForm({ ...newDraftForm, amount: parseFloat(e.target.value) || 0 })}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.875rem', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{
                  padding: '9px 16px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddDraft}
                style={{
                  padding: '9px 18px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Save Record
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
