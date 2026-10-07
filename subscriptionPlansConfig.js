// Centralized configuration for Subscription Plans & Plan-Specific Top-Up configurations
import { CREDIT_USAGE_CONFIG } from '../../config/creditUsageConfig';

export const SUBSCRIPTION_PRICING = {
  FREE: 0,
  PRO: 29,      // $29/month default base (updated dynamically from API)
  PRO_PLUS: 79  // $79/month default base (updated dynamically from API)
};

export function updateSubscriptionPricing(plans) {
  if (!Array.isArray(plans)) return;
  plans.forEach(p => {
    const id = String(p.id || p.tier || '').toUpperCase();
    if (id && p.priceMonthly !== undefined && p.priceMonthly !== null) {
      SUBSCRIPTION_PRICING[id] = Number(p.priceMonthly);
    }
  });
}

export const BASE_PLANS = [
  {
    id: 'FREE',
    name: 'Free Plan',
    tier: 'FREE',
    priceMonthly: SUBSCRIPTION_PRICING.FREE,
    badge: 'Starter Trial',
    copilotMinutes: CREDIT_USAGE_CONFIG.copilot.includedMinutesPerPlan.FREE, // 30 mins
    copilotHours: 0.5,
    downloadLimit: CREDIT_USAGE_CONFIG.downloads.includedPerPlan.FREE, // 2 downloads
    downloadsIncluded: CREDIT_USAGE_CONFIG.downloads.includedPerPlan.FREE,
    hasTopBar: false,
    hasTeleprompter: false,
    resumeProfiles: 1,
    canDownloadPdf: true,
    canDownloadAudio: true,
    storageDays: 7,
    notetakerMinutes: 30,
    hasExecutiveSummary: true,
    hasActionItems: true,
    canEmailNotes: false,
    voiceMinutes: CREDIT_USAGE_CONFIG.voice.includedMinutesPerPlan.FREE, // 10 mins
    voiceResumes: 1,
    uploadMaxMb: -1, // Unlimited uploads
    uploadHours: -1,
    canTranscribe: true,
    canSpeakerLabels: true,
    canTranslate: true,
    canAskAi: true,
    features: [
      'Unlimited file uploads (zero credit deduction)',
      `${CREDIT_USAGE_CONFIG.downloads.includedPerPlan.FREE} included file downloads (expandable with credits)`,
      '30 mins AI Copilot practice',
      '10 mins Voice Simulator interview',
      '30 mins Notetaker transcripts',
      '1 Resume profile extraction'
    ]
  },
  {
    id: 'PRO',
    name: 'Pro Plan',
    tier: 'PRO',
    priceMonthly: SUBSCRIPTION_PRICING.PRO,
    badge: 'Most Popular',
    copilotMinutes: CREDIT_USAGE_CONFIG.copilot.includedMinutesPerPlan.PRO, // 600 mins (10 hrs)
    copilotHours: 10,
    downloadLimit: CREDIT_USAGE_CONFIG.downloads.includedPerPlan.PRO, // 25 downloads
    downloadsIncluded: CREDIT_USAGE_CONFIG.downloads.includedPerPlan.PRO,
    hasTopBar: true,
    hasTeleprompter: false,
    resumeProfiles: 5,
    canDownloadPdf: true,
    canDownloadAudio: true,
    storageDays: 60,
    notetakerMinutes: 900, // 15 hours
    hasExecutiveSummary: true,
    hasActionItems: true,
    canEmailNotes: true,
    voiceMinutes: CREDIT_USAGE_CONFIG.voice.includedMinutesPerPlan.PRO, // 90 mins (1.5 hrs)
    voiceResumes: 5,
    uploadMaxMb: -1, // Unlimited uploads
    uploadHours: -1,
    canTranscribe: true,
    canSpeakerLabels: true,
    canTranslate: true,
    canAskAi: true,
    features: [
      'Unlimited file uploads (zero credit deduction)',
      `${CREDIT_USAGE_CONFIG.downloads.includedPerPlan.PRO} included file downloads (expandable with credits)`,
      '10 Hours (600 mins) AI Copilot assistance',
      '1.5 Hours (90 mins) Interactive Voice Simulator',
      '15 Hours (900 mins) Meeting Notetaker & Summary',
      '5 Resume profiles extraction',
      'Top-bar real-time overlay support'
    ]
  },
  {
    id: 'PRO_PLUS',
    name: 'Pro Plus Plan',
    tier: 'PRO_PLUS',
    priceMonthly: SUBSCRIPTION_PRICING.PRO_PLUS,
    badge: 'Power User',
    copilotMinutes: CREDIT_USAGE_CONFIG.copilot.includedMinutesPerPlan.PRO_PLUS, // 2400 mins (40 hrs)
    copilotHours: 40,
    downloadLimit: CREDIT_USAGE_CONFIG.downloads.includedPerPlan.PRO_PLUS, // 100 downloads
    downloadsIncluded: CREDIT_USAGE_CONFIG.downloads.includedPerPlan.PRO_PLUS,
    hasTopBar: true,
    hasTeleprompter: true,
    resumeProfiles: -1,
    canDownloadPdf: true,
    canDownloadAudio: true,
    storageDays: -1,
    notetakerMinutes: 3000, // 50 hours
    hasExecutiveSummary: true,
    hasActionItems: true,
    canEmailNotes: true,
    voiceMinutes: CREDIT_USAGE_CONFIG.voice.includedMinutesPerPlan.PRO_PLUS, // 300 mins (5 hrs)
    voiceResumes: -1,
    uploadMaxMb: -1, // Unlimited uploads
    uploadHours: -1,
    canTranscribe: true,
    canSpeakerLabels: true,
    canTranslate: true,
    canAskAi: true,
    features: [
      'Unlimited file uploads (zero credit deduction)',
      `${CREDIT_USAGE_CONFIG.downloads.includedPerPlan.PRO_PLUS} included file downloads (expandable with credits)`,
      '40 Hours (2,400 mins) AI Copilot assistance',
      '5 Hours (300 mins) Interactive Voice Simulator',
      '50 Hours (3,000 mins) Meeting Notetaker & Summary',
      'Unlimited Resume profiles & Teleprompter',
      'Priority AI inference & multi-language translation'
    ]
  }
];

