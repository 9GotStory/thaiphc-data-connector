import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const schemaDir = fileURLToPath(new URL('../docs/schemas/', import.meta.url));
const expected = [
  'thaiphc_assignments_schema.md',
  'thaiphc_subdistricts_schema.md',
  'thaiphc_villages_schema.md',
  'thaiphc_health_services_schema.md',
  'thaiphc_volunteer_gender_schema.md',
  'thaiphc_volunteer_family_schema.md',
  'thaiphc_resigned_volunteers_schema.md',
  'thaiphc_volunteer_tenure_schema.md'
];

test('eight documented endpoint schemas exist, without apparent raw identifiers', async () => {
  assert.deepEqual((await readdir(schemaDir)).sort(), [...expected].sort());
  for (const name of expected) {
    const text = await readFile(new URL('../docs/schemas/' + name, import.meta.url), 'utf8');
    assert.match(text, /https:\/\/api-thaiphc\.hss\.moph\.go\.th/);
    assert.doesNotMatch(text, /(?<!\d)\d{13}(?!\d)/);
    assert.doesNotMatch(text, /Bearer\s+[A-Za-z0-9_=-]{20,}/i);
  }
});
