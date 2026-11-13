import type { MenuItemConstructorOptions } from 'electron';
import type { AccessibilityState, Settings } from '../../shared/types';

type Language = Settings['language'];

interface TrayStrings {
  open: string;
  quit: string;
  tooltip: string;
  tooltipDegraded: string;
  degradedHeader: string;
  degradedAutoPaste: string;
  fixAccessibility: string;
}

/**
 * The tray menu lives in the main process, which does not load the renderer's i18next bundle.
 * These few strings are kept here, keyed by the same language setting.
 */
const STRINGS: Record<Language, TrayStrings> = {
  en: {
    open: 'Open Clippo',
    quit: 'Quit',
    tooltip: 'Clippo',
    tooltipDegraded: 'Clippo: auto-paste is off (Accessibility access missing)',
    degradedHeader: '⚠︎ Accessibility access is off',
    degradedAutoPaste: 'Clicking an entry only copies it, press ⌘V yourself',
    fixAccessibility: 'Open Accessibility Settings…',
  },
  fr: {
    open: 'Ouvrir Clippo',
    quit: 'Quitter',
    tooltip: 'Clippo',
    tooltipDegraded: "Clippo : le collage automatique est désactivé (accès Accessibilité manquant)",
    degradedHeader: '⚠︎ L’accès Accessibilité est désactivé',
    degradedAutoPaste: 'Un clic copie seulement l’élément, collez avec ⌘V',
    fixAccessibility: 'Ouvrir les réglages Accessibilité…',
  },
};

export interface TrayActions {
  toggle: () => void;
  openAccessibilitySettings: () => void;
  quit: () => void;
}

export interface TrayPresentation {
  tooltip: string;
  /** Text shown next to the menu bar icon; empty when everything works. */
  title: string;
  menu: MenuItemConstructorOptions[];
}

/**
 * Pure description of the tray for a given state. Kept free of Electron objects so it can be
 * unit tested; `index.ts` applies it to the real Tray.
 */
export function describeTray(state: AccessibilityState, language: Language, actions: TrayActions): TrayPresentation {
  const strings = STRINGS[language];
  const degraded = state === 'missing';

  const warning: MenuItemConstructorOptions[] = degraded
    ? [
        { label: strings.degradedHeader, enabled: false },
        { label: strings.degradedAutoPaste, enabled: false },
        { label: strings.fixAccessibility, click: actions.openAccessibilitySettings },
        { type: 'separator' },
      ]
    : [];

  return {
    tooltip: degraded ? strings.tooltipDegraded : strings.tooltip,
    title: degraded ? '⚠︎' : '',
    menu: [
      ...warning,
      { label: strings.open, click: actions.toggle },
      { type: 'separator' },
      { label: strings.quit, click: actions.quit },
    ],
  };
}
