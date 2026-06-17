import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getLeaderboard, upsertBet } from "../betting";
import {
  type AppDatabase,
  closeAppDatabase,
  createAppDatabase,
  runMigrations,
} from "../db";
import { sqlGet, sqlRun } from "../sql";
import {
  collectFinalsEvents,
  crawlFlashscoreCompetition,
  extractInitialFeedData,
  extractSummaryFeeds,
  filterWorldCup2026FinalsEvents,
  getTournamentFixturesPageUrl,
  isWorldCup2026FinalsKickoff,
  parseFeedEvents,
} from "./flashscore";

const mexicoOpenerUnix = 1_781_204_400;
const secondFinalsFixtureUnix = 1_781_229_600;
const thirdFinalsFixtureUnix = 1_781_316_000;
const qualifierUnix = 1_763_514_000;

const sampleResultsFeed = `SA÷1¬~AA÷ev_result_1¬AD÷${mexicoOpenerUnix}¬AB÷3¬ER÷Round 1¬PY÷away1¬AF÷Away One¬WV÷away-one¬PX÷home1¬AE÷Home One¬WU÷home-one¬AG÷2¬AH÷1¬`;
const sampleFixturesFeed = `SA÷1¬~AA÷ev_fix_1¬AD÷${secondFinalsFixtureUnix}¬AB÷1¬ER÷Round 1¬PY÷away2¬AF÷Away Two¬WV÷away-two¬PX÷home2¬AE÷Home Two¬WU÷home-two¬`;
const extraFixturesFeed = `SA÷1¬~AA÷ev_fix_1¬AD÷${secondFinalsFixtureUnix}¬AB÷1¬ER÷Round 1¬PY÷away2¬AF÷Away Two¬WV÷away-two¬PX÷home2¬AE÷Home Two¬WU÷home-two¬~AA÷ev_fix_2¬AD÷${thirdFinalsFixtureUnix}¬AB÷1¬ER÷Round 1¬PY÷away3¬AF÷Away Three¬WV÷away-three¬PX÷home3¬AE÷Home Three¬WU÷home-three¬`;
const qualifierFeed = `SA÷1¬~AA÷ev_qual_1¬AD÷${qualifierUnix}¬AB÷3¬ER÷Round 6¬PY÷awayQ¬AF÷Curacao¬WV÷curacao¬PX÷homeQ¬AE÷Jamaica¬WU÷jamaica¬AG÷0¬AH÷0¬`;
const realFixtureEventFeed =
  "SA÷1¬~AA÷G2g1DVWo¬AD÷1773505800¬AB÷1¬CR÷1¬AC÷1¬CX÷GKS Katowice¬ER÷Round 25¬WN÷GDA¬PY÷GGLmkiK8¬AF÷Lechia Gdansk¬WV÷lechia-gdansk¬WM÷KAT¬PX÷K4AgRmS1¬AE÷GKS Katowice¬WU÷gks-katowice¬";
const realMexicoOpenerResultFeed =
  "SA÷1¬~AA÷h4EoUB7T¬AD÷1781204400¬AB÷3¬ER÷Round 1¬PY÷W2ijYvlr¬AF÷South Africa¬WV÷south-africa¬PX÷O6iHcNkd¬AE÷Mexico¬WU÷mexico¬AS÷1¬AG÷2¬AH÷0¬";
const sampleCompetitionHtml = `
<script>
if(!cjs.initialFeeds){cjs.initialFeeds=[];}
cjs.initialFeeds["summary-results"] = { data: \`${sampleResultsFeed}\`, allEventsCount: 1 };
cjs.initialFeeds["summary-fixtures"] = { data: \`${sampleFixturesFeed}\`, allEventsCount: 1 };
</script>
`;
const sampleFixturesPageHtml = `
<script>
cjs.initialFeeds['fixtures'] = { data: \`${extraFixturesFeed}\`, allEventsCount: 2 };
</script>
`;
const realMexicoResultHtml = `
<script>
cjs.initialFeeds["summary-results"] = { data: \`${realMexicoOpenerResultFeed}\`, allEventsCount: 1 };
</script>
`;
const competitionUrl =
  "https://www.flashscore.com/football/world/world-championship/";
const fixturesPageUrl = getTournamentFixturesPageUrl(competitionUrl);

const tempDirs: string[] = [];

async function createTestDatabase(): Promise<AppDatabase> {
  const dir = mkdtempSync(join(tmpdir(), "world-cup-crawl-"));
  tempDirs.push(dir);
  const db = createAppDatabase(join(dir, "test.sqlite"));
  await runMigrations(db);
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

  test("reads finished scores from home and away score tokens", () => {
    const events = parseFeedEvents(realMexicoOpenerResultFeed);

    expect(events[0]).toMatchObject({
      eventId: "h4EoUB7T",
      homeTeamName: "Mexico",
      awayTeamName: "South Africa",
      homeGoals: 2,
      awayGoals: 0,
    });
  });

  test("keeps only World Cup 2026 finals kickoffs inside the tournament window", () => {
    expect(isWorldCup2026FinalsKickoff(mexicoOpenerUnix)).toBe(true);
    expect(isWorldCup2026FinalsKickoff(qualifierUnix)).toBe(false);

    const filtered = filterWorldCup2026FinalsEvents([
      ...parseFeedEvents(sampleResultsFeed),
      ...parseFeedEvents(qualifierFeed),
    ]);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.homeTeamName).toBe("Home One");
  });

  test("extractInitialFeedData supports single-quoted feed keys", () => {
    expect(
      extractInitialFeedData(sampleFixturesPageHtml, "fixtures"),
    ).toContain("ev_fix_2");
  });

  test("collectFinalsEvents merges summary and full fixtures page feeds", () => {
    const events = collectFinalsEvents({
      summaryHtml: sampleCompetitionHtml,
      fixturesHtml: sampleFixturesPageHtml,
    });

    expect(events.map((event) => event.eventId).sort()).toEqual([
      "ev_fix_1",
      "ev_fix_2",
      "ev_result_1",
    ]);
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
    const db = await createTestDatabase();
    const urls = new Map([
      [competitionUrl, sampleCompetitionHtml],
      [fixturesPageUrl, sampleFixturesPageHtml],
    ]);
    const fetchImpl = (async (input) => {
      const body = urls.get(String(input));
      return new Response(body ?? "not found", { status: body ? 200 : 404 });
    }) as typeof fetch;

    const result = await crawlFlashscoreCompetition(db, {
      competitionName: "World Cup 2026",
      sourceUrl: competitionUrl,
      baseUrl: "https://www.flashscore.com",
      fetchImpl,
      minDelayMs: 0,
      retries: 0,
    });

    expect(result).toEqual({
      teams: 6,
      matches: 3,
      jobStatus: "SUCCEEDED",
    });

    expect(
      (
        await sqlGet<{ total: number }>(
          db,
          "SELECT COUNT(*) AS total FROM teams",
        )
      )?.total,
    ).toBe(6);
    expect(
      (
        await sqlGet<{ total: number }>(
          db,
          "SELECT COUNT(*) AS total FROM matches",
        )
      )?.total,
    ).toBe(3);
    expect(
      (
        await sqlGet<{ total: number }>(
          db,
          "SELECT COUNT(*) AS total FROM scraped_pages",
        )
      )?.total,
    ).toBe(2);
    expect(
      await sqlGet<{ status: string }>(db, "SELECT status FROM crawl_jobs"),
    ).toEqual({ status: "SUCCEEDED" });

    closeAppDatabase(db);
  });

  test("crawlFlashscoreCompetition recalculates scores when crawled results finish existing matches", async () => {
    const db = await createTestDatabase();
    await sqlRun(
      db,
      `INSERT INTO profiles (user_id, email, display_name, role)
       VALUES (?, ?, ?, ?)`,
      ["user_ada", "ada@example.com", "Ada", "USER"],
    );
    await sqlRun(
      db,
      `INSERT INTO teams (id, source_id, name)
       VALUES (?, ?, ?)`,
      ["team_home1", "home1", "Home One"],
    );
    await sqlRun(
      db,
      `INSERT INTO teams (id, source_id, name)
       VALUES (?, ?, ?)`,
      ["team_away1", "away1", "Away One"],
    );
    await sqlRun(
      db,
      `INSERT INTO matches (
        id,
        source_id,
        stage,
        kickoff_at,
        home_team_id,
        away_team_id,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        "match_ev_result_1",
        "ev_result_1",
        "Round 1",
        mexicoOpenerUnix * 1000,
        "team_home1",
        "team_away1",
        "SCHEDULED",
      ],
    );
    await upsertBet(db, {
      userId: "user_ada",
      matchId: "match_ev_result_1",
      predictedHomeGoals: 2,
      predictedAwayGoals: 1,
      now: new Date("2026-06-10T12:00:00.000Z"),
    });
    const urls = new Map([
      [competitionUrl, sampleCompetitionHtml],
      [fixturesPageUrl, sampleFixturesPageHtml],
    ]);
    const fetchImpl = (async (input) => {
      const body = urls.get(String(input));
      return new Response(body ?? "not found", { status: body ? 200 : 404 });
    }) as typeof fetch;

    await crawlFlashscoreCompetition(db, {
      competitionName: "World Cup 2026",
      sourceUrl: competitionUrl,
      baseUrl: "https://www.flashscore.com",
      fetchImpl,
      minDelayMs: 0,
      retries: 0,
    });

    expect(await getLeaderboard(db)).toEqual([
      {
        userId: "user_ada",
        displayName: "Ada",
        points: 3,
        exactScores: 1,
        resultHits: 0,
        totalBets: 1,
      },
    ]);

    closeAppDatabase(db);
  });

  test("crawlFlashscoreCompetition awards result points for the real Mexico opener", async () => {
    const db = await createTestDatabase();
    await sqlRun(
      db,
      `INSERT INTO profiles (user_id, email, display_name, role)
       VALUES (?, ?, ?, ?)`,
      ["user_ada", "ada@example.com", "Ada", "USER"],
    );
    await sqlRun(
      db,
      `INSERT INTO teams (id, source_id, name)
       VALUES (?, ?, ?)`,
      ["team_o6ihcnkd", "O6iHcNkd", "Mexico"],
    );
    await sqlRun(
      db,
      `INSERT INTO teams (id, source_id, name)
       VALUES (?, ?, ?)`,
      ["team_w2ijyvlr", "W2ijYvlr", "South Africa"],
    );
    await sqlRun(
      db,
      `INSERT INTO matches (
        id,
        source_id,
        stage,
        kickoff_at,
        home_team_id,
        away_team_id,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        "match_h4eoub7t",
        "h4EoUB7T",
        "Round 1",
        mexicoOpenerUnix * 1000,
        "team_o6ihcnkd",
        "team_w2ijyvlr",
        "SCHEDULED",
      ],
    );
    await upsertBet(db, {
      userId: "user_ada",
      matchId: "match_h4eoub7t",
      predictedHomeGoals: 1,
      predictedAwayGoals: 0,
      now: new Date("2026-06-10T12:00:00.000Z"),
    });
    const urls = new Map([
      [competitionUrl, realMexicoResultHtml],
      [fixturesPageUrl, sampleFixturesPageHtml],
    ]);
    const fetchImpl = (async (input) => {
      const body = urls.get(String(input));
      return new Response(body ?? "not found", { status: body ? 200 : 404 });
    }) as typeof fetch;

    await crawlFlashscoreCompetition(db, {
      competitionName: "World Cup 2026",
      sourceUrl: competitionUrl,
      baseUrl: "https://www.flashscore.com",
      fetchImpl,
      minDelayMs: 0,
      retries: 0,
    });

    expect(await getLeaderboard(db)).toEqual([
      {
        userId: "user_ada",
        displayName: "Ada",
        points: 1,
        exactScores: 0,
        resultHits: 1,
        totalBets: 1,
      },
    ]);

    closeAppDatabase(db);
  });

  test("crawlFlashscoreCompetition uses default fetch options when retries are omitted", async () => {
    const db = await createTestDatabase();
    const fetchImpl = (async (input) => {
      const url = String(input);
      const body =
        url === fixturesPageUrl
          ? sampleFixturesPageHtml
          : sampleCompetitionHtml;
      return new Response(body, { status: 200 });
    }) as typeof fetch;

    const result = await crawlFlashscoreCompetition(db, {
      competitionName: "World Cup 2026",
      sourceUrl: competitionUrl,
      baseUrl: "https://www.flashscore.com",
      fetchImpl,
      minDelayMs: 0,
    });

    expect(result.jobStatus).toBe("SUCCEEDED");
    expect(result.matches).toBeGreaterThan(0);

    closeAppDatabase(db);
  });
});
