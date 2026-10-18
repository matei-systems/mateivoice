import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/config/env";

/**
 * Austauschbarer Dateispeicher. Lokal: Verzeichnis außerhalb von /public,
 * Auslieferung nur über die autorisierende Route /media/[id].
 * Später: S3-kompatibler Objektspeicher mit privaten Buckets.
 */
export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

const KEY_PATTERN = /^media\/[0-9a-f-]{36}\.webp$/;

function assertKey(key: string) {
  // Schutz gegen Path Traversal: nur generierte Schlüssel zulassen.
  if (!KEY_PATTERN.test(key)) throw new Error("Ungültiger Speicherschlüssel");
}

function localAdapter(baseDir: string): StorageAdapter {
  const root = path.resolve(baseDir);
  const resolve = (key: string) => {
    assertKey(key);
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error("Ungültiger Speicherpfad");
    return full;
  };
  return {
    async put(key, data) {
      const full = resolve(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, data, { flag: "wx" });
    },
    async get(key) {
      try {
        return await readFile(resolve(key));
      } catch {
        return null;
      }
    },
    async delete(key) {
      await rm(resolve(key), { force: true });
    },
  };
}

export function getStorage(): StorageAdapter {
  return localAdapter(getEnv().STORAGE_LOCAL_DIR);
}

export function mediaKey(id: string) {
  return `media/${id}.webp`;
}
