import fs from 'node:fs';
import path from 'node:path';

/**
 * Tiny zero-dependency .env loader.
 * Parses KEY=VALUE pairs from a .env file into process.env.
 */
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  try {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      // Ignore empty lines and comment lines
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) {
        continue;
      }

      const key = trimmed.substring(0, eqIndex).trim();
      let val = trimmed.substring(eqIndex + 1).trim();

      // Remove leading/trailing quotes if present
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }

      // Do not overwrite existing process.env values if already set externally
      if (key && process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch (err) {
    console.warn('[config] Warning: Failed to read .env file:', err.message);
  }
}

// Execute environment loader immediately upon import
loadEnv();

export const config = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  MAIL_FROM: process.env.MAIL_FROM || 'Grip Alerts <alerts@example.com>',
  FEEDBACK_TO: process.env.FEEDBACK_TO || 'griptruvad@gmail.com',
  OTP_TTL_SECONDS: parseInt(process.env.OTP_TTL_SECONDS || '300', 10),
};

export default config;
