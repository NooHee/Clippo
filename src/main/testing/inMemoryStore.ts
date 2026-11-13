import type { DocumentStore } from '../storage/persistentJsonStore';

/** Test double for PersistentJsonStore: keeps the value in memory and counts save requests. */
export class InMemoryStore<T> implements DocumentStore<T> {
  saveRequests = 0;

  constructor(private value: T) {}

  get(): T {
    return this.value;
  }

  set(value: T): void {
    this.value = value;
    this.saveRequests++;
  }

  scheduleSave(): void {
    this.saveRequests++;
  }
}
