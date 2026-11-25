import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GasTransportProvider } from '@/api/TransportContext';
import { MockGasTransport, type GasRpcTransport } from '@/api/transport';
import { createQueryClient } from '@/lib/queryClient';
import { App } from './App';

function renderApp(transport: GasRpcTransport) {
  const qc = createQueryClient();
  // Disable retry inside test helper only when testing immediate error rendering
  qc.setDefaultOptions({
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <GasTransportProvider transport={transport}>
        <App />
      </GasTransportProvider>
    </QueryClientProvider>,
  );
}

describe('ThaiPHC Data Connector Dashboard Shell (Frontend GasRpcTransport Seam)', () => {
  it('renders SANDBOX dashboard with read-only Write Guards, two dataset groups (3 Reference + 5 Extended Report), accessible Copy/Disclosure, and manual refresh', async () => {
    const user = userEvent.setup();
    const baseTransport = new MockGasTransport({ scenario: 'sandbox-default' });
    const getStatusSpy = vi.spyOn(baseTransport, 'getDashboardStatus');

    const localStorageSetSpy = vi.spyOn(Storage.prototype, 'setItem');
    renderApp(baseTransport);

    // Environment & workbook header
    expect(await screen.findByText(/สภาพแวดล้อมทดสอบ \(Sandbox\)/)).toBeInTheDocument();
    expect(screen.queryByTestId('production-hazard-strip')).not.toBeInTheDocument();
    expect(screen.getAllByText('SANDBOX').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('ThaiPHC Data (Sandbox Mock)')).toBeInTheDocument();
    expect(screen.queryByText(/UNRESOLVED_PREVIOUS_RUN/)).not.toBeInTheDocument();

    // Read-only Write Guards: never interactive switches or checkboxes
    expect(screen.getByText('THAIPHC_WRITE_ENABLED')).toBeInTheDocument();
    expect(screen.getByText('THAIPHC_PERSON_DATA_WRITE_ENABLED')).toBeInTheDocument();
    expect(screen.getAllByText('THAIPHC_FULL_PII_WRITE_ENABLED').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getAllByText(/อ่านอย่างเดียว — แก้ไขได้เฉพาะใน Google Apps Script/).length).toBe(3);

    // Two distinct dataset groups
    const refSection = screen.getByRole('region', { name: /ชุดข้อมูลอ้างอิงพื้นฐาน/ });
    const extSection = screen.getByRole('region', { name: /ชุดข้อมูลรายงานขยาย/ });

    expect(within(refSection).getAllByText('subdistricts').length).toBeGreaterThanOrEqual(1);
    expect(within(refSection).getAllByText('villages').length).toBeGreaterThanOrEqual(1);
    expect(within(refSection).getAllByText('health-services').length).toBeGreaterThanOrEqual(1);
    expect(within(refSection).queryByText('assignments')).not.toBeInTheDocument();

    expect(within(extSection).getAllByText('volunteer-gender').length).toBeGreaterThanOrEqual(1);
    expect(within(extSection).getAllByText('assignments').length).toBeGreaterThanOrEqual(1);
    expect(within(extSection).getAllByText('volunteer-family').length).toBeGreaterThanOrEqual(1);
    expect(within(extSection).getAllByText('resigned-volunteers').length).toBeGreaterThanOrEqual(1);
    expect(within(extSection).getAllByText('volunteer-tenure').length).toBeGreaterThanOrEqual(1);

    // Sync mode distinction & special metadata
    expect(within(extSection).getAllByText('Complete Snapshot').length).toBeGreaterThanOrEqual(1);
    expect(within(extSection).getAllByText('RFamily_20261121_1030').length).toBeGreaterThanOrEqual(
      1,
    );
    expect(
      within(extSection).getAllByText(/LEGACY_F010_SNAPSHOT_PRESENT/).length,
    ).toBeGreaterThanOrEqual(1);
    expect(within(extSection).getAllByText('1,823').length).toBeGreaterThanOrEqual(1);

    // Accessible Disclosure reveals full run_id without hover-only tooltip
    const disclosureButtons = screen.getAllByRole('button', {
      name: /แสดงรหัสเต็มของ run_20261121_0900_sub_s1/i,
    });
    await user.click(disclosureButtons[0]);
    expect(screen.getAllByText('run_20261121_0900_sub_s1').length).toBeGreaterThanOrEqual(2);

    // Manual Refresh calls getDashboardStatus again
    expect(getStatusSpy).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /รีเฟรชสถานะ/ }));
    await waitFor(() => {
      expect(getStatusSpy).toHaveBeenCalledTimes(2);
    });

    // Zero browser storage writes and zero Bearer Token inputs on Dashboard
    expect(localStorageSetSpy).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/Bearer Token/i)).not.toBeInTheDocument();
    localStorageSetSpy.mockRestore();
  });

  it('renders PRODUCTION hazard strip, top-priority UNRESOLVED_PREVIOUS_RUN alert banner, and iframe-safe navigation into Sync Workspace', async () => {
    const user = userEvent.setup();
    const initialPath = window.location.pathname;
    const initialHash = window.location.hash;

    renderApp(new MockGasTransport({ scenario: 'production-unresolved' }));

    expect(await screen.findByText(/สภาพแวดล้อมใช้งานจริง \(Production\)/)).toBeInTheDocument();
    expect(screen.getByTestId('production-hazard-strip')).toBeInTheDocument();

    // Priority alert banner
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/UNRESOLVED_PREVIOUS_RUN/)).toBeInTheDocument();
    expect(within(alert).getByText(/assignments/)).toBeInTheDocument();
    expect(within(alert).getByText(/Non-ACID/)).toBeInTheDocument();
    expect(within(alert).queryByRole('button', { name: /Retry|ลองซ้ำ/i })).not.toBeInTheDocument();

    // Click alert CTA -> navigates to Sync Workspace with assignments pre-selected (no URL mutation)
    await user.click(within(alert).getByRole('button', { name: /เปิดชุดข้อมูลในพื้นที่ซิงก์/ }));

    expect(window.location.pathname).toBe(initialPath);
    expect(window.location.hash).toBe(initialHash);
    expect(screen.getByRole('button', { name: /พื้นที่ซิงก์ข้อมูล/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('heading', { level: 1, name: /พื้นที่ซิงก์ข้อมูล/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /การมอบหมายงาน อสม\./ })).toBeChecked();

    // Sync Workspace groups the 8 APIs consistently into 3 Reference + 5 Extended Report
    const wsRefGroup = screen.getByRole('group', { name: /ชุดข้อมูลอ้างอิงพื้นฐาน/ });
    const wsExtGroup = screen.getByRole('group', { name: /ชุดข้อมูลรายงานขยาย/ });
    expect(within(wsRefGroup).getAllByRole('radio')).toHaveLength(3);
    expect(within(wsExtGroup).getAllByRole('radio')).toHaveLength(5);

    // Navigate back to Dashboard via top header tab
    const nav = screen.getByRole('navigation', { name: 'เมนูหลัก' });
    await user.click(within(nav).getByRole('button', { name: 'ภาพรวม' }));
    expect(within(nav).getByRole('button', { name: 'ภาพรวม' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('heading', { name: /ชุดข้อมูลอ้างอิงพื้นฐาน/ })).toBeInTheDocument();
  });

  it('displays loading skeletons while fetching, surfaces unconfigured HMAC and unapproved same-workbook warnings, and enforces GAS QueryClient defaults', async () => {
    const defaultClient = createQueryClient();
    expect(defaultClient.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
    expect(defaultClient.getDefaultOptions().mutations?.retry).toBe(false);

    let resolveStatus:
      ((value: Awaited<ReturnType<GasRpcTransport['getDashboardStatus']>>) => void) | null = null;
    const deferredTransport: GasRpcTransport = {
      mode: 'mock',
      getDashboardStatus: () =>
        new Promise((resolve) => {
          resolveStatus = resolve;
        }),
      previewDataset: (req) => new MockGasTransport().previewDataset(req),
      previewDatasetBatch: (req) => new MockGasTransport().previewDatasetBatch(req),
      finalizePreview: (req) => new MockGasTransport().finalizePreview(req),
      commitSmallDataset: (req) => new MockGasTransport().commitSmallDataset(req),
      stageLargeDatasetBatch: (req) => new MockGasTransport().stageLargeDatasetBatch(req),
      finalizeLargeDatasetCommit: (req) => new MockGasTransport().finalizeLargeDatasetCommit(req),
    };

    renderApp(deferredTransport);
    expect(screen.getByLabelText(/กำลังโหลดสถานะ Dashboard/)).toHaveAttribute('aria-busy', 'true');

    const unapprovedData = await new MockGasTransport({
      scenario: 'same-workbook-unapproved',
    }).getDashboardStatus();
    resolveStatus!(unapprovedData);

    expect(await screen.findByText(/ยังไม่อนุมัติการเขียนรายงานลงสมุดงานเดียวกัน/)).toBeInTheDocument();
    expect(screen.getByText(/ปิดอยู่ \(บล็อก Commit รายงานขยาย\)/)).toBeInTheDocument();
  });

  it('reflects independent Write Guard state on Extended Report header, enforces THAIPHC_FULL_PII_WRITE_ENABLED requirement in Sync Workspace, and falls back to disclosure when Clipboard API is absent', async () => {
    const user = userEvent.setup();
    const baseData = await new MockGasTransport({
      scenario: 'sandbox-default',
    }).getDashboardStatus();

    const customTransport: GasRpcTransport = {
      mode: 'mock',
      async getDashboardStatus() {
        return {
          ...baseData,
          guards: {
            writeEnabled: false,
            personDataWriteEnabled: true,
            fullPiiWriteEnabled: true,
            hmacKeyConfigured: false,
            reportWorkbookApproved: true,
          },
        };
      },
      previewDataset: (req) => new MockGasTransport().previewDataset(req),
      previewDatasetBatch: (req) => new MockGasTransport().previewDatasetBatch(req),
      finalizePreview: (req) => new MockGasTransport().finalizePreview(req),
      commitSmallDataset: (req) => new MockGasTransport().commitSmallDataset(req),
      stageLargeDatasetBatch: (req) => new MockGasTransport().stageLargeDatasetBatch(req),
      finalizeLargeDatasetCommit: (req) => new MockGasTransport().finalizeLargeDatasetCommit(req),
    };

    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });

    try {
      const firstRender = renderApp(customTransport);

      // Extended Report header badge reflects THAIPHC_PERSON_DATA_WRITE_ENABLED + THAIPHC_FULL_PII_WRITE_ENABLED (ON)
      const extSection = await screen.findByRole('region', { name: /ชุดข้อมูลรายงานขยาย/ });
      expect(within(extSection).getByText('ON')).toBeInTheDocument();

      // Without Clipboard API, clicking Copy opens full disclosure instead of false-positive copied status
      const copyButtons = screen.getAllByRole('button', {
        name: /คัดลอก Run ID ของ subdistricts/i,
      });
      await user.click(copyButtons[0]);
      expect(
        screen.getAllByText(/เปิดรหัสเต็มของ Run ID ของ subdistricts เพื่อคัดลอกด้วยตนเอง/).length,
      ).toBeGreaterThanOrEqual(1);
      firstRender.unmount();

      // Even if writeEnabled & personDataWriteEnabled are ON, fullPiiWriteEnabled OFF blocks Extended Report writes in Sync Workspace
      const fullPiiOffTransport: GasRpcTransport = {
        mode: 'mock',
        async getDashboardStatus() {
          return {
            ...baseData,
            guards: {
              writeEnabled: true,
              personDataWriteEnabled: true,
              fullPiiWriteEnabled: false,
              hmacKeyConfigured: false,
              reportWorkbookApproved: true,
            },
          };
        },
        previewDataset: (req) => new MockGasTransport().previewDataset(req),
        previewDatasetBatch: (req) => new MockGasTransport().previewDatasetBatch(req),
        finalizePreview: (req) => new MockGasTransport().finalizePreview(req),
        commitSmallDataset: (req) => new MockGasTransport().commitSmallDataset(req),
        stageLargeDatasetBatch: (req) => new MockGasTransport().stageLargeDatasetBatch(req),
        finalizeLargeDatasetCommit: (req) => new MockGasTransport().finalizeLargeDatasetCommit(req),
      };
      renderApp(fullPiiOffTransport);
      const nav = screen.getByRole('navigation', { name: 'เมนูหลัก' });
      await user.click(within(nav).getByRole('button', { name: 'พื้นที่ซิงก์ข้อมูล' }));
      const extGroup = await screen.findByRole('group', { name: /ชุดข้อมูลรายงานขยาย/ });
      const assignRadio = within(extGroup).getByRole('radio', { name: /การมอบหมายงาน อสม\./ });
      await user.click(assignRadio);
      expect(
        within(extGroup).getAllByText(/Preview เท่านั้น \(Guard OFF\)/).length,
      ).toBeGreaterThanOrEqual(1);
    } finally {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard,
      });
    }
  });

  it('shows focusable error alert with LOAD_ERROR header state (including in Sync Workspace) and manual retry on RPC failure', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const flakyTransport: GasRpcTransport = {
      mode: 'mock',
      async getDashboardStatus() {
        attempt += 1;
        if (attempt === 1) {
          return new MockGasTransport({ scenario: 'rpc-error' }).getDashboardStatus();
        }
        return new MockGasTransport({ scenario: 'sandbox-default' }).getDashboardStatus();
      },
      previewDataset: (req) => new MockGasTransport().previewDataset(req),
      previewDatasetBatch: (req) => new MockGasTransport().previewDatasetBatch(req),
      finalizePreview: (req) => new MockGasTransport().finalizePreview(req),
      commitSmallDataset: (req) => new MockGasTransport().commitSmallDataset(req),
      stageLargeDatasetBatch: (req) => new MockGasTransport().stageLargeDatasetBatch(req),
      finalizeLargeDatasetCommit: (req) => new MockGasTransport().finalizeLargeDatasetCommit(req),
    };

    renderApp(flakyTransport);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('tabindex', '-1');
    expect(within(alert).getByText(/WORKBOOK_ACCESS_FAILED/)).toBeInTheDocument();
    expect(screen.getAllByText('LOAD_ERROR').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('กำลังโหลด...')).not.toBeInTheDocument();

    // Switching to Sync Workspace during error renders an explicit error alert (never blank)
    const nav = screen.getByRole('navigation', { name: 'เมนูหลัก' });
    await user.click(within(nav).getByRole('button', { name: 'พื้นที่ซิงก์ข้อมูล' }));
    const wsAlert = screen.getByRole('alert');
    expect(within(wsAlert).getByText(/WORKBOOK_ACCESS_FAILED/)).toBeInTheDocument();

    await user.click(within(wsAlert).getByRole('button', { name: /ลองโหลดสถานะอีกครั้ง/ }));
    expect(
      await screen.findByRole('heading', { level: 2, name: /1\. เลือกชุดข้อมูลสำหรับซิงก์/ }),
    ).toBeInTheDocument();
  });
});
