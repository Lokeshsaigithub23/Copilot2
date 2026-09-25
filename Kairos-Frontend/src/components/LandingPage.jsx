import React, { useState, useEffect, useRef } from 'react';
import {
  clearFirebaseSession,
  getGoogleSignInErrorMessage,
  signInWithGoogle
} from '../auth/firebase';
import AccountDropdown from './UserProfile/AccountDropdown';
import { API_BASE } from '../utils/api';

// Electron IPC connection if running under Electron
const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

// Backend API Base URL
export default function LandingPage({ token, user, onLogout,onGoToReferral,onGoToPanel, onGoToNotetaker, onGoToVoiceAgent, onGoToUpload, onGoToDashboard, onGoToProfile, onLoginSuccess, showToast, darkMode, toggleDarkMode }) {
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('login'); // 'login' or 'register'
  const [activeSlide, setActiveSlide] = useState(0);
  const [activeFaq, setActiveFaq] = useState(null);
  const [loginRedirectTarget, setLoginRedirectTarget] = useState('overlay');
  
  // Auth Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [submitDisabled, setSubmitDisabled] = useState(false);
  const [message, setMessage] = useState('');
  const [messageColor, setMessageColor] = useState('#ffb4a3'); // default error color

  const sliderContainerRef = useRef(null);

  // Electron Titlebar Controls
  const handleMinimize = () => {
    if (ipcRenderer) ipcRenderer.send('window-minimize');
  };

  const handleMaximize = () => {
    if (ipcRenderer) ipcRenderer.send('window-maximize');
  };

  const handleClose = () => {
    if (ipcRenderer) ipcRenderer.send('window-close');
  };

  // Modal open helper
  const openModal = (mode = 'login') => {
    setModalMode(mode);
    setShowModal(true);
    setMessage('');
  };

  const closeModal = () => {
    setShowModal(false);
    setEmail('');
    setPassword('');
    setName('');
    setMessage('');
    setSubmitDisabled(false);
  };

  const handleActionClick = (action) => {
    const actionStr = typeof action === 'string' ? action : '';
    const isMockup = ['resume', 'radar', 'dashboard', 'meetings', 'history', 'reminders', 'community', 'mock_interview'].includes(actionStr);

    if (isMockup) {
      const messages = {
        resume: 'Resume Builder is coming soon!',
        radar: 'Job Radar is coming soon!',
        dashboard: 'Dashboard feature is coming soon!',
        meetings: 'Meetings scheduler is coming soon!',
        history: 'History log is coming soon!',
        reminders: 'Reminders scheduling feature is coming soon!',
        community: 'Community portal is coming soon!',
        mock_interview: 'Mock Interview feature is coming soon!'
      };
      if (showToast) {
        showToast(messages[actionStr] || 'This feature is coming soon!');
      } else {
        alert(messages[actionStr] || 'This feature is coming soon!');
      }
      return;
    }

    if (token) {
      if (actionStr === 'notetaker') {
        if (onGoToNotetaker) onGoToNotetaker();
      } else {
        if (onGoToPanel) onGoToPanel();
      }
    } else {
      const target = actionStr === 'notetaker' ? 'notetaker' : (actionStr === 'auth' ? 'auth' : 'overlay');
      setLoginRedirectTarget(target);
      openModal('register');
    }
  };

  const handleGoogleSignIn = async () => {
    setSubmitDisabled(true);
    setMessageColor('#d9e7fc');
    setMessage('Opening Google sign-in...');

    try {
      const idToken = await signInWithGoogle();
      const response = await fetch(`${API_BASE}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          referralCode: referralCode.trim().toUpperCase()
        })
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok || !payload?.token) {
        throw new Error(
          payload?.error?.message || 'Google sign-in could not be completed.'
        );
      }

      setMessage('');
      if (ipcRenderer) {
        ipcRenderer.send('auth-login-success', {
          token: payload.token,
          user: payload.user || null,
          targetView: loginRedirectTarget
        });
      }
      if (onLoginSuccess) {
        onLoginSuccess(payload.token, payload.user || null, loginRedirectTarget);
      }
      closeModal();
    } catch (err) {
      try {
        await clearFirebaseSession();
      } catch {
        // Preserve the original sign-in error if Firebase cleanup also fails.
      }

      setSubmitDisabled(false);
      setMessageColor('#ffb4a3');
      setMessage(
        err?.code
          ? getGoogleSignInErrorMessage(err)
          : err?.message || 'Google sign-in failed. Please try again.'
      );
    }
  };

  // Form submission handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    const emailVal = email.trim();
    const passVal = password;
    const nameVal = name.trim();

    if (!emailVal || !passVal || (modalMode === 'register' && !nameVal)) {
      setMessageColor('#ffb4a3');
      setMessage('Please fill out all required fields.');
      return;
    }

    setSubmitDisabled(true);
    setMessageColor('#ffb4a3');
    setMessage(modalMode === 'login' ? 'Signing in...' : 'Creating account...');

    try {
      if (modalMode === 'login') {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailVal, password: passVal }),
        });
        
        let payload = null;
        try {
          payload = await response.json();
        } catch (_) {
          payload = null;
        }

        if (!response.ok) {
          const code = payload?.code || payload?.error?.code || '';
          if (response.status === 401) throw new Error('Invalid email or password.');
          if (response.status === 400) throw new Error(payload?.message || 'Invalid input.');
          throw new Error(payload?.message || 'Login failed.');
        }

        if (!payload?.token) throw new Error('No token in response.');

        setMessage('');
        if (ipcRenderer) {
          ipcRenderer.send('auth-login-success', {
            token: payload.token,
            user: payload.user || null,
            targetView: loginRedirectTarget
          });
        }
        if (onLoginSuccess) {
          onLoginSuccess(payload.token, payload.user || null, loginRedirectTarget);
        }
        closeModal();
      } else {
        // Register flow
        const response = await fetch(`${API_BASE}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailVal, password: passVal, name: nameVal, referralCode: referralCode.trim().toUpperCase() }),
        });

        let payload = null;
        try {
          payload = await response.json();
        } catch (_) {
          payload = null;
        }

        if (!response.ok) {
          const errMsg = payload?.error?.message || payload?.message || '';
          if (response.status === 400 && (errMsg.includes('registered') || errMsg.includes('exist'))) {
            setMessage('Account already exists. Signing you in...');
            const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: emailVal, password: passVal }),
            });
            let loginPayload = null;
            try {
              loginPayload = await loginRes.json();
            } catch (_) {}

            if (loginRes.ok && loginPayload?.token) {
              setMessage('');
              if (ipcRenderer) {
                ipcRenderer.send('auth-login-success', {
                  token: loginPayload.token,
                  user: loginPayload.user || null,
                  targetView: loginRedirectTarget
                });
              }
              if (onLoginSuccess) {
                onLoginSuccess(loginPayload.token, loginPayload.user || null, loginRedirectTarget);
              }
              closeModal();
              return;
            }
          }
          throw new Error(errMsg || 'Registration failed.');
        }

        // Registration successful.
        // Do not auto-login because the backend requires email verification.
        setMessageColor('#4ade80');
        setMessage(
          payload?.message ||
          'Account created successfully. Please verify your email before signing in.'
        );

        setTimeout(() => {
          setModalMode('login');
          setPassword('');
          setSubmitDisabled(false);
          setMessage('');
        }, 2500);
      }
    } catch (err) {
      setSubmitDisabled(false);
      setMessageColor('#ffb4a3');
      setMessage(err?.message || 'Operation failed.');
    }
  };

  // Read referral code from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = String(params.get('ref') || '').trim().toUpperCase();

    if (ref) {
      setReferralCode(ref);
    }
  }, []);

  // Scroll Sync with Side Dot indicators
  useEffect(() => {
    const container = sliderContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const slides = container.querySelectorAll('.slide');
      let currentIdx = 0;
      let minDiff = Infinity;
      const containerTop = container.getBoundingClientRect().top;

      slides.forEach((slide, idx) => {
        const slideTop = slide.getBoundingClientRect().top;
        const diff = Math.abs(slideTop - containerTop);
        if (diff < minDiff) {
          minDiff = diff;
          currentIdx = idx;
        }
      });
      setActiveSlide(currentIdx);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSlide = (idx) => {
    const container = sliderContainerRef.current;
    if (!container) return;
    const slides = container.querySelectorAll('.slide');
    const target = slides[idx];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSlide(idx);
    }
  };

  // Toggle FAQ Accordion
  const toggleFaq = (idx) => {
    setActiveFaq(activeFaq === idx ? null : idx);
  };

  return (
    <div className="landing-page-root">
      {/* Titlebar for Electron Drag */}
      <div className="window-titlebar">
        <div className="window-title">
          <i className="fa-solid fa-brain"></i> Login | My Interview Copilot
        </div>
        <div className="window-controls">
          <button className="win-btn win-btn-minimize" onClick={handleMinimize} title="Minimize">—</button>
          <button className="win-btn win-btn-maximize" onClick={handleMaximize} title="Maximize">▢</button>
          <button className="win-btn win-btn-close" onClick={handleClose} title="Close">×</button>
        </div>
      </div>

      {/* Shared fixed header */}
      <header className="app-header">
        <div className="logo-container" onClick={() => scrollToSlide(0)}>
          <div className="logo-icon"><i className="fa-solid fa-brain"></i></div>
          <div className="logo-text">My Interview Copilot</div>
        </div>
        {token && user ? (
          <>
            <nav className="setup-navbar-tabs">
              <button onClick={() => scrollToSlide(0)} className="setup-tab-item active" type="button">
                <i className="fa-solid fa-house"></i> Home
              </button>
              <button onClick={onGoToDashboard} className="setup-tab-item" type="button">
                <i className="fa-solid fa-chart-line"></i> Dashboard
              </button>
              <button onClick={() => handleActionClick('mock_interview')} className="setup-tab-item" type="button">
                <i className="fa-solid fa-video"></i> Mock Interview
              </button>
              <button onClick={() => handleActionClick('meetings')} className="setup-tab-item" type="button">
                <i className="fa-solid fa-calendar-days"></i> Meetings
              </button>
              <button onClick={() => handleActionClick('history')} className="setup-tab-item" type="button">
                <i className="fa-solid fa-clock-rotate-left"></i> History
              </button>
              <button onClick={() => handleActionClick('reminders')} className="setup-tab-item" type="button">
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
              <button
                onClick={onGoToReferral}
                className="setup-action-btn btn-referral"
                type="button"
              >
                <i className="fa-solid fa-gift"></i> Refer & Earn
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
              />
            </div>
          </>
        ) : (
          <div className="nav-actions">
            <button className="btn-started" onClick={() => { setLoginRedirectTarget('auth'); openModal('register'); }}>
              <i className="fa-solid fa-play"></i> Get Started Free
            </button>
            <button className="btn-login" onClick={() => { setLoginRedirectTarget('auth'); openModal('login'); }}>Login</button>
            <div className="lang-picker">
              <i className="fa-solid fa-globe"></i> US EN
            </div>
          </div>
        )}
      </header>

      {/* Slide Navigation Dots */}
      <div className="slider-dots">
        {[
          { name: 'Welcome' },
          { name: 'Features' },
          { name: 'Reminders' },
          { name: 'Careers' },
          { name: 'Community' },
          { name: 'Get Ready & FAQ' }
        ].map((s, idx) => (
          <div
            key={idx}
            className={`dot ${activeSlide === idx ? 'active' : ''}`}
            onClick={() => scrollToSlide(idx)}
            title={s.name}
          />
        ))}
      </div>

      {/* Fixed footer strip (hidden on Slide 6) */}
      {activeSlide !== 5 && (
        <footer className="app-footer">
          <div className="footer-left">
            <span className="footer-badge"><i className="fa-solid fa-lock"></i> Privacy-first AI</span>
            <span>• Personal use only</span>
            <span>• You control &amp; delete your data anytime</span>
          </div>
          <div className="footer-right">
            <a href="#" onClick={(e) => e.preventDefault()}>Privacy</a>
            <a href="#" onClick={(e) => e.preventDefault()}>Terms</a>
            <a href="#" onClick={(e) => e.preventDefault()}>Support</a>
          </div>
        </footer>
      )}

      {/* Scroll Snapping Container */}
      <div className="slider-container" ref={sliderContainerRef}>
        
        {/* Slide 1: Hero */}
        <section className="slide" id="slide1">
          <div className="hero-left">
            <div className="badge-coach">
              <i className="fa-solid fa-bolt"></i> AI-Powered Interview Coach
            </div>
            <h1 className="hero-title">
              Interview Smarter<br /><span>with Your AI Copilot</span>
            </h1>
            <p className="hero-desc">
              Thousands of candidates have already used our AI interviews and report highly positive, confidence-boosting feedback on their performance.
            </p>
            
            <div className="rating-row">
              <div className="avatar-stack">
                <img className="avatar" src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=50&h=50&fit=crop&crop=faces" alt="U1" />
                <img className="avatar" src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=50&h=50&fit=crop&crop=faces" alt="U2" />
                <img className="avatar" src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=50&h=50&fit=crop&crop=faces" alt="U3" />
                <img className="avatar" src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=50&h=50&fit=crop&crop=faces" alt="U4" />
                <img className="avatar" src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=50&h=50&fit=crop&crop=faces" alt="U5" />
              </div>
              <div className="rating-text">
                50K+ <span>users</span>
              </div>
              <div className="stars">
                <i className="fa-solid fa-star"></i>
                <i className="fa-solid fa-star"></i>
                <i className="fa-solid fa-star"></i>
                <i className="fa-solid fa-star"></i>
                <i className="fa-solid fa-star"></i>
              </div>
              <div className="rating-text" style={{ fontWeight: 500, fontSize: '12.5px', color: '#64748b' }}>
                4.9/5 rating
              </div>
            </div>

            <button className="hero-cta-btn" onClick={() => handleActionClick('copilot')}>
              <i className="fa-solid fa-bolt"></i> {token ? 'Go to Skill Selection' : 'Sign up free – no credit card'} <i className="fa-solid fa-arrow-right" style={{ marginLeft: '4px' }}></i>
            </button>
            
            <div className="hero-cta-sub">
              <i className="fa-solid fa-circle-check" style={{ color: '#10b981' }}></i> Instant Access — <span>start free</span>, no payment details required
            </div>

            <div className="features-list-row">
              <span><i className="fa-solid fa-circle"></i> Real-time AI Feedback</span>
              <span><i className="fa-solid fa-circle"></i> Speech Recognition</span>
              <span><i className="fa-solid fa-circle"></i> Instant Results</span>
            </div>
          </div>
          
        </section>

        {/* Slide 2: Feature Columns */}
        <section className="slide" id="slide2">
          <div className="grid-4">
            {/* Card 1 */}
            <div className="card-feature">
              <span className="card-badge badge-orange">POPULAR</span>
              <h2 className="card-title">AI Interview Copilot</h2>
              <p className="card-desc">Get real-time answer suggestions during practice interviews — with multiple response options.</p>
              <ul className="card-bullets">
                <li><i className="fa-solid fa-circle-check"></i> Multi-answer suggestions</li>
                <li><i className="fa-solid fa-circle-check"></i> Confidence feedback</li>
                <li><i className="fa-solid fa-circle-check"></i> Copy &amp; save best response</li>
              </ul>
              <span className="card-best-for best-blue">Best for: Live practice</span>
              <button className="card-btn btn-gradient" onClick={() => handleActionClick('copilot')}>Start Copilot <i className="fa-solid fa-arrow-right"></i></button>
            </div>

            {/* Card 2 */}
            <div className="card-feature">
              <span className="card-badge badge-green">NEW</span>
              <h2 className="card-title">Smart Notetaker</h2>
              <p className="card-desc">Automatically capture questions, answers, and key feedback with timestamps.</p>
              <ul className="card-bullets">
                <li><i className="fa-solid fa-circle-check"></i> Speaker labels</li>
                <li><i className="fa-solid fa-circle-check"></i> Live notes</li>
                <li><i className="fa-solid fa-circle-check"></i> Export to PDF</li>
              </ul>
              <span className="card-best-for best-green">Best for: Calls &amp; mock interviews</span>
              <button className="card-btn btn-dark" onClick={() => handleActionClick('notetaker')}>Open Notetaker <i className="fa-solid fa-arrow-right"></i></button>
            </div>

            {/* Card 3 */}
            <div className="card-feature">
              <span className="card-badge badge-purple">AI</span>
              <h2 className="card-title">Resume Builder</h2>
              <p className="card-desc">Optimize your resume with ATS scoring, keyword analysis, and AI suggestions.</p>
              <ul className="card-bullets">
                <li><i className="fa-solid fa-circle-check"></i> ATS keyword gaps</li>
                <li><i className="fa-solid fa-circle-check"></i> Tailored bullet rewrites</li>
                <li><i className="fa-solid fa-circle-check"></i> Version history</li>
              </ul>
              <span className="card-info">ATS scores are estimates and don't guarantee hiring outcomes.</span>
              <span className="card-best-for best-purple">Best for: Resume upgrades</span>
              <button className="card-btn btn-dark" onClick={() => handleActionClick('resume')}>Improve Resume <i className="fa-solid fa-arrow-right"></i></button>
            </div>

            {/* Card 4 */}
            <div className="card-feature">
              <h2 className="card-title">Job Radar</h2>
              <p className="card-desc">
                Find relevant jobs based on your location, skills, and preferences.
              </p>

              <ul className="card-bullets">
                <li><i className="fa-solid fa-circle-check"></i> IP-based location + manual</li>
                <li><i className="fa-solid fa-circle-check"></i> Filter by remote/hybrid</li>
                <li><i className="fa-solid fa-circle-check"></i> Save jobs &amp; alerts</li>
              </ul>

              <span className="card-best-for best-cyan">
                Best for: Finding roles fast
              </span>

              <button
                className="card-btn btn-dark"
                onClick={() => handleActionClick('radar')}
              >
                Discover Jobs <i className="fa-solid fa-arrow-right"></i>
              </button>
            </div>

            {/* Card 5 - Refer & Earn */}
            <div className="card-feature referral-feature-card">

              <div className="referral-card-icon">
                <i className="fa-solid fa-gift"></i>
              </div>

              <span className="card-badge badge-green">REWARDS</span>

              <h2 className="card-title">Refer &amp; Earn</h2>

              <p className="card-desc">
                Invite friends, grow your circle, and unlock exclusive rewards
                as your community grows.
              </p>

              <ul className="card-bullets">
                <li>
                  <i className="fa-solid fa-circle-check"></i>
                  Share your personal referral code
                </li>
                <li>
                  <i className="fa-solid fa-circle-check"></i>
                  Earn referral rewards
                </li>
                <li>
                  <i className="fa-solid fa-circle-check"></i>
                  Unlock community features
                </li>
              </ul>

              <span className="card-best-for best-green">
                Best for: Growing your circle
              </span>

              <button
                className="card-btn referral-card-btn home-referral-action-button"
                onClick={() => {
                  if (token) {
                    onGoToReferral();
                  } else {
                    setLoginRedirectTarget('auth');
                    openModal('register');
                  }
                }}
              >
                Refer &amp; Earn <i className="fa-solid fa-arrow-right"></i>
              </button>
            </div>
            </div>
        </section>

        {/* Slide 3: Reminders */}
        <section className="slide" id="slide3">
          <div className="slide-header">
            <h2 className="slide-title">Schedule reminders <span>anytime, anywhere</span></h2>
            <p className="slide-subtitle">Voice calls, emails, SMS, or push notifications — pick how you want to be reminded and let us handle the rest.</p>
          </div>

          <div className="grid-4" style={{ maxWidth: '1000px' }}>
            {/* Reminder 1 */}
            <div className="card-reminder">
              <h3 className="card-title" style={{ fontSize: '15px', marginBottom: '4px' }}>Voice Call</h3>
              <p className="card-desc" style={{ fontSize: '11.5px', minHeight: '40px', marginBottom: '8px' }}>Get a phone call reminder before high-stakes interviews.</p>
              <div className="reminder-time"><i className="fa-regular fa-clock"></i> 5, 15, 30 min before</div>
              <span className="card-best-for best-blue" style={{ marginBottom: '14px', fontSize: '10px' }}>Best for: High-stakes interviews</span>
              <button className="btn-reminder-toggle btn-rem-disable" onClick={() => handleActionClick('reminders')}>Tap to enable</button>
            </div>

            {/* Reminder 2 */}
            <div className="card-reminder">
              <span className="reminder-badge">ON</span>
              <h3 className="card-title" style={{ fontSize: '15px', marginBottom: '4px' }}>Email</h3>
              <p className="card-desc" style={{ fontSize: '11.5px', minHeight: '40px', marginBottom: '8px' }}>Branded emails with prep tips delivered to your inbox.</p>
              <div className="reminder-time"><i className="fa-regular fa-calendar-check"></i> Calendar invites attached</div>
              <span className="card-best-for best-blue" style={{ marginBottom: '14px', fontSize: '10px' }}>Best for: Daily prep reminders</span>
              <button className="btn-reminder-toggle btn-rem-enable" onClick={() => handleActionClick('reminders')}><i className="fa-solid fa-circle-check"></i> Selected</button>
            </div>

            {/* Reminder 3 */}
            <div className="card-reminder">
              <h3 className="card-title" style={{ fontSize: '15px', marginBottom: '4px' }}>SMS</h3>
              <p className="card-desc" style={{ fontSize: '11.5px', minHeight: '40px', marginBottom: '8px' }}>Instant texts that cut through the noise.</p>
              <div className="reminder-time"><i className="fa-solid fa-check"></i> Any carrier, any country</div>
              <span className="card-best-for best-blue" style={{ marginBottom: '14px', fontSize: '10px' }}>Best for: Last-minute alerts</span>
              <button className="btn-reminder-toggle btn-rem-disable" onClick={() => handleActionClick('reminders')}>Tap to enable</button>
            </div>

            {/* Reminder 4 */}
            <div className="card-reminder">
              <span className="reminder-badge">ON</span>
              <h3 className="card-title" style={{ fontSize: '15px', marginBottom: '4px' }}>Push</h3>
              <p className="card-desc" style={{ fontSize: '11.5px', minHeight: '40px', marginBottom: '8px' }}>Browser and mobile notifications on the go.</p>
              <div className="reminder-time"><i className="fa-solid fa-link"></i> One-tap join links</div>
              <span className="card-best-for best-blue" style={{ marginBottom: '14px', fontSize: '10px' }}>Best for: On-the-move updates</span>
              <button className="btn-reminder-toggle btn-rem-enable" onClick={() => handleActionClick('reminders')}><i className="fa-solid fa-circle-check"></i> Selected</button>
            </div>
          </div>

          <button className="btn-explore-schedule" onClick={() => handleActionClick('reminders')}>
            <i className="fa-solid fa-bolt"></i> Explore Full Scheduling <i className="fa-solid fa-arrow-right" style={{ marginLeft: '4px' }}></i>
          </button>
        </section>

        {/* Slide 4: Career Coach */}
        <section className="slide" id="slide4">
          <div className="slide-header">
            <h2 className="slide-title">AI Interview Coach for <span>Every Career</span></h2>
            <p className="slide-subtitle">Practice real interview questions with an AI coach that gives tailored questions, instant feedback, and guided support - so you feel confident and prepared for your next interview.</p>
          </div>

          <div className="career-grid">
            {/* Col 1 */}
            <div className="career-column">
              <h3 className="career-col-title">Engineering &amp; Tech</h3>
            </div>

            {/* Col 2 */}
            <div className="career-column">
              <h3 className="career-col-title">All Careers &amp; Industries</h3>
            </div>

            {/* Col 3 */}
            <div className="career-column">
              <h3 className="career-col-title">Freelancers &amp; Contractors</h3>
            </div>

            {/* Col 4 */}
            <div className="career-column">
              <h3 className="career-col-title">Career Changers</h3>
            </div>
          </div>

          {/* Stats row */}
          <div className="stats-row">
            <div className="stat-item">
              <div className="stat-icon stat-icon-blue"><i className="fa-solid fa-users"></i></div>
              <div className="stat-details">
                <span className="stat-val">12,983 +</span>
                <span className="stat-lbl">Happy Users</span>
              </div>
            </div>

            <div className="stat-item">
              <div className="stat-icon stat-icon-green"><i className="fa-solid fa-heart"></i></div>
              <div className="stat-details">
                <span className="stat-val">98.5%</span>
                <span className="stat-lbl">Satisfaction Rate</span>
              </div>
            </div>

            <div className="stat-item">
              <div className="stat-icon stat-icon-orange"><i className="fa-solid fa-thumbs-up"></i></div>
              <div className="stat-details">
                <span className="stat-val">4.9/5</span>
                <span className="stat-lbl">Average Rating</span>
              </div>
            </div>
          </div>
        </section>

        {/* Slide 5: Community in Action */}
        <section className="slide" id="slide5">
          <div className="community-layout">
            {/* Left activity column */}
            <div className="activity-feed">
              <h3 className="card-title" style={{ fontSize: '20px', borderLeft: '3px solid #10b981', paddingLeft: '8px', marginBottom: '8px' }}>Community in Action</h3>
              
              <div className="activity-item">
                <div className="activity-user">
                  <div className="user-avatar avatar-v">V</div>
                  <p className="activity-text"><strong>Valentina M.</strong> communicated their value clearly <span>Moments ago</span></p>
                </div>
                <i className="fa-solid fa-sparkles activity-icon"></i>
              </div>

              <div className="activity-item">
                <div className="activity-user">
                  <div className="user-avatar avatar-h">H</div>
                  <p className="activity-text"><strong>Hugo H.</strong> polished their project explanations <span>Moments ago</span></p>
                </div>
                <i className="fa-solid fa-sparkles activity-icon"></i>
              </div>

              <div className="activity-item">
                <div className="activity-user">
                  <div className="user-avatar avatar-j">J</div>
                  <p className="activity-text"><strong>Jack N.</strong> gained peace of mind before interviews <span>Moments ago</span></p>
                </div>
                <i className="fa-solid fa-sparkles activity-icon"></i>
              </div>

              <div className="activity-item">
                <div className="activity-user">
                  <div className="user-avatar avatar-l">L</div>
                  <p className="activity-text"><strong>Lorenzo W.</strong> discovered areas for improvement <span>Moments ago</span></p>
                </div>
                <i className="fa-solid fa-sparkles activity-icon"></i>
              </div>

              <div className="activity-item">
                <div className="activity-user">
                  <div className="user-avatar avatar-f">F</div>
                  <p className="activity-text"><strong>Felipe J.</strong> communicated their value clearly <span>Moments ago</span></p>
                </div>
                <i className="fa-solid fa-sparkles activity-icon"></i>
              </div>
            </div>

            {/* Right simulator card */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="sim-card">
                <div className="sim-country"><i className="fa-solid fa-heart" style={{ fontSize: '8px' }}></i> South Africa / Life-changing interview practice!</div>
                
                <div className="sim-profile">
                  <div className="sim-avatar">D</div>
                  <div>
                    <h4 className="sim-name">David C.</h4>
                    <p className="sim-role">DevOps Engineer</p>
                  </div>
                </div>
                
                <div className="stars" style={{ fontSize: '10px' }}>
                  <i className="fa-solid fa-star"></i>
                  <i className="fa-solid fa-star"></i>
                  <i className="fa-solid fa-star"></i>
                  <i className="fa-solid fa-star"></i>
                  <i className="fa-solid fa-star"></i>
                </div>
                
                <div className="sim-bubble">
                  <span style={{ fontSize: '9px', display: 'block', color: '#059669', textTransform: 'uppercase', fontWeight: 800, marginBottom: '2px' }}>AI Feedback</span>
                  Technical depth is amazing!
                </div>
                
                <div className="sim-score">
                  <span>Confidence Score</span>
                  <span className="sim-score-val">96%</span>
                </div>
                
                <div className="score-dots" style={{ alignSelf: 'flex-end' }}>
                  <span className="fill" style={{ background: '#2563eb' }}></span>
                  <span className="fill" style={{ background: '#2563eb' }}></span>
                  <span className="fill" style={{ background: '#2563eb' }}></span>
                  <span className="fill" style={{ background: '#2563eb' }}></span>
                  <span style={{ background: '#e2e8f0' }}></span>
                </div>

                <div className="carousel-indicators">
                  <span className="car-dot"></span>
                  <span className="car-dot"></span>
                  <span className="car-dot"></span>
                  <span className="car-dot"></span>
                  <span className="car-dot active"></span>
                </div>
              </div>
              
              <button className="btn-community" onClick={() => handleActionClick('community')}>Join the community</button>
            </div>
          </div>

          <div className="community-footer">
            <h4 className="footer-title">Trusted by Millions of Candidates Worldwide</h4>
            <p className="footer-desc">Loved by candidates from South Africa and 150+ countries</p>
          </div>
        </section>

        {/* Slide 6: Get Ready & FAQ */}
        <section className="slide" id="slide6">
          {/* Top banner */}
          <div className="cta-banner">
            <h2 className="banner-title">Get Interview-Ready With Your AI Copilot</h2>
            <p className="banner-subtitle">Candidates love it: quick, realistic AI interviews with instant feedback that boost your confidence for the real thing.</p>
            <button className="btn-banner-practice" onClick={() => handleActionClick('copilot')}>
              🚀 Practice My Interview Free
            </button>
            <div className="banner-pills">
              <span className="banner-pill"><i className="fa-solid fa-check"></i> No resume required</span>
              <span className="banner-pill"><i className="fa-solid fa-check"></i> No credit card</span>
              <span className="banner-pill"><i className="fa-solid fa-check"></i> Free sign-up</span>
            </div>
            <div className="banner-bullet">
              <span></span> Join thousands of candidates who landed their dream jobs
            </div>
          </div>

          {/* FAQ Section */}
          <div className="faq-section">
            <span className="badge-faq"><i className="fa-solid fa-circle-question"></i> Frequently Asked Questions</span>
            <h2 className="faq-title">Got Questions? We've Got Answers</h2>
            <p className="faq-subtitle">Everything you need to know about our AI interview practice tool</p>

            {/* Accordion */}
            <div className="faq-accordion">
              {[
                {
                  q: 'What is My Interview Copilot and how does it work?',
                  a: 'My Interview Copilot is an AI-powered desktop assistant designed to help you practice and excel in job interviews. It runs as an invisible overlay on your screen, transcribing your live practice session and generating real-time suggestions, notes, and professional answer feedback.'
                },
                {
                  q: 'Is this a real interview or just practice?',
                  a: 'It is a practice tool. It simulates realistic interview scenarios and coaches you to improve your structure, confidence, and content delivery before the actual high-stakes interview.'
                },
                {
                  q: 'What types of interviews can I practice?',
                  a: 'You can practice tech-focused engineering interviews, behavioral and leadership rounds, product management discussions, and general industry prep across various domains.'
                },
                {
                  q: 'Do I need to upload my resume to get started?',
                  a: 'No resume is required! You can simply enter the skills or roles you want to practice, and our AI will dynamically generate customized interview questions for you.'
                },
                {
                  q: 'Is it free to use?',
                  a: 'Yes, you can get started for free! No payment details or credit cards are required.'
                },
                {
                  q: 'How is my data and privacy protected?',
                  a: 'We take privacy very seriously. All practice data, transcripts, and audio recordings are securely encrypted and you have full control to delete them at any time.'
                }
              ].map((item, idx) => (
                <div key={idx} className={`faq-item ${activeFaq === idx ? 'active' : ''}`}>
                  <button className="faq-trigger" onClick={() => toggleFaq(idx)}>
                    {item.q}
                    <i className="fa-solid fa-chevron-down"></i>
                  </button>
                  <div className="faq-content">
                    <div className="faq-inner">
                      {item.a}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="faq-footer-meta">
              <span>Training-only AI interview practice. Not a real interview. No employer affiliation. No guarantees.</span>
              <span>© 2025 InterviewAI - Privacy - Terms</span>
            </div>
          </div>
        </section>

      </div>

      {/* Modal Authentication Popup */}
      {showModal && (
        <div className="auth-modal">
          <div className="auth-modal-overlay" onClick={closeModal}></div>
          <div className="auth-modal-card">
            <button className="auth-modal-close" onClick={closeModal}>&times;</button>
            <h1>{modalMode === 'login' ? 'Welcome Back' : 'Create Account'}</h1>
            <div className="sub">
              {modalMode === 'login' ? 'Sign in to continue to assistant' : 'Register to start using the assistant'}
            </div>

            <button
              className="google-auth-btn"
              type="button"
              disabled={submitDisabled}
              onClick={handleGoogleSignIn}
            >
              <i className="fa-brands fa-google" aria-hidden="true"></i>
              Continue with Google
            </button>

            <div className="auth-divider" aria-hidden="true">
              <span>or continue with email</span>
            </div>
            
            <form onSubmit={handleSubmit}>
              {modalMode === 'register' && (
                <div className="field">
                  <label htmlFor="name">Full Name</label>
                  <input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              )}
              {modalMode === 'register' && (
                <div className="field">
                  <label htmlFor="referralCode">Referral Code</label>
                  <input
                    id="referralCode"
                    type="text"
                    placeholder="Enter referral code"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    autoComplete="off"
                  />
                </div>
              )}
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <button className="auth-submit-btn" type="submit" disabled={submitDisabled}>
                {modalMode === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            </form>
            
            <div style={{ textAlign: 'center', marginTop: '18px', fontSize: '13.5px', color: '#94a3b8' }}>
              {modalMode === 'login' ? (
                <>
                  Don't have an account?{' '}
                  <span
                    onClick={() => {
                      setModalMode('register');
                      setMessage('');
                    }}
                    style={{ color: '#ff9f4a', cursor: 'pointer', textDecoration: 'underline', fontWeight: 'bold' }}
                  >
                    Sign Up
                  </span>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <span
                    onClick={() => {
                      setModalMode('login');
                      setMessage('');
                    }}
                    style={{ color: '#ff9f4a', cursor: 'pointer', textDecoration: 'underline', fontWeight: 'bold' }}
                  >
                    Sign In
                  </span>
                </>
              )}
            </div>
            {message && (
              <div id="msg" style={{ color: messageColor }}>
                {message}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
