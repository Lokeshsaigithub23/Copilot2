import React, { useState, useEffect, useRef } from 'react';
import Teleprompter from './Teleprompter';
import TopBar from './TopBar';
import AccountDropdown from './UserProfile/AccountDropdown';
import { isInterviewQuestion, normalizeNumbersAndMath } from '../utils/questionDetector';
import { API_BASE, WS_BASE, websocketProtocols } from '../utils/api';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

const BUFFER_SIZE = 2048;
const PROFILE_FIELDS = [
  ['name', 'Name'], ['professionalSummary', 'Professional Summary'],
  ['workExperience', 'Work Experience'], ['education', 'Education'], ['skills', 'Skills'],
  ['projects', 'Projects'], ['certifications', 'Certifications'], ['achievements', 'Achievements'],
  ['languages', 'Languages'], ['additionalInformation', 'Additional Information']
];
const emptyProfile = () => Object.fromEntries(PROFILE_FIELDS.map(([key]) => [key, '']));

const getStoredInterviewProfile = () => {
  try {
    const context = JSON.parse(localStorage.getItem('interview_context') || '{}');
    return context.resumeProfile || {};
  } catch (_) {
    return {};
  }
};

const workletCode = `
class PCMForwarder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 1024;
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
            this.buffer = new Int16Array(this.bufferSize);
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

const openAudioDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('copilot_audio_db', 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('audio_store')) {
        db.createObjectStore('audio_store');
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
};

const saveAudioBlob = async (id, blob) => {
  try {
    const db = await openAudioDB();
    const transaction = db.transaction('audio_store', 'readwrite');
    const store = transaction.objectStore('audio_store');
    store.put(blob, String(id));
  } catch (err) {
    console.error('Failed to save audio to IndexedDB:', err);
  }
};

const getAudioBlob = async (id) => {
  try {
    const db = await openAudioDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('audio_store', 'readonly');
      const store = transaction.objectStore('audio_store');
      const request = store.get(String(id));
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('Failed to get audio from IndexedDB:', err);
    return null;
  }
};

const deleteAudioBlob = async (id) => {
  try {
    const db = await openAudioDB();
    const transaction = db.transaction('audio_store', 'readwrite');
    const store = transaction.objectStore('audio_store');
    store.delete(String(id));
  } catch (err) {
    console.error('Failed to delete audio from IndexedDB:', err);
  }
};


export default function InterviewPanel({ token, user, onLogout, onBackToLanding, onGoToNotetaker, onGoToVoiceAgent, onGoToUpload, onGoToDashboard, onGoToProfile, showToast, darkMode, toggleDarkMode, windowType }) {
  // Setup Overlay vs Main Panel state
  const [setupComplete, setSetupComplete] = useState(false);
  const [showInlineTeleprompter, setShowInlineTeleprompter] = useState(false);
  const [teleprompterPosition, setTeleprompterPosition] = useState({ x: window.innerWidth - 420, y: 120 });
  const [showInlineTopBar, setShowInlineTopBar] = useState(false);
  const [topBarPosition, setTopBarPosition] = useState({ x: Math.max(10, (window.innerWidth - 1000) / 2), y: 20 });

  const handleTopBarMouseDown = (e) => {
    if (e.target.closest('.topbar-strip')) {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const initialX = topBarPosition.x;
      const initialY = topBarPosition.y;

      const handleMouseMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        setTopBarPosition({
          x: initialX + dx,
          y: initialY + dy
        });
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
  };

  const handleTeleprompterMouseDown = (e) => {
    if (e.target.closest('.header')) {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const initialX = teleprompterPosition.x;
      const initialY = teleprompterPosition.y;

      const handleMouseMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        setTeleprompterPosition({
          x: initialX + dx,
          y: initialY + dy
        });
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
  };
  const [showReadyCard, setShowReadyCard] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [setupInputValue, setSetupInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [setupError, setSetupError] = useState('');
  const [resumeData, setResumeData] = useState(null);
    const [showProfileForm, setShowProfileForm] = useState(false);
    const [resumeProfile, setResumeProfile] = useState(emptyProfile);
  const [jobDescription, setJobDescription] = useState('');
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [isDraggingResume, setIsDraggingResume] = useState(false);
  const resumeInputRef = useRef(null);

  // Start Session Confirmation Modal states
  const [showStartSessionModal, setShowStartSessionModal] = useState(false);
  const [enableAnswerSuggestions, setEnableAnswerSuggestions] = useState(true);
  const [enableNotetaker, setEnableNotetaker] = useState(true);
  const [hasConsent, setHasConsent] = useState(false);

  // Audio Context & Capture Graph
  const [isListening, setIsListening] = useState(false);
  const [capturePending, setCapturePending] = useState(false);
  const [speechEngine, setSpeechEngine] = useState(() => localStorage.getItem('speechEngine') || 'deepgram');
  const [interviewLanguage, setInterviewLanguage] = useState(() => {
    try { return localStorage.getItem('interview_language') || 'en'; } catch (_) { return 'en'; }
  });
  useEffect(() => {
    try { localStorage.setItem('interview_language', interviewLanguage); } catch (_) {}
  }, [interviewLanguage]);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [sessionTimer, setSessionTimer] = useState('00:00:00');
  const [qsCount, setQsCount] = useState(0);
  const [answersCount, setAnswersCount] = useState(0);

  // Tab View
  const [activeTab, setActiveTab] = useState('live'); // 'live' or 'questions'

  const [liveTranscript, setLiveTranscript] = useState([]);
  const lastBubbleTextRef = useRef('');
  const lastFinalSpeechTimeRef = useRef(0);
  const lastFinalSpeakerRef = useRef('');
  const [interimTranscript, setInterimTranscript] = useState({ speaker: '', text: '' });
  const [questionsList, setQuestionsList] = useState([]);
  const questionsListRef = useRef([]);
  useEffect(() => {
    questionsListRef.current = questionsList;
  }, [questionsList]);
  const [currentQuestion, setCurrentQuestion] = useState('—');
  const [activeCopilotMode, setActiveCopilotMode] = useState('normal');
  const [answerA, setAnswerA] = useState('Waiting to start…');
  const [answerB, setAnswerB] = useState('Waiting to start…');
  const [answerAStatus, setAnswerAStatus] = useState('Paused');
  const [answerBStatus, setAnswerBStatus] = useState('Paused');
  const [screenHidden, setScreenHidden] = useState(true);
  const [candidateAskMode, setCandidateAskMode] = useState(false);
  const candidateAskModeRef = useRef(false);
  useEffect(() => {
    candidateAskModeRef.current = candidateAskMode;
    if (!candidateAskMode) {
      setInterimTranscript({ speaker: '', text: '' });
    }
  }, [candidateAskMode]);

  const handleToggleCandidateAsk = () => {
    setCandidateAskMode(prev => {
      const next = !prev;
      candidateAskModeRef.current = next;
      if (!next) {
        setInterimTranscript({ speaker: '', text: '' });
      }
      return next;
    });
  };

  // Download states
  const [downloadTranscriptDisabled, setDownloadTranscriptDisabled] = useState(true);
  const [downloadAudioDisabled, setDownloadAudioDisabled] = useState(true);
  const [showSaveSessionModal, setShowSaveSessionModal] = useState(false);
  const [saveSessionName, setSaveSessionName] = useState('');
  const [recentSessionAudioUrl, setRecentSessionAudioUrl] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const [completedReview, setCompletedReview] = useState(null);

  const getStorageKey = () => {
    return user?.email 
      ? `copilot_recent_sessions_${user.email}` 
      : 'copilot_recent_sessions';
  };

  useEffect(() => {
    const key = getStorageKey();
    let localSaved = [];
    try {
      localSaved = JSON.parse(localStorage.getItem(key) || '[]');
      setRecentSessions(localSaved);
    } catch (_) {
      setRecentSessions([]);
    }

    if (token) {
      fetch(`${API_BASE}/api/sessions`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && Array.isArray(data.sessions) && isMountedRef.current) {
            const backendSessions = data.sessions.map(s => {
              const p = s.payload || {};
              return {
                id: s.id,
                name: s.title || p.name || `Session ${new Date(s.createdAt).toLocaleString()}`,
                timestamp: p.timestamp || (s.createdAt ? new Date(s.createdAt).toLocaleString() : ''),
                liveTranscript: p.liveTranscript || [],
                questionsList: p.questionsList || [],
                currentQuestion: p.currentQuestion || '—',
                qsCount: s.questionCount || p.qsCount || 0,
                answersCount: p.answersCount || 0,
                answerA: p.answerA || '',
                answerB: p.answerB || '',
                answerAStatus: p.answerAStatus || 'Live',
                answerBStatus: p.answerBStatus || 'Live'
              };
            });

            const idMap = new Set(backendSessions.map(s => String(s.id)));
            const combined = [...backendSessions];
            for (const loc of localSaved) {
              if (!idMap.has(String(loc.id))) {
                combined.push(loc);
              }
            }
            setRecentSessions(combined);
            try {
              localStorage.setItem(key, JSON.stringify(combined));
            } catch (_) {}
          }
        })
        .catch(err => console.warn('[InterviewPanel] Backend sessions fetch failed:', err));
    }
  }, [user, token]);

  // Settings states & refs
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [autoScroll, setAutoScroll] = useState(() => {
    const val = localStorage.getItem('setting_autoScroll');
    return val !== null ? val === 'true' : true;
  });
  const [showRightPanel, setShowRightPanel] = useState(() => {
    const val = localStorage.getItem('setting_showRightPanel');
    return val !== null ? val === 'true' : true;
  });
  const [manualMode, setManualMode] = useState(() => {
    const val = localStorage.getItem('setting_manualMode');
    return val !== null ? val === 'true' : false;
  });
  const [newestFirst, setNewestFirst] = useState(() => {
    const val = localStorage.getItem('setting_newestFirst');
    return val !== null ? val === 'true' : true;
  });
  const [fontSize, setFontSize] = useState(() => {
    const val = localStorage.getItem('setting_fontSize');
    return val !== null ? parseInt(val, 10) : 13;
  });

  const settingsRef = useRef(null);
  const answerARef = useRef(null);
  const answerBRef = useRef(null);
  const isAtBottomARef = useRef(false);
  const isAtBottomBRef = useRef(false);
  const recentInterviewerTextsRef = useRef([]);
  const browserWsRef = useRef(null); // WebSocket for browser-mode live transcription
  const activeAbortControllerRef = useRef(null);

  // Latest Ref hooks to prevent stale closures in IPC listeners
  const setupCompleteRef = useRef(setupComplete);
  const isListeningRef = useRef(isListening);
  const sessionTimerRef = useRef(sessionTimer);
  const currentQuestionRef = useRef(currentQuestion);
  const liveTranscriptRef = useRef(liveTranscript);
  const autoScrollRef = useRef(autoScroll);
  const windowTypeRef = useRef(windowType);

  // Streaming answers for the question currently being generated. questionsList
  // is only written when a stream finishes, so without this the partial text is
  // nowhere to be found and returning to the live question mid-stream shows an
  // empty panel. Held in a ref so per-token updates do not re-render the list.
  const liveAnswersRef = useRef({ question: '', answerA: '', answerB: '' });
  // Generation counter to guard against async start/stop/restart race conditions
  const captureGenRef = useRef(0);
  const capturePendingRef = useRef(false);
  const lastToggleTimeRef = useRef(0);
  const isMountedRef = useRef(true);
  const recentSessionAudioUrlRef = useRef(null);
  const completedReviewAudioUrlRef = useRef(null);

  useEffect(() => { setupCompleteRef.current = setupComplete; }, [setupComplete]);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);
  useEffect(() => { capturePendingRef.current = capturePending; }, [capturePending]);
  useEffect(() => { sessionTimerRef.current = sessionTimer; }, [sessionTimer]);
  useEffect(() => { currentQuestionRef.current = currentQuestion; }, [currentQuestion]);
  useEffect(() => { liveTranscriptRef.current = liveTranscript; }, [liveTranscript]);
  useEffect(() => { autoScrollRef.current = autoScroll; }, [autoScroll]);
  useEffect(() => { windowTypeRef.current = windowType; }, [windowType]);

  useEffect(() => {
    localStorage.setItem('speechEngine', speechEngine);
  }, [speechEngine]);

  useEffect(() => {
    if (!currentQuestion || currentQuestion === '—' || currentQuestion === 'Waiting for question…' || currentQuestion === '-') {
      return;
    }
    const found = questionsList.find(item => item.question === currentQuestion);
    if (found) {
      // A question still being answered has no stored text yet, so fall back to
      // the in-flight stream. Without this, returning to the live question
      // mid-answer blanks both panels.
      const live = liveAnswersRef.current;
      const isLive = live.question === currentQuestion;
      setAnswerA(found.answerA || (isLive ? live.answerA : '') || '');
      setAnswerB(found.answerB || (isLive ? live.answerB : '') || '');
    }
  }, [currentQuestion, questionsList]);

  const normalizeQuestion = (s) => String(s || '').trim().toLowerCase().replace(/[?.!,]/g, '');

  const handleTranscriptQuestionClick = (text) => {
    if (!text) return;
    const cleanText = normalizeQuestion(text);

    // Resolve to the most recent occurrence, and prefer an exact match.
    // Scanning forwards with a substring test picked the earliest question
    // whose text was contained in the clicked one, so asking a follow-up that
    // repeats an earlier question ("Java" -> "Difference between Python and
    // Java") jumped to the older entry instead of the one clicked.
    let matched = null;
    for (let i = questionsList.length - 1; i >= 0 && !matched; i--) {
      if (normalizeQuestion(questionsList[i].question) === cleanText) matched = questionsList[i];
    }
    for (let i = questionsList.length - 1; i >= 0 && !matched; i--) {
      const qText = normalizeQuestion(questionsList[i].question);
      if (qText && (qText.includes(cleanText) || cleanText.includes(qText))) matched = questionsList[i];
    }

    setCurrentQuestion(matched ? matched.question : text);
  };


  const handleScrollA = (e) => {
    const el = e.target;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 25;
    isAtBottomARef.current = isAtBottom;
  };

  const handleScrollB = (e) => {
    const el = e.target;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 25;
    isAtBottomBRef.current = isAtBottom;
  };

  const isAtBottomLiveRef = useRef(true);

  const handleScrollLive = (e) => {
    const el = e.target;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 50;
    isAtBottomLiveRef.current = isAtBottom;
  };

  // Refs for audio graph
  const audioContextRef = useRef(null);
  const streamsRef = useRef([]);
  const nodesRef = useRef({ system: null, mic: null, processor: null, processor2: null });
  const mediaRecorderRef = useRef(null);
  const mediaChunksRef = useRef([]);
  const systemMediaRecorderRef = useRef(null);
  const candidateMediaRecorderRef = useRef(null);
  const systemMediaChunksRef = useRef([]);
  const candidateMediaChunksRef = useRef([]);
  const systemAudioBlobRef = useRef(null);
  const candidateAudioBlobRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const sessionStartMsRef = useRef(null);
  const liveChatScrollRef = useRef(null);
  const lastAudioBlobRef = useRef(null);
  const localCaptureInitiatedRef = useRef(false);
  const recentSessionAudiosRef = useRef({});

  // Fetch Autocomplete Roles & Skills
  useEffect(() => {
    if (!setupComplete && token) {
      fetchRoleSkills('');
    }
  }, [setupComplete, token]);

  const [parsedTech, setParsedTech] = useState('General');
  useEffect(() => {
    try {
      const ctx = JSON.parse(localStorage.getItem('interview_context') || '{}');
      if (ctx.tags && ctx.tags.length > 0) {
        setParsedTech(ctx.tags[0]);
      } else if (ctx.userContextRaw) {
        setParsedTech(ctx.userContextRaw.split(',')[0].trim());
      }
    } catch (_) {}
  }, [setupComplete]);

  // Sync settings with localStorage
  useEffect(() => {
    localStorage.setItem('setting_autoScroll', autoScroll);
  }, [autoScroll]);

  useEffect(() => {
    localStorage.setItem('setting_showRightPanel', showRightPanel);
  }, [showRightPanel]);

  useEffect(() => {
    localStorage.setItem('setting_manualMode', manualMode);
  }, [manualMode]);

  useEffect(() => {
    localStorage.setItem('setting_newestFirst', newestFirst);
  }, [newestFirst]);

  useEffect(() => {
    localStorage.setItem('setting_fontSize', fontSize);
  }, [fontSize]);

  // Resume AudioContext if it gets suspended when returning to Copilot view,
  // and stop audio capture when navigating away from overlay view
  useEffect(() => {
    if (windowType === 'overlay') {
      // If returning to overlay and setup is not complete, ensure save modal is closed
      if (!setupCompleteRef.current) {
        setShowSaveSessionModal(false);
      }
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          console.log('[AudioContext] Resumed successfully on tab switch back to overlay');
        }).catch(err => {
          console.error('[AudioContext] Failed to resume on tab switch back:', err);
        });
      }
    } else {
      // Navigating away from overlay: always close any save session modal and stop capture cleanly
      setShowSaveSessionModal(false);
      if (isListeningRef.current || capturePendingRef.current) {
        captureGenRef.current++;
        capturePendingRef.current = false;
        setCapturePending(false);
        stopAudioCapture({ fromUserAction: false });
      }
    }
  }, [windowType]);

  // Click outside listener for settings dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setShowSettingsDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Auto-scroll answers when they change
  useEffect(() => {
    if (autoScroll && answerARef.current && isAtBottomARef.current) {
      answerARef.current.scrollTop = answerARef.current.scrollHeight;
    }
  }, [answerA, autoScroll]);

  useEffect(() => {
    if (autoScroll && answerBRef.current && isAtBottomBRef.current) {
      answerBRef.current.scrollTop = answerBRef.current.scrollHeight;
    }
  }, [answerB, autoScroll]);

  const fetchRoleSkills = async (q) => {
    try {
      const url = `${API_BASE}/api/profiles/role-skills${q ? `?q=${encodeURIComponent(q)}` : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load roles/skills');
      const data = await res.json();
      const roles = Array.isArray(data?.roles) ? data.roles.map(r => ({ name: r.name, type: 'role' })) : [];
      const skills = Array.isArray(data?.skills) ? data.skills.map(s => ({ name: s.name, type: 'skill' })) : [];
      if (!isMountedRef.current) return;
      setSuggestions([...roles, ...skills]);
    } catch (err) {
      if (!isMountedRef.current) return;
      setSetupError('Could not load roles/skills.');
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setSetupInputValue(val);
    if (!val.trim()) {
      setSuggestions([]);
      return;
    }
    // Simple debounce/throttle for search
    const timer = setTimeout(() => fetchRoleSkills(val.trim()), 220);
    return () => clearTimeout(timer);
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = setupInputValue.trim();
      if (v && !selectedTags.includes(v)) {
        setSelectedTags([...selectedTags, v]);
        setSetupInputValue('');
        setSuggestions([]);
      }
    }
  };

  const addTag = (tag) => {
    if (!selectedTags.includes(tag)) {
      setSelectedTags([...selectedTags, tag]);
    }
    setSetupInputValue('');
    setSuggestions([]);
  };

  const uploadCopilotResume = async (file) => {
    if (!file) return;
    const extension = file.name?.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.pdf', '.docx', '.doc'].includes(extension)) {
      setSetupError('Upload a PDF, DOCX, or DOC resume.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setSetupError('Resume must be smaller than 15MB.');
      return;
    }

    setIsUploadingResume(true);
    setSetupError('');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/api/interview-panel/upload-resume`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Could not analyze this resume.');
      }
      setResumeData(data);
      setResumeProfile({ name: data.preview?.name || '', ...emptyProfile(), ...(data.preview?.sections || {}), name: data.preview?.name || '' });
      const resumeSkills = data.preview?.skills || [];
      setSelectedTags(previous => {
        const combined = [...previous];
        resumeSkills.slice(0, 8).forEach(skill => {
          if (!combined.includes(skill)) combined.push(skill);
        });
        return combined;
      });
    } catch (error) {
      setResumeData(null);
      setSetupError(error.message || 'Could not analyze this resume.');
    } finally {
      setIsUploadingResume(false);
      if (resumeInputRef.current) resumeInputRef.current.value = '';
    }
  };

  const handleCopilotResumeChange = (event) => uploadCopilotResume(event.target.files?.[0]);

  const handleCopilotResumeDrop = (event) => {
    event.preventDefault();
    setIsDraggingResume(false);
    uploadCopilotResume(event.dataTransfer.files?.[0]);
  };

  const clearCopilotResume = () => {
    setResumeData(null);
    setResumeProfile(emptyProfile());
    if (resumeInputRef.current) resumeInputRef.current.value = '';
  };

  const removeTag = (tag) => {
    setSelectedTags(selectedTags.filter(t => t !== tag));
  };

  const handleContinue = () => {
    const customText = setupInputValue.trim();
    let tags = [...selectedTags];
    if (customText && !tags.includes(customText)) {
      tags.push(customText);
      setSelectedTags(tags);
    }
    if (tags.length === 0 && resumeData?.preview?.role) {
      tags = [resumeData.preview.role];
      setSelectedTags(tags);
    }
    if (tags.length === 0) {
      setSetupError('Please add at least one role or skill.');
      return;
    }
    const payload = {
      userContextRaw: tags.join(', '),
      tags,
      domainHint: tags[0] || '',
      resumeFileName: resumeData?.fileName || '',
      resumePreview: resumeData?.preview || null,
      sessionId: 'session_' + Date.now(),
      createdAt: new Date().toISOString()
    };
    localStorage.setItem('interview_context', JSON.stringify(payload));
    setSetupError('');
    setShowProfileForm(true);
  };

  const handleProfileContinue = () => {
    const currentContext = JSON.parse(localStorage.getItem('interview_context') || '{}');
    const profile = { ...emptyProfile(), ...resumeProfile };
    localStorage.setItem('interview_context', JSON.stringify({ ...currentContext, resumeProfile: profile, jobDescription: jobDescription.trim() }));
    setShowProfileForm(false);
    setSetupError('');
    setShowReadyCard(true);
  };

  const handleBackToProfile = () => {
    setShowReadyCard(false);
    setShowProfileForm(true);
  };

  const handleSkip = () => {
    const payload = {
      userContextRaw: 'General Software Engineering',
      tags: ['General'],
      domainHint: 'General',
      sessionId: 'session_' + Date.now(),
      createdAt: new Date().toISOString()
    };
    localStorage.setItem('interview_context', JSON.stringify(payload));
    setSetupError('');
    setResumeData(null);
    setResumeProfile(emptyProfile());
    setShowReadyCard(false);
    setShowProfileForm(true);
  };

  const handleViewPastSessions = () => {
    setShowProfileForm(false);
    setShowReadyCard(false);
    setSetupError('');
    setActiveTab('recent');
    setSetupComplete(true);
  };

  // Dragging Header Controls
  const handleMinimize = () => ipcRenderer?.send('window-minimize');
  const handleMaximize = () => ipcRenderer?.send('window-maximize');
  const handleClose = () => {
    if (isListeningRef.current || capturePendingRef.current) {
      captureGenRef.current++;
      capturePendingRef.current = false;
      setCapturePending(false);
      stopAudioCapture();
    }
    ipcRenderer?.send('window-close');
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

  const getMicrophoneStream = async () => {
    const constraints = {
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    };
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      // ignore
    }
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: {} });
    } catch (e2) {
      // ignore
    }
    throw new Error('No microphone found.');
  };

  const startSessionTimer = () => {
    sessionStartMsRef.current = Date.now();
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      if (!sessionStartMsRef.current) return;
      const elapsed = (Date.now() - sessionStartMsRef.current) / 1000;
      const s = Math.max(0, Math.floor(elapsed));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      const timeStr = [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
      setSessionTimer(timeStr);
      sessionTimerRef.current = timeStr;
      if (ipcRenderer) ipcRenderer.send('topbar-timer-update', timeStr);
    }, 500);
  };

  const stopSessionTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    sessionStartMsRef.current = null;
    setSessionTimer('00:00:00');
    sessionTimerRef.current = '00:00:00';
    if (ipcRenderer) ipcRenderer.send('topbar-timer-update', '00:00:00');
  };

  const pauseSessionTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    sessionStartMsRef.current = null;
  };

  const handleResetTimer = () => {
    captureGenRef.current++;
    capturePendingRef.current = false;
    setCapturePending(false);
    if (isListening) {
      stopAudioCapture();
    }
    stopSessionTimer();
    setHasRecorded(false);
    setLiveTranscript([]);
    lastBubbleTextRef.current = '';
    lastFinalSpeechTimeRef.current = 0;
    lastFinalSpeakerRef.current = '';
    setInterimTranscript({ speaker: '', text: '' });
    setQuestionsList([]);
    setCurrentQuestion('—');
    setQsCount(0);
    setAnswersCount(0);
    setAnswerA('Waiting for question…');
    setAnswerB('Waiting for question…');
    setAnswerAStatus('Live');
    setAnswerBStatus('Live');
    if (recentSessionAudioUrlRef.current) {
      try { URL.revokeObjectURL(recentSessionAudioUrlRef.current); } catch (_) {}
      recentSessionAudioUrlRef.current = null;
    }
    setRecentSessionAudioUrl(null);
    setCompletedReview(null);
  };

  const handleNewSession = () => {
    captureGenRef.current++;
    capturePendingRef.current = false;
    setCapturePending(false);
    if (isListening) {
      stopAudioCapture();
    }
    stopSessionTimer();
    setHasRecorded(false);
    setLiveTranscript([]);
    lastBubbleTextRef.current = '';
    lastFinalSpeechTimeRef.current = 0;
    lastFinalSpeakerRef.current = '';
    setInterimTranscript({ speaker: '', text: '' });
    setQuestionsList([]);
    setCurrentQuestion('—');
    setQsCount(0);
    setAnswersCount(0);
    setAnswerA('Waiting for question…');
    setAnswerB('Waiting for question…');
    setAnswerAStatus('Live');
    setAnswerBStatus('Live');
    setShowReadyCard(false);
    if (recentSessionAudioUrlRef.current) {
      try { URL.revokeObjectURL(recentSessionAudioUrlRef.current); } catch (_) {}
      recentSessionAudioUrlRef.current = null;
    }
    setRecentSessionAudioUrl(null);
    setCompletedReview(null);
    setSetupComplete(false);
  };

  const showCompletedReview = (session, audioBlob, loading = false) => {
    if (completedReviewAudioUrlRef.current) {
      try { URL.revokeObjectURL(completedReviewAudioUrlRef.current); } catch (_) {}
      completedReviewAudioUrlRef.current = null;
    }
    if (loading) {
      setCompletedReview({ status: 'loading', session, transcript: session.liveTranscript || [], audioUrl: null });
      return;
    }
    const audioUrl = audioBlob ? URL.createObjectURL(audioBlob) : null;
    if (audioUrl) completedReviewAudioUrlRef.current = audioUrl;
    setCompletedReview({ status: 'ready', session, transcript: session.liveTranscript || [], audioUrl });
  };

  const timerStrToSeconds = (str) => {
    if (!str) return 0;
    const parts = String(str).split(':').map(Number);
    if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
    return 0;
  };

  const handleSaveSessionSubmit = async (e) => {
    if (e) e.preventDefault();
    const sessionId = Date.now();
    const name = saveSessionName.trim() || `Session ${new Date().toLocaleString()}`;
    showCompletedReview({ liveTranscript: [...liveTranscript] }, null, true);

    let savedTranscript = [...liveTranscript];
    // Mic Off intentionally filters candidate speech during the live session.
    // Recover both speakers only for the saved copy, leaving live capture unchanged.
    if (!candidateAskMode && lastAudioBlobRef.current?.size > 0 && token) {
      try {
        showToast('Preparing the complete saved transcript...');
        const formData = new FormData();
        formData.append('file', lastAudioBlobRef.current, `session-${sessionId}.webm`);
        if (systemAudioBlobRef.current?.size > 0) {
          formData.append('systemAudio', systemAudioBlobRef.current, `session-${sessionId}-interviewer.webm`);
        }
        if (candidateAudioBlobRef.current?.size > 0) {
          formData.append('candidateAudio', candidateAudioBlobRef.current, `session-${sessionId}-candidate.webm`);
        }
        formData.append('language', interviewLanguage);
        const response = await fetch(`${API_BASE}/api/interview-panel/transcribe-saved-audio`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });
        const result = await response.json().catch(() => null);
        if (response.ok && result?.utterances?.length > 0) {
          savedTranscript = result.utterances;
        }
      } catch (error) {
        console.warn('[saveSession] complete transcript recovery failed; keeping live transcript:', error.message);
      }
    }
    
    if (lastAudioBlobRef.current) {
      recentSessionAudiosRef.current[sessionId] = lastAudioBlobRef.current;
      await saveAudioBlob(sessionId, lastAudioBlobRef.current);
      if (!isMountedRef.current) return;
    }

    await new Promise(resolve => setTimeout(resolve, 250));
    
    const timerStr = sessionTimerRef.current || '00:00:00';
    const durationSeconds = timerStrToSeconds(timerStr);

    const newSession = {
      id: sessionId,
      name,
      title: name,
      tech: parsedTech || 'Interview',
      timestamp: new Date().toLocaleString(),
      durationDisplay: timerStr,
      durationSeconds,
      questionCount: qsCount,
      liveTranscript: [...savedTranscript],
      questionsList: [...questionsList],
      currentQuestion,
      qsCount,
      answersCount,
      answerA,
      answerB,
      answerAStatus,
      answerBStatus,
    };
    showCompletedReview(newSession, lastAudioBlobRef.current);
    
    const updated = [newSession, ...recentSessions];
    setRecentSessions(updated);
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(updated));
    } catch (_) {}

    // Notify Profile page and any other views immediately
    window.dispatchEvent(new CustomEvent('kairos-sessions-updated'));

    if (token) {
      fetch(`${API_BASE}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          id: String(sessionId),
          title: name,
          tech: parsedTech || 'Interview',
          durationSeconds,
          durationDisplay: timerStr,
          questionCount: qsCount,
          payload: newSession
        })
      })
        .then(() => {
          window.dispatchEvent(new CustomEvent('kairos-sessions-updated'));
        })
        .catch(err => console.warn('[saveSession] Backend sync failed:', err));
    }
    
    setSaveSessionName('');
    setShowSaveSessionModal(false);
    showToast('Session saved to Recent tab!');
  };

  const handleDeleteRecentSession = async (e, sessToDelete) => {
    if (e) e.stopPropagation();
    const confirmDelete = window.confirm(`Delete "${sessToDelete.name}" permanently?`);
    if (!confirmDelete) return;

    const updated = recentSessions.filter(s => String(s.id) !== String(sessToDelete.id));
    setRecentSessions(updated);
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(updated));
    } catch (_) {}

    await deleteAudioBlob(sessToDelete.id);
    delete recentSessionAudiosRef.current[sessToDelete.id];

    window.dispatchEvent(new CustomEvent('kairos-sessions-updated'));

    if (token) {
      fetch(`${API_BASE}/api/sessions/${encodeURIComponent(sessToDelete.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(() => {
          window.dispatchEvent(new CustomEvent('kairos-sessions-updated'));
        })
        .catch(err => console.warn('[deleteSession] Backend delete failed:', err));
    }

    showToast(`Session "${sessToDelete.name}" deleted.`);
  };

  const handleLoadRecentSession = async (sess) => {
    setLiveTranscript(sess.liveTranscript || []);
    setQuestionsList(sess.questionsList || []);
    setCurrentQuestion(sess.currentQuestion || '—');
    setQsCount(sess.qsCount || 0);
    setAnswersCount(sess.answersCount || 0);
    setAnswerA(sess.answerA || 'Waiting for question…');
    setAnswerB(sess.answerB || 'Waiting for question…');
    setAnswerAStatus(sess.answerAStatus || 'Live');
    setAnswerBStatus(sess.answerBStatus || 'Live');
    showCompletedReview(sess, null, true);
    
    let audioBlob = recentSessionAudiosRef.current[sess.id];
    if (!audioBlob) {
      audioBlob = await getAudioBlob(sess.id);
      if (!isMountedRef.current) return;
      if (audioBlob) {
        recentSessionAudiosRef.current[sess.id] = audioBlob;
      }
    }
    
    if (recentSessionAudioUrlRef.current) {
      try { URL.revokeObjectURL(recentSessionAudioUrlRef.current); } catch (_) {}
      recentSessionAudioUrlRef.current = null;
    }
    
    if (audioBlob) {
      const audioUrl = URL.createObjectURL(audioBlob);
      recentSessionAudioUrlRef.current = audioUrl;
      setRecentSessionAudioUrl(audioUrl);
    } else {
      setRecentSessionAudioUrl(null);
    }

    showCompletedReview(sess, audioBlob);
    
    showToast(`Loaded session: ${sess.name}`);
  };

  // Handle direct navigation from Profile or other views to a specific session in the Past tab
  useEffect(() => {
    if (windowType !== 'overlay') return;
    const targetTab = sessionStorage.getItem('copilot_target_tab');
    if (targetTab === 'recent') {
      setActiveTab('recent');
      const targetSessionId = sessionStorage.getItem('copilot_target_session_id');
      if (targetSessionId && recentSessions.length > 0) {
        const found = recentSessions.find(s => String(s.id) === String(targetSessionId));
        if (found) {
          handleLoadRecentSession(found);
          sessionStorage.removeItem('copilot_target_tab');
          sessionStorage.removeItem('copilot_target_session_id');
        }
      } else if (!targetSessionId) {
        sessionStorage.removeItem('copilot_target_tab');
      }
    }
  }, [windowType, recentSessions]);

  const markCaptureStarted = (captureMode = 'both') => {
    if (!localCaptureInitiatedRef.current) {
      console.log('[copilot] ignoring capture-started since it was not initiated here.');
      return;
    }
    const browserMicOnly = !ipcRenderer && captureMode === 'mic-only';
    setCapturePending(false);
    setIsListening(true);
    setHasRecorded(true);
    setStatusMsg(ipcRenderer ? 'Listening...' : browserMicOnly ? 'Recording microphone only in browser mode.' : 'Recording locally. Live AI transcription requires the desktop app.');
    setLiveTranscript([]);
    lastBubbleTextRef.current = '';
    lastFinalSpeechTimeRef.current = 0;
    lastFinalSpeakerRef.current = '';
    setInterimTranscript({ speaker: '', text: '' });
    setQuestionsList([]);
    setCurrentQuestion('—');
    setQsCount(0);
    setAnswersCount(0);
    setAnswerA('Waiting for question…');
    setAnswerB('Waiting for question…');
    setAnswerAStatus('Live');
    setAnswerBStatus('Live');
    setDownloadTranscriptDisabled(true);
    setDownloadAudioDisabled(true);
    setCompletedReview(null);
    startSessionTimer();
    isAtBottomARef.current = false;
    isAtBottomBRef.current = false;

    let tech = '';
    try {
      const ctx = JSON.parse(localStorage.getItem('interview_context') || '{}');
      tech = (ctx.userContextRaw || '').trim();
    } catch (_) {}

    if (ipcRenderer) {
      ipcRenderer.send('interview-session-meta', { tech });
    } else {
      showToast?.(browserMicOnly ? 'Recording started with microphone only.' : 'Recording started in browser mode. Live AI answers need the desktop app.');
    }
  };

  const markCaptureStopped = (fromUserAction = false) => {
    localCaptureInitiatedRef.current = false;
    setCapturePending(false);
    setIsListening(false);
    pauseSessionTimer();
    setAnswerAStatus('Paused');
    setAnswerBStatus('Paused');
    setStatusMsg('');

    setDownloadTranscriptDisabled(false);
    if (lastAudioBlobRef.current && lastAudioBlobRef.current.size > 0) {
      setDownloadAudioDisabled(false);
    }
    // ONLY show save modal when explicitly stopped by the user in an active interview session
    if (fromUserAction && setupCompleteRef.current) {
      setShowSaveSessionModal(true);
    }
  };

  const markCaptureError = (msg) => {
    localCaptureInitiatedRef.current = false;
    setCapturePending(false);
    setIsListening(false);
    pauseSessionTimer();
    setAnswerAStatus('Paused');
    setAnswerBStatus('Paused');
    setStatusMsg('Error: ' + (msg || 'Capture failed'));
    showToast?.('Recording error: ' + (msg || 'Capture failed'));
  };

  // Start Audio Recording & Deepgram streaming
  const startAudioCapture = async () => {
    capturePendingRef.current = true;
    setCapturePending(true);
    // Assign a unique generation ID to this capture session
    const currentGen = ++captureGenRef.current;

    // Teardown any residual audio resources from prior sessions
    if (nodesRef.current) {
      const { processor, processor2, system, mic } = nodesRef.current;
      [processor, processor2, system, mic].forEach(n => {
        if (n) { try { n.disconnect(); } catch (_) {} }
      });
      nodesRef.current = { system: null, mic: null, processor: null, processor2: null };
    }
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') audioContextRef.current.close().catch(() => {});
      } catch (_) {}
      audioContextRef.current = null;
    }
    if (streamsRef.current) {
      streamsRef.current.forEach(s => {
        if (s) s.getTracks().forEach(t => t.stop());
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
      // Safe environment checks to prevent crashes if APIs are missing
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('AudioContext is not supported by your browser/client.');
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported or not allowed in this environment.');
      }
      if (ipcRenderer && !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('Screen sharing is not supported or not allowed in this environment.');
      }
      console.log('[copilot] starting audio capture...');
      console.log('[copilot] navigator.mediaDevices:', navigator.mediaDevices);
      console.log('[copilot] navigator.mediaDevices.getUserMedia:', navigator.mediaDevices.getUserMedia);
      console.log('[copilot] navigator.mediaDevices.getDisplayMedia:', navigator.mediaDevices.getDisplayMedia);

      const isBrowserMode = !ipcRenderer;
      let displayStream = null;
      let displayCaptureError = null;

      if (navigator.mediaDevices.getDisplayMedia) {
        setStatusMsg(isBrowserMode ? 'Opening Chrome recording permissions...' : 'Select screen (Share audio), then allow microphone.');
        try {
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
          });
        } catch (err) {
          displayCaptureError = err;
          if (!isBrowserMode) {
            throw err;
          }
          console.warn('[copilot] screen capture skipped in browser mode:', err);
        }
      }

      // Cancellation guard: ensure generation is still valid before continuing
      if (captureGenRef.current !== currentGen) {
        if (displayStream) displayStream.getTracks().forEach(t => t.stop());
        capturePendingRef.current = false;
        setCapturePending(false);
        return;
      }

      setStatusMsg('Allow microphone access.');
      const micStream = await getMicrophoneStream();
      // Cancellation guard: ensure generation is still valid after mic permission prompt
      if (captureGenRef.current !== currentGen) {
        if (displayStream) displayStream.getTracks().forEach(t => t.stop());
        micStream.getTracks().forEach(t => t.stop());
        capturePendingRef.current = false;
        setCapturePending(false);
        return;
      }
      streamsRef.current = [displayStream, micStream].filter(Boolean);

      const sysTrack = displayStream?.getAudioTracks?.()[0] || null;
      if (!sysTrack && !isBrowserMode) {
        throw new Error('Share audio must be enabled.');
      }
      const micTrack = micStream.getAudioTracks()[0];
      if (!micTrack) {
        throw new Error('Microphone track missing.');
      }

      audioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        // Cancellation guard: ensure generation did not change while suspended
        if (captureGenRef.current !== currentGen) {
          if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(() => {});
          }
          capturePendingRef.current = false;
          setCapturePending(false);
          return;
        }
      }
      const rate = audioContextRef.current.sampleRate;

      let systemSource = null;
      let processor = null;
      let processor2 = null;
      let useWorklet = false;

      if (audioContextRef.current.audioWorklet) {
        try {
          const blob = new Blob([workletCode], { type: 'application/javascript' });
          const url = URL.createObjectURL(blob);
          try {
            await audioContextRef.current.audioWorklet.addModule(url);
          } finally {
            URL.revokeObjectURL(url);
          }
          // Cancellation guard: verify generation did not change while loading worklet
          if (captureGenRef.current !== currentGen) {
            capturePendingRef.current = false;
            setCapturePending(false);
            return;
          }
          useWorklet = true;
        } catch (e) {
          console.warn('[InterviewPanel] AudioWorklet load failed, using ScriptProcessor fallback:', e);
        }
      }

      if (captureGenRef.current !== currentGen) {
        capturePendingRef.current = false;
        setCapturePending(false);
        return;
      }

      if (sysTrack) {
        systemSource = audioContextRef.current.createMediaStreamSource(new MediaStream([sysTrack]));
        if (useWorklet) {
          processor = new AudioWorkletNode(audioContextRef.current, "pcm-forwarder");
          processor.port.onmessage = (e) => {
            // Guard against stale audio processing callbacks
            if (captureGenRef.current !== currentGen) return;
            const int16Buffer = e.data;
            if (ipcRenderer) ipcRenderer.send('audio-chunk-interviewer', new Uint8Array(int16Buffer));
          };
        } else {
          processor = audioContextRef.current.createScriptProcessor(BUFFER_SIZE, 1, 1);
          processor.onaudioprocess = (e) => {
            // Guard against stale audio processing callbacks
            if (captureGenRef.current !== currentGen) return;
            try {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16Buffer = float32ToInt16(inputData);
              if (ipcRenderer) ipcRenderer.send('audio-chunk-interviewer', new Uint8Array(int16Buffer));
            } catch (err) {
              console.error('[onaudioprocess interviewer] processing failed:', err);
            }
          };
        }
      }
      const micSource = audioContextRef.current.createMediaStreamSource(new MediaStream([micTrack]));
      if (useWorklet) {
        processor2 = new AudioWorkletNode(audioContextRef.current, "pcm-forwarder");
        processor2.port.onmessage = (e) => {
          // Guard against stale audio processing callbacks
          if (captureGenRef.current !== currentGen) return;
          const int16Buffer = e.data;
          if (ipcRenderer) ipcRenderer.send('audio-chunk-candidate', new Uint8Array(int16Buffer));
        };
      } else {
        processor2 = audioContextRef.current.createScriptProcessor(BUFFER_SIZE, 1, 1);
        processor2.onaudioprocess = (e) => {
          // Guard against stale audio processing callbacks
          if (captureGenRef.current !== currentGen) return;
          try {
            const inputData = e.inputBuffer.getChannelData(0);
            const int16Buffer = float32ToInt16(inputData);
            if (ipcRenderer) ipcRenderer.send('audio-chunk-candidate', new Uint8Array(int16Buffer));
          } catch (err) {
            console.error('[onaudioprocess candidate] processing failed:', err);
          }
        };
      }

      const gain = audioContextRef.current.createGain();
      gain.gain.value = 0;

      if (systemSource && processor) {
        systemSource.connect(processor);
        processor.connect(gain);
      }
      micSource.connect(processor2);
      processor2.connect(gain);
      gain.connect(audioContextRef.current.destination);

      nodesRef.current = { system: systemSource, mic: micSource, processor, processor2 };

      // Recording Combined Audio
      const recordDest = audioContextRef.current.createMediaStreamDestination();
      const recordGainSys = audioContextRef.current.createGain();
      const recordGainMic = audioContextRef.current.createGain();
      recordGainSys.gain.value = 1;
      recordGainMic.gain.value = 1;

      if (systemSource) {
        systemSource.connect(recordGainSys);
        recordGainSys.connect(recordDest);
      }
      micSource.connect(recordGainMic);
      recordGainMic.connect(recordDest);

      mediaChunksRef.current = [];
      systemMediaChunksRef.current = [];
      candidateMediaChunksRef.current = [];
      systemAudioBlobRef.current = null;
      candidateAudioBlobRef.current = null;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(recordDest.stream, { mimeType: mime });
      recorder.ondataavailable = (e) => {
        // Guard against chunks from an invalidated recording generation
        if (captureGenRef.current !== currentGen) return;
        if (e.data && e.data.size > 0) mediaChunksRef.current.push(e.data);
      };
      const createTrackRecorder = (source, chunksRef, recorderRef) => {
        if (!source) return;
        const destination = audioContextRef.current.createMediaStreamDestination();
        const gainNode = audioContextRef.current.createGain();
        gainNode.gain.value = 1;
        source.connect(gainNode);
        gainNode.connect(destination);
        const trackRecorder = new MediaRecorder(destination.stream, { mimeType: mime });
        trackRecorder.ondataavailable = (e) => {
          if (captureGenRef.current !== currentGen) return;
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorderRef.current = trackRecorder;
        trackRecorder.start(1000);
      };
      createTrackRecorder(systemSource, systemMediaChunksRef, systemMediaRecorderRef);
      createTrackRecorder(micSource, candidateMediaChunksRef, candidateMediaRecorderRef);
      if (captureGenRef.current !== currentGen) {
        return;
      }
      recorder.start(1000);
      mediaRecorderRef.current = recorder;

      if (ipcRenderer) {
        ipcRenderer.send('capture-started', rate, 'both', speechEngine);
      } else {
        if (displayCaptureError || !sysTrack) {
          showToast?.('Screen audio was not available, so browser mode is using microphone only.');
        }
        markCaptureStarted(sysTrack ? 'both' : 'mic-only');

        // ── Browser-mode live transcription via backend WebSocket proxy ──
        const authToken = token || localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
        const openLiveWs = (source) => {
          const ws = new window.WebSocket(`${WS_BASE}/api/transcribe/live?source=${source}&language=${encodeURIComponent(interviewLanguage)}&engine=${encodeURIComponent(speechEngine)}`, websocketProtocols(authToken));
          ws.binaryType = 'arraybuffer';

          ws.onopen = () => {
            // Cancellation guard: ensure socket belongs to the currently active capture generation
            if (captureGenRef.current !== currentGen) {
              try { ws.close(); } catch (_) {}
              return;
            }
            console.log(`[browser-transcribe] WebSocket open. source=${source}`);
          };

          ws.onmessage = (evt) => {
            // Cancellation guard: discard messages from previous/invalidated capture sessions
            if (captureGenRef.current !== currentGen || !isListeningRef.current) return;
            try {
              const msg = JSON.parse(evt.data);
              if (msg.type === 'error') {
                console.error('[browser-transcribe] Provider error:', msg.message);
                showToast?.(msg.message || 'Live speech recognition error. Please check language and provider settings.', 'error');
                return;
              }
              if (msg.type === 'transcript' && msg.text && isListeningRef.current) {
                const isFinal = msg.isFinal !== false;
                const cleanText = normalizeNumbersAndMath(msg.text.trim());
                if (!cleanText) return;

                // When Mic is ON: strictly take ONLY candidate voice (mic). Ignore interviewer voice.
                // When Mic is OFF: strictly take ONLY interviewer voice (displaymedia). Ignore candidate voice.
                if (source === 'candidate') {
                  if (!candidateAskModeRef.current) {
                    return;
                  }
                }

                if (isFinal) {
                  const isMicOn = candidateAskModeRef.current;
                  const isTargetSpeaker = isMicOn ? (source === 'candidate') : (source === 'interviewer');
                  const currentSpeaker = msg.source || source;
                  const now = Date.now();
                  const timeSinceLastFinal = now - (lastFinalSpeechTimeRef.current || 0);

                  // Shorter pause rule keeps live speech responsive and avoids waiting too long to classify a question.
                  const shouldMerge = Boolean(
                    lastFinalSpeakerRef.current === currentSpeaker &&
                    timeSinceLastFinal < 1200 &&
                    lastBubbleTextRef.current
                  );

                  let bubbleText = cleanText;
                  if (shouldMerge) {
                    bubbleText = (lastBubbleTextRef.current + ' ' + cleanText).trim();
                  }
                  lastBubbleTextRef.current = bubbleText;
                  lastFinalSpeechTimeRef.current = now;
                  lastFinalSpeakerRef.current = currentSpeaker;

                  const isQuestion = isInterviewQuestion(bubbleText, false, interviewLanguage);

                  setInterimTranscript({ speaker: '', text: '' });

                  if (shouldMerge) {
                    setLiveTranscript(prev => {
                      if (prev.length === 0) {
                        return [{
                          speaker: currentSpeaker,
                          text: bubbleText,
                          time: sessionTimerRef.current,
                          wallTime: new Date().toLocaleTimeString('en-US', { hour12: false }),
                          isQuestion: isQuestion
                        }];
                      }
                      const lastIdx = prev.length - 1;
                      const updated = {
                        ...prev[lastIdx],
                        text: bubbleText,
                        isQuestion: prev[lastIdx].isQuestion || isQuestion
                      };
                      return [...prev.slice(0, lastIdx), updated];
                    });
                  } else {
                    setLiveTranscript(prev => [
                      ...prev,
                      {
                        speaker: currentSpeaker,
                        text: bubbleText,
                        time: sessionTimerRef.current,
                        wallTime: new Date().toLocaleTimeString('en-US', { hour12: false }),
                        isQuestion: isQuestion
                      }
                    ]);
                  }
                  scrollLiveToBottom();

                  // ── Browser-mode AI Copilot: candidate audio ONLY when Mic On; interviewer ONLY when Mic Off ──
                  const shouldTriggerAnswer = isQuestion || (interviewLanguage !== 'en' && bubbleText.length >= 8);
                  if (shouldTriggerAnswer) {
                    if (isQuestion) {
                      setCurrentQuestion(bubbleText);
                      setActiveCopilotMode('normal');
                      setQsCount(prev => prev + 1);
                      setQuestionsList(prev => {
                        const exists = prev.some(item => item.question === bubbleText);
                        if (exists) return prev.map(item => item.question === bubbleText ? { ...item, answerA: '', answerB: '' } : item);
                        return [...prev, { question: bubbleText, index: prev.length + 1, time: sessionTimerRef.current, wallTime: new Date().toLocaleTimeString('en-US', { hour12: false }), answerA: '', answerB: '' }];
                      });
                      setAnswerA('Thinking…');
                      setAnswerB('Thinking…');
                    }

                    if (activeAbortControllerRef.current) {
                      try {
                        activeAbortControllerRef.current.abort();
                      } catch (_) {}
                    }
                    const controller = new AbortController();
                    activeAbortControllerRef.current = controller;

                    const recentHistory = (questionsListRef.current || [])
                      .filter(item => item.question && item.question !== bubbleText)
                      .slice(-3)
                      .map(item => ({
                        question: item.question,
                        answer: (item.answerB || item.answerA || '').slice(0, 300)
                      }));

                    fetch(`${API_BASE}/api/copilot/answer`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                      },
                      signal: controller.signal,
                      body: JSON.stringify({
                        text: bubbleText,
                        forceQuestion: isQuestion,
                        history: recentHistory,
                        language: interviewLanguage,
                        resumeContext: JSON.stringify({
                          resumeText: resumeData?.resumeText || '',
                          profile: getStoredInterviewProfile()
                        })
                      })
                    }).then(res => {
                      // Cancellation guard: ensure generation is still valid before processing response
                      if (captureGenRef.current !== currentGen) return;
                      if (!res.ok || !res.body) return;
                      const contentType = res.headers.get('content-type') || '';
                      if (!contentType.includes('text/event-stream')) {
                        if (isQuestion) {
                          setAnswerA('');
                          setAnswerB('');
                        }
                        return;
                      }

                      const reader = res.body.getReader();
                      const decoder = new TextDecoder();
                      let buffer = '';

                      const read = () => reader.read().then(({ done, value }) => {
                        // Cancellation guard: stop streaming if session ended or was restarted
                        if (captureGenRef.current !== currentGen) return;
                        if (done) return;
                        buffer += decoder.decode(value, { stream: true });
                        const parts = buffer.split('\n\n');
                        buffer = parts.pop();
                        for (const part of parts) {
                          const lines = part.split('\n');
                          let eventName = 'message';
                          let dataStr = '';
                          for (const line of lines) {
                            if (line.startsWith('event:')) eventName = line.slice(6).trim();
                            if (line.startsWith('data:')) dataStr = line.slice(5).trim();
                          }
                          if (!dataStr) continue;
                          try {
                            const data = JSON.parse(dataStr);
                            if (eventName === 'ai-answer-start') {
                              const q = data.question || '';
                              if (q && isListeningRef.current) {
                                setCurrentQuestion(q);
                                setActiveCopilotMode('normal');
                                setQsCount(prev => prev + 1);
                                setQuestionsList(prev => {
                                  const exists = prev.some(item => item.question === q);
                                  if (exists) return prev.map(item => item.question === q ? { ...item, answerA: '', answerB: '' } : item);
                                  return [...prev, { question: q, index: prev.length + 1, time: sessionTimerRef.current, wallTime: new Date().toLocaleTimeString('en-US', { hour12: false }), answerA: '', answerB: '' }];
                                });
                                setAnswerA('Thinking…');
                                setAnswerB('Thinking…');
                                // Mark speaker bubble orange
                                setLiveTranscript(prev => {
                                  const idx = [...prev].reverse().findIndex(e => e.text.trim() === q.trim());
                                  if (idx === -1) return prev;
                                  const realIdx = prev.length - 1 - idx;
                                  return prev.map((e, i) => i === realIdx ? { ...e, isQuestion: true } : e);
                                });
                              }
                            } else if (eventName === 'ai-answer') {
                              const { question: q, answer, panel } = data;
                              if (panel === 'a') setAnswerA(answer); else setAnswerB(answer);
                              if (q) {
                                setQuestionsList(prev => prev.map(item => {
                                  if (item.question !== q) return item;
                                  return panel === 'a' ? { ...item, answerA: answer } : { ...item, answerB: answer };
                                }));
                              }
                            } else if (eventName === 'ai-answer-done') {
                              if (data.panel === 'b') setAnswersCount(prev => prev + 1);
                            }
                          } catch (_) {}
                        }
                        read();
                      }).catch(err => {
                        if (err?.name === 'AbortError') return;
                        console.error('[browser-copilot] SSE read error:', err);
                      });

                      read();
                    }).catch(err => {
                      if (err?.name === 'AbortError') return;
                      console.error('[browser-copilot] fetch error:', err);
                    });
                  }
                } else {
                  if (source === 'candidate' && !candidateAskModeRef.current) return;
                  setInterimTranscript({
                    speaker: msg.source || source,
                    text: cleanText,
                    wallTime: new Date().toLocaleTimeString('en-US', { hour12: false })
                  });
                  scrollLiveToBottom();
                }
              }
            } catch (_) {}
          };

          ws.onerror = (e) => {
            // Guard against stale callbacks from past connections
            if (captureGenRef.current !== currentGen) return;
            console.error('[browser-transcribe] WebSocket error:', e);
          };
          ws.onclose = () => {
            // Guard against stale callbacks from past connections
            if (captureGenRef.current !== currentGen) return;
            console.log(`[browser-transcribe] WebSocket closed. source=${source}`);
          };
          return ws;
        };

        // ── Mic (candidate) → RIGHT side, no question detection ──
        const micWs = openLiveWs('candidate');

        // ── System audio (interviewer) → LEFT side, question detection + AI answers ──
        let intervWs = null;
        const { processor, processor2 } = nodesRef.current;

        if (sysTrack && processor) {
          intervWs = openLiveWs('interviewer');
          if (processor instanceof AudioWorkletNode) {
            processor.port.onmessage = (e) => {
              // Guard against audio packets from superseded sessions
              if (captureGenRef.current !== currentGen) return;
              if (intervWs.readyState !== WebSocket.OPEN) return;
                intervWs.send(e.data);
            };
          } else if (processor.onaudioprocess !== undefined) {
            processor.onaudioprocess = (e) => {
              // Guard against audio packets from superseded sessions
              if (captureGenRef.current !== currentGen) return;
              if (intervWs.readyState !== WebSocket.OPEN) return;
              try {
                const inputData = e.inputBuffer.getChannelData(0);
                const int16Buffer = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                  const s = Math.max(-1, Math.min(1, inputData[i]));
                  int16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
                }
                intervWs.send(int16Buffer.buffer);
              } catch (err) {
                console.error('[browser-transcribe] interviewer onaudioprocess error:', err);
              }
            };
          }
        }

        // Mic (candidate) audio → right side WebSocket
        if (processor2) {
          if (processor2 instanceof AudioWorkletNode) {
            processor2.port.onmessage = (e) => {
              // Guard against audio packets from superseded sessions
              if (captureGenRef.current !== currentGen) return;
              if (micWs.readyState !== WebSocket.OPEN) return;
              if (!candidateAskModeRef.current) {
                // Send silence so Deepgram connection stays alive without detecting any candidate speech
                const silent = new Int16Array(e.data.byteLength / 2);
                micWs.send(silent.buffer);
              } else {
                micWs.send(e.data);
              }
            };
          } else if (processor2.onaudioprocess !== undefined) {
            processor2.onaudioprocess = (e) => {
              // Guard against audio packets from superseded sessions
              if (captureGenRef.current !== currentGen) return;
              if (micWs.readyState !== WebSocket.OPEN) return;
              try {
                const inputData = e.inputBuffer.getChannelData(0);
                const int16Buffer = new Int16Array(inputData.length);
                if (candidateAskModeRef.current) {
                  for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]));
                    int16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
                  }
                }
                micWs.send(int16Buffer.buffer);
              } catch (err) {
                console.error('[browser-transcribe] candidate onaudioprocess error:', err);
              }
            };
          }
        }

        if (captureGenRef.current !== currentGen) {
          try { micWs.close(); } catch (_) {}
          try { if (intervWs) intervWs.close(); } catch (_) {}
          capturePendingRef.current = false;
          setCapturePending(false);
          return;
        }

        browserWsRef.current = { mic: micWs, interviewer: intervWs };
        capturePendingRef.current = false;
        setCapturePending(false);
      }
    } catch (err) {
      capturePendingRef.current = false;
      setCapturePending(false);
      if (captureGenRef.current !== currentGen) return;
      streamsRef.current.forEach(s => s.getTracks().forEach(t => t.stop()));
      streamsRef.current = [];
      const msg = err.message || 'Capture failed';
      if (ipcRenderer) {
        ipcRenderer.send('capture-error', msg);
      } else {
        markCaptureError(msg);
      }
    }
  };

  const stopAudioCapture = (opts = {}) => {
    const { fromUserAction = false } = (typeof opts === 'object' && opts !== null) ? opts : {};
    // Invalidate current generation so pending connection/processing events are discarded
    const stopGen = ++captureGenRef.current;
    capturePendingRef.current = false;
    setCapturePending(false);
    isListeningRef.current = false;
    localCaptureInitiatedRef.current = false;
    setStatusMsg('Saving session…');
    pauseSessionTimer();
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    
    const afterAudio = (targetGen) => {
      // Guard: if a new session started during async audio recording/saving, do not touch it
      if (targetGen !== undefined && captureGenRef.current !== targetGen) return;

      // Teardown audio graph
      const nodes = nodesRef.current;
      [nodes.processor, nodes.processor2, nodes.system, nodes.mic].forEach(n => {
        if (n) { try { n.disconnect(); } catch (_) {} }
      });
      nodesRef.current = { system: null, mic: null, processor: null, processor2: null };
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      streamsRef.current.forEach(s => s.getTracks().forEach(t => t.stop()));
      streamsRef.current = [];
      if (ipcRenderer) {
        ipcRenderer.send('capture-stopped');
      } else {
        // Close browser-mode WebSocket connections (both mic + interviewer)
        if (browserWsRef.current) {
          const { mic, interviewer } = browserWsRef.current;
          if (mic && (mic.readyState === WebSocket.OPEN || mic.readyState === WebSocket.CONNECTING)) {
            mic.onopen = null;
            mic.onmessage = null;
            mic.onerror = null;
            mic.onclose = null;
            mic.close();
          }
          if (interviewer && (interviewer.readyState === WebSocket.OPEN || interviewer.readyState === WebSocket.CONNECTING)) {
            interviewer.onopen = null;
            interviewer.onmessage = null;
            interviewer.onerror = null;
            interviewer.onclose = null;
            interviewer.close();
          }
          browserWsRef.current = null;
        }
        markCaptureStopped(fromUserAction);
      }
    };

    const flushTrackRecorders = () => {
      const trackRecorders = [systemMediaRecorderRef, candidateMediaRecorderRef];
      return Promise.all(trackRecorders.map((recorderRef) => {
        const trackRecorder = recorderRef.current;
        if (!trackRecorder) return Promise.resolve();
        recorderRef.current = null;
        if (trackRecorder.state === 'inactive') return Promise.resolve();
        return new Promise((resolve) => {
          trackRecorder.onstop = resolve;
          try {
            trackRecorder.stop();
          } catch (_) {
            resolve();
          }
        });
      })).then(() => {
        systemAudioBlobRef.current = systemMediaChunksRef.current.length > 0
          ? new Blob(systemMediaChunksRef.current, { type: mime })
          : null;
        candidateAudioBlobRef.current = candidateMediaChunksRef.current.length > 0
          ? new Blob(candidateMediaChunksRef.current, { type: mime })
          : null;
        systemMediaChunksRef.current = [];
        candidateMediaChunksRef.current = [];
      });
    };

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      const mr = mediaRecorderRef.current;
      mediaRecorderRef.current = null;
      mr.onstop = async () => {
        await flushTrackRecorders();
        const blob = new Blob(mediaChunksRef.current, { type: mime });
        lastAudioBlobRef.current = blob;
        mediaChunksRef.current = [];
        // Immediately release media tracks and audio graph once recorder has flushed
        afterAudio(stopGen);

        if (blob.size > 0) {
          blob.arrayBuffer().then((ab) => {
            if (captureGenRef.current !== stopGen) return;
            if (ipcRenderer) {
              ipcRenderer.send('interview-session-audio', new Uint8Array(ab));
            }
          }).catch(() => {
            if (captureGenRef.current !== stopGen) return;
            if (ipcRenderer) ipcRenderer.send('interview-session-audio', null);
          });
        } else {
          if (captureGenRef.current !== stopGen) return;
          if (ipcRenderer) ipcRenderer.send('interview-session-audio', null);
        }
      };
      try {
        mr.stop();
      } catch (_) {
        lastAudioBlobRef.current = null;
        flushTrackRecorders();
        if (ipcRenderer) ipcRenderer.send('interview-session-audio', null);
        afterAudio(stopGen);
      }
    } else {
      lastAudioBlobRef.current = null;
      mediaRecorderRef.current = null;
      mediaChunksRef.current = [];
      flushTrackRecorders().then(() => {
        if (captureGenRef.current !== stopGen) return;
      if (ipcRenderer) ipcRenderer.send('interview-session-audio', null);
      afterAudio(stopGen);
      });
    }
  };

  const handleModeChange = (mode) => {
    if (!currentQuestion || currentQuestion === '—' || currentQuestion === 'Waiting for question…') return;
    const newMode = activeCopilotMode === mode ? 'normal' : mode;
    setActiveCopilotMode(newMode);
    if (ipcRenderer) {
      ipcRenderer.send('copilot-generate-answer', currentQuestion, newMode);
    }
  };

  // Start button triggers screen media selection first
  const handleStartInterview = () => {
    const now = Date.now();
    // Guard against rapid duplicate clicks within 250ms
    if (now - lastToggleTimeRef.current < 250) return;
    lastToggleTimeRef.current = now;

    if (isListeningRef.current || capturePendingRef.current) {
      return;
    }

    if (!setupComplete && !setupCompleteRef.current) {
      capturePendingRef.current = false;
      setCapturePending(false);
      setSetupComplete(false);
      setSetupError('Complete setup before starting interview.');
      setStatusMsg('Complete setup before starting interview.');
      showToast?.('Complete setup before starting recording.');
      return;
    }
    localCaptureInitiatedRef.current = true;
    capturePendingRef.current = true;
    setCapturePending(true);
    setStatusMsg(ipcRenderer ? 'Select screen (Share audio), then allow microphone.' : 'Opening Chrome recording permissions...');
    showToast?.(ipcRenderer ? 'Select screen audio, then allow microphone.' : 'Chrome should ask for recording permission now.');
    if (ipcRenderer) {
      ipcRenderer.send('prepare-capture', 'both');
    } else {
      startAudioCapture();
    }
  };

  const onTopbarToggleListening = () => {
    const now = Date.now();
    // Guard against rapid duplicate clicks within 250ms
    if (now - lastToggleTimeRef.current < 250) return;
    lastToggleTimeRef.current = now;

    if (isListeningRef.current || capturePendingRef.current) {
      stopAudioCapture();
    } else {
      localCaptureInitiatedRef.current = true;
      handleStartInterview();
    }
  };

  // Wire IPC renderer events
  useEffect(() => {
    if (!ipcRenderer) return;

    const onDoCapture = (_, mode) => {
      if (mode === 'notetaker') return;
      startAudioCapture();
    };

    const onCaptureStarted = (_, mode) => {
      if (mode === 'notetaker') {
        return;
      }
      markCaptureStarted();
    };
    const onCaptureStopped = () => {
      if (windowTypeRef.current === 'overlay') {
        markCaptureStopped();
      }
    };
    const onCaptureError = (_, msg) => markCaptureError(msg);

    const onTranscript = (_, data) => {
      if (!isListeningRef.current) return;
      const source = data?.source || 'combined';
      const text = typeof data === 'string' ? data : (data?.text || '');
      const isFinal = data?.isFinal !== false;
      const merge = data?.merge === true;

      if (!text || !text.trim()) return;
      const cleanText = normalizeNumbersAndMath(text.trim());
      const normalizedText = cleanText.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();

      if (source === 'candidate') {
        if (!candidateAskModeRef.current) {
          // When Mic is Off, ignore candidate voice completely
          return;
        }
        const now = Date.now();
        const isInterviewerLeak = recentInterviewerTextsRef.current.some(x => {
          if (now - x.timestamp > 3000) return false;
          if (x.text === normalizedText) return true;
          const w1 = x.text.split(' ').filter(w => w.length > 2);
          const w2 = normalizedText.split(' ').filter(w => w.length > 2);
          const threshold = candidateAskModeRef.current ? 0.45 : 0.85;
          if (w1.length > 0 && w2.length > 0) {
            const intersect = w1.filter(w => w2.includes(w)).length;
            const similarity = intersect / Math.max(w1.length, w2.length);
            return similarity > threshold;
          }
          return false;
        });
        if (isInterviewerLeak) {
          console.log(`[frontend-gate] Suppressed interviewer leak in candidate stream: "${cleanText}"`);
          return;
        }
      }

      // Echo cancellation: Discard candidate speech that matches recent interviewer speech
      // Filter interviewer voice when Mic On is active
      if ((source === 'interviewer' || source === 'speaker_0' || source === 'speaker_1') && !candidateAskModeRef.current) {
        if (isFinal) {
          recentInterviewerTextsRef.current = [
            ...recentInterviewerTextsRef.current.filter(x => Date.now() - x.timestamp < 3000),
            { text: normalizedText, timestamp: Date.now() }
          ];
          
          // Retroactive echo cancellation: Remove candidate speech bubbles that were just duplicates/echoes
          setLiveTranscript(prev => {
            return prev.filter(entry => {
              if (entry.speaker === 'candidate') {
                const candNorm = entry.text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
                if (normalizedText.includes(candNorm) || candNorm.includes(normalizedText)) {
                  console.log(`[retro-echo-cancellation] Retroactively removed interviewer echo from candidate: "${entry.text}"`);
                  return false;
                }
                
                const w1 = normalizedText.split(' ').filter(w => w.length > 2);
                const w2 = candNorm.split(' ').filter(w => w.length > 2);
                if (w1.length > 0 && w2.length > 0) {
                  const intersect = w1.filter(w => w2.includes(w)).length;
                  const similarity = intersect / Math.max(w1.length, w2.length);
                  if (similarity > 0.35) {
                    console.log(`[retro-echo-cancellation] Retroactively removed interviewer echo (fuzzy) from candidate: "${entry.text}"`);
                    return false;
                  }
                }
              }
              return true;
            });
          });
        }
      }

      if (isFinal) {
        const now = Date.now();
        const timeSinceLastFinal = now - (lastFinalSpeechTimeRef.current || 0);
        const shouldMerge = Boolean(
          lastFinalSpeakerRef.current === source &&
          timeSinceLastFinal < 3000 &&
          lastBubbleTextRef.current
        );

        let bubbleText = cleanText;
        if (shouldMerge) {
          bubbleText = (lastBubbleTextRef.current + ' ' + cleanText).trim();
        }
        lastBubbleTextRef.current = bubbleText;
        lastFinalSpeechTimeRef.current = now;
        lastFinalSpeakerRef.current = source;

        setInterimTranscript({ speaker: '', text: '' });
        setLiveTranscript(prev => {
          if (merge && prev.length > 0) {
            const lastEntry = prev[prev.length - 1];
            if (lastEntry.speaker === source) {
              const updatedLastEntry = {
                ...lastEntry,
                text: (lastEntry.text + ' ' + cleanText).trim(),
                isQuestion: isInterviewQuestion((lastEntry.text + ' ' + cleanText).trim(), false, interviewLanguage) || data?.isQuestion || lastEntry.isQuestion
              };
              return [...prev.slice(0, -1), updatedLastEntry];
            }
          }

          return [
            ...prev,
            { speaker: source, text: bubbleText, time: sessionTimerRef.current, wallTime: new Date().toLocaleTimeString('en-US', { hour12: false }), isQuestion: isInterviewQuestion(bubbleText, false, interviewLanguage) || data?.isQuestion || false }
          ];
        });
        scrollLiveToBottom();

        const isQuestionText = (txt) => {
          if (!txt || txt.trim().length < 5) return false;
          const lower = txt.trim().toLowerCase();
          const GREETINGS = /^(hello|hi|hey|good morning|good afternoon|good evening|welcome|ok|okay|so|yeah|yes|thanks|thank you)\s*[,.!?]?\s*$/i;
          if (GREETINGS.test(lower)) return false;
          const QUESTION_PATTERNS = /^(what|how|why|when|where|who|which|can|could|would|do|does|did|is|are|was|were)\b/i;
          const COMMAND_PATTERNS = /(explain|describe|define|elaborate|tell me|walk me through|talk about|difference between)/i;
          const MULTILINGUAL_PATTERNS = /\b(kya|kaise|kyu|kyon|kab|kahan|kidhar|kaun|kon|enti|emiti|ela|enduku|eppudu|ekkada|evaru|edi|क्या|कौन|कब|कहाँ|कहां|क्यों|कैसे|ఏమిటి|ఎలా|ఎందుకు|ఎప్పుడు|ఎక్కడ|ఎవరు)\b/i;
          return txt.includes('?') || txt.includes('？') || QUESTION_PATTERNS.test(lower) || COMMAND_PATTERNS.test(lower) || MULTILINGUAL_PATTERNS.test(lower);
        };

        const isFinalQ = isInterviewQuestion(bubbleText, false, interviewLanguage) || (interviewLanguage !== 'en' && isQuestionText(bubbleText));
        if (isFinalQ && isListeningRef.current) {
          ipcRenderer.send('copilot-generate-answer', bubbleText, activeCopilotMode, interviewLanguage);
        }
      } else {
        setInterimTranscript({ speaker: source, text: cleanText, wallTime: new Date().toLocaleTimeString('en-US', { hour12: false }), isQuestion: data?.isQuestion });
        scrollLiveToBottom();
      }
    };

    const onAiAnswerStart = (_, data) => {
      if (!isListeningRef.current) return;
      const q = data?.question || '';
      if (q) {
        liveAnswersRef.current = { question: q, answerA: '', answerB: '' };
        setCurrentQuestion(q);
        setActiveCopilotMode('normal');
        setQsCount(prev => prev + 1);
        setQuestionsList(prev => {
          const exists = prev.some(item => item.question === q);
          if (exists) {
            return prev.map(item => {
              if (item.question === q) {
                return { ...item, answerA: '', answerB: '' };
              }
              return item;
            });
          }
          return [
            ...prev,
            { question: q, index: prev.length + 1, time: sessionTimerRef.current, wallTime: new Date().toLocaleTimeString('en-US', { hour12: false }), answerA: '', answerB: '' }
          ];
        });
        setAnswerA('Thinking…');
        setAnswerB('Thinking…');
        isAtBottomARef.current = false;
        isAtBottomBRef.current = false;
        // Mark speaker bubble orange when question detector confirms it's a question
        setLiveTranscript(prev => {
          const idx = [...prev].reverse().findIndex(e => e.text.trim() === q.trim());
          if (idx === -1) return prev;
          const realIdx = prev.length - 1 - idx;
          return prev.map((e, i) => i === realIdx ? { ...e, isQuestion: true } : e);
        });
      }
    };

    const onAiAnswer = (_, data) => {
      if (!isListeningRef.current) return;
      const q = data?.question || '';
      const answer = data?.answer || '';
      const isStreaming = data?.isStreaming === true;
      const panel = data?.panel === 'b' ? 'b' : 'a';

      // Keep the in-flight text somewhere retrievable, so clicking back to the
      // live question mid-stream can restore it.
      if (q && liveAnswersRef.current.question === q) {
        if (panel === 'a') liveAnswersRef.current.answerA = answer;
        else liveAnswersRef.current.answerB = answer;
      }

      // Only paint the panels when the user is actually looking at the question
      // being answered. Previously this ran unconditionally, so opening a past
      // question and then having the live answer stream in would overwrite what
      // the user had chosen to read.
      if (!q || currentQuestionRef.current === q) {
        if (panel === 'a') {
          setAnswerA(answer);
        } else {
          setAnswerB(answer);
        }
      }

      if (q && !isStreaming) {
        setQuestionsList(prev => {
          return prev.map(item => {
            if (item.question === q) {
              if (panel === 'a') {
                return { ...item, answerA: answer };
              } else {
                return { ...item, answerB: answer };
              }
            }
            return item;
          });
        });
      }

      if (!isStreaming && panel === 'b') {
        setAnswersCount(prev => prev + 1);
      }
    };

    const onScreenShareVisibility = (_, isExcluded) => {
      setScreenHidden(isExcluded);
    };

    const onGetQuestion = () => {
      let q = currentQuestionRef.current.trim();
      if (!q || q === '—') {
        const questionPattern = /^(what|how|why|when|where|who|which|can|could|would|do|does|did|is|are|was|were)\b|\?$/i;
        // Search backwards
        const transcript = liveTranscriptRef.current;
        for (let i = transcript.length - 1; i >= 0; i--) {
          const t = transcript[i].text;
          if (t && questionPattern.test(t.trim())) {
            q = t.trim();
            break;
          }
        }
        if ((!q || q === '—') && transcript.length > 0) {
          q = transcript[transcript.length - 1].text;
        }
      }
      ipcRenderer.send('current-question-response', q);
    };

    ipcRenderer.on('do-capture', onDoCapture);
    ipcRenderer.on('capture-started', onCaptureStarted);
    ipcRenderer.on('capture-stopped', onCaptureStopped);
    ipcRenderer.on('capture-error', onCaptureError);
    ipcRenderer.on('transcript', onTranscript);
    ipcRenderer.on('ai-answer-start', onAiAnswerStart);
    ipcRenderer.on('ai-answer', onAiAnswer);
    ipcRenderer.on('screen-share-visibility-status', onScreenShareVisibility);
    ipcRenderer.on('get-current-question', onGetQuestion);
    ipcRenderer.on('topbar-toggle-listening-trigger', onTopbarToggleListening);

    // Request initial screen share visibility status
    ipcRenderer.send('get-screen-share-visibility-status');

    return () => {
      ipcRenderer.removeListener('do-capture', onDoCapture);
      ipcRenderer.removeListener('capture-started', onCaptureStarted);
      ipcRenderer.removeListener('capture-stopped', onCaptureStopped);
      ipcRenderer.removeListener('capture-error', onCaptureError);
      ipcRenderer.removeListener('transcript', onTranscript);
      ipcRenderer.removeListener('ai-answer-start', onAiAnswerStart);
      ipcRenderer.removeListener('ai-answer', onAiAnswer);
      ipcRenderer.removeListener('screen-share-visibility-status', onScreenShareVisibility);
      ipcRenderer.removeListener('get-current-question', onGetQuestion);
      ipcRenderer.removeListener('topbar-toggle-listening-trigger', onTopbarToggleListening);
    };
  }, []);

  // Cleanup recording, timers, object URLs, and active connections on component unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      captureGenRef.current++;
      capturePendingRef.current = false;
      isListeningRef.current = false;

      // Stop any active streams synchronously
      if (streamsRef.current && streamsRef.current.length > 0) {
        streamsRef.current.forEach(s => {
          try { s.getTracks().forEach(t => t.stop()); } catch (_) {}
        });
        streamsRef.current = [];
      }

      // Stop MediaRecorder synchronously without waiting for event callback
      if (mediaRecorderRef.current) {
        try {
          if (mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        } catch (_) {}
        mediaRecorderRef.current = null;
      }

      // Full audio graph & WebSocket teardown
      stopAudioCapture();

      // Clear timers
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }

      // Revoke any active session audio object URL
      if (recentSessionAudioUrlRef.current) {
        try { URL.revokeObjectURL(recentSessionAudioUrlRef.current); } catch (_) {}
        recentSessionAudioUrlRef.current = null;
      }
    };
  }, []);

  // Cleanup on beforeunload (browser tab close/reload)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isListeningRef.current || capturePendingRef.current) {
        captureGenRef.current++;
        stopAudioCapture();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const scrollLiveToBottom = () => {
    if (!autoScrollRef.current) return;
    if (!isAtBottomLiveRef.current) return;
    if (liveChatScrollRef.current) {
      requestAnimationFrame(() => {
        liveChatScrollRef.current.scrollTop = liveChatScrollRef.current.scrollHeight;
      });
    }
  };

  const handleDownloadTranscript = () => {
    if (liveTranscript.length === 0 && questionsList.length === 0) return;
    let text = `Interview Transcript - ${new Date().toLocaleDateString()}\n`;
    text += `==========================================\n\n`;

    text += `--- SPEECH DIALOGUE ---\n\n`;
    if (liveTranscript.length === 0) {
      text += `(No speech captured)\n\n`;
    } else {
      liveTranscript.forEach((entry) => {
        const name = entry.speaker === 'candidate' ? 'Candidate' : (entry.speaker === 'interviewer' ? 'Interviewer' : 'Transcript');
        text += `[${entry.time}] ${name}: ${entry.text}\n\n`;
      });
    }

    text += `==========================================\n`;
    text += `--- QUESTIONS & AI ANSWERS ---\n`;
    text += `==========================================\n\n`;

    if (questionsList.length === 0) {
      text += `(No questions captured)\n\n`;
    } else {
      questionsList.forEach((item) => {
        text += `Question ${item.index} [${item.time}]: "${item.question}"\n\n`;
        text += `Answer A (FASTEST):\n${item.answerA || 'No answer generated.'}\n\n`;
        text += `Answer B (ALTERNATIVE):\n${item.answerB || 'No answer generated.'}\n\n`;
        text += `------------------------------------------\n\n`;
      });
    }

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview_transcript_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = async () => {
    if (liveTranscript.length === 0 && questionsList.length === 0) return;

    let activeModel = 'grok-4.20-0309-non-reasoning';
    if (ipcRenderer) {
      try {
        activeModel = await ipcRenderer.invoke('get-active-model-name');
      } catch (err) {
        console.error('[pdf] failed to get model name:', err);
      }
    }

    const reportDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const reportTime = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const formattedDateTime = `${reportDate} - ${reportTime}`;

    const questionsAnsweredCount = questionsList.filter(q => q.answerA || q.answerB).length;
    const transcriptLinesCount = liveTranscript.length;

    const escapeHtml = (unsafe) => {
      return String(unsafe || '')
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    let qaSectionHTML = '';
    if (questionsList.length > 0) {
      qaSectionHTML = `
        <div class="section-title">Questions & Answers</div>
      `;
      questionsList.forEach((item, index) => {
        const qTime = item.wallTime || item.time || '';
        const displayAnswer = item.answerA || item.answerB || 'No answer generated.';
        const answerParagraphs = escapeHtml(displayAnswer)
          .split(/\n\s*\n/)
          .map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
          .join('');
        qaSectionHTML += `
          <div class="qa-card">
            <div class="qa-header">
              <div class="q-badge">Q${index + 1}</div>
              <span>${qTime} - auto-detected</span>
            </div>
            <div class="q-text">${escapeHtml(item.question)}</div>
            <div class="a-text">${answerParagraphs}</div>
          </div>
        `;
      });
    }

    let transcriptSectionHTML = '';
    if (liveTranscript.length > 0) {
      transcriptSectionHTML = `
        <div class="section-title">Full Transcript</div>
      `;
      liveTranscript.forEach((entry) => {
        const name = entry.speaker === 'candidate' ? 'Candidate' : (entry.speaker === 'interviewer' ? 'Interviewer' : 'Transcript');
        const bubbleClass = entry.speaker === 'candidate' ? 'bubble-candidate' : 'bubble-interviewer';
        const displayTime = entry.wallTime || entry.time || '';
        transcriptSectionHTML += `
          <div class="transcript-row">
            <div class="transcript-time">${displayTime}</div>
            <div class="bubble ${bubbleClass}">
              <strong>${name}:</strong> ${escapeHtml(entry.text)}
            </div>
          </div>
        `;
      });
    }

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Meeting Copilot Report</title>
  <style>
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 40px;
      padding: 0;
      background-color: ${darkMode ? '#121520' : '#ffffff'};
      color: ${darkMode ? '#cbd5e0' : '#1f2937'};
    }
    .report-header {
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      border-radius: 12px;
      padding: 24px;
      color: #ffffff;
      margin-bottom: 30px;
    }
    .report-title {
      font-size: 26px;
      font-weight: 700;
      margin: 0 0 8px 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .report-subtitle {
      font-size: 14px;
      opacity: 0.85;
      margin: 0 0 16px 0;
    }
    .badge-container {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .badge {
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.25);
      padding: 6px 14px;
      border-radius: 99px;
      font-size: 12px;
      color: #ffffff;
    }
    .section-title {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #6366f1;
      margin: 30px 0 15px 0;
      border-bottom: 1px solid ${darkMode ? '#2d3748' : '#e5e7eb'};
      padding-bottom: 8px;
    }
    .qa-card {
      background-color: ${darkMode ? '#1e2230' : '#ffffff'};
      border: 1px solid ${darkMode ? '#2d3748' : '#e5e7eb'};
      border-radius: 10px;
      padding: 16px 18px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .a-text p {
      margin: 0 0 10px 0;
    }
    .a-text p:last-child {
      margin-bottom: 0;
    }
    .qa-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
      font-size: 12px;
      color: ${darkMode ? '#a0aec0' : '#6b7280'};
    }
    .q-badge {
      background-color: #10b981;
      color: #ffffff;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 11px;
    }
    .q-text {
      font-weight: 700;
      font-size: 16px;
      margin-bottom: 6px;
      color: ${darkMode ? '#f7fafc' : '#111827'};
    }
    .a-text {
      font-size: 14px;
      line-height: 1.5;
      color: ${darkMode ? '#cbd5e0' : '#4b5563'};
    }
    .transcript-row {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
      align-items: flex-start;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .transcript-time {
      font-size: 12px;
      color: ${darkMode ? '#718096' : '#9ca3af'};
      width: 65px;
      padding-top: 8px;
      flex-shrink: 0;
    }
    .bubble {
      padding: 9px 18px;
      border-radius: 20px;
      max-width: 80%;
      font-size: 14px;
      line-height: 1.4;
    }
    .bubble-interviewer {
      background-color: ${darkMode ? '#133535' : '#d1fae5'};
      color: ${darkMode ? '#a7f3d0' : '#065f46'};
    }
    .bubble-candidate {
      background-color: ${darkMode ? '#2c224d' : '#ede9fe'};
      color: ${darkMode ? '#ddd6fe' : '#5b21b6'};
    }
    .footer {
      text-align: center;
      font-size: 11px;
      color: ${darkMode ? '#718096' : '#9ca3af'};
      margin-top: 40px;
      border-top: 1px solid ${darkMode ? '#2d3748' : '#e5e7eb'};
      padding-top: 12px;
    }
  </style>
</head>
<body>
  <div class="report-header">
    <div class="report-title">
      <span style="font-size: 28px;">🤖</span> Meeting Copilot Report
    </div>
    <div class="report-subtitle">${formattedDateTime}</div>
    <div class="badge-container">
      <div class="badge">${questionsAnsweredCount} questions answered</div>
      <div class="badge">${transcriptLinesCount} transcript lines</div>
      <div class="badge">Engine: ${speechEngine || 'deepgram'}</div>
      <div class="badge">Model: ${activeModel}</div>
    </div>
  </div>

  ${qaSectionHTML}
  ${transcriptSectionHTML}

  <div class="footer">
    Generated by Meeting Copilot - ${formattedDateTime}
  </div>
</body>
</html>
    `;

    if (ipcRenderer) {
      showToast('Preparing PDF export...');
      const res = await ipcRenderer.invoke('export-to-pdf', {
        html: htmlContent,
        filename: `meeting_copilot_report_${Date.now()}.pdf`
      });
      if (res.ok) {
        showToast('PDF Report saved successfully!');
      } else if (res.error !== 'Cancelled') {
        showToast(`Failed to export PDF: ${res.error}`);
      }
    } else {
      showToast('Preparing PDF report...');
      const filename = `meeting_copilot_report_${Date.now()}.pdf`;

      // Render full HTML document inside a hidden styled iframe to ensure complete CSS & layout calculation
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '0';
      iframe.style.top = '0';
      iframe.style.width = '800px';
      iframe.style.height = '1000px';
      iframe.style.zIndex = '-9999';
      iframe.style.opacity = '0.01';
      iframe.style.pointerEvents = 'none';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(htmlContent);
      doc.close();

      const triggerDownload = () => {
        const renderElement = doc.body;
        if (window.html2pdf) {
          const opt = {
            margin: [10, 10, 10, 10],
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
          };

          window.html2pdf().set(opt).from(renderElement).save().then(() => {
            if (iframe.parentNode) document.body.removeChild(iframe);
            showToast('PDF downloaded successfully!');
          }).catch((err) => {
            console.warn('[pdf] html2pdf save error, falling back to print dialog:', err);
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => {
              if (iframe.parentNode) document.body.removeChild(iframe);
            }, 1000);
          });
        } else {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          setTimeout(() => {
            if (iframe.parentNode) document.body.removeChild(iframe);
          }, 1000);
        }
      };

      setTimeout(() => {
        if (window.html2pdf) {
          triggerDownload();
        } else {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
          script.onload = () => triggerDownload();
          script.onerror = () => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => {
              if (iframe.parentNode) document.body.removeChild(iframe);
            }, 1000);
          };
          document.head.appendChild(script);
        }
      }, 350);
    }
  };

  const handleDownloadAudio = () => {
    if (!lastAudioBlobRef.current) return;
    const url = URL.createObjectURL(lastAudioBlobRef.current);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview_audio_${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTeleprompterOpen = () => {
    if (ipcRenderer) {
      ipcRenderer.send('open-teleprompter');
    }
    if (showToast) {
      showToast('Download desktop app for access');
    } else {
      alert('Download desktop app for access');
    }
  };

  const handleTopBarOpen = () => {
    if (ipcRenderer) {
      ipcRenderer.send('open-topbar');
    }
    if (showToast) {
      showToast('Download desktop app for access');
    } else {
      alert('Download desktop app for access');
    }
  };

  const handleToggleScreenShare = () => {
    ipcRenderer?.send('toggle-screen-share-visibility');
  };

  // Navigation & Back handlers that stop audio capture before moving
  const handleBackToLanding = () => {
    if (isListeningRef.current || capturePendingRef.current) {
      captureGenRef.current++;
      capturePendingRef.current = false;
      setCapturePending(false);
      stopAudioCapture();
    }
    if (onBackToLanding) {
      onBackToLanding();
    } else if (ipcRenderer) {
      ipcRenderer.send('go-back-to-auth-keep-session');
    }
  };

  const handleGoToDashboard = () => {
    if (isListeningRef.current || capturePendingRef.current) {
      captureGenRef.current++;
      capturePendingRef.current = false;
      setCapturePending(false);
      stopAudioCapture();
    }
    if (onGoToDashboard) onGoToDashboard();
  };

  const handleGoToNotetaker = () => {
    if (isListeningRef.current || capturePendingRef.current) {
      captureGenRef.current++;
      capturePendingRef.current = false;
      setCapturePending(false);
      stopAudioCapture();
    }
    if (onGoToNotetaker) onGoToNotetaker();
  };

  const handleGoToVoiceAgent = () => {
    if (isListeningRef.current || capturePendingRef.current) {
      captureGenRef.current++;
      capturePendingRef.current = false;
      setCapturePending(false);
      stopAudioCapture();
    }
    if (onGoToVoiceAgent) onGoToVoiceAgent();
  };

  const handleGoToUpload = () => {
    if (isListeningRef.current || capturePendingRef.current) {
      captureGenRef.current++;
      capturePendingRef.current = false;
      setCapturePending(false);
      stopAudioCapture();
    }
    if (onGoToUpload) onGoToUpload();
  };

  const handleLogoutClick = () => {
    if (isListeningRef.current || capturePendingRef.current) {
      captureGenRef.current++;
      capturePendingRef.current = false;
      setCapturePending(false);
      stopAudioCapture();
    }
    if (onLogout) onLogout();
  };

  const handleBackToSkills = () => {
    if (isListeningRef.current || capturePendingRef.current) {
      captureGenRef.current++;
      capturePendingRef.current = false;
      setCapturePending(false);
      stopAudioCapture();
    }
    setSetupComplete(false);
  };

  const handleCopyText = (txt) => {
    if (!txt || txt === 'Waiting to start…' || txt === 'Thinking…' || txt === 'Waiting for question…') return;
    
    // 1. Try Electron native clipboard first
    try {
      const electron = window.require ? window.require('electron') : null;
      if (electron && electron.clipboard) {
        electron.clipboard.writeText(txt);
        showToast('Answer copied to clipboard!');
        return;
      }
    } catch (_) {}

    // 2. Fallback to browser navigator.clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt)
        .then(() => showToast('Answer copied to clipboard!'))
        .catch(() => {
          fallbackCopyText(txt);
        });
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
      showToast('Answer copied to clipboard!');
    } catch (err) {
      showToast('Failed to copy answer.');
    }
  };

  const escapeHtml = (s) => {
    return (s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  return (
    <div className="interview-panel-root">
      {/* Titlebar for Electron Drag */}
      <div className="window-titlebar">
        <div className="window-title">
          <i className="fa-solid fa-brain"></i> AI Copilot | My Interview Copilot
        </div>
        <div className="window-controls">
          <button className="win-btn win-btn-minimize" onClick={handleMinimize} title="Minimize">—</button>
          <button className="win-btn win-btn-maximize" onClick={handleMaximize} title="Maximize">▢</button>
          <button className="win-btn win-btn-close" onClick={handleClose} title="Close">×</button>
        </div>
      </div>

      {/* 1. Main Interview Panel layout */}
      <div className="app-shell">
        <header className="setup-navbar">
          <div className="setup-navbar-left">
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
          </nav>

          <div className="setup-navbar-right">
            <button onClick={handleBackToSkills} className="setup-action-btn btn-copilot active" type="button">
              <i className="fa-solid fa-rocket"></i> AI Copilot
            </button>
            <button onClick={(e) => { e.preventDefault(); handleGoToNotetaker(); }} className="setup-action-btn btn-notetaker" type="button">
              <i className="fa-solid fa-microphone"></i> Notetaker
            </button>
            <button onClick={handleGoToVoiceAgent} className="setup-action-btn btn-voice-agent" type="button">
              <i className="fa-solid fa-robot"></i> Voice Agent
            </button>
            <button onClick={handleGoToUpload} className="setup-action-btn btn-upload" type="button">
              <i className="fa-solid fa-cloud-arrow-up"></i> Upload
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
              onLogout={handleLogoutClick}
              showToast={showToast}
            />
          </div>
        </header>

        <div className="session-subheader-row">
          <div className="subheader-left">
            <button onClick={handleBackToSkills} className="back-to-skills-btn" type="button" title="Back to Skills">
              <i className="fa-solid fa-arrow-left"></i>
            </button>
            <span className="live-session-badge">Live Session</span>
            <button onClick={handleNewSession} className="new-session-badge-btn" type="button" title="Start New Session">
              New Session
            </button>
          </div>

          <div className="subheader-middle">
            <label className="toolbar-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', cursor: 'pointer' }}>
              <i className="fa-solid fa-globe"></i>
              <select
                className="interview-language-select"
                value={interviewLanguage}
                onChange={(e) => setInterviewLanguage(e.target.value)}
                aria-label="Interview language"
              >
                <optgroup label="Indian Languages">
                  <option value="en">English</option>
                  <option value="hi">Hindi (हिन्दी)</option>
                  <option value="te">Telugu (తెలుగు)</option>
                  <option value="ta">Tamil (தமிழ்)</option>
                  <option value="mr">Marathi (मराठी)</option>
                  <option value="gu">Gujarati (ગુજરાતી)</option>
                  <option value="kn">Kannada (ಕನ್ನಡ)</option>
                  <option value="ml">Malayalam (മലയാളം)</option>
                  <option value="bn">Bengali (বাংলা)</option>
                </optgroup>
                <optgroup label="International Languages">
                  <option value="es">Spanish (Español)</option>
                  <option value="fr">French (Français)</option>
                  <option value="de">German (Deutsch)</option>
                  <option value="pt">Portuguese (Português)</option>
                  <option value="it">Italian (Italiano)</option>
                  <option value="ru">Russian (Русский)</option>
                  <option value="ja">Japanese (日本語)</option>
                  <option value="ko">Korean (한국어)</option>
                  <option value="zh">Chinese (中文)</option>
                  <option value="ar">Arabic (العربية)</option>
                  <option value="nl">Dutch (Nederlands)</option>
                  <option value="id">Indonesian (Bahasa Indonesia)</option>
                </optgroup>
              </select>
            </label>
            <button onClick={handleTeleprompterOpen} className="toolbar-btn btn-teleprompter" type="button">
              <i className="fa-solid fa-file-invoice"></i> Teleprompter
            </button>
            <button onClick={handleTopBarOpen} className="toolbar-btn btn-topbar" type="button">
              <i className="fa-solid fa-window-restore"></i> Top Bar View
            </button>
            <button onClick={handleToggleScreenShare} className={`toolbar-btn btn-screen ${screenHidden ? 'hidden' : 'visible'}`} type="button">
              <i className={`fa-solid ${screenHidden ? 'fa-eye-slash' : 'fa-eye'}`}></i> Screen: {screenHidden ? 'Hidden' : 'Visible'}
            </button>
            <button onClick={handleDownloadTranscript} disabled={downloadTranscriptDisabled} className="toolbar-btn btn-download-transcript" type="button">
              <i className="fa-solid fa-file-arrow-down"></i> Download Transcript
            </button>
            <button onClick={handleDownloadPDF} disabled={downloadTranscriptDisabled} className="toolbar-btn btn-download-pdf" type="button">
              <i className="fa-solid fa-file-pdf"></i> Download PDF
            </button>
            <button onClick={handleDownloadAudio} disabled={downloadAudioDisabled} className="toolbar-btn btn-download-audio" type="button">
              <i className="fa-solid fa-music"></i> Download Audio
            </button>
            <button 
              onClick={() => setSpeechEngine(prev => {
                if (prev === 'deepgram') return 'google';
                if (prev === 'google') return 'sarvam';
                return 'deepgram';
              })}
              className="toolbar-btn btn-engine-toggle"
              type="button"
              title="Click to toggle transcription engine"
              disabled={isListening}
            >
              <i className="fa-solid fa-server" style={{ 
                color: speechEngine === 'google' ? '#f59e0b' : speechEngine === 'sarvam' ? '#10b981' : '#3b82f6' 
              }}></i>
              Engine: <span style={{ 
                fontWeight: 'bold', 
                color: speechEngine === 'google' ? '#f59e0b' : speechEngine === 'sarvam' ? '#10b981' : '#3b82f6' 
              }}>{speechEngine === 'google' ? 'Google STT' : speechEngine === 'sarvam' ? 'Sarvam STT' : 'Deepgram'}</span>
            </button>
          </div>

          <div className="subheader-right">
            <span className="session-timer-badge">{sessionTimer}</span>
            {!isListening && sessionTimer !== '00:00:00' && (
              <button onClick={handleResetTimer} className="reset-timer-btn" type="button" title="Reset Timer">
                <i className="fa-solid fa-rotate-right"></i> Reset
              </button>
            )}
            {!isListening ? (
              capturePending ? (
                <button className="status-pill-btn start-recording" type="button" disabled>
                  <span className="dot"></span> Starting...
                </button>
              ) : !hasRecorded ? (
                <button onClick={handleStartInterview} className="status-pill-btn start-recording" type="button">
                  <span className="dot"></span> Start Recording
                </button>
              ) : (
                <button onClick={handleStartInterview} className="status-pill-btn stopped" type="button">
                  <span className="dot"></span> Stopped
                </button>
              )
            ) : (
              <>
                <button onClick={() => stopAudioCapture({ fromUserAction: true })} className="stop-recording-btn" type="button">
                  <i className="fa-solid fa-square"></i> Stop Recording
                </button>
              </>
            )}
            <button 
              onClick={handleToggleCandidateAsk} 
              className={`mic-pill-btn ${candidateAskMode ? 'on' : 'off'}`} 
              type="button"
              title={candidateAskMode ? "Mic Question Mode is ON: your mic speech will trigger AI Answers" : "Mic Question Mode is OFF: normal candidate speech"}
            >
              <i className={`fa-solid ${candidateAskMode ? 'fa-microphone' : 'fa-microphone-slash'}`}></i> {candidateAskMode ? 'Mic On (Ask Question)' : 'Mic Off'}
            </button>
            <div className="settings-wrapper" ref={settingsRef}>
              <button 
                onClick={() => setShowSettingsDropdown(prev => !prev)} 
                className={`settings-gear-btn ${showSettingsDropdown ? 'active' : ''}`} 
                type="button"
              >
                <i className="fa-solid fa-gear"></i>
              </button>
              {showSettingsDropdown && (
                <div className="settings-dropdown">
                  <div className="settings-item">
                    <div className="settings-item-left">
                      <span className="settings-item-title">Auto Scroll</span>
                      <span className="settings-item-sub">Auto scroll to new messages</span>
                    </div>
                    <label className="settings-toggle">
                      <input 
                        type="checkbox" 
                        checked={autoScroll} 
                        onChange={(e) => setAutoScroll(e.target.checked)} 
                      />
                      <span className="settings-slider"></span>
                    </label>
                  </div>

                  <div className="settings-item">
                    <div className="settings-item-left">
                      <span className="settings-item-title">Right Panel</span>
                      <span className="settings-item-sub">Show Answer B panel</span>
                    </div>
                    <label className="settings-toggle">
                      <input 
                        type="checkbox" 
                        checked={showRightPanel} 
                        onChange={(e) => setShowRightPanel(e.target.checked)} 
                      />
                      <span className="settings-slider"></span>
                    </label>
                  </div>

                  <div className="settings-item">
                    <div className="settings-item-left">
                      <span className="settings-item-title">Manual Mode</span>
                      <span className="settings-item-sub">Control response generation</span>
                    </div>
                    <label className="settings-toggle">
                      <input 
                        type="checkbox" 
                        checked={manualMode} 
                        onChange={(e) => setManualMode(e.target.checked)} 
                      />
                      <span className="settings-slider"></span>
                    </label>
                  </div>

                  <div className="settings-item">
                    <div className="settings-item-left">
                      <span className="settings-item-title">Newest First</span>
                      <span className="settings-item-sub">Show newest at top</span>
                    </div>
                    <label className="settings-toggle">
                      <input 
                        type="checkbox" 
                        checked={newestFirst} 
                        onChange={(e) => setNewestFirst(e.target.checked)} 
                      />
                      <span className="settings-slider"></span>
                    </label>
                  </div>

                  <div className="settings-slider-row">
                    <div className="settings-item-slider-header">
                      <span className="settings-item-title">Font Size</span>
                      <span className="settings-font-val">{fontSize}px</span>
                    </div>
                    <input 
                      type="range" 
                      min="11" 
                      max="20" 
                      value={fontSize} 
                      onChange={(e) => setFontSize(parseInt(e.target.value, 10))} 
                      className="settings-range-input"
                      style={{ 
                        background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((fontSize - 11) / (20 - 11)) * 100}%, #10b981 ${((fontSize - 11) / (20 - 11)) * 100}%, #10b981 100%)`
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <main className="session-main-grid" style={{ gridTemplateColumns: showRightPanel ? '290px 1fr 1fr' : '290px 1fr' }}>
          {/* Column 1: Left (Question & History) */}
          <section className="session-panel-column col-left">


            <div className="card-question-history">
              <div className="history-tabs-header">
                <button
                  onClick={() => setActiveTab('live')}
                  className={`history-tab-btn ${activeTab === 'live' ? 'active' : ''}`}
                  type="button"
                >
                  <i className="fa-solid fa-comment-dots"></i> Live
                </button>
                <button
                  onClick={() => setActiveTab('recent')}
                  className={`history-tab-btn ${activeTab === 'recent' ? 'active' : ''}`}
                  type="button"
                >
                  <i className="fa-solid fa-clock-rotate-left"></i> Past
                </button>
                <button
                  onClick={() => setActiveTab('questions')}
                  className={`history-tab-btn ${activeTab === 'questions' ? 'active' : ''}`}
                  type="button"
                >
                  <i className="fa-solid fa-circle-question"></i> Questions
                  <span className="questions-count-badge">{questionsList.length}</span>
                </button>
              </div>

              <div className="history-tab-content">
                {activeTab === 'questions' ? (
                  <div className="questions-history-list">
                    {questionsList.length === 0 ? (
                      <div className="history-placeholder">No questions captured yet.</div>
                    ) : (
                      (newestFirst ? [...questionsList].reverse() : questionsList).map((item, idx) => (
                        <div
                          key={idx}
                          className={`history-question-item ${item.question === currentQuestion ? 'active' : ''}`}
                          onClick={() => setCurrentQuestion(item.question)}
                        >
                          {item.index}. "{item.question}"
                        </div>
                      ))
                    )}
                  </div>
                ) : activeTab === 'recent' ? (
                  <div className="questions-history-list">
                    {recentSessionAudioUrl && (
                      <div className="session-audio-container" style={{ padding: '10px', borderBottom: '1px solid var(--border-color, #cbd5e1)', background: 'var(--card-bg, #f1f5f9)', borderRadius: '6px', margin: '8px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-color, #1e293b)', marginBottom: '4px' }}>Session Audio:</div>
                        <audio src={recentSessionAudioUrl} controls style={{ width: '100%' }} />
                      </div>
                    )}
                    {recentSessions.length === 0 ? (
                      <div className="history-placeholder">No recent sessions found.</div>
                    ) : (
                      recentSessions.map((sess) => (
                        <div
                          key={sess.id}
                          className="history-question-item"
                          onClick={() => handleLoadRecentSession(sess)}
                          style={{ cursor: 'pointer', padding: '10px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sess.name}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                              <span style={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap' }}>{sess.timestamp}</span>
                              <button
                                type="button"
                                title="Delete session"
                                onClick={(e) => handleDeleteRecentSession(e, sess)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#ef4444',
                                  cursor: 'pointer',
                                  padding: '4px 6px',
                                  borderRadius: '4px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '12px'
                                }}
                              >
                                <i className="fa-solid fa-trash-can" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="live-chat-scroll" ref={liveChatScrollRef} onScroll={handleScrollLive}>
                    {liveTranscript.length === 0 && !interimTranscript.text ? (
                      <div className="live-chat-placeholder">Waiting for speech…</div>
                    ) : (
                      <>
                        {(() => {
                          const lastQuestionIdx = liveTranscript.map((c, i) => c.isQuestion ? i : -1).reduce((max, i) => Math.max(max, i), -1);
                          const isInterimQ = interimTranscript && interimTranscript.isQuestion && interimTranscript.text;

                          return liveTranscript.map((chat, idx) => {
                            const isPresentQ = chat.isQuestion && (!isInterimQ && idx === lastQuestionIdx);
                            const isPastQ = chat.isQuestion && (isInterimQ || idx < lastQuestionIdx);
                            const questionClass = isPresentQ ? 'chat-bubble--question-present' : (isPastQ ? 'chat-bubble--question-past' : '');
                            const isCand = chat.speaker === 'candidate';
                            const isInterv = chat.speaker === 'interviewer';

                            let headerText = '';
                            if (isCand) {
                              headerText = chat.wallTime ? `You • ${chat.wallTime}` : 'You';
                            } else if (isInterv) {
                              headerText = chat.wallTime || '';
                            } else {
                              headerText = `Transcript ${chat.wallTime ? '• ' + chat.wallTime : ''}`;
                            }

                            return (
                              <div
                                key={idx}
                                className={`chat-bubble-container chat-bubble-container--${isCand ? 'candidate' : 'interviewer'} ${chat.isQuestion ? 'chat-bubble-container--question' : ''} ${questionClass}`}
                              >
                                {headerText && (
                                  <div className="chat-bubble-header">
                                    {headerText}
                                  </div>
                                )}
                                <div
                                  className="chat-bubble-body"
                                  // The present question must be clickable too. Once the user
                                  // opens a past question there is otherwise no way back to the
                                  // live one, because it is the only bubble that could return
                                  // them and it had no handler.
                                  onClick={(isPastQ || isPresentQ) ? () => handleTranscriptQuestionClick(chat.text) : undefined}
                                >
                                  {chat.text}
                                </div>
                              </div>
                            );
                          });
                        })()}
                        {interimTranscript.text && (() => {
                          const isCand = interimTranscript.speaker === 'candidate';
                          const isInterv = interimTranscript.speaker === 'interviewer';
                          let headerText = '';
                          if (isCand) {
                            headerText = interimTranscript.wallTime ? `You • ${interimTranscript.wallTime}` : 'You';
                          } else if (isInterv) {
                            headerText = interimTranscript.wallTime || '';
                          } else {
                            headerText = `Transcript ${interimTranscript.wallTime ? '• ' + interimTranscript.wallTime : ''}`;
                          }
                          return (
                            <div
                              className={`chat-bubble-container chat-bubble-container--${isCand ? 'candidate' : 'interviewer'} chat-bubble-container--interim ${interimTranscript.isQuestion ? 'chat-bubble-container--question chat-bubble--question-present' : ''}`}
                            >
                              {headerText && (
                                <div className="chat-bubble-header">
                                  {headerText}
                                </div>
                              )}
                              <div className="chat-bubble-body">
                                {interimTranscript.text}
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          {completedReview ? (
            <section className="completed-review-panel">
              <div className="completed-review-header">
                <div>
                  <span className="completed-review-kicker"><i className="fa-solid fa-circle-check"></i> Interview complete</span>
                  <h2>{completedReview.session?.name || 'Saved interview session'}</h2>
                </div>
                <span className="completed-review-count">{completedReview.transcript.length} transcript entries</span>
              </div>
              {completedReview.status === 'loading' ? (
                <div className="completed-review-buffer">
                  <span className="completed-review-spinner"></span>
                  <strong>Preparing your saved interview</strong>
                  <span>Loading the audio and transcript...</span>
                </div>
              ) : (
                <>
                  <div className="completed-review-audio">
                    <div className="completed-review-section-title"><i className="fa-solid fa-headphones"></i> Session audio</div>
                    {completedReview.audioUrl ? <audio src={completedReview.audioUrl} controls /> : <span className="completed-review-empty">Audio is not available for this session.</span>}
                  </div>
                  <div className="completed-review-transcript">
                    <div className="completed-review-section-title"><i className="fa-solid fa-file-lines"></i> Live transcript</div>
                    {completedReview.transcript.length === 0 ? (
                      <div className="completed-review-empty">No transcript was captured.</div>
                    ) : completedReview.transcript.map((entry, index) => {
                      const isCandidate = entry.speaker === 'candidate';
                      const entryClass = isCandidate ? 'candidate' : (entry.isQuestion ? 'question' : 'interviewer');
                      return (
                        <div className={`completed-review-line completed-review-line--${entryClass}`} key={`${entry.wallTime || entry.time || index}-${index}`}>
                          <span className="completed-review-line-meta">{isCandidate ? 'Candidate' : 'Interviewer'} {entry.wallTime || entry.time || ''}</span>
                          <span className="completed-review-line-text">{entry.text}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          ) : (
          <>
          {/* Column 2: Center (Answer A) */}
          <section className="session-panel-column col-answer glow-blue-left">
            <div className="answer-header-row">
              <span className="answer-title-text"><i className="fa-solid fa-bolt" style={{ color: '#3b82f6' }}></i> Answer A</span>
            </div>
           
            {currentQuestion && currentQuestion !== '-' && currentQuestion !== 'Waiting for question.' && (
              <div className="active-question-display">
                <span className="active-question-label">Question</span>
                <p className="active-question-text-val">{currentQuestion}</p>
              </div>
            )}

            <div 
              ref={answerARef}
              onScroll={handleScrollA}
              className={`answer-text-body ${answerA === 'Waiting to start…' || answerA === 'Waiting for question…' ? 'muted' : ''} ${activeCopilotMode === 'code' ? 'code-mode' : ''}`}
              style={{ fontSize: `${fontSize}px` }}
            >
              {answerA}
            </div>

            <div className="answer-footer-row">
              <div className="feedback-buttons">
                <button className="btn-feedback-thumb" type="button"><i className="fa-regular fa-thumbs-up"></i></button>
                <button className="btn-feedback-thumb" type="button"><i className="fa-regular fa-thumbs-down"></i></button>
              </div>
            </div>
          </section>

          {/* Column 3: Right (Answer B) */}
          {showRightPanel && (
            <section className="session-panel-column col-answer glow-green-left">
              <div className="answer-header-row">
                <span className="answer-title-text"><i className="fa-solid fa-layer-group" style={{ color: '#10b981' }}></i> Answer B</span>
              </div>
            
              {currentQuestion && currentQuestion !== '-' && currentQuestion !== 'Waiting for question.' && (
                <div className="active-question-display">
                  <span className="active-question-label">Question</span>
                  <p className="active-question-text-val">{currentQuestion}</p>
                </div>
              )}

              <div 
                ref={answerBRef}
                onScroll={handleScrollB}
                className={`answer-text-body ${answerB === 'Waiting to start…' || answerB === 'Waiting for question…' ? 'muted' : ''} ${activeCopilotMode === 'code' ? 'code-mode' : ''}`}
                style={{ fontSize: `${fontSize}px` }}
              >
                {answerB}
              </div>

              <div className="answer-footer-row">
                <div className="feedback-buttons">
                  <button className="btn-feedback-thumb" type="button"><i className="fa-regular fa-thumbs-up"></i></button>
                  <button className="btn-feedback-thumb" type="button"><i className="fa-regular fa-thumbs-down"></i></button>
                </div>
              </div>
            </section>
          )}
          </>
          )}
        </main>
      </div>

      {statusMsg && <p id="statusMsg" style={{ display: 'block' }}>{statusMsg}</p>}

      {/* 2. Premium Setup Overlay View */}
      {!setupComplete && (
        <div className="setup-overlay">
          <header className="setup-navbar">
            <div className="setup-navbar-left">
              <div className="setup-navbar-logo"><i className="fa-solid fa-brain"></i></div>
              <div className="setup-navbar-title">My Interview Copilot</div>
            </div>

            <nav className="setup-navbar-tabs">
              <button onClick={(e) => { e.preventDefault(); handleBackToLanding(); }} className="setup-tab-item" type="button">
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
            </nav>

            <div className="setup-navbar-right">
              <button onClick={(e) => e.preventDefault()} className="setup-action-btn btn-copilot active" type="button">
                <i className="fa-solid fa-rocket"></i> AI Copilot
              </button>
              <button onClick={(e) => { e.preventDefault(); handleGoToNotetaker(); }} className="setup-action-btn btn-notetaker" type="button">
                <i className="fa-solid fa-microphone"></i> Notetaker
              </button>
              <button onClick={handleGoToVoiceAgent} className="setup-action-btn btn-voice-agent" type="button">
                <i className="fa-solid fa-robot"></i> Voice Agent
              </button>
              <button onClick={handleGoToUpload} className="setup-action-btn btn-upload" type="button">
                <i className="fa-solid fa-cloud-arrow-up"></i> Upload
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
                onLogout={handleLogoutClick}
                showToast={showToast}
              />
            </div>
          </header>

          {!showReadyCard && !showProfileForm && (
            <div className="setup-subheader-row">
              <div className="setup-subheader-left">
                <a href="#" onClick={(e) => { e.preventDefault(); handleBackToLanding(); }} className="badge-crumb crumb-home">
                  <i className="fa-solid fa-house"></i> Home
                </a>
                <span className="crumb-separator"><i className="fa-solid fa-chevron-right"></i></span>
                <span className="badge-crumb crumb-copilot">
                  <i className="fa-solid fa-brain" style={{ color: '#10b981' }}></i> My Interview Copilot
                </span>
              </div>
              <div className="setup-subheader-right">
                <div className="setup-warning-pill">
                  <i className="fa-solid fa-triangle-exclamation"></i>
                  <span>No guarantee of results. This is an AI practice tool only.</span>
                </div>
              </div>
            </div>
          )}

          {showProfileForm ? (
                        <div className="setup-profile-container">
                          <div className="setup-profile-card">
                            <button onClick={() => setShowProfileForm(false)} className="setup-ready-back-btn" type="button" title="Back to Skills"><i className="fa-solid fa-arrow-left"></i></button>
                            <div className="setup-icon"><i className="fa-solid fa-file-lines"></i></div>
                            <h1 className="setup-title">Your Resume Profile</h1>
                            <p className="setup-subtitle">Upload a resume to fill these sections automatically, or enter any details manually. Every field is optional.</p>
                            <input ref={resumeInputRef} type="file" accept=".pdf,.docx,.doc" onChange={handleCopilotResumeChange} style={{ display: 'none' }} />
                            {!resumeData ? (
                              <div className={`setup-resume-upload ${isDraggingResume ? 'dragging' : ''}`} onClick={() => !isUploadingResume && resumeInputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setIsDraggingResume(true); }} onDragLeave={() => setIsDraggingResume(false)} onDrop={handleCopilotResumeDrop} role="button" tabIndex={0}>
                                <i className={`fa-solid ${isUploadingResume ? 'fa-circle-notch fa-spin' : 'fa-file-arrow-up'}`}></i>
                                <span>{isUploadingResume ? 'Analyzing your resume...' : 'Upload your resume'}<small>PDF, DOCX, or DOC · up to 15MB</small></span>
                                {!isUploadingResume && <button type="button" onClick={(event) => { event.stopPropagation(); resumeInputRef.current?.click(); }}>Browse</button>}
                              </div>
                            ) : (
                              <div className="setup-resume-loaded"><div><i className="fa-solid fa-circle-check"></i><span><strong>{resumeData.fileName}</strong><small>Resume details were added below. You can edit them.</small></span></div><button type="button" onClick={clearCopilotResume} title="Remove resume"><i className="fa-solid fa-xmark"></i></button></div>
                            )}
                            <label className="setup-profile-field setup-profile-field--job-description">
                              <span>Job Description <small>(optional)</small></span>
                              <textarea value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder="Paste the role, responsibilities, and required skills here (optional)" rows={5} />
                            </label>
                            <div className="setup-profile-fields">
                              {PROFILE_FIELDS.map(([key, label]) => (
                                <label className="setup-profile-field" key={key}>
                                  <span>{label}</span>
                                  <textarea value={resumeProfile[key]} onChange={(event) => setResumeProfile(previous => ({ ...previous, [key]: event.target.value }))} placeholder={`Enter ${label.toLowerCase()} (optional)`} rows={key === 'professionalSummary' || key === 'workExperience' || key === 'projects' ? 4 : 3} />
                                </label>
                              ))}
                            </div>
                            {setupError && <div id="setupMsg" className="setup-msg">{setupError}</div>}
                            <div className="setup-actions"><button onClick={handleProfileContinue} className="setup-continue" type="button">Continue to AI Interview <i className="fa-solid fa-arrow-right"></i></button><button onClick={() => { setShowProfileForm(false); setShowReadyCard(true); }} className="setup-skip" type="button">Skip for now</button></div>
                          </div>
                        </div>
                      ) : !showReadyCard ? (
            <div className="setup-layout-grid">
              {/* Left Column (Candidate Success Cards) */}
              <div className="setup-column">
                <div className="setup-candidate-card glow-blue">
                  <div className="candidate-avatar-container">
                    <img className="candidate-avatar" src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&h=90&fit=crop&crop=faces" alt="Candidate 1" />
                    <span className="candidate-badge badge-blue">3 Offers</span>
                    <div className="candidate-icon-left bg-blue"><i className="fa-solid fa-code"></i></div>
                    <div className="candidate-icon-right"><i className="fa-solid fa-check"></i></div>
                  </div>
                  <div className="candidate-details">
                    <h4 className="candidate-role-name">Software Engineer</h4>
                    <p className="candidate-desc">Landed FAANG role after 3 weeks</p>
                  </div>
                </div>

                <div className="setup-candidate-card glow-green">
                  <div className="candidate-avatar-container">
                    <img className="candidate-avatar" src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=90&fit=crop&crop=faces" alt="Candidate 2" />
                    <span className="candidate-badge badge-green">+45% Salary</span>
                    <div className="candidate-icon-left bg-green"><i className="fa-solid fa-chart-line"></i></div>
                    <div className="candidate-icon-right"><i className="fa-solid fa-check"></i></div>
                  </div>
                  <div className="candidate-details">
                    <h4 className="candidate-role-name">Financial Analyst</h4>
                    <p className="candidate-desc">Promoted to Senior Analyst</p>
                  </div>
                </div>

                <div className="setup-candidate-card glow-orange">
                  <div className="candidate-avatar-container">
                    <img className="candidate-avatar" src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&h=90&fit=crop&crop=faces" alt="Candidate 3" />
                    <span className="candidate-badge badge-orange">New Path!</span>
                    <div className="candidate-icon-left bg-orange"><i className="fa-solid fa-lightbulb"></i></div>
                    <div className="candidate-icon-right"><i className="fa-solid fa-check"></i></div>
                  </div>
                  <div className="candidate-details">
                    <h4 className="candidate-role-name">Career Switcher</h4>
                    <p className="candidate-desc">Switched careers at 35 successfully</p>
                  </div>
                </div>
              </div>

              {/* Center Setup Card Wrapper */}
              <div className="setup-center-wrapper">
                <div className="setup-card">
                  <div className="setup-icon"><i className="fa-solid fa-wand-magic-sparkles"></i></div>
                  <h1 className="setup-title">Build Interview Confidence with AI</h1>
                  <p className="setup-subtitle">Practice with our AI coach and walk into your next interview with confidence.</p>
                  
                  <h2 className="setup-label">Your Role &amp; Skills</h2>
                  <div className="setup-input-wrap">
                    <i className="fa-solid fa-briefcase setup-input-icon"></i>
                    <input
                      id="setupInput"
                      className="setup-input"
                      placeholder="Example: Java, Spring Boot, Microservices"
                      value={setupInputValue}
                      onChange={handleInputChange}
                      onKeyDown={handleInputKeyDown}
                    />
                  </div>

                  {suggestions.length > 0 && (
                    <ul id="suggestList" className="suggest-list">
                      {suggestions.map((item, idx) => (
                        <li className="suggest-item" key={idx} onClick={() => addTag(item.name)}>
                          <span>{item.name}</span>
                          <span>{item.type}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  
                  <div id="chips" className="chips">
                    {selectedTags.map((tag, idx) => (
                      <span className="chip" key={idx}>
                        {tag} <button type="button" onClick={() => removeTag(tag)}>x</button>
                      </span>
                    ))}
                  </div>
                  
                  <div className="setup-helper-box">
                    <i className="fa-solid fa-wand-magic-sparkles"></i>
                    <span>We'll generate tailored AI interview questions based on your input.</span>
                  </div>

                  <div className="setup-tip-row">
                    <div className="setup-tip-line"><i className="fa-regular fa-lightbulb"></i> Try: M&A, DCF, Financial Modeling</div>
                    <div className="setup-tip-cols">
                      <div className="setup-tip-line"><i className="fa-regular fa-keyboard"></i> Separate skills with commas</div>
                      <div className="setup-tip-line" style={{ color: '#ea580c' }}><i className="fa-solid fa-lock"></i> Avoid confidential data</div>
                    </div>
                  </div>

                  <div className="setup-actions">
                    <button onClick={handleContinue} className="setup-continue" type="button">
                      Continue to AI Interview <i className="fa-solid fa-arrow-right"></i>
                    </button>
                    <button onClick={handleSkip} className="setup-skip" type="button">Skip for now</button>
                    <button onClick={handleViewPastSessions} className="setup-past-sessions" type="button">
                      <i className="fa-solid fa-clock-rotate-left"></i> View Past Sessions
                    </button>
                  </div>

                  {setupError && <div id="setupMsg" className="setup-msg">{setupError}</div>}

                  <div className="setup-card-footer">
                    <span>AI-Powered</span>
                    <span>Personalized</span>
                    <span>Industry-Specific</span>
                  </div>
                </div>
              </div>

              {/* Right Column (Candidate Success Cards) */}
              <div className="setup-column">
                <div className="setup-candidate-card glow-pink">
                  <div className="candidate-avatar-container">
                    <img className="candidate-avatar" src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=90&fit=crop&crop=faces" alt="Candidate 4" />
                    <span className="candidate-badge badge-pink">Dream Job</span>
                    <div className="candidate-icon-left bg-pink"><i className="fa-solid fa-briefcase"></i></div>
                    <div className="candidate-icon-right"><i className="fa-solid fa-check"></i></div>
                  </div>
                  <div className="candidate-details">
                    <h4 className="candidate-role-name">Product Manager</h4>
                    <p className="candidate-desc">Got PM offer from top startup</p>
                  </div>
                </div>

                <div className="setup-candidate-card glow-cyan">
                  <div className="candidate-avatar-container">
                    <img className="candidate-avatar" src="https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=120&h=90&fit=crop&crop=faces" alt="Candidate 5" />
                    <span className="candidate-badge badge-cyan">Tech Lead</span>
                    <div className="candidate-icon-left bg-cyan"><i className="fa-solid fa-laptop-code"></i></div>
                    <div className="candidate-icon-right"><i className="fa-solid fa-check"></i></div>
                  </div>
                  <div className="candidate-details">
                    <h4 className="candidate-role-name">Full-Stack Dev</h4>
                    <p className="candidate-desc">Hired as Tech Lead in 2 months</p>
                  </div>
                </div>

                <div className="setup-candidate-card glow-indigo">
                  <div className="candidate-avatar-container">
                    <img className="candidate-avatar" src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&h=90&fit=crop&crop=faces" alt="Candidate 6" />
                    <span className="candidate-badge badge-indigo">5 Offers</span>
                    <div className="candidate-icon-left bg-indigo"><i className="fa-solid fa-database"></i></div>
                    <div className="candidate-icon-right"><i className="fa-solid fa-check"></i></div>
                  </div>
                  <div className="candidate-details">
                    <h4 className="candidate-role-name">Data Scientist</h4>
                    <p className="candidate-desc">Received 5 offers in one week</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="setup-ready-container">
              <div className="setup-ready-card">
                <button 
                  onClick={handleBackToProfile}
                  className="setup-ready-back-btn" 
                  type="button" 
                  title="Back to Setup"
                >
                  <i className="fa-solid fa-arrow-left"></i>
                </button>
                <div className="setup-ready-icon"><i className="fa-solid fa-brain"></i></div>
                <h1 className="setup-ready-title">Interview AI Copilot</h1>
                <p className="setup-ready-subtitle">
                  {selectedTags.join(', ') || 'General Interview Practice'}
                </p>
                <p className="setup-ready-desc">
                  Get real-time AI-powered answer suggestions and feedback during your interview practice session.
                </p>
                <button onClick={() => setShowStartSessionModal(true)} className="setup-ready-btn" type="button">
                  <i className="fa-solid fa-play"></i> Start Interview AI Copilot
                </button>
              </div>
            </div>
          )}

          <footer className="setup-footer-strip">
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

          <div className="setup-chat-bubble">
            <i className="fa-solid fa-comment-dots"></i>
          </div>

          {showStartSessionModal && (
            <div className="session-modal-overlay">
              <div className="session-modal-card">
                <div className="session-modal-header">
                  <div className="session-modal-title-row">
                    <i className="fa-solid fa-brain"></i>
                    <h3>Start Interview AI Copilot</h3>
                  </div>
                  <button 
                    className="session-modal-close-btn" 
                    onClick={() => { setShowStartSessionModal(false); setHasConsent(false); }}
                    type="button"
                  >
                    &times;
                  </button>
                </div>

                <p className="session-modal-desc">
                  The AI Copilot will listen to interview questions and generate real-time answers and feedback for practice purposes.
                </p>

                <div className="session-modal-options">
                  <div className="session-modal-option-card">
                    <div className="session-modal-option-left">
                      <div className="session-modal-option-icon">
                        <i className="fa-solid fa-bolt"></i>
                      </div>
                      <div className="session-modal-option-text">
                        <span className="session-modal-option-title">Enable AI Answer Suggestions</span>
                      </div>
                    </div>
                    <label className="settings-toggle">
                      <input 
                        type="checkbox" 
                        checked={enableAnswerSuggestions} 
                        onChange={(e) => setEnableAnswerSuggestions(e.target.checked)} 
                      />
                      <span className="settings-slider"></span>
                    </label>
                  </div>

                  <div className="session-modal-option-card">
                    <div className="session-modal-option-left">
                      <div className="session-modal-option-icon">
                        <i className="fa-regular fa-file-lines"></i>
                      </div>
                      <div className="session-modal-option-text">
                        <span className="session-modal-option-title">Enable Interview Notetaker</span>
                        <span className="session-modal-option-sub">Captures questions, answers, and feedback automatically.</span>
                      </div>
                    </div>
                    <label className="settings-toggle">
                      <input 
                        type="checkbox" 
                        checked={enableNotetaker} 
                        onChange={(e) => setEnableNotetaker(e.target.checked)} 
                      />
                      <span className="settings-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="session-modal-divider"></div>

                <div 
                  className={`session-modal-consent-row ${hasConsent ? 'checked' : ''}`}
                  onClick={() => setHasConsent(prev => !prev)}
                >
                  <div className="session-modal-consent-checkbox"></div>
                  <span className="session-modal-consent-text">
                    By continuing, you confirm that you have obtained consent from all participants to record and analyze this interview.
                  </span>
                </div>

                <div className="session-modal-actions">
                  <button 
                    className="session-modal-btn-cancel" 
                    onClick={() => { setShowStartSessionModal(false); setHasConsent(false); }}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button 
                    className="session-modal-btn-start" 
                    onClick={() => { 
                      setShowStartSessionModal(false); 
                      setSetupComplete(true); 
                    }}
                    disabled={!hasConsent}
                    type="button"
                  >
                    <i className="fa-solid fa-play" style={{ fontSize: '10px' }}></i> Start Session
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showSaveSessionModal && setupComplete && (
        <div className="session-modal-overlay">
          <div className="session-modal-card" style={{ maxWidth: '400px' }}>
            <div className="session-modal-header">
              <div className="session-modal-title-row">
                <i className="fa-solid fa-floppy-disk"></i>
                <h3>Save Practice Session</h3>
              </div>
              <button 
                className="session-modal-close-btn" 
                onClick={() => setShowSaveSessionModal(false)}
                type="button"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveSessionSubmit} style={{ padding: '15px 0' }}>
              <p className="session-modal-desc" style={{ marginBottom: '15px' }}>
                Enter a name to save this practice session in your Recent sessions tab.
              </p>
              <input 
                type="text" 
                placeholder={`Session ${new Date().toLocaleString()}`}
                value={saveSessionName}
                onChange={(e) => setSaveSessionName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  marginBottom: '20px',
                  fontSize: '14px',
                  background: 'var(--bg-input, #ffffff)',
                  color: 'var(--text-color, #0f172a)'
                }}
                autoFocus
              />
              <div className="session-modal-actions">
                <button 
                  type="button" 
                  className="session-modal-btn-cancel" 
                  onClick={() => setShowSaveSessionModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="session-modal-btn-start"
                >
                  Save Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showInlineTeleprompter && (
        <div 
          onMouseDown={handleTeleprompterMouseDown}
          style={{
            position: 'absolute',
            left: `${teleprompterPosition.x}px`,
            top: `${teleprompterPosition.y}px`,
            width: '380px',
            height: '520px',
            zIndex: 99999,
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            borderRadius: '12px',
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.15)',
            cursor: 'move'
          }}
        >
          <Teleprompter onClose={() => setShowInlineTeleprompter(false)} />
        </div>
      )}
      {showInlineTopBar && (
        <div 
          onMouseDown={handleTopBarMouseDown}
          style={{
            position: 'absolute',
            left: `${topBarPosition.x}px`,
            top: `${topBarPosition.y}px`,
            width: '1000px',
            zIndex: 99998,
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.15)',
            cursor: 'move'
          }}
        >
          <TopBar onClose={() => setShowInlineTopBar(false)} />
        </div>
      )}
    </div>
  );
}
