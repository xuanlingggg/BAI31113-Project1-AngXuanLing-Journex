import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  ChevronDown,
  FileText,
  Scale,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Printer,
  Layers,
  Eye,
  EyeOff,
  Building2,
  TrendingUp,
  Landmark,
  Download,
  ArrowRight,
  BookOpen
} from 'lucide-react';

export default function ReportsPage() {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // View controls
  const [activeTab, setActiveTab] = useState('SOPL'); // 'SOPL' | 'SOFP' | 'BOTH'
  const [showAccountDetails, setShowAccountDetails] = useState(true);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [activeCompanyId, setActiveCompanyId] = useState(() => localStorage.getItem('active_company_id') || '');

  useEffect(() => {
    const handleCompanyUpdate = () => {
      const cid = localStorage.getItem('active_company_id') || '';
      setActiveCompanyId(cid);
    };
    window.addEventListener('company-updated', handleCompanyUpdate);
    return () => window.removeEventListener('company-updated', handleCompanyUpdate);
  }, []);

  const handleExportPDF = (mode = null) => {
    const target = mode || (activeTab === 'BOTH' ? 'BOTH' : activeTab);
    const originalTitle = document.title;
    const cleanCompany = (company.company_name || 'Company').replace(/[^a-zA-Z0-9_-]/g, '_');

    if (target === 'BOTH' && activeTab !== 'BOTH') {
      setActiveTab('BOTH');
      setTimeout(() => {
        document.title = `${cleanCompany}_Financial_Statements_${reportingDate}`;
        window.print();
        setTimeout(() => {
          document.title = originalTitle;
        }, 1500);
      }, 150);
      return;
    }

    const titleSuffix = target === 'SOPL'
      ? 'Statement_of_Profit_or_Loss'
      : target === 'SOFP'
      ? 'Statement_of_Financial_Position'
      : 'Full_Financial_Statements';

    document.title = `${cleanCompany}_${titleSuffix}_${reportingDate}`;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1500);
  };

  const fetchReports = async (compId = activeCompanyId) => {
    setLoading(true);
    setError(null);
    try {
      const cid = (typeof compId === 'string' && compId) ? compId : (localStorage.getItem('active_company_id') || '');
      const url = cid ? `/api/ledger/mfrs_reports?company_id=${encodeURIComponent(cid)}` : '/api/ledger/mfrs_reports';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load financial reports (${res.status})`);
      const data = await res.json();
      setReportData(data);
    } catch (err) {
      console.error('Error loading financial reports:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports(activeCompanyId);
  }, [activeCompanyId]);

  const fmt = (val) => {
    const num = Number(val || 0);
    return Math.abs(num).toLocaleString('en-MY', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const fmtSigned = (val, forceParentheses = false) => {
    const num = Number(val || 0);
    if (forceParentheses || num < -0.004) {
      return `(${fmt(num)})`;
    }
    return fmt(num);
  };

  if (loading) {
    return (
      <div className="page-container" style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <RefreshCw size={28} className="spin" style={{ margin: '2rem auto 0.75rem auto', color: 'var(--primary-color)' }} />
        <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>Loading financial statements from General Ledger...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container" style={{ padding: '2rem' }}>
        <div style={{
          backgroundColor: 'var(--status-error-bg)',
          color: 'var(--status-error-text)',
          padding: '1.25rem 1.5rem',
          borderRadius: '8px',
          border: '1px solid rgba(185, 28, 28, 0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <AlertTriangle size={20} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Unable to load financial statements</div>
            <div style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>{error}</div>
          </div>
          <button onClick={fetchReports} className="btn btn-secondary btn-sm">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const company = reportData?.company || {};
  const meta = reportData?.reporting_metadata || {};
  const sopl = reportData?.statement_of_profit_or_loss?.mfrs101 || {};
  const sofp = reportData?.statement_of_financial_position?.mfrs101 || {};
  const ratios = reportData?.financial_ratios || {};

  const currency = meta.currency || 'MYR';
  const companyName = company.company_name || 'Handbag Solutions Sdn Bhd';
  const regNo = company.registration_number || '';
  const reportingDate = meta.reporting_date || new Date().toISOString().slice(0, 10);
  const financialYear = meta.financial_year || 2026;

  // SOPL Data
  const revSec = sopl.revenue_section || {};
  const cogsSec = sopl.cost_of_sales_section || {};
  const otherIncSec = sopl.other_operating_income_section || {};
  const opExpFunc = sopl.operating_expenses_by_function || {};
  const opExpNat = sopl.operating_expenses_by_nature || {};
  const finSec = sopl.finance_costs_section || {};
  const taxSec = sopl.taxation_section || {};

  const netRevenue = revSec.net_revenue || 0;
  const totalCogs = cogsSec.total_cost_of_sales || 0;
  const grossProfit = sopl.gross_profit || 0;
  const totalOtherIncome = otherIncSec.total_other_operating_income || 0;
  const totalOpExpenses = opExpFunc.total_operating_expenses || 0;
  const operatingProfit = sopl.operating_profit || 0;
  const totalFinanceCosts = finSec.total_finance_costs || 0;
  const profitBeforeTax = sopl.profit_before_tax || 0;
  const totalTaxation = taxSec.total_taxation || 0;
  const profitForPeriod = sopl.profit_for_period || 0;

  // SOFP Data
  const nca = sofp.non_current_assets || {};
  const ppe = nca.property_plant_equipment || {};
  const intangibles = nca.intangible_assets || {};
  const ca = sofp.current_assets || {};
  const inv = ca.inventories || {};
  const rec = ca.trade_and_other_receivables || {};
  const cash = ca.cash_and_cash_equivalents || {};

  const eq = sofp.equity_section || {};
  const shareCap = eq.share_capital || {};
  const reserves = eq.reserves || {};
  const retEarn = eq.retained_earnings || {};

  const ncl = sofp.non_current_liabilities || {};
  const borrowings = ncl.borrowings_and_hp || {};
  const cl = sofp.current_liabilities || {};
  const payables = cl.trade_and_other_payables || {};
  const taxLiab = cl.current_tax_liabilities || {};

  const totalAssets = sofp.total_assets || 0;
  const totalEquity = eq.total_equity || 0;
  const totalLiabilities = sofp.total_liabilities || 0;
  const totalEqAndLiab = sofp.total_equity_and_liabilities || 0;
  const isBalanced = sofp.is_balanced !== false;

  // Helper to render nested account rows when "Show GL Account Breakdown" is active
  const renderSubAccounts = (items, negateDisplay = false) => {
    if (!showAccountDetails || !items || items.length === 0) return null;
    return items.map((acc, idx) => {
      const val = Number(acc.balance || 0);
      const isDed = acc.is_deduction || (negateDisplay && val > 0) || val < 0;
      return (
        <tr key={`${acc.account_code}-${idx}`} style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', borderBottom: '1px dashed rgba(148, 163, 184, 0.15)' }}>
          <td style={{ padding: '0.35rem 1rem 0.35rem 2.5rem' }}>
            <span style={{ 
              fontFamily: 'var(--font-mono)', 
              fontSize: '0.78rem', 
              color: 'var(--primary-color)', 
              marginRight: '0.5rem',
              backgroundColor: 'var(--badge-doc-bg)',
              padding: '0.1rem 0.35rem',
              borderRadius: '4px',
              border: '1px solid rgba(37, 99, 235, 0.15)'
            }}>
              {acc.account_code}
            </span>
            {acc.account_name}
          </td>
          <td style={{ padding: '0.35rem 1rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            GL
          </td>
          <td style={{ padding: '0.35rem 1rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
            {isDed ? `(${fmt(val)})` : fmt(val)}
          </td>
          <td style={{ padding: '0.35rem 1.25rem', textAlign: 'right' }}></td>
        </tr>
      );
    });
  };

  return (
    <div className="page-container" style={{ padding: '1.5rem 2rem', maxWidth: '1240px', margin: '0 auto' }}>
      {/* Top Page Header */}
      <div className="no-print" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start', 
        flexWrap: 'wrap', 
        gap: '1rem', 
        marginBottom: '1.5rem' 
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              backgroundColor: 'var(--badge-doc-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary-color)',
              border: '1px solid rgba(37, 99, 235, 0.2)'
            }}>
              <BarChart3 size={20} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Financial Statements
              </h1>
            </div>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.45rem', marginBottom: 0, maxWidth: '780px', lineHeight: '1.5' }}>
            Generate and view financial statements based on posted accounting transactions, including the Statement of Profit or Loss and Statement of Financial Position.
          </p>
        </div>

        {/* Global Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowAccountDetails(!showAccountDetails)}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', height: '36px' }}
            title="Toggle underlying General Ledger account code rows"
          >
            {showAccountDetails ? <EyeOff size={15} /> : <Eye size={15} />}
            <span>{showAccountDetails ? 'Condensed View' : 'Show Account Breakdown'}</span>
          </button>

          {/* Export PDF with Dropdown Options */}
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden' }}>
              <button
                onClick={() => handleExportPDF()}
                className="btn btn-secondary btn-sm"
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.4rem', 
                  fontSize: '0.82rem', 
                  height: '36px',
                  borderTopRightRadius: 0, 
                  borderBottomRightRadius: 0 
                }}
                title="Export financial statement as PDF"
              >
                <Printer size={15} />
                <span>Export PDF</span>
              </button>
              <button
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                className="btn btn-secondary btn-sm"
                style={{ 
                  padding: '0 0.5rem', 
                  height: '36px',
                  borderLeft: '1px solid var(--border-color)', 
                  borderTopLeftRadius: 0, 
                  borderBottomLeftRadius: 0,
                  display: 'flex',
                  alignItems: 'center'
                }}
                title="PDF Export Options"
              >
                <ChevronDown size={14} />
              </button>
            </div>

            {exportMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: '0.35rem',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
                  minWidth: '260px',
                  zIndex: 50,
                  overflow: 'hidden'
                }}
              >
                <button
                  onClick={() => { setExportMenuOpen(false); handleExportPDF('CURRENT'); }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.75rem 0.9rem',
                    background: 'none',
                    border: 'none',
                    fontSize: '0.82rem',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    borderBottom: '1px solid var(--border-color)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-surface)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <FileText size={16} style={{ color: 'var(--primary-color)' }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Export Current Statement</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      {activeTab === 'SOPL' ? 'Statement of Profit or Loss' : activeTab === 'SOFP' ? 'Statement of Financial Position' : 'Side-by-Side View'}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => { setExportMenuOpen(false); handleExportPDF('BOTH'); }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.75rem 0.9rem',
                    background: 'none',
                    border: 'none',
                    fontSize: '0.82rem',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-surface)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Layers size={16} style={{ color: 'var(--status-success-text)' }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Export Full Statements Package</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      P&L + Balance Sheet (with page breaks)
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={fetchReports}
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', height: '36px' }}
          >
            <RefreshCw size={15} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Report Directory / Navigation Cards */}
      <div className="no-print" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        {/* Card 1: Statement of Profit or Loss */}
        <div
          onClick={() => setActiveTab('SOPL')}
          className="card"
          style={{
            padding: '1.25rem',
            marginBottom: 0,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            border: activeTab === 'SOPL' ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
            backgroundColor: activeTab === 'SOPL' ? 'rgba(37, 99, 235, 0.03)' : 'var(--bg-secondary)',
            borderRadius: '8px',
            position: 'relative'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: 'rgba(37, 99, 235, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary-color)'
            }}>
              <TrendingUp size={18} />
            </div>
            {activeTab === 'SOPL' && (
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '0.15rem 0.5rem',
                borderRadius: '4px',
                backgroundColor: 'var(--primary-color)',
                color: '#fff'
              }}>
                Active View
              </span>
            )}
          </div>
          <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            Statement of Profit or Loss
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 0.85rem 0', lineHeight: '1.4' }}>
            Revenue, cost of sales, operating expenses, and net profit or loss for the reporting period.
          </p>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            paddingTop: '0.6rem', 
            borderTop: '1px solid var(--border-color)',
            fontSize: '0.78rem' 
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>Net Profit / (Loss):</span>
            <span style={{ 
              fontWeight: 700, 
              fontFamily: 'var(--font-mono)', 
              color: profitForPeriod >= 0 ? 'var(--status-success-text)' : 'var(--status-error-text)' 
            }}>
              {currency} {fmtSigned(profitForPeriod)}
            </span>
          </div>
        </div>

        {/* Card 2: Statement of Financial Position */}
        <div
          onClick={() => setActiveTab('SOFP')}
          className="card"
          style={{
            padding: '1.25rem',
            marginBottom: 0,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            border: activeTab === 'SOFP' ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
            backgroundColor: activeTab === 'SOFP' ? 'rgba(37, 99, 235, 0.03)' : 'var(--bg-secondary)',
            borderRadius: '8px',
            position: 'relative'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: 'rgba(21, 128, 61, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--status-success-text)'
            }}>
              <Landmark size={18} />
            </div>
            {activeTab === 'SOFP' && (
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '0.15rem 0.5rem',
                borderRadius: '4px',
                backgroundColor: 'var(--primary-color)',
                color: '#fff'
              }}>
                Active View
              </span>
            )}
          </div>
          <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            Statement of Financial Position
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 0.85rem 0', lineHeight: '1.4' }}>
            Non-current and current assets, liabilities, and owners' equity balances as at reporting date.
          </p>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            paddingTop: '0.6rem', 
            borderTop: '1px solid var(--border-color)',
            fontSize: '0.78rem' 
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>Total Assets:</span>
            <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              {currency} {fmt(totalAssets)}
            </span>
          </div>
        </div>

        {/* Card 3: Combined Financial Statements Package */}
        <div
          onClick={() => setActiveTab('BOTH')}
          className="card"
          style={{
            padding: '1.25rem',
            marginBottom: 0,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            border: activeTab === 'BOTH' ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
            backgroundColor: activeTab === 'BOTH' ? 'rgba(37, 99, 235, 0.03)' : 'var(--bg-secondary)',
            borderRadius: '8px',
            position: 'relative'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: 'rgba(124, 58, 237, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--status-review-text)'
            }}>
              <Layers size={18} />
            </div>
            {activeTab === 'BOTH' && (
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '0.15rem 0.5rem',
                borderRadius: '4px',
                backgroundColor: 'var(--primary-color)',
                color: '#fff'
              }}>
                Active View
              </span>
            )}
          </div>
          <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            Full Financial Package
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 0.85rem 0', lineHeight: '1.4' }}>
            Comprehensive combined report with Statement of Profit or Loss and Balance Sheet.
          </p>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            paddingTop: '0.6rem', 
            borderTop: '1px solid var(--border-color)',
            fontSize: '0.78rem' 
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
            <span style={{ 
              fontWeight: 700, 
              color: isBalanced ? 'var(--status-success-text)' : 'var(--status-error-text)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}>
              <CheckCircle2 size={13} />
              Balanced
            </span>
          </div>
        </div>
      </div>

      {/* Executive Financial Highlights Strip */}
      <div className="no-print" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: 0 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Net Revenue
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem', fontFamily: 'var(--font-mono)' }}>
            {currency} {fmt(netRevenue)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Gross Margin: <strong>{ratios.gross_profit_margin_pct ?? 0}%</strong>
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: 0 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Profit / (Loss) for Period
          </div>
          <div style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: profitForPeriod >= 0 ? 'var(--status-success-text)' : 'var(--status-error-text)',
            marginTop: '0.25rem',
            fontFamily: 'var(--font-mono)'
          }}>
            {currency} {fmtSigned(profitForPeriod)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Net Margin: <strong>{ratios.net_profit_margin_pct ?? 0}%</strong>
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: 0 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Total Assets
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary-color)', marginTop: '0.25rem', fontFamily: 'var(--font-mono)' }}>
            {currency} {fmt(totalAssets)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Working Capital: <strong>{currency} {fmtSigned(ratios.working_capital)}</strong>
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: 0 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Total Equity & Liabilities
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--status-success-text)', marginTop: '0.25rem', fontFamily: 'var(--font-mono)' }}>
            {currency} {fmt(totalEqAndLiab)}
          </div>
          {!isBalanced && (
            <div style={{ fontSize: '0.75rem', color: 'var(--status-error-text)', marginTop: '0.2rem', fontWeight: 600 }}>
              Discrepancy Detected
            </div>
          )}
        </div>
      </div>



      {/* ===================================================================
          1. STATEMENT OF PROFIT OR LOSS
         =================================================================== */}
      {(activeTab === 'SOPL' || activeTab === 'BOTH') && (
        <div className={`card mfrs-report-card ${activeTab === 'BOTH' ? 'mfrs-page-break' : ''}`} style={{ padding: '0', overflow: 'hidden', marginBottom: '2rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          {/* Statutory Identification Header */}
          <div className="mfrs-report-header" style={{
            padding: '1.75rem 2rem 1.5rem 2rem',
            backgroundColor: 'var(--bg-primary)',
            borderBottom: '2px solid var(--border-color)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
              {companyName}
            </div>
            {regNo && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                (Company No. {regNo})
              </div>
            )}
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary-color)', marginTop: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Statement of Profit or Loss
            </div>
            <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              For the financial period ended <strong>{reportingDate}</strong> (Financial Year {financialYear})
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              (All amounts expressed in Malaysian Ringgit — MYR)
            </div>
          </div>

          {/* Statement Table */}
          <div className="mfrs-table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="mfrs-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontWeight: 700 }}>Line Item Description</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, width: '90px' }}>Note</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, width: '165px' }}>Sub-detail ({currency})</th>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'right', fontWeight: 700, width: '175px' }}>Total ({currency})</th>
                </tr>
              </thead>
              <tbody>
                {/* REVENUE SECTION */}
                <tr style={{ fontWeight: 700, color: 'var(--text-primary)', backgroundColor: 'rgba(37, 99, 235, 0.03)' }}>
                  <td style={{ padding: '0.7rem 1.5rem' }}>Revenue</td>
                  <td style={{ padding: '0.7rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>1</td>
                  <td style={{ padding: '0.7rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.7rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(netRevenue)}
                  </td>
                </tr>
                {renderSubAccounts(revSec.gross_sales)}
                {renderSubAccounts(revSec.sales_adjustments)}

                {/* COST OF SALES SECTION */}
                <tr style={{ fontWeight: 600, color: 'var(--text-primary)', borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.7rem 1.5rem' }}>Cost of Sales</td>
                  <td style={{ padding: '0.7rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>2</td>
                  <td style={{ padding: '0.7rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.7rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {totalCogs !== 0 ? `(${fmt(totalCogs)})` : '0.00'}
                  </td>
                </tr>
                {renderSubAccounts(cogsSec.items, true)}

                {/* GROSS PROFIT SUBTOTAL */}
                <tr className="mfrs-subtotal-row" style={{
                  fontWeight: 700,
                  backgroundColor: 'var(--bg-primary)',
                  borderTop: '1.5px solid var(--border-color)',
                  borderBottom: '1.5px solid var(--border-color)',
                  color: grossProfit >= 0 ? 'var(--status-success-text)' : 'var(--status-error-text)'
                }}>
                  <td style={{ padding: '0.75rem 1.5rem' }}>GROSS PROFIT</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}></td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.75rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.95rem' }}>
                    {fmtSigned(grossProfit)}
                  </td>
                </tr>

                {/* OTHER OPERATING INCOME */}
                <tr style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  <td style={{ padding: '0.7rem 1.5rem' }}>Other Operating Income</td>
                  <td style={{ padding: '0.7rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>3</td>
                  <td style={{ padding: '0.7rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.7rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(totalOtherIncome)}
                  </td>
                </tr>
                {renderSubAccounts(otherIncSec.items)}

                {/* OPERATING EXPENSES (BY FUNCTION) */}
                <tr style={{ fontWeight: 600, color: 'var(--text-primary)', borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.7rem 1.5rem' }}>Selling and Distribution Expenses</td>
                  <td style={{ padding: '0.7rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>4a</td>
                  <td style={{ padding: '0.7rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.7rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {opExpFunc.total_selling_and_distribution ? `(${fmt(opExpFunc.total_selling_and_distribution)})` : '0.00'}
                  </td>
                </tr>
                {renderSubAccounts(opExpFunc.selling_and_distribution, true)}

                <tr style={{ fontWeight: 600, color: 'var(--text-primary)', borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.7rem 1.5rem' }}>Administrative and Other Operating Expenses</td>
                  <td style={{ padding: '0.7rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>4b</td>
                  <td style={{ padding: '0.7rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.7rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {opExpFunc.total_administrative_and_other ? `(${fmt(opExpFunc.total_administrative_and_other)})` : '0.00'}
                  </td>
                </tr>
                {renderSubAccounts(opExpFunc.administrative_and_other, true)}

                {/* PROFIT FROM OPERATIONS */}
                <tr className="mfrs-subtotal-row" style={{
                  fontWeight: 700,
                  backgroundColor: 'var(--bg-primary)',
                  borderTop: '1.5px solid var(--border-color)',
                  borderBottom: '1px solid var(--border-color)',
                  color: 'var(--text-primary)'
                }}>
                  <td style={{ padding: '0.75rem 1.5rem' }}>PROFIT / (LOSS) FROM OPERATIONS</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}></td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.75rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(operatingProfit)}
                  </td>
                </tr>

                {/* FINANCE COSTS */}
                <tr style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  <td style={{ padding: '0.7rem 1.5rem' }}>Finance Costs</td>
                  <td style={{ padding: '0.7rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>5</td>
                  <td style={{ padding: '0.7rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.7rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {totalFinanceCosts ? `(${fmt(totalFinanceCosts)})` : '0.00'}
                  </td>
                </tr>
                {renderSubAccounts(finSec.items, true)}

                {/* PROFIT BEFORE TAX */}
                <tr className="mfrs-subtotal-row" style={{
                  fontWeight: 700,
                  backgroundColor: 'var(--bg-primary)',
                  borderTop: '1.5px solid var(--border-color)',
                  borderBottom: '1.5px solid var(--border-color)',
                  color: 'var(--text-primary)'
                }}>
                  <td style={{ padding: '0.75rem 1.5rem' }}>PROFIT / (LOSS) BEFORE TAX</td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}></td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.75rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(profitBeforeTax)}
                  </td>
                </tr>

                {/* INCOME TAX EXPENSE */}
                <tr style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  <td style={{ padding: '0.7rem 1.5rem' }}>Income Tax Expense</td>
                  <td style={{ padding: '0.7rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>6</td>
                  <td style={{ padding: '0.7rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.7rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {totalTaxation ? `(${fmt(totalTaxation)})` : '0.00'}
                  </td>
                </tr>
                {renderSubAccounts(taxSec.items, true)}

                {/* PROFIT FOR THE PERIOD (DOUBLE UNDERLINE) */}
                <tr className="mfrs-grandtotal-row" style={{
                  fontWeight: 800,
                  fontSize: '0.98rem',
                  backgroundColor: profitForPeriod >= 0 ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
                  color: profitForPeriod >= 0 ? 'var(--status-success-text)' : 'var(--status-error-text)',
                  borderTop: '2px solid var(--text-primary)',
                  borderBottom: '4px double var(--text-primary)'
                }}>
                  <td style={{ padding: '0.9rem 1.5rem' }}>
                    PROFIT / (LOSS) FOR THE FINANCIAL PERIOD
                  </td>
                  <td style={{ padding: '0.9rem 1rem', textAlign: 'center' }}></td>
                  <td style={{ padding: '0.9rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.9rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {currency} {fmtSigned(profitForPeriod)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================
          2. STATEMENT OF FINANCIAL POSITION
         =================================================================== */}
      {(activeTab === 'SOFP' || activeTab === 'BOTH') && (
        <div className="card mfrs-report-card" style={{ padding: '0', overflow: 'hidden', marginBottom: '2rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          {/* Statutory Identification Header */}
          <div className="mfrs-report-header" style={{
            padding: '1.75rem 2rem 1.5rem 2rem',
            backgroundColor: 'var(--bg-primary)',
            borderBottom: '2px solid var(--border-color)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
              {companyName}
            </div>
            {regNo && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                (Company No. {regNo})
              </div>
            )}
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary-color)', marginTop: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Statement of Financial Position
            </div>
            <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              As at <strong>{reportingDate}</strong> (Financial Year {financialYear})
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              (All amounts expressed in Malaysian Ringgit — MYR)
            </div>
          </div>

          <div className="mfrs-table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="mfrs-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontWeight: 700 }}>Assets, Equity and Liabilities</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, width: '90px' }}>Note</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, width: '165px' }}>Sub-detail ({currency})</th>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'right', fontWeight: 700, width: '175px' }}>Carrying Amount ({currency})</th>
                </tr>
              </thead>
              <tbody>
                {/* ================= ASSETS HEADER ================= */}
                <tr className="mfrs-section-header" style={{ backgroundColor: 'rgba(37, 99, 235, 0.06)', fontWeight: 800, color: 'var(--primary-color)' }}>
                  <td colSpan={4} style={{ padding: '0.65rem 1.5rem', letterSpacing: '0.04em' }}>
                    ASSETS
                  </td>
                </tr>

                {/* NON-CURRENT ASSETS */}
                <tr style={{ fontWeight: 700, color: 'var(--text-primary)', backgroundColor: 'var(--bg-primary)' }}>
                  <td colSpan={4} style={{ padding: '0.55rem 1.5rem' }}>
                    Non-Current Assets
                  </td>
                </tr>
                <tr style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  <td style={{ padding: '0.6rem 1.5rem' }}>Property, Plant and Equipment</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>7</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.6rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(ppe.net_carrying_amount)}
                  </td>
                </tr>
                {renderSubAccounts(ppe.cost_items)}
                {renderSubAccounts(ppe.accum_depr_items)}

                <tr style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  <td style={{ padding: '0.6rem 1.5rem' }}>Intangible Assets (Goodwill)</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>8</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.6rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(intangibles.total)}
                  </td>
                </tr>
                {renderSubAccounts(intangibles.items)}

                <tr style={{ fontWeight: 700, color: 'var(--text-primary)', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.6rem 1.5rem' }}>Total Non-Current Assets</td>
                  <td style={{ padding: '0.6rem 1rem' }}></td>
                  <td style={{ padding: '0.6rem 1rem' }}></td>
                  <td style={{ padding: '0.6rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(nca.total_non_current_assets)}
                  </td>
                </tr>

                {/* CURRENT ASSETS */}
                <tr style={{ fontWeight: 700, color: 'var(--text-primary)', backgroundColor: 'var(--bg-primary)' }}>
                  <td colSpan={4} style={{ padding: '0.55rem 1.5rem' }}>
                    Current Assets
                  </td>
                </tr>
                <tr style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  <td style={{ padding: '0.6rem 1.5rem' }}>Inventories</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>9</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.6rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(inv.total)}
                  </td>
                </tr>
                {renderSubAccounts(inv.items)}

                <tr style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  <td style={{ padding: '0.6rem 1.5rem' }}>Trade and Other Receivables</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>10</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.6rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(rec.total)}
                  </td>
                </tr>
                {renderSubAccounts(rec.items)}

                <tr style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  <td style={{ padding: '0.6rem 1.5rem' }}>Cash and Cash Equivalents</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>11</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.6rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(cash.total)}
                  </td>
                </tr>
                {renderSubAccounts(cash.items)}

                <tr style={{ fontWeight: 700, color: 'var(--text-primary)', borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.6rem 1.5rem' }}>Total Current Assets</td>
                  <td style={{ padding: '0.6rem 1rem' }}></td>
                  <td style={{ padding: '0.6rem 1rem' }}></td>
                  <td style={{ padding: '0.6rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(ca.total_current_assets)}
                  </td>
                </tr>

                {/* TOTAL ASSETS */}
                <tr className="mfrs-grandtotal-row" style={{
                  fontWeight: 800,
                  fontSize: '0.98rem',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--primary-color)',
                  borderTop: '2px solid var(--text-primary)',
                  borderBottom: '4px double var(--text-primary)'
                }}>
                  <td style={{ padding: '0.85rem 1.5rem' }}>TOTAL ASSETS</td>
                  <td style={{ padding: '0.85rem 1rem' }}></td>
                  <td style={{ padding: '0.85rem 1rem' }}></td>
                  <td style={{ padding: '0.85rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {currency} {fmtSigned(totalAssets)}
                  </td>
                </tr>

                {/* ================= EQUITY AND LIABILITIES HEADER ================= */}
                <tr className="mfrs-section-header" style={{ backgroundColor: 'rgba(37, 99, 235, 0.06)', fontWeight: 800, color: 'var(--primary-color)' }}>
                  <td colSpan={4} style={{ padding: '0.65rem 1.5rem', letterSpacing: '0.04em' }}>
                    EQUITY AND LIABILITIES
                  </td>
                </tr>

                {/* EQUITY */}
                <tr style={{ fontWeight: 700, color: 'var(--text-primary)', backgroundColor: 'var(--bg-primary)' }}>
                  <td colSpan={4} style={{ padding: '0.55rem 1.5rem' }}>
                    Equity Attributable to Owners of the Company
                  </td>
                </tr>
                <tr style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  <td style={{ padding: '0.6rem 1.5rem' }}>Share Capital / Issued Capital</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>12</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.6rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(shareCap.total)}
                  </td>
                </tr>
                {renderSubAccounts(shareCap.items)}

                <tr style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  <td style={{ padding: '0.6rem 1.5rem' }}>Reserves</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>13</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.6rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(reserves.total)}
                  </td>
                </tr>
                {renderSubAccounts(reserves.items)}

                <tr style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  <td style={{ padding: '0.6rem 1.5rem' }}>Retained Earnings</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>14</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.6rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(retEarn.total)}
                  </td>
                </tr>
                {renderSubAccounts(retEarn.items)}

                <tr style={{ fontWeight: 700, color: 'var(--text-primary)', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.65rem 1.5rem' }}>Total Equity</td>
                  <td style={{ padding: '0.65rem 1rem' }}></td>
                  <td style={{ padding: '0.65rem 1rem' }}></td>
                  <td style={{ padding: '0.65rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(totalEquity)}
                  </td>
                </tr>

                {/* NON-CURRENT LIABILITIES */}
                <tr style={{ fontWeight: 700, color: 'var(--text-primary)', backgroundColor: 'var(--bg-primary)' }}>
                  <td colSpan={4} style={{ padding: '0.55rem 1.5rem' }}>
                    Non-Current Liabilities
                  </td>
                </tr>
                <tr style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  <td style={{ padding: '0.6rem 1.5rem' }}>Borrowings and Hire Purchase Payables</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>15</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.6rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(borrowings.total)}
                  </td>
                </tr>
                {renderSubAccounts(borrowings.items)}

                <tr style={{ fontWeight: 700, color: 'var(--text-primary)', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.6rem 1.5rem' }}>Total Non-Current Liabilities</td>
                  <td style={{ padding: '0.6rem 1rem' }}></td>
                  <td style={{ padding: '0.6rem 1rem' }}></td>
                  <td style={{ padding: '0.6rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(ncl.total_non_current_liabilities)}
                  </td>
                </tr>

                {/* CURRENT LIABILITIES */}
                <tr style={{ fontWeight: 700, color: 'var(--text-primary)', backgroundColor: 'var(--bg-primary)' }}>
                  <td colSpan={4} style={{ padding: '0.55rem 1.5rem' }}>
                    Current Liabilities
                  </td>
                </tr>
                <tr style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  <td style={{ padding: '0.6rem 1.5rem' }}>Trade and Other Payables</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>16</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.6rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(payables.total)}
                  </td>
                </tr>
                {renderSubAccounts(payables.items)}

                <tr style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  <td style={{ padding: '0.6rem 1.5rem' }}>Current Tax Liabilities (SST / Tax Payable)</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>17</td>
                  <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}></td>
                  <td style={{ padding: '0.6rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(taxLiab.total)}
                  </td>
                </tr>
                {renderSubAccounts(taxLiab.items)}

                <tr style={{ fontWeight: 700, color: 'var(--text-primary)', borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.6rem 1.5rem' }}>Total Current Liabilities</td>
                  <td style={{ padding: '0.6rem 1rem' }}></td>
                  <td style={{ padding: '0.6rem 1rem' }}></td>
                  <td style={{ padding: '0.6rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(cl.total_current_liabilities)}
                  </td>
                </tr>

                <tr style={{ fontWeight: 700, color: 'var(--text-primary)', backgroundColor: 'var(--bg-primary)', borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.65rem 1.5rem' }}>Total Liabilities</td>
                  <td style={{ padding: '0.65rem 1rem' }}></td>
                  <td style={{ padding: '0.65rem 1rem' }}></td>
                  <td style={{ padding: '0.65rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {fmtSigned(totalLiabilities)}
                  </td>
                </tr>

                {/* TOTAL EQUITY AND LIABILITIES (DOUBLE UNDERLINE) */}
                <tr className="mfrs-grandtotal-row" style={{
                  fontWeight: 800,
                  fontSize: '0.98rem',
                  backgroundColor: isBalanced ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
                  color: isBalanced ? 'var(--status-success-text)' : 'var(--status-error-text)',
                  borderTop: '2px solid var(--text-primary)',
                  borderBottom: '4px double var(--text-primary)'
                }}>
                  <td style={{ padding: '0.85rem 1.5rem' }}>TOTAL EQUITY AND LIABILITIES</td>
                  <td style={{ padding: '0.85rem 1rem' }}></td>
                  <td style={{ padding: '0.85rem 1rem' }}></td>
                  <td style={{ padding: '0.85rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {currency} {fmtSigned(totalEqAndLiab)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>


        </div>
      )}
    </div>
  );
}
