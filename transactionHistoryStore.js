// Centralized transaction history & wallet balance store with localStorage persistence and active user scoping

export function getActiveUserId() {
  try {
    const raw = localStorage.getItem('auth_user');
    if (raw) {
      const u = JSON.parse(raw);
      if (u) {
        const id = u._id || u.id || u.email;
        if (id) return String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
      }
    }
  } catch (_) {}
  return 'guest';
}

function getHistoryStorageKey() {
  return `copilot_transaction_history_v3_${getActiveUserId()}`;
}

function getCreditsStorageKey() {
  return `copilot_user_credits_v3_${getActiveUserId()}`;
}

const INITIAL_DEMO_TRANSACTIONS = [
  {
    id: 'TXN-984210',
    type: 'Subscription Plan',
    planOrPackage: 'Pro Plan',
    creditsAdded: 0,
    creditsUsed: 5000,
    amount: 19,
    currency: 'USD',
    currencySymbol: '$',
    paymentMethod: 'Credit / Debit Card',
    methodCode: 'card',
    dateTime: 'Oct 2, 2026, 11:42 AM',
    status: 'Successful',
    referenceId: 'REF-CARD-9012'
  },
  {
    id: 'TXN-983104',
    type: 'Credit Top-up',
    planOrPackage: '2,500 Credits Pack',
    creditsAdded: 2500,
    creditsUsed: 0,
    amount: 10,
    currency: 'USD',
    currencySymbol: '$',
    paymentMethod: 'UPI',
    methodCode: 'upi',
    dateTime: 'Oct 2, 2026, 09:15 AM',
    status: 'Failed',
    failureReason: 'Transaction declined by bank authorization server',
    referenceId: 'REF-UPI-4491'
  },
  {
    id: 'TXN-975520',
    type: 'Subscription Plan',
    planOrPackage: 'Pro Plus Plan',
    creditsAdded: 0,
    creditsUsed: 7250,
    amount: 0,
    currency: 'USD',
    currencySymbol: '$',
    paymentMethod: 'Credits Only',
    methodCode: 'credits',
    dateTime: 'Sep 24, 2026, 03:30 PM',
    status: 'Successful',
    referenceId: 'REF-CREDIT-7731'
  }
];

export function getStoredTransactions() {
  const key = getHistoryStorageKey();
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  // For all fresh users and guests, start clean with dynamic transactions recorded on action
  return [];
}

export function saveTransactions(transactions) {
  const key = getHistoryStorageKey();
  try {
    localStorage.setItem(key, JSON.stringify(transactions));
  } catch (_) {}
}

export function addTransactionRecord(record) {
  const current = getStoredTransactions();
  const newTxn = {
    id: record.id || `TXN-${Math.floor(100000 + Math.random() * 900000)}`,
    type: record.type || 'Subscription Plan',
    planOrPackage: record.planOrPackage || 'Pro Plan',
    creditsAdded: Number(record.creditsAdded) || 0,
    creditsUsed: Number(record.creditsUsed) || 0,
    amount: Number(record.amount) || 0,
    currency: record.currency || 'USD',
    currencySymbol: record.currencySymbol || '$',
    paymentMethod: record.paymentMethod || 'Credit / Debit Card',
    methodCode: record.methodCode || 'card',
    dateTime: record.dateTime || new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }),
    status: record.status || 'Successful',
    failureReason: record.failureReason || null,
    referenceId: record.referenceId || `REF-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
  };

  const updated = [newTxn, ...current];
  saveTransactions(updated);

  // Dispatch custom window event so all open views immediately update
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('copilot-transactions-updated', { detail: newTxn }));
  }

  return newTxn;
}

export function getUserCredits() {
  const key = getCreditsStorageKey();
  try {
    const val = localStorage.getItem(key);
    if (val !== null) {
      const num = Number(val);
      if (!isNaN(num)) return num;
    }
  } catch (_) {}

  // Check if active user profile has explicit credits
  try {
    const rawUser = localStorage.getItem('auth_user');
    if (rawUser) {
      const u = JSON.parse(rawUser);
      if (u && typeof u.credits === 'number' && !isNaN(u.credits)) {
        setUserCredits(u.credits);
        return u.credits;
      }
      // If upgraded plan, grant plan-specific starting credits
      const plan = (u.plan || '').toUpperCase();
      if (plan === 'PRO') {
        setUserCredits(5000);
        return 5000;
      }
      if (plan === 'PRO_PLUS') {
        setUserCredits(10000);
        return 10000;
      }
    }
  } catch (_) {}

  // Strict Audio Requirement: Free Plan starts with exactly 50 credits!
  const defaultFreeCredits = 50;
  try {
    localStorage.setItem(key, String(defaultFreeCredits));
  } catch (_) {}
  return defaultFreeCredits;
}

export function setUserCredits(amount) {
  const safeVal = Math.max(0, Number(amount) || 0);
  const key = getCreditsStorageKey();
  try {
    localStorage.setItem(key, String(safeVal));
    // Also sync to auth_user in localStorage if present
    const rawUser = localStorage.getItem('auth_user');
    if (rawUser) {
      const u = JSON.parse(rawUser);
      if (u) {
        u.credits = safeVal;
        localStorage.setItem('auth_user', JSON.stringify(u));
      }
    }
  } catch (_) {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('copilot-credits-updated', { detail: safeVal }));
  }
  return safeVal;
}

export const getStoredCredits = getUserCredits;
export const setStoredCredits = setUserCredits;
