import React from 'react';
import './Dashboard.css';
import AccountDropdown from './UserProfile/AccountDropdown';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

export default function Dashboard({
  token,
  user,
  onLogout,
  onBackToLanding,
  onGoToPanel,
  onGoToNotetaker,
  onGoToVoiceAgent,
  onGoToUpload,
  onGoToReferral,
  onGoToProfile,
  onGoToSubscription,
  onGoToUsage,
  showToast,
  darkMode,
  toggleDarkMode,
  windowType
}) {
  const handleMinimize = () => ipcRenderer?.send('window-minimize');
  const handleMaximize = () => ipcRenderer?.send('window-maximize');
  const handleClose = () => ipcRenderer?.send('window-close');

  const userName = user?.name || user?.email?.split('@')[0] || 'User';

  const cards = [
    {
      title: 'AI Copilot',
      description: 'Get real-time speech transcription, instant answer panel suggestions, and teleprompter tips during your live interviews.',
      icon: 'fa-solid fa-rocket',
      action: onGoToPanel,
      buttonText: 'Open Copilot',
      colorClass: 'copilot-card'
    },
    {
      title: 'Notetaker',
      description: 'Record meetings to auto-generate detailed summaries, follow-up feedback, transcripts, and study notes.',
      icon: 'fa-solid fa-microphone',
      action: onGoToNotetaker,
      buttonText: 'Open Notetaker',
      colorClass: 'notetaker-card'
    },
    {
      title: 'Voice Agent',
      description: 'Practice mock interviews voice-to-voice with an interactive AI interviewer to refine your verbal skills.',
      icon: 'fa-solid fa-robot',
      action: onGoToVoiceAgent,
      buttonText: 'Start Session',
      colorClass: 'voice-card'
    },
    {
      title: 'Media Upload',
      description: 'Upload audio or video files to transcribe the speech and chat directly with Grok about the contents.',
      icon: 'fa-solid fa-cloud-arrow-up',
      action: onGoToUpload,
      buttonText: 'Upload File',
      colorClass: 'upload-card'
    },
    {
      title: 'Refer & Earn',
      description: 'Invite friends, grow your circle, and unlock exclusive rewards through referrals.',
      icon: 'fa-solid fa-gift',
      action: onGoToReferral,
      buttonText: 'Refer & Earn',
      colorClass: 'referral-card'
    },
    {
      title: 'Plans & Subscription',
      description: 'Review active limits, monitor real-time usage quotas, and manage your tier and upgrades.',
      icon: 'fa-solid fa-crown',
      action: onGoToSubscription,
      buttonText: 'View Plans',
      colorClass: 'subscription-card'
    }
  ];

  return (
    <div className={`interview-panel-root dashboard-page-root ${darkMode ? 'dark-theme' : ''}`}>
      {/* Titlebar for Electron Drag */}
      <div className="window-titlebar">
        <div className="window-title">
          <i className="fa-solid fa-chart-line"></i> Dashboard | My Interview Copilot
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
          <button className="setup-tab-item active" type="button">
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
            onLogout={onLogout}
            showToast={showToast}
          />
        </div>
      </header>

      {/* Dashboard Main Content */}
      <main className="dashboard-content-container">
        <div className="dashboard-welcome-banner">
          <h1>Welcome back, {userName}!</h1>
          <p>Select one of your integrated features below to get started with your preparation.</p>
        </div>

        {/* 4 Feature Cards Grid */}
        <div className="dashboard-cards-grid">
          {cards.map((card, idx) => (
            <div key={idx} className={`dashboard-feature-card ${card.colorClass}`}>
              <div className="card-icon-container">
                <i className={card.icon}></i>
              </div>
              <h2 className="card-title">{card.title}</h2>
              <p className="card-description">{card.description}</p>
              <button onClick={card.action} className="card-action-button" type="button">
                {card.buttonText} <i className="fa-solid fa-chevron-right"></i>
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
