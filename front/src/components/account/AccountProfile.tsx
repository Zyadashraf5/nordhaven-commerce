'use client';

import { useCallback, useEffect, useState } from 'react';
import { validateEgyptMobile } from '../../lib/account-validation';
import { api, errorMessage } from '../../lib/api/browser';
import type { ApiCustomerProfile } from '../../lib/api/catalog-types';
import { useOptionalSession } from '../providers/SessionProvider';
import { Icon } from '../ui/Icon';
import styles from './account.module.css';

/**
 * The profile screen (Stage 3 "My account" profile board), connected to the
 * customer profile API (F06):
 *
 *   GET   /api/v1/customers/me/profile
 *   PATCH /api/v1/customers/me/profile      { displayName, phone }
 *
 * The API keeps one `displayName` (not first and last name) and a `phone`.
 * The email is the account's sign-in address from `GET /auth/principal`; the
 * contract has no operation to change it, so it is shown read-only. The board's
 * "Verified" badge is not shown: the API exposes no verification state.
 */

type FormErrors = {
  name?: string | undefined;
  phone?: string | undefined;
};

const FIELD_LABELS: Record<keyof FormErrors, string> = {
  name: 'Full name',
  phone: 'Mobile number',
};

const stripCountryCode = (phone: string | null): string => (phone ?? '').replace(/^\+20\s*/, '');

interface Draft {
  name: string;
  phone: string;
}

const fromProfile = (profile: ApiCustomerProfile): Draft => ({
  name: profile.displayName ?? '',
  phone: stripCountryCode(profile.phone),
});

