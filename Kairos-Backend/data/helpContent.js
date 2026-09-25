// ─────────────────────────────────────────────────────────────────────────────
// Help Chatbot Knowledge Base
// All product guides, FAQs, troubleshooting steps — 100% static, no LLM.
// ─────────────────────────────────────────────────────────────────────────────

export const TOPICS = [
  { id: 'copilot', icon: '🎙️', title: 'AI Copilot', subtitle: 'Real-time interview answer assistant', color: '#3b82f6' },
  { id: 'notetaker', icon: '📝', title: 'Notetaker', subtitle: 'Meeting recorder & AI summary generator', color: '#8b5cf6' },
  { id: 'voice-agent', icon: '🤖', title: 'Voice Agent', subtitle: 'AI mock interviewer — practice out loud', color: '#10b981' },
  { id: 'upload', icon: '📁', title: 'Upload & Analysis', subtitle: 'Resume & audio upload and review', color: '#f59e0b' },
  { id: 'dashboard', icon: '📊', title: 'Dashboard', subtitle: 'Session history & past recordings', color: '#ef4444' },
  { id: 'faq', icon: '❓', title: 'FAQs & Troubleshooting', subtitle: 'Common issues and fixes', color: '#6366f1' },
];

export const CONTENT = {
  copilot: {
    id: 'copilot',
    icon: '🎙️',
    title: 'AI Copilot Guide',
    tagline: 'Get real-time AI answers during your live interview.',
    navigateTo: 'overlay',
    navigateLabel: '🚀 Launch AI Copilot',
    sections: [
      {
        heading: 'What is AI Copilot?',
        body: 'AI Copilot is a real-time interview assistant that listens to your interviewer\'s questions via your microphone or system audio, automatically detects interview questions, and streams AI-generated answers directly on your screen — all while you are live in the interview.',
      },
      {
        heading: 'How to Start',
        steps: [
          'Click "AI Copilot" from the navigation bar or home screen.',
          'Select the audio source — "Interviewer Mic" or "System Audio" (captures all computer audio).',
          'Choose your preferred language for the interview.',
          'Click "Start Listening" — the system will begin capturing audio and transcribing in real time.',
          'When a question is detected, answers will automatically stream in both panels.',
          'Click "Stop" when the interview ends.',
        ],
      },
      {
        heading: 'Panel A vs Panel B',
        body: 'AI Copilot generates two simultaneous answers:\n\n• Panel A — Deep & Comprehensive: A detailed, thorough answer with full explanations, suitable for complex technical or behavioural questions.\n\n• Panel B — Short & Concise: A crisp 3–4 sentence answer with a practical example. Use this when you need a quick, confident reply.',
      },
      {
        heading: 'Auto Question Detection',
        body: 'The system uses intelligent NLP to automatically detect when a question has been asked. It filters out conversational filler ("okay", "sure", "yeah") and only triggers AI answers for actual interview questions. You do NOT need to press any button.',
      },
      {
        heading: 'Tips for Best Results',
        steps: [
          'Use a good quality headset/microphone for clear audio capture.',
          'Ensure your browser has microphone permission granted.',
          'Choose the correct language before starting — multilingual support is available.',
          'If no answers appear, check that the audio source is correctly selected.',
          'Keep the browser tab active during the interview for uninterrupted capture.',
        ],
      },
    ],
    faqs: [
      { q: 'Why is no answer being generated?', a: 'Check that your mic permission is granted in the browser, the correct audio source is selected, and that the question was clearly spoken. Conversational phrases like "okay" or "I see" are filtered out by design.' },
      { q: 'Can I use AI Copilot in online video calls like Zoom, Google Meet, or Teams?', a: 'Yes. Select "System Audio" as the source to capture audio from video calls. On Windows, enable "Stereo Mix" in Sound settings if system audio is not detected.' },
      { q: 'Does the interviewer see or hear the AI Copilot?', a: 'No. AI Copilot runs silently on your screen. The interviewer sees only your video/face — not your screen unless you screen share intentionally.' },
      { q: 'Can I switch between Panel A and Panel B?', a: 'Both panels generate simultaneously. You can read whichever one suits your response style at that moment.' },
    ],
  },

  notetaker: {
    id: 'notetaker',
    icon: '📝',
    title: 'Notetaker Guide',
    tagline: 'Capture meetings & generate bilingual AI summaries.',
    navigateTo: 'notetaker',
    navigateLabel: '📝 Open Notetaker',
    sections: [
      {
        heading: 'What is Notetaker?',
        body: 'Notetaker is an intelligent meeting recorder that captures your spoken audio in real time, transcribes it live, and when you stop recording, automatically generates a professional AI summary — in your spoken language, your target language, or both simultaneously.',
      },
      {
        heading: 'How to Record a Session',
        steps: [
          'Go to the Notetaker page from the navigation bar.',
          'Select the "Spoken Language" (the language used during the meeting).',
          'Select the "Target Notes Language" (the language you want the summary in).',
          'Optionally, enter the meeting/interview title.',
          'Click the record button (microphone icon) to start capturing audio.',
          'Speak normally — the live transcript will appear in real time on the right panel.',
          'Click Stop when finished. AI will automatically generate your notes.',
        ],
      },
      {
        heading: 'Bilingual AI Summary (Dual Language)',
        body: 'If you select two different languages (e.g., Spoken: English, Target: Hindi), the AI generates notes in BOTH languages:\n\n• === English Notes === section with key points in English\n• === Hindi Notes === section with the same points in Hindi\n\nIf both languages are the same, a single-language summary is generated.',
      },
      {
        heading: 'Personal Mode vs Meeting Mode',
        body: '• Personal Mode — Designed for solo use. Your voice is labelled as "You" and the other voice is labelled as "Interviewer".\n\n• Meeting Mode — Designed for team meetings. Voices are auto-detected and labelled as "Speaker 1", "Speaker 2", etc.',
      },
      {
        heading: 'Exporting Your Notes',
        steps: [
          'PDF — Download a professionally formatted PDF report.',
          'Text File — Download a plain .txt file with transcript and notes.',
          'Email — Open your email client with notes pre-filled.',
          'Copy — Copy all notes to clipboard instantly.',
        ],
      },
    ],
    faqs: [
      { q: 'Why is the live transcript not appearing?', a: 'Ensure your microphone permission is granted in the browser. Make sure you are speaking clearly and not too fast.' },
      { q: 'How long does it take to generate the AI summary?', a: 'For a typical 30-minute session, AI summary is generated in 5–15 seconds. Bilingual summaries may take 10–20 seconds.' },
      { q: 'What if the AI summary is in only one language?', a: 'Make sure both "Spoken Language" and "Target Notes Language" are set to DIFFERENT languages before starting the recording.' },
      { q: 'Can I record a Zoom or Google Meet call?', a: 'Yes. Use "System Audio" or plug in your meeting audio. The Notetaker will capture and transcribe everything spoken in the call.' },
    ],
  },

  'voice-agent': {
    id: 'voice-agent',
    icon: '🤖',
    title: 'Voice Agent Guide',
    tagline: 'Practice real interviews with an AI mock interviewer.',
    navigateTo: 'voice-agent',
    navigateLabel: '🤖 Launch Voice Agent',
    sections: [
      {
        heading: 'What is Voice Agent?',
        body: 'Voice Agent is your personal AI mock interviewer. It conducts a full spoken interview with you in real time — asks questions, listens to your answers, and responds naturally. Practice for technical, behavioural, or HR interviews using your own resume.',
      },
      {
        heading: 'How to Start a Practice Interview',
        steps: [
          'Go to the Voice Agent page from the navigation bar.',
          'Upload your resume (PDF or DOCX, max 15 MB).',
          'The AI will automatically parse your resume — extracting name, role, and skills.',
          'Select the job role/domain you want to practice for.',
          'Click "Start Interview" — the AI interviewer will greet you and begin asking questions.',
          'Speak your answers naturally into the microphone.',
          'The AI will listen, respond, and ask follow-up questions in real time.',
          'Click "End Interview" when finished.',
        ],
      },
      {
        heading: 'Resume Upload & Auto-Parsing',
        body: 'When you upload your resume:\n\n• Supported formats: PDF, DOCX, DOC (max 15 MB)\n• The system extracts: name, role, skills, work experience, and education.\n• Questions are personalised to YOUR background.\n• You can upload a new resume at any time to change the focus.',
      },
      {
        heading: 'Best Practices for Mock Interviews',
        steps: [
          'Use a quiet room with minimal background noise.',
          'Speak clearly and at a moderate pace.',
          'Upload a relevant resume to get role-specific questions.',
          'Treat it like a real interview — sit upright, take pauses, structure your answers.',
          'Practice the STAR method (Situation, Task, Action, Result) for behavioural questions.',
        ],
      },
    ],
    faqs: [
      { q: 'What resume formats are supported?', a: 'PDF, DOCX, and DOC formats are supported. Maximum file size is 15 MB. Scanned image PDFs may not parse correctly — use a text-based PDF.' },
      { q: 'Why is the AI not responding to my voice?', a: 'Ensure your microphone is allowed in the browser. Check that no other app is using the microphone simultaneously. Try refreshing the page and restarting the session.' },
      { q: 'What types of interviews can I practice?', a: 'Technical (Coding/System Design), Behavioural (HR/Culture Fit), and Domain-specific (Data, Product, Marketing etc.) interviews. The AI adapts based on your resume and selected role.' },
    ],
  },

  upload: {
    id: 'upload',
    icon: '📁',
    title: 'Upload & Analysis Guide',
    tagline: 'Upload resumes and audio for AI-powered analysis.',
    navigateTo: 'upload',
    navigateLabel: '📁 Go to Upload',
    sections: [
      {
        heading: 'What is the Upload Section?',
        body: 'Upload section allows you to upload:\n\n• Resumes (PDF, DOCX) — for role and skill extraction\n• Audio/Video recordings — for transcription and review\n\nAll uploads are processed securely and linked to your account.',
      },
      {
        heading: 'How to Upload a File',
        steps: [
          'Navigate to the Upload page.',
          'Click the upload area or drag and drop your file.',
          'Select your file type: Resume or Audio/Video.',
          'Wait for the upload and processing to complete.',
          'Once complete, the analysis result will be displayed.',
        ],
      },
      {
        heading: 'Supported File Types & Limits',
        body: '• Resumes: PDF, DOCX, DOC — max 15 MB\n• Audio: MP3, WAV, M4A — max 200 MB\n• Video: MP4, WebM — max 200 MB',
      },
    ],
    faqs: [
      { q: 'Why is my file upload failing?', a: 'Common reasons: file too large (check size limit), unsupported format, or slow internet connection. Try compressing the file or using a different format.' },
      { q: 'Is my uploaded resume stored permanently?', a: 'Resumes are stored securely on the server linked to your account. You can delete them at any time from Upload History.' },
      { q: 'How long does audio transcription take?', a: 'A 10-minute audio file typically takes 30–60 seconds to process. Longer files may take 1–3 minutes.' },
    ],
  },

  dashboard: {
    id: 'dashboard',
    icon: '📊',
    title: 'Dashboard Guide',
    tagline: 'View and manage your past interview sessions.',
    navigateTo: 'dashboard',
    navigateLabel: '📊 Open Dashboard',
    sections: [
      {
        heading: 'What is the Dashboard?',
        body: 'The Dashboard is your personal interview history hub. Every session from AI Copilot and Notetaker is automatically saved here. Review transcripts, AI answers, generated notes, session duration, and ratings.',
      },
      {
        heading: 'What You Can See',
        steps: [
          'Session title, date, and duration.',
          'Technology / domain of the session.',
          'Number of questions detected and answered.',
          'AI-generated notes and transcript for each session.',
        ],
      },
      {
        heading: 'Managing Sessions',
        body: '• Click on any session card to expand and view full details.\n• Delete sessions you no longer need.\n• Sessions are sorted by most recent first.',
      },
    ],
    faqs: [
      { q: 'Why is my session not showing in the Dashboard?', a: 'Sessions are saved after recording is stopped properly. If you closed the browser abruptly, the session may not have been saved. Always click "Stop" before closing.' },
      { q: 'Are sessions stored on the cloud or locally?', a: 'Sessions are stored on the server linked to your account. They are accessible from any device when you log in with the same credentials.' },
    ],
  },

  faq: {
    id: 'faq',
    icon: '❓',
    title: 'FAQs & Troubleshooting',
    tagline: 'Quick answers to the most common issues.',
    navigateTo: null,
    navigateLabel: null,
    sections: [
      {
        heading: '🎙️ Microphone & Audio Issues',
        faqs: [
          { q: 'The app cannot access my microphone', a: 'Click the lock icon 🔒 in your browser address bar → Site Settings → Microphone → Allow. Then refresh the page.' },
          { q: 'Audio is capturing but transcript is empty', a: 'Ensure you are speaking clearly. Check that your microphone is not muted at the OS level. Try switching to a different audio source.' },
          { q: 'System audio (Zoom/Meet) is not being captured', a: 'On Windows: Enable "Stereo Mix" in Sound Settings → Recording devices. On Mac: Use a virtual audio driver like BlackHole or Loopback.' },
        ],
      },
      {
        heading: '🔐 Login & Account Issues',
        faqs: [
          { q: 'I cannot log in with Google', a: 'Ensure popups are allowed for this site. Disable any popup-blocking extensions temporarily and try again.' },
          { q: 'I was logged out automatically', a: 'Sessions expire after 30 days. Simply log in again — your saved sessions will still be there.' },
          { q: 'I forgot my password', a: 'Use the "Forgot Password" option on the login screen. Alternatively, use "Sign in with Google" if your account was linked to a Google account.' },
        ],
      },
      {
        heading: '🌐 Language & Translation Issues',
        faqs: [
          { q: 'AI summary is only in one language even though I selected two', a: 'Ensure the Spoken Language and Target Notes Language are set to two DIFFERENT languages BEFORE starting the recording.' },
          { q: 'The transcript is in the wrong language', a: 'Set the correct Spoken Language before starting the session. The transcription engine uses this setting to optimise accuracy.' },
          { q: 'Translation is missing or incorrect', a: 'Try switching the translation engine in settings. For Indian languages, Sarvam gives better results.' },
        ],
      },
      {
        heading: '📤 Export & Download Issues',
        faqs: [
          { q: 'PDF export is blank or not downloading', a: 'Ensure the notes have been generated first. Try using the "Copy" option and pasting into a document if PDF download fails.' },
          { q: 'The exported file has garbled characters for Hindi/regional languages', a: 'Open the PDF in Google Chrome or Adobe Acrobat for correct rendering.' },
        ],
      },
      {
        heading: '⚙️ Performance & General Issues',
        faqs: [
          { q: 'The app is slow or lagging during recording', a: 'Close unnecessary browser tabs. Ensure a stable internet connection (minimum 5 Mbps). Use Google Chrome for best performance.' },
          { q: 'Which browsers are supported?', a: 'Google Chrome (recommended), Microsoft Edge, and Brave. Safari and Firefox have limited Web Audio API support.' },
          { q: 'The page is not loading or stuck on a spinner', a: 'Clear browser cache and cookies. Hard refresh with Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac).' },
        ],
      },
    ],
  },
};

