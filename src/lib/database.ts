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
  synced: number; // 0 (local only) or 1 (synced online)
  createdAt: number; // epoch ms
}

// Raw alarm row. Arrays are stored as JSON text, booleans as 0/1.
export interface AlarmRow {
  id: string;
  title: string;
  hour: number;
  minute: number;
  weekdays: string; // JSON number[]
  enabled: number; // 0 or 1
  delivery: string;
  notificationIds: string; // JSON string[]
  nextFireAt: number | null;
  createdAt: number;
  recordingId: string | null;
  recordingUri: string | null;
  recordingTitle: string | null;
  soundUri: string | null;
  snoozeMinutes: number;
  volume: number;
  repeatRecording: number;
  recordingDurationMillis: number | null;
  gradualVolume: number;
  startingVolume: number;
  volumeRampDurationSeconds: number;
}

let dbInstance: SQLite.SQLiteDatabase | null = null;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync("voicenest.db");
      await db.execAsync(`
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
        CREATE TABLE IF NOT EXISTS alarms (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          hour INTEGER NOT NULL,
          minute INTEGER NOT NULL,
          weekdays TEXT NOT NULL DEFAULT '[]',
          enabled INTEGER NOT NULL DEFAULT 1,
          delivery TEXT NOT NULL DEFAULT 'notification',
          notificationIds TEXT NOT NULL DEFAULT '[]',
          nextFireAt INTEGER,
          createdAt INTEGER NOT NULL,
          recordingId TEXT,
          recordingUri TEXT,
          recordingTitle TEXT,
          soundUri TEXT,
          snoozeMinutes INTEGER NOT NULL DEFAULT 10,
          volume REAL NOT NULL DEFAULT 1,
          repeatRecording INTEGER NOT NULL DEFAULT 1,
          recordingDurationMillis INTEGER,
          gradualVolume INTEGER NOT NULL DEFAULT 1,
          startingVolume REAL NOT NULL DEFAULT 0.1,
          volumeRampDurationSeconds INTEGER NOT NULL DEFAULT 30
        );
      `);

      const alarmColumns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(alarms);");
      const existingColumns = new Set(alarmColumns.map((column) => column.name));
      const migrations: Array<[string, string]> = [
        ["snoozeMinutes", "INTEGER NOT NULL DEFAULT 10"],
        ["volume", "REAL NOT NULL DEFAULT 1"],
        ["repeatRecording", "INTEGER NOT NULL DEFAULT 1"],
        ["recordingDurationMillis", "INTEGER"],
        ["gradualVolume", "INTEGER NOT NULL DEFAULT 1"],
        ["startingVolume", "REAL NOT NULL DEFAULT 0.1"],
        ["volumeRampDurationSeconds", "INTEGER NOT NULL DEFAULT 30"],
      ];

      for (const [name, definition] of migrations) {
        if (!existingColumns.has(name)) {
          await db.execAsync(`ALTER TABLE alarms ADD COLUMN ${name} ${definition};`);
        }
      }

      dbInstance = db;
      return db;
    })().catch((error) => {
      dbPromise = null; // allow a retry after a failed open
      throw error;
    });
  }
  return dbPromise;
}

/* ───────────── Recordings ───────────── */

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

/* ───────────── Alarms ───────────── */

export async function fetchAllAlarmRows(): Promise<AlarmRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<AlarmRow>(
    "SELECT * FROM alarms ORDER BY hour ASC, minute ASC;"
  );
}

export async function upsertAlarmRow(row: AlarmRow): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO alarms
      (id, title, hour, minute, weekdays, enabled, delivery, notificationIds, nextFireAt, createdAt, recordingId, recordingUri, recordingTitle, soundUri, snoozeMinutes, volume, repeatRecording, recordingDurationMillis, gradualVolume, startingVolume, volumeRampDurationSeconds)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      row.id,
      row.title,
      row.hour,
      row.minute,
      row.weekdays,
      row.enabled,
      row.delivery,
      row.notificationIds,
      row.nextFireAt,
      row.createdAt,
      row.recordingId,
      row.recordingUri,
      row.recordingTitle,
      row.soundUri,
      row.snoozeMinutes,
      row.volume,
      row.repeatRecording,
      row.recordingDurationMillis,
      row.gradualVolume,
      row.startingVolume,
      row.volumeRampDurationSeconds,
    ]
  );
}

export async function deleteAlarmRow(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM alarms WHERE id = ?;", [id]);
}