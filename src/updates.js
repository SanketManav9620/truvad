import fs from 'node:fs';
import path from 'node:path';

const UPDATES_FILE = path.join(process.cwd(), 'data', 'mock-updates.json');

export const DEFAULT_UPDATES = [
  {
    id: 'upd_rbi_01',
    regulator: 'RBI',
    severity: 'Critical',
    title: 'Cybersecurity Governance Framework for Digital Payment Ecosystems',
    summary: 'Mandates real-time anomaly detection, zero-trust API access controls, and mandatory 4-digit OTP step-up authentication for all digital transactions exceeding ₹50,000.',
    effectiveDate: '2026-11-01',
    impactedEntities: ['Payment System Operators', 'Scheduled Commercial Banks', 'NBFCs'],
    link: '#',
  },
  {
    id: 'upd_sebi_01',
    regulator: 'SEBI',
    severity: 'High',
    title: 'Enhanced Surveillance and Identity Verification for Algorithmic Trading Desks',
    summary: 'Requires institutional brokers to implement automated kill-switches, dual-factor cryptographic key authorization, and daily telemetry reporting for high-frequency trading algorithms.',
    effectiveDate: '2026-10-15',
    impactedEntities: ['Stockbrokers', 'Institutional Investors', 'Asset Management Companies'],
    link: '#',
  },
  {
    id: 'upd_sec_01',
    regulator: 'SEC',
    severity: 'Critical',
    title: 'Mandatory Cybersecurity Risk Management and Incident Disclosure Protocol',
    summary: 'Enforces 4-hour public disclosure timelines for material cybersecurity incidents and requires quarterly board-level reviews of third-party vendor risk assessments.',
    effectiveDate: '2026-12-01',
    impactedEntities: ['Publicly Traded Companies', 'Registered Investment Advisers', 'Broker-Dealers'],
    link: '#',
  },
];

/**
 * Reads regulatory updates from data/mock-updates.json.
 * Auto-creates file with defaults if missing.
 * @returns {Array} List of updates
 */
export function getUpdates() {
  try {
    if (!fs.existsSync(UPDATES_FILE)) {
      const dir = path.dirname(UPDATES_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(UPDATES_FILE, JSON.stringify(DEFAULT_UPDATES, null, 2), 'utf8');
      return DEFAULT_UPDATES;
    }
    const content = fs.readFileSync(UPDATES_FILE, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error('[updates] Error reading mock-updates.json:', err.message);
    return DEFAULT_UPDATES;
  }
}

/**
 * Filters regulatory updates by selected regulators.
 * Falls back to all 3 updates if no regulators are selected or if selection yields no match.
 * 
 * @param {Array<string>|object} selectedRegulators e.g. ['rbi', 'sebi'] or { rbi: true, sec: false }
 * @returns {Array} Filtered list of updates
 */
export function getFilteredUpdates(selectedRegulators) {
  const allUpdates = getUpdates();
  let selected = [];

  if (Array.isArray(selectedRegulators)) {
    selected = selectedRegulators
      .map(r => String(r).trim().toUpperCase())
      .filter(Boolean);
  } else if (selectedRegulators && typeof selectedRegulators === 'object') {
    selected = Object.entries(selectedRegulators)
      .filter(([_, enabled]) => Boolean(enabled))
      .map(([regulator, _]) => regulator.trim().toUpperCase());
  }

  // Fallback to all updates if none selected
  if (!selected || selected.length === 0) {
    return allUpdates;
  }

  const filtered = allUpdates.filter(u => selected.includes(u.regulator.toUpperCase()));
  
  // Fallback to all updates if filtering produces empty array
  return filtered.length > 0 ? filtered : allUpdates;
}
