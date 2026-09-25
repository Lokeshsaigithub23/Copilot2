'use strict';

// intentClassifier.js — Universal Interview Intent Classifier
// TYPE: CONCEPTUAL|CODING|MATHEMATICAL|ANALYTICAL|BEHAVIOURAL|SITUATIONAL|CONVERSATIONAL|UNCLEAR
// DOMAIN: SOFTWARE|MEDICAL|LEGAL|FINANCE|MANAGEMENT|GENERAL


const CODING_SIGNALS = [
  /\b(write|implement|create|build|develop|design|code|program|make)\s+(a|an|the)?\s*(function|method|class|program|script|algorithm|solution|code|snippet)\b/i,
  /\b(function|method|class|program|script|algorithm)\s+(to|that|which|for)\b/i,
  /\b(in\s+)?(python|java|javascript|js|typescript|ts|c\+\+|cpp|c#|csharp|rust|ruby|php|swift|kotlin|scala|matlab)\b/i,
  /\b(golang|go\s+lang|go\s+language|go\s+programming|written\s+in\s+go|using\s+go|r\s+language|r\s+programming|in\s+r\s+language)\b/i, // FIX: "go"/"r" alone collide with common English words
  /\bwrite\s+(a\s+)?(regex|query|sql|api|endpoint|test|unit\s+test)\b/i,
  /\b(given\s+an?\s+array|given\s+a\s+(string|list|tree|graph|matrix|number))\b/i,
  /\bhow\s+(do\s+you\s+)?(implement|code|write|build|create)\b/i,
  /\bfind\s+(all\s+)?(duplicates|pairs|elements|nodes|paths)\b/i,
  // FIX: bare task verbs on a data structure/algorithm noun — "reverse a linked
  // list", "sort an array" — are clearly coding tasks even without "write/implement".
  /\b(reverse|sort|merge|rotate|traverse|flatten|balance|invert|serialize|deserialize|deduplicate)\s+(a|an|the|two)?\s*\w{0,15}\s*(linked\s+list|array|string|tree|binary\s+tree|graph|matrix|stack|queue|list|bst)\b/i,
  /\b(detect|remove|delete)\s+(a\s+|the\s+)?(cycle|loop|duplicate|duplicates)\b/i,
  // NOTE: "code" / "program" alone are intentionally NOT here — they cause too many false positives
];

//
// Two-tier design to avoid over-triggering on ordinary English:
// - STRONG verbs (reverse/sort/merge/traverse/...) are rarely used outside a
//   coding context, so they combine with ANY CS-flavored noun, even a bare,
//   linguistically-ambiguous one like "list".
// - GENERIC verbs (find/check/print/remove/...) are common in everyday
//   English too ("check the guest list"), so they only count when paired
//   with an UNAMBIGUOUS compound CS term (e.g. "binary tree", not bare "list").
const STRONG_CODING_VERBS = /\b(reverse|sort|merge|rotate|traverse|flatten|balance|invert|serialize|deserialize|deduplicate|detect)\b/i;
const GENERIC_TASK_VERBS = /\b(write|implement|create|build|develop|design|code|program|make|find|print|optimize|remove|delete|check|validate|calculate|count|search|solve|compute|convert|parse)\b/i;

const STRONG_CS_NOUNS = /\b(linked\s+list\w*|array\w*|binary\s+search\s+tree\w*|binary\s+tree\w*|avl\s+tree\w*|graph\w*|matrix|matrices|stack\w*|queue\w*|hash\s*map\w*|hash\s*table\w*|heap\w*|trie\w*|recursion\w*|dynamic\s+programming|palindrome\w*|anagram\w*|subsequence\w*|substring\w*|duplicate\w*|cycle\w*|permutation\w*|combination\w*|sliding\s+window\w*|backtracking|greedy|memoization|lru\s+cache\w*|priority\s+queue\w*|dequeue\w*|deque\w*|union\s+find|segment\s+tree\w*|fenwick\s+tree\w*|bit\s+manipulation|bitwise|algorithm\w*)\b/i;
const AMBIGUOUS_CS_NOUNS = /\b(list\w*|string\w*|cache\w*|node\w*|pointer\w*|tree\w*|loop\w*)\b/i; // common English words too — need a strong verb to count

function isGeneralizedCodingTask(text) {
  const hasStrongVerb = STRONG_CODING_VERBS.test(text);
  const hasGenericVerb = GENERIC_TASK_VERBS.test(text);
  const hasStrongNoun = STRONG_CS_NOUNS.test(text);
  const hasAmbiguousNoun = AMBIGUOUS_CS_NOUNS.test(text);
  return (hasStrongVerb && (hasStrongNoun || hasAmbiguousNoun)) || (hasGenericVerb && hasStrongNoun);
}

const MATH_SIGNALS = [
  /^\s*-?\d[\d\s\+\-\*\/\^\(\)\.%,]*[\+\-\*\/\^%]\s*\d[\d\s\+\-\*\/\^\(\)\.%,]*\s*=?\s*\??\s*$/,
  /\b(calculate|compute|evaluate|solve|find\s+the\s+(value|result|answer|sum|product|difference|quotient))\b/i,
  /\b(what\s+is\s+\d|what\s+are\s+\d|\d+\s*[\+\-\*\/]\s*\d+)\b/i,
  /\b(factorial|fibonacci|prime|square\s+root|cube\s+root|logarithm|exponent|percentage\s+of|percent\s+of|derivative|integral|probability\s+of)\b/i,
  /\b(equation|formula|theorem|proof|matrix\s+multiplication|determinant|eigenvalue)\b/i,
  /\bsolve\s+(for\s+)?(x|y|z|n)\b/i,
  /\b(\d+\s*(plus|minus|times|multiplied\s+by|divided\s+by|over|mod)\s*\d+)\b/i,
  /\b(drug\s+dose|dosage|calculate\s+the\s+(dose|bmi|gfr|creatinine|apgar|glasgow))\b/i,
  /\b(npv|irr|roi|cagr|compound\s+interest|simple\s+interest|depreciation|amortization)\b/i,
];

const ANALYTICAL_SIGNALS = [
  /\b(compare|contrast|difference\s+between|differences\s+between|distinguish|differentiate)\b/i,
  /\b(pros\s+and\s+cons|advantages\s+and\s+disadvantages|benefits\s+and\s+drawbacks)\b/i,  // FIX: explicit match
  /\b(versus|vs\.?)\b/i,
  /\b(analyze|analyse|evaluate|assess|critique|review|examine|investigate)\b/i,
  /\b(which\s+is\s+better|which\s+would\s+you\s+(prefer|choose|use|recommend))\b/i,
  /\b(trade.?off|when\s+would\s+you\s+use|why\s+would\s+you\s+(choose|prefer|use|pick))\b/i,
  /\b(list\s+(the\s+)?(advantages|disadvantages|pros|cons|benefits|drawbacks|limitations|challenges|differences))\b/i,
];

const BEHAVIOURAL_SIGNALS = [
  /\b(tell\s+me\s+about\s+yourself|introduce\s+yourself)\b/i,
  /\b(describe\s+a\s+time|tell\s+me\s+about\s+a\s+time|give\s+(me\s+)?an\s+example\s+of|share\s+an\s+experience)\b/i,
  /\b(where\s+do\s+you\s+see\s+yourself|where\s+do\s+you\s+want\s+to\s+be)\s+(in\s+)?\d+\s+year/i,
  /\b(what\s+are\s+your\s+(strengths?|weaknesses?|skills?|qualities|hobbies|interests?))\b/i,
  /\b(greatest\s+(strength|weakness|achievement|accomplishment|failure|challenge|mistake))\b/i,
  /\b(strengths?\s+and\s+weaknesses?|weaknesses?\s+and\s+strength)\b/i,
  /\b(why\s+(should\s+we\s+hire|do\s+you\s+want\s+to\s+(join|work)|are\s+you\s+(leaving|interested)|did\s+you\s+leave))\b/i,
  /\b(how\s+do\s+you\s+(handle|deal\s+with|manage)\s+(stress|pressure|conflict|criticism|failure|deadlines|difficult))\b/i,
  /\b(what\s+motivates\s+you|what\s+is\s+your\s+motivation|what\s+drives\s+you)\b/i,
  /\b(your\s+(experience|background|journey|career|work\s+history)|walk\s+me\s+through\s+your\s+(resume|career|background))\b/i,
  /\b(team\s+conflict|disagreement\s+with|difficult\s+(colleague|manager|client|team\s+member|patient|customer))\b/i,
  /\b(proud\s+of|proudest\s+moment|most\s+challenging|toughest\s+(decision|situation|project))\b/i,
  /\b(leadership\s+(style|example|experience)|led\s+a\s+team|managed\s+a\s+team)\b/i,
  /\b(five\s+year|ten\s+year|long.?term\s+goals?|short.?term\s+goals?|career\s+goals?)\b/i,
  // HINGLISH BEHAVIOURAL patterns
  /\b(apne\s+baare\s+mein\s+(btao|batao|bolo)|apna\s+introduction\s+(do|dein|dijiye))\b/i,
  /\b(aapki\s+(strengths?|weaknesses?|skills?)|apni\s+(strengths?|weaknesses?))\b/i,
  /\b(khud\s+ke\s+baare\s+mein|apne\s+aap\s+ko)\b/i,
  /\b(tell\s+me\s+about\s+a\s+(financial|medical|legal|technical|management)\s+(model|case|project|situation|challenge)\s+you\s+(built|worked|handled|managed|created|solved))\b/i, // "tell me about a financial model you built"
];

const SITUATIONAL_SIGNALS = [
  /\b(what\s+would\s+you\s+do\s+(if|when|in)|how\s+would\s+you\s+(handle|manage|approach|deal\s+with))\b/i,
  /\b(if\s+you\s+(were|are|had|have|found|faced))\b/i,
  /\b(if\s+(the\s+)?(stock\s+market|market|server|system|database|production|deployment|team|client|patient|code)\s+(crashes?|fails?|goes\s+down|breaks?|drops?|collapses?|is\s+down))\b/i, // "if stock market crashes"
  /\b(server|system|database|production|deployment|website|api|app)\s+(is\s+down|crashed|crashes|failed|fails|goes\s+down|is\s+broken)\b/i, // FIX: same idea without requiring a leading "if"
  /\b(suppose|suppose\s+that|imagine|imagine\s+that|let's\s+say|assume|assuming)\b/i,
  /\b(given\s+(this|the|a)\s+scenario|in\s+this\s+situation|in\s+this\s+case)\b/i,
  /\b(a\s+patient\s+(comes|presents|is|has)|a\s+client\s+(comes|approaches|calls))\b/i,
  /\b(what\s+steps\s+would\s+you\s+take|what\s+is\s+your\s+(plan|strategy|approach|course\s+of\s+action|first\s+step))\b/i,
  /\b(how\s+would\s+you\s+(diagnose|treat|defend|argue|handle|resolve|manage|fix|address|design|architect|build|scale))\b/i,
  /\b(walk\s+me\s+through\s+(how\s+you\s+would|your\s+approach|the\s+steps))\b/i,
  /\b(scenario\s+(where|in\s+which)|hypothetically|theoretically)\b/i,
  /\b(emergency|urgent\s+situation|critical\s+case|worst\s+case|best\s+case)\b/i,
  // System design — "how would you design X" → SITUATIONAL
  /\b(how\s+would\s+you\s+design|design\s+a\s+system|system\s+design\s+(for|of)|architect\s+(a|the|an))\b/i,
  // HINGLISH SITUATIONAL patterns
  /\b(agar\s+.{3,40}\s+(ho\s+jaye|fail\s+ho|crash\s+ho|down\s+ho))\b/i,
  /\b((approach|plan)\s+kya\s+hogi|kya\s+karoге|kya\s+step|approach\s+kya)\b/i,
];


const CONCEPTUAL_SIGNALS = [
  /\b(what\s+is|what\s+are|what\s+was|what\s+were)\s+\w+/i,
  /\b(define|definition\s+of|meaning\s+of|what\s+does\s+.{1,40}\s+mean)\b/i,
  /\b(explain\s+\S+)\b/i,
  /\b(how\s+does|how\s+do|how\s+did|how\s+is|how\s+are)\s+\w+/i,
  /\b(describe\s+\S+)\b/i,
  /\b(tell\s+me\s+about\s+\w+|talk\s+about\s+\w+|what\s+do\s+you\s+know\s+about\s+\w+)\b/i,
  /\b(why\s+is|why\s+are|why\s+do|why\s+does|why\s+would)\s+\w+/i,
  /\b(what\s+is\s+the\s+(purpose|role|function|use|importance|significance|concept|principle|mechanism|reason|cause|benefit|advantage|disadvantage)\s*(of|behind|for)?)\b/i,
  /\b(name\s+(the|some|any|three|four|five|six|key|important|main|major|common|different|various))\b/i,
  /\b(list\s+the\s+(types|kinds|examples|uses|applications|components|parts|stages|steps|phases))\b/i,
  /\b(how\s+to\s+\w+|when\s+(should|do|does|would|is|are)\s+\w+)\b/i,
];

const CONVERSATIONAL_SIGNALS = [
  /^(okay|ok|yes|yeah|yep|yup|sure|alright|right|good|great|nice|thanks|thank\s+you|got\s+it|i\s+see|makes\s+sense|understood|noted)\s*[,.!?]?\s*$/i,
  /^(uh|um|hmm|hm|err|ah|oh)\s*$/i,
  /^(hello|hi|hey|good\s+(morning|afternoon|evening|day)|howdy|greetings)\s*[,.!?]?\s*$/i,
  /^(bye|goodbye|see\s+you|take\s+care|thank\s+you\s+for\s+your\s+time)\s*[,.!?]?\s*$/i,
  /^(go\s+ahead|please\s+continue|carry\s+on|proceed)\s*[,.!?]?\s*$/i,
  /\b(can\s+you\s+hear\s+me|am\s+i\s+audible|is\s+my\s+mic|can\s+you\s+see\s+my\s+screen)\b/i,
  /\b(are\s+you\s+there|shall\s+we\s+(start|begin)|are\s+we\s+good\s+to\s+(start|go))\b/i,
  /\b(nice\s+to\s+(meet|see)\s+you|how\s+are\s+you|how's\s+it\s+going)\b/i,
  /\b(do\s+you\s+have\s+any\s+questions\s+for\s+me|any\s+questions\s+for\s+me)\b/i,
];

// FIX: Statement starters — if text begins with these + no question signal → ignore
const STATEMENT_STARTERS = [
  /^(i\s+(am|was|have|had|work|worked|think|feel|believe|know|want|need|got|made|built|developed|created|did|do)\b)/i,
  /^(i'm|i've|i'd|i'll)\b/i,
  /^(we\s+(are|were|have|had|built|developed|created|work)\b)/i,
  /^(my\s+(name|background|experience|work|project|approach|goal|team)\b)/i,
  /^(in\s+my\s+(opinion|experience|view|background|previous|current)\b)/i,
  /^(from\s+my\s+(experience|perspective|background|point)\b)/i,
  /^(as\s+(a|an|the)\s+(developer|engineer|doctor|lawyer|student|professional|manager|analyst)\b)/i,
];

// Strong question signals that OVERRIDE statement detection
const STRONG_QUESTION_OVERRIDE = [
  /\b(what\s+is|what\s+are|how\s+do|how\s+does|why\s+is|why\s+are|which\s+is|can\s+you\s+explain|explain\s+(the|a|how))\b/i,
  /\b(difference\s+between|compare|pros\s+and\s+cons|advantages|disadvantages|how\s+to\s+implement)\b/i,
  SITUATIONAL_SIGNALS[0], // "what would you do if..."
];


const LEADING_WH_SIGNAL = /^(what|how|why|when|where|who|whom|whose|which)\b/i;
const LEADING_AUX_INVERSION_SIGNAL = /^(do|does|did|can|could|would|should|is|are|was|were|have|has|will|shall|may|might)\s+(you|i|we|it|they|he|she|there)\b/i;
const FILLER_PREFIX = /^(so|okay|ok|alright|now|well|and|but|umm?|uhh?|hmm?)[,]?\s+/i;

const QUESTION_FORM_SIGNALS = [
  LEADING_WH_SIGNAL,
  LEADING_AUX_INVERSION_SIGNAL,
  /,\s*(what|how|why|when|where|who|which)\b/i, // "...so, what made you..."
];

// Generic imperative/instruction verbs interviewers commonly use in place of a
// literal question ("Explain X", "Compare X and Y", "Rate your X", "Reverse a linked list").
const IMPERATIVE_SIGNALS = [
  /^(explain|describe|define|discuss|list|compare|rate|elaborate|share|give|walk|tell|summarize|outline|justify|critique|evaluate|demonstrate|illustrate|write|implement|create|build|develop|design|code|program|make|reverse|sort|find|print|optimize|merge|remove|detect|check|validate|calculate|convert|parse|count|search|solve|compute|analyze|analyse|identify)\b/i,
];

// Short "topic prompt" shorthand very common in interviews: "Thoughts on X?",
// "Your take on X", "Opinion on X" — these carry no wh-word or verb at all.
const TOPIC_PROMPT_SIGNALS = [
  /\b(thoughts?\s+on|opinions?\s+on|views?\s+on|your\s+take\s+on|any\s+thoughts\s+on|stance\s+on)\b/i,
];


const HINGLISH_WH_SIGNAL = /\b(kya|kaise|kyu|kyun|kab|kahan|kaun|kitna|kitne|kitni|konsa|kaunsa|batao)\b/i;

// "I was wondering how you would scale this" / "I'm curious what your approach is".
// These normally get killed by STATEMENT_STARTERS ("I was...", "I am...") even
// though the sentence is clearly a question — this override fixes that specific bug.
const EMBEDDED_QUESTION_LEADINS = [
  /\b(i\s+(was\s+)?wondering|i'm\s+curious|i\s+am\s+curious|i\s+wanted\s+to\s+ask|i'd\s+like\s+to\s+know|i\s+would\s+like\s+to\s+know|just\s+curious|quick\s+question|one\s+more\s+question|my\s+question\s+is|i\s+want\s+to\s+know)\b/i,
];

function stripLeadingFiller(text) {
  return text.replace(FILLER_PREFIX, '');
}

function containsEmbeddedQuestion(text) {
  if (!EMBEDDED_QUESTION_LEADINS.some(p => p.test(text))) return false;
  return /\b(what|how|why|when|where|who|which)\b/i.test(text) ||
         /\b(you|your)\s+(would|will|could|should|do|did|are|is)\b/i.test(text);
}

// Domain signal pattern

const DOMAIN_SIGNALS = {
  SOFTWARE: [
    /\b(javascript|python|java|c\+\+|cpp|c#|typescript|rust|ruby|php|swift|kotlin|scala|html|css)\b/i,
    /\b(golang|go\s+lang|go\s+language|go\s+programming|r\s+language|r\s+programming)\b/i,
    /\b(react|angular|vue|node|express|django|flask|spring|laravel|rails|nextjs|svelte)\b/i,
    /\b(api|rest|graphql|grpc|microservices|docker|kubernetes|k8s|aws|azure|gcp|cloud|devops)\b/i,
    /\b(algorithm|data\s+structure|array|string|linked\s+list|tree|graph|stack|queue|hash|heap)\b/i,
    /\b(oop|solid|design\s+pattern|mvc|mvvm|singleton|factory|observer|decorator)\b/i,
    /\b(database|sql|nosql|mongodb|postgresql|mysql|redis|elasticsearch|orm|query|index|schema)\b/i,
    /\b(git|github|agile|scrum|sprint|ci|cd|pipeline|testing|unit\s+test|tdd|bdd)\b/i,
    /\b(operating\s+system|os|process|thread|concurrency|parallelism|memory|cpu|network|tcp|http|dns)\b/i,
    /\b(machine\s+learning|deep\s+learning|neural\s+network|nlp|computer\s+vision)\b/i,
    /\b(big\s+o|time\s+complexity|space\s+complexity|recursion|dynamic\s+programming|greedy)\b/i,
    /\b(polymorphism|inheritance|encapsulation|abstraction|interface|class|object|method)\b/i,
    /\b(garbage\s+collection|palindrome|sorting|searching|binary\s+search|merge\s+sort|quicksort)\b/i, // FIX: added common CS terms
    /\b(race\s+condition|deadlock|mutex|semaphore|starvation|livelock)\b/i, // FIX: prevent "condition" clashing with MEDICAL domain
  ],
  MEDICAL: [
    /\b(diagnosis|diagnose|patient|symptom|treatment|therapy|medication|drug|dose|dosage|prescription)\b/i,
    /\b(disease|disorder|syndrome|condition|pathology|pathophysiology|etiology|prognosis)\b/i,
    /\b(anatomy|physiology|biochemistry|pharmacology|microbiology|immunology|genetics|histology)\b/i,
    /\b(surgery|surgical|operation|procedure|intervention|biopsy|imaging|mri|ct\s+scan|x.ray|ultrasound)\b/i,
    /\b(heart|cardiac|cardiology|pulmonology|lung|respiratory|neurology|brain|nephrology|kidney|liver)\b/i,
    /\b(blood|hemoglobin|platelet|wbc|rbc|cbc|ecg|ekg|blood\s+pressure|pulse|oxygen\s+saturation)\b/i,
    /\b(cancer|tumor|malignant|benign|oncology|chemotherapy|radiation|metastasis)\b/i,
    /\b(mbbs|md|ms|medical|clinical|ward|icu|emergency|outpatient|inpatient|consultation)\b/i,
    /\b(antibiotic|antiviral|antifungal|analgesic|antipyretic|anticoagulant|insulin|vaccine)\b/i,
    /\b(covid|diabetes|hypertension|asthma|pneumonia|infection|inflammation|fever|pain)\b/i,
  ],
  LEGAL: [
    /\b(law|legal|lawyer|attorney|advocate|judge|lawsuit|litigation|dispute|claim)\b/i,
    /\b(contract|agreement|breach|liability|negligence|tort|damages|remedy|injunction|settlement)\b/i,
    /\b(criminal\s+law|civil\s+law|constitutional|corporate\s+law|intellectual\s+property|family\s+law|labor\s+law)\b/i,  // FIX: more specific
    /\b(statute|legislation|regulation|ordinance|jurisdiction|precedent|case\s+law|common\s+law)\b/i,
    /\b(defendant|plaintiff|accused|prosecution|defense\s+counsel|witness|evidence|testimony|affidavit)\b/i,
    /\b(habeas\s+corpus|mens\s+rea|actus\s+reus|due\s+process|burden\s+of\s+proof|reasonable\s+doubt)\b/i,
    /\b(llb|bar\s+exam|bar\s+council|solicitor|barrister|notary|paralegal)\b/i,
    /\b(appeal|petition|motion|complaint|subpoena|warrant|bail|parole|probation|sentence)\b/i,
    /\b(ipc|crpc|cpc|constitution|fundamental\s+rights)\b/i,  // FIX: more specific
  ],
  FINANCE: [
    /\b(stock|share|equity|bond|debenture|derivative|option|future|commodity|forex|currency)\b/i,
    /\b(investment|portfolio|asset|liability|balance\s+sheet|income\s+statement|cash\s+flow|p&l)\b/i,
    /\b(valuation|dcf|discounted\s+cash\s+flow|npv|irr|pe\s+ratio|eps|ebitda|revenue|profit|margin)\b/i,
    /\b(internal\s+rate\s+of\s+return|rate\s+of\s+return|return\s+on\s+(investment|equity|assets)|financial\s+(model|modeling|statement|analysis|planning))\b/i, // FIX: IRR domain

    /\b(banking|loan|credit|interest\s+rate|mortgage|insurance|risk\s+management|hedge|arbitrage)\b/i,
    /\b(financial\s+modeling|bloomberg|financial\s+analysis|ratio\s+analysis|due\s+diligence)\b/i,
    /\b(market\s+cap|bull\s+market|bear\s+market|volatility|liquidity|solvency|capital|working\s+capital|debt)\b/i,
    /\b(cfa|ca|cpa|accounting|audit|tax|gst|ifrs|gaap)\b/i,
    /\b(mutual\s+fund|etf|hedge\s+fund|private\s+equity|venture\s+capital|ipo|merger|acquisition)\b/i,
  ],
  MANAGEMENT: [
    /\b(strategy|strategic\s+(plan|analysis|decision|goal|objective)|vision|mission|kpi|okr)\b/i,
    /\b(leadership|management\s+(style|skill|theory)|organizational\s+(behavior|culture|change))\b/i,
    /\b(marketing\s+(strategy|mix|plan)|sales\s+(strategy|pipeline)|go.?to.?market|gtm)\b/i,
    /\b(supply\s+chain|operations\s+management|logistics|procurement|vendor\s+management|stakeholder)\b/i,
    /\b(mba|business\s+(case|strategy|model|plan)|consulting|mckinsey|bcg|bain|swot|porter)\b/i,
    /\b(human\s+resources|hr\s+(management|strategy)|recruitment|performance\s+(review|management))\b/i,
    /\b(startup|entrepreneurship|business\s+model|monetization|product\s+market\s+fit|pivot)\b/i,
    /\b(case\s+study|case\s+analysis|business\s+case|market\s+analysis|competitive\s+analysis)\b/i,  // FIX
  ],
};

//  FOLLOW-UP SIGNAL PATTERNS

const FOLLOWUP_PRONOUN_SIGNALS = [
  /\b(of\s+it|about\s+it|with\s+it|for\s+it|using\s+it|in\s+it)\b/i,
  /\bits\s+(advantages|disadvantages|benefits|uses|features|limitations|types|examples|applications|purpose|role|properties|methods|implementation|symptoms|causes|treatment|diagnosis|complications|mechanism|prognosis|management|prevention)\b/i,
  /\bwhat\s+(are|is)\s+its\b/i,
  /\bhow\s+(is|was)\s+it\s+(treated|diagnosed|managed|caused|prevented|detected|measured|tested|used|applied|done)\b/i,
  /\b(that|this)\s+(concept|topic|approach|method|technique|idea|pattern|principle|algorithm|disease|law|case|strategy|condition|disorder|rule|theory|syndrome)\b/i,
  /\b(the\s+same\s+(concept|approach|method|thing|topic))\b/i,
  /\b(they\s+(work|differ|compare|relate|are\s+used))\b/i,
  /^(advantages|disadvantages|benefits|drawbacks|pros|cons|limitations|uses|examples|types|features|applications|symptoms|causes|complications|treatment|diagnosis)\s+(of\s+)?(it|that|this|them|those)?\b/i,
  /\bcompare\s+(it|that|this)\s+with\b/i,  // FIX: "compare it with X"
];

const FOLLOWUP_ELABORATION_SIGNALS = [
  /\b(elaborate|explain\s+(more|further|in\s+detail|in\s+depth|that\s+again)|expand\s+on\s+(it|that|this))\b/i,
  /\b(give\s+(me\s+)?(an?\s+)?(more\s+)?(example|examples|use\s+case|real.world\s+example))\b/i,
  /\b(can\s+you\s+(explain|describe|give|show|tell|elaborate|clarify|repeat|simplify|demonstrate))\b/i,
  /\b(how\s+does\s+(it|that|this)\s+(work|differ|compare|relate|apply|help|affect))\b/i,
  /\b(how\s+(do|did|can|could|would|should)\s+you\s+(use|apply|implement|utilize)\s+(it|that|this)\s*(in\s+(practice|real.world|production|a\s+project))?)\b/i,  // FIX: "how do you use it in practice"
  /\b(tell\s+me\s+more|more\s+about\s+(it|that|this)|more\s+detail|more\s+examples?)\b/i,
  /\b(go\s+(deeper|further|more\s+in.?depth))\b/i,
  /\b(what\s+about\s+(the|its|their|a|an))\b/i,
  /\belaborate\s+on\s+(this|that|it)\b/i,
];


const FOLLOWUP_REFERENCE_SIGNALS = [
  /^(and\s+(what|how|why|when|where|who)|but\s+(what|how|why)|so\s+(what|how|why))\b/i,
  /^(what\s+about|how\s+about)\b/i,
  /\b(next\s+question|follow.?up|one\s+more)\b/i,
  /\b(compared\s+to\s+(that|it|the\s+previous)|versus\s+(that|it))\b/i,
  /\b(difference\s+between\s+(it|that|this)\s+and)\b/i,
];

// FRAGMENT DETECTION

const DANGLING_ENDINGS = new Set([
  'to','a','an','the','and','or','but','in','of','for','with',
  'about','is','are','was','were','be','been','being',
  'by','from','on','at','as','if','how','what','why','when',
  'where','who','which','can','could','would','should',
  'do','does','did','have','has','had','its','their','than',
  // NOTE: 'this' and 'that' removed — they can be valid sentence-ending references
]);

const FRAGMENT_PATTERNS = [
  /^what\s+is\s*[?.!]?\s*$/i,
  /^what\s+are\s*[?.!]?\s*$/i,
  /^what\s+is\s+the\s*[?.!]?\s*$/i,
  /^what\s+is\s+a\s*[?.!]?\s*$/i,
  /^how\s+does\s*[?.!]?\s*$/i,
  /^how\s+do\s*[?.!]?\s*$/i,
  /^tell\s+me\s*[?.!]?\s*$/i,
  /^tell\s+me\s+about\s*[?.!]?\s*$/i,
  /^can\s+you\s+(explain|describe|tell|show)\s*[?.!]?\s*$/i,
  /^explain\s*[?.!]?\s*$/i,
  /^describe\s*[?.!]?\s*$/i,
  /^define\s*[?.!]?\s*$/i,
  /^write\s+a\s*[?.!]?\s*$/i,
  /^implement\s+a\s*[?.!]?\s*$/i,
];

function isFragment(text) {
  if (!text) return false;
  const t = text.trim();
  if (FRAGMENT_PATTERNS.some(p => p.test(t))) return true;
  const words = t.split(/\s+/);

  if (words.length === 1 && !t.includes('?')) return true;

  if (words.length === 2 && !t.includes('?') && !CODING_SIGNALS.some(p => p.test(t))) return true;

  const lastWord = words[words.length - 1].toLowerCase().replace(/[?.!,]+$/, '');
  if (DANGLING_ENDINGS.has(lastWord) && words.length <= 6) return true;
  return false;
}

// Helpers

function countMatches(text, patterns) {
  return patterns.filter(p => p.test(text)).length;
}

function detectDomain(text) {
  const scores = {};
  for (const [domain, patterns] of Object.entries(DOMAIN_SIGNALS)) {
    scores[domain] = countMatches(text, patterns);
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= 1) return { domain: best[0], domainScore: best[1] };
  return { domain: 'GENERAL', domainScore: 0 };
}

function detectType(text) {
  const convScore = countMatches(text, CONVERSATIONAL_SIGNALS);
  if (convScore > 0 && text.trim().split(/\s+/).length < 8) {
    return { type: 'CONVERSATIONAL', typeScore: convScore };
  }


  const EXPLICIT_ANALYTICAL = /\b(pros\s+and\s+cons|advantages\s+and\s+disadvantages|benefits\s+and\s+drawbacks|list\s+(the\s+)?(pros|advantages|disadvantages|cons|benefits|drawbacks|limitations))\b/i;
  if (EXPLICIT_ANALYTICAL.test(text)) {
    return { type: 'ANALYTICAL', typeScore: 4 };
  }

  const scores = {
    // Priority: SITUATIONAL > BEHAVIOURAL = MATHEMATICAL > CODING = ANALYTICAL > CONCEPTUAL
    SITUATIONAL:  countMatches(text, SITUATIONAL_SIGNALS) * 4,
    BEHAVIOURAL:  countMatches(text, BEHAVIOURAL_SIGNALS) * 3,
    MATHEMATICAL: countMatches(text, MATH_SIGNALS) * 3,
    CODING:       countMatches(text, CODING_SIGNALS) * 2 + (isGeneralizedCodingTask(text) ? 5 : 0),
    ANALYTICAL:   countMatches(text, ANALYTICAL_SIGNALS) * 2,
    CONCEPTUAL:   countMatches(text, CONCEPTUAL_SIGNALS) * 1,
  };

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (best[1] === 0) {
    if (text.includes('?') && text.trim().split(/\s+/).length >= 4) {
      return { type: 'CONCEPTUAL', typeScore: 0.5 };
    }
    return { type: 'UNCLEAR', typeScore: 0 };
  }
  return { type: best[0], typeScore: best[1] };
}


function isStatement(text) {
  // FIX: detect "I am working on..." style statements that are NOT questions
  const strippedText = stripLeadingFiller(text);
  const hasStrongQuestion = STRONG_QUESTION_OVERRIDE.some(p => p.test(text)) ||
    QUESTION_FORM_SIGNALS.some(p => p.test(text)) ||
    QUESTION_FORM_SIGNALS.some(p => p.test(strippedText)) ||
    containsEmbeddedQuestion(text);
  if (hasStrongQuestion) return false;
  return STATEMENT_STARTERS.some(p => p.test(text));
}

// TOPIC EXTRACTOR

function extractTopic(text) {
  if (!text) return null;
  const t = text.trim();
  let m;
  m = t.match(/^(?:what\s+is|what\s+are|define|explain\s+(?:the|a|an)?|describe\s+(?:the|a|an)?|tell\s+me\s+about(?:\s+the)?)\s+(.{3,60})[\?\.]*$/i);
  if (m) return m[1].replace(/[?.!]+$/, '').trim();
  m = t.match(/^how\s+does\s+(.{3,50})\s+work/i);
  if (m) return m[1].trim();
  m = t.match(/^(?:write|implement|create|build)\s+(?:a|an|the)?\s*(?:function|method|program|code|algorithm)?\s*(?:to|for|that)?\s*(.{3,60})[\?\.]*$/i);
  if (m) return m[1].replace(/[?.!]+$/, '').trim();
  m = t.match(/^(?:explain|describe|elaborate\s+on|talk\s+about)\s+(?:the\s+)?(.{3,60})[\?\.]*$/i);
  if (m) return m[1].replace(/[?.!]+$/, '').trim();
  const stopWords = new Set(['what','is','are','a','an','the','of','in','to','for','how','why','when','where','who','which','can','could','would','should','do','does','did','has','have','had','you','your','me','my','we','our','they','their','it','its','this','that','and','or','but']);
  const words = t.replace(/[?.!,]/g, '').split(/\s+/).filter(w => !stopWords.has(w.toLowerCase()));
  if (words.length > 0) return words.slice(0, 5).join(' ');
  return null;
}

//  FOLLOW-UP DETECTOR

function detectFollowUp(text, history) {
  if (!text || !history || !Array.isArray(history) || history.length === 0) return false;
  return FOLLOWUP_PRONOUN_SIGNALS.some(p => p.test(text)) ||
         FOLLOWUP_ELABORATION_SIGNALS.some(p => p.test(text)) ||
         FOLLOWUP_REFERENCE_SIGNALS.some(p => p.test(text));
}

// CONTEXT RESOLVER

function resolveContext(text, history) {
  if (!history || !Array.isArray(history) || history.length === 0) return text;
  const lastEntry = [...history].reverse().find(h => h.question && h.question.trim());
  if (!lastEntry) return text;
  const lastTopic = lastEntry.topic || extractTopic(lastEntry.question);
  if (!lastTopic) return text;

  let resolved = text
    .replace(/\bof\s+it\b/gi,   `of ${lastTopic}`)
    .replace(/\babout\s+it\b/gi, `about ${lastTopic}`)
    .replace(/\bwith\s+it\b/gi,  `with ${lastTopic}`)
    .replace(/\busing\s+it\b/gi, `using ${lastTopic}`)
    .replace(/\bfor\s+it\b/gi,   `for ${lastTopic}`)
    .replace(/\bits\s+(advantages|disadvantages|benefits|uses|features|limitations|types|examples|applications|purpose|role|symptoms|causes|treatment|diagnosis|properties|methods|implementation|complications|mechanism)\b/gi,
             (_, noun) => `${noun} of ${lastTopic}`)
    .replace(/\bwhat\s+are\s+its\b/gi, `what are the`)
    .replace(/\bwhat\s+is\s+its\b/gi,  `what is the`)
    .replace(/\bhow\s+is\s+it\s+(treated|diagnosed|managed|handled|used|applied|implemented|done|measured|calculated|tested)\b/gi,
             (_, verb) => `how is ${lastTopic} ${verb}`)
    .replace(/\bhow\s+does\s+(it|that|this)\s+(work|differ|compare|relate|apply|help|affect|function)\b/gi,
             (_, _p, verb) => `how does ${lastTopic} ${verb}`)
    .replace(/\b(that|this)\s+(concept|topic|approach|method|technique|idea|pattern|principle|algorithm|disease|law|case|strategy|condition|disorder|rule|theory)\b/gi,
             lastTopic)
    .replace(/\b(explain|describe|define|elaborate\s+on|talk\s+about)\s+it\b/gi,
             (_, verb) => `${verb} ${lastTopic}`)
    .replace(/\bcompare\s+(it|that|this)\s+with\b/gi,
             `compare ${lastTopic} with`)  // FIX
    .replace(/\b(compared\s+to|versus|vs\.?)\s+(it|that|this)\b/gi,
             (_, word) => `${word} ${lastTopic}`);

  resolved = resolved.replace(
    /^(advantages|disadvantages|benefits|drawbacks|pros|cons|limitations|uses|examples|types|features|applications|symptoms|causes|treatment|diagnosis|complications)\s*\??$/i,
    `$1 of ${lastTopic}`
  );
  return resolved.trim();
}

// WHAT IS THIS/THAT HANDLER

const THIS_THAT_PATTERN = /\b(what\s+is|what\s+are|explain|describe|define)\s+(this|that|these|those)\b/i;

function handleWhatIsThis(text, history) {
  if (!THIS_THAT_PATTERN.test(text)) return null;
  if (history && history.length > 0) {
    const lastEntry = [...history].reverse().find(h => h.question && h.question.trim());
    if (lastEntry) {
      const lastTopic = lastEntry.topic || extractTopic(lastEntry.question);
      if (lastTopic) {
        const resolved = text.replace(THIS_THAT_PATTERN, (_, verb) => `${verb} ${lastTopic}`);
        return { isFollowUp: true, resolvedQuestion: resolved, inheritedDomain: lastEntry.domain || 'GENERAL', inheritedType: lastEntry.type || 'CONCEPTUAL' };
      }
    }
  }
  return { isFollowUp: false, resolvedQuestion: text, inheritedDomain: null, inheritedType: 'CONCEPTUAL' };
}

// SECTION 10 — MAIN CLASSIFIER

/**
 * @param {string}  text
 * @param {Array}   [history]        — [{ question, type, domain, topic }, ...]
 * @param {string}  [overrideDomain]
 * @returns {{ type, domain, confidence, shouldAnswer, isFollowUp, isFragment, resolvedQuestion, topic, raw }}
 */
function classifyIntent(text, history, overrideDomain) {
  history = Array.isArray(history) ? history : [];

  if (!text || typeof text !== 'string') {
    return { type: 'UNCLEAR', domain: overrideDomain || 'GENERAL', confidence: 0, shouldAnswer: false, isFollowUp: false, isFragment: false, resolvedQuestion: '', topic: null, raw: '' };
  }

  const raw = text.trim();

  // Too short → conversational/ignore
  if (raw.length < 4) {
    return { type: 'CONVERSATIONAL', domain: overrideDomain || 'GENERAL', confidence: 1, shouldAnswer: false, isFollowUp: false, isFragment: false, resolvedQuestion: raw, topic: null, raw };
  }

  // Handle "what is this/that" BEFORE fragment check
  const thisResult = handleWhatIsThis(raw, history);
  if (thisResult) {
    const rQ = thisResult.resolvedQuestion;
    const { domain } = detectDomain(rQ);
    const fd = overrideDomain || (thisResult.inheritedDomain && thisResult.inheritedDomain !== 'GENERAL' ? thisResult.inheritedDomain : domain) || 'GENERAL';
    return { type: thisResult.inheritedType, domain: fd, confidence: 0.75, shouldAnswer: true, isFollowUp: thisResult.isFollowUp, isFragment: false, resolvedQuestion: rQ, topic: extractTopic(rQ), raw };
  }

  // Fragment check
  if (isFragment(raw)) {
    return { type: 'UNCLEAR', domain: overrideDomain || 'GENERAL', confidence: 0.3, shouldAnswer: false, isFollowUp: false, isFragment: true, resolvedQuestion: raw, topic: null, raw };
  }

  // FIX: Statement detection — "I am working on a Python project" → ignore
  if (isStatement(raw) && !raw.includes('?')) {
    return { type: 'CONVERSATIONAL', domain: overrideDomain || 'GENERAL', confidence: 0.9, shouldAnswer: false, isFollowUp: false, isFragment: false, resolvedQuestion: raw, topic: null, raw };
  }

  // Follow-up + context resolution
  const followUp = detectFollowUp(raw, history);
  const resolvedQuestion = followUp ? resolveContext(raw, history) : raw;

  const { type, typeScore } = detectType(resolvedQuestion);
  const { domain, domainScore } = detectDomain(resolvedQuestion);

  // Inherit domain from history for follow-ups
  let finalDomain = overrideDomain || domain;
  if (followUp && finalDomain === 'GENERAL' && history.length > 0) {
    const last = [...history].reverse().find(h => h.domain && h.domain !== 'GENERAL');
    if (last) finalDomain = last.domain;
  }

  // Inherit type from history for follow-ups
  let finalType = type;
  if (followUp && finalType === 'UNCLEAR' && history.length > 0) {
    const last = [...history].reverse().find(h => h.type && h.type !== 'UNCLEAR' && h.type !== 'CONVERSATIONAL');
    if (last) finalType = last.type;
  }

  if (finalType === 'CONVERSATIONAL') {
    return { type: finalType, domain: finalDomain, confidence: 1, shouldAnswer: false, isFollowUp: followUp, isFragment: false, resolvedQuestion, topic: null, raw };
  }

  if (finalType === 'UNCLEAR' && !followUp) {
    const wordCount = raw.trim().split(/\s+/).length;
    const strippedRaw = stripLeadingFiller(raw);
    const looksLikeQuestion =
      raw.includes('?') ||
      QUESTION_FORM_SIGNALS.some(p => p.test(raw)) ||
      QUESTION_FORM_SIGNALS.some(p => p.test(strippedRaw)) ||
      IMPERATIVE_SIGNALS.some(p => p.test(raw)) ||
      TOPIC_PROMPT_SIGNALS.some(p => p.test(raw)) ||
      HINGLISH_WH_SIGNAL.test(raw) ||
      containsEmbeddedQuestion(raw) ||
      (wordCount >= 6 && /\b(what|how|why|when|where|who|which)\b/i.test(raw));

    if (wordCount >= 3 && looksLikeQuestion) {
      return { type: 'CONCEPTUAL', domain: finalDomain, confidence: 0.45, shouldAnswer: true, isFollowUp: followUp, isFragment: false, resolvedQuestion, topic: extractTopic(resolvedQuestion), raw };
    }
    return { type: 'UNCLEAR', domain: finalDomain, confidence: 0.2, shouldAnswer: false, isFollowUp: followUp, isFragment: false, resolvedQuestion, topic: null, raw };
  }

  const confidence = parseFloat(Math.min(Math.max(typeScore / 6, 0.6) + (followUp ? 0.1 : 0), 1.0).toFixed(2));
  return { type: finalType, domain: finalDomain, confidence, shouldAnswer: true, isFollowUp: followUp, isFragment: false, resolvedQuestion, topic: extractTopic(resolvedQuestion), raw };
}

//SYSTEM PROMPT BUILDER

const DOMAIN_PERSONA = {
  SOFTWARE:   'senior software engineer and computer science expert with 10+ years of industry experience',
  MEDICAL:    'senior doctor and medical expert with 10+ years of clinical experience (MBBS/MD)',
  LEGAL:      'experienced lawyer and legal expert with 10+ years of practice',
  FINANCE:    'senior finance professional and investment analyst with 10+ years of experience (CFA/CA)',
  MANAGEMENT: 'senior management consultant and business strategy expert with 10+ years (MBA)',
  GENERAL:    'expert professional interview coach with deep cross-domain knowledge',
};

const TYPE_INSTRUCTIONS = {
  CONCEPTUAL:   ['Give a clear, thorough explanation of the concept.', 'Cover definition, how it works, why it matters, and real-world applications.', 'Use simple language first, then add technical depth.'],
  CODING:       ['Provide a complete, working code solution.', 'Add inline comments to explain key steps.', 'State Time Complexity and Space Complexity.', 'Mention edge cases. If multiple approaches exist, briefly compare them.'],
  MATHEMATICAL: ['State the direct final answer on the first line.', 'Show a clean step-by-step solution.', 'If applied (dosage, finance), explain the formula used.'],
  ANALYTICAL:   ['Structure clearly: present all options or both sides.', 'Give a balanced comparison with specific examples.', 'State your final recommendation with reasoning.'],
  BEHAVIOURAL:  ['Use the STAR format: Situation, Task, Action, Result.', 'Be specific with concrete details.', 'Show self-awareness, growth, and positive outcome.'],
  SITUATIONAL:  ['Walk through your approach step by step.', 'Explain your thought process and reasoning.', 'Show calm, structured thinking under pressure.'],
  UNCLEAR:      ['Answer clearly and professionally.', 'If the question is ambiguous, state your interpretation first.'],
};

function buildSystemPrompt(intent, mode) {
  mode = mode || 'detailed';
  const persona   = DOMAIN_PERSONA[intent.domain]  || DOMAIN_PERSONA.GENERAL;
  const typeInstr = TYPE_INSTRUCTIONS[intent.type] || TYPE_INSTRUCTIONS.UNCLEAR;
  const lengthInstr = mode === 'concise'
    ? 'Keep your answer concise (3-5 sentences or a short code block).'
    : 'Be comprehensive and thorough. Elaborate on key points, best practices, and nuances.';
  return [
    `You are a ${persona}.`,
    'Answer the following interview question as an expert in your field.',
    '',
    `Question type: ${intent.type}`,
    'Instructions for this type:',
    ...typeInstr.map(i => `- ${i}`),
    '',
    lengthInstr,
    'Do NOT use markdown symbols like asterisks (**) or headers (###). Present text cleanly.',
    'If the question uses pronouns like "it", "this", "that" — resolve the subject explicitly before answering.',
  ].join('\n');
}


// EXPORTS


module.exports = {
  classifyIntent,
  buildSystemPrompt,
  extractTopic,
  resolveContext,
  detectFollowUp,
  isFragment,
  INTENT_TYPES: ['CONCEPTUAL', 'CODING', 'MATHEMATICAL', 'ANALYTICAL', 'BEHAVIOURAL', 'SITUATIONAL', 'CONVERSATIONAL', 'UNCLEAR'],
  DOMAINS:      ['SOFTWARE', 'MEDICAL', 'LEGAL', 'FINANCE', 'MANAGEMENT', 'GENERAL'],
};
