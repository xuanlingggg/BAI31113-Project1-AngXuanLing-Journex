import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("React Error Boundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', color: 'var(--status-error-text)', backgroundColor: '#F8FAFC', fontFamily: 'sans-serif' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>React Application Error</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            An unexpected error occurred while rendering the application.
          </p>
          <pre style={{ color: 'var(--status-warning-text)', backgroundColor: '#FFFFFF', border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '8px', fontSize: '0.85rem', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
            {this.state.error && this.state.error.toString()}
            {'\n'}
            {this.state.error && this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

