import { DatabaseSync } from 'node:sqlite';

const maxPendingJobs = 20;
const retentionMs = 7 * 24 * 60 * 60 * 1000;

export function openWebhookQueue(filename) {
  // Use a separate SQLite file for the worker lock so enqueue and completion
  // can commit independently. The OS releases this lock if the worker exits.
  const lock = filename === ':memory:' ? null : new DatabaseSync(`${filename}.worker`);
  let db;
  try {
    lock?.exec('PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE');
    db = new DatabaseSync(filename);
    db.exec(`
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY,
        job TEXT,
        available_at INTEGER NOT NULL,
        completed_at INTEGER
      );
    `);
  } catch (error) {
    db?.close();
    lock?.close();
    throw error;
  }

  const discardExpired = db.prepare('DELETE FROM deliveries WHERE completed_at <= ?');
  const find = db.prepare('SELECT 1 FROM deliveries WHERE id = ?');
  const count = db.prepare('SELECT count(*) AS pending FROM deliveries WHERE completed_at IS NULL');
  const insert = db.prepare('INSERT INTO deliveries (id, job, available_at) VALUES (?, ?, ?)');
  const next = db.prepare(`
    SELECT id, job, available_at FROM deliveries
    WHERE completed_at IS NULL ORDER BY available_at, rowid LIMIT 1
  `);
  const complete = db.prepare('UPDATE deliveries SET job = NULL, completed_at = ? WHERE id = ?');
  const retry = db.prepare('UPDATE deliveries SET available_at = ? WHERE id = ?');

  return {
    accept(id, job, now) {
      discardExpired.run(now - retentionMs);
      if (find.get(id)) return 'duplicate';
      if (count.get().pending >= maxPendingJobs) return 'full';
      insert.run(id, JSON.stringify(job), now);
      return 'queued';
    },
    next: () => next.get(),
    complete: (id, now) => complete.run(now, id),
    retry: (id, at) => retry.run(at, id),
    close() {
      db.close();
      lock?.close();
    },
  };
}
