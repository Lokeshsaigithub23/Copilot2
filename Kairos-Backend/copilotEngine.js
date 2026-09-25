const { classifyIntent, buildSystemPrompt } = require('./intentClassifier');
const { getLanguageConfig } = require('./src/config/languages');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const PERSONAL_QUESTION_PATTERN = /\b(?:tell\s+(?:me|us)\s+about\s+(?:your\s+self|yourself|your\s+background|your\s+experience)|introduce\s+your\s+self|introduce\s+yourself|walk\s+me\s+through\s+your\s+(?:resume|background|experience)|what\s+(?:is|are)\s+your\s+(?:experience|background|strengths|weaknesses)|where\s+do\s+you\s+see\s+your\s+self|where\s+do\s+you\s+see\s+yourself|why\s+should\s+we\s+hire\s+you)\b/i;

function isPersonalQuestion(question) {
  return PERSONAL_QUESTION_PATTERN.test(String(question || ''));
}

function buildResumeContextPrompt(question, resumeContext) {
  if (!resumeContext || !isPersonalQuestion(question)) return '';
  let resumeText = resumeContext;
  let profile = {};
  try {
    const parsed = typeof resumeContext === 'string' ? JSON.parse(resumeContext) : resumeContext;
    if (parsed && typeof parsed === 'object' && ('resumeText' in parsed || 'profile' in parsed)) {
      resumeText = parsed.resumeText || '';
      profile = parsed.profile && typeof parsed.profile === 'object' ? parsed.profile : {};
    }
  } catch (_) {
    // Backward compatibility for callers that still send plain resume text.
  }

  const profileText = Object.entries(profile)
    .filter(([, value]) => typeof value === 'string' && value.trim())
    .map(([key, value]) => `${key}: ${value.trim()}`)
    .join('\n');
  const boundedResume = String(resumeText || '').trim().slice(0, 30000);
  const boundedProfile = profileText.slice(0, 15000);
  if (!boundedResume && !boundedProfile) return '';
  return `\n\nPERSONAL QUESTION CANDIDATE CONTEXT (SOURCE OF TRUTH):\nAnswer as the candidate, using the completed profile form and resume below. For questions such as "tell me about yourself", give a natural first-person interview response based mainly on the candidate's resume and supplied profile. Never say that you are an AI, assistant, or here to help, and never describe the task instead of answering. Mention only facts present in the context. Do not invent details; if something is missing, omit it rather than guessing.\n--- PROFILE FORM START ---\n${boundedProfile || '(No profile form details supplied)'}\n--- PROFILE FORM END ---\n--- RESUME START ---\n${boundedResume || '(No resume uploaded)'}\n--- RESUME END ---`;
}

// ─────────────────────────────────────────
// AI Client Initialisation
// ─────────────────────────────────────────

let openaiClient = null;
let groqClient = null;

function initClients() {
  const OpenAI = require('openai');

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey && !openaiClient) {
    openaiClient = new OpenAI({ apiKey: openaiKey, timeout: 15000, maxRetries: 1 });
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey && !groqClient) {
    groqClient = new OpenAI({
      apiKey: groqKey,
      baseURL: 'https://api.x.ai/v1',
      timeout: 30000,
      maxRetries: 1,
    });
  }
}

initClients();

// ─────────────────────────────────────────
// Multilingual Interview Question Detection
// ─────────────────────────────────────────

