import React, { useState, useEffect, useMemo } from 'react';
import { TOP_UP_CONFIGURATIONS } from './subscriptionPlansConfig';
import { getCurrency, convertFromUSD } from './currencyData';
import { getUserCredits } from './transactionHistoryStore';
import { recordTopUpSuccess, getFeatureUsage } from './topUpStore';
import './TopUpPlansSection.css';

export default function TopUpPlansSection({
  currentPlanTier = 'PRO',
  currency = 'USD',
  darkMode,
  showToast,
  onOpenCheckoutModal,
  onGoToUsage
}) {
  const isDark = darkMode !== undefined ? darkMode : (typeof document !== 'undefined' && document.body.classList.contains('dark-theme'));

  // Plan tab selection: 'FREE' | 'PRO' | 'PRO_PLUS'
  const [selectedPlanTab, setSelectedPlanTab] = useState(currentPlanTier.toUpperCase());

  // Quantity state for each feature card: { downloads: 5, copilot: 4, voice: 2, notetaker: 4, upload: 5 }
  const [quantities, setQuantities] = useState({
    downloads: 5,
    copilot: 4,
    voice: 2,
    notetaker: 4,
    upload: 5
  });

  // Top Up Summary Drawer / Modal State
  const [activeSummaryFeature, setActiveSummaryFeature] = useState(null); // feature object
  const [paymentChoice, setPaymentChoice] = useState('credits'); // 'credits' | 'payment_method'
  const [availableCredits, setAvailableCredits] = useState(() => getUserCredits());
  const [featureUsage, setFeatureUsage] = useState(() => getFeatureUsage());

  // Success / Failure States
  const [topUpSuccessData, setTopUpSuccessData] = useState(null);
  const [topUpFailureMessage, setTopUpFailureMessage] = useState('');
  const [isProcessingCredits, setIsProcessingCredits] = useState(false);

  const curr = getCurrency(currency);

  // Sync credits & feature usage
  useEffect(() => {
    const handleCreditsChange = (e) => {
      setAvailableCredits(typeof e.detail === 'number' ? e.detail : getUserCredits());
    };
    const handleTopUpChange = () => {
      setFeatureUsage(getFeatureUsage());
      setAvailableCredits(getUserCredits());
    };
    window.addEventListener('copilot-credits-updated', handleCreditsChange);
    window.addEventListener('copilot-topup-updated', handleTopUpChange);
    return () => {
      window.removeEventListener('copilot-credits-updated', handleCreditsChange);
      window.removeEventListener('copilot-topup-updated', handleTopUpChange);
    };
  }, []);

  // Update selected tab if user's actual tier changes
  useEffect(() => {
    if (currentPlanTier) {
      setSelectedPlanTab(currentPlanTier.toUpperCase());
    }
  }, [currentPlanTier]);

  // Current plan features configuration
  const currentFeatures = useMemo(() => {
    return TOP_UP_CONFIGURATIONS[selectedPlanTab] || TOP_UP_CONFIGURATIONS.PRO;
  }, [selectedPlanTab]);

  // Quantity change handler
  const handleQuantityChange = (featureId, delta) => {
    setQuantities((prev) => {
      const current = prev[featureId] || 1;
      const next = Math.max(1, Math.min(100, current + delta));
      return { ...prev, [featureId]: next };
    });
  };

  const handleSetExactQuantity = (featureId, val) => {
    const num = Math.max(1, Math.min(100, Number(val) || 1));
    setQuantities((prev) => ({ ...prev, [featureId]: num }));
  };

  // Open Top Up Summary
  const handleOpenSummary = (feature) => {
    setTopUpFailureMessage('');
    setActiveSummaryFeature(feature);
    const qty = quantities[feature.id] || feature.defaultQuantity || 2;
    const totalCredits = qty * feature.creditsPerHour;
    // Auto-select credits if user has enough, else payment method
    if (availableCredits >= totalCredits) {
      setPaymentChoice('credits');
    } else {
      setPaymentChoice('payment_method');
    }
  };

  // Summary calculation for the active feature
  const summaryDetails = useMemo(() => {
    if (!activeSummaryFeature) return null;
    const qty = quantities[activeSummaryFeature.id] || activeSummaryFeature.defaultQuantity || 2;
    const totalCredits = qty * activeSummaryFeature.creditsPerHour;
    const totalAmountUSD = qty * activeSummaryFeature.pricePerHourUSD;
    const convertedAmount = convertFromUSD(totalAmountUSD, currency);
    const hasEnoughCredits = availableCredits >= totalCredits;
    const remainingCredits = availableCredits - totalCredits;

    return {
      qty,
      unit: activeSummaryFeature.unit || 'Hours',
      totalCredits,
      totalAmountUSD,
      convertedAmount,
      hasEnoughCredits,
      remainingCredits
    };
  }, [activeSummaryFeature, quantities, availableCredits, currency]);

  // Handle Confirm Top-Up with Credits
  const handleConfirmCreditsTopUp = () => {
    if (!activeSummaryFeature || !summaryDetails) return;

    if (!summaryDetails.hasEnoughCredits) {
      setTopUpFailureMessage('Insufficient credits in your wallet. Please select Pay with Payment Method or buy more credits.');
      if (showToast) showToast('⚠️ Insufficient credit balance.');
      return;
    }

    setIsProcessingCredits(true);
    setTimeout(() => {
      setIsProcessingCredits(false);
      const record = recordTopUpSuccess({
        featureId: activeSummaryFeature.id,
        featureName: activeSummaryFeature.name,
        quantity: summaryDetails.qty,
        unit: summaryDetails.unit,
        creditsRequired: summaryDetails.totalCredits,
        amountUSD: summaryDetails.totalAmountUSD,
        currency: curr.code,
        currencySymbol: curr.symbol,
        paymentType: 'credits',
        paymentMethod: 'Credits Balance',
        planTier: selectedPlanTab
      });

      setTopUpSuccessData({
        featureName: activeSummaryFeature.name,
        quantity: summaryDetails.qty,
        unit: summaryDetails.unit,
        creditsDeducted: summaryDetails.totalCredits,
        record
      });
      setActiveSummaryFeature(null);
      if (showToast) showToast(`🎉 Success! +${summaryDetails.qty} ${summaryDetails.unit} added to ${activeSummaryFeature.name}.`);
    }, 600);
  };

  // Handle Proceed to External Payment Modal
  const handleProceedPaymentMethod = () => {
    if (!activeSummaryFeature || !summaryDetails) return;
    const featureName = activeSummaryFeature.name;
    const qty = summaryDetails.qty;
    const unit = summaryDetails.unit;
    const amountUSD = summaryDetails.totalAmountUSD;

    setActiveSummaryFeature(null);

    // Call parent checkout modal with custom top-up package
    if (onOpenCheckoutModal) {
      onOpenCheckoutModal({
        type: 'credits',
        amountUSD: Math.max(1, Math.round(amountUSD)),
        customTitle: `${featureName} Top-Up (+${qty} ${unit})`,
        onSuccessExtra: () => {
          recordTopUpSuccess({
            featureId: activeSummaryFeature.id,
            featureName,
            quantity: qty,
            unit,
            creditsRequired: summaryDetails.totalCredits,
            amountUSD,
            currency: curr.code,
            currencySymbol: curr.symbol,
            paymentType: 'payment_method',
            paymentMethod: 'Card / UPI / Online Gateway',
            planTier: selectedPlanTab
          });
          setTopUpSuccessData({
            featureName,
            quantity: qty,
            unit,
            creditsDeducted: summaryDetails.totalCredits,
            amountPaid: summaryDetails.convertedAmount,
            currencySymbol: curr.symbol
          });
        }
      });
    }
  };

  return (
    <div className={`topup-plans-container ${isDark ? 'dark-theme' : 'light-theme'}`} id="top-up-plans-section">
      {/* Section Header */}
      <div className="topup-section-header">
        <div className="topup-header-title-wrap">
          <span className="topup-badge">
            <i className="fa-solid fa-bolt"></i> ON-DEMAND CAPACITY
          </span>
          <h2 className="topup-main-title">Top Up Plans</h2>
          <p className="topup-main-desc">
            Need more hours or storage before your next cycle? Purchase additional usage for your current subscription plan using your wallet credits or preferred payment method.
          </p>
        </div>

        {/* Live Wallet Balance Pill */}
        <div className="topup-wallet-pill">
          <div className="wallet-pill-icon">
            <i className="fa-solid fa-wallet"></i>
          </div>
          <div>
            <span className="wallet-pill-label">Available Balance</span>
            <span className="wallet-pill-val">{availableCredits.toLocaleString()} Credits</span>
          </div>
        </div>
      </div>

      {/* Plan-Specific Tabs: [ Free ] [ Pro ] [ Pro Plus ] */}
      <div className="topup-plan-tabs-bar">
        <div className="tabs-label">Top Up Rates for Plan:</div>
        <div className="topup-tabs-pills">
          {[
            { id: 'FREE', name: 'Free', badge: 'Starter' },
            { id: 'PRO', name: 'Pro', badge: 'Most Popular' },
            { id: 'PRO_PLUS', name: 'Pro Plus', badge: 'Power User' }
          ].map((tab) => {
            const isSelected = selectedPlanTab === tab.id;
            const isCurrent = currentPlanTier.toUpperCase() === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={`topup-plan-tab-btn ${isSelected ? 'active' : ''}`}
                onClick={() => setSelectedPlanTab(tab.id)}
              >
                <span className="tab-name">{tab.name}</span>
                {isCurrent && <span className="tab-current-pill">Active Plan</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Feature Cards Grid (Section 2 & 3) */}
      <div className="topup-features-grid">
        {currentFeatures.map((feat) => {
          const qty = quantities[feat.id] || feat.defaultQuantity || 2;
          const totalCredits = qty * feat.creditsPerHour;
          const totalAmountUSD = qty * feat.pricePerHourUSD;
          const convertedAmount = convertFromUSD(totalAmountUSD, currency);

          // Get live dynamic usage for this feature
          const liveUsage = featureUsage[feat.id];
          const totalAllocated = liveUsage ? liveUsage.baseLimit + (liveUsage.toppedUp || 0) : null;

          return (
            <div key={feat.id} className="topup-feature-card">
              {/* Card Header */}
              <div className="topup-card-header">
                <div className="feat-icon-box" style={{ background: `${feat.color}20`, color: feat.color, borderColor: `${feat.color}40` }}>
                  <i className={feat.icon}></i>
                </div>
                <div className="feat-header-text">
                  <h3 className="feat-title">{feat.name}</h3>
                  <span className="feat-included-badge">
                    <i className="fa-solid fa-circle-info"></i> {feat.includedUsage}
                  </span>
                </div>
              </div>

              {/* Description */}
              <p className="feat-desc">{feat.description}</p>

              {/* Current Usage Metric if available */}
              {liveUsage && (
                <div className="feat-usage-bar-wrap">
                  <div className="usage-bar-labels">
                    <span>Current Allocation:</span>
                    <strong>{liveUsage.used} / {totalAllocated} {liveUsage.unit} used</strong>
                  </div>
                  <div className="usage-mini-track">
                    <div
                      className="usage-mini-fill"
                      style={{
                        width: `${Math.min(100, Math.round((liveUsage.used / (totalAllocated || 1)) * 100))}%`,
                        backgroundColor: feat.color
                      }}
                    ></div>
                  </div>
                  {liveUsage.toppedUp > 0 && (
                    <span className="extra-topped-tag">+{liveUsage.toppedUp} {liveUsage.unit} topped up previously</span>
                  )}
                </div>
              )}

              {/* Rate & Pricing Info */}
              <div className="feat-rate-meta">
                <div className="rate-item">
                  <span className="rate-lbl">Rate per {feat.unit}:</span>
                  <span className="rate-val">
                    <strong>{feat.creditsPerHour} Credits</strong>
                    <span className="rate-usd">
                      ({curr.symbol}{convertFromUSD(feat.pricePerHourUSD, currency).toLocaleString()} {curr.code})
                    </span>
                  </span>
                </div>
              </div>

              {/* Quantity / Hours Selector (Section 3) */}
              <div className="feat-quantity-section">
                <label className="qty-label">Select Additional {feat.unit}:</label>
                <div className="qty-stepper-row">
                  <button
                    type="button"
                    className="qty-btn btn-minus"
                    onClick={() => handleQuantityChange(feat.id, -1)}
                    disabled={qty <= 1}
                    title="Decrease quantity"
                  >
                    <i className="fa-solid fa-minus"></i>
                  </button>

                  <div className="qty-display-box">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      className="qty-number-input"
                      value={qty}
                      onChange={(e) => handleSetExactQuantity(feat.id, e.target.value)}
                    />
                    <span className="qty-unit-label">{feat.unit}</span>
                  </div>

                  <button
                    type="button"
                    className="qty-btn btn-plus"
                    onClick={() => handleQuantityChange(feat.id, 1)}
                    title="Increase quantity"
                  >
                    <i className="fa-solid fa-plus"></i>
                  </button>
                </div>

                {/* Preset Chips */}
                {feat.presets && feat.presets.length > 0 && (
                  <div className="qty-preset-chips">
                    {feat.presets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={`preset-chip ${qty === preset ? 'active' : ''}`}
                        onClick={() => handleSetExactQuantity(feat.id, preset)}
                      >
                        +{preset} {feat.unit === 'Hours' ? 'hrs' : feat.unit}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Calculation Summary Footer */}
              <div className="topup-card-footer">
                <div className="calc-summary-row">
                  <div className="calc-left">
                    <span className="calc-formula">
                      {qty} {feat.unit} &times; {feat.creditsPerHour} Credits
                    </span>
                    <div className="calc-credits-total">
                      <i className="fa-solid fa-coins"></i>
                      <strong>{totalCredits.toLocaleString()} Credits</strong>
                    </div>
                  </div>
                  <div className="calc-right">
                    <span className="calc-lbl">Total Amount</span>
                    <span className="calc-amount-val">
                      {curr.symbol}{convertedAmount.toLocaleString()} {curr.code}
                    </span>
                  </div>
                </div>

                {/* Top Up CTA */}
                <button
                  type="button"
                  className="topup-now-btn"
                  onClick={() => handleOpenSummary(feat)}
                >
                  <span>Top Up Now</span>
                  <i className="fa-solid fa-arrow-right"></i>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* TOP UP SUMMARY MODAL / DRAWER (Section 4 & 5) */}
      {activeSummaryFeature && summaryDetails && (
        <div className={`topup-summary-backdrop ${isDark ? 'dark-theme' : 'light-theme'}`} onClick={() => setActiveSummaryFeature(null)}>
          <div className={`topup-summary-modal-card ${isDark ? 'dark-theme' : 'light-theme'}`} onClick={(e) => e.stopPropagation()}>
            <div className="summary-card-header">
              <div className="summary-title-wrap">
                <div className="summary-icon-pill" style={{ background: `${activeSummaryFeature.color}20`, color: activeSummaryFeature.color }}>
                  <i className={activeSummaryFeature.icon}></i>
                </div>
                <div>
                  <h3 className="summary-modal-title">Top Up Summary</h3>
                  <span className="summary-modal-sub">Confirm extra capacity for your account</span>
                </div>
              </div>
              <button
                type="button"
                className="summary-close-btn"
                onClick={() => setActiveSummaryFeature(null)}
              >
                ✕
              </button>
            </div>

            <div className="summary-card-body">
              {/* Error banner if insufficient credits */}
              {topUpFailureMessage && (
                <div className="summary-error-banner">
                  <i className="fa-solid fa-circle-exclamation"></i>
                  <span>{topUpFailureMessage}</span>
                </div>
              )}

              {/* Item Details Row */}
              <div className="summary-item-card">
                <div className="s-row">
                  <span className="s-label">Feature</span>
                  <strong className="s-val">{activeSummaryFeature.name}</strong>
                </div>
                <div className="s-row">
                  <span className="s-label">Duration / Quantity</span>
                  <span className="s-val highlight">+{summaryDetails.qty} {summaryDetails.unit}</span>
                </div>
                <div className="s-row">
                  <span className="s-label">Credits Required</span>
                  <span className="s-val credits-color">
                    <i className="fa-solid fa-coins"></i> {summaryDetails.totalCredits.toLocaleString()} Credits
                  </span>
                </div>
                <div className="s-row">
                  <span className="s-label">Equivalent Amount</span>
                  <span className="s-val amount-color">
                    {curr.symbol}{summaryDetails.convertedAmount.toLocaleString()} {curr.code} (${summaryDetails.totalAmountUSD.toFixed(2)} USD)
                  </span>
                </div>
              </div>

              {/* Choice: (A) Use Credits vs (B) Pay with Payment Method (Section 5) */}
              <div className="summary-payment-options-section">
                <label className="payment-options-heading">How would you like to complete this top-up?</label>

                <div className="payment-options-grid">
                  {/* Option A: Use Available Credits */}
                  <label className={`summary-choice-card ${paymentChoice === 'credits' ? 'selected' : ''}`}>
                    <div className="choice-radio">
                      <input
                        type="radio"
                        name="topup_choice"
                        value="credits"
                        checked={paymentChoice === 'credits'}
                        onChange={() => {
                          setPaymentChoice('credits');
                          setTopUpFailureMessage('');
                        }}
                      />
                    </div>
                    <div className="choice-text-block">
                      <div className="choice-title-row">
                        <span className="choice-title">Use Available Credits</span>
                        <span className="instant-badge">Instant</span>
                      </div>
                      <div className="credits-ledger-box">
                        <div className="ledger-item">
                          <span>Available:</span>
                          <strong>{availableCredits.toLocaleString()}</strong>
                        </div>
                        <div className="ledger-item required">
                          <span>Required:</span>
                          <strong>-{summaryDetails.totalCredits.toLocaleString()}</strong>
                        </div>
                        <div className="ledger-item remaining">
                          <span>Remaining:</span>
                          <strong className={summaryDetails.hasEnoughCredits ? 'text-green' : 'text-red'}>
                            {summaryDetails.hasEnoughCredits ? summaryDetails.remainingCredits.toLocaleString() : 'Insufficient'}
                          </strong>
                        </div>
                      </div>
                      {!summaryDetails.hasEnoughCredits && (
                        <span className="not-enough-hint">
                          ⚠️ You need { (summaryDetails.totalCredits - availableCredits).toLocaleString() } more credits. Choose Payment Method below.
                        </span>
                      )}
                    </div>
                  </label>

                  {/* Option B: Pay with Payment Method */}
                  <label className={`summary-choice-card ${paymentChoice === 'payment_method' ? 'selected' : ''}`}>
                    <div className="choice-radio">
                      <input
                        type="radio"
                        name="topup_choice"
                        value="payment_method"
                        checked={paymentChoice === 'payment_method'}
                        onChange={() => {
                          setPaymentChoice('payment_method');
                          setTopUpFailureMessage('');
                        }}
                      />
                    </div>
                    <div className="choice-text-block">
                      <div className="choice-title-row">
                        <span className="choice-title">Pay using Payment Method</span>
                        <span className="gateway-badge">Card, UPI, PayPal</span>
                      </div>
                      <p className="choice-subtext">
                        Pay {curr.symbol}{summaryDetails.convertedAmount.toLocaleString()} {curr.code} directly using Debit/Credit Card, UPI PIN, Google Pay, PhonePe, Paytm, or Net Banking.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="summary-card-footer">
              <button
                type="button"
                className="summary-cancel-btn"
                onClick={() => setActiveSummaryFeature(null)}
              >
                Cancel
              </button>

              {paymentChoice === 'credits' ? (
                <button
                  type="button"
                  className="summary-confirm-btn"
                  onClick={handleConfirmCreditsTopUp}
                  disabled={!summaryDetails.hasEnoughCredits || isProcessingCredits}
                >
                  {isProcessingCredits ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i>
                      <span>Allocating Capacity...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirm Top Up with Credits</span>
                      <i className="fa-solid fa-check"></i>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  className="summary-confirm-btn btn-payment-method"
                  onClick={handleProceedPaymentMethod}
                >
                  <span>Continue to Payment ({curr.symbol}{summaryDetails.convertedAmount.toLocaleString()})</span>
                  <i className="fa-solid fa-arrow-right"></i>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TOP UP SUCCESS MODAL / SCREEN (Section 8) */}
      {topUpSuccessData && (
        <div className={`topup-success-backdrop ${isDark ? 'dark-theme' : 'light-theme'}`} onClick={() => setTopUpSuccessData(null)}>
          <div className={`topup-success-card ${isDark ? 'dark-theme' : 'light-theme'}`} onClick={(e) => e.stopPropagation()}>
            <div className="success-check-badge">
              <i className="fa-solid fa-circle-check"></i>
            </div>
            <h3 className="success-heading">Top Up Successful!</h3>
            <p className="success-sub">
              Your additional capacity has been allocated to your account and is ready to use immediately.
            </p>

            <div className="success-summary-box">
              <div className="succ-row">
                <span>Feature Topped Up:</span>
                <strong>{topUpSuccessData.featureName}</strong>
              </div>
              <div className="succ-row">
                <span>Capacity Added:</span>
                <span className="succ-added-badge">
                  +{topUpSuccessData.quantity} {topUpSuccessData.unit} Added
                </span>
              </div>
              <div className="succ-row">
                <span>Credits Deducted:</span>
                <span className="succ-credits-val">
                  {topUpSuccessData.creditsDeducted.toLocaleString()} Credits
                </span>
              </div>
              {topUpSuccessData.amountPaid && (
                <div className="succ-row">
                  <span>Amount Paid:</span>
                  <strong>{topUpSuccessData.currencySymbol}{topUpSuccessData.amountPaid.toLocaleString()}</strong>
                </div>
              )}
              <div className="succ-row">
                <span>Remaining Wallet Balance:</span>
                <strong style={{ color: '#10b981' }}>{availableCredits.toLocaleString()} Credits</strong>
              </div>
            </div>

            <div className="success-actions-row">
              {onGoToUsage && (
                <button
                  type="button"
                  className="btn-view-usage"
                  onClick={() => {
                    setTopUpSuccessData(null);
                    onGoToUsage();
                  }}
                >
                  <i className="fa-solid fa-chart-pie"></i>
                  <span>View Usage</span>
                </button>
              )}
              <button
                type="button"
                className="btn-continue"
                onClick={() => setTopUpSuccessData(null)}
              >
                <span>Continue</span>
                <i className="fa-solid fa-arrow-right"></i>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
