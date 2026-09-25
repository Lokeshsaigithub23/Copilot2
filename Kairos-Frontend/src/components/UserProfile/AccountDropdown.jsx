import React, { useState, useEffect, useRef } from 'react';
import './AccountDropdown.css';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

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

export default function AccountDropdown({
  user,
  onGoToProfile,
  onLogout,
  showToast,
  isActive
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const initials = getInitials(user?.name, user?.email);
  const displayName = user?.name || user?.email?.split('@')[0] || 'Varanasi Sathwika';

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleProfileClick = () => {
    setIsOpen(false);
    if (onGoToProfile) onGoToProfile();
  };

  const handleTutorialsClick = () => {
    setIsOpen(false);
    if (showToast) showToast('Tutorials are coming soon!');
  };

  const handleDesktopAppClick = () => {
    setIsOpen(false);
    if (ipcRenderer) {
      ipcRenderer.send('window-focus');
      if (showToast) showToast('Desktop App is currently active.');
    } else {
      if (showToast) showToast('My Interview Copilot desktop app is available for download.');
    }
  };

  const handlePlanClick = () => {
    setIsOpen(false);
    if (onGoToProfile) onGoToProfile();
  };

  const handleLogoutClick = () => {
    setIsOpen(false);
    if (onLogout) onLogout();
  };

  return (
    <div className="account-dropdown-container" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className={`setup-logout-btn setup-profile-btn ${isActive || isOpen ? 'active' : ''}`}
        type="button"
        title={displayName}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span className="setup-profile-initials">{initials}</span>
        <i className={`fa-solid fa-chevron-down account-dropdown-arrow ${isOpen ? 'open' : ''}`}></i>
      </button>

      {isOpen && (
        <div className="account-dropdown-menu" role="menu">
          <button
            onClick={handleProfileClick}
            className="account-menu-item"
            role="menuitem"
            type="button"
          >
            <i className="fa-regular fa-user account-menu-icon"></i>
            <span>Profile</span>
          </button>

          <div className="account-menu-divider"></div>

          <button
            onClick={handleTutorialsClick}
            className="account-menu-item"
            role="menuitem"
            type="button"
          >
            <i className="fa-solid fa-video account-menu-icon"></i>
            <span>Tutorials</span>
          </button>

          <div className="account-menu-divider"></div>

          <button
            onClick={handleDesktopAppClick}
            className="account-menu-item"
            role="menuitem"
            type="button"
          >
            <i className="fa-solid fa-desktop account-menu-icon"></i>
            <span>Open Desktop App</span>
          </button>

          <button
            onClick={handlePlanClick}
            className="account-menu-item"
            role="menuitem"
            type="button"
          >
            <i className="fa-regular fa-credit-card account-menu-icon"></i>
            <span>Plan &amp; Subscription</span>
          </button>

          <div className="account-menu-divider"></div>

          <button
            onClick={handleLogoutClick}
            className="account-menu-item account-menu-logout"
            role="menuitem"
            type="button"
          >
            <i className="fa-solid fa-arrow-right-from-bracket account-menu-icon"></i>
            <span>Log Out</span>
          </button>
        </div>
      )}
    </div>
  );
}
