import React, { useState, useEffect, useRef } from 'react';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

function cleanAnswerText(text, activeMode) {
  if (!text) return '';
  
  // 0. If not in example mode, filter out paragraphs that start with "For example" and contain code keywords
  if (activeMode !== 'example') {
    const paragraphs = text.split(/\n\s*\n/);
    const cleanedParagraphs = [];
    for (const para of paragraphs) {
      const lowerPara = para.toLowerCase();
      const hasForExample = lowerPara.includes('for example');
      const hasCodeKeywords = lowerPara.includes('word =') || lowerPara.includes('input(') || lowerPara.includes('print(') || lowerPara.includes('if ') || lowerPara.includes('else:');
      if (hasForExample && hasCodeKeywords) {
        continue;
      }
      cleanedParagraphs.push(para);
    }
    text = cleanedParagraphs.join('\n\n');
  }

  // 1. Remove duplicate code blocks first
  const codeBlockRegex = /```[\s\S]*?```/g;
  const matches = [...text.matchAll(codeBlockRegex)];
  
  if (matches.length > 1) {
    let cleanedText = text;
    for (let i = matches.length - 1; i >= 1; i--) {
      const match = matches[i];
      const startIndex = match.index;
      const length = match[0].length;
      
      let prefixLength = 0;
      const precedingText = cleanedText.substring(0, startIndex);
      const introPatterns = [
        /\s*The original code is:\s*$/i,
        /\s*Here is the original code:\s*$/i,
        /\s*Original code:\s*$/i,
        /\s*The code is:\s*$/i
      ];
      for (const pattern of introPatterns) {
        const matchIntro = precedingText.match(pattern);
        if (matchIntro) {
          prefixLength = matchIntro[0].length;
          break;
        }
      }
      cleanedText = cleanedText.substring(0, startIndex - prefixLength) + cleanedText.substring(startIndex + length);
    }
    text = cleanedText;
  }

  // 2. If the text already has sequential numbering (starts with 1.), just return it
  if (/^\s*1\s*[\.\)]/m.test(text)) {
    return text;
  }

  // 3. Fallback: if the text lacks numbering and is the Python/Java comparison, structure it
  const lowerText = text.toLowerCase();
  if (lowerText.includes('python') && lowerText.includes('java')) {
    const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    let currentState = 'python';
    const groups = { python: [], java: [], difference: [], code: [] };
    
    for (const block of blocks) {
      const lower = block.toLowerCase().slice(0, 120);
      
      if (currentState === 'python' && (lower.includes('java') || lower.includes('object-oriented'))) {
        currentState = 'java';
      }
      if (currentState === 'java' && (lower.includes('difference') || lower.includes('versus') || lower.includes('vs') || lower.includes('comparison'))) {
        currentState = 'difference';
      }
      if (currentState === 'difference' && (lower.includes('code') || lower.includes('correct') || lower.includes('```') || lower.includes('palindrome') || lower.includes('here is'))) {
        currentState = 'code';
      }
      
      groups[currentState].push(block);
    }

    const clean = (b) => b.replace(/^\s*\d+\s*[\.\:\-\)]\s*/, '').replace(/^\s*A\d*\s*[\.\:\-\)]?\s*/i, '').trim();
    
    const pythonAnswer = groups.python.map(clean).join(' ');
    const javaAnswer = groups.java.map(clean).join(' ');
    const differenceAnswer = groups.difference.map(clean).join('\n\n');
    const codeAnswer = groups.code.map(clean).join('\n\n');

    let finalOutput = '';
    let index = 1;
    if (pythonAnswer) {
      finalOutput += `${index++}. ${pythonAnswer}\n\n\n`;
    }
    if (javaAnswer) {
      finalOutput += `${index++}. ${javaAnswer}\n\n\n`;
    }
    if (differenceAnswer) {
      finalOutput += `${index++}. ${differenceAnswer}\n\n\n`;
    }
    if (codeAnswer) {
      finalOutput += `${index++}. ${codeAnswer}\n\n\n`;
    }
    return finalOutput.trim();
  }

  // 4. General fallback: if it's some other unnumbered text, number the paragraphs sequentially
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  let numberedText = '';
  let idx = 1;
  for (const para of paragraphs) {
    const cleanPara = para.replace(/^\s*\d+\s*[\.\:\-\)]\s*/, '').replace(/^\s*A\d*\s*[\.\:\-\)]?\s*/i, '').trim();
    numberedText += `${idx++}. ${cleanPara}\n\n\n`;
  }
  return numberedText.trim();
}