const NON_QUESTION_INDICATORS = [
  /^(okay|ok|yes|yeah|yep|sure|alright|right|good|great|nice|thanks|thank you)\s*[,.!?]?\s*$/i,
  /^(uh|um|hmm|well|so|and|but|or)\s*$/i,
  /^(hello|hi|hey|good morning|good afternoon|good evening)\s*[,.!?]?\s*$/i,
  /^(bye|goodbye|see you|thank you for your time)\s*[,.!?]?\s*$/i,
  /^(i see|i understand|got it|makes sense)\s*[,.!?]?\s*$/i,
  /^(go ahead|please continue|carry on)\s*[,.!?]?\s*$/i,
  /^(that's (fine|good|great|interesting))\s*[,.!?]?\s*$/i,
  /^(no problem|of course|absolutely)\s*[,.!?]?\s*$/i,
  /^[a-z]{1,3}\s*$/i,
];

const MULTILINGUAL_GREETINGS_AND_FILLERS = [
  /^(?:hello|hi|hey|good\s+morning|good\s+afternoon|good\s+evening|welcome|alright|ok|okay|so|yeah|yes|yep|sure|fine|great|thanks|thank\s+you)\s*[,.!?]?\s*$/i,
  /^(?:namaste|namaskar|namaskaram|vanakkam|dhanyavad|dhanyavadalu|shukriya|kem\s+cho|pranam|aabhar|salaam|khushamdeed)\s*[,.!?]?\s*$/i,
  /^(?:నమస్కారం|నమస్తే|ధన్యవాదాలు|బాగున్నారా|స్వాగతం)\s*[,.!?]?\s*$/u,
  /^(?:नमस्ते|नमस्कार|धन्यवाद|शुक्रिया|प्रणाम|स्वागत)\s*[,.!?]?\s*$/u,
  /^(?:வணக்கம்|நன்றி|வரவேற்கிறோம்)\s*[,.!?]?\s*$/u,
  /^(?:ನಮಸ್ಕಾರ|ಧನ್ಯವಾದಗಳು|ಸ್ವಾಗತ)\s*[,.!?]?\s*$/u,
  /^(?:നമസ്കാരം|നന്ദി|സ്വാഗതം)\s*[,.!?]?\s*$/u,
  /^(?:নমস্কার|ধন্যবাদ|স্বাগতম)\s*[,.!?]?\s*$/u,
  /^(?:hola|bonjour|ciao|hallo|olá|ola|gracias|merci|danke)\s*[,.!?]?\s*$/i
];

const STATEMENT_STARTERS = [
  /^(i|im|ive|id|ill|me|my|we|well|weve|were|let me|let's|let us|as a|so i|then i|actually i)\b/i,
  /^(yes|yeah|ok|okay|sure|no|nope|correct|right|exactly|absolutely|fine|thanks|thank you)\b/i,
  /^(in my opinion|from my experience|in my background|usually i|for example|for instance)\b/i,
];

const STRONG_QUESTION_CONTAINS = [
  /\b(my question is|have a question|has a question|one question|another question|next question)\b/i,
  /\b(anyone know|anyone knows|can anyone|could anyone|someone explain|anyone explain|explain me|explain to me|explain how|tell me about|introduce yourself|introduce your self|walk me through|difference between|differences between)\b/i,
  /\b(what is|what are|why do|why is|why are)\b/i,
  /\bhow\s+(?:to|do|does|did|can|should|would|is|about|many|much|long|often|far)\b/i,
  /\b(in python|in java|in javascript|in c\+\+|in c#|in go|in rust|in typescript)\b/i,
  /\b(write a|write an|code for|code of|function to|program to|algorithm for)\b/i,
  /\bfind\b/i,
  /\b(how would you|what is your approach|what's your approach|how to approach|what is the approach|what's the approach|how to solve|your approach|what approach|which approach|what are the steps)\b/i,
  /\b(explain about|explain the|describe the|talk about)\b/i,
  /\bname\s+(?:three|two|four|five|six|some|any|a|an|the|at\s+least|both|several|different|various)\b/i,
  /\b(say me|say to me|say about|tell me the|advantages of|disadvantages of|pros and cons of|benefits of|features of|limitations of|use cases of)\b/i,
];

const CONVERSATIONAL_QUESTIONS = [
  /\b(can you hear me|am i audible|can you see my screen|is my screen visible)\b/i,
  /\b(can you repeat|could you repeat|did you say|what did you say)\b/i,
  /\b(are we good to (start|go))\b/i,
  /\b(do you have any questions for me|any questions for me)\b/i,
  /\b(are you there|you there)\b/i,
  /\bhow are (you|u)\b/i,
  /\bhow are (you|u) doing\b/i,
  /\bhow is it going\b/i,
  /\bhow's it going\b/i,
  /\bis it working\b/i,
  /\bare (you|u) (ready|okay|ok)\b/i,
  /\bcan we (start|begin)\b/i,
  /\bshall we (start|begin)\b/i,
  /\bnice to meet (you|u)\b/i,
  /\bwhere are (you|u) (from|located|based|calling from)\b/i,
  /\bany questions\b/i,
  /\bdo you have questions\b/i,
];

// Comprehensive multilingual question starters (English + Indic transliterations + Indic native scripts + Global)
const Q_STARTERS = /^(who|what|when|where|why|how|which|whose|whom|can|could|would|will|shall|should|is|are|was|were|do|does|did|have|has|kya|kaise|kyu|kyon|kab|kahan|kidhar|kaun|kon|enti|emiti|ela|enduku|eppudu|ekkada|evaru|edi|enna|eppadi|yen|yaen|eppothu|engu|yaar|ethu|kay|kase|kasa|kashi|kadhi|kuthe|shu|shun|kem|kyare|kyan|enu|hege|yake|yaake|yavaga|elli|yaaru|entha|enthanu|engane|enthukondu|eppol|evide|aaru|ki|কী|কেন|কিভাবে|কেমন|কখন|কোথায়|क्या|कौन|कब|कहाँ|कहां|क्यों|कैसे|किसका|कितना|कितने|बताइए|समझाइए|ఏమిటి|ఏంటి|ఎలా|ఎందుకు|ఎప్పుడు|ఎక్కడ|ఎవరు|ఏది|ఎంత|చెప్పండి|వివరించండి|என்ன|எப்படி|ஏன்|எப்போது|எங்கே|யார்|எது|சொல்லுங்கள்|விளக்குங்கள்|काय|कसे|कधी|कुठे|कोण|सांगा|स्पष्ट\s+करा|શું|કેમ|ક્યારે|ક્યાં|કોણ|કહો|સમજાવો|ಏನು|ಹೇಗೆ|ಯಾಕೆ|ಯಾವಾಗ|ಎಲ್ಲಿ|ಯಾರು|ಹೇಳಿ|ವಿವರಿಸಿ|എന്താണ്|എങ്ങനെ|എന്തുകൊണ്ട്|എപ്പോൾ|എവിടെ|ആര്|പറയൂ|വിശദീകരിക്കൂ|বলুন|ব্যাখ্যা|qué|cómo|por\s+qué|cuál|pourquoi|comment|est-ce\s+que|warum|wie|was\s+ist)(?![\p{L}\p{N}])/iu;

const CMD_STARTERS = /^(please\s+|kindly\s+)?(introduce|explain|describe|define|elaborate|clarify|summarize|summarise|expand on|tell (me|us)|say (me|to me|us|about)?|mention|state (the|its)?|walk (me|us) through|talk about|give (me|us)|show (me|us)|list|compare|what about|how about)(?![\p{L}\p{N}])/iu;

const GREETINGS_AND_SALUTATIONS = /^(?:hello|hi|hey|good\s+morning|good\s+afternoon|good\s+evening|welcome|alright|ok|okay|so)\s+(?:everyone|everybody|all|guys|team|there|folks|people|sir|ma'am|class|here|now)?\s*[,.!?]?\s*$/i;

// Indian languages follow SOV (Subject-Object-Verb) grammar where question words often occur mid-sentence or sentence-final.
// Note: In JavaScript regex, \b is ASCII-only. Use (?<![\p{L}\p{N}]) and (?![\p{L}\p{N}]) for Unicode word boundaries.
const MULTILINGUAL_QUESTION_CONTAINS = [
  // Telugu
  /(?<![\p{L}\p{N}])(ఏమిటి|ఏంటి|ఎలా|ఎందుకు|ఎప్పుడు|ఎక్కడ|ఎవరు|ఏది|ఏవి|ఎంత|ఎన్ని|చెప్పండి|వివరించండి|తేడా|సంగతేంటి|గురించి\s+చెప్పండి|గురించి\s+మాట్లాడండి)(?![\p{L}\p{N}])/iu,
  // Hindi
  /(?<![\p{L}\p{N}])(क्या|कैसे|क्यों|कब|कहाँ|कहां|किधर|कौन|किसका|किसे|कितना|कितनी|कितने|बताइए|समझाइए|अंतर|के\s+बारे\s+में\s+बताएं|समझाएं)(?![\p{L}\p{N}])/iu,
  // Tamil
  /(?<![\p{L}\p{N}])(என்ன|எப்படி|ஏன்|எப்போது|எங்கே|யார்|எது|எவை|எவ்வளவு|எத்தனை|சொல்லுங்கள்|விளக்குங்கள்|வித்தியாசம்|பற்றி\s+சொல்லுங்கள்)(?![\p{L}\p{N}])/iu,
  // Marathi
  /(?<![\p{L}\p{N}])(काय|कसे|कसा|कशी|का|कधी|कुठे|कोण|कोणाचा|किती|सांगा|स्पष्ट\s+करा|फरक|बद्दल\s+सांगा)(?![\p{L}\p{N}])/iu,
  // Gujarati
  /(?<![\p{L}\p{N}])(શું|કેવી\s+રીતે|કેમ|ક્યારે|ક્યાં|કોણ|કેટલું|કેટલા|કહો|સમજાવો|તફાવત|વિશે\s+વાત\s+કરો)(?![\p{L}\p{N}])/iu,
  // Kannada
  /(?<![\p{L}\p{N}])(ಏನು|ಹೇಗೆ|ಯಾಕೆ|ಯಾವಾಗ|ಎಲ್ಲಿ|ಯಾರು|ಯಾವುದು|ಎಷ್ಟು|ಹೇಳಿ|ವಿವರಿಸಿ|ವ್ಯತ್ಯಾಸ|ತಿಳಿಸಿ|ಬಗ್ಗೆ\s+ಹೇಳಿ)(?![\p{L}\p{N}])/iu,
  // Malayalam
  /(?<![\p{L}\p{N}])(എന്താണ്|എങ്ങനെ|എന്തുകൊണ്ട്|എപ്പോൾ|എവിടെ|ആര്|ഏത്|എത്ര|പറയൂ|വിശദീകരിക്കൂ|വ്യത്യാസം|കുറിച്ച്\s+പറയൂ)(?![\p{L}\p{N}])/iu,
  // Bengali
  /(?<![\p{L}\p{N}])(কি|কী|কেন|কিভাবে|কেমন|কখন|কোথায়|কে|কার|কত|বলুন|ব্যাখ্যা\s+করুন|পার্থক্য|সম্পর্কে\s+বলুন)(?![\p{L}\p{N}])/iu,
  // Transliterated Indic
  /\b(kya\s+hai|kya\s+hota\s+hai|kaise\s+kare|kaise\s+hota|kyu\s+hota|bataiye|samjhaiye|antar\s+kya\s+hai|emiti|enti|ela\s+chestaru|enduku|eppudu|ekkada|evaru|cheppandi|vivarinchandi|theda\s+emiti|teda\s+enti|enna\s+vithiyasam|vilakkungal|sollungal|eppadi|yake|hege|enu|parayoo|kibhabe|parthokko\s+ki)\b/i,
  // Global / European
  /\b(cuál\s+es|por\s+qué|cómo\s+funciona|qu'est-ce\s+que|comment\s+faire|was\s+ist\s+der\s+unterschied|erklären\s+sie)\b/i,
  /(?:か？|でしょうか|ですか|について説明して)/u
];

// Indic verbal suffixes signifying a question or prompt
const INDIC_QUESTION_SUFFIXES = /(?:చేస్తారా|చేయగలరా|ఉందా|గలరా|చెప్తారా|సంగతేంటి|முடியுமா|இருக்கிறதா|சாத்தியமா|सांगाल\s+का|शकता\s+का|આવડશે|કરશો|ತಿಳಿಸಿ|ಮಾಡಬಹುದೇ|കഴിയുമോ|ചെയ്യുമോ|পারবেন\s+কি)\s*[.!?]?$/iu;

const NUMBER_WORDS = {
  zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14',
  fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19',
  twenty: '20', thirty: '30', forty: '40', fifty: '50', sixty: '60',
  seventy: '70', eighty: '80', ninety: '90', hundred: '100', thousand: '1000'
};

function normalizeNumbersAndMath(text) {
  if (!text || typeof text !== 'string') return text;
  let s = text;

  // Replace spoken math operators with standard symbols
  s = s.replace(/\bplus\b/gi, '+')
       .replace(/\bminus\b/gi, '-')
       .replace(/\b(?:times|multiplied\s+by)\b/gi, '*')
       .replace(/\b(?:divided\s+by|over)\b/gi, '/');

  // Replace word numbers around math operators or in calculation queries
  const isCalcContext = /[\+\-\*\/=]|\b(?:what\s+is|calculate|solve|evaluate|compute)\b/i.test(s);
  if (isCalcContext) {
    for (const [word, num] of Object.entries(NUMBER_WORDS)) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      s = s.replace(regex, num);
    }
  }

  // Clean up spacing around arithmetic operators: e.g. "8  +  1" -> "8 + 1"
  s = s.replace(/(\d+)\s*([\+\-\*\/])\s*(\d+)/g, '$1 $2 $3');

  return s;
}

function isMathematicalQuestion(text) {
  if (!text || typeof text !== 'string') return false;
  const normalized = normalizeNumbersAndMath(text).trim();

  // Pattern 1: Pure arithmetic expressions like "8 + 1", "8 + 1?", "25 * 4", "100 / 5 = ?", etc.
  const arithmeticRegex = /^\s*(?:what\s+is\s+|calculate\s+|solve\s+|compute\s+|evaluate\s+)?(?:\(?\s*-?\d+(?:\.\d+)?\s*\)?\s*[\+\-\*\/\^%]\s*)+\(?\s*-?\d+(?:\.\d+)?\s*\)?\s*(?:=\s*\??|\?)?\s*$/i;
  if (arithmeticRegex.test(normalized)) return true;

  // Pattern 2: Mathematical question sentences like "what is 8 plus 1", "what is the sum of 5 and 10", "calculate square root of 64"
  const mathPhrases = /\b(?:what\s+is|calculate|solve|evaluate|compute|find)\s+(?:the\s+)?(?:sum|difference|product|quotient|result|value|square\s+root|cube\s+root|percentage)\b/i;
  if (mathPhrases.test(normalized)) return true;

  // Pattern 3: Algebra / equations like "solve 2x + 5 = 15" or "solve for x: 3x - 9 = 0"
  const algebraRegex = /\b(?:solve|equation|formula)\b.*[a-z]\s*[\+\-\*\/=]/i;
  if (algebraRegex.test(normalized)) return true;

  return false;
}

function isInterviewQuestion(text, isSubSentence = false, language = 'en') {
  if (!text || typeof text !== 'string') return false;

  const mathNormalized = normalizeNumbersAndMath(text);
  if (isMathematicalQuestion(mathNormalized)) {
    return true;
  }

  const lower = text.toLowerCase();
  if (lower.includes('whatsapp') || lower.includes('what app') || lower.includes('whats app') || lower.includes("what's app") || lower.includes('what up') || lower.includes('whats up') || lower.includes("what's up")) {
    return false;
  }

  let normalized = text
    .replace(/\bwhat's\b/gi, 'what is').replace(/\bwhats\b/gi, 'what is')
    .replace(/\bwho's\b/gi, 'who is').replace(/\bhow's\b/gi, 'how is')
    .replace(/\bwhere's\b/gi, 'where is').replace(/\bwhy's\b/gi, 'why is')
    .replace(/\bit's\b/gi, 'it is').replace(/\bthat's\b/gi, 'that is')
    .replace(/\bthere's\b/gi, 'there is').replace(/\bhere's\b/gi, 'here is');

  const trimmed = normalized.trim().replace(/\s+/g, ' ');

  // Quick greetings and conversational salutations filter
  if (GREETINGS_AND_SALUTATIONS.test(trimmed)) return false;
  if (MULTILINGUAL_GREETINGS_AND_FILLERS.some(p => p.test(trimmed))) return false;

  const REPORTED_OR_STATEMENT_PATTERNS = [
    /\b(will|going to|would|could|can|they|he|she|we|i)\s+(?:be\s+)?(ask|asking|expect|expecting)\b/i,
    /\b(expect|expected|expecting|types of|kind of|kinds of|example of|examples of)\s+(?:interview\s+)?(question|questions)\b/i,
    /\b(questions|question)\s+(?:we|they|he|she|you)\s+(?:can|will|should|might|may)\s+expect\b/i,
    /\b(questions|question)\s+(?:they|he|she|we)\s+(?:ask|asks|asking|asked)\b/i,
    /\basking\s+(?:me|us|you|them|him|her)?\s*about\b/i,
    /\bask\s+(?:me|us|you|them|him|her)?\s*about\b/i,
    /\bwant to ask\b/i, /\bwants to ask\b/i, /\bwanted to ask\b/i,
  ];
  if (REPORTED_OR_STATEMENT_PATTERNS.some(p => p.test(trimmed))) {
    const hasDirectQuestion = /\b(what is your|what's your|what is|what's|how do you|how does|how to|name\s+(?:three|two|four|five|six|some|any|a|an|the|at\s+least|both|several|different|various))\b/i.test(trimmed);
    if (!hasDirectQuestion) return false;
  }

  if (trimmed.length < 5) return false;

  // Split multi-sentence inputs (handling Indic danda । as well as . ! ?)
  if (!isSubSentence && (trimmed.includes('.') || trimmed.includes('!') || trimmed.includes('?') || trimmed.includes('।'))) {
    const sentences = trimmed.split(/[.!?'"|।\n]+/).map(s => s.trim()).filter(Boolean);
    if (sentences.length > 1) {
      for (const s of sentences) {
        if (s.length >= 8 && isInterviewQuestion(s, true, language)) return true;
      }
    }
  }

  let cleanTextForCheck = trimmed;
  const fillerRegex = /^(?:okay|ok|yes|yeah|yep|sure|alright|right|well|so|and|then|now|perfect|great|um|uh|hello|hi|hey|good morning|good afternoon|good evening|also|actually|basically|like|namaste|vanakkam|namaskaram)\b\s*[,.-]*\s*/i;
  let prevText = '';
  while (cleanTextForCheck !== prevText) {
    prevText = cleanTextForCheck;
    cleanTextForCheck = cleanTextForCheck.replace(fillerRegex, '');
  }
  const checkTrimmed = cleanTextForCheck.trim();
  if (GREETINGS_AND_SALUTATIONS.test(checkTrimmed)) return false;
  if (MULTILINGUAL_GREETINGS_AND_FILLERS.some(p => p.test(checkTrimmed))) return false;
  if (checkTrimmed.length < 4) return false;

  if (CONVERSATIONAL_QUESTIONS.some(p => p.test(trimmed))) {
    const hasStrongQuestion = STRONG_QUESTION_CONTAINS.some(p => p.test(checkTrimmed));
    const isLong = trimmed.length > 40;
    if (!(hasStrongQuestion && isLong)) return false;
  }

  // Universal Question Mark check (? or full-width ？ or inverted ¿)
  if (trimmed.includes('?') || trimmed.includes('？') || trimmed.includes('¿')) {
    if (trimmed.length < 15 && /^(okay|ok|yeah|yes|right|really|సరేనా|ठीक\s+है)\s*[?？]$/iu.test(trimmed)) return false;
    return true;
  }

  if (NON_QUESTION_INDICATORS.some(p => p.test(checkTrimmed))) return false;

  // Indic verbal question endings (e.g. చేస్తారా, ఉందా, முடியுமா)
  if (INDIC_QUESTION_SUFFIXES.test(trimmed) || INDIC_QUESTION_SUFFIXES.test(checkTrimmed)) {
    return true;
  }

  // Indic & Multilingual question words anywhere in the utterance (SOV support)
  if (MULTILINGUAL_QUESTION_CONTAINS.some(p => p.test(checkTrimmed) || p.test(trimmed))) {
    return true;
  }

  const startsWithStatement = STATEMENT_STARTERS.some(p => p.test(checkTrimmed));
  if (startsWithStatement) {
    const hasStrongQuestion = STRONG_QUESTION_CONTAINS.some(p => p.test(checkTrimmed));
    if (!hasStrongQuestion) return false;
  }

  const startsWithQuestionWord = Q_STARTERS.test(checkTrimmed);
  if (startsWithQuestionWord) {
    if (!trimmed.includes('?') && !trimmed.includes('？')) {
      const relativeClauseStarters = [
        /^(what|how|why|when|where|who|which)\s+(?:i|we|you|they|he|she|it|its|it's|my|our|your|their|his|her|first)\b/i,
        /^(what|how|why|when|where|who|which)\s+(?:this|that|these|those)\s+(?:means|is|was|are|were)\b/i,
        /^(what|how|why|when|where|who|which)\s+is\s+(?:going on|happening|needed|required)\b/i,
        /^(what|how|why|when|where|who|which)\s+the\s+\w+\s+(?:does|is|was|are|were|has|have|had)\b/i,
      ];
      if (relativeClauseStarters.some(p => p.test(checkTrimmed))) return false;
      if (checkTrimmed.split(/\s+/).length < 2) return false;
    }
    return true;
  }

  if (STRONG_QUESTION_CONTAINS.some(p => p.test(checkTrimmed))) return true;

  const startsWithCommand = CMD_STARTERS.test(checkTrimmed);
  if (startsWithCommand && checkTrimmed.split(' ').length >= 2) return true;

  const hasTradeoffIndicator = /(?:\b(difference between|differences between|compare and contrast|versus|vs|pros and cons|advantages and disadvantages)\b|(?<![\p{L}\p{N}])(తేడా|अंतर|విத்தியாசம்|फरक|તફાવત|ವ್ಯತ್ಯಾಸ|വ്യത്യാസം|পার্থক্য)(?![\p{L}\p{N}]))/iu.test(checkTrimmed);
  if (hasTradeoffIndicator && checkTrimmed.split(' ').length >= 2) return true;

  return false;
}

/**
 * Lightweight LLM-based question classifier fallback for non-English transcripts
 * when regex confidence is low.
 */
async function classifyInterviewQuestion(question, language = 'en') {
  if (!question || typeof question !== 'string') return false;
  const trimmed = question.trim();
  if (trimmed.length < 5) return false;

  // 1. Immediate regex pass
  if (isInterviewQuestion(trimmed, false, language)) return true;

  // 2. Filter obvious greetings / non-questions
  if (MULTILINGUAL_GREETINGS_AND_FILLERS.some(p => p.test(trimmed))) return false;
  if (NON_QUESTION_INDICATORS.some(p => p.test(trimmed))) return false;

  initClients();
  const client = groqClient || openaiClient;
  if (!client) {
    // If no LLM client is available, default to true for substantive utterances to prevent dropping questions
    return trimmed.length >= 10;
  }

  try {
    const langConfig = getLanguageConfig(language);
    const model = groqClient ? 'grok-4.20-0309-non-reasoning' : 'gpt-4o-mini';
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: `You are a binary intent classifier for job interviews.
Determine whether the following text spoken in ${langConfig.name} is an interview question, prompt, or technical exercise for the candidate to answer.
Respond with ONLY "YES" or "NO". Do not output anything else.`
        },
        { role: 'user', content: trimmed }
      ],
      max_tokens: 5,
      temperature: 0.0
    });

    const reply = response.choices?.[0]?.message?.content?.trim().toUpperCase() || '';
    return reply.startsWith('YES');
  } catch (err) {
    console.warn('[copilotEngine] classifyInterviewQuestion fallback error:', err.message);
    return trimmed.length >= 12;
  }
}

// ─────────────────────────────────────────
// System Prompts & Multilingual Generation
// ─────────────────────────────────────────

const SYSTEM_PROMPT_A = `You are an expert interview coach. Give highly detailed, comprehensive, and thorough answers in US English that demonstrate a deep and complete understanding of the topic. Focus on explaining the "why" and "how" in depth. Elaborate on key concepts, best practices, underlying architectures, and edge cases to provide complete, top-tier responses. If the question is a follow-up or uses pronouns/contextual references (e.g., 'say me the advantages of it', 'advantages of it', 'how does that compare', 'explain its features'), resolve the subject from the preceding conversation context and provide an authoritative, self-contained answer clearly naming the subject (e.g. 'Advantages of Python include:...'). If the question is a mathematical, arithmetic, or quantitative calculation (e.g., '8 + 1', 'what is 25 * 4', solving an equation), you MUST state the exact direct final answer clearly and prominently on the first line (e.g. '8 + 1 = 9'), followed by a step-by-step breakdown or explanation. Do NOT use markdown symbols like asterisks (**) or headers (###). Present text cleanly in plain layout. If multiple questions are asked in a list, you MUST answer each question in the list clearly, prefixing each answer with its corresponding number (e.g. 1. [Answer for question 1], 2. [Answer for question 2]) with clean line breaks between them.`;

const SYSTEM_PROMPT_B = `You are an expert interview coach. Provide a clear, direct, and concise explanation of the concept (around 3-4 sentences). If the question is a follow-up or uses pronouns/contextual references (e.g., 'say me the advantages of it', 'advantages of it', 'explain its features'), resolve the subject from the preceding conversation context and provide a direct answer naming the subject (e.g. 'Advantages of Python include:...'). If the question is a mathematical, arithmetic, or quantitative calculation (e.g., '8 + 1', 'what is 25 * 4'), state the direct calculated answer immediately and concisely on the first line (e.g. '8 + 1 = 9'). Do NOT overcomplicate simple arithmetic. If the question requires, benefits from, or asks for an example (such as a code snippet or practical real-world scenario), you MUST provide a concrete example labeled under a plain "Example:" heading. If the question does not require or benefit from an example, do NOT include one. Do NOT use markdown symbols like asterisks (**) or headers (###). Present text cleanly in plain layout.`;

/**
 * Streams AI answer for a detected interview question.
 * Calls onChunk(text, panel) for each streamed chunk.
 * Calls onDone(panel) when the stream is complete.
 */
async function generateAnswerStreaming(question, panel, onChunk, onDone, onError, history = [], resumeContext = '', language = 'en') {
  initClients();

  const langConfig = getLanguageConfig(language);
  const languageLabel = langConfig.aiResponseLanguage || langConfig.name || 'English';
  const isEnglish = languageLabel.toLowerCase() === 'english';

  let systemPrompt = '';
  if (isEnglish) {
    systemPrompt = panel === 'b' ? SYSTEM_PROMPT_B : SYSTEM_PROMPT_A;
  } else if (panel === 'b') {
    systemPrompt = `You are an expert interview coach. Provide a clear, direct, and concise explanation of the concept (around 3-4 sentences) in ${languageLabel}. You MUST respond entirely and fluently in ${languageLabel}. If the question is a follow-up or uses contextual references, resolve the subject from context and clearly state it in ${languageLabel}. If the question is a calculation, state the calculated answer immediately. If the question requires an example, provide a concrete example labeled under a plain "Example:" heading. Keep standard programming identifiers and technical terms in English where standard in software engineering, but all conversational explanations and sentences must be in natural, fluent ${languageLabel}. Do NOT use markdown asterisks (**) or headers (###). Present text cleanly in plain layout.`;
  } else {
    systemPrompt = `You are an expert interview coach. Give highly detailed, comprehensive, and thorough answers in ${languageLabel} that demonstrate a deep and complete understanding of the topic. You MUST respond entirely and fluently in ${languageLabel}, using natural grammar and professional tone. Focus on explaining the "why" and "how" in depth. Elaborate on key concepts, best practices, underlying architectures, and edge cases. Preserve standard programming language keywords, API names, and code syntax in English where standard in software engineering, but write all explanations and descriptions in fluent ${languageLabel}. If the question is a calculation, state the exact answer on the first line. Do NOT use markdown symbols like asterisks (**) or headers (###). Present text cleanly in plain layout. If multiple questions are asked, number each answer clearly.`;
  }

  const intent = classifyIntent(question);
  const intentPrompt = buildSystemPrompt(intent, panel === 'b' ? 'concise' : 'detailed');
  const maxTokens = 1200;

  let providers = [];
  const grokModel = 'grok-4.20-0309-non-reasoning';
  if (panel === 'a') {
    if (groqClient) {
      providers.push({ client: groqClient, model: grokModel, name: 'Grok' });
    }
    if (openaiClient) {
      providers.push({ client: openaiClient, model: 'gpt-4o-mini', name: 'OpenAI' });
    }
  } else {
    if (openaiClient) {
      providers.push({ client: openaiClient, model: 'gpt-4o-mini', name: 'OpenAI' });
    }
    if (groqClient) {
      providers.push({ client: groqClient, model: grokModel, name: 'Grok' });
    }
  }

  if (providers.length === 0) {
    onError('No AI API key configured on server.');
    return;
  }

  const resumePrompt = buildResumeContextPrompt(question, resumeContext);
  const languageInstruction = isEnglish
    ? ''
    : `\n\nCRITICAL LANGUAGE REQUIREMENT: The interview is conducted in ${languageLabel}. You MUST respond strictly and fluently in ${languageLabel}. Keep the wording natural, professional, and clear in ${languageLabel}.`;
  const apiMessages = [
    { role: 'system', content: `${systemPrompt}\n\n${intentPrompt}${resumePrompt}${languageInstruction}` }
  ];

  if (history && Array.isArray(history) && history.length > 0) {
    const recentHistory = history.slice(-3);
    for (const item of recentHistory) {
      if (item && item.question) {
        apiMessages.push({ role: 'user', content: item.question });
        if (item.answer) {
          const snippet = item.answer.length > 300 ? item.answer.slice(0, 300) + '...' : item.answer;
          apiMessages.push({ role: 'assistant', content: snippet });
        }
      }
    }
  }

  apiMessages.push({ role: 'user', content: question });

  for (const { client, model, name } of providers) {
    try {
      const stream = await client.chat.completions.create({
        model,
        messages: apiMessages,
        max_tokens: maxTokens,
        temperature: 0.5,
        stream: true,
      });

      let full = '';
      let lastSentTime = 0;
      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content ?? '';
        if (content) {
          full += content;
          const now = Date.now();
          if (now - lastSentTime > 60) {
            const cleanFull = full.replace(/\*\*/g, '').replace(/###/g, '').replace(/##/g, '');
            onChunk(cleanFull, panel);
            lastSentTime = now;
          }
        }
      }
      const cleanFull = full.replace(/\*\*/g, '').replace(/###/g, '').replace(/##/g, '');
      onChunk(cleanFull, panel);
      onDone(panel);
      return;
    } catch (err) {
      console.warn(`[copilotEngine] ${name} failed for panel ${panel}:`, err.message);
    }
  }
  onError(`All AI providers failed for panel ${panel}.`);
}

// ─────────────────────────────────────────
// Notetaker AI & Translation Helpers
// ─────────────────────────────────────────

function getLanguageCode(langName) {
  if (!langName) return 'en';
  return getLanguageConfig(langName).code;
}

function mapToSarvamLangCode(langName) {
  const code = getLanguageCode(langName);
  return `${code}-IN`;
}

async function translateText(text, fromLanguage, toLanguage, engine = 'google') {
  if (!text || !text.trim()) return '';
  if (fromLanguage === toLanguage) return text;

  const selectedEngine = engine || 'google';

  if (selectedEngine === 'google') {
    try {
      const sl = getLanguageCode(fromLanguage);
      const tl = getLanguageCode(toLanguage);
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const translated = json[0].map(x => x[0]).join('');
        if (translated) return translated;
      }
    } catch (err) {
      console.error('[Google Translation] failed:', err.message);
    }
  }

  if (selectedEngine === 'sarvam') {
    try {
      const sl = mapToSarvamLangCode(fromLanguage);
      const tl = mapToSarvamLangCode(toLanguage);
      const apiKey = process.env.SARVAM_API_KEY;
      if (apiKey) {
        const res = await fetch('https://api.sarvam.ai/translate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-subscription-key': apiKey
          },
          body: JSON.stringify({
            input: text,
            source_language_code: sl,
            target_language_code: tl,
            model: 'mayura:v1'
          })
        });
        if (res.ok) {
          const json = await res.json();
          if (json.translated_text) return json.translated_text;
        }
      }
    } catch (err) {
      console.error('[Sarvam Translation] failed:', err.message);
    }
  }

  initClients();
  const client = groqClient || openaiClient;
  if (client) {
    try {
      const model = groqClient ? 'grok-4.20-0309-non-reasoning' : 'gpt-4o-mini';
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: `Translate the text from ${fromLanguage} to ${toLanguage}. Output ONLY the translated text.` },
          { role: 'user', content: text }
        ]
      });
      return response.choices?.[0]?.message?.content?.trim() || text;
    } catch (_) {}
  }

  return text;
}

