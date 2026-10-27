import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  validateSettings,
  type Settings,
  type SavedExperiment,
  type UploadedFont,
} from "./model";

interface WorkspaceDB extends DBSchema {
  current: { key: string; value: Settings };
  experiments: { key: string; value: SavedExperiment };
  uploads: { key: string; value: UploadedFont };
}
let connection: ReturnType<typeof openDB<WorkspaceDB>> | undefined;
let readyConnection: IDBPDatabase<WorkspaceDB> | undefined;
const database = () => {
  if (connection) return connection;
  const opening = openDB<WorkspaceDB>("counterform", 1, {
    upgrade(db) {
      db.createObjectStore("current");
      db.createObjectStore("experiments", { keyPath: "id" });
      db.createObjectStore("uploads", { keyPath: "id" });
    },
    blocking() {
      void opening.then((db) => db.close());
      if (connection === opening) {
        connection = undefined;
        readyConnection = undefined;
      }
    },
    terminated() {
      if (connection === opening) {
        connection = undefined;
        readyConnection = undefined;
      }
    },
  });
  connection = opening;
  void opening.then(
    (db) => {
      if (connection === opening) readyConnection = db;
    },
    () => {
      if (connection === opening) connection = undefined;
    },
  );
  return opening;
};
async function persist<T>(
  action: (db: Awaited<ReturnType<typeof database>>) => Promise<T>,
) {
  try {
    // With an open workspace, dispatch writes synchronously even from pagehide.
    // Awaiting an already-resolved opening promise would still defer that dispatch.
    const db = readyConnection ?? (await database());
    return await action(db);
  } catch (error) {
    throw new Error(
      "Your changes could not be saved in this browser. Check available storage or export a backup before closing.",
      { cause: error },
    );
  }
}
export async function loadWorkspace(): Promise<{
  current: Settings | null;
  resetRecovery: Settings | null;
  saved: SavedExperiment[];
  uploads: UploadedFont[];
}> {
  try {
    const db = await database();
    const transaction = db.transaction(
      ["current", "experiments", "uploads"],
      "readonly",
    );
    const [current, resetRecovery, saved, uploads] = await Promise.all([
      transaction.objectStore("current").get("active"),
      transaction.objectStore("current").get("resetRecovery"),
      transaction.objectStore("experiments").getAll(),
      transaction.objectStore("uploads").getAll(),
    ]);
    await transaction.done;
    return {
      current: current ? validateSettings(current) : null,
      resetRecovery: resetRecovery ? validateSettings(resetRecovery) : null,
      saved: saved
        .map((s) => ({ ...s, settings: validateSettings(s.settings) }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      uploads,
    };
  } catch (error) {
    throw new Error(
      "Counterform could not read this browser’s saved work. Existing storage has not been changed.",
      { cause: error },
    );
  }
}
export const saveCurrent = (
  settings: Settings,
  resetRecovery: Settings | null = null,
  expectedRecovery?: Settings,
  onGuardResolved?: (matched: boolean) => void,
) =>
  persist(async (db) => {
    const current = validateSettings(settings);
    const recovery = resetRecovery ? validateSettings(resetRecovery) : null;
    const expected = expectedRecovery
      ? validateSettings(expectedRecovery)
      : null;
    const transaction = db.transaction("current", "readwrite");
    const writes: Promise<unknown>[] = [];
    try {
      if (expected) {
        const stored = await transaction.store.get("resetRecovery");
        let matched = false;
        try {
          matched = Boolean(
            stored &&
            JSON.stringify(validateSettings(stored)) ===
              JSON.stringify(expected),
          );
        } catch {
          /* A malformed checkpoint is not safe to restore. */
        }
        onGuardResolved?.(matched);
        if (!matched) {
          await transaction.done;
          return false;
        }
      }
      // Dispatch both requests before awaiting completion. Keeping this connection
      // lets IndexedDB order saves even while an older JS acknowledgement is pending.
      writes.push(transaction.store.put(current, "active"));
      writes.push(
        recovery
          ? transaction.store.put(recovery, "resetRecovery")
          : transaction.store.delete("resetRecovery"),
      );
      await Promise.all([...writes, transaction.done]);
      return true;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        /* The browser may already have aborted. */
      }
      await Promise.allSettled([...writes, transaction.done]);
      throw error;
    }
  });
export const saveExperiment = (experiment: SavedExperiment) =>
  persist((db) =>
    db.put("experiments", {
      ...experiment,
      settings: validateSettings(experiment.settings),
    }),
  );
export const deleteExperiment = (id: string) =>
  persist((db) => db.delete("experiments", id));
export const saveUpload = (font: UploadedFont) =>
  persist((db) => db.put("uploads", font));
export const deleteUpload = (id: string) =>
  persist((db) => db.delete("uploads", id));
