import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GasTransportProvider } from '@/api/TransportContext';
import { MockGasTransport, type GasRpcTransport } from '@/api/transport';
import { GasRpcClientError } from '@/api/types';
import { createQueryClient } from '@/lib/queryClient';
import { App } from './App';

const VALID_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.synthetic_ui_token_987654';

function renderApp(transport: GasRpcTransport) {
  const qc = createQueryClient();
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

async function openSyncWorkspace(user: ReturnType<typeof userEvent.setup>) {
  const nav = await screen.findByRole('navigation', { name: 'เมนูหลัก' });
  await user.click(within(nav).getByRole('button', { name: 'พื้นที่ซิงก์ข้อมูล' }));
  await screen.findByLabelText(/ThaiPHC Bearer Token/);
}

describe('Reference Datasets Repeatable Sync (Frontend GasRpcTransport Seam)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('manages Bearer Token strictly in React memory: mask/reveal, paste, format validation, clear, 15-min idle auto-clear, HTTP_401 auto-clear, and zero browser storage writes', async () => {
    const user = userEvent.setup();
    const localStorageSetSpy = vi.spyOn(Storage.prototype, 'setItem');
    const transport = new MockGasTransport({ scenario: 'sandbox-writable' });
    const previewSpy = vi.spyOn(transport, 'previewDataset');

    renderApp(transport);
    await openSyncWorkspace(user);

    const tokenInput = screen.getByLabelText(/ThaiPHC Bearer Token/) as HTMLInputElement;
    expect(tokenInput.type).toBe('password');

    // Paste is allowed (never prevented) and format validation rejects "Bearer " prefix without echoing token
    await user.click(tokenInput);
    await user.paste(`Bearer ${VALID_TOKEN}`);
    const previewBtn = screen.getByRole('button', { name: /เริ่ม Preview/ });
    await user.click(previewBtn);

    expect(
      screen.getByText(/กรุณาวางเฉพาะค่า Token โดยไม่ต้องใส่คำนำหน้า 'Bearer '/),
    ).toBeInTheDocument();
    expect(tokenInput).toHaveAttribute('aria-invalid', 'true');
    expect(previewSpy).not.toHaveBeenCalled();

    // Show/Hide toggle toggles type password <-> text with aria-pressed
    const toggleBtn = screen.getByRole('button', { name: /แสดง Bearer Token ชั่วคราว/ });
    expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggleBtn);
    expect(tokenInput.type).toBe('text');
    expect(screen.getByRole('button', { name: /ซ่อน Bearer Token/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // One-click Clear Token wipes token and focuses input
    await user.click(screen.getByRole('button', { name: /ล้าง Token/ }));
    expect(tokenInput.value).toBe('');
    expect(document.activeElement).toBe(tokenInput);

    // HTTP_401 from GAS immediately wipes in-memory token, shows crimson alert without token echo, and focuses input
    previewSpy.mockRejectedValueOnce(new GasRpcClientError('HTTP_401', 'Unauthorized'));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));

    const authAlert = await screen.findByRole('alert');
    expect(within(authAlert).getByRole('heading', { name: /HTTP_401/ })).toBeInTheDocument();
    expect(authAlert.textContent).not.toContain(VALID_TOKEN);
    expect(tokenInput.value).toBe('');
    expect(document.activeElement).toBe(tokenInput);

    // 15-minute idle timeout wipes token automatically
    vi.useFakeTimers();
    fireEvent.change(tokenInput, { target: { value: VALID_TOKEN } });
    expect(tokenInput.value).toBe(VALID_TOKEN);

    await act(async () => {
      vi.advanceTimersByTime(15 * 60 * 1000 + 2000);
    });
    expect(tokenInput.value).toBe('');
    expect(
      screen.getAllByText(/ล้าง Token อัตโนมัติหลังไม่ใช้งานครบ 15 นาที/).length,
    ).toBeGreaterThanOrEqual(1);

    expect(localStorageSetSpy).not.toHaveBeenCalled();
    localStorageSetSpy.mockRestore();
  });

  it('completes end-to-end health-services Preview, Diff/Review filtering, SANDBOX Confirmation AlertDialog, Commit, Destination Readback, and keeps Token for next dataset', async () => {
    const user = userEvent.setup();
    const transport = new MockGasTransport({ scenario: 'sandbox-writable' });

    renderApp(transport);
    await openSyncWorkspace(user);

    const tokenInput = screen.getByLabelText(/ThaiPHC Bearer Token/) as HTMLInputElement;
    await user.click(tokenInput);
    await user.paste(VALID_TOKEN);

    // Select health-services radio card
    const hsRadio = screen.getByRole('radio', { name: /หน่วยบริการสาธารณสุข/ });
    await user.click(hsRadio);
    expect(hsRadio).toBeChecked();

    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));

    // Preview Fingerprint & Diff counters & Review breakdown render
    expect(
      await screen.findByRole('heading', { level: 2, name: /Preview Fingerprint/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/PLACEHOLDER_COORDS/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/MISSING_IN_SOURCE/).length).toBeGreaterThanOrEqual(1);

    // Filterable Diff counter buttons
    const reviewFilter = screen.getByRole('button', { name: /REVIEW/ });
    await user.click(reviewFilter);
    expect(reviewFilter).toHaveAttribute('aria-pressed', 'true');

    // Open SANDBOX Confirmation Gate AlertDialog
    await user.click(screen.getByRole('button', { name: /ตรวจสอบและยืนยันการบันทึก \(SANDBOX\)/ }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/ยืนยันการบันทึกข้อมูลลงสภาพแวดล้อม SANDBOX/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /ยืนยันบันทึกข้อมูล/ }));

    // Outcome A: COMMITTED_VERIFIED + Destination Readback checklist
    expect(await screen.findByText(/ซิงก์และตรวจสอบ Destination Readback สำเร็จ/)).toBeInTheDocument();
    expect(screen.getByText(/COMMITTED_VERIFIED/)).toBeInTheDocument();
    expect(screen.getByText(/ชีต1/)).toBeInTheDocument();

    // Clicking "ซิงก์ชุดข้อมูลถัดไป" resets workspace while preserving in-memory Bearer Token
    await user.click(screen.getByRole('button', { name: /ซิงก์ชุดข้อมูลถัดไป/ }));
    expect((screen.getByLabelText(/ThaiPHC Bearer Token/) as HTMLInputElement).value).toBe(
      VALID_TOKEN,
    );
  });

  it('focuses Error Summary on STOP/BLOCKED, locks Commit when Write Guard is OFF, enforces typed PRODUCTION phrase, and handles PREVIEW_STALE and UNKNOWN_OUTCOME_STOP with zero Retry Commit', async () => {
    const user = userEvent.setup();

    // 1. Write Guard OFF (sandbox-default has writeEnabled: false)
    const guardOffTransport = new MockGasTransport({ scenario: 'sandbox-default' });
    const firstRender = renderApp(guardOffTransport);
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));

    expect(await screen.findByText(/โหมดอ่านอย่างเดียว — ไม่สามารถ Commit ได้/)).toBeInTheDocument();
    expect(screen.getByText('THAIPHC_WRITE_ENABLED')).toBeInTheDocument();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    firstRender.unmount();

    // 2. STOP/BLOCKED focuses Error Summary (role="alert" tabIndex={-1})
    const stopTransport = new MockGasTransport({
      scenario: 'sandbox-writable',
      previewOutcome: 'stop-blocked',
    });
    const stopRender = renderApp(stopTransport);
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));

    const stopSummary = await screen.findByRole('alert');
    expect(stopSummary).toHaveAttribute('tabindex', '-1');
    expect(within(stopSummary).getByText(/FORMULA_INJECTION_DETECTED/)).toBeInTheDocument();
    await waitFor(() => {
      expect(document.activeElement).toBe(stopSummary);
    });
    stopRender.unmount();

    // 3. PRODUCTION typed confirmation + PREVIEW_STALE_RECONFIRM_REQUIRED
    const staleTransport = new MockGasTransport({
      scenario: 'production-writable',
      commitOutcome: 'preview-stale',
    });
    const staleRender = renderApp(staleTransport);
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));
    await screen.findByRole('heading', { level: 2, name: /Preview Fingerprint/ });

    await user.click(screen.getByRole('button', { name: /ดำเนินการยืนยันการบันทึก \(PRODUCTION\)/ }));
    const prodDialog = screen.getByRole('alertdialog');
    const confirmAction = within(prodDialog).getByRole('button', {
      name: /ยืนยันบันทึกข้อมูลลง PRODUCTION/,
    });
    expect(confirmAction).toBeDisabled();

    const phraseInput = within(prodDialog).getByLabelText(/พิมพ์ข้อความด้านบนให้ตรงทุกตัวอักษร/);
    await user.type(phraseInput, 'PRODUCTION 5406 subdistricts');
    expect(confirmAction).toBeEnabled();

    // Canceling PRODUCTION dialog resets the typed confirmation phrase on reopen
    await user.click(within(prodDialog).getByRole('button', { name: 'ยกเลิก' }));
    await user.click(screen.getByRole('button', { name: /ดำเนินการยืนยันการบันทึก \(PRODUCTION\)/ }));
    const reopenedDialog = screen.getByRole('alertdialog');
    const reopenedInput = within(reopenedDialog).getByLabelText(
      /พิมพ์ข้อความด้านบนให้ตรงทุกตัวอักษร/,
    ) as HTMLInputElement;
    expect(reopenedInput.value).toBe('');
    const reopenedAction = within(reopenedDialog).getByRole('button', {
      name: /ยืนยันบันทึกข้อมูลลง PRODUCTION/,
    });
    expect(reopenedAction).toBeDisabled();
    await user.type(reopenedInput, 'PRODUCTION 5406 subdistricts');
    expect(reopenedAction).toBeEnabled();
    await user.click(reopenedAction);

    const staleAlert = await screen.findByRole('alert');
    expect(within(staleAlert).getByText(/PREVIEW_STALE_RECONFIRM_REQUIRED/)).toBeInTheDocument();
    expect(
      within(staleAlert).getByRole('button', { name: /รัน Preview ใหม่เพื่อตรวจสอบล่าสุด/ }),
    ).toBeInTheDocument();
    expect(
      within(staleAlert).queryByRole('button', { name: /Retry|ลองเขียนซ้ำ/i }),
    ).not.toBeInTheDocument();
    staleRender.unmount();

    // 4. UNKNOWN_OUTCOME_STOP -> never auto-retries, no Retry Commit button, shows 3-step recovery guide
    const unknownTransport = new MockGasTransport({
      scenario: 'sandbox-writable',
      commitOutcome: 'unknown-outcome',
    });
    const commitSpy = vi.spyOn(unknownTransport, 'commitSmallDataset');
    renderApp(unknownTransport);
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));
    await screen.findByRole('heading', { level: 2, name: /Preview Fingerprint/ });

    await user.click(screen.getByRole('button', { name: /ตรวจสอบและยืนยันการบันทึก \(SANDBOX\)/ }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /ยืนยันบันทึกข้อมูล/ }),
    );

    const unknownAlert = await screen.findByRole('alert');
    expect(within(unknownAlert).getByText(/UNKNOWN_OUTCOME_STOP/)).toBeInTheDocument();
    expect(within(unknownAlert).getByText(/No Auto-Retry/)).toBeInTheDocument();
    expect(
      within(unknownAlert).queryByRole('button', { name: /Retry|ลองเขียนซ้ำ/i }),
    ).not.toBeInTheDocument();
    expect(commitSpy).toHaveBeenCalledTimes(1);
  });

  it('supports Cancel Preview with zero writes, renders all-UNCHANGED state, and requires explicit inspection acknowledgment for UNRESOLVED_PREVIOUS_RUN', async () => {
    const user = userEvent.setup();
    let resolveDeferredPreview:
      ((val: Awaited<ReturnType<GasRpcTransport['previewDataset']>>) => void) | null = null;
    const baseMock = new MockGasTransport({ scenario: 'sandbox-writable' });

    const deferredPreviewTransport: GasRpcTransport = {
      mode: 'mock',
      getDashboardStatus: () => baseMock.getDashboardStatus(),
      previewDataset: () =>
        new Promise((resolve) => {
          resolveDeferredPreview = resolve;
        }),
      previewDatasetBatch: (req) => baseMock.previewDatasetBatch(req),
      finalizePreview: (req) => baseMock.finalizePreview(req),
      commitSmallDataset: (req) => baseMock.commitSmallDataset(req),
      stageLargeDatasetBatch: (req) => baseMock.stageLargeDatasetBatch(req),
      finalizeLargeDatasetCommit: (req) => baseMock.finalizeLargeDatasetCommit(req),
    };

    const cancelRender = renderApp(deferredPreviewTransport);
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));

    expect(await screen.findByRole('button', { name: /ยกเลิก Preview/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /ยกเลิก Preview/ }));
    expect(
      screen.getByText(/ยกเลิก Preview แล้ว — ไม่มีการเปลี่ยนแปลงใน Google Sheets/),
    ).toBeInTheDocument();

    // Even if the abandoned read-only RPC resolves later, canceled preview stays discarded
    const lateResult = await baseMock.previewDataset({
      endpoint: 'subdistricts',
      token: VALID_TOKEN,
    });
    resolveDeferredPreview!(lateResult);
    expect(
      screen.queryByRole('heading', { level: 2, name: /Preview Fingerprint/ }),
    ).not.toBeInTheDocument();
    cancelRender.unmount();

    // UNRESOLVED_PREVIOUS_RUN requires operator checkbox acknowledgment before Commit
    const basePreview = await baseMock.previewDataset({
      endpoint: 'subdistricts',
      token: VALID_TOKEN,
    });
    if (basePreview.status !== 'READY') throw new Error('expected READY');
    const unresolvedPreview = {
      ...basePreview,
      unresolvedPreviousRun: {
        endpoint: 'subdistricts' as const,
        runId: 'run_20261121_prev_stuck',
        startedAtUtc: '2026-11-21T12:00:00.000Z',
        status: 'STARTED' as const,
      },
    };
    const commitCalls: Array<{ acknowledgeUnresolvedRunId?: string }> = [];
    const unresolvedTransport: GasRpcTransport = {
      mode: 'mock',
      getDashboardStatus: () => baseMock.getDashboardStatus(),
      previewDataset: async () => unresolvedPreview,
      previewDatasetBatch: (req) => baseMock.previewDatasetBatch(req),
      finalizePreview: (req) => baseMock.finalizePreview(req),
      commitSmallDataset: async (req) => {
        commitCalls.push({ acknowledgeUnresolvedRunId: req.acknowledgeUnresolvedRunId });
        return baseMock.commitSmallDataset(req);
      },
      stageLargeDatasetBatch: (req) => baseMock.stageLargeDatasetBatch(req),
      finalizeLargeDatasetCommit: (req) => baseMock.finalizeLargeDatasetCommit(req),
    };

    renderApp(unresolvedTransport);
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));

    expect((await screen.findAllByText(/run_20261121_prev_stuck/)).length).toBeGreaterThanOrEqual(
      2,
    );
    const openConfirmBtn = screen.getByRole('button', {
      name: /ตรวจสอบและยืนยันการบันทึก \(SANDBOX\)/,
    });
    expect(openConfirmBtn).toBeDisabled();

    const ackCheckbox = screen.getByRole('checkbox');
    await user.click(ackCheckbox);
    expect(openConfirmBtn).toBeEnabled();

    await user.click(openConfirmBtn);
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /ยืนยันบันทึกข้อมูล/ }),
    );
    await screen.findByText(/ซิงก์และตรวจสอบ Destination Readback สำเร็จ/);
    expect(commitCalls).toEqual([{ acknowledgeUnresolvedRunId: 'run_20261121_prev_stuck' }]);
  });

  it('renders all-UNCHANGED state, clears stale Preview permanently on token wipe, and wipes token on Commit HTTP_401', async () => {
    const user = userEvent.setup();

    // 1. All-UNCHANGED preview + token clear must NOT resurrect Preview Fingerprint when a new token is pasted
    const unchangedTransport = new MockGasTransport({
      scenario: 'sandbox-writable',
      previewOutcome: 'all-unchanged',
    });
    const first = renderApp(unchangedTransport);
    await openSyncWorkspace(user);

    const tokenInput = screen.getByLabelText(/ThaiPHC Bearer Token/) as HTMLInputElement;
    await user.click(tokenInput);
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));

    expect(await screen.findByText(/ข้อมูลต้นทางตรงกับปลายทางทั้งหมด \(UNCHANGED\)/)).toBeInTheDocument();
    expect(screen.getByText('ThaiPHC Data (Sandbox Mock)')).toBeInTheDocument();

    // Clear token and paste again -> prior Preview Fingerprint & ConfirmationGate stay cleared
    await user.click(screen.getByRole('button', { name: /ล้าง Token/ }));
    expect(
      screen.queryByRole('heading', { level: 2, name: /Preview Fingerprint/ }),
    ).not.toBeInTheDocument();
    await user.paste(`${VALID_TOKEN}_new`);
    expect(
      screen.queryByRole('heading', { level: 2, name: /Preview Fingerprint/ }),
    ).not.toBeInTheDocument();
    first.unmount();

    // 2. Commit HTTP_401 wipes in-memory token, focuses input, and renders crimson alert
    const commitAuthFailTransport = new MockGasTransport({
      scenario: 'sandbox-writable',
      commitOutcome: 'http-401',
    });
    renderApp(commitAuthFailTransport);
    await openSyncWorkspace(user);
    const input2 = screen.getByLabelText(/ThaiPHC Bearer Token/) as HTMLInputElement;
    await user.click(input2);
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));
    await screen.findByRole('heading', { level: 2, name: /Preview Fingerprint/ });

    await user.click(screen.getByRole('button', { name: /ตรวจสอบและยืนยันการบันทึก \(SANDBOX\)/ }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /ยืนยันบันทึกข้อมูล/ }),
    );

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('heading', { name: /HTTP_401/ })).toBeInTheDocument();
    expect(input2.value).toBe('');
    expect(document.activeElement).toBe(input2);
  });

  it('switches Sync Workspace to Mode B Extended Report Preview for volunteer-gender with Minimized Projection banner, LEGACY_F010_SNAPSHOT_PRESENT notice, SMALL_CELL_SUPPRESSED review, report workbook display, and Keyed Upsert commit', async () => {
    const user = userEvent.setup();
    const transport = new MockGasTransport({ scenario: 'sandbox-report-writable' });

    renderApp(transport);
    await openSyncWorkspace(user);

    const tokenInput = screen.getByLabelText(/ThaiPHC Bearer Token/) as HTMLInputElement;
    await user.click(tokenInput);
    await user.paste(VALID_TOKEN);

    // Select volunteer-gender radio card
    const vgRadio = screen.getByRole('radio', { name: /สรุปเพศ อสม\. รายหมู่บ้าน/ });
    await user.click(vgRadio);
    expect(vgRadio).toBeChecked();

    const previewBtn = screen.getByRole('button', { name: /เริ่ม Preview/ });
    expect(previewBtn).toBeEnabled();
    await user.click(previewBtn);

    // Mode B privacy boundary banner, LEGACY_F010_SNAPSHOT_PRESENT notice, and SMALL_CELL_SUPPRESSED review explanation
    expect(
      await screen.findByText(/ขอบเขตคุ้มครองข้อมูลส่วนบุคคล \(Minimized Projection\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/LEGACY_F010_SNAPSHOT_PRESENT/)).toBeInTheDocument();
    expect(screen.getByText(/RGender_f010_20261119/)).toBeInTheDocument();
    expect(screen.getAllByText(/SMALL_CELL_SUPPRESSED/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Complementary Small-Cell Suppression/)).toBeInTheDocument();

    // Aggregate summary and strictly minimized/suppressed sample rows (with null for suppressed counts)
    expect(screen.getAllByText(/540601/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/540601001/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('null').length).toBeGreaterThanOrEqual(2);

    // Filter to REVIEW shows suppressed rows only
    const reviewFilter = screen.getByRole('button', { name: /REVIEW/ });
    await user.click(reviewFilter);
    expect(reviewFilter).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('540603001')).not.toBeInTheDocument();

    // Confirmation Gate shows the separate report workbook name (not reference workbook)
    expect(screen.getByText('ThaiPHC Extended Reports (Sandbox Mock)')).toBeInTheDocument();

    // Commit through SANDBOX AlertDialog -> COMMITTED_VERIFIED + Destination Readback
    await user.click(screen.getByRole('button', { name: /ตรวจสอบและยืนยันการบันทึก \(SANDBOX\)/ }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/VolunteerGender/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /ยืนยันบันทึกข้อมูล/ }));

    expect(await screen.findByText(/ซิงก์และตรวจสอบ Destination Readback สำเร็จ/)).toBeInTheDocument();
    expect(screen.getByText('VolunteerGender')).toBeInTheDocument();
  });

  it('locks volunteer-gender Commit when THAIPHC_PERSON_DATA_WRITE_ENABLED is OFF or same-workbook approval is missing, and enforces typed PRODUCTION phrase when approved', async () => {
    const user = userEvent.setup();

    // 1. THAIPHC_PERSON_DATA_WRITE_ENABLED OFF (sandbox-writable has writeEnabled=true, personDataWriteEnabled=false)
    const personOffRender = renderApp(new MockGasTransport({ scenario: 'sandbox-writable' }));
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('radio', { name: /สรุปเพศ อสม\. รายหมู่บ้าน/ }));
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));

    expect(await screen.findByText(/โหมดอ่านอย่างเดียว — ไม่สามารถ Commit ได้/)).toBeInTheDocument();
    expect(screen.getByText('THAIPHC_PERSON_DATA_WRITE_ENABLED')).toBeInTheDocument();
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    personOffRender.unmount();

    // 2. Same-workbook unapproved (writeEnabled=true, personDataWriteEnabled=true, reportWorkbookApproved=false)
    const sameUnapprovedRender = renderApp(
      new MockGasTransport({ scenario: 'same-workbook-unapproved-writable' }),
    );
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('radio', { name: /สรุปเพศ อสม\. รายหมู่บ้าน/ }));
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));

    expect(await screen.findByText(/โหมดอ่านอย่างเดียว — ไม่สามารถ Commit ได้/)).toBeInTheDocument();
    expect(screen.getByText('THAIPHC_SAME_WORKBOOK_APPROVAL')).toBeInTheDocument();
    expect(screen.getByText(/OWNER_ONLY_5406_APPROVED/)).toBeInTheDocument();
    sameUnapprovedRender.unmount();

    // 3. PRODUCTION report writable enforces exact typed phrase "PRODUCTION 5406 volunteer-gender"
    renderApp(new MockGasTransport({ scenario: 'production-report-writable' }));
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('radio', { name: /สรุปเพศ อสม\. รายหมู่บ้าน/ }));
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));

    await screen.findByText(/ขอบเขตคุ้มครองข้อมูลส่วนบุคคล \(Minimized Projection\)/);
    await user.click(screen.getByRole('button', { name: /ดำเนินการยืนยันการบันทึก \(PRODUCTION\)/ }));

    const prodDialog = screen.getByRole('alertdialog');
    const confirmAction = within(prodDialog).getByRole('button', {
      name: /ยืนยันบันทึกข้อมูลลง PRODUCTION/,
    });
    expect(confirmAction).toBeDisabled();

    const phraseInput = within(prodDialog).getByLabelText(/พิมพ์ข้อความด้านบนให้ตรงทุกตัวอักษร/);
    await user.type(phraseInput, 'PRODUCTION 5406 volunteer-gender');
    expect(confirmAction).toBeEnabled();
    await user.click(confirmAction);

    expect(await screen.findByText(/ซิงก์และตรวจสอบ Destination Readback สำเร็จ/)).toBeInTheDocument();
  });

  it('orchestrates sequential multi-batch assignments Preview with live role="status" progress, supports immediate Cancel Preview mid-batch with zero writes, renders LEGACY_F010_SNAPSHOT_PRESENT (RAssign_*) & minimized h1_ samples, and commits via hidden _Stage_* cleanup', async () => {
    const user = userEvent.setup();
    const baseMock = new MockGasTransport({ scenario: 'sandbox-assignments-legacy' });

    // 1. Mid-batch Cancel Preview: pause batch 1 -> resolve batch 1 (updating role="status" progress) -> pause batch 2 -> click Cancel Preview -> zero further calls and zero finalize/commit!
    let resolveBatch1:
      ((val: Awaited<ReturnType<GasRpcTransport['previewDatasetBatch']>>) => void) | null = null;
    let resolveBatch2:
      ((val: Awaited<ReturnType<GasRpcTransport['previewDatasetBatch']>>) => void) | null = null;
    const batchCalls: number[] = [];
    const finalizePreviewSpy = vi.fn(baseMock.finalizePreview.bind(baseMock));
    const stageSpy = vi.fn(baseMock.stageLargeDatasetBatch.bind(baseMock));

    const cancelBatchTransport: GasRpcTransport = {
      mode: 'mock',
      getDashboardStatus: () => baseMock.getDashboardStatus(),
      previewDataset: (req) => baseMock.previewDataset(req),
      previewDatasetBatch: (req) => {
        batchCalls.push(req.startPage);
        if (req.startPage === 1) {
          return new Promise((resolve) => {
            resolveBatch1 = resolve;
          });
        }
        return new Promise((resolve) => {
          resolveBatch2 = resolve;
        });
      },
      finalizePreview: finalizePreviewSpy,
      commitSmallDataset: (req) => baseMock.commitSmallDataset(req),
      stageLargeDatasetBatch: stageSpy,
      finalizeLargeDatasetCommit: (req) => baseMock.finalizeLargeDatasetCommit(req),
    };

    const cancelRender = renderApp(cancelBatchTransport);
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('radio', { name: /การมอบหมายงาน อสม\./ }));
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));

    await waitFor(() => expect(batchCalls).toEqual([1]));
    const realBatch1 = await baseMock.previewDatasetBatch({
      endpoint: 'assignments',
      token: VALID_TOKEN,
      startPage: 1,
      batchPages: 10,
      pageSize: 100,
    });
    await act(async () => {
      resolveBatch1!(realBatch1);
    });

    // Live contextual role="status" updates after batch 1 completes (pages 10 / 16 · 1,000 / 1,571 rows)
    expect(await screen.findByText(/หน้า 10 \/ 16 · ดึงแล้ว 1,000 \/ 1,571 แถว/)).toBeInTheDocument();
    await waitFor(() => expect(batchCalls).toEqual([1, 11]));

    // Click Cancel Preview mid-batch -> immediately cancels with zero finalize & zero Sheets writes
    await user.click(screen.getByRole('button', { name: /ยกเลิก Preview/ }));
    expect(
      screen.getByText(/ยกเลิก Preview แล้ว — ไม่มีการเปลี่ยนแปลงใน Google Sheets/),
    ).toBeInTheDocument();

    // Immediately restart Preview BEFORE cancelled batch 2 resolves -> stale batch 2 settlement must NOT clear the restarted preview's progress!
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));
    await waitFor(() => expect(batchCalls).toEqual([1, 11, 1]));

    const realBatch2 = await baseMock.previewDatasetBatch({
      endpoint: 'assignments',
      token: VALID_TOKEN,
      startPage: 11,
      batchPages: 10,
      pageSize: 100,
      expectedSourceTotal: 1571,
    });
    await act(async () => {
      resolveBatch2!(realBatch2);
    });
    expect(screen.getByText(/กำลังดึงข้อมูล assignments \(Batch ที่ 1\)/)).toBeInTheDocument();
    expect(finalizePreviewSpy).not.toHaveBeenCalled();
    expect(stageSpy).not.toHaveBeenCalled();

    // Unmounting SyncWorkspace mid-preview (e.g., navigating back to Dashboard) aborts further batch calls
    cancelRender.unmount();
    await act(async () => {
      resolveBatch1!(realBatch1);
    });
    expect(batchCalls).toEqual([1, 11, 1]);
    expect(finalizePreviewSpy).not.toHaveBeenCalled();

    // 2. Full end-to-end assignments batched preview -> LEGACY_F010_SNAPSHOT_PRESENT (RAssign_*) -> multi-batch _Stage_* commit -> COMMITTED_VERIFIED with _Stage_* cleaned checklist item
    const fullMock = new MockGasTransport({ scenario: 'sandbox-assignments-legacy' });
    const stageCallSpy = vi.spyOn(fullMock, 'stageLargeDatasetBatch');
    const finalizeCommitSpy = vi.spyOn(fullMock, 'finalizeLargeDatasetCommit');

    renderApp(fullMock);
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('radio', { name: /การมอบหมายงาน อสม\./ }));
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));

    expect(
      await screen.findByText(/ขอบเขตคุ้มครองข้อมูลส่วนบุคคล \(Minimized Projection\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/LEGACY_F010_SNAPSHOT_PRESENT/)).toBeInTheDocument();
    expect(screen.getByText(/RAssign_f010_20261119/)).toBeInTheDocument();
    // Strictly minimized h1_ pseudonym shown, zero raw PII
    expect(screen.getAllByText(/h1_/).length).toBeGreaterThanOrEqual(1);
    expect(document.body.textContent).not.toMatch(/citizenId|firstName|lastName|fullName|osmCode/);

    await user.click(screen.getByRole('button', { name: /ตรวจสอบและยืนยันการบันทึก \(SANDBOX\)/ }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /ยืนยันบันทึกข้อมูล/ }),
    );

    expect(await screen.findByText(/ซิงก์และตรวจสอบ Destination Readback สำเร็จ/)).toBeInTheDocument();
    expect(screen.getByText(/ลบแท็บพักชั่วคราว _Stage_\* หลังตรวจสอบผ่านเรียบร้อย/)).toBeInTheDocument();
    expect(stageCallSpy).toHaveBeenCalledTimes(2);
    expect(finalizeCommitSpy).toHaveBeenCalledTimes(1);
  });

  it('displays F010 THAIPHC_HMAC_KEY_B64 continuity reminder in PRODUCTION Confirmation Gate, handles UNRESOLVED_PREVIOUS_RUN recovery, PREVIEW_STALE_RECONFIRM_REQUIRED, and retains _Stage_* tab on UNKNOWN_OUTCOME_STOP', async () => {
    const user = userEvent.setup();

    // 1. PRODUCTION with UNRESOLVED_PREVIOUS_RUN on assignments -> F010 THAIPHC_HMAC_KEY_B64 continuity reminder + unresolved ack + typed phrase -> COMMITTED_VERIFIED
    const prodUnresolvedMock = new MockGasTransport({ scenario: 'production-unresolved' });
    const stageSpy = vi.spyOn(prodUnresolvedMock, 'stageLargeDatasetBatch');
    const first = renderApp(prodUnresolvedMock);

    // Navigate from Dashboard priority UNRESOLVED_PREVIOUS_RUN alert directly to assignments
    const dashAlert = await screen.findByRole('alert');
    await user.click(within(dashAlert).getByRole('button', { name: /เปิดชุดข้อมูลในพื้นที่ซิงก์/ }));
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));

    expect(
      await screen.findByText(/พบรอบซิงก์ก่อนหน้าค้างอยู่ \(UNRESOLVED_PREVIOUS_RUN\)/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/THAIPHC_HMAC_KEY_B64/).length).toBeGreaterThanOrEqual(1);

    const openProdBtn = screen.getByRole('button', {
      name: /ดำเนินการยืนยันการบันทึก \(PRODUCTION\)/,
    });
    expect(openProdBtn).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    expect(openProdBtn).toBeEnabled();

    await user.click(openProdBtn);
    const prodDialog = screen.getByRole('alertdialog');
    // Continuity reminder visible inside PRODUCTION dialog before typed confirmation
    expect(within(prodDialog).getByText(/THAIPHC_HMAC_KEY_B64/)).toBeInTheDocument();
    const confirmAction = within(prodDialog).getByRole('button', {
      name: /ยืนยันบันทึกข้อมูลลง PRODUCTION/,
    });
    expect(confirmAction).toBeDisabled();

    await user.type(
      within(prodDialog).getByLabelText(/พิมพ์ข้อความด้านบนให้ตรงทุกตัวอักษร/),
      'PRODUCTION 5406 assignments',
    );
    expect(confirmAction).toBeEnabled();
    await user.click(confirmAction);

    expect(await screen.findByText(/ซิงก์และตรวจสอบ Destination Readback สำเร็จ/)).toBeInTheDocument();
    expect(stageSpy.mock.calls[0][0].acknowledgeUnresolvedRunId).toBe(
      'run_20261121_0915_assign_7c9a2e',
    );
    first.unmount();

    // 2. PREVIEW_STALE_RECONFIRM_REQUIRED on assignments commit finalize
    const staleRender = renderApp(
      new MockGasTransport({
        scenario: 'sandbox-assignments-legacy',
        commitOutcome: 'preview-stale',
      }),
    );
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('radio', { name: /การมอบหมายงาน อสม\./ }));
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));
    await screen.findByRole('heading', { level: 2, name: /Preview Fingerprint/ });

    await user.click(screen.getByRole('button', { name: /ตรวจสอบและยืนยันการบันทึก \(SANDBOX\)/ }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /ยืนยันบันทึกข้อมูล/ }),
    );
    const staleAlert = await screen.findByRole('alert');
    expect(within(staleAlert).getByText(/PREVIEW_STALE_RECONFIRM_REQUIRED/)).toBeInTheDocument();
    staleRender.unmount();

    // 3. UNKNOWN_OUTCOME_STOP retains _Stage_assignments_* tab name in diagnostic panel with zero Retry Commit
    renderApp(
      new MockGasTransport({
        scenario: 'sandbox-assignments-legacy',
        commitOutcome: 'unknown-outcome',
      }),
    );
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('radio', { name: /การมอบหมายงาน อสม\./ }));
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));
    await screen.findByRole('heading', { level: 2, name: /Preview Fingerprint/ });

    await user.click(screen.getByRole('button', { name: /ตรวจสอบและยืนยันการบันทึก \(SANDBOX\)/ }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /ยืนยันบันทึกข้อมูล/ }),
    );
    const stopAlert = await screen.findByRole('alert');
    expect(within(stopAlert).getByText(/UNKNOWN_OUTCOME_STOP/)).toBeInTheDocument();
    expect(within(stopAlert).getByText(/_Stage_assignments_/)).toBeInTheDocument();
    expect(
      within(stopAlert).queryByRole('button', { name: /Retry|ลองเขียนซ้ำ/i }),
    ).not.toBeInTheDocument();
  });

  it('completes resigned-volunteers Mode B Preview with LOCALITY_MISMATCH REVIEW (Preserve Source Locality), LEGACY_F010_SNAPSHOT_PRESENT (RResign_*), zero PII, and multi-batch _Stage_* Keyed Upsert commit', async () => {
    const user = userEvent.setup();
    const mock = new MockGasTransport({ scenario: 'sandbox-report-legacy' });
    const stageSpy = vi.spyOn(mock, 'stageLargeDatasetBatch');
    const finalizeSpy = vi.spyOn(mock, 'finalizeLargeDatasetCommit');

    renderApp(mock);
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);

    const resignRadio = screen.getByRole('radio', { name: /อสม\. ที่ลาออก/ });
    await user.click(resignRadio);
    expect(resignRadio).toBeChecked();

    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));

    expect(
      await screen.findByText(/ขอบเขตคุ้มครองข้อมูลส่วนบุคคล \(Minimized Projection\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/LEGACY_F010_SNAPSHOT_PRESENT/)).toBeInTheDocument();
    expect(screen.getByText(/RResign_f010_20261119/)).toBeInTheDocument();
    expect(screen.getAllByText(/LOCALITY_MISMATCH/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/คงค่าต้นทางตามกฎ Preserve Source Locality/)).toBeInTheDocument();
    expect(screen.getAllByText(/h1_/).length).toBeGreaterThanOrEqual(1);
    expect(document.body.textContent).not.toMatch(/citizenId|firstName|lastName|osmCode/);

    // Filter to REVIEW shows preserved source locality codes (540210 / 540303004)
    const reviewFilter = screen.getByRole('button', { name: /REVIEW/ });
    await user.click(reviewFilter);
    expect(reviewFilter).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText(/540210/).length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole('button', { name: /ตรวจสอบและยืนยันการบันทึก \(SANDBOX\)/ }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /ยืนยันบันทึกข้อมูล/ }),
    );

    expect(await screen.findByText(/ซิงก์และตรวจสอบ Destination Readback สำเร็จ/)).toBeInTheDocument();
    expect(screen.getByText('ResignedVolunteers')).toBeInTheDocument();
    expect(screen.getByText(/ลบแท็บพักชั่วคราว _Stage_\* หลังตรวจสอบผ่านเรียบร้อย/)).toBeInTheDocument();
    expect(stageSpy).toHaveBeenCalledTimes(2);
    expect(finalizeSpy).toHaveBeenCalledTimes(1);
  });

  it('hard-blocks volunteer-tenure on OUT_OF_GEOGRAPHIC_SCOPE STOP/BLOCKED and completes READY Mode B Preview (RTenure_* legacy + nullable attributes) with PRODUCTION THAIPHC_HMAC_KEY_B64 reminder and typed confirmation', async () => {
    const user = userEvent.setup();

    // 1. Subdistrict/village mismatch on volunteer-tenure triggers hard STOP/BLOCKED and locks Confirmation Gate
    const blockedRender = renderApp(
      new MockGasTransport({
        scenario: 'sandbox-report-legacy',
        previewOutcome: 'stop-blocked',
      }),
    );
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('radio', { name: /อายุงาน อสม\./ }));
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));

    const stopAlert = await screen.findByRole('alert');
    expect(within(stopAlert).getByText(/OUT_OF_GEOGRAPHIC_SCOPE/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ยืนยันการบันทึกถูกปิดใช้งาน/ })).toBeDisabled();
    blockedRender.unmount();

    // 2. READY preview in SANDBOX legacy mode surfaces RTenure_* and nullable attributes
    const legacyRender = renderApp(new MockGasTransport({ scenario: 'sandbox-report-legacy' }));
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('radio', { name: /อายุงาน อสม\./ }));
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));

    expect(
      await screen.findByText(/ขอบเขตคุ้มครองข้อมูลส่วนบุคคล \(Minimized Projection\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/LEGACY_F010_SNAPSHOT_PRESENT/)).toBeInTheDocument();
    expect(screen.getByText(/RTenure_f010_20261119/)).toBeInTheDocument();
    expect(screen.getAllByText('null').length).toBeGreaterThanOrEqual(2);
    expect(document.body.textContent).not.toMatch(/citizenId|firstName|lastName|osmCode/);
    legacyRender.unmount();

    // 3. PRODUCTION report writable shows THAIPHC_HMAC_KEY_B64 continuity reminder and enforces exact phrase "PRODUCTION 5406 volunteer-tenure"
    renderApp(new MockGasTransport({ scenario: 'production-report-writable' }));
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('radio', { name: /อายุงาน อสม\./ }));
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));

    await screen.findByText(/ขอบเขตคุ้มครองข้อมูลส่วนบุคคล \(Minimized Projection\)/);
    expect(screen.getAllByText(/THAIPHC_HMAC_KEY_B64/).length).toBeGreaterThanOrEqual(1);
    await user.click(screen.getByRole('button', { name: /ดำเนินการยืนยันการบันทึก \(PRODUCTION\)/ }));

    const prodDialog = screen.getByRole('alertdialog');
    const confirmAction = within(prodDialog).getByRole('button', {
      name: /ยืนยันบันทึกข้อมูลลง PRODUCTION/,
    });
    expect(confirmAction).toBeDisabled();

    await user.type(
      within(prodDialog).getByLabelText(/พิมพ์ข้อความด้านบนให้ตรงทุกตัวอักษร/),
      'PRODUCTION 5406 volunteer-tenure',
    );
    expect(confirmAction).toBeEnabled();
    await user.click(confirmAction);

    expect(await screen.findByText(/ซิงก์และตรวจสอบ Destination Readback สำเร็จ/)).toBeInTheDocument();
    expect(screen.getByText('VolunteerTenure')).toBeInTheDocument();
  });

  it('completes volunteer-family Complete Snapshot Mode B Preview (Layers badge, active _ThaiPHCReportCurrent pointer, LOCALITY_MISMATCH review, zero PII), multi-batch RFamily_<runId> publication with pointer readback, and displays active pointer on Dashboard', async () => {
    const user = userEvent.setup();
    const mock = new MockGasTransport({ scenario: 'sandbox-report-writable' });
    const stageSpy = vi.spyOn(mock, 'stageLargeDatasetBatch');
    const finalizeSpy = vi.spyOn(mock, 'finalizeLargeDatasetCommit');

    renderApp(mock);
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);

    const familyRadio = screen.getByRole('radio', { name: /ความสัมพันธ์ครอบครัว อสม\./ });
    await user.click(familyRadio);
    expect(familyRadio).toBeChecked();

    const previewBtn = screen.getByRole('button', { name: /เริ่ม Preview/ });
    expect(previewBtn).toBeEnabled();
    await user.click(previewBtn);

    // Mode B Minimized Projection banner + distinct Complete Snapshot (Layers) messaging + active pointer tab + LOCALITY_MISMATCH
    expect(
      await screen.findByText(/ขอบเขตคุ้มครองข้อมูลส่วนบุคคล \(Minimized Projection\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/โหมด Complete Snapshot — สร้างแท็บเวอร์ชันใหม่ \(RFamily_<runId>\)/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/RFamily_20261121_1030/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Complete Snapshot/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/LOCALITY_MISMATCH/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/คงค่าต้นทางตามกฎ Preserve Source Locality/)).toBeInTheDocument();
    expect(screen.getAllByText(/snapshot_preview_00001/).length).toBeGreaterThanOrEqual(1);
    expect(document.body.textContent).not.toMatch(
      /citizenId|prefixName|firstName|lastName|fullName|address|volunteerId|volunteerName|osmCode/,
    );

    // Filter to REVIEW shows LOCALITY_MISMATCH preserved rows
    const reviewFilter = screen.getByRole('button', { name: /REVIEW/ });
    await user.click(reviewFilter);
    expect(reviewFilter).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText(/540210/).length).toBeGreaterThanOrEqual(1);

    // SANDBOX Confirmation Gate -> AlertDialog -> Multi-batch RFamily_<runId> staging + Complete Snapshot publication
    await user.click(screen.getByRole('button', { name: /ตรวจสอบและยืนยันการบันทึก \(SANDBOX\)/ }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/COMPLETE_SNAPSHOT/)).toBeInTheDocument();
    expect(within(dialog).getByText(/_ThaiPHCReportCurrent/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /ยืนยันบันทึกข้อมูล/ }));

    expect(await screen.findByText(/ซิงก์และตรวจสอบ Destination Readback สำเร็จ/)).toBeInTheDocument();
    expect(
      screen.getAllByText(/RFamily_run_20261121_1606_family_s1/).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/อัปเดตตัวชี้เผยแพร่ _ThaiPHCReportCurrent ชี้ไปยัง/)).toBeInTheDocument();
    expect(screen.getByText(/แท็บ RFamily_\* เวอร์ชันเดิม และแท็บ/)).toBeInTheDocument();
    expect(stageSpy).toHaveBeenCalledTimes(2);
    expect(finalizeSpy).toHaveBeenCalledTimes(1);

    // Return to Dashboard -> displays active RFamily_* pointer tab with _ThaiPHCReportCurrent caption, row count, and status
    await user.click(screen.getByRole('button', { name: /กลับหน้า Dashboard/ }));
    const extSection = await screen.findByRole('region', { name: /ชุดข้อมูลรายงานขยาย/ });
    expect(within(extSection).getAllByText('RFamily_20261121_1030').length).toBeGreaterThanOrEqual(
      1,
    );
    expect(within(extSection).getAllByText('_ThaiPHCReportCurrent').length).toBeGreaterThanOrEqual(
      1,
    );
    expect(within(extSection).getAllByText('1,823').length).toBeGreaterThanOrEqual(1);
  });

  it('handles volunteer-family pointer-drift PREVIEW_STALE_RECONFIRM_REQUIRED, STAGING_DIGEST_MISMATCH, INCOMPLETE_SNAPSHOT, Write Guard locks, and PRODUCTION typed confirmation without HMAC reminder', async () => {
    const user = userEvent.setup();

    // 1. Pointer-drift PREVIEW_STALE_RECONFIRM_REQUIRED -> offers fresh Preview button, zero Retry Commit
    const staleRender = renderApp(
      new MockGasTransport({
        scenario: 'sandbox-report-writable',
        commitOutcome: 'preview-stale',
      }),
    );
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('radio', { name: /ความสัมพันธ์ครอบครัว อสม\./ }));
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));
    await screen.findByText(/โหมด Complete Snapshot/);

    await user.click(screen.getByRole('button', { name: /ตรวจสอบและยืนยันการบันทึก \(SANDBOX\)/ }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /ยืนยันบันทึกข้อมูล/ }),
    );
    const staleAlert = await screen.findByRole('alert');
    expect(within(staleAlert).getByText(/PREVIEW_STALE_RECONFIRM_REQUIRED/)).toBeInTheDocument();
    expect(within(staleAlert).getAllByText(/_ThaiPHCReportCurrent/).length).toBeGreaterThanOrEqual(
      1,
    );
    expect(
      within(staleAlert).queryByRole('button', { name: /Retry|ลองเขียนซ้ำ/i }),
    ).not.toBeInTheDocument();
    staleRender.unmount();

    // 1b. Write Guard locks for volunteer-family (THAIPHC_PERSON_DATA_WRITE_ENABLED OFF & unapproved same-workbook)
    const personOffRender = renderApp(new MockGasTransport({ scenario: 'sandbox-writable' }));
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('radio', { name: /ความสัมพันธ์ครอบครัว อสม\./ }));
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));
    expect(await screen.findByText(/โหมดอ่านอย่างเดียว — ไม่สามารถ Commit ได้/)).toBeInTheDocument();
    expect(screen.getByText('THAIPHC_PERSON_DATA_WRITE_ENABLED')).toBeInTheDocument();
    personOffRender.unmount();

    const sameUnapprovedRender = renderApp(
      new MockGasTransport({ scenario: 'same-workbook-unapproved-writable' }),
    );
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('radio', { name: /ความสัมพันธ์ครอบครัว อสม\./ }));
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));
    expect(await screen.findByText(/โหมดอ่านอย่างเดียว — ไม่สามารถ Commit ได้/)).toBeInTheDocument();
    expect(screen.getByText('THAIPHC_SAME_WORKBOOK_APPROVAL')).toBeInTheDocument();
    expect(screen.getByText(/OWNER_ONLY_5406_APPROVED/)).toBeInTheDocument();
    sameUnapprovedRender.unmount();

    // 2. Digest mismatch stop (STAGING_DIGEST_MISMATCH) retains hidden RFamily_<runId> with zero Retry Commit
    const digestRender = renderApp(
      new MockGasTransport({
        scenario: 'sandbox-report-writable',
        commitOutcome: 'digest-mismatch',
      }),
    );
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('radio', { name: /ความสัมพันธ์ครอบครัว อสม\./ }));
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));
    await screen.findByText(/โหมด Complete Snapshot/);

    await user.click(screen.getByRole('button', { name: /ตรวจสอบและยืนยันการบันทึก \(SANDBOX\)/ }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /ยืนยันบันทึกข้อมูล/ }),
    );
    const digestAlert = await screen.findByRole('alert');
    expect(
      within(digestAlert).getAllByText(/STAGING_DIGEST_MISMATCH/).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      within(digestAlert).getAllByText(/RFamily_run_20261121_1606_family_s1/).length,
    ).toBeGreaterThanOrEqual(1);
    expect(within(digestAlert).getByText(/ยังไม่เผยแพร่/)).toBeInTheDocument();
    expect(within(digestAlert).getAllByText(/_ThaiPHCReportCurrent/).length).toBeGreaterThanOrEqual(
      1,
    );
    expect(digestAlert.textContent).not.toContain('_Stage_*');
    expect(
      within(digestAlert).queryByRole('button', { name: /Retry|ลองเขียนซ้ำ/i }),
    ).not.toBeInTheDocument();
    digestRender.unmount();

    // 2b. Post-start UNKNOWN_OUTCOME_STOP (syncLogStatus = STARTED) does NOT falsely claim tab is hidden/unpublished and guides inspecting RFamily_<runId>, _ThaiPHCReportCurrent, and _ThaiPHCSyncLog
    const unknownFamilyRender = renderApp(
      new MockGasTransport({
        scenario: 'sandbox-report-writable',
        commitOutcome: 'unknown-outcome',
      }),
    );
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('radio', { name: /ความสัมพันธ์ครอบครัว อสม\./ }));
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));
    await screen.findByText(/โหมด Complete Snapshot/);

    await user.click(screen.getByRole('button', { name: /ตรวจสอบและยืนยันการบันทึก \(SANDBOX\)/ }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /ยืนยันบันทึกข้อมูล/ }),
    );
    const unknownFamilyAlert = await screen.findByRole('alert');
    expect(within(unknownFamilyAlert).getByText(/UNKNOWN_OUTCOME_STOP/)).toBeInTheDocument();
    expect(within(unknownFamilyAlert).getByText(/STARTED/)).toBeInTheDocument();
    expect(unknownFamilyAlert.textContent).not.toContain('ยังไม่เผยแพร่');
    expect(unknownFamilyAlert.textContent).not.toContain('_Stage_*');
    expect(
      within(unknownFamilyAlert).getAllByText(/_ThaiPHCReportCurrent/).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      within(unknownFamilyAlert).getAllByText(/_ThaiPHCSyncLog/).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      within(unknownFamilyAlert).queryByRole('button', { name: /Retry|ลองเขียนซ้ำ/i }),
    ).not.toBeInTheDocument();
    unknownFamilyRender.unmount();

    // 3. Incomplete-stage refusal (INCOMPLETE_SNAPSHOT) retains hidden RFamily_<runId>
    const incompleteRender = renderApp(
      new MockGasTransport({
        scenario: 'sandbox-report-writable',
        commitOutcome: 'incomplete-stage',
      }),
    );
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('radio', { name: /ความสัมพันธ์ครอบครัว อสม\./ }));
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));
    await screen.findByText(/โหมด Complete Snapshot/);

    await user.click(screen.getByRole('button', { name: /ตรวจสอบและยืนยันการบันทึก \(SANDBOX\)/ }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /ยืนยันบันทึกข้อมูล/ }),
    );
    const incAlert = await screen.findByRole('alert');
    expect(within(incAlert).getAllByText(/INCOMPLETE_SNAPSHOT/).length).toBeGreaterThanOrEqual(1);
    incompleteRender.unmount();

    // 4. PRODUCTION typed confirmation ("PRODUCTION 5406 volunteer-family") with NO HMAC continuity reminder
    renderApp(new MockGasTransport({ scenario: 'production-report-writable' }));
    await openSyncWorkspace(user);
    await user.click(screen.getByLabelText(/ThaiPHC Bearer Token/));
    await user.paste(VALID_TOKEN);
    await user.click(screen.getByRole('radio', { name: /ความสัมพันธ์ครอบครัว อสม\./ }));
    await user.click(screen.getByRole('button', { name: /เริ่ม Preview/ }));
    await screen.findByText(/โหมด Complete Snapshot/);

    // volunteer-family uses run-scoped ordinal keys, NOT HMAC h1_ keys -> no HMAC reminder box
    expect(screen.queryByText(/การตรวจสอบความต่อเนื่องของคีย์ F010/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /ดำเนินการยืนยันการบันทึก \(PRODUCTION\)/ }));
    const prodDialog = screen.getByRole('alertdialog');
    const confirmAction = within(prodDialog).getByRole('button', {
      name: /ยืนยันบันทึกข้อมูลลง PRODUCTION/,
    });
    expect(confirmAction).toBeDisabled();

    await user.type(
      within(prodDialog).getByLabelText(/พิมพ์ข้อความด้านบนให้ตรงทุกตัวอักษร/),
      'PRODUCTION 5406 volunteer-family',
    );
    expect(confirmAction).toBeEnabled();
    await user.click(confirmAction);

    expect(await screen.findByText(/ซิงก์และตรวจสอบ Destination Readback สำเร็จ/)).toBeInTheDocument();
  });
});
