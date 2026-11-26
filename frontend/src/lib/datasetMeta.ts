import type { DatasetEndpoint } from '@/api/types';

export interface DatasetDisplayMeta {
  readonly thaiName: string;
  readonly policyTag: string | null;
  readonly usesBatchedSync: boolean;
  readonly usesHmacPseudonym: boolean;
}

export const DATASET_DISPLAY_META: Readonly<Record<DatasetEndpoint, DatasetDisplayMeta>> = {
  subdistricts: {
    thaiName: 'ตำบล (อ.สอง)',
    policyTag: null,
    usesBatchedSync: false,
    usesHmacPseudonym: false,
  },
  villages: {
    thaiName: 'หมู่บ้าน (อ.สอง)',
    policyTag: null,
    usesBatchedSync: false,
    usesHmacPseudonym: false,
  },
  'health-services': {
    thaiName: 'หน่วยบริการสาธารณสุข',
    policyTag: 'PLACEHOLDER_COORDS Check',
    usesBatchedSync: false,
    usesHmacPseudonym: false,
  },
  'volunteer-gender': {
    thaiName: 'สรุปเพศ อสม. รายหมู่บ้าน',
    policyTag: 'Small-Cell Suppression',
    usesBatchedSync: false,
    usesHmacPseudonym: false,
  },
  assignments: {
    thaiName: 'การมอบหมายงาน อสม.',
    policyTag: 'Pseudonymous Key (h1_)',
    usesBatchedSync: true,
    usesHmacPseudonym: true,
  },
  'volunteer-family': {
    thaiName: 'ความสัมพันธ์ครอบครัว อสม.',
    policyTag: 'Preserve Source Locality',
    usesBatchedSync: true,
    usesHmacPseudonym: false,
  },
  'resigned-volunteers': {
    thaiName: 'อสม. ที่ลาออก',
    policyTag: 'Preserve Source Locality',
    usesBatchedSync: true,
    usesHmacPseudonym: true,
  },
  'volunteer-tenure': {
    thaiName: 'อายุงาน อสม.',
    policyTag: 'Pseudonymous Key (h1_)',
    usesBatchedSync: true,
    usesHmacPseudonym: true,
  },
};
