'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, errorBody, errorMessage } from '../../lib/api/browser';
import type { SessionSummary } from '../../lib/api/auth-types';
import { useOptionalSession } from '../providers/SessionProvider';
import { securityPasswordRules, allRulesMet, rulesMetSummary } from '../../lib/account-validation';
import { Icon } from '../ui/Icon';
import styles from './account.module.css';

/**
 * The Password & security screen (Stage 3 "My account" security board), live (F06):
 * - the sign-in email comes from the session principal; the API has no verification flag,
 *   so no "Verified" claim is made;
 * - change password: `POST /auth/password` (current + new); the backend revokes every other
 *   session, and only its answer is reported;
 * - signed-in devices: `GET /auth/sessions`; other devices are signed out one by one with
 *   `DELETE /auth/sessions/{id}`; this device signs out through the session endpoint.
 */

type Device = SessionSummary;

/** "Chrome on Windows" from the stored User-Agent label; the raw text is never needed. */
export function deviceName(label: string | null): string {
  if (label === null || label === '' || label === 'node') return 'Browser not recorded';
  const browser = /Edg\//.test(label)
    ? 'Edge'
    : /OPR\//.test(label)
      ? 'Opera'
      : /Firefox\//.test(label)
        ? 'Firefox'
        : /Chrome\//.test(label)
          ? 'Chrome'
          : /Safari\//.test(label)
            ? 'Safari'
            : 'Browser';
  const system = /iPhone|iPad/.test(label)
    ? 'iOS'
    : /Android/.test(label)
      ? 'Android'
      : /Windows/.test(label)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(label)
          ? 'macOS'
          : /Linux/.test(label)
            ? 'Linux'
            : null;
  return system === null ? browser : `${browser} on ${system}`;
}

