import 'i18next';
import type en from './locales/en';

// Augment i18next so that useTranslation() provides full key autocomplete
// and TypeScript errors on missing or misspelled keys.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof en;
    };
  }
}
