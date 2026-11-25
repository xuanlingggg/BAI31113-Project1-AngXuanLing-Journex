import React from 'react';
import { Clock } from 'lucide-react';

export function PlaceholderPage({ title, description }) {
  return (
    <div className="page-container">
      <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem', maxWidth: '600px', margin: '2rem auto' }}>
        <div style={{ 
          width: '56px', 
          height: '56px', 
          backgroundColor: 'rgba(59, 130, 246, 0.1)', 
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.5rem auto',
          color: '#60a5fa'
        }}>
          <Clock size={28} />
        </div>

        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>{title}</h2>
        
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
          {description}
        </p>
      </div>
    </div>
  );
}
