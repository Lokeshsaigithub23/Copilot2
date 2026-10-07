// ─────────────────────────────────────────
// isInterviewQuestion (Frontend Question Detector)
// Supports English, Indian languages (Telugu, Hindi, Tamil, Marathi, Gujarati, Kannada, Malayalam, Bengali)
// and Global languages with SOV syntax awareness.
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

const Q_STARTERS = /^(who|what|when|where|why|how|which|whose|whom|can|could|would|will|shall|should|is|are|was|were|do|does|did|have|has|kya|kaise|kyu|kyon|kab|kahan|kidhar|kaun|kon|enti|emiti|ela|enduku|eppudu|ekkada|evaru|edi|enna|eppadi|yen|yaen|eppothu|engu|yaar|ethu|kay|kase|kasa|kashi|kadhi|kuthe|shu|shun|kem|kyare|kyan|enu|hege|yake|yaake|yavaga|elli|yaaru|entha|enthanu|engane|enthukondu|eppol|evide|aaru|ki|কী|কেন|কিভাবে|কেমন|কখন|কোথায়|क्या|कौन|कब|कहाँ|कहां|क्यों|कैसे|किसका|कितना|कितने|बताइए|समझाइए|ఏమిటి|ఏంటి|ఎలా|ఎందుకు|ఎప్పుడు|ఎక్కడ|ఎవరు|ఏది|ఎంత|చెప్పండి|వివరించండి|என்ன|எப்படி|ஏன்|எப்போது|எங்கே|யார்|எது|சொல்லுங்கள்|விளக்குங்கள்|काय|कसे|कधी|कुठे|कोण|सांगा|स्पष्ट\s+करा|શું|કેમ|ક્યારે|ક્યાં|કોણ|કહો|સમજાવો|ಏನು|ಹೇಗೆ|ಯಾಕೆ|ಯಾವಾಗ|ಎಲ್ಲಿ|ಯಾರು|ಹೇಳಿ|ವಿವರಿಸಿ|എന്താണ്|എങ്ങനെ|എന്തുകൊണ്ട്|എപ്പോൾ|എവിടെ|ആര്|പറയൂ|വിശദീകരിക്കൂ|বলুন|ব্যাখ্যা|qué|cómo|por\s+qué|cuál|pourquoi|comment|est-ce\s+que|warum|wie|was\s+ist)(?![\p{L}\p{N}])/iu;

const CMD_STARTERS = /^(please\s+|kindly\s+)?(introduce|explain|describe|define|elaborate|clarify|summarize|summarise|expand on|tell (me|us)|walk (me|us) through|talk about|give (me|us)|show (me|us)|list|compare|what about|how about)(?![\p{L}\p{N}])/iu;

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
  // Global
  /\b(cuál\s+es|por\s+qué|cómo\s+funciona|qu'est-ce\s+que|comment\s+faire|was\s+ist\s+der\s+unterschied|erklären\s+sie)\b/i,
  /(?:か？|でしょうか|ですか|について説明して)/u
];

const INDIC_QUESTION_SUFFIXES = /(?:చేస్తారా|చేయగలరా|ఉందా|గలరా|చెప్తారా|సంగతేంటి|முடியுமா|இருக்கிறதா|சாத்தியமா|सांगाल\s+का|शकता\s+का|આવડશે|કરશો|ತಿಳಿಸಿ|ಮಾಡಬಹುದೇ|കഴിയുമോ|ചെയ്യുമോ|পারবেন\s+কি)\s*[.!?]?$/iu;

const NUMBER_WORDS = {
  zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14',
  fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19',
  twenty: '20', thirty: '30', forty: '40', fifty: '50', sixty: '60',
  seventy: '70', eighty: '80', ninety: '90', hundred: '100', thousand: '1000'
};

export function normalizeNumbersAndMath(text) {
  if (!text || typeof text !== 'string') return text;
  let s = text;

  // Replace spoken math operators with standard symbols
  s = s.replace(/\bplus\b/gi, '+')
       .replace(/\bminus\b/gi, '-')
       .replace(/\b(?:times|multiplied\s+by)\b/gi, '*')
       .replace(/\b(?:divided\s+by|over)\b/gi, '/');

  // Replace word numbers around math operators or in calculation queries
  const isCalcContext = /[+\-*/=]|\b(?:what\s+is|calculate|solve|evaluate|compute)\b/i.test(s);
  if (isCalcContext) {
    for (const [word, num] of Object.entries(NUMBER_WORDS)) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      s = s.replace(regex, num);
    }
  }

  // Clean up spacing around arithmetic operators: e.g. "8  +  1" -> "8 + 1"
  s = s.replace(/(\d+)\s*([+\-*/])\s*(\d+)/g, '$1 $2 $3');

  return s;
}

function isMathematicalQuestion(text) {
  if (!text || typeof text !== 'string') return false;
  const normalized = normalizeNumbersAndMath(text).trim();

  // Pattern 1: Pure arithmetic expressions like "8 + 1", "8 + 1?", "25 * 4", "100 / 5 = ?", etc.
  const arithmeticRegex = /^\s*(?:what\s+is\s+|calculate\s+|solve\s+|compute\s+|evaluate\s+)?(?:\(?\s*-?\d+(?:\.\d+)?\s*\)?\s*[+\-*/^%]\s*)+\(?\s*-?\d+(?:\.\d+)?\s*\)?\s*(?:=\s*\??|\?)?\s*$/i;
  if (arithmeticRegex.test(normalized)) return true;

  // Pattern 2: Mathematical question sentences like "what is 8 plus 1", "what is the sum of 5 and 10", "calculate square root of 64"
  const mathPhrases = /\b(?:what\s+is|calculate|solve|evaluate|compute|find)\s+(?:the\s+)?(?:sum|difference|product|quotient|result|value|square\s+root|cube\s+root|percentage)\b/i;
  if (mathPhrases.test(normalized)) return true;

  // Pattern 3: Algebra / equations like "solve 2x + 5 = 15" or "solve for x: 3x - 9 = 0"
  const algebraRegex = /\b(?:solve|equation|formula)\b.*[a-z]\s*[+\-*/=]/i;
  if (algebraRegex.test(normalized)) return true;

  return false;
}

export function isInterviewQuestion(text, isSubSentence = false, language = 'en') {
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

  // Indic verbal question endings
  if (INDIC_QUESTION_SUFFIXES.test(trimmed) || INDIC_QUESTION_SUFFIXES.test(checkTrimmed)) {
    return true;
  }

  // Mid-sentence or sentence-final question words (SOV grammar support)
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

  const hasTradeoffIndicator = /(?:\b(difference between|differences between|compare and contrast|versus|vs|pros and cons|advantages and disadvantages)\b|(?<![\p{L}\p{N}])(తేడా|अंतर|வித்தியாசம்|फरक|તફાવત|ವ್ಯತ್ಯಾಸ|വ്യത്യാസം|পার্থক্য)(?![\p{L}\p{N}]))/iu.test(checkTrimmed);
  if (hasTradeoffIndicator && checkTrimmed.split(' ').length >= 2) return true;

  return false;
}
