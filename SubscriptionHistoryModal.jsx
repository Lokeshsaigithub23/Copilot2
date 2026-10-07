import React, { useState, useEffect, useMemo } from 'react';
import { getStoredTransactions, getUserCredits } from './transactionHistoryStore';
import './SubscriptionHistoryModal.css';

export default function SubscriptionHistoryModal({
  isOpen,
  onClose,
  userSubscription,
  billingCycle = 'monthly',
  userCredits,
  onUpgradeClick,
  onGoToUsage,
  darkMode,
  showToast
}) {
  const isDark = darkMode !== undefined ? darkMode : (typeof document !== 'undefined' && document.body.classList.contains('dark-theme'));
  const [transactions, setTransactions] = useState(() => getStoredTransactions());
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'subscription' | 'credits' | 'successful' | 'failed'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  // Synchronize live transactions
  useEffect(() => {
    const handleUpdate = () => {
      setTransactions(getStoredTransactions());
    };
    window.addEventListener('copilot-transactions-updated', handleUpdate);
    return () => window.removeEventListener('copilot-transactions-updated', handleUpdate);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTransactions(getStoredTransactions());
      setSelectedReceipt(null);
    }
  }, [isOpen]);

  // Format expiry date & calculate days remaining and subscription status
  const planValidity = useMemo(() => {
    if (!userSubscription) {
      return {
        formattedDate: 'N/A',
        daysLeft: 0,
        isExpired: false,
        status: 'active'
      };
    }

    const end = userSubscription.endDate ? new Date(userSubscription.endDate) : new Date(Date.now() + 30 * 86400000);
    const now = new Date();
    const diffTime = end.getTime() - now.getTime();
    const daysLeft = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    const formattedDate = end.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const isExpired = daysLeft <= 0 || !!userSubscription.isExpired;
    const status = (() => {
      if (isExpired || userSubscription.status === 'expired') return 'expired';
      if (userSubscription.status === 'cancelled' || userSubscription.status === 'canceled') return 'cancelled';
      if (userSubscription.status === 'inactive') return 'inactive';
      return 'active';
    })();

    return {
      formattedDate,
      daysLeft,
      isExpired,
      status
    };
  }, [userSubscription]);

  // Receipt Download in Plain Text (Costs 0 Credits)
  const handleDownloadTxtReceipt = (receipt) => {
    if (!receipt) return;
    try {
      const content = `=====================================================
            PLANCREDITS OFFICIAL PAYMENT RECEIPT
=====================================================
Transaction ID : ${receipt.id || 'N/A'}
Reference ID   : ${receipt.referenceId || 'N/A'}
Date & Time    : ${receipt.dateTime || 'N/A'}
Item / Plan    : ${receipt.planOrPackage || 'N/A'}
Category       : ${receipt.type || 'N/A'}
Payment Method : ${receipt.paymentMethod || 'N/A'}
Amount Charged : ${receipt.currencySymbol || '$'}${Number(receipt.amount || 0).toLocaleString()} ${receipt.currency || 'USD'}
Credits Deducted: ${receipt.creditsUsed > 0 ? `-${receipt.creditsUsed.toLocaleString()} Credits` : 'None'}
Credits Added  : ${receipt.creditsAdded > 0 ? `+${receipt.creditsAdded.toLocaleString()} Credits` : 'None'}
Status         : ${receipt.status || 'Successful'}
${receipt.failureReason ? `Declined Reason: ${receipt.failureReason}\n` : ''}-----------------------------------------------------
Receipt Download Fee : 0 Credits (FREE DOWNLOAD)
Security Verification: 256-Bit SSL Encrypted
=====================================================
Thank you for using PlanCredits!
`;
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt_${receipt.id || 'transaction'}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (showToast) showToast('📄 Receipt downloaded (.txt) — 0 credits used.');
    } catch (err) {
      if (showToast) showToast('Failed to download receipt text.');
    }
  };

  // Receipt Download / Print in PDF (Costs 0 Credits)
  const handleDownloadPdfReceipt = (receipt) => {
    if (!receipt) return;
    try {
      const printWindow = window.open('', '_blank', 'width=700,height=800');
      if (!printWindow) {
        handleDownloadTxtReceipt(receipt);
        return;
      }

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt - ${receipt.id}</title>
  <style>
    body { font-family: 'Times New Roman', Times, Georgia, serif; padding: 40px; color: #1e293b; background: #fff; line-height: 1.4; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
    .brand { font-size: 24px; font-weight: bold; color: #4338ca; }
    .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
    .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    .row.total { font-size: 18px; font-weight: bold; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; margin-top: 16px; color: #0f172a; }
    .status-pill { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: bold; background: ${receipt.status === 'Successful' ? '#dcfce7; color: #166534;' : '#fee2e2; color: #991b1b;'} }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 12px; color: #64748b; text-align: center; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">PlanCredits</div>
      <div class="subtitle">Official Payment Receipt &bull; Tax Invoice</div>
    </div>
    <div style="text-align: right;">
      <span class="status-pill">${receipt.status || 'Successful'}</span>
      <div class="subtitle" style="margin-top: 6px;">Ref: ${receipt.referenceId || receipt.id}</div>
    </div>
  </div>

  <div class="row"><span>Transaction ID</span><strong>${receipt.id}</strong></div>
  <div class="row"><span>Date &amp; Time</span><span>${receipt.dateTime}</span></div>
  <div class="row"><span>Item Description</span><strong>${receipt.planOrPackage}</strong></div>
  <div class="row"><span>Category</span><span>${receipt.type}</span></div>
  <div class="row"><span>Payment Method</span><span>${receipt.paymentMethod}</span></div>
  ${receipt.creditsUsed > 0 ? `<div class="row"><span>Credits Deducted</span><strong>-${receipt.creditsUsed.toLocaleString()} Credits</strong></div>` : ''}
  ${receipt.creditsAdded > 0 ? `<div class="row"><span>Credits Added</span><strong>+${receipt.creditsAdded.toLocaleString()} Credits</strong></div>` : ''}
  <div class="row total">
    <span>Total Charged</span>
    <span>${receipt.currencySymbol || '$'}${Number(receipt.amount || 0).toLocaleString()} ${receipt.currency || 'USD'}</span>
  </div>
  ${receipt.failureReason ? `<div class="row" style="color: #dc2626;"><span>Declined Reason</span><span>${receipt.failureReason}</span></div>` : ''}

  <div class="footer">
    <p>Receipt Download Fee: <strong>0 Credits (Free)</strong> &bull; 256-bit Encrypted Transaction</p>
    <p>Thank you for choosing PlanCredits. For questions or support, contact help desk.</p>
  </div>

  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`;
      printWindow.document.write(html);
      printWindow.document.close();
      if (showToast) showToast('🖨️ Opening print/PDF view (0 credits used)...');
    } catch (err) {
      handleDownloadTxtReceipt(receipt);
    }
  };

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((txn) => {
      // Category filter
      if (activeFilter === 'subscription' && txn.type !== 'Subscription Plan') return false;
      if (activeFilter === 'credits' && txn.type !== 'Credit Top-up') return false;
      if (activeFilter === 'successful' && txn.status !== 'Successful') return false;
      if (activeFilter === 'failed' && txn.status !== 'Failed') return false;

      // Search term filter
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const matchesId = txn.id?.toLowerCase().includes(q);
        const matchesPlan = txn.planOrPackage?.toLowerCase().includes(q);
        const matchesMethod = txn.paymentMethod?.toLowerCase().includes(q);
        const matchesRef = txn.referenceId?.toLowerCase().includes(q);
        if (!matchesId && !matchesPlan && !matchesMethod && !matchesRef) {
          return false;
        }
      }

      return true;
    });
  }, [transactions, activeFilter, searchTerm]);

  // Counts for tabs
  const counts = useMemo(() => {
    return {
      all: transactions.length,
      subscription: transactions.filter((t) => t.type === 'Subscription Plan').length,
      credits: transactions.filter((t) => t.type === 'Credit Top-up').length,
      successful: transactions.filter((t) => t.status === 'Successful').length,
      failed: transactions.filter((t) => t.status === 'Failed').length
    };
  }, [transactions]);

  if (!isOpen) return null;

  return (
    <div className={`sub-history-modal-backdrop ${isDark ? 'dark-theme' : 'light-theme'}`} onClick={onClose}>
      <div className={`sub-history-modal-container ${isDark ? 'dark-theme' : 'light-theme'}`} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sub-history-modal-header">
          <div className="sub-history-title-box">
            <div className="sub-history-icon-circle">
              <i className="fa-solid fa-clock-rotate-left"></i>
            </div>
            <div>
              <h3 className="sub-history-title">Plan &amp; Payment History</h3>
              <span className="sub-history-subtitle">
                Track your active plan validity, renewals, credit top-ups, and transaction logs
              </span>
            </div>
          </div>
          <button type="button" className="sub-history-close-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="sub-history-modal-body">
          {/* Active Plan & Validity Card ("kb tk mere plan rahega") */}
          <div className="sub-history-hero-card">
            <div className="hero-status-top-row">
              <div className={`hero-status-pill ${planValidity.status}`}>
                {planValidity.status === 'active' && (
                  <>
                    <i className="fa-solid fa-circle-check"></i>
                    <span>CURRENT ACTIVE SUBSCRIPTION</span>
                  </>
                )}
                {planValidity.status === 'expired' && (
                  <>
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    <span>SUBSCRIPTION EXPIRED</span>
                  </>
                )}
                {planValidity.status === 'cancelled' && (
                  <>
                    <i className="fa-solid fa-ban"></i>
                    <span>SUBSCRIPTION CANCELLED</span>
                  </>
                )}
                {planValidity.status === 'inactive' && (
                  <>
                    <i className="fa-solid fa-pause"></i>
                    <span>SUBSCRIPTION INACTIVE</span>
                  </>
                )}
              </div>
              <span className="hero-cycle-badge">
                {billingCycle === 'yearly' ? 'Annual Billing (Save 20%)' : 'Monthly Billing'}
              </span>
            </div>

            <div className="hero-plan-main-row">
              <div className="hero-plan-name-wrap">
                <h2 className="hero-plan-title">{userSubscription?.planName || 'Pro Plan'}</h2>
                <span className="hero-plan-tag">Tier: {userSubscription?.tier || 'PRO'}</span>
              </div>

              <div className="hero-plan-actions">
                {onUpgradeClick && (
                  <button
                    type="button"
                    className="hero-upgrade-btn"
                    onClick={() => {
                      onClose();
                      onUpgradeClick();
                    }}
                  >
                    <i className="fa-solid fa-bolt"></i>
                    <span>Change Plan / Upgrade</span>
                  </button>
                )}
              </div>
            </div>

            {/* Key Validity & Renewal Details Grid */}
            <div className="hero-validity-grid">
              <div className="validity-card-item highlight-card">
                <div className="item-label">
                  <i className="fa-regular fa-calendar-check"></i>
                  <span>Plan Valid Until</span>
                </div>
                <div className="item-value">{planValidity.formattedDate}</div>
                <div className="item-sub">
                  <span className={`days-pill ${planValidity.isExpired ? 'expired' : 'active'}`}>
                    <i className="fa-regular fa-clock"></i>
                    {planValidity.isExpired ? 'Expired' : `${planValidity.daysLeft} days remaining`}
                  </span>
                </div>
              </div>

              <div className="validity-card-item">
                <div className="item-label">
                  <i className="fa-solid fa-wallet"></i>
                  <span>Available Credits</span>
                </div>
                <div className="item-value credits-val">
                  {(userCredits ?? getUserCredits()).toLocaleString()}
                </div>
                <div className="item-sub">
                  <span>Usable for plan renewals &amp; top-ups</span>
                </div>
              </div>

              <div className="validity-card-item">
                <div className="item-label">
                  <i className="fa-solid fa-bolt"></i>
                  <span>Copilot Minutes</span>
                </div>
                <div className="item-value">
                  {userSubscription?.copilotLimit ? `${userSubscription.copilotLimit} mins/mo` : '600 mins/mo'}
                </div>
                <div className="item-sub">
                  <span>{userSubscription?.copilotMinutesUsed || 0} mins consumed</span>
                </div>
              </div>

              <div className="validity-card-item">
                <div className="item-label">
                  <i className="fa-solid fa-cloud-arrow-up"></i>
                  <span>Cloud Retention</span>
                </div>
                <div className="item-value">
                  {userSubscription?.storageDays === -1 ? 'Unlimited' : `${userSubscription?.storageDays || 60} Days`}
                </div>
                <div className="item-sub">
                  <span>Up to {userSubscription?.uploadMaxMbLimit || 500}MB per file</span>
                </div>
              </div>
            </div>
          </div>

          {/* Transactions Header & Controls */}
          <div className="sub-history-transactions-section">
            <div className="section-title-row">
              <div>
                <h4 className="section-title">Payment &amp; Purchase Records</h4>
                <p className="section-desc">
                  Detailed logs of all your subscription purchases, discounts applied, and payment methods
                </p>
              </div>

              {onGoToUsage && (
                <button
                  type="button"
                  className="sub-history-usage-link-btn"
                  onClick={() => {
                    onClose();
                    onGoToUsage();
                  }}
                >
                  <i className="fa-solid fa-chart-pie"></i>
                  <span>View Quota Usage Details</span>
                </button>
              )}
            </div>

            {/* Filter Tabs & Search */}
            <div className="sub-history-filters-bar">
              <div className="filter-tabs-pills">
                <button
                  type="button"
                  className={`filter-pill ${activeFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('all')}
                >
                  All ({counts.all})
                </button>
                <button
                  type="button"
                  className={`filter-pill ${activeFilter === 'subscription' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('subscription')}
                >
                  Plans ({counts.subscription})
                </button>
                <button
                  type="button"
                  className={`filter-pill ${activeFilter === 'credits' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('credits')}
                >
                  Credits ({counts.credits})
                </button>
                <button
                  type="button"
                  className={`filter-pill ${activeFilter === 'successful' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('successful')}
                >
                  Successful ({counts.successful})
                </button>
                <button
                  type="button"
                  className={`filter-pill ${activeFilter === 'failed' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('failed')}
                >
                  Failed ({counts.failed})
                </button>
              </div>

              <div className="sub-history-search-input">
                <i className="fa-solid fa-magnifying-glass"></i>
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button type="button" className="clear-search" onClick={() => setSearchTerm('')}>
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Transactions Table / List */}
            {filteredTransactions.length === 0 ? (
              <div className="sub-history-empty-state">
                <i className="fa-solid fa-receipt"></i>
                <h5>No Transactions Found</h5>
                <p>
                  {searchTerm
                    ? `No records matching "${searchTerm}". Try resetting your filter.`
                    : 'No payment records found under this filter.'}
                </p>
                {searchTerm && (
                  <button type="button" className="reset-filter-btn" onClick={() => setSearchTerm('')}>
                    Clear Search
                  </button>
                )}
              </div>
            ) : (
              <div className="sub-history-table-wrapper">
                <table className="sub-history-table">
                  <thead>
                    <tr>
                      <th>Date &amp; Time</th>
                      <th>Transaction ID</th>
                      <th>Plan / Package</th>
                      <th>Payment Method</th>
                      <th>Amount Paid</th>
                      <th>Credits Used/Added</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((txn) => {
                      const isSuccess = txn.status === 'Successful';
                      return (
                        <tr key={txn.id} className={isSuccess ? 'row-success' : 'row-failed'}>
                          <td className="cell-datetime">
                            <i className="fa-regular fa-clock"></i>
                            <span>{txn.dateTime}</span>
                          </td>
                          <td className="cell-id">
                            <code>{txn.id}</code>
                          </td>
                          <td className="cell-plan">
                            <strong>{txn.planOrPackage}</strong>
                            <span className="type-sub">{txn.type}</span>
                          </td>
                          <td className="cell-method">
                            <span className="method-pill">
                              <i
                                className={
                                  txn.methodCode === 'upi'
                                    ? 'fa-solid fa-qrcode'
                                    : txn.methodCode === 'paypal'
                                    ? 'fa-brands fa-paypal'
                                    : txn.methodCode === 'credits'
                                    ? 'fa-solid fa-coins'
                                    : 'fa-solid fa-credit-card'
                                }
                              ></i>
                              <span>{txn.paymentMethod}</span>
                            </span>
                          </td>
                          <td className="cell-amount">
                            <span className="amount-val">
                              {txn.currencySymbol}
                              {txn.amount.toLocaleString()} {txn.currency}
                            </span>
                          </td>
                          <td className="cell-credits">
                            {txn.creditsUsed > 0 && (
                              <span className="credits-used-badge">
                                -{txn.creditsUsed.toLocaleString()} Credits
                              </span>
                            )}
                            {txn.creditsAdded > 0 && (
                              <span className="credits-added-badge">
                                +{txn.creditsAdded.toLocaleString()} Credits
                              </span>
                            )}
                            {txn.creditsUsed === 0 && txn.creditsAdded === 0 && (
                              <span className="none-badge">&mdash;</span>
                            )}
                          </td>
                          <td className="cell-status">
                            <span className={`status-badge ${txn.status?.toLowerCase()}`}>
                              <i
                                className={
                                  isSuccess
                                    ? 'fa-solid fa-circle-check'
                                    : 'fa-solid fa-circle-xmark'
                                }
                              ></i>
                              <span>{txn.status}</span>
                            </span>
                          </td>
                          <td className="cell-action">
                            <button
                              type="button"
                              className="btn-view-receipt"
                              onClick={() => setSelectedReceipt(txn)}
                              title="View Receipt Details"
                            >
                              <i className="fa-regular fa-file-lines"></i>
                              <span>Receipt</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="sub-history-modal-footer">
          <div className="footer-info">
            <i className="fa-solid fa-shield-halved"></i>
            <span>All transactions are 256-bit encrypted and stored securely</span>
          </div>
          <button type="button" className="sub-history-btn-close" onClick={onClose}>
            Close
          </button>
        </div>

        {/* Nested Receipt Details Modal */}
        {selectedReceipt && (
          <div className="receipt-overlay" onClick={() => setSelectedReceipt(null)}>
            <div className="receipt-popup-card" onClick={(e) => e.stopPropagation()}>
              <div className="receipt-popup-header">
                <div>
                  <h4 className="receipt-popup-title">Transaction Receipt</h4>
                  <span className="receipt-popup-id">{selectedReceipt.id}</span>
                </div>
                <button
                  type="button"
                  className="receipt-close-btn"
                  onClick={() => setSelectedReceipt(null)}
                >
                  ✕
                </button>
              </div>

              <div className="receipt-popup-body">
                <div className="receipt-line">
                  <span>Item</span>
                  <strong>{selectedReceipt.planOrPackage}</strong>
                </div>
                <div className="receipt-line">
                  <span>Category</span>
                  <span>{selectedReceipt.type}</span>
                </div>
                <div className="receipt-line">
                  <span>Date &amp; Time</span>
                  <span>{selectedReceipt.dateTime}</span>
                </div>
                <div className="receipt-line">
                  <span>Payment Method</span>
                  <span>{selectedReceipt.paymentMethod}</span>
                </div>
                <div className="receipt-line">
                  <span>Reference ID</span>
                  <code>{selectedReceipt.referenceId}</code>
                </div>
                {selectedReceipt.creditsUsed > 0 && (
                  <div className="receipt-line">
                    <span>Credits Deducted</span>
                    <strong style={{ color: '#f59e0b' }}>
                      -{selectedReceipt.creditsUsed.toLocaleString()} Credits
                    </strong>
                  </div>
                )}
                {selectedReceipt.creditsAdded > 0 && (
                  <div className="receipt-line">
                    <span>Credits Added</span>
                    <strong style={{ color: '#10b981' }}>
                      +{selectedReceipt.creditsAdded.toLocaleString()} Credits
                    </strong>
                  </div>
                )}
                <div className="receipt-divider"></div>
                <div className="receipt-line total-line">
                  <span>Amount Charged</span>
                  <span className="receipt-total-val">
                    {selectedReceipt.currencySymbol}
                    {selectedReceipt.amount.toLocaleString()} {selectedReceipt.currency}
                  </span>
                </div>
                <div className="receipt-line">
                  <span>Status</span>
                  <span className={`status-badge ${selectedReceipt.status?.toLowerCase()}`}>
                    {selectedReceipt.status}
                  </span>
                </div>
                <div className="receipt-line receipt-free-cost-line">
                  <span>Download Fee</span>
                  <span className="free-cost-badge">
                    <i className="fa-solid fa-circle-check" style={{ marginRight: '4px' }}></i>
                    0 Credits (Free)
                  </span>
                </div>
                {selectedReceipt.failureReason && (
                  <div className="receipt-line failure-reason">
                    <span>Declined Reason</span>
                    <span style={{ color: '#f87171' }}>{selectedReceipt.failureReason}</span>
                  </div>
                )}
              </div>

              <div className="receipt-popup-actions">
                <button
                  type="button"
                  className="btn-download-receipt btn-pdf"
                  onClick={() => handleDownloadPdfReceipt(selectedReceipt)}
                  title="Download / Print PDF Receipt (0 Credits)"
                >
                  <i className="fa-solid fa-file-pdf"></i>
                  <span>Download PDF</span>
                </button>
                <button
                  type="button"
                  className="btn-download-receipt btn-txt"
                  onClick={() => handleDownloadTxtReceipt(selectedReceipt)}
                  title="Download Plain Text Receipt (0 Credits)"
                >
                  <i className="fa-solid fa-file-lines"></i>
                  <span>Download Text (.txt)</span>
                </button>
                <button
                  type="button"
                  className="btn-done"
                  onClick={() => setSelectedReceipt(null)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
