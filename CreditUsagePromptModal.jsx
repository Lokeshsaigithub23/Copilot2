import React, { useState, useEffect } from 'react';
import './CreditUsagePromptModal.css';
import {
  CREDIT_USAGE_CONFIG,
  getDownloadStatus,
  getCopilotStatus,
  getVoiceStatus
} from '../../config/creditUsageConfig';
import { getUserCredits } from '../subscription/transactionHistoryStore';
import { getActiveUserPlanTier } from '../subscription/topUpStore';

export default function CreditUsagePromptModal({
  isOpen,
  onClose,
  type = 'download', // 'download' | 'copilot' | 'voice'
  title,
  message,
  fileDetails = null, // e.g. { name: 'transcript.txt', type: 'PDF' }
  onConfirm,
  onTopUp,
  showToast
}) {
  const [credits, setCredits] = useState(getUserCredits());
  const [activeTier, setActiveTier] = useState(getActiveUserPlanTier());
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCredits(getUserCredits());
      setActiveTier(getActiveUserPlanTier());
      setIsProcessing(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleCreditsChange = (e) => {
      if (typeof e.detail === 'number') {
        setCredits(e.detail);
      } else {
        setCredits(getUserCredits());
      }
    };
    window.addEventListener('copilot-credits-updated', handleCreditsChange);
    return () => window.removeEventListener('copilot-credits-updated', handleCreditsChange);
  }, []);

  if (!isOpen) return null;

  // Determine configuration and limit data according to type
  let config;
  let status;
  let defaultTitle;
  let defaultMessage;
  let ctaLabel;
  let iconClass;
  let iconColor;
  let featureName;
  let quantityText;

  if (type === 'download') {
    config = CREDIT_USAGE_CONFIG.downloads;
    status = getDownloadStatus(activeTier);
    defaultTitle = 'Download Limit Reached';
    defaultMessage = 'Your included downloads for this plan have been used.';
    ctaLabel = 'Continue with Credits';
    iconClass = 'fa-solid fa-file-arrow-down';
    iconColor = '#38bdf8';
    featureName = 'File Download';
    quantityText = '1 File Download';
  } else if (type === 'copilot') {
    config = CREDIT_USAGE_CONFIG.copilot;
    status = getCopilotStatus(activeTier);
    defaultTitle = 'Included Usage Exhausted';
    defaultMessage = "You've used all the included minutes in your current plan.";
    ctaLabel = 'Continue with Credits';
    iconClass = 'fa-solid fa-robot';
    iconColor = '#818cf8';
    featureName = 'AI Copilot';
    quantityText = `+${config.blockMinutes} Minutes Extension`;
  } else {
    // voice
    config = CREDIT_USAGE_CONFIG.voice;
    status = getVoiceStatus(activeTier);
    defaultTitle = 'Included Usage Exhausted';
    defaultMessage = "You've used all the included minutes in your current plan.";
    ctaLabel = 'Continue with Credits';
    iconClass = 'fa-solid fa-microphone-lines';
    iconColor = '#38bdf8';
    featureName = 'Voice Simulator';
    quantityText = `+${config.blockMinutes} Minutes Extension`;
  }

  const requiredCredits = type === 'download'
    ? config.creditCostPerDownload
    : config.creditCostPerBlock;

  const hasEnoughCredits = credits >= requiredCredits;
  const balanceAfter = Math.max(0, credits - requiredCredits);

  const displayTitle = title || defaultTitle;
  const displayMessage = message || defaultMessage;

  const handleConfirmClick = async () => {
    if (!hasEnoughCredits) {
      if (onTopUp) {
        onTopUp();
      }
      return;
    }

    setIsProcessing(true);
    try {
      if (onConfirm) {
        await onConfirm({
          type,
          requiredCredits,
          fileDetails
        });
      }
    } catch (err) {
      if (showToast) showToast(`Error: ${err.message || 'Operation failed'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="credit-usage-modal-backdrop" onClick={onClose}>
      <div
        className="credit-usage-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header with decorative badge */}
        <div className="credit-usage-modal-header">
          <div className="credit-usage-icon-wrapper" style={{ backgroundColor: `${iconColor}1a`, color: iconColor }}>
            <i className={iconClass}></i>
          </div>
          <button
            type="button"
            className="credit-usage-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Title & Description */}
        <div className="credit-usage-modal-body">
          <div className="credit-usage-plan-badge">
            <i className="fa-solid fa-crown"></i>
            <span>{activeTier} Plan Allowance</span>
          </div>

          <h2 className="credit-usage-title">{displayTitle}</h2>
          <p className="credit-usage-description">{displayMessage}</p>

          {/* Pricing & Usage Summary Box */}
          <div className="credit-usage-info-card">
            <div className="credit-info-row">
              <span className="credit-info-label">Action / Feature</span>
              <span className="credit-info-value highlight">{featureName}</span>
            </div>
            {fileDetails?.name && (
              <div className="credit-info-row">
                <span className="credit-info-label">File</span>
                <span className="credit-info-value filename-truncated" title={fileDetails.name}>
                  {fileDetails.name}
                </span>
              </div>
            )}
            <div className="credit-info-row">
              <span className="credit-info-label">Plan Included Allowance</span>
              <span className="credit-info-value exhausted">Exhausted</span>
            </div>
            <div className="credit-info-divider"></div>
            <div className="credit-info-row">
              <span className="credit-info-label">Credit Cost</span>
              <span className="credit-info-value cost-value">
                <i className="fa-solid fa-coins"></i> {requiredCredits.toLocaleString()} Credits
              </span>
            </div>
            <div className="credit-info-row">
              <span className="credit-info-label">Your Balance</span>
              <span className={`credit-info-value ${hasEnoughCredits ? 'balance-ok' : 'balance-low'}`}>
                {credits.toLocaleString()} Credits
              </span>
            </div>

            {hasEnoughCredits ? (
              <div className="credit-info-row balance-after-row">
                <span className="credit-info-label">Balance After Use</span>
                <span className="credit-info-value balance-after">
                  {balanceAfter.toLocaleString()} Credits
                </span>
              </div>
            ) : (
              <div className="credit-insufficient-alert">
                <i className="fa-solid fa-triangle-exclamation"></i>
                <div>
                  <strong>Insufficient Credits</strong>
                  <p>You need {(requiredCredits - credits).toLocaleString()} more credits to continue.</p>
                </div>
              </div>
            )}
          </div>

          {/* Helpful note explaining configurable pricing */}
          <p className="credit-usage-footnote">
            <i className="fa-solid fa-circle-info"></i>
            {hasEnoughCredits
              ? `You can continue immediately. ${requiredCredits} credits will be deducted from your wallet.`
              : 'Top up your credit wallet to instantly resume unlimited downloads and usage.'}
          </p>
        </div>

        {/* Modal Actions */}
        <div className="credit-usage-modal-footer">
          <button
            type="button"
            className="credit-usage-btn-cancel"
            onClick={onClose}
            disabled={isProcessing}
          >
            Cancel
          </button>

          {hasEnoughCredits ? (
            <button
              type="button"
              className="credit-usage-btn-confirm"
              onClick={handleConfirmClick}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i> Processing...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-bolt"></i> {ctaLabel}
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              className="credit-usage-btn-topup"
              onClick={() => {
                onClose();
                if (onTopUp) onTopUp();
              }}
            >
              <i className="fa-solid fa-credit-card"></i> Top Up Credits
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
