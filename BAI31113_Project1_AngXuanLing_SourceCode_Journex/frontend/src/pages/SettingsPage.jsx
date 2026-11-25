import React, { useState, useEffect } from 'react';
import { 
  Sliders,
  PlayCircle,
  Save, 
  AlertCircle, 
  CheckCircle, 
  Cpu, 
  Zap, 
  RotateCcw, 
  Sparkles, 
  Check, 
  Server,
  ShieldAlert,
  Info
} from 'lucide-react';

export default function SettingsPage() {
  const [rules, setRules] = useState('');
  const [loadingRules, setLoadingRules] = useState(true);
  const [savingRules, setSavingRules] = useState(false);
  
  // AI Provider state
  const [providerData, setProviderData] = useState(null);
  const [loadingProvider, setLoadingProvider] = useState(true);
  const [switchingProvider, setSwitchingProvider] = useState(false);

  // Audit Execution Mode state (Default: MANUAL)
  const [auditMode, setAuditMode] = useState('MANUAL');
  const [loadingAuditMode, setLoadingAuditMode] = useState(true);
  const [updatingAuditMode, setUpdatingAuditMode] = useState(false);

  // Reset database state
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Global message
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchSettings();
    fetchProvider();
    fetchAuditMode();
  }, []);

  const fetchAuditMode = async () => {
    try {
      const res = await fetch('/api/settings/audit-mode');
      if (res.ok) {
        const data = await res.json();
        setAuditMode(data.audit_mode || 'MANUAL');
      }
    } catch (err) {
      console.error('Failed to load audit mode:', err);
    } finally {
      setLoadingAuditMode(false);
    }
  };

  const handleSetAuditMode = async (mode) => {
    if (mode === auditMode || updatingAuditMode) return;
    setUpdatingAuditMode(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/audit-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audit_mode: mode })
      });
      if (res.ok) {
        setAuditMode(mode);
        setMessage({
          type: 'success',
          text: `Audit Execution Mode updated to ${mode === 'MANUAL' ? 'Manual (On-Demand)' : 'Automatic (Autonomous Auto-Audit)'}.`
        });
      } else {
        setMessage({ type: 'error', text: 'Failed to update audit mode.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error while updating audit mode.' });
    } finally {
      setUpdatingAuditMode(false);
    }
  };


  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings/llm_audit_rules');
      const data = await res.json();
      if (data.value) {
        setRules(data.value);
      } else {
        setRules(`CRITICAL AUDIT RULES:
Rule 1: Liability Normal Balances & Reductions. Liability accounts (e.g., 400-0000 TRADE CREDITORS) have a normal credit balance. A Debit decreases them. You must strictly recognize that paying a supplier or returning goods rightfully Debits Trade Creditors to reduce debt. Do not flag debits to liability accounts as errors if they represent a reduction in owed balances.
Rule 2: The Dual Nature of Sales Tax. 430-0000 SALES TAX handles both. Purchases (Input Tax) are correctly Debited to reduce net tax liability. Sales (Output Tax) are correctly Credited. Never flag a debit to Sales Tax on a purchase as an error.
Rule 3: Splitting Expenses and Taxes. Splitting a purchase into two debit lines (Expense + Sales Tax) is standard mandatory practice. Do not suggest combining them into a single inclusive debit.
Rule 4: The Mechanics of a Purchase Return. A purchase return must reverse the original purchase: Debit TRADE CREDITORS, Credit Asset/Expense, and Credit SALES TAX.
Rule 5: Payment Method Mapping. Because there is no 'Credit Card Payable' account, crediting 310-1000 CASH AT BANK is the mathematically and logically correct fallback for company card outflows. Do not flag this as a contradiction.
Rule 6: The Mechanics of a Sales Return (Output Tax Reversal). A sales return or Credit Note issued to a customer must reverse the original sales entry. It is logically and mathematically correct to Debit 510-0000 RETURN INWARDS (recognizing the return), Debit 430-0000 SALES TAX (reversing the original output tax liability), and Credit 300-0000 TRADE DEBTORS (reducing the customer's outstanding balance). Do not flag a debit to Sales Tax on a sales return as a logical error; it correctly reduces the net tax owed to the government.
`);
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to load LLM audit rules.' });
    } finally {
      setLoadingRules(false);
    }
  };

  const fetchProvider = async () => {
    try {
      const res = await fetch('/api/settings/ai-provider');
      if (res.ok) {
        const data = await res.json();
        setProviderData(data);
      }
    } catch (err) {
      console.error('Failed to load AI provider:', err);
    } finally {
      setLoadingProvider(false);
    }
  };

  const handleSwitchProvider = async (targetProvider) => {
    if (!targetProvider || (providerData && providerData.active_provider === targetProvider)) {
      return;
    }

    setSwitchingProvider(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings/ai-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: targetProvider })
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ 
          type: 'success', 
          text: `Groq LPU (qwen/qwen3.8-27b) is the active dedicated AI provider.` 
        });
        await fetchProvider();
      } else {
        setMessage({ type: 'error', text: data.detail || 'Failed to switch AI provider.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error while switching provider.' });
    } finally {
      setSwitchingProvider(false);
    }
  };

  const handleResetDatabase = async () => {
    setResetting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/reset-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ 
          type: 'success', 
          text: data.message || 'Database reset successfully! Staging buffer cleared and master accounts preserved.' 
        });
        setShowResetConfirm(false);
      } else {
        setMessage({ type: 'error', text: data.detail || 'Database reset failed.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error while resetting database.' });
    } finally {
      setResetting(false);
    }
  };

  const saveSettings = async () => {
    setSavingRules(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/llm_audit_rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: rules })
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'LLM Audit Rules saved successfully!' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save settings.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error while saving.' });
    } finally {
      setSavingRules(false);
    }
  };

  const activeProvider = providerData?.active_provider || 'GROQ';
  const groqInfo = providerData?.providers?.GROQ || {
    name: 'Groq LPU',
    model: 'qwen/qwen3.8-27b',
    badge: 'Ultra-Fast (Hardware LPU)',
    description: 'Ultra-high-speed inference engine powered by Groq LPUs. Ideal for near-instant semantic audits.'
  };

  return (
    <div className="page-container" style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <header className="page-header" style={{ marginBottom: '2rem' }}>
        <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          System Settings & Model Configuration
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          Configure the active AI reasoning model, manage audit heuristics, and control platform data.
        </p>
      </header>

      {message && (
        <div style={{
          backgroundColor: message.type === 'success' ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
          color: message.type === 'success' ? 'var(--status-success-text)' : 'var(--status-error-text)',
          padding: '1rem 1.25rem',
          borderRadius: '10px',
          marginBottom: '2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          border: `1px solid ${message.type === 'success' ? 'rgba(21, 128, 61, 0.25)' : 'rgba(185, 28, 28, 0.25)'}`,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
        }}>
          {message.type === 'success' ? <CheckCircle size={22} /> : <AlertCircle size={22} />}
          <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>{message.text}</div>
        </div>
      )}

      {/* SECTION 1: AI MODEL PROVIDER SWITCHER */}
      <div className="card" style={{ 
        backgroundColor: 'var(--bg-card)', 
        borderRadius: '12px', 
        border: '1px solid var(--border-color)', 
        padding: '1.75rem', 
        marginBottom: '2rem' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '10px', 
              backgroundColor: 'var(--badge-doc-bg)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: 'var(--primary-color)'
            }}>
              <Server size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Active AI Reasoning Engine
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.2rem 0 0 0' }}>
                Powers Semantic Verification, Double-Entry Audits, and Ledger Checks.
              </p>
            </div>
          </div>

          <div style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            padding: '0.4rem 0.85rem', 
            backgroundColor: activeProvider === 'GROQ' ? 'var(--status-warning-bg)' : 'var(--badge-doc-bg)',
            border: `1px solid ${activeProvider === 'GROQ' ? 'rgba(180, 83, 9, 0.25)' : 'rgba(37, 99, 235, 0.25)'}`,
            borderRadius: '9999px'
          }}>
            <span style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              backgroundColor: activeProvider === 'GROQ' ? 'var(--status-warning-text)' : 'var(--primary-color)'
            }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: activeProvider === 'GROQ' ? 'var(--status-warning-text)' : 'var(--primary-color)' }}>
              Current: Groq LPU Dedicated Engine
            </span>
          </div>
        </div>

        {/* Note on Neuro-Symbolic Invariant */}
        <div style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '0.85rem 1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          fontSize: '0.85rem',
          color: 'var(--text-secondary)'
        }}>
          <Info size={18} style={{ color: 'var(--primary-color)', flexShrink: 0 }} />
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>Architectural Guarantee:</strong> Groq LPU powers semantic logic auditing. 
            All arithmetic (Qty x Price, subtotals, tax formulas, Debits == Credits, ledger balances) remains strictly executed by deterministic Python.
          </span>
        </div>

        {/* Two Provider Selection Cards */}
        {loadingProvider ? (
          <div style={{ color: 'var(--text-secondary)', padding: '1rem', textAlign: 'center' }}>Loading provider status...</div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            
            {/* GROQ CARD */}
            <div style={{
              width: '100%',
              maxWidth: '560px',
              backgroundColor: 'var(--bg-card)',
              border: `2px solid ${activeProvider === 'GROQ' ? 'var(--primary-color)' : 'var(--border-color)'}`,
              borderRadius: '12px',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'all 0.2s ease',
              boxShadow: activeProvider === 'GROQ' ? '0 0 16px rgba(37, 99, 235, 0.12)' : 'none'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--status-warning-bg)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--status-warning-text)'
                    }}>
                      <Zap size={18} />
                    </div>
                    <span style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {groqInfo.name}
                    </span>
                  </div>

                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '0.25rem 0.6rem',
                    borderRadius: '6px',
                    backgroundColor: 'var(--status-warning-bg)',
                    color: 'var(--status-warning-text)',
                    border: '1px solid rgba(180, 83, 9, 0.25)'
                  }}>
                    {groqInfo.badge}
                  </span>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>
                    Target Model
                  </div>
                  <div style={{ 
                    fontFamily: 'var(--font-mono)', 
                    fontSize: '0.85rem', 
                    color: 'var(--primary-color)', 
                    backgroundColor: 'var(--bg-primary)', 
                    padding: '0.35rem 0.6rem', 
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    display: 'inline-block'
                  }}>
                    {groqInfo.model}
                  </div>
                </div>

                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.5', marginBottom: '1.25rem' }}>
                  {groqInfo.description}
                </p>

                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    <Check size={14} style={{ color: 'var(--status-success-text)' }} /> Real-time LPU latency (~150-300ms)
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    <Check size={14} style={{ color: 'var(--status-success-text)' }} /> Zero cold-start batch verification
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    <Check size={14} style={{ color: 'var(--status-success-text)' }} /> Native JSON response enforcement
                  </li>
                </ul>
              </div>

              <div>
                <button 
                  disabled
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    backgroundColor: 'var(--status-success-bg)',
                    color: 'var(--status-success-text)',
                    border: '1px solid rgba(21, 128, 61, 0.25)',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    cursor: 'default'
                  }}
                >
                  <CheckCircle size={18} /> Active Dedicated Engine
                </button>
              </div>
            </div>

          </div>
        )}
      </div>

            {/* SECTION: AUDIT EXECUTION MODE */}
      <div className="card" style={{ 
        backgroundColor: 'var(--bg-card)', 
        borderRadius: '12px', 
        border: '1px solid var(--border-color)', 
        padding: '1.75rem', 
        marginBottom: '2rem' 
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '10px', 
              backgroundColor: 'var(--badge-doc-bg)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: 'var(--primary-color)'
            }}>
              <Sliders size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Audit Execution Mode
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.2rem 0 0 0' }}>
                Control whether the LLM Audit runs manually on-demand or triggers automatically in the background.
              </p>
            </div>
          </div>

          <div style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            padding: '0.35rem 0.8rem', 
            backgroundColor: auditMode === 'AUTOMATIC' ? 'var(--status-success-bg)' : 'var(--bg-primary)',
            border: `1px solid ${auditMode === 'AUTOMATIC' ? 'rgba(21, 128, 61, 0.25)' : 'var(--border-color)'}`,
            borderRadius: '9999px',
            fontSize: '0.8rem',
            fontWeight: 600,
            color: auditMode === 'AUTOMATIC' ? 'var(--status-success-text)' : 'var(--text-secondary)'
          }}>
            <span style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              backgroundColor: auditMode === 'AUTOMATIC' ? 'var(--status-success-text)' : 'var(--text-secondary)'
            }} />
            <span>Mode: {auditMode === 'AUTOMATIC' ? 'Automatic (Auto-Audit)' : 'Manual (Default)'}</span>
          </div>
        </div>

        {loadingAuditMode ? (
          <div style={{ color: 'var(--text-secondary)', padding: '1rem', textAlign: 'center' }}>Loading audit mode setting...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
            {/* MANUAL MODE CARD */}
            <div 
              onClick={() => handleSetAuditMode('MANUAL')}
              style={{
                backgroundColor: 'var(--bg-card)',
                border: `2px solid ${auditMode === 'MANUAL' ? 'var(--primary-color)' : 'var(--border-color)'}`,
                borderRadius: '10px',
                padding: '1.25rem',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease',
                boxShadow: auditMode === 'MANUAL' ? '0 0 14px rgba(37, 99, 235, 0.1)' : 'none'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <PlayCircle size={18} style={{ color: auditMode === 'MANUAL' ? 'var(--primary-color)' : 'var(--text-secondary)' }} />
                    <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>Manual On-Demand</strong>
                  </div>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-color)'
                  }}>
                    DEFAULT
                  </span>
                </div>
                <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: '1.45', margin: '0 0 1rem 0' }}>
                  Audits are only performed when you click the <strong>"Run LLM Audit"</strong> button in the Audit Queue. Gives full review control and avoids unnecessary API calls.
                </p>
              </div>

              <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Workflow: Review & Batch Check</span>
                {auditMode === 'MANUAL' ? (
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--status-success-text)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <CheckCircle size={15} /> Active Setting
                  </span>
                ) : (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleSetAuditMode('MANUAL'); }}
                    disabled={updatingAuditMode}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.75rem' }}
                  >
                    Select Manual
                  </button>
                )}
              </div>
            </div>

            {/* AUTOMATIC MODE CARD */}
            <div 
              onClick={() => handleSetAuditMode('AUTOMATIC')}
              style={{
                backgroundColor: 'var(--bg-card)',
                border: `2px solid ${auditMode === 'AUTOMATIC' ? 'var(--primary-color)' : 'var(--border-color)'}`,
                borderRadius: '10px',
                padding: '1.25rem',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease',
                boxShadow: auditMode === 'AUTOMATIC' ? '0 0 14px rgba(37, 99, 235, 0.1)' : 'none'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Zap size={18} style={{ color: auditMode === 'AUTOMATIC' ? 'var(--primary-color)' : 'var(--text-secondary)' }} />
                    <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>Autonomous Auto-Audit</strong>
                  </div>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: 'var(--status-success-bg)',
                    color: 'var(--status-success-text)',
                    border: '1px solid rgba(21, 128, 61, 0.25)'
                  }}>
                    AUTONOMOUS
                  </span>
                </div>
                <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: '1.45', margin: '0 0 1rem 0' }}>
                  The system automatically executes LLM Audits on draft and staging journal entries immediately as documents and transactions arrive, providing real-time error detection.
                </p>
              </div>

              <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Workflow: Continuous Verification</span>
                {auditMode === 'AUTOMATIC' ? (
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--status-success-text)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <CheckCircle size={15} /> Active Setting
                  </span>
                ) : (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleSetAuditMode('AUTOMATIC'); }}
                    disabled={updatingAuditMode}
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: '0.75rem' }}
                  >
                    Enable Auto-Audit
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: LLM AUDITOR RULES CONFIGURATION */}
      <div className="card" style={{ 
        backgroundColor: 'var(--bg-card)', 
        borderRadius: '12px', 
        border: '1px solid var(--border-color)', 
        padding: '1.75rem', 
        marginBottom: '2rem' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ 
            width: '40px', 
            height: '40px', 
            borderRadius: '10px', 
            backgroundColor: 'var(--badge-doc-bg)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: 'var(--primary-color)'
          }}>
            <Sparkles size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              LLM Semantic Audit Rules (Audit Heuristics)
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.2rem 0 0 0' }}>
              Injected into the Staging Buffer Auditor to evaluate normal balances, tax splits, and credit note reversals.
            </p>
          </div>
        </div>

        {loadingRules ? (
          <div style={{ color: 'var(--text-secondary)' }}>Loading rules...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <textarea 
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              style={{
                width: '100%',
                minHeight: '320px',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '1rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.88rem',
                lineHeight: '1.6',
                resize: 'vertical'
              }}
            />
            
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                onClick={saveSettings}
                disabled={savingRules}
                className="btn btn-primary"
              >
                <Save size={16} />
                <span>{savingRules ? 'Saving...' : 'Save Audit Rules'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: DATABASE RESET (START FRESH) */}
      <div className="card" style={{ 
        backgroundColor: 'var(--bg-card)', 
        borderRadius: '12px', 
        border: '1px solid rgba(185, 28, 28, 0.25)', 
        padding: '1.75rem' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div style={{ 
            width: '40px', 
            height: '40px', 
            borderRadius: '10px', 
            backgroundColor: 'var(--status-error-bg)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: 'var(--status-error-text)'
          }}>
            <ShieldAlert size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Database Maintenance & Fresh Start
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.2rem 0 0 0' }}>
              Clear test transactions, documents, and journals while preserving your Chart of Accounts.
            </p>
          </div>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.5', marginBottom: '1.25rem' }}>
          Need to test the pipeline with clean records? This function clears all uploaded documents, staging buffer journals, and ledger postings. Your company profile and Master Chart of Accounts (65 active accounts) will remain intact.
        </p>

        {showResetConfirm ? (
          <div style={{
            backgroundColor: 'var(--status-error-bg)',
            border: '1px solid rgba(185, 28, 28, 0.25)',
            borderRadius: '8px',
            padding: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div style={{ color: 'var(--status-error-text)', fontSize: '0.9rem', fontWeight: 600 }}>
              Are you sure? This will permanently delete all test transactions and documents.
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowResetConfirm(false)}
                disabled={resetting}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={handleResetDatabase}
                disabled={resetting}
              >
                {resetting ? 'Resetting...' : 'Yes, Reset Everything'}
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-danger"
            onClick={() => setShowResetConfirm(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <RotateCcw size={16} />
            <span>Reset Database & Transactions</span>
          </button>
        )}
      </div>
    </div>
  );
}