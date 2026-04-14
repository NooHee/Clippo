import { clipboard } from 'electron';
import { execSync } from 'child_process';
import crypto from 'crypto';
import { insertEntry } from './db';
import { loadSettings } from './settings';
import { saveClipboardImage } from './imageHandler';
import type { ClipboardEntry } from '../shared/types';

type OnNewEntryCallback = (entry: ClipboardEntry) => void;

export class ClipboardService {
  private lastText = '';
  private lastImageHash = '';
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

    // Check for images first
    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      // Compute image hash to detect duplicates
      const png = image.toPNG();
      const imageHash = crypto.createHash('md5').update(png).digest('hex');

      // Only process if image has changed
      if (imageHash !== this.lastImageHash) {
        this.lastImageHash = imageHash;
        const imageResult = saveClipboardImage();
        if (imageResult) {
          const { ignoredApps } = loadSettings();
          if (ignoredApps.length > 0) {
            try {
              const activeApp = execSync(
                `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
                { timeout: 200 }
              ).toString().trim();
              if (ignoredApps.some((a) => activeApp.toLowerCase() === a.toLowerCase())) {
                return;
              }
            } catch {
              // accessibility not granted or timeout — allow the entry
            }
          }

          const entry = insertEntry(imageResult.imageName, 'image', imageResult.imageName);
          if (entry) {
            this.onNewEntry(entry);
          }
          return;
        }
      }
    }

    // Then check for text
    if (!text || text === this.lastText) return;

    // Reset image hash when text is copied (different content type)
    this.lastImageHash = '';

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
