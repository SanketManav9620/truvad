import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:3000';

test('GET /api/health returns status ok', async () => {
  const res = await fetch(`${BASE_URL}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ok');
  assert.ok(data.timestamp);
});

test('Feedback endpoint enforces lead verification requirement', async () => {
  const unverifiedEmail = `unverified.${Date.now()}@domain.com`;

  // Attempting to post feedback with unverified email should return 403 Forbidden
  const res = await fetch(`${BASE_URL}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: unverifiedEmail,
      rating: 5,
      message: 'Unverified feedback attempt',
    }),
  });

  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.match(data.error, /verified/i);
});

test('Full API Happy Path: OTP Send -> OTP Verify -> Verified Feedback', async () => {
  const testEmail = `api.test.${Date.now()}@institution.com`;

  // Step 1: Send OTP
  const sendRes = await fetch(`${BASE_URL}/api/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail }),
  });

  assert.equal(sendRes.status, 200);
  const sendData = await sendRes.json();
  assert.equal(sendData.success, true);
  assert.ok(sendData.mockOtpCode); // Mock OTP code returned in mock mode

  const code = sendData.mockOtpCode;

  // Step 2: Verify OTP & Register Lead with preferences
  const verifyRes = await fetch(`${BASE_URL}/api/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      otp: code,
      preferences: { rbi: true, sebi: true, sec: false },
    }),
  });

  assert.equal(verifyRes.status, 200);
  const verifyData = await verifyRes.json();
  assert.equal(verifyData.success, true);
  assert.equal(verifyData.verified, true);
  assert.equal(verifyData.lead.email, testEmail.toLowerCase());

  // Step 3: Verified Feedback submission should now succeed with 200 OK
  const fbRes = await fetch(`${BASE_URL}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      rating: 5,
      message: 'Excellent platform and verification flow!',
    }),
  });

  assert.equal(fbRes.status, 200);
  const fbData = await fbRes.json();
  assert.equal(fbData.success, true);
  assert.equal(fbData.feedback.email, testEmail.toLowerCase());
});

test('POST /api/otp/send detects already-verified leads and bypasses OTP', async () => {
  const testEmail = `already.verified.${Date.now()}@bank.com`;

  // 1. Initial Send & Verify
  const s1 = await fetch(`${BASE_URL}/api/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail }),
  }).then(r => r.json());

  await fetch(`${BASE_URL}/api/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, otp: s1.mockOtpCode }),
  });

  // 2. Second Send for same email -> should return alreadyVerified: true
  const s2Res = await fetch(`${BASE_URL}/api/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, preferences: { rbi: true, sec: true } }),
  });

  assert.equal(s2Res.status, 200);
  const s2Data = await s2Res.json();
  assert.equal(s2Data.success, true);
  assert.equal(s2Data.alreadyVerified, true);
  assert.equal(s2Data.lead.preferences.sec, true);
});
