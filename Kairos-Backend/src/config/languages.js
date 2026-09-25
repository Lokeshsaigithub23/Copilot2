'use strict';

/**
 * Central Language Registry for Kairos AI Copilot
 * Contains STT models, fallback mappings, and AI answer language specifications.
 */

const LANGUAGES = {
  // ── Indian Languages ──
  en: {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    group: 'indic',
    deepgram: { supported: true, model: 'nova-2', languageCode: 'en' },
    fallback: {
      sarvam: { languageCode: 'en-IN', model: 'saaras:v3' },
      google: { languageCode: 'en-US' }
    },
    aiResponseLanguage: 'English'
  },
  hi: {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    group: 'indic',
    deepgram: { supported: true, model: 'nova-2', languageCode: 'hi' },
    fallback: {
      sarvam: { languageCode: 'hi-IN', model: 'saaras:v3' },
      google: { languageCode: 'hi-IN' }
    },
    aiResponseLanguage: 'Hindi'
  },
  te: {
    code: 'te',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    group: 'indic',
    deepgram: { supported: true, model: 'nova-3', languageCode: 'te' },
    fallback: {
      sarvam: { languageCode: 'te-IN', model: 'saaras:v3' },
      google: { languageCode: 'te-IN' }
    },
    aiResponseLanguage: 'Telugu'
  },
  ta: {
    code: 'ta',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    group: 'indic',
    deepgram: { supported: true, model: 'nova-3', languageCode: 'ta' },
    fallback: {
      sarvam: { languageCode: 'ta-IN', model: 'saaras:v3' },
      google: { languageCode: 'ta-IN' }
    },
    aiResponseLanguage: 'Tamil'
  },
  mr: {
    code: 'mr',
    name: 'Marathi',
    nativeName: 'मराठी',
    group: 'indic',
    deepgram: { supported: true, model: 'nova-3', languageCode: 'mr' },
    fallback: {
      sarvam: { languageCode: 'mr-IN', model: 'saaras:v3' },
      google: { languageCode: 'mr-IN' }
    },
    aiResponseLanguage: 'Marathi'
  },
  gu: {
    code: 'gu',
    name: 'Gujarati',
    nativeName: 'ગુજરાતી',
    group: 'indic',
    deepgram: { supported: true, model: 'nova-3', languageCode: 'gu' },
    fallback: {
      sarvam: { languageCode: 'gu-IN', model: 'saaras:v3' },
      google: { languageCode: 'gu-IN' }
    },
    aiResponseLanguage: 'Gujarati'
  },
  kn: {
    code: 'kn',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    group: 'indic',
    deepgram: { supported: true, model: 'nova-3', languageCode: 'kn' },
    fallback: {
      sarvam: { languageCode: 'kn-IN', model: 'saaras:v3' },
      google: { languageCode: 'kn-IN' }
    },
    aiResponseLanguage: 'Kannada'
  },
  ml: {
    code: 'ml',
    name: 'Malayalam',
    nativeName: 'മലയാളം',
    group: 'indic',
    deepgram: { supported: false, model: null, languageCode: null },
    fallback: {
      sarvam: { languageCode: 'ml-IN', model: 'saaras:v3' },
      google: { languageCode: 'ml-IN' }
    },
    aiResponseLanguage: 'Malayalam'
  },
  bn: {
    code: 'bn',
    name: 'Bengali',
    nativeName: 'বাংলা',
    group: 'indic',
    deepgram: { supported: true, model: 'nova-3', languageCode: 'bn' },
    fallback: {
      sarvam: { languageCode: 'bn-IN', model: 'saaras:v3' },
      google: { languageCode: 'bn-IN' }
    },
    aiResponseLanguage: 'Bengali'
  },

  // ── International Languages ──
  es: {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    group: 'international',
    deepgram: { supported: true, model: 'nova-2', languageCode: 'es' },
    fallback: {
      google: { languageCode: 'es-ES' }
    },
    aiResponseLanguage: 'Spanish'
  },
  fr: {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    group: 'international',
    deepgram: { supported: true, model: 'nova-2', languageCode: 'fr' },
    fallback: {
      google: { languageCode: 'fr-FR' }
    },
    aiResponseLanguage: 'French'
  },
  de: {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    group: 'international',
    deepgram: { supported: true, model: 'nova-2', languageCode: 'de' },
    fallback: {
      google: { languageCode: 'de-DE' }
    },
    aiResponseLanguage: 'German'
  },
  pt: {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    group: 'international',
    deepgram: { supported: true, model: 'nova-2', languageCode: 'pt' },
    fallback: {
      google: { languageCode: 'pt-BR' }
    },
    aiResponseLanguage: 'Portuguese'
  },
  it: {
    code: 'it',
    name: 'Italian',
    nativeName: 'Italiano',
    group: 'international',
    deepgram: { supported: true, model: 'nova-2', languageCode: 'it' },
    fallback: {
      google: { languageCode: 'it-IT' }
    },
    aiResponseLanguage: 'Italian'
  },
  ru: {
    code: 'ru',
    name: 'Russian',
    nativeName: 'Русский',
    group: 'international',
    deepgram: { supported: true, model: 'nova-2', languageCode: 'ru' },
    fallback: {
      google: { languageCode: 'ru-RU' }
    },
    aiResponseLanguage: 'Russian'
  },
  ja: {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    group: 'international',
    deepgram: { supported: true, model: 'nova-2', languageCode: 'ja' },
    fallback: {
      google: { languageCode: 'ja-JP' }
    },
    aiResponseLanguage: 'Japanese'
  },
  ko: {
    code: 'ko',
    name: 'Korean',
    nativeName: '한국어',
    group: 'international',
    deepgram: { supported: true, model: 'nova-2', languageCode: 'ko' },
    fallback: {
      google: { languageCode: 'ko-KR' }
    },
    aiResponseLanguage: 'Korean'
  },
  zh: {
    code: 'zh',
    name: 'Chinese',
    nativeName: '中文',
    group: 'international',
    deepgram: { supported: true, model: 'nova-2', languageCode: 'zh' },
    fallback: {
      google: { languageCode: 'zh-CN' }
    },
    aiResponseLanguage: 'Chinese'
  },
  ar: {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    group: 'international',
    deepgram: { supported: true, model: 'nova-3', languageCode: 'ar' },
    fallback: {
      google: { languageCode: 'ar-SA' }
    },
    aiResponseLanguage: 'Arabic'
  },
  nl: {
    code: 'nl',
    name: 'Dutch',
    nativeName: 'Nederlands',
    group: 'international',
    deepgram: { supported: true, model: 'nova-2', languageCode: 'nl' },
    fallback: {
      google: { languageCode: 'nl-NL' }
    },
    aiResponseLanguage: 'Dutch'
  },
  id: {
    code: 'id',
    name: 'Indonesian',
    nativeName: 'Bahasa Indonesia',
    group: 'international',
    deepgram: { supported: true, model: 'nova-2', languageCode: 'id' },
    fallback: {
      google: { languageCode: 'id-ID' }
    },
    aiResponseLanguage: 'Indonesian'
  }
};

