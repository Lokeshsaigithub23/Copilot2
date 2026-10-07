// Store for Top-Up records, feature usage allocations, and live state synchronization
import { getUserCredits, setUserCredits, getActiveUserId } from './transactionHistoryStore';
import {
  CREDIT_USAGE_CONFIG,
  getCopilotMinutesUsed,
  getVoiceMinutesUsed,
  getDownloadsUsed
} from '../../config/creditUsageConfig';

function getActivePlanStorageKey() {
  return `copilot_active_plan_tier_v3_${getActiveUserId()}`;
}

function getFeatureUsageStorageKey() {
  return `copilot_feature_usage_v3_${getActiveUserId()}`;
}

function getTopUpHistoryStorageKey() {
  return `copilot_topup_history_v3_${getActiveUserId()}`;
}

// Default feature usage for fresh/new accounts (starts clean at 0 used)
const DEFAULT_FEATURE_USAGE = {
  copilot: {
    name: 'AI Copilot',
    used: 0,
    baseLimit: 0.5, // 30 mins
    toppedUp: 0,
    unit: 'Hours'
  },
  voice: {
    name: 'Voice Simulator',
    used: 0,
    baseLimit: 0.16, // 10 mins
    toppedUp: 0,
    unit: 'Hours'
  },
  downloads: {
    name: 'File Downloads',
    used: 0,
    baseLimit: 2,
    toppedUp: 0,
    unit: 'Downloads'
  },
  upload: {
    name: 'File Uploads',
    used: 0,
    baseLimit: -1,
    toppedUp: 0,
    unit: 'Files',
    isUnlimited: true
  },
  notetaker: {
    name: 'Notepad & Notes',
    used: 0,
    baseLimit: 0.5,
    toppedUp: 0,
    unit: 'Hours'
  }
};

const INITIAL_DEMO_TOP_UP_HISTORY = [
  {
    id: 'TOP-882104',
    date: '02 Oct 2026, 04:30 PM',
    feature: 'AI Copilot',
    featureId: 'copilot',
    hours: 4,
    unit: 'Hours',
    credits: 400,
    amount: 1.60,
    currency: 'USD',
    currencySymbol: '$',
    paymentType: 'credits',
    paymentMethod: 'Credits Balance',
    planTier: 'PRO',
    status: 'Successful'
  }
];

export function getActiveUserPlanTier() {
  try {
    const rawUser = localStorage.getItem('auth_user');
    if (rawUser) {
      const u = JSON.parse(rawUser);
      if (u && u.plan) return String(u.plan).toUpperCase();
    }
  } catch (_) {}

  try {
    const saved = localStorage.getItem(getActivePlanStorageKey());
    if (saved) return saved.toUpperCase();
  } catch (_) {}
  return 'FREE';
}

export function setActiveUserPlanTier(tier) {
  const safeTier = (tier || 'FREE').toUpperCase();
  try {
    localStorage.setItem(getActivePlanStorageKey(), safeTier);
    const rawUser = localStorage.getItem('auth_user');
    if (rawUser) {
      const u = JSON.parse(rawUser);
      if (u) {
        u.plan = safeTier;
        localStorage.setItem('auth_user', JSON.stringify(u));
      }
    }
  } catch (_) {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('copilot-plan-tier-updated', { detail: safeTier }));
  }
}

export function getTopUpHistory() {
  const key = getTopUpHistoryStorageKey();
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  // Fresh users start clean with dynamic top-ups recorded on checkout
  return [];
}

export function saveTopUpHistory(history) {
  const key = getTopUpHistoryStorageKey();
  try {
    localStorage.setItem(key, JSON.stringify(history));
  } catch (_) {}
}

