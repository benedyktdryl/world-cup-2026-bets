import { executeDailyCrawl } from "~/lib/server/crawl/daily-crawl";
import { withDatabase } from "~/lib/server/db";
import { env } from "~/lib/server/env";
import type { Route } from "./+types/api.cron.crawl";

export async function loader({ request }: Route.LoaderArgs) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = env("CRON_SECRET");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await withDatabase((db) => executeDailyCrawl(db));
  return Response.json({ ok: true, result });
}
