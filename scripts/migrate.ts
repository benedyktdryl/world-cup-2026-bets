import {
  closeAppDatabase,
  createAppDatabase,
  getDatabasePath,
  runMigrations,
} from "../app/lib/server/db";

const db = createAppDatabase();

try {
  await runMigrations(db);
  console.log(`Migrated database at ${getDatabasePath()}`);
} finally {
  closeAppDatabase(db);
}