function classifyCaptureError(errOrMsg) {
  const msg = typeof errOrMsg === 'string' ? errOrMsg : (errOrMsg?.message || '');
  const errName = (typeof errOrMsg === 'object' && errOrMsg?.name) ? errOrMsg.name : '';
  const combined = (msg + ' ' + errName).toLowerCase();

  const isDenied = (
    errName === 'NotAllowedError' ||
    errName === 'PermissionDeniedError' ||
    combined.includes('denied') ||
    combined.includes('permission') ||
    combined.includes('notallowed') ||
    combined.includes('not allowed') ||
    combined.includes('dismissed') ||
    combined.includes('cancelled by user') ||
    combined.includes('canceled by user') ||
    combined.includes('user cancelled') ||
    combined.includes('user canceled')
  );

  const isTimeout = combined.includes('timeout') || combined.includes('timed out');
  const isTerminated = combined.includes('stream ended') || combined.includes('ended unexpectedly') || combined.includes('terminated');
  const isNotSupported = combined.includes('not supported') || combined.includes('not implemented') || errName === 'NotFoundError';

  if (isDenied) {
    return {
      type: 'permission_denied',
      title: 'Screen Capture Permission Denied',
      message: 'Screen capture permission was denied or dismissed. Please allow screen recording in your system settings or browser.'
    };
  }
  if (isTimeout) {
    return {
      type: 'timeout',
      title: 'Capture Timed Out',
      message: 'Screen capture initialization timed out after 15 seconds. Please ensure screen permissions are granted and try again.'
    };
  }
  if (isTerminated) {
    return {
      type: 'stream_ended',
      title: 'Capture Stream Ended',
      message: 'The screen capture stream was stopped or disconnected unexpectedly.'
    };
  }
  if (isNotSupported) {
    return {
      type: 'not_supported',
      title: 'Screen Capture Unsupported',
      message: 'Screen capture API is not available or supported in this environment.'
    };
  }

  return {
    type: 'capture_failed',
    title: 'Screen Capture Failed',
    message: msg || 'An unexpected error occurred while capturing the screen. Please try again.'
  };
}

export default function TopBar({ onClose, onMinimize }) {
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [timerText, setTimerText] = useState('00:00:00');
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [captureMode, setCaptureMode] = useState('normal');
  const [isAnalyseScreen, setIsAnalyseScreen] = useState(false);
  const [isError, setIsError] = useState(false);

  // Lifecycle & Cancellation Guards
  const topbarGenRef = useRef(0);
  const isMountedRef = useRef(true);
  const captureTimeoutRef = useRef(null);
  const isCapturingRef = useRef(false);
  const activeStreamRef = useRef(null);
  const captureModeRef = useRef('normal');
  captureModeRef.current = captureMode;

  const clearPendingTimeout = () => {
    if (captureTimeoutRef.current) {
      clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = null;
    }
  };

  const stopActiveStream = () => {
    if (activeStreamRef.current) {
      try {
        activeStreamRef.current.getTracks().forEach(track => {
          try {
            track.onended = null;
            track.stop();
          } catch (e) {
            console.warn('[TopBar] Error stopping track:', e);
          }
        });
      } catch (e) {
        console.warn('[TopBar] Error stopping active stream:', e);
      }
      activeStreamRef.current = null;
    }
  };

  const cancelPendingCapture = (reason, errorDetails = null) => {
    topbarGenRef.current++;
    clearPendingTimeout();
    stopActiveStream();
    isCapturingRef.current = false;

    if (!isMountedRef.current) return;

    setIsGenerating(false);

    if (errorDetails) {
      const { title, message } = errorDetails;
      setCurrentQuestion(title);
      setAnswer(message);
      setIsError(true);
      expandPanel();
    }
  };

  const handleMinimize = () => {
    if (onMinimize) onMinimize();
    else ipcRenderer?.send('window-minimize');
  };

  const handleExit = () => {
    topbarGenRef.current++;
    clearPendingTimeout();
    stopActiveStream();
    isCapturingRef.current = false;
    if (onClose) onClose();
    else ipcRenderer?.send('window-close');
  };

  const toggleListening = () => {
    if (ipcRenderer) {
      ipcRenderer.send('topbar-toggle-listening');
    } else {
      setIsListening(prev => !prev);
    }
  };

  const handleClear = () => {
    topbarGenRef.current++;
    clearPendingTimeout();
    stopActiveStream();
    isCapturingRef.current = false;
    setCurrentQuestion('');
    setAnswer('');
    setIsGenerating(false);
    setIsAnalyseScreen(false);
    setIsError(false);
    collapsePanel();
  };

  const collapsePanel = () => {
    setPanelExpanded(false);
    if (ipcRenderer) ipcRenderer.send('topbar-resize-request', 'topbar-idle');
  };

  const expandPanel = () => {
    setPanelExpanded(true);
    if (ipcRenderer) ipcRenderer.send('topbar-resize-request', 'topbar-active');
  };

  const startCaptureFlow = async (mode) => {
    if (isGenerating || isCapturingRef.current) return;

    const currentGen = ++topbarGenRef.current;
    clearPendingTimeout();
    stopActiveStream();

    setIsGenerating(true);
    setIsError(false);
    isCapturingRef.current = true;
    setCaptureMode(mode);
    setIsAnalyseScreen(mode === 'improvise');
    setCurrentQuestion(mode === 'improvise' ? 'Analyzing screen...' : 'Capturing question from screen...');
    setAnswer('');
    expandPanel();

    // 15-second capture initialization timeout
    captureTimeoutRef.current = setTimeout(() => {
      if (topbarGenRef.current !== currentGen || !isMountedRef.current) return;
      console.warn(`[TopBar] Screen capture timed out (gen=${currentGen})`);
      const err = classifyCaptureError('Screen capture operation timed out after 15 seconds.');
      cancelPendingCapture('timeout', err);
    }, 15000);

    // Electron mode
    if (ipcRenderer) {
      try {
        ipcRenderer.send('topbar-capture-request', mode);
      } catch (err) {
        if (topbarGenRef.current === currentGen && isMountedRef.current) {
          const errorDetails = classifyCaptureError(err);
          cancelPendingCapture('send-failed', errorDetails);
        }
      }
      return;
    }

    // Browser mode fallback
    if (!navigator?.mediaDevices?.getDisplayMedia) {
      const errorDetails = classifyCaptureError({
        name: 'NotSupportedError',
        message: 'Screen capture is not supported in this browser environment. Please use Google Chrome, Edge, or the desktop app.'
      });
      cancelPendingCapture('not-supported', errorDetails);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      
      // Generation guard check after user responds to browser picker
      if (topbarGenRef.current !== currentGen || !isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      activeStreamRef.current = stream;

      // Detect unexpected stream termination
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          if (topbarGenRef.current === currentGen && isMountedRef.current && isCapturingRef.current) {
            const errorDetails = classifyCaptureError('Screen capture stream ended unexpectedly before completion.');
            cancelPendingCapture('stream-ended', errorDetails);
          }
        };
      }

      clearPendingTimeout();
      isCapturingRef.current = false;
      setIsGenerating(false);
      setCurrentQuestion('Screen Capture Connected (Browser Mode)');
      setAnswer('Screen display stream connected successfully.\n\nNote: Automated background OCR and AI answering requires the desktop application runtime.');
      stopActiveStream();
    } catch (err) {
      if (topbarGenRef.current !== currentGen || !isMountedRef.current) return;
      const errorDetails = classifyCaptureError(err);
      cancelPendingCapture('browser-capture-error', errorDetails);
    }
  };

  const handleCapture = () => {
    startCaptureFlow('normal');
  };

  const handleAnalyse = () => {
    startCaptureFlow('improvise');
  };

  const handleAction = (mode) => {
    if (!currentQuestion || isGenerating || isCapturingRef.current) return;
    const currentGen = ++topbarGenRef.current;
    clearPendingTimeout();
    stopActiveStream();

    setIsGenerating(true);
    setIsError(false);
    setAnswer('');
    expandPanel();

    captureTimeoutRef.current = setTimeout(() => {
      if (topbarGenRef.current !== currentGen || !isMountedRef.current) return;
      console.warn(`[TopBar] Answer generation timed out (gen=${currentGen})`);
      cancelPendingCapture('answer-timeout', {
        type: 'timeout',
        title: 'Generation Timed Out',
        message: 'AI answer generation timed out. Please check your network connection and try again.'
      });
    }, 20000);

    if (ipcRenderer) {
      try {
        ipcRenderer.send('topbar-generate-answer', currentQuestion, mode);
      } catch (err) {
        cancelPendingCapture('action-error', classifyCaptureError(err));
      }
    } else {
      clearPendingTimeout();
      setIsGenerating(false);
      setAnswer(`Simulated ${mode} response for: "${currentQuestion}" (Desktop app required for live AI server streaming).`);
    }
  };

  // Component unmount cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      topbarGenRef.current++;
      clearPendingTimeout();
      stopActiveStream();
      isCapturingRef.current = false;
    };
  }, []);

  // Wire IPC listeners
  useEffect(() => {
    if (!ipcRenderer) return;

    const onCapturedQuestion = (_, questionText) => {
      if (!isMountedRef.current) return;
      clearPendingTimeout();
      isCapturingRef.current = false;

      if (questionText && questionText.trim()) {
        setCurrentQuestion(questionText.trim());
        setAnswer(''); // Loader triggers
        setIsError(false);
        expandPanel();
        if (ipcRenderer) ipcRenderer.send('topbar-generate-answer', questionText.trim(), captureModeRef.current);
      } else {
        setIsGenerating(false);
        setIsError(false);
        setCurrentQuestion('No active question found.');
        setAnswer('Please make sure there is visible text or a question on the background screen.');
        expandPanel();
      }
    };

    const onCaptureError = (_, errData) => {
      if (!isMountedRef.current) return;
      console.warn('[TopBar] Received capture-error:', errData);
      const errorDetails = classifyCaptureError(errData);
      cancelPendingCapture('ipc-capture-error', errorDetails);
    };

    const onTopbarChunk = (_, data) => {
      if (!isMountedRef.current) return;
      clearPendingTimeout();
      if (data?.isStreaming) {
        setAnswer(data.answer || '');
      } else {
        setIsGenerating(false);
        isCapturingRef.current = false;
        if (data?.answer) {
          setAnswer(data.answer);
        }
      }
    };

    const onDoCapture = (_, mode) => {
      if (!isMountedRef.current) return;
      setCaptureMode(mode || 'normal');
    };

    const onCaptureStarted = () => {
      if (!isMountedRef.current) return;
      setIsListening(true);
    };

    const onCaptureStopped = () => {
      if (!isMountedRef.current) return;
      setIsListening(false);
    };

    const onAiAnswerStart = (_, data) => {
      if (!isMountedRef.current) return;
      clearPendingTimeout();
      setCurrentQuestion(data?.question || '');
      setAnswer('');
      setIsError(false);
      expandPanel();
    };

    const onAiAnswer = (_, data) => {
      if (!isMountedRef.current) return;
      if (data?.panel === 'a') {
        clearPendingTimeout();
        if (data?.isStreaming) {
          setAnswer(data.answer || '');
        } else {
          setIsGenerating(false);
          isCapturingRef.current = false;
          if (data?.answer) {
            setAnswer(data.answer);
          }
        }
      }
    };

    const onTimerUpdate = (_, val) => {
      if (!isMountedRef.current) return;
      setTimerText(val || '00:00:00');
    };

    ipcRenderer.on('captured-question', onCapturedQuestion);
    ipcRenderer.on('capture-error', onCaptureError);
    ipcRenderer.on('topbar-answer-chunk', onTopbarChunk);
    ipcRenderer.on('do-capture', onDoCapture);
    ipcRenderer.on('capture-started', onCaptureStarted);
    ipcRenderer.on('capture-stopped', onCaptureStopped);
    ipcRenderer.on('ai-answer-start', onAiAnswerStart);
    ipcRenderer.on('ai-answer', onAiAnswer);
    ipcRenderer.on('topbar-timer-update', onTimerUpdate);

    return () => {
      ipcRenderer.removeListener('captured-question', onCapturedQuestion);
      ipcRenderer.removeListener('capture-error', onCaptureError);
      ipcRenderer.removeListener('topbar-answer-chunk', onTopbarChunk);
      ipcRenderer.removeListener('do-capture', onDoCapture);
      ipcRenderer.removeListener('capture-started', onCaptureStarted);
      ipcRenderer.removeListener('capture-stopped', onCaptureStopped);
      ipcRenderer.removeListener('ai-answer-start', onAiAnswerStart);
      ipcRenderer.removeListener('ai-answer', onAiAnswer);
      ipcRenderer.removeListener('topbar-timer-update', onTimerUpdate);
    };
  }, []);

  return (
    <div className="topbar-window-root">
      {/* Horizontal Strip */}
      <div className="topbar-strip">
        <div className="brand-section">
          <span className="brand-name">Interview Bot</span>
          <button className="btn-hide" onClick={handleMinimize}>Hide</button>
        </div>

        <div className="actions-section">
          <button className="action-btn" onClick={handleCapture} disabled={isGenerating}>
            Answer Question
          </button>
          <button className="action-btn" onClick={handleAnalyse} disabled={isGenerating}>
            Analyse Screen
          </button>
        </div>

        <div className="status-section">
          <div className="listening-status">
            <div className={`status-dot ${isListening ? 'active' : ''}`}></div>
            <span>{isListening ? 'Listening' : 'Stopped'}</span>
          </div>
          <span className="timer-val">{timerText}</span>
          <button className="btn-listener-toggle" onClick={toggleListening}>
            {isListening ? 'Stop Listening' : 'Start Listening'}
          </button>
          <button className="btn-exit" onClick={handleExit}>Exit</button>
          <button className="btn-clear" onClick={handleClear}>Clear</button>
        </div>
      </div>

      {/* Expanded drop down panel */}
      {panelExpanded && (
        <div className="answer-panel">
          <button className="panel-close-btn" onClick={collapsePanel}>×</button>
          
          <div className="label-header">💬 Summarized question:</div>
          <div className="question-content">{currentQuestion || 'Waiting for question...'}</div>
          
          <div className="label-header" style={{ marginTop: '4px' }}>
            {isError ? '⚠️ Error Details:' : '⭐ Answer:'}
          </div>
          <div className="answer-content" style={{ fontSize: '14px', color: isError ? '#fca5a5' : '#e2e8f0' }}>
            {isGenerating && !answer ? (
              <div className="ai-loader">
                <div className="ai-loader-dots"><span></span><span></span><span></span></div> 
                Thinking...
              </div>
            ) : (
              answer ? (isError ? answer : cleanAnswerText(answer, captureMode)) : 'Waiting for answer...'
            )}
          </div>

          {isAnalyseScreen && answer && !isGenerating && (
            <div className="topbar-analysis-actions">
              <button 
                className="btn btn-improvise" 
                onClick={() => handleAction('improvise')}
                disabled={isGenerating}
                type="button"
              >
                ✨ Improvise
              </button>
              <button 
                className="btn btn-example" 
                onClick={() => handleAction('example')}
                disabled={isGenerating}
                type="button"
              >
                💡 Example
              </button>
              <button 
                className="btn btn-clear-analysis" 
                onClick={handleClear}
                disabled={isGenerating}
                type="button"
              >
                🗑️ Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
