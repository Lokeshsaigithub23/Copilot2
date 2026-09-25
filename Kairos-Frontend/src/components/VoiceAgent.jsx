import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './VoiceAgent.css';
import AccountDropdown from './UserProfile/AccountDropdown';
import { API_BASE, WS_BASE, websocketProtocols } from '../utils/api';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
// Deepgram Voice Agent CONFIG
const CONFIG = {
  listen: { type: "deepgram", model: "flux-general-en", version: "v2" }, // Flux STT
  think:  { type: "google",   model: "gemini-3.1-flash-lite" },          // LLM
  speak:  { type: "deepgram", model: "aura-2-odysseus-en" },             // Aura-2 voice
  outputSampleRate: 24000,
  greeting: "Hello! Welcome to your technical interview. I'm ready to conduct your interview today. When you're ready, let's get started. To begin, could you give a brief introduction of yourself, or would you like to jump right into core technical topics like Python, Java, and computer science fundamentals?",
  prompt: [
    "You are an expert, professional AI technical interviewer conducting a realistic live spoken general technical interview.",
    "",
    "INTERVIEW STRUCTURE & TOPICS (GENERAL TECHNICAL INTERVIEW):",
    "Conduct a comprehensive technical mock interview covering core software engineering topics, including:",
    "- Programming languages: Python, Java, JavaScript, C++, SQL.",
    "- Core programming fundamentals: Ask foundational questions such as 'What is Python and what are its key features?', 'What is Java and how does the JVM work?', or questions on data types, memory management, and syntax.",
    "- Software engineering concepts: Object-Oriented Programming (OOP), Data Structures (arrays, linked lists, trees, hash maps), Algorithms (sorting, searching, time complexity), and REST APIs.",
    "- Databases: Relational vs Non-Relational (SQL vs NoSQL), ACID properties, indexing.",
    "- System design and problem-solving fundamentals.",
    "",
    "INTERVIEW RULES (STRICT):",
    "1. Ask exactly ONE question at a time. Never ask compound or multi-part questions.",
    "2. Listen carefully to the candidate's spoken response.",
    "3. Provide a concise 1-2 sentence constructive acknowledgement or feedback, then ask a relevant follow-up or move to the next technical question.",
    "4. If the candidate expresses preference for a particular programming language or area (e.g. Python, Java, web development, backend), focus primarily on that domain while covering core concepts.",
    "5. Keep questions clear, conversational, and direct.",
    "",
    "SPOKEN VOICE STYLE (CRITICAL — words are converted to audio by TTS):",
    "- Be warm, conversational, concise, and professional.",
    "- Never use markdown, asterisks, bullet points, numbered lists with digits, or code blocks. Never say 'asterisk' or 'bullet'.",
    "- Keep answers between 40 to 80 words so the candidate speaks the majority of the time.",
    "- If code logic is needed, describe it verbally in plain English."
  ].join("\n")
};

const extractErrorMessage = (err, fallback = 'Failed to upload resume. Please try again.') => {
  if (!err) return fallback;
  if (typeof err === 'string') {
    const trimmed = err.trim();
    return trimmed || fallback;
  }
  if (typeof err === 'object') {
    // 1. axios response structures
    const resData = err.response?.data;
    if (typeof resData === 'string' && resData.trim()) {
      return resData.trim();
    }
    if (resData && typeof resData === 'object') {
      if (typeof resData.error === 'string' && resData.error.trim()) {
        return resData.error.trim();
      }
      if (resData.error && typeof resData.error === 'object') {
        if (typeof resData.error.message === 'string' && resData.error.message.trim()) {
          return resData.error.message.trim();
        }
        if (typeof resData.error.description === 'string' && resData.error.description.trim()) {
          return resData.error.description.trim();
        }
      }
      if (typeof resData.message === 'string' && resData.message.trim()) {
        return resData.message.trim();
      }
      if (typeof resData.description === 'string' && resData.description.trim()) {
        return resData.description.trim();
      }
    }

    // 2. native/JS error structures
    if (typeof err.message === 'string' && err.message.trim()) {
      return err.message.trim();
    }
    if (typeof err.description === 'string' && err.description.trim()) {
      return err.description.trim();
    }
    if (typeof err.error === 'string' && err.error.trim()) {
      return err.error.trim();
    }
    if (err.error && typeof err.error === 'object') {
      if (typeof err.error.message === 'string' && err.error.message.trim()) {
        return err.error.message.trim();
      }
    }
  }
  return fallback;
};

const WORKLET_CODE = `
class PCMForwarder extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("pcm-forwarder", PCMForwarder);
`;

export default function VoiceAgent({
  token,
  user,
  onLogout,
  onBackToLanding,
  onGoToPanel,
  onGoToNotetaker,
  onGoToUpload,
  onGoToDashboard,
  onGoToProfile,
  showToast,
  darkMode,
  toggleDarkMode,
  windowType
}) {
  const [wsState, setWsState] = useState('idle'); // 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking'
  const [connected, setConnected] = useState(false);

  // Dragging Header Controls
  const handleMinimize = () => ipcRenderer?.send('window-minimize');
  const handleMaximize = () => ipcRenderer?.send('window-maximize');
  const [muted, setMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [messages, setMessages] = useState([]);
  const [latency, setLatency] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [level, setLevel] = useState(0);

  // Resume state for interview context
  const [resumeData, setResumeData] = useState(null);
  const resumeDataRef = useRef(null);
  const [jobDescription, setJobDescription] = useState('');
  const jobDescriptionRef = useRef('');
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [resumeError, setResumeError] = useState(null);
  const [isDraggingResume, setIsDraggingResume] = useState(false);
  const resumeInputRef = useRef(null);

  // Refs for audio and websocket
  const wsRef = useRef(null);
  const micStreamRef = useRef(null);
  const micCtxRef = useRef(null);
  const micNodeRef = useRef(null);
  const micSourceRef = useRef(null);
  const spkCtxRef = useRef(null);
  const nextPlayTimeRef = useRef(0);
  const playingSourcesRef = useRef([]);
  const pausedAudioChunksRef = useRef([]);
  const wasSpeakingBeforePauseRef = useRef(false);
  const keepAliveTimerRef = useRef(null);
  const pendingSamplesRef = useRef([]);
  const pendingLengthRef = useRef(0);
  const levelIntervalRef = useRef(null);
  const transcriptEndRef = useRef(null);
  // Generation counter to guard against async start/stop/restart race conditions
  const agentGenRef = useRef(0);
  const isStartingRef = useRef(false);
  const lastClickTimeRef = useRef(0);
  const isMountedRef = useRef(true);

  // Keep mutability values current for audio processing
  const connectedVal = useRef(false);
  const mutedVal = useRef(false);
  const isPausedVal = useRef(false);
  const wsStateVal = useRef('idle');

  useEffect(() => {
    connectedVal.current = connected;
  }, [connected]);

  useEffect(() => {
    mutedVal.current = muted;
  }, [muted]);

  useEffect(() => {
    isPausedVal.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    wsStateVal.current = wsState;
  }, [wsState]);

  useEffect(() => {
    resumeDataRef.current = resumeData;
  }, [resumeData]);

  useEffect(() => {
    jobDescriptionRef.current = jobDescription;
  }, [jobDescription]);

  // Automatically scroll transcript to bottom
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Clean up on component switch
  useEffect(() => {
    if (windowType !== 'voice-agent') {
      cleanup();
    }
  }, [windowType]);

  // Clean up on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  }, []);

  // Clean up on beforeunload (browser tab close/reload)
  useEffect(() => {
    const handleBeforeUnload = () => {
      cleanup();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const handleStartMic = async (currentGen) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
    });
    // Cancellation guard: discard mic stream if generation has changed
    if (agentGenRef.current !== currentGen) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    micStreamRef.current = stream;
    console.log('[VoiceAgent] Microphone settings:', stream.getAudioTracks()[0]?.getSettings?.());
    
    const AC = window.AudioContext || window.webkitAudioContext;
    try {
      micCtxRef.current = new AC({ sampleRate: 16000 });
    } catch (e) {
      micCtxRef.current = new AC();
    }
    
    await micCtxRef.current.resume();
    // Cancellation guard: ensure generation did not change while audio context resumed
    if (agentGenRef.current !== currentGen) {
      stream.getTracks().forEach((t) => t.stop());
      try { micCtxRef.current.close().catch(() => {}); } catch (_) {}
      return;
    }
    micSourceRef.current = micCtxRef.current.createMediaStreamSource(micStreamRef.current);

    let workletOk = false;
    if (micCtxRef.current.audioWorklet) {
      try {
        const url = URL.createObjectURL(new Blob([WORKLET_CODE], { type: "application/javascript" }));
        try {
          await micCtxRef.current.audioWorklet.addModule(url);
        } finally {
          URL.revokeObjectURL(url);
        }
        // Cancellation guard: ensure generation did not change while worklet module was loading
        if (agentGenRef.current !== currentGen) {
          stream.getTracks().forEach((t) => t.stop());
          try { micCtxRef.current.close().catch(() => {}); } catch (_) {}
          return;
        }
        micNodeRef.current = new AudioWorkletNode(micCtxRef.current, "pcm-forwarder");
        micNodeRef.current.port.onmessage = (e) => handleMicChunk(e.data);
        micSourceRef.current.connect(micNodeRef.current);
        // Keep the worklet in the active audio graph without playing mic audio back.
        const silentGain = micCtxRef.current.createGain();
        silentGain.gain.value = 0;
        micNodeRef.current.connect(silentGain);
        silentGain.connect(micCtxRef.current.destination);
        console.log('[VoiceAgent] PCM input:', {
          encoding: 'linear16',
          sampleRate: micCtxRef.current.sampleRate,
          channels: 1,
          chunkMilliseconds: 60
        });
        workletOk = true;
      } catch (e) {
        console.warn("AudioWorklet failed, falling back to ScriptProcessor", e);
      }
    }
    
    if (agentGenRef.current !== currentGen) return;

    if (!workletOk) {
      micNodeRef.current = micCtxRef.current.createScriptProcessor(2048, 1, 1);
      micNodeRef.current.onaudioprocess = (e) => handleMicChunk(e.inputBuffer.getChannelData(0));
      micSourceRef.current.connect(micNodeRef.current);
      micNodeRef.current.connect(micCtxRef.current.destination);
    }
  };

  const handleMicChunk = (float32) => {
    if (isPausedVal.current) {
      if (isMountedRef.current) setLevel(0);
      return;
    }

    // Calculate level meter value
    let sum = 0;
    for (let i = 0; i < float32.length; i++) {
      sum += float32[i] * float32[i];
    }
    const rms = Math.sqrt(sum / float32.length);
    if (isMountedRef.current) {
      setLevel(prev => Math.max(rms, prev * 0.85));
    }

    if (!connectedVal.current || mutedVal.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    pendingSamplesRef.current.push(float32);
    pendingLengthRef.current += float32.length;
    const flushAt = Math.floor(micCtxRef.current.sampleRate * 0.06); // ~60 ms chunks
    if (pendingLengthRef.current < flushAt) return;

    const merged = new Float32Array(pendingLengthRef.current);
    let off = 0;
    for (const c of pendingSamplesRef.current) {
      merged.set(c, off);
      off += c.length;
    }
    pendingSamplesRef.current = [];
    pendingLengthRef.current = 0;

    const i16 = new Int16Array(merged.length);
    for (let i = 0; i < merged.length; i++) {
      const s = Math.max(-1, Math.min(1, merged[i]));
      i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    wsRef.current.send(i16.buffer);
  };

  const playAudioChunk = (arrayBuffer) => {
    if (isPausedVal.current) {
      pausedAudioChunksRef.current.push(arrayBuffer);
      return;
    }
    if (!spkCtxRef.current) return;
    const i16 = new Int16Array(arrayBuffer);
    if (!i16.length) return;
    const f32 = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) {
      f32[i] = i16[i] / 32768;
    }

    const buf = spkCtxRef.current.createBuffer(1, f32.length, CONFIG.outputSampleRate);
    buf.getChannelData(0).set(f32);

    const src = spkCtxRef.current.createBufferSource();
    src.buffer = buf;
    src.connect(spkCtxRef.current.destination);

    const startAt = Math.max(spkCtxRef.current.currentTime + 0.03, nextPlayTimeRef.current);
    src.start(startAt);
    nextPlayTimeRef.current = startAt + buf.duration;

    playingSourcesRef.current.push(src);
    src.onended = () => {
      playingSourcesRef.current = playingSourcesRef.current.filter((s) => s !== src);
      if (!playingSourcesRef.current.length && !pausedAudioChunksRef.current.length && connectedVal.current && wsStateVal.current === 'speaking') {
        setWsState(isPausedVal.current ? 'paused' : 'listening');
      }
    };
  };

  const stopPlayback = () => {
    pausedAudioChunksRef.current = [];
    wasSpeakingBeforePauseRef.current = false;
    playingSourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch (e) {}
    });
    playingSourcesRef.current = [];
    nextPlayTimeRef.current = 0;
  };

  const handleResumeFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadResume(file);
  };

  const handleResumeDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingResume(true);
  };

  const handleResumeDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingResume(false);
  };

  const handleResumeDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingResume(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      uploadResume(file);
      e.dataTransfer.clearData();
    }
  };

  const uploadResume = async (file) => {
    // 1. Immediately terminate any active interview session
    cleanup();
    // 2. Discard previous conversation messages/history completely
    setMessages([]);
    // 3. Clear existing resume context to prevent stale or invalid data reuse
    setResumeData(null);
    resumeDataRef.current = null;
    setResumeError(null);

    if (!file) {
      const err = 'No file selected. Please select a valid resume.';
      setResumeError(err);
      if (showToast) showToast(err);
      return;
    }

    // Robust file extension & MIME type validation (supports multi-dot names like sathvika.pdf.pdf)
    const allowedExts = ['.pdf', '.docx', '.doc'];
    const fileName = (file.name || '').trim();
    const lastDotIdx = fileName.lastIndexOf('.');
    const ext = lastDotIdx !== -1 ? fileName.substring(lastDotIdx).toLowerCase() : '';

    const allowedMimes = [
      'application/pdf',
      'application/x-pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream'
    ];
    const mimeType = (file.type || '').toLowerCase();

    const isValidExt = allowedExts.includes(ext);
    const isValidMime = !mimeType ||
      allowedMimes.includes(mimeType) ||
      mimeType.includes('pdf') ||
      mimeType.includes('word') ||
      mimeType.includes('document') ||
      mimeType.includes('octet-stream');

    if (!isValidExt || !isValidMime) {
      const err = 'Invalid file format. Please upload a PDF, DOCX, or DOC document.';
      setResumeError(err);
      if (showToast) showToast(err);
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      const err = 'File is too large. Maximum size is 15MB.';
      setResumeError(err);
      if (showToast) showToast(err);
      return;
    }

    if (file.size === 0) {
      const err = 'The selected file is empty. Please upload a valid resume.';
      setResumeError(err);
      if (showToast) showToast(err);
      return;
    }

    setIsUploadingResume(true);
    setResumeError(null);

    const formData = new FormData();
    formData.append('file', file);

    const effectiveToken = token || localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';

    try {
      const response = await axios.post(`${API_BASE}/api/voice-agent/upload-resume`, formData, {
        headers: {
          Authorization: `Bearer ${effectiveToken}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data && response.data.ok) {
        if (!isMountedRef.current) return;
        // Update state and ref synchronously with new resume data
        setResumeData(response.data);
        resumeDataRef.current = response.data;
        setResumeError(null);
        setMessages([]); // Confirm messages are cleared for fresh session
        console.log('[VoiceAgent] Successfully uploaded & parsed new resume:', {
          fileName: response.data.fileName,
          candidateName: response.data.preview?.name,
          skills: response.data.preview?.skills,
          textLength: response.data.resumeText?.length
        });
        if (showToast) {
          const candidate = response.data.preview?.name ? ` for ${response.data.preview.name}` : '';
          showToast(`Resume loaded${candidate}! Ready for interview.`);
        }
      } else {
        const errText = extractErrorMessage(response.data?.error || response.data, 'Failed to analyze resume.');
        throw new Error(errText);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      // Do not store invalid resume in state or ref
      setResumeData(null);
      resumeDataRef.current = null;
      const errMsg = extractErrorMessage(err, 'The uploaded document does not appear to be a resume. Please upload a valid resume.');
      setResumeError(errMsg);
      if (showToast) showToast(errMsg);
    } finally {
      if (isMountedRef.current) {
        setIsUploadingResume(false);
      }
      if (resumeInputRef.current) resumeInputRef.current.value = '';
    }
  };

  const handleClearResume = () => {
    cleanup();
    setResumeData(null);
    resumeDataRef.current = null;
    setResumeError(null);
    setMessages([]);
    if (resumeInputRef.current) resumeInputRef.current.value = '';
  };

  const buildSettings = (activeResume = resumeDataRef.current || resumeData) => {
    let agentPrompt = CONFIG.prompt;
    let agentGreeting = CONFIG.greeting;
    const activeJobDescription = jobDescriptionRef.current.trim();

    if (activeResume) {
      const activeResumeText = (activeResume.resumeText || '').trim();
      const isGeneric = (!activeResume.preview?.name || activeResume.preview.name.toLowerCase() === 'candidate');
      const candidateName = isGeneric ? 'Candidate' : activeResume.preview.name;
      const role = activeResume.preview?.role || 'Software Engineer';
      const skillsList = activeResume.preview?.skills?.length > 0
        ? activeResume.preview.skills.join(', ')
        : 'software engineering and problem solving';
      const summaryText = activeResume.preview?.summary || '';
      const nameSalutation = isGeneric ? 'Candidate' : activeResume.preview.name.split(' ')[0];
      const fileName = activeResume.fileName || 'Uploaded Resume';

      agentGreeting = activeResume.preview?.greeting || `Hello ${nameSalutation}! I have reviewed your resume and I am excited to interview you today. When you are ready, please introduce yourself and tell me about your recent work.`;

      if (activeJobDescription) {
        agentGreeting = `Hello ${nameSalutation}! I have reviewed your resume and the job description. I will prepare you for this role by focusing on the most important requirements in the job description. When you are ready, please introduce yourself and tell me how your experience matches this role.`;
        agentPrompt = [
          `You are an expert, professional AI technical interviewer conducting a realistic live spoken technical interview with ${candidateName}.`,
          "",
          "PRIMARY INTERVIEW TARGET: JOB DESCRIPTION ONLY",
          "Treat the job description as the primary source of truth for this interview.",
          "Ask questions directly from the job description's responsibilities, required skills, qualifications, seniority, tools, and business expectations.",
          "Prioritize the most important and repeated requirements in the job description before secondary topics.",
          "Use the resume only as supporting evidence to personalize questions, check the candidate's fit, and ask about experience that relates directly to a job requirement.",
          "Never let the resume introduce an unrelated interview topic or override the job description.",
          "Do not invent experience, skills, responsibilities, or company details that are not present in the job description, resume, or candidate's spoken answers.",
          "Ask exactly ONE question at a time. Never ask compound or multi-part questions.",
          "Keep the interview focused on preparing the candidate to perform this specific job.",
          "",
          "CANDIDATE INFORMATION:",
          `- Candidate Name: ${candidateName}`,
          `- Resume File: ${fileName}`,
          `- Target Role: ${role}`,
          `- Resume Skills: ${skillsList}`,
          `- Resume Summary: ${summaryText}`,
          "",
          "JOB DESCRIPTION (PRIMARY SOURCE OF TRUTH FOR QUESTION SELECTION):",
          "--- JOB DESCRIPTION START ---",
          activeJobDescription,
          "--- JOB DESCRIPTION END ---",
          "",
          "RESUME CONTEXT (SUPPORTING EVIDENCE ONLY):",
          "--- RESUME START ---",
          activeResumeText,
          "--- RESUME END ---",
          "",
          "SPOKEN VOICE STYLE (CRITICAL — words are converted to audio by TTS):",
          "- Be warm, conversational, concise, and professional.",
          "- Never use markdown, asterisks, bullet points, numbered lists with digits, or code blocks. Never say 'asterisk' or 'bullet'.",
          "- Keep answers between 40 to 80 words so the candidate speaks the majority of the time.",
          "- If code logic is needed, describe it verbally in plain English."
        ].join("\n");
      } else {
        agentPrompt = [
          `You are an expert, professional AI technical interviewer conducting a realistic live spoken technical interview with ${candidateName}.`,
          "",
          "CRITICAL RESUME-ONLY CONTEXT RULES (STRICT):",
          "1. THIS IS A BRAND NEW, INDEPENDENT INTERVIEW SESSION.",
          "2. Formulate all interview questions EXCLUSIVELY and ONLY from the candidate profile and full resume text provided below.",
          "3. Review the full resume content below before asking questions.",
          "4. Dynamically generate questions tailored directly to THIS candidate's actual projects, listed technical skills, work experience, education, and certifications.",
          "5. Ask exactly ONE question at a time. Never dump multiple questions together or ask compound multi-part questions.",
          "6. Listen carefully to the candidate's spoken response. Give a concise 1-2 sentence constructive acknowledgement or feedback, then ask a relevant follow-up question or transition to another specific topic/project mentioned in THIS resume.",
          "",
          "CANDIDATE INFORMATION (FOR THIS SESSION ONLY):",
          `- Candidate Name: ${candidateName}`,
          `- Document File: ${fileName}`,
          `- Target Role: ${role}`,
          `- Key Skills: ${skillsList}`,
          `- Background Summary: ${summaryText}`,
          "",
          "FULL EXTRACTED RESUME TEXT (THIS IS YOUR SINGLE SOURCE OF TRUTH):",
          "\"\"\"",
          activeResumeText,
          "\"\"\"",
          "",
          "SPOKEN VOICE STYLE (CRITICAL — words are converted to audio by TTS):",
          "- Be warm, conversational, concise, and professional.",
          "- Never use markdown, asterisks, bullet points, numbered lists with digits, or code blocks. Never say 'asterisk' or 'bullet'.",
          "- Keep answers between 40 to 80 words so the candidate speaks the majority of the time.",
          "- If code logic is needed, describe it verbally in plain English."
        ].join("\n");
      }
    } else if (activeJobDescription) {
      agentGreeting = "Hello! I’m ready to interview you for this role. I’ll focus on the job requirements, responsibilities, and skills in the job description, and adapt questions to your answers.";
      agentPrompt = [
        "You are an expert, professional AI interviewer conducting a live interview for the role described in the job description below.",
        "",
        "JOB DESCRIPTION IS THE PRIMARY SOURCE OF TRUTH.",
        "1. Build the entire interview around the role's duties, required skills, seniority, and business expectations in the job description.",
        "2. Ask one clear interview question at a time and keep the questions directly relevant to the job role.",
        "3. Do not fall back to generic technical interview questions unless the job description explicitly demands them.",
        "4. Use the candidate's spoken answers to ask a follow-up question that is relevant to that role requirement.",
        "5. Keep questions practical, role-based, and realistic for a hiring conversation.",
        "6. Keep answers concise, warm, and professional. Never use markdown, bullets, numbered lists, code blocks, or long explanations.",
        "",
        "--- JOB DESCRIPTION START ---",
        activeJobDescription,
        "--- JOB DESCRIPTION END ---",
        "",
        "INTERVIEW STYLE:",
        "- Ask role-specific questions based on sales, communication, negotiation, client acquisition, relationship management, targets, and operations as described in the JD.",
        "- If the role is a business development role, focus on lead generation, prospecting, client outreach, objections, sales process, negotiation, and relationship building.",
        "- If the role is technical, focus on technical depth and problem-solving only when required by the JD.",
        "- Keep each question short, direct, and conversational."
      ].join("\n");
    }

    return {
      type: "Settings",
      audio: {
        input:  { encoding: "linear16", sample_rate: micCtxRef.current?.sampleRate || 16000 },
        output: { encoding: "linear16", sample_rate: CONFIG.outputSampleRate, container: "none" }
      },
      agent: {
        language: "en",
        listen: { provider: { ...CONFIG.listen } },
        think:  { provider: { ...CONFIG.think }, prompt: agentPrompt },
        speak:  { provider: { ...CONFIG.speak } },
        greeting: agentGreeting
      }
    };
  };

  const connect = (currentGen, activeResume) => {
    // Cancellation guard: ensure generation is still valid before connecting
    if (agentGenRef.current !== currentGen) return;
    setWsState('connecting');
    setErrorMsg(null);

    const resolvedResume = activeResume || resumeDataRef.current || resumeData;
    const settings = buildSettings(resolvedResume);

    // Logging to verify whether resume context or general technical interview is being sent
    console.log('[VoiceAgent] Connecting with context:', {
      hasResume: !!resolvedResume,
      hasJobDescription: !!jobDescriptionRef.current.trim(),
      jobDescriptionLength: jobDescriptionRef.current.trim().length,
      fileName: resolvedResume?.fileName || 'None (General Interview)',
      candidateName: resolvedResume?.preview?.name || 'General Candidate',
      textLength: resolvedResume?.resumeText?.length || 0,
      greeting: settings.agent.greeting
    });

    if (ipcRenderer) {
      // ── Electron Mode: Route via native IPC bridge ──
      console.log('[VoiceAgent] Connecting via native Electron IPC...');
      
      ipcRenderer.removeAllListeners('voice-agent-open');
      ipcRenderer.removeAllListeners('voice-agent-msg');
      ipcRenderer.removeAllListeners('voice-agent-err');
      ipcRenderer.removeAllListeners('voice-agent-closed');

      const mockWs = {
        readyState: 1, // WebSocket.OPEN
        send: (data) => {
          // Cancellation guard: only send if this generation is active
          if (agentGenRef.current !== currentGen) return;
          ipcRenderer.send('voice-agent-send', data);
        },
        close: () => {
          ipcRenderer.send('voice-agent-close');
        }
      };
      wsRef.current = mockWs;

      ipcRenderer.on('voice-agent-open', () => {
        // Cancellation guard: ignore stale IPC open events
        if (agentGenRef.current !== currentGen) return;
        isStartingRef.current = false;
        connectedVal.current = true;
        setConnected(true);
        setWsState('connected');
        console.log('[VoiceAgent IPC] Open received');
        mockWs.send(JSON.stringify(settings));
        keepAliveTimerRef.current = setInterval(() => {
          if (agentGenRef.current !== currentGen) {
            if (keepAliveTimerRef.current) clearInterval(keepAliveTimerRef.current);
            return;
          }
          mockWs.send(JSON.stringify({ type: "KeepAlive" }));
        }, 8000);
      });

      ipcRenderer.on('voice-agent-msg', (_, data, isBinary) => {
        // Cancellation guard: discard messages from outdated generations
        if (agentGenRef.current !== currentGen) return;
        let payload = data;
        if (isBinary) {
          if (data) {
            const buf = data.buffer || new Uint8Array(data).buffer;
            payload = buf.slice(data.byteOffset || 0, (data.byteOffset || 0) + (data.byteLength || data.length || 0));
          }
        } else {
          if (data instanceof Uint8Array || Buffer.isBuffer(data)) {
            payload = new TextDecoder("utf-8").decode(data);
          } else if (typeof data !== "string") {
            payload = String(data);
          }
        }
        handleIncomingMessage({ data: payload });
      });

      ipcRenderer.on('voice-agent-err', (_, err) => {
        if (agentGenRef.current !== currentGen) return;
        setErrorMsg(err || "Native agent connection error.");
      });

      ipcRenderer.on('voice-agent-closed', (_, code, reason) => {
        // Cancellation guard: ignore close events from superseded sessions
        if (agentGenRef.current !== currentGen) return;
        const wasConnected = connectedVal.current;
        cleanup();
        if (wasConnected) {
          setWsState('idle');
        } else if (code !== 1000) {
          setErrorMsg(prev => prev || ("Connection failed (code " + code + "). Check API key validity."));
          setWsState('idle');
        }
      });

      ipcRenderer.send('voice-agent-connect');

    } else {
      // ── Browser Mode: Use standard WebSocket proxy ──
      const authToken = token || localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
      const ws = new WebSocket(`${WS_BASE}/api/voice-agent/converse`, websocketProtocols(authToken));
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        // Cancellation guard: ignore open if session was cancelled
        if (agentGenRef.current !== currentGen) {
          try { ws.close(); } catch (_) {}
          return;
        }
        isStartingRef.current = false;
        connectedVal.current = true;
        setConnected(true);
        setWsState('connected');
        ws.send(JSON.stringify(settings));
        keepAliveTimerRef.current = setInterval(() => {
          if (agentGenRef.current !== currentGen) {
            if (keepAliveTimerRef.current) clearInterval(keepAliveTimerRef.current);
            return;
          }
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "KeepAlive" }));
          }
        }, 8000);
      };

      ws.onmessage = (evt) => {
        // Cancellation guard: discard messages from old generations
        if (agentGenRef.current !== currentGen) return;
        handleIncomingMessage(evt);
      };

      ws.onerror = () => {
        if (agentGenRef.current !== currentGen) return;
        setErrorMsg(prev => prev || "WebSocket error — check your API key, network, or browser console.");
      };

      ws.onclose = (evt) => {
        // Cancellation guard: ignore close events from superseded sessions
        if (agentGenRef.current !== currentGen) return;
        const wasConnected = connectedVal.current;
        cleanup();
        if (wasConnected) {
          setWsState('idle');
        } else if (evt && evt.code !== 1000) {
          setErrorMsg(prev => prev || ("Connection failed (code " + evt.code + "). Check API key validity."));
          setWsState('idle');
        }
      };
    }
  };

  const handleIncomingMessage = (evt) => {
    if (typeof evt.data !== "string") {
      playAudioChunk(evt.data);
      return;
    }
    
    let msg;
    try {
      msg = JSON.parse(evt.data);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      case "SettingsApplied":
        setConnected(true);
        setWsState(isPausedVal.current ? 'paused' : 'listening');
        break;
      case "ConversationText":
        if (msg.content) {
          setMessages(prev => {
            const role = msg.role === "user" ? "user" : "assistant";
            const last = prev[prev.length - 1];
            if (last && last.role === role) {
              return [...prev.slice(0, -1), { role, text: last.text + " " + msg.content }];
            } else {
              return [...prev, { role, text: msg.content }];
            }
          });
        }
        break;
      case "UserStartedSpeaking":
        if (isPausedVal.current) return;
        stopPlayback(); // Barge-in: cut off speaker playback immediately
        setWsState('listening');
        break;
      case "AgentThinking":
        if (isPausedVal.current) return;
        setWsState('thinking');
        break;
      case "AgentStartedSpeaking":
        if (typeof msg.total_latency === "number") {
          setLatency(Math.round(msg.total_latency * 1000));
        }
        if (isPausedVal.current) {
          wasSpeakingBeforePauseRef.current = true;
          return;
        }
        setWsState('speaking');
        break;
      case "Warning":
        console.warn("Deepgram warning:", msg);
        break;
      case "Error":
        setErrorMsg(msg.description || msg.message || "Agent error");
        console.error("Deepgram error:", msg);
        break;
      default:
        break;
    }
  };

  const handleStartInterview = async () => {
    const now = Date.now();
    // Guard against rapid duplicate clicks within 250ms
    if (now - lastClickTimeRef.current < 250) return;
    lastClickTimeRef.current = now;

    const currentResume = resumeDataRef.current || resumeData;

    // Prevent starting interview while uploading or if upload/validation failed
    if (!connected && (isUploadingResume || !!resumeError)) {
      return;
    }

    if (connected || isStartingRef.current || (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN))) {
      cleanup();
      return;
    }

    // Clean up any residual connection and wipe previous conversation context completely
    cleanup();
    setMessages([]);
    setErrorMsg(null);
    isStartingRef.current = true;

    // Invalidate any previous connection and assign a unique generation ID
    const currentGen = ++agentGenRef.current;
    
    try {
      setWsState('connecting');
      const AC = window.AudioContext || window.webkitAudioContext;
      spkCtxRef.current = new AC();
      await spkCtxRef.current.resume();
      // Cancellation guard: ensure generation is still valid after speaker context resumes
      if (agentGenRef.current !== currentGen) {
        cleanup();
        return;
      }
      await handleStartMic(currentGen);
      // Cancellation guard: ensure generation is still valid after mic acquisition
      if (agentGenRef.current !== currentGen) {
        cleanup();
        return;
      }
      connect(currentGen, currentResume);
    } catch (err) {
      if (agentGenRef.current !== currentGen || !isMountedRef.current) return;
      console.error(err);
      cleanup();
      if (!isMountedRef.current) return;
      if (err && (err.name === "NotAllowedError" || err.name === "SecurityError")) {
        setErrorMsg("Microphone access was blocked. Allow microphone permission.");
      } else if (err && err.name === "NotFoundError") {
        setErrorMsg("No microphone found. Please connect one.");
      } else {
        setErrorMsg("Could not start audio: " + (err && err.message ? err.message : err));
      }
    }
  };

  const handlePauseToggle = async () => {
    if (!connectedVal.current) return;
    const next = !isPausedVal.current;
    isPausedVal.current = next;
    setIsPaused(next);

    if (next) {
      wasSpeakingBeforePauseRef.current = (
        wsStateVal.current === 'speaking' ||
        playingSourcesRef.current.length > 0 ||
        pausedAudioChunksRef.current.length > 0
      );
      if (spkCtxRef.current && spkCtxRef.current.state === 'running') {
        try {
          await spkCtxRef.current.suspend();
        } catch (e) {
          console.error("Failed to suspend speaker AudioContext:", e);
        }
      }
      setLevel(0);
      setWsState('paused');
    } else {
      if (spkCtxRef.current && spkCtxRef.current.state === 'suspended') {
        try {
          await spkCtxRef.current.resume();
        } catch (e) {
          console.error("Failed to resume speaker AudioContext:", e);
        }
      }

      if (pausedAudioChunksRef.current.length > 0) {
        const queued = pausedAudioChunksRef.current;
        pausedAudioChunksRef.current = [];
        for (const chunk of queued) {
          playAudioChunk(chunk);
        }
      }

      const isStillSpeaking = wasSpeakingBeforePauseRef.current || playingSourcesRef.current.length > 0;
      setWsState(isStillSpeaking ? 'speaking' : 'listening');
      wasSpeakingBeforePauseRef.current = false;
    }
  };

  const handleMuteToggle = () => {
    setMuted(prev => !prev);
  };

  const cleanup = () => {
    // Invalidate active generation so all in-flight promises and callbacks abort immediately
    agentGenRef.current++;
    isStartingRef.current = false;
    connectedVal.current = false;
    if (isMountedRef.current) {
      setConnected(false);
      setIsPaused(false);
      setWsState('idle');
    }
    isPausedVal.current = false;
    
    if (keepAliveTimerRef.current) {
      clearInterval(keepAliveTimerRef.current);
      keepAliveTimerRef.current = null;
    }
    if (levelIntervalRef.current) {
      clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }
    
    stopPlayback();
    
    if (micNodeRef.current) {
      try { micNodeRef.current.disconnect(); } catch (e) {}
      micNodeRef.current = null;
    }
    if (micSourceRef.current) {
      try { micSourceRef.current.disconnect(); } catch (e) {}
      micSourceRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (micCtxRef.current) {
      try { micCtxRef.current.close(); } catch (e) {}
      micCtxRef.current = null;
    }
    if (spkCtxRef.current) {
      try { spkCtxRef.current.close(); } catch (e) {}
      spkCtxRef.current = null;
    }
    if (wsRef.current) {
      try { wsRef.current.close(1000); } catch (e) {}
      wsRef.current = null;
    }
    if (ipcRenderer) {
      ipcRenderer.removeAllListeners('voice-agent-open');
      ipcRenderer.removeAllListeners('voice-agent-msg');
      ipcRenderer.removeAllListeners('voice-agent-err');
      ipcRenderer.removeAllListeners('voice-agent-closed');
      ipcRenderer.send('voice-agent-close');
    }
    
    pendingSamplesRef.current = [];
    pendingLengthRef.current = 0;
    if (isMountedRef.current) {
      setMuted(false);
      setLevel(0);
      setLatency(null);
    }
  };

  // Navigation & Close handlers that stop voice agent before navigating
  const handleClose = () => {
    cleanup();
    ipcRenderer?.send('window-close');
  };

  const handleBackToLanding = () => {
    cleanup();
    if (onBackToLanding) onBackToLanding();
  };

  const handleGoToDashboard = () => {
    cleanup();
    if (onGoToDashboard) onGoToDashboard();
  };

  const handleGoToPanel = () => {
    cleanup();
    if (onGoToPanel) onGoToPanel();
  };

  const handleGoToNotetaker = () => {
    cleanup();
    if (onGoToNotetaker) onGoToNotetaker();
  };

  const handleGoToUpload = () => {
    cleanup();
    if (onGoToUpload) onGoToUpload();
  };

  const handleLogoutClick = () => {
    cleanup();
    if (onLogout) onLogout();
  };

  const getStatusText = () => {
    switch (wsState) {
      case 'connecting':
        return { title: "Connecting…", sub: "Setting up microphone and agent" };
      case 'paused':
        return { title: "Interview Paused", sub: "Microphone and AI speech are paused. Click Resume to continue." };
      case 'listening':
        return { title: "Listening", sub: muted ? "Microphone is muted" : "Go ahead — ask or answer in your own words" };
      case 'thinking':
        return { title: "Thinking…", sub: "Preparing your answer" };
      case 'speaking':
        return { title: "Speaking", sub: "You can interrupt at any time" };
      case 'idle':
      default:
        if (!resumeData) {
          return {
            title: "Ready for Interview",
            sub: "Click Start Agent to begin a general technical interview, or upload your resume for a personalized interview."
          };
        }
        return {
          title: "Ready for Interview",
          sub: `Resume loaded${resumeData.preview?.name ? ` for ${resumeData.preview.name}` : ''}! Click Start Agent to begin your resume-based interview.`
        };
    }
  };

  const status = getStatusText();

  return (
    <div className="interview-panel-root voice-agent-root">
      {/* Titlebar for Electron Drag */}
      <div className="window-titlebar">
        <div className="window-title">
          <i className="fa-solid fa-brain"></i> Voice Agent | My Interview Copilot
        </div>
        <div className="window-controls">
          <button className="win-btn win-btn-minimize" onClick={handleMinimize} title="Minimize">—</button>
          <button className="win-btn win-btn-maximize" onClick={handleMaximize} title="Maximize">▢</button>
          <button className="win-btn win-btn-close" onClick={handleClose} title="Close">×</button>
        </div>
      </div>
      {/* Dashboard Green Navigation Header */}
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
          <button onClick={(e) => e.preventDefault()} className="setup-action-btn btn-voice-agent active" type="button">
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

      {/* Main Workspace */}
      <div className="voice-agent-workspace">
        {/* Error Banner */}
        {(errorMsg || resumeError) && (
          <div className="voice-agent-error-banner">
            <i className="fa-solid fa-triangle-exclamation"></i> {typeof (errorMsg || resumeError) === 'string' ? (errorMsg || resumeError) : extractErrorMessage(errorMsg || resumeError, 'An unexpected error occurred. Please try again.')}
            <button className="close-err-btn" onClick={() => { setErrorMsg(null); setResumeError(null); }}>×</button>
          </div>
        )}

        <div className="voice-agent-grid">
          {/* Stage Panel */}
          <div className="voice-agent-card stage-card" data-state={wsState}>
            {/* Hidden File Input for Resume */}
            <input
              type="file"
              ref={resumeInputRef}
              onChange={handleResumeFileChange}
              accept=".pdf,.docx,.doc"
              style={{ display: 'none' }}
            />

            <div className="orb-wrapper" style={{ '--level': level } }>
              <div className="orb-ring"></div>
              <div className="orb-ring"></div>
              <div className="voice-agent-orb"></div>
            </div>
            
            <div className="orb-status-section">
              <span className="voice-agent-lang-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '4px 10px', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.25)', marginBottom: '8px' }}>
                <i className="fa-solid fa-language"></i> English Only (Spoken Voice Agent requires English)
              </span>
              <h3 className="orb-status-title">{status.title}</h3>
              <p className="orb-status-sub">{status.sub}</p>
            </div>

            <div className="job-description-card">
              <div className="job-description-header">
                <label htmlFor="voice-agent-job-description">
                  <i className="fa-solid fa-briefcase"></i> Job Description
                </label>
                <span>{jobDescription.length}/10000</span>
              </div>
              <textarea
                id="voice-agent-job-description"
                className="job-description-input"
                value={jobDescription}
                onChange={(event) => {
                  const value = event.target.value;
                  setJobDescription(value);
                  jobDescriptionRef.current = value;
                }}
                placeholder="Paste the role, responsibilities, and required skills here..."
                maxLength={10000}
                disabled={connected || wsState === 'connecting'}
                rows={5}
              />
              <p className="job-description-help">
                {connected ? 'This context is locked for the current interview.' : 'Optional. Questions will be tailored to this role when you start.'}
              </p>
            </div>

            {/* Resume Upload / Badge Section */}
            {!resumeData ? (
              <div
                className={`resume-upload-card ${isDraggingResume ? 'dragging' : ''} ${isUploadingResume ? 'loading' : ''}`}
                onClick={() => !isUploadingResume && resumeInputRef.current?.click()}
                onDragOver={handleResumeDragOver}
                onDragLeave={handleResumeDragLeave}
                onDrop={handleResumeDrop}
                role="button"
                tabIndex={0}
              >
                {isUploadingResume ? (
                  <div className="resume-upload-loading">
                    <i className="fa-solid fa-circle-notch fa-spin"></i>
                    <span>Analyzing resume & extracting skills...</span>
                  </div>
                ) : (
                  <div className="resume-upload-content">
                    <div className="resume-icon-circle">
                      <i className="fa-solid fa-cloud-arrow-up"></i>
                    </div>
                    <div className="resume-text-group">
                      <span className="resume-title">Upload Resume (Optional)</span>
                      <span className="resume-subtitle">PDF, DOCX, or DOC for personalized questions</span>
                    </div>
                    <button type="button" className="resume-browse-btn">
                      <i className="fa-solid fa-file-arrow-up"></i> Browse
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="resume-badge-card">
                <div className="resume-badge-header">
                  <div className="resume-file-info">
                    <div className="resume-badge-icon">
                      <i className="fa-solid fa-file-invoice"></i>
                    </div>
                    <div className="resume-name-meta">
                      <div className="resume-file-title" title={resumeData.fileName}>
                        {resumeData.fileName}
                      </div>
                      <div className="resume-candidate-meta">
                        {resumeData.preview?.name && <strong>{resumeData.preview.name}</strong>}
                        {resumeData.preview?.role && <span> · {resumeData.preview.role}</span>}
                        <span> · {Math.round((resumeData.fileSize || 0) / 1024)} KB</span>
                      </div>
                    </div>
                  </div>

                  {!connected && (
                    <div className="resume-actions">
                      <button
                        type="button"
                        className="resume-reupload-btn"
                        onClick={() => resumeInputRef.current?.click()}
                        title="Upload a different resume"
                      >
                        <i className="fa-solid fa-arrows-rotate"></i> Change
                      </button>
                      <button
                        type="button"
                        className="resume-clear-btn"
                        onClick={handleClearResume}
                        title="Remove resume"
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                  )}
                </div>

                {resumeData.preview?.skills && resumeData.preview.skills.length > 0 && (
                  <div className="resume-skills-section">
                    <span className="skills-label">
                      <i className="fa-solid fa-tags"></i> Detected Skills:
                    </span>
                    <div className="resume-skills-pills">
                      {resumeData.preview.skills.map((skill, idx) => (
                        <span key={idx} className="skill-pill">{skill}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="orb-controls-section">
              <button 
                id="btnVoiceConnect" 
                className={`voice-action-main-btn ${connected ? 'live' : ''}`} 
                onClick={handleStartInterview}
                disabled={!connected && (isUploadingResume || !!resumeError)}
                title={connected ? "End the current interview session" : isUploadingResume ? "Uploading resume..." : resumeError ? "Upload a valid resume to start" : "Start your interview"}
              >
                {wsState === 'connecting' ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin"></i> Connecting...
                  </>
                ) : connected ? (
                  <>
                    <i className="fa-solid fa-square"></i> End Agent
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-play"></i> Start Agent
                  </>
                )}
              </button>

              {connected && (
                <button 
                  id="btnVoicePause" 
                  className={`voice-action-pause-btn ${isPaused ? 'paused' : ''}`}
                  onClick={handlePauseToggle}
                  title={isPaused ? "Resume the interview" : "Pause the interview"}
                >
                  <i className={`fa-solid ${isPaused ? 'fa-play' : 'fa-pause'}`}></i> {isPaused ? 'Resume' : 'Pause'}
                </button>
              )}
              
              <button 
                id="btnVoiceMute" 
                className={`voice-action-mute-btn ${muted ? 'muted' : ''}`} 
                disabled={!connected} 
                onClick={handleMuteToggle}
              >
                <i className={`fa-solid ${muted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i> {muted ? 'Unmute' : 'Mute'}
              </button>
            </div>

            <div className="orb-hints-section">
              <p>Try saying:</p>
              <ul>
                {resumeData?.preview?.suggestedQuestions && resumeData.preview.suggestedQuestions.length > 0 ? (
                  resumeData.preview.suggestedQuestions.map((q, idx) => (
                    <li key={idx}>{q}</li>
                  ))
                ) : (
                  <>
                    <li>"What is Python and what are its key features?"</li>
                    <li>"What is Java and how does the JVM work?"</li>
                    <li>"Explain object-oriented programming concepts"</li>
                    <li>"Ask me a data structures interview question"</li>
                  </>
                )}
              </ul>
            </div>
          </div>

          {/* Transcript Panel */}
          <div className="voice-agent-card transcript-card">
            <div className="transcript-header-row">
              <span className="title"><i className="fa-solid fa-comments"></i> Conversation Logs</span>
              {latency && <span className="latency-badge"><i className="fa-solid fa-bolt"></i> {latency} ms</span>}
            </div>

            <div className="transcript-messages-container">
              {messages.length === 0 ? (
                <div className="transcript-empty-view">
                  <div className="empty-icon"><i className="fa-solid fa-message"></i></div>
                  <h4>No conversation yet</h4>
                  <p>Speak naturally — you can even interrupt the agent mid-answer.</p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className={`chat-message-bubble ${msg.role}`}>
                    <span className="msg-sender-label">
                      {msg.role === 'user' ? 'You' : 'Interview Expert'}
                    </span>
                    <p className="msg-text-content">{msg.text}</p>
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        </div>
      </div>

      <footer className="voice-agent-footer">
        Powered by Deepgram Voice Agent (Flux STT · Gemini · Aura-2 TTS).
      </footer>
    </div>
  );
}
