import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEmail, validateOTPCode, validateFeedback } from '../src/validators.js';

test('validateEmail() accepts valid emails and normalizes to lowercase', () => {
  const result = validateEmail('  Officer.Test@Bank.COM ');
  assert.equal(result.valid, true);
  assert.equal(result.value, 'officer.test@bank.com');
});

test('validateEmail() rejects invalid email formats', () => {
  const invalid1 = validateEmail('invalid-email-string');
  assert.equal(invalid1.valid, false);

  const invalid2 = validateEmail('user@domain');
  assert.equal(invalid2.valid, false);

  const invalid3 = validateEmail('');
  assert.equal(invalid3.valid, false);
});

test('validateOTPCode() accepts valid 4-digit codes', () => {
  const valid = validateOTPCode('1234');
  assert.equal(valid.valid, true);
  assert.equal(valid.value, '1234');
});

test('validateOTPCode() rejects non-numeric or invalid length codes', () => {
  const invalid1 = validateOTPCode('abc');
  assert.equal(invalid1.valid, false);

  const invalid2 = validateOTPCode('');
  assert.equal(invalid2.valid, false);
});

test('validateFeedback() enforces min message length and valid category', () => {
  const valid = validateFeedback({
    email: 'user@example.com',
    category: 'UX Design',
    message: 'Great platform experience!',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.value.category, 'UX Design');

  const tooShort = validateFeedback({
    email: 'user@example.com',
    message: 'hi',
  });
  assert.equal(tooShort.valid, false);
});