function buildSearchIndex() {
  const index = [];
  for (const [topicId, topic] of Object.entries(CONTENT)) {
    index.push({ topicId, type: 'topic', title: topic.title, preview: topic.tagline, keywords: (topic.title + ' ' + topic.tagline).toLowerCase() });
    for (const section of topic.sections || []) {
      if (section.heading) {
        const text = [section.heading, section.body || '', (section.steps || []).join(' ')].join(' ');
        index.push({ topicId, type: 'section', title: section.heading, preview: section.body ? section.body.slice(0, 100) + '…' : (section.steps?.[0] || ''), keywords: text.toLowerCase() });
      }
      for (const faq of section.faqs || []) {
        index.push({ topicId, type: 'faq', title: faq.q, preview: faq.a.slice(0, 100) + '…', keywords: (faq.q + ' ' + faq.a).toLowerCase() });
      }
    }
    for (const faq of topic.faqs || []) {
      index.push({ topicId, type: 'faq', title: faq.q, preview: faq.a.slice(0, 100) + '…', keywords: (faq.q + ' ' + faq.a).toLowerCase() });
    }
  }
  return index;
}

export const SEARCH_INDEX = buildSearchIndex();

export function searchKnowledgeBase(query, limit = 8) {
  if (!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const scored = SEARCH_INDEX
    .map((entry) => {
      let score = 0;
      for (const term of terms) {
        if (entry.keywords.includes(term)) {
          if (entry.title.toLowerCase().includes(term)) score += 3;
          else score += 1;
        }
      }
      return { ...entry, score };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored;
}