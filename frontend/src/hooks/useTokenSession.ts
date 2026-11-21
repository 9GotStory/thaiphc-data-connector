import { useCallback, useEffect, useRef, useState } from 'react';

export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const LOW_WARNING_MS = 2 * 60 * 1000;
const TOKEN_CHAR_PATTERN = /^[A-Za-z0-9._~+/-]+={0,}$/;

export type TokenClearReason = 'manual' | 'idle' | 'http_401' | null;

export function validateBearerTokenFormat(raw: string): string | null {
  if (raw.length === 0) {
    return 'กรุณาวาง ThaiPHC Bearer Token ก่อนเริ่ม Preview';
  }
  if (/^\s*bearer\b/i.test(raw)) {
    return "กรุณาวางเฉพาะค่า Token โดยไม่ต้องใส่คำนำหน้า 'Bearer '";
  }
  if (raw.length < 16 || raw.length > 8192 || !TOKEN_CHAR_PATTERN.test(raw)) {
    return 'รูปแบบ Token ไม่ถูกต้อง (พบช่องว่างหรืออักขระที่ไม่รองรับ)';
  }
  return null;
}

export interface TokenSession {
  token: string;
  tokenRevision: number;
  isRevealed: boolean;
  validationError: string | null;
  clearReason: TokenClearReason;
  statusAnnouncement: string;
  remainingMs: number;
  isValid: boolean;
  focusSignal: number;
  setToken: (value: string) => void;
  toggleRevealed: () => void;
  validateNow: () => string | null;
  clearToken: (reason: Exclude<TokenClearReason, null>) => void;
  touchActivity: () => void;
}

/**
 * Holds ThaiPHC Bearer Token strictly in React component memory.
 * Zero localStorage, sessionStorage, cookies, URL params, or console logs.
 */
export function useTokenSession(isBusyLockingClear: boolean): TokenSession {
  const [token, setTokenState] = useState('');
  const [tokenRevision, setTokenRevision] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [clearReason, setClearReason] = useState<TokenClearReason>(null);
  const [statusAnnouncement, setStatusAnnouncement] = useState('');
  const [remainingMs, setRemainingMs] = useState(IDLE_TIMEOUT_MS);
  const [focusSignal, setFocusSignal] = useState(0);

  const lastActivityRef = useRef<number>(0);
  const lowWarnedRef = useRef<boolean>(false);
  const busyRef = useRef<boolean>(isBusyLockingClear);

  useEffect(() => {
    busyRef.current = isBusyLockingClear;
  }, [isBusyLockingClear]);

  const clearToken = useCallback((reason: Exclude<TokenClearReason, null>) => {
    setTokenState('');
    setTokenRevision((prev) => prev + 1);
    setIsRevealed(false);
    setValidationError(null);
    setClearReason(reason);
    setRemainingMs(IDLE_TIMEOUT_MS);
    lowWarnedRef.current = false;

    if (reason === 'manual') {
      setStatusAnnouncement('ล้าง Bearer Token ออกจากหน่วยความจำแล้ว');
    } else if (reason === 'idle') {
      setStatusAnnouncement('ล้าง Token อัตโนมัติหลังไม่ใช้งานครบ 15 นาที');
    } else if (reason === 'http_401') {
      setStatusAnnouncement(
        'การยืนยันตัวตนไม่ผ่าน (HTTP_401) — ระบบล้าง Token ออกจากหน่วยความจำแล้ว กรุณาวาง Token ใหม่',
      );
    }

    setFocusSignal((prev) => prev + 1);
  }, []);

  const touchActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    lowWarnedRef.current = false;
    setRemainingMs(IDLE_TIMEOUT_MS);
  }, []);

  const setToken = useCallback((value: string) => {
    setTokenState(value);
    setTokenRevision((prev) => prev + 1);
    setClearReason(null);
    lastActivityRef.current = Date.now();
    lowWarnedRef.current = false;
    setRemainingMs(IDLE_TIMEOUT_MS);

    if (value.length === 0) {
      setValidationError(null);
      setStatusAnnouncement('');
      return;
    }

    const err = validateBearerTokenFormat(value);
    if (err === null) {
      setValidationError(null);
      setStatusAnnouncement('Bearer Token พร้อมใช้งานในหน่วยความจำแท็บนี้');
    } else {
      setValidationError((prev) => (prev ? err : null));
    }
  }, []);

  const validateNow = useCallback((): string | null => {
    const err = validateBearerTokenFormat(token);
    setValidationError(err);
    return err;
  }, [token]);

  const toggleRevealed = useCallback(() => {
    setIsRevealed((prev) => !prev);
    touchActivity();
  }, [touchActivity]);

  // Track idle timeout across the active browser tab session while a token is held in memory
  useEffect(() => {
    if (token.length === 0) {
      return;
    }

    lastActivityRef.current = Date.now();

    function handleActivity() {
      lastActivityRef.current = Date.now();
      lowWarnedRef.current = false;
    }

    window.addEventListener('pointerdown', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });

    const intervalId = window.setInterval(() => {
      if (busyRef.current) {
        return;
      }
      const elapsed = Date.now() - lastActivityRef.current;
      const nextRemaining = Math.max(0, IDLE_TIMEOUT_MS - elapsed);
      setRemainingMs(nextRemaining);

      if (nextRemaining === 0) {
        clearToken('idle');
      } else if (nextRemaining <= LOW_WARNING_MS && !lowWarnedRef.current) {
        lowWarnedRef.current = true;
        setStatusAnnouncement('เหลือเวลาไม่ถึง 2 นาทีก่อนล้าง Bearer Token อัตโนมัติ');
      }
    }, 1000);

    return () => {
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.clearInterval(intervalId);
    };
  }, [token, clearToken]);

  const isValid = token.length > 0 && validateBearerTokenFormat(token) === null;

  return {
    token,
    tokenRevision,
    isRevealed,
    validationError,
    clearReason,
    statusAnnouncement,
    remainingMs,
    isValid,
    focusSignal,
    setToken,
    toggleRevealed,
    validateNow,
    clearToken,
    touchActivity,
  };
}
