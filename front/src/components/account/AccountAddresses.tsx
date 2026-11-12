'use client';

import { useCallback, useEffect, useState } from 'react';
import { governorates } from '../../data/account-sample';
import {
  validateEgyptMobile,
  validatePostalCode,
  MOBILE_ERROR,
  POSTAL_ERROR,
} from '../../lib/account-validation';
import { api, errorMessage } from '../../lib/api/browser';
import type { ApiAddressInput, ApiCustomerAddress } from '../../lib/api/catalog-types';
import { Icon } from '../ui/Icon';
import styles from './account.module.css';

/**
 * The addresses screen (Stage 3 My account boards + "Addresses — mobile Arabic
 * RTL" board), connected to the customer address API (F06):
 *
 *   GET    /api/v1/customers/me/addresses
 *   POST   /api/v1/customers/me/addresses
 *   PATCH  /api/v1/customers/me/addresses/{id}
 *   DELETE /api/v1/customers/me/addresses/{id}
 *   PUT    /api/v1/customers/me/addresses/{id}/default
 *
 * The API stores recipientName, line1, line2, city, region (governorate),
 * postalCode, countryCode and phone. It has no "address name" or delivery
 * note, so those two fields are not offered; a card is titled with the
 * recipient. The governorate is stored in English and shown in the page
 * language. `?lang=ar` renders the Arabic RTL layout over the same real data.
 */

export type AccountLang = 'en' | 'ar';

interface AddressView {
  id: string;
  /** Card title: the recipient (the API has no address name). */
  label: string;
  name: string;
  /** Digits after the +20 country code. */
  phone: string;
  city: string;
  governorate: string;
  street: string;
  building: string;
  postal: string;
  isDefault: boolean;
}

const stripCountryCode = (phone: string | null): string => (phone ?? '').replace(/^\+20\s*/, '');

function toView(source: ApiCustomerAddress): AddressView {
  return {
    id: source.id,
    label: source.recipientName,
    name: source.recipientName,
    phone: stripCountryCode(source.phone),
    city: source.city,
    governorate: source.region ?? '',
    street: source.line1,
    building: source.line2 ?? '',
    postal: source.postalCode ?? '',
    isDefault: source.isDefault,
  };
}

function toInput(form: FormRec): ApiAddressInput {
  const building = form.building.trim();
  const postal = form.postal.trim();
  return {
    recipientName: form.name.trim(),
    line1: form.street.trim(),
    line2: building === '' ? null : building,
    city: form.city.trim(),
    region: form.governorate === '' ? null : form.governorate,
    postalCode: postal === '' ? null : postal,
    countryCode: 'EG',
    phone: `+20 ${form.phone.trim()}`,
  };
}

/* ------------------------------------------------------------------ *
 * Copy
 * ------------------------------------------------------------------ */

interface Copy {
  title: string;
  intro: string;
  add: string;
  emptyTitle: string;
  emptyBody: string;
  emptyCta: string;
  defaultPill: string;
  usedFirst: string;
  setDefault: string;
  edit: string;
  remove: string;
  notePrefix: string;
  defaultGuard: string;
  formLabels: {
    labelName: string;
    labelHelp: string;
    fullName: string;
    phone: string;
    phoneHelp: string;
    country: string;
    countryHelp: string;
    governorate: string;
    govPlaceholder: string;
    city: string;
    cityPlaceholder: string;
    street: string;
    streetPlaceholder: string;
    building: string;
    buildingPlaceholder: string;
    postal: string;
    notes: string;
    notesHelp: string;
    optional: string;
  };
  isDefault: string;
  firstAddressHelp: string;
  addressAddedTitle: string;
  addressUpdatedTitle: string;
  cancel: string;
  save: string;
  summaryTitle: string;
  deleteTitle: string;
  deleteBody: string;
  keepAddress: string;
  deleteConfirm: string;
  toastAdded: string;
  toastUpdated: string;
  toastDefault: (label: string) => string;
  toastDeleted: (label: string) => string;
  errors: {
    name: string;
    phone: string;
    governorate: string;
    city: string;
    street: string;
    building: string;
    postal: string;
  };
}

