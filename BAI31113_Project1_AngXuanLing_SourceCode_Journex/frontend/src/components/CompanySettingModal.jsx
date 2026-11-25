import React, { useState, useEffect } from 'react';
import { X, Building2, Save, CheckCircle, ExternalLink } from 'lucide-react';

export default function CompanySettingModal({ isOpen, onClose, currentCompany, onCompanySaved, onNavigateToFullSettings }) {
  const [companyName, setCompanyName] = useState('');
  const [regNo, setRegNo] = useState('');
  const [currency, setCurrency] = useState('MYR');
  const [financialYear, setFinancialYear] = useState(2026);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (currentCompany) {
      setCompanyName(currentCompany.company_name || '');
      setRegNo(currentCompany.registration_number || '');
      setCurrency(currentCompany.currency || 'MYR');
      setFinancialYear(currentCompany.financial_year || 2026);
    }
  }, [currentCompany, isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!companyName.trim()) return;

    setIsSaving(true);
    setSuccessMsg('');

    const compId = currentCompany?.company_id || localStorage.getItem('active_company_id') || 'COMP-000001';
    const payload = {
      ...currentCompany,
      company_name: companyName.trim(),
      registration_number: regNo.trim(),
      currency: currency,
      financial_year: parseInt(financialYear, 10) || 2026,
      is_active: currentCompany?.is_active ?? true
    };

    try {
      // Primary: PUT /api/company/${compId}
      let res = await fetch(`/api/company/${compId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // Fallback: POST /api/company/profile
      if (!res.ok) {
        res = await fetch('/api/company/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) throw new Error('Failed to save company profile.');

      const savedComp = await res.json();
      setIsSaving(false);
      setSuccessMsg('Company Profile saved successfully!');
      
      if (onCompanySaved) onCompanySaved(savedComp);
      window.dispatchEvent(new CustomEvent('company-updated', { detail: savedComp }));

      setTimeout(() => {
        setSuccessMsg('');
        onClose();
      }, 1000);
    } catch (err) {
      setIsSaving(false);
      alert(err.message || 'Error saving company settings.');
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '0.6rem 0.85rem',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    color: 'var(--text-primary)',
    fontSize: '0.9rem',
    boxSizing: 'border-box'
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Building2 size={20} style={{ color: 'var(--primary-color)' }} />
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Company Profile Settings</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0 0' }}>
                Set accounting context for business role resolution
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem 1.5rem' }}>
            {successMsg && (
              <div style={{ 
                backgroundColor: 'var(--status-success-bg)', 
                border: '1px solid var(--status-success-border)', 
                color: 'var(--status-success-text)',
                padding: '0.65rem 0.85rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <CheckCircle size={16} />
                <span>{successMsg}</span>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
                Company Name *
              </label>
              <input 
                type="text" 
                required
                placeholder="e.g. NextTech Solutions Sdn Bhd"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
                Registration / SSM Number
              </label>
              <input 
                type="text" 
                placeholder="e.g. 202401987654 (1543210-X)"
                value={regNo}
                onChange={(e) => setRegNo(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
                  Accounting Currency
                </label>
                <select 
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={inputStyle}
                >
                  <option value="MYR">MYR (Malaysian Ringgit)</option>
                  <option value="USD">USD (US Dollar)</option>
                  <option value="SGD">SGD (Singapore Dollar)</option>
                  <option value="EUR">EUR (Euro)</option>
                  <option value="GBP">GBP (British Pound)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
                  Financial Year
                </label>
                <input 
                  type="number" 
                  value={financialYear}
                  onChange={(e) => setFinancialYear(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            {onNavigateToFullSettings && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '0.65rem 0.85rem',
                backgroundColor: 'var(--bg-surface)',
                borderRadius: '6px',
                marginTop: '0.25rem'
              }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Need advanced fields (address, tax number)?
                </span>
                <button
                  type="button"
                  onClick={() => { onClose(); onNavigateToFullSettings(); }}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', padding: '0.25rem 0.55rem' }}
                >
                  <span>Company Settings Page</span>
                  <ExternalLink size={12} />
                </button>
              </div>
            )}
          </div>

          <div style={{ 
            padding: '1rem 1.5rem', 
            borderTop: '1px solid var(--border-color)', 
            display: 'flex', 
            justifyContent: 'flex-end',
            gap: '0.75rem'
          }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSaving || !companyName.trim()}>
              <Save size={16} />
              <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
