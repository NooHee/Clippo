import { useTranslation } from 'react-i18next';

/**
 * App-level localization hook.
 * Returns `translate(key, options?)` — a type-safe function that resolves
 * translation keys defined in src/i18n/locales/en.ts.
 *
 * Usage:
 *   const { translate } = useLocalization();
 *   translate('app.name') // → 'ClipStack'
 */
export function useLocalization() {
  const { t: translate } = useTranslation();
  return { translate };
}
