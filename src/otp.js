import crypto from 'node:crypto';
import config from './config.js';

// In-memory store for OTP records: email -> { hash, salt, expiresAt, attempts, lastSentAt, sendHistory }
const otpStore = new Map();

/**
 * Computes SHA-256 Buffer for salt + code
 */
function hashOtp(code, salt) {
  return crypto.createHash('sha256').update(salt + String(code)).digest();
}

/**
 * Timing-safe Buffer comparison helper
 */
function timingSafeCompare(bufA, bufB) {
  if (!Buffer.isBuffer(bufA) || !Buffer.isBuffer(bufB)) return false;
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generates a cryptographically secure 4-digit OTP string (1000-9999).
 * @returns {string}
 */
export function generateOtp() {
  return crypto.randomInt(1000, 10000).toString();
}

/**
 * Requests an OTP for a given email address.
 * Enforces a 30-second resend cooldown and a max 5 sends per hour limit.
 * 
 * @param {string} email 
 * @returns {object} { ok: boolean, code?: string, expiresAt?: number, ttlSeconds?: number, reason?: string, message?: string }
 */
export function requestOtp(email) {
  if (!email || typeof email !== 'string') {
    return { ok: false, reason: 'invalid_email', message: 'Valid email is required.' };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();
  const entry = otpStore.get(normalizedEmail);

  let sendHistory = entry?.sendHistory || [];
  // Filter send history for requests within the last 60 minutes (3600000 ms)
  sendHistory = sendHistory.filter(ts => now - ts < 3600000);

  // Rate Limit 1: Max 5 sends per email per hour
  if (sendHistory.length >= 5) {
    return {
      ok: false,
      reason: 'hourly_limit',
      message: 'Rate limit exceeded: Maximum 5 verification codes per hour.',
    };
  }

  // Rate Limit 2: 30-second resend cooldown
  if (entry?.lastSentAt && (now - entry.lastSentAt < 30000)) {
    const secondsLeft = Math.ceil((30000 - (now - entry.lastSentAt)) / 1000);
    return {
      ok: false,
      reason: 'cooldown',
      message: `Please wait ${secondsLeft} second(s) before requesting a new code.`,
    };
  }

  const code = generateOtp();
  const salt = crypto.randomBytes(16).toString('hex');
  const hashBuf = hashOtp(code, salt);

  const ttlSeconds = config.OTP_TTL_SECONDS || 300; // 5 minutes default
  const expiresAt = now + ttlSeconds * 1000;

  sendHistory.push(now);

  // Store hashed record (never store plain OTP)
  otpStore.set(normalizedEmail, {
    hash: hashBuf,
    salt,
    expiresAt,
    attempts: 0,
    lastSentAt: now,
    sendHistory,
  });

  return {
    ok: true,
    code,
    expiresAt,
    ttlSeconds,
  };
}

/**
 * Verifies an OTP code for an email address.
 * 
 * @param {string} email 
 * @param {string} code 
 * @returns {object} { ok: boolean, reason?: 'not_found' | 'expired' | 'too_many_attempts' | 'invalid' }
 */
export function verifyOtp(email, code) {
  if (!email || typeof email !== 'string') {
    return { ok: false, reason: 'not_found' };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const entry = otpStore.get(normalizedEmail);

  if (!entry) {
    return { ok: false, reason: 'not_found' };
  }

  const now = Date.now();

  // Check Expiry (5-minute expiry)
  if (now > entry.expiresAt) {
    otpStore.delete(normalizedEmail);
    return { ok: false, reason: 'expired' };
  }

  // Check previous max wrong attempts limit
  if (entry.attempts >= 5) {
    otpStore.delete(normalizedEmail);
    return { ok: false, reason: 'too_many_attempts' };
  }

  const candidateHash = hashOtp(String(code).trim(), entry.salt);
  const isMatch = timingSafeCompare(candidateHash, entry.hash);

  if (isMatch) {
    // Successfully verified, consume OTP immediately
    otpStore.delete(normalizedEmail);
    return { ok: true };
  }

  // Increment wrong attempt counter
  entry.attempts += 1;

  if (entry.attempts >= 5) {
    otpStore.delete(normalizedEmail);
    return { ok: false, reason: 'too_many_attempts' };
  }

  return { ok: false, reason: 'invalid' };
}

/**
 * Legacy aliases for server.js integration
 */
export function createOTP(email) {
  const result = requestOtp(email);
  if (!result.ok) {
    const err = new Error(result.message || result.reason);
    err.reason = result.reason;
    throw err;
  }
  return {
    code: result.code,
    expiresAt: result.expiresAt,
    ttlSeconds: result.ttlSeconds,
  };
}

export function verifyOTP(email, code) {
  const result = verifyOtp(email, code);
  if (result.ok) {
    return { success: true, message: 'OTP verified successfully.' };
  }
  
  let message = 'Invalid verification code.';
  if (result.reason === 'not_found') message = 'No active verification code found for this email.';
  if (result.reason === 'expired') message = 'Verification code has expired. Please request a new one.';
  if (result.reason === 'too_many_attempts') message = 'Too many invalid attempts. Verification code invalidated.';

  return { success: false, message, reason: result.reason };
}

/**
 * Periodic cleanup of expired OTP records
 */
setInterval(() => {
  const now = Date.now();
  for (const [email, entry] of otpStore.entries()) {
    if (now > entry.expiresAt) {
      otpStore.delete(email);
    }
  }
}, 60000).unref();
