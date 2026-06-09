import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AppDatabase, createAppDatabase, runMigrations } from "../db";
import {
  crawlFlashscoreCompetition,
  extractSummaryFeeds,
  parseFeedEvents,
} from "./flashscore";

const sampleResultsFeed =
  "SA÷1¬~AA÷ev_result_1¬AD÷1773079200¬AB÷3¬ER÷Group A¬PY÷away1¬AF÷Away One¬WV÷away-one¬PX÷home1¬AE÷Home One¬WU÷home-one¬AS÷1¬AG÷2¬";
const sampleFixturesFeed =
  "SA÷1¬~AA÷ev_fix_1¬AD÷1773421200¬AB÷1¬ER÷Group A¬PY÷away2¬AF÷Away Two¬WV÷away-two¬PX÷home2¬AE÷Home Two¬WU÷home-two¬";
const realFixtureEventFeed =
  "SA÷1¬~AA÷G2g1DVWo¬AD÷1773505800¬AB÷1¬CR÷1¬AC÷1¬CX÷GKS Katowice¬ER÷Round 25¬WN÷GDA¬PY÷GGLmkiK8¬AF÷Lechia Gdansk¬WV÷lechia-gdansk¬WM÷KAT¬PX÷K4AgRmS1¬AE÷GKS Katowice¬WU÷gks-katowice¬";
const sampleCompetitionHtml = `
<script>
if(!cjs.initialFeeds){cjs.initialFeeds=[];}
cjs.initialFeeds["summary-results"] = { data: \`${sampleResultsFeed}\`, allEventsCount: 1 };
cjs.initialFeeds["summary-fixtures"] = { data: \`${sampleFixturesFeed}\`, allEventsCount: 1 };
</script>
`;

const tempDirs: string[] = [];

function createTestDatabase(): AppDatabase {
  const dir = mkdtempSync(join(tmpdir(), "world-cup-crawl-"));
  tempDirs.push(dir);
  const db = createAppDatabase(join(dir, "test.sqlite"));
  runMigrations(db);
  return db;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("flashscore feed parsing", () => {
  test("keeps home and away teams aligned with Flashscore token order", () => {
    const events = parseFeedEvents(realFixtureEventFeed);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventId: "G2g1DVWo",
      homeTeamName: "GKS Katowice",
      awayTeamName: "Lechia Gdansk",
      homeTeamSlug: "gks-katowice",
      awayTeamSlug: "lechia-gdansk",
    });
  });

  test("extracts summary results and fixtures from competition html", () => {
    expect(extractSummaryFeeds(sampleCompetitionHtml)).toEqual({
      results: [
        expect.objectContaining({
          eventId: "ev_result_1",
          homeTeamName: "Home One",
          awayTeamName: "Away One",
          homeGoals: 2,
          awayGoals: 1,
        }),
      ],
      fixtures: [
        expect.objectContaining({
          eventId: "ev_fix_1",
          homeTeamName: "Home Two",
          awayTeamName: "Away Two",
        }),
      ],
    });
  });

  test("crawlFlashscoreCompetition upserts teams, matches, cache, and job state", async () => {
    const db = createTestDatabase();
    const urls = new Map([
      [
        "https://www.flashscore.com/football/world/world-cup/",
        sampleCompetitionHtml,
      ],
    ]);
    const fetchImpl = (async (input) => {
      const body = urls.get(String(input));
      return new Response(body ?? "not found", { status: body ? 200 : 404 });
    }) as typeof fetch;

    const result = await crawlFlashscoreCompetition(db, {
      competitionName: "World Cup",
      sourceUrl: "https://www.flashscore.com/football/world/world-cup/",
      baseUrl: "https://www.flashscore.com",
      fetchImpl,
      minDelayMs: 0,
      retries: 0,
    });

    expect(result).toEqual({
      teams: 4,
      matches: 2,
      jobStatus: "SUCCEEDED",
    });

    expect(
      db
        .query<{ total: number }, []>("SELECT COUNT(*) AS total FROM teams")
        .get()?.total,
    ).toBe(4);
    expect(
      db
        .query<{ total: number }, []>("SELECT COUNT(*) AS total FROM matches")
        .get()?.total,
    ).toBe(2);
    expect(
      db
        .query<{ total: number }, []>(
          "SELECT COUNT(*) AS total FROM scraped_pages",
        )
        .get()?.total,
    ).toBe(1);
    expect(
      db.query<{ status: string }, []>("SELECT status FROM crawl_jobs").get(),
    ).toEqual({ status: "SUCCEEDED" });

    db.close();
  });
});
