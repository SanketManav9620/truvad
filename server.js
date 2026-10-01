import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import config from './src/config.js';
import { 
  getLeads, 
  getLead, 
  upsertLead, 
  saveFeedback, 
  getOutboxMails 
} from './src/storage.js';
import { getUpdates, getFilteredUpdates } from './src/updates.js';
import { requestOtp, verifyOtp } from './src/otp.js';
import { 
  sendMail, 
  sendOTPEmail, 
  welcomeEmail, 
  feedbackEmail,
  escapeHtml 
} from './src/mailer.js';
import { 
  validateEmail, 
  validateOTPCode, 
  validateFeedback 
} from './src/validators.js';

// Resolve directory path in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');

/**
 * 10KB Body size limit for incoming HTTP JSON requests
 */
const MAX_BODY_SIZE = 10 * 1024; // 10KB limit

/**
 * Per-IP Rate Limiting (In-Memory)
 */
const ipRateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 60;

function checkRateLimit(ip) {
  const now = Date.now();
  let record = ipRateLimitMap.get(ip);
  if (!record || now - record.startTime > RATE_LIMIT_WINDOW_MS) {
    record = { startTime: now, count: 1 };
    ipRateLimitMap.set(ip, record);
    return true;
  }

  record.count += 1;
  if (record.count > RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  return true;
}

// Periodically clean up stale rate-limit IP records
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRateLimitMap.entries()) {
    if (now - record.startTime > RATE_LIMIT_WINDOW_MS) {
      ipRateLimitMap.delete(ip);
    }
  }
}, 60000).unref();

/**
 * Supported MIME types for static file serving
 */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * Parse incoming HTTP request JSON body with 10KB limit
 */
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    // If Vercel/Framework pre-parsed body object exists
    if (req.body && typeof req.body === 'object') {
      return resolve(req.body);
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > MAX_BODY_SIZE) {
        req.destroy();
        const err = new Error('Payload size exceeds maximum allowed limit (10KB)');
        err.statusCode = 413;
        reject(err);
      }
    });

    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        const parsed = JSON.parse(body);
        resolve(parsed);
      } catch (err) {
        const parseErr = new Error('Invalid JSON payload format');
        parseErr.statusCode = 400;
        reject(parseErr);
      }
    });

    req.on('error', err => reject(err));
  });
}

/**
 * Helper: Send JSON Response
 */
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

/**
 * Helper: Send Error Response
 */
function sendError(res, statusCode, message) {
  sendJSON(res, statusCode, { success: false, error: message });
}

/**
 * Static file handler with path traversal prevention
 */
function serveStaticFile(req, res, pathname) {
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, safePath);

  // Security check: ensure target path resides inside PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendError(res, 403, 'Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      return sendError(res, 404, 'Resource Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'public, max-age=3600',
    });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  });
}

/**
 * Core HTTP Request Handler (compatible with standalone server & Vercel Serverless)
 */
