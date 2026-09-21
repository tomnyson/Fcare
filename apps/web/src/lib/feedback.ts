export const DEFAULT_FEEDBACK_FORM_URL = 'https://forms.gle/JSb9D8g9yF51T2HKA';

/** Link form góp ý: env ghi đè được, nhưng chỉ nhận https để nút không mở link lạ. */
export function resolveFeedbackUrl(override: string | undefined): string {
  const value = override?.trim();
  if (!value) return DEFAULT_FEEDBACK_FORM_URL;
  try {
    return new URL(value).protocol === 'https:' ? value : DEFAULT_FEEDBACK_FORM_URL;
  } catch {
    return DEFAULT_FEEDBACK_FORM_URL;
  }
}

export const FEEDBACK_FORM_URL = resolveFeedbackUrl(process.env.NEXT_PUBLIC_FEEDBACK_FORM_URL);
