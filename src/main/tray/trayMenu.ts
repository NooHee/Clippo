import type { MenuItemConstructorOptions } from 'electron';
import type { AccessibilityState, Settings, UpdateStatus } from '../../shared/types';

type Language = Settings['language'];

interface TrayStrings {
  open: string;
  quit: string;
  tooltip: string;
  tooltipDegraded: string;
  degradedHeader: string;
  degradedAutoPaste: string;
  fixAccessibility: string;
  checkForUpdates: string;
  installUpdate: (version: string) => string;
  downloadUpdate: (version: string) => string;
  downloadingUpdate: (version: string, percent: number) => string;
  installingUpdate: (version: string) => string;
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
    checkForUpdates: 'Check for Updates…',
    installUpdate: (version) => `Update to Clippo ${version} and Restart`,
    downloadUpdate: (version) => `Download Clippo ${version}…`,
    downloadingUpdate: (version, percent) => `Downloading Clippo ${version}… ${percent}%`,
    installingUpdate: (version) => `Installing Clippo ${version}…`,
  },
  fr: {
    open: 'Ouvrir Clippo',
    quit: 'Quitter',
    tooltip: 'Clippo',
    tooltipDegraded: "Clippo : le collage automatique est désactivé (accès Accessibilité manquant)",
    degradedHeader: '⚠︎ L’accès Accessibilité est désactivé',
    degradedAutoPaste: 'Un clic copie seulement l’élément, collez avec ⌘V',
    fixAccessibility: 'Ouvrir les réglages Accessibilité…',
    checkForUpdates: 'Rechercher les mises à jour…',
    installUpdate: (version) => `Mettre à jour vers Clippo ${version} et redémarrer`,
    downloadUpdate: (version) => `Télécharger Clippo ${version}…`,
    downloadingUpdate: (version, percent) => `Téléchargement de Clippo ${version}… ${percent} %`,
    installingUpdate: (version) => `Installation de Clippo ${version}…`,
  },
};

export interface TrayActions {
  toggle: () => void;
  openAccessibilitySettings: () => void;
  installUpdate: () => void;
  downloadUpdate: () => void;
  checkForUpdates: () => void;
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
export function describeTray(
  state: AccessibilityState,
  language: Language,
  actions: TrayActions,
  update: UpdateStatus | null = null,
): TrayPresentation {
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

  const updateItems = describeUpdate(update, strings, actions);

  return {
    tooltip: degraded ? strings.tooltipDegraded : strings.tooltip,
    title: degraded ? '⚠︎' : '',
    menu: [
      ...warning,
      ...(updateItems.length ? [...updateItems, { type: 'separator' } satisfies MenuItemConstructorOptions] : []),
      { label: strings.open, click: actions.toggle },
      { label: strings.checkForUpdates, click: actions.checkForUpdates },
      { type: 'separator' },
      { label: strings.quit, click: actions.quit },
    ],
  };
}

/** The update entry at the top of the menu: an action while an update is offered, progress while applied. */
function describeUpdate(update: UpdateStatus | null, strings: TrayStrings, actions: TrayActions): MenuItemConstructorOptions[] {
  switch (update?.state) {
    case 'available':
      if (update.update.skipped) return [];
      return update.canInstall && !update.installFailed
        ? [{ label: strings.installUpdate(update.update.version), click: actions.installUpdate }]
        : [{ label: strings.downloadUpdate(update.update.version), click: actions.downloadUpdate }];
    case 'downloading':
      return [{ label: strings.downloadingUpdate(update.update.version, update.percent), enabled: false }];
    case 'installing':
      return [{ label: strings.installingUpdate(update.update.version), enabled: false }];
    default:
      return [];
  }
}
