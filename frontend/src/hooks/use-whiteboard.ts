const STORAGE_KEY = "whiteboard-data";
const TTL_MS = 60 * 60 * 1000; // 1 hour

export interface WhiteboardData {
  elements?: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

interface StoredEntry {
  data: WhiteboardData;
  savedAt: number;
}

export function loadWhiteboard(): WhiteboardData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const entry: StoredEntry = JSON.parse(raw);
    if (Date.now() - entry.savedAt > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return {};
    }
    return entry.data ?? {};
  } catch {
    return {};
  }
}

export function saveWhiteboard(data: WhiteboardData): void {
  try {
    const entry: StoredEntry = { data, savedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // localStorage quota exceeded — silently ignore
  }
}
