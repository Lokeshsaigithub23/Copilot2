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

function classifyTeleprompterError(errOrMsg) {
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
  const isConnectionFailed = combined.includes('connection failed') || combined.includes('websocket') || combined.includes('failed to fetch') || combined.includes('networkerror');

  if (isDenied) {
    return {
      type: 'permission_denied',
      title: '⚠️ Capture Permission Denied',
      message: 'Screen or microphone capture permission was denied or dismissed. Please enable permissions in your browser or operating system settings and try again.'
    };
  }
  if (isTimeout) {
    return {
      type: 'timeout',
      title: '⚠️ Capture Timed Out',
      message: 'Capture initialization timed out after 15 seconds. Please ensure screen permissions are granted and try again.'
    };
  }
  if (isTerminated) {
    return {
      type: 'stream_ended',
      title: '⚠️ Stream Ended',
      message: 'The media capture stream was disconnected or stopped unexpectedly.'
    };
  }
  if (isNotSupported) {
    return {
      type: 'not_supported',
      title: '⚠️ Capture Unsupported',
      message: 'Screen or audio capture API is not available or supported in this browser environment.'
    };
  }
  if (isConnectionFailed) {
    return {
      type: 'connection_failed',
      title: '⚠️ Connection Error',
      message: 'Network or audio connection failed. Please check your connection and try again.'
    };
  }

  return {
    type: 'capture_failed',
    title: '⚠️ Capture Failed',
    message: msg || 'An unexpected error occurred while capturing. Please try again.'
  };
}

export default function Teleprompter({ onClose, onMinimize }) {
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [customQuestion, setCustomQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [activeMode, setActiveMode] = useState('normal'); // 'normal', 'improvise', 'example'
  const [isError, setIsError] = useState(false);

  // Lifecycle & Cancellation Guards
  const teleprompterGenRef = useRef(0);
  const isMountedRef = useRef(true);
  const captureTimeoutRef = useRef(null);
  const answerTimeoutRef = useRef(null);
  const isStartingRef = useRef(false);
  const activeStreamRef = useRef(null);
  const activeWsRef = useRef(null);
  const activeModeRef = useRef('normal');
  activeModeRef.current = activeMode;

  const outputPanelRef = useRef(null);
  const isAtBottomRef = useRef(false);

  const clearTimeouts = () => {
    if (captureTimeoutRef.current) {
      clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = null;
    }
    if (answerTimeoutRef.current) {
      clearTimeout(answerTimeoutRef.current);
      answerTimeoutRef.current = null;
    }
  };

  const cleanupConnectionsAndStreams = () => {
    // Stop all tracks on active stream
    if (activeStreamRef.current) {
      try {
        activeStreamRef.current.getTracks().forEach(track => {
          try {
            track.onended = null;
            track.stop();
          } catch (e) {
            console.warn('[Teleprompter] Error stopping track:', e);
          }
        });
      } catch (e) {
        console.warn('[Teleprompter] Error cleaning up stream:', e);
      }
      activeStreamRef.current = null;
    }

    // Close any active WebSocket
    if (activeWsRef.current) {
      try {
        activeWsRef.current.onopen = null;
        activeWsRef.current.onmessage = null;
        activeWsRef.current.onerror = null;
        activeWsRef.current.onclose = null;
        if (activeWsRef.current.readyState === WebSocket.OPEN || activeWsRef.current.readyState === WebSocket.CONNECTING) {
          activeWsRef.current.close(1000);
        }
      } catch (e) {
        console.warn('[Teleprompter] Error closing websocket:', e);
      }
      activeWsRef.current = null;
    }
  };

  const cancelPendingOperations = (reason, errorDetails = null) => {
    teleprompterGenRef.current++;
    clearTimeouts();
    cleanupConnectionsAndStreams();
    isStartingRef.current = false;

    if (!isMountedRef.current) return;

    setIsCapturing(false);
    setIsGenerating(false);

    if (errorDetails) {
      const { title, message } = errorDetails;
      setCurrentQuestion(title);
      setAnswer(message);
      setIsError(true);
      isAtBottomRef.current = false;
    }
  };

  const logRenderer = (msg) => {
    ipcRenderer?.send('log-renderer-error', {
      message: `[teleprompter-renderer] ${msg}`,
      stack: '',
      details: { isGenerating, currentQuestion }
    });
  };

  const getQuestionNumber = () => {
    if (!currentQuestion) return null;
    const match = currentQuestion.match(/^\s*(\d+)\s*\./);
    return match ? match[1] : null;
  };

  const handleScroll = (e) => {
    const el = e.target;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 25;
    isAtBottomRef.current = isAtBottom;
  };

  const handleMinimize = () => {
    if (onMinimize) onMinimize();
    else ipcRenderer?.send('window-minimize');
  };
  const handleClose = () => {
    cancelPendingOperations('close');
    if (onClose) onClose();
    else ipcRenderer?.send('window-close');
  };

  const updateButtonStates = () => {
    // Buttons are disabled/enabled based on isGenerating and presence of currentQuestion
  };

  const handleClear = () => {
    cancelPendingOperations('clear');
    setCurrentQuestion('');
    setAnswer('');
    setIsError(false);
  };

  const startAnswerGeneration = (qText, mode = 'normal') => {
    logRenderer(`startAnswerGeneration called. qText="${qText}", mode="${mode}", isGenerating=${isGenerating}`);
    if (!qText || !qText.trim()) return;

    const currentGen = ++teleprompterGenRef.current;
    clearTimeouts();
    cleanupConnectionsAndStreams();
    isStartingRef.current = false;

    setIsCapturing(false);
    setIsGenerating(true);
    setIsError(false);
    setCurrentQuestion(qText.trim());
    setActiveMode(mode);
    setAnswer(''); // Show loading initially
    isAtBottomRef.current = false;

    // Arm answer generation timeout (20s)
    answerTimeoutRef.current = setTimeout(() => {
      if (teleprompterGenRef.current !== currentGen || !isMountedRef.current) return;
      console.warn(`[Teleprompter] Answer generation timed out (gen=${currentGen})`);
      cancelPendingOperations('answer-timeout', {
        type: 'timeout',
        title: '⚠️ Answer Timed Out',
        message: 'AI answer generation timed out. Please check your network connection and try again.'
      });
    }, 20000);

    if (ipcRenderer) {
      logRenderer('Sending teleprompter-generate-answer');
      try {
        ipcRenderer.send('teleprompter-generate-answer', qText.trim(), mode);
      } catch (err) {
        if (teleprompterGenRef.current === currentGen && isMountedRef.current) {
          cancelPendingOperations('send-error', classifyTeleprompterError(err));
        }
      }
    } else {
      // Browser mode simulation
      clearTimeouts();
      setIsGenerating(false);
      setAnswer(`Simulated ${mode} response for: "${qText.trim()}" (Desktop runtime required for live AI server streaming).`);
    }
  };

  const handleCapture = async () => {
    logRenderer(`handleCapture clicked. isGenerating=${isGenerating}, isCapturing=${isCapturing}`);
    // A new start must invalidate any previous start/stop/capture operation
    const currentGen = ++teleprompterGenRef.current;
    clearTimeouts();
    cleanupConnectionsAndStreams();

    isStartingRef.current = true;
    setIsCapturing(true);
    setIsGenerating(false);
    setIsError(false);
    setCurrentQuestion('Capturing background question...');
    setAnswer('');

    // Arm 15-second capture initialization timeout
    captureTimeoutRef.current = setTimeout(() => {
      if (teleprompterGenRef.current !== currentGen || !isMountedRef.current) return;
      console.warn(`[Teleprompter] Screen capture timed out (gen=${currentGen})`);
      const err = classifyTeleprompterError('Screen capture operation timed out after 15 seconds.');
      cancelPendingOperations('timeout', err);
    }, 15000);

    // Electron mode
    if (ipcRenderer) {
      logRenderer('Sending teleprompter-capture-request');
      try {
        ipcRenderer.send('teleprompter-capture-request');
      } catch (err) {
        if (teleprompterGenRef.current === currentGen && isMountedRef.current) {
          const errorDetails = classifyTeleprompterError(err);
          cancelPendingOperations('send-failed', errorDetails);
        }
      }
      return;
    }

    // Browser mode fallback
    if (!navigator?.mediaDevices?.getDisplayMedia) {
      const errorDetails = classifyTeleprompterError({
        name: 'NotSupportedError',
        message: 'Screen capture is not supported in this browser environment. Please use Google Chrome, Edge, or the desktop app.'
      });
      cancelPendingOperations('not-supported', errorDetails);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      
      // Generation guard check after user responds to browser picker
      if (teleprompterGenRef.current !== currentGen || !isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      activeStreamRef.current = stream;

      // Detect unexpected stream termination
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          if (teleprompterGenRef.current === currentGen && isMountedRef.current && isStartingRef.current) {
            const errorDetails = classifyTeleprompterError('Screen capture stream ended unexpectedly before completion.');
            cancelPendingOperations('stream-ended', errorDetails);
          }
        };
      }

      clearTimeouts();
      isStartingRef.current = false;
      setIsCapturing(false);
      setCurrentQuestion('Screen Capture Connected (Browser Mode)');
      setAnswer('Screen display stream connected successfully.\n\nNote: Automated background OCR question extraction requires the desktop application runtime.');
      cleanupConnectionsAndStreams();
    } catch (err) {
      if (teleprompterGenRef.current !== currentGen || !isMountedRef.current) return;
      const errorDetails = classifyTeleprompterError(err);
      cancelPendingOperations('browser-capture-error', errorDetails);
    }
  };

  const handleImprovise = () => {
    if (currentQuestion && !isGenerating) {
      startAnswerGeneration(currentQuestion, 'improvise');
    }
  };

  const handleExample = () => {
    if (currentQuestion && !isGenerating) {
      startAnswerGeneration(currentQuestion, 'example');
    }
  };

  const handleManualSend = (e) => {
    if (e) e.preventDefault();
    const q = customQuestion.trim();
    if (q) {
      setCustomQuestion('');
      startAnswerGeneration(q, 'normal');
    }
  };

  // Component unmount cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      teleprompterGenRef.current++;
      clearTimeouts();
      cleanupConnectionsAndStreams();
      isStartingRef.current = false;
    };
  }, []);

  // Wire IPC listeners
  useEffect(() => {
    if (!ipcRenderer) {
      logRenderer('useEffect run: ipcRenderer is not available!');
      return;
    }
    logRenderer('useEffect run: registering listeners');

    const onCapturedQuestion = (_, questionText) => {
      if (!isMountedRef.current) return;
      logRenderer(`onCapturedQuestion event received: questionText="${questionText}"`);
      clearTimeouts();
      isStartingRef.current = false;
      setIsCapturing(false);

      if (questionText && questionText.trim() && questionText !== '—') {
        startAnswerGeneration(questionText, activeModeRef.current);
      } else {
        logRenderer('No valid questionText received or questionText is empty/placeholder');
        setIsGenerating(false);
        setIsError(false);
        setCurrentQuestion('No active question found');
        setAnswer('No active question found on the background screen.');
        isAtBottomRef.current = false;
      }
    };

    const onCaptureError = (_, errData) => {
      if (!isMountedRef.current) return;
      console.warn('[Teleprompter] Received capture-error:', errData);
      const errorDetails = classifyTeleprompterError(errData);
      cancelPendingOperations('ipc-capture-error', errorDetails);
    };

    const onTeleprompterChunk = (_, data) => {
      if (!isMountedRef.current) return;
      logRenderer(`onTeleprompterChunk event received: isStreaming=${data?.isStreaming}`);
      clearTimeouts();
      if (data?.isStreaming) {
        setAnswer(data.answer || '');
      } else {
        setIsGenerating(false);
        if (data?.answer) {
          setAnswer(data.answer);
        }
      }
    };

    const onAiAnswerStart = (_, data) => {
      if (!isMountedRef.current) return;
      logRenderer(`onAiAnswerStart event received: question="${data?.question}"`);
      const q = data?.question || '';
      if (q) {
        clearTimeouts();
        setCurrentQuestion(q.trim());
        setIsGenerating(true);
        setActiveMode('normal');
        setAnswer('');
        setIsError(false);
        isAtBottomRef.current = false;
      }
    };

    const onAiAnswer = (_, data) => {
      if (!isMountedRef.current) return;
      logRenderer(`onAiAnswer event received: panel=${data?.panel}, isStreaming=${data?.isStreaming}`);
      if (data?.panel === 'a') {
        clearTimeouts();
        if (data?.isStreaming) {
          setAnswer(data.answer || '');
        } else {
          setIsGenerating(false);
          if (data?.answer) {
            setAnswer(data.answer);
          }
        }
      }
    };

    ipcRenderer.on('captured-question', onCapturedQuestion);
    ipcRenderer.on('capture-error', onCaptureError);
    ipcRenderer.on('teleprompter-answer-chunk', onTeleprompterChunk);
    ipcRenderer.on('ai-answer-start', onAiAnswerStart);
    ipcRenderer.on('ai-answer', onAiAnswer);

    return () => {
      logRenderer('useEffect cleanup: removing listeners');
      ipcRenderer.removeListener('captured-question', onCapturedQuestion);
      ipcRenderer.removeListener('capture-error', onCaptureError);
      ipcRenderer.removeListener('teleprompter-answer-chunk', onTeleprompterChunk);
      ipcRenderer.removeListener('ai-answer-start', onAiAnswerStart);
      ipcRenderer.removeListener('ai-answer', onAiAnswer);
    };
  }, []);

  // Auto-scroll output panel to bottom when answer changes
  useEffect(() => {
    if (outputPanelRef.current && isAtBottomRef.current) {
      outputPanelRef.current.scrollTop = outputPanelRef.current.scrollHeight;
    }
  }, [answer, currentQuestion]);

  return (
    <div className="teleprompter-window-root">
      <header className="header">
        <div className="header-title">✧ Teleprompter &amp; Notepad</div>
        <div className="window-controls">
          <button className="win-btn" onClick={handleMinimize} title="Minimize">—</button>
          <button className="win-btn win-btn-close" onClick={handleClose} title="Close">×</button>
        </div>
      </header>

      <main className="content">
        <div className="output-panel" ref={outputPanelRef} onScroll={handleScroll}>
          {!currentQuestion && !answer ? (
            <div className="output-placeholder">Type a question below or click "Capture Background Question" to begin.</div>
          ) : (
            <>
              {currentQuestion && (
                <div 
                  className={`output-question ${isError ? 'error-question' : ''}`}
                  style={isError ? { borderLeftColor: '#ef4444', color: '#f87171' } : {}}
                >
                  {isError ? '' : (activeMode === 'improvise' ? '✨ Improvising: ' : (activeMode === 'example' ? '💡 Example: ' : 'Q: '))}
                  {currentQuestion}
                </div>
              )}
              <div className="output-answer" style={{ fontSize: '14px', color: isError ? '#fca5a5' : '#ffffff' }}>
                {isGenerating && !answer ? (
                  <div className="ai-loader">
                    <div className="ai-loader-dots"><span></span><span></span><span></span></div> 
                    Thinking...
                  </div>
                ) : (
                  answer ? (isError ? answer : cleanAnswerText(answer, activeMode)) : ''
                )}
              </div>
            </>
          )}
        </div>

        <div className="controls-row">
          <button className="btn btn-capture" onClick={handleCapture} disabled={isGenerating || isCapturing}>
            {isCapturing ? '📥 Capturing...' : '📥 Capture Background Question'}
          </button>
          <button className="btn btn-clear" onClick={handleClear}>Clear</button>
        </div>

        <div className="controls-row" style={{ marginTop: '-2px' }}>
          <button className="btn btn-improvise" onClick={handleImprovise} disabled={isGenerating || !currentQuestion}>
            ✨ Improvise
          </button>
          <button className="btn btn-example" onClick={handleExample} disabled={isGenerating || !currentQuestion}>
            💡 Example
          </button>
        </div>
      </main>

      <footer className="footer">
        <form onSubmit={handleManualSend} style={{ display: 'flex', width: '100%', gap: '8px' }}>
          <input
            type="text"
            className="input-box"
            placeholder="Type custom question here..."
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
          />
          <button className="btn btn-send" type="submit" disabled={isGenerating}>Ask AI</button>
        </form>
      </footer>
    </div>
  );
}
