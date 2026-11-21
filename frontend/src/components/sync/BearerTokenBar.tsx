import {
  CheckCircle2,
  ClockAlert,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Lock,
  OctagonAlert,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { TokenSession } from '@/hooks/useTokenSession';

interface BearerTokenBarProps {
  session: TokenSession;
  disabled?: boolean;
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function BearerTokenBar({ session, disabled = false }: BearerTokenBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hasToken = session.token.length > 0;
  const hasError = session.validationError !== null;
  const describedBy = hasError ? 'token-help token-error' : 'token-help';

  useEffect(() => {
    if (session.focusSignal > 0) {
      inputRef.current?.focus();
    }
  }, [session.focusSignal]);

  return (
    <section
      aria-label="แถบจัดการรหัสผ่านชั่วคราวสำหรับเซสชัน"
      className="lg:sticky lg:top-[var(--header-height)] lg:z-20 rounded-lg border border-border bg-card p-3.5 sm:p-4 shadow-[var(--shadow-sm)] space-y-2.5"
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
        <div className="flex-1 min-w-0">
          <Label
            htmlFor="thaiphc-bearer-token"
            className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground"
          >
            <KeyRound
              className="size-4 shrink-0 text-primary"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span>ThaiPHC Bearer Token (เก็บในหน่วยความจำแท็บนี้เท่านั้น)</span>
          </Label>
          <div className="relative">
            <Input
              ref={inputRef}
              id="thaiphc-bearer-token"
              type={session.isRevealed ? 'text' : 'password'}
              value={session.token}
              disabled={disabled}
              onChange={(e) => session.setToken(e.target.value)}
              onBlur={() => {
                if (session.token.length > 0) {
                  session.validateNow();
                }
              }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="วางเฉพาะค่า Token (ไม่ต้องใส่คำว่า Bearer)"
              aria-invalid={hasError}
              aria-describedby={describedBy}
              className="pr-11 font-mono text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-pressed={session.isRevealed}
              aria-label={session.isRevealed ? 'ซ่อน Bearer Token' : 'แสดง Bearer Token ชั่วคราว'}
              onClick={session.toggleRevealed}
              className="absolute top-1/2 right-1 -translate-y-1/2 min-w-9 min-h-9 text-muted-foreground hover:text-foreground"
            >
              {session.isRevealed ? (
                <EyeOff className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Eye className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={disabled || !hasToken}
          onClick={() => session.clearToken('manual')}
          className="shrink-0 min-h-11 sm:min-h-10 border-input text-foreground hover:bg-status-stop-bg hover:text-status-stop-fg hover:border-status-stop-border"
        >
          <Trash2 className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>ล้าง Token</span>
        </Button>
      </div>

      {hasError && (
        <p id="token-error" className="text-xs font-medium text-status-stop-fg">
          {session.validationError}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p id="token-help" className="flex items-center gap-1.5 text-muted-foreground">
          <Lock className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>
            ไม่บันทึกลงเบราว์เซอร์ (localStorage / sessionStorage / cookie) · ใช้ซ้ำได้หลาย API
            ระหว่างที่เปิดแท็บนี้
          </span>
        </p>

        <div className="whitespace-nowrap font-mono tabular-nums">
          {!hasToken ? (
            <Badge variant="neutral">
              <Info className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>ยังไม่ได้ระบุ Token</span>
            </Badge>
          ) : session.isValid ? (
            <Badge variant="primarySoft">
              <CheckCircle2 className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>
                พร้อมใช้งาน · ล้างอัตโนมัติเมื่อไม่ใช้งาน 15 นาที (เหลือ {formatCountdown(session.remainingMs)})
              </span>
            </Badge>
          ) : (
            <Badge variant="stop">
              <OctagonAlert className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>รูปแบบ Token ไม่ถูกต้อง</span>
            </Badge>
          )}
        </div>
      </div>

      {/* Screen-reader live region announces only discrete token lifecycle transitions */}
      <div role="status" aria-atomic="true" className="sr-only">
        {session.statusAnnouncement}
      </div>

      {session.clearReason === 'idle' && (
        <div className="flex items-center gap-2 rounded-md border border-status-stale-border bg-status-stale-bg px-3 py-2 text-xs font-medium text-status-stale-fg">
          <ClockAlert className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>ล้าง Token อัตโนมัติหลังไม่ใช้งานครบ 15 นาที — กรุณาวาง Token ใหม่หากต้องการดำเนินการต่อ</span>
        </div>
      )}

      {session.clearReason === 'http_401' && (
        <Alert variant="stop" role="alert" className="py-3">
          <div className="flex items-start gap-2.5">
            <OctagonAlert
              className="mt-0.5 size-4 shrink-0"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <div className="space-y-1">
              <AlertTitle className="text-sm">การยืนยันตัวตนไม่ผ่าน (HTTP_401)</AlertTitle>
              <AlertDescription className="mt-0.5 text-xs text-foreground">
                การยืนยันตัวตนไม่ผ่าน (HTTP_401) — ระบบล้าง Token ออกจากหน่วยความจำแล้ว กรุณาวาง Token ใหม่
              </AlertDescription>
            </div>
          </div>
        </Alert>
      )}
    </section>
  );
}
