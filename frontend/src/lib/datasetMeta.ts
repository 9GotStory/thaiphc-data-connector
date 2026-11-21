import type { DatasetEndpoint } from '@/api/types';

export interface DatasetDisplayMeta {
  readonly thaiName: string;
  readonly policyTag: string | null;
}

export const DATASET_DISPLAY_META: Readonly<Record<DatasetEndpoint, DatasetDisplayMeta>> = {
  subdistricts: {
    thaiName: 'ตำบล (อ.สอง)',
    policyTag: null,
  },
  villages: {
    thaiName: 'หมู่บ้าน (อ.สอง)',
    policyTag: null,
  },
  'health-services': {
    thaiName: 'หน่วยบริการสาธารณสุข',
    policyTag: 'PLACEHOLDER_COORDS Check',
  },
  'volunteer-gender': {
    thaiName: 'สรุปเพศ อสม. รายหมู่บ้าน',
    policyTag: 'Small-Cell Suppression',
  },
  assignments: {
    thaiName: 'การมอบหมายงาน อสม.',
    policyTag: 'Pseudonymous Key (h1_)',
  },
  'volunteer-family': {
    thaiName: 'ความสัมพันธ์ครอบครัว อสม.',
    policyTag: 'Preserve Source Locality',
  },
  'resigned-volunteers': {
    thaiName: 'อสม. ที่ลาออก',
    policyTag: 'Preserve Source Locality',
  },
  'volunteer-tenure': {
    thaiName: 'อายุงาน อสม.',
    policyTag: 'Pseudonymous Key (h1_)',
  },
};
