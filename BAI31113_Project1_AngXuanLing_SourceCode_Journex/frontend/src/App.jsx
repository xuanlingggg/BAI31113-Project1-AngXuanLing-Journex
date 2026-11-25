import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import DocumentsPage from './pages/DocumentsPage';
import DashboardPage from './pages/DashboardPage';
import CompanySettingsPage from './pages/CompanySettingsPage';
import TransactionsPage from './pages/TransactionsPage';
import JournalsPage from './pages/JournalsPage';
import DailyLedgerPage from './pages/DailyLedgerPage';
import GeneralLedgerPage from './pages/GeneralLedgerPage';
import TrialBalancePage from './pages/TrialBalancePage';
import SettingsPage from './pages/SettingsPage';
import ReportsPage from './pages/ReportsPage';
import AccrualsPrepaymentsPage from './pages/AccrualsPrepaymentsPage';
import AuthPage from './pages/AuthPage';
import OnboardingPage from './pages/OnboardingPage';
import ChartOfAccountsPage from './pages/ChartOfAccountsPage';
import OpeningBalancesPage from './pages/OpeningBalancesPage';
import ReceivablesPage from './pages/ReceivablesPage';
import PayablesPage from './pages/PayablesPage';
import OtherCreditorsPage from './pages/OtherCreditorsPage';
import InventoryPage from './pages/InventoryPage';