const deviceMeta = (device: Device): string =>
  `Signed in ${new Date(device.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · last active ${new Date(device.lastUsedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;

export function AccountSecurity() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [shown, setShown] = useState({ current: false, next: false });
  const [errors, setErrors] = useState<{
    current?: string | undefined;
    next?: string | undefined;
    confirm?: string | undefined;
  }>({});
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [deviceDialog, setDeviceDialog] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<'password' | 'devices' | null>(null);
  const inFlight = useRef(false);
  const session = useOptionalSession();
  const email = session?.principal?.user.email ?? '';

  const loadDevices = useCallback(async () => {
    setDevicesError(null);
    try {
      const { sessions } = await api.get<{ sessions: Device[] }>('auth/sessions');
      setDevices(sessions);
    } catch (error) {
      setDevicesError(errorMessage(error, 'We couldn’t load your signed-in devices.'));
    }
  }, []);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    if (toast === null) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const rules = securityPasswordRules(next, current);

  const changePassword = async (): Promise<void> => {
    if (inFlight.current) return;
    const nextErrors: typeof errors = {};
    if (current === '') nextErrors.current = 'Enter your current password';
    if (next === '') nextErrors.next = 'Enter a new password';
    else if (!allRulesMet(rules)) {
      nextErrors.next = 'Your new password doesn’t meet the rules above yet';
    }
    if (confirm === '') nextErrors.confirm = 'Enter your new password again';
    else if (confirm !== next) nextErrors.confirm = 'The passwords don’t match';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setToast(null);
      return;
    }
    inFlight.current = true;
    setBusy('password');
    try {
      await api.post('auth/password', { currentPassword: current, newPassword: next });
      setResult({
        tone: 'ok',
        text: 'Your password was changed. Every other device was signed out.',
      });
      setToast('Password changed');
      setCurrent('');
      setNext('');
      setConfirm('');
      setErrors({});
      setShown({ current: false, next: false });
      void loadDevices();
    } catch (error) {
      const body = errorBody(error);
      if (body?.code === 'INVALID_CREDENTIALS' || body?.code === 'UNAUTHENTICATED') {
        setErrors({ current: 'That isn’t your current password' });
      } else {
        setResult({
          tone: 'error',
          text: `${errorMessage(error, 'Your password wasn’t changed.')} Your password is unchanged.`,
        });
      }
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const otherDevices = (devices ?? []).filter((device) => !device.current);

  const signOutOthers = async (): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy('devices');
    let failed = 0;
    for (const device of otherDevices) {
      try {
        await api.delete(`auth/sessions/${device.id}`);
      } catch {
        failed += 1;
      }
    }
    inFlight.current = false;
    setBusy(null);
    setDeviceDialog(false);
    setToast(
      failed === 0
        ? `Signed out ${otherDevices.length} other ${otherDevices.length === 1 ? 'device' : 'devices'}`
        : `${failed} ${failed === 1 ? 'device' : 'devices'} couldn’t be signed out. Please try again.`,
    );
    void loadDevices();
  };

  return (
    <section className={styles.section}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h1 id="acc-h1" className={styles.headline} data-intro data-split="words">
          Password &amp; security
        </h1>
        <p className={styles.headlineBody}>
          Keep your account safe and see where you’re signed in.
        </p>
      </div>

      {/* Email verification */}
      <div className={`${styles.card} ${styles.securityRowCard}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Sign-in email</h2>
          <span
            style={{ fontSize: 14, color: 'var(--hw-text-secondary)', overflowWrap: 'anywhere' }}
          >
            {email}
          </span>
        </div>
      </div>

      {/* Change password */}
      <form
        className={styles.securityForm}
        aria-labelledby="pw-h2"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void changePassword();
        }}
      >
        <h2 id="pw-h2" className={styles.securityHeading}>
          Change password
        </h2>

        {result !== null ? (
          <div role={result.tone === 'error' ? 'alert' : 'status'} className={styles.sampleStatus}>
            <Icon
              name={result.tone === 'error' ? 'alert' : 'done'}
              size={18}
              strokeWidth={2}
              stroke={result.tone === 'error' ? '#a1362b' : '#2f6b45'}
            />
            <span>{result.text}</span>
          </div>
        ) : null}

        <div className={styles.formColumn}>
          <label className={styles.fieldLabel} htmlFor="pw-cur">
            Current password
          </label>
          <div className={styles.passwordWrap}>
            <input
              id="pw-cur"
              type={shown.current ? 'text' : 'password'}
              autoComplete="current-password"
              className={`${styles.textField} ${styles.passwordField} ${errors.current !== undefined ? styles.fieldInvalid : ''}`}
              value={current}
              aria-invalid={errors.current !== undefined}
              aria-describedby={errors.current !== undefined ? 'pw-cur-err' : undefined}
              onChange={(event) => {
                setErrors((prev) => ({ ...prev, current: undefined }));
                setResult(null);
                setCurrent(event.target.value);
              }}
            />
            <button
              type="button"
              className={styles.showToggle}
              aria-pressed={shown.current}
              onClick={() => setShown((prev) => ({ ...prev, current: !prev.current }))}
            >
              {shown.current ? 'Hide' : 'Show'}
            </button>
          </div>
          {errors.current !== undefined ? (
            <span id="pw-cur-err" className={styles.fieldError}>
              <Icon name="alert" size={14} strokeWidth={2.4} stroke="#a1362b" />
              {errors.current}
            </span>
          ) : null}
          <Link href="/account/sign-in" className={styles.inlineLink}>
            Forgotten your password?
          </Link>
        </div>

        <div className={styles.formTwoCol}>
          <div className={styles.formColumn}>
            <label className={styles.fieldLabel} htmlFor="pw-new">
              New password
            </label>
            <div className={styles.passwordWrap}>
              <input
                id="pw-new"
                type={shown.next ? 'text' : 'password'}
                autoComplete="new-password"
                className={`${styles.textField} ${styles.passwordField} ${errors.next !== undefined ? styles.fieldInvalid : ''}`}
                value={next}
                aria-invalid={errors.next !== undefined}
                aria-describedby="pw-rules"
                onChange={(event) => {
                  setErrors((prev) => ({ ...prev, next: undefined }));
                  setResult(null);
                  setNext(event.target.value);
                }}
              />
              <button
                type="button"
                className={styles.showToggle}
                aria-pressed={shown.next}
                aria-controls="pw-new"
                onClick={() => setShown((prev) => ({ ...prev, next: !prev.next }))}
              >
                {shown.next ? 'Hide' : 'Show'}
              </button>
            </div>
            <ul id="pw-rules" aria-label="Password rules" className={styles.rulesList}>
              {rules.map((rule) => (
                <li key={rule.label} className={rule.ok ? styles.ruleOk : styles.ruleTodo}>
                  <Icon name={rule.ok ? 'done' : 'alert'} size={14} strokeWidth={2.6} />
                  {rule.label}
                  <span className="hw-visually-hidden">
                    {rule.ok ? ' (met)' : ' (not met yet)'}
                  </span>
                </li>
              ))}
              <li className="hw-visually-hidden" aria-live="polite">
                {rulesMetSummary(rules)}
              </li>
            </ul>
          </div>
          <div className={styles.formColumn}>
            <label className={styles.fieldLabel} htmlFor="pw-conf">
              Confirm new password
            </label>
            <input
              id="pw-conf"
              type={shown.next ? 'text' : 'password'}
              autoComplete="new-password"
              className={`${styles.textField} ${errors.confirm !== undefined ? styles.fieldInvalid : ''}`}
              value={confirm}
              aria-invalid={errors.confirm !== undefined}
              aria-describedby={errors.confirm !== undefined ? 'pw-conf-err' : undefined}
              onChange={(event) => {
                setErrors((prev) => ({ ...prev, confirm: undefined }));
                setResult(null);
                setConfirm(event.target.value);
              }}
            />
            {errors.confirm !== undefined ? (
              <span id="pw-conf-err" className={styles.fieldError}>
                <Icon name="alert" size={14} strokeWidth={2.4} stroke="#a1362b" />
                {errors.confirm}
              </span>
            ) : null}
            {errors.next !== undefined ? (
              <span role="alert" className={styles.fieldError} style={{ marginTop: 10 }}>
                {errors.next}
              </span>
            ) : null}
          </div>
        </div>

        <div style={{ paddingTop: 4 }}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => void changePassword()}
            disabled={busy !== null}
            aria-busy={busy === 'password'}
          >
            {busy === 'password' ? 'Changing password…' : 'Change password'}
          </button>
        </div>
      </form>

      {/* Signed-in devices */}
      <div className={`${styles.card} ${styles.securityDevicesCard}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 className={styles.securityHeading}>Signed-in devices</h2>
          <p
            style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--hw-text-secondary)' }}
          >
            If you don’t recognise a device, sign it out and change your password.
          </p>
        </div>
        {devicesError !== null ? (
          <p role="alert" style={{ margin: 0, fontSize: 14 }}>
            {devicesError}{' '}
            <button type="button" className={styles.inlineLink} onClick={() => void loadDevices()}>
              Try again
            </button>
          </p>
        ) : devices === null ? (
          <p role="status" style={{ margin: 0, fontSize: 14 }}>
            Loading your devices…
          </p>
        ) : (
          <ul className={styles.deviceList}>
            {devices.map((device) => (
              <li key={device.id} className={styles.deviceRow}>
                <span className={styles.deviceIcon}>
                  <Icon name="package" size={20} strokeWidth={1.6} />
                </span>
                <span
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}
                >
                  <span style={{ fontSize: 15, fontWeight: 600 }}>
                    {deviceName(device.clientLabel)}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--hw-text-muted)' }}>
                    {deviceMeta(device)}
                  </span>
                </span>
                {device.current ? <span className={styles.pillVerified}>This device</span> : null}
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 18px' }}>
          {otherDevices.length > 0 ? (
            <button
              type="button"
              className={styles.btnOutline}
              onClick={() => setDeviceDialog(true)}
              disabled={busy !== null}
            >
              Sign out of other devices
            </button>
          ) : devices !== null ? (
            <span style={{ fontSize: 14, color: 'var(--hw-text-secondary)' }}>
              You’re only signed in on this device.
            </span>
          ) : null}
          <button
            type="button"
            className={styles.inlineLink}
            onClick={() => void session?.signOut()}
          >
            Sign out of this device
          </button>
        </div>
      </div>

      {/* Close account */}
      <div className={`${styles.card} ${styles.securityRowCard}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Close your account</h2>
          <p
            style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--hw-text-secondary)' }}
          >
            Contact support to close your account. Accounts can’t be closed from this page.
          </p>
        </div>
        <a
          href="mailto:support@nordhaven.example"
          className={styles.inlineLink}
          style={{ alignSelf: 'flex-start' }}
        >
          Contact support
        </a>
      </div>

      {deviceDialog ? (
        <div className={styles.overlay}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="dev-cf-title"
            aria-describedby="dev-cf-body"
            className={styles.dialog}
            style={{ maxWidth: 480 }}
          >
            <div className={styles.confirmBox}>
              <h2 id="dev-cf-title" className={styles.dialogTitle}>
                Sign out of other devices?
              </h2>
              <div className={styles.confirmBoxLabel}>
                <p className={styles.confirmBoxLabel}>
                  You’ll stay signed in here. Anyone using your account on another device will need
                  to sign in again.
                </p>
              </div>
              <div className={styles.dialogFooter} style={{ paddingTop: 6 }}>
                <button
                  type="button"
                  className={styles.btnOutline}
                  onClick={() => setDeviceDialog(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={() => void signOutOthers()}
                  disabled={busy !== null}
                >
                  Sign out {otherDevices.length} {otherDevices.length === 1 ? 'device' : 'devices'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {toast !== null ? (
        <div role="status" className={styles.toast}>
          <Icon name="done" size={16} strokeWidth={2.6} stroke="#b9d3be" />
          <span>{toast}</span>
        </div>
      ) : null}
    </section>
  );
}
