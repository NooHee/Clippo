import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import fr from './locales/fr';

// To add a new language:
// 1. Copy src/i18n/locales/en.ts → src/i18n/locales/xx.ts
// 2. Translate all values (TypeScript will error on missing keys)
// 3. Import it here and add it to `resources`

export const resources = {
  en: { translation: en },
  fr: { translation: fr },
} as const;

// Determine initial language: try to get from settings, fallback to system language
const getInitialLanguage = (): string => {
  // Try to get language from window.clipstack if available
  if (typeof window !== 'undefined' && (window as any).clipstack?.getSettings) {
    return 'en'; // Will be set properly after settings load
  }
  // Fallback to system language
  const systemLang = navigator.language.split('-')[0];
  return (systemLang === 'fr') ? 'fr' : 'en';
};

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React already escapes
  },
});

export const changeLanguage = (lang: string) => {
  i18n.changeLanguage(lang);
};

export default i18n;
