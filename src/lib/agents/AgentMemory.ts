export type PrdHistoryEntry = {
  prdText: string;
  pageTitle: string;
  componentCount: number;
  createdAt: string;
};

export class AgentMemory {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- session store holds heterogeneous agent state
  private store: Map<string, any>;
  private readonly STORAGE_KEY = "spectoui_memory";

  constructor() {
    this.store = new Map();
    this.tryRehydratePrdHistory();
  }

  private tryRehydratePrdHistory(): void {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return;
      }
      const raw = window.localStorage.getItem(this.STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const history = parsed?.prd_history;
      if (Array.isArray(history)) {
        this.store.set("prd_history", history);
      }
    } catch {
      // localStorage missing, denied, or invalid JSON (SSR / privacy mode)
    }
  }

  private persistPrdHistory(value: unknown): void {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return;
      }
      window.localStorage.setItem(
        this.STORAGE_KEY,
        JSON.stringify({ prd_history: value }),
      );
    } catch {
      // ignore persistence failures
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set(key: string, value: any): void {
    this.store.set(key, value);
    if (key === "prd_history") {
      this.persistPrdHistory(value);
    }
  }

  get<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAll(): Record<string, any> {
    return Object.fromEntries(this.store);
  }

  clear(keepHistory = true): void {
    if (keepHistory) {
      for (const key of [...this.store.keys()]) {
        if (key !== "prd_history") {
          this.store.delete(key);
        }
      }
      return;
    }
    this.store.clear();
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(this.STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }

  addToPrdHistory(entry: PrdHistoryEntry): void {
    const current = this.get<PrdHistoryEntry[]>("prd_history") ?? [];
    const next = [entry, ...current].slice(0, 10);
    this.set("prd_history", next);
  }

  getPrdHistory(): PrdHistoryEntry[] {
    return this.get<PrdHistoryEntry[]>("prd_history") ?? [];
  }
}

export const agentMemory = new AgentMemory();
