import { executeDailyCrawl } from "../app/lib/server/crawl/daily-crawl";
import {
  closeAppDatabase,
  createAppDatabase,
  runMigrations,
} from "../app/lib/server/db";

const db = createAppDatabase();
await runMigrations(db);

try {
  const result = await executeDailyCrawl(db);
  console.log(JSON.stringify(result, null, 2));
} finally {
  closeAppDatabase(db);
}
