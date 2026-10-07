import axios from 'axios';

const configuredApiUrl = import.meta.env.VITE_API_URL;
const defaultApiUrl = configuredApiUrl || (
  import.meta.env.DEV ? 'http://127.0.0.1:4000' : window.location.origin
);

export const API_BASE = defaultApiUrl.replace(/\/$/, '');
export const WS_BASE = API_BASE.replace(/^http/, 'ws');

export function websocketProtocols(token) {
  return token ? [`bearer.${token}`] : [];
}

let lastNotificationTime = 0;
function notifySessionExpired() {
  const now = Date.now();
  if (now - lastNotificationTime < 4000) return;
  lastNotificationTime = now;
  window.dispatchEvent(
    new CustomEvent('auth-expired', {
      detail: { message: 'Session expired. Please log in again.' }
    })
  );
}

// Global fetch interceptor to catch expired tokens
if (typeof window !== 'undefined' && window.fetch) {
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (response.status === 401) {
      // Check if this request explicitly suppressed auth redirects or is a subscription/upgrade request
      const url = String(args[0] || '');
      const reqInit = args[1] || {};
      const headers = reqInit.headers || {};
      const suppressRedirect =
        headers['x-suppress-auth-redirect'] === 'true' ||
        (headers instanceof Headers && headers.get('x-suppress-auth-redirect') === 'true') ||
        url.includes('/user/upgrade') ||
        url.includes('/user/subscription-limits') ||
        url.includes('/api/plans') ||
        (typeof window !== 'undefined' && (
          window.location.search.includes('window=subscription') ||
          window.location.search.includes('window=usage')
        ));

      if (!suppressRedirect) {
        try {
          const clone = response.clone();
          const data = await clone.json();
          const msg = String(data?.error?.message || '').toLowerCase();
          if (
            data?.error?.code === 'UNAUTHORIZED' ||
            msg.includes('expired') ||
            msg.includes('invalid token') ||
            msg.includes('login again')
          ) {
            notifySessionExpired();
          }
        } catch (_) {}
      }
    }
    return response;
  };
}

// Global axios interceptor to catch expired tokens
if (typeof window !== 'undefined' && axios) {
  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      const suppressRedirect =
        error.config?.headers?.['x-suppress-auth-redirect'] === 'true' ||
        error.config?.url?.includes('/user/upgrade') ||
        error.config?.url?.includes('/user/subscription-limits') ||
        (typeof window !== 'undefined' && (
          window.location.search.includes('window=subscription') ||
          window.location.search.includes('window=usage')
        ));

      if (!suppressRedirect && error.response?.status === 401) {
        const msg = String(error.response.data?.error?.message || '').toLowerCase();
        if (
          error.response.data?.error?.code === 'UNAUTHORIZED' ||
          msg.includes('expired') ||
          msg.includes('invalid token') ||
          msg.includes('login again')
        ) {
          notifySessionExpired();
        }
      }
      return Promise.reject(error);
    }
  );
}