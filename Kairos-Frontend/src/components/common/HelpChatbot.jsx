import { useState, useRef, useEffect, useCallback } from "react";
import "./HelpChatbot.css";

// ─── Conversation Flow ────────────────────────────────────────────────────────
const FLOW = {
  start: {
    bot: "👋 Hi! I am your Interview Copilot assistant.\n\nWhat would you like help with?",
    options: [
      { label: "🎙️ AI Copilot",        next: "copilot_menu" },
      { label: "📝 Notetaker",          next: "notetaker_menu" },
      { label: "🤖 Voice Agent",        next: "voice_menu" },
      { label: "📁 Upload & Analysis",  next: "upload_menu" },
      { label: "📊 Dashboard",          next: "dashboard_menu" },
      { label: "❓ Troubleshooting",    next: "trouble_menu" },
    ],
  },

  // ── AI Copilot ──────────────────────────────────────────────────────────────
  copilot_menu: {
    bot: "🎙️ **AI Copilot** gives you real-time AI-generated answers during your live interview.\n\nWhat do you want to know?",
    options: [
      { label: "How to start AI Copilot?",     next: "copilot_start" },
      { label: "Panel A vs Panel B?",          next: "copilot_panels" },
      { label: "Auto question detection?",     next: "copilot_detection" },
      { label: "Use with Zoom / Meet?",        next: "copilot_zoom" },
      { label: "No answers generating?",       next: "copilot_no_answer" },
      { label: "🏠 Main Menu",                 next: "start" },
    ],
  },
  copilot_start: {
    bot: "✅ **How to start AI Copilot:**\n\n1️⃣ Click \"AI Copilot\" from the nav bar\n2️⃣ Select audio source — Interviewer Mic or System Audio\n3️⃣ Choose your preferred language\n4️⃣ Click **Start Listening**\n5️⃣ AI answers stream automatically when a question is detected\n6️⃣ Click **Stop** when done\n\n💡 Keep the browser tab active during the interview.",
    options: [
      { label: "🚀 Open AI Copilot now", next: "nav_overlay" },
      { label: "← Back",                next: "copilot_menu" },
      { label: "🏠 Main Menu",          next: "start" },
    ],
  },
  copilot_panels: {
    bot: "📊 **Panel A vs Panel B:**\n\n• **Panel A** — Deep & Comprehensive\nDetailed thorough answer. Best for complex technical questions.\n\n• **Panel B** — Short & Concise\nCrisp 3–4 sentence answer with example. Best for quick replies.\n\n💡 Both panels generate simultaneously — you pick which to use!",
    options: [
      { label: "← Back",       next: "copilot_menu" },
      { label: "🏠 Main Menu", next: "start" },
    ],
  },
  copilot_detection: {
    bot: "🧠 **Auto Question Detection:**\n\nThe system uses NLP to detect real interview questions.\n\n✅ Detects: \"Tell me about yourself\", \"What is polymorphism?\"\n❌ Ignores: \"okay\", \"I see\", \"hmm\", \"sure\"\n\nNo button press needed — fully automatic!",
    options: [
      { label: "← Back",       next: "copilot_menu" },
      { label: "🏠 Main Menu", next: "start" },
    ],
  },
  copilot_zoom: {
    bot: "🎥 **Using AI Copilot with Zoom / Meet / Teams:**\n\n1️⃣ Select **System Audio** as the audio source\n2️⃣ Windows: Enable \"Stereo Mix\" in Sound Settings → Recording\n3️⃣ Mac: Use **BlackHole** or **Loopback** virtual audio driver\n\n💡 The interviewer cannot see or hear the AI Copilot.",
    options: [
      { label: "← Back",       next: "copilot_menu" },
      { label: "🏠 Main Menu", next: "start" },
    ],
  },
  copilot_no_answer: {
    bot: "🔧 **No answers generating? Try:**\n\n✅ Check mic permission in browser (lock icon in address bar)\n✅ Verify correct audio source is selected\n✅ Speak clearly — questions must be complete sentences\n✅ Keep the browser tab active and in focus\n✅ Refresh page and restart the session",
    options: [
      { label: "← Back",       next: "copilot_menu" },
      { label: "🏠 Main Menu", next: "start" },
    ],
  },

  // ── Notetaker ───────────────────────────────────────────────────────────────
  notetaker_menu: {
    bot: "📝 **Notetaker** records meetings, shows a live transcript, and generates an AI summary — even in two languages!\n\nWhat do you want to know?",
    options: [
      { label: "How to record a session?",        next: "notetaker_record" },
      { label: "Bilingual / dual language notes?", next: "notetaker_bilingual" },
      { label: "Personal vs Meeting Mode?",        next: "notetaker_modes" },
      { label: "How to export notes?",             next: "notetaker_export" },
      { label: "Transcript not appearing?",        next: "notetaker_issue" },
      { label: "🏠 Main Menu",                     next: "start" },
    ],
  },
  notetaker_record: {
    bot: "✅ **How to record a session:**\n\n1️⃣ Go to Notetaker page\n2️⃣ Select **Spoken Language** (language used in the meeting)\n3️⃣ Select **Target Notes Language** (for the AI summary)\n4️⃣ Optionally enter a session title\n5️⃣ Click 🔴 record to start — live transcript appears in real time\n6️⃣ Click **Stop** — AI summary generated automatically",
    options: [
      { label: "🚀 Open Notetaker now", next: "nav_notetaker" },
      { label: "← Back",               next: "notetaker_menu" },
      { label: "🏠 Main Menu",         next: "start" },
    ],
  },
  notetaker_bilingual: {
    bot: "🌐 **Bilingual AI Summary:**\n\nSelect two DIFFERENT languages (e.g., English + Hindi) to get notes in BOTH:\n\n📌 === English Notes ===\n  • Key points in English\n\n📌 === Hindi Notes ===\n  • Same points fully translated\n\n⚠️ Set DIFFERENT languages BEFORE starting recording!",
    options: [
      { label: "← Back",       next: "notetaker_menu" },
      { label: "🏠 Main Menu", next: "start" },
    ],
  },
  notetaker_modes: {
    bot: "👤 **Personal vs Meeting Mode:**\n\n• **Personal Mode** — For solo/interview use\n  Your voice → \"You\"\n  Other voice → \"Interviewer\"\n\n• **Meeting Mode** — For team meetings\n  Multiple voices → \"Speaker 1\", \"Speaker 2\" etc.",
    options: [
      { label: "← Back",       next: "notetaker_menu" },
      { label: "🏠 Main Menu", next: "start" },
    ],
  },
  notetaker_export: {
    bot: "📤 **Exporting Your Notes:**\n\n📄 **PDF** — Formatted report with header and notes\n📝 **Text File** — Plain .txt with transcript and notes\n📧 **Email** — Opens email with notes pre-filled\n📋 **Copy** — Copies notes to clipboard\n\n⚠️ Export button only appears AFTER notes are generated.",
    options: [
      { label: "← Back",       next: "notetaker_menu" },
      { label: "🏠 Main Menu", next: "start" },
    ],
  },
  notetaker_issue: {
    bot: "🔧 **Transcript not appearing? Try:**\n\n✅ Ensure mic permission is granted in browser\n✅ Check you are not muted at OS level\n✅ Speak clearly and at a moderate pace\n✅ Try switching to a different audio source\n✅ Refresh page and restart the session",
    options: [
      { label: "← Back",       next: "notetaker_menu" },
      { label: "🏠 Main Menu", next: "start" },
    ],
  },

  // ── Voice Agent ─────────────────────────────────────────────────────────────
  voice_menu: {
    bot: "🤖 **Voice Agent** is your AI mock interviewer. It conducts a real spoken interview and adapts questions based on your resume!\n\nWhat do you want to know?",
    options: [
      { label: "How to start a mock interview?",       next: "voice_start" },
      { label: "Resume upload & parsing?",             next: "voice_resume" },
      { label: "AI not responding to my voice?",       next: "voice_issue" },
      { label: "What interview types can I practice?", next: "voice_types" },
      { label: "🏠 Main Menu",                         next: "start" },
    ],
  },
  voice_start: {
    bot: "✅ **How to start a mock interview:**\n\n1️⃣ Go to Voice Agent page\n2️⃣ Upload your resume (PDF/DOCX, max 15 MB)\n3️⃣ AI parses your resume automatically\n4️⃣ Select the job role/domain to practice\n5️⃣ Click **Start Interview**\n6️⃣ Speak your answers naturally into the mic\n7️⃣ AI listens, responds, and asks follow-ups\n8️⃣ Click **End Interview** when finished",
    options: [
      { label: "🚀 Open Voice Agent now", next: "nav_voice" },
      { label: "← Back",                 next: "voice_menu" },
      { label: "🏠 Main Menu",           next: "start" },
    ],
  },
  voice_resume: {
    bot: "📄 **Resume Upload & Auto-Parsing:**\n\n✅ Supported: PDF, DOCX, DOC (max 15 MB)\n✅ AI extracts: name, role, skills, experience, education\n✅ Questions become personalised to YOUR background\n\n⚠️ Use text-based PDF — scanned image PDFs may not parse",
    options: [
      { label: "← Back",       next: "voice_menu" },
      { label: "🏠 Main Menu", next: "start" },
    ],
  },
  voice_issue: {
    bot: "🔧 **AI not responding to voice? Try:**\n\n✅ Ensure mic is allowed in the browser\n✅ No other app using the mic (Zoom, Teams, Discord)\n✅ Speak clearly after AI finishes its question\n✅ Refresh page and restart the session\n✅ Use Google Chrome for best Web Audio support",
    options: [
      { label: "← Back",       next: "voice_menu" },
      { label: "🏠 Main Menu", next: "start" },
    ],
  },
  voice_types: {
    bot: "🎯 **Interview types you can practice:**\n\n💻 **Technical** — Coding, System Design, DSA\n🧠 **Behavioural** — HR, Culture Fit, STAR method\n📊 **Domain-specific** — Data Science, Product, Marketing\n\nThe AI adapts based on your resume and selected role.",
    options: [
      { label: "← Back",       next: "voice_menu" },
      { label: "🏠 Main Menu", next: "start" },
    ],
  },

  // ── Upload ──────────────────────────────────────────────────────────────────
  upload_menu: {
    bot: "📁 **Upload & Analysis** lets you upload resumes and audio/video files for AI-powered extraction and analysis.\n\nWhat do you want to know?",
    options: [
      { label: "How to upload a file?",       next: "upload_how" },
      { label: "Supported formats & limits?", next: "upload_formats" },
      { label: "Upload failing?",             next: "upload_issue" },
      { label: "🏠 Main Menu",               next: "start" },
    ],
  },
  upload_how: {
    bot: "✅ **How to upload a file:**\n\n1️⃣ Go to the Upload page\n2️⃣ Click the upload area or drag & drop your file\n3️⃣ Select file type: Resume or Audio/Video\n4️⃣ Wait for processing to complete\n5️⃣ Analysis result displayed automatically",
    options: [
      { label: "🚀 Go to Upload now", next: "nav_upload" },
      { label: "← Back",             next: "upload_menu" },
      { label: "🏠 Main Menu",       next: "start" },
    ],
  },
  upload_formats: {
    bot: "📋 **Supported Formats & Size Limits:**\n\n📄 Resume: PDF, DOCX, DOC — max **15 MB**\n🎵 Audio: MP3, WAV, M4A — max **200 MB**\n🎬 Video: MP4, WebM — max **200 MB**",
    options: [
      { label: "← Back",       next: "upload_menu" },
      { label: "🏠 Main Menu", next: "start" },
    ],
  },
  upload_issue: {
    bot: "🔧 **Upload failing? Try:**\n\n✅ Check file size is within the limit\n✅ Verify the format is supported\n✅ Use a stable internet connection (min 5 Mbps)\n✅ Try compressing the file if it is too large\n✅ Use Chrome browser for best compatibility",
    options: [
      { label: "← Back",       next: "upload_menu" },
      { label: "🏠 Main Menu", next: "start" },
    ],
  },

  // ── Dashboard ───────────────────────────────────────────────────────────────
  dashboard_menu: {
    bot: "📊 **Dashboard** shows all your past AI Copilot and Notetaker sessions — transcripts, AI answers, notes, and ratings.\n\nWhat do you want to know?",
    options: [
      { label: "What can I see in Dashboard?",      next: "dashboard_what" },
      { label: "Session not showing?",              next: "dashboard_missing" },
      { label: "Are sessions saved on cloud?",      next: "dashboard_cloud" },
      { label: "🏠 Main Menu",                      next: "start" },
    ],
  },
  dashboard_what: {
    bot: "📋 **What you can see in Dashboard:**\n\n• Session title, date & duration\n• Technology / domain of the session\n• Number of questions detected & answered\n• AI-generated notes and full transcript\n• Session rating\n\n💡 Click any card to expand. Sessions sorted by most recent.",
    options: [
      { label: "🚀 Open Dashboard now", next: "nav_dashboard" },
      { label: "← Back",               next: "dashboard_menu" },
      { label: "🏠 Main Menu",         next: "start" },
    ],
  },
  dashboard_missing: {
    bot: "🔧 **Session not showing in Dashboard?**\n\n✅ Always click **Stop** before closing the app\n✅ If you closed abruptly, the session may not be saved\n✅ Try refreshing the Dashboard page\n✅ Check you are logged in with the correct account",
    options: [
      { label: "← Back",       next: "dashboard_menu" },
      { label: "🏠 Main Menu", next: "start" },
    ],
  },
  dashboard_cloud: {
    bot: "☁️ **Cloud Storage:**\n\n✅ Sessions stored on server linked to your account\n✅ Accessible from any device when you log in\n✅ Sessions persist even if you switch browsers\n✅ You can delete sessions anytime from Dashboard",
    options: [
      { label: "← Back",       next: "dashboard_menu" },
      { label: "🏠 Main Menu", next: "start" },
    ],
  },

  // ── Troubleshooting ─────────────────────────────────────────────────────────
  trouble_menu: {
    bot: "🔧 **Troubleshooting** — What area is the issue in?",
    options: [
      { label: "🎙️ Microphone / Audio",         next: "trouble_mic" },
      { label: "🔐 Login / Account",             next: "trouble_login" },
      { label: "🌐 Language / Translation",      next: "trouble_lang" },
      { label: "📤 Export / Download",           next: "trouble_export" },
      { label: "⚙️ Performance / General",       next: "trouble_perf" },
      { label: "🏠 Main Menu",                   next: "start" },
    ],
  },
  trouble_mic: {
    bot: "🎙️ **Microphone & Audio Fixes:**\n\n**Cannot access mic:**\n🔒 Browser address bar → Site Settings → Microphone → Allow → Refresh\n\n**Transcript empty:**\nSpeak clearly, check OS mic not muted, try different audio source\n\n**System audio (Zoom/Meet) not captured:**\n• Windows: Enable \"Stereo Mix\" in Sound Settings\n• Mac: Use BlackHole or Loopback virtual driver\n\n**Mic shown but not working:**\nClose other apps using mic (Zoom, Teams, Discord)",
    options: [
      { label: "← Back",       next: "trouble_menu" },
      { label: "🏠 Main Menu", next: "start" },
    ],
  },
  trouble_login: {
    bot: "🔐 **Login & Account Fixes:**\n\n**Cannot log in with Google:**\nAllow popups for this site, disable popup-blocking extensions\n\n**Logged out automatically:**\nSessions expire after 30 days — log in again, your data is safe\n\n**Forgot password:**\nUse \"Forgot Password\" on login screen or \"Sign in with Google\"",
    options: [
      { label: "← Back",       next: "trouble_menu" },
      { label: "🏠 Main Menu", next: "start" },
    ],
  },
  trouble_lang: {
    bot: "🌐 **Language & Translation Fixes:**\n\n**Summary in only one language:**\nSet Spoken Language AND Target Notes Language to two DIFFERENT languages BEFORE starting recording\n\n**Transcript in wrong language:**\nSet correct Spoken Language before the session starts\n\n**Translation incorrect:**\nSwitch translation engine in settings. For Indian languages, Sarvam gives better results",
    options: [
      { label: "← Back",       next: "trouble_menu" },
      { label: "🏠 Main Menu", next: "start" },
    ],
  },
  trouble_export: {
    bot: "📤 **Export & Download Fixes:**\n\n**PDF blank or not downloading:**\nNotes must be generated first — then try Copy as fallback\n\n**Garbled characters (Hindi/regional):**\nOpen PDF in Google Chrome or Adobe Acrobat\n\n**Export button not visible:**\nStart and stop a recording session first — export appears after notes are generated",
    options: [
      { label: "← Back",       next: "trouble_menu" },
      { label: "🏠 Main Menu", next: "start" },
    ],
  },
  trouble_perf: {
    bot: "⚙️ **Performance & General Fixes:**\n\n**App slow/lagging:**\nClose other tabs, use stable internet (min 5 Mbps), use Chrome\n\n**Page stuck on spinner:**\nClear cache, hard refresh: Ctrl+Shift+R (Win) / Cmd+Shift+R (Mac)\n\n**Supported browsers:**\n✅ Chrome (recommended)  ✅ Edge  ✅ Brave\n⚠️ Safari & Firefox — limited Web Audio support",
    options: [
      { label: "← Back",       next: "trouble_menu" },
      { label: "🏠 Main Menu", next: "start" },
    ],
  },

  // ── Navigation nodes ─────────────────────────────────────────────────────────
  nav_overlay:   { bot: "🚀 Launching AI Copilot...",   navigate: "overlay",     options: [{ label: "🏠 Main Menu", next: "start" }] },
  nav_notetaker: { bot: "📝 Opening Notetaker...",       navigate: "notetaker",   options: [{ label: "🏠 Main Menu", next: "start" }] },
  nav_voice:     { bot: "🤖 Launching Voice Agent...",   navigate: "voice-agent", options: [{ label: "🏠 Main Menu", next: "start" }] },
  nav_upload:    { bot: "📁 Opening Upload page...",     navigate: "upload",      options: [{ label: "🏠 Main Menu", next: "start" }] },
  nav_dashboard: { bot: "📊 Opening Dashboard...",       navigate: "dashboard",   options: [{ label: "🏠 Main Menu", next: "start" }] },
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function HelpChatbot({ darkMode, windowType, onNavigate }) {
  const [isOpen,          setIsOpen]          = useState(false);
  const [messages,        setMessages]        = useState(() => [
    { type: "bot", text: FLOW.start.bot, id: "start-initial" }
  ]);
  const [currentNode,     setCurrentNode]     = useState("start");
  const [optionsVisible,  setOptionsVisible]  = useState(true);
  const bottomRef   = useRef(null);
  const timerRef    = useRef(null);

  // Hide only in minimal Electron child windows (teleprompter / topbar)
  const isHidden = windowType === "teleprompter" || windowType === "topbar";

  // Escape key closes chatbot
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") setIsOpen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // Clean up timers on unmount
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Auto-scroll to bottom whenever messages or options change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, optionsVisible]);

  // showNode — core navigation function
  const showNode = useCallback((nodeId) => {
    const node = FLOW[nodeId];
    if (!node) return;

    setCurrentNode(nodeId);
    setOptionsVisible(false);

    // Add bot message
    setMessages((prev) => [...prev, { type: "bot", text: node.bot, id: Date.now() + Math.random() }]);

    // If this node triggers navigation: navigate, stay open, show confirmation + options
    if (node.navigate && onNavigate) {
      timerRef.current = setTimeout(() => {
        onNavigate(node.navigate);
        setMessages((prev) => [
          ...prev,
          {
            type: "bot",
            text: "✅ Done! You are now on the page.\n\nWhat would you like to do next?",
            id: Date.now() + Math.random(),
          },
        ]);
        setCurrentNode("start");
        timerRef.current = setTimeout(() => setOptionsVisible(true), 400);
      }, 700);
      return;
    }

    // Show option buttons with a short "typing" delay
    timerRef.current = setTimeout(() => setOptionsVisible(true), 380);
  }, [onNavigate]);

  // Open chatbot
  const handleOpen = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => setIsOpen(false), []);

  const handleReset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCurrentNode("start");
    setMessages([{ type: "bot", text: FLOW.start.bot, id: "start-" + Date.now() }]);
    setOptionsVisible(true);
  }, []);

  const handleOption = useCallback((opt) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessages((prev) => [...prev, { type: "user", text: opt.label, id: Date.now() + Math.random() }]);
    setOptionsVisible(false);
    timerRef.current = setTimeout(() => showNode(opt.next), 300);
  }, [showNode]);

  if (isHidden) return null;

  const node    = FLOW[currentNode];
  const options = node?.options || [];

  return (
    <>
      {/* Floating Action Button */}
      <button
        className={"hcb-fab" + (isOpen ? " hcb-fab--open" : "") + (darkMode ? " hcb-dark" : "")}
        onClick={isOpen ? handleClose : handleOpen}
        aria-label={isOpen ? "Close Help" : "Open Help Chatbot"}
        title={isOpen ? "Close" : "Help & Guide"}
      >
        {isOpen
          ? <i className="fa-solid fa-xmark" />
          : <i className="fa-solid fa-circle-question" />}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div
          className={"hcb-window" + (darkMode ? " hcb-dark" : "")}
          role="dialog"
          aria-modal="true"
          aria-label="Help Chatbot"
        >
          {/* Header */}
          <div className="hcb-header">
            <div className="hcb-header-left">
              <div className="hcb-avatar">🤝</div>
              <div>
                <div className="hcb-header-name">Copilot Assistant</div>
                <div className="hcb-header-status">
                  <span className="hcb-status-dot" /> Online
                </div>
              </div>
            </div>
            <div className="hcb-header-actions">
              <button className="hcb-icon-btn" onClick={handleReset} title="Restart" aria-label="Restart chat">
                <i className="fa-solid fa-rotate-right" />
              </button>
              <button className="hcb-icon-btn" onClick={handleClose} title="Close" aria-label="Close">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div className="hcb-body">
            {messages.map((msg) =>
              msg.type === "bot" ? (
                <div key={msg.id} className="hcb-msg-bot-wrap">
                  <div className="hcb-msg-avatar">🤝</div>
                  <div className="hcb-msg-bot">
                    {parseBotText(msg.text)}
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="hcb-msg-user-wrap">
                  <div className="hcb-msg-user">{msg.text}</div>
                </div>
              )
            )}

            {/* Option buttons shown after bot message */}
            {optionsVisible && options.length > 0 && (
              <div className="hcb-options">
                {options.map((opt, i) => (
                  <button
                    key={i}
                    className="hcb-option-btn"
                    onClick={() => handleOption(opt)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Footer */}
          <div className="hcb-footer">
            <i className="fa-solid fa-shield-halved" />
            <span>Interview Copilot Help Center</span>
          </div>
        </div>
      )}
    </>
  );
}

// ── Parse bot text: render **bold** and line breaks ──────────────────────────
function parseBotText(text) {
  return text.split("\n").map((line, lineIdx, arr) => {
    const parts = line.split(/\*\*(.*?)\*\*/g);
    const rendered = parts.map((part, i) =>
      i % 2 === 1 ? <strong key={i}>{part}</strong> : part
    );
    return (
      <span key={lineIdx}>
        {rendered}
        {lineIdx < arr.length - 1 && <br />}
      </span>
    );
  });
}
