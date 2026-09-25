const configuredApiUrl = import.meta.env.VITE_API_URL;
const defaultApiUrl = configuredApiUrl || (
  import.meta.env.DEV ? 'http://127.0.0.1:4000' : window.location.origin
);

export const API_BASE = defaultApiUrl.replace(/\/$/, '');
export const WS_BASE = API_BASE.replace(/^http/, 'ws');

export function websocketProtocols(token) {
  return token ? [`bearer.${token}`] : [];
}