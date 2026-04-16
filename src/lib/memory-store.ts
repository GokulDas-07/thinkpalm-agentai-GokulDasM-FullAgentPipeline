import fs from "fs";
import path from "path";

const MEMORY_FILE = path.join(process.cwd(), ".memory-store.json");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function persistToFile(key: string, value: any): void {
  try {
    let current: Record<string, unknown> = {};
    if (fs.existsSync(MEMORY_FILE)) {
      const raw = fs.readFileSync(MEMORY_FILE, "utf-8");
      current = raw.trim()
        ? (JSON.parse(raw) as Record<string, unknown>)
        : {};
    }
    current[key] = value;
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(current, null, 2), "utf-8");
  } catch (error) {
    console.error("memory-store: persistToFile failed", error);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readFromFile(key: string): any {
  try {
    if (!fs.existsSync(MEMORY_FILE)) {
      return null;
    }
    const raw = fs.readFileSync(MEMORY_FILE, "utf-8");
    if (!raw.trim()) {
      return null;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return key in parsed ? parsed[key] : null;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAllFromFile(): Record<string, any> {
  try {
    if (!fs.existsSync(MEMORY_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(MEMORY_FILE, "utf-8");
    if (!raw.trim()) {
      return {};
    }
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
