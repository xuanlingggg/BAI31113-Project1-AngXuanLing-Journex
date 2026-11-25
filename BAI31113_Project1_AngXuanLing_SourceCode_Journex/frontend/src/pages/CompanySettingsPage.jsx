import React, { useState, useEffect } from 'react';
import {
  Building2, Save, CheckCircle2, AlertTriangle, Lock, RefreshCw,
  FileText, DollarSign, ShieldCheck, Info, Mail, Phone, Calendar,
  Image as ImageIcon, Trash2, UserX, User, X, AlertOctagon, CalendarClock, ArrowRight
} from 'lucide-react';

const CURRENCIES = [
  { value: 'MYR', label: 'MYR — Malaysian Ringgit' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'SGD', label: 'SGD — Singapore Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
  { value: 'JPY', label: 'JPY — Japanese Yen' },
];

const FINANCIAL_YEARS = Array.from({ length: 10 }, (_, i) => {
  const y = new Date().getFullYear() - 3 + i;
  return { value: y, label: String(y) };
});

// ─── Field Styles ──────────────────────────────────────────────────────────────
const fieldStyle = {
  width: '100%',
  padding: '0.6rem 0.85rem',
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontSize: '0.88rem',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s',
};

const readOnlyFieldStyle = {
  ...fieldStyle,
  backgroundColor: 'var(--bg-primary)',
  color: 'var(--text-secondary)',
  cursor: 'not-allowed',
  borderColor: 'var(--border-color)',
  fontFamily: 'var(--font-mono)',
  letterSpacing: '0.02em',
};

const labelStyle = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
  marginBottom: '0.4rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

// ─── Section Card ──────────────────────────────────────────────────────────────
function SettingsSection({ icon: Icon, title, description, children }) {
  return (
    <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', marginBottom: '1.25rem' }}>
        <div style={{
          padding: '0.6rem',
          backgroundColor: 'var(--badge-doc-bg)',
          borderRadius: '8px',
          color: 'var(--primary-color)',
          flexShrink: 0,
        }}>
          <Icon size={18} />
        </div>
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.15rem' }}>{title}</h3>
          {description && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>{description}</p>
          )}
        </div>
      </div>
      {children}
          </div>
  );
}