/**
 * Look up language configuration by code (e.g. 'te', 'hi', 'es') or English name (e.g. 'Telugu').
 */
function getLanguageConfig(codeOrName) {
  if (!codeOrName || typeof codeOrName !== 'string') return LANGUAGES.en;
  const normalized = codeOrName.trim().toLowerCase();

  // Direct code match
  if (LANGUAGES[normalized]) return LANGUAGES[normalized];

  // Base code prefix match (e.g. 'en-US' -> 'en', 'te-IN' -> 'te')
  const baseCode = normalized.split(/[-_]/)[0];
  if (LANGUAGES[baseCode]) return LANGUAGES[baseCode];

  // Match by name or nativeName
  for (const lang of Object.values(LANGUAGES)) {
    if (lang.name.toLowerCase() === normalized || lang.nativeName.toLowerCase() === normalized) {
      return lang;
    }
  }

  return LANGUAGES.en;
}

/**
 * Resolves STT provider configuration for a requested language and optional engine override.
 * Checks provider support and environment keys (DEEPGRAM_API_KEY, SARVAM_API_KEY, GOOGLE_SPEECH_KEY).
 */
function resolveSttProvider(languageCode, requestedEngine = 'auto') {
  const lang = getLanguageConfig(languageCode);
  const engine = String(requestedEngine || 'auto').trim().toLowerCase();

  const hasDeepgramKey = Boolean(process.env.DEEPGRAM_API_KEY && process.env.DEEPGRAM_API_KEY.trim());
  const hasSarvamKey = Boolean(process.env.SARVAM_API_KEY && process.env.SARVAM_API_KEY.trim());
  const hasGoogleKey = Boolean(process.env.GOOGLE_SPEECH_KEY && process.env.GOOGLE_SPEECH_KEY.trim());

  // 1. Explicit Engine Override: Google
  if (engine === 'google') {
    if (!hasGoogleKey) {
      return { supported: false, provider: 'google', error: 'Google Cloud Speech key is not configured on the server.' };
    }
    const googleCode = lang.fallback?.google?.languageCode || `${lang.code}-IN`;
    return { supported: true, provider: 'google', languageCode: googleCode, languageName: lang.name };
  }

  // 2. Explicit Engine Override: Sarvam
  if (engine === 'sarvam') {
    if (!hasSarvamKey) {
      return { supported: false, provider: 'sarvam', error: 'Sarvam API key is not configured on the server.' };
    }
    const sarvamCfg = lang.fallback?.sarvam;
    if (!sarvamCfg) {
      return { supported: false, provider: 'sarvam', error: `Sarvam STT does not support ${lang.name}.` };
    }
    return {
      supported: true,
      provider: 'sarvam',
      languageCode: sarvamCfg.languageCode,
      model: sarvamCfg.model,
      languageName: lang.name
    };
  }

  // 3. Default / Auto / Deepgram Engine:
  // Check if Deepgram supports this language
  if (lang.deepgram.supported) {
    if (!hasDeepgramKey) {
      return { supported: false, provider: 'deepgram', error: 'DEEPGRAM_API_KEY is not configured on the server.' };
    }
    return {
      supported: true,
      provider: 'deepgram',
      model: lang.deepgram.model,
      languageCode: lang.deepgram.languageCode,
      languageName: lang.name
    };
  }

  // 4. Language not supported by Deepgram (e.g. Malayalam 'ml'):
  // Try Fallback #1: Sarvam
  if (lang.fallback?.sarvam && hasSarvamKey) {
    return {
      supported: true,
      provider: 'sarvam',
      languageCode: lang.fallback.sarvam.languageCode,
      model: lang.fallback.sarvam.model,
      languageName: lang.name,
      isFallback: true
    };
  }

  // Try Fallback #2: Google Cloud STT
  if (lang.fallback?.google && hasGoogleKey) {
    return {
      supported: true,
      provider: 'google',
      languageCode: lang.fallback.google.languageCode,
      languageName: lang.name,
      isFallback: true
    };
  }

  // Unsupported language with no configured fallback
  const fallbackNames = [];
  if (lang.fallback?.sarvam) fallbackNames.push('Sarvam');
  if (lang.fallback?.google) fallbackNames.push('Google STT');
  const suggestion = fallbackNames.length > 0
    ? ` Deepgram does not support ${lang.name}; configure ${fallbackNames.join(' or ')} to enable it.`
    : '';

  return {
    supported: false,
    provider: null,
    error: `Live transcription for ${lang.name} is currently unavailable.${suggestion}`
  };
}

function getAllLanguages() {
  return Object.values(LANGUAGES);
}

module.exports = {
  LANGUAGES,
  getLanguageConfig,
  resolveSttProvider,
  getAllLanguages
};
