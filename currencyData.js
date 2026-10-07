// Comprehensive world currencies with mock exchange rates to USD (1 USD base)
export const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$', country: 'United States', rate: 1.0, flag: '🇺🇸' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', country: 'India', rate: 83.50, flag: '🇮🇳' },
  { code: 'EUR', name: 'Euro', symbol: '€', country: 'European Union', rate: 0.92, flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound', symbol: '£', country: 'United Kingdom', rate: 0.79, flag: '🇬🇧' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', country: 'Canada', rate: 1.36, flag: '🇨🇦' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', country: 'Australia', rate: 1.52, flag: '🇦🇺' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', country: 'Japan', rate: 155.00, flag: '🇯🇵' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', country: 'China', rate: 7.24, flag: '🇨🇳' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', country: 'South Korea', rate: 1370.00, flag: '🇰🇷' },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: 'Rs', country: 'Pakistan', rate: 279.50, flag: '🇵🇰' },
  { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴', country: 'Ukraine', rate: 39.80, flag: '🇺🇦' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED', country: 'United Arab Emirates', rate: 3.67, flag: '🇦🇪' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR', country: 'Saudi Arabia', rate: 3.75, flag: '🇸🇦' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', country: 'Singapore', rate: 1.35, flag: '🇸🇬' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', country: 'Malaysia', rate: 4.72, flag: '🇲🇾' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', country: 'Thailand', rate: 36.80, flag: '🇹🇭' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', country: 'Indonesia', rate: 16250.00, flag: '🇮🇩' },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳', country: 'Bangladesh', rate: 117.50, flag: '🇧🇩' },
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs', country: 'Sri Lanka', rate: 302.00, flag: '🇱🇰' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', country: 'Turkey', rate: 32.20, flag: '🇹🇷' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', country: 'Switzerland', rate: 0.91, flag: '🇨🇭' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', country: 'New Zealand', rate: 1.66, flag: '🇳🇿' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', country: 'South Africa', rate: 18.50, flag: '🇿🇦' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', country: 'Brazil', rate: 5.15, flag: '🇧🇷' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'Mex$', country: 'Mexico', rate: 16.90, flag: '🇲🇽' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', country: 'Philippines', rate: 58.20, flag: '🇵🇭' },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', country: 'Vietnam', rate: 25400.00, flag: '🇻🇳' },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'E£', country: 'Egypt', rate: 47.80, flag: '🇪🇬' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', country: 'Nigeria', rate: 1480.00, flag: '🇳🇬' }
];

export let CREDITS_PER_USD = 250; // 1 USD = 250 Credits (Default base)

export function getCreditsPerUSD() {
  return CREDITS_PER_USD;
}

export function setCreditsPerUSD(val) {
  const num = Number(val);
  if (!isNaN(num) && num > 0) {
    CREDITS_PER_USD = num;
  }
}

export function getCurrency(code) {
  return CURRENCIES.find((c) => c.code.toUpperCase() === String(code || 'USD').toUpperCase()) || CURRENCIES[0];
}

export function updateExchangeRate(code, rate) {
  const target = CURRENCIES.find((c) => c.code.toUpperCase() === String(code || '').toUpperCase());
  const num = Number(rate);
  if (target && !isNaN(num) && num > 0) {
    target.rate = num;
  }
}

export function setDynamicExchangeRates(ratesMap) {
  if (!ratesMap || typeof ratesMap !== 'object') return;
  Object.entries(ratesMap).forEach(([code, rate]) => {
    updateExchangeRate(code, rate);
  });
}

// Convert from base USD to target currency: USD amount * exchange rate = Target currency amount
export function convertFromUSD(amountUSD, targetCode) {
  const curr = getCurrency(targetCode);
  const val = Number(amountUSD) || 0;
  if (curr.code === 'USD') return val;
  return Math.round(val * curr.rate * 100) / 100;
}

// Convert from target currency back to base USD: Target amount / exchange rate = USD amount
export function convertToUSD(amountInTargetCode, targetCode) {
  const curr = getCurrency(targetCode);
  const val = Number(amountInTargetCode) || 0;
  if (curr.code === 'USD') return val;
  if (!curr.rate || curr.rate <= 0) return val;
  return Math.round((val / curr.rate) * 100) / 100;
}

export function formatPriceWithConversion(amountUSD, targetCode) {
  const curr = getCurrency(targetCode);
  const val = Number(amountUSD) || 0;
  if (curr.code === 'USD') {
    return `$${val.toLocaleString()}`;
  }
  const converted = Math.round(val * curr.rate);
  return `${curr.symbol}${converted.toLocaleString()} (${curr.code})`;
}

export function searchCurrencies(query) {
  if (!query || !query.trim()) return CURRENCIES;
  const q = query.trim().toLowerCase();
  return CURRENCIES.filter((c) =>
    c.country.toLowerCase().includes(q) ||
    c.name.toLowerCase().includes(q) ||
    c.code.toLowerCase().includes(q) ||
    c.symbol.toLowerCase().includes(q)
  );
}