// ─── Field Group ───────────────────────────────────────────────────────────────
function Field({ label, required, readonly, children }) {
  return (
    <div>
      <label style={labelStyle}>
        {label}
        {required && <span style={{ color: '#f87171', marginLeft: '0.25rem' }}>*</span>}
        {readonly && (
          <span style={{
            marginLeft: '0.5rem',
            fontSize: '0.65rem',
            color: 'var(--text-secondary)',
            backgroundColor: 'rgba(255,255,255,0.06)',
            padding: '0.1rem 0.4rem',
            borderRadius: '4px',
            textTransform: 'none',
            letterSpacing: 0,
            fontWeight: 400,
          }}>
            <Lock size={9} style={{ display: 'inline', marginRight: '0.2rem', verticalAlign: 'middle' }} />
            Read-only
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function CompanySettingsPage({ currentUser: propCurrentUser, onCompanyDeleted, onUserDeleted }) {
  const currentUser = propCurrentUser || (() => {
    try {
      const stored = localStorage.getItem('auth_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })();

  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null

  // Form State
  const [companyName, setCompanyName] = useState('');
  const [regNo, setRegNo] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [logoPath, setLogoPath] = useState('');
  const [currency, setCurrency] = useState('MYR');
  const [financialYear, setFinancialYear] = useState(new Date().getFullYear());
  const [financialYearStart, setFinancialYearStart] = useState('2026-01-01');
  const [financialYearEnd, setFinancialYearEnd] = useState('2026-12-31');
  const [taxNumber, setTaxNumber] = useState('');

  // Track if form has unsaved changes
  const [isDirty, setIsDirty] = useState(false);

  // Danger Zone Modals State
  const [isCompanyDeleteOpen, setIsCompanyDeleteOpen] = useState(false);
  const [companyDeletePassword, setCompanyDeletePassword] = useState('');
  const [companyDeleteConfirmText, setCompanyDeleteConfirmText] = useState('');
  const [companyDeleteError, setCompanyDeleteError] = useState('');
  const [isDeletingCompany, setIsDeletingCompany] = useState(false);

  const [isUserDeleteOpen, setIsUserDeleteOpen] = useState(false);
  const [userDeletePassword, setUserDeletePassword] = useState('');
  const [userDeleteConfirmText, setUserDeleteConfirmText] = useState('');
  const [userDeleteError, setUserDeleteError] = useState('');
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  // Financial Year Rollover State
  const [isRolloverOpen, setIsRolloverOpen] = useState(false);
  const [targetRolloverYear, setTargetRolloverYear] = useState(2027);
  const [isRollingOver, setIsRollingOver] = useState(false);
  const [rolloverError, setRolloverError] = useState('');
  const [rolloverResult, setRolloverResult] = useState(null);

  const loadCompany = async () => {
    setLoading(true);
    setSaveStatus(null);
    try {
      const activeId = localStorage.getItem('active_company_id');
      const url = activeId ? `/api/company/profile?company_id=${encodeURIComponent(activeId)}` : '/api/company/profile';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        populateForm(data);
        setCompany(data);
      }
    } catch (err) {
      console.error('Failed to load company profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const populateForm = (data) => {
    setCompanyName(data.company_name || '');
    setRegNo(data.registration_number || '');
    setAddress(data.address || '');
    setEmail(data.email || '');
    setPhone(data.phone || '');
    setLogoPath(data.logo_path || '');
    setCurrency(data.currency || 'MYR');
    const fy = data.financial_year || new Date().getFullYear();
    setFinancialYear(fy);
    setFinancialYearStart(data.financial_year_start || `${fy}-01-01`);
    setFinancialYearEnd(data.financial_year_end || `${fy}-12-31`);
    setTaxNumber(data.tax_number || '');
    setIsDirty(false);
  };

  useEffect(() => { loadCompany(); }, []);

  const handleCancel = () => {
    if (company) populateForm(company);
    setSaveStatus(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!companyName.trim()) return;

    setSaving(true);
    setSaveStatus(null);

    const payload = {
      company_name: companyName.trim(),
      registration_number: regNo.trim(),
      address: address.trim(),
      email: email.trim(),
      phone: phone.trim(),
      logo_path: logoPath.trim(),
      currency,
      financial_year: parseInt(financialYear, 10),
      financial_year_start: financialYearStart,
      financial_year_end: financialYearEnd,
      tax_number: taxNumber.trim(),
      is_active: company?.is_active ?? true,
    };

    try {
      const compId = company?.company_id || localStorage.getItem('active_company_id') || 'COMP-000001';
      const res = await fetch(`/api/company/${compId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const updated = await res.json();
        populateForm(updated);
        setCompany(updated);
        setSaveStatus('success');
        window.dispatchEvent(new CustomEvent('company-updated', { detail: updated }));
        setTimeout(() => setSaveStatus(null), 4000);
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const markDirty = (setter) => (val) => {
    setter(val);
    setIsDirty(true);
    setSaveStatus(null);
  };

  // ─── Danger Zone: Delete Company Handler ───────────────────────────────────
  const handleConfirmDeleteCompany = async (e) => {
    e.preventDefault();
    if (!company || companyDeleteConfirmText.trim() !== 'DELETE' || !companyDeletePassword.trim()) {
      return;
    }

    setIsDeletingCompany(true);
    setCompanyDeleteError('');

    const token = localStorage.getItem('auth_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`/api/company/${company.company_id}/delete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          password: companyDeletePassword,
          confirmation_text: companyDeleteConfirmText.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to delete company.');
      }

      setIsCompanyDeleteOpen(false);
      setCompanyDeletePassword('');
      setCompanyDeleteConfirmText('');

      if (onCompanyDeleted) {
        onCompanyDeleted(company.company_id, data.remaining_companies, data.next_active_company_id);
      }
    } catch (err) {
      setCompanyDeleteError(err.message || 'Error occurred during company deletion.');
    } finally {
      setIsDeletingCompany(false);
    }
  };

  // ─── Danger Zone: Delete User Account Handler ─────────────────────────────
  const handleStartNewFinancialYear = async (e) => {
    if (e) e.preventDefault();
    setIsRollingOver(true);
    setRolloverError('');
    try {
      const activeId = company?.company_id || localStorage.getItem('active_company_id');
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`/api/company/${encodeURIComponent(activeId)}/start-new-financial-year`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ target_financial_year: Number(targetRolloverYear) })
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.detail || 'Failed to rollover financial year.');
      }
      setRolloverResult(json);
      loadCompany();
      window.dispatchEvent(new CustomEvent('company-updated', { detail: { company_id: activeId } }));
    } catch (err) {
      setRolloverError(err.message);
    } finally {
      setIsRollingOver(false);
    }
  };

  const handleConfirmDeleteUser = async (e) => {
    e.preventDefault();
    if (userDeleteConfirmText.trim() !== 'DELETE' || !userDeletePassword.trim()) {
      return;
    }

    setIsDeletingUser(true);
    setUserDeleteError('');

    const token = localStorage.getItem('auth_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch('/api/auth/delete-account', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          password: userDeletePassword,
          confirmation_text: userDeleteConfirmText.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to delete user account.');
      }

      setIsUserDeleteOpen(false);
      setUserDeletePassword('');
      setUserDeleteConfirmText('');

      if (onUserDeleted) {
        onUserDeleted();
      }
    } catch (err) {
      setUserDeleteError(err.message || 'Error occurred during account deletion.');
    } finally {
      setIsDeletingUser(false);
    }
  };

  // Role & Protection Checks
  const userMembership = currentUser?.companies?.find(c => c.company_id === company?.company_id);
  const isOwner = userMembership ? userMembership.role === 'OWNER' : (currentUser?.role === 'OWNER');
  const isProtectedCompany = company?.company_id === 'COMP-000001';

  // ─── Loading State ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: '0.75rem', display: 'block', margin: '0 auto 0.75rem' }} />
          <p style={{ fontSize: '0.9rem' }}>Loading company settings...</p>
        </div>
      </div>
    );
  }

  // ─── Main Layout ────────────────────────────────────────────────────────────
  return (
    <div className="page-container">

      {/* ── Page Header ── */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.35rem' }}>
          Company Settings
        </h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
          Manage your company information, financial year settings, and contact details.
        </p>
      </div>

      {/* ── Active Company Banner ── */}
      {company && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '1rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
        }}>
          <div style={{
            padding: '0.65rem',
            backgroundColor: 'var(--badge-doc-bg)',
            borderRadius: '9px',
            color: 'var(--primary-color)',
            flexShrink: 0,
          }}>
            <Building2 size={24} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{company.company_name}</span>
              <span className="doc-id-pill" style={{ color: 'var(--primary-color)', backgroundColor: 'var(--badge-doc-bg)', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
                {company.company_id}
              </span>
              <span className="status-badge EXTRACTED" style={{ fontSize: '0.62rem', letterSpacing: '0.06em' }}>
                <ShieldCheck size={10} />
                <span>{company.onboarding_status || 'ACTIVE'}</span>
              </span>
              {isOwner && (
                <span style={{
                  fontSize: '0.65rem',
                  padding: '0.12rem 0.45rem',
                  borderRadius: '4px',
                  backgroundColor: '#E0F2FE',
                  color: '#0369A1',
                  fontWeight: 600
                }}>
                  OWNER
                </span>
              )}
            </div>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {company.registration_number ? `Reg: ${company.registration_number}` : 'No registration number set'}
              {' · '}Currency: <strong style={{ color: 'var(--text-primary)' }}>{company.currency}</strong>
              {' · '}Financial Year: <strong style={{ color: 'var(--text-primary)' }}>{company.financial_year} ({company.financial_year_start || '01-01'} to {company.financial_year_end || '12-31'})</strong>
            </p>
          </div>
          <div style={{ flexShrink: 0 }}>
            <Info size={14} style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
          </div>
        </div>
      )}

      {/* ── Save Status Banner ── */}
      {saveStatus === 'success' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          background: 'var(--status-success-bg)', border: '1px solid rgba(21, 128, 61, 0.25)',
          borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem',
          color: 'var(--status-success-text)', fontSize: '0.875rem',
        }}>
          <CheckCircle2 size={16} />
          <span>Company settings saved successfully.</span>
        </div>
      )}
      {saveStatus === 'error' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          background: 'var(--status-error-bg)', border: '1px solid rgba(185, 28, 28, 0.25)',
          borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem',
          color: 'var(--status-error-text)', fontSize: '0.875rem',
        }}>
          <AlertTriangle size={16} />
          <span>Failed to save settings. Please check your input and try again.</span>
        </div>
      )}

      <form onSubmit={handleSave} noValidate>

        {/* ── 1. Company Information ── */}
        <SettingsSection
          icon={Building2}
          title="Company Information"
          description="Your company's legal name, registration details, and logo."
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'end' }}>
              <Field label="Company ID" readonly>
                <input
                  type="text"
                  readOnly
                  value={company?.company_id || ''}
                  style={readOnlyFieldStyle}
                />
              </Field>
            </div>

            <Field label="Company Name" required>
              <input
                type="text"
                required
                placeholder="e.g. NextTech Solutions Sdn Bhd"
                value={companyName}
                onChange={(e) => markDirty(setCompanyName)(e.target.value)}
                style={fieldStyle}
              />
            </Field>

            <Field label="Business Registration Number">
              <input
                type="text"
                placeholder="e.g. 202401987654 (1543210-X)"
                value={regNo}
                onChange={(e) => markDirty(setRegNo)(e.target.value)}
                style={fieldStyle}
              />
            </Field>

            <Field label="Company Logo (URL or Path)">
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <ImageIcon size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="e.g. https://example.com/logo.png or /assets/logo.png"
                  value={logoPath}
                  onChange={(e) => markDirty(setLogoPath)(e.target.value)}
                  style={fieldStyle}
                />
              </div>
            </Field>

            <Field label="Company Address">
              <textarea
                rows={3}
                placeholder="e.g. No. 20, Jalan Cheras, 50450 Kuala Lumpur, Malaysia"
                value={address}
                onChange={(e) => markDirty(setAddress)(e.target.value)}
                style={{ ...fieldStyle, resize: 'vertical', minHeight: '72px' }}
              />
            </Field>

          </div>
        </SettingsSection>

        {/* ── 2. Contact Information ── */}
        <SettingsSection
          icon={Mail}
          title="Contact Details"
          description="Official communication channels for invoicing and accounting correspondence."
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Field label="Email Address">
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Mail size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                <input
                  type="email"
                  placeholder="e.g. accounts@nexttech.com.my"
                  value={email}
                  onChange={(e) => markDirty(setEmail)(e.target.value)}
                  style={fieldStyle}
                />
              </div>
            </Field>

            <Field label="Phone Number">
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Phone size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                <input
                  type="tel"
                  placeholder="e.g. +603-7890 1234"
                  value={phone}
                  onChange={(e) => markDirty(setPhone)(e.target.value)}
                  style={fieldStyle}
                />
              </div>
            </Field>
          </div>
        </SettingsSection>

        {/* ── 3. Accounting & Financial Year Settings ── */}
        <SettingsSection
          icon={DollarSign}
          title="Accounting & Financial Year Settings"
          description="Default currency, financial year period, and accounting start/end dates."
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>

            <Field label="Default Currency" required>
              <select
                value={currency}
                onChange={(e) => markDirty(setCurrency)(e.target.value)}
                style={fieldStyle}
              >
                {CURRENCIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Financial Year" required>
              <select
                value={financialYear}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  markDirty(setFinancialYear)(val);
                  markDirty(setFinancialYearStart)(`${val}-01-01`);
                  markDirty(setFinancialYearEnd)(`${val}-12-31`);
                }}
                style={fieldStyle}
              >
                {FINANCIAL_YEARS.map(fy => (
                  <option key={fy.value} value={fy.value}>{fy.label}</option>
                ))}
              </select>
            </Field>

          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Field label="Financial Year Start Date" required>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Calendar size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                <input
                  type="date"
                  value={financialYearStart}
                  onChange={(e) => markDirty(setFinancialYearStart)(e.target.value)}
                  style={fieldStyle}
                />
              </div>
            </Field>

            <Field label="Financial Year End Date" required>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Calendar size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                <input
                  type="date"
                  value={financialYearEnd}
                  onChange={(e) => markDirty(setFinancialYearEnd)(e.target.value)}
                  style={fieldStyle}
                />
              </div>
            </Field>
          </div>
        </SettingsSection>

        {/* ── 4. Tax Information ── */}
        <SettingsSection
          icon={FileText}
          title="Tax Information"
          description="SST or GST registration number (optional)."
        >
          <Field label="Tax / SST Registration Number">
            <input
              type="text"
              placeholder="e.g. SST-W10-1808-32000 (leave blank if not applicable)"
              value={taxNumber}
              onChange={(e) => markDirty(setTaxNumber)(e.target.value)}
              style={fieldStyle}
            />
          </Field>
        </SettingsSection>

        {/* ── 5. Financial Year Management & Rollover ── */}
        <SettingsSection
          icon={CalendarClock}
          title="Financial Year Rollover"
          description="Transition to a new financial year, roll profit/loss into Retained Earnings, and post new opening balances."
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '8px',
            padding: '1.25rem',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div style={{ flex: 1, minWidth: '260px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0F172A' }}>
                  Current Financial Year: {company?.financial_year || 2026}
                </span>
                <span style={{
                  fontSize: '0.7rem',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '9999px',
                  backgroundColor: '#EFF6FF',
                  color: '#2563EB',
                  fontWeight: 600
                }}>
                  {company?.financial_year_start} to {company?.financial_year_end}
                </span>
              </div>
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                When starting a new financial year, the system carries forward balance sheet accounts, rolls P&L net income into Retained Earnings (150-0000), and posts the new opening balance journal without re-onboarding.
              </p>
            </div>
            <div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setTargetRolloverYear((company?.financial_year || 2026) + 1);
                  setRolloverError('');
                  setRolloverResult(null);
                  setIsRolloverOpen(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  padding: '0.6rem 1.1rem'
                }}
              >
                <CalendarClock size={16} />
                <span>Start New Financial Year</span>
              </button>
            </div>
          </div>
        </SettingsSection>

        {/* ── Save Settings Action Buttons ── */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '0.75rem',
          paddingTop: '0.5rem',
          marginBottom: '2rem'
        }}>
          {isDirty && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginRight: 'auto' }}>
              <AlertTriangle size={12} style={{ display: 'inline', marginRight: '0.3rem', color: '#f59e0b', verticalAlign: 'middle' }} />
              You have unsaved changes
            </span>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCancel}
            disabled={saving || !isDirty}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving || !companyName.trim()}
            style={{ minWidth: '130px' }}
          >
            {saving ? (
              <>
                <RefreshCw size={15} style={{ animation: 'spin 0.8s linear infinite' }} />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save size={15} />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>

      </form>

      {/* ── 5. DANGER ZONE ─────────────────────────────────────────────────── */}
      <div style={{
        marginTop: '2rem',
        border: '1px solid #FCA5A5',
        borderRadius: '10px',
        backgroundColor: '#FFF5F5',
        padding: '1.5rem',
        boxShadow: '0 1px 3px rgba(239, 68, 68, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.75rem' }}>
          <div style={{
            padding: '0.5rem',
            backgroundColor: '#FEE2E2',
            borderRadius: '6px',
            color: '#DC2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <AlertOctagon size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: '#991B1B' }}>
              Danger Zone
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#B91C1C', margin: '0.15rem 0 0 0' }}>
              Destructive operations. Please proceed with caution — these actions cannot be undone.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.25rem' }}>
          
          {/* Action A: Delete This Company */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem 1.25rem',
            backgroundColor: '#FFFFFF',
            border: '1px solid #FECACA',
            borderRadius: '8px',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div style={{ flex: 1, minWidth: '260px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Trash2 size={16} style={{ color: '#DC2626' }} />
                <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                  Delete This Company
                </span>
                {isProtectedCompany && (
                  <span style={{
                    fontSize: '0.65rem',
                    padding: '0.1rem 0.4rem',
                    borderRadius: '4px',
                    backgroundColor: '#FEE2E2',
                    color: '#991B1B',
                    fontWeight: 600
                  }}>
                    PROTECTED TEMPLATE
                  </span>
                )}
                {!isOwner && !isProtectedCompany && (
                  <span style={{
                    fontSize: '0.65rem',
                    padding: '0.1rem 0.4rem',
                    borderRadius: '4px',
                    backgroundColor: '#F3F4F6',
                    color: '#4B5563',
                    fontWeight: 600
                  }}>
                    OWNER ONLY
                  </span>
                )}
              </div>
              <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                Permanently delete <strong>{company?.company_name}</strong> ({company?.company_id}) along with all invoices,
                opening balances, journal entries, general ledger records, and customer/vendor details.
              </p>
            </div>
            <div>
              <button
                type="button"
                className="btn btn-danger"
                disabled={isProtectedCompany || !isOwner}
                onClick={() => {
                  setCompanyDeleteError('');
                  setCompanyDeletePassword('');
                  setCompanyDeleteConfirmText('');
                  setIsCompanyDeleteOpen(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  padding: '0.5rem 1rem'
                }}
                title={
                  isProtectedCompany 
                    ? 'COMP-000001 is the master default system company and cannot be deleted.'
                    : !isOwner 
                      ? 'Only users with the OWNER role can delete this company.'
                      : 'Permanently delete this company'
                }
              >
                <Trash2 size={15} />
                <span>Delete Company</span>
              </button>
            </div>
          </div>

          {/* ── Sub-header: Account Settings ── */}
          <div style={{
            marginTop: '0.75rem',
            paddingTop: '0.75rem',
            borderTop: '1px dashed #FECACA'
          }}>
            <h4 style={{
              fontSize: '0.9rem',
              fontWeight: 700,
              color: '#991B1B',
              margin: '0 0 0.5rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}>
              <User size={15} />
              <span>Account Settings</span>
            </h4>
          </div>

          {/* Action B: Delete Registered Account */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem 1.25rem',
            backgroundColor: '#FFFFFF',
            border: '1px solid #FECACA',
            borderRadius: '8px',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div style={{ flex: 1, minWidth: '260px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <UserX size={16} style={{ color: '#DC2626' }} />
                <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                  Delete Registered Account
                </span>
              </div>
              <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                Delete your registered account and all associated company and accounting data permanently.
              </p>
            </div>
            <div>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  setUserDeleteError('');
                  setUserDeletePassword('');
                  setUserDeleteConfirmText('');
                  setIsUserDeleteOpen(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  padding: '0.5rem 1rem'
                }}
              >
                <UserX size={15} />
                <span>Delete My Account</span>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ── MODAL: Delete Company Confirmation ─────────────────────────────── */}
      {isCompanyDeleteOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px', borderTop: '4px solid #DC2626' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{
                  padding: '0.45rem',
                  backgroundColor: '#FEE2E2',
                  borderRadius: '6px',
                  color: '#DC2626'
                }}>
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
                    Delete Company: {company?.company_name}
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Company ID: {company?.company_id}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsCompanyDeleteOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmDeleteCompany}>
              <div className="modal-body" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                
                {/* Warning Card */}
                <div style={{
                  backgroundColor: '#FFF5F5',
                  border: '1px solid #FECACA',
                  borderRadius: '6px',
                  padding: '0.85rem',
                  fontSize: '0.8rem',
                  color: '#991B1B',
                  lineHeight: 1.5
                }}>
                  <strong style={{ display: 'block', marginBottom: '0.35rem', color: '#7F1D1D' }}>
                    Warning: This action is permanent and irreversible.
                  </strong>
                  The following data belonging to <strong>{company?.company_name}</strong> will be permanently destroyed:
                  <ul style={{ margin: '0.4rem 0 0 1.1rem', padding: 0 }}>
                    <li>Company profile, tax and accounting settings</li>
                    <li>Uploaded invoices, receipts, and supporting document files</li>
                    <li>Opening balance documents, batches, and subledger draft records</li>
                    <li>Customer, supplier, and inventory item records</li>
                    <li>Bank feed transactions and reconciliation links</li>
                    <li>Journal entries, General Ledger, and financial statement lines</li>
                  </ul>
                </div>

                {companyDeleteError && (
                  <div style={{
                    backgroundColor: 'var(--status-error-bg)',
                    border: '1px solid var(--status-error-border)',
                    color: 'var(--status-error-text)',
                    borderRadius: '6px',
                    padding: '0.65rem 0.85rem',
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                    <span>{companyDeleteError}</span>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
                    Account Password *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Enter your current password to authenticate"
                    value={companyDeletePassword}
                    onChange={(e) => setCompanyDeletePassword(e.target.value)}
                    style={fieldStyle}
                    autoComplete="current-password"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
                    Type <span style={{ color: '#DC2626', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>DELETE</span> to confirm *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Type DELETE"
                    value={companyDeleteConfirmText}
                    onChange={(e) => setCompanyDeleteConfirmText(e.target.value)}
                    style={{ ...fieldStyle, fontFamily: 'var(--font-mono)' }}
                  />
                </div>

              </div>

              <div style={{
                padding: '1rem 1.5rem',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                backgroundColor: 'var(--bg-card)'
              }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsCompanyDeleteOpen(false)}
                  disabled={isDeletingCompany}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={isDeletingCompany || companyDeleteConfirmText.trim() !== 'DELETE' || !companyDeletePassword.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
                >
                  {isDeletingCompany ? (
                    <>
                      <RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      <span>Permanently Delete Company</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Delete Registered Account Confirmation ─────────────────── */}
      {isUserDeleteOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '540px', borderTop: '4px solid #DC2626' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{
                  padding: '0.45rem',
                  backgroundColor: '#FEE2E2',
                  borderRadius: '6px',
                  color: '#DC2626'
                }}>
                  <UserX size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
                    Delete Registered Account
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Account: {currentUser?.email} ({currentUser?.full_name || 'Current User'})
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsUserDeleteOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmDeleteUser}>
              <div className="modal-body" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                
                {/* Warning Card */}
                <div style={{
                  backgroundColor: '#FFF5F5',
                  border: '1px solid #FECACA',
                  borderRadius: '6px',
                  padding: '0.85rem',
                  fontSize: '0.8rem',
                  color: '#991B1B',
                  lineHeight: 1.5
                }}>
                  <strong style={{ display: 'block', marginBottom: '0.35rem', color: '#7F1D1D' }}>
                    Warning: Permanent Account & Data Deletion
                  </strong>
                  • Your registered account credentials, login sessions, and profile will be permanently deleted.<br />
                  • All companies owned by this account and their entire financial records (accounting documents, extracted JSON data, transactions, journal entries, general ledger, trial balance, bank integrations, inventory, subledger entities, and opening balances) will be permanently purged.<br />
                  • Application file storage folders, uploaded PDFs, and onboarding drafts will be removed.<br />
                  • If you share any company with other users, the company and other users' records will be preserved while removing your account membership.<br />
                  • After deletion, you will be redirected to the Login / Register screen and can immediately register again as a new user with this email address.
                </div>

                {userDeleteError && (
                  <div style={{
                    backgroundColor: 'var(--status-error-bg)',
                    border: '1px solid var(--status-error-border)',
                    color: 'var(--status-error-text)',
                    borderRadius: '6px',
                    padding: '0.65rem 0.85rem',
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                    <span>{userDeleteError}</span>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
                    Account Password *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Enter your current password to authenticate"
                    value={userDeletePassword}
                    onChange={(e) => setUserDeletePassword(e.target.value)}
                    style={fieldStyle}
                    autoComplete="current-password"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
                    Type <span style={{ color: '#DC2626', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>DELETE</span> to confirm *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Type DELETE"
                    value={userDeleteConfirmText}
                    onChange={(e) => setUserDeleteConfirmText(e.target.value)}
                    style={{ ...fieldStyle, fontFamily: 'var(--font-mono)' }}
                  />
                </div>

              </div>

              <div style={{
                padding: '1rem 1.5rem',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                backgroundColor: 'var(--bg-card)'
              }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsUserDeleteOpen(false)}
                  disabled={isDeletingUser}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={isDeletingUser || userDeleteConfirmText.trim() !== 'DELETE' || !userDeletePassword.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
                >
                  {isDeletingUser ? (
                    <>
                      <RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                      <span>Deleting Account & All Data...</span>
                    </>
                  ) : (
                    <>
                      <UserX size={14} />
                      <span>Delete My Account</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* ── MODAL: Financial Year Rollover ───────────────────────────────── */}
      {isRolloverOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '540px', borderTop: '4px solid #2563EB' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{
                  padding: '0.45rem',
                  backgroundColor: '#EFF6FF',
                  borderRadius: '6px',
                  color: '#2563EB'
                }}>
                  <CalendarClock size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
                    Start New Financial Year
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Company: {company?.company_name} ({company?.company_id})
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsRolloverOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {rolloverResult ? (
              <div className="modal-body" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: '8px',
                  padding: '1rem',
                  color: '#166534'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.95rem' }}>
                    <CheckCircle2 size={18} style={{ color: '#16A34A' }} />
                    <span>{rolloverResult.message}</span>
                  </div>
                  <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', lineHeight: 1.6 }}>
                    <div>• <strong>New Financial Year:</strong> {rolloverResult.financial_year} ({rolloverResult.financial_year_start} to {rolloverResult.financial_year_end})</div>
                    <div>• <strong>Opening Journal Entry:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{rolloverResult.journal_id}</span></div>
                    <div>• <strong>Net Income Rolled into Retained Earnings:</strong> RM {Number(rolloverResult.net_income_rolled || 0).toLocaleString('en-MY', { minimumFractionDigits: 2 })}</div>
                    <div>• <strong>Retained Master Data:</strong> Chart of Accounts, Customers, Suppliers, and Inventory are retained.</div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setIsRolloverOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleStartNewFinancialYear}>
                <div className="modal-body" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  
                  {/* Informational Guidance */}
                  <div style={{
                    backgroundColor: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    borderRadius: '8px',
                    padding: '0.85rem',
                    fontSize: '0.8rem',
                    color: '#1E40AF',
                    lineHeight: 1.5
                  }}>
                    <strong style={{ display: 'block', marginBottom: '0.35rem', color: '#1E3A8A' }}>
                      Financial Year Rollover Process:
                    </strong>
                    <ul style={{ margin: '0.2rem 0 0 1.1rem', padding: 0 }}>
                      <li>Carries forward all closing balance sheet asset, liability, and equity balances.</li>
                      <li>Calculates net profit/loss and rolls it into <strong>150-0000 Retained Earnings</strong>.</li>
                      <li>Generates and posts a balanced <strong>Opening Balance Journal</strong> for the new year.</li>
                      <li>Retains existing Chart of Accounts, Customers, Suppliers, and Inventory.</li>
                    </ul>
                  </div>

                  {rolloverError && (
                    <div style={{
                      backgroundColor: 'var(--status-error-bg)',
                      border: '1px solid var(--status-error-border)',
                      color: 'var(--status-error-text)',
                      borderRadius: '6px',
                      padding: '0.65rem 0.85rem',
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                      <span>{rolloverError}</span>
                    </div>
                  )}

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
                      Target New Financial Year *
                    </label>
                    <select
                      value={targetRolloverYear}
                      onChange={(e) => setTargetRolloverYear(Number(e.target.value))}
                      style={fieldStyle}
                    >
                      {FINANCIAL_YEARS.map((fy) => (
                        <option key={fy.value} value={fy.value}>
                          FY {fy.label} ({fy.value}-01-01 to {fy.value}-12-31)
                        </option>
                      ))}
                    </select>
                  </div>

                </div>

                <div style={{
                  padding: '1rem 1.5rem',
                  borderTop: '1px solid var(--border-color)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.75rem',
                  backgroundColor: 'var(--bg-card)'
                }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setIsRolloverOpen(false)}
                    disabled={isRollingOver}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isRollingOver}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
                  >
                    {isRollingOver ? (
                      <>
                        <RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                        <span>Processing Rollover...</span>
                      </>
                    ) : (
                      <>
                        <ArrowRight size={14} />
                        <span>Confirm & Rollover to FY {targetRolloverYear}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
