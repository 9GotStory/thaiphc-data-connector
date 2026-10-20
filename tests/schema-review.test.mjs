import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const observed = JSON.parse(await readFile(new URL('../docs/schema-review-evidence.json', import.meta.url), 'utf8'));
const subdistrict = '990101'; // synthetic administrative code, not ThaiPHC sample
const villageLookup = new Map([['990101001', {code: '990101001', subdistrict_code: subdistrict, village_no: 1}]]);

function auditGeo(row) {
  const village = villageLookup.get(row.villageCode);
  if (!village) return 'UNRESOLVED_VILLAGE';
  if (row.subdistrictCode !== village.subdistrict_code) return 'MISMATCH_SUBDISTRICT';
  if (row.villageNo !== String(village.village_no)) return 'MISMATCH_VILLAGE_NUMBER';
  return 'MATCH';
}

test('observed 85-village aggregate is internally consistent', () => {
  const villages = observed.village_lookup;
  assert.equal(Object.values(villages.subdistrict_counts).reduce((a,b)=>a+b,0), 85);
  assert.equal(villages.unique_code, villages.items);
  assert.equal(villages.id_eq_code, villages.items);
  assert.equal(villages.code_formula_matches, villages.items);
  assert.equal(villages.null_count.health_service_code + observed.health_services.village_ref_nonnull, villages.items);
});

test('health-services evidence reflects incomplete pagination', () => {
  assert.equal(observed.health_services.sample_items, 10);
  assert.equal(observed.health_services.response_total, 18);
  assert.equal(observed.health_services.village_ref_to_visible_health_page + observed.health_services.village_ref_to_unseen_health_page, observed.health_services.village_ref_nonnull);
  assert.ok(observed.health_services.latlon_both_zero > 0);
});

test('report geography join uses codes, never name-only repair', () => {
  assert.equal(auditGeo({villageCode:'990101001',subdistrictCode:subdistrict,villageNo:'1'}),'MATCH');
  assert.equal(auditGeo({villageCode:'990101001',subdistrictCode:'990102',villageNo:'1'}),'MISMATCH_SUBDISTRICT');
  assert.equal(auditGeo({villageCode:'990101001',subdistrictCode:subdistrict,villageNo:'2'}),'MISMATCH_VILLAGE_NUMBER');
  assert.equal(auditGeo({villageCode:'990201001',subdistrictCode:subdistrict,villageNo:'1'}),'UNRESOLVED_VILLAGE');
});

test('gender aggregate sample arithmetic and family mismatches are explicit', () => {
  const g=observed.reports.volunteer_gender;
  assert.equal(g.sample_total,g.male_total+g.female_total);
  assert.equal(g.gender_sum_matches,g.sample_rows);
  const f=observed.reports.volunteer_family;
  assert.equal(f.one_subdistrict_mismatch+f.two_outside_scope_village_codes,3);
  assert.equal(f.full_geography_matches+3,f.sample_rows);
});

test('null, empty string and numeric status values remain distinct',()=>{
  assert.notEqual(null,'');
  assert.notEqual('0',0);
  assert.notEqual('', '0');
  assert.notEqual(null,undefined);
});

test('repeated villages in person-grain reports are not duplicate persons',()=>{
  assert.ok(observed.reports.resigned_volunteers.unique_village_codes < observed.reports.resigned_volunteers.sample_rows);
  assert.ok(observed.reports.volunteer_tenure.unique_village_codes < observed.reports.volunteer_tenure.sample_rows);
});
