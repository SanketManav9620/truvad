import fs from 'node:fs';
import path from 'node:path';
import config from './config.js';

const OUTBOX_DIR = path.join(process.cwd(), 'outbox');

/**
 * Escapes special characters to prevent HTML injection vulnerabilities.
 * @param {string} str 
 * @returns {string}
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Ensures the /outbox directory exists.
 */
function ensureOutboxDir() {
  if (!fs.existsSync(OUTBOX_DIR)) {
    fs.mkdirSync(OUTBOX_DIR, { recursive: true });
    const gitkeep = path.join(OUTBOX_DIR, '.gitkeep');
    if (!fs.existsSync(gitkeep)) {
      fs.writeFileSync(gitkeep, '');
    }
  }
}

/**
 * Send Mail function.
 * Uses Resend API when RESEND_API_KEY is configured.
 * Otherwise, falls back to Mock Mode, writing HTML files to /outbox and printing a console box.
 */
export async function sendMail({ to, subject, html, text }) {
  const from = config.MAIL_FROM || 'GRIP Alerts <alerts@example.com>';
  const targetRecipient = Array.isArray(to) ? to.join(', ') : to;

  // 1. Resend API Mode
  if (config.RESEND_API_KEY && config.RESEND_API_KEY.trim()) {
    try {
      console.log(`[mailer] Dispatching via Resend API to: ${targetRecipient}`);
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.RESEND_API_KEY.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: Array.isArray(to) ? to : [to],
          subject,
          html: html || `<p>${text || ''}</p>`,
          text: text || '',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        console.log(`[mailer] Delivered via Resend API (ID: ${data.id})`);
        return {
          success: true,
          mode: 'resend',
          id: data.id,
        };
      } else {
        console.warn(`[mailer] Resend API error (${response.status}):`, data);
        return {
          success: false,
          mode: 'resend',
          error: data.message || 'Resend API error',
        };
      }
    } catch (err) {
      console.error('[mailer] Failed to connect to Resend API:', err.message);
      return {
        success: false,
        mode: 'resend',
        error: err.message,
      };
    }
  }

  // 2. Mock Outbox Mode
  ensureOutboxDir();

  const id = `mail_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const filename = `${id}.html`;
  const filePath = path.join(OUTBOX_DIR, filename);

  const fullHtmlContent = html || `<!DOCTYPE html><html><body><pre>${escapeHtml(text)}</pre></body></html>`;
  fs.writeFileSync(filePath, fullHtmlContent, 'utf8');

  // Also write metadata json so outbox inspector displays subject, to, text, and html
  const jsonMetadataPath = path.join(OUTBOX_DIR, `${id}.json`);
  const metadata = {
    id,
    timestamp: new Date().toISOString(),
    from,
    to: targetRecipient,
    subject,
    text: text || '',
    html: fullHtmlContent,
    htmlFile: filename,
    deliveredVia: 'mock-outbox',
  };
  fs.writeFileSync(jsonMetadataPath, JSON.stringify(metadata, null, 2), 'utf8');

  // Extract 4-digit OTP code if present in subject or text for console log
  const otpMatch = (subject + ' ' + (text || '')).match(/\b\d{4}\b/);
  const detectedOtp = otpMatch ? otpMatch[0] : null;

  // Print clear ASCII console box
  const boxWidth = 72;
  const line = '─'.repeat(boxWidth);
  console.log(`
┌${line}┐
│ 📬 [MOCK MAILER OUTBOX - GRIP BY TRUVAD]                               │
├${line}┤
│ Recipient: ${targetRecipient.padEnd(boxWidth - 13)}│
│ Subject:   ${subject.slice(0, boxWidth - 13).padEnd(boxWidth - 13)}│
${detectedOtp ? `│ OTP Code:  ${detectedOtp.padEnd(boxWidth - 13)}│\n` : ''}│ Saved File: outbox/${filename.padEnd(boxWidth - 19)}│
└${line}┘
  `);

  return {
    success: true,
    mode: 'outbox',
    id,
    filename,
  };
}

export const sendEmail = sendMail;

// ============================================================================
// ENTERPRISE EMAIL TEMPLATE BUILDERS (With HTML Sanitization)
// ============================================================================

/**
 * 1. OTP Email Template Builder
 */
export function otpEmail(otp) {
  const safeOtp = escapeHtml(String(otp));
  const subject = `[GRIP by Truvad] Your Verification Code: ${safeOtp}`;
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #f8fafc;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #0f766e 100%); padding: 28px; border-bottom: 2px solid #14b8a6;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">GRIP <span style="color: #2dd4bf; font-weight: 400; font-size: 15px;">by Truvad</span></h1>
              <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Enterprise Regulatory Intelligence</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 32px;">
              <h2 style="margin-top: 0; color: #ffffff; font-size: 18px; font-weight: 700;">Security Authentication Code</h2>
              <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
                Use the cryptographically generated 4-digit verification code below to authenticate your identity on GRIP.
              </p>
              
              <div style="background-color: #0f172a; border: 1px solid #14b8a6; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
                <span style="font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 800; letter-spacing: 12px; color: #2dd4bf;">${safeOtp}</span>
              </div>

              <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin-bottom: 0;">
                🔒 Valid for <strong>5 minutes</strong>. Do not share this code with anyone.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #0f172a; padding: 18px 32px; text-align: center; border-top: 1px solid #334155;">
              <p style="margin: 0; color: #64748b; font-size: 12px;">&copy; 2026 GRIP by Truvad. Automated Alert Engine.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
  const text = `GRIP by Truvad Verification Code: ${otp}. Valid for 5 minutes.`;
  return { subject, html, text };
}

/**
 * 2. Welcome Email Template Builder
 */
export function welcomeEmail(preferences = {}, updates = []) {
  const subject = `[GRIP by Truvad] Welcome & Regulatory Alert Briefing`;

  const cardsHtml = updates.map(item => {
    const reg = escapeHtml(item.regulator || item.badge || 'REGULATORY');
    const sev = escapeHtml(item.severity || 'HIGH');
    const title = escapeHtml(item.title || '');
    const summary = escapeHtml(item.summary || '');
    const date = escapeHtml(item.effectiveDate || item.date || '');
    
    const regColor = reg === 'RBI' ? '#14b8a6' : reg === 'SEBI' ? '#c084fc' : '#38bdf8';
    const sevColor = sev === 'Critical' || sev === 'CRITICAL' ? '#f87171' : '#fbbf24';

    return `
      <div style="background-color: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 18px; margin-bottom: 14px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 10px;">
          <tr>
            <td>
              <span style="background-color: rgba(20, 184, 166, 0.15); color: ${regColor}; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 4px; border: 1px solid ${regColor}; text-transform: uppercase;">${reg}</span>
              <span style="background-color: rgba(248, 113, 113, 0.15); color: ${sevColor}; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 4px; border: 1px solid ${sevColor}; text-transform: uppercase; margin-left: 6px;">${sev}</span>
            </td>
            <td align="right" style="color: #64748b; font-size: 12px;">
              ${date}
            </td>
          </tr>
        </table>
        <h4 style="margin: 0 0 6px 0; color: #ffffff; font-size: 15px; font-weight: 700;">${title}</h4>
        <p style="margin: 0; color: #94a3b8; font-size: 13px; line-height: 1.5;">${summary}</p>
      </div>
    `;
  }).join('');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #f8fafc;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #0f766e 100%); padding: 28px; border-bottom: 2px solid #14b8a6;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">GRIP <span style="color: #2dd4bf; font-weight: 400; font-size: 15px;">by Truvad</span></h1>
              <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Regulatory Intelligence Platform</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin-top: 0; color: #ffffff; font-size: 18px; font-weight: 700;">Welcome to GRIP Regulatory Alerts</h2>
              <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
                Your email verification is confirmed. Here are the active regulatory directives matching your preferences:
              </p>

              <h3 style="color: #2dd4bf; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin: 24px 0 14px 0;">Matched Regulatory Directives</h3>
              
              ${cardsHtml}

            </td>
          </tr>
          <tr>
            <td style="background-color: #0f172a; padding: 18px 32px; text-align: center; border-top: 1px solid #334155;">
              <p style="margin: 0; color: #64748b; font-size: 12px;">&copy; 2026 GRIP by Truvad. Enterprise Regulatory Intelligence.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const text = `Welcome to GRIP by Truvad. Your regulatory alert briefing is ready.`;
  return { subject, html, text };
}

/**
 * 3. Feedback Email Template Builder
 */
export function feedbackEmail({ email, rating = 5, message = '' }) {
  const safeEmail = escapeHtml(email);
  const safeMsg = escapeHtml(message);
  const numRating = Number(rating) || 5;
  const stars = '★'.repeat(Math.min(5, Math.max(1, numRating))) + '☆'.repeat(5 - Math.min(5, Math.max(1, numRating)));
  const subject = `[GRIP Feedback] Rating ${numRating}/5 from ${safeEmail}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0f172a; color: #f8fafc;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #0f766e 100%); padding: 24px; border-bottom: 2px solid #14b8a6;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #ffffff;">GRIP <span style="color: #2dd4bf; font-weight: 400; font-size: 14px;">Feedback Notification</span></h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px;">
              <p style="color: #94a3b8; font-size: 13px; margin-top: 0;">New verified user feedback submitted via GRIP:</p>
              
              <div style="background-color: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 20px; margin: 16px 0;">
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #e2e8f0;"><strong>Sender Email:</strong> ${safeEmail}</p>
                <p style="margin: 0 0 12px 0; font-size: 14px; color: #e2e8f0;"><strong>Rating Score:</strong> <span style="color: #fbbf24; font-size: 16px;">${stars}</span> (${numRating}/5)</p>
                <hr style="border: 0; border-top: 1px solid #334155; margin: 14px 0;" />
                <p style="margin: 0; font-size: 14px; color: #94a3b8; white-space: pre-wrap; line-height: 1.6;">${safeMsg}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #0f172a; padding: 16px 28px; text-align: center; border-top: 1px solid #334155;">
              <p style="margin: 0; color: #64748b; font-size: 12px;">Admin Notification Target: ${config.FEEDBACK_TO}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const text = `New Feedback from ${email} [Rating: ${numRating}/5]: ${message}`;
  return {
    to: config.FEEDBACK_TO,
    subject,
    html,
    text,
  };
}

export async function sendOTPEmail(email, code) {
  const mailContent = otpEmail(code);
  return sendMail({
    to: email,
    subject: mailContent.subject,
    html: mailContent.html,
    text: mailContent.text,
  });
}

export async function sendFeedbackNotification(item) {
  const mailContent = feedbackEmail({
    email: item.email,
    rating: item.rating || 5,
    message: item.message,
  });
  return sendMail({
    to: mailContent.to,
    subject: mailContent.subject,
    html: mailContent.html,
    text: mailContent.text,
  });
}