function cleanAiOutput(text) {
  if (!text || typeof text !== 'string') return text || '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/###\s*/g, '')
    .replace(/##\s*/g, '')
    .replace(/#\s*/g, '')
    .replace(/\*\*/g, '')
    .trim();
}

async function generateNotes(transcript, spokenLanguage, targetLanguage) {
  initClients();
  if (!transcript || !transcript.trim()) return 'No speech was detected during the recording session.';

  const spLang = String(spokenLanguage || 'English').trim();
  const tgLang = String(targetLanguage || spLang).trim();
  const isSameLanguage = spLang.toLowerCase() === tgLang.toLowerCase();

  let providers = [];
  if (openaiClient) providers.push({ client: openaiClient, model: 'gpt-4o-mini', name: 'OpenAI' });
  if (groqClient) providers.push({ client: groqClient, model: 'grok-4.20-0309-non-reasoning', name: 'Grok' });

  const languageInstruction = isSameLanguage
    ? `Output clean, professional meeting notes in "${spLang}".`
    : `Generate meeting notes in BOTH "${spLang}" and "${tgLang}". You MUST output exactly two labeled sections:
1. [${spLang}] Summary:
2. [${tgLang}] Summary:`;

  const systemPrompt = `You are an expert AI meeting assistant and note taker.
Your job is to read the transcript of what was spoken and generate concise, professional meeting notes.
${languageInstruction}
CRITICAL INSTRUCTIONS:
1. Do NOT output "You:", "Speaker:", "Interviewer:", or conversational filler (such as "hi", "okay", "what happened").
2. Do NOT output raw transcript lines.
3. Summarize key discussion topics, decisions, action items, and technical updates.
4. If two languages are requested, both sections must be present even if the transcript is already in one of them.
5. Do NOT use markdown symbols like asterisks (**) or hashes (###). Never output double asterisks around headings. Write headings plainly followed by a colon without any asterisks.`;

  const queryText = isSameLanguage
    ? `Transcript:
${transcript}

Generate professional meeting notes in ${spLang}:`
    : `Transcript:
${transcript}

Generate professional meeting notes in BOTH languages (${spLang} and ${tgLang}) with both sections:`;

  for (const { client, model, name } of providers) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: queryText }
        ],
        max_tokens: 1500,
        temperature: 0.3
      });
      const content = response.choices?.[0]?.message?.content?.trim();
      if (content) return cleanAiOutput(content);
    } catch (err) {
      console.warn(`[copilotEngine] generateNotes error from ${name} (${model}):`, err.message);
    }
  }

  // Direct Grok fetch fallback to ensure LLM generation NEVER falls back to raw transcript
  try {
    const fallbackKey = process.env.GROQ_API_KEY;
    if (fallbackKey) {
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${fallbackKey}`
        },
        body: JSON.stringify({
          model: 'grok-4.20-0309-non-reasoning',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: queryText }
          ],
          max_tokens: 1500,
          temperature: 0.3
        })
      });
      const data = await res.json();
      if (res.ok && data.choices && data.choices[0]?.message?.content) {
        return cleanAiOutput(data.choices[0].message.content.trim());
      }
    }
  } catch (e) {
    console.error('[copilotEngine] Direct Groq fetch fallback error:', e.message);
  }

  return 'No notes generated.';
}

async function generateNotetakerChatReply(message, history) {
  initClients();
  if (!message || !message.trim()) return '';

  let providers = [];
  if (openaiClient) providers.push({ client: openaiClient, model: 'gpt-4o-mini', name: 'OpenAI' });
  if (groqClient) providers.push({ client: groqClient, model: 'grok-4.20-0309-non-reasoning', name: 'Grok' });

  const systemPrompt = `You are a helpful AI Interview Copilot. The user is in the middle of a job interview or preparing for one. Answer their question or request clearly, concisely, and professionally to help them succeed. Do not use markdown formatting like asterisks (**) or hashes (###). Present text cleanly in plain layout.`;

  const apiMessages = [{ role: 'system', content: systemPrompt }];

  if (history && Array.isArray(history)) {
    const recentHistory = history.slice(-10);
    recentHistory.forEach(msg => {
      if (msg.sender === 'user') apiMessages.push({ role: 'user', content: msg.text });
      else if (msg.sender === 'ai') apiMessages.push({ role: 'assistant', content: msg.text });
    });
  }

  apiMessages.push({ role: 'user', content: message });

  for (const { client, model, name } of providers) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 600
      });
      const content = response.choices?.[0]?.message?.content?.trim();
      if (content) return cleanAiOutput(content);
    } catch (err) {
      console.warn(`[copilotEngine] generateNotetakerChatReply error from ${name} (${model}):`, err.message);
    }
  }

  return 'I am listening and taking notes of your interview session.';
}

module.exports = {
  isInterviewQuestion,
  classifyInterviewQuestion,
  isPersonalQuestion,
  buildResumeContextPrompt,
  normalizeNumbersAndMath,
  isMathematicalQuestion,
  generateAnswerStreaming,
  generateNotes,
  generateNotetakerChatReply,
  translateText,
  getLanguageCode,
  getLanguageConfig
};
