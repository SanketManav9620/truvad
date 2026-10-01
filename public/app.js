/**
 * GRIP by Truvad - Clean White Theme Interactive Engine
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM References
  const mockModeBanner = document.getElementById('mockModeBanner');
  const regionTabs = document.querySelectorAll('.region-tab');
  const searchInput = document.getElementById('searchInput');
  const btnSelectAll = document.getElementById('btnSelectAll');
  const btnClearAll = document.getElementById('btnClearAll');
  const selectedCountText = document.getElementById('selectedCountText');
  const regulatorCards = document.querySelectorAll('.regulator-card');
  const cadenceBtns = document.querySelectorAll('.cadence-btn');
  
  const subscribeForm = document.getElementById('subscribeForm');
  const emailInput = document.getElementById('emailInput');
  const emailError = document.getElementById('emailError');
  const btnActivate = document.getElementById('btnActivate');

  const otpModal = document.getElementById('otpModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const otpForm = document.getElementById('otpForm');
  const otpModalNotice = document.getElementById('otpModalNotice');
  const otpError = document.getElementById('otpError');
  const timerCountdown = document.getElementById('timerCountdown');
  const btnResendOtp = document.getElementById('btnResendOtp');
  const btnVerify = document.getElementById('btnVerify');

  const otpBoxes = [
    document.getElementById('otpBox0'),
    document.getElementById('otpBox1'),
    document.getElementById('otpBox2'),
    document.getElementById('otpBox3'),
  ];

  const matchedSection = document.getElementById('matchedSection');
  const matchedGrid = document.getElementById('matchedGrid');
  const feedbackCard = document.getElementById('feedbackCard');
  const starBtns = document.querySelectorAll('.star-btn');
  const feedbackMsg = document.getElementById('feedbackMsg');
  const btnSubmitFeedback = document.getElementById('btnSubmitFeedback');
  const btnMaybeLater = document.getElementById('btnMaybeLater');
  const toastContainer = document.getElementById('toastContainer');

  // State
  let userEmail = '';
  let selectedRating = 5;
  let otpTimerInterval = null;
  let resendTimerInterval = null;

  // ------------------------------------------------------------------
  // 1. Health Check
  // ------------------------------------------------------------------
  async function checkHealth() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      if (data.status === 'ok' && data.mailerMode === 'outbox-mock') {
        if (mockModeBanner) mockModeBanner.style.display = 'flex';
      }
    } catch (err) {}
  }

  // ------------------------------------------------------------------
  // 2. Toast Notifications
  // ------------------------------------------------------------------
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✅' : '⚠️'}</span>
      <span>${message}</span>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ------------------------------------------------------------------
  // 3. Regulator Card Selection & Counter
  // ------------------------------------------------------------------
  function updateSelectedCount() {
    const selected = document.querySelectorAll('.regulator-card.selected');
    selectedCountText.textContent = `${selected.length} regulators selected`;
  }

  regulatorCards.forEach(card => {
    card.addEventListener('click', () => {
      card.classList.toggle('selected');
      updateSelectedCount();
    });
  });

  // ------------------------------------------------------------------
  // 4. Region Tabs Filtering
  // ------------------------------------------------------------------
  regionTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      regionTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const region = tab.getAttribute('data-region');
      filterRegulators();
    });
  });

  function filterRegulators() {
    const activeTab = document.querySelector('.region-tab.active');
    const regionFilter = activeTab ? activeTab.getAttribute('data-region') : 'all';
    const query = searchInput.value.toLowerCase().trim();

    regulatorCards.forEach(card => {
      const cardRegion = card.getAttribute('data-region');
      const cardCode = card.getAttribute('data-code').toLowerCase();
      const cardContent = card.textContent.toLowerCase();

      let matchesRegion = regionFilter === 'all' || cardRegion === regionFilter;
      let matchesSearch = !query || cardContent.includes(query) || cardCode.includes(query);

      if (matchesRegion && matchesSearch) {
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
  }

  searchInput.addEventListener('input', filterRegulators);

  // Quick Select All / Clear
  btnSelectAll.addEventListener('click', () => {
    regulatorCards.forEach(card => {
      if (card.style.display !== 'none') {
        card.classList.add('selected');
      }
    });
    updateSelectedCount();
  });

  btnClearAll.addEventListener('click', () => {
    regulatorCards.forEach(card => card.classList.remove('selected'));
    updateSelectedCount();
  });

  // Cadence selection
  cadenceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      cadenceBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // ------------------------------------------------------------------
  // 5. Subscription & OTP Verification Modal
  // ------------------------------------------------------------------
  function getSelectedPreferences() {
    const selected = document.querySelectorAll('.regulator-card.selected');
    const prefs = {};
    selected.forEach(c => {
      const code = c.getAttribute('data-code');
      prefs[code] = true;
    });
    return prefs;
  }

  subscribeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailError.textContent = 'Please enter a valid work email address.';
      return;
    }
    emailError.textContent = '';
    userEmail = email.toLowerCase();

    btnActivate.disabled = true;
    btnActivate.textContent = 'Processing...';

    try {
      const prefs = getSelectedPreferences();
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, preferences: prefs }),
      });

      const data = await res.json();

      if (data.success && data.alreadyVerified) {
        showToast('Welcome back! Preferences updated.', 'success');
        loadMatchedUpdates(prefs);
        matchedSection.classList.add('active');
        matchedSection.scrollIntoView({ behavior: 'smooth' });
        return;
      }

      if (data.success) {
        showToast('OTP verification code dispatched.', 'success');
        
        let notice = `Enter 4-digit verification code sent to ${userEmail}.`;
        if (data.mockOtpCode) {
          notice += ` (Mock Code: ${data.mockOtpCode})`;
        }
        otpModalNotice.textContent = notice;

        startOtpTimers(data.ttlSeconds || 300);
        otpModal.classList.add('active');
        setTimeout(() => otpBoxes[0].focus(), 100);
      } else {
        emailError.textContent = data.error || 'Failed to send verification code.';
      }
    } catch (err) {
      emailError.textContent = 'Network failure. Please check your connection.';
    } finally {
      btnActivate.disabled = false;
      btnActivate.textContent = 'Activate Personalized Alerts ↗';
    }
  });

  // Modal Close
  btnCloseModal.addEventListener('click', () => {
    otpModal.classList.remove('active');
    clearInterval(otpTimerInterval);
    clearInterval(resendTimerInterval);
  });

  // ------------------------------------------------------------------
  // 6. 4-Box OTP Input Mechanics
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
      if (e.key === 'Backspace' && !box.value && index > 0) {
        otpBoxes[index - 1].focus();
      }
    });
  });

  // Paste Support
  document.getElementById('otpBoxesContainer').addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text');
    const digits = pasted.replace(/\D/g, '').slice(0, 4);

    digits.split('').forEach((d, i) => {
      if (otpBoxes[i]) otpBoxes[i].value = d;
    });

    if (digits.length > 0) {
      const lastIdx = Math.min(digits.length - 1, 3);
      otpBoxes[lastIdx].focus();
    }
  });

  function startOtpTimers(ttlSeconds = 300) {
    clearInterval(otpTimerInterval);
    clearInterval(resendTimerInterval);

    let left = ttlSeconds;
    updateTimerDisplay(left);

    otpTimerInterval = setInterval(() => {
      left -= 1;
      updateTimerDisplay(left);
      if (left <= 0) {
        clearInterval(otpTimerInterval);
        otpError.textContent = 'Code expired. Request a new one.';
        btnVerify.disabled = true;
      }
    }, 1000);

    let resendLeft = 30;
    btnResendOtp.disabled = true;
    btnResendOtp.textContent = `Resend OTP (${resendLeft}s)`;

    resendTimerInterval = setInterval(() => {
      resendLeft -= 1;
      if (resendLeft <= 0) {
        clearInterval(resendTimerInterval);
        btnResendOtp.disabled = false;
        btnResendOtp.textContent = 'Resend OTP';
      } else {
        btnResendOtp.textContent = `Resend OTP (${resendLeft}s)`;
      }
    }, 1000);
  }

  function updateTimerDisplay(sec) {
    const mins = Math.floor(Math.max(0, sec) / 60);
    const secs = Math.max(0, sec) % 60;
    timerCountdown.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  btnResendOtp.addEventListener('click', async () => {
    btnResendOtp.disabled = true;
    otpError.textContent = '';
    try {
      const prefs = getSelectedPreferences();
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, preferences: prefs }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('New OTP dispatched.', 'success');
        startOtpTimers(data.ttlSeconds || 300);
        btnVerify.disabled = false;
        otpBoxes.forEach(b => b.value = '');
        otpBoxes[0].focus();
      } else {
        otpError.textContent = data.error || 'Failed to resend.';
      }
    } catch (err) {
      otpError.textContent = 'Network error during resend.';
    }
  });

  // Verify OTP
  otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = otpBoxes.map(b => b.value.trim()).join('');
    if (code.length !== 4) {
      otpError.textContent = 'Please enter all 4 digits.';
      return;
    }

    btnVerify.disabled = true;
    btnVerify.textContent = 'Verifying...';

    try {
      const prefs = getSelectedPreferences();
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, otp: code, preferences: prefs }),
      });

      const data = await res.json();

      if (data.success && data.verified) {
        otpModal.classList.remove('active');
        showToast('Alerts activated successfully!', 'success');
        
        loadMatchedUpdates(prefs);
        matchedSection.classList.add('active');
        matchedSection.scrollIntoView({ behavior: 'smooth' });
      } else {
        otpError.textContent = data.error || 'Invalid verification code.';
      }
    } catch (err) {
      otpError.textContent = 'Network failure. Please try again.';
    } finally {
      btnVerify.disabled = false;
      btnVerify.textContent = 'Verify & Activate Alerts';
    }
  });

  // ------------------------------------------------------------------
  // 7. Render Matched Directives & Feedback
  // ------------------------------------------------------------------
  async function loadMatchedUpdates(preferences) {
    try {
      const activeRegs = Object.keys(preferences).filter(k => preferences[k]);
      const paramStr = activeRegs.length > 0 ? `?regulators=${activeRegs.join(',')}` : '';

      const res = await fetch(`/api/updates${paramStr}`);
      const data = await res.json();

      if (data.success && Array.isArray(data.updates)) {
        renderMatchedGrid(data.updates);
      }
    } catch (err) {}
  }

  function renderMatchedGrid(updates) {
    if (!updates || updates.length === 0) {
      matchedGrid.innerHTML = `<p style="color: var(--text-muted);">No circulars found for selected regulators.</p>`;
      return;
    }

    matchedGrid.innerHTML = updates.map(u => `
      <div class="matched-card">
        <div class="matched-card-header">
          <span class="matched-reg-badge">${u.regulator}</span>
          <span class="matched-sev-badge">${u.severity}</span>
        </div>
        <h4 style="font-size:15px; font-weight:700; margin-bottom:4px;">${u.title}</h4>
        <p style="font-size:13px; color:var(--text-secondary); line-height:1.5;">${u.summary}</p>
      </div>
    `).join('');
  }

  // Star Rating
  starBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedRating = Number(btn.getAttribute('data-rating')) || 5;
      starBtns.forEach(b => {
        const val = Number(b.getAttribute('data-rating'));
        if (val <= selectedRating) b.classList.add('active');
        else b.classList.remove('active');
      });
    });
  });

  btnSubmitFeedback.addEventListener('click', async () => {
    const msg = feedbackMsg.value.trim();
    if (!msg || msg.length < 5) {
      showToast('Please enter at least 5 characters.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, rating: selectedRating, message: msg }),
      });
      const data = await res.json();

      if (data.success) {
        showToast('Feedback submitted. Thank you!', 'success');
        feedbackCard.innerHTML = `<div style="text-align:center; padding:12px; color:#16a34a; font-weight:700;">✅ Feedback submitted successfully!</div>`;
      } else {
        showToast(data.error || 'Failed to submit feedback.', 'error');
      }
    } catch (err) {
      showToast('Network error.', 'error');
    }
  });

  btnMaybeLater.addEventListener('click', () => {
    feedbackCard.style.display = 'none';
  });

  // Boot
  checkHealth();
  updateSelectedCount();
});
