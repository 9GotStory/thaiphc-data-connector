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
      commitSmallDataset: (req) => baseMock.commitSmallDataset(req),
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
      commitSmallDataset: async (req) => {
        commitCalls.push({ acknowledgeUnresolvedRunId: req.acknowledgeUnresolvedRunId });
        return baseMock.commitSmallDataset(req);
      },
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
});