// Plan-specific credit top-up rates & configurations
// Centralized with creditUsageConfig
export const TOP_UP_CONFIGURATIONS = {
  FREE: [
    {
      id: 'downloads',
      name: 'File Downloads',
      icon: 'fa-solid fa-file-arrow-down',
      color: '#0ea5e9',
      description: 'Download transcripts, executive PDF summaries, and audio recordings using credits.',
      includedUsage: `${CREDIT_USAGE_CONFIG.downloads.includedPerPlan.FREE} included in your plan`,
      unit: 'Downloads',
      creditsPerHour: CREDIT_USAGE_CONFIG.downloads.creditCostPerDownload,
      pricePerHourUSD: 0.10,
      defaultQuantity: 5,
      presets: [1, 2, 5, 10]
    },
    {
      id: 'copilot',
      name: 'AI Copilot',
      icon: 'fa-solid fa-robot',
      color: '#6366f1',
      description: 'Real-time AI voice & teleprompter guidance during technical and behavioral interviews.',
      includedUsage: '0.5 hours included in your plan',
      unit: 'Hours',
      creditsPerHour: 120,
      pricePerHourUSD: 0.48,
      defaultQuantity: 2,
      presets: [1, 2, 4, 5, 10]
    },
    {
      id: 'voice',
      name: 'Voice Simulator',
      icon: 'fa-solid fa-microphone',
      color: '#38bdf8',
      description: 'Interactive spoken voice-to-voice mock interview rehearsals with instant feedback.',
      includedUsage: '10 mins included in your plan',
      unit: 'Hours',
      creditsPerHour: 150,
      pricePerHourUSD: 0.60,
      defaultQuantity: 1,
      presets: [1, 2, 3, 5]
    },
    {
      id: 'notetaker',
      name: 'Notepad & Notes',
      icon: 'fa-regular fa-file-lines',
      color: '#a855f7',
      description: 'Automatic meeting notes, key action items, and executive interview summaries.',
      includedUsage: '30 mins included in your plan',
      unit: 'Hours',
      creditsPerHour: 80,
      pricePerHourUSD: 0.32,
      defaultQuantity: 2,
      presets: [1, 2, 5, 10]
    },
    {
      id: 'upload',
      name: 'Media Upload',
      icon: 'fa-solid fa-cloud-arrow-up',
      color: '#10b981',
      description: 'High-speed audio & video upload processing with speaker labels & transcription.',
      includedUsage: 'Unlimited uploads for all plans (0 credits)',
      unit: 'Files',
      creditsPerHour: 0,
      pricePerHourUSD: 0.00,
      defaultQuantity: 1,
      presets: [1, 5, 10, 20]
    }
  ],

  PRO: [
    {
      id: 'downloads',
      name: 'File Downloads',
      icon: 'fa-solid fa-file-arrow-down',
      color: '#0ea5e9',
      description: 'Download transcripts, executive PDF summaries, and audio recordings using credits.',
      includedUsage: `${CREDIT_USAGE_CONFIG.downloads.includedPerPlan.PRO} included in your plan`,
      unit: 'Downloads',
      creditsPerHour: CREDIT_USAGE_CONFIG.downloads.creditCostPerDownload,
      pricePerHourUSD: 0.10,
      defaultQuantity: 10,
      presets: [5, 10, 25, 50]
    },
    {
      id: 'copilot',
      name: 'AI Copilot',
      icon: 'fa-solid fa-robot',
      color: '#6366f1',
      description: 'Real-time AI voice & teleprompter guidance during technical and behavioral interviews.',
      includedUsage: '10 hours included in your plan',
      unit: 'Hours',
      creditsPerHour: 100,
      pricePerHourUSD: 0.40,
      defaultQuantity: 4,
      presets: [1, 2, 4, 5, 10]
    },
    {
      id: 'voice',
      name: 'Voice Simulator',
      icon: 'fa-solid fa-microphone',
      color: '#38bdf8',
      description: 'Interactive spoken voice-to-voice mock interview rehearsals with instant feedback.',
      includedUsage: '1.5 hours included in your plan',
      unit: 'Hours',
      creditsPerHour: 120,
      pricePerHourUSD: 0.48,
      defaultQuantity: 2,
      presets: [1, 2, 4, 5]
    },
    {
      id: 'notetaker',
      name: 'Notepad & Notes',
      icon: 'fa-regular fa-file-lines',
      color: '#a855f7',
      description: 'Automatic meeting notes, key action items, and executive interview summaries.',
      includedUsage: '15 hours included in your plan',
      unit: 'Hours',
      creditsPerHour: 60,
      pricePerHourUSD: 0.24,
      defaultQuantity: 4,
      presets: [2, 5, 10, 20]
    },
    {
      id: 'upload',
      name: 'Media Upload',
      icon: 'fa-solid fa-cloud-arrow-up',
      color: '#10b981',
      description: 'High-speed audio & video upload processing with speaker labels & transcription.',
      includedUsage: 'Unlimited uploads for all plans (0 credits)',
      unit: 'Files',
      creditsPerHour: 0,
      pricePerHourUSD: 0.00,
      defaultQuantity: 5,
      presets: [5, 10, 20, 50]
    }
  ],

  PRO_PLUS: [
    {
      id: 'downloads',
      name: 'File Downloads',
      icon: 'fa-solid fa-file-arrow-down',
      color: '#0ea5e9',
      description: 'Download transcripts, executive PDF summaries, and audio recordings using credits.',
      includedUsage: `${CREDIT_USAGE_CONFIG.downloads.includedPerPlan.PRO_PLUS} included in your plan`,
      unit: 'Downloads',
      creditsPerHour: CREDIT_USAGE_CONFIG.downloads.creditCostPerDownload,
      pricePerHourUSD: 0.10,
      defaultQuantity: 20,
      presets: [10, 25, 50, 100]
    },
    {
      id: 'copilot',
      name: 'AI Copilot',
      icon: 'fa-solid fa-robot',
      color: '#6366f1',
      description: 'Real-time AI voice & teleprompter guidance during technical and behavioral interviews.',
      includedUsage: '40 hours included in your plan',
      unit: 'Hours',
      creditsPerHour: 80,
      pricePerHourUSD: 0.32,
      defaultQuantity: 5,
      presets: [2, 5, 10, 20]
    },
    {
      id: 'voice',
      name: 'Voice Simulator',
      icon: 'fa-solid fa-microphone',
      color: '#38bdf8',
      description: 'Interactive spoken voice-to-voice mock interview rehearsals with instant feedback.',
      includedUsage: '5 hours included in your plan',
      unit: 'Hours',
      creditsPerHour: 100,
      pricePerHourUSD: 0.40,
      defaultQuantity: 2,
      presets: [2, 4, 5, 10]
    },
    {
      id: 'notetaker',
      name: 'Notepad & Notes',
      icon: 'fa-regular fa-file-lines',
      color: '#a855f7',
      description: 'Automatic meeting notes, key action items, and executive interview summaries.',
      includedUsage: '50 hours included in your plan',
      unit: 'Hours',
      creditsPerHour: 50,
      pricePerHourUSD: 0.20,
      defaultQuantity: 10,
      presets: [5, 10, 20, 50]
    },
    {
      id: 'upload',
      name: 'Media Upload',
      icon: 'fa-solid fa-cloud-arrow-up',
      color: '#10b981',
      description: 'High-speed audio & video upload processing with speaker labels & transcription.',
      includedUsage: 'Unlimited uploads for all plans (0 credits)',
      unit: 'Files',
      creditsPerHour: 0,
      pricePerHourUSD: 0.00,
      defaultQuantity: 10,
      presets: [10, 25, 50, 100]
    }
  ]
};
