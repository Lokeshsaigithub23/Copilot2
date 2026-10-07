// Client-side authentication validators for email and strong password

export const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', 'temp-mail.org', '10minutemail.com',
  'guerrillamail.com', 'throwawaymail.com', 'yopmail.com', 'sharklasers.com',
  'dispostable.com', 'getairmail.com', 'trashmail.com', 'fakemailgenerator.com',
  'fakeinbox.com', 'sample.com', 'fakemail.net', 'tempmail.net', 'burnermail.io',
  'crazymailing.com', 'mytemp.email', 'tempmailaddress.com'
]);

export const DUMMY_USERNAMES = new Set([
  'abcd', 'abcde', 'abcdef', 'abc', 'qwerty', 'asdf', 'zxcv', 'qwer',
  '1234', '12345', '123456', '0000', '1111', 'xyz', 'test', 'tester',
  'testing', 'temp', 'fake', 'dummy', 'sample', 'example', 'demo',
  'nobody', 'noemail', 'null', 'undefined', 'admin', 'guest', 'user', 'trash'
]);

/**
 * Validates an email address and checks for fake/dummy patterns like abcd@gmail.com
 */
export function validateEmailAddress(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email address is required.' };
  }
  const cleanEmail = email.trim().toLowerCase();

  // RFC 5322 compatible regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(cleanEmail)) {
    return { valid: false, error: 'Please enter a valid email format (e.g. name@example.com).' };
  }

  const [localPart, domain] = cleanEmail.split('@');
  if (!localPart || !domain) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }

  // Domain extension check
  const domainParts = domain.split('.');
  const tld = domainParts[domainParts.length - 1];
  if (!tld || tld.length < 2 || !/^[a-z]+$/.test(tld)) {
    return { valid: false, error: 'Please enter an email with a valid domain extension (e.g. .com, .org).' };
  }

  // Local part minimum length
  if (localPart.length < 3) {
    return { valid: false, error: 'Email prefix must be at least 3 characters long.' };
  }

  // Block disposable / burner email domains
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, error: 'Disposable or temporary email addresses are not permitted.' };
  }

  // Block obvious dummy / sequential usernames (e.g. abcd@gmail.com, test@...)
  if (DUMMY_USERNAMES.has(localPart)) {
    return { valid: false, error: `Placeholder or test emails like "${cleanEmail}" are not allowed. Please enter your real email.` };
  }

  // Check for repeated single character (e.g. aaaa@..., 1111@...)
  const alphanumericChars = localPart.replace(/[^a-z0-9]/g, '');
  const uniqueChars = new Set(alphanumericChars);
  if (uniqueChars.size <= 1 && alphanumericChars.length >= 3) {
    return { valid: false, error: 'Please enter a genuine personal or work email address.' };
  }

  return { valid: true, cleanEmail };
}

/**
 * Checks password strength against standard enterprise criteria:
 * - At least 8 characters
 * - Uppercase letter (A-Z)
 * - Lowercase letter (a-z)
 * - Number (0-9)
 * - Special symbol (!@#$%^&*...)
 */
export function checkPasswordStrength(password) {
  const p = password || '';
  const checks = {
    length: p.length >= 8,
    hasUpper: /[A-Z]/.test(p),
    hasLower: /[a-z]/.test(p),
    hasNumber: /[0-9]/.test(p),
    hasSpecial: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(p)
  };

  const count = Object.values(checks).filter(Boolean).length;
  const isStrong = checks.length && checks.hasUpper && checks.hasLower && checks.hasNumber && checks.hasSpecial;

  let label = 'Weak';
  let level = 'weak';

  if (count === 5) {
    label = 'Strong';
    level = 'strong';
  } else if (count >= 3 && checks.length) {
    label = 'Fair';
    level = 'fair';
  } else if (count >= 2) {
    label = 'Weak';
    level = 'weak';
  } else {
    label = p.length === 0 ? '' : 'Very Weak';
    level = 'very-weak';
  }

  return { checks, count, isStrong, label, level };
}
