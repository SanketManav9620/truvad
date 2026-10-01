/**
 * Pure helper validation routines for incoming API requests.
 */

export function validateEmail(email) {
  if (typeof email !== 'string') return { valid: false, message: 'Email must be a string.' };
  const trimmed = email.trim();
  if (!trimmed) return { valid: false, message: 'Email address is required.' };
  
  // Standard email format regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, message: 'Invalid email address format.' };
  }
  return { valid: true, value: trimmed.toLowerCase() };
}

export function validateOTPCode(code) {
  if (!code) return { valid: false, message: 'OTP code is required.' };
  const strCode = String(code).trim();
  if (!/^\d{4,6}$/.test(strCode)) {
    return { valid: false, message: 'OTP code must be a 4-digit numeric code.' };
  }
  return { valid: true, value: strCode };
}

export function validateLead(data = {}) {
  const emailVal = validateEmail(data.email);
  if (!emailVal.valid) return emailVal;

  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name || name.length < 2) {
    return { valid: false, message: 'Full name must be at least 2 characters.' };
  }

  const company = typeof data.company === 'string' ? data.company.trim() : '';

  return {
    valid: true,
    value: {
      email: emailVal.value,
      name,
      company: company || 'N/A',
    },
  };
}

export function validateFeedback(data = {}) {
  const emailVal = validateEmail(data.email);
  if (!emailVal.valid) return emailVal;

  const category = typeof data.category === 'string' ? data.category.trim() : 'General';
  const allowedCategories = ['General', 'Bug Report', 'Feature Request', 'UX Design', 'Other'];
  const finalCategory = allowedCategories.includes(category) ? category : 'General';

  const message = typeof data.message === 'string' ? data.message.trim() : '';
  if (!message || message.length < 5) {
    return { valid: false, message: 'Feedback message must be at least 5 characters.' };
  }

  return {
    valid: true,
    value: {
      email: emailVal.value,
      category: finalCategory,
      message,
    },
  };
}
