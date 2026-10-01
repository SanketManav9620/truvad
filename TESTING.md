# 🧪 GRIP by Truvad - Testing Guide & Manual Checklist

This document details the automated test suite and the manual testing checklist for **GRIP by Truvad** (`grip-alert-widget`).

---

## 🤖 Automated Test Suite (`node --test`)

The project includes unit and integration test suites utilizing Node.js's built-in test runner (`node:test`). No external test dependencies are required.

### Running Automated Tests
```bash
npm test
# or
node --test
```

### Test Coverage (19 Test Cases Passed)
1. **API Integration Suite (`test/api.test.js`)**:
   - `GET /api/health` returns status `200 OK`.
   - `POST /api/feedback` enforces verified lead requirement (`403 Forbidden` for unverified emails).
   - Full Happy Path: `POST /api/otp/send` -> `POST /api/otp/verify` -> `POST /api/feedback` (`200 OK`).
   - `POST /api/otp/send` detects already-verified leads, updates preferences, and bypasses OTP (`alreadyVerified: true`).

2. **OTP Engine Suite (`test/otp.test.js`)**:
   - Cryptographically secure 4-digit code generation (`generateOtp`).
   - SHA-256 salted hashing and `crypto.timingSafeEqual` comparison.
   - Max 5 wrong attempts invalidation (`too_many_attempts`).
   - 30-second resend cooldown (`cooldown`).
   - Non-existent email handling (`not_found`).

3. **Storage Engine Suite (`test/storage.test.js`)**:
   - Atomic JSON file database upserting (`upsertLead`).
   - Email normalization to lowercase.
   - Lead update preserving original `id` and `createdAt`.
   - Feedback persistence (`saveFeedback`).

4. **Input Validators Suite (`test/validators.test.js`)**:
   - Email regex formatting & whitespace trimming.
   - 4-digit numeric OTP validation.
   - Feedback message length and category checks.

---

## 📋 Manual Testing Checklist

| Step | Component | Action / Scenario | Expected Behavior | Pass/Fail |
| :--- | :--- | :--- | :--- | :---: |
| **1** | **Mock Mode Info Banner** | Start server without `RESEND_API_KEY` in `.env` and load `http://localhost:3000`. | Yellow banner displays at top: *"Mock Mode Active: RESEND_API_KEY is not set. Verification OTPs are printed to terminal console & saved in /outbox/"*. | [ ] |
| **2** | **Step 1 Live Email Validation** | Type `invalid-email` into work email input. | Input outline turns red, inline error message appears: *"Please enter a valid work email address."* | [ ] |
| **3** | **Step 1 OTP Request** | Enter `officer@bank.com`, select `RBI` and `SEBI` chips, click **Send Verification OTP**. | Button displays *"Sending OTP..."*, toast notification appears, Dev Mock Code (e.g. `1234`) prints to terminal console box and UI notice, UI transitions to Step 2. | [ ] |
| **4** | **Step 2 4-Box OTP Mechanics** | Focus first OTP box, type `1`, `2`, `3`, `4`. | Auto-advances through boxes 1 -> 2 -> 3 -> 4. | [ ] |
| **5** | **Step 2 Paste Support** | Copy string `5678`, click box 1 and press `Ctrl+V`. | Fills boxes 1..4 automatically and focuses box 4. | [ ] |
| **6** | **Step 2 Backspace Support** | Clear box 4, press `Backspace`. | Focus automatically moves back to box 3. | [ ] |
| **7** | **Step 2 Incorrect OTP** | Enter wrong code `0000` and click **Verify & Activate**. | Toast & inline error announce *"Invalid verification code."* | [ ] |
| **8** | **Step 2 Max Attempts Limit** | Enter 5 consecutive wrong OTP codes. | Inline error announces *"Too many invalid attempts. Code invalidated."* Inputs clear for a fresh request. | [ ] |
| **9** | **Step 2 OTP Expiry & Resend Cooldown** | Observe timer countdown and Resend button. | Timer ticks down from `05:00`. Resend button is disabled for 30s (`Resend OTP (29s)...`), then becomes active. | [ ] |
| **10** | **Step 3 Success Transition** | Enter correct 4-digit OTP. | Green animated checkmark SVG plays, toast announces success, active directives grid renders matched RBI & SEBI updates, feedback card displays. | [ ] |
| **11** | **Step 3 Feedback Submission** | Select 5 stars, enter feedback text, click **Submit Feedback**. | Feedback saves to `data/feedback.json`, notification email writes to `/outbox`, success banner replaces card. | [ ] |
| **12** | **Unverified Lead Feedback Rejection** | Issue direct `POST /api/feedback` request for unverified email `fake@domain.com`. | Server returns `403 Forbidden` (`"Only verified leads can submit feedback."`). | [ ] |
| **13** | **Already-Verified Lead Shortcut** | Return to Step 1, enter `officer@bank.com`, click **Send Verification OTP**. | Server returns `{ alreadyVerified: true }`, UI skips Step 2 completely, displays welcome back toast, and switches straight to Step 3. | [ ] |
| **14** | **10KB Body Ceiling Security** | Send HTTP POST with payload > 10KB. | Server immediately drops connection (`413 Payload Too Large`). | [ ] |
| **15** | **Per-IP Rate Limit Security** | Send > 60 API requests in 60 seconds from same IP. | Server returns `429 Too Many Requests`. | [ ] |

---

## 🛠️ Verification Command Quick Reference

```bash
# Run full automated test suite
npm test

# Start local server
npm start
```