export async function handleRequest(req, res) {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;
  const method = req.method.toUpperCase();

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || '127.0.0.1';

  if (!checkRateLimit(clientIp)) {
    return sendError(res, 429, 'Too many requests. Rate limit exceeded.');
  }

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  try {
    // API Router
    if (pathname.startsWith('/api/')) {

      // GET /api/health
      if (pathname === '/api/health' && method === 'GET') {
        return sendJSON(res, 200, {
          status: 'ok',
          name: 'grip-alert-widget',
          version: '1.0.0',
          mailerMode: config.RESEND_API_KEY ? 'resend' : 'outbox-mock',
          feedbackTo: config.FEEDBACK_TO,
          timestamp: new Date().toISOString(),
        });
      }

      // GET /api/updates
      if (pathname === '/api/updates' && method === 'GET') {
        const regulatorsParam = reqUrl.searchParams.get('regulators');
        let selectedRegulators = [];
        if (regulatorsParam) {
          selectedRegulators = regulatorsParam.split(',').map(s => s.trim());
        }
        const updates = getFilteredUpdates(selectedRegulators);
        return sendJSON(res, 200, { success: true, updates });
      }

      // GET /api/outbox
      if (pathname === '/api/outbox' && method === 'GET') {
        const mails = getOutboxMails();
        return sendJSON(res, 200, { success: true, mails });
      }

      // POST /api/otp/send
      if ((pathname === '/api/otp/send' || pathname === '/api/otp/request') && method === 'POST') {
        const body = await parseJsonBody(req);
        const emailVal = validateEmail(body.email);
        if (!emailVal.valid) {
          return sendError(res, 400, emailVal.message);
        }

        const existingLead = getLead(emailVal.value);
        if (existingLead && existingLead.verified) {
          const preferences = body.preferences || { rbi: true, sebi: true, sec: false };
          const updatedLead = upsertLead({
            email: emailVal.value,
            preferences,
            verified: true,
            verifiedAt: existingLead.verifiedAt || new Date().toISOString(),
          });

          return sendJSON(res, 200, {
            success: true,
            alreadyVerified: true,
            message: 'Welcome back! Your email is already verified. Preferences updated.',
            lead: updatedLead,
          });
        }

        const otpResult = requestOtp(emailVal.value);
        if (!otpResult.ok) {
          const status = otpResult.reason === 'hourly_limit' || otpResult.reason === 'cooldown' ? 429 : 400;
          return sendError(res, status, otpResult.message || 'Failed to generate OTP code.');
        }

        const mailResult = await sendOTPEmail(emailVal.value, otpResult.code);

        return sendJSON(res, 200, {
          success: true,
          message: `OTP sent successfully to ${emailVal.value}.`,
          ttlSeconds: otpResult.ttlSeconds,
          mode: mailResult.mode,
          ...(mailResult.mode === 'outbox' ? { mockOtpCode: otpResult.code } : {}),
        });
      }

      // POST /api/otp/verify
      if (pathname === '/api/otp/verify' && method === 'POST') {
        const body = await parseJsonBody(req);
        const emailVal = validateEmail(body.email);
        if (!emailVal.valid) {
          return sendError(res, 400, emailVal.message);
        }

        const codeInput = body.otp || body.code;
        const otpVal = validateOTPCode(codeInput);
        if (!otpVal.valid) {
          return sendError(res, 400, otpVal.message);
        }

        const verification = verifyOtp(emailVal.value, otpVal.value);
        if (!verification.ok) {
          let errorMsg = 'Invalid verification code.';
          if (verification.reason === 'not_found') errorMsg = 'No active verification code found for this email address.';
          if (verification.reason === 'expired') errorMsg = 'Verification code has expired. Please request a new code.';
          if (verification.reason === 'too_many_attempts') errorMsg = 'Too many invalid attempts. Code invalidated.';
          return sendError(res, 400, errorMsg);
        }

        const preferences = body.preferences || { rbi: true, sebi: true, sec: false };
        const lead = upsertLead({
          email: emailVal.value,
          preferences,
          verified: true,
          verifiedAt: new Date().toISOString(),
        });

        const matchedUpdates = getFilteredUpdates(preferences);
        const welcomeContent = welcomeEmail(preferences, matchedUpdates);
        
        await sendMail({
          to: lead.email,
          subject: welcomeContent.subject,
          html: welcomeContent.html,
          text: welcomeContent.text,
        });

        return sendJSON(res, 200, {
          success: true,
          verified: true,
          message: 'OTP verified and lead registered successfully.',
          lead,
        });
      }

      // POST /api/feedback
      if (pathname === '/api/feedback' && method === 'POST') {
        const body = await parseJsonBody(req);
        
        const emailVal = validateEmail(body.email);
        if (!emailVal.valid) {
          return sendError(res, 400, emailVal.message);
        }

        const lead = getLead(emailVal.value);
        if (!lead || !lead.verified) {
          return sendError(res, 403, 'Only verified leads can submit feedback. Please verify your email first.');
        }

        const fbVal = validateFeedback(body);
        if (!fbVal.valid) {
          return sendError(res, 400, fbVal.message);
        }

        const rating = Number(body.rating) || 5;
        const savedFeedback = saveFeedback({
          email: lead.email,
          rating,
          category: fbVal.value.category,
          message: fbVal.value.message,
        });

        const mailContent = feedbackEmail({
          email: lead.email,
          rating,
          message: fbVal.value.message,
        });

        sendMail({
          to: mailContent.to,
          subject: mailContent.subject,
          html: mailContent.html,
          text: mailContent.text,
        }).catch(err => console.error('[server] Error sending feedback email:', err.message));

        return sendJSON(res, 200, {
          success: true,
          message: 'Feedback submitted successfully.',
          feedback: savedFeedback,
        });
      }

      return sendError(res, 404, `API route '${pathname}' not found.`);
    }

    // Static File Serving
    serveStaticFile(req, res, pathname);

  } catch (err) {
    console.error('[server] Request error:', err.message);
    const statusCode = err.statusCode || 500;
    sendError(res, statusCode, err.message || 'Internal Server Error');
  }
}

// Start Server if executed directly
const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

export const server = http.createServer(handleRequest);

if (isDirectExecution) {
  const PORT = config.PORT;
  server.listen(PORT, () => {
    console.log(`
  ======================================================
  🚀 GRIP by Truvad Alert Server Running!
  ------------------------------------------------------
  Local Server:  http://localhost:${PORT}
  Mailer Mode:   ${config.RESEND_API_KEY ? 'Resend API Active' : 'Mock Outbox Mode (saving to /outbox)'}
  Feedback To:   ${config.FEEDBACK_TO}
  Body Limit:    10KB
  Rate Limit:    60 req/min per IP
  ======================================================
    `);
  });
}