// Comprehensive International Calling / Dial Codes with Country & Currency Mapping
export const COUNTRY_DIAL_CODES = [
  { id: 'IN', code: '+91', country: 'India', flag: '🇮🇳', currency: 'INR', digits: 10, placeholder: '98765 43210' },
  { id: 'US', code: '+1', country: 'United States', flag: '🇺🇸', currency: 'USD', digits: 10, placeholder: '202 555 0123' },
  { id: 'CA', code: '+1', country: 'Canada', flag: '🇨🇦', currency: 'CAD', digits: 10, placeholder: '416 555 0123' },
  { id: 'AU', code: '+61', country: 'Australia', flag: '🇦🇺', currency: 'AUD', digits: 9, placeholder: '412 345 678' },
  { id: 'GB', code: '+44', country: 'United Kingdom', flag: '🇬🇧', currency: 'GBP', digits: 10, placeholder: '7911 123456' },
  { id: 'AE', code: '+971', country: 'United Arab Emirates', flag: '🇦🇪', currency: 'AED', digits: 9, placeholder: '50 123 4567' },
  { id: 'DE', code: '+49', country: 'Germany', flag: '🇩🇪', currency: 'EUR', digits: 10, placeholder: '151 23456789' },
  { id: 'FR', code: '+33', country: 'France', flag: '🇫🇷', currency: 'EUR', digits: 9, placeholder: '6 12 34 56 78' },
  { id: 'SG', code: '+65', country: 'Singapore', flag: '🇸🇬', currency: 'SGD', digits: 8, placeholder: '8123 4567' },
  { id: 'JP', code: '+81', country: 'Japan', flag: '🇯🇵', currency: 'JPY', digits: 10, placeholder: '90 1234 5678' },
  { id: 'SA', code: '+966', country: 'Saudi Arabia', flag: '🇸🇦', currency: 'SAR', digits: 9, placeholder: '50 123 4567' },
  { id: 'NZ', code: '+64', country: 'New Zealand', flag: '🇳🇿', currency: 'NZD', digits: 9, placeholder: '21 123 4567' },
  { id: 'CH', code: '+41', country: 'Switzerland', flag: '🇨🇭', currency: 'CHF', digits: 9, placeholder: '78 123 45 67' },
  { id: 'BR', code: '+55', country: 'Brazil', flag: '🇧🇷', currency: 'BRL', digits: 11, placeholder: '11 91234-5678' },
  { id: 'MX', code: '+52', country: 'Mexico', flag: '🇲🇽', currency: 'MXN', digits: 10, placeholder: '55 1234 5678' },
  { id: 'ZA', code: '+27', country: 'South Africa', flag: '🇿🇦', currency: 'ZAR', digits: 9, placeholder: '82 123 4567' },
  { id: 'KR', code: '+82', country: 'South Korea', flag: '🇰🇷', currency: 'KRW', digits: 10, placeholder: '10 1234 5678' },
  { id: 'CN', code: '+86', country: 'China', flag: '🇨🇳', currency: 'CNY', digits: 11, placeholder: '138 0000 0000' },
  { id: 'PK', code: '+92', country: 'Pakistan', flag: '🇵🇰', currency: 'PKR', digits: 10, placeholder: '300 1234567' },
  { id: 'BD', code: '+880', country: 'Bangladesh', flag: '🇧🇩', currency: 'BDT', digits: 10, placeholder: '1712 345678' },
  { id: 'LK', code: '+94', country: 'Sri Lanka', flag: '🇱🇰', currency: 'LKR', digits: 9, placeholder: '71 234 5678' },
  { id: 'TR', code: '+90', country: 'Turkey', flag: '🇹🇷', currency: 'TRY', digits: 10, placeholder: '532 123 4567' },
  { id: 'MY', code: '+60', country: 'Malaysia', flag: '🇲🇾', currency: 'MYR', digits: 9, placeholder: '12 345 6789' },
  { id: 'TH', code: '+66', country: 'Thailand', flag: '🇹🇭', currency: 'THB', digits: 9, placeholder: '81 234 5678' },
  { id: 'ID', code: '+62', country: 'Indonesia', flag: '🇮🇩', currency: 'IDR', digits: 10, placeholder: '812 3456 7890' },
  { id: 'PH', code: '+63', country: 'Philippines', flag: '🇵🇭', currency: 'PHP', digits: 10, placeholder: '917 123 4567' },
  { id: 'VN', code: '+84', country: 'Vietnam', flag: '🇻🇳', currency: 'VND', digits: 9, placeholder: '91 234 5678' },
  { id: 'EG', code: '+20', country: 'Egypt', flag: '🇪🇬', currency: 'EGP', digits: 10, placeholder: '100 123 4567' },
  { id: 'NG', code: '+234', country: 'Nigeria', flag: '🇳🇬', currency: 'NGN', digits: 10, placeholder: '802 123 4567' },
  { id: 'UA', code: '+380', country: 'Ukraine', flag: '🇺🇦', currency: 'UAH', digits: 9, placeholder: '50 123 4567' }
];

export function getCountryByCurrency(currencyCode) {
  if (!currencyCode) return COUNTRY_DIAL_CODES[0];
  const found = COUNTRY_DIAL_CODES.find((c) => c.currency.toUpperCase() === String(currencyCode).toUpperCase());
  return found || COUNTRY_DIAL_CODES[0];
}

export function getCountryById(countryId) {
  return COUNTRY_DIAL_CODES.find((c) => c.id === countryId) || COUNTRY_DIAL_CODES[0];
}
