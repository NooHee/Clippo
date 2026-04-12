import { clipboard } from 'electron';
import { execSync } from 'child_process';
import { insertEntry } from './db';
import { loadSettings } from './settings';
import type { ClipboardEntry } from '../shared/types';

type OnNewEntryCallback = (entry: ClipboardEntry) => void;

export class ClipboardService {
  private lastText = '';
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly onNewEntry: OnNewEntryCallback;
  private pollIntervalMs: number;

  constructor(onNewEntry: OnNewEntryCallback, pollIntervalMs = 500) {
    this.onNewEntry = onNewEntry;
    this.pollIntervalMs = pollIntervalMs;
  }

  start(): void {
    this.lastText = clipboard.readText();
    this.intervalId = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  updateInterval(pollIntervalMs: number): void {
    this.pollIntervalMs = pollIntervalMs;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = setInterval(() => this.poll(), this.pollIntervalMs);
    }
  }

  private poll(): void {
    const text = clipboard.readText();

    if (!text || text === this.lastText) return;

    const { ignoredApps } = loadSettings();
    if (ignoredApps.length > 0) {
      try {
        const activeApp = execSync(
          `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
          { timeout: 200 }
        ).toString().trim();
        if (ignoredApps.some((a) => activeApp.toLowerCase() === a.toLowerCase())) {
          this.lastText = text;
          return;
        }
      } catch {
        // accessibility not granted or timeout — allow the entry
      }
    }

    this.lastText = text;

    const entry = insertEntry(text, 'text');
    if (entry) {
      this.onNewEntry(entry);
    }
  }

  writeToClipboard(text: string): void {
    this.lastText = text;
    clipboard.writeText(text);
  }
}
