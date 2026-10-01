import fs from 'node:fs';
import path from 'node:path';
import { getUpdates, getFilteredUpdates } from './updates.js';

export { getUpdates, getFilteredUpdates };

/**
 * ============================================================================
 * ARCHITECTURE NOTE: SERVERLESS & DATABASE SWAP GUIDE
 * ============================================================================
 * 1. Persistent Long-Running Servers (Render, Railway, EC2, VPS):
 *    - Fully supports local atomic JSON file writes to /data/ and /outbox/.
 * 
 * 2. Ephemeral Serverless Platforms (Vercel, AWS Lambda):
 *    - Serverless lambdas run on read-only/ephemeral filesystems.
 *    - Local JSON file writes do not persist across lambda invocations or scaling.
 *    - For production serverless deployments, swap storage methods with SQLite/PostgreSQL
 *      or use the built-in in-memory fallback included below.
 * ============================================================================
 */

const DATA_DIR = path.join(process.cwd(), 'data');
const OUTBOX_DIR = path.join(process.cwd(), 'outbox');

const UPDATES_FILE = path.join(DATA_DIR, 'mock-updates.json');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');

// In-Memory Fallback Stores for Read-Only / Serverless Environments
const inMemoryLeads = [];
const inMemoryFeedback = [];
const inMemoryOutbox = [];

/**
 * Initializes required directories and JSON data stores on first run.
 */
export function initStorage() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(OUTBOX_DIR)) {
      fs.mkdirSync(OUTBOX_DIR, { recursive: true });
      const gitkeep = path.join(OUTBOX_DIR, '.gitkeep');
      if (!fs.existsSync(gitkeep)) {
        fs.writeFileSync(gitkeep, '');
      }
    }

    if (!fs.existsSync(LEADS_FILE)) {
      atomicWriteJson(LEADS_FILE, []);
    }

    if (!fs.existsSync(FEEDBACK_FILE)) {
      atomicWriteJson(FEEDBACK_FILE, []);
    }
  } catch (err) {
    console.warn('[storage] Notice: Filesystem initialization skipped (read-only mode). Using in-memory store.');
  }
}

/**
 * Helper for reading JSON files cleanly with fallback to in-memory
 */
function readJson(filePath, fallbackMemory = []) {
  try {
    if (!fs.existsSync(filePath)) return fallbackMemory;
    const content = fs.readFileSync(filePath, 'utf8');
    const diskData = JSON.parse(content);
    // Combine disk data with in-memory additions
    const combined = [...diskData];
    for (const item of fallbackMemory) {
      if (!combined.some(d => d.id === item.id || (d.email && d.email === item.email))) {
        combined.unshift(item);
      }
    }
    return combined;
  } catch (err) {
    return fallbackMemory;
  }
}

/**
 * Atomic write helper using temp file write + renameSync.
 * Falls back to in-memory cache if filesystem is read-only.
 */
function atomicWriteJson(filePath, data) {
  const tmpPath = `${filePath}.${Date.now()}_${Math.random().toString(36).substring(2, 7)}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch (err) {
    console.warn(`[storage] Notice: Disk write unavailable (${err.message}). Storing in-memory.`);
    return false;
  }
}

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

// ------------------------------------------------------------------
// LEAD OPERATIONS
// ------------------------------------------------------------------

export function getLeads() {
  return readJson(LEADS_FILE, inMemoryLeads);
}

export function getLead(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const leads = getLeads();
  return leads.find(l => l.email === normalized) || null;
}

export function upsertLead({ email, preferences, verified = false, verifiedAt = null, name = '', company = '' }) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new Error('Valid email address is required for lead upsert.');
  }

  const leads = getLeads();
  const existingIndex = leads.findIndex(l => l.email === normalized);

  const defaultPreferences = { rbi: true, sebi: true, sec: false };
  const mergedPreferences = {
    ...defaultPreferences,
    ...(preferences || {}),
  };

  let leadRecord;

  if (existingIndex >= 0) {
    const existing = leads[existingIndex];
    const isVerifiedNow = verified !== undefined ? Boolean(verified) : existing.verified;

    leadRecord = {
      ...existing,
      email: normalized,
      name: name || existing.name || '',
      company: company || existing.company || '',
      verified: isVerifiedNow,
      verifiedAt: verifiedAt || (isVerifiedNow ? (existing.verifiedAt || new Date().toISOString()) : existing.verifiedAt),
      preferences: {
        ...existing.preferences,
        ...mergedPreferences,
      },
      updatedAt: new Date().toISOString(),
    };
    leads[existingIndex] = leadRecord;
  } else {
    const isVerified = Boolean(verified);
    leadRecord = {
      id: 'lead_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      email: normalized,
      name: name || '',
      company: company || '',
      verified: isVerified,
      preferences: mergedPreferences,
      createdAt: new Date().toISOString(),
      verifiedAt: isVerified ? (verifiedAt || new Date().toISOString()) : null,
    };
    leads.unshift(leadRecord);
  }

  // Update in-memory fallback list
  const memIdx = inMemoryLeads.findIndex(l => l.email === normalized);
  if (memIdx >= 0) inMemoryLeads[memIdx] = leadRecord;
  else inMemoryLeads.unshift(leadRecord);

  atomicWriteJson(LEADS_FILE, leads);
  return leadRecord;
}

export function saveLead(leadData) {
  return upsertLead({
    email: leadData.email,
    name: leadData.name,
    company: leadData.company,
    preferences: leadData.preferences,
    verified: true,
    verifiedAt: new Date().toISOString(),
  });
}

// ------------------------------------------------------------------
// FEEDBACK OPERATIONS
// ------------------------------------------------------------------

export function getFeedback() {
  return readJson(FEEDBACK_FILE, inMemoryFeedback);
}

export function saveFeedback({ email, rating = 5, category = 'General', message = '', createdAt }) {
  const normalized = normalizeEmail(email) || 'anonymous@user.com';
  const feedbackList = getFeedback();

  const newFeedback = {
    id: 'fb_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    email: normalized,
    rating: Number(rating) || 5,
    category,
    message,
    createdAt: createdAt || new Date().toISOString(),
  };

  feedbackList.unshift(newFeedback);
  inMemoryFeedback.unshift(newFeedback);

  atomicWriteJson(FEEDBACK_FILE, feedbackList);
  return newFeedback;
}

// ------------------------------------------------------------------
// OUTBOX OPERATIONS
// ------------------------------------------------------------------

export function saveOutboxMail(mailData) {
  const filename = `mail_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.json`;
  const filePath = path.join(OUTBOX_DIR, filename);
  const fileContent = {
    id: filename.replace('.json', ''),
    timestamp: new Date().toISOString(),
    ...mailData,
  };

  inMemoryOutbox.unshift(fileContent);
  atomicWriteJson(filePath, fileContent);
  return { filename, filePath, content: fileContent };
}

export function getOutboxMails() {
  try {
    if (!fs.existsSync(OUTBOX_DIR)) return inMemoryOutbox;
    const files = fs.readdirSync(OUTBOX_DIR).filter(f => f.endsWith('.json'));
    const mails = [];
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(OUTBOX_DIR, file), 'utf8');
        mails.push(JSON.parse(content));
      } catch (err) {
        // ignore corrupted
      }
    }
    // Combine with in-memory outbox items
    for (const item of inMemoryOutbox) {
      if (!mails.some(m => m.id === item.id)) {
        mails.push(item);
      }
    }
    return mails.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (err) {
    return inMemoryOutbox;
  }
}

// Auto-initialize on module load
initStorage();