const EN: Copy = {
  title: 'Addresses',
  intro:
    'Your default address is selected first at checkout. You can still choose another one for each order.',
  add: 'Add address',
  emptyTitle: 'No saved addresses yet',
  emptyBody:
    'Save an address here and it will be ready at checkout. The first one you add becomes your default.',
  emptyCta: 'Add an address',
  defaultPill: 'Default',
  usedFirst: 'Used first at checkout',
  setDefault: 'Set as default',
  edit: 'Edit',
  remove: 'Delete',
  notePrefix: 'Note: ',
  defaultGuard:
    'This is your default address, so it can’t be deleted yet. Set another address as default first, then delete this one.',
  formLabels: {
    labelName: 'Address name',
    labelHelp: 'Helps you pick the right address at checkout.',
    fullName: 'Full name',
    phone: 'Mobile number',
    phoneHelp: 'For the courier, if they need to reach you.',
    country: 'Country',
    countryHelp: 'We currently deliver to the countries listed.',
    governorate: 'Governorate',
    govPlaceholder: 'Select governorate',
    city: 'City / area',
    cityPlaceholder: 'e.g. Zamalek',
    street: 'Street address',
    streetPlaceholder: 'Building number and street name',
    building: 'Building, floor, apartment',
    buildingPlaceholder: 'e.g. Apartment 6',
    postal: 'Postal code',
    notes: 'Delivery notes',
    notesHelp: 'Shared with the courier.',
    optional: '(optional)',
  },
  isDefault: 'Set as default address',
  firstAddressHelp: 'The first address you add becomes your default.',
  addressAddedTitle: 'Add an address',
  addressUpdatedTitle: 'Edit address',
  cancel: 'Cancel',
  save: 'Save address',
  summaryTitle: 'Fix the highlighted fields to continue',
  deleteTitle: 'Delete this address?',
  deleteBody:
    'You won’t see it at checkout any more. Orders you’ve already placed aren’t affected.',
  keepAddress: 'Keep address',
  deleteConfirm: 'Delete address',
  toastAdded: 'Address added',
  toastUpdated: 'Address updated',
  toastDefault: (label) => `${label} is now your default address`,
  toastDeleted: (label) => `${label} address deleted`,
  errors: {
    name: 'Enter the full name of the person receiving the delivery',
    phone: MOBILE_ERROR,
    governorate: 'Select a governorate',
    city: 'Enter a city or area',
    street: 'Enter the building number and street name',
    building: 'Enter a building, floor or apartment',
    postal: POSTAL_ERROR,
  },
};

