import type { DatasetEndpoint, DatasetGroup, PaginationProtocol, SyncMode } from './types.ts';

export interface DatasetDescriptor {
  readonly endpoint: DatasetEndpoint;
  readonly group: DatasetGroup;
  readonly syncMode: SyncMode;
  readonly paginationProtocol: PaginationProtocol;
  readonly defaultTab: string;
  readonly legacyPrefix: string | null;
}

export const DATASET_CATALOG: readonly DatasetDescriptor[] = [
  {
    endpoint: 'subdistricts',
    group: 'reference',
    syncMode: 'KEYED_UPSERT',
    paginationProtocol: 'none',
    defaultTab: 'Subdistricts',
    legacyPrefix: null,
  },
  {
    endpoint: 'villages',
    group: 'reference',
    syncMode: 'KEYED_UPSERT',
    paginationProtocol: 'none',
    defaultTab: 'Villages',
    legacyPrefix: null,
  },
  {
    endpoint: 'health-services',
    group: 'reference',
    syncMode: 'KEYED_UPSERT',
    paginationProtocol: 'offset',
    defaultTab: 'HealthServices',
    legacyPrefix: null,
  },
  {
    endpoint: 'volunteer-gender',
    group: 'extended_report',
    syncMode: 'KEYED_UPSERT',
    paginationProtocol: 'report',
    defaultTab: 'VolunteerGender',
    legacyPrefix: 'RGender_',
  },
  {
    endpoint: 'assignments',
    group: 'extended_report',
    syncMode: 'KEYED_UPSERT',
    paginationProtocol: 'assignment',
    defaultTab: 'Assignments',
    legacyPrefix: 'RAssign_',
  },
  {
    endpoint: 'volunteer-family',
    group: 'extended_report',
    syncMode: 'COMPLETE_SNAPSHOT',
    paginationProtocol: 'report',
    defaultTab: 'RFamily_<runId>',
    legacyPrefix: 'RFamily_',
  },
  {
    endpoint: 'resigned-volunteers',
    group: 'extended_report',
    syncMode: 'KEYED_UPSERT',
    paginationProtocol: 'report',
    defaultTab: 'ResignedVolunteers',
    legacyPrefix: 'RResign_',
  },
  {
    endpoint: 'volunteer-tenure',
    group: 'extended_report',
    syncMode: 'KEYED_UPSERT',
    paginationProtocol: 'report',
    defaultTab: 'VolunteerTenure',
    legacyPrefix: 'RTenure_',
  },
] as const;

export const REPORT_CURRENT_TAB = '_ThaiPHCReportCurrent';
export const SYNC_LOG_TAB = '_ThaiPHCSyncLog';
export const SAME_WORKBOOK_APPROVAL_TOKEN = 'OWNER_ONLY_5406_APPROVED';
