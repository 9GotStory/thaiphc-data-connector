const THAI_SHORT_FORMATTER = new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const THAI_LONG_FORMATTER = new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const NUMBER_FORMATTER = new Intl.NumberFormat('en-US');

export function formatBangkokDateTime(isoUtc: string | null): string {
  if (!isoUtc) {
    return 'ยังไม่เคยซิงก์';
  }
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) {
    return 'ยังไม่เคยซิงก์';
  }
  return `${THAI_SHORT_FORMATTER.format(date)} น.`;
}

export function formatBangkokLongDateTime(isoUtc: string): string {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return `${THAI_LONG_FORMATTER.format(date)} น. (Asia/Bangkok)`;
}

export function formatRowCount(count: number | null): string {
  if (count === null) {
    return '—';
  }
  return NUMBER_FORMATTER.format(count);
}

export function maskSpreadsheetId(id: string): string {
  if (id.length <= 14) {
    return id;
  }
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}
