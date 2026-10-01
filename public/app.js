/**
 * GRIP by Truvad - Frontend Multi-Step Widget Engine & Edge-Case Handler
 */

document.addEventListener('DOMContentLoaded', () => {
  // ------------------------------------------------------------------
  // State Variables
  // ------------------------------------------------------------------
  let currentStep = 1;
  let userEmail = '';
  let userPreferences = { rbi: true, sebi: true, sec: false };
  let otpTimerInterval = null;
  let resendTimerInterval = null;
  let selectedRating = 5;

  // DOM Elements
  const mockModeBanner = document.getElementById('mockModeBanner');
  const statusText = document.getElementById('statusText');

  const stepPanes = {
    1: document.getElementById('step1Pane'),
    2: document.getElementById('step2Pane'),
    3: document.getElementById('step3Pane'),
  };

  // Step 1 Elements
  const step1Form = document.getElementById('step1Form');
  const emailInput = document.getElementById('emailInput');
  const emailError = document.getElementById('emailError');
  const chipRbi = document.getElementById('chipRbi');
  const chipSebi = document.getElementById('chipSebi');
  const chipSec = document.getElementById('chipSec');
  const btnSendOtp = document.getElementById('btnSendOtp');
  const btnSendOtpText = document.getElementById('btnSendOtpText');

  // Step 2 Elements
  const step2Form = document.getElementById('step2Form');
  const otpBoxes = [
    document.getElementById('otpBox0'),
    document.getElementById('otpBox1'),
    document.getElementById('otpBox2'),
    document.getElementById('otpBox3'),
  ];
  const otpBoxesContainer = document.getElementById('otpBoxesContainer');
  const otpError = document.getElementById('otpError');
  const timerCountdown = document.getElementById('timerCountdown');
  const btnResendOtp = document.getElementById('btnResendOtp');
  const btnBackToStep1 = document.getElementById('btnBackToStep1');
  const btnVerifyOtp = document.getElementById('btnVerifyOtp');
  const otpSentNotice = document.getElementById('otpSentNotice');

  // Step 3 Elements
  const matchedUpdatesGrid = document.getElementById('matchedUpdatesGrid');
  const feedbackCard = document.getElementById('feedbackCard');
  const feedbackForm = document.getElementById('feedbackForm');
  const starBtns = document.querySelectorAll('.star-btn');
  const feedbackMsg = document.getElementById('feedbackMsg');
  const btnMaybeLater = document.getElementById('btnMaybeLater');
  const toastContainer = document.getElementById('toastContainer');

  // ------------------------------------------------------------------
  // 1. Health Check & Mock Mode Banner Initialization
  // ------------------------------------------------------------------
  async function checkServerHealth() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();

      if (data.status === 'ok') {
        if (data.mailerMode === 'outbox-mock') {
          if (mockModeBanner) mockModeBanner.style.display = 'flex';
          if (statusText) statusText.textContent = 'Mock Outbox Mode';
        } else {
          if (mockModeBanner) mockModeBanner.style.display = 'none';
          if (statusText) statusText.textContent = 'Resend API Active';
        }
      }
    } catch (err) {
      if (statusText) statusText.textContent = 'Offline';
    }
  }

  // ------------------------------------------------------------------
  // Helper: Toast Notifications System
  // ------------------------------------------------------------------
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <span>${type === 'success' ? '✅' : '⚠️'}</span>
      <span>${message}</span>
    `;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ------------------------------------------------------------------
  // Step Navigation Helper
  // ------------------------------------------------------------------
  function switchStep(stepNumber) {
    currentStep = stepNumber;
    Object.keys(stepPanes).forEach(stepKey => {
      const pane = stepPanes[stepKey];
      if (Number(stepKey) === stepNumber) {
        pane.classList.add('active');
      } else {
        pane.classList.remove('active');
      }
    });

    if (stepNumber === 2) {
      setTimeout(() => otpBoxes[0].focus(), 100);
    } else if (stepNumber === 3) {
      const step3Heading = document.getElementById('step3Heading');
      if (step3Heading) step3Heading.focus();
    }
  }

  // ------------------------------------------------------------------
  // Step 1: Live Email Validation & Submit
  // ------------------------------------------------------------------
  function validateEmailFormat(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email.trim());
  }

  emailInput.addEventListener('input', () => {
    const val = emailInput.value.trim();
    if (!val) {
      emailInput.classList.remove('invalid');
      emailError.textContent = '';
    } else if (!validateEmailFormat(val)) {
      emailInput.classList.add('invalid');
      emailError.textContent = 'Please enter a valid work email address.';
    } else {
      emailInput.classList.remove('invalid');
      emailError.textContent = '';
    }
  });

  step1Form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();

    if (!validateEmailFormat(email)) {
      emailInput.classList.add('invalid');
      emailError.textContent = 'A valid work email address is required.';
      emailInput.focus();
      return;
    }

    userEmail = email.toLowerCase();
    userPreferences = {
      rbi: chipRbi.checked,
      sebi: chipSebi.checked,
      sec: chipSec.checked,
    };

    // Double-submit prevention: disable button
    btnSendOtp.disabled = true;
    btnSendOtpText.textContent = 'Processing...';

    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, preferences: userPreferences }),
      });

      const data = await res.json();

      // Case A: Email is ALREADY VERIFIED -> Skip OTP step & go straight to Step 3!
      if (data.success && data.alreadyVerified) {
        showToast(data.message || 'Welcome back! Preferences updated.', 'success');
        loadMatchedUpdates(userPreferences);
        switchStep(3);
        return;
      }

      // Case B: OTP dispatched -> proceed to Step 2
      if (data.success) {
        showToast(data.message || 'OTP code sent successfully.', 'success');
        
        let noticeText = `Enter the 4-digit verification code sent to ${userEmail}.`;
        if (data.mockOtpCode) {
          noticeText += ` (Dev Mock Code: ${data.mockOtpCode})`;
        }
        otpSentNotice.textContent = noticeText;

        startOtpTimers(data.ttlSeconds || 300);
        switchStep(2);
      } else {
        showToast(data.error || 'Failed to send OTP code.', 'error');
        emailError.textContent = data.error || 'Failed to send OTP code.';
      }
    } catch (err) {
      showToast('Network error. Failed to reach server.', 'error');
      emailError.textContent = 'Network failure. Please check your internet connection.';
    } finally {
      // Re-enable button
      btnSendOtp.disabled = false;
      btnSendOtpText.textContent = 'Send Verification OTP';
    }
  });

  // ------------------------------------------------------------------
  // Step 2: 4-Box OTP Input (Auto-Advance, Backspace, Paste)
  // ------------------------------------------------------------------
  otpBoxes.forEach((box, index) => {
    box.addEventListener('input', () => {
      const val = box.value.replace(/\D/g, '');
      box.value = val;

      if (val && index < 3) {
        otpBoxes[index + 1].focus();
      }
      otpError.textContent = '';
    });

    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        if (!box.value && index > 0) {
          otpBoxes[index - 1].focus();
        }
      }
    });
  });

  // Handle Paste Support across OTP boxes
  otpBoxesContainer.addEventListener('paste', (e) => {
    e.preventDefault();
    const pastedText = (e.clipboardData || window.clipboardData).getData('text');
    const digits = pastedText.replace(/\D/g, '').slice(0, 4);

    digits.split('').forEach((digit, i) => {
      if (otpBoxes[i]) {
        otpBoxes[i].value = digit;
      }
    });

    if (digits.length > 0) {
      const lastIndex = Math.min(digits.length - 1, 3);
      otpBoxes[lastIndex].focus();
    }
    otpError.textContent = '';
  });

  // ------------------------------------------------------------------
  // Step 2: Timers & Resend Handling
  // ------------------------------------------------------------------
  function startOtpTimers(ttlSeconds = 300) {
    clearInterval(otpTimerInterval);
    clearInterval(resendTimerInterval);

    let secondsLeft = ttlSeconds;
    updateTimerDisplay(secondsLeft);

    otpTimerInterval = setInterval(() => {
      secondsLeft -= 1;
      updateTimerDisplay(secondsLeft);

      if (secondsLeft <= 0) {
        clearInterval(otpTimerInterval);
        otpError.textContent = 'OTP code has expired. Please request a new code.';
        btnVerifyOtp.disabled = true;
      }
    }, 1000);

    // 30-Second Resend Cooldown
    let resendCooldown = 30;
    btnResendOtp.disabled = true;
    btnResendOtp.textContent = `Resend OTP (${resendCooldown}s)`;

    resendTimerInterval = setInterval(() => {
      resendCooldown -= 1;
      if (resendCooldown <= 0) {
        clearInterval(resendTimerInterval);
        btnResendOtp.disabled = false;
        btnResendOtp.textContent = 'Resend OTP';
      } else {
        btnResendOtp.textContent = `Resend OTP (${resendCooldown}s)`;
      }
    }, 1000);
  }

  function updateTimerDisplay(totalSeconds) {
    const mins = Math.floor(Math.max(0, totalSeconds) / 60);
    const secs = Math.max(0, totalSeconds) % 60;
    timerCountdown.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // Resend OTP Click with double-submit prevention
  btnResendOtp.addEventListener('click', async () => {
    btnResendOtp.disabled = true;
    otpError.textContent = '';

    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, preferences: userPreferences }),
      });

      const data = await res.json();
      if (data.success) {
        showToast('A new OTP code has been dispatched.', 'success');
        startOtpTimers(data.ttlSeconds || 300);
        btnVerifyOtp.disabled = false;
        otpBoxes.forEach(b => b.value = '');
        otpBoxes[0].focus();

        if (data.mockOtpCode) {
          otpSentNotice.textContent = `Enter 4-digit code sent to ${userEmail}. (Dev Mock Code: ${data.mockOtpCode})`;
        }
      } else {
        showToast(data.error || 'Failed to resend OTP.', 'error');
        otpError.textContent = data.error || 'Failed to resend OTP.';
      }
    } catch (err) {
      showToast('Network error during resend.', 'error');
      otpError.textContent = 'Network failure. Please try again.';
    }
  });

  btnBackToStep1.addEventListener('click', () => {
    clearInterval(otpTimerInterval);
    clearInterval(resendTimerInterval);
    switchStep(1);
  });

  // Step 2 Form Submit (Verify OTP) with double-submit prevention & error handling
  step2Form.addEventListener('submit', async (e) => {
    e.preventDefault();
    otpError.textContent = '';

    const code = otpBoxes.map(b => b.value.trim()).join('');
    if (code.length !== 4) {
      otpError.textContent = 'Please enter all 4 digits of your OTP code.';
      return;
    }

    // Double-submit prevention
    btnVerifyOtp.disabled = true;
    btnVerifyOtp.textContent = 'Verifying...';

    try {
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          otp: code,
          preferences: userPreferences,
        }),
      });

      const data = await res.json();

      if (data.success && data.verified) {
        clearInterval(otpTimerInterval);
        clearInterval(resendTimerInterval);
        showToast('Identity verified successfully!', 'success');

        loadMatchedUpdates(userPreferences);
        switchStep(3);
      } else {
        // Specific error handling for wrong / expired / too_many_attempts
        const errorMsg = data.error || 'Invalid verification code.';
        otpError.textContent = errorMsg;
        showToast(errorMsg, 'error');

        // If too many attempts or expired, clear inputs for new attempt
        if (errorMsg.includes('invalidated') || errorMsg.includes('expired')) {
          otpBoxes.forEach(b => b.value = '');
          otpBoxes[0].focus();
        }
      }
    } catch (err) {
      showToast('Network failure. Connection lost.', 'error');
      otpError.textContent = 'Network failure. Please check your internet connection.';
    } finally {
      btnVerifyOtp.disabled = false;
      btnVerifyOtp.textContent = 'Verify & Activate';
    }
  });

  // ------------------------------------------------------------------
  // Step 3: Render Matched Updates & Interactive Feedback Form
  // ------------------------------------------------------------------
  async function loadMatchedUpdates(preferences) {
    try {
      const activeRegs = Object.keys(preferences).filter(k => preferences[k]);
      const paramStr = activeRegs.length > 0 ? `?regulators=${activeRegs.join(',')}` : '';
      
      const res = await fetch(`/api/updates${paramStr}`);
      const data = await res.json();

      if (data.success && Array.isArray(data.updates)) {
        renderMatchedUpdates(data.updates);
      }
    } catch (err) {
      console.error('Failed to load matched updates:', err);
    }
  }

  function renderMatchedUpdates(updates) {
    if (!updates || updates.length === 0) {
      matchedUpdatesGrid.innerHTML = `<p style="color: var(--color-text-muted);">No regulatory directives active for selected filters.</p>`;
      return;
    }

    matchedUpdatesGrid.innerHTML = updates.map(item => `
      <div class="update-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 11px; font-weight: 800; color: var(--color-teal-bright); text-transform: uppercase;">${item.regulator}</span>
          <span style="font-size: 11px; color: var(--color-red); font-weight: 700;">${item.severity}</span>
        </div>
        <h4 style="font-size: 14px; font-weight: 700; margin-bottom: 6px; color: var(--color-text-main);">${item.title}</h4>
        <p style="font-size: 12px; color: var(--color-text-muted); line-height: 1.5;">${item.summary}</p>
      </div>
    `).join('');
  }

  // Star Rating Selection
  starBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedRating = Number(btn.getAttribute('data-rating')) || 5;
      starBtns.forEach(b => {
        const ratingVal = Number(b.getAttribute('data-rating'));
        if (ratingVal <= selectedRating) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
    });
  });

  // Submit Feedback Form with double-submit prevention & verified lead check
  feedbackForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = feedbackMsg.value.trim();

    if (!msg || msg.length < 5) {
      showToast('Feedback message must be at least 5 characters.', 'error');
      return;
    }

    const btnSubmit = document.getElementById('btnSubmitFeedback');
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Submitting...';

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          rating: selectedRating,
          message: msg,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showToast('Thank you for your feedback!', 'success');
        feedbackCard.innerHTML = `
          <div style="text-align: center; padding: 16px; color: var(--color-teal-bright); font-weight: 700;">
            ✅ Feedback submitted successfully to the GRIP Team. Thank you!
          </div>
        `;
      } else {
        const errorText = data.error || 'Failed to submit feedback.';
        showToast(errorText, 'error');
      }
    } catch (err) {
      showToast('Network error during feedback submission.', 'error');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Submit Feedback';
    }
  });

  btnMaybeLater.addEventListener('click', () => {
    feedbackCard.style.display = 'none';
  });

  // Initialize Server Health & Mock Mode Banner
  checkServerHealth();
});
