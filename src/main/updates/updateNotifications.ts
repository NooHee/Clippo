import type { AvailableUpdate, Settings } from '../../shared/types';

type Language = Settings['language'];

export interface NotificationText {
  title: string;
  body: string;
}

export type UpdateNotice =
  | { kind: 'available'; update: AvailableUpdate; canInstall: boolean }
  | { kind: 'up-to-date'; currentVersion: string }
  | { kind: 'check-failed' };

interface NoticeStrings {
  availableTitle: (version: string) => string;
  availableInstallBody: string;
  availableDownloadBody: string;
  upToDateTitle: string;
  upToDateBody: (version: string) => string;
  checkFailedTitle: string;
  checkFailedBody: string;
}

/** The main process does not load i18next, so these few texts follow the language setting here. */
const STRINGS: Record<Language, NoticeStrings> = {
  en: {
    availableTitle: (version) => `Clippo ${version} is available`,
    availableInstallBody: 'Click to update. Clippo restarts on its own.',
    availableDownloadBody: 'Click to download the new version.',
    upToDateTitle: 'Clippo is up to date',
    upToDateBody: (version) => `You are running the latest version (${version}).`,
    checkFailedTitle: 'Could not check for updates',
    checkFailedBody: 'Check your internet connection and try again.',
  },
  fr: {
    availableTitle: (version) => `Clippo ${version} est disponible`,
    availableInstallBody: 'Cliquez pour mettre à jour. Clippo redémarre tout seul.',
    availableDownloadBody: 'Cliquez pour télécharger la nouvelle version.',
    upToDateTitle: 'Clippo est à jour',
    upToDateBody: (version) => `Vous utilisez la dernière version (${version}).`,
    checkFailedTitle: 'Impossible de rechercher les mises à jour',
    checkFailedBody: 'Vérifiez votre connexion internet et réessayez.',
  },
};

export function describeUpdateNotice(notice: UpdateNotice, language: Language): NotificationText {
  const strings = STRINGS[language];
  switch (notice.kind) {
    case 'available':
      return {
        title: strings.availableTitle(notice.update.version),
        body: notice.canInstall ? strings.availableInstallBody : strings.availableDownloadBody,
      };
    case 'up-to-date':
      return { title: strings.upToDateTitle, body: strings.upToDateBody(notice.currentVersion) };
    case 'check-failed':
      return { title: strings.checkFailedTitle, body: strings.checkFailedBody };
  }
}
