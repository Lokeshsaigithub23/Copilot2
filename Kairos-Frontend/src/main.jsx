import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

function logRendererError(msg, errObj, details = {}) {
  try {
    if (ipcRenderer) {
      ipcRenderer.send('log-renderer-error', {
        message: msg,
        stack: errObj?.stack || 'no stack',
        details
      });
    }
  } catch (_) {}
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught React error:', error, errorInfo);
    logRendererError(`React Error: ${error?.message || error}`, error, errorInfo);
    try {
      const fs = window.require ? window.require('fs') : null;
      const path = window.require ? window.require('path') : null;
      if (fs && path) {
        const logPath = path.join(window.process.cwd(), 'renderer_error.log');
        const msg = `[${new Date().toISOString()}] ErrorBoundary React Error: ${error?.message || error}\nStack: ${error?.stack || 'no stack'}\nInfo: ${JSON.stringify(errorInfo)}\n\n`;
        fs.appendFileSync(logPath, msg, 'utf8');
      }
    } catch (_) {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          color: '#fff',
          background: '#1a1a2e',
          minHeight: '100vh',
          fontFamily: 'sans-serif',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center'
        }}>
          <h1 style={{ color: '#ff5c5c', marginBottom: '16px' }}>Oops! Something went wrong.</h1>
          <p style={{ color: '#cbd5e1', maxWidth: '600px', lineHeight: '1.6', marginBottom: '24px' }}>
            The application encountered an unexpected error. Please restart the app or go back to the home page.
          </p>
          <div style={{
            background: '#0f0f1b',
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid #3b3b52',
            textAlign: 'left',
            maxWidth: '800px',
            width: '100%',
            overflowX: 'auto',
            marginBottom: '24px',
            fontFamily: 'monospace',
            color: '#ffb4b4',
            whiteSpace: 'pre-wrap'
          }}>
            {this.state.error?.toString()}
            {this.state.error?.stack && `\n\n${this.state.error.stack}`}
          </div>
          <button 
            onClick={() => window.location.reload()} 
            style={{
              padding: '12px 24px',
              background: '#4a9eff',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

try {
  const fs = window.require ? window.require('fs') : null;
  const path = window.require ? window.require('path') : null;

  if (fs && path) {
    const logPath = path.join(window.process.cwd(), 'renderer_error.log');
    
    // Write startup indicator
    fs.appendFileSync(logPath, `\n\n--- App Started at ${new Date().toISOString()} ---\n`, 'utf8');

    window.addEventListener('error', (event) => {
      logRendererError(`Uncaught Error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`, event.error);
      try {
        const msg = `[${new Date().toISOString()}] Uncaught Error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}\nStack: ${event.error?.stack || 'no stack'}\n\n`;
        fs.appendFileSync(logPath, msg, 'utf8');
      } catch (err) {
        console.error('Failed to write error to log:', err);
      }
    });

    window.addEventListener('unhandledrejection', (event) => {
      logRendererError(`Unhandled Rejection: ${event.reason?.message || event.reason}`, event.reason);
      try {
        const reason = event.reason;
        const msg = `[${new Date().toISOString()}] Unhandled Rejection: ${reason?.message || reason}\nStack: ${reason?.stack || 'no stack'}\n\n`;
        fs.appendFileSync(logPath, msg, 'utf8');
      } catch (err) {
        console.error('Failed to write rejection to log:', err);
      }
    });
  }
} catch (err) {
  console.error('[logger] failed to initialize:', err);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
