import React, { useState, useEffect } from 'react';
import { Calendar, Filter, X, Check, Clock, AlertTriangle } from 'lucide-react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function AccountingDateFilter({
  currentFilter,
  onApplyFilter,
  onResetFilter,
  financialYear = 2026,
  showAsAtOption = true,
  className = ''
}) {
  // Mode: 'ALL' | 'MONTHLY' | 'SPECIFIC_DATE' | 'DATE_RANGE' | 'AS_AT'
  const [mode, setMode] = useState(currentFilter?.mode || 'ALL');

  // Month & Year state
  const currentDate = new Date();
  const defaultYear = financialYear || currentDate.getFullYear() || 2026;
  const defaultMonth = currentDate.getMonth() + 1; // 1-12

  const [selectedMonth, setSelectedMonth] = useState(currentFilter?.month || defaultMonth);
  const [selectedYear, setSelectedYear] = useState(currentFilter?.year || defaultYear);

  // Specific Date state
  const [specificDate, setSpecificDate] = useState(currentFilter?.specific_date || '');

  // Date Range state
  const [fromDate, setFromDate] = useState(currentFilter?.from_date || '');
  const [toDate, setToDate] = useState(currentFilter?.to_date || '');

  // As At Date state
  const [asAtDate, setAsAtDate] = useState(currentFilter?.as_at_date || '');

  // Validation error state
  const [error, setError] = useState(null);

  // Available Years: dynamically generated (defaultYear - 3 to defaultYear + 3)
  const availableYears = [];
  const startYr = (defaultYear || 2026) - 4;
  for (let y = startYr; y <= (defaultYear || 2026) + 3; y++) {
    availableYears.push(y);
  }

  // Sync internal state when currentFilter prop changes externally
  useEffect(() => {
    if (currentFilter) {
      setMode(currentFilter.mode || 'ALL');
      if (currentFilter.month) setSelectedMonth(currentFilter.month);
      if (currentFilter.year) setSelectedYear(currentFilter.year);
      if (currentFilter.specific_date) setSpecificDate(currentFilter.specific_date);
      if (currentFilter.from_date) setFromDate(currentFilter.from_date);
      if (currentFilter.to_date) setToDate(currentFilter.to_date);
      if (currentFilter.as_at_date) setAsAtDate(currentFilter.as_at_date);
      setError(null);
    }
  }, [currentFilter]);

  const handleApply = () => {
    setError(null);

    if (mode === 'ALL') {
      onApplyFilter({
        mode: 'ALL',
        from_date: null,
        to_date: null,
        as_at_date: null,
        label: 'All Dates (Full History)'
      });
      return;
    }

    if (mode === 'MONTHLY') {
      const mStr = String(selectedMonth).padStart(2, '0');
      // Calculate days in month (handling leap years correctly)
      const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
      const fDate = `${selectedYear}-${mStr}-01`;
      const tDate = `${selectedYear}-${mStr}-${String(lastDay).padStart(2, '0')}`;
      const monthName = MONTH_NAMES[selectedMonth - 1] || `Month ${selectedMonth}`;

      onApplyFilter({
        mode: 'MONTHLY',
        month: selectedMonth,
        year: selectedYear,
        from_date: fDate,
        to_date: tDate,
        as_at_date: tDate,
        label: `${monthName} ${selectedYear} (${fDate} – ${tDate})`
      });
      return;
    }

    if (mode === 'SPECIFIC_DATE') {
      if (!specificDate) {
        setError('Please select a specific date.');
        return;
      }
      onApplyFilter({
        mode: 'SPECIFIC_DATE',
        specific_date: specificDate,
        from_date: specificDate,
        to_date: specificDate,
        as_at_date: specificDate,
        label: `Specific Date: ${specificDate}`
      });
      return;
    }

    if (mode === 'DATE_RANGE') {
      if (!fromDate || !toDate) {
        setError('Please provide both Start Date and End Date.');
        return;
      }
      if (fromDate > toDate) {
        setError('Start Date cannot be later than End Date.');
        return;
      }
      onApplyFilter({
        mode: 'DATE_RANGE',
        from_date: fromDate,
        to_date: toDate,
        as_at_date: toDate,
        label: `Period: ${fromDate} to ${toDate}`
      });
      return;
    }

    if (mode === 'AS_AT') {
      if (!asAtDate) {
        setError('Please select an As-At balance date.');
        return;
      }
      onApplyFilter({
        mode: 'AS_AT',
        as_at_date: asAtDate,
        from_date: null,
        to_date: asAtDate,
        label: `As at ${asAtDate}`
      });
      return;
    }
  };

  const handleReset = () => {
    setMode('ALL');
    setError(null);
    setSpecificDate('');
    setFromDate('');
    setToDate('');
    setAsAtDate('');
    if (onResetFilter) {
      onResetFilter();
    } else {
      onApplyFilter({
        mode: 'ALL',
        from_date: null,
        to_date: null,
        as_at_date: null,
        label: 'All Dates (Full History)'
      });
    }
  };

  const isFiltered = mode !== 'ALL';

  return (
    <div 
      className={`accounting-date-filter-bar ${className}`}
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--border-color)',
        borderRadius: '10px',
        padding: '0.85rem 1.15rem',
        marginBottom: '1.25rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        
        {/* Left: Mode Selector Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginRight: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Calendar size={14} style={{ color: 'var(--primary-color)' }} />
            <span>PERIOD:</span>
          </span>

          <button
            type="button"
            onClick={() => { setMode('ALL'); setError(null); }}
            style={{
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: mode === 'ALL' ? 700 : 500,
              cursor: 'pointer',
              backgroundColor: mode === 'ALL' ? '#EFF6FF' : 'transparent',
              color: mode === 'ALL' ? '#2563EB' : 'var(--text-secondary)',
              border: mode === 'ALL' ? '1px solid #BFDBFE' : '1px solid transparent',
              transition: 'all 0.15s ease'
            }}
          >
            All Dates
          </button>

          <button
            type="button"
            onClick={() => { setMode('MONTHLY'); setError(null); }}
            style={{
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: mode === 'MONTHLY' ? 700 : 500,
              cursor: 'pointer',
              backgroundColor: mode === 'MONTHLY' ? '#EFF6FF' : 'transparent',
              color: mode === 'MONTHLY' ? '#2563EB' : 'var(--text-secondary)',
              border: mode === 'MONTHLY' ? '1px solid #BFDBFE' : '1px solid transparent',
              transition: 'all 0.15s ease'
            }}
          >
            Monthly
          </button>

          <button
            type="button"
            onClick={() => { setMode('SPECIFIC_DATE'); setError(null); }}
            style={{
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: mode === 'SPECIFIC_DATE' ? 700 : 500,
              cursor: 'pointer',
              backgroundColor: mode === 'SPECIFIC_DATE' ? '#EFF6FF' : 'transparent',
              color: mode === 'SPECIFIC_DATE' ? '#2563EB' : 'var(--text-secondary)',
              border: mode === 'SPECIFIC_DATE' ? '1px solid #BFDBFE' : '1px solid transparent',
              transition: 'all 0.15s ease'
            }}
          >
            Specific Date
          </button>

          <button
            type="button"
            onClick={() => { setMode('DATE_RANGE'); setError(null); }}
            style={{
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: mode === 'DATE_RANGE' ? 700 : 500,
              cursor: 'pointer',
              backgroundColor: mode === 'DATE_RANGE' ? '#EFF6FF' : 'transparent',
              color: mode === 'DATE_RANGE' ? '#2563EB' : 'var(--text-secondary)',
              border: mode === 'DATE_RANGE' ? '1px solid #BFDBFE' : '1px solid transparent',
              transition: 'all 0.15s ease'
            }}
          >
            Date Range
          </button>

          {showAsAtOption && (
            <button
              type="button"
              onClick={() => { setMode('AS_AT'); setError(null); }}
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: mode === 'AS_AT' ? 700 : 500,
                cursor: 'pointer',
                backgroundColor: mode === 'AS_AT' ? '#EFF6FF' : 'transparent',
                color: mode === 'AS_AT' ? '#2563EB' : 'var(--text-secondary)',
                border: mode === 'AS_AT' ? '1px solid #BFDBFE' : '1px solid transparent',
                transition: 'all 0.15s ease'
              }}
            >
              As At Date
            </button>
          )}
        </div>

        {/* Right: Active Period Badge */}
        {isFiltered && currentFilter?.label && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ 
              fontSize: '0.78rem', 
              color: '#2563EB', 
              backgroundColor: '#EFF6FF', 
              border: '1px solid #DBEAFE', 
              borderRadius: '6px', 
              padding: '0.3rem 0.65rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}>
              <Clock size={13} />
              <span>{currentFilter.label}</span>
            </span>
          </div>
        )}

      </div>

      {/* Dynamic Filter Controls Row (Shown when not 'ALL') */}
      {mode !== 'ALL' && (
        <div style={{ 
          marginTop: '0.75rem', 
          paddingTop: '0.75rem', 
          borderTop: '1px solid #F1F5F9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            
            {/* MONTHLY INPUTS */}
            {mode === 'MONTHLY' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Month:</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                    className="form-control"
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.82rem', borderRadius: '6px', width: '135px' }}
                  >
                    {MONTH_NAMES.map((m, idx) => (
                      <option key={idx + 1} value={idx + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Year:</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                    className="form-control"
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.82rem', borderRadius: '6px', width: '95px' }}
                  >
                    {availableYears.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* SPECIFIC DATE INPUT */}
            {mode === 'SPECIFIC_DATE' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Date:</label>
                <input
                  type="date"
                  value={specificDate}
                  onChange={(e) => setSpecificDate(e.target.value)}
                  className="form-control"
                  style={{ padding: '0.35rem 0.65rem', fontSize: '0.82rem', borderRadius: '6px' }}
                />
              </div>
            )}

            {/* DATE RANGE INPUTS */}
            {mode === 'DATE_RANGE' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>From:</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="form-control"
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.82rem', borderRadius: '6px' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>To:</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="form-control"
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.82rem', borderRadius: '6px' }}
                  />
                </div>
              </>
            )}

            {/* AS AT DATE INPUT */}
            {mode === 'AS_AT' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>As At Date:</label>
                <input
                  type="date"
                  value={asAtDate}
                  onChange={(e) => setAsAtDate(e.target.value)}
                  className="form-control"
                  style={{ padding: '0.35rem 0.65rem', fontSize: '0.82rem', borderRadius: '6px' }}
                />
              </div>
            )}

          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleApply}
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '0.4rem 0.9rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all 0.15s ease'
              }}
            >
              <Check size={14} />
              <span>Apply Filter</span>
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="btn btn-secondary btn-sm"
              style={{
                padding: '0.4rem 0.75rem',
                fontSize: '0.82rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <X size={13} />
              <span>Reset</span>
            </button>
          </div>

        </div>
      )}

      {/* Error message */}
      {error && (
        <div style={{ 
          marginTop: '0.6rem', 
          fontSize: '0.78rem', 
          color: '#DC2626', 
          backgroundColor: '#FEF2F2', 
          border: '1px solid #FEE2E2', 
          borderRadius: '6px', 
          padding: '0.45rem 0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem'
        }}>
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}

    </div>
  );
}
