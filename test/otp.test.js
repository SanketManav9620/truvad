import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOtp, requestOtp, verifyOtp } from '../src/otp.js';

test('generateOtp() creates a 4-digit numeric string', () => {
  const code = generateOtp();
  assert.equal(typeof code, 'string');
  assert.equal(code.length, 4);
  assert.match(code, /^\d{4}$/);
});

test('requestOtp() returns code and verifyOtp() verifies successfully', () => {
  const email = 'user1@example.com';
  const req = requestOtp(email);
  
  assert.equal(req.ok, true);
  assert.equal(typeof req.code, 'string');
  assert.equal(req.code.length, 4);

  const verification = verifyOtp(email, req.code);
  assert.equal(verification.ok, true);
});

test('verifyOtp() rejects invalid code and returns reason: invalid', () => {
  const email = 'user2@example.com';
  const req = requestOtp(email);
  
  // Create wrong code
  const wrongCode = req.code === '1111' ? '2222' : '1111';
  const verification = verifyOtp(email, wrongCode);
  
  assert.equal(verification.ok, false);
  assert.equal(verification.reason, 'invalid');
});

test('verifyOtp() invalidates OTP after 5 wrong attempts (reason: too_many_attempts)', () => {
  const email = 'user3@example.com';
  const req = requestOtp(email);
  const wrongCode = req.code === '0000' ? '9999' : '0000';

  // 4 wrong attempts
  for (let i = 0; i < 4; i++) {
    const res = verifyOtp(email, wrongCode);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'invalid');
  }

  // 5th wrong attempt triggers too_many_attempts
  const fifthAttempt = verifyOtp(email, wrongCode);
  assert.equal(fifthAttempt.ok, false);
  assert.equal(fifthAttempt.reason, 'too_many_attempts');

  // Next attempt should return not_found as entry was deleted
  const postAttempt = verifyOtp(email, req.code);
  assert.equal(postAttempt.ok, false);
  assert.equal(postAttempt.reason, 'not_found');
});

test('requestOtp() enforces 30-second resend cooldown', () => {
  const email = 'user4@example.com';
  
  const req1 = requestOtp(email);
  assert.equal(req1.ok, true);

  // Immediate second request should hit cooldown
  const req2 = requestOtp(email);
  assert.equal(req2.ok, false);
  assert.equal(req2.reason, 'cooldown');
});

test('verifyOtp() returns reason: not_found for unrequested emails', () => {
  const res = verifyOtp('nonexistent@example.com', '1234');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not_found');
});