export default function App() {
  const [currentPage, setCurrentPage] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    return hash || 'dashboard';
  });

  const handleNavigate = (page) => {
    setCurrentPage(page);
    window.location.hash = page;
  };

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && hash !== currentPage) {
        setCurrentPage(hash);
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [currentPage]);
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('auth_token'));
  const [regSessionId, setRegSessionId] = useState(() => sessionStorage.getItem('reg_session_id') || null);
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const stored = localStorage.getItem('auth_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [activeCompanyId, setActiveCompanyId] = useState(() => {
    try {
      const stored = localStorage.getItem('auth_user');
      if (stored) {
        const u = JSON.parse(stored);
        if (u.companies && u.companies.length > 0) {
          return localStorage.getItem('active_company_id') || u.companies[0].company_id;
        }
        return null;
      }
    } catch {
      // fallback
    }
    return localStorage.getItem('active_company_id') || null;
  });

  const [onboardingStatus, setOnboardingStatus] = useState(null); // null = loading
  const [isOnboardingMode, setIsOnboardingMode] = useState(false);

  // Check company onboarding status
  const checkCompanyStatus = async (compId) => {
    const targetId = compId || activeCompanyId;
    if (!targetId) {
      setOnboardingStatus('NOT_STARTED');
      setIsOnboardingMode(true);
      return;
    }
    try {
      const token = authToken || localStorage.getItem('auth_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/onboarding/status?company_id=${targetId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setOnboardingStatus(data.onboarding_status);
        if (data.onboarding_status !== 'ACTIVE') {
          setIsOnboardingMode(true);
        } else {
          setIsOnboardingMode(false);
        }
      } else if (res.status === 404 || res.status === 401 || res.status === 403) {
        // Company doesn't exist yet or unauthorized -> launch onboarding
        localStorage.removeItem('active_company_id');
        setActiveCompanyId(null);
        setOnboardingStatus('NOT_STARTED');
        setIsOnboardingMode(true);
      } else {
        setOnboardingStatus('ACTIVE');
        setIsOnboardingMode(false);
      }
    } catch (err) {
      console.warn('Could not check onboarding status:', err);
      setOnboardingStatus('ACTIVE');
      setIsOnboardingMode(false);
    }
  };

  // Listen for company-updated custom events
  useEffect(() => {
    const handleCompanyUpdate = (e) => {
      const cid = e.detail?.company_id;
      if (cid) {
        setActiveCompanyId(cid);
        localStorage.setItem('active_company_id', cid);
        checkCompanyStatus(cid);
      }
    };
    window.addEventListener('company-updated', handleCompanyUpdate);
    return () => window.removeEventListener('company-updated', handleCompanyUpdate);
  }, []);

  useEffect(() => {
    if (authToken) {
      const headers = { 'Authorization': `Bearer ${authToken}` };
      fetch('/api/auth/me', { headers })
        .then(res => res.ok ? res.json() : null)
        .then(user => {
          if (user) {
            setCurrentUser(user);
            localStorage.setItem('auth_user', JSON.stringify(user));
            if (user.companies && user.companies.length > 0) {
              const saved = localStorage.getItem('active_company_id');
              const exists = user.companies.some(c => c.company_id === saved);
              const target = exists ? saved : user.companies[user.companies.length - 1].company_id;
              setActiveCompanyId(target);
              localStorage.setItem('active_company_id', target);
              checkCompanyStatus(target);
              return;
            }
          }
          const savedComp = localStorage.getItem('active_company_id');
          if (savedComp) {
            setActiveCompanyId(savedComp);
            checkCompanyStatus(savedComp);
          } else {
            setActiveCompanyId(null);
            setOnboardingStatus('NOT_STARTED');
            setIsOnboardingMode(true);
          }
        })
        .catch(err => {
          console.warn('Error verifying user:', err);
          const savedComp = localStorage.getItem('active_company_id');
          if (savedComp) {
            setActiveCompanyId(savedComp);
            checkCompanyStatus(savedComp);
          }
        });
    }
  }, [authToken]);

  const handleLoginSuccess = (token, user) => {
    setAuthToken(token);
    setCurrentUser(user);
    if (user && user.companies && user.companies.length > 0) {
      const targetCompany = user.companies[0].company_id;
      setActiveCompanyId(targetCompany);
      localStorage.setItem('active_company_id', targetCompany);
      checkCompanyStatus(targetCompany);
    } else {
      // New user with no companies yet -> launch onboarding
      setActiveCompanyId(null);
      localStorage.removeItem('active_company_id');
      setIsOnboardingMode(true);
      setOnboardingStatus('NOT_STARTED');
    }
  };

  const handleStartRegistrationSession = (sessionId) => {
    setRegSessionId(sessionId);
    sessionStorage.setItem('reg_session_id', sessionId);
  };

  const handleCancelRegistrationSession = () => {
    setRegSessionId(null);
    sessionStorage.removeItem('reg_session_id');
    setIsOnboardingMode(false);
  };

  const handleActivationSuccess = (activationPayload) => {
    // activationPayload can be a companyId string or an object { company_id, access_token, user }
    const cid = typeof activationPayload === 'object' && activationPayload !== null
      ? activationPayload.company_id
      : activationPayload;

    if (typeof activationPayload === 'object' && activationPayload !== null && activationPayload.access_token) {
      localStorage.setItem('auth_token', activationPayload.access_token);
      setAuthToken(activationPayload.access_token);
      if (activationPayload.user) {
        localStorage.setItem('auth_user', JSON.stringify(activationPayload.user));
        setCurrentUser(activationPayload.user);
      }
    }

    setActiveCompanyId(cid);
    localStorage.setItem('active_company_id', cid);
    setRegSessionId(null);
    sessionStorage.removeItem('reg_session_id');
    setOnboardingStatus('ACTIVE');
    setIsOnboardingMode(false);
    setCurrentPage('dashboard');

    if (currentUser) {
      const hasComp = currentUser.companies && currentUser.companies.some(c => c.company_id === cid);
      if (!hasComp) {
        const updatedUser = {
          ...currentUser,
          companies: [
            ...(currentUser.companies || []),
            { company_id: cid, company_name: 'Active Company', role: 'OWNER', is_default: true }
          ]
        };
        setCurrentUser(updatedUser);
        localStorage.setItem('auth_user', JSON.stringify(updatedUser));
      }
    }

    window.dispatchEvent(new CustomEvent('company-updated', { detail: { company_id: cid } }));
  };

  const handleCompanyDeleted = (deletedCompanyId, remainingCompanies, nextActiveCompanyId) => {
    let updatedCompanies = [];
    if (remainingCompanies && Array.isArray(remainingCompanies)) {
      updatedCompanies = remainingCompanies;
    } else if (currentUser && currentUser.companies) {
      updatedCompanies = currentUser.companies.filter(c => c.company_id !== deletedCompanyId);
    }

    const updatedUser = currentUser ? { ...currentUser, companies: updatedCompanies } : null;
    if (updatedUser) {
      setCurrentUser(updatedUser);
      localStorage.setItem('auth_user', JSON.stringify(updatedUser));
    }

    if (nextActiveCompanyId) {
      setActiveCompanyId(nextActiveCompanyId);
      localStorage.setItem('active_company_id', nextActiveCompanyId);
      checkCompanyStatus(nextActiveCompanyId);
      window.dispatchEvent(new CustomEvent('company-updated', { detail: { company_id: nextActiveCompanyId } }));
      setCurrentPage('dashboard');
    } else {
      setActiveCompanyId(null);
      localStorage.removeItem('active_company_id');
      setOnboardingStatus('NOT_STARTED');
      setIsOnboardingMode(true);
      window.dispatchEvent(new CustomEvent('company-updated', { detail: { company_id: null } }));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('active_company_id');
    setAuthToken(null);
    setCurrentUser(null);
    setActiveCompanyId(null);
    setOnboardingStatus(null);
    setIsOnboardingMode(false);
  };

  // 1. If currently in temporary registration session (Step 1 -> 2 -> 3), render OnboardingPage
  if (regSessionId) {
    return (
      <OnboardingPage 
        sessionId={regSessionId}
        onActivationSuccess={handleActivationSuccess}
        onBackToRegister={handleCancelRegistrationSession}
        onLogout={handleLogout}
      />
    );
  }

  // 2. If not authenticated, require login or registration
  if (!authToken) {
    return (
      <AuthPage 
        onLoginSuccess={handleLoginSuccess}
        onStartRegistrationSession={handleStartRegistrationSession}
      />
    );
  }

  // 3. If company is not active or user explicitly in onboarding: render OnboardingPage
  if (isOnboardingMode || (onboardingStatus && onboardingStatus !== 'ACTIVE')) {
    return (
      <OnboardingPage 
        companyId={activeCompanyId}
        onActivationSuccess={handleActivationSuccess}
        onBackToDashboard={onboardingStatus === 'ACTIVE' ? () => setIsOnboardingMode(false) : null}
        onLogout={handleLogout}
      />
    );
  }

  // 3. Main Workspace Navigation
  const renderContent = () => {
    switch (currentPage) {
      case 'dashboard':
        return (
          <DashboardPage 
            onNavigate={handleNavigate}
            onNavigateToDocuments={() => handleNavigate('documents')} 
          />
        );
      case 'company_settings':
        return (
          <CompanySettingsPage 
            currentUser={currentUser}
            onCompanyDeleted={handleCompanyDeleted}
            onUserDeleted={handleLogout}
          />
        );
      case 'documents':
        return <DocumentsPage />;
      case 'accounting_workspace':
      case 'transactions':
        return <TransactionsPage initialTab="overview" onNavigate={handleNavigate} />;
      case 'books':
        return <TransactionsPage initialTab="books" onNavigate={handleNavigate} />;
      case 'chart_of_accounts':
      case 'accounts':
        return <TransactionsPage initialTab="accounts" onNavigate={handleNavigate} />;
      case 'opening_balances':
        return <TransactionsPage initialTab="opening_balances" onNavigate={handleNavigate} />;
      case 'receivables':
        return <TransactionsPage initialTab="receivables" onNavigate={handleNavigate} />;
      case 'payables':
        return <TransactionsPage initialTab="payables" onNavigate={handleNavigate} />;
      case 'other_creditors':
        return <TransactionsPage initialTab="other_creditors" onNavigate={handleNavigate} />;
      case 'inventory':
        return <TransactionsPage initialTab="inventory" onNavigate={handleNavigate} />;
      case 'accruals_prepayments':
        return <TransactionsPage initialTab="accruals_prepayments" onNavigate={handleNavigate} />;
      case 'journals':
        return <JournalsPage />;
      case 'daily_ledger':
        return <DailyLedgerPage />;
      case 'settings':
        return <SettingsPage />;
      case 'general_ledger':
        return <GeneralLedgerPage />;
      case 'trial_balance':
        return <TrialBalancePage />;
      case 'reports':
        return <ReportsPage />;
      default:
        return <DashboardPage onNavigate={handleNavigate} onNavigateToDocuments={() => handleNavigate('documents')} />;
    }
  };

  return (
    <div className="app-container">
      <Sidebar 
        currentPage={currentPage} 
        setCurrentPage={handleNavigate} 
      />
      <div className="main-content">
        <Navbar 
          onOpenUpload={() => handleNavigate('documents')} 
          onNavigateToCompanySettings={() => handleNavigate('company_settings')}
          currentUser={currentUser}
          onLogout={handleLogout}
        />
        {renderContent()}
      </div>
    </div>
  );
}
