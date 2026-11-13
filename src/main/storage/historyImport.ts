import type { HistoryRepository } from './historyRepository';
import { isEntryType } from './historyRepository';
import { isRecord, isString } from './guards';

export interface ImportResult {
  success: boolean;
  imported: number;
  duplicates: number;
  errors: string[];
}

/** Imports a history export (JSON array), skipping invalid items and duplicates. */
export function importHistory(history: Pick<HistoryRepository, 'contains' | 'insert'>, json: unknown): ImportResult {
  if (!Array.isArray(json)) {
    return { success: false, imported: 0, duplicates: 0, errors: ['Invalid file format: expected array'] };
  }

  const result: ImportResult = { success: true, imported: 0, duplicates: 0, errors: [] };
  json.forEach((item: unknown, index) => {
    if (!isRecord(item)) {
      result.errors.push(`Item ${index}: invalid structure`);
      return;
    }
    const { content, type } = item;
    if (!isString(content) || !content || !isEntryType(type)) {
      result.errors.push(`Item ${index}: missing or invalid fields`);
      return;
    }
    if (history.contains(content)) {
      result.duplicates++;
      return;
    }
    history.insert(content, type);
    result.imported++;
  });
  return result;
}