const AR: Copy = {
  title: 'العناوين',
  intro: 'يُختار عنوانك الافتراضي أولاً عند إتمام الطلب، ويمكنك اختيار عنوان آخر لكل طلب.',
  add: 'إضافة عنوان',
  emptyTitle: 'لا توجد عناوين محفوظة بعد',
  emptyBody: 'احفظ عنواناً هنا ليكون جاهزاً عند الدفع. العنوان الأول تضيفه يصبح الافتراضي.',
  emptyCta: 'إضافة عنوان',
  defaultPill: 'افتراضي',
  usedFirst: 'يُستخدم أولاً عند الدفع',
  setDefault: 'تعيين كعنوان افتراضي',
  edit: 'تعديل',
  remove: 'حذف',
  notePrefix: 'ملاحظة: ',
  defaultGuard:
    'هذا عنوانك الافتراضي، لذا لا يمكن حذفه الآن. عيّن عنواناً آخر افتراضياً أولاً، ثم احذف هذا العنوان.',
  formLabels: {
    labelName: 'اسم العنوان',
    labelHelp: 'يساعدك على اختيار العنوان الصحيح عند الدفع.',
    fullName: 'الاسم الكامل',
    phone: 'رقم الجوال',
    phoneHelp: 'لمندوب التوصيل إذا احتاج إلى التواصل معك.',
    country: 'الدولة',
    countryHelp: 'نوصّل حالياً إلى الدول المدرجة فقط.',
    governorate: 'المحافظة',
    govPlaceholder: 'اختر المحافظة',
    city: 'المدينة / المنطقة',
    cityPlaceholder: 'مثال: الزمالك',
    street: 'عنوان الشارع',
    streetPlaceholder: 'رقم المبنى واسم الشارع',
    building: 'المبنى / الشقة',
    buildingPlaceholder: 'مثال: شقة 6',
    postal: 'الرمز البريدي',
    notes: 'ملاحظات التوصيل',
    notesHelp: 'تُرسَل إلى مندوب التوصيل.',
    optional: '(اختياري)',
  },
  isDefault: 'تعيين كعنوان افتراضي',
  firstAddressHelp: 'العنوان الأول تضيفه يصبح الافتراضي.',
  addressAddedTitle: 'إضافة عنوان جديد',
  addressUpdatedTitle: 'تعديل العنوان',
  cancel: 'إلغاء',
  save: 'حفظ العنوان',
  summaryTitle: 'صحّح الحقول المحددة ثم تابع',
  deleteTitle: 'حذف هذا العنوان؟',
  deleteBody: 'لن يظهر عند الدفع بعد الآن. الطلبات التي أُنشئت بالفعل لا تتأثر.',
  keepAddress: 'الاحتفاظ بالعنوان',
  deleteConfirm: 'حذف العنوان',
  toastAdded: 'تمت إضافة العنوان',
  toastUpdated: 'تم تحديث العنوان',
  toastDefault: (label) => `${label} هو عنوانك الافتراضي الآن`,
  toastDeleted: (label) => `تم حذف عنوان ${label}`,
  errors: {
    name: 'أدخل الاسم الكامل للشخص المستلم للطلب',
    phone: 'أدخل 10 أرقام بعد +20، مثل 100 000 0000',
    governorate: 'اختر المحافظة',
    city: 'أدخل مدينة أو منطقة',
    street: 'أدخل رقم المبنى واسم الشارع',
    building: 'أدخل المبنى أو الطابق أو الشقة',
    postal: POSTAL_ERROR,
  },
};

const COPY: Record<AccountLang, Copy> = { en: EN, ar: AR };

/* ------------------------------------------------------------------ *
 * Form record
 * ------------------------------------------------------------------ */

interface FormRec {
  name: string;
  phone: string;
  governorate: string;
  city: string;
  street: string;
  building: string;
  postal: string;
  isDefault: boolean;
}

type FormErrors = Partial<Record<keyof Omit<FormRec, 'isDefault'>, string>>;

const blankForm = (name: string, phone: string, isFirstAddress: boolean): FormRec => ({
  name,
  phone,
  governorate: '',
  city: '',
  street: '',
  building: '',
  postal: '',
  isDefault: isFirstAddress,
});

/** The stored governorate is English; the select works in English values. */
const englishGovernorate = (value: string): string =>
  governorates.find((g) => g.en === value || g.ar === value)?.en ?? value;

const formFrom = (address: AddressView): FormRec => ({
  name: address.name,
  phone: address.phone,
  governorate: englishGovernorate(address.governorate),
  city: address.city,
  street: address.street,
  building: address.building,
  postal: address.postal,
  isDefault: address.isDefault,
});

/** The cards' two display lines; Arabic joins with the Arabic comma (board copy). */
const formatLines = (
  address: AddressView,
  govNameFor: (en: string) => string,
  separator: string,
) => {
  const gov = govNameFor(address.governorate) || address.governorate;
  const line2 = address.postal
    ? `${address.city}${separator} ${gov} ${address.postal}`
    : `${address.city}${separator} ${gov}`;
  return {
    line1: address.building ? `${address.street}${separator} ${address.building}` : address.street,
    line2,
  };
};

/* ------------------------------------------------------------------ *
 * Screen
 * ------------------------------------------------------------------ */

