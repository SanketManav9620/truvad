import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertLead, getLead, saveFeedback } from '../src/storage.js';

test('upsertLead() creates a new lead with normalized email and default preferences', () => {
  const email = 'Storage.User1@Bank.COM';
  const lead = upsertLead({
    email,
    verified: true,
    preferences: { rbi: true, sebi: false, sec: true },
  });

  assert.equal(lead.email, 'storage.user1@bank.com');
  assert.equal(lead.verified, true);
  assert.equal(lead.preferences.rbi, true);
  assert.equal(lead.preferences.sebi, false);
  assert.equal(lead.preferences.sec, true);
  assert.ok(lead.id.startsWith('lead_'));
  assert.ok(lead.createdAt);
});

test('upsertLead() updates an existing lead preserving id and createdAt', () => {
  const email = 'storage.user1@bank.com';
  const existing = getLead(email);
  assert.ok(existing);

  const updated = upsertLead({
    email,
    verified: true,
    preferences: { rbi: true, sebi: true, sec: true },
  });

  assert.equal(updated.id, existing.id);
  assert.equal(updated.createdAt, existing.createdAt);
  assert.equal(updated.preferences.sebi, true);
  assert.ok(updated.updatedAt);
});

test('getLead() retrieves existing lead or returns null for non-existent', () => {
  const found = getLead('STORAGE.USER1@BANK.COM');
  assert.ok(found);
  assert.equal(found.email, 'storage.user1@bank.com');

  const missing = getLead('nonexistent.user@domain.com');
  assert.equal(missing, null);
});

test('saveFeedback() persists feedback with normalized email', () => {
  const fb = saveFeedback({
    email: 'Storage.User1@Bank.COM',
    rating: 5,
    category: 'Feature Request',
    message: 'Test storage feedback message',
  });

  assert.equal(fb.email, 'storage.user1@bank.com');
  assert.equal(fb.rating, 5);
  assert.equal(fb.category, 'Feature Request');
  assert.ok(fb.id.startsWith('fb_'));
});
