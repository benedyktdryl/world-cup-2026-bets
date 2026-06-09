import {
  createAppDatabase,
  getDatabasePath,
  runMigrations,
} from "../app/lib/server/db";

const db = createAppDatabase();

try {
  runMigrations(db);
  console.log(`Migrated SQLite database at ${getDatabasePath()}`);
} finally {
  db.close();
}
