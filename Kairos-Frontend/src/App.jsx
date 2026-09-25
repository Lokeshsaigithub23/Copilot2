import React, { useState, useEffect, useCallback } from 'react';
import LandingPage from './components/LandingPage';
import InterviewPanel from './components/InterviewPanel';
import Teleprompter from './components/Teleprompter';
import TopBar from './components/TopBar';
import Notetaker from './components/Notetaker';
import VoiceAgent from './components/VoiceAgent';
import Upload from './components/Upload';
import Dashboard from './components/Dashboard';
import Profile from './components/UserProfile/Profile';
import HelpChatbot from './components/common/HelpChatbot';
import { clearFirebaseSession } from './auth/firebase';
import './App.css';
import ReferralPage from './components/Referral/ReferralPage';
const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

export default function App() {
  const [windowType, setWindowType] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('window') || 'auth';
  });
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [referralCode, setReferralCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('ref') || '';
  });
  const [toastMessage, setToastMessage] = useState(null);
  const toastTimeoutRef = React.useRef(null);

  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme_mode') === 'dark';
  });

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-theme');
      localStorage.setItem('theme_mode', 'dark');
    } else {
      document.body.classList.remove('dark-theme');
      localStorage.setItem('theme_mode', 'light');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  const showToast = (msg) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    let str = msg;
    if (msg && typeof msg === 'object') {
      str = msg.message || msg.error?.message || msg.error || msg.description || 'Notification';
    }
    setToastMessage(typeof str === 'string' ? str : String(str || ''));
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Sync Electron window configurations on active page change
  useEffect(() => {
    if (ipcRenderer) {
      ipcRenderer.send('current-view-changed', windowType);
    }
  }, [windowType]);

  // Parse window parameter from URL Query string on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let winParam = params.get('window') || 'auth';
    const isChild = params.get('isChild') === 'true';
    const refParam = params.get('ref') || '';

    if (refParam) {
      setReferralCode(refParam.trim());
      localStorage.setItem('referral_code', refParam.trim());
    }

    // Prevent main app window or web browser from loading full-width standalone teleprompter/topbar
    if (winParam === 'teleprompter' || winParam === 'topbar') {
      if (!isChild) {
        winParam = 'overlay';
      }
    }

    setWindowType(winParam);

    if (winParam === 'teleprompter' || winParam === 'topbar') {
      document.title = winParam === 'teleprompter' ? 'Teleprompter & Notepad' : 'Top Bar Overlay';
      document.body.style.setProperty('background', 'transparent', 'important');
      document.body.style.setProperty('background-color', 'transparent', 'important');
    } else {
      document.title = 'My Interview Copilot';
      document.body.style.background = '';
      document.body.style.backgroundColor = '';
    }
  }, []);

  // Listen to authentication push from main process
  useEffect(() => {
    if (ipcRenderer) {
      const handleAuthSession = (_, payload) => {
        if (payload?.token) {
          setToken(payload.token);
          setUser(payload.user || null);
          localStorage.setItem('auth_token', payload.token);
          if (payload.user) localStorage.setItem('auth_user', JSON.stringify(payload.user));
        }
      };
      ipcRenderer.on('auth-session', handleAuthSession);
      return () => {
        ipcRenderer.removeListener('auth-session', handleAuthSession);
      };
    }
  }, []);

  // Web-only/fallback state recovery from localStorage
  useEffect(() => {
    const savedToken = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');
    if (savedToken && !token) {
      setToken(savedToken);
      let parsedUser = null;
      if (savedUser) {
        try {
          parsedUser = JSON.parse(savedUser);
          setUser(parsedUser);
        } catch (_) {}
      }
      if (ipcRenderer) {
        ipcRenderer.send('auth-login-success', {
          token: savedToken,
          user: parsedUser,
          targetView: windowType
        });
      }
    }
  }, [token, windowType]);

  // Update URL search parameters when view changes to preserve state on reload/crash
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('window') !== windowType) {
      params.set('window', windowType);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(null, '', newUrl);
    }
  }, [windowType]);

  // Handle browser back/forward buttons (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      let winParam = params.get('window') || 'auth';
      const isChild = params.get('isChild') === 'true';
      if (winParam === 'teleprompter' || winParam === 'topbar') {
        if (!isChild) {
          winParam = 'overlay';
        }
      }
      setWindowType(winParam);
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Listen to change-view event from main process
  useEffect(() => {
    if (ipcRenderer) {
      const handleChangeView = (_, viewType) => {
        let targetView = viewType;
        const params = new URLSearchParams(window.location.search);
        const isChild = params.get('isChild') === 'true';
        if (targetView === 'teleprompter' || targetView === 'topbar') {
          if (!isChild) {
            targetView = 'overlay';
          }
        }
        setWindowType(targetView);
      };
      ipcRenderer.on('change-view', handleChangeView);
      return () => {
        ipcRenderer.removeListener('change-view', handleChangeView);
      };
    }
  }, []);

  const handleLogout = () => {
    clearFirebaseSession().catch(() => {
      // The app session is still cleared if Firebase cleanup is unavailable.
    });
    setToken(null);
    setUser(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setWindowType('auth');
    if (ipcRenderer) {
      ipcRenderer.send('go-back-to-auth');
    }
  };

  const handleBackToLanding = () => {
    setWindowType('auth');
    if (ipcRenderer) {
      ipcRenderer.send('go-back-to-auth-keep-session');
    }
  };

  const handleGoToReferral = () => {
    setWindowType('referral');
    if (ipcRenderer) {
      ipcRenderer.send('auth-login-success', {
        token,
        user,
        targetView: 'referral'
      });
    }
  };

  const referralStyle =
    windowType === 'referral'
      ? {
          display: 'block',
          position: 'relative',
          width: '100%',
          height: '100vh',
          opacity: 1,
          visibility: 'visible',
          overflowY: 'auto'
        }
      : {
          display: 'none'
        };

  const handleGoToPanel = (targetTab, targetSessionId) => {
    if (targetTab) {
      try {
        sessionStorage.setItem('copilot_target_tab', targetTab);
        if (targetSessionId) {
          sessionStorage.setItem('copilot_target_session_id', String(targetSessionId));
        }
      } catch (_) {}
    }
    setWindowType('overlay');
    if (ipcRenderer) {
      ipcRenderer.send('auth-login-success', { token, user, targetView: 'overlay' });
    }
  };

  const handleGoToNotetaker = (targetTab, targetSessionId) => {
    if (targetTab) {
      try {
        sessionStorage.setItem('notetaker_target_tab', targetTab);
        if (targetSessionId) {
          sessionStorage.setItem('notetaker_target_session_id', String(targetSessionId));
        }
      } catch (_) {}
    }
    setWindowType('notetaker');
    if (ipcRenderer) {
      ipcRenderer.send('auth-login-success', { token, user, targetView: 'notetaker' });
    }
  };

  const handleGoToVoiceAgent = () => {
    setWindowType('voice-agent');
    if (ipcRenderer) {
      ipcRenderer.send('auth-login-success', { token, user, targetView: 'voice-agent' });
    }
  };

  const handleGoToUpload = () => {
    setWindowType('upload');
    if (ipcRenderer) {
      ipcRenderer.send('auth-login-success', { token, user, targetView: 'upload' });
    }
  };

  const handleGoToDashboard = () => {
    setWindowType('dashboard');
    if (ipcRenderer) {
      ipcRenderer.send('auth-login-success', { token, user, targetView: 'dashboard' });
    }
  };

  const handleGoToProfile = () => {
    setWindowType('profile');
    if (ipcRenderer) {
      ipcRenderer.send('auth-login-success', { token, user, targetView: 'profile' });
    }
  };

  const renderView = () => {
    if (windowType === 'teleprompter') {
      return <Teleprompter />;
    }
    if (windowType === 'topbar') {
      return <TopBar />;
    }

    if (!token) {
      return (
        <LandingPage
          token={token}
          user={user}
          onLogout={handleLogout}
          onGoToPanel={handleGoToPanel}
          onGoToNotetaker={handleGoToNotetaker}
          showToast={showToast}
          darkMode={darkMode}
          toggleDarkMode={toggleDarkMode}
          onLoginSuccess={(tok, usr, redirectTarget) => {
            setToken(tok);
            setUser(usr);
            localStorage.setItem('auth_token', tok);
            if (usr) localStorage.setItem('auth_user', JSON.stringify(usr));
            
            let targetView = redirectTarget || 'auth';

            if (
              targetView !== 'auth' &&
              targetView !== 'notetaker' &&
              targetView !== 'overlay' &&
              targetView !== 'voice-agent' &&
              targetView !== 'upload' &&
              targetView !== 'dashboard' &&
              targetView !== 'profile' &&
              targetView !== 'referral'
            ) {
              targetView = 'auth';
            }
            
            setWindowType(targetView);
            
            if (ipcRenderer) {
              ipcRenderer.send('auth-login-success', { token: tok, user: usr, targetView });
            }
          }}
        />
      );
    }

    const authStyle = windowType === 'auth' 
      ? { height: '100%' } 
      : { position: 'absolute', left: '-99999px', top: '-99999px', width: '100%', height: '100%', opacity: 0, pointerEvents: 'none' };

    const overlayStyle = windowType === 'overlay' 
      ? { height: '100%' } 
      : { position: 'absolute', left: '-99999px', top: '-99999px', width: '100%', height: '100%', opacity: 0, pointerEvents: 'none' };

    const notetakerStyle = windowType === 'notetaker' 
      ? { height: '100%' } 
      : { position: 'absolute', left: '-99999px', top: '-99999px', width: '100%', height: '100%', opacity: 0, pointerEvents: 'none' };

    const voiceAgentStyle = windowType === 'voice-agent' 
      ? { height: '100%' } 
      : { position: 'absolute', left: '-99999px', top: '-99999px', width: '100%', height: '100%', opacity: 0, pointerEvents: 'none' };

    const uploadStyle = windowType === 'upload' 
      ? { height: '100%' } 
      : { position: 'absolute', left: '-99999px', top: '-99999px', width: '100%', height: '100%', opacity: 0, pointerEvents: 'none' };

    const dashboardStyle = windowType === 'dashboard' 
      ? { height: '100%' } 
      : { position: 'absolute', left: '-99999px', top: '-99999px', width: '100%', height: '100%', opacity: 0, pointerEvents: 'none' };

    const profileStyle = windowType === 'profile' 
      ? { height: '100%' } 
      : { position: 'absolute', left: '-99999px', top: '-99999px', width: '100%', height: '100%', opacity: 0, pointerEvents: 'none' };

    return (
      <>
        <div style={authStyle}>
          <LandingPage
            token={token}
            user={user}
            onLogout={handleLogout}
            onGoToPanel={handleGoToPanel}
            onGoToNotetaker={handleGoToNotetaker}
            onGoToVoiceAgent={handleGoToVoiceAgent}
            onGoToUpload={handleGoToUpload}
            onGoToDashboard={handleGoToDashboard}
            onGoToProfile={handleGoToProfile}
            showToast={showToast}
            onGoToReferral={handleGoToReferral}
            darkMode={darkMode}
            toggleDarkMode={toggleDarkMode}
            onLoginSuccess={(tok, usr, redirectTarget) => {
              setToken(tok);
              setUser(usr);
              localStorage.setItem('auth_token', tok);
              if (usr) localStorage.setItem('auth_user', JSON.stringify(usr));
              
              let targetView = redirectTarget || 'auth';
              if (targetView !== 'auth' && targetView !== 'notetaker' && targetView !== 'overlay' && targetView !== 'voice-agent' && targetView !== 'upload' && targetView !== 'dashboard' && targetView !== 'profile') {
                targetView = 'auth';
              }
              
              setWindowType(targetView);
              
              if (ipcRenderer) {
                ipcRenderer.send('auth-login-success', { token: tok, user: usr, targetView });
              }
            }}
          />
        </div>
        <div style={overlayStyle}>
          <InterviewPanel
            token={token}
            user={user}
            onLogout={handleLogout}
            onBackToLanding={handleBackToLanding}
            onGoToNotetaker={handleGoToNotetaker}
            onGoToVoiceAgent={handleGoToVoiceAgent}
            onGoToUpload={handleGoToUpload}
            onGoToDashboard={handleGoToDashboard}
            onGoToProfile={handleGoToProfile}
            showToast={showToast}
            darkMode={darkMode}
            toggleDarkMode={toggleDarkMode}
            windowType={windowType}
          />
        </div>
        <div style={referralStyle}>
          <ReferralPage
            token={token}
            user={user}
            onBackToDashboard={handleGoToDashboard}
            onLogout={handleLogout}
            darkMode={darkMode}
            toggleDarkMode={toggleDarkMode}
            onGoToReferral={handleGoToReferral}
            showToast={showToast}
          />
        </div>
        <div style={notetakerStyle}>
          <Notetaker
            token={token}
            user={user}
            onLogout={handleLogout}
            onBackToLanding={handleBackToLanding}
            onGoToPanel={handleGoToPanel}
            onGoToVoiceAgent={handleGoToVoiceAgent}
            onGoToUpload={handleGoToUpload}
            onGoToDashboard={handleGoToDashboard}
            onGoToProfile={handleGoToProfile}
            showToast={showToast}
            darkMode={darkMode}
            toggleDarkMode={toggleDarkMode}
            windowType={windowType}
          />
        </div>
        <div style={voiceAgentStyle}>
          <VoiceAgent
            token={token}
            user={user}
            onLogout={handleLogout}
            onBackToLanding={handleBackToLanding}
            onGoToPanel={handleGoToPanel}
            onGoToNotetaker={handleGoToNotetaker}
            onGoToUpload={handleGoToUpload}
            onGoToDashboard={handleGoToDashboard}
            onGoToProfile={handleGoToProfile}
            showToast={showToast}
            darkMode={darkMode}
            toggleDarkMode={toggleDarkMode}
            windowType={windowType}
          />
        </div>
        <div style={uploadStyle}>
          <Upload
            token={token}
            user={user}
            onLogout={handleLogout}
            onBackToLanding={handleBackToLanding}
            onGoToPanel={handleGoToPanel}
            onGoToNotetaker={handleGoToNotetaker}
            onGoToVoiceAgent={handleGoToVoiceAgent}
            onGoToDashboard={handleGoToDashboard}
            onGoToProfile={handleGoToProfile}
            showToast={showToast}
            darkMode={darkMode}
            toggleDarkMode={toggleDarkMode}
            windowType={windowType}
          />
        </div>
        <div style={dashboardStyle}>
          <Dashboard
            token={token}
            user={user}
            onLogout={handleLogout}
            onBackToLanding={handleBackToLanding}
            onGoToPanel={handleGoToPanel}
            onGoToNotetaker={handleGoToNotetaker}
            onGoToVoiceAgent={handleGoToVoiceAgent}
            onGoToUpload={handleGoToUpload}
            onGoToReferral={handleGoToReferral}
            onGoToProfile={handleGoToProfile}
            showToast={showToast}
            darkMode={darkMode}
            toggleDarkMode={toggleDarkMode}
            windowType={windowType}
          />
        </div>
        <div style={profileStyle}>
          <Profile
            token={token}
            user={user}
            onLogout={handleLogout}
            onBackToLanding={handleBackToLanding}
            onGoToPanel={handleGoToPanel}
            onGoToNotetaker={handleGoToNotetaker}
            onGoToVoiceAgent={handleGoToVoiceAgent}
            onGoToUpload={handleGoToUpload}
            onGoToDashboard={handleGoToDashboard}
            onGoToProfile={handleGoToProfile}
            showToast={showToast}
            darkMode={darkMode}
            toggleDarkMode={toggleDarkMode}
            windowType={windowType}
          />
        </div>
      </>
    );

    // Default fallback
    return (
      <LandingPage
        token={token}
        user={user}
        onLogout={handleLogout}
        onGoToPanel={handleGoToPanel}
        onGoToNotetaker={handleGoToNotetaker}
        showToast={showToast}
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
        onLoginSuccess={(tok, usr, redirectTarget) => {
          setToken(tok);
          setUser(usr);
          localStorage.setItem('auth_token', tok);
          if (usr) localStorage.setItem('auth_user', JSON.stringify(usr));
          
          let targetView = redirectTarget || 'auth';
          if (targetView !== 'auth' && targetView !== 'notetaker' && targetView !== 'overlay') {
            targetView = 'auth';
          }
          
          setWindowType(targetView);
          
          if (ipcRenderer) {
            ipcRenderer.send('auth-login-success', { token: tok, user: usr, targetView });
          }
        }}
      />
    );
  };

  const handleHelpNavigate = useCallback((targetView) => {
    if (!token) return;
    const allowed = ['overlay', 'notetaker', 'voice-agent', 'upload', 'dashboard','referral'];
    if (!allowed.includes(targetView)) return;
    setWindowType(targetView);
    if (ipcRenderer) {
      ipcRenderer.send('auth-login-success', { token, user, targetView });
    }
  }, [token, user]);

  return (
    <>
      {renderView()}
      <HelpChatbot isLoggedIn={!!token}
        darkMode={darkMode}
        windowType={windowType}
        onNavigate={token ? handleHelpNavigate : null}
      />
      {toastMessage && (
        <div className="custom-toast-notification">
          <i className="fa-solid fa-circle-info"></i>
          <span>{typeof toastMessage === 'string' ? toastMessage : String(toastMessage?.message || toastMessage || '')}</span>
        </div>
      )}
    </>
  );
}

