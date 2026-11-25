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
    policyTag: 'Full-Field (ไม่ปิดบัง 1..4)',
    usesBatchedSync: false,
    usesHmacPseudonym: false,
  },
  assignments: {
    thaiName: 'การมอบหมายงาน อสม.',
    policyTag: 'Full-Field · Raw ID Key',
    usesBatchedSync: true,
    usesHmacPseudonym: false,
  },
  'volunteer-family': {
    thaiName: 'ความสัมพันธ์ครอบครัว อสม.',
    policyTag: 'Full-Field · Preserve Source Locality',
    usesBatchedSync: true,
    usesHmacPseudonym: false,
  },
  'resigned-volunteers': {
    thaiName: 'อสม. ที่ลาออก',
    policyTag: 'Full-Field · Preserve Source Locality',
    usesBatchedSync: true,
    usesHmacPseudonym: false,
  },
  'volunteer-tenure': {
    thaiName: 'อายุงาน อสม.',
    policyTag: 'Full-Field · Raw ID Key',
    usesBatchedSync: true,
    usesHmacPseudonym: false,
  },
};
