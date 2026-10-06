import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './utils/storage'
import './index.css'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'

// Global Unhandled Rejection & Error Protection to prevent white screen drops
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('[Global Guard] Handled unhandled promise rejection safely:', event.reason);
    // Prevent unhandledrejection from breaking runtime state
    event.preventDefault();
  });

  window.addEventListener('error', (event) => {
    console.warn('[Global Guard] Intercepted runtime window error safely:', event.message);
  });

  if (import.meta.hot) {
    import.meta.hot.on('vite:beforeFullReload', (event) => {
      console.warn('[Vite HMR] Caught beforeFullReload event:', event);
    });
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
