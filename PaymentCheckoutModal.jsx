import React, { useState, useEffect, useMemo, useRef } from 'react';
import { API_BASE } from '../../utils/api';
import { getCurrency, convertFromUSD, CREDITS_PER_USD, COUNTRY_DIAL_CODES, getCountryByCurrency } from './currencyData';
import {
  getUserCredits,
  setUserCredits,
  addTransactionRecord
} from './transactionHistoryStore';
import './PaymentCheckoutModal.css';

const DEMO_OTP = '123456';

const PAYMENT_METHODS = [
  { id: 'card', name: 'Credit / Debit Card', icon: 'fa-solid fa-credit-card', subtitle: 'Visa, Mastercard, RuPay, Amex', tags: ['card', 'credit', 'debit', 'visa', 'mastercard'] },
  { id: 'upi', name: 'UPI & QR Code', icon: 'fa-solid fa-qrcode', subtitle: 'Scan & Pay or UPI ID', tags: ['upi', 'qr', 'scan', 'bhim'] },
  { id: 'gpay', name: 'Google Pay', icon: 'fa-brands fa-google-pay', subtitle: 'Pay instantly via GPay', tags: ['google', 'gpay', 'google pay', 'upi'] },
  { id: 'phonepe', name: 'PhonePe', icon: 'fa-solid fa-mobile-screen', subtitle: 'Pay via PhonePe UPI', tags: ['phonepe', 'phone', 'upi'] },
  { id: 'paytm', name: 'Paytm', icon: 'fa-solid fa-wallet', subtitle: 'Paytm UPI or Wallet', tags: ['paytm', 'wallet', 'upi', 'pay'] },
  { id: 'paypal', name: 'PayPal', icon: 'fa-brands fa-paypal', subtitle: 'International payments', tags: ['paypal', 'pay', 'international'] },
  { id: 'netbanking', name: 'Net Banking', icon: 'fa-solid fa-building-columns', subtitle: 'All major Indian & Global banks', tags: ['netbanking', 'net banking', 'bank', 'hdfc', 'sbi', 'icici'] }
];

