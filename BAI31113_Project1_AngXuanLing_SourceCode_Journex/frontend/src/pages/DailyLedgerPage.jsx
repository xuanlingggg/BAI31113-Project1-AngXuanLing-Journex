import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  BookOpen, 
  RefreshCw, 
  AlertCircle, 
  Search,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle,
  CheckCircle2,
  HelpCircle,
  Wrench,
  AlertTriangle,
  Upload,
  FileText,
  Trash2,
  Brain,
  Clock,
  Filter,
  ArrowRight,
  DollarSign
} from 'lucide-react';
import DocumentUploadModal from '../components/DocumentUploadModal';
import ReasoningProcessModal from '../components/ReasoningProcessModal';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatDisplayDate = (str) => {
  if (!str) return '—';
  const clean = String(str).trim();
  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = MONTHS[parseInt(isoMatch[2], 10) - 1] || isoMatch[2];
    const day = isoMatch[3];
    return `${day} ${month} ${year}`;
  }
  return clean;
};

export default function DailyLedgerPage() {
  const [journals, setJournals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(false);
  const [error, setError] = useState(null);
  const [auditMessage, setAuditMessage] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // ReAct Backtracking Modal State
  const [selectedJournal, setSelectedJournal] = useState(null);
  const [reactLoading, setReactLoading] = useState(false);
  const [reactAnalysis, setReactAnalysis] = useState(null);
  const [applyingFix, setApplyingFix] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadTargetJournal, setUploadTargetJournal] = useState(null);
  const [uploadSuccessBanner, setUploadSuccessBanner] = useState(null);

  // AI Audit Reasoning Process Modal State
  const [reasoningJournal, setReasoningJournal] = useState(null);
  const [isReasoningModalOpen, setIsReasoningModalOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState('ACTIVE');
  const [auditMode, setAuditMode] = useState('MANUAL');
  const [activeCompanyId, setActiveCompanyId] = useState(() => localStorage.getItem('active_company_id') || null);
  const hasAutoAuditedRef = useRef(false);

  useEffect(() => {
    const handleCompanyChange = (e) => {
      const newId = e.detail?.company_id || localStorage.getItem('active_company_id');
      if (newId && newId !== activeCompanyId) {
        setActiveCompanyId(newId);
        hasAutoAuditedRef.current = false;
      }
    };
    window.addEventListener('company-updated', handleCompanyChange);
    return () => window.removeEventListener('company-updated', handleCompanyChange);
  }, [activeCompanyId]);

  const fetchAuditMode = async () => {
    try {
      const res = await fetch('/api/settings/audit-mode');
      if (res.ok) {
        const data = await res.json();
        setAuditMode(data.audit_mode || 'MANUAL');
      }
    } catch (err) {
      console.error('Failed to fetch audit mode:', err);
    }
  };

  const fetchJournals = async () => {
    setLoading(true);
    setError(null);
    try {
      const cid = activeCompanyId || localStorage.getItem('active_company_id');
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

  useEffect(() => {
    fetchJournals();
    fetchAuditMode();
  }, [activeCompanyId]);

  // Automatic Audit trigger if mode is AUTOMATIC and un-audited entries exist
  useEffect(() => {
    if (auditMode === 'AUTOMATIC' && !auditLoading && journals.length > 0 && !hasAutoAuditedRef.current) {
      const unaudited = journals.some(j => j.status !== 'POSTED' && (!j.audit_reasoning || j.status === 'DRAFT'));
      if (unaudited) {
        hasAutoAuditedRef.current = true;
        runAIAudit();
      }
    }
  }, [journals, auditMode]);

  const runAIAudit = async () => {
    setAuditLoading(true);
    setAuditMessage(null);
    try {
      const cid = activeCompanyId || localStorage.getItem('active_company_id');
      const url = cid ? `/api/journals/audit?company_id=${encodeURIComponent(cid)}` : '/api/journals/audit';
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) throw new Error(`Audit failed (${res.status})`);
      const data = await res.json();
      setAuditMessage(data.message);
      await fetchJournals();
      if (data.results && data.results.approved > 0) {
        setActiveFilter('POSTED');
      }
    } catch (err) {
      console.error('Error running AI Audit:', err);
      setError(err.message);
    } finally {
      setAuditLoading(false);
    }
  };

  const handlePostJournal = async (journalId, force = false) => {
    if (force) {
      const confirmMsg = "⚠️ System Warning:\n\nProceeding will record an entry that creates an abnormal negative balance in the General Ledger.\n\nDo you wish to override and post to General Ledger anyway?";
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }
    try {
      const url = force ? `/api/journals/${journalId}/post?force=true` : `/api/journals/${journalId}/post`;
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json();
        const msg = typeof errData.detail === 'object' ? errData.detail.message : (errData.detail || 'Failed to post journal');
        if (!force && (res.status === 422 || String(msg).includes('abnormal') || String(msg).includes('POSTING_BLOCKED'))) {
          const wantOverride = window.confirm(`⚠️ System Warning:\n\n${msg}\n\nDo you wish to override safety controls and post to General Ledger anyway?`);
          if (wantOverride) {
            return handlePostJournal(journalId, true);
          }
        }
        throw new Error(msg);
      }
      fetchJournals();
    } catch (err) {
      alert(`🛑 Action Blocked: ${err.message}`);
    }
  };

  const handleRevertJournal = async (journalId) => {
    try {
      const res = await fetch(`/api/journals/${journalId}/revert`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to revert journal');
      fetchJournals();
    } catch (err) {
      alert(`Error reverting journal: ${err.message}`);
    }
  };

  const runReactBacktrack = async (journal) => {
    setSelectedJournal(journal);
    setReactLoading(true);
    setReactAnalysis(null);
    try {
      const res = await fetch(`/api/agents/react-backtrack/${journal.journal_id}`, { method: 'POST' });
      if (!res.ok) throw new Error(`ReAct backtracking failed (${res.status})`);
      const data = await res.json();
      if (!data || !data.analysis) {
        throw new Error('Agent returned an empty response. Please try again.');
      }
      setReactAnalysis(data.analysis);
    } catch (err) {
      alert(`Error running AI Backtracking: ${err.message}`);
      setSelectedJournal(null);
    } finally {
      setReactLoading(false);
    }
  };

  const [cancellingId, setCancellingId] = useState(null);

  const handleCancelJournal = async (journal) => {
    const jid = journal?.journal_id || selectedJournal?.journal_id;
    if (!jid) return;
    if (!window.confirm(`Are you sure you want to cancel and reject transaction "${jid}"?\n\nThis will remove the draft journal entry and its staged transaction from the company records.`)) {
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
      setSelectedJournal(null);
      setReactAnalysis(null);
      fetchJournals();
    } catch (err) {
      alert(`Error cancelling transaction: ${err.message}`);
    } finally {
      setCancellingId(null);
    }
  };

  const applyReactFix = async (forceOverride = false) => {
    if (!selectedJournal || !reactAnalysis || !reactAnalysis.new_lines) return;

    if (forceOverride) {
      const accCode = selectedJournal.abnormal_risk?.account_code || 'General Ledger';
      const confirmMsg = `⚠️ System Warning:\n\nProceeding will record an abnormal negative balance in account ${accCode}.\n\nDo you wish to override system safety controls and continue adding this entry to the General Ledger anyway?`;
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }

    setApplyingFix(true);
    try {
      const res = await fetch(`/api/journals/${selectedJournal.journal_id}/apply-fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_lines: reactAnalysis.new_lines,
          total_debit: reactAnalysis.total_debit,
          total_credit: reactAnalysis.total_credit,
          reasoning: reactAnalysis.proposed_fix || 'Corrected via AI Backtracking',
          force_override: forceOverride
        })
      });
      if (!res.ok) {
        const errData = await res.json();
        const msg = typeof errData.detail === 'object' ? errData.detail.message : (errData.detail || 'Failed to apply fix');
        if (!forceOverride && (res.status === 422 || String(msg).includes('abnormal') || String(msg).includes('POSTING_BLOCKED') || String(msg).includes('rejected'))) {
          const wantOverride = window.confirm(`⚠️ System Warning:\n\n${msg}\n\nDo you wish to override safety controls and continue adding this entry to the General Ledger anyway?`);
          if (wantOverride) {
            setApplyingFix(false);
            return applyReactFix(true);
          }
        }
        throw new Error(msg);
      }
      setSelectedJournal(null);
      setReactAnalysis(null);
      fetchJournals();
    } catch (err) {
      alert(`Fix application failed: ${err.message}`);
    } finally {
      setApplyingFix(false);
    }
  };

  const formatAmount = (val) => {
    const num = typeof val === 'number' ? val : parseFloat(val || 0);
    if (isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'POSTED':
        return {
          label: 'Posted to Ledger',
          bg: 'var(--status-success-bg, #DCFCE7)',
          text: 'var(--status-success-text, #15803D)',
          border: '1px solid var(--status-success-border, #BBF7D0)'
        };
      case 'PENDING_AUDIT':
        return {
          label: 'Pending Review',
          bg: 'var(--badge-doc-bg, #EFF6FF)',
          text: 'var(--primary-color, #2563EB)',
          border: '1px solid rgba(37, 99, 235, 0.25)'
        };
      case 'HUMAN_REVIEW':
        return {
          label: 'Action Required',
          bg: 'var(--status-error-bg, #FEE2E2)',
          text: 'var(--status-error-text, #B91C1C)',
          border: '1px solid rgba(185, 28, 28, 0.25)'
        };
      case 'DRAFT':
      default:
        return {
          label: 'Draft',
          bg: 'var(--status-warning-bg, #FEF3C7)',
          text: 'var(--status-warning-text, #B45309)',
          border: '1px solid var(--status-warning-border, #FDE68A)'
        };
    }
  };

  const parseAuditReasoning = (raw) => {
    if (!raw) return null;
    try {
      if (typeof raw === 'object') return raw;
      if (raw.trim().startsWith('{')) {
        return JSON.parse(raw);
      }
    } catch (e) {
      return null;
    }
    return null;
  };

  // Summaries
  const stagingJournals = useMemo(() => {
    return journals.filter(j => j.status === 'PENDING_AUDIT' || j.status === 'HUMAN_REVIEW' || j.status === 'DRAFT');
  }, [journals]);

  const pendingCount = stagingJournals.length;
  const postedCount = useMemo(() => journals.filter(j => j.status === 'POSTED').length, [journals]);
  const actionRequiredCount = useMemo(() => journals.filter(j => j.status === 'HUMAN_REVIEW').length, [journals]);
  const totalQueueValue = useMemo(() => {
    return stagingJournals.reduce((acc, j) => acc + (parseFloat(j.total_debit) || 0), 0);
  }, [stagingJournals]);

  // Filtered entries
  const displayedJournals = useMemo(() => {
    return journals.filter((j) => {
      // Status filter
      if (activeFilter === 'ACTIVE') {
        if (!(j.status === 'PENDING_AUDIT' || j.status === 'HUMAN_REVIEW' || j.status === 'DRAFT')) return false;
      } else if (activeFilter === 'ATTENTION') {
        if (j.status !== 'HUMAN_REVIEW') return false;
      } else if (activeFilter === 'POSTED') {
        if (j.status !== 'POSTED') return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const jId = (j.journal_id || '').toLowerCase();
        const docId = (j.document_id || '').toLowerCase();
        const ref = (j.reference || '').toLowerCase();
        const desc = (j.description || '').toLowerCase();
        const txnId = (j.transaction_id || '').toLowerCase();
        const lineMatches = (j.lines || []).some(l => 
          (l.account_code || '').toLowerCase().includes(q) || 
          (l.account_name || '').toLowerCase().includes(q)
        );
        return jId.includes(q) || docId.includes(q) || ref.includes(q) || desc.includes(q) || txnId.includes(q) || lineMatches;
      }

      return true;
    });
  }, [journals, activeFilter, searchQuery]);

  return (
    <div className="page-container" style={{ padding: '1.5rem 2rem' }}>
      
      {/* 1. Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'var(--badge-doc-bg)',
              color: 'var(--primary-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}>
              <BookOpen size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Audit Queue</h1>
                {auditMode === 'AUTOMATIC' && (
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: '0.2rem 0.55rem',
                    borderRadius: '12px',
                    backgroundColor: 'var(--status-success-bg)',
                    color: 'var(--status-success-text)',
                    border: '1px solid rgba(21, 128, 61, 0.25)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem'
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--status-success-text)' }}></span>
                    Auto-Audit Active
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem', marginBottom: 0 }}>
                Review and verify accounting transactions before posting to the general ledger.
              </p>
            </div>
          </div>
        </div>

        {/* Global Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button 
            className="btn btn-primary" 
            onClick={runAIAudit}
            disabled={auditLoading || stagingJournals.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 1.25rem', fontWeight: 600 }}
          >
            {auditLoading ? <RefreshCw size={15} className="spin" /> : <ShieldCheck size={16} />}
            <span>{auditLoading ? 'Auditing Transactions...' : 'Run Audit'}</span>
          </button>

          <button 
            className="btn btn-secondary" 
            onClick={fetchJournals}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. Executive KPI Summary Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', 
        gap: '1rem', 
        marginBottom: '1.5rem' 
      }}>
        {/* Card 1: Pending Review */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600 }}>
            <span>Pending Review</span>
            <Clock size={16} style={{ color: 'var(--primary-color)' }} />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0.4rem 0 0.1rem 0' }}>
            {pendingCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Transactions awaiting approval
          </div>
        </div>

        {/* Card 2: Action Required */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600 }}>
            <span>Action Required</span>
            <AlertTriangle size={16} style={{ color: actionRequiredCount > 0 ? 'var(--status-error-text)' : 'var(--text-muted)' }} />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: actionRequiredCount > 0 ? 'var(--status-error-text)' : 'var(--text-primary)', margin: '0.4rem 0 0.1rem 0' }}>
            {actionRequiredCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {actionRequiredCount > 0 ? 'Review flagged policy or document issues' : 'No blocking issues detected'}
          </div>
        </div>

        {/* Card 3: Posted Entries */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600 }}>
            <span>Posted to Ledger</span>
            <CheckCircle2 size={16} style={{ color: 'var(--status-success-text)' }} />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0.4rem 0 0.1rem 0' }}>
            {postedCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Successfully written to General Ledger
          </div>
        </div>

        {/* Card 4: Total Queue Amount */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600 }}>
            <span>Total Value in Queue</span>
            <DollarSign size={16} style={{ color: 'var(--primary-color)' }} />
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', margin: '0.4rem 0 0.1rem 0' }}>
            RM {formatAmount(totalQueueValue)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Base currency functional total
          </div>
        </div>
      </div>

      {/* 3. Success / Notification Banners */}
      {uploadSuccessBanner && (
        <div style={{
          backgroundColor: 'var(--status-success-bg, #F0FDF4)',
          border: '1px solid var(--status-success-border, #BBF7D0)',
          color: 'var(--status-success-text, #166534)',
          borderRadius: '8px',
          padding: '0.9rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.88rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <CheckCircle size={18} style={{ color: '#16a34a', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700, marginBottom: '0.15rem' }}>Supporting Document Registered</div>
              <div style={{ color: 'var(--text-primary)' }}>{uploadSuccessBanner.message}</div>
            </div>
          </div>
          <button
            onClick={() => setUploadSuccessBanner(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0.25rem', fontSize: '1.1rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div style={{ 
          backgroundColor: 'var(--status-error-bg)', 
          border: '1px solid var(--status-error-border)', 
          color: 'var(--status-error-text)', 
          borderRadius: '8px', 
          padding: '0.9rem 1.25rem', 
          marginBottom: '1.5rem', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem' 
        }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {auditMessage && (
        <div style={{ 
          backgroundColor: 'var(--status-success-bg)', 
          border: '1px solid var(--status-success-border)', 
          color: 'var(--status-success-text)', 
          borderRadius: '8px', 
          padding: '0.9rem 1.25rem', 
          marginBottom: '1.5rem', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          gap: '0.75rem' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={18} />
            <span style={{ fontWeight: 600 }}>{auditMessage}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => setActiveFilter('POSTED')}
              className="btn btn-sm"
              style={{
                backgroundColor: 'var(--status-success-text)',
                color: '#ffffff',
                border: 'none',
                fontSize: '0.78rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                cursor: 'pointer'
              }}
            >
              <Brain size={14} /> View Audited Entries
            </button>
          </div>
        </div>
      )}

      {/* 4. Filter Tabs and Search Bar */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexWrap: 'wrap', 
        gap: '1rem', 
        marginBottom: '1.25rem',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '0.85rem'
      }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveFilter('ACTIVE')}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: '6px',
              border: activeFilter === 'ACTIVE' ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
              backgroundColor: activeFilter === 'ACTIVE' ? 'var(--badge-doc-bg)' : 'var(--bg-card)',
              color: activeFilter === 'ACTIVE' ? 'var(--primary-color)' : 'var(--text-secondary)',
              fontWeight: activeFilter === 'ACTIVE' ? 700 : 500,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem'
            }}
          >
            <span>Pending Review</span>
            <span style={{ 
              fontSize: '0.72rem', 
              padding: '0.1rem 0.45rem', 
              borderRadius: '10px', 
              backgroundColor: activeFilter === 'ACTIVE' ? 'var(--primary-color)' : 'var(--border-color)',
              color: activeFilter === 'ACTIVE' ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: 600
            }}>
              {pendingCount}
            </span>
          </button>

          {actionRequiredCount > 0 && (
            <button
              onClick={() => setActiveFilter('ATTENTION')}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: '6px',
                border: activeFilter === 'ATTENTION' ? '1px solid var(--status-error-text)' : '1px solid var(--border-color)',
                backgroundColor: activeFilter === 'ATTENTION' ? 'var(--status-error-bg)' : 'var(--bg-card)',
                color: activeFilter === 'ATTENTION' ? 'var(--status-error-text)' : 'var(--text-secondary)',
                fontWeight: activeFilter === 'ATTENTION' ? 700 : 500,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem'
              }}
            >
              <AlertTriangle size={13} />
              <span>Requires Attention</span>
              <span style={{ 
                fontSize: '0.72rem', 
                padding: '0.1rem 0.45rem', 
                borderRadius: '10px', 
                backgroundColor: activeFilter === 'ATTENTION' ? 'var(--status-error-text)' : 'var(--status-error-bg)',
                color: activeFilter === 'ATTENTION' ? '#ffffff' : 'var(--status-error-text)',
                fontWeight: 600
              }}>
                {actionRequiredCount}
              </span>
            </button>
          )}

          <button
            onClick={() => setActiveFilter('POSTED')}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: '6px',
              border: activeFilter === 'POSTED' ? '1px solid var(--status-success-text)' : '1px solid var(--border-color)',
              backgroundColor: activeFilter === 'POSTED' ? 'var(--status-success-bg)' : 'var(--bg-card)',
              color: activeFilter === 'POSTED' ? 'var(--status-success-text)' : 'var(--text-secondary)',
              fontWeight: activeFilter === 'POSTED' ? 700 : 500,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem'
            }}
          >
            <CheckCircle size={13} />
            <span>Audited & Posted</span>
            <span style={{ 
              fontSize: '0.72rem', 
              padding: '0.1rem 0.45rem', 
              borderRadius: '10px', 
              backgroundColor: activeFilter === 'POSTED' ? 'var(--status-success-text)' : 'var(--border-color)',
              color: activeFilter === 'POSTED' ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: 600
            }}>
              {postedCount}
            </span>
          </button>

          <button
            onClick={() => setActiveFilter('ALL')}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: '6px',
              border: activeFilter === 'ALL' ? '1px solid var(--text-primary)' : '1px solid var(--border-color)',
              backgroundColor: activeFilter === 'ALL' ? 'var(--bg-surface)' : 'var(--bg-card)',
              color: activeFilter === 'ALL' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: activeFilter === 'ALL' ? 700 : 500,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem'
            }}
          >
            <span>All Entries</span>
            <span style={{ 
              fontSize: '0.72rem', 
              padding: '0.1rem 0.45rem', 
              borderRadius: '10px', 
              backgroundColor: 'var(--border-color)',
              color: 'var(--text-secondary)',
              fontWeight: 600
            }}>
              {journals.length}
            </span>
          </button>
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search journal, ref, doc, account..."
            style={{
              width: '100%',
              padding: '0.45rem 0.75rem 0.45rem 2rem',
              fontSize: '0.82rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-primary)',
              outline: 'none'
            }}
          />
        </div>
      </div>

      {/* 5. Transaction Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.75rem auto', color: 'var(--primary-color)' }} />
            <div>Loading accounting transactions...</div>
          </div>
        ) : displayedJournals.length === 0 ? (
          <div style={{ 
            padding: '3.5rem 2rem', 
            textAlign: 'center', 
            backgroundColor: 'var(--bg-card)', 
            borderRadius: '10px', 
            border: '1px dashed var(--border-color)' 
          }}>
            <CheckCircle size={36} style={{ margin: '0 auto 0.85rem auto', color: 'var(--status-success-text)' }} />
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.35rem 0' }}>
              Audit Queue Clear
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto' }}>
              {activeFilter === 'ACTIVE' 
                ? 'All drafted transactions have been reviewed and posted to the General Ledger.'
                : 'No transactions match the selected filter.'}
            </p>
          </div>
        ) : (
          displayedJournals.map((journal) => {
            const statusBadge = getStatusBadge(journal.status);
            const parsedAudit = parseAuditReasoning(journal.audit_reasoning);
            const tp = parsedAudit?.thought_process;
            const isBalanced = journal.is_balanced || Math.abs(parseFloat(journal.total_debit || 0) - parseFloat(journal.total_credit || 0)) < 0.01;

            return (
              <div 
                key={journal.id} 
                style={{ 
                  backgroundColor: 'var(--bg-card)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '10px',
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}
              >
                {/* Card Header */}
                <div style={{ 
                  padding: '1rem 1.25rem', 
                  borderBottom: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-card)'
                }}>
                  {/* Top Header Row */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    flexWrap: 'wrap', 
                    gap: '0.75rem',
                    marginBottom: '0.65rem'
                  }}>
                    {/* Left: ID & Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <span style={{ 
                        fontWeight: 700, 
                        color: 'var(--text-primary)', 
                        fontSize: '1rem',
                        fontFamily: 'var(--font-mono)',
                        backgroundColor: 'var(--bg-surface)',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)'
                      }}>
                        {journal.journal_id}
                      </span>

                      {/* Status Badge */}
                      <span style={{ 
                        fontSize: '0.75rem', 
                        padding: '0.2rem 0.65rem', 
                        borderRadius: '12px', 
                        backgroundColor: statusBadge.bg,
                        color: statusBadge.text,
                        border: statusBadge.border,
                        fontWeight: 600
                      }}>
                        {statusBadge.label}
                      </span>

                      {/* Balanced Badge */}
                      {isBalanced ? (
                        <span style={{ 
                          fontSize: '0.75rem', 
                          color: 'var(--status-success-text)', 
                          backgroundColor: 'var(--status-success-bg)', 
                          padding: '0.2rem 0.6rem', 
                          borderRadius: '12px', 
                          border: '1px solid var(--status-success-border)',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}>
                          <CheckCircle2 size={12} /> Balanced · RM {formatAmount(journal.total_debit)}
                        </span>
                      ) : (
                        <span style={{ 
                          fontSize: '0.75rem', 
                          color: 'var(--status-error-text)', 
                          backgroundColor: 'var(--status-error-bg)', 
                          padding: '0.2rem 0.6rem', 
                          borderRadius: '12px', 
                          border: '1px solid var(--status-error-border)',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}>
                          <AlertCircle size={12} /> Out of Balance
                        </span>
                      )}
                    </div>

                    {/* Right: Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {/* Reasoning Process Button */}
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
                            padding: '0.35rem 0.65rem',
                            backgroundColor: 'rgba(37, 99, 235, 0.06)',
                            color: 'var(--primary-color)',
                            borderColor: 'rgba(37, 99, 235, 0.25)',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                          title="View complete audit finding and decision analysis"
                        >
                          <Brain size={13} />
                          <span>Audit Findings</span>
                        </button>
                      )}

                      {journal.status === 'POSTED' ? (
                        <>
                          <span style={{ 
                            fontSize: '0.75rem', 
                            color: 'var(--status-success-text)', 
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.3rem 0.65rem',
                            borderRadius: '6px',
                            backgroundColor: 'var(--status-success-bg)',
                            border: '1px solid var(--status-success-border)'
                          }}>
                            <CheckCircle2 size={13} /> Posted
                          </span>
                          <button
                            onClick={() => handleRevertJournal(journal.journal_id)}
                            className="btn btn-secondary btn-sm"
                            style={{ 
                              fontSize: '0.75rem', 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.3rem', 
                              padding: '0.35rem 0.65rem',
                              cursor: 'pointer' 
                            }}
                            title="Revert this entry back to the active Audit Queue"
                          >
                            <RefreshCw size={12} /> Revert
                          </button>
                        </>
                      ) : (journal.status === 'HUMAN_REVIEW' && journal.abnormal_risk?.has_abnormal_risk) ? (
                        <button 
                          onClick={() => handlePostJournal(journal.journal_id, true)}
                          className="btn btn-sm"
                          style={{ 
                            fontSize: '0.75rem',
                            backgroundColor: 'rgba(245, 158, 11, 0.15)',
                            color: '#b45309',
                            border: '1px solid rgba(245, 158, 11, 0.4)',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.35rem 0.75rem',
                            cursor: 'pointer'
                          }}
                          title="Override warning and post to General Ledger"
                        >
                          <AlertTriangle size={13} /> Override Post
                        </button>
                      ) : (
                        <button 
                          onClick={() => handlePostJournal(journal.journal_id)}
                          className="btn btn-primary btn-sm"
                          style={{ 
                            fontSize: '0.75rem', 
                            fontWeight: 600,
                            padding: '0.35rem 0.85rem'
                          }}
                        >
                          Approve & Post
                        </button>
                      )}

                      {journal.status !== 'POSTED' && (
                        <button 
                          onClick={() => runReactBacktrack(journal)}
                          className="btn btn-secondary btn-sm"
                          style={{ 
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.35rem 0.65rem',
                            color: journal.status === 'HUMAN_REVIEW' ? 'var(--status-error-text)' : 'var(--text-secondary)'
                          }}
                          title="Inspect supporting source document and accounts"
                        >
                          <Wrench size={12}/>
                          <span>{journal.status === 'HUMAN_REVIEW' ? 'Review Issue' : 'Inspect'}</span>
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
                            gap: '0.3rem',
                            padding: '0.35rem 0.65rem',
                            color: 'var(--status-error-text)',
                            borderColor: 'rgba(239, 68, 68, 0.25)',
                            backgroundColor: 'rgba(239, 68, 68, 0.05)',
                            cursor: 'pointer'
                          }}
                          title="Cancel and reject this unposted transaction"
                        >
                          <Trash2 size={12} />
                          <span>{cancellingId === journal.journal_id ? 'Cancelling...' : 'Reject'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Metadata Row */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '1rem', 
                    fontSize: '0.8rem', 
                    color: 'var(--text-secondary)',
                    flexWrap: 'wrap',
                    paddingTop: '0.2rem'
                  }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', marginRight: '0.3rem' }}>Date:</span>
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{formatDisplayDate(journal.journal_date)}</span>
                    </div>
                    <span>•</span>
                    <div>
                      <span style={{ color: 'var(--text-muted)', marginRight: '0.3rem' }}>Reference:</span>
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{journal.reference || '—'}</span>
                    </div>
                    <span>•</span>
                    <div>
                      <span style={{ color: 'var(--text-muted)', marginRight: '0.3rem' }}>Document:</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-color)' }}>{journal.document_id || 'Direct Entry'}</span>
                    </div>
                    {journal.transaction_id && (
                      <>
                        <span>•</span>
                        <div>
                          <span style={{ color: 'var(--text-muted)', marginRight: '0.3rem' }}>Transaction:</span>
                          <span style={{ fontFamily: 'var(--font-mono)' }}>{journal.transaction_id}</span>
                        </div>
                      </>
                    )}
                    {journal.description && (
                      <>
                        <span>•</span>
                        <div style={{ color: 'var(--text-primary)', fontStyle: 'italic' }}>
                          {journal.description}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Human Guidance & Missing Document Alert Card */}
                {journal.status === 'HUMAN_REVIEW' && journal.abnormal_risk?.has_abnormal_risk && (
                  <div style={{
                    padding: '1rem 1.25rem',
                    backgroundColor: 'rgba(239, 68, 68, 0.04)',
                    borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
                    fontSize: '0.84rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--status-error-text)', fontWeight: 700, marginBottom: '0.45rem' }}>
                      <AlertTriangle size={15} />
                      <span>Accounting Notice: Action Required</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem', marginBottom: '0.85rem' }}>
                      <div style={{ backgroundColor: 'var(--bg-card)', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.2rem' }}>Audit Conflict</div>
                        <div style={{ color: 'var(--text-primary)', lineHeight: 1.4 }}>{journal.abnormal_risk.issue_description}</div>
                      </div>
                      <div style={{ backgroundColor: 'var(--bg-card)', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid rgba(37, 99, 235, 0.15)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.2rem' }}>Required Supporting Document</div>
                        <div style={{ color: 'var(--primary-color)', fontWeight: 500, lineHeight: 1.4 }}>{journal.abnormal_risk.missing_document_description}</div>
                      </div>
                      <div style={{ backgroundColor: 'var(--bg-card)', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.2rem' }}>Recommended Resolution</div>
                        <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>{journal.abnormal_risk.recommended_action}</div>
                      </div>
                    </div>
                    
                    {/* Resolution Action Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => {
                          setUploadTargetJournal(journal);
                          setIsUploadModalOpen(true);
                        }}
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.75rem' }}
                      >
                        <Upload size={13} /> Upload Supporting Document
                      </button>
                      {journal.abnormal_risk?.account_code === '320-0000' && (
                        <a
                          href="/api/documents/demo-pdf/cash_float_topup"
                          download="PC-TOPUP-01 (Petty Cash Float Top-Up).pdf"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', textDecoration: 'none', padding: '0.35rem 0.75rem' }}
                          title="Download sample Petty Cash Float Top-Up Voucher (RM 3,000.00)"
                        >
                          📥 Download Sample Top-Up PDF
                        </a>
                      )}
                      <button
                        onClick={() => runReactBacktrack(journal)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.75rem' }}
                      >
                        <Wrench size={13} /> View Audit Advice & Backtracking
                      </button>
                      <button
                        onClick={() => handlePostJournal(journal.journal_id, true)}
                        className="btn btn-sm"
                        style={{ 
                          fontSize: '0.75rem', 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.35rem',
                          padding: '0.35rem 0.75rem',
                          backgroundColor: 'rgba(245, 158, 11, 0.12)',
                          color: '#b45309',
                          border: '1px solid rgba(245, 158, 11, 0.35)',
                          cursor: 'pointer'
                        }}
                        title="Force post this journal entry to the General Ledger with abnormal balance warning acknowledgement"
                      >
                        <AlertTriangle size={13} /> Override & Post Anyway
                      </button>
                    </div>
                  </div>
                )}

                {/* Audit Finding Banner */}
                {tp && (
                  <div style={{ 
                    padding: '0.65rem 1.25rem', 
                    backgroundColor: 'var(--bg-surface)', 
                    borderBottom: '1px solid var(--border-color)', 
                    fontSize: '0.82rem', 
                    lineHeight: 1.5,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem'
                  }}>
                    <ShieldCheck size={14} style={{ color: 'var(--primary-color)', flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)', marginRight: '0.4rem' }}>Audit Verification:</span>
                      <span style={{ color: 'var(--text-primary)' }}>
                        {tp.decision_rationale || parsedAudit?.summary || 'Double-entry equilibrium and accounting principles verified.'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Double-Entry Lines Table */}
                <div style={{ padding: '0', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                    <thead>
                      <tr style={{ 
                        backgroundColor: 'var(--bg-primary)', 
                        borderBottom: '1px solid var(--border-color)', 
                        color: 'var(--text-secondary)', 
                        textAlign: 'left' 
                      }}>
                        <th style={{ padding: '0.65rem 1.25rem', fontWeight: 600, width: '60%' }}>Account</th>
                        <th style={{ padding: '0.65rem 1.25rem', fontWeight: 600, textAlign: 'right', width: '20%' }}>Debit (MYR)</th>
                        <th style={{ padding: '0.65rem 1.25rem', fontWeight: 600, textAlign: 'right', width: '20%' }}>Credit (MYR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journal.lines && journal.lines.map((line, idx) => {
                        const isDebit = line.debit > 0;
                        return (
                          <tr 
                            key={idx} 
                            style={{ 
                              borderBottom: '1px solid var(--border-color)',
                              backgroundColor: idx % 2 === 1 ? 'rgba(248, 250, 252, 0.5)' : 'var(--bg-card)'
                            }}
                          >
                            <td style={{ padding: '0.65rem 1.25rem', color: 'var(--text-primary)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {isDebit ? (
                                  <ArrowUpRight size={14} style={{ color: 'var(--primary-color)', flexShrink: 0 }} />
                                ) : (
                                  <ArrowDownRight size={14} style={{ color: 'var(--status-success-text)', flexShrink: 0, marginLeft: '1.25rem' }} />
                                )}
                                <span>
                                  <span style={{ 
                                    color: 'var(--text-secondary)', 
                                    fontFamily: 'var(--font-mono)', 
                                    fontWeight: 600,
                                    marginRight: '0.35rem' 
                                  }}>
                                    {line.account_code}
                                  </span>
                                  <span style={{ fontWeight: 500 }}>{line.account_name}</span>
                                </span>
                              </div>
                            </td>
                            <td style={{ 
                              padding: '0.65rem 1.25rem', 
                              textAlign: 'right', 
                              fontFamily: 'var(--font-mono)',
                              color: isDebit ? 'var(--text-primary)' : 'var(--text-muted)',
                              fontWeight: isDebit ? 600 : 400
                            }}>
                              {isDebit ? formatAmount(line.debit) : '—'}
                            </td>
                            <td style={{ 
                              padding: '0.65rem 1.25rem', 
                              textAlign: 'right', 
                              fontFamily: 'var(--font-mono)',
                              color: !isDebit ? 'var(--text-primary)' : 'var(--text-muted)',
                              fontWeight: !isDebit ? 600 : 400
                            }}>
                              {!isDebit ? formatAmount(line.credit) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ 
                        backgroundColor: 'var(--bg-surface)', 
                        borderTop: '2px solid var(--border-color)',
                        fontWeight: 700 
                      }}>
                        <td style={{ padding: '0.65rem 1.25rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                          TOTAL
                        </td>
                        <td style={{ 
                          padding: '0.65rem 1.25rem', 
                          textAlign: 'right', 
                          color: 'var(--text-primary)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.9rem'
                        }}>
                          {formatAmount(journal.total_debit)}
                        </td>
                        <td style={{ 
                          padding: '0.65rem 1.25rem', 
                          textAlign: 'right', 
                          color: 'var(--text-primary)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.9rem'
                        }}>
                          {formatAmount(journal.total_credit)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })
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

      {/* Document Upload Modal for Human Action */}
      <DocumentUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => {
          setIsUploadModalOpen(false);
          setUploadTargetJournal(null);
        }}
        onUploadSuccess={(uploadedDoc) => {
          setIsUploadModalOpen(false);
          const fname = uploadedDoc?.original_filename || uploadedDoc?.filename || 'Document';
          const docId = uploadedDoc?.document_id || 'DOC';
          const jId = uploadTargetJournal?.journal_id || 'the transaction';
          setUploadSuccessBanner({
            message: `Supporting Document Registered: "${fname}" (${docId}) has been uploaded and validated for ${jId}.`,
            docId: docId,
            filename: fname,
            journalId: jId
          });
          setUploadTargetJournal(null);
          setActiveFilter('ACTIVE');
          fetchJournals();
        }}
      />

      {/* AI Backtracking Modal */}
      {selectedJournal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: '2rem'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            width: '100%', maxWidth: '750px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '2rem',
            boxShadow: 'var(--card-shadow)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem', fontWeight: 700 }}>
                <Wrench size={20} style={{ color: 'var(--primary-color)' }} /> 
                Transaction Inspection: {selectedJournal.journal_id}
              </h3>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => { setSelectedJournal(null); setReactAnalysis(null); }}
              >
                ✕ Close
              </button>
            </div>
            
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem', fontSize: '0.88rem' }}>
              Inspecting source document ({selectedJournal.document_id}) and general ledger accounts to resolve the flagged entry.
            </p>

            {reactLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <RefreshCw size={24} className="spin" style={{ margin: '0 auto 1rem auto', color: 'var(--primary-color)' }} />
                <div>Inspecting source document and verifying account classifications...</div>
              </div>
            ) : reactAnalysis ? (
              <div>
                {/* Agent Thought / Root Cause */}
                <div style={{ backgroundColor: 'var(--bg-surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '1rem' }}>
                  <h4 style={{ color: 'var(--text-primary)', fontSize: '0.85rem', marginBottom: '0.35rem', fontWeight: 700 }}>
                    Analysis & Root Cause:
                  </h4>
                  <p style={{ color: 'var(--text-primary)', fontSize: '0.88rem', lineHeight: '1.5' }}>
                    {reactAnalysis.thought || 'Analysis complete.'}
                  </p>
                </div>

                {/* Proposed Fix */}
                <div style={{
                  backgroundColor: reactAnalysis.is_foreign_mismatch
                    ? 'rgba(239, 68, 68, 0.08)'
                    : reactAnalysis.is_cash_deficit_hold
                      ? 'rgba(245, 158, 11, 0.1)'
                      : 'var(--badge-doc-bg)',
                  padding: '1rem',
                  borderRadius: '8px',
                  border: `1px solid ${
                    reactAnalysis.is_foreign_mismatch
                      ? 'rgba(239, 68, 68, 0.3)'
                      : reactAnalysis.is_cash_deficit_hold
                        ? 'rgba(245, 158, 11, 0.35)'
                        : 'rgba(37, 99, 235, 0.25)'
                  }`,
                  marginBottom: '1rem'
                }}>
                  <h4 style={{
                    color: reactAnalysis.is_foreign_mismatch
                      ? 'var(--status-error-text)'
                      : reactAnalysis.is_cash_deficit_hold
                        ? '#b45309'
                        : 'var(--primary-color)',
                    fontSize: '0.85rem',
                    marginBottom: '0.35rem',
                    fontWeight: 700
                  }}>
                    {reactAnalysis.is_cash_deficit_hold ? 'Required Accounting Action:' : 'Proposed Accounting Adjustment:'}
                  </h4>
                  <p style={{ color: 'var(--text-primary)', fontSize: '0.88rem', lineHeight: '1.5' }}>
                    {reactAnalysis.proposed_fix || 'Account code replacement.'}
                  </p>
                </div>

                {/* Foreign Entity Mismatch Notice */}
                {reactAnalysis.is_foreign_mismatch && (
                  <div style={{
                    padding: '0.9rem 1rem',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(239, 68, 68, 0.05)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    marginBottom: '1rem',
                    color: 'var(--status-error-text)',
                    fontSize: '0.85rem',
                    lineHeight: '1.45'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, marginBottom: '0.3rem' }}>
                      <AlertTriangle size={16} /> Foreign Entity Anomaly: Posting Prohibited
                    </div>
                    <div style={{ color: 'var(--text-primary)' }}>
                      {reactAnalysis.warning_message || "This document was billed between external third parties. Posting any entry for this document would violate the Entity Concept (IAS 1 / MFRS 101)."}
                    </div>
                  </div>
                )}

                {/* Balance Verification of Proposed Lines (only if not foreign mismatch) */}
                {!reactAnalysis.is_foreign_mismatch && (
                  <div style={{ 
                    padding: '0.75rem 1rem', 
                    borderRadius: '6px', 
                    backgroundColor: reactAnalysis.math_verified ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
                    border: `1px solid ${reactAnalysis.math_verified ? 'var(--status-success-border)' : 'var(--status-error-border)'}`,
                    color: reactAnalysis.math_verified ? 'var(--status-success-text)' : 'var(--status-error-text)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    marginBottom: '1rem'
                  }}>
                    {reactAnalysis.math_verified 
                      ? `✓ Balanced: Dr RM ${formatAmount(reactAnalysis.total_debit)} == Cr RM ${formatAmount(reactAnalysis.total_credit)}` 
                      : `✗ Out of Balance: Debits and credits do not match`}
                  </div>
                )}

                {/* Corrected Lines Table */}
                {!reactAnalysis.is_foreign_mismatch && reactAnalysis.new_lines && reactAnalysis.new_lines.length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                      {reactAnalysis.is_cash_deficit_hold
                        ? 'Double-Entry Lines (On Hold Pending Petty Cash Float):'
                        : 'Adjusted Double-Entry Lines:'}
                    </h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--bg-primary)', textAlign: 'left' }}>
                          <th style={{ padding: '0.5rem 1rem' }}>Account Code</th>
                          <th style={{ padding: '0.5rem 1rem' }}>Account Name</th>
                          <th style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>Debit (MYR)</th>
                          <th style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>Credit (MYR)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reactAnalysis.new_lines.map((l, i) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '0.5rem 1rem', color: 'var(--primary-color)', fontFamily: 'var(--font-mono)' }}>{l.account_code}</td>
                            <td style={{ padding: '0.5rem 1rem', color: 'var(--text-primary)' }}>{l.account_name}</td>
                            <td style={{ padding: '0.5rem 1rem', textAlign: 'right', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{l.debit > 0 ? formatAmount(l.debit) : '—'}</td>
                            <td style={{ padding: '0.5rem 1rem', textAlign: 'right', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{l.credit > 0 ? formatAmount(l.credit) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Abnormal Balance Risk Evaluation in AI Fix */}
                {selectedJournal.abnormal_risk?.has_abnormal_risk && (() => {
                  const riskAcc = selectedJournal.abnormal_risk.account_code;
                  const stillImpactsRiskAcc = reactAnalysis.new_lines?.some(l => l.account_code === riskAcc && (parseFloat(l.credit || 0) > 0 || parseFloat(l.debit || 0) > 0));
                  
                  if (!stillImpactsRiskAcc) {
                    return (
                      <div style={{
                        padding: '0.9rem 1rem',
                        borderRadius: '6px',
                        backgroundColor: 'var(--status-success-bg)',
                        border: '1px solid var(--status-success-border)',
                        marginBottom: '1.25rem',
                        fontSize: '0.85rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--status-success-text)', fontWeight: 700, marginBottom: '0.3rem' }}>
                          <CheckCircle size={16} /> Conflict Resolved by Account Reclassification
                        </div>
                        <div style={{ color: 'var(--text-primary)', marginBottom: '0.25rem', lineHeight: 1.45 }}>
                          The original conflict (<em>{selectedJournal.abnormal_risk.issue_description}</em>) is eliminated because the proposed fix reclassifies the entry away from <strong>{riskAcc}</strong>.
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.4 }}>
                          Account <strong>{riskAcc}</strong> will remain intact without deficit. This entry is balanced and ready to post to the General Ledger.
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div style={{
                      padding: '0.9rem 1rem',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(245, 158, 11, 0.1)',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      marginBottom: '1.25rem',
                      fontSize: '0.85rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#b45309', fontWeight: 700, marginBottom: '0.3rem' }}>
                        <AlertTriangle size={16} /> Abnormal Balance Warning
                      </div>
                      <div style={{ color: 'var(--text-primary)', marginBottom: '0.3rem', lineHeight: 1.45 }}>
                        <strong>Detected Conflict:</strong> {selectedJournal.abnormal_risk.issue_description}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.45 }}>
                        <strong>Required Document:</strong> {selectedJournal.abnormal_risk.missing_document_description}<br />
                        <strong>Accounting Rule:</strong> {selectedJournal.abnormal_risk.recommended_action}
                      </div>
                    </div>
                  );
                })()}

                {/* Modal Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '1rem' }}>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => { setSelectedJournal(null); setReactAnalysis(null); }}
                    disabled={applyingFix}
                  >
                    Close
                  </button>

                  {reactAnalysis.is_foreign_mismatch ? (
                    <button
                      className="btn"
                      onClick={() => handleCancelJournal(selectedJournal)}
                      disabled={cancellingId === selectedJournal.journal_id}
                      style={{
                        backgroundColor: 'var(--status-error-text)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        fontWeight: 600,
                        padding: '0.55rem 1.15rem',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                      title="Cancel and reject this foreign transaction"
                    >
                      <Trash2 size={15} />
                      {cancellingId === selectedJournal.journal_id ? 'Cancelling...' : 'Cancel & Reject Transaction'}
                    </button>
                  ) : reactAnalysis.is_cash_deficit_hold ? (
                    <>
                      <button
                        className="btn"
                        onClick={() => handleCancelJournal(selectedJournal)}
                        disabled={cancellingId === selectedJournal.journal_id || applyingFix}
                        style={{
                          backgroundColor: 'var(--status-error-text)',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          fontWeight: 600,
                          padding: '0.55rem 1.05rem',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                        title="Cancel and reject this unfunded petty cash voucher"
                      >
                        <Trash2 size={15} />
                        {cancellingId === selectedJournal.journal_id ? 'Cancelling...' : 'Cancel Unfunded Voucher'}
                      </button>

                      <button 
                        className="btn" 
                        onClick={() => applyReactFix(true)}
                        disabled={applyingFix}
                        style={{
                          backgroundColor: '#d97706',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          fontWeight: 600,
                          padding: '0.55rem 1.05rem',
                          borderRadius: '6px',
                          cursor: applyingFix ? 'not-allowed' : 'pointer'
                        }}
                        title="Force post to General Ledger with abnormal negative cash warning"
                      >
                        <AlertTriangle size={15} />
                        {applyingFix ? 'Posting with Override...' : 'Override & Post Anyway'}
                      </button>

                      <button 
                        className="btn btn-primary" 
                        onClick={() => {
                          const targetJ = selectedJournal;
                          setSelectedJournal(null);
                          setReactAnalysis(null);
                          setUploadTargetJournal(targetJ);
                          setIsUploadModalOpen(true);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          padding: '0.55rem 1.15rem',
                          borderRadius: '6px'
                        }}
                        title="Upload the missing Petty Cash Float Top-Up voucher first"
                      >
                        <Upload size={15} />
                        Upload Missing Cash Float Document
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Only show Override if the risk still persists on the risk account */}
                      {selectedJournal.abnormal_risk?.has_abnormal_risk && reactAnalysis.new_lines?.some(l => l.account_code === selectedJournal.abnormal_risk.account_code && (parseFloat(l.credit || 0) > 0 || parseFloat(l.debit || 0) > 0)) && (
                        <button 
                          className="btn" 
                          onClick={() => applyReactFix(true)}
                          disabled={applyingFix || !reactAnalysis.math_verified}
                          style={{
                            backgroundColor: '#d97706',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            fontWeight: 600,
                            padding: '0.55rem 1.15rem',
                            borderRadius: '6px',
                            cursor: (applyingFix || !reactAnalysis.math_verified) ? 'not-allowed' : 'pointer',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                          }}
                          title="Continue adding this transaction to the General Ledger with system warning acknowledgement"
                        >
                          <AlertTriangle size={15} />
                          {applyingFix ? 'Posting with Override...' : 'Continue Adding to General Ledger (Override)'}
                        </button>
                      )}

                      <button 
                        className="btn btn-primary" 
                        onClick={() => applyReactFix(false)}
                        disabled={applyingFix || !reactAnalysis.math_verified}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          padding: '0.55rem 1.15rem',
                          borderRadius: '6px'
                        }}
                        title="Apply verified fix and post to General Ledger"
                      >
                        <CheckCircle size={15} />
                        {applyingFix ? 'Applying Fix...' : 'Apply Fix & Post to General Ledger'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>Could not load inspection analysis.</p>
                <button className="btn btn-secondary" onClick={() => { setSelectedJournal(null); setReactAnalysis(null); }}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
