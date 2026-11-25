import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  TrendingUp, 
  TrendingDown, 
  ArrowRight, 
  FileText, 
  BookOpen, 
  Layers, 
  Scale, 
  BarChart3, 
  RefreshCw, 
  Trash2, 
  AlertTriangle,
  Info,
  DollarSign,
  PieChart,
  Activity,
  Receipt,
  Building2
} from 'lucide-react';

export default function DashboardPage({ onNavigate, onNavigateToDocuments }) {
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState(null);
  const [activeCompanyId, setActiveCompanyId] = useState(() => localStorage.getItem('active_company_id') || '');
  
  // Financial State
  const [plData, setPlData] = useState(null);
  const [bsData, setBsData] = useState(null);
  const [tbData, setTbData] = useState(null);
  
  // Operational State
  const [journals, setJournals] = useState([]);
  const [documents, setDocuments] = useState([]);
  

  useEffect(() => {
    const handleCompanyUpdate = () => {
      const cid = localStorage.getItem('active_company_id') || '';
      setActiveCompanyId(cid);
    };
    window.addEventListener('company-updated', handleCompanyUpdate);
    return () => window.removeEventListener('company-updated', handleCompanyUpdate);
  }, []);

  const fetchDashboardData = async (compId = activeCompanyId) => {
    setLoading(true);
    try {
      const cid = (typeof compId === 'string' && compId) ? compId : (localStorage.getItem('active_company_id') || '');
      const qs = cid ? `?company_id=${encodeURIComponent(cid)}` : '';
      const [compRes, plRes, bsRes, tbRes, jRes, docRes] = await Promise.allSettled([
        fetch(`/api/company/profile${qs}`).then(r => r.json()),
        fetch(`/api/ledger/profit_loss${qs}`).then(r => r.json()),
        fetch(`/api/ledger/balance_sheet${qs}`).then(r => r.json()),
        fetch(`/api/ledger/${qs}`).then(r => r.json()),
        fetch(`/api/journals/${qs}`).then(r => r.json()),
        fetch(`/api/documents/${qs}`).then(r => r.json())
      ]);

      if (compRes.status === 'fulfilled' && compRes.value) {
        setCompany(compRes.value);
      }
      if (plRes.status === 'fulfilled') setPlData(plRes.value);
      if (bsRes.status === 'fulfilled') setBsData(bsRes.value);
      if (tbRes.status === 'fulfilled') setTbData(tbRes.value);
      if (jRes.status === 'fulfilled') setJournals(jRes.value.journals || []);
      if (docRes.status === 'fulfilled') setDocuments(docRes.value.documents || []);

    } catch (err) {
      console.error('Error fetching dashboard metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData(activeCompanyId);
  }, [activeCompanyId]);


  const formatAmount = (val) => {
    const num = parseFloat(val || 0);
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Metrics computation
  const totalRev = plData?.total_revenue || 0;
  const totalCogs = plData?.total_cogs || 0;
  const totalExp = plData?.total_expenses || 0;
  const netProfit = plData?.net_profit || 0;
  const totalAssets = bsData?.total_assets || 0;
  const isBsBalanced = bsData?.is_balanced !== false;
  const isTbBalanced = tbData?.trial_balance?.is_balanced !== false;

  // Journal statuses
  const postedJournals = journals.filter(j => j.status === 'POSTED');
  const pendingJournals = journals.filter(j => j.status === 'PENDING_AUDIT');
  const flaggedJournals = journals.filter(j => j.status === 'HUMAN_REVIEW');
  const totalJournalsCount = journals.length;

  // Document types breakdown
  const docTypeCounts = documents.reduce((acc, d) => {
    const t = d.document_type || 'Other';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  // Profit Margin calculation
  const profitMargin = totalRev > 0 ? ((netProfit / totalRev) * 100).toFixed(1) : 0;

  return (
    <div className="page-container">
      
      {/* Top Welcome & Navigation Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Accounting Dashboard
            </h1>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
            Financial overview, accounting activities and processing status.
          </p>
        </div>

        {/* Global Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.4rem', 
            fontSize: '0.8rem', 
            backgroundColor: 'var(--bg-secondary)', 
            padding: '0.4rem 0.8rem', 
            borderRadius: '6px', 
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)'
          }}>
            <Building2 size={14} style={{ color: 'var(--color-primary)' }} />
            <span>Company: <strong style={{ color: 'var(--text-primary)' }}>{company?.company_name || 'NextTech Solutions Sdn Bhd'}</strong></span>
          </div>

          <button 
            onClick={fetchDashboardData}
            className="btn btn-secondary btn-sm"
            title="Refresh Dashboard"
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

        </div>
      </div>


      {/* ========================================================================= */}
      {/* NOTICES & ALERTS SECTION */}
      {/* ========================================================================= */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
        
        {/* Notice 1: Flagged Journals / Action Required */}
        {flaggedJournals.length > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--status-warning-bg)',
            border: '1px solid var(--status-warning-border)',
            borderRadius: '8px',
            padding: '0.85rem 1.25rem',
            color: 'var(--status-warning-text)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <AlertTriangle size={18} />
              <div>
                <strong style={{ fontSize: '0.88rem' }}>
                  Action Required: {flaggedJournals.length} Journal {flaggedJournals.length === 1 ? 'Entry' : 'Entries'} Flagged in Audit Queue
                </strong>
                <p style={{ fontSize: '0.78rem', color: '#92400E', margin: 0 }}>
                  Accounting discrepancies detected. Review required before entries can be posted to the General Ledger.
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate && onNavigate('daily_ledger')}
              className="btn btn-sm"
              style={{
                backgroundColor: 'var(--status-warning-text)',
                color: '#fff',
                fontSize: '0.78rem'
              }}
            >
              <span>Review in Audit Queue</span>
              <ArrowRight size={13} />
            </button>
          </div>
        )}

        {/* Notice 2: Pending Audit Queue */}
        {pendingJournals.length > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--status-info-bg)',
            border: '1px solid var(--status-info-border)',
            borderRadius: '8px',
            padding: '0.85rem 1.25rem',
            color: 'var(--status-info-text)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Info size={18} />
              <div>
                <strong style={{ fontSize: '0.88rem' }}>
                  Audit Queue: {pendingJournals.length} {pendingJournals.length === 1 ? 'Entry' : 'Entries'} Awaiting Review
                </strong>
                <p style={{ fontSize: '0.78rem', color: '#1E40AF', margin: 0 }}>
                  Drafted transactions pending audit verification before posting to the General Ledger.
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate && onNavigate('daily_ledger')}
              className="btn btn-primary btn-sm"
              style={{ fontSize: '0.78rem' }}
            >
              <span>View Audit Queue</span>
              <ArrowRight size={13} />
            </button>
          </div>
        )}

        {/* Notice 3: Discrepancy Alert (Only shown when an actual discrepancy occurs) */}
        {(!isTbBalanced || !isBsBalanced) && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--status-warning-bg)',
            border: '1px solid var(--status-warning-border)',
            borderRadius: '8px',
            padding: '0.75rem 1.25rem',
            color: 'var(--status-warning-text)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <ShieldCheck size={18} />
              <div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  Trial Balance Discrepancy Detected: Review posted journal entries.
                </span>
              </div>
            </div>
            <button
              onClick={() => onNavigate && onNavigate('trial_balance')}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.75rem' }}
            >
              View Trial Balance
            </button>
          </div>
        )}

        {/* Notice 4: Fresh State Guide if 0 documents */}
        {documents.length === 0 && (
          <div style={{
            backgroundColor: 'var(--status-info-bg)',
            border: '1px dashed var(--status-info-border)',
            borderRadius: '8px',
            padding: '1rem 1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: 'var(--status-info-text)'
          }}>
            <div>
              <strong style={{ fontSize: '0.88rem' }}>Ready for Document Processing</strong>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
                Upload financial documents to begin autonomous document processing and transaction extraction.
              </p>
            </div>
            <button
              onClick={() => onNavigate && onNavigate('documents')}
              className="btn btn-primary btn-sm"
              style={{ fontWeight: 600 }}
            >
              Upload Document →
            </button>
          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* KPI METRIC CARDS */}
      {/* ========================================================================= */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', 
        gap: '1.25rem', 
        marginBottom: '1.5rem' 
      }}>
        {/* Metric 1: Total Revenue */}
        <div className="card" style={{ padding: '1.25rem', marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              TOTAL REVENUE
            </span>
            <div style={{ padding: '0.35rem', backgroundColor: 'var(--status-info-bg)', borderRadius: '6px', color: 'var(--color-primary)' }}>
              <TrendingUp size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.4rem' }}>
            MYR {formatAmount(totalRev)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            {plData?.revenue?.length || 0} active revenue accounts
          </div>
        </div>

        {/* Metric 2: Operating Expenses & COGS */}
        <div className="card" style={{ padding: '1.25rem', marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              TOTAL EXPENSES & COGS
            </span>
            <div style={{ padding: '0.35rem', backgroundColor: 'var(--status-neutral-bg)', borderRadius: '6px', color: 'var(--text-secondary)' }}>
              <TrendingDown size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.4rem' }}>
            MYR {formatAmount(totalCogs + totalExp)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Cost of Sales: MYR {formatAmount(totalCogs)} · Operating Expenses: MYR {formatAmount(totalExp)}
          </div>
        </div>

        {/* Metric 3: Net Profit & Margin */}
        <div className="card" style={{ padding: '1.25rem', marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              NET PROFIT / (LOSS)
            </span>
            <span className={netProfit >= 0 ? 'status-badge SUCCESS' : 'status-badge ERROR'} style={{ fontSize: '0.68rem' }}>
              Margin: {profitMargin}%
            </span>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: netProfit >= 0 ? 'var(--status-success-text)' : 'var(--status-error-text)', marginTop: '0.4rem' }}>
            MYR {formatAmount(netProfit)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Gross Profit: MYR {formatAmount(plData?.gross_profit || 0)}
          </div>
        </div>

        {/* Metric 4: Audit Queue & Total Ingested Docs */}
        <div className="card" style={{ padding: '1.25rem', marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              TRANSACTION AUDIT STATUS
            </span>
            <div style={{ padding: '0.35rem', backgroundColor: 'var(--status-info-bg)', borderRadius: '6px', color: 'var(--color-primary)' }}>
              <BookOpen size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.4rem' }}>
            {postedJournals.length} <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>of {totalJournalsCount} Posted</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem', display: 'flex', gap: '0.65rem' }}>
            <span style={{ color: 'var(--status-success-text)' }}>{postedJournals.length} Posted</span>
            <span style={{ color: 'var(--color-primary)' }}>{pendingJournals.length} Pending</span>
            <span style={{ color: 'var(--status-error-text)' }}>{flaggedJournals.length} Flagged</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VISUALIZATIONS SECTION */}
      {/* ========================================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
        
        {/* Visualization 1: Financial Performance Waterfall / Breakdown */}
        <div className="card" style={{ padding: '1.25rem', marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem', margin: 0 }}>
                <BarChart3 size={16} style={{ color: 'var(--color-primary)' }} />
                Financial Performance
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Financial performance based on recorded general ledger transactions.
              </span>
            </div>
            <button 
              onClick={() => onNavigate && onNavigate('reports')}
              className="btn btn-secondary btn-sm"
            >
              View Reports →
            </button>
          </div>

          {/* Comparative Progress Bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {/* 1. Revenue */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Total Revenue</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>MYR {formatAmount(totalRev)}</span>
              </div>
              <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--bg-surface)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: totalRev > 0 ? '100%' : '0%', height: '100%', backgroundColor: 'var(--color-primary)', borderRadius: '4px' }}></div>
              </div>
            </div>

            {/* 2. Cost of Sales */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                <span style={{ color: 'var(--status-warning-text)', fontWeight: 600 }}>Cost of Sales (COGS)</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                  MYR {formatAmount(totalCogs)} ({totalRev > 0 ? ((totalCogs / totalRev) * 100).toFixed(1) : 0}%)
                </span>
              </div>
              <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--bg-surface)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ 
                  width: totalRev > 0 ? `${Math.min((totalCogs / totalRev) * 100, 100)}%` : '0%', 
                  height: '100%', 
                  backgroundColor: 'var(--status-warning-text)', 
                  borderRadius: '4px' 
                }}></div>
              </div>
            </div>

            {/* 3. Operating Expenses */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                <span style={{ color: 'var(--status-error-text)', fontWeight: 600 }}>Operating Expenses</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                  MYR {formatAmount(totalExp)} ({totalRev > 0 ? ((totalExp / totalRev) * 100).toFixed(1) : 0}%)
                </span>
              </div>
              <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--bg-surface)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ 
                  width: totalRev > 0 ? `${Math.min((totalExp / totalRev) * 100, 100)}%` : '0%', 
                  height: '100%', 
                  backgroundColor: 'var(--status-error-text)', 
                  borderRadius: '4px' 
                }}></div>
              </div>
            </div>

            {/* 4. Net Profit */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                <span style={{ color: netProfit >= 0 ? 'var(--status-success-text)' : 'var(--status-error-text)', fontWeight: 700 }}>Net Profit / (Loss)</span>
                <span style={{ color: netProfit >= 0 ? 'var(--status-success-text)' : 'var(--status-error-text)', fontWeight: 700 }}>
                  MYR {formatAmount(netProfit)} ({profitMargin}%)
                </span>
              </div>
              <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--bg-surface)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ 
                  width: totalRev > 0 ? `${Math.max(Math.min((netProfit / totalRev) * 100, 100), 0)}%` : '0%', 
                  height: '100%', 
                  backgroundColor: netProfit >= 0 ? 'var(--status-success-text)' : 'var(--status-error-text)', 
                  borderRadius: '4px' 
                }}></div>
              </div>
            </div>
          </div>

          {/* Quick Summary Pill Row */}
          <div style={{ 
            marginTop: '1.25rem', 
            paddingTop: '0.85rem', 
            borderTop: '1px solid var(--border-color)', 
            display: 'flex', 
            justifyContent: 'space-between',
            fontSize: '0.78rem',
            color: 'var(--text-secondary)'
          }}>
            <span>Gross Profit: <strong style={{ color: 'var(--color-primary)' }}>MYR {formatAmount(plData?.gross_profit || 0)}</strong></span>
            <span>Balance Sheet Status: <strong style={{ color: isBsBalanced ? 'var(--status-success-text)' : 'var(--status-error-text)' }}>{isBsBalanced ? 'Balanced ✓' : 'Discrepancy Detected ✗'}</strong></span>
          </div>
        </div>

        {/* Visualization 2: Double-Entry Audit Queue Health Gauge & Breakdown */}
        <div className="card" style={{ padding: '1.25rem', marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem', margin: 0 }}>
                <BookOpen size={16} style={{ color: 'var(--color-primary)' }} />
                Transaction Processing Status
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Overview of transactions awaiting review or successfully posted.
              </span>
            </div>
            <button 
              onClick={() => onNavigate && onNavigate('daily_ledger')}
              className="btn btn-secondary btn-sm"
            >
              View Audit Queue →
            </button>
          </div>

          {/* Visual Segmented Bar */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ 
              display: 'flex', 
              height: '12px', 
              borderRadius: '6px', 
              overflow: 'hidden', 
              backgroundColor: 'var(--bg-surface)',
              marginBottom: '0.75rem'
            }}>
              {totalJournalsCount > 0 ? (
                <>
                  <div 
                    title={`Posted: ${postedJournals.length}`}
                    style={{ width: `${(postedJournals.length / totalJournalsCount) * 100}%`, backgroundColor: 'var(--status-success-text)' }}
                  />
                  <div 
                    title={`Pending Audit: ${pendingJournals.length}`}
                    style={{ width: `${(pendingJournals.length / totalJournalsCount) * 100}%`, backgroundColor: 'var(--color-primary)' }}
                  />
                  <div 
                    title={`Human Review: ${flaggedJournals.length}`}
                    style={{ width: `${(flaggedJournals.length / totalJournalsCount) * 100}%`, backgroundColor: 'var(--status-error-text)' }}
                  />
                </>
              ) : (
                <div style={{ width: '100%', backgroundColor: 'var(--border-color)' }} />
              )}
            </div>

            {/* Legend & Breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--status-success-text)' }}></div>
                  <span style={{ color: 'var(--text-primary)' }}>POSTED (General Ledger)</span>
                </div>
                <span style={{ fontWeight: 600, color: 'var(--status-success-text)' }}>
                  {postedJournals.length} ({totalJournalsCount > 0 ? ((postedJournals.length / totalJournalsCount) * 100).toFixed(0) : 0}%)
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-primary)' }}></div>
                  <span style={{ color: 'var(--text-primary)' }}>PENDING_AUDIT (Pending Review)</span>
                </div>
                <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                  {pendingJournals.length} ({totalJournalsCount > 0 ? ((pendingJournals.length / totalJournalsCount) * 100).toFixed(0) : 0}%)
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--status-error-text)' }}></div>
                  <span style={{ color: 'var(--text-primary)' }}>HUMAN_REVIEW (Requires Review)</span>
                </div>
                <span style={{ fontWeight: 600, color: 'var(--status-error-text)' }}>
                  {flaggedJournals.length} ({totalJournalsCount > 0 ? ((flaggedJournals.length / totalJournalsCount) * 100).toFixed(0) : 0}%)
                </span>
              </div>
            </div>
          </div>


        </div>

      </div>

      {/* ========================================================================= */}
      {/* SECOND ROW: DOCUMENT PIPELINE & RECENT ACTIVITY STREAM */}
      {/* ========================================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
        
        {/* Visualization 3: Ingestion Pipeline by Document Type */}
        <div className="card" style={{ padding: '1.25rem', marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem', margin: 0 }}>
                <FileText size={16} style={{ color: 'var(--color-primary)' }} />
                Document Processing Overview
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Summary of documents received and processed by category.
              </span>
            </div>
            <button 
              onClick={() => onNavigate && onNavigate('documents')}
              className="btn btn-secondary btn-sm"
            >
              View Documents →
            </button>
          </div>

          {Object.keys(docTypeCounts).length === 0 ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No documents processed yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {Object.entries(docTypeCounts).map(([type, count]) => {
                const pct = ((count / documents.length) * 100).toFixed(0);
                return (
                  <div key={type}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                      <span style={{ color: 'var(--text-primary)' }}>{type}</span>
                      <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{count} doc(s) ({pct}%)</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--bg-surface)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--color-primary)', borderRadius: '4px' }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}


        </div>

        {/* Recent Accounting Activity Feed */}
        <div className="card" style={{ padding: '1.25rem', marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem', margin: 0 }}>
                <Activity size={16} style={{ color: 'var(--status-success-text)' }} />
                Recent Journal Entries
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Latest journal entries recorded in the accounting system.
              </span>
            </div>
            <button 
              onClick={() => onNavigate && onNavigate('journals')}
              className="btn btn-secondary btn-sm"
            >
              View All Journals →
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th style={{ padding: '0.5rem 0.6rem' }}>Journal ID</th>
                  <th style={{ padding: '0.5rem 0.6rem' }}>Description</th>
                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>Amount</th>
                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {journals.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No journal entries recorded yet.
                    </td>
                  </tr>
                ) : (
                  journals.slice(0, 5).map(j => {
                    const isFlagged = j.status === 'HUMAN_REVIEW';
                    const isPosted = j.status === 'POSTED';
                    const badgeClass = isFlagged ? 'ERROR' : (isPosted ? 'POSTED' : 'PENDING_AUDIT');
                    return (
                      <tr 
                        key={j.id} 
                        style={{ cursor: 'pointer' }}
                        onClick={() => onNavigate && onNavigate(isPosted ? 'general_ledger' : 'daily_ledger')}
                      >
                        <td style={{ padding: '0.6rem', color: 'var(--color-primary)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{j.journal_id}</td>
                        <td style={{ padding: '0.6rem', color: 'var(--text-primary)' }}>{j.description || '-'}</td>
                        <td style={{ padding: '0.6rem', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 600 }}>
                          MYR {formatAmount(j.total_debit)}
                        </td>
                        <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                          <span className={`status-badge ${badgeClass}`}>
                            {j.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* QUICK ACTIONS DOCK */}
      {/* ========================================================================= */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem' 
      }}>
        <button
          onClick={() => onNavigate && onNavigate('documents')}
          className="btn btn-secondary"
          style={{
            padding: '0.85rem 1rem',
            justifyContent: 'flex-start',
            gap: '0.75rem',
            textAlign: 'left',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
          }}
        >
          <div style={{ padding: '0.45rem', backgroundColor: 'var(--status-info-bg)', borderRadius: '6px', color: 'var(--color-primary)', display: 'flex' }}>
            <FileText size={18} />
          </div>
          <div>
            <strong style={{ fontSize: '0.88rem', display: 'block', color: 'var(--text-primary)' }}>Documents</strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Upload & Manage Documents</span>
          </div>
        </button>

        <button
          onClick={() => onNavigate && onNavigate('daily_ledger')}
          className="btn btn-secondary"
          style={{
            padding: '0.85rem 1rem',
            justifyContent: 'flex-start',
            gap: '0.75rem',
            textAlign: 'left',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
          }}
        >
          <div style={{ padding: '0.45rem', backgroundColor: 'var(--status-warning-bg)', borderRadius: '6px', color: 'var(--status-warning-text)', display: 'flex' }}>
            <BookOpen size={18} />
          </div>
          <div>
            <strong style={{ fontSize: '0.88rem', display: 'block', color: 'var(--text-primary)' }}>Audit Queue</strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Review Pending Transactions</span>
          </div>
        </button>

        <button
          onClick={() => onNavigate && onNavigate('general_ledger')}
          className="btn btn-secondary"
          style={{
            padding: '0.85rem 1rem',
            justifyContent: 'flex-start',
            gap: '0.75rem',
            textAlign: 'left',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
          }}
        >
          <div style={{ padding: '0.45rem', backgroundColor: 'var(--status-success-bg)', borderRadius: '6px', color: 'var(--status-success-text)', display: 'flex' }}>
            <Layers size={18} />
          </div>
          <div>
            <strong style={{ fontSize: '0.88rem', display: 'block', color: 'var(--text-primary)' }}>General Ledger</strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>View Ledger Accounts & Balances</span>
          </div>
        </button>

        <button
          onClick={() => onNavigate && onNavigate('reports')}
          className="btn btn-secondary"
          style={{
            padding: '0.85rem 1rem',
            justifyContent: 'flex-start',
            gap: '0.75rem',
            textAlign: 'left',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
          }}
        >
          <div style={{ padding: '0.45rem', backgroundColor: 'var(--bg-surface)', borderRadius: '6px', color: 'var(--text-primary)', display: 'flex' }}>
            <BarChart3 size={18} />
          </div>
          <div>
            <strong style={{ fontSize: '0.88rem', display: 'block', color: 'var(--text-primary)' }}>Financial Reports</strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Profit & Loss and Balance Sheet</span>
          </div>
        </button>
      </div>


    </div>
  );
}