export function AccountAddresses({ lang = 'en' }: { lang?: AccountLang }) {
  const copy = COPY[lang];
  const [addresses, setAddresses] = useState<AddressView[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ mode: 'add' } | { mode: 'edit'; id: string } | null>(null);
  const [form, setForm] = useState<FormRec | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [guardId, setGuardId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.get<{ addresses: ApiCustomerAddress[] }>('customers/me/addresses');
      setAddresses(result.addresses.map(toView));
      setStatus('ready');
    } catch (error) {
      setLoadError(errorMessage(error, 'We couldn’t load your addresses.'));
      setStatus('error');
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

  const patchForm = (patch: Partial<FormRec>): void => {
    setErrors({});
    setActionError(null);
    setForm((prev) => (prev === null ? prev : { ...prev, ...patch }));
  };

  const sorted = [...addresses].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
  const govNameFor = (value: string): string =>
    governorates.find((g) => g.en === value || g.ar === value)?.[lang] ?? value;

  const openAdd = (): void => {
    setDialog({ mode: 'add' });
    setForm(blankForm(sorted[0]?.name ?? '', sorted[0]?.phone ?? '', addresses.length === 0));
    setErrors({});
    setActionError(null);
    setGuardId(null);
  };

  const openEdit = (id: string): void => {
    const address = addresses.find((a) => a.id === id);
    if (!address) return;
    setDialog({ mode: 'edit', id });
    setForm(formFrom(address));
    setErrors({});
    setActionError(null);
    setGuardId(null);
  };

  const closeDialog = (): void => {
    setDialog(null);
    setForm(null);
    setErrors({});
    setActionError(null);
  };

  /** Runs one API action; failures are shown, never reported as success. */
  const act = async (work: () => Promise<void>, fallback: string): Promise<boolean> => {
    setBusy(true);
    setActionError(null);
    try {
      await work();
      await load();
      return true;
    } catch (error) {
      setActionError(errorMessage(error, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveAddress = (): void => {
    if (form === null || dialog === null) return;
    const next: FormErrors = {};
    if (form.name.trim() === '') next.name = copy.errors.name;
    for (const check of [
      ['phone', validateEgyptMobile(form.phone)],
      ['governorate', form.governorate === '' ? copy.errors.governorate : null],
      ['city', form.city.trim() === '' ? copy.errors.city : null],
      ['street', form.street.trim() === '' ? copy.errors.street : null],
      ['postal', validatePostalCode(form.postal)],
    ] as const) {
      const message: string | null = check[1];
      if (message !== null) next[check[0]] = message;
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    const input = toInput(form);
    const wantsDefault = form.isDefault;
    void (async () => {
      const ok = await act(async () => {
        const saved =
          dialog.mode === 'add'
            ? await api.post<ApiCustomerAddress>('customers/me/addresses', input)
            : await api.patch<ApiCustomerAddress>(`customers/me/addresses/${dialog.id}`, input);
        if (wantsDefault && !saved.isDefault) {
          await api.put<ApiCustomerAddress>(`customers/me/addresses/${saved.id}/default`);
        }
      }, 'We couldn’t save this address. Please try again.');
      if (ok) {
        setToast(dialog.mode === 'add' ? copy.toastAdded : copy.toastUpdated);
        closeDialog();
      }
    })();
  };

  const makeDefault = (id: string): void => {
    setGuardId(null);
    const label = addresses.find((a) => a.id === id)?.label ?? '';
    void (async () => {
      const ok = await act(async () => {
        await api.put<ApiCustomerAddress>(`customers/me/addresses/${id}/default`);
      }, 'We couldn’t change your default address.');
      if (ok) setToast(copy.toastDefault(label));
    })();
  };

  /** Delete click: the default shows the guard note straight away; the rest confirm first. */
  const requestRemove = (id: string): void => {
    const address = addresses.find((a) => a.id === id);
    if (!address) return;
    setGuardId(null);
    setActionError(null);
    if (address.isDefault && addresses.length > 1) {
      setGuardId(id);
      return;
    }
    setConfirm(id);
  };

  const removeAddress = (id: string): void => {
    const address = addresses.find((a) => a.id === id);
    if (!address) return;
    void (async () => {
      const ok = await act(async () => {
        await api.delete(`customers/me/addresses/${id}`);
      }, 'We couldn’t delete this address.');
      setConfirm(null);
      setGuardId(null);
      if (ok) setToast(copy.toastDeleted(address.label));
    })();
  };

  const editingDefault =
    dialog?.mode === 'edit' && addresses.find((a) => a.id === dialog.id)?.isDefault === true;
  const isFirstAddress = addresses.length === 0;

  return (
    <section
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      lang={lang === 'ar' ? 'ar' : 'en'}
      className={`${styles.section} ${lang === 'ar' ? styles.arTheme : ''}`}
    >
      <div className={styles.sectionHead}>
        <div className={styles.headRow}>
          <h1
            id="acc-h1"
            className={`${styles.headline} ${lang === 'ar' ? styles.headlineAr : ''}`}
          >
            {copy.title}
          </h1>
          <p className={`${styles.headlineBody} ${styles.sectionIntro}`}>{copy.intro}</p>
        </div>
        {status === 'ready' && addresses.length > 0 ? (
          <button type="button" className={styles.btnPrimary} onClick={openAdd} disabled={busy}>
            <Icon name="plus" size={18} strokeWidth={2} />
            {copy.add}
          </button>
        ) : null}
      </div>

      {actionError !== null && dialog === null ? (
        <div role="alert" className={styles.summaryAlert}>
          <Icon name="alert" size={18} strokeWidth={2} stroke="#a1362b" />
          <div>{actionError}</div>
        </div>
      ) : null}

      {status === 'loading' ? (
        <div role="status" className={styles.emptyState}>
          <span className={styles.emptyBody}>
            {lang === 'ar' ? 'جارٍ تحميل عناوينك…' : 'Loading your addresses…'}
          </span>
        </div>
      ) : status === 'error' ? (
        <div role="alert" className={styles.emptyState}>
          <Icon name="alert" size={44} strokeWidth={1.3} stroke="#a1362b" />
          <strong className={styles.emptyTitle}>
            {lang === 'ar' ? 'تعذّر تحميل العناوين' : 'We couldn’t load your addresses'}
          </strong>
          <span className={styles.emptyBody}>{loadError}</span>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => {
              setStatus('loading');
              void load();
            }}
          >
            {lang === 'ar' ? 'حاول مرة أخرى' : 'Try again'}
          </button>
        </div>
      ) : addresses.length > 0 ? (
        <ul className={styles.addressGrid} data-address-list data-reveal-stagger>
          {sorted.map((address) => {
            const lines = formatLines(address, govNameFor, lang === 'ar' ? '،' : ',');
            return (
              <li
                key={address.id}
                className={
                  address.isDefault
                    ? `${styles.card} ${styles.addressCard} ${styles.addressCardDefault}`
                    : `${styles.card} ${styles.addressCard}`
                }
              >
                <div className={styles.cardTopRow}>
                  <h2
                    className={`${styles.addressTitle} ${lang === 'ar' ? styles.headlineAr : ''}`}
                  >
                    {address.label}
                  </h2>
                  {address.isDefault ? (
                    <span className={styles.pillDefault}>
                      <Icon name="done" size={12} strokeWidth={3} aria-hidden="true" />
                      {copy.defaultPill}
                    </span>
                  ) : null}
                </div>
                <address className={styles.addressLines}>
                  {address.label !== address.name ? (
                    <span className={styles.addressName}>{address.name}</span>
                  ) : null}
                  <span>{lines.line1}</span>
                  <span>{lines.line2}</span>
                  <span>{copy.formLabels.country === 'Country' ? 'Egypt' : 'مصر'}</span>
                  {address.phone !== '' ? (
                    <span dir="ltr" className={styles.numerals}>
                      +20 {address.phone}
                    </span>
                  ) : null}
                </address>
                {guardId === address.id ? (
                  <div role="status" className={styles.guardNote}>
                    <Icon name="alert" size={18} strokeWidth={2} stroke="#8a5a12" />
                    <span>{copy.defaultGuard}</span>
                  </div>
                ) : null}
                <div className={styles.addressActions}>
                  {address.isDefault ? (
                    <span className={styles.usedFirst}>{copy.usedFirst}</span>
                  ) : (
                    <button
                      type="button"
                      className={styles.btnOutline}
                      style={{ marginInlineEnd: 'auto' }}
                      onClick={() => makeDefault(address.id)}
                    >
                      {copy.setDefault}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.textBtn}
                    aria-label={`${copy.edit} ${address.label}`}
                    onClick={() => openEdit(address.id)}
                  >
                    {copy.edit}
                  </button>
                  <button
                    type="button"
                    className={`${styles.textBtn} ${styles.textBtnDanger}`}
                    aria-label={`${copy.remove} ${address.label}`}
                    onClick={() => requestRemove(address.id)}
                  >
                    {copy.remove}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className={styles.emptyState}>
          <Icon name="pin" size={44} strokeWidth={1.3} stroke="#8a4a34" />
          <strong className={styles.emptyTitle}>{copy.emptyTitle}</strong>
          <span className={styles.emptyBody}>{copy.emptyBody}</span>
          <button type="button" className={styles.btnPrimary} onClick={openAdd}>
            <Icon name="plus" size={18} strokeWidth={2} />
            {copy.emptyCta}
          </button>
        </div>
      )}

      {dialog !== null && form !== null ? (
        <div className={styles.overlay}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="addr-dlg-title"
            className={styles.dialog}
            style={{ maxWidth: 620, maxHeight: 'calc(100vh - 32px)' }}
          >
            <div className={styles.dialogHead}>
              <h2 id="addr-dlg-title" className={styles.dialogTitle}>
                {dialog.mode === 'add' ? copy.addressAddedTitle : copy.addressUpdatedTitle}
              </h2>
              <button
                type="button"
                aria-label="Close"
                className={styles.closeBtn}
                onClick={closeDialog}
              >
                <Icon name="close" size={20} strokeWidth={1.8} />
              </button>
            </div>
            <form
              className={styles.dialogForm}
              onSubmit={(event) => {
                event.preventDefault();
                saveAddress();
              }}
            >
              {actionError !== null ? (
                <div role="alert" className={styles.summaryAlert}>
                  <Icon name="alert" size={18} strokeWidth={2} stroke="#a1362b" />
                  <div>{actionError}</div>
                </div>
              ) : null}
              {Object.keys(errors).length > 0 ? (
                <div role="alert" className={styles.summaryAlert}>
                  <Icon name="alert" size={18} strokeWidth={2} stroke="#a1362b" />
                  <div>
                    <strong>{copy.summaryTitle}</strong>
                    <ul className={styles.summaryAlertList}>
                      {(
                        [
                          ['name', copy.formLabels.fullName],
                          ['phone', copy.formLabels.phone],
                          ['governorate', copy.formLabels.governorate],
                          ['city', copy.formLabels.city],
                          ['street', copy.formLabels.street],
                          ['postal', copy.formLabels.postal],
                        ] as const
                      )
                        .filter(([key]) => errors[key] !== undefined)
                        .map(([key, label]) => (
                          <li key={key}>
                            <a href={`#af-${key}`} className={styles.summaryAlertLink}>
                              {label}
                            </a>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              <div className={styles.formTwoCol}>
                <div className={styles.formColumn}>
                  <label className={styles.fieldLabel} htmlFor="af-name">
                    {copy.formLabels.fullName}
                  </label>
                  <input
                    id="af-name"
                    type="text"
                    className={`${styles.textField} ${errors.name !== undefined ? styles.fieldInvalid : ''}`}
                    value={form.name}
                    aria-invalid={errors.name !== undefined}
                    aria-describedby={errors.name !== undefined ? 'af-name-err' : undefined}
                    onChange={(event) => patchForm({ name: event.target.value })}
                  />
                  {errors.name !== undefined ? (
                    <span id="af-name-err" className={styles.fieldError}>
                      <Icon name="alert" size={14} strokeWidth={2.4} stroke="#a1362b" />
                      {errors.name}
                    </span>
                  ) : null}
                </div>
                <div className={styles.formColumn}>
                  <label className={styles.fieldLabel} htmlFor="af-phone">
                    {copy.formLabels.phone}
                  </label>
                  <div className={styles.phoneRow}>
                    <span className={styles.countryChip} aria-label="Country code Egypt +20">
                      +20
                    </span>
                    <input
                      id="af-phone"
                      type="tel"
                      inputMode="tel"
                      dir="ltr"
                      className={`${styles.textField} ${styles.numerals} ${styles.phoneField} ${errors.phone !== undefined ? styles.fieldInvalid : ''}`}
                      placeholder="100 000 0000"
                      value={form.phone}
                      aria-invalid={errors.phone !== undefined}
                      aria-describedby={
                        errors.phone !== undefined ? 'af-phone-err' : 'af-phone-help'
                      }
                      onChange={(event) => patchForm({ phone: event.target.value })}
                    />
                  </div>
                  {errors.phone !== undefined ? (
                    <span id="af-phone-err" className={styles.fieldError}>
                      <Icon name="alert" size={14} strokeWidth={2.4} stroke="#a1362b" />
                      {errors.phone}
                    </span>
                  ) : (
                    <span id="af-phone-help" className={styles.fieldHelp}>
                      {copy.formLabels.phoneHelp}
                    </span>
                  )}
                </div>
              </div>

              <div className={styles.formColumn}>
                <label className={styles.fieldLabel} htmlFor="af-gov">
                  {copy.formLabels.country}
                </label>
                <div className={styles.selectWrap}>
                  <select
                    id="af-gov"
                    className={styles.textField}
                    value="EG"
                    onChange={() => undefined}
                    aria-describedby="af-gov-help"
                  >
                    <option value="EG">
                      {copy.formLabels.country === 'Country' ? 'Egypt' : 'مصر'}
                    </option>
                  </select>
                  <Icon
                    name="chevron-down"
                    size={18}
                    strokeWidth={2}
                    className={styles.selectChevron}
                  />
                </div>
                <span id="af-gov-help" className={styles.fieldHelp}>
                  {copy.formLabels.countryHelp}
                </span>
              </div>

              <div className={styles.formTwoCol}>
                <div className={styles.formColumn}>
                  <label className={styles.fieldLabel} htmlFor="af-governorate">
                    {copy.formLabels.governorate}
                  </label>
                  <div className={styles.selectWrap}>
                    <select
                      id="af-governorate"
                      className={`${styles.textField} ${errors.governorate !== undefined ? styles.fieldInvalid : ''}`}
                      value={form.governorate}
                      aria-invalid={errors.governorate !== undefined}
                      onChange={(event) => patchForm({ governorate: event.target.value })}
                    >
                      <option value="">{copy.formLabels.govPlaceholder}</option>
                      {governorates.map((g) => (
                        <option key={g.en} value={g.en}>
                          {lang === 'ar' ? g.ar : g.en}
                        </option>
                      ))}
                    </select>
                    <Icon
                      name="chevron-down"
                      size={18}
                      strokeWidth={2}
                      className={styles.selectChevron}
                    />
                  </div>
                  {errors.governorate !== undefined ? (
                    <span className={styles.fieldError}>
                      <Icon name="alert" size={14} strokeWidth={2.4} stroke="#a1362b" />
                      {errors.governorate}
                    </span>
                  ) : null}
                </div>
                <div className={styles.formColumn}>
                  <label className={styles.fieldLabel} htmlFor="af-city">
                    {copy.formLabels.city}
                  </label>
                  <input
                    id="af-city"
                    type="text"
                    className={`${styles.textField} ${errors.city !== undefined ? styles.fieldInvalid : ''}`}
                    placeholder={copy.formLabels.cityPlaceholder}
                    value={form.city}
                    aria-invalid={errors.city !== undefined}
                    onChange={(event) => patchForm({ city: event.target.value })}
                  />
                  {errors.city !== undefined ? (
                    <span className={styles.fieldError}>
                      <Icon name="alert" size={14} strokeWidth={2.4} stroke="#a1362b" />
                      {errors.city}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className={styles.formColumn}>
                <label className={styles.fieldLabel} htmlFor="af-street">
                  {copy.formLabels.street}
                </label>
                <input
                  id="af-street"
                  type="text"
                  className={`${styles.textField} ${errors.street !== undefined ? styles.fieldInvalid : ''}`}
                  placeholder={copy.formLabels.streetPlaceholder}
                  value={form.street}
                  aria-invalid={errors.street !== undefined}
                  onChange={(event) => patchForm({ street: event.target.value })}
                />
                {errors.street !== undefined ? (
                  <span className={styles.fieldError}>
                    <Icon name="alert" size={14} strokeWidth={2.4} stroke="#a1362b" />
                    {errors.street}
                  </span>
                ) : null}
              </div>

              <div className={styles.formTwoCol}>
                <div className={styles.formColumn}>
                  <label className={styles.fieldLabel} htmlFor="af-building">
                    {copy.formLabels.building}{' '}
                    <span className={styles.fieldLabelMuted}>{copy.formLabels.optional}</span>
                  </label>
                  <input
                    id="af-building"
                    type="text"
                    className={styles.textField}
                    placeholder={copy.formLabels.buildingPlaceholder}
                    value={form.building}
                    onChange={(event) => patchForm({ building: event.target.value })}
                  />
                </div>
                <div className={styles.formColumn}>
                  <label className={styles.fieldLabel} htmlFor="af-postal">
                    {copy.formLabels.postal}{' '}
                    <span className={styles.fieldLabelMuted}>{copy.formLabels.optional}</span>
                  </label>
                  <input
                    id="af-postal"
                    type="text"
                    inputMode="numeric"
                    dir={lang === 'ar' ? 'ltr' : undefined}
                    className={`${styles.textField} ${styles.numerals} ${errors.postal !== undefined ? styles.fieldInvalid : ''}`}
                    value={form.postal}
                    aria-invalid={errors.postal !== undefined}
                    onChange={(event) => patchForm({ postal: event.target.value })}
                  />
                  {errors.postal !== undefined ? (
                    <span className={styles.fieldError}>
                      <Icon name="alert" size={14} strokeWidth={2.4} stroke="#a1362b" />
                      {errors.postal}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className={styles.defaultCheck}>
                <label className={styles.checkRow} htmlFor="af-default">
                  <input
                    id="af-default"
                    type="checkbox"
                    disabled={dialog.mode === 'edit' && editingDefault}
                    checked={form.isDefault}
                    onChange={(event) => patchForm({ isDefault: event.target.checked })}
                  />
                  <span>{copy.isDefault}</span>
                </label>
                <span id="af-default-help" className={styles.fieldHelp}>
                  {isFirstAddress ? copy.firstAddressHelp : copy.usedFirst}
                </span>
              </div>

              <div className={styles.dialogFooter}>
                <button type="button" className={styles.btnOutline} onClick={closeDialog}>
                  {copy.cancel}
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={saveAddress}
                  disabled={busy}
                >
                  {copy.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {confirm !== null ? (
        <div className={styles.overlay}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="addr-del-title"
            className={styles.dialog}
            style={{ maxWidth: 480 }}
          >
            <div className={styles.confirmBox}>
              <h2 id="addr-del-title" className={styles.dialogTitle}>
                {copy.deleteTitle}
              </h2>
              <p className={styles.confirmBoxLabel}>{copy.deleteBody}</p>
              <div className={styles.dialogFooter} style={{ paddingTop: 6 }}>
                <button
                  type="button"
                  className={styles.btnOutline}
                  onClick={() => setConfirm(null)}
                >
                  {copy.keepAddress}
                </button>
                <button
                  type="button"
                  className={styles.btnDanger}
                  disabled={busy}
                  onClick={() => removeAddress(confirm)}
                >
                  {copy.deleteConfirm}
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