export default function PaymentCheckoutModal({
  isOpen,
  onClose,
  type = 'subscription', // 'subscription' | 'credits'
  plan = null, // { id, name, priceMonthly, ... }
  billingCycle = 'monthly', // 'monthly' | 'yearly'
  creditTopUpAmount = 1, // in USD
  targetCredits = null, // Exact credits needed (e.g. 50 credits for $1 USD)
  currency = 'USD',
  customTitle = '',
  onSuccessExtra = null,
  showToast,
  onPaymentSuccess,
  onGoToDashboard,
  onGoToUsage,
  onViewHistory,
  darkMode,
  token
}) {
  const isDark = darkMode !== undefined ? darkMode : (typeof document !== 'undefined' && document.body.classList.contains('dark-theme'));
  // Steps: 'plan_options' -> 'method_selection' -> 'details_entry' -> 'otp_verify' -> 'otp_verified' -> 'processing' -> 'success' | 'failure' | 'cancelled'
  const [currentStep, setCurrentStep] = useState(type === 'subscription' ? 'plan_options' : 'method_selection');
  const prevIsOpenRef = useRef(false);

  // User Wallet State
  const [availableCredits, setAvailableCreditsState] = useState(() => getUserCredits());

  // Subscription Payment Choice: [x] Use Credits, [x] Pay Amount
  const [useCredits, setUseCredits] = useState(true);
  const [payAmount, setPayAmount] = useState(true);

  // Method Selection & Search
  const [methodSearch, setMethodSearch] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('card');

  // Country Dial Code Selection (Dynamic for all countries: +91, +1, +61, +44, etc.)
  const [selectedCountryId, setSelectedCountryId] = useState(() => {
    const match = getCountryByCurrency(currency);
    return match ? match.id : 'IN';
  });

  // Sync default country code if currency changes
  useEffect(() => {
    if (currency) {
      const match = getCountryByCurrency(currency);
      if (match) {
        setSelectedCountryId(match.id);
      }
    }
  }, [currency]);

  const selectedCountry = useMemo(() => {
    return COUNTRY_DIAL_CODES.find((c) => c.id === selectedCountryId) || COUNTRY_DIAL_CODES[0];
  }, [selectedCountryId]);

  // Form Fields
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(() => {
    try {
      const rawUser = localStorage.getItem('auth_user');
      if (rawUser) {
        const u = JSON.parse(rawUser);
        if (u?.phone && /^\d{7,15}$/.test(u.phone.replace(/\D/g, ''))) return u.phone.replace(/\D/g, '');
      }
    } catch (_) {}
    return '';
  });
  const [upiId, setUpiId] = useState('');
  const [paypalEmail, setPaypalEmail] = useState('');
  const [bankName, setBankName] = useState('HDFC Bank');
  const [bankAccountHolder, setBankAccountHolder] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [phonepeNumber, setPhonepeNumber] = useState('');
  const [gpayNumber, setGpayNumber] = useState('');
  const [paytmNumber, setPaytmNumber] = useState('');

  // Inline Field Errors & Validation Alert Popup
  const [fieldErrors, setFieldErrors] = useState({});
  const [validationPopup, setValidationPopup] = useState(null);

  // OTP State (Used for Credit/Debit Cards)
  const [otpCode, setOtpCode] = useState('');
  const [otpTimer, setOtpTimer] = useState(45);
  const [otpError, setOtpError] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const timerIntervalRef = useRef(null);

  // 4-Digit UPI PIN State (Strict Audio Requirement: Required for UPI payments)
  const DEMO_UPI_PIN = '1234';
  const [upiPin, setUpiPin] = useState('');
  const [showUpiPin, setShowUpiPin] = useState(false);
  const [upiPinError, setUpiPinError] = useState('');
  const [isVerifyingUpiPin, setIsVerifyingUpiPin] = useState(false);
  const upiPinInputRef = useRef(null);

  // Processing & Simulation State
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [failureReason, setFailureReason] = useState('Payment authorization declined by issuing bank');
  const [latestTransaction, setLatestTransaction] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  const curr = getCurrency(currency);

  const handleRequestClose = () => {
    if (isSubmitting || currentStep === 'processing') return; // Do not interrupt in-flight transaction
    if (['details_entry', 'otp_verify', 'otp_verified', 'upi_pin_entry'].includes(currentStep)) {
      setCurrentStep('cancelled');
    } else {
      onClose();
    }
  };

  // Synchronize available credits on mount and event
  useEffect(() => {
    const handleCreditsUpdate = (e) => {
      setAvailableCreditsState(e.detail);
    };
    window.addEventListener('copilot-credits-updated', handleCreditsUpdate);
    return () => window.removeEventListener('copilot-credits-updated', handleCreditsUpdate);
  }, []);

  // Reset or setup state ONLY when modal transitions from closed to open
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      // FREE PLAN GUARD: If Free Plan ($0) is selected, never ask for payment!
      const isFreePlan =
        type === 'subscription' &&
        plan &&
        (String(plan.id || '').toUpperCase() === 'FREE' ||
          String(plan.tier || '').toUpperCase() === 'FREE' ||
          Number(plan.priceMonthly) === 0 ||
          (plan.name && plan.name.toLowerCase().includes('free')));

      if (isFreePlan) {
        if (onPaymentSuccess) {
          onPaymentSuccess({ type: 'subscription', plan });
        }
        if (showToast) {
          showToast('🎉 Free Plan active! No payment required.');
        }
        onClose();
        prevIsOpenRef.current = false;
        return;
      }

      setAvailableCreditsState(getUserCredits());
      setCurrentStep(type === 'subscription' ? 'plan_options' : 'method_selection');
      setUseCredits(true);
      setPayAmount(true);
      setFieldErrors({});
      setValidationPopup(null);
      setOtpCode('');
      setOtpError('');
      setUpiPin('');
      setUpiPinError('');
      setShowUpiPin(false);
      setIsVerifyingUpiPin(false);
      setSimulateFailure(false);
      setLatestTransaction(null);
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]); // ONLY depends on isOpen to avoid resetting state during interactions

  // OTP countdown timer
  useEffect(() => {
    if (currentStep === 'otp_verify') {
      setOtpTimer(45);
      setOtpError('');
      timerIntervalRef.current = setInterval(() => {
        setOtpTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [currentStep]);

  // Pricing calculations for Subscription
  const subscriptionPricing = useMemo(() => {
    if (!plan) return { baseUSD: 0, convertedTotal: 0, requiredCredits: 0 };
    const baseMonthly = Number(plan.priceMonthly) || 0;
    const isYearly = billingCycle === 'yearly';

    const annualTotalUSD = (plan.priceAnnual !== undefined && plan.priceAnnual !== null)
      ? Number(plan.priceAnnual)
      : (plan.priceYearly !== undefined && plan.priceYearly !== null)
        ? Number(plan.priceYearly)
        : (plan.annualPrice !== undefined && plan.annualPrice !== null)
          ? Number(plan.annualPrice)
          : Math.round(baseMonthly * 12 * 0.8);

    const monthlyRateUSD = isYearly ? Math.round(annualTotalUSD / 12) : baseMonthly;
    const totalUSD = isYearly ? annualTotalUSD : baseMonthly;
    const convertedTotal = convertFromUSD(totalUSD, currency);
    const requiredCredits = Math.round(totalUSD * CREDITS_PER_USD);

    return {
      monthlyRateUSD,
      totalUSD,
      convertedTotal,
      requiredCredits,
      periodLabel: isYearly ? 'Annual Billing (Save 20%)' : 'Monthly Billing',
      billingPeriod: isYearly ? '/ year' : '/ month'
    };
  }, [plan, billingCycle, currency]);

  // Top-Up calculations for Credits
  const topUpPricing = useMemo(() => {
    if (targetCredits && Number(targetCredits) > 0) {
      const creditsToReceive = Number(targetCredits);
      // Feature top-up (e.g. 50 credits = 1 hour = $1 USD)
      const amountUSD = Math.max(1, Math.round((creditsToReceive / 50) * 100) / 100);
      const convertedTotal = convertFromUSD(amountUSD, currency);
      return {
        amountUSD,
        convertedTotal,
        creditsToReceive
      };
    }
    const amountUSD = Number(creditTopUpAmount) || 1;
    const convertedTotal = convertFromUSD(amountUSD, currency);
    const creditsToReceive = Math.round(amountUSD * CREDITS_PER_USD);
    return {
      amountUSD,
      convertedTotal,
      creditsToReceive
    };
  }, [creditTopUpAmount, targetCredits, currency]);

  // Scenario breakdown for Subscription: Credits Only vs Amount Only vs Credits + Amount
  const planPaymentBreakdown = useMemo(() => {
    if (type !== 'subscription') {
      return {
        scenario: 'topup',
        creditsUsed: 0,
        creditDiscountUSD: 0,
        amountToPayUSD: topUpPricing.amountUSD,
        amountToPayConverted: topUpPricing.convertedTotal,
        hasEnoughCreditsForFull: false,
        remainingCreditsAfter: availableCredits
      };
    }

    const { totalUSD, requiredCredits } = subscriptionPricing;
    const hasEnoughCreditsForFull = availableCredits >= requiredCredits;

    // SCENARIO A: Credits Only
    if (useCredits && !payAmount) {
      return {
        scenario: 'credits_only',
        creditsUsed: hasEnoughCreditsForFull ? requiredCredits : availableCredits,
        creditDiscountUSD: hasEnoughCreditsForFull ? totalUSD : availableCredits / CREDITS_PER_USD,
        amountToPayUSD: 0,
        amountToPayConverted: 0,
        hasEnoughCreditsForFull,
        remainingCreditsAfter: hasEnoughCreditsForFull ? availableCredits - requiredCredits : availableCredits
      };
    }

    // SCENARIO B: Amount Only
    if (!useCredits && payAmount) {
      return {
        scenario: 'amount_only',
        creditsUsed: 0,
        creditDiscountUSD: 0,
        amountToPayUSD: totalUSD,
        amountToPayConverted: subscriptionPricing.convertedTotal,
        hasEnoughCreditsForFull,
        remainingCreditsAfter: availableCredits
      };
    }

    // SCENARIO C: Credits + Amount
    if (useCredits && payAmount) {
      const creditsToApply = Math.min(availableCredits, requiredCredits);
      const creditDiscountUSD = creditsToApply / CREDITS_PER_USD;
      const remainingAmountUSD = Math.max(0, totalUSD - creditDiscountUSD);
      const remainingAmountConverted = convertFromUSD(remainingAmountUSD, currency);

      return {
        scenario: 'credits_and_amount',
        creditsUsed: creditsToApply,
        creditDiscountUSD,
        amountToPayUSD: remainingAmountUSD,
        amountToPayConverted: remainingAmountConverted,
        hasEnoughCreditsForFull,
        remainingCreditsAfter: availableCredits - creditsToApply
      };
    }

    // Neither selected
    return {
      scenario: 'none',
      creditsUsed: 0,
      creditDiscountUSD: 0,
      amountToPayUSD: totalUSD,
      amountToPayConverted: subscriptionPricing.convertedTotal,
      hasEnoughCreditsForFull: false,
      remainingCreditsAfter: availableCredits
    };
  }, [type, useCredits, payAmount, availableCredits, subscriptionPricing, topUpPricing, currency]);

  // Filtered payment methods
  const filteredPaymentMethods = useMemo(() => {
    if (!methodSearch.trim()) return PAYMENT_METHODS;
    const q = methodSearch.trim().toLowerCase();
    return PAYMENT_METHODS.filter((m) =>
      m.name.toLowerCase().includes(q) ||
      m.subtitle.toLowerCase().includes(q) ||
      m.tags.some((t) => t.includes(q))
    );
  }, [methodSearch]);

  const isValid10DigitMobile = (str) => /^\d{10}$/.test(String(str || '').trim());
  const isValidUpiId = (str) =>
    /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z0-9.\-_]+$/.test(String(str || '').trim()) ||
    String(str || '').trim().startsWith('upi://');

  // Validation for Card Form (Clean, in-place, without resetting steps)
  const validateCardForm = () => {
    const errors = {};
    const cleanNumber = cardNumber.replace(/\s+/g, '');
    const cleanHolder = cardHolder.trim();
    const cleanCvv = cardCvv.trim();
    const cleanPhone = String(phoneNumber || '').replace(/\D/g, '');

    const isEmptyNumber = !cleanNumber;
    const isEmptyHolder = !cleanHolder;
    const isEmptyExpiry = !cardExpiry;
    const isEmptyCvv = !cleanCvv;
    const isEmptyPhone = !cleanPhone;

    const emptyCount = [isEmptyNumber, isEmptyHolder, isEmptyExpiry, isEmptyCvv, isEmptyPhone].filter(Boolean).length;

    // Check expiry date
    let isExpired = false;
    let isInvalidExpiryFormat = false;
    if (cardExpiry) {
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(cardExpiry)) {
        isInvalidExpiryFormat = true;
      } else {
        const [m, y] = cardExpiry.split('/').map(Number);
        const fullYear = 2000 + y;
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        if (fullYear < currentYear || (fullYear === currentYear && m < currentMonth)) {
          isExpired = true;
        }
      }
    }

    // 1. Card Number
    if (isEmptyNumber) {
      errors.cardNumber = 'Card number is required.';
    } else if (cleanNumber.length !== 16 || !/^\d{16}$/.test(cleanNumber)) {
      errors.cardNumber = `Card number must be exactly 16 digits (entered ${cleanNumber.length}).`;
    }

    // 2. Cardholder Name
    if (isEmptyHolder) {
      errors.cardHolder = 'Cardholder name is required.';
    } else if (cleanHolder.length < 3) {
      errors.cardHolder = 'Cardholder name must be at least 3 characters.';
    }

    // 3. Expiry Date
    if (isEmptyExpiry) {
      errors.cardExpiry = 'Expiry date is required (MM/YY).';
    } else if (isInvalidExpiryFormat) {
      errors.cardExpiry = 'Enter expiry date in MM/YY format (e.g. 12/28).';
    } else if (isExpired) {
      errors.cardExpiry = 'Card has expired. Enter a valid future date.';
    }

    // 4. CVV
    if (isEmptyCvv) {
      errors.cardCvv = 'CVV security code is required.';
    } else if (!/^\d{3,4}$/.test(cleanCvv)) {
      errors.cardCvv = 'CVV must be 3 or 4 digits.';
    }

    // 5. Phone Number (Strict digit count based on selected country)
    const expectedPhoneDigits = selectedCountry?.digits || 10;
    if (isEmptyPhone) {
      errors.phoneNumber = `Mobile number is required for 2FA OTP (${expectedPhoneDigits} digits).`;
    } else if (cleanPhone.length !== expectedPhoneDigits) {
      errors.phoneNumber = `Mobile number must be exactly ${expectedPhoneDigits} digits for ${selectedCountry.country} (entered ${cleanPhone.length}).`;
    }

    // Clear and informative validation popup alert
    if (emptyCount >= 2) {
      setValidationPopup({
        title: 'Payment Details Incomplete',
        message: 'Please fill in all required card details (Card Number, Cardholder Name, Expiry Date, CVV, and Mobile Number) to proceed with payment.'
      });
    } else if (isExpired) {
      setValidationPopup({
        title: 'Card Expired',
        message: `Card details rejected: The expiry date entered (${cardExpiry}) is in the past. Please enter a valid future expiration date (MM/YY).`
      });
    } else if (isEmptyNumber) {
      setValidationPopup({
        title: 'Card Number Required',
        message: 'Please enter your 16-digit debit or credit card number.'
      });
    } else if (errors.cardNumber) {
      setValidationPopup({
        title: 'Invalid Card Number',
        message: `Card number must be exactly 16 digits (currently ${cleanNumber.length} digits entered). Please check and enter all 16 digits.`
      });
    } else if (isEmptyHolder || errors.cardHolder) {
      setValidationPopup({
        title: 'Cardholder Name Required',
        message: 'Please enter the cardholder name printed on the card.'
      });
    } else if (isEmptyExpiry || isInvalidExpiryFormat) {
      setValidationPopup({
        title: 'Expiry Date Required',
        message: 'Please enter card expiry date in MM/YY format (e.g. 12/28).'
      });
    } else if (isEmptyCvv || errors.cardCvv) {
      setValidationPopup({
        title: 'CVV Required',
        message: 'Please enter the 3 or 4 digit CVV code from the back of your card.'
      });
    } else if (isEmptyPhone) {
      setValidationPopup({
        title: 'Mobile Number Required',
        message: `Please enter your ${expectedPhoneDigits}-digit mobile phone number for ${selectedCountry.country} (${selectedCountry.code}) to receive the 2FA authentication OTP.`
      });
    } else if (errors.phoneNumber) {
      setValidationPopup({
        title: 'Invalid Mobile Number',
        message: `Mobile phone number must be exactly ${expectedPhoneDigits} digits for ${selectedCountry.country} (${selectedCountry.code}). Currently ${cleanPhone.length} digits entered.`
      });
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Validation for other methods (PhonePe, Google Pay, Paytm, UPI, Netbanking, PayPal)
  const validateCurrentMethodForm = () => {
    setValidationPopup(null);
    if (selectedMethod === 'card') {
      return validateCardForm();
    }
    const errors = {};
    if (selectedMethod === 'upi') {
      const val = upiId.trim();
      if (!val) {
        errors.upiId = 'UPI ID or VPA is required.';
        setValidationPopup({
          title: 'UPI ID Required',
          message: 'Please enter your UPI ID (e.g. username@okhdfcbank) or scan the QR code.'
        });
      } else if (!isValidUpiId(val)) {
        errors.upiId = 'Invalid UPI ID format. Must contain "@" (e.g. user@okhdfcbank).';
        setValidationPopup({
          title: 'Invalid UPI ID',
          message: 'UPI ID must contain a valid handle with "@" (e.g. yourname@okhdfcbank or 9876543210@paytm).'
        });
      }
    } else if (selectedMethod === 'gpay') {
      const val = gpayNumber.trim();
      if (!val) {
        errors.gpay = 'Enter valid Google Pay 10-digit mobile number or UPI ID.';
        setValidationPopup({
          title: 'Google Pay Details Required',
          message: 'Please enter your registered 10-digit mobile number or UPI ID.'
        });
      } else if (!isValid10DigitMobile(val) && !isValidUpiId(val)) {
        errors.gpay = 'Enter a valid 10-digit mobile number or valid @ UPI ID.';
        setValidationPopup({
          title: 'Invalid Google Pay Details',
          message: 'Mobile number must be exactly 10 digits (e.g. 9876543210), or enter a valid UPI ID containing "@" (e.g. 9876543210@okaxis).'
        });
      }
    } else if (selectedMethod === 'phonepe') {
      const val = phonepeNumber.trim();
      if (!val) {
        errors.phonepe = 'Enter valid PhonePe 10-digit mobile number or UPI ID.';
        setValidationPopup({
          title: 'PhonePe Details Required',
          message: 'Please enter your registered 10-digit mobile number or UPI ID.'
        });
      } else if (!isValid10DigitMobile(val) && !isValidUpiId(val)) {
        errors.phonepe = 'Enter a valid 10-digit mobile number or valid @ UPI ID.';
        setValidationPopup({
          title: 'Invalid PhonePe Details',
          message: 'Mobile number must be exactly 10 digits (e.g. 9876543210), or enter a valid UPI ID containing "@" (e.g. user@ybl).'
        });
      }
    } else if (selectedMethod === 'paytm') {
      const val = paytmNumber.trim();
      if (!val) {
        errors.paytm = 'Enter valid Paytm 10-digit registered number or UPI ID.';
        setValidationPopup({
          title: 'Paytm Details Required',
          message: 'Please enter your registered 10-digit mobile number or UPI ID.'
        });
      } else if (!isValid10DigitMobile(val) && !isValidUpiId(val)) {
        errors.paytm = 'Enter a valid 10-digit mobile number or valid @ UPI ID.';
        setValidationPopup({
          title: 'Invalid Paytm Details',
          message: 'Mobile number must be exactly 10 digits (e.g. 9876543210), or enter a valid UPI ID containing "@" (e.g. user@paytm).'
        });
      }
    } else if (selectedMethod === 'paypal') {
      const val = paypalEmail.trim();
      if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        errors.paypal = 'Enter a valid PayPal email address.';
        setValidationPopup({
          title: 'Invalid PayPal Email',
          message: 'Please enter a valid registered email address (e.g. user@domain.com).'
        });
      }
    } else if (selectedMethod === 'netbanking') {
      if (!bankAccountHolder.trim()) {
        errors.bankAccountHolder = 'Account holder name is required.';
        setValidationPopup({
          title: 'Account Holder Required',
          message: 'Please enter the registered account holder name.'
        });
      } else if (!bankAccountNumber.trim() || bankAccountNumber.length < 8) {
        errors.bankAccountNumber = 'Enter valid bank account number / customer ID (min 8 digits).';
        setValidationPopup({
          title: 'Invalid Account Number',
          message: 'Bank account number / customer ID must be at least 8 digits.'
        });
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle Proceed from Plan Options step
  const handleProceedFromPlanOptions = () => {
    if (!useCredits && !payAmount) {
      if (showToast) showToast('Please select a payment option.');
      return;
    }

    // Credits only scenario
    if (useCredits && !payAmount) {
      if (!planPaymentBreakdown.hasEnoughCreditsForFull) {
        if (showToast) {
          showToast('Insufficient credits. Please select Pay Amount or use Credits + Amount.');
        }
        return;
      }
      // Sufficient credits: proceed directly to payment processing (no card/payment details needed!)
      handleStartProcessing(true);
      return;
    }

    // Otherwise continue to payment method selection
    setCurrentStep('method_selection');
  };

  // Handle Proceed from Payment Method selection
  const handleProceedFromMethodSelection = () => {
    if (!selectedMethod) {
      if (showToast) showToast('Please select a payment method.');
      return;
    }
    setValidationPopup(null);
    setCurrentStep('details_entry');
  };

  // Handle Submit Payment Details
  const handleSubmitPaymentDetails = () => {
    if (!validateCurrentMethodForm()) {
      return;
    }
    setValidationPopup(null);

    // STRICT AUDIO REQUIREMENT:
    // - Credit/Debit Card payments require OTP verification!
    // - UPI payments (UPI, Google Pay, PhonePe, Paytm) require 4-digit UPI PIN!
    // - Other payments (Net Banking, PayPal) proceed directly to payment processing!
    if (selectedMethod === 'card') {
      setCurrentStep('otp_verify');
    } else if (['upi', 'gpay', 'phonepe', 'paytm'].includes(selectedMethod)) {
      setUpiPin('');
      setUpiPinError('');
      setShowUpiPin(false);
      setCurrentStep('upi_pin_entry');
    } else {
      handleStartProcessing(false);
    }
  };

  // Handle 4-Digit UPI PIN Verification
  const handleVerifyUpiPin = () => {
    setUpiPinError('');
    setValidationPopup(null);

    const cleanPin = upiPin.trim();
    if (!cleanPin) {
      setUpiPinError('Please enter your 4-digit UPI PIN.');
      setValidationPopup({
        title: 'UPI PIN Required',
        message: 'Please enter your 4-digit UPI PIN to authorize this payment.'
      });
      return;
    }

    if (cleanPin.length !== 4 || !/^\d{4}$/.test(cleanPin)) {
      setUpiPinError('UPI PIN must be exactly 4 digits.');
      setValidationPopup({
        title: 'Invalid UPI PIN',
        message: `UPI PIN must be exactly 4 digits (currently ${cleanPin.length} digits entered).`
      });
      return;
    }

    setIsVerifyingUpiPin(true);
    setTimeout(() => {
      setIsVerifyingUpiPin(false);
      handleStartProcessing(false);
    }, 700);
  };

  // Handle OTP Verification
  const handleVerifyOtp = () => {
    setOtpError('');
    setValidationPopup(null);
    if (otpTimer === 0) {
      setOtpError('OTP expired. Please request a new OTP.');
      setValidationPopup({
        title: 'OTP Expired',
        message: 'The OTP code has expired. Please click "Resend OTP" to generate a fresh code.'
      });
      return;
    }
    if (otpCode.trim() !== DEMO_OTP) {
      const failReason = 'Payment cancelled: Incorrect 2FA OTP verification code entered.';
      setOtpError('Invalid OTP code. Transaction cancelled.');
      setFailureReason(failReason);

      // Strict Audio Requirement: Record failed transaction in history store
      const failedTxn = addTransactionRecord({
        type: type === 'subscription' ? 'Subscription Plan' : 'Credit Top-up',
        planOrPackage: type === 'subscription' ? (plan?.name || `${plan?.id} Plan`) : `${topUpPricing.creditsToReceive.toLocaleString()} Credits Pack`,
        creditsAdded: 0,
        creditsUsed: 0,
        amount: type === 'subscription' ? (planPaymentBreakdown.amountToPayUSD || 0) : creditTopUpAmount,
        currency: 'USD',
        currencySymbol: '$',
        paymentMethod: 'Credit / Debit Card',
        methodCode: 'card',
        status: 'Failed',
        failureReason: failReason
      });
      setLatestTransaction(failedTxn);
      setCurrentStep('failure');
      if (showToast) showToast('❌ Payment cancelled due to invalid OTP.');
      return;
    }

    setIsVerifyingOtp(true);
    setTimeout(() => {
      setIsVerifyingOtp(false);
      // Immediately proceed to payment authorization and account upgrade!
      handleStartProcessing(false);
    }, 600);
  };

  // Resend OTP
  const handleResendOtp = () => {
    setOtpCode('');
    setOtpError('');
    setOtpTimer(45);
    if (showToast) showToast(`New OTP sent! Demo code: ${DEMO_OTP}`);
  };

  // Payment Processing Step
  const handleStartProcessing = async (isCreditsOnly = false) => {
  console.log('[Billing Checkout]', { type, isCreditsOnly, creditTopUpAmount, currency: curr.code });
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setCurrentStep('processing');

    // Simulate real gateway handshake animation delay (1.2s)
    await new Promise((resolve) => setTimeout(resolve, 1200));

    try {
      if (simulateFailure && !isCreditsOnly) {
        throw new Error(failureReason || 'Payment authorization declined by issuing bank');
      }

      // Check card expiry upfront if card method
      if (selectedMethod === 'card' && !isCreditsOnly && cardExpiry) {
        const [m, y] = cardExpiry.split('/').map(Number);
        const fullYear = 2000 + y;
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        if (fullYear < currentYear || (fullYear === currentYear && m < currentMonth)) {
          throw new Error('Expired card: The card expiry date entered is in the past.');
        }
      }

      // Real backend checkout for credit purchases.
      // The backend creates the Stripe Checkout Session and returns checkoutUrl.
      if (type === 'credits' && !isCreditsOnly) {
        const authToken =
          token ||
          localStorage.getItem('token') ||
          sessionStorage.getItem('copilot_token') ||
          '';

        if (!authToken) {
          throw new Error('Authentication required. Please log in again.');
        }

        const amount = Number(creditTopUpAmount);

        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error('Invalid credit purchase amount.');
        }

        const idempotencyKey =
          `credits-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

        let res;

        try {
          res = await fetch(
            `${API_BASE}/api/billing/credits/checkout`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-suppress-auth-redirect': 'true',
                Authorization: `Bearer ${authToken}`
              },
              body: JSON.stringify({
                amount,
                currency: curr.code,
                idempotencyKey
              })
            }
          );
        } catch (networkError) {
          throw new Error(
            'Network error: Unable to contact the payment server. Please verify your connection.'
          );
        }

        let checkoutData = null;

        try {
          checkoutData = await res.json();
        } catch (_) {
          checkoutData = null;
        }

        if (!res.ok || !checkoutData?.ok) {
          const backendMessage =
            checkoutData?.error?.message ||
            checkoutData?.message ||
            `Credit checkout failed (${res.status}).`;

          throw new Error(backendMessage);
        }

        const checkoutUrl =
          checkoutData?.checkout?.checkoutUrl;

        if (!checkoutUrl) {
          throw new Error(
            'Payment checkout URL was not returned by the server.'
          );
        }

        // Do not add credits locally here.
        // Stripe + the backend webhook are responsible for completing the purchase.
        if (showToast) {
          showToast('Opening secure Stripe checkout...');
        }

        window.location.assign(checkoutUrl);
        return;
      }

      // Real backend checkout for paid subscription plans.
      // The backend decides whether credits fully cover the plan
      // or whether Stripe checkout is required.
      if (type === 'subscription' && plan && !isCreditsOnly) {
        const authToken =
          token ||
          localStorage.getItem('token') ||
          sessionStorage.getItem('copilot_token') ||
          '';

        if (!authToken) {
          throw new Error('Authentication required. Please log in again.');
        }

        const planId = plan.id || plan.tier;

        if (!planId) {
          throw new Error('Subscription plan ID is missing.');
        }

        const idempotencyKey =
          `plan-${planId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

        let res;

        try {
          res = await fetch(
            `${API_BASE}/api/billing/plan/checkout`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-suppress-auth-redirect': 'true',
                Authorization: `Bearer ${authToken}`
              },
              body: JSON.stringify({
                planId,
                idempotencyKey
              })
            }
          );
        } catch (networkError) {
          throw new Error(
            'Network error: Unable to contact the payment server. Please verify your connection.'
          );
        }

        let checkoutData = null;

        try {
          checkoutData = await res.json();
        } catch (_) {
          checkoutData = null;
        }

        if (!res.ok || !checkoutData?.ok) {
          const backendMessage =
            checkoutData?.error?.message ||
            checkoutData?.message ||
            `Subscription checkout failed (${res.status}).`;

          throw new Error(backendMessage);
        }

        if (checkoutData.checkoutRequired === false) {
          if (showToast) {
            showToast('Subscription activated using available credits.');
          }
        } else {
          const checkoutUrl =
            checkoutData?.checkout?.checkoutUrl;

          if (!checkoutUrl) {
            throw new Error(
              'Subscription checkout URL was not returned by the server.'
            );
          }

          if (showToast) {
            showToast('Opening secure Stripe checkout...');
          }

          window.location.assign(checkoutUrl);
          return;
        }
      }

      // Record success
      const creditsDeducted = isCreditsOnly
        ? planPaymentBreakdown.creditsUsed
        : (type === 'subscription' ? planPaymentBreakdown.creditsUsed : 0);
      const creditsAdded = type === 'credits' ? topUpPricing.creditsToReceive : 0;

      // Update local wallet
      let newBalance = availableCredits;
      if (creditsDeducted > 0) newBalance -= creditsDeducted;
      if (creditsAdded > 0) newBalance += creditsAdded;
      setUserCredits(newBalance);
      setAvailableCreditsState(newBalance);

      const methodObj = isCreditsOnly
        ? { name: 'Credits Only', id: 'credits' }
        : PAYMENT_METHODS.find((m) => m.id === selectedMethod) || { name: 'Card', id: 'card' };

      const itemTitle = type === 'subscription'
        ? plan?.name || 'Pro Plan'
        : (customTitle ? customTitle.replace('Top Up ', '') : `${topUpPricing.creditsToReceive.toLocaleString()} Credits Pack`);

      const successTxn = addTransactionRecord({
        type: type === 'subscription' ? 'Subscription Plan' : 'Credit Top-up',
        planOrPackage: itemTitle,
        creditsAdded,
        creditsUsed: creditsDeducted,
        amount: isCreditsOnly ? 0 : (type === 'subscription' ? planPaymentBreakdown.amountToPayConverted : topUpPricing.convertedTotal),
        currency: curr.code,
        currencySymbol: curr.symbol,
        paymentMethod: methodObj.name,
        methodCode: methodObj.id,
        status: 'Successful'
      });
      setLatestTransaction(successTxn);
      setCurrentStep('success');

      if (onPaymentSuccess) {
        onPaymentSuccess({
          type,
          plan,
          creditsAdded,
          creditsDeducted,
          transaction: successTxn
        });
      }
      if (typeof onSuccessExtra === 'function') {
        onSuccessExtra(successTxn);
      }
      if (showToast) showToast('🎉 Payment Successful! Account updated.');
    } catch (err) {
      console.error('Payment processing failed:', err);
      const failedTxn = addTransactionRecord({
        type: type === 'subscription' ? 'Subscription Plan' : 'Credit Top-up',
        planOrPackage: type === 'subscription' ? plan?.name || 'Pro Plan' : `${topUpPricing.creditsToReceive.toLocaleString()} Credits Pack`,
        creditsAdded: 0,
        creditsUsed: 0,
        amount: type === 'subscription' ? planPaymentBreakdown.amountToPayConverted : topUpPricing.convertedTotal,
        currency: curr.code,
        currencySymbol: curr.symbol,
        paymentMethod: PAYMENT_METHODS.find((m) => m.id === selectedMethod)?.name || 'Credit / Debit Card',
        methodCode: selectedMethod,
        status: 'Failed',
        failureReason: err.message || 'Payment authorization failed'
      });
      setLatestTransaction(failedTxn);
      setFailureReason(err.message || 'Payment authorization could not be completed.');
      setCurrentStep('failure');
      if (showToast) showToast('❌ Payment Failed. Please retry.');
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`payment-modal-backdrop ${isDark ? 'dark-theme' : 'light-theme'}`} onClick={() => currentStep !== 'processing' && handleRequestClose()}>
      <div className={`payment-modal-container ${isDark ? 'dark-theme' : 'light-theme'}`} onClick={(e) => e.stopPropagation()}>
        {/* Validation Alert Popup Modal */}
        {validationPopup && (
          <div className="payment-validation-popup-overlay" onClick={() => setValidationPopup(null)}>
            <div className="payment-validation-popup-card" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="popup-close-x"
                onClick={() => setValidationPopup(null)}
                aria-label="Dismiss alert"
              >
                ✕
              </button>
              <div className="popup-icon-badge">
                <i className="fa-solid fa-triangle-exclamation"></i>
              </div>
              <h4 className="popup-title">{validationPopup.title}</h4>
              <p className="popup-message">{validationPopup.message}</p>
              <div className="popup-action-row">
                <button
                  type="button"
                  className="popup-confirm-btn"
                  onClick={() => setValidationPopup(null)}
                  autoFocus
                >
                  <span>Understood</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Header */}
        <div className="payment-modal-header">
          <div className="payment-header-title-box">
            {currentStep !== 'plan_options' && currentStep !== 'success' && currentStep !== 'failure' && currentStep !== 'processing' && currentStep !== 'cancelled' && (
              <button
                type="button"
                className="payment-header-back-btn"
                onClick={() => {
                  if (currentStep === 'upi_pin_entry') setCurrentStep('details_entry');
                  else if (currentStep === 'otp_verified') setCurrentStep('otp_verify');
                  else if (currentStep === 'otp_verify') setCurrentStep('details_entry');
                  else if (currentStep === 'details_entry') setCurrentStep('method_selection');
                  else if (currentStep === 'method_selection') {
                    if (type === 'subscription') setCurrentStep('plan_options');
                    else handleRequestClose();
                  }
                }}
                title="Go back to previous step"
              >
                <i className="fa-solid fa-arrow-left"></i>
              </button>
            )}
            <div className="header-icon-pill">
              <i className={type === 'subscription' ? 'fa-solid fa-crown' : 'fa-solid fa-coins'}></i>
            </div>
            <div>
              <h3 className="payment-header-title">
                {type === 'subscription' ? `Upgrade to ${plan?.name || 'Pro Plan'}` : (customTitle || 'Buy Credits Checkout')}
              </h3>
              <span className="payment-header-subtitle">
                {currentStep === 'plan_options' && 'Select your preferred payment options'}
                {currentStep === 'method_selection' && 'Choose a payment method to complete purchase'}
                {currentStep === 'details_entry' && `Enter ${PAYMENT_METHODS.find((m) => m.id === selectedMethod)?.name || 'Payment'} Details`}
                {currentStep === 'otp_verify' && 'Authorize card payment with 2FA OTP verification'}
                {currentStep === 'otp_verified' && 'OTP Verified • Confirm and complete your payment'}
                {currentStep === 'upi_pin_entry' && 'Enter your 4-digit UPI PIN to authorize payment'}
                {currentStep === 'processing' && 'Processing your request securely'}
                {currentStep === 'success' && 'Payment completed successfully'}
                {currentStep === 'failure' && 'Payment could not be completed'}
                {currentStep === 'cancelled' && 'Payment was cancelled &bull; No amount was charged'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="payment-modal-close-btn"
            onClick={handleRequestClose}
            disabled={currentStep === 'processing' || isSubmitting}
            title="Cancel and close"
          >
            ✕
          </button>
        </div>

        {/* STEP 1 (Subscription only): Plan Options & Credit Selection */}
        {currentStep === 'plan_options' && type === 'subscription' && (
          <div className="payment-modal-body">
            {/* Plan Info Card */}
            <div className="payment-plan-hero-card">
              <div className="hero-plan-details">
                <span className="hero-plan-tag">SELECTED PLAN</span>
                <h4 className="hero-plan-name">{plan?.name}</h4>
                <span className="hero-plan-period">{subscriptionPricing.periodLabel}</span>
              </div>
              <div className="hero-plan-price">
                <span className="hero-price-val">
                  {curr.symbol}{subscriptionPricing.convertedTotal.toLocaleString()}
                </span>
                <span className="hero-price-sub">
                  ({curr.code}) &bull; ${subscriptionPricing.totalUSD} USD
                </span>
              </div>
            </div>

            {/* How Would You Like To Pay Selection */}
            <div className="payment-choices-section">
              <h5 className="payment-section-heading">How would you like to pay?</h5>
              <div className="payment-checkbox-grid">
                {/* Option 1: Use Credits */}
                <label className={`payment-choice-card ${useCredits ? 'selected' : ''}`}>
                  <div className="choice-checkbox-box">
                    <input
                      type="checkbox"
                      checked={useCredits}
                      onChange={(e) => setUseCredits(e.target.checked)}
                    />
                  </div>
                  <div className="choice-content">
                    <div className="choice-title-row">
                      <span className="choice-title">Use Credits</span>
                      <span className="choice-badge-rate">1 USD = 250 Credits</span>
                    </div>
                    <p className="choice-desc">
                      Available: <strong>{availableCredits.toLocaleString()} Credits</strong> ($
                      {(availableCredits / CREDITS_PER_USD).toFixed(2)} value)
                    </p>
                  </div>
                </label>

                {/* Option 2: Pay Amount */}
                <label className={`payment-choice-card ${payAmount ? 'selected' : ''}`}>
                  <div className="choice-checkbox-box">
                    <input
                      type="checkbox"
                      checked={payAmount}
                      onChange={(e) => setPayAmount(e.target.checked)}
                    />
                  </div>
                  <div className="choice-content">
                    <div className="choice-title-row">
                      <span className="choice-title">Pay Amount</span>
                      <span className="choice-badge-method">Card, UPI, PayPal, etc.</span>
                    </div>
                    <p className="choice-desc">
                      Pay full or remaining amount via your preferred payment method.
                    </p>
                  </div>
                </label>
              </div>

              {/* Validation Warning when neither is selected */}
              {!useCredits && !payAmount && (
                <div className="payment-warning-alert">
                  <i className="fa-solid fa-triangle-exclamation"></i>
                  <span>Please select a payment option.</span>
                </div>
              )}

              {/* Insufficient Credits Alert when Credits Only is chosen but balance is low */}
              {useCredits && !payAmount && !planPaymentBreakdown.hasEnoughCreditsForFull && (
                <div className="payment-error-alert">
                  <i className="fa-solid fa-circle-exclamation"></i>
                  <div>
                    <strong>Insufficient credits.</strong> You have {availableCredits.toLocaleString()} credits, but {subscriptionPricing.requiredCredits.toLocaleString()} credits are required.
                    <div style={{ marginTop: '4px' }}>
                      Please select <strong>Pay Amount</strong> or use <strong>Credits + Amount</strong>.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Plan Payment Summary */}
            <div className="payment-dynamic-summary-box">
              <div className="summary-title-row">
                <span>Payment Summary</span>
                <span className="summary-status-tag">
                  {useCredits && !payAmount && 'Credits Only'}
                  {!useCredits && payAmount && 'Amount Only'}
                  {useCredits && payAmount && 'Credits + Amount'}
                </span>
              </div>
              <div className="summary-line">
                <span>Plan Price</span>
                <strong>
                  {curr.symbol}{subscriptionPricing.convertedTotal.toLocaleString()} ({curr.code})
                </strong>
              </div>

              {useCredits && (
                <div className="summary-line highlight-green">
                  <span>
                    Credits Used ({planPaymentBreakdown.creditsUsed.toLocaleString()} Credits)
                  </span>
                  <span>
                    -{curr.symbol}{convertFromUSD(planPaymentBreakdown.creditDiscountUSD, currency).toLocaleString()}
                  </span>
                </div>
              )}

              <div className="summary-divider"></div>

              <div className="summary-line total-line">
                <span>Remaining Amount to Pay</span>
                <span className="final-amount-highlight">
                  {curr.symbol}{planPaymentBreakdown.amountToPayConverted.toLocaleString()}
                </span>
              </div>

              {useCredits && (
                <div className="remaining-credits-note">
                  <i className="fa-solid fa-wallet"></i> Remaining Wallet Balance after checkout:{' '}
                  <strong>{planPaymentBreakdown.remainingCreditsAfter.toLocaleString()} Credits</strong>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="payment-step-actions">
              <button type="button" className="payment-btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="payment-btn-proceed"
                onClick={handleProceedFromPlanOptions}
                disabled={(!useCredits && !payAmount) || (useCredits && !payAmount && !planPaymentBreakdown.hasEnoughCreditsForFull)}
              >
                {useCredits && !payAmount ? (
                  <>
                    <span>Confirm Upgrade with Credits ($0)</span>
                    <i className="fa-solid fa-bolt"></i>
                  </>
                ) : (
                  <>
                    <span>Continue to Payment Method</span>
                    <i className="fa-solid fa-arrow-right"></i>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Payment Method Selection */}
        {currentStep === 'method_selection' && (
          <div className="payment-modal-body">
            {/* Top Summary Banner */}
            <div className="payment-checkout-mini-summary">
              <div className="mini-summary-item">
                <span className="mini-label">Purchase:</span>
                <span className="mini-val">
                  {type === 'subscription' ? plan?.name : `${topUpPricing.creditsToReceive.toLocaleString()} Credits`}
                </span>
              </div>
              <div className="mini-summary-item">
                <span className="mini-label">Total to Pay:</span>
                <span className="mini-val highlight">
                  {curr.symbol}
                  {(type === 'subscription' ? planPaymentBreakdown.amountToPayConverted : topUpPricing.convertedTotal).toLocaleString()} {curr.code}
                </span>
              </div>
            </div>

            {/* Search Payment Method */}
            <div className="payment-method-search-bar">
              <i className="fa-solid fa-magnifying-glass search-icon"></i>
              <input
                type="text"
                placeholder="Search payment method (e.g. Card, Google Pay, PhonePe, Paytm, PayPal)..."
                value={methodSearch}
                onChange={(e) => setMethodSearch(e.target.value)}
              />
              {methodSearch && (
                <button type="button" className="search-clear-btn" onClick={() => setMethodSearch('')}>
                  ✕
                </button>
              )}
            </div>

            {/* Methods Grid */}
            <div className="payment-methods-grid">
              {filteredPaymentMethods.length === 0 ? (
                <div className="payment-methods-empty">
                  <i className="fa-solid fa-circle-question"></i>
                  <p>No payment method found matching &ldquo;{methodSearch}&rdquo;.</p>
                  <button type="button" className="btn-reset-search" onClick={() => setMethodSearch('')}>
                    View All Methods
                  </button>
                </div>
              ) : (
                filteredPaymentMethods.map((m) => {
                  const isSelected = selectedMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`payment-method-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedMethod(m.id)}
                    >
                      <div className="method-card-left">
                        <div className="method-icon-box">
                          <i className={m.icon}></i>
                        </div>
                        <div className="method-info">
                          <span className="method-name">{m.name}</span>
                          <span className="method-subtitle">{m.subtitle}</span>
                        </div>
                      </div>
                      <div className="method-card-radio">
                        <div className={`custom-radio-circle ${isSelected ? 'checked' : ''}`}></div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Action Buttons */}
            <div className="payment-step-actions">
              <button
                type="button"
                className="payment-btn-cancel"
                onClick={() => {
                  if (type === 'subscription') setCurrentStep('plan_options');
                  else onClose();
                }}
              >
                Back
              </button>
              <button
                type="button"
                className="payment-btn-proceed"
                onClick={handleProceedFromMethodSelection}
                disabled={!selectedMethod}
              >
                <span>Continue with {PAYMENT_METHODS.find((m) => m.id === selectedMethod)?.name}</span>
                <i className="fa-solid fa-arrow-right"></i>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Payment Details Entry Form */}
        {currentStep === 'details_entry' && (
          <div className="payment-modal-body">
            {/* Amount Banner */}
            <div className="payment-details-amount-banner">
              <div>
                <span className="amount-banner-label">Amount Due:</span>
                <h4 className="amount-banner-val">
                  {curr.symbol}
                  {(type === 'subscription' ? planPaymentBreakdown.amountToPayConverted : topUpPricing.convertedTotal).toLocaleString()} {curr.code}
                </h4>
              </div>
              <div className="selected-method-pill">
                <i className={PAYMENT_METHODS.find((m) => m.id === selectedMethod)?.icon}></i>
                <span>{PAYMENT_METHODS.find((m) => m.id === selectedMethod)?.name}</span>
              </div>
            </div>

            {/* FORM 1: Common Card Payment Form */}
            {selectedMethod === 'card' && (
              <div className="payment-fields-form">
                <div className="form-group">
                  <label className="form-label">Card Number</label>
                  <div className="input-with-icon">
                    <i className="fa-solid fa-credit-card input-left-icon"></i>
                    <input
                      type="text"
                      className={`form-input ${fieldErrors.cardNumber ? 'has-error' : ''}`}
                      placeholder="1234 5678 9012 3456"
                      maxLength="19"
                      value={cardNumber}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/\D/g, '').slice(0, 16);
                        const formatted = clean.match(/.{1,4}/g)?.join(' ') || clean;
                        setCardNumber(formatted);
                        if (fieldErrors.cardNumber) setFieldErrors((prev) => ({ ...prev, cardNumber: null }));
                      }}
                    />
                  </div>
                  {fieldErrors.cardNumber && <span className="field-error-text">{fieldErrors.cardNumber}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Cardholder Name</label>
                  <input
                    type="text"
                    className={`form-input ${fieldErrors.cardHolder ? 'has-error' : ''}`}
                    placeholder="Name as it appears on card"
                    value={cardHolder}
                    onChange={(e) => {
                      setCardHolder(e.target.value);
                      if (fieldErrors.cardHolder) setFieldErrors((prev) => ({ ...prev, cardHolder: null }));
                    }}
                  />
                  {fieldErrors.cardHolder && <span className="field-error-text">{fieldErrors.cardHolder}</span>}
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label className="form-label">Expiry Date</label>
                    <input
                      type="text"
                      className={`form-input ${fieldErrors.cardExpiry ? 'has-error' : ''}`}
                      placeholder="MM/YY"
                      maxLength="5"
                      value={cardExpiry}
                      onChange={(e) => {
                        let val = e.target.value.replace(/\D/g, '').slice(0, 4);
                        if (val.length >= 3) {
                          val = `${val.slice(0, 2)}/${val.slice(2)}`;
                        }
                        setCardExpiry(val);
                        if (fieldErrors.cardExpiry) setFieldErrors((prev) => ({ ...prev, cardExpiry: null }));
                      }}
                    />
                    {fieldErrors.cardExpiry && <span className="field-error-text">{fieldErrors.cardExpiry}</span>}
                  </div>

                  <div className="form-group">
                    <label className="form-label">CVV / CVC</label>
                    <input
                      type="password"
                      className={`form-input ${fieldErrors.cardCvv ? 'has-error' : ''}`}
                      placeholder="3 or 4 digits"
                      maxLength="4"
                      value={cardCvv}
                      onChange={(e) => {
                        setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4));
                        if (fieldErrors.cardCvv) setFieldErrors((prev) => ({ ...prev, cardCvv: null }));
                      }}
                    />
                    {fieldErrors.cardCvv && <span className="field-error-text">{fieldErrors.cardCvv}</span>}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <i className="fa-solid fa-mobile-screen" style={{ marginRight: '6px', color: '#6366f1' }}></i>
                    Mobile Number (for 2FA OTP Verification)
                  </label>
                  <div className="phone-input-group">
                    <div className="country-code-select-wrapper">
                      <select
                        className="country-code-native-select"
                        value={selectedCountryId}
                        onChange={(e) => {
                          const newId = e.target.value;
                          setSelectedCountryId(newId);
                          const matchedCountry = COUNTRY_DIAL_CODES.find((c) => c.id === newId);
                          const allowedDigits = matchedCountry?.digits || 10;
                          setPhoneNumber((prev) => prev.slice(0, allowedDigits));
                          if (fieldErrors.phoneNumber) {
                            setFieldErrors((prev) => ({ ...prev, phoneNumber: null }));
                          }
                        }}
                        aria-label="Select Country Calling Code"
                      >
                        {COUNTRY_DIAL_CODES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.flag} {c.code} ({c.country})
                          </option>
                        ))}
                      </select>
                      <i className="fa-solid fa-chevron-down country-select-caret"></i>
                    </div>
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className={`form-input phone-number-input ${fieldErrors.phoneNumber ? 'has-error' : ''}`}
                      placeholder={`e.g. ${selectedCountry.placeholder || '98765 43210'}`}
                      maxLength={selectedCountry.digits || 10}
                      value={phoneNumber}
                      onChange={(e) => {
                        const allowedDigits = selectedCountry.digits || 10;
                        const cleanDigitsOnly = e.target.value.replace(/\D/g, '').slice(0, allowedDigits);
                        setPhoneNumber(cleanDigitsOnly);
                        if (fieldErrors.phoneNumber) setFieldErrors((prev) => ({ ...prev, phoneNumber: null }));
                      }}
                    />
                  </div>
                  {fieldErrors.phoneNumber ? (
                    <span className="field-error-text">{fieldErrors.phoneNumber}</span>
                  ) : (
                    <span className="field-helper-hint" style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                      A 6-digit OTP code ({DEMO_OTP}) will be sent to <strong>{selectedCountry.code} {phoneNumber || selectedCountry.placeholder}</strong> (exactly {selectedCountry.digits || 10} digits required).
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* FORM 2: UPI & QR Code */}
            {selectedMethod === 'upi' && (
              <div className="payment-fields-form">
                <div className="upi-qr-display-box">
                  <div className="qr-box">
                    <svg viewBox="0 0 100 100" className="qr-svg-mock">
                      <rect width="100" height="100" fill="#ffffff" rx="6" />
                      <rect x="8" y="8" width="24" height="24" fill="#0f172a" rx="2" />
                      <rect x="12" y="12" width="16" height="16" fill="#ffffff" rx="1" />
                      <rect x="15" y="15" width="10" height="10" fill="#0f172a" />
                      <rect x="68" y="8" width="24" height="24" fill="#0f172a" rx="2" />
                      <rect x="72" y="12" width="16" height="16" fill="#ffffff" rx="1" />
                      <rect x="75" y="15" width="10" height="10" fill="#0f172a" />
                      <rect x="8" y="68" width="24" height="24" fill="#0f172a" rx="2" />
                      <rect x="12" y="72" width="16" height="16" fill="#ffffff" rx="1" />
                      <rect x="15" y="75" width="10" height="10" fill="#0f172a" />
                      <circle cx="50" cy="50" r="6" fill="#6366f1" />
                      <rect x="42" y="14" width="16" height="6" fill="#0f172a" />
                      <rect x="42" y="80" width="16" height="6" fill="#0f172a" />
                    </svg>
                    <span className="qr-scan-sub">Scan with any UPI App</span>
                  </div>
                  <div className="upi-id-form-side">
                    <label className="form-label">Or Enter Virtual Payment Address (UPI ID)</label>
                    <input
                      type="text"
                      className={`form-input ${fieldErrors.upiId ? 'has-error' : ''}`}
                      placeholder="e.g. yourname@okhdfcbank"
                      value={upiId}
                      onChange={(e) => {
                        setUpiId(e.target.value);
                        if (fieldErrors.upiId) setFieldErrors((prev) => ({ ...prev, upiId: null }));
                      }}
                    />
                    {fieldErrors.upiId && <span className="field-error-text">{fieldErrors.upiId}</span>}
                    <div className="upi-quick-chips">
                      {['@okhdfcbank', '@okaxis', '@oksbi', '@paytm'].map((h) => (
                        <button
                          key={h}
                          type="button"
                          className="upi-chip"
                          onClick={() => setUpiId((prev) => (prev ? prev.split('@')[0] : 'user') + h)}
                        >
                          {h}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* FORM 3: Google Pay */}
            {selectedMethod === 'gpay' && (
              <div className="payment-fields-form">
                <div className="form-group">
                  <label className="form-label">Google Pay Mobile Number / UPI ID</label>
                  <input
                    type="text"
                    className={`form-input ${fieldErrors.gpay ? 'has-error' : ''}`}
                    placeholder="e.g. 9876543210 or user@okaxis"
                    value={gpayNumber}
                    onChange={(e) => {
                      setGpayNumber(e.target.value);
                      if (fieldErrors.gpay) setFieldErrors((prev) => ({ ...prev, gpay: null }));
                    }}
                  />
                  {fieldErrors.gpay && <span className="field-error-text">{fieldErrors.gpay}</span>}
                </div>
                <div className="provider-helper-note">
                  <i className="fa-brands fa-google-pay"></i> A payment request will be sent to your Google Pay app for authorization.
                </div>
              </div>
            )}

            {/* FORM 4: PhonePe */}
            {selectedMethod === 'phonepe' && (
              <div className="payment-fields-form">
                <div className="form-group">
                  <label className="form-label">PhonePe Mobile Number / UPI ID</label>
                  <input
                    type="text"
                    className={`form-input ${fieldErrors.phonepe ? 'has-error' : ''}`}
                    placeholder="e.g. 9876543210 or user@ybl"
                    value={phonepeNumber}
                    onChange={(e) => {
                      setPhonepeNumber(e.target.value);
                      if (fieldErrors.phonepe) setFieldErrors((prev) => ({ ...prev, phonepe: null }));
                    }}
                  />
                  {fieldErrors.phonepe && <span className="field-error-text">{fieldErrors.phonepe}</span>}
                </div>
                <div className="provider-helper-note">
                  <i className="fa-solid fa-mobile-screen"></i> You will receive an authorization prompt in your PhonePe application.
                </div>
              </div>
            )}

            {/* FORM 5: Paytm */}
            {selectedMethod === 'paytm' && (
              <div className="payment-fields-form">
                <div className="form-group">
                  <label className="form-label">Paytm Registered Mobile / UPI ID</label>
                  <input
                    type="text"
                    className={`form-input ${fieldErrors.paytm ? 'has-error' : ''}`}
                    placeholder="e.g. 9876543210 or user@paytm"
                    value={paytmNumber}
                    onChange={(e) => {
                      setPaytmNumber(e.target.value);
                      if (fieldErrors.paytm) setFieldErrors((prev) => ({ ...prev, paytm: null }));
                    }}
                  />
                  {fieldErrors.paytm && <span className="field-error-text">{fieldErrors.paytm}</span>}
                </div>
                <div className="provider-helper-note">
                  <i className="fa-solid fa-wallet"></i> Pay seamlessly using your Paytm Wallet or linked UPI bank account.
                </div>
              </div>
            )}

            {/* FORM 6: PayPal */}
            {selectedMethod === 'paypal' && (
              <div className="payment-fields-form">
                <div className="form-group">
                  <label className="form-label">PayPal Account Email</label>
                  <input
                    type="email"
                    className={`form-input ${fieldErrors.paypal ? 'has-error' : ''}`}
                    placeholder="e.g. name@example.com"
                    value={paypalEmail}
                    onChange={(e) => setPaypalEmail(e.target.value)}
                  />
                  {fieldErrors.paypal && <span className="field-error-text">{fieldErrors.paypal}</span>}
                </div>
                <div className="provider-helper-note">
                  <i className="fa-brands fa-paypal"></i> Instant checkout with PayPal Buyer Protection and encrypted token exchange.
                </div>
              </div>
            )}

            {/* FORM 7: Net Banking */}
            {selectedMethod === 'netbanking' && (
              <div className="payment-fields-form">
                <div className="form-group">
                  <label className="form-label">Select Your Bank</label>
                  <div className="banks-selector-grid">
                    {['HDFC Bank', 'ICICI Bank', 'SBI Bank', 'Axis Bank', 'Kotak Bank', 'Citibank'].map((b) => (
                      <button
                        key={b}
                        type="button"
                        className={`bank-option-btn ${bankName === b ? 'selected' : ''}`}
                        onClick={() => setBankName(b)}
                      >
                        <i className="fa-solid fa-building-columns"></i>
                        <span>{b}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Account Holder Name</label>
                  <input
                    type="text"
                    className={`form-input ${fieldErrors.bankAccountHolder ? 'has-error' : ''}`}
                    placeholder="Name as registered with bank"
                    value={bankAccountHolder}
                    onChange={(e) => setBankAccountHolder(e.target.value)}
                  />
                  {fieldErrors.bankAccountHolder && <span className="field-error-text">{fieldErrors.bankAccountHolder}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Account Number / Customer ID</label>
                  <input
                    type="text"
                    className={`form-input ${fieldErrors.bankAccountNumber ? 'has-error' : ''}`}
                    placeholder="e.g. 5010049283719"
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 18))}
                  />
                  {fieldErrors.bankAccountNumber && <span className="field-error-text">{fieldErrors.bankAccountNumber}</span>}
                </div>
              </div>
            )}

            <div className="security-encryption-bar">
              <i className="fa-solid fa-shield-halved"></i>
              <span>256-Bit Bank-Grade SSL Encryption &bull; PCI-DSS Level 1 Compliant</span>
            </div>

            {/* Action Buttons */}
            <div className="payment-step-actions">
              <button
                type="button"
                className="payment-btn-cancel"
                onClick={() => setCurrentStep('method_selection')}
                disabled={isSubmitting}
              >
                Back
              </button>
              <button
                type="button"
                className="payment-btn-secondary"
                onClick={handleRequestClose}
                disabled={isSubmitting}
                style={{ padding: '12px 18px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="payment-btn-proceed"
                onClick={handleSubmitPaymentDetails}
                disabled={isSubmitting}
              >
                {selectedMethod === 'card' ? (
                  <>
                    <span>Proceed to OTP Verification</span>
                    <i className="fa-solid fa-lock"></i>
                  </>
                ) : ['upi', 'gpay', 'phonepe', 'paytm'].includes(selectedMethod) ? (
                  <>
                    <span>Proceed to Enter UPI PIN</span>
                    <i className="fa-solid fa-key"></i>
                  </>
                ) : (
                  <>
                    <span>
                      Pay {curr.symbol}
                      {(type === 'subscription'
                        ? planPaymentBreakdown.amountToPayConverted
                        : topUpPricing.convertedTotal
                      ).toLocaleString()} {curr.code} Now
                    </span>
                    <i className="fa-solid fa-bolt"></i>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: OTP Verification Screen */}
        {currentStep === 'otp_verify' && (
          <div className="payment-modal-body otp-verify-body">
            <div className="otp-icon-animated">
              <i className="fa-solid fa-shield-halved"></i>
            </div>
            <h4 className="otp-screen-title">2-Factor Authentication</h4>
            <p className="otp-screen-desc">
              To authorize this payment of{' '}
              <strong>
                {curr.symbol}
                {(type === 'subscription' ? planPaymentBreakdown.amountToPayConverted : topUpPricing.convertedTotal).toLocaleString()} {curr.code}
              </strong>
              , please enter the 6-digit OTP code sent to{' '}
              <strong style={{ color: '#818cf8' }}>{selectedCountry.code} {phoneNumber || selectedCountry.placeholder}</strong>.
            </p>

            <div className="demo-otp-callout" style={{ background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.35)' }}>
              <i className="fa-solid fa-comment-sms" style={{ color: '#818cf8', fontSize: '15px' }}></i>
              <span>
                SMS sent to <strong>{selectedCountry.code} {phoneNumber || selectedCountry.placeholder}</strong>: Your 2FA OTP code is{' '}
                <strong style={{ color: '#38bdf8', fontSize: '13px', letterSpacing: '1px' }}>{DEMO_OTP}</strong>
              </span>
            </div>

            <div className="otp-input-wrapper">
              <input
                type="text"
                className={`otp-main-input ${otpError ? 'has-error' : ''}`}
                placeholder="• • • • • •"
                maxLength="6"
                value={otpCode}
                onChange={(e) => {
                  setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  if (otpError) setOtpError('');
                }}
                disabled={isVerifyingOtp}
                autoFocus
              />
            </div>

            {otpError && (
              <div className="otp-error-message">
                <i className="fa-solid fa-triangle-exclamation"></i>
                <span>{otpError}</span>
              </div>
            )}

            <div className="otp-timer-row">
              {otpTimer > 0 ? (
                <span className="otp-countdown-text">
                  <i className="fa-regular fa-clock"></i> Code expires in <strong>{otpTimer}s</strong>
                </span>
              ) : (
                <span className="otp-countdown-text expired">
                  <i className="fa-solid fa-circle-exclamation"></i> OTP has expired
                </span>
              )}

              <button
                type="button"
                className="otp-resend-btn"
                onClick={handleResendOtp}
                disabled={isVerifyingOtp}
              >
                Resend OTP
              </button>
            </div>

            {/* Test Simulation Controls: Allows testing Payment Failure state! */}
            <div className="payment-test-simulator-box">
              <span className="simulator-label">
                <i className="fa-solid fa-flask"></i> Testing Controls:
              </span>
              <label className="simulator-toggle-label">
                <input
                  type="checkbox"
                  checked={simulateFailure}
                  onChange={(e) => setSimulateFailure(e.target.checked)}
                />
                <span>Simulate Payment Failure after OTP</span>
              </label>
              {simulateFailure && (
                <div style={{ marginTop: '8px' }}>
                  <select
                    value={failureReason}
                    onChange={(e) => setFailureReason(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      color: '#fca5a5',
                      fontSize: '12px'
                    }}
                  >
                    <option value="Card declined by issuing bank (insufficient funds or limit restriction)">Card Declined</option>
                    <option value="Invalid card: Card checksum failed verification">Invalid Card</option>
                    <option value="Expired card: Card expiry date is in the past">Expired Card</option>
                    <option value="Authentication failure: 3D Secure / OTP authorization failed">Authentication Failure</option>
                    <option value="Payment gateway timeout: Bank authorization server did not respond">Payment Timeout</option>
                    <option value="Network error: Unable to communicate with payment processor">Network Error</option>
                    <option value="Backend server error: Subscription database verification failed">Backend/API Error</option>
                  </select>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="payment-step-actions">
              <button
                type="button"
                className="payment-btn-cancel"
                onClick={() => setCurrentStep('details_entry')}
                disabled={isVerifyingOtp}
              >
                Back
              </button>
              <button
                type="button"
                className="payment-btn-secondary"
                onClick={handleRequestClose}
                disabled={isVerifyingOtp}
                style={{ padding: '12px 18px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="payment-btn-proceed"
                onClick={handleVerifyOtp}
                disabled={otpCode.length !== 6 || isVerifyingOtp}
              >
                {isVerifyingOtp ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i>
                    <span>Authorizing Payment...</span>
                  </>
                ) : (
                  <>
                    <span>Verify &amp; Complete Payment</span>
                    <i className="fa-solid fa-circle-check"></i>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4.5: OTP Verified Confirmation Screen (Strict Audio Requirement) */}
        {currentStep === 'otp_verified' && (
          <div className="payment-modal-body otp-verified-body">
            <div className="otp-verified-icon-badge">
              <i className="fa-solid fa-circle-check"></i>
            </div>
            <h4 className="otp-verified-heading">OTP Verified Successfully!</h4>
            <p className="otp-verified-subheading">
              Your 2-Factor Authentication was approved. Please review your transaction summary below and confirm to complete payment.
            </p>

            <div className="otp-verified-summary-card">
              <div className="v-row">
                <span className="v-label">Purchase Item</span>
                <span className="v-val highlight">
                  {type === 'subscription' ? plan?.name || 'Pro Plan' : `${topUpPricing.creditsToReceive.toLocaleString()} Credits`}
                </span>
              </div>
              <div className="v-row">
                <span className="v-label">Payment Method</span>
                <span className="v-val">
                  <i className="fa-solid fa-credit-card" style={{ marginRight: '6px', color: '#6366f1' }}></i>
                  Credit / Debit Card ending in •••• {cardNumber.replace(/\s+/g, '').slice(-4) || '3456'}
                </span>
              </div>
              <div className="v-row">
                <span className="v-label">Cardholder</span>
                <span className="v-val">{cardHolder || 'Authorized Cardholder'}</span>
              </div>
              {type === 'subscription' && useCredits && planPaymentBreakdown.creditsUsed > 0 && (
                <div className="v-row">
                  <span className="v-label">Credits Redeemed</span>
                  <span className="v-val credits-badge">
                    -{planPaymentBreakdown.creditsUsed.toLocaleString()} Credits (-{curr.symbol}{convertFromUSD(planPaymentBreakdown.creditDiscountUSD, currency).toLocaleString()})
                  </span>
                </div>
              )}
              <div className="v-divider"></div>
              <div className="v-row v-total">
                <span className="v-label">Total to Pay</span>
                <span className="v-val v-price">
                  {curr.symbol}
                  {(type === 'subscription'
                    ? planPaymentBreakdown.amountToPayConverted
                    : topUpPricing.convertedTotal
                  ).toLocaleString()} {curr.code}
                </span>
              </div>
            </div>

            <div className="otp-verified-security-note">
              <i className="fa-solid fa-shield-halved"></i>
              <span>One-Time Password authenticated • Ready to execute payment authorization</span>
            </div>

            <div className="payment-step-actions">
              <button
                type="button"
                className="payment-btn-cancel"
                onClick={() => setCurrentStep('otp_verify')}
                disabled={isSubmitting}
              >
                Back to OTP
              </button>
              <button
                type="button"
                className="payment-btn-proceed btn-complete-payment"
                onClick={() => handleStartProcessing(false)}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i>
                    <span>Authorizing Payment...</span>
                  </>
                ) : (
                  <>
                    <span>Proceed to Complete Payment</span>
                    <i className="fa-solid fa-arrow-right"></i>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4-UPI: 4-Digit UPI PIN Screen (Strict Audio Requirement) */}
        {currentStep === 'upi_pin_entry' && (
          <div className="payment-modal-body upi-pin-body">
            {/* NPCI / UPI Shield Badge */}
            <div className="upi-pin-header-badge">
              <div className="npci-badge-circle">
                <i className="fa-solid fa-shield-halved"></i>
              </div>
              <span className="npci-secure-text">
                <i className="fa-solid fa-lock"></i> NPCI Unified Payments Interface
              </span>
            </div>

            <h4 className="upi-pin-title">ENTER 4-DIGIT UPI PIN</h4>
            <p className="upi-pin-subtitle">
              Enter your secret 4-digit UPI PIN to authorize payment of{' '}
              <strong>
                {curr.symbol}
                {(type === 'subscription'
                  ? planPaymentBreakdown.amountToPayConverted
                  : topUpPricing.convertedTotal
                ).toLocaleString()} {curr.code}
              </strong>
            </p>

            {/* Transaction Target Mini-Card */}
            <div className="upi-txn-mini-card">
              <div className="upi-txn-row">
                <span className="txn-lbl">Paying To:</span>
                <strong className="txn-val">PlanCredits &bull; Copilot</strong>
              </div>
              <div className="upi-txn-row">
                <span className="txn-lbl">Debiting Account:</span>
                <span className="txn-vpa">
                  {selectedMethod === 'upi'
                    ? (upiId || 'user@okhdfcbank')
                    : selectedMethod === 'gpay'
                    ? (gpayNumber || 'user@okaxis')
                    : selectedMethod === 'phonepe'
                    ? (phonepeNumber || 'user@ybl')
                    : (paytmNumber || 'user@paytm')}
                </span>
              </div>
              <div className="upi-txn-row">
                <span className="txn-lbl">Amount:</span>
                <span className="txn-amt highlight">
                  {curr.symbol}
                  {(type === 'subscription'
                    ? planPaymentBreakdown.amountToPayConverted
                    : topUpPricing.convertedTotal
                  ).toLocaleString()} {curr.code}
                </span>
              </div>
            </div>

            {/* 4-Digit PIN Input Box */}
            <div className="upi-pin-input-section">
              <div className="upi-pin-boxes-row" onClick={() => upiPinInputRef.current?.focus()}>
                {[0, 1, 2, 3].map((idx) => {
                  const digit = upiPin[idx];
                  const isFilled = digit !== undefined;
                  const isActive = upiPin.length === idx;
                  return (
                    <div
                      key={idx}
                      className={`upi-pin-digit-box ${isFilled ? 'filled' : ''} ${isActive ? 'active' : ''}`}
                    >
                      {isFilled ? (showUpiPin ? digit : '●') : ''}
                    </div>
                  );
                })}
              </div>

              {/* Hidden/Synced input for keyboard typing */}
              <input
                ref={upiPinInputRef}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength="4"
                className="upi-pin-hidden-input"
                value={upiPin}
                onChange={(e) => {
                  const clean = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setUpiPin(clean);
                  if (upiPinError) setUpiPinError('');
                }}
                disabled={isVerifyingUpiPin}
                autoFocus
              />

              {/* Toggle show/hide PIN */}
              <button
                type="button"
                className="upi-pin-toggle-btn"
                onClick={() => setShowUpiPin((prev) => !prev)}
                title={showUpiPin ? 'Hide PIN' : 'Show PIN'}
              >
                <i className={showUpiPin ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'}></i>
                <span>{showUpiPin ? 'Hide PIN' : 'Show PIN'}</span>
              </button>
            </div>

            {/* Inline Error if present */}
            {upiPinError && (
              <div className="upi-pin-error-alert">
                <i className="fa-solid fa-triangle-exclamation"></i>
                <span>{upiPinError}</span>
              </div>
            )}

            {/* Numeric Keypad for fast clicking / mobile touch */}
            <div className="upi-numeric-keypad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  className="upi-keypad-key"
                  onClick={() => {
                    if (upiPin.length < 4 && !isVerifyingUpiPin) {
                      setUpiPin((prev) => prev + String(num));
                      if (upiPinError) setUpiPinError('');
                    }
                  }}
                  disabled={isVerifyingUpiPin}
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                className="upi-keypad-key keypad-action-clear"
                onClick={() => setUpiPin('')}
                disabled={isVerifyingUpiPin || upiPin.length === 0}
                title="Clear PIN"
              >
                CLEAR
              </button>
              <button
                type="button"
                className="upi-keypad-key"
                onClick={() => {
                  if (upiPin.length < 4 && !isVerifyingUpiPin) {
                    setUpiPin((prev) => prev + '0');
                    if (upiPinError) setUpiPinError('');
                  }
                }}
                disabled={isVerifyingUpiPin}
              >
                0
              </button>
              <button
                type="button"
                className="upi-keypad-key keypad-action-back"
                onClick={() => {
                  if (!isVerifyingUpiPin) {
                    setUpiPin((prev) => prev.slice(0, -1));
                    if (upiPinError) setUpiPinError('');
                  }
                }}
                disabled={isVerifyingUpiPin || upiPin.length === 0}
                title="Backspace"
              >
                <i className="fa-solid fa-delete-left"></i>
              </button>
            </div>

            {/* Demo Hint */}
            <div className="demo-upi-pin-hint">
              <i className="fa-solid fa-circle-info"></i>
              <span>Demo Mode: Enter any 4-digit PIN (e.g. <strong>{DEMO_UPI_PIN}</strong>)</span>
            </div>

            {/* Security Warning */}
            <div className="upi-security-footer">
              <i className="fa-solid fa-shield-halved"></i>
              <span>
                UPI PIN will not be recorded or shared. Authorized by National Payments Corporation of India.
              </span>
            </div>

            {/* Actions */}
            <div className="payment-step-actions">
              <button
                type="button"
                className="payment-btn-cancel"
                onClick={() => setCurrentStep('details_entry')}
                disabled={isVerifyingUpiPin || isSubmitting}
              >
                Back
              </button>
              <button
                type="button"
                className="payment-btn-secondary"
                onClick={handleRequestClose}
                disabled={isVerifyingUpiPin || isSubmitting}
                style={{ padding: '12px 18px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="payment-btn-proceed btn-submit-upi-pin"
                onClick={handleVerifyUpiPin}
                disabled={upiPin.length !== 4 || isVerifyingUpiPin || isSubmitting}
              >
                {isVerifyingUpiPin ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin"></i>
                    <span>Verifying with Bank...</span>
                  </>
                ) : (
                  <>
                    <span>Submit UPI PIN &amp; Pay</span>
                    <i className="fa-solid fa-circle-check"></i>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Payment Processing State */}
        {currentStep === 'processing' && (
          <div className="payment-modal-body processing-body">
            <div className="processing-spinner-ring"></div>
            <h4 className="processing-title">Processing your payment...</h4>
            <p className="processing-desc">
              Please do not close or refresh this window while we securely verify and authorize your transaction with the bank.
            </p>
            <div className="processing-steps-list">
              <div className="p-step active">
                <i className="fa-solid fa-check"></i>{' '}
                {['upi', 'gpay', 'phonepe', 'paytm'].includes(selectedMethod) ? 'UPI PIN Verified' : '2FA OTP Verified'}
              </div>
              <div className="p-step active">
                <i className="fa-solid fa-spinner fa-spin"></i> Contacting Payment Gateway
              </div>
              <div className="p-step">
                <i className="fa-regular fa-clock"></i> Allocating Resources &amp; Limits
              </div>
            </div>
          </div>
        )}

        {/* STEP 6: Payment Success Screen */}
        {currentStep === 'success' && latestTransaction && (
          <div className="payment-modal-body success-body">
            <div className="success-icon-badge">
              <i className="fa-solid fa-circle-check"></i>
            </div>
            <h4 className="success-heading">
              {type === 'subscription'
                ? `🎉 Congratulations! Upgraded to ${plan?.name || 'Pro Plan'}!`
                : (customTitle && customTitle.toLowerCase().includes('top up')
                  ? '🎉 Congratulations! Time Added to Plan Successfully!'
                  : '🎉 Congratulations! You Bought Your Credits!')}
            </h4>
            <p className="success-subheading">
              {type === 'subscription'
                ? `Now you are upgraded for ${plan?.name || 'Pro Plan'}! Your premium features and elevated quotas are active in real time.`
                : (customTitle && customTitle.toLowerCase().includes('top up')
                  ? 'Successfully you added time to your current plan! Your updated quotas are now active in real time.'
                  : `Congratulations, you have purchased ${topUpPricing.creditsToReceive.toLocaleString()} credits! Your wallet balance has been updated.`)}
            </p>

            <div className="success-receipt-card">
              <div className="receipt-row">
                <span>Transaction ID</span>
                <code>{latestTransaction.id}</code>
              </div>
              <div className="receipt-row">
                <span>Item</span>
                <strong>{latestTransaction.planOrPackage}</strong>
              </div>
              <div className="receipt-row">
                <span>Amount Paid</span>
                <strong className="receipt-highlight">
                  {latestTransaction.currencySymbol}{latestTransaction.amount.toLocaleString()} {latestTransaction.currency}
                </strong>
              </div>
              {latestTransaction.creditsUsed > 0 && (
                <div className="receipt-row">
                  <span>Credits Redeemed</span>
                  <span className="credits-deducted-badge">
                    {latestTransaction.creditsUsed.toLocaleString()} Credits
                  </span>
                </div>
              )}
              {latestTransaction.creditsAdded > 0 && (
                <div className="receipt-row">
                  <span>Credits Added</span>
                  <span className="credits-added-badge">
                    +{latestTransaction.creditsAdded.toLocaleString()} Credits
                  </span>
                </div>
              )}
              <div className="receipt-row">
                <span>Payment Method</span>
                <span>{latestTransaction.paymentMethod}</span>
              </div>
              <div className="receipt-row">
                <span>Date &amp; Time</span>
                <span>{latestTransaction.dateTime}</span>
              </div>
            </div>

            <div className="payment-step-actions success-actions">
              {(onGoToUsage || onViewHistory) && (
                <button
                  type="button"
                  className="payment-btn-secondary"
                  onClick={() => {
                    onClose();
                    if (onGoToUsage) onGoToUsage();
                    else if (onViewHistory) onViewHistory();
                  }}
                >
                  <i className="fa-solid fa-clock-rotate-left"></i>
                  <span>View Usage &amp; History</span>
                </button>
              )}
              {onGoToDashboard && (
                <button
                  type="button"
                  className="payment-btn-secondary"
                  onClick={() => {
                    onClose();
                    onGoToDashboard();
                  }}
                >
                  <i className="fa-solid fa-gauge"></i>
                  <span>Go to Dashboard</span>
                </button>
              )}
              <button
                type="button"
                className="payment-btn-proceed"
                onClick={onClose}
              >
                <i className="fa-solid fa-check"></i>
                <span>OK</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 7: Payment Failure Screen */}
        {currentStep === 'failure' && (
          <div className="payment-modal-body failure-body">
            <div className="failure-icon-badge">
              <i className="fa-solid fa-circle-xmark"></i>
            </div>
            <h4 className="failure-heading">Payment Failed</h4>
            <p className="failure-subheading">
              {failureReason ? `We couldn't complete your payment. Please check your payment details and try again. (${failureReason})` : "We couldn't complete your payment. Please check your payment details and try again."}
            </p>

            <div className="failure-details-card">
              <div className="failure-row">
                <span>Reference ID</span>
                <code>{latestTransaction?.referenceId || 'REF-ERR-5021'}</code>
              </div>
              <div className="failure-row">
                <span>Attempted Amount</span>
                <span>
                  {curr.symbol}
                  {(type === 'subscription' ? planPaymentBreakdown.amountToPayConverted : topUpPricing.convertedTotal).toLocaleString()} {curr.code}
                </span>
              </div>
              <div className="failure-row">
                <span>Payment Method</span>
                <span>{PAYMENT_METHODS.find((m) => m.id === selectedMethod)?.name}</span>
              </div>
              <div className="failure-row">
                <span>Reason</span>
                <span className="failure-reason-text">{failureReason}</span>
              </div>
            </div>

            <div className="payment-step-actions failure-actions">
              <button
                type="button"
                className="payment-btn-proceed btn-retry-payment"
                onClick={() => {
                  setSimulateFailure(false);
                  setIsSubmitting(false);
                  isSubmittingRef.current = false;
                  if (failureReason && failureReason.toLowerCase().includes('otp')) {
                    setOtpCode('');
                    setOtpError('');
                    setOtpTimer(45);
                    setCurrentStep('otp_verify');
                  } else {
                    handleStartProcessing(false);
                  }
                }}
              >
                <i className="fa-solid fa-rotate-right"></i>
                <span>Retry Payment</span>
              </button>
              <button
                type="button"
                className="payment-btn-secondary"
                onClick={() => {
                  setSimulateFailure(false);
                  setIsSubmitting(false);
                  isSubmittingRef.current = false;
                  setCurrentStep('details_entry');
                }}
              >
                <i className="fa-solid fa-pen-to-square"></i>
                <span>Edit Details</span>
              </button>
              <button
                type="button"
                className="payment-btn-secondary"
                onClick={() => {
                  setSimulateFailure(false);
                  setIsSubmitting(false);
                  isSubmittingRef.current = false;
                  setCurrentStep('method_selection');
                }}
              >
                <i className="fa-solid fa-credit-card"></i>
                <span>Change Method</span>
              </button>
              <button
                type="button"
                className="payment-btn-secondary"
                onClick={() => {
                  if (type === 'subscription') setCurrentStep('plan_options');
                  else onClose();
                }}
              >
                <span>Back to Plans</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 8: Payment Cancelled Screen */}
        {currentStep === 'cancelled' && (
          <div className="payment-modal-body cancelled-body">
            <div className="cancelled-icon-badge">
              <i className="fa-solid fa-ban"></i>
            </div>
            <h4 className="cancelled-heading">Payment Cancelled</h4>
            <p className="cancelled-subheading">
              You cancelled the payment request before completing the transaction. No charges or credit deductions were made to your account.
            </p>

            <div className="cancelled-details-card">
              <div className="cancelled-row">
                <span>Attempted Item</span>
                <strong>
                  {type === 'subscription'
                    ? plan?.name || 'Pro Plan'
                    : `${topUpPricing.creditsToReceive.toLocaleString()} Credits Pack`}
                </strong>
              </div>
              <div className="cancelled-row">
                <span>Amount</span>
                <span>
                  {curr.symbol}
                  {(type === 'subscription'
                    ? planPaymentBreakdown.amountToPayConverted
                    : topUpPricing.convertedTotal
                  ).toLocaleString()} {curr.code}
                </span>
              </div>
              <div className="cancelled-row">
                <span>Status</span>
                <span className="cancelled-status-badge">Cancelled &bull; Not Charged</span>
              </div>
            </div>

            <div className="payment-step-actions cancelled-actions">
              <button
                type="button"
                className="payment-btn-proceed btn-resume-payment"
                onClick={() => {
                  setIsSubmitting(false);
                  isSubmittingRef.current = false;
                  setCurrentStep('details_entry');
                }}
              >
                <i className="fa-solid fa-arrow-rotate-left"></i>
                <span>Resume / Retry Payment</span>
              </button>
              <button
                type="button"
                className="payment-btn-secondary"
                onClick={() => {
                  setIsSubmitting(false);
                  isSubmittingRef.current = false;
                  setCurrentStep('method_selection');
                }}
              >
                <i className="fa-solid fa-credit-card"></i>
                <span>Choose Another Method</span>
              </button>
              <button
                type="button"
                className="payment-btn-secondary"
                onClick={onClose}
              >
                <span>Close</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
