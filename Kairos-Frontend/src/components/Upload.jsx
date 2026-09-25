import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import AccountDropdown from './UserProfile/AccountDropdown';
import { API_BASE, WS_BASE, websocketProtocols } from '../utils/api';
import './Upload.css';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

const LANGUAGES_LIST = [
  { code: 'en', native: 'English', english: 'English' },
  { code: 'es', native: 'Español', english: 'Spanish' },
  { code: 'fr', native: 'Français', english: 'French' },
  { code: 'it', native: 'Italiano', english: 'Italian' },
  { code: 'pt', native: 'Português', english: 'Portuguese' },
  { code: 'nl', native: 'Nederlands', english: 'Dutch' },
  { code: 'ru', native: 'Русский', english: 'Russian' },
  { code: 'tr', native: 'Türkçe', english: 'Turkish' },
  { code: 'ar', native: 'العربية', english: 'Arabic' },
  { code: 'zh', native: '中文', english: 'Chinese' },
  { code: 'ja', native: '日本語', english: 'Japanese' },
  { code: 'ko', native: '한국어', english: 'Korean' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi' },
  { code: 'bn', native: 'বাংলা', english: 'Bengali' },
  { code: 'te', native: 'తెలుగు', english: 'Telugu' },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil' },
  { code: 'mr', native: 'मराठी', english: 'Marathi' },
  { code: 'gu', native: 'ગુજરાતી', english: 'Gujarati' },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada' },
  { code: 'ml', native: 'മലയാളം', english: 'Malayalam' },
  { code: 'pa', native: 'ਪੰਜਾਬੀ', english: 'Punjabi' }
];

const cleanDisplayText = (text) => {
  if (!text || typeof text !== 'string') return text || '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/###\s*/g, '')
    .replace(/##\s*/g, '')
    .replace(/#\s*/g, '')
    .replace(/\*\*/g, '');
};

const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10 GB
const FILE_SIZE_ERROR_MESSAGE = 'File size exceeds the 10 GB limit. Please upload a smaller file.';
const RESUME_EXTENSIONS = ['.pdf', '.doc', '.docx'];

function isResumeDocument(file) {
  const name = String(file?.name || '').toLowerCase();
  return RESUME_EXTENSIONS.some(extension => name.endsWith(extension));
}

const formatFileSize = (bytes) => {
  if (!bytes || bytes <= 0) return '0 KB';
  const k = 1024;
  if (bytes < k * 1024) {
    return `${Math.round(bytes / k)} KB`;
  }
  return `${(bytes / (k * 1024)).toFixed(1)} MB`;
};

export default function Upload({
  token,
  user,
  onLogout,
  onBackToLanding,
  onGoToPanel,
  onGoToNotetaker,
  onGoToVoiceAgent,
  onGoToDashboard,
  onGoToProfile,
  showToast,
  darkMode,
  toggleDarkMode,
  windowType
}) {
  const handleMinimize = () => ipcRenderer?.send('window-minimize');
  const handleMaximize = () => ipcRenderer?.send('window-maximize');

  // Sessions & Core state
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [transcribingFile, setTranscribingFile] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState(null);
  const [isAudioUploaded, setIsAudioUploaded] = useState(false);

  // Active Tab: 'transcript' | 'translate' | 'ask_ai'
  const [activeTab, setActiveTab] = useState('transcript');

  // Media Player metadata & seeking
  const [mediaDuration, setMediaDuration] = useState('0:30');
  const [protectedMediaUrl, setProtectedMediaUrl] = useState('');
  const mediaPlayerRef = useRef(null);

  // Translation state
  const [selectedTargetLang, setSelectedTargetLang] = useState(LANGUAGES_LIST[1]); // Español default
  const [langSearch, setLangSearch] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatedData, setTranslatedData] = useState(null);

  // Refs
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorNodeRef = useRef(null);
  const micSourceRef = useRef(null);
  const audioStreamRef = useRef(null);
  const wsRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const isListeningRef = useRef(false);
  const recordingGenRef = useRef(0);
  const isStartingRef = useRef(false);
  const lastToggleTimeRef = useRef(0);
  const isMountedRef = useRef(true);

  // Fetch saved upload sessions when component mounts, token is available, or user switches
  useEffect(() => {
    if (token && windowType === 'upload') {
      fetchSessions();
    }
  }, [token, user, windowType]);

  // Clean up recording when navigating away
  useEffect(() => {
    if (windowType !== 'upload') {
      stopRecording();
    }
  }, [windowType]);

  // Clean up on component unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopRecording();
    };
  }, []);

  // Clean up on browser unload
  useEffect(() => {
    const handleBeforeUnload = () => stopRecording();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Scroll chat feed to bottom on new messages
  useEffect(() => {
    if (activeTab === 'ask_ai') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isUploading, isSending, activeTab]);

  // Sync translation when active session or selected language changes
  useEffect(() => {
    if (activeSession?.translations && selectedTargetLang?.english) {
      if (activeSession.translations[selectedTargetLang.english]) {
        setTranslatedData(activeSession.translations[selectedTargetLang.english]);
      } else {
        setTranslatedData(null);
      }
    } else {
      setTranslatedData(null);
    }
  }, [activeSession, selectedTargetLang]);

  const fetchSessions = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/upload/sessions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!isMountedRef.current) return;
      if (response.data.ok) {
        setSessions(response.data.sessions || []);
      }
    } catch (err) {
      console.error('[Upload Sessions] fetch error:', err);
    }
  };

  const loadSession = async (sessionId) => {
    try {
      const response = await axios.get(`${API_BASE}/api/upload/session/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!isMountedRef.current) return;
      if (response.data.ok) {
        const sess = response.data.session;
        if (sess.messages) {
          sess.messages = sess.messages.map(m => ({ ...m, text: cleanDisplayText(m.text) }));
        }
        setActiveSession(sess);
        setMessages(sess.messages || []);
        setSelectedFileName(sess.fileName || '');
        setSelectedFile(null);
        setMediaDuration(sess.duration || '0:30');
        setActiveTab('transcript');
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      showToast('Failed to load session.');
    }
  };

  const deleteSession = async (e, sessionId) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this session?')) return;
    try {
      const response = await axios.delete(`${API_BASE}/api/upload/session/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.ok) {
        showToast('Session deleted.');
        fetchSessions();
        if (activeSession?.id === sessionId) {
          startNewSession();
        }
      }
    } catch (err) {
      showToast('Failed to delete session.');
    }
  };

  const startNewSession = () => {
    setActiveSession(null);
    setMessages([]);
    setSelectedFile(null);
    setSelectedFileName('');
    setInputText('');
    setTranslatedData(null);
    setActiveTab('transcript');
    setIsTranscribing(false);
    setTranscriptionError(null);
    setIsAudioUploaded(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setSelectedFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (isResumeDocument(file)) {
      showToast('This page accepts audio or video files. Upload resumes from the AI Copilot page.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showToast(FILE_SIZE_ERROR_MESSAGE);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setSelectedFile(file);
    setSelectedFileName(file.name);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (isResumeDocument(file)) {
        showToast('This page accepts audio or video files. Upload resumes from the AI Copilot page.');
        e.dataTransfer.clearData();
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        showToast(FILE_SIZE_ERROR_MESSAGE);
        e.dataTransfer.clearData();
        return;
      }
      setSelectedFile(file);
      setSelectedFileName(file.name);
      e.dataTransfer.clearData();
    }
  };

  const uploadAudioFile = async (file) => {
    const targetFile = file || selectedFile;
    if (!targetFile) return null;
    if (isResumeDocument(targetFile)) {
      showToast('This page accepts audio or video files. Upload resumes from the AI Copilot page.');
      return null;
    }
    if (targetFile.size > MAX_FILE_SIZE) {
      showToast(FILE_SIZE_ERROR_MESSAGE);
      setSelectedFileName('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return null;
    }

    const formData = new FormData();
    formData.append('file', targetFile);

    setIsUploading(true);
    setIsAudioUploaded(false);
    setTranscriptionError(null);
    setIsTranscribing(false);
    setSelectedFileName(targetFile.name);

    try {
      const response = await axios.post(`${API_BASE}/api/upload/upload-file`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.ok) {
        if (!isMountedRef.current) return null;
        const session = response.data.session;
        session.isTranscribing = false;
        setActiveSession(session);
        setMessages(session.messages || []);
        setMediaDuration(session.duration || '0:30');
        fetchSessions();
        setSelectedFile(null);
        setTranscribingFile(null);
        setIsAudioUploaded(true);
        setActiveTab('transcript');
        showToast('Audio Uploaded Successfully.');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return session;
      }
    } catch (err) {
      if (!isMountedRef.current) return null;
      const errorMsg = err.response?.data?.error || err.message || 'File upload failed.';
      showToast(errorMsg);
      setSelectedFileName('');
      setSelectedFile(null);
      setActiveSession(null);
      setTranscribingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      if (isMountedRef.current) {
        setIsUploading(false);
      }
    }
    return null;
  };

  const handleStartTranscription = async (sessionId) => {
    const targetId = sessionId || activeSession?.id;
    if (!targetId || isTranscribing) return;

    setIsTranscribing(true);
    setTranscriptionError(null);

    try {
      const response = await axios.post(`${API_BASE}/api/upload/transcribe`, {
        sessionId: targetId
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.ok) {
        if (!isMountedRef.current) return;
        const updated = response.data.session;
        if (updated.messages) {
          updated.messages = updated.messages.map(m => ({ ...m, text: cleanDisplayText(m.text) }));
        }
        setActiveSession(updated);
        setMessages(updated.messages || []);
        setMediaDuration(updated.duration || '0:30');
        fetchSessions();
        showToast('Transcription completed!');
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      const errMsg = err.response?.data?.error || err.message || 'Transcription failed.';
      setTranscriptionError(errMsg);
      showToast('Transcription failed. Click Transcript to retry.');
    } finally {
      if (isMountedRef.current) {
        setIsTranscribing(false);
      }
    }
  };

  const handleTranscriptTabClick = () => {
    setActiveTab('transcript');
    if (activeSession && !activeSession.transcript && !isTranscribing) {
      handleStartTranscription(activeSession.id);
    }
  };

  const handleSendMessage = async (e, customText) => {
    e?.preventDefault();
    if (isSending || isUploading) return;

    stopRecording();

    let currentSession = activeSession;
    const userMessage = (customText !== undefined ? customText : inputText).trim();

    if (selectedFile) {
      const fileToUpload = selectedFile;
      setInputText('');
      await uploadAudioFile(fileToUpload);
      return;
    }

    if (!userMessage) return;

    setInputText('');
    setMessages(prev => [...prev, { sender: 'user', text: userMessage }]);
    setIsSending(true);

    try {
      const response = await axios.post(`${API_BASE}/api/upload/chat`, {
        sessionId: currentSession?.id || null,
        message: userMessage,
        history: currentSession ? (currentSession.messages || []) : messages
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.ok) {
        if (!isMountedRef.current) return;
        const cleanReply = response.data.reply
          .replace(/\*\*/g, '')
          .replace(/###/g, '')
          .replace(/##/g, '');
        setMessages(prev => [...prev, { sender: 'ai', text: cleanReply }]);

        if (!currentSession && response.data.session) {
          setActiveSession(response.data.session);
          setSelectedFileName(response.data.session.fileName || '');
          fetchSessions();
        } else if (currentSession) {
          setActiveSession(prev => {
            if (!prev) return response.data.session || null;
            return {
              ...prev,
              messages: [...(prev.messages || []), { sender: 'user', text: userMessage }, { sender: 'ai', text: cleanReply }]
            };
          });
        }
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      showToast('Failed to get response.');
    } finally {
      if (isMountedRef.current) {
        setIsSending(false);
      }
    }
  };

  // Trigger Multilingual Translation
  const handleTranslate = async () => {
    if (!activeSession) {
      showToast('Please select a recording session first.');
      return;
    }
    if (!selectedTargetLang) return;

    const utterances = getSessionUtterances(activeSession);
    const transcript = activeSession.transcript || utterances.map(u => u.text).join(' ') || '';

    if (!transcript.trim() && utterances.length === 0) {
      showToast('No transcript available in this session to translate.');
      return;
    }

    setIsTranslating(true);
    showToast(`Translating into ${selectedTargetLang.english}...`);

    try {
      const response = await axios.post(`${API_BASE}/api/upload/translate`, {
        sessionId: activeSession.id,
        targetLanguage: selectedTargetLang.code,
        targetLangName: selectedTargetLang.english,
        transcript,
        utterances
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.ok) {
        setTranslatedData({
          translatedText: response.data.translatedText,
          translatedUtterances: response.data.translatedUtterances
        });
        // Cache in local active session state
        setActiveSession(prev => {
          if (!prev) return prev;
          const updated = {
            ...prev,
            translations: {
              ...(prev.translations || {}),
              [selectedTargetLang.english]: {
                translatedText: response.data.translatedText,
                translatedUtterances: response.data.translatedUtterances
              }
            }
          };
          return updated;
        });
        showToast(`Translation into ${selectedTargetLang.english} complete!`);
      }
    } catch (err) {
      console.error('[Translation Error]:', err);
      const errMsg = err.response?.data?.error || err.message || 'Translation failed.';
      showToast(errMsg);
    } finally {
      setIsTranslating(false);
    }
  };

  // Export PDF functionality
  const handleExportPDF = () => {
    window.print();
  };

  // Audio / Video duration & seeking helpers
  const handleMediaLoaded = (e) => {
    const dur = e.target.duration;
    if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
      const mins = Math.floor(dur / 60);
      const secs = Math.floor(dur % 60);
      setMediaDuration(`${mins}:${secs < 10 ? '0' : ''}${secs}`);
    } else if (activeSession?.duration) {
      setMediaDuration(activeSession.duration);
    } else {
      setMediaDuration('0:30');
    }
  };

  const seekToTime = (timeInSec) => {
    if (mediaPlayerRef.current) {
      mediaPlayerRef.current.currentTime = timeInSec;
      mediaPlayerRef.current.play().catch(() => {});
    }
  };

  // Formatter for Session Utterances (Diarization)
  const getSessionUtterances = (session) => {
    if (!session) return [];
    if (session.utterances && Array.isArray(session.utterances) && session.utterances.length > 0) {
      return session.utterances;
    }
    if (!session.transcript) return [];
    // Sentence-level chunking for sessions without native Deepgram utterances
    const sentences = session.transcript.split(/(?<=[.?!])\s+/).filter(s => s.trim().length > 0);
    let timeOffset = 1;
    return sentences.map((s, idx) => {
      const mins = Math.floor(timeOffset / 60);
      const secs = timeOffset % 60;
      const timecode = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      const startSec = timeOffset;
      timeOffset += Math.max(3, Math.min(8, Math.round(s.split(' ').length * 0.4)));
      return {
        id: idx + 1,
        speaker: 'Speaker 1',
        timecode,
        start: startSec,
        end: timeOffset,
        text: s.trim()
      };
    });
  };

  // Microphone Audio Capture helpers
  const float32ToInt16 = (float32Array) => {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  };

  const cleanupAudio = () => {
    try {
      if (processorNodeRef.current) {
        processorNodeRef.current.onaudioprocess = null;
        try { processorNodeRef.current.disconnect(); } catch (_) {}
        processorNodeRef.current = null;
      }
      if (micSourceRef.current) {
        try { micSourceRef.current.disconnect(); } catch (_) {}
        micSourceRef.current = null;
      }
      if (audioContextRef.current) {
        try {
          if (audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(() => {});
          }
        } catch (_) {}
        audioContextRef.current = null;
      }
      if (audioStreamRef.current) {
        try { audioStreamRef.current.getTracks().forEach(track => track.stop()); } catch (_) {}
        audioStreamRef.current = null;
      }
    } catch (e) {
      console.error('[cleanupAudio] error:', e);
    }
  };

  const startRecording = async () => {
    if (isListeningRef.current || isStartingRef.current) return;
    isStartingRef.current = true;

    cleanupAudio();
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.close();
        }
      } catch (_) {}
      wsRef.current = null;
    }

    const currentGen = ++recordingGenRef.current;
    isListeningRef.current = true;
    setIsListening(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (recordingGenRef.current !== currentGen) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      audioStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
        if (recordingGenRef.current !== currentGen) {
          if (audioCtx.state !== 'closed') audioCtx.close().catch(() => {});
          return;
        }
      }

      const WS_BASE = API_BASE.replace(/^http/, 'ws');
      const ws = new WebSocket(`${WS_BASE}/api/transcribe/live?encoding=linear16&sample_rate=16000&language=en&source=upload_mic`, websocketProtocols(token));
      wsRef.current = ws;
      let opened = false;

      ws.onopen = () => {
        try {
          if (recordingGenRef.current !== currentGen || !isListeningRef.current) {
            try { ws.close(); } catch (_) {}
            return;
          }
          opened = true;
          isStartingRef.current = false;
          finalTranscriptRef.current = inputText.trim();
          isListeningRef.current = true;
          setIsListening(true);

          const micSource = audioCtx.createMediaStreamSource(stream);
          micSourceRef.current = micSource;

          const BUFFER_SIZE = 4096;
          const processor = audioCtx.createScriptProcessor(BUFFER_SIZE, 1, 1);
          processorNodeRef.current = processor;

          processor.onaudioprocess = (e) => {
            try {
              if (recordingGenRef.current !== currentGen || !isListeningRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                return;
              }
              const inputData = e.inputBuffer.getChannelData(0);
              const int16Buffer = float32ToInt16(inputData);
              const uint8Buffer = new Uint8Array(int16Buffer.buffer);
              wsRef.current.send(uint8Buffer);
            } catch (err) {
              console.error('[onaudioprocess] failed:', err);
            }
          };

          const gain = audioCtx.createGain();
          gain.gain.value = 0;
          micSource.connect(processor);
          processor.connect(gain);
          gain.connect(audioCtx.destination);
        } catch (onOpenErr) {
          console.error('[ws.onopen] error:', onOpenErr);
          if (recordingGenRef.current === currentGen) {
            showToast('Failed to initialize voice capture.');
            cleanupAudio();
          }
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        }
      };

      ws.onmessage = (evt) => {
        if (recordingGenRef.current !== currentGen) return;
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'transcript' && msg.text) {
            const isFinal = msg.isFinal !== false;
            const cleanText = msg.text.trim();
            if (cleanText) {
              if (isFinal) {
                finalTranscriptRef.current += (finalTranscriptRef.current ? ' ' : '') + cleanText;
                setInputText(finalTranscriptRef.current);
              } else {
                setInputText(finalTranscriptRef.current + (finalTranscriptRef.current ? ' ' : '') + cleanText);
              }
            }
          }
        } catch (_) {}
      };

      ws.onerror = (err) => {
        if (recordingGenRef.current !== currentGen) return;
        console.error('[Upload Mic WS] error:', err);
      };

      ws.onclose = (event) => {
        if (recordingGenRef.current !== currentGen) return;
        recordingGenRef.current++;
        isStartingRef.current = false;
        cleanupAudio();
        isListeningRef.current = false;
        setIsListening(false);
      };
    } catch (err) {
      if (recordingGenRef.current !== currentGen) return;
      showToast('Could not access microphone.');
      isStartingRef.current = false;
      isListeningRef.current = false;
      setIsListening(false);
      cleanupAudio();
    }
  };

  const stopRecording = () => {
    recordingGenRef.current++;
    isStartingRef.current = false;
    isListeningRef.current = false;
    setIsListening(false);
    cleanupAudio();
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.close();
        }
      } catch (_) {}
      wsRef.current = null;
    }
  };

  const toggleMic = () => {
    const now = Date.now();
    if (now - lastToggleTimeRef.current < 250) return;
    lastToggleTimeRef.current = now;

    if (isListeningRef.current || isStartingRef.current) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Window control & Navigation handlers
  const handleClose = () => {
    stopRecording();
    ipcRenderer?.send('window-close');
  };

  const handleBackToLanding = () => {
    stopRecording();
    if (onBackToLanding) onBackToLanding();
  };

  const handleGoToDashboard = () => {
    stopRecording();
    if (onGoToDashboard) onGoToDashboard();
  };

  const handleGoToPanel = () => {
    stopRecording();
    if (onGoToPanel) onGoToPanel();
  };

  const handleGoToNotetaker = () => {
    stopRecording();
    if (onGoToNotetaker) onGoToNotetaker();
  };

  const handleGoToVoiceAgent = () => {
    stopRecording();
    if (onGoToVoiceAgent) onGoToVoiceAgent();
  };

  const handleLogoutClick = () => {
    stopRecording();
    if (onLogout) onLogout();
  };

  // Media source resolution
  const mediaUrl = activeSession?.fileUrl
    ? `${API_BASE}${activeSession.fileUrl}`
    : (activeSession?.messages?.find(m => m.audioUrl)?.audioUrl
      ? `${API_BASE}${activeSession.messages.find(m => m.audioUrl).audioUrl}`
      : (selectedFile ? URL.createObjectURL(selectedFile) : ''));

  useEffect(() => {
    let objectUrl = '';
    const controller = new AbortController();

    if (!mediaUrl) {
      setProtectedMediaUrl('');
      return () => controller.abort();
    }

    if (!mediaUrl.includes('/api/upload/file/')) {
      setProtectedMediaUrl(mediaUrl);
      return () => controller.abort();
    }

    setProtectedMediaUrl('');
    fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Media request failed: ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (isMountedRef.current) setProtectedMediaUrl(objectUrl);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.error('[Upload Media] Failed to load private media:', err.message);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaUrl, token]);

  const playableMediaUrl = protectedMediaUrl || mediaUrl;

  // File metadata calculations
  const fileSizeDisplay = (activeSession?.fileSize || transcribingFile?.size)
    ? `${Math.round((activeSession?.fileSize || transcribingFile?.size) / 1024)} KB`
    : '472 KB';

  const sessionUtterances = getSessionUtterances(activeSession);
  const speakersCount = activeSession?.speakersCount || new Set(sessionUtterances.map(u => u.speaker)).size || 1;
  const displayDuration = activeSession?.duration || mediaDuration || '0:30';

  // Filtered languages for search
  const filteredLanguages = LANGUAGES_LIST.filter(l =>
    l.english.toLowerCase().includes(langSearch.toLowerCase()) ||
    l.native.toLowerCase().includes(langSearch.toLowerCase())
  );

  return (
    <div className={`interview-panel-root upload-page-root ${darkMode ? 'dark-theme' : ''}`}>
      {/* Electron Titlebar */}
      <div className="window-titlebar">
        <div className="window-title">
          <i className="fa-solid fa-cloud-arrow-up"></i> Upload | My Interview Copilot
        </div>
        <div className="window-controls">
          <button className="win-btn win-btn-minimize" onClick={handleMinimize} title="Minimize">—</button>
          <button className="win-btn win-btn-maximize" onClick={handleMaximize} title="Maximize">▢</button>
          <button className="win-btn win-btn-close" onClick={handleClose} title="Close">×</button>
        </div>
      </div>

      {/* Global Navigation Header */}
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
        </nav>

        <div className="setup-navbar-right">
          <button onClick={handleGoToPanel} className="setup-action-btn btn-copilot" type="button">
            <i className="fa-solid fa-rocket"></i> AI Copilot
          </button>
          <button onClick={handleGoToNotetaker} className="setup-action-btn btn-notetaker" type="button">
            <i className="fa-solid fa-microphone"></i> Notetaker
          </button>
          <button onClick={handleGoToVoiceAgent} className="setup-action-btn btn-voice-agent" type="button">
            <i className="fa-solid fa-robot"></i> Voice Agent
          </button>
          <button className="setup-action-btn btn-upload active" type="button">
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

      {/* Main Upload Workspace Layout */}
      <div className="upload-main-container">
        {/* Left Sidebar */}
        <aside className="upload-sidebar">
          <button onClick={startNewSession} className="upload-new-btn" type="button">
            <i className="fa-solid fa-plus"></i> New Upload
          </button>

          <div className="sidebar-section-heading">YOUR LIBRARY</div>

          <div className="sidebar-library-list">
            {/* If currently uploading, show the transcribing item at top */}
            {isUploading && transcribingFile && (
              <div className="library-item active transcribing-item">
                <div className="library-item-icon">
                  <i className="fa-regular fa-file-lines"></i>
                </div>
                <div className="library-item-info">
                  <span className="library-item-name" title={transcribingFile.name}>
                    {transcribingFile.name}
                  </span>
                  <span className="library-item-status-transcribing">
                    <i className="fa-solid fa-circle-notch fa-spin"></i> Transcribing
                  </span>
                </div>
              </div>
            )}
            {sessions.length === 0 && !(isUploading && transcribingFile) ? (
              <div className="sidebar-empty-hint">No uploads yet.</div>
            ) : (
              sessions.map(s => (
                <div
                  key={s.id}
                  onClick={() => loadSession(s.id)}
                  className={`library-item ${activeSession?.id === s.id && !isUploading ? 'active' : ''}`}
                >
                  <div className="library-item-icon">
                    <i className="fa-regular fa-file-lines"></i>
                  </div>
                  <div className="library-item-info">
                    <span className="library-item-name" title={s.fileName || s.title}>
                      {s.fileName || s.title}
                    </span>
                    <span className="library-item-duration">
                      {s.duration || '0:30'}
                    </span>
                  </div>
                  <button
                    onClick={(e) => deleteSession(e, s.id)}
                    className="library-item-delete"
                    type="button"
                    title="Delete session"
                  >
                    <i className="fa-regular fa-trash-can"></i>
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="sidebar-privacy-footer">
            <i className="fa-solid fa-lock"></i>
            <span>Files and transcripts are stored privately and are visible only to you.</span>
          </div>
        </aside>

        {/* Center Main Stage */}
        <main className="upload-center-stage">
          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            style={{ display: 'none' }}
            accept="audio/*,video/*"
          />

          {!activeSession ? (
            /* =================== VIEW 1: HERO EMPTY STATE =================== */
            <div className="upload-hero-container">
              {/* Badge: 22 languages */}
              <div className="hero-languages-badge">
                <i className="fa-solid fa-language"></i> 22 languages
              </div>

              {/* Title & Subtitle */}
              <h1 className="hero-headline">
                Turn any recording into a transcript anyone can read
              </h1>
              <p className="hero-subheadline">
                Drop in an interview, meeting or lecture. We transcribe it with speaker labels and timecodes, translate it into your language, and give you a PDF you can share.
              </p>

              {/* Dashed Dropzone / Selected File Card */}
              {!selectedFile ? (
                <div
                  className={`upload-dropzone-box ${isDragging ? 'dragging' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="dropzone-cloud-icon">
                    <i className="fa-solid fa-cloud-arrow-up"></i>
                  </div>
                  <div className="dropzone-primary-text">
                    Drop a file here, or click to browse
                  </div>
                  <div className="dropzone-secondary-text">
                    Audio or video · up to 10 GB
                  </div>
                </div>
              ) : (
                <div className="upload-selected-card">
                  <div className="selected-card-top">
                    <div className="selected-card-icon-wrapper">
                      <i className="fa-solid fa-file-audio"></i>
                    </div>
                    <div className="selected-card-info">
                      <div className="selected-card-filename" title={selectedFile.name}>
                        {selectedFile.name}
                      </div>
                      <div className="selected-card-meta">
                        <span className="selected-card-size">{formatFileSize(selectedFile.size)}</span>
                        <span className="selected-card-divider">·</span>
                        <span className="selected-card-status">Ready to upload</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearSelectedFile}
                      className="selected-card-remove-btn"
                      title="Remove selected file"
                      disabled={isUploading}
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>

                  <div className="selected-card-bottom">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="selected-card-change-btn"
                      disabled={isUploading}
                    >
                      <i className="fa-solid fa-folder-open"></i> Choose another file
                    </button>

                    <button
                      type="button"
                      onClick={() => uploadAudioFile(selectedFile)}
                      className="selected-card-upload-btn"
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <>
                          <i className="fa-solid fa-circle-notch fa-spin"></i> Uploading...
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-cloud-arrow-up"></i> Upload
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* 4 Feature Cards */}
              <div className="hero-feature-cards-grid">
                <div className="hero-feature-card">
                  <div className="card-icon-wrapper">
                    <i className="fa-solid fa-user-group"></i>
                  </div>
                  <div className="card-text-wrapper">
                    <div className="card-title">Speaker labels</div>
                    <div className="card-subtitle">Who said what, with timecodes</div>
                  </div>
                </div>

                <div className="hero-feature-card">
                  <div className="card-icon-wrapper">
                    <i className="fa-regular fa-file-pdf"></i>
                  </div>
                  <div className="card-text-wrapper">
                    <div className="card-title">PDF export</div>
                    <div className="card-subtitle">Translation and original side by side</div>
                  </div>
                </div>

                <div className="hero-feature-card">
                  <div className="card-icon-wrapper">
                    <i className="fa-regular fa-comment-dots"></i>
                  </div>
                  <div className="card-text-wrapper">
                    <div className="card-title">Ask anything</div>
                    <div className="card-subtitle">Question the recording in plain language</div>
                  </div>
                </div>

                <div className="hero-feature-card">
                  <div className="card-icon-wrapper">
                    <i className="fa-solid fa-shield-halved"></i>
                  </div>
                  <div className="card-text-wrapper">
                    <div className="card-title">Private by default</div>
                    <div className="card-subtitle">Only you can open your files</div>
                  </div>
                </div>
              </div>

              {/* Empty state bottom question starter */}
              <div className="hero-starter-input-container">
                <form onSubmit={handleSendMessage} className="hero-starter-form">
                  {selectedFile && (
                    <div className="hero-selected-file-chip">
                      <i className="fa-solid fa-file-audio"></i>
                      <span className="hero-selected-file-name" title={selectedFile.name}>{selectedFile.name}</span>
                      <span className="hero-selected-file-size">({formatFileSize(selectedFile.size)})</span>
                      <button
                        type="button"
                        onClick={clearSelectedFile}
                        className="hero-selected-file-clear"
                        title="Remove file"
                        disabled={isUploading}
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                  )}
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={selectedFile ? "Click Send or Upload to upload this audio..." : "...or just ask a question to get started"}
                    className="hero-starter-input"
                    disabled={isUploading}
                  />
                  <button
                    type="submit"
                    className="hero-starter-submit"
                    disabled={(!inputText.trim() && !selectedFile) || isUploading}
                    title={selectedFile ? "Upload selected file" : "Send"}
                  >
                    {isUploading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-arrow-up"></i>}
                  </button>
                </form>
              </div>
            </div>
          ) : (
            /* =================== VIEW 2: ACTIVE SESSION & TABS =================== */
            <div className="upload-active-workspace">
              {/* Active Session Header */}
              <div className="active-session-header">
                <div className="session-title-row">
                  <div className="session-file-icon">
                    <i className="fa-solid fa-table-cells"></i>
                  </div>
                  <div className="session-title-text">
                    {activeSession?.fileName || selectedFileName || transcribingFile?.name || 'interview_audio.webm'}
                  </div>
                </div>
                <div className="session-meta-row">
                  <span className="meta-filename">{activeSession?.fileName || selectedFileName || transcribingFile?.name}</span>
                  <span className="meta-dot">·</span>
                  <span className="meta-size">{fileSizeDisplay}</span>
                  <span className="meta-dot">·</span>
                  {isUploading ? (
                    <span className="meta-transcribing-badge">
                      <i className="fa-solid fa-circle-notch fa-spin"></i> Uploading...
                    </span>
                  ) : isTranscribing ? (
                    <span className="meta-transcribing-badge">
                      <i className="fa-solid fa-circle-notch fa-spin"></i> Transcribing...
                    </span>
                  ) : !activeSession?.transcript ? (
                    <span className="meta-uploaded-badge">
                      <i className="fa-solid fa-circle-check"></i> Audio Uploaded
                    </span>
                  ) : (
                    <>
                      <span className="meta-duration">{displayDuration}</span>
                      <span className="meta-dot">·</span>
                      <span className="meta-speakers">{speakersCount} speakers</span>
                      <span className="meta-dot">·</span>
                      <span className="meta-lang">Original: EN</span>
                    </>
                  )}
                </div>
              </div>

              {/* Media Player Container - Show as soon as audio is uploaded */}
              {!isUploading && (
                <div className="media-player-wrapper">
                  {mediaUrl ? (
                    <video
                      ref={mediaPlayerRef}
                      controls
                      src={mediaUrl}
                      onLoadedMetadata={handleMediaLoaded}
                      className="upload-native-player"
                    />
                  ) : (
                    <div className="media-player-placeholder">
                      <i className="fa-solid fa-circle-notch fa-spin"></i>
                      <span>Loading media stream...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Navigation Tabs Bar */}
              <div className="upload-tabs-bar">
                <button
                  type="button"
                  onClick={handleTranscriptTabClick}
                  className={`upload-tab-btn ${activeTab === 'transcript' ? 'active' : ''}`}
                >
                  {isTranscribing ? (
                    <>
                      <i className="fa-solid fa-circle-notch fa-spin"></i> Transcribing...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-bars-staggered"></i> Transcript
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('translate')}
                  className={`upload-tab-btn ${activeTab === 'translate' ? 'active' : ''}`}
                >
                  <i className="fa-solid fa-language"></i> Translate & PDF
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ask_ai')}
                  className={`upload-tab-btn ${activeTab === 'ask_ai' ? 'active' : ''}`}
                >
                  <i className="fa-regular fa-comment-dots"></i> Ask AI
                </button>
              </div>

              {/* Tab Stage Content Area */}
              <div className="upload-tab-content-area">
                {/* TAB 1: TRANSCRIPT */}
                {activeTab === 'transcript' && (
                  <div className="transcript-tab-view">
                    {isTranscribing ? (
                      <div className="transcribing-center-state">
                        <div className="transcribing-spinner-ring"></div>
                        <h3 className="transcribing-headline">Transcribing...</h3>
                        <p className="transcribing-subtext">Converting your audio recording into text with speaker labels and timecodes...</p>
                      </div>
                    ) : transcriptionError ? (
                      <div className="transcript-error-state">
                        <div className="transcript-error-icon">
                          <i className="fa-solid fa-triangle-exclamation"></i>
                        </div>
                        <h3 className="transcript-error-headline">Transcription Failed</h3>
                        <p className="transcript-error-subtext">{transcriptionError}</p>
                        <button
                          type="button"
                          className="transcript-action-btn transcript-retry-btn"
                          onClick={() => handleStartTranscription(activeSession?.id)}
                        >
                          <i className="fa-solid fa-rotate-right"></i> Transcript (Retry)
                        </button>
                      </div>
                    ) : !activeSession?.transcript ? (
                      <div className="transcript-ready-state">
                        <div className="transcript-ready-badge">
                          <i className="fa-solid fa-circle-check"></i> Audio Uploaded
                        </div>
                        <h3 className="transcript-ready-headline">Uploaded Successfully</h3>
                        <p className="transcript-ready-subtext">
                          Your audio file is ready. Click the Transcript button below to start transcribing.
                        </p>
                        <button
                          type="button"
                          className="transcript-action-btn"
                          onClick={() => handleStartTranscription(activeSession?.id)}
                        >
                          <i className="fa-solid fa-bars-staggered"></i> Transcript
                        </button>
                      </div>
                    ) : sessionUtterances.length === 0 ? (
                      <div className="transcript-empty-state">
                        <div className="transcript-no-content">
                          No transcript available yet.
                        </div>
                      </div>
                    ) : (
                      <div className="transcript-turns-list">
                        {sessionUtterances.map((turn, idx) => (
                          <div key={idx} className="transcript-turn-row">
                            <div className="turn-speaker-col">
                              <span className="turn-speaker-label">{turn.speaker}</span>
                              <span
                                className="turn-timecode"
                                onClick={() => seekToTime(turn.start || 0)}
                                title="Click to jump to this timestamp"
                              >
                                {turn.timecode || '0:00'}
                              </span>
                            </div>
                            <div className="turn-content-col">
                              {turn.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: TRANSLATE & PDF */}
                {activeTab === 'translate' && (
                  <div className="translate-tab-view">
                    {/* Search Languages input */}
                    <div className="translate-search-wrapper">
                      <i className="fa-solid fa-magnifying-glass search-icon"></i>
                      <input
                        type="text"
                        value={langSearch}
                        onChange={(e) => setLangSearch(e.target.value)}
                        placeholder="Search languages..."
                        className="translate-search-input"
                      />
                    </div>

                    {/* 22 Language Cards Grid */}
                    <div className="languages-grid-22">
                      {filteredLanguages.map(lang => (
                        <div
                          key={lang.code}
                          onClick={() => setSelectedTargetLang(lang)}
                          className={`lang-card ${selectedTargetLang?.code === lang.code ? 'selected' : ''}`}
                        >
                          <div className="lang-native">{lang.native}</div>
                          <div className="lang-english">{lang.english}</div>
                        </div>
                      ))}
                    </div>

                    {/* Translate Button */}
                    <div className="translate-action-row">
                      <button
                        type="button"
                        onClick={handleTranslate}
                        disabled={isTranslating}
                        className="translate-primary-btn"
                      >
                        <i className="fa-solid fa-language"></i>
                        {isTranslating ? (
                          <>Translating into {selectedTargetLang?.english}...</>
                        ) : (
                          <>Translate into {selectedTargetLang?.english}</>
                        )}
                      </button>

                      {translatedData && (
                        <button
                          type="button"
                          onClick={handleExportPDF}
                          className="export-pdf-action-btn"
                          title="Print or save PDF side-by-side"
                        >
                          <i className="fa-regular fa-file-pdf"></i> Export as PDF
                        </button>
                      )}
                    </div>

                    {/* Translated Output View */}
                    {translatedData && (
                      <div className="translation-results-panel">
                        <div className="translation-panel-header">
                          <span className="results-badge">
                            <i className="fa-solid fa-circle-check"></i> {selectedTargetLang?.english} Translation
                          </span>
                        </div>

                        {translatedData.translatedUtterances && translatedData.translatedUtterances.length > 0 ? (
                          <div className="translated-turns-list">
                            {translatedData.translatedUtterances.map((turn, idx) => (
                              <div key={idx} className="transcript-turn-row translated-row">
                                <div className="turn-speaker-col">
                                  <span className="turn-speaker-label">{turn.speaker}</span>
                                  <span className="turn-timecode">{turn.timecode || '0:00'}</span>
                                </div>
                                <div className="turn-content-col">
                                  {turn.text}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="translated-full-text">
                            {translatedData.translatedText}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: ASK AI */}
                {activeTab === 'ask_ai' && (
                  <div className="ask-ai-tab-view">
                    {messages.length === 0 ? (
                      <div className="ask-ai-empty-prompt-state">
                        <div className="ask-ai-center-icon">
                          <i className="fa-regular fa-comments"></i>
                        </div>
                        <h2 className="ask-ai-headline">Ask anything about this recording</h2>
                        <div className="ask-ai-prompt-chips">
                          <button
                            type="button"
                            className="prompt-chip-btn"
                            onClick={() => handleSendMessage(null, 'What were the main objections?')}
                          >
                            "What were the main objections?"
                          </button>
                          <span className="chip-separator">·</span>
                          <button
                            type="button"
                            className="prompt-chip-btn"
                            onClick={() => handleSendMessage(null, 'Summarise the action items')}
                          >
                            "Summarise the action items"
                          </button>
                          <span className="chip-separator">·</span>
                          <button
                            type="button"
                            className="prompt-chip-btn"
                            onClick={() => handleSendMessage(null, 'Did they mention pricing?')}
                          >
                            "Did they mention pricing?"
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="ask-ai-messages-scroller">
                        {messages.map((m, idx) => (
                          <div key={idx} className={`chat-message-row ${m.sender === 'user' ? 'user-side' : 'ai-side'}`}>
                            <div className="chat-bubble">
                              <div className="bubble-author">{m.sender === 'user' ? 'You' : 'Assistant'}</div>
                              <div className="bubble-text">{cleanDisplayText(m.text)}</div>
                            </div>
                          </div>
                        ))}

                        {isSending && (
                          <div className="chat-message-row ai-side">
                            <div className="chat-bubble thinking-bubble">
                              <div className="bubble-author">Assistant</div>
                              <div className="thinking-row">
                                <div className="spinner-mini"></div>
                                <span>Analyzing recording and answering...</span>
                              </div>
                            </div>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Bottom Pinned Prompt Bar */}
              <div className="upload-bottom-bar-wrapper">
                <form onSubmit={handleSendMessage} className="upload-pill-prompt-bar">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="pill-attach-btn"
                    title="Upload another audio or video file"
                    disabled={isUploading}
                  >
                    <i className="fa-solid fa-plus"></i>
                  </button>

                  {selectedFile && (
                    <div className="chat-selected-file-chip">
                      <i className="fa-solid fa-file-audio"></i>
                      <span className="chat-selected-file-name" title={selectedFile.name}>{selectedFile.name}</span>
                      <button
                        type="button"
                        onClick={clearSelectedFile}
                        className="chat-selected-file-clear"
                        title="Remove file"
                        disabled={isUploading}
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                  )}

                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={selectedFile ? "Click Upload or Send to process this file..." : "Ask anything about this recording..."}
                    className="pill-prompt-input"
                    disabled={isUploading || isSending}
                  />

                  <button
                    type="button"
                    onClick={toggleMic}
                    className={`pill-mic-btn ${isListening ? 'listening' : ''}`}
                    title={isListening ? 'Stop listening' : 'Speak your question'}
                    disabled={isUploading || isSending}
                  >
                    <i className={`fa-solid ${isListening ? 'fa-microphone-lines' : 'fa-microphone'}`}></i>
                  </button>

                  {selectedFile ? (
                    <button
                      type="button"
                      onClick={() => uploadAudioFile(selectedFile)}
                      className="pill-upload-action-btn"
                      disabled={isUploading}
                      title="Upload selected file"
                    >
                      {isUploading ? (
                        <i className="fa-solid fa-circle-notch fa-spin"></i>
                      ) : (
                        <>
                          <i className="fa-solid fa-cloud-arrow-up"></i> Upload
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="pill-send-btn"
                      disabled={!inputText.trim() || isUploading || isSending}
                      title="Send question"
                    >
                      <i className="fa-solid fa-arrow-up"></i>
                    </button>
                  )}
                </form>

                <div className="upload-footer-footnote">
                  Transcription by Deepgram · answers and translation by Grok · files up to 10 GB
                </div>
              </div>
            </div>
          )}

          {/* Floating Toast Notification during Transcribing */}
          {(isTranscribing || activeSession?.isTranscribing) && (
            <div className="transcribing-bottom-toast">
              <i className="fa-solid fa-circle-info"></i>
              <span>Uploaded. Transcribing now — this keeps running if you navigate away.</span>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