export function AccountProfile() {
  const session = useOptionalSession();
  const email = session?.principal?.user.email ?? '';
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [saved, setSaved] = useState<Draft>({ name: '', phone: '' });
  const [draft, setDraft] = useState<Draft>({ name: '', phone: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const profile = await api.get<ApiCustomerProfile>('customers/me/profile');
      const next = fromProfile(profile);
      setSaved(next);
      setDraft(next);
      setLoadState('ready');
    } catch (error) {
      setLoadError(errorMessage(error, 'We couldn’t load your profile.'));
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (toast === null) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const patch = (key: keyof Draft, value: string): void => {
    setErrors((prev) => (prev[key] === undefined ? prev : { ...prev, [key]: undefined }));
    setFailure(null);
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const dirty = draft.name !== saved.name || draft.phone !== saved.phone;

  const discard = (): void => {
    setDraft(saved);
    setErrors({});
    setFailure(null);
  };

  const save = (): void => {
    const next: FormErrors = {};
    if (draft.name.trim() === '') next.name = 'Enter your full name';
    const phoneError = validateEgyptMobile(draft.phone, true);
    if (phoneError !== null) next.phone = phoneError;
    if (Object.keys(next).length > 0) {
      setErrors(next);
      setToast(null);
      return;
    }

    const name = draft.name.trim();
    const phone = draft.phone.trim();
    setBusy(true);
    setFailure(null);
    void (async () => {
      try {
        const profile = await api.patch<ApiCustomerProfile>('customers/me/profile', {
          displayName: name,
          phone: phone === '' ? null : `+20 ${phone}`,
        });
        const updated = fromProfile(profile);
        setSaved(updated);
        setDraft(updated);
        setToast('Profile saved');
      } catch (error) {
        setFailure(errorMessage(error, 'We couldn’t save your profile. Please try again.'));
      } finally {
        setBusy(false);
      }
    })();
  };

  const errorKeys = (Object.keys(FIELD_LABELS) as Array<keyof FormErrors>).filter(
    (key) => errors[key] !== undefined,
  );

  return (
    <section className={styles.section}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h1 id="acc-h1" className={styles.headline} data-intro data-split="words">
          Profile
        </h1>
        <p className={styles.headlineBody}>
          The name and contact details we use for your account and orders.
        </p>
      </div>

      {loadState === 'loading' ? (
        <div role="status" className={styles.emptyState}>
          <span className={styles.emptyBody}>Loading your profile…</span>
        </div>
      ) : null}

      {loadState === 'error' ? (
        <div role="alert" className={styles.emptyState}>
          <Icon name="alert" size={44} strokeWidth={1.3} stroke="#a1362b" />
          <strong className={styles.emptyTitle}>We couldn’t load your profile</strong>
          <span className={styles.emptyBody}>{loadError}</span>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => {
              setLoadState('loading');
              void load();
            }}
          >
            Try again
          </button>
        </div>
      ) : null}

      {loadState === 'ready' ? (
        <form
          className={styles.profileForm}
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          noValidate
        >
          {failure !== null ? (
            <div role="alert" className={styles.summaryAlert}>
              <Icon name="alert" size={18} strokeWidth={2} stroke="#a1362b" />
              <div>{failure}</div>
            </div>
          ) : null}
          {errorKeys.length > 0 ? (
            <div role="alert" className={styles.summaryAlert}>
              <Icon name="alert" size={18} strokeWidth={2} stroke="#a1362b" />
              <div>
                <strong>Fix the highlighted fields to continue</strong>
                <ul className={styles.summaryAlertList}>
                  {errorKeys.map((key) => (
                    <li key={key}>
                      <a href={`#pf-${key}`} className={styles.summaryAlertLink}>
                        {FIELD_LABELS[key]}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <div className={styles.formColumn}>
            <label className={styles.fieldLabel} htmlFor="pf-name">
              Full name
            </label>
            <input
              id="pf-name"
              type="text"
              autoComplete="name"
              className={`${styles.textField} ${errors.name !== undefined ? styles.fieldInvalid : ''}`}
              value={draft.name}
              aria-invalid={errors.name !== undefined}
              aria-describedby={errors.name !== undefined ? 'pf-name-err' : undefined}
              onChange={(event) => patch('name', event.target.value)}
            />
            {errors.name !== undefined ? (
              <span id="pf-name-err" className={styles.fieldError}>
                <Icon name="alert" size={14} strokeWidth={2.4} stroke="#a1362b" />
                {errors.name}
              </span>
            ) : null}
          </div>

          <div className={styles.formColumn}>
            <label className={styles.fieldLabel} htmlFor="pf-email">
              Email address
            </label>
            <input
              id="pf-email"
              type="email"
              autoComplete="email"
              className={styles.textField}
              value={email}
              readOnly
              aria-describedby="pf-email-help"
            />
            <span id="pf-email-help" className={styles.fieldHelp}>
              This is your sign-in address and where order updates go. It can’t be changed here.
            </span>
          </div>

          <div className={styles.formColumn}>
            <label className={styles.fieldLabel} htmlFor="pf-phone">
              Mobile number <span className={styles.fieldLabelMuted}>(optional)</span>
            </label>
            <div className={styles.phoneRow}>
              <span className={styles.countryChip} aria-label="Country code Egypt +20">
                +20
              </span>
              <input
                id="pf-phone"
                type="tel"
                inputMode="tel"
                dir="ltr"
                autoComplete="tel-national"
                className={`${styles.textField} ${styles.numerals} ${styles.phoneField} ${errors.phone !== undefined ? styles.fieldInvalid : ''}`}
                placeholder="100 000 0000"
                value={draft.phone}
                aria-invalid={errors.phone !== undefined}
                aria-describedby={errors.phone !== undefined ? 'pf-phone-err' : 'pf-phone-help'}
                onChange={(event) => patch('phone', event.target.value)}
              />
            </div>
            {errors.phone !== undefined ? (
              <span id="pf-phone-err" className={styles.fieldError}>
                <Icon name="alert" size={14} strokeWidth={2.4} stroke="#a1362b" />
                {errors.phone}
              </span>
            ) : null}
            <span id="pf-phone-help" className={styles.fieldHelp}>
              Egyptian mobile number, without the leading 0.
            </span>
          </div>

          <div className={styles.profileActions}>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={!dirty || busy}
              onClick={save}
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            {dirty ? (
              <button
                type="button"
                className={styles.textBtn}
                style={{ padding: 0 }}
                onClick={discard}
              >
                Discard changes
              </button>
            ) : null}
            <span className={styles.fieldHelp}>
              {dirty ? 'You have unsaved changes.' : 'Your details are up to date.'}
            </span>
          </div>
        </form>
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
