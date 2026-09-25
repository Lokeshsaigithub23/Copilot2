import React, { useEffect, useMemo, useState } from 'react';
import './ReferralPage.css';
import { API_BASE } from '../../utils/api';

const MILESTONES = [
  {
    count: 1,
    title: 'First Friend',
    description: 'Invite your first friend',
    icon: 'fa-user-plus',
  },
  {
    count: 3,
    title: 'Growing Circle',
    description: 'Invite 3 friends',
    icon: 'fa-users',
  },
  {
    count: 5,
    title: 'Trading Squad',
    description: 'Invite 5 friends',
    icon: 'fa-people-group',
  },
  {
    count: 10,
    title: 'Top Circle',
    description: 'Invite 10 friends',
    icon: 'fa-trophy',
  },
];

export default function ReferralPage({
  token,
  user,
  onBackToDashboard,
  onLogout,
  darkMode,
  toggleDarkMode,
  showToast,
}) {
  const [referralData, setReferralData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const userName =
    user?.name ||
    user?.email?.split('@')[0] ||
    'Trader';

  const loadReferralData = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const [profileResponse, creditsResponse, rewardsResponse] =
        await Promise.all([
          fetch(`${API_BASE}/api/referrals/me`, {
            method: 'GET',
            headers,
          }),

          fetch(`${API_BASE}/api/referrals/credits`, {
            method: 'GET',
            headers,
          }),

          fetch(`${API_BASE}/api/referrals/rewards`, {
            method: 'GET',
            headers,
          }),
        ]);

      if (!profileResponse.ok) {
        throw new Error(
          `Referral profile API returned ${profileResponse.status}`
        );
      }

      const profileData = await profileResponse.json();

      const creditsData = creditsResponse.ok
        ? await creditsResponse.json()
        : {
            credits: {
              availableCredits: 0,
              pendingCredits: 0,
              lifetimeEarned: 0,
            },
            ledger: [],
          };

      const rewardsData = rewardsResponse.ok
        ? await rewardsResponse.json()
        : {
            qualifiedCount: 0,
            rewards: [],
          };

      setReferralData({
        ...profileData,
        credits: creditsData.credits || {},
        ledger: creditsData.ledger || [],
        rewards: rewardsData.rewards || [],
      });
    } catch (error) {
      console.error(
        '[ReferralPage] Unable to load referral data:',
        error
      );

      setReferralData(null);

      if (showToast) {
        showToast('Unable to load referral details');
      }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    loadReferralData();
  }, [token]);

  const profile = referralData?.profile || {};
  const codeInfo = referralData?.code || {};
  const creditInfo = referralData?.credits || {};

  const joinedCount = Number(profile.joinedCount || 0);
  const qualifiedCount = Number(profile.qualifiedCount || 0);

  const referralCode =
    profile.code ||
    codeInfo.code ||
    '';

  const referralUrl =
    codeInfo.shareUrl ||
    `https://myinterviewcopilot.com/?window=auth&ref=${encodeURIComponent(
      referralCode
    )}`;

  const referrerReward = Number(
    codeInfo.referrerCredits || 250
  );

  const refereeReward = Number(
    codeInfo.refereeCredits || 100
  );

  const availableCredits = Number(
    creditInfo.availableCredits || 0
  );

  const pendingCredits = Number(
    creditInfo.pendingCredits || 0
  );

  const lifetimeEarned = Number(
    creditInfo.lifetimeEarned || 0
  );

  const codeStatus = codeInfo.status || 'pending';

  const currentProgress = Math.min(qualifiedCount, 10);
  const progressPercent = Math.min(
    (currentProgress / 10) * 100,
    100
  );

  const nextMilestone = useMemo(() => {
    return MILESTONES.find((item) => qualifiedCount < item.count);
  }, [qualifiedCount]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);

      if (showToast) {
        showToast('Referral link copied!');
      }

      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy referral link:', error);

      if (showToast) {
        showToast('Unable to copy referral link');
      }
    }
  };

  const handleInvite = async () => {
    await handleCopy();

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join My Trading Circle',
          text: `Join me on My Interview Copilot using my referral link.`,
          url: referralUrl,
        });
      } catch (_) {
        // User closed the share dialog.
      }
    }
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(
      `Join my Trading Circle using my referral link: ${referralUrl}`
    );

    window.open(
      `https://wa.me/?text=${text}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handleTelegram = () => {
    const url = encodeURIComponent(referralUrl);
    const text = encodeURIComponent('Join my Trading Circle');

    window.open(
      `https://t.me/share/url?url=${url}&text=${text}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handleX = () => {
    const text = encodeURIComponent(
      `Join my Trading Circle: ${referralUrl}`
    );

    window.open(
      `https://twitter.com/intent/tweet?text=${text}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  return (
    <div className={`referral-page ${darkMode ? 'dark-theme' : ''}`}>
      <header className="referral-header">
        <div className="referral-header-left">
          <button
            type="button"
            className="referral-back-button"
            onClick={onBackToDashboard}
            title="Back to Dashboard"
          >
            <i className="fa-solid fa-arrow-left"></i>
          </button>

          <div>
            <div className="referral-breadcrumb">Dashboard</div>
            <h1>Refer & Earn</h1>
          </div>
        </div>

        <div className="referral-header-actions">
          <button
            type="button"
            className="referral-theme-button"
            onClick={toggleDarkMode}
          >
            <i
              className={`fa-solid ${
                darkMode ? 'fa-sun' : 'fa-moon'
              }`}
            ></i>
          </button>

          <button
            type="button"
            className="referral-logout-button"
            onClick={onLogout}
          >
            <i className="fa-solid fa-arrow-right-from-bracket"></i>
            Logout
          </button>
        </div>
      </header>

      <main className="referral-content">
        
        <section className="referral-hero">
          <div className="referral-hero-content">
            <span className="referral-eyebrow">
              <i className="fa-solid fa-gift"></i>
              Refer & Earn
            </span>

            <h2>Build Your Trading Circle</h2>

            <p>
              Invite friends, grow your circle, and unlock exclusive
              rewards as your community grows.
            </p>

            <div className="referral-user-greeting">
              Welcome, <strong>{userName}</strong>
            </div>
          </div>

          <div className="referral-hero-icon">
            <i className="fa-solid fa-users"></i>
          </div>
        </section>

        <section className="referral-progress-card">
          <div className="section-heading-row">
            <div>
              <span className="section-label">Trading Circle</span>
              <h2>
                {qualifiedCount}
                <span>/10 friends</span>
              </h2>
            </div>

            <div className="progress-percentage">
              {Math.round(progressPercent)}%
            </div>
          </div>

          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>

          <div className="progress-footer">
            <span>
              {joinedCount} joined · {qualifiedCount} qualified
            </span>

            {nextMilestone ? (
              <span>
                Next milestone: {nextMilestone.count} friends
              </span>
            ) : (
              <span>All milestones reached!</span>
            )}
          </div>
        </section>

        <section className="referral-section">
          <div className="section-title-block">
            <span className="section-label">Milestones</span>
            <h2>Unlock Community Rewards</h2>
            <p>
              Grow your qualified referrals to unlock permanent
              features.
            </p>
          </div>

          <div className="milestone-grid">
            {MILESTONES.map((milestone) => {
              const unlocked = qualifiedCount >= milestone.count;

              return (
                <div
                  key={milestone.count}
                  className={`milestone-card ${
                    unlocked ? 'unlocked' : ''
                  }`}
                >
                  <div className="milestone-icon">
                    <i className={`fa-solid ${milestone.icon}`}></i>
                  </div>

                  <div className="milestone-count">
                    {milestone.count}
                  </div>

                  <h3>{milestone.title}</h3>

                  <p>{milestone.description}</p>

                  <div className="milestone-status">
                    {unlocked ? (
                      <>
                        <i className="fa-solid fa-circle-check"></i>
                        Unlocked
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-lock"></i>
                        Locked
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="community-reward-banner">
          <div className="community-reward-icon">
            <i className="fa-solid fa-crown"></i>
          </div>

          <div>
            <span>Community Rewards</span>
            <h3>More friends. More unlocked features.</h3>
            <p>
              Your milestone progress is based on qualified
              referrals, not just signups.
            </p>
          </div>
        </section>

        <section className="active-friends-card">
          <div className="info-icon">
            <i className="fa-solid fa-circle-info"></i>
          </div>

          <div>
            <h3>What counts as an active friend?</h3>
            <p>
              A referral becomes qualified after completing the
              required activity and remaining active through the
              qualification period.
            </p>

            <button
              type="button"
              onClick={() =>
                showToast?.(
                  'Qualified referrals unlock your milestone rewards.'
                )
              }
            >
              Learn More
              <i className="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </section>

        <section className="referral-stats-section">
          <div className="referral-stat-card">
            <div className="referral-stat-icon">
              <i className="fa-solid fa-user-plus"></i>
            </div>

            <div>
              <span>Friends Joined</span>
              <strong>{joinedCount}</strong>
            </div>
          </div>

          <div className="referral-stat-card">
            <div className="referral-stat-icon">
              <i className="fa-solid fa-user-check"></i>
            </div>

            <div>
              <span>Qualified Referrals</span>
              <strong>{qualifiedCount}</strong>
            </div>
          </div>

          <div className="referral-stat-card">
            <div className="referral-stat-icon">
              <i className="fa-solid fa-coins"></i>
            </div>

            <div>
              <span>Available Credits</span>
              <strong>{availableCredits}</strong>
            </div>
          </div>

          <div className="referral-stat-card">
            <div className="referral-stat-icon">
              <i className="fa-solid fa-clock"></i>
            </div>

            <div>
              <span>Pending Credits</span>
              <strong>{pendingCredits}</strong>
            </div>
          </div>

        </section> 

        <section className="referral-code-section">

          <div className="section-title-block">
            <span className="section-label">Your Referral Code</span>
            <h2>{referralCode || 'Loading...'}</h2>

            <p>
              Share this code with your friends when they sign up.
            </p>
          </div>

          <div className="referral-code-card">

            <div className="referral-code-value">
              <i className="fa-solid fa-gift"></i>

              <strong>
                {loading ? 'Loading...' : referralCode || 'Unavailable'}
              </strong>
            </div>

            <button
              type="button"
              className="copy-button"
              disabled={!referralCode || loading}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(referralCode);

                  if (showToast) {
                    showToast('Referral code copied!');
                  }
                } catch (error) {
                  console.error('Failed to copy referral code:', error);

                  if (showToast) {
                    showToast('Unable to copy referral code');
                  }
                }
              }}
            >
              <i className="fa-solid fa-copy"></i>
              Copy Code
            </button>

          </div>

        </section>

        <section className="referral-earning-section">

          <div className="section-title-block">
            <span className="section-label">Referral Rewards</span>
            <h2>Earn More With Every Qualified Referral</h2>
            <p>
              Your friend receives credits when they join,
              and you earn credits when the referral qualifies.
            </p>
          </div>

          <div className="earning-grid">

            <div className="earning-card">
              <div className="earning-icon">
                <i className="fa-solid fa-user-plus"></i>
              </div>

              <span>Your Friend Gets</span>

              <strong>
                {refereeReward}
              </strong>

              <small>credits</small>
            </div>

            <div className="earning-card primary">
              <div className="earning-icon">
                <i className="fa-solid fa-coins"></i>
              </div>

              <span>You Earn</span>

              <strong>
                {referrerReward}
              </strong>

              <small>
                credits per qualified referral
              </small>
            </div>

            <div className="earning-card">
              <div className="earning-icon">
                <i className="fa-solid fa-chart-line"></i>
              </div>

              <span>Lifetime Earned</span>

              <strong>
                {lifetimeEarned}
              </strong>

              <small>credits</small>
            </div>

          </div>

        </section>


        <section className="referral-link-section">
          <div className="section-title-block">
            <span className="section-label">Your Referral Link</span>
            <h2>Invite Your Friends</h2>
            <p>
              Share your personal referral link and start building
              your circle.
            </p>
          </div>

          <div className="referral-link-card">
            <div className="referral-link-input">
              <i className="fa-solid fa-link"></i>
              <span>
                {loading
                  ? 'Loading...'
                  : referralUrl || 'Referral link unavailable'}
              </span>
            </div>

            <button
              type="button"
              className="copy-button"
              onClick={handleCopy}
              disabled={loading}
            >
              <i
                className={`fa-solid ${
                  copied ? 'fa-check' : 'fa-copy'
                }`}
              ></i>
              {copied ? 'Copied' : 'Copy'}
            </button>

            <button
              type="button"
              className="invite-button"
              onClick={handleInvite}
              disabled={loading || !referralUrl}
            >
              <i className="fa-solid fa-paper-plane"></i>
              Invite Now
            </button>
          </div>

          <div className="social-share-row">
            <button
              type="button"
              className="share-button whatsapp"
              onClick={handleWhatsApp}
            >
              <i className="fa-brands fa-whatsapp"></i>
              WhatsApp
            </button>

            <button
              type="button"
              className="share-button telegram"
              onClick={handleTelegram}
            >
              <i className="fa-brands fa-telegram"></i>
              Telegram
            </button>

            <button
              type="button"
              className="share-button x-share"
              onClick={handleX}
            >
              <i className="fa-brands fa-x-twitter"></i>
              X
            </button>

            <button
              type="button"
              className="share-button more"
              onClick={handleInvite}
            >
              <i className="fa-solid fa-share-nodes"></i>
              More
            </button>
          </div>
        </section>

      </main>
    </div>
  );
}