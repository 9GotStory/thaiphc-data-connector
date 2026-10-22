// T012. Pure offline guard for a locally pulled Google Apps Script project.
// Prints a single non-sensitive classifier; NEVER mutates files or contacts Google.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

export const STARTER_FILE = 'รหัส.js';
export const DEFAULT_STARTER = /^\s*function\s+myFunction\s*\(\s*\)\s*\{\s*\}\s*$/;

export function classifyPulledProject(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  // Treat .clasp.json as locally generated only; all other project files are remote.
  if (entries.some(entry => entry.isSymbolicLink() || !entry.isFile())) {
    throw new Error('UNEXPECTED_REMOTE_SOURCE');
  }
  const names = entries.map(entry => entry.name);
  if (!names.includes('.clasp.json') || !names.includes('appsscript.json')) {
    throw new Error('MISSING_EXPECTED_STAGING_FILES');
  }
  const other = names.filter(name => name !== '.clasp.json' && name !== 'appsscript.json');
  if (other.length === 0) return 'EMPTY';
  if (other.length !== 1 || other[0] !== STARTER_FILE) {
    throw new Error('UNEXPECTED_REMOTE_SOURCE');
  }
  const path = join(directory, STARTER_FILE);
  const bytes = readFileSync(path);
  if (bytes.length > 128 || !DEFAULT_STARTER.test(bytes.toString('utf8'))) {
    throw new Error('UNEXPECTED_REMOTE_SOURCE');
  }
  return 'DEFAULT_STARTER';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    if (process.argv.length !== 3) throw new Error('STAGING_PATH_REQUIRED');
    process.stdout.write(classifyPulledProject(process.argv[2]) + '\n');
  } catch (error) {
    process.stderr.write('REMOTE_PREFLIGHT_STOP: ' + error.message + '\n');
    process.exitCode = 2;
  }
}
