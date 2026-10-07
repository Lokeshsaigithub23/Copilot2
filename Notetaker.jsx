import React, { useState, useEffect, useRef } from 'react';
import AccountDropdown from './UserProfile/AccountDropdown';
import CreditUsagePromptModal from './common/CreditUsagePromptModal';
import {
  getDownloadStatus,
  recordDownloadAction
} from '../config/creditUsageConfig';
import { API_BASE, WS_BASE, websocketProtocols } from '../utils/api';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;


const workletCode = `
class PCMForwarder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Int16Array(this.bufferSize);
    this.index = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input[0]) {
      const inputData = input[0];
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        this.buffer[this.index++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this.index >= this.bufferSize) {
          const sendBuffer = new Int16Array(this.buffer);
          this.port.postMessage(sendBuffer.buffer, [sendBuffer.buffer]);
          this.index = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("pcm-forwarder", PCMForwarder);
`;

const languageOptions = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ru', name: 'Russian' },
  { code: 'tr', name: 'Turkish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'ar', name: 'Arabic' },
  { code: 'bn', name: 'Bengali' },
  { code: 'te', name: 'Telugu' },
  { code: 'ta', name: 'Tamil' },
  { code: 'mr', name: 'Marathi' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'kn', name: 'Kannada' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'pa', name: 'Punjabi' },
];

const LOCAL_SESSIONS_KEY = 'notetaker_saved_sessions';

