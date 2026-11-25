import React, { useState } from 'react';
import { Bot, Mail, Lock, User, ArrowRight, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatApiError } from '../utils/apiError';

export default function AuthPage({ onLoginSuccess, onStartRegistrationSession }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        // Redesigned 3-step onboarding:
        // Do not create permanent user or company records yet.
        // Initialize temporary registration session instead.
        const res = await fetch('/api/onboarding/session/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, full_name: fullName })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(formatApiError(data, 'Failed to start registration session. Please check your inputs.'));
        }

        if (onStartRegistrationSession) {
          onStartRegistrationSession(data.session_id);
        }
      } else {
        // Normal Sign In for existing users
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(formatApiError(data, 'Authentication failed. Please check your credentials.'));
        }

        localStorage.setItem('auth_token', data.access_token);
        localStorage.setItem('auth_user', JSON.stringify(data.user));

        if (onLoginSuccess) {
          onLoginSuccess(data.access_token, data.user);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
      padding: '2rem',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '460px',
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        overflow: 'hidden'
      }}>
        {/* Brand Header */}
        <div style={{
          backgroundColor: '#1E293B',
          padding: '2rem 2rem 1.5rem',
          color: '#FFFFFF',
          textAlign: 'center'
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '0.85rem' }}>
            <img
              src="/brand/journex-logo-dark.svg"
              alt="Journex"
              style={{ height: '48px', width: 'auto', display: 'block' }}
            />
          </div>
          <p style={{ fontSize: '0.85rem', color: '#94A3B8', margin: 0 }}>
            Enterprise Autonomous Double-Entry & Onboarding Platform
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #E2E8F0',
          backgroundColor: '#F8FAFC'
        }}>
          <button
            type="button"
            onClick={() => { setIsRegister(false); setError(null); }}
            style={{
              flex: 1,
              padding: '1rem',
              border: 'none',
              background: 'none',
              fontWeight: !isRegister ? '700' : '500',
              color: !isRegister ? '#2563EB' : '#64748B',
              borderBottom: !isRegister ? '2px solid #2563EB' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setIsRegister(true); setError(null); }}
            style={{
              flex: 1,
              padding: '1rem',
              border: 'none',
              background: 'none',
              fontWeight: isRegister ? '700' : '500',
              color: isRegister ? '#2563EB' : '#64748B',
              borderBottom: isRegister ? '2px solid #2563EB' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Register New Account
          </button>
        </div>

        {/* Form Body */}
        <div style={{ padding: '2rem' }}>
          {!isRegister && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginBottom: '1.25rem',
              fontSize: '0.8125rem'
            }}>
              <div>
                <span style={{ fontWeight: '600', color: '#1E40AF' }}>Demo Admin: </span>
                <span style={{ color: '#1D4ED8' }}>admin@nexttech.com / password123</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEmail('admin@nexttech.com');
                  setPassword('password123');
                }}
                style={{
                  background: '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Auto-fill
              </button>
            </div>
          )}
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: '#FEF2F2',
              color: '#B91C1C',
              padding: '0.875rem 1rem',
              borderRadius: '8px',
              fontSize: '0.875rem',
              marginBottom: '1.25rem',
              border: '1px solid #FECACA'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {isRegister && (
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                  Full Name / Title
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Director Tan" minLength={2}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
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
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                Corporate Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                <input
                  type="password"
                  required
                  placeholder="••••••••••••" minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

            <button
              type="submit"
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '12px',
                backgroundColor: '#2563EB',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.9375rem',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.25)',
                marginTop: '0.5rem'
              }}
            >
              <span>{loading ? 'Processing...' : (isRegister ? 'Register & Continue to Onboarding' : 'Sign In')}</span>
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          <div style={{
            marginTop: '2rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid #F1F5F9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            fontSize: '0.75rem',
            color: '#64748B'
          }}>
            <ShieldCheck size={16} style={{ color: '#10B981' }} />
            <span>MFRS 101 Statutory Accounting Security Enabled</span>
          </div>
        </div>
      </div>
    </div>
  );
}
