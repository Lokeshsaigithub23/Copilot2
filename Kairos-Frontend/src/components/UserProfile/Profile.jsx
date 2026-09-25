import React, { useState, useEffect, useCallback } from 'react';
import AccountDropdown from './AccountDropdown';
import { API_BASE } from '../../utils/api';
import './Profile.css';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
function formatDuration(totalSeconds) {
  const seconds = Number(totalSeconds) || 0;
  if (seconds <= 0) return '0m 0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins}m ${secs}s`;
}

function getInitials(name, email) {
  if (name && typeof name === 'string' && name.trim()) {
    const trimmed = name.trim();
    const lower = trimmed.toLowerCase();
    if (lower.includes('varanasi') && lower.includes('sathwika')) {
      return 'VS';
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    const caps = trimmed.match(/[A-Z]/g);
    if (caps && caps.length >= 2) {
      return (caps[0] + caps[1]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email && typeof email === 'string') {
    const localPart = email.trim().split('@')[0];
    const lower = localPart.toLowerCase();
    if (lower.includes('varanasi') && lower.includes('sathwika')) {
      return 'VS';
    }
    const parts = localPart.split(/[._-]/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return localPart.slice(0, 2).toUpperCase();
  }
  return 'VS';
}

const getStorageKey = (u) => {
  return u?.email 
    ? `copilot_recent_sessions_${u.email}` 
    : 'copilot_recent_sessions';
};

const getProfileCacheKey = (u) => {
  return u?.email 
    ? `copilot_profile_sessions_cache_${u.email}` 
    : 'copilot_profile_sessions_cache';
};

function normalizeSession(s) {
  if (!s) return null;
  const p = s.payload || {};
  const durationDisplay = s.durationDisplay || p.durationDisplay || s.timer || p.timer || '00:00:00';
  let durationSeconds = Number(s.durationSeconds) || Number(p.durationSeconds) || 0;
  if (!durationSeconds && durationDisplay) {
    const parts = String(durationDisplay).split(':').map(Number);
    if (parts.length === 3) {
      durationSeconds = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    } else if (parts.length === 2) {
      durationSeconds = (parts[0] || 0) * 60 + (parts[1] || 0);
    }
  }

  const questionCount = Number(s.questionCount) || Number(p.questionCount) || Number(s.qsCount) || Number(p.qsCount) || 0;
  const title = s.title || s.name || p.name || 'Live Session';
  const tech = s.tech || p.tech || 'Interview';
  const createdAt = s.createdAt || s.timestamp || p.timestamp || '';

  return {
    ...s,
    id: s.id,
    title,
    name: title,
    tech,
    durationDisplay,
    durationSeconds,
    questionCount,
    createdAt
  };
}

export function isMeetingNotesSession(s) {
  if (!s) return false;
  const p = s.payload || {};
  if (p.isNotetaker || p.sessionType === 'notetaker' || s.isNotetaker || s.sessionType === 'notetaker') {
    return true;
  }
  const title = String(s.title || s.name || p.name || '').trim().toLowerCase();
  if (title.startsWith('meeting notes') || title.startsWith('notetaker') || title.includes('meeting note')) {
    return true;
  }
  const tech = String(s.tech || p.tech || '').trim().toLowerCase();
  if (tech.includes('notetaker') || tech.startsWith('meeting notes') || tech.includes('meeting note')) {
    return true;
  }
  return false;
}

function getInitialSessions(u) {
  const mergedMap = new Map();
  const addItems = (items) => {
    if (!Array.isArray(items)) return;
    for (const raw of items) {
      const norm = normalizeSession(raw);
      if (norm && norm.id && !mergedMap.has(String(norm.id))) {
        mergedMap.set(String(norm.id), norm);
      }
    }
  };

  try {
    const profileKey = getProfileCacheKey(u);
    const cachedProfile = localStorage.getItem(profileKey);
    if (cachedProfile) {
      addItems(JSON.parse(cachedProfile));
    }
  } catch (_) {}

  try {
    const recentKey = getStorageKey(u);
    const cachedRecent = localStorage.getItem(recentKey);
    if (cachedRecent) {
      addItems(JSON.parse(cachedRecent));
    }
  } catch (_) {}

  try {
    const cachedNotes = localStorage.getItem('notetaker_saved_sessions');
    if (cachedNotes) {
      addItems(JSON.parse(cachedNotes));
    }
  } catch (_) {}

  return Array.from(mergedMap.values());
}

export default function Profile({
  token,
  user,
  onLogout,
  onBackToLanding,
  onGoToPanel,
  onGoToNotetaker,
  onGoToVoiceAgent,
  onGoToUpload,
  onGoToDashboard,
  onGoToProfile,
  showToast,
  darkMode,
  toggleDarkMode,
  windowType
}) {
  const [sessions, setSessions] = useState(() => getInitialSessions(user));
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState(null);
  const [showAllSessions, setShowAllSessions] = useState(false);

  const handleMinimize = () => ipcRenderer?.send('window-minimize');
  const handleMaximize = () => ipcRenderer?.send('window-maximize');
  const handleClose = () => ipcRenderer?.send('window-close');

  const displayName = user?.name || user?.email?.split('@')[0] || 'User';
  const displayEmail = user?.email || 'No email available';
  const initials = getInitials(user?.name, user?.email);

  const loadSessionsFromLocal = useCallback(() => {
    try {
      const local = getInitialSessions(user);
      if (local && local.length > 0) {
        setSessions(prev => {
          const prevMap = new Map(prev.map(p => [String(p.id), p]));
          const merged = [...local];
          for (const s of prev) {
            if (!merged.some(m => String(m.id) === String(s.id))) {
              merged.push(s);
            }
          }
          return merged;
        });
        setIsLoadingSessions(false);
      }
      return local;
    } catch (_) {
      return [];
    }
  }, [user]);

  const syncSessionsFromServer = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/sessions`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && Array.isArray(data.sessions)) {
        const backendNormalized = data.sessions.map(normalizeSession).filter(Boolean);
        const backendIds = new Set(backendNormalized.map(s => String(s.id)));

        // Keep any recent local sessions that might not yet be in the backend database
        let unsyncedLocal = [];
        try {
          const recentKey = getStorageKey(user);
          const cachedRecent = localStorage.getItem(recentKey);
          if (cachedRecent) {
            const parsedRecent = JSON.parse(cachedRecent);
            if (Array.isArray(parsedRecent)) {
              unsyncedLocal = parsedRecent
                .map(normalizeSession)
                .filter(Boolean)
                .filter(s => !backendIds.has(String(s.id)));
            }
          }
        } catch (_) {}

        const combined = [...unsyncedLocal, ...backendNormalized];
        setSessions(combined);
        setSessionsError(null);
        try {
          localStorage.setItem(getProfileCacheKey(user), JSON.stringify(combined));
        } catch (_) {}
      }
    } catch (err) {
      console.warn('[Profile] Failed to fetch sessions from server:', err.message);
      setSessions(prev => {
        if (!prev || prev.length === 0) {
          setSessionsError('Could not load session history');
        }
        return prev;
      });
    } finally {
      setIsLoadingSessions(false);
    }
  }, [token, user]);

  const refreshSessions = useCallback((showSpinnerIfEmpty = false) => {
    const local = loadSessionsFromLocal();
    if (showSpinnerIfEmpty && local.length === 0) {
      setIsLoadingSessions(true);
    }
    syncSessionsFromServer();
  }, [loadSessionsFromLocal, syncSessionsFromServer]);

  // Synchronize when navigating to Profile view or on initial load
  useEffect(() => {
    if (windowType === 'profile' || !windowType) {
      refreshSessions(sessions.length === 0);
    }
  }, [windowType, token, user, refreshSessions]);

  // Real-time synchronization when an interview is saved or deleted in AI Copilot
  useEffect(() => {
    const handleSessionsChanged = () => {
      refreshSessions(false);
    };

    window.addEventListener('kairos-sessions-updated', handleSessionsChanged);
    window.addEventListener('storage', handleSessionsChanged);
    return () => {
      window.removeEventListener('kairos-sessions-updated', handleSessionsChanged);
      window.removeEventListener('storage', handleSessionsChanged);
    };
  }, [refreshSessions]);

  // Derive real statistics from existing sessions
  const totalSessions = sessions.length;
  const totalDurationSeconds = sessions.reduce((acc, s) => acc + (Number(s.durationSeconds) || 0), 0);
  const totalQuestions = sessions.reduce((acc, s) => acc + (Number(s.questionCount) || 0), 0);

  const handleSessionClick = (sess) => {
    if (!sess) {
      setShowAllSessions(prev => !prev);
      return;
    }

    const isNotes = isMeetingNotesSession(sess);
    if (isNotes) {
      if (onGoToNotetaker) {
        onGoToNotetaker('past', sess.id);
      }
      return;
    }

    try {
      sessionStorage.setItem('copilot_target_tab', 'recent');
      if (sess?.id) {
        sessionStorage.setItem('copilot_target_session_id', String(sess.id));
      }
    } catch (_) {}
    if (onGoToPanel) {
      onGoToPanel('recent', sess?.id);
    }
  };

  return (
    <div className={`interview-panel-root profile-page-root ${darkMode ? 'dark-theme' : ''}`}>
      {/* Titlebar for Electron Drag */}
      <div className="window-titlebar">
        <div className="window-title">
          <i className="fa-solid fa-user"></i> Profile | My Interview Copilot
        </div>
        <div className="window-controls">
          <button className="win-btn win-btn-minimize" onClick={handleMinimize} title="Minimize">—</button>
          <button className="win-btn win-btn-maximize" onClick={handleMaximize} title="Maximize">▢</button>
          <button className="win-btn win-btn-close" onClick={handleClose} title="Close">×</button>
        </div>
      </div>

      {/* Dynamic Header */}
      <header className="setup-navbar">
        <div className="setup-navbar-left" onClick={onBackToLanding} style={{ cursor: 'pointer' }}>
          <div className="setup-navbar-logo"><i className="fa-solid fa-brain"></i></div>
          <div className="setup-navbar-title">My Interview Copilot</div>
        </div>

        <nav className="setup-navbar-tabs">
          <button onClick={onBackToLanding} className="setup-tab-item" type="button">
            <i className="fa-solid fa-house"></i> Home
          </button>
          <button onClick={onGoToDashboard} className="setup-tab-item" type="button">
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
          <button onClick={onGoToPanel} className="setup-action-btn btn-copilot" type="button">
            <i className="fa-solid fa-rocket"></i> AI Copilot
          </button>
          <button onClick={onGoToNotetaker} className="setup-action-btn btn-notetaker" type="button">
            <i className="fa-solid fa-microphone"></i> Notetaker
          </button>
          <button onClick={onGoToVoiceAgent} className="setup-action-btn btn-voice-agent" type="button">
            <i className="fa-solid fa-robot"></i> Voice Agent
          </button>
          <button onClick={onGoToUpload} className="setup-action-btn btn-upload" type="button">
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
            onLogout={onLogout}
            showToast={showToast}
            isActive={true}
          />
        </div>
      </header>

      {/* Subheader Breadcrumb */}
      <div className="setup-subheader-row">
        <div className="setup-subheader-left">
          <a href="#" onClick={(e) => { e.preventDefault(); onBackToLanding(); }} className="badge-crumb crumb-home">
            <i className="fa-solid fa-house"></i> Home
          </a>
          <span className="crumb-separator"><i className="fa-solid fa-chevron-right"></i></span>
          <span className="badge-crumb crumb-current">
            <i className="fa-solid fa-user"></i> Profile
          </span>
        </div>
        <div className="setup-subheader-right">
          <span className="badge-crumb crumb-tag">
            <i className="fa-solid fa-triangle-exclamation"></i> No guarantee of results. This is an AI practice tool only.
          </span>
        </div>
      </div>

      {/* Profile Main Content Container */}
      <main className="profile-content-container">
        {/* Profile Hero Header Card */}
        <section className="profile-hero-card">
          <div className="profile-hero-left">
            <div className="profile-avatar-circle">
              {initials}
            </div>
            <div className="profile-hero-info">
              <div className="profile-hero-name-row">
                <h1 className="profile-hero-name">{displayName}</h1>
              </div>
              <p className="profile-hero-email">
                <i className="fa-regular fa-envelope"></i> {displayEmail}
              </p>
            </div>
          </div>
        </section>

        {/* Dashboard Grid */}
        <div className="profile-cards-grid">
          {/* 1. Account Information */}
          <section className="profile-card">
            <div className="profile-card-header">
              <div className="profile-card-icon bg-indigo">
                <i className="fa-solid fa-id-card"></i>
              </div>
              <div>
                <h2 className="profile-card-title">Account Information</h2>
                <p className="profile-card-subtitle">Your user identity and credential details</p>
              </div>
            </div>

            <div className="profile-info-list">
              <div className="profile-info-row">
                <span className="profile-info-label">Full Name</span>
                <span className="profile-info-value">{user?.name || '—'}</span>
              </div>
              <div className="profile-info-row">
                <span className="profile-info-label">Email Address</span>
                <span className="profile-info-value">{displayEmail}</span>
              </div>
            </div>
          </section>

          {/* 2. Plan & Subscription Information */}
          <section className="profile-card">
            <div className="profile-card-header">
              <div className="profile-card-icon bg-purple">
                <i className="fa-solid fa-cube"></i>
              </div>
              <div>
                <h2 className="profile-card-title">Plan & Subscription</h2>
                <p className="profile-card-subtitle">Current package entitlements</p>
              </div>
            </div>

            <div className="profile-plan-banner">
              <div className="profile-plan-meta">
                <span className="profile-plan-badge">Free Tier</span>
                <span className="profile-plan-status"><i className="fa-solid fa-circle-check"></i> Active</span>
              </div>
              <p className="profile-plan-desc">Access to standard AI interview practice tools and transcription.</p>
            </div>

            <div className="profile-features-list">
              <div className="profile-feature-item">
                <i className="fa-solid fa-check text-success"></i>
                <span>Real-time AI Copilot speech assistance</span>
              </div>
              <div className="profile-feature-item">
                <i className="fa-solid fa-check text-success"></i>
                <span>Interactive Voice Agent mock interviews</span>
              </div>
              <div className="profile-feature-item">
                <i className="fa-solid fa-check text-success"></i>
                <span>Meeting Notetaker with summary generation</span>
              </div>
              <div className="profile-feature-item">
                <i className="fa-solid fa-check text-success"></i>
                <span>Resume upload, OCR, and skill taxonomy analysis</span>
              </div>
            </div>
          </section>

          {/* 3. Credits & Usage Statistics */}
          <section className="profile-card profile-card-full">
            <div className="profile-card-header">
              <div className="profile-card-icon bg-emerald">
                <i className="fa-solid fa-chart-pie"></i>
              </div>
              <div>
                <h2 className="profile-card-title">Usage & Sessions</h2>
                <p className="profile-card-subtitle">Real metrics from your interview sessions</p>
              </div>
            </div>

            {isLoadingSessions && sessions.length === 0 ? (
              <div className="profile-loading-state">
                <i className="fa-solid fa-circle-notch fa-spin"></i> Loading session statistics...
              </div>
            ) : sessionsError && sessions.length === 0 ? (
              <div className="profile-error-hint">
                <i className="fa-solid fa-circle-info"></i> {sessionsError}
              </div>
            ) : (
              <div className="profile-stats-grid">
                <div
                  className="profile-stat-box clickable"
                  onClick={() => handleSessionClick()}
                  title={showAllSessions ? "Show fewer sessions" : "View all saved sessions"}
                  role="button"
                  tabIndex={0}
                >
                  <span className="profile-stat-number">{totalSessions}</span>
                  <span className="profile-stat-label">Saved Sessions</span>
                </div>
                <div className="profile-stat-box">
                  <span className="profile-stat-number">{formatDuration(totalDurationSeconds)}</span>
                  <span className="profile-stat-label">Practice Time</span>
                </div>
                <div className="profile-stat-box">
                  <span className="profile-stat-number">{totalQuestions}</span>
                  <span className="profile-stat-label">Questions Handled</span>
                </div>
              </div>
            )}

            {sessions.length > 0 && (
              <div className="profile-recent-sessions">
                <div className="recent-sessions-header">
                  <div className="recent-sessions-header-left">
                    <span>{showAllSessions ? 'All Saved Sessions' : 'Recent Practice Sessions'}</span>
                    <span className="recent-sessions-count-pill">{sessions.length}</span>
                  </div>
                  {sessions.length > 3 && (
                    <button
                      type="button"
                      className="recent-sessions-view-all-btn"
                      onClick={() => setShowAllSessions(prev => !prev)}
                    >
                      {showAllSessions ? (
                        <>
                          Show Less <i className="fa-solid fa-chevron-up"></i>
                        </>
                      ) : (
                        <>
                          View All ({sessions.length}) <i className="fa-solid fa-chevron-down"></i>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <div className={`recent-sessions-list ${showAllSessions ? 'expanded-sessions-list' : ''}`}>
                  {(showAllSessions ? sessions : sessions.slice(0, 3)).map((sess) => {
                    const isNotes = isMeetingNotesSession(sess);
                    return (
                      <div
                        key={sess.id || `sess_${Math.random()}`}
                        className={`recent-session-item ${isNotes ? 'item-notetaker' : 'item-copilot'}`}
                        onClick={() => handleSessionClick(sess)}
                        title={isNotes ? "Open meeting notes in Notetaker" : "Open interview session in AI Copilot"}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="recent-session-left-meta">
                          <div className={`recent-session-type-icon ${isNotes ? 'icon-notetaker' : 'icon-copilot'}`}>
                            <i className={isNotes ? "fa-solid fa-microphone" : "fa-solid fa-robot"}></i>
                          </div>
                          <div className="recent-session-info">
                            <div className="recent-session-title-row">
                              <span className="recent-session-title">{sess.title || 'Live Session'}</span>
                              <span className={`recent-session-type-tag ${isNotes ? 'tag-notetaker' : 'tag-copilot'}`}>
                                {isNotes ? 'Meeting Notes' : 'AI Copilot'}
                              </span>
                            </div>
                            <span className="recent-session-tech">{sess.tech || (isNotes ? 'Meeting Notes' : 'Interview')}</span>
                          </div>
                        </div>
                        <div className="recent-session-right">
                          <span className="recent-session-time">{sess.durationDisplay || '00:00:00'}</span>
                          <span className="recent-session-destination-hint">
                            {isNotes ? 'Open Notetaker' : 'Open Copilot'}
                          </span>
                          <i className="fa-solid fa-chevron-right recent-session-arrow"></i>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