const cleanNotesText = (text) => {
  if (!text || typeof text !== 'string') return text || '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/###\s*/g, '')
    .replace(/##\s*/g, '')
    .replace(/#\s*/g, '')
    .replace(/\*\*/g, '');
};

const isSystemStatusMessage = (msg) => {
  if (!msg || !msg.text) return false;
  if (msg.isSystem || msg.messageType === 'system') return true;
  const raw = String(msg.text).trim();
  const t = raw.toLowerCase();
  return (
    t.startsWith('started recording') ||
    t.startsWith('recording started') ||
    t.startsWith('recording stopped') ||
    t.startsWith('recording restarted') ||
    t.startsWith('hi! i am your ai interviewer') ||
    t === 'thinking...' ||
    (msg.sender === 'ai' && (
      raw.startsWith('रिकॉर्डिंग शुरू') ||
      raw.startsWith('रिकॉर्डिंग बंद') ||
      raw.startsWith('रिकॉर्डिंग फिर') ||
      t.includes('ai is generating a bilingual summary') ||
      t.includes('generating a bilingual summary') ||
      t.includes('no speech was detected')
    ))
  );
};

export default function Notetaker({ token, user, onLogout, onBackToLanding, onGoToPanel, onGoToVoiceAgent, onGoToUpload, onGoToDashboard, onGoToProfile, onGoToSubscription, onGoToUsage, onGoToReferral, showToast, darkMode, toggleDarkMode, windowType }) {
  const [activeTab, setActiveTab] = useState('record'); // 'record' or 'past'
  const [rightTab, setRightTab] = useState('live'); // 'live', 'notes', or 'feedback'
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState('idle');
  const [recordingMode, setRecordingMode] = useState('personal'); // 'personal' | 'meeting'
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [interviewTitle, setInterviewTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { sender: 'ai', text: 'Hi! I am your AI Interviewer Notetaker. Start recording or type a question here to get real-time advice during your interview.' }
  ]);

  const [spokenLang, setSpokenLang] = useState('en');
  const [targetLang, setTargetLang] = useState('en');
  const [translationEngine, setTranslationEngine] = useState(() => localStorage.getItem('translationEngine') || 'google');
  const [liveTranscript, setLiveTranscript] = useState('');

  // Credit Usage & Download Limits Modal State
  const [creditPromptModal, setCreditPromptModal] = useState({
    isOpen: false,
    type: 'download',
    title: '',
    message: '',
    fileDetails: null,
    pendingAction: null
  });
  const [interimMsg, setInterimMsg] = useState(null);
  const [generatedNotes, setGeneratedNotes] = useState('');
  const [generatedFeedback, setGeneratedFeedback] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState('');
  
  // Translation Speech and History states
  const [lastOriginalText, setLastOriginalText] = useState('');
  const [lastTranslatedText, setLastTranslatedText] = useState('');
  const [translationHistory, setTranslationHistory] = useState([]);
  
  // Export Modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSaveSessionModal, setShowSaveSessionModal] = useState(false);
  const [tempTitle, setTempTitle] = useState('');
  const [exportInclude, setExportInclude] = useState('both');
  const [exportFormat, setExportFormat] = useState('pdf');
  const [exportIncludeAiChat, setExportIncludeAiChat] = useState(true);
  const [displayedNotesLang, setDisplayedNotesLang] = useState('');
  const [pastSessions, setPastSessions] = useState([]);
  const [lineByLineMode, setLineByLineMode] = useState(false);

  const timerRef = useRef(null);
  const chatContainerRef = useRef(null);
  const lineByLineModeRef = useRef(false);
  lineByLineModeRef.current = lineByLineMode;

  // Dragging Header Controls
  const handleMinimize = () => ipcRenderer?.send('window-minimize');
  const handleMaximize = () => ipcRenderer?.send('window-maximize');

  const audioContextRef = useRef(null);
  const streamsRef = useRef([]);
  const nodesRef = useRef(null);
  const activeUtteranceRef = useRef(null);
  const activeOnlineAudioRef = useRef(null);
  const accumulatedTranscriptRef = useRef('');
  const lastSpeakerRef = useRef(null);
  // Generation counter to guard against async start/stop/restart race conditions
  const notetakerGenRef = useRef(0);
  const isStartingRef = useRef(false);
  const hasActiveRecordingRef = useRef(false);
  const lastToggleTimeRef = useRef(0);
  const isMountedRef = useRef(true);

  // Sync state values inside refs to be read in event listeners reliably
  const timerSecondsRef = useRef(timerSeconds);
  timerSecondsRef.current = timerSeconds;

  const tokenRef = useRef(token);
  tokenRef.current = token;

  const spokenLangRef = useRef(spokenLang);
  spokenLangRef.current = spokenLang;

  const targetLangRef = useRef(targetLang);
  targetLangRef.current = targetLang;

  const recordingModeRef = useRef(recordingMode);
  recordingModeRef.current = recordingMode;

  const translationEngineRef = useRef(translationEngine);
  translationEngineRef.current = translationEngine;

  const chatMessagesRef = useRef(chatMessages);
  chatMessagesRef.current = chatMessages;

  const translationHistoryRef = useRef(translationHistory);
  translationHistoryRef.current = translationHistory;

  const isRecordingRef = useRef(isRecording);
  isRecordingRef.current = isRecording;

  const transReqSeqRef = useRef({});
  const recentInterviewerTextsRef = useRef([]);
  const speakerRegistryRef = useRef(new Map());

  const getEffectiveToken = () => {
    let t = token || tokenRef.current || localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
    if (!t) {
      try {
        const authData = JSON.parse(localStorage.getItem('interview_auth') || '{}');
        t = authData?.token || authData?.authToken;
      } catch (_) {}
    }
    return t || '';
  };

  const removeLocalSession = (id) => {
    if (!id) return;
    try {
      const existing = JSON.parse(localStorage.getItem(LOCAL_SESSIONS_KEY) || '[]');
      localStorage.setItem(
        LOCAL_SESSIONS_KEY,
        JSON.stringify(existing.filter((s) => s && s.id !== id))
      );
    } catch { /* best-effort */ }
  };

  // Identifies the same session across the local cache and the backend.
  // Ids cannot be compared: the cache assigns `local_<ts>` before the server
  // assigns `session_<ts>_<rand>`, so the two are disjoint by construction.
  // Title, duration and the save timestamp are written from the same object on
  // both sides, so they match exactly.
  const sessionSignature = (sess) => {
    if (!sess) return '';
    let payload = sess.payload;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch { /* best-effort */ }
    }
    if (!payload && typeof sess.payloadJson === 'string') {
      try { payload = JSON.parse(sess.payloadJson); } catch { /* best-effort */ }
    }
    payload = payload || {};
    return [
      sess.title || '',
      sess.durationSeconds ?? '',
      payload.date || sess.date || '',
      payload.time || sess.time || ''
    ].join('|');
  };

  const fetchPastSessions = async () => {
    let localList = [];
    try {
      localList = JSON.parse(localStorage.getItem(LOCAL_SESSIONS_KEY) || '[]');
    } catch (_) {}

    const isNotetakerSession = (sess) => {
      if (!sess) return false;
      let payload = sess.payload;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch (_) {}
      }
      if (!payload && typeof sess.payloadJson === 'string') {
        try { payload = JSON.parse(sess.payloadJson); } catch (_) {}
      }
      payload = payload || {};
      
      // 1. Explicit Copilot markers -> strictly exclude from Notetaker
      if (payload.questions && Array.isArray(payload.questions) && payload.questions.length > 0) return false;
      if (payload.version && !payload.isNotetaker && !payload.sessionType) return false;
      if (Array.isArray(payload.transcript) && payload.transcript.some(t => t.speaker === 'ai_a' || t.speaker === 'ai_b' || t.speaker === 'interviewer')) {
        return false;
      }

      // 2. Explicit Notetaker markers -> include
      if (payload.isNotetaker || payload.sessionType === 'notetaker' || sess.isNotetaker) return true;
      if (payload.notes && payload.notes !== 'Session recorded.' && !payload.version) return true;
      if (sess.tech === 'Notetaker Session') return true;
      if (typeof sess.title === 'string' && (sess.title.startsWith('Meeting Notes') || sess.title.startsWith('Notetaker'))) return true;
      
      return false;
    };

    // Filter and sanitize local storage list
    const filteredLocal = localList.filter(isNotetakerSession);
    if (filteredLocal.length !== localList.length) {
      try {
        localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(filteredLocal));
      } catch (_) {}
    }

    try {
      const effectiveToken = getEffectiveToken();
      if (effectiveToken) {
        const res = await fetch(`${API_BASE}/api/interview-panel-sessions`, {
          headers: { Authorization: `Bearer ${effectiveToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.sessions)) {
            const filteredBackend = data.sessions.filter(isNotetakerSession);
            const backendIds = new Set(filteredBackend.map(s => s.id || s._id));
            const backendSignatures = new Set(filteredBackend.map(sessionSignature));
            const uniqueLocal = filteredLocal.filter(
              (l) => !backendIds.has(l.id) && !backendSignatures.has(sessionSignature(l))
            );

            // Prune cache entries the backend already has. Without this,
            // duplicates already written to localStorage by earlier versions
            // would keep rendering on every visit.
            if (uniqueLocal.length !== filteredLocal.length) {
              try {
                localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(uniqueLocal));
              } catch { /* best-effort */ }
            }

            if (!isMountedRef.current) return;
            setPastSessions([...filteredBackend, ...uniqueLocal]);
            return;
          }
        }
      }
    } catch (err) {
      console.error('Error fetching past sessions:', err);
    }
    if (!isMountedRef.current) return;
    setPastSessions(filteredLocal);
  };

  useEffect(() => {
    const tok = getEffectiveToken();
    if (ipcRenderer && tok) {
      ipcRenderer.send('interview-auth-sync', { token: tok, baseUrl: API_BASE });
    }
    fetchPastSessions();
  }, [token]);

  const localCaptureInitiatedRef = useRef(false);
  const browserWsRef = useRef(null);

  const handleTranslationEngineChange = (val) => {
    setTranslationEngine(val);
    localStorage.setItem('translationEngine', val);
    if (val === 'sarvam') {
      const allowed = ['en', 'hi', 'bn', 'te', 'ta', 'mr', 'gu', 'kn', 'ml', 'pa'];
      if (!allowed.includes(spokenLangRef.current)) {
        setSpokenLang('en');
      }
      if (!allowed.includes(targetLangRef.current)) {
        setTargetLang('en');
      }
    }
  };

  const handleSpokenLangChange = (val) => {
    setSpokenLang(val);
  };

  const handleTargetLangChange = (val) => {
    setTargetLang(val);
  };

  const displayedLanguages = translationEngine === 'sarvam'
    ? languageOptions.filter(lang => ['en', 'hi', 'bn', 'te', 'ta', 'mr', 'gu', 'kn', 'ml', 'pa'].includes(lang.code))
    : languageOptions;

  // Timer effect when recording
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  // Scroll to bottom of chat when new message or interim text is added
  useEffect(() => {
    let scrollTimer;
    if (chatContainerRef.current) {
      scrollTimer = setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTo({
            top: chatContainerRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
      }, 60);
    }
    return () => {
      if (scrollTimer) clearTimeout(scrollTimer);
    };
  }, [chatMessages, interimMsg]);

  // Resume AudioContext if it gets suspended when returning to Notetaker view,
  // and stop audio capture when navigating away from notetaker view
  useEffect(() => {
    if (windowType === 'notetaker') {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          console.log('[AudioContext] Resumed successfully on tab switch back to notetaker');
        }).catch(err => {
          console.error('[AudioContext] Failed to resume on tab switch back:', err);
        });
      }
    } else {
      if (isRecordingRef.current || isStartingRef.current) {
        notetakerGenRef.current++;
        stopSpeaking();
        stopAudioCapture(true);
      }
    }
  }, [windowType]);

  const formatTimer = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const getDefaultSessionTitle = () => {
    return `Meeting Notes - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const startRecordingWithLangs = (sp, tg) => {
    if (isRecordingRef.current || isStartingRef.current) return;
    try { document.activeElement?.blur(); } catch (_) {}
    isRecordingRef.current = true;
    hasActiveRecordingRef.current = true;
    setIsRecording(true);
    setRecordingStatus('recording');
    setInterviewTitle('');
    setTempTitle('');
    setTimerSeconds(0);
    setLiveTranscript('');
    setGeneratedNotes('');
    setDisplayedNotesLang('');
    setGeneratedFeedback('');
    accumulatedTranscriptRef.current = '';
    lastSpeakerRef.current = null;
    speakerRegistryRef.current.clear();
    setLastOriginalText('');
    setLastTranslatedText('');
    setTranslationHistory([]);
    setChatMessages([
      { id: `sys_start_${Date.now()}`, sender: 'ai', isSystem: true, text: `Started recording. I am transcribing in ${languageOptions.find(l => l.code === sp)?.name || 'English'}...` }
    ]);

    if (ipcRenderer) {
      ipcRenderer.send('interview-session-meta', { tech: 'default' });
    }

    startAudioCapture(sp, tg);
  };

  const saveSessionToBackend = async (titleToSave, notesContent, customDuration) => {
    const effectiveToken = getEffectiveToken();
    if (ipcRenderer && effectiveToken) {
      ipcRenderer.send('interview-auth-sync', { token: effectiveToken, baseUrl: API_BASE });
    }

    const durationSecs = customDuration !== undefined ? customDuration : (timerSecondsRef.current || timerSeconds);
    const durationDisplay = formatTimer(durationSecs);
    const tgName = languageOptions.find(l => l.code === targetLangRef.current)?.name || targetLangRef.current;
    const spName = languageOptions.find(l => l.code === spokenLangRef.current)?.name || spokenLangRef.current;

    const currentChat = (chatMessagesRef.current && chatMessagesRef.current.length > 0) ? chatMessagesRef.current : chatMessages;
    const sanitizedChat = (currentChat || []).map(m => {
      if (isSystemStatusMessage(m) || m.isSystem) {
        const { translation, ...rest } = m;
        return rest;
      }
      return m;
    });
    const currentTransHistory = (translationHistoryRef.current && translationHistoryRef.current.length > 0) ? translationHistoryRef.current : translationHistory;

    const sessionPayload = {
      tech: titleToSave || getDefaultSessionTitle(),
      title: titleToSave || getDefaultSessionTitle(),
      durationSeconds: durationSecs,
      durationDisplay: durationDisplay,
      questionCount: 0,
      rating: 0,
      payload: {
        sessionType: 'notetaker',
        isNotetaker: true,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
        notes: notesContent || generatedNotes || undefined,
        targetLanguage: tgName || undefined,
        spokenLanguage: spName || undefined,
        transcript: sanitizedChat,
        translationHistory: currentTransHistory
      }
    };

    // Always cache locally first so a failed upload never loses the session.
    let localSessionId = null;
    try {
      localSessionId = `local_${Date.now()}`;
      const localSession = {
        id: localSessionId,
        title: sessionPayload.title,
        tech: sessionPayload.tech,
        durationSeconds: sessionPayload.durationSeconds,
        durationDisplay: sessionPayload.durationDisplay,
        date: sessionPayload.payload.date,
        time: sessionPayload.payload.time,
        payload: sessionPayload.payload
      };
      const existing = JSON.parse(localStorage.getItem(LOCAL_SESSIONS_KEY) || '[]');
      localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify([localSession, ...existing]));
    } catch (_) {}

    if (effectiveToken) {
      try {
        const res = await fetch(`${API_BASE}/api/interview-panel-sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${effectiveToken}` },
          body: JSON.stringify(sessionPayload)
        });
        const data = await res.json();
        if (res.ok || data?.ok || data?.session) {
          // The backend owns this session now, so drop the local fallback copy.
          // Leaving it behind is what made every saved session appear twice:
          // the local id is `local_<ts>` while the server assigns
          // `session_<ts>_<rand>`, so the id-based dedupe below could never
          // match them and both copies rendered.
          removeLocalSession(localSessionId);
          showToast('Session saved to Past Sessions!');
        }
      } catch (err) {
        console.error('[Notetaker] Error saving session to backend:', err);
      }
    } else {
      showToast('Session saved locally!');
    }

    await fetchPastSessions();
    try {
      window.dispatchEvent(new CustomEvent('kairos-sessions-updated'));
    } catch (_) {}
  };

  const handleStartStopRecording = () => {
    stopSpeaking();
    const now = Date.now();
    // Guard against rapid duplicate clicks within 250ms
    if (now - lastToggleTimeRef.current < 250) return;
    lastToggleTimeRef.current = now;

    if (hasActiveRecordingRef.current || isStartingRef.current) {
      setTempTitle(getDefaultSessionTitle());
      setShowSaveSessionModal(true);
    } else {
      if (!spokenLang || !targetLang) {
        showToast('Please select both Spoken Language and Target Notes Language first.');
        return;
      }
      try { document.activeElement?.blur(); } catch (_) {}
      isRecordingRef.current = true;
      hasActiveRecordingRef.current = true;
      setIsRecording(true);
      setRecordingStatus('recording');
      setInterviewTitle('');
      setTempTitle('');
      setActiveQuestion('');
      setTimerSeconds(0);
      setLiveTranscript('');
      setGeneratedNotes('');
      setDisplayedNotesLang('');
      setGeneratedFeedback('');
      accumulatedTranscriptRef.current = '';
      lastSpeakerRef.current = null;
      speakerRegistryRef.current.clear();
      setLastOriginalText('');
      setLastTranslatedText('');
      setTranslationHistory([]);
      setChatMessages([
        { id: `sys_start_${Date.now()}`, sender: 'ai', isSystem: true, text: `Started recording. I am transcribing in ${languageOptions.find(l => l.code === spokenLang)?.name || 'English'}...` }
      ]);
      
      if (ipcRenderer) {
        ipcRenderer.send('interview-session-meta', { tech: 'default' });
      }
      startAudioCapture(spokenLang, targetLang);
    }
  };

  const handlePauseResume = async () => {
    if (!hasActiveRecordingRef.current || isStartingRef.current || !audioContextRef.current) return;

    if (audioContextRef.current.state === 'running') {
      await audioContextRef.current.suspend();
      isRecordingRef.current = false;
      setIsRecording(false);
      setRecordingStatus('paused');
    } else if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
      isRecordingRef.current = true;
      setIsRecording(true);
      setRecordingStatus('recording');
    }
  };

  const handleRestartRecording = async () => {
    if (!hasActiveRecordingRef.current || isStartingRef.current) return;
    await stopAudioCapture(true);
    hasActiveRecordingRef.current = true;
    isRecordingRef.current = true;
    setIsRecording(true);
    setRecordingStatus('recording');
    setTimerSeconds(0);
    setLiveTranscript('');
    setGeneratedNotes('');
    setDisplayedNotesLang('');
    setGeneratedFeedback('');
    accumulatedTranscriptRef.current = '';
    lastSpeakerRef.current = null;
    speakerRegistryRef.current.clear();
    setLastOriginalText('');
    setLastTranslatedText('');
    setTranslationHistory([]);
    setChatMessages([
      { id: `sys_restart_${Date.now()}`, sender: 'ai', isSystem: true, text: `Recording restarted. I am transcribing in ${languageOptions.find(l => l.code === spokenLangRef.current)?.name || 'English'}...` }
    ]);
    await startAudioCapture(spokenLangRef.current, targetLangRef.current);
  };

  const handleSaveSessionConfirm = (discard = false) => {
    setShowSaveSessionModal(false);
    isRecordingRef.current = false;
    isStartingRef.current = false;
    if (discard) {
      hasActiveRecordingRef.current = false;
      setIsRecording(false);
      setRecordingStatus('idle');
      setTimerSeconds(0);
      stopAudioCapture(true);
      setActiveQuestion('');
      setInterviewTitle('');
      setTempTitle('');
      showToast('Session discarded.');
      return;
    }

    const titleToSave = tempTitle.trim() || getDefaultSessionTitle();

    if (ipcRenderer) {
      ipcRenderer.send('interview-session-meta', { tech: titleToSave });
    }

    const currentDuration = timerSecondsRef.current || timerSeconds;
    hasActiveRecordingRef.current = false;
    setRecordingStatus('processing');
    setTimerSeconds(0);
    setIsRecording(false);
    stopAudioCapture(false, titleToSave, currentDuration);
    setActiveQuestion('');
    setInterviewTitle('');
    setTempTitle('');
  };

  const [currentlyPlayingMsgId, setCurrentlyPlayingMsgId] = useState(null);

  const stopSpeaking = () => {
    if (activeOnlineAudioRef.current) {
      try {
        activeOnlineAudioRef.current.pause();
        activeOnlineAudioRef.current.currentTime = 0;
      } catch (_) {}
      activeOnlineAudioRef.current = null;
    }
    setCurrentlyPlayingMsgId(null);
  };

  const speakText = (text, langCode, msgId = null) => {
    if (!text) return;
    try {
      console.log(`[tts] Speaking text in: ${langCode}`);
      
      // Stop any currently playing online fallback audio
      if (activeOnlineAudioRef.current) {
        try {
          activeOnlineAudioRef.current.pause();
          activeOnlineAudioRef.current.currentTime = 0;
        } catch (_) {}
        activeOnlineAudioRef.current = null;
      }

      if (msgId) {
        setCurrentlyPlayingMsgId(msgId);
      }

      const onPlaybackEnded = () => {
        if (msgId) {
          setCurrentlyPlayingMsgId(curr => curr === msgId ? null : curr);
        }
        if (activeOnlineAudioRef.current === audio) {
          activeOnlineAudioRef.current = null;
        }
      };

      let audio;

      const playBase64 = (base64Audio) => {
        if (base64Audio) {
          audio = new Audio("data:audio/mpeg;base64," + base64Audio);
          audio.volume = 1.0;
          activeOnlineAudioRef.current = audio;
          audio.onended = onPlaybackEnded;
          audio.onerror = onPlaybackEnded;
          audio.play().catch(e => {
            console.error('[tts] Play error:', e);
            showToast(`Audio playback failed: ${e.message}`);
            onPlaybackEnded();
          });
        } else {
          onPlaybackEnded();
        }
      };

      if (ipcRenderer) {
        ipcRenderer.invoke('get-translation-tts', { text, langCode }).then(playBase64).catch(err => {
          console.error('[tts] ipc get-translation-tts failed:', err);
          showToast(`TTS Request failed: ${err.message || err}`);
          onPlaybackEnded();
        });
      } else {
        const token = localStorage.getItem('auth_token') || '';
        fetch(`${API_BASE}/api/get-translation-tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ text, langCode })
        }).then(r => r.json()).then(data => {
          playBase64(data.base64Audio);
        }).catch(err => {
          console.error('[browser tts] failed:', err);
          onPlaybackEnded();
        });
      }
    } catch (err) {
      console.error('[tts] speakText failed:', err);
      if (msgId) {
        setCurrentlyPlayingMsgId(curr => curr === msgId ? null : curr);
      }
    }
  };

  // Audio helpers
  const float32ToInt16 = (float32) => {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16.buffer;
  };

  const startAudioCapture = async (spLang, tgLang) => {
    isStartingRef.current = true;
    // Assign a unique generation ID to this capture attempt
    const currentGen = ++notetakerGenRef.current;
    speakerRegistryRef.current.clear();
    lastSpeakerRef.current = null;
    accumulatedTranscriptRef.current = '';

    // Clean up any residual audio resources from a previous session
    if (nodesRef.current) {
      const { system, mic, processor, processor2 } = nodesRef.current;
      [processor, processor2, system, mic].forEach(n => {
        if (n) { try { n.disconnect(); } catch (_) {} }
      });
      nodesRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') audioContextRef.current.close().catch(() => {});
      } catch (_) {}
      audioContextRef.current = null;
    }
    if (streamsRef.current) {
      streamsRef.current.forEach(stream => {
        if (stream) stream.getTracks().forEach(t => t.stop());
      });
      streamsRef.current = [];
    }
    if (browserWsRef.current) {
      const { mic, interviewer } = browserWsRef.current;
      if (mic && (mic.readyState === WebSocket.OPEN || mic.readyState === WebSocket.CONNECTING)) {
        mic.onopen = null; mic.onmessage = null; mic.onerror = null; mic.onclose = null;
        mic.close();
      }
      if (interviewer && (interviewer.readyState === WebSocket.OPEN || interviewer.readyState === WebSocket.CONNECTING)) {
        interviewer.onopen = null; interviewer.onmessage = null; interviewer.onerror = null; interviewer.onclose = null;
        interviewer.close();
      }
      browserWsRef.current = null;
    }

    try {
      localCaptureInitiatedRef.current = true;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('AudioContext is not supported by your browser/client.');
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported or not allowed in this environment.');
      }

      // If Meeting mode is selected, request tab/system audio first
      let displayStream = null;
      if (recordingModeRef.current === 'meeting') {
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            throw new Error('Screen or tab audio capture is not supported in this browser.');
          }
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          });
        } catch (err) {
          console.warn('[Notetaker] Display media request cancelled or failed:', err);
          if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
            showToast('Meeting audio capture cancelled.');
          } else {
            showToast('Meeting audio capture error: ' + (err.message || 'Permission denied'));
          }
          isRecordingRef.current = false;
          hasActiveRecordingRef.current = false;
          setIsRecording(false);
          setRecordingStatus('idle');
          setTimerSeconds(0);
          return;
        }

        const audioTracks = displayStream.getAudioTracks();
        displayStream.getVideoTracks().forEach(t => t.stop());

        if (!audioTracks || audioTracks.length === 0) {
          displayStream.getTracks().forEach(t => t.stop());
          showToast('No tab/system audio shared! Please enable "Share tab audio" when selecting.');
          isRecordingRef.current = false;
          hasActiveRecordingRef.current = false;
          setIsRecording(false);
          setRecordingStatus('idle');
          setTimerSeconds(0);
          return;
        }
      }

      // Helper to get mic stream
      const getMicrophoneStream = async () => {
        const constraints = {
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        };
        try {
          return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (e) {}
        try {
          return await navigator.mediaDevices.getUserMedia({ audio: {} });
        } catch (e2) {}
        throw new Error('No microphone found.');
      };

      // Get mic stream
      let micStream = null;
      try {
        micStream = await getMicrophoneStream();
      } catch (err) {
        if (displayStream) displayStream.getTracks().forEach(t => t.stop());
        throw err;
      }

      // Cancellation guard: ensure generation is still valid before continuing
      if (notetakerGenRef.current !== currentGen) {
        micStream.getTracks().forEach(t => t.stop());
        if (displayStream) displayStream.getTracks().forEach(t => t.stop());
        return;
      }
      streamsRef.current = displayStream ? [micStream, displayStream] : [micStream];

      const micTrack = micStream.getAudioTracks()[0];
      if (!micTrack) {
        throw new Error('Microphone track missing.');
      }

      micTrack.onmute = () => console.warn('[notetaker-audio] Microphone track MUTED!');
      micTrack.onunmute = () => console.log('[notetaker-audio] Microphone track UNMUTED!');
      micTrack.onended = () => console.warn('[notetaker-audio] Microphone track ENDED!');

      // Instantiate AudioContext
      const audioCtx = new AudioContextClass({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
        // Cancellation guard: ensure generation is still valid after resume
        if (notetakerGenRef.current !== currentGen) {
          if (audioCtx.state !== 'closed') audioCtx.close().catch(() => {});
          return;
        }
      }
      const rate = audioCtx.sampleRate;

      const BUFFER_SIZE = 2048;
      const micSource = audioCtx.createMediaStreamSource(micStream);
      let displaySource = null;
      if (displayStream) {
        displaySource = audioCtx.createMediaStreamSource(displayStream);
      }
      
      let processor2 = null;
      let useWorklet = false;

      if (audioCtx.audioWorklet) {
        try {
          const blob = new Blob([workletCode], { type: 'application/javascript' });
          const url = URL.createObjectURL(blob);
          try {
            await audioCtx.audioWorklet.addModule(url);
          } finally {
            URL.revokeObjectURL(url);
          }
          // Cancellation guard: ensure generation did not change while loading worklet module
          if (notetakerGenRef.current !== currentGen) {
            return;
          }
          useWorklet = true;
        } catch (e) {
          console.warn('[Notetaker] AudioWorklet load failed, using ScriptProcessor fallback:', e);
        }
      }

      if (notetakerGenRef.current !== currentGen) return;

      if (useWorklet) {
        processor2 = new AudioWorkletNode(audioCtx, "pcm-forwarder");
        processor2.port.onmessage = (e) => {
          if (notetakerGenRef.current !== currentGen) return;
          const int16Buffer = e.data;
          if (ipcRenderer) {
            ipcRenderer.send('audio-chunk-candidate', new Uint8Array(int16Buffer));
          }
        };
      } else {
        processor2 = audioCtx.createScriptProcessor(BUFFER_SIZE, 1, 1);
        processor2.onaudioprocess = (e) => {
          try {
            if (notetakerGenRef.current !== currentGen) return;
            const inputData = e.inputBuffer.getChannelData(0);
            const int16Buffer = float32ToInt16(inputData);
            if (ipcRenderer) {
              ipcRenderer.send('audio-chunk-candidate', new Uint8Array(int16Buffer));
            }
          } catch (err) {
            console.error('[onaudioprocess candidate] processing failed:', err);
          }
        };
      }

      const gain = audioCtx.createGain();
      gain.gain.value = 0;

      // ── 1. Mic Processor (Candidate / Speaker 1) ──
      micSource.connect(processor2);
      processor2.connect(gain);

      // ── 2. Tab/Meeting Audio Processor (Interviewer / Speaker 2) ──
      let processor = null;
      if (displaySource) {
        displaySource.connect(processor2);
        if (useWorklet) {
          processor = new AudioWorkletNode(audioCtx, "pcm-forwarder");
          processor.port.onmessage = (e) => {
            if (notetakerGenRef.current !== currentGen) return;
            const int16Buffer = e.data;
            if (ipcRenderer) {
              ipcRenderer.send('audio-chunk-interviewer', new Uint8Array(int16Buffer));
            }
          };
        } else {
          processor = audioCtx.createScriptProcessor(BUFFER_SIZE, 1, 1);
          processor.onaudioprocess = (e) => {
            try {
              if (notetakerGenRef.current !== currentGen) return;
              const inputData = e.inputBuffer.getChannelData(0);
              const int16Buffer = float32ToInt16(inputData);
              if (ipcRenderer) {
                ipcRenderer.send('audio-chunk-interviewer', new Uint8Array(int16Buffer));
              }
            } catch (err) {
              console.error('[onaudioprocess interviewer] processing failed:', err);
            }
          };
        }
        displaySource.connect(processor);
        processor.connect(gain);
      }
      processor2.connect(gain);

      gain.connect(audioCtx.destination);
      nodesRef.current = { mic: micSource, system: displaySource, processor, processor2 };

      const spName = languageOptions.find(l => l.code === spLang)?.name || spLang;
      const tgName = languageOptions.find(l => l.code === tgLang)?.name || tgLang;
      const selectedEngine = localStorage.getItem('speechEngine') || 'deepgram';
      if (ipcRenderer) {
        ipcRenderer.send('capture-started', rate, 'notetaker', spLang, tgLang, spName, tgName, selectedEngine);
      } else {
        // ── Browser-mode live transcription via WebSocket proxy ──
        const authToken = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
        const openLiveWs = (source) => {
          const langCode = spLang || spokenLangRef.current || 'en';
          const isDiarize = recordingModeRef.current === 'meeting' || lineByLineModeRef.current;
          const ws = new window.WebSocket(`${WS_BASE}/api/transcribe/live?source=${source}&language=${encodeURIComponent(langCode)}${isDiarize ? '&diarize=true' : ''}`, websocketProtocols(authToken));
          ws.binaryType = 'arraybuffer';

          ws.onopen = () => {
            // Cancellation guard: ensure socket belongs to the currently active capture generation
            if (notetakerGenRef.current !== currentGen) {
              try { ws.close(); } catch (_) {}
              return;
            }
            console.log(`[browser-notetaker] WebSocket open. source=${source} diarize=true`);
          };

          ws.onmessage = (evt) => {
            // Cancellation guard: ignore transcripts from previous/invalidated sessions
            if (notetakerGenRef.current !== currentGen || !isRecordingRef.current) return;
            try {
              const msg = JSON.parse(evt.data);
              if (msg.type === 'transcript' && msg.text && isRecordingRef.current) {
                const isFinal = msg.isFinal !== false;
                const cleanText = msg.text.trim();
                if (!cleanText) return;

                processTranscriptData({
                  source: msg.source || source,
                  text: cleanText,
                  isFinal,
                  speaker: msg.speaker !== undefined ? msg.speaker : (msg.source || source)
                });
              }
            } catch (_) {}
          };

          ws.onerror = (e) => {
            if (notetakerGenRef.current !== currentGen) return;
            console.error('[browser-notetaker] WebSocket error:', e);
          };
          ws.onclose = () => {
            if (notetakerGenRef.current !== currentGen) return;
            console.log(`[browser-notetaker] WebSocket closed. source=${source}`);
          };
          return ws;
        };

        const micWs = openLiveWs('candidate');
        let intervWs = null;

        if (processor2) {
          if (processor2 instanceof AudioWorkletNode) {
            processor2.port.onmessage = (e) => {
              if (notetakerGenRef.current !== currentGen) return;
              if (micWs.readyState === WebSocket.OPEN) micWs.send(e.data);
            };
          } else if (processor2.onaudioprocess !== undefined) {
            processor2.onaudioprocess = (e) => {
              try {
                if (notetakerGenRef.current !== currentGen) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const int16Buffer = float32ToInt16(inputData);
                if (micWs.readyState === WebSocket.OPEN) micWs.send(int16Buffer.buffer);
              } catch (err) {}
            };
          }
        }

        if (displaySource && processor) {
          intervWs = openLiveWs('interviewer');
          if (processor instanceof AudioWorkletNode) {
            processor.port.onmessage = (e) => {
              if (notetakerGenRef.current !== currentGen) return;
              if (intervWs.readyState === WebSocket.OPEN) intervWs.send(e.data);
            };
          } else if (processor.onaudioprocess !== undefined) {
            processor.onaudioprocess = (e) => {
              try {
                if (notetakerGenRef.current !== currentGen) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const int16Buffer = float32ToInt16(inputData);
                if (intervWs.readyState === WebSocket.OPEN) intervWs.send(int16Buffer.buffer);
              } catch (err) {}
            };
          }
        }

        browserWsRef.current = { mic: micWs, interviewer: intervWs };
      }
      isStartingRef.current = false;
    } catch (err) {
      if (notetakerGenRef.current !== currentGen) return;
      console.error('[notetaker] microphone/audio capture failed:', err);
      showToast('Capture error: ' + err.message);
      isStartingRef.current = false;
      isRecordingRef.current = false;
      hasActiveRecordingRef.current = false;
      setRecordingStatus('idle');
      setIsRecording(false);
      
      if (streamsRef.current) {
        streamsRef.current.forEach(stream => {
          if (stream) {
            stream.getTracks().forEach(t => t.stop());
          }
        });
        streamsRef.current = [];
      }
    }
  };

  const stopAudioCapture = async (discard = false, titleToSave = '', customDuration = 0) => {
    // Invalidate the recording generation so all active audio buffers, Worklets, and WS packets are ignored
    const stopGen = ++notetakerGenRef.current;
    isStartingRef.current = false;
    isRecordingRef.current = false;
    setIsRecording(false);
    localCaptureInitiatedRef.current = false;
    if (nodesRef.current) {
      const { system, mic, processor, processor2 } = nodesRef.current;
      if (processor) {
        try { processor.disconnect(); } catch (_) {}
        processor.onaudioprocess = null;
      }
      if (processor2) {
        try { processor2.disconnect(); } catch (_) {}
        processor2.onaudioprocess = null;
      }
      if (system) {
        try { system.disconnect(); } catch (_) {}
      }
      if (mic) {
        try { mic.disconnect(); } catch (_) {}
      }
      nodesRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (streamsRef.current) {
      streamsRef.current.forEach(stream => {
        if (stream) {
          stream.getTracks().forEach(t => t.stop());
        }
      });
      streamsRef.current = [];
    }

    setInterimMsg(null);
    if (browserWsRef.current) {
      const { mic, interviewer } = browserWsRef.current;
      if (mic && mic.readyState === WebSocket.OPEN) mic.close();
      if (interviewer && interviewer.readyState === WebSocket.OPEN) interviewer.close();
      browserWsRef.current = null;
    }

    if (ipcRenderer) {
      ipcRenderer.send('capture-stopped', { discard });
    }

    if (discard) {
      hasActiveRecordingRef.current = false;
      setRecordingStatus('idle');
      setGeneratedNotes('');
      setDisplayedNotesLang('');
      return;
    }

    const finalTranscript = accumulatedTranscriptRef.current;
    const sessionTitle = titleToSave || interviewTitle.trim() || 'Notetaker Session';
    const durationToSave = customDuration || timerSecondsRef.current || timerSeconds;

    if (!finalTranscript.trim()) {
      if (notetakerGenRef.current !== stopGen) return;
      const noSpeechNote = 'No speech was detected during the recording session, so notes could not be generated.';
      setChatMessages(prev => [
        ...prev,
        { id: `sys_stop_${Date.now()}`, sender: 'ai', isSystem: true, text: 'Recording stopped. No speech was detected, so notes could not be generated.' }
      ]);
      setGeneratedNotes(noSpeechNote);
      setRightTab('notes');
      await saveSessionToBackend(sessionTitle, noSpeechNote, durationToSave);
      if (notetakerGenRef.current === stopGen) setRecordingStatus('idle');
      return;
    }

    console.log('[notetaker-renderer] stopAudioCapture: finalTranscript length:', finalTranscript.length);
    setRightTab('notes');
    setIsGenerating(true);
    setChatMessages(prev => [
      ...prev,
      { id: `sys_stop_${Date.now()}`, sender: 'ai', isSystem: true, text: `Recording stopped. AI is generating a bilingual summary in ${languageOptions.find(l => l.code === spokenLangRef.current)?.name || 'the spoken language'} and ${languageOptions.find(l => l.code === targetLangRef.current)?.name || 'the target language'}...` }
    ]);

    let notesResult = '';
    try {
      const spName = languageOptions.find(l => l.code === spokenLangRef.current)?.name || spokenLangRef.current;
      const tgName = languageOptions.find(l => l.code === targetLangRef.current)?.name || targetLangRef.current;

      const effectiveToken = getEffectiveToken();
      if (ipcRenderer) {
        const notesRes = await ipcRenderer.invoke('generate-notes', {
          transcript: finalTranscript,
          spokenLanguage: spName,
          targetLanguage: tgName
        });
        if (notesRes && notesRes.notes) {
          notesResult = notesRes.notes;
        }
      } else {
        const res = await fetch(`${API_BASE}/api/notetaker/generate-notes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${effectiveToken}`
          },
          body: JSON.stringify({
            transcript: finalTranscript,
            spokenLanguage: spName,
            targetLanguage: tgName
          })
        });
        const notesRes = await res.json();
        if (notesRes && notesRes.notes) {
          notesResult = notesRes.notes;
        }
      }
      // Cancellation guard: only update notes state if a new recording session hasn't superseded this one
      if (notetakerGenRef.current === stopGen && notesResult) {
        const cleanedNotes = cleanNotesText(notesResult);
        setGeneratedNotes(cleanedNotes);
        setDisplayedNotesLang(spName === tgName ? tgName : `${spName} + ${tgName}`);
      }
    } catch (err) {
      console.error('Error generating notes:', err);
    } finally {
      if (notetakerGenRef.current === stopGen) {
        setIsGenerating(false);
      }
    }

    // Save exactly once, whether or not note generation succeeded.
    if (notetakerGenRef.current === stopGen) {
      await saveSessionToBackend(
        sessionTitle,
        cleanNotesText(notesResult || generatedNotes || 'Session recorded.'),
        durationToSave
      );
      if (notetakerGenRef.current === stopGen) setRecordingStatus('idle');
    }
  };

  const getDynamicSpeakerLabel = (source, rawSpeaker) => {
    const src = source === 'interviewer' ? 'interviewer' : 'candidate';
    let sp = '0';
    if (rawSpeaker !== undefined && rawSpeaker !== null) {
      const s = String(rawSpeaker).trim();
      if (s !== '') sp = s;
    }

    const speakerKey = `${src}_${sp}`;

    if (speakerRegistryRef.current.has(speakerKey)) {
      return { speakerKey, speakerLabel: speakerRegistryRef.current.get(speakerKey) };
    }

    let speakerLabel = '';
    const isGeneric = /^(speaker_?\d+|\d+|candidate|interviewer|user)$/i.test(sp);

    if (!isGeneric && sp.length > 1) {
      // Explicit custom or named speaker
      speakerLabel = sp;
    } else if (recordingModeRef.current === 'personal' && !lineByLineModeRef.current) {
      // Personal mode: mic voice is "You", system/interviewer voice is "Interviewer"
      // Personal mode: mic voice is "You", system/interviewer voice is "Interviewer", "Interviewer 2", etc.
      if (src === 'candidate') {
        speakerLabel = 'You';
        const candidateKeys = [...speakerRegistryRef.current.keys()].filter(k => k.startsWith('candidate_'));
        speakerLabel = candidateKeys.length === 0 ? 'You' : `Speaker ${candidateKeys.length + 1}`;
      } else {
        const interviewerCount = [...speakerRegistryRef.current.values()].filter(
          v => v === 'Interviewer' || (typeof v === 'string' && v.startsWith('Interviewer'))
        ).length;
        speakerLabel = interviewerCount === 0 ? 'Interviewer' : `Interviewer ${interviewerCount + 1}`;
      }
    } else {
      // Meeting mode & Line-by-Line mode: dynamic sequential numbering in order of appearance
      const nextNum = speakerRegistryRef.current.size + 1;
      speakerLabel = `Speaker ${nextNum}`;
      // Meeting mode & Line-by-Line mode: multi-speaker identification
      if (src === 'candidate') {
        const candidateKeys = [...speakerRegistryRef.current.keys()].filter(k => k.startsWith('candidate_'));
        speakerLabel = candidateKeys.length === 0 ? 'Speaker 1 (You)' : `Speaker ${candidateKeys.length + 1}`;
      } else {
        const remoteCount = [...speakerRegistryRef.current.keys()].filter(k => k.startsWith('interviewer_')).length;
        speakerLabel = `Speaker ${remoteCount + 2}`;
      }
    }

    speakerRegistryRef.current.set(speakerKey, speakerLabel);
    return { speakerKey, speakerLabel };
  };

  const processTranscriptData = ({ source, text, isFinal, speaker, merge, isQuestion }) => {
    if (!isRecordingRef.current) return;
    const cleanText = String(text || '').trim();
    if (!cleanText) return;

    // Acoustic Echo Filter: If candidate mic captures what interviewer spoke < 3.5s ago, ignore it
    if (source === 'interviewer') {
      if (!recentInterviewerTextsRef.current) recentInterviewerTextsRef.current = [];
      recentInterviewerTextsRef.current.push({ text: cleanText.toLowerCase(), time: Date.now() });
      if (recentInterviewerTextsRef.current.length > 10) {
        recentInterviewerTextsRef.current = recentInterviewerTextsRef.current.slice(-10);
      }
    } else if (source === 'candidate' && recordingModeRef.current === 'meeting') {
      const now = Date.now();
      const lower = cleanText.toLowerCase();
      const isEcho = (recentInterviewerTextsRef.current || []).some(
        item => (now - item.time < 3500) && (item.text === lower || item.text.includes(lower) || lower.includes(item.text))
      );
      if (isEcho) {
        console.log('[browser-notetaker] Suppressed acoustic echo from mic:', cleanText);
        return;
      }
    }

    // Dynamically resolve unique speakerKey and user-facing speakerLabel
    const { speakerKey, speakerLabel } = getDynamicSpeakerLabel(source, speaker);

    if (isFinal) {
      setInterimMsg(null);
      setLiveTranscript(prev => {
        const sep = prev ? ' ' : '';
        return prev + sep + cleanText;
      });

      if (accumulatedTranscriptRef.current) {
        if (lastSpeakerRef.current === speakerKey) {
          accumulatedTranscriptRef.current += ' ' + cleanText;
        } else {
          accumulatedTranscriptRef.current += `\n${speakerLabel}: ${cleanText}`;
          lastSpeakerRef.current = speakerKey;
        }
      } else {
        accumulatedTranscriptRef.current = `${speakerLabel}: ${cleanText}`;
        lastSpeakerRef.current = speakerKey;
      }
      
      const isTranslationActive = spokenLangRef.current && targetLangRef.current && spokenLangRef.current !== targetLangRef.current;
      const fromLangName = languageOptions.find(l => l.code === spokenLangRef.current)?.name || spokenLangRef.current;
      const toLangName = languageOptions.find(l => l.code === targetLangRef.current)?.name || targetLangRef.current;
      let isQ = !!isQuestion;

      setChatMessages(curr => {
        let shouldMerge = false;
        let targetMsg = null;

        const lastMsg = curr.length > 0 ? curr[curr.length - 1] : null;

        if (lineByLineModeRef.current) {
          // Line-by-Line Mode: Only merge if last message is from the EXACT SAME speaker and not ended with punctuation
          if (lastMsg && lastMsg.sender === 'user' && lastMsg.messageType !== 'chat' && lastMsg.speakerId === speakerKey) {
            const lastTextTrimmed = (lastMsg.text || '').trim();
            const hasTerminalPunct = /[.!?]$/.test(lastTextTrimmed);
            if (!hasTerminalPunct || merge) {
              shouldMerge = true;
              targetMsg = lastMsg;
            }
          }
        } else {
          // Continuous Mode: Group speech by speaker. Only merge if the last user message was from the SAME speaker
          if (lastMsg && lastMsg.sender === 'user' && lastMsg.messageType !== 'chat' && lastMsg.speakerId === speakerKey) {
            shouldMerge = true;
            targetMsg = lastMsg;
          }
        }

        if (shouldMerge && targetMsg) {
          const updatedText = targetMsg.text + (targetMsg.text ? ' ' : '') + cleanText;
          const targetId = targetMsg.id;

          if (isTranslationActive) {
            const token = localStorage.getItem('auth_token') || '';
            const reqSeq = (transReqSeqRef.current[targetId] || 0) + 1;
            transReqSeqRef.current[targetId] = reqSeq;

            const handleTranslationResult = (translated) => {
              if (transReqSeqRef.current[targetId] !== reqSeq) return;
              setChatMessages(c => c.map(m => m.id === targetId ? { ...m, translation: translated } : m));
              setLastOriginalText(updatedText);
              setLastTranslatedText(translated);
              const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              setTranslationHistory(prev => {
                const cleanOrig = (updatedText || '').trim().toLowerCase();
                const existingIdx = prev.findIndex(item => item.msgId === targetId);
                if (existingIdx >= 0) {
                  const updated = [...prev];
                  updated[existingIdx] = {
                    ...updated[existingIdx],
                    originalText: updatedText,
                    translatedText: translated
                  };
                  return updated;
                }

                const contentIdx = prev.findIndex(item => {
                  const prevClean = (item.originalText || '').trim().toLowerCase();
                  return prevClean === cleanOrig || cleanOrig.startsWith(prevClean) || prevClean.startsWith(cleanOrig);
                });

                if (contentIdx >= 0) {
                  const updated = [...prev];
                  updated[contentIdx] = {
                    ...updated[contentIdx],
                    msgId: targetId,
                    originalText: updatedText,
                    translatedText: translated
                  };
                  return updated;
                }

                return [
                  ...prev,
                  {
                    msgId: targetId,
                    timestamp,
                    sourceLang: spokenLangRef.current,
                    targetLang: targetLangRef.current,
                    originalText: updatedText,
                    translatedText: translated
                  }
                ];
              });
            };

            fetch(`${API_BASE}/api/translate-text`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ text: updatedText, from: fromLangName, to: toLangName, engine: translationEngineRef.current })
            }).then(r => r.json()).then(data => {
              if (transReqSeqRef.current[targetId] !== reqSeq) return;
              if (data && data.translatedText) handleTranslationResult(data.translatedText);
            }).catch(() => {});
          }

          return curr.map(m => m.id === targetId ? {
            ...m,
            text: updatedText,
            translation: isTranslationActive ? (m.translation || 'Translating...') : '',
            isQuestion: isQ || m.isQuestion
          } : m);
        } else {
          const newId = Date.now() + Math.random().toString(36).substr(2, 9);

          if (isTranslationActive) {
            const token = localStorage.getItem('auth_token') || '';
            const reqSeq = (transReqSeqRef.current[newId] || 0) + 1;
            transReqSeqRef.current[newId] = reqSeq;

            const handleTranslationResult = (translated) => {
              if (transReqSeqRef.current[newId] !== reqSeq) return;
              setChatMessages(c => c.map(m => m.id === newId ? { ...m, translation: translated } : m));
              setLastOriginalText(cleanText);
              setLastTranslatedText(translated);
              const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              setTranslationHistory(prev => {
                const cleanOrig = (cleanText || '').trim().toLowerCase();
                const existingIdx = prev.findIndex(item => item.msgId === newId);
                if (existingIdx >= 0) {
                  const updated = [...prev];
                  updated[existingIdx] = {
                    ...updated[existingIdx],
                    originalText: cleanText,
                    translatedText: translated
                  };
                  return updated;
                }

                const contentIdx = prev.findIndex(item => {
                  const prevClean = (item.originalText || '').trim().toLowerCase();
                  return prevClean === cleanOrig || cleanOrig.startsWith(prevClean) || prevClean.startsWith(cleanOrig);
                });

                if (contentIdx >= 0) {
                  const updated = [...prev];
                  updated[contentIdx] = {
                    ...updated[contentIdx],
                    msgId: newId,
                    originalText: cleanText,
                    translatedText: translated
                  };
                  return updated;
                }

                return [
                  ...prev,
                  {
                    msgId: newId,
                    timestamp,
                    sourceLang: spokenLangRef.current,
                    targetLang: targetLangRef.current,
                    originalText: cleanText,
                    translatedText: translated
                  }
                ];
              });
            };

            fetch(`${API_BASE}/api/translate-text`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ text: cleanText, from: fromLangName, to: toLangName, engine: translationEngineRef.current })
            }).then(r => r.json()).then(data => {
              if (transReqSeqRef.current[newId] !== reqSeq) return;
              if (data && data.translatedText) handleTranslationResult(data.translatedText);
            }).catch(() => {});
          }

          return [
            ...curr,
            {
              id: newId,
              sender: 'user',
              messageType: 'transcript',
              speakerId: speakerKey,
              speakerName: speakerLabel,
              text: cleanText,
              translation: isTranslationActive ? 'Translating...' : '',
              isQuestion: isQ
            }
          ];
        }
      });

      lastSpeakerRef.current = speakerKey;
    } else {
      setInterimMsg({
        speakerId: speakerKey,
        speakerName: speakerLabel,
        text: cleanText
      });
    }
  };


  useEffect(() => {
    if (!ipcRenderer) return;

    const onDoCapture = (_, mode) => {
      if (mode !== 'notetaker' || isRecordingRef.current) return;
      console.log('[notetaker] received do-capture event. Starting audio capture...');
      startAudioCapture(spokenLangRef.current, targetLangRef.current);
    };

    const onCaptureStarted = () => {
      if (!localCaptureInitiatedRef.current) {
        console.log('[notetaker] ignoring capture-started since it was not initiated here.');
        return;
      }
      console.log('[notetaker] Capture started successfully in main process');
    };

    const onCaptureStopped = () => {
      localCaptureInitiatedRef.current = false;
      console.log('[notetaker] Capture stopped successfully in main process');
    };

    const onCaptureError = (_, msg) => {
      console.error('[notetaker] Main process capture error:', msg);
      showToast('Recording error: ' + (msg || 'Connection failed'));
      setIsRecording(false);
    };

    const onSessionPersistResult = (_, data) => {
      if (data && data.ok) {
        showToast('Session saved successfully!');
        setActiveTab('past');
        fetchPastSessions();
      } else if (data && !data.ok) {
        showToast('Failed to save session: ' + data.message);
      }
    };

    const onTranscript = (_, data) => processTranscriptData(data);

    ipcRenderer.on('do-capture', onDoCapture);
    ipcRenderer.on('transcript', onTranscript);
    ipcRenderer.on('capture-started', onCaptureStarted);
    ipcRenderer.on('capture-stopped', onCaptureStopped);
    ipcRenderer.on('capture-error', onCaptureError);
    ipcRenderer.on('session-persist-result', onSessionPersistResult);

    return () => {
      ipcRenderer.removeListener('do-capture', onDoCapture);
      ipcRenderer.removeListener('transcript', onTranscript);
      ipcRenderer.removeListener('capture-started', onCaptureStarted);
      ipcRenderer.removeListener('capture-stopped', onCaptureStopped);
      ipcRenderer.removeListener('capture-error', onCaptureError);
      ipcRenderer.removeListener('session-persist-result', onSessionPersistResult);
    };
  }, []);

  // Cleanup recording on component unmount unconditionally (Electron + browser)
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      notetakerGenRef.current++;
      isStartingRef.current = false;
      isRecordingRef.current = false;
      stopSpeaking();
      stopAudioCapture(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // Cleanup on beforeunload (browser tab close/reload)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isRecordingRef.current || isStartingRef.current) {
        notetakerGenRef.current++;
        stopSpeaking();
        stopAudioCapture(true);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Navigation & Close handlers that stop audio capture before navigating
  const handleClose = () => {
    if (isRecordingRef.current || isStartingRef.current) {
      notetakerGenRef.current++;
      stopSpeaking();
      stopAudioCapture(true);
    }
    ipcRenderer?.send('window-close');
  };

  const handleBackToLanding = () => {
    if (isRecordingRef.current || isStartingRef.current) {
      notetakerGenRef.current++;
      stopSpeaking();
      stopAudioCapture(true);
    }
    if (onBackToLanding) onBackToLanding();
  };

  const handleGoToDashboard = () => {
    if (isRecordingRef.current || isStartingRef.current) {
      notetakerGenRef.current++;
      stopSpeaking();
      stopAudioCapture(true);
    }
    if (onGoToDashboard) onGoToDashboard();
  };

  const handleGoToPanel = () => {
    if (isRecordingRef.current || isStartingRef.current) {
      notetakerGenRef.current++;
      stopSpeaking();
      stopAudioCapture(true);
    }
    if (onGoToPanel) onGoToPanel();
  };

  const handleGoToVoiceAgent = () => {
    if (isRecordingRef.current || isStartingRef.current) {
      notetakerGenRef.current++;
      stopSpeaking();
      stopAudioCapture(true);
    }
    if (onGoToVoiceAgent) onGoToVoiceAgent();
  };

  const handleGoToUpload = () => {
    if (isRecordingRef.current || isStartingRef.current) {
      notetakerGenRef.current++;
      stopSpeaking();
      stopAudioCapture(true);
    }
    if (onGoToUpload) onGoToUpload();
  };

  const handleLogoutClick = () => {
    if (isRecordingRef.current || isStartingRef.current) {
      notetakerGenRef.current++;
      stopSpeaking();
      stopAudioCapture(true);
    }
    if (onLogout) onLogout();
  };

  const handleTabChange = (tab) => {
    if (tab === 'past' && (isRecordingRef.current || isStartingRef.current)) {
      setTempTitle(getDefaultSessionTitle());
      setShowSaveSessionModal(true);
      return;
    }
    setActiveTab(tab);
  };

  const generateAiAnswerForQuestion = async (questionText) => {
    if (!questionText || !questionText.trim()) return;

    // Add a placeholder thinking message
    const thinkingId = Date.now() + Math.random().toString(36).substr(2, 9);
    setChatMessages(prev => [...prev, { id: thinkingId, sender: 'ai', text: 'Thinking...' }]);

    try {
      if (ipcRenderer) {
        const res = await ipcRenderer.invoke('notetaker-chat-reply', {
          message: questionText,
          history: []
        });
        if (!isMountedRef.current) return;
        if (res.ok) {
          setChatMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, text: res.reply } : m));
        } else {
          setChatMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, text: 'Sorry, I encountered an error: ' + res.error } : m));
        }
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('[notetaker-auto-reply] failed:', err);
      setChatMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, text: 'An unexpected error occurred: ' + err.message } : m));
    }
  };

  const translateTextHelper = async (text, fromCode, toCode) => {
    const srcCode = fromCode || spokenLangRef.current;
    const destCode = toCode || targetLangRef.current;
    if (!text || srcCode === destCode) return '';

    const tokenStr = getEffectiveToken();
    const fromName = languageOptions.find(l => l.code === srcCode)?.name || srcCode;
    const toName = languageOptions.find(l => l.code === destCode)?.name || destCode;
    try {
      const response = await fetch(`${API_BASE}/api/translate-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenStr}` },
        body: JSON.stringify({ text, from: fromName, to: toName, engine: translationEngineRef.current })
      });
      const data = await response.json();
      return data?.translatedText || '';
    } catch (err) {
      console.warn('[notetaker-chat] translation failed:', err.message);
      return '';
    }
  };

  const translateChatReply = (reply) => translateTextHelper(reply);

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    
    // Add user message immediately with unique id
    const userMsgId = `chat_user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setChatMessages(prev => [
      ...prev, 
      { 
        id: userMsgId, 
        sender: 'user', 
        messageType: 'chat', 
        text: userMsg,
        translation: spokenLang !== targetLang ? 'Translating...' : ''
      }
    ]);

    // Translate the user's prompt question itself (e.g. "what is python" -> "python kya hai")
    if (spokenLang !== targetLang) {
      translateTextHelper(userMsg, spokenLangRef.current, targetLangRef.current).then(userTrans => {
        if (userTrans && isMountedRef.current) {
          setChatMessages(prev => prev.map(m => m.id === userMsgId ? { ...m, translation: userTrans } : m));
        }
      }).catch(() => {});
    }

    // Add a placeholder thinking message
    const thinkingId = `ai_think_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setChatMessages(prev => [...prev, { id: thinkingId, sender: 'ai', text: 'Thinking...' }]);

    try {
      const historyToSend = chatMessages.filter(m => m.text !== 'Thinking...');
      let replyText = '';
      if (ipcRenderer) {
        const res = await ipcRenderer.invoke('notetaker-chat-reply', {
          message: userMsg,
          history: historyToSend
        });
        if (!isMountedRef.current) return;
        if (res.ok) {
          replyText = res.reply;
        } else {
          setChatMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, text: 'Sorry, I encountered an error: ' + res.error } : m));
          return;
        }
      } else {
        const token = localStorage.getItem('auth_token') || '';
        const res = await fetch(`${API_BASE}/api/notetaker/chat-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ message: userMsg, history: historyToSend })
        });
        const data = await res.json();
        if (!isMountedRef.current) return;
        if (data && data.ok) {
          replyText = data.reply;
        } else {
          setChatMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, text: 'Sorry, I encountered an error: ' + (data?.error || 'Unknown error') } : m));
          return;
        }
      }

      // Restore AI reply translation so AI answer has both English and target language translation
      let translation = '';
      if (spokenLang !== targetLang && replyText) {
        translation = await translateChatReply(replyText);
      }
      if (!isMountedRef.current) return;
      setChatMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, text: replyText, translation } : m));

    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('[notetaker-chat] failed:', err);
      setChatMessages(prev => prev.map(m => m.id === thinkingId ? { ...m, text: 'An unexpected error occurred: ' + err.message } : m));
    }
  };

  const handleCopyNotes = () => {
    let txt = '';
    if (rightTab === 'live') {
      txt = chatMessages
        .filter(m => m.sender === 'user')
        .map(m => `${m.speakerName || 'Speaker'}: ${m.text}`)
        .join('\n\n');
    } else {
      txt = cleanNotesText(generatedNotes);
    }

    if (!txt.trim()) {
      showToast('No content to copy.');
      return;
    }

    try {
      const electron = window.require ? window.require('electron') : null;
      if (electron && electron.clipboard) {
        electron.clipboard.writeText(txt);
        showToast('Copied to clipboard!');
        return;
      }
    } catch (_) {}

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt)
        .then(() => showToast('Copied to clipboard!'))
        .catch(() => fallbackCopyText(txt));
    } else {
      fallbackCopyText(txt);
    }
  };

  const fallbackCopyText = (txt) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = txt;
      textArea.style.position = 'fixed';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast('Copied to clipboard!');
    } catch (err) {
      showToast('Failed to copy.');
    }
  };

  const handleEmailNotes = () => {
    let txt = '';
    if (rightTab === 'live') {
      const userMsgs = chatMessages.filter(m => m.sender === 'user');
      if (userMsgs.length > 0) {
        txt = userMsgs.map(m => {
          const speaker = m.speakerName || 'Speaker';
          if (m.translation && m.translation !== m.text) {
            return `${speaker}: ${m.text}\n[Translation]: ${m.translation}`;
          }
          return `${speaker}: ${m.text}`;
        }).join('\n\n');
      }
    } else {
      txt = cleanNotesText(generatedNotes) || '';
    }
      
    if (!txt.trim()) {
      showToast('No content to email.');
      return;
    }

    const subject = (interviewTitle || '').trim() || 'Interview Session';
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&tf=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(txt)}`;

    if (ipcRenderer) {
      ipcRenderer.send('open-external-url', gmailUrl);
    } else if (window.require) {
      try {
        const { shell } = window.require('electron');
        shell.openExternal(gmailUrl);
      } catch (_) {
        window.open(gmailUrl, '_blank', 'noopener,noreferrer');
      }
    } else {
      window.open(gmailUrl, '_blank', 'noopener,noreferrer');
    }
    showToast('Redirecting to Gmail...');
  };

  const getQaPairs = () => {
    const pairs = [];
    for (let i = 0; i < chatMessages.length; i++) {
      const m = chatMessages[i];
      if (m.sender === 'user' && m.messageType === 'chat') {
        let aiReply = null;
        for (let j = i + 1; j < chatMessages.length; j++) {
          if (chatMessages[j].sender === 'ai' && !isSystemStatusMessage(chatMessages[j])) {
            aiReply = chatMessages[j];
            break;
          }
          if (chatMessages[j].sender === 'user' && chatMessages[j].messageType === 'chat') {
            break;
          }
        }
        pairs.push({
          prompt: m.text,
          promptTranslation: m.translation || '',
          answerOriginal: aiReply ? aiReply.text : '',
          answerTranslation: aiReply ? (aiReply.translation || '') : ''
        });
      }
    }
    return pairs;
  };

  const doExportDownloadDirect = () => {
    const title = interviewTitle.trim() || 'Interview Session';
    const spokenLangName = languageOptions.find(l => l.code === spokenLang)?.name || 'English';
    const targetLangName = languageOptions.find(l => l.code === targetLang)?.name || 'Hindi';
    const durationText = formatTimer(timerSecondsRef.current || timerSeconds);
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const qaPairs = getQaPairs();
    const candidateSpeechMsgs = chatMessages.filter(m => m.sender === 'user' && m.messageType !== 'chat');

    if (exportFormat === 'txt') {
      let content = '';
      content += `============================================================\n`;
      content += `INTERVIEW SESSION REPORT: ${title.toUpperCase()}\n`;
      content += `Date & Time : ${dateStr} · ${timeStr}\n`;
      content += `Duration    : ${durationText}\n`;
      content += `Languages   : ${spokenLangName} (Spoken) -> ${targetLangName} (Target)\n`;
      content += `============================================================\n\n`;

      if (exportInclude === 'original') {
        content += `=== ORIGINAL TRANSCRIPT (${spokenLangName.toUpperCase()}) ===\n\n`;
        if (candidateSpeechMsgs.length === 0) {
          content += '(No speech captured)\n\n';
        } else {
          candidateSpeechMsgs.forEach((msg, idx) => {
            content += `[#${String(idx + 1).padStart(2, '0')}] ${msg.speakerName || 'Speaker'}:\n${msg.text}\n\n`;
          });
        }
      } else if (exportInclude === 'translation') {
        content += `=== TRANSLATED TRANSCRIPT (${targetLangName.toUpperCase()}) ===\n\n`;
        if (candidateSpeechMsgs.length === 0) {
          content += '(No speech captured)\n\n';
        } else {
          candidateSpeechMsgs.forEach((msg, idx) => {
            content += `[#${String(idx + 1).padStart(2, '0')}] ${msg.speakerName || 'Speaker'}:\n${msg.translation || msg.text}\n\n`;
          });
        }
      } else if (exportInclude === 'both') {
        content += `=== SIDE-BY-SIDE TRANSCRIPT (${spokenLangName.toUpperCase()} / ${targetLangName.toUpperCase()}) ===\n\n`;
        if (candidateSpeechMsgs.length === 0) {
          content += '(No speech captured)\n\n';
        } else {
          candidateSpeechMsgs.forEach((msg, idx) => {
            content += `------------------------------------------------------------\n`;
            content += `[Segment #${String(idx + 1).padStart(2, '0')}] ${msg.speakerName || 'Speaker'}\n`;
            content += `ORIGINAL (${spokenLangName.toUpperCase()}):\n${msg.text}\n\n`;
            content += `TRANSLATION (${targetLangName.toUpperCase()}):\n${msg.translation || '—'}\n`;
            content += `------------------------------------------------------------\n\n`;
          });
        }
      } else if (exportInclude === 'summary') {
        content += `=== AI NOTES & SUMMARY (${spokenLangName.toUpperCase()} / ${targetLangName.toUpperCase()}) ===\n\n`;
        content += cleanNotesText(generatedNotes) || 'No notes generated yet.\n';
        content += '\n';
      }

      // Include AI Prompts & Answers if toggled on
      if (exportIncludeAiChat && qaPairs.length > 0) {
        content += `============================================================\n`;
        content += `AI COPILOT PROMPTS & INTERVIEW ADVICE\n`;
        content += `============================================================\n\n`;

        qaPairs.forEach((qa, idx) => {
          content += `[Q&A #${idx + 1}]\n`;
          if (exportInclude === 'original') {
            content += `USER PROMPT:\n${qa.prompt}\n\n`;
            content += `AI ADVICE:\n${qa.answerOriginal || '(No answer recorded)'}\n`;
          } else if (exportInclude === 'translation') {
            content += `USER PROMPT:\n${qa.promptTranslation || qa.prompt}\n\n`;
            content += `AI ADVICE (${targetLangName.toUpperCase()}):\n${qa.answerTranslation || qa.answerOriginal || '(No answer recorded)'}\n`;
          } else {
            // both or summary
            content += `USER PROMPT (${spokenLangName.toUpperCase()}):\n${qa.prompt}\n`;
            if (qa.promptTranslation) {
              content += `USER PROMPT (${targetLangName.toUpperCase()}):\n${qa.promptTranslation}\n`;
            }
            content += `\nAI ADVICE (${spokenLangName.toUpperCase()}):\n${qa.answerOriginal || '(No answer recorded)'}\n\n`;
            content += `AI ADVICE (${targetLangName.toUpperCase()}):\n${qa.answerTranslation || '—'}\n`;
          }
          content += `------------------------------------------------------------\n\n`;
        });
      }

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.toLowerCase().replace(/\s+/g, '_')}_export.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setShowExportModal(false);
      showToast('Transcript exported to Notepad (Plain text) successfully!');
      return;
    }

    // Otherwise, generate HTML content for PDF
    let htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${title}</title>
          <style>
            @page {
              margin: 15mm;
              size: auto;
            }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; 
              padding: 30px; 
              color: #1e293b; 
              background: #ffffff;
              line-height: 1.5;
            }
            .header-box {
              border-bottom: 2px solid #0284c7;
              padding-bottom: 16px;
              margin-bottom: 24px;
            }
            .header-box h1 {
              font-size: 24px; 
              color: #0f172a; 
              margin: 0 0 10px 0;
            }
            .meta-pills {
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
              font-size: 12px;
            }
            .meta-pill {
              background: #f1f5f9;
              padding: 4px 10px;
              border-radius: 6px;
              border: 1px solid #e2e8f0;
              color: #475569;
              font-weight: 500;
            }
            .section-title { 
              font-size: 16px; 
              font-weight: 700;
              color: #0f172a; 
              margin: 28px 0 14px 0; 
              padding-bottom: 6px;
              border-bottom: 1px solid #e2e8f0;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .msg { 
              margin-bottom: 14px; 
              padding: 12px 14px; 
              border-radius: 8px; 
              background: #f8fafc; 
              border-left: 4px solid #0284c7; 
              color: #1e293b;
              page-break-inside: avoid;
            }
            .speaker { 
              font-weight: bold; 
              color: #0284c7; 
              margin-bottom: 4px; 
              font-size: 12.5px;
              text-transform: uppercase;
            }
            .msg-text {
              font-size: 14px;
              color: #1e293b;
            }
            .comparison-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
              font-size: 13.5px;
              page-break-inside: auto;
            }
            .comparison-table th {
              background: #0f172a;
              color: #ffffff;
              padding: 10px 14px;
              text-align: left;
              font-size: 12px;
              letter-spacing: 0.5px;
            }
            .comparison-table td {
              padding: 12px 14px;
              border-bottom: 1px solid #e2e8f0;
              vertical-align: top;
              background: #ffffff;
              width: 50%;
            }
            .comparison-table tr:nth-child(even) td {
              background: #f8fafc;
            }
            .comparison-table tr {
              page-break-inside: avoid;
            }
            .qa-card {
              background: #f0fdf4;
              border: 1px solid #bbf7d0;
              border-left: 4px solid #16a34a;
              border-radius: 8px;
              padding: 14px;
              margin-bottom: 14px;
              page-break-inside: avoid;
            }
            .qa-badge {
              display: inline-block;
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              color: #16a34a;
              margin-bottom: 6px;
            }
            .qa-prompt {
              font-weight: 600;
              color: #14532d;
              margin-bottom: 8px;
              font-size: 13.5px;
            }
            .qa-answer {
              font-size: 13px;
              color: #1e293b;
              line-height: 1.5;
              background: #ffffff;
              padding: 10px 12px;
              border-radius: 6px;
              border: 1px solid #dcfce7;
            }
            .qa-translation {
              margin-top: 8px;
              padding-top: 8px;
              border-top: 1px dashed #86efac;
              font-size: 12.5px;
              color: #15803d;
            }
            .notes { 
              white-space: pre-wrap; 
              font-size: 14px; 
              line-height: 1.6; 
              background: #f8fafc;
              padding: 16px;
              border-radius: 8px;
              border: 1px solid #e2e8f0;
              color: #334155; 
              page-break-inside: avoid;
            }
            @media print {
              body { padding: 0; }
              .msg, .qa-card, tr { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header-box">
            <h1>${title}</h1>
            <div class="meta-pills">
              <span class="meta-pill">📅 ${dateStr} · ${timeStr}</span>
              <span class="meta-pill">⏱️ Duration: ${durationText}</span>
              <span class="meta-pill">🌐 ${spokenLangName} -> ${targetLangName}</span>
            </div>
          </div>
    `;

    if (exportInclude === 'original') {
      htmlContent += `<div class="section-title">Original Transcript (${spokenLangName})</div>`;
      if (candidateSpeechMsgs.length === 0) {
        htmlContent += `<p style="color: #64748b;">(No speech captured)</p>`;
      } else {
        candidateSpeechMsgs.forEach((msg, idx) => {
          htmlContent += `
            <div class="msg">
              <div class="speaker">#${String(idx + 1).padStart(2, '0')} · ${msg.speakerName || 'Speaker'}</div>
              <div class="msg-text">${msg.text}</div>
            </div>
          `;
        });
      }
    } else if (exportInclude === 'translation') {
      htmlContent += `<div class="section-title">Translated Transcript (${targetLangName})</div>`;
      if (candidateSpeechMsgs.length === 0) {
        htmlContent += `<p style="color: #64748b;">(No speech captured)</p>`;
      } else {
        candidateSpeechMsgs.forEach((msg, idx) => {
          htmlContent += `
            <div class="msg">
              <div class="speaker">#${String(idx + 1).padStart(2, '0')} · ${msg.speakerName || 'Speaker'}</div>
              <div class="msg-text">${msg.translation || msg.text}</div>
            </div>
          `;
        });
      }
    } else if (exportInclude === 'both') {
      htmlContent += `<div class="section-title">Side-by-Side Transcript</div>`;
      if (candidateSpeechMsgs.length === 0) {
        htmlContent += `<p style="color: #64748b;">(No speech captured)</p>`;
      } else {
        htmlContent += `
          <table class="comparison-table">
            <thead>
              <tr>
                <th>ORIGINAL (${spokenLangName.toUpperCase()})</th>
                <th>TRANSLATION (${targetLangName.toUpperCase()})</th>
              </tr>
            </thead>
            <tbody>
        `;
        candidateSpeechMsgs.forEach((msg, idx) => {
          htmlContent += `
            <tr>
              <td>
                <div class="speaker">#${String(idx + 1).padStart(2, '0')} · ${msg.speakerName || 'Speaker'}</div>
                <div class="msg-text">${msg.text}</div>
              </td>
              <td>
                <div class="speaker" style="color: #16a34a;">#${String(idx + 1).padStart(2, '0')} · ${targetLangName.toUpperCase()}</div>
                <div class="msg-text">${msg.translation || '—'}</div>
              </td>
            </tr>
          `;
        });
        htmlContent += `
            </tbody>
          </table>
        `;
      }
    } else if (exportInclude === 'summary') {
      htmlContent += `<div class="section-title">AI Notes & Summary</div>`;
      htmlContent += `<div class="notes">${generatedNotes ? cleanNotesText(generatedNotes).replace(/\n/g, '<br>') : 'No notes generated yet.'}</div>`;
    }
``
    // Append AI Copilot Q&A section if enabled
    if (exportIncludeAiChat && qaPairs.length > 0) {
      htmlContent += `<div class="section-title" style="margin-top: 36px; border-bottom: 2px solid #16a34a; color: #16a34a;">🤖 AI Copilot Prompts & Advice</div>`;
      qaPairs.forEach((qa, idx) => {
        htmlContent += `
          <div class="qa-card">
            <span class="qa-badge">Prompt #${idx + 1}</span>
            <div class="qa-prompt">User: ${exportInclude === 'translation' ? (qa.promptTranslation || qa.prompt) : qa.prompt}${exportInclude === 'both' && qa.promptTranslation ? `<br><span style="color: #16a34a; font-size: 12.5px; font-weight: normal;">(${targetLangName.toUpperCase()}): ${qa.promptTranslation}</span>` : ''}</div>
            <div class="qa-answer">
              <strong>AI Advice:</strong><br>
              ${exportInclude === 'translation' ? (qa.answerTranslation || qa.answerOriginal || 'No reply recorded') : (qa.answerOriginal || 'No reply recorded')}
              ${exportInclude === 'both' && qa.answerTranslation ? `
                <div class="qa-translation">
                  <strong>Translation (${targetLangName.toUpperCase()}):</strong><br>
                  ${qa.answerTranslation}
                </div>
              ` : ''}
            </div>
          </div>
        `;
      });
    }

    htmlContent += `</body></html>`;

    if (ipcRenderer) {
      ipcRenderer.invoke('export-to-pdf', {
        htmlContent,
        defaultFilename: `${title.toLowerCase().replace(/\s+/g, '_')}_export.pdf`
      }).then(res => {
        if (res.ok) {
          showToast('Transcript exported to PDF successfully!');
        } else if (res.error !== 'Cancelled') {
          showToast('Failed to export PDF: ' + res.error);
        }
      }).catch(err => {
        showToast('Error exporting PDF: ' + err.message);
      });
    } else {
      // Browser universal PDF export using styled print iframe
      try {
        const printFrame = document.createElement('iframe');
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = '0';
        document.body.appendChild(printFrame);
        const doc = printFrame.contentWindow.document;
        doc.open();
        doc.write(htmlContent);
        doc.close();
        printFrame.contentWindow.focus();
        setTimeout(() => {
          try {
            printFrame.contentWindow.print();
            showToast('Print / Save as PDF dialog opened!');
          } catch (_) {
            showToast('Please allow printing in your browser to save as PDF.');
          }
          setTimeout(() => {
            try { document.body.removeChild(printFrame); } catch (_) {}
          }, 2000);
        }, 300);
      } catch (err) {
        showToast('Error opening print preview: ' + err.message);
      }
    }
    
    setShowExportModal(false);
  };

  const handleExportDownload = () => {
    const title = interviewTitle.trim() || 'Interview Session';
    const fileName = exportFormat === 'txt'
      ? `${title.toLowerCase().replace(/\s+/g, '_')}_export.txt`
      : `${title.toLowerCase().replace(/\s+/g, '_')}_export.pdf`;

    const status = getDownloadStatus();
    if (status.hasIncluded) {
      const res = recordDownloadAction({
        fileType: exportFormat === 'txt' ? 'Text Transcript' : 'PDF Summary',
        fileName
      });
      if (showToast) showToast(res.message);
      doExportDownloadDirect();
    } else {
      setCreditPromptModal({
        isOpen: true,
        type: 'download',
        title: 'Download Limit Reached',
        message: 'Your included downloads for this plan have been used.',
        fileDetails: { name: fileName, type: exportFormat === 'txt' ? 'Plain Text (.txt)' : 'PDF Document' },
        pendingAction: () => doExportDownloadDirect()
      });
    }
  };

  const handleConfirmCreditPrompt = async ({ fileDetails }) => {
    const res = recordDownloadAction({
      fileType: fileDetails?.type || 'Document',
      fileName: fileDetails?.name || 'notetaker_export'
    });
    if (res.success) {
      if (showToast) showToast(`Export downloaded via credits (${res.creditsDeducted} credits deducted)`);
      if (creditPromptModal.pendingAction) {
        creditPromptModal.pendingAction();
      }
      setCreditPromptModal(prev => ({ ...prev, isOpen: false, pendingAction: null }));
    } else {
      if (showToast) showToast(res.message);
    }
  };

  const handleTopUpFromCreditModal = () => {
    setCreditPromptModal(prev => ({ ...prev, isOpen: false, pendingAction: null }));
    if (onGoToSubscription) {
      onGoToSubscription();
    }
  };

  const handleSelectPastSession = (sessId) => {
    const found = pastSessions.find(s => (s.id === sessId || s._id === sessId));
    if (found) {
      const notesText = found.payload?.notes || found.payload?.generatedNotes || found.notes || '';
      setGeneratedNotes(cleanNotesText(notesText));
      
      const spLangName = found.payload?.spokenLanguage || found.spokenLanguage || '';
      const tgLangName = found.payload?.targetLanguage || found.targetLanguage || '';
      
      const spCode = languageOptions.find(l => l.name.toLowerCase() === spLangName.toLowerCase())?.code || (spLangName.length === 2 ? spLangName : spokenLang) || 'en';
      const tgCode = languageOptions.find(l => l.name.toLowerCase() === tgLangName.toLowerCase())?.code || (tgLangName.length === 2 ? tgLangName : targetLang) || 'en';
      
      setSpokenLang(spCode);
      setTargetLang(tgCode);
      const resolvedSpLangName = spLangName || languageOptions.find(l => l.code === spCode)?.name || spCode;
      const resolvedTgLangName = tgLangName || languageOptions.find(l => l.code === tgCode)?.name || tgCode;
      setDisplayedNotesLang(
        resolvedSpLangName.toLowerCase() === resolvedTgLangName.toLowerCase()
          ? resolvedTgLangName
          : `${resolvedSpLangName} + ${resolvedTgLangName}`
      );

      let rawTranscript = found.payload?.transcript || found.transcript || [];
      if (!Array.isArray(rawTranscript)) {
        rawTranscript = [];
      }

      const normalizedTranscript = rawTranscript.map((msg, idx) => ({
        ...msg,
        id: msg.id || `past_${idx}_${Date.now()}`
      }));

      setChatMessages(normalizedTranscript);

      // Restore translation history if saved
      if (found.payload?.translationHistory && Array.isArray(found.payload.translationHistory)) {
        setTranslationHistory(found.payload.translationHistory);
      }

      // Auto-translate any past session speech messages that are missing translations or stuck at "Translating..."
      const fromName = languageOptions.find(l => l.code === spCode)?.name || 'English';
      const toName = languageOptions.find(l => l.code === tgCode)?.name || 'English';

      if (spCode !== tgCode) {
        normalizedTranscript.forEach((msg) => {
          if (msg.sender === 'user' && msg.messageType !== 'chat' && !isSystemStatusMessage(msg) && msg.text && (!msg.translation || msg.translation === 'Translating...')) {
            const tokenStr = localStorage.getItem('auth_token') || '';
            const handleResult = (translated) => {
              setChatMessages(curr => curr.map(m => (m.id && msg.id && m.id === msg.id) ? { ...m, translation: translated } : m));
              setTranslationHistory(prev => {
                const existingIdx = prev.findIndex(item => item.msgId === msg.id || (item.originalText || '').trim().toLowerCase() === (msg.text || '').trim().toLowerCase());
                if (existingIdx >= 0) {
                  const updated = [...prev];
                  updated[existingIdx] = { ...updated[existingIdx], translatedText: translated };
                  return updated;
                }
                return [
                  ...prev,
                  {
                    msgId: msg.id,
                    timestamp: msg.wallTime || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                    sourceLang: spCode,
                    targetLang: tgCode,
                    originalText: msg.text,
                    translatedText: translated
                  }
                ];
              });
            };

            if (ipcRenderer) {
              ipcRenderer.invoke('translate-text', { text: msg.text, from: fromName, to: toName, engine: translationEngineRef.current }).then(handleResult).catch(() => {});
            } else {
              fetch(`${API_BASE}/api/translate-text`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenStr}` },
                body: JSON.stringify({ text: msg.text, from: fromName, to: toName, engine: translationEngineRef.current })
              }).then(r => r.json()).then(data => { if (data && data.translatedText) handleResult(data.translatedText); }).catch(() => {});
            }
          }
        });
      }
      
      setRightTab('notes');
      showToast(`Loaded notes for "${found.title || 'default'}"`);
    }
  };

  // Handle direct navigation from Profile or other views to a specific session in the Past tab
  useEffect(() => {
    if (windowType !== 'notetaker') return;
    const targetTab = sessionStorage.getItem('notetaker_target_tab');
    if (targetTab === 'past') {
      setActiveTab('past');
      const targetSessionId = sessionStorage.getItem('notetaker_target_session_id');
      if (targetSessionId) {
        let found = pastSessions.find(s => String(s.id) === String(targetSessionId) || String(s._id) === String(targetSessionId));
        if (!found) {
          try {
            const local = JSON.parse(localStorage.getItem(LOCAL_SESSIONS_KEY) || '[]');
            found = local.find(s => String(s.id) === String(targetSessionId) || String(s._id) === String(targetSessionId));
          } catch (_) {}
        }
        if (found) {
          handleSelectPastSession(found.id || found._id);
          sessionStorage.removeItem('notetaker_target_tab');
          sessionStorage.removeItem('notetaker_target_session_id');
        }
      } else {
        sessionStorage.removeItem('notetaker_target_tab');
      }
    }
  }, [windowType, pastSessions]);

  useEffect(() => {
    if (activeTab === 'past') {
      fetchPastSessions();
    }
  }, [activeTab]);

  const displaySessions = pastSessions.map(sess => {
    const formattedDuration = sess.durationSeconds 
      ? `${Math.floor(sess.durationSeconds / 60)}:${String(sess.durationSeconds % 60).padStart(2, '0')}`
      : (sess.durationDisplay || '00:00');
    
    let formattedDate = sess.date || sess.payload?.date || '';
    if (!formattedDate && sess.createdAt) {
      try {
        formattedDate = new Date(sess.createdAt).toLocaleDateString();
      } catch (_) {}
    }
    if (!formattedDate) {
      formattedDate = new Date().toLocaleDateString();
    }

    return {
      id: sess.id || sess._id,
      title: sess.title || 'Untitled Session',
      date: formattedDate,
      duration: formattedDuration
    };
  });

  return (
    <div className="interview-panel-root notetaker-root">
      {/* Titlebar for Electron Drag */}
      <div className="window-titlebar">
        <div className="window-title">
          <i className="fa-solid fa-brain"></i> Notetaker | My Interview Copilot
        </div>
        <div className="window-controls">
          <button className="win-btn win-btn-minimize" onClick={handleMinimize} title="Minimize">—</button>
          <button className="win-btn win-btn-maximize" onClick={handleMaximize} title="Maximize">▢</button>
          <button className="win-btn win-btn-close" onClick={handleClose} title="Close">×</button>
        </div>
      </div>
      {/* 1. Main Green Header (Same Nav Bar) */}
      <header className="setup-navbar">
        <div className="setup-navbar-left" onClick={handleBackToLanding} style={{ cursor: 'pointer' }}>
          <div className="setup-navbar-logo"><i className="fa-solid fa-brain"></i></div>
          <div className="setup-navbar-title">My Interview Copilot</div>
        </div>

        <nav className="setup-navbar-tabs">
          <button onClick={handleBackToLanding} className="setup-tab-item" type="button">
            <i className="fa-solid fa-house"></i> Home
          </button>
          <button onClick={handleGoToDashboard} className="setup-tab-item" type="button">
            <i className="fa-solid fa-chart-line"></i> Dashboard
          </button>
          <button onClick={() => showToast('Mock Interview feature is coming soon!')} className="setup-tab-item" type="button">
            <i className="fa-solid fa-video"></i> Mock Interview
          </button>
          <button onClick={() => showToast('Meetings scheduler is coming soon!')} className="setup-tab-item" type="button">
            <i className="fa-solid fa-calendar-days"></i> Meetings
          </button>
          <button onClick={() => showToast('History log is coming soon!')} className="setup-tab-item" type="button">
            <i className="fa-solid fa-clock-rotate-left"></i> History
          </button>
          <button onClick={() => showToast('Reminders scheduling feature is coming soon!')} className="setup-tab-item" type="button">
            <i className="fa-solid fa-bell"></i> Reminders
          </button>
          <button onClick={onGoToSubscription} className="setup-tab-item" type="button">
            <i className="fa-solid fa-crown"></i> Plans &amp; Pricing
          </button>
        </nav>

        <div className="setup-navbar-right">
          <button onClick={handleGoToPanel} className="setup-action-btn btn-copilot" type="button">
            <i className="fa-solid fa-rocket"></i> AI Copilot
          </button>
          <button onClick={(e) => e.preventDefault()} className="setup-action-btn btn-notetaker active" type="button">
            <i className="fa-solid fa-microphone"></i> Notetaker
          </button>
          <button onClick={handleGoToVoiceAgent} className="setup-action-btn btn-voice-agent" type="button">
            <i className="fa-solid fa-robot"></i> Voice Agent
          </button>
          <button onClick={handleGoToUpload} className="setup-action-btn btn-upload" type="button">
            <i className="fa-solid fa-cloud-arrow-up"></i> Upload
          </button>
          <button onClick={onGoToReferral} className="setup-action-btn btn-referral" type="button">
            <i className="fa-solid fa-gift"></i> Refer &amp; Earn
          </button>
          <button onClick={toggleDarkMode} className={`setup-action-btn btn-theme-toggle ${darkMode ? 'active' : ''}`} type="button">
            <i className={`fa-solid ${darkMode ? 'fa-sun' : 'fa-moon'}`}></i> {darkMode ? 'Light' : 'Dark'}
          </button>
          <div className="setup-lang-picker">
            <i className="fa-solid fa-globe"></i> US EN
          </div>
          <AccountDropdown
            user={user}
            onGoToProfile={onGoToProfile}
            onGoToSubscription={onGoToSubscription}
            onGoToUsage={onGoToUsage}
            onLogout={handleLogoutClick}
            showToast={showToast}
          />
        </div>
      </header>

      {/* 3. Main Two-Column Grid */}
      <main className="notetaker-grid">
        {/* Left Column Card */}
        <section className="notetaker-card notetaker-left-card">
          <div className="notetaker-card-header">
            <div className="notetaker-card-icon bg-green">
              <i className="fa-solid fa-microphone"></i>
            </div>
            <div className="notetaker-card-title-group">
              <h2 className="notetaker-card-title">AI Interview Notetaker</h2>
              <p className="notetaker-card-subtitle">Capture questions, answers &amp; feedback automatically</p>
            </div>
          </div>

          {/* Toggle pill buttons */}
          <div className="notetaker-pill-tabs">
            <button
              className={`notetaker-pill-btn ${activeTab === 'record' ? 'active' : ''}`}
              onClick={() => handleTabChange('record')}
              type="button"
            >
              <i className="fa-solid fa-microphone"></i> Record Interview
            </button>
            <button
              className={`notetaker-pill-btn ${activeTab === 'past' ? 'active' : ''}`}
              onClick={() => handleTabChange('past')}
              type="button"
            >
              <i className="fa-solid fa-clock-rotate-left"></i> Past Sessions
            </button>
          </div>

          {activeTab === 'record' ? (
            <form className="notetaker-record-form" onSubmit={(e) => e.preventDefault()}>


              {/* TWO DROPDOWNS: Styled to match the theme perfectly */}
              <div className="notetaker-form-row" style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div className="notetaker-form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="notetaker-label">Spoken Language</label>
                  <select
                    className="notetaker-select"
                    value={spokenLang}
                    onChange={(e) => handleSpokenLangChange(e.target.value)}
                    disabled={isRecording}
                  >
                    <option value="">-- Spoken Language --</option>
                    {displayedLanguages.map(lang => (
                      <option key={lang.code} value={lang.code}>{lang.name}</option>
                    ))}
                  </select>
                </div>

                <div className="notetaker-form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="notetaker-label">Target Notes Language</label>
                  <select
                    className="notetaker-select"
                    value={targetLang}
                    onChange={(e) => handleTargetLangChange(e.target.value)}
                    disabled={isRecording}
                  >
                    <option value="">-- Notes Language --</option>
                    {displayedLanguages.map(lang => (
                      <option key={lang.code} value={lang.code}>{lang.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="notetaker-form-group" style={{ marginBottom: '16px' }}>
                <label className="notetaker-label">Translation Engine</label>
                <select
                  className="notetaker-select"
                  value={translationEngine}
                  onChange={(e) => handleTranslationEngineChange(e.target.value)}
                  disabled={isRecording}
                >
                  <option value="google">Google Translation</option>
                  <option value="deepgram">Deepgram (AI translation)</option>
                  <option value="sarvam">Sarvam</option>
                </select>
              </div>

              {/* Recording Mode Selector */}
              <div className="notetaker-form-group notetaker-mode-group" style={{ marginBottom: '18px' }}>
                <div className="notetaker-mode-label-row">
                  <label className="notetaker-label">Recording Mode</label>
                  <span className="notetaker-mode-badge">{recordingMode === 'personal' ? 'Mic Only' : 'Mic + Meeting Audio'}</span>
                </div>
                <div className="notetaker-mode-selector">
                  <button
                    type="button"
                    className={`notetaker-mode-card ${recordingMode === 'personal' ? 'active' : ''}`}
                    onClick={() => {
                      if (hasActiveRecordingRef.current) return;
                      setRecordingMode('personal');
                      recordingModeRef.current = 'personal';
                    }}
                    disabled={hasActiveRecordingRef.current}
                  >
                    <div className="notetaker-mode-card-header">
                      <i className="fa-solid fa-user"></i>
                      <span className="notetaker-mode-title">Personal</span>
                    </div>
                    <p className="notetaker-mode-desc">Record audio for your own notes</p>
                  </button>

                  <button
                    type="button"
                    className={`notetaker-mode-card ${recordingMode === 'meeting' ? 'active' : ''}`}
                    onClick={() => {
                      if (hasActiveRecordingRef.current) return;
                      setRecordingMode('meeting');
                      recordingModeRef.current = 'meeting';
                    }}
                    disabled={hasActiveRecordingRef.current}
                  >
                    <div className="notetaker-mode-card-header">
                      <i className="fa-solid fa-users"></i>
                      <span className="notetaker-mode-title">Meeting</span>
                    </div>
                    <p className="notetaker-mode-desc">Capture meeting audio and generate speaker-wise notes</p>
                  </button>
                </div>
              </div>

              {/* Timer and recording controls */}
              <div className={`notetaker-timer-wrapper ${recordingStatus}`}>
                <span className="notetaker-waveform notetaker-waveform-left" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
                <div className="notetaker-timer-circle">
                  <span className="notetaker-timer-val">{formatTimer(timerSeconds)}</span>
                  <span className="notetaker-timer-status">
                    {recordingStatus === 'recording' ? 'Recording...' : recordingStatus === 'paused' ? 'Paused' : recordingStatus === 'processing' ? 'Processing audio...' : 'Ready to record'}
                  </span>
                </div>
                <span className="notetaker-waveform notetaker-waveform-right" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
              </div>

              {recordingStatus === 'processing' && (
                <div className="notetaker-processing-copy" role="status">
                  <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
                  <span>Generating transcript and notes...</span>
                </div>
              )}

              <button
                className={`notetaker-action-record-btn ${hasActiveRecordingRef.current ? 'recording' : ''}`}
                onClick={handleStartStopRecording}
                type="button"
                disabled={recordingStatus === 'processing'}
              >
                <i className={`fa-solid ${hasActiveRecordingRef.current ? 'fa-square' : 'fa-microphone'}`} aria-hidden="true"></i>{' '}
                {hasActiveRecordingRef.current ? 'Stop Recording' : 'Start Recording'}
              </button>

              <div className="notetaker-secondary-controls">
                <button
                  className="notetaker-secondary-btn"
                  onClick={handlePauseResume}
                  type="button"
                  disabled={!hasActiveRecordingRef.current || recordingStatus === 'processing'}
                  aria-label={recordingStatus === 'paused' ? 'Resume recording' : 'Pause recording'}
                >
                  <i className={`fa-solid ${recordingStatus === 'paused' ? 'fa-play' : 'fa-pause'}`} aria-hidden="true"></i>
                  {recordingStatus === 'paused' ? 'Resume' : 'Pause'}
                </button>
                <button
                  className="notetaker-secondary-btn"
                  onClick={handleRestartRecording}
                  type="button"
                  disabled={!hasActiveRecordingRef.current || recordingStatus === 'processing'}
                  aria-label="Restart recording"
                >
                  <i className="fa-solid fa-rotate-right" aria-hidden="true"></i> Restart
                </button>
              </div>

              <div className="notetaker-footer-note">
                <i className="fa-solid fa-lock text-gold"></i>
                <span>Audio is processed securely. AI transcribes and analyzes for interview feedback.</span>
              </div>
            </form>
          ) : (
            <div className="notetaker-past-sessions">
              <h3 className="notetaker-section-title">Your Past Sessions</h3>
              {displaySessions.length > 0 ? (
                displaySessions.map((sess) => (
                  <div
                    className="notetaker-past-item"
                    key={sess.id}
                    onClick={() => handleSelectPastSession(sess.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="past-item-left">
                      <h4 className="past-title">{sess.title}</h4>
                      <span className="past-date">{sess.date}</span>
                    </div>
                    <div className="past-item-right">
                      <span className="past-duration"><i className="fa-regular fa-clock"></i> {sess.duration}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                  No past sessions saved yet.
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right Column Card */}
        <section className="notetaker-card notetaker-right-card">
          <div className="notetaker-card-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '12px' }}>
            <div className="notetaker-card-header-main" style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <div className="notetaker-card-icon bg-green-light">
                <i className="fa-solid fa-display"></i>
              </div>
              <div className="notetaker-card-title-group" style={{ marginLeft: '12px' }}>
                <h2 className="notetaker-card-title">AI Interviewer Notetaker</h2>
                <p className="notetaker-card-subtitle">Real-time feedback &amp; coaching</p>
              </div>
              {/* Header Right Tabs */}
              <div className="notetaker-header-tabs" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                <button 
                  className="notetaker-header-tab-btn" 
                  onClick={() => {
                    setLineByLineMode(prev => {
                      const next = !prev;
                      lineByLineModeRef.current = next;
                      return next;
                    });
                  }} 
                  title="Toggle Line-by-Line Mode" 
                  type="button"
                  style={{
                    marginRight: '12px',
                    border: '1px solid ' + (lineByLineMode ? '#10b981' : '#cbd5e1'),
                    background: lineByLineMode ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                    color: lineByLineMode ? '#10b981' : '#64748b',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontWeight: 'bold',
                    borderRadius: '6px',
                    padding: '4px 10px'
                  }}
                >
                  <i className="fa-solid fa-list-ol"></i> Line-by-Line
                </button>
                <button
                  className={`notetaker-header-tab-btn ${rightTab === 'live' ? 'active' : ''}`}
                  onClick={() => setRightTab('live')}
                  type="button"
                >
                  Live View
                </button>
                <button
                  className={`notetaker-header-tab-btn ${rightTab === 'notes' ? 'active' : ''}`}
                  onClick={() => setRightTab('notes')}
                  type="button"
                >
                  AI Summary
                </button>
                <button
                  className={`notetaker-header-tab-btn ${rightTab === 'history' ? 'active' : ''}`}
                  onClick={() => setRightTab('history')}
                  type="button"
                >
                  History
                </button>
              </div>
            </div>
            {/* Action buttons (only when recording or when content exists) */}
            {((isRecording || chatMessages.some(m => m.sender === 'user')) || generatedNotes) && (
              <div className="notetaker-action-toolbar" style={{ display: 'flex', gap: '8px', marginTop: '4px', paddingTop: '8px', borderTop: darkMode ? '1px dashed #121e33' : '1px dashed #cbd5e1', justifyContent: 'flex-start' }}>
                <button className="notetaker-toolbar-btn" onClick={() => setShowExportModal(true)} title="Export" type="button">
                  <i className="fa-solid fa-download"></i> <span>Export</span>
                </button>
                <button className="notetaker-toolbar-btn" onClick={handleEmailNotes} title="Email" type="button">
                  <i className="fa-regular fa-envelope"></i> <span>Email</span>
                </button>
                <button className="notetaker-toolbar-btn" onClick={handleCopyNotes} title="Copy" type="button">
                  <i className="fa-regular fa-copy"></i> <span>Copy</span>
                </button>
              </div>
            )}
          </div>

          <div className="notetaker-card-body">
            {rightTab === 'live' ? (
              <div className="notetaker-live-panel">
                {activeQuestion && (
                  <div className="active-question-display" style={{ margin: '0 0 12px 0' }}>
                    <span className="active-question-label">Question Being Answered:</span>
                    <p className="active-question-text-val">{activeQuestion}</p>
                  </div>
                )}
                {/* Chat window or ready state */}
                <div className="notetaker-chat-messages" ref={chatContainerRef} style={{ paddingBottom: '40px', overflowY: 'auto' }}>
                  {isRecording || chatMessages.length > 0 ? (
                    <>
                      {spokenLang && targetLang && spokenLang !== targetLang && (
                        <div className="notetaker-translation-header">
                          <div className="translation-header-col">{(languageOptions.find(l => l.code === spokenLang)?.name || spokenLang).toUpperCase()} - ORIGINAL</div>
                          <div className="translation-header-col">{(languageOptions.find(l => l.code === targetLang)?.name || targetLang).toUpperCase()} - TRANSLATION</div>
                        </div>
                      )}

                      {chatMessages.map((msg, idx) => {
                        const isSys = isSystemStatusMessage(msg) || msg.isSystem;

                        if (msg.sender === 'ai') {
                          return (
                            <div className={`notetaker-msg-bubble ai ${isSys ? 'notetaker-system-status-msg' : ''}`} key={msg.id || idx}>
                              <div className="msg-avatar">
                                <i className="fa-solid fa-robot"></i>
                              </div>
                              <div className="msg-text">
                                <div className="msg-text-content">{msg.text}</div>
                                {!isSys && msg.translation && (
                                  <div className="notetaker-ai-translation">
                                    <span><i className="fa-solid fa-language" aria-hidden="true"></i> {(languageOptions.find(l => l.code === targetLang)?.name || targetLang).toUpperCase()}</span>
                                    <div>{msg.translation}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }

                        if (msg.messageType === 'chat') {
                          return (
                            <div className="notetaker-msg-bubble user notetaker-chat-prompt" key={msg.id || idx}>
                              <div className="msg-avatar">
                                <i className="fa-solid fa-comment-dots"></i>
                              </div>
                              <div className="msg-text">
                                <div className="msg-speaker-badge">Prompt</div>
                                <div className="msg-text-content">{msg.text}</div>
                                {spokenLang && targetLang && spokenLang !== targetLang && msg.translation && (
                                  <div className="notetaker-prompt-translation-box" style={{ 
                                    marginTop: '8px', 
                                    paddingTop: '6px', 
                                    borderTop: '1px dashed rgba(255, 255, 255, 0.25)',
                                    fontSize: '13px',
                                    color: '#86efac'
                                  }}>
                                    <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.85, marginBottom: '2px' }}>
                                      <i className="fa-solid fa-language"></i> {(languageOptions.find(l => l.code === targetLang)?.name || targetLang)}:
                                    </div>
                                    <div style={{ fontWeight: '500' }}>{msg.translation}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }

                        const isTranslationActive = spokenLang && targetLang && spokenLang !== targetLang;

                        if (isTranslationActive) {
                          const targetLangNameUpper = (languageOptions.find(l => l.code === targetLang)?.name || targetLang).toUpperCase();
                          const userMsgs = chatMessages.filter(m => m.sender === 'user' && m.messageType !== 'chat');
                          const segmentNum = userMsgs.indexOf(msg) + 1;
                          
                          return (
                            <div className={`notetaker-translation-row ${msg.isQuestion ? 'highlighted-question' : ''}`} key={msg.id || idx}>
                              <div className="notetaker-translation-card original">
                                <div className="translation-card-header">
                                  <span className="card-num">#{String(segmentNum).padStart(2, '0')}</span>
                                  <span className="card-speaker">{msg.speakerName}</span>
                                </div>
                                <div className="translation-card-text">{msg.text}</div>
                              </div>
                              <div className="notetaker-translation-card translation">
                                <div className="translation-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                  <span className="card-lang"><i className="fa-solid fa-language"></i> {targetLangNameUpper}</span>
                                </div>
                                <div className="translation-card-text">{msg.translation || 'Translating...'}</div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className={`notetaker-msg-bubble user ${msg.isQuestion ? 'highlighted-question' : ''}`} key={msg.id || idx}>
                            <div className="msg-avatar">
                              <i className="fa-solid fa-user"></i>
                            </div>
                            <div className="msg-text">
                              {msg.speakerName && (
                                <div className="msg-speaker-badge" style={{ fontWeight: 'bold', fontSize: '11px', color: '#88aaff', marginBottom: '4px' }}>
                                  {msg.speakerName}
                                </div>
                              )}
                              <div className="msg-text-content">{msg.text}</div>
                            </div>
                          </div>
                        );
                      })}

                      {interimMsg && interimMsg.text && (
                        spokenLang && targetLang && spokenLang !== targetLang ? (
                          <div className="notetaker-translation-row interim-bubble" style={{ opacity: 0.75 }}>
                            <div className="notetaker-translation-card original">
                              <div className="translation-card-header">
                                <span className="card-num">#...</span>
                                <span className="card-speaker">{interimMsg.speakerName} <span style={{ fontStyle: 'italic', fontWeight: 'normal', color: '#aaa', marginLeft: '4px' }}>· typing...</span></span>
                              </div>
                              <div className="translation-card-text">{interimMsg.text}</div>
                            </div>
                            <div className="notetaker-translation-card translation">
                              <div className="translation-card-header">
                                <span className="card-lang"><i className="fa-solid fa-language"></i> {(languageOptions.find(l => l.code === targetLang)?.name || targetLang).toUpperCase()}</span>
                              </div>
                              <div className="translation-card-text" style={{ fontStyle: 'italic', color: '#888' }}>Typing...</div>
                            </div>
                          </div>
                        ) : (
                          <div className="notetaker-msg-bubble user interim-bubble" style={{ opacity: 0.75 }}>
                            <div className="msg-avatar">
                              <i className="fa-solid fa-user"></i>
                            </div>
                            <div className="msg-text">
                              <div className="msg-speaker-badge" style={{ fontWeight: 'bold', fontSize: '11px', color: '#88aaff', marginBottom: '4px' }}>
                                {interimMsg.speakerName || 'Speaker 1'} <span style={{ fontStyle: 'italic', fontWeight: 'normal', color: '#aaa', marginLeft: '4px' }}>· typing...</span>
                              </div>
                              <div className="msg-text-content">{interimMsg.text}</div>
                            </div>
                          </div>
                        )
                      )}
                    </>
                  ) : (
                    <div className="notetaker-ready-state">
                      <div className="notetaker-ready-icon-box">
                        <i className="fa-solid fa-microphone"></i>
                      </div>
                      <h3 className="notetaker-ready-title">Ready to Record</h3>
                      <p className="notetaker-ready-subtitle">
                        Select languages and start recording your interview. I'll provide real-time transcription and generate translation-aware notes.
                      </p>
                      <div className="notetaker-ready-pills">
                        <span className="ready-pill pill-green-border">
                          <i className="fa-regular fa-comment-dots"></i> Transcribe
                        </span>
                        <span className="ready-pill pill-orange">
                          <i className="fa-regular fa-star"></i> Analyze
                        </span>
                        <span className="ready-pill pill-green-fill">
                          <i className="fa-solid fa-arrow-trend-up"></i> Improve
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Chat Input Form */}
                <div className="notetaker-chat-input-area">
                  <form onSubmit={handleSendChat} className="notetaker-chat-form">
                    <input
                      type="text"
                      className="notetaker-chat-input"
                      placeholder="Ask the AI copilot for advice..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                    />
                    <button className="notetaker-chat-send-btn" type="submit">
                      <i className="fa-solid fa-paper-plane"></i>
                    </button>
                  </form>
                  <p className="notetaker-chat-help">Ask for tips, question suggestions, or feedback on your answers</p>
                </div>
              </div>
            ) : rightTab === 'history' ? (
              <div className="notetaker-history-panel" style={{ padding: '20px', overflowY: 'auto', maxHeight: '100%', width: '100%' }}>
                {isRecording && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '20px 0', gap: '8px' }}>
                    <div className="listening-indicator-pulse" style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 0 rgba(249, 115, 22, 0.7)', animation: 'pulse 1.5s infinite' }}>
                      <i className="fa-solid fa-microphone" style={{ fontSize: '20px', color: '#fff' }}></i>
                    </div>
                    <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: '500' }}>Listening...</span>
                  </div>
                )}
                

                <div style={{ marginTop: '20px' }}>
                  <h3 style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>History</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(() => {
                      const uniqueHistory = translationHistory.reduce((acc, current) => {
                        const cleanOrig = (current.originalText || '').trim().toLowerCase();
                        if (!cleanOrig) return acc;

                        const existingIdx = acc.findIndex(item => (item.originalText || '').trim().toLowerCase() === cleanOrig);
                        if (existingIdx >= 0) {
                          acc[existingIdx] = current;
                          return acc;
                        }

                        const prefixIdx = acc.findIndex(item => {
                          const prevClean = (item.originalText || '').trim().toLowerCase();
                          return cleanOrig.startsWith(prevClean) || prevClean.startsWith(cleanOrig);
                        });

                        if (prefixIdx >= 0) {
                          if (cleanOrig.length >= (acc[prefixIdx].originalText || '').trim().length) {
                            acc[prefixIdx] = current;
                          }
                          return acc;
                        }

                        acc.push(current);
                        return acc;
                      }, []);

                      if (uniqueHistory.length === 0) {
                        return (
                          <div style={{ textAlign: 'center', padding: '30px 10px', color: '#64748b', background: darkMode ? '#030712' : '#f8fafc', border: darkMode ? '1px dashed #121e33' : '1px dashed #cbd5e1', borderRadius: '8px', fontSize: '14px' }}>
                            No translation history yet. Start recording and speaking to begin.
                          </div>
                        );
                      }

                      return uniqueHistory.map((item, idx) => {
                        const itemKey = item.msgId || `${item.timestamp}_${idx}`;
                        const isSpeaking = currentlyPlayingMsgId === itemKey;

                        return (
                          <div key={idx} style={{ background: darkMode ? '#030712' : '#ffffff', border: darkMode ? '1px solid #121e33' : '1px solid #e2e8f0', boxShadow: darkMode ? 'none' : '0 2px 8px rgba(0,0,0,0.04)', borderRadius: '8px', padding: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', fontSize: '11px', color: '#64748b' }}>
                              <span>{item.timestamp}</span>
                              <span style={{ fontWeight: '500' }}>
                                {(languageOptions.find(l => l.code === item.sourceLang)?.name || item.sourceLang)} → {(languageOptions.find(l => l.code === item.targetLang)?.name || item.targetLang)}
                              </span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '6px' }}>
                              <div>
                                <div style={{ fontSize: '14px', color: darkMode ? '#94a3b8' : '#64748b', wordBreak: 'break-word', lineHeight: '1.4' }}>{item.originalText}</div>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                                <div style={{ fontSize: '14px', color: darkMode ? '#f1f5f9' : '#000000', wordBreak: 'break-word', lineHeight: '1.4' }}>{item.translatedText}</div>
                                <button
                                  onClick={() => isSpeaking ? stopSpeaking() : speakText(item.translatedText, item.targetLang, itemKey)}
                                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: darkMode ? '#94a3b8' : '#000000', fontSize: '12px', cursor: 'pointer', padding: '4px', flexShrink: 0 }}
                                  type="button"
                                  title={isSpeaking ? "Stop translation" : "Replay translation"}
                                >
                                  <i className={isSpeaking ? "fa-solid fa-stop" : "fa-solid fa-play"} style={{ color: darkMode ? '#94a3b8' : '#000000', fontSize: '12px' }}></i>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="notetaker-feedback-panel" style={{ padding: '20px', overflowY: 'auto', maxHeight: '100%', width: '100%' }}>
                {isGenerating ? (
                  <div className="notetaker-ready-state" style={{ padding: '40px 0' }}>
                    <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '32px', color: '#4a9eff', marginBottom: '16px' }}></i>
                    <h3 className="notetaker-ready-title">Generating Summary</h3>
                    <p className="notetaker-ready-subtitle">AI is analyzing the speech transcript and generating your bilingual summary...</p>
                  </div>
                ) : generatedNotes ? (
                  <div className="feedback-section" style={{ width: '100%' }}>
                    <h3 className="feedback-sec-title" style={{ color: darkMode ? '#ffffff' : '#0f172a' }}><i className="fa-solid fa-wand-magic-sparkles text-green"></i> AI Summary {displayedNotesLang ? `(${displayedNotesLang})` : ''}</h3>
                    <div className="notetaker-notes-content" style={{ whiteSpace: 'pre-wrap', color: darkMode ? '#cbd5e1' : '#334155', lineHeight: '1.6', fontSize: '14px', background: darkMode ? '#030712' : '#f8fafc', padding: '16px', borderRadius: '8px', border: darkMode ? '1px solid #121e33' : '1px solid #e2e8f0', minHeight: '200px', width: '100%' }}>
                      {cleanNotesText(generatedNotes)}
                    </div>
                  </div>
                ) : (
                  <div className="notetaker-ready-state" style={{ padding: '40px 0' }}>
                    <div className="notetaker-ready-icon-box">
                      <i className="fa-solid fa-note-sticky"></i>
                    </div>
                    <h3 className="notetaker-ready-title">No Notes Yet</h3>
                     <p className="notetaker-ready-subtitle">Complete a recording session to view generated notes in your spoken and target languages here.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Export transcript modal popup */}
      {showExportModal && (
        <div className="notetaker-modal-overlay">
          <div className="notetaker-modal-card">
            <div className="notetaker-modal-header">
              <h3>Export transcript</h3>
              <button className="notetaker-modal-close-btn" onClick={() => setShowExportModal(false)}>×</button>
            </div>
            <p className="notetaker-modal-desc">Choose what to include and the file format.</p>
            
            <div className="notetaker-modal-section">
              <h4 className="notetaker-modal-section-title">INCLUDE</h4>
              <div className="notetaker-modal-options">
                <label className={`notetaker-modal-option-row ${exportInclude === 'original' ? 'checked' : ''}`} onClick={() => setExportInclude('original')}>
                  <div className="notetaker-modal-option-checkbox"></div>
                  <span className="notetaker-modal-option-text">Original</span>
                </label>
                <label className={`notetaker-modal-option-row ${exportInclude === 'translation' ? 'checked' : ''}`} onClick={() => setExportInclude('translation')}>
                  <div className="notetaker-modal-option-checkbox"></div>
                  <span className="notetaker-modal-option-text">Translation</span>
                </label>
                <label className={`notetaker-modal-option-row ${exportInclude === 'both' ? 'checked' : ''}`} onClick={() => setExportInclude('both')}>
                  <div className="notetaker-modal-option-checkbox"></div>
                  <span className="notetaker-modal-option-text">Both side-by-side</span>
                </label>
                <label className={`notetaker-modal-option-row ${exportInclude === 'summary' ? 'checked' : ''}`} onClick={() => setExportInclude('summary')}>
                  <div className="notetaker-modal-option-checkbox"></div>
                  <span className="notetaker-modal-option-text">AI summary</span>
                </label>
              </div>
            </div>

            <div className="notetaker-modal-section">
              <h4 className="notetaker-modal-section-title">FORMAT</h4>
              <div className="notetaker-modal-options">
                <label className={`notetaker-modal-option-row ${exportFormat === 'pdf' ? 'checked' : ''}`} onClick={() => setExportFormat('pdf')}>
                  <div className="notetaker-modal-option-checkbox"></div>
                  <span className="notetaker-modal-option-text">PDF Document</span>
                </label>
                <label className={`notetaker-modal-option-row ${exportFormat === 'txt' ? 'checked' : ''}`} onClick={() => setExportFormat('txt')}>
                  <div className="notetaker-modal-option-checkbox"></div>
                  <span className="notetaker-modal-option-text">Plain text (Notepad)</span>
                </label>
              </div>
            </div>

            <div className="notetaker-modal-section">
              <h4 className="notetaker-modal-section-title">OPTIONS</h4>
              <div className="notetaker-modal-options">
                <label 
                  className={`notetaker-modal-option-row ${exportIncludeAiChat ? 'checked' : ''}`} 
                  onClick={() => setExportIncludeAiChat(prev => !prev)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="notetaker-modal-option-checkbox"></div>
                  <span className="notetaker-modal-option-text">Include AI Copilot Prompts &amp; Answers</span>
                </label>
              </div>
            </div>

            <div className="notetaker-modal-actions">
              <button className="notetaker-modal-btn-cancel" onClick={() => setShowExportModal(false)}>Cancel</button>
              <button className="notetaker-modal-btn-download" onClick={handleExportDownload}>
                <i className="fa-solid fa-download"></i> Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Session modal popup */}
      {showSaveSessionModal && (
        <div className="notetaker-modal-overlay" style={{ zIndex: 9999 }}>
          <div 
            className="notetaker-modal-card" 
            style={{ 
              maxWidth: '560px', 
              width: '90%', 
              background: darkMode ? '#12121c' : '#ffffff', 
              borderColor: darkMode ? 'rgba(255, 255, 255, 0.08)' : '#cbd5e1',
              boxShadow: darkMode ? '0 20px 40px rgba(0, 0, 0, 0.5)' : '0 20px 40px rgba(0, 0, 0, 0.15)'
            }}
          >
            <div className="notetaker-modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <h3 style={{ color: darkMode ? '#ffffff' : '#121e33', fontSize: '18px', margin: 0 }}>Stop &amp; Save Session</h3>
              <button 
                className="notetaker-modal-close-btn" 
                onClick={() => setShowSaveSessionModal(false)}
                style={{ color: darkMode ? '#94a3b8' : '#64748b' }}
              >×</button>
            </div>
            <p className="notetaker-modal-desc" style={{ color: darkMode ? 'rgba(255, 255, 255, 0.6)' : '#64748b', fontSize: '14px', marginTop: '8px', marginBottom: '16px' }}>
              Please enter a name for this session to save it to your Past Sessions history.
            </p>
            
            <div className="notetaker-modal-section" style={{ marginTop: '8px' }}>
              <label 
                className="notetaker-label" 
                style={{ 
                  fontWeight: 'bold', 
                  display: 'block', 
                  marginBottom: '8px', 
                  color: darkMode ? '#cbd5e1' : '#475569',
                  fontSize: '12px'
                }}
              >
                Notes Name
              </label>
              <input
                type="text"
                className="notetaker-input"
                placeholder={getDefaultSessionTitle()}
                value={tempTitle}
                onChange={(e) => setTempTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveSessionConfirm(false);
                  }
                }}
                autoFocus
                autoComplete="off"
                style={{ 
                  width: '100%', 
                  boxSizing: 'border-box',
                  color: darkMode ? '#ffffff' : '#121e33',
                  background: darkMode ? '#1e1e2f' : '#f8fafc',
                  border: darkMode ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div 
              className="notetaker-modal-actions" 
              style={{ 
                display: 'flex', 
                gap: '12px', 
                justifyContent: 'flex-end', 
                marginTop: '28px',
                borderTop: 'none',
                paddingTop: 0
              }}
            >
              <button 
                className="notetaker-modal-btn-cancel" 
                onClick={() => setShowSaveSessionModal(false)}
                type="button"
                style={{ 
                  marginRight: 'auto',
                  height: '42px',
                  borderRadius: '10px',
                  border: darkMode ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #cbd5e1',
                  color: darkMode ? '#cbd5e1' : '#475569',
                  fontSize: '13px',
                  whiteSpace: 'nowrap',
                  padding: '0 16px'
                }}
              >
                Cancel (Keep Recording)
              </button>
              <button 
                className="notetaker-modal-btn-cancel" 
                onClick={() => handleSaveSessionConfirm(true)}
                type="button"
                style={{ 
                  background: '#ef4444', 
                  color: '#ffffff', 
                  border: 'none',
                  height: '42px',
                  borderRadius: '10px',
                  fontSize: '13.5px',
                  fontWeight: '700',
                  whiteSpace: 'nowrap',
                  padding: '0 18px',
                  cursor: 'pointer'
                }}
              >
                Stop &amp; Discard
              </button>
              <button 
                className="notetaker-modal-btn-download" 
                onClick={() => handleSaveSessionConfirm(false)}
                type="button"
                style={{ 
                  background: '#00cbd6',
                  color: '#0c101a',
                  height: '42px',
                  borderRadius: '10px',
                  fontSize: '13.5px',
                  fontWeight: '700',
                  whiteSpace: 'nowrap',
                  padding: '0 20px',
                  cursor: 'pointer',
                  opacity: 1,
                  boxShadow: '0 4px 12px rgba(0, 203, 214, 0.25)'
                }}
              >
                Stop &amp; Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Footer strip */}
      <footer className="notetaker-footer-strip">
        <span><i className="fa-solid fa-lock"></i> Privacy-first AI</span>
        <span>•</span>
        <span>Personal use only</span>
        <span>•</span>
        <span>You control &amp; delete your data anytime</span>
        <span>•</span>
        <a href="#" onClick={(e) => e.preventDefault()}>Privacy</a>
        <span>•</span>
        <a href="#" onClick={(e) => e.preventDefault()}>Terms</a>
        <span>•</span>
        <a href="#" onClick={(e) => e.preventDefault()}>Support</a>
      </footer>

      {/* Floating help bubble */}
      <div className="notetaker-floating-bubble">
        <i className="fa-solid fa-comment-dots"></i>
      </div>

      {/* Centralized Credit-Based Restriction & Usage Modal */}
      <CreditUsagePromptModal
        isOpen={creditPromptModal.isOpen}
        onClose={() => setCreditPromptModal(prev => ({ ...prev, isOpen: false, pendingAction: null }))}
        type={creditPromptModal.type}
        title={creditPromptModal.title}
        message={creditPromptModal.message}
        fileDetails={creditPromptModal.fileDetails}
        onConfirm={handleConfirmCreditPrompt}
        onTopUp={handleTopUpFromCreditModal}
        showToast={showToast}
      />
    </div>
  );

}