export function getFeatureUsage() {
  const activeTier = getActiveUserPlanTier();

  let copilotLimitHours = 0.5;
  let voiceLimitHours = 0.16;
  let downloadLimit = 2;

  if (CREDIT_USAGE_CONFIG) {
    copilotLimitHours = ((CREDIT_USAGE_CONFIG.copilot?.includedMinutesPerPlan?.[activeTier]) || 30) / 60;
    voiceLimitHours = ((CREDIT_USAGE_CONFIG.voice?.includedMinutesPerPlan?.[activeTier]) || 10) / 60;
    downloadLimit = CREDIT_USAGE_CONFIG.downloads?.includedPerPlan?.[activeTier] ?? 2;
  }

  const liveCopilotHoursUsed = typeof getCopilotMinutesUsed === 'function'
    ? Math.round((getCopilotMinutesUsed() / 60) * 100) / 100
    : 0;
  const liveVoiceHoursUsed = typeof getVoiceMinutesUsed === 'function'
    ? Math.round((getVoiceMinutesUsed() / 60) * 100) / 100
    : 0;
  const liveDownloadsUsed = typeof getDownloadsUsed === 'function'
    ? getDownloadsUsed()
    : 0;

  const dynamicUsage = {
    copilot: {
      name: 'AI Copilot',
      used: liveCopilotHoursUsed,
      baseLimit: copilotLimitHours,
      toppedUp: 0,
      unit: 'Hours'
    },
    voice: {
      name: 'Voice Simulator',
      used: liveVoiceHoursUsed,
      baseLimit: voiceLimitHours,
      toppedUp: 0,
      unit: 'Hours'
    },
    downloads: {
      name: 'File Downloads',
      used: liveDownloadsUsed,
      baseLimit: downloadLimit,
      toppedUp: 0,
      unit: 'Downloads'
    },
    upload: {
      name: 'File Uploads',
      used: 0,
      baseLimit: -1,
      toppedUp: 0,
      unit: 'Files',
      isUnlimited: true
    },
    notetaker: {
      name: 'Notepad & Notes',
      used: 0,
      baseLimit: copilotLimitHours,
      toppedUp: 0,
      unit: 'Hours'
    }
  };

  const key = getFeatureUsageStorageKey();
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        Object.keys(dynamicUsage).forEach((k) => {
          if (parsed[k]) {
            dynamicUsage[k].toppedUp = Number(parsed[k].toppedUp) || 0;
            if (typeof parsed[k].used === 'number') {
              dynamicUsage[k].used = Math.max(dynamicUsage[k].used, parsed[k].used);
            }
          }
        });
      }
    }
  } catch (_) {}
  return dynamicUsage;
}

export function saveFeatureUsage(usage) {
  const key = getFeatureUsageStorageKey();
  try {
    localStorage.setItem(key, JSON.stringify(usage));
  } catch (_) {}
}

export function recordTopUpSuccess({
  featureId,
  featureName,
  quantity,
  unit = 'Hours',
  creditsRequired,
  amountUSD,
  currency = 'USD',
  currencySymbol = '$',
  paymentType = 'credits', // 'credits' | 'payment_method'
  paymentMethod = 'Credits Balance',
  planTier = 'PRO'
}) {
  const currentHistory = getTopUpHistory();
  const newRecord = {
    id: `TOP-${Math.floor(100000 + Math.random() * 900000)}`,
    date: new Date().toLocaleString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }),
    feature: featureName,
    featureId,
    hours: Number(quantity) || 1,
    unit,
    credits: Number(creditsRequired) || 0,
    amount: Number(amountUSD) || 0,
    currency,
    currencySymbol,
    paymentType,
    paymentMethod,
    planTier,
    status: 'Successful'
  };

  const updatedHistory = [newRecord, ...currentHistory];
  saveTopUpHistory(updatedHistory);

  // If paid with credits, deduct from wallet
  if (paymentType === 'credits') {
    const currentCredits = getUserCredits();
    const newBal = Math.max(0, currentCredits - Number(creditsRequired));
    setUserCredits(newBal);
  }

  // Update feature usage allocation safely
  const currentUsage = getFeatureUsage();
  const existing = currentUsage[featureId] || { used: 0, baseLimit: 0, toppedUp: 0 };
  currentUsage[featureId] = {
    ...existing,
    toppedUp: (Number(existing.toppedUp) || 0) + Number(quantity)
  };
  saveFeatureUsage(currentUsage);

  // Dispatch custom window event so all components react immediately
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('copilot-topup-updated', { detail: newRecord }));
  }

  return newRecord;
}
