import React, { useEffect, useState } from 'react';
import { Upload, Building2, Settings, LogOut, User } from 'lucide-react';
import CompanySettingModal from './CompanySettingModal';

export default function Navbar({ onOpenUpload, onNavigateToCompanySettings, currentUser, onLogout }) {
  const [company, setCompany] = useState({
    company_id: 'COMP-000001',
    company_name: 'NextTech Solutions Sdn Bhd',
    currency: 'MYR',
    financial_year: 2026
  });
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);

  const fetchCompanyProfile = async () => {
    try {
      const activeId = localStorage.getItem('active_company_id');
      const url = activeId ? `/api/company/profile?company_id=${encodeURIComponent(activeId)}` : '/api/company/profile';
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().length > 0) {
          const data = JSON.parse(text);
          if (data && data.company_id) {
            setCompany(data);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching company profile:', err);
    }
  };

  useEffect(() => {
    fetchCompanyProfile();

    const handleCompanyUpdate = (e) => {
      if (e.detail && e.detail.company_id) {
        setCompany(e.detail);
      } else {
        fetchCompanyProfile();
      }
    };

    window.addEventListener('company-updated', handleCompanyUpdate);
    return () => window.removeEventListener('company-updated', handleCompanyUpdate);
  }, []);

  return (
    <>
      <header className="top-navbar">
        <div className="page-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Building2 size={18} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
            <h1 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {company ? company.company_name : 'NextTech Solutions Sdn Bhd'}
            </h1>
            {company && (
              <span style={{ 
                fontSize: '0.72rem', 
                fontFamily: 'var(--font-mono)', 
                backgroundColor: 'var(--status-info-bg)', 
                color: 'var(--color-primary)', 
                border: '1px solid var(--status-info-border)',
                padding: '0.12rem 0.45rem', 
                borderRadius: '4px',
                fontWeight: 600 
              }}>
                {company.company_id}
              </span>
            )}
            <button
              onClick={() => setIsCompanyModalOpen(true)}
              className="btn btn-secondary btn-sm"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', gap: '0.3rem' }}
              title="Edit Company Profile Settings"
            >
              <Settings size={13} />
              <span>Settings</span>
            </button>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0 0' }}>
            {company 
              ? `Financial Year: ${company.financial_year} · Currency: ${company.currency}`
              : 'Click Settings to key in your Company Profile'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button 
            className="btn btn-primary"
            onClick={onOpenUpload}
            style={{ fontWeight: 600, fontSize: '0.8125rem', padding: '0.4rem 0.85rem' }}
          >
            <Upload size={15} />
            <span>Upload Document</span>
          </button>

          {currentUser && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: 'var(--bg-card, #F8FAFC)',
              border: '1px solid var(--border-color, #E2E8F0)',
              borderRadius: '6px',
              padding: '0.25rem 0.6rem',
              fontSize: '0.78rem',
              marginLeft: '0.25rem'
            }}>
              <User size={13} style={{ color: 'var(--text-secondary)' }} />
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {currentUser.full_name || currentUser.email}
              </span>
              {currentUser.role && (
                <span style={{
                  fontSize: '0.65rem',
                  padding: '0.1rem 0.35rem',
                  borderRadius: '3px',
                  backgroundColor: '#E0F2FE',
                  color: '#0369A1',
                  fontWeight: 600
                }}>
                  {currentUser.role}
                </span>
              )}
            </div>
          )}

          {onLogout && (
            <button
              onClick={onLogout}
              className="btn btn-secondary"
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.78rem', gap: '0.3rem' }}
              title="Sign Out"
            >
              <LogOut size={13} />
              <span>Logout</span>
            </button>
          )}
        </div>
      </header>

      <CompanySettingModal 
        isOpen={isCompanyModalOpen}
        onClose={() => setIsCompanyModalOpen(false)}
        currentCompany={company}
        onCompanySaved={(updatedComp) => setCompany(updatedComp)}
        onNavigateToFullSettings={onNavigateToCompanySettings}
      />
    </>
  );
}
