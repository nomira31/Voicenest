import * as SQLite from "expo-sqlite";

export type Category = "All" | "People" | "Motivation" | "Reminders";

export interface RecordingRecord {
  id: string;
  title: string;
  uri: string;
  durationMillis: number;
  category: "People" | "Motivation" | "Reminders";
  surface: "surfaceSky" | "surfacePeach" | "surfaceTeal" | "surfaceYellow";
  icon: string;
  favorite: number; // 0 or 1
  synced: number;   // 0 (local only) or 1 (synced online)
  createdAt: number; // epoch ms
}

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync("voicenest.db");
    await dbInstance.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS recordings (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        uri TEXT NOT NULL,
        durationMillis INTEGER NOT NULL,
        category TEXT NOT NULL,
        surface TEXT NOT NULL,
        icon TEXT NOT NULL,
        favorite INTEGER DEFAULT 0,
        synced INTEGER DEFAULT 0,
        createdAt INTEGER NOT NULL
      );
    `);
  }
  return dbInstance;
}

export async function fetchAllRecordings(): Promise<RecordingRecord[]> {
  const db = await getDatabase();
  return db.getAllAsync<RecordingRecord>(
    "SELECT * FROM recordings ORDER BY createdAt DESC;"
  );
}

export async function insertRecording(record: RecordingRecord): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO recordings (id, title, uri, durationMillis, category, surface, icon, favorite, synced, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      record.id,
      record.title,
      record.uri,
      record.durationMillis,
      record.category,
      record.surface,
      record.icon,
      record.favorite,
      record.synced,
      record.createdAt,
    ]
  );
}

export async function updateRecordingDb(
  id: string,
  updates: Partial<Pick<RecordingRecord, "title" | "category" | "favorite" | "synced">>
): Promise<void> {
  const db = await getDatabase();
  const keys = Object.keys(updates);
  if (keys.length === 0) return;

  const setClause = keys.map((key) => `${key} = ?`).join(", ");
  const values = [...Object.values(updates), id];

  await db.runAsync(`UPDATE recordings SET ${setClause} WHERE id = ?;`, values as any);
}

export async function deleteRecordingDb(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM recordings WHERE id = ?;", [id]);
}