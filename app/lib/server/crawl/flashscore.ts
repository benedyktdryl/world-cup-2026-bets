import { randomUUID } from "node:crypto";
import { isKnockoutStage } from "~/lib/match-betting";
import { recalculateScores } from "../betting";
import type { AppDatabase } from "../db";
import { env } from "../env";
import { sqlGet, sqlRun } from "../sql";

/*
 * Flashscore feed token mapping (summary/list feeds):
 * - AG / AH: home / away goals for the displayed final result (includes extra time)
 * - AT / AU: home / away goals at end of regular time (90 minutes), when present
 * - AB: match status code (3 = finished)
 * - AS: auxiliary match flag (not used for scoring)
 *
 * Match detail feeds (match summary review, ~III blocks):
 * - INX / IOX: running home / away score after each incident
 * - IB / IBX: minute of incident — last score at minute <= 90 is regulation time
 */

export type FlashscoreFeedEvent = {
  eventId: string;
  unixTime: number;
  round?: string;
  statusCode?: number;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamSlug?: string;
  awayTeamSlug?: string;
  homeGoals?: number;
  awayGoals?: number;
  homeGoals90?: number;
  awayGoals90?: number;
  wentToExtraTime?: boolean;
};

export type ResolvedMatchScores = {
  homeGoalsFt: number;
  awayGoalsFt: number;
  homeGoals90: number;
  awayGoals90: number;
  wentToExtraTime: boolean;
};

export type FlashscoreSummaryFeeds = {
  results: FlashscoreFeedEvent[];
  fixtures: FlashscoreFeedEvent[];
};

type ScrapedPageRow = {
  url: string;
  fetched_at: number;
  html: string;
};

type FetcherOptions = {
  minDelayMs?: number;
  retries?: number;
  cacheTtlMs?: number;
};

const DEFAULT_FETCHER_OPTIONS = {
  minDelayMs: 1200,
  retries: 2,
  cacheTtlMs: 1000 * 60 * 60 * 6,
};

const MATCH_DETAIL_FEED_KEYS = [
  "df_sui",
  "df_dos",
  "df_hh",
  "df_ms",
] as const;

function parseInteger(value: string | undefined): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseTokenMap(eventBlock: string): Map<string, string> {
  const tokens = eventBlock.split("¬");
  const map = new Map<string, string>();

  for (const token of tokens) {
    const delimiterIndex = token.indexOf("÷");
    if (delimiterIndex <= 0) {
      continue;
    }

    const key = token.slice(0, delimiterIndex).trim();
    const value = token.slice(delimiterIndex + 1).trim();
    if (key) {
      map.set(key, value);
    }
  }

  return map;
}

function parseEventBlocks(feedData: string): string[] {
  return feedData
    .split("~AA÷")
    .slice(1)
    .map((part) => `AA÷${part}`);
}

export function parseRegulationScoresFromDetailFeed(feedData: string) {
  let lastAt90: { home: number; away: number } | null = null;

  for (const block of feedData.split("~III÷").slice(1)) {
    const tokenMap = parseTokenMap(`III÷${block}`);
    const minute = parseInteger(tokenMap.get("IB") ?? tokenMap.get("IBX"));
    const home = parseInteger(tokenMap.get("INX"));
    const away = parseInteger(tokenMap.get("IOX"));

    if (minute == null || home == null || away == null) {
      continue;
    }

    if (minute <= 90) {
      lastAt90 = { home, away };
    }
  }

  return lastAt90;
}

export function parseRegulationScoresFromEventBlock(eventBlock: string) {
  const tokenMap = parseTokenMap(eventBlock);
  const home = parseInteger(tokenMap.get("AT"));
  const away = parseInteger(tokenMap.get("AU"));

  if (home == null || away == null) {
    return null;
  }

  return { home, away };
}

export function resolveEventScores(
  event: FlashscoreFeedEvent,
  detailFeed?: string | null,
): ResolvedMatchScores | null {
  const homeGoalsFt = event.homeGoals;
  const awayGoalsFt = event.awayGoals;

  if (homeGoalsFt == null || awayGoalsFt == null) {
    return null;
  }

  let homeGoals90 = event.homeGoals90;
  let awayGoals90 = event.awayGoals90;

  if (homeGoals90 == null || awayGoals90 == null) {
    const fromDetailFeed = detailFeed
      ? parseRegulationScoresFromDetailFeed(detailFeed)
      : null;
    if (fromDetailFeed) {
      homeGoals90 = fromDetailFeed.home;
      awayGoals90 = fromDetailFeed.away;
    }
  }

  if (homeGoals90 == null || awayGoals90 == null) {
    homeGoals90 = homeGoalsFt;
    awayGoals90 = awayGoalsFt;
  }

  const wentToExtraTime =
    event.wentToExtraTime ??
    (homeGoals90 !== homeGoalsFt || awayGoals90 !== awayGoalsFt);

  return {
    homeGoalsFt,
    awayGoalsFt,
    homeGoals90,
    awayGoals90,
    wentToExtraTime,
  };
}

export function parseFeedEvents(feedData: string): FlashscoreFeedEvent[] {
  const events: FlashscoreFeedEvent[] = [];

  for (const block of parseEventBlocks(feedData)) {
    const tokenMap = parseTokenMap(block);
    const eventId = tokenMap.get("AA");
    const unixTime = parseInteger(tokenMap.get("AD"));
    // Flashscore summary feeds encode participant tokens in away-first order:
    // PY/AF/WV = away team, PX/AE/WU = home team.
    const homeTeamId = tokenMap.get("PX");
    const awayTeamId = tokenMap.get("PY");
    const homeTeamName = tokenMap.get("AE");
    const awayTeamName = tokenMap.get("AF");

    if (
      !eventId ||
      unixTime == null ||
      !homeTeamId ||
      !awayTeamId ||
      !homeTeamName ||
      !awayTeamName
    ) {
      continue;
    }

    const homeGoals90 = parseInteger(tokenMap.get("AT"));
    const awayGoals90 = parseInteger(tokenMap.get("AU"));
    const homeGoals = parseInteger(tokenMap.get("AG"));
    const awayGoals = parseInteger(tokenMap.get("AH"));

    events.push({
      eventId,
      unixTime,
      round: tokenMap.get("ER"),
      statusCode: parseInteger(tokenMap.get("AB")),
      homeTeamId,
      awayTeamId,
      homeTeamName,
      awayTeamName,
      homeTeamSlug: tokenMap.get("WU"),
      awayTeamSlug: tokenMap.get("WV"),
      homeGoals,
      awayGoals,
      homeGoals90,
      awayGoals90,
      wentToExtraTime:
        homeGoals90 != null &&
        awayGoals90 != null &&
        homeGoals != null &&
        awayGoals != null &&
        (homeGoals90 !== homeGoals || awayGoals90 !== awayGoals),
    });
  }

  return events;
}

export function extractInitialFeedData(html: string, feedKey: string) {
  const escapedKey = feedKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `cjs\\.initialFeeds\\[(?:"|')${escapedKey}(?:"|')\\]\\s*=\\s*\\{[\\s\\S]*?data:\\s*\`([\\s\\S]*?)\`,`,
    "m",
  );
  return html.match(regex)?.[1] ?? null;
}

export function extractMatchDetailFeed(html: string) {
  for (const feedKey of MATCH_DETAIL_FEED_KEYS) {
    const feed = extractInitialFeedData(html, feedKey);
    if (feed) {
      return feed;
    }
  }

  return null;
}

export const WORLD_CUP_2026_FINALS_START_MS = Date.UTC(2026, 5, 10);
export const WORLD_CUP_2026_FINALS_END_MS = Date.UTC(2026, 6, 20, 23, 59, 59);

export function isWorldCup2026FinalsKickoff(unixTimeSeconds: number) {
  const kickoffMs = unixTimeSeconds * 1000;
  return (
    kickoffMs >= WORLD_CUP_2026_FINALS_START_MS &&
    kickoffMs <= WORLD_CUP_2026_FINALS_END_MS
  );
}

export function filterWorldCup2026FinalsEvents(events: FlashscoreFeedEvent[]) {
  return events.filter((event) => isWorldCup2026FinalsKickoff(event.unixTime));
}

export function extractSummaryFeeds(html: string): FlashscoreSummaryFeeds {
  const resultsFeed = extractInitialFeedData(html, "summary-results");
  const fixturesFeed = extractInitialFeedData(html, "summary-fixtures");

  return {
    results: resultsFeed ? parseFeedEvents(resultsFeed) : [],
    fixtures: fixturesFeed ? parseFeedEvents(fixturesFeed) : [],
  };
}

export function getTournamentFixturesPageUrl(sourceUrl: string) {
  const url = new URL(sourceUrl);
  if (!url.pathname.endsWith("/")) {
    url.pathname += "/";
  }

  return new URL("fixtures/", url).toString();
}

export function mergeFeedEvents(...eventLists: FlashscoreFeedEvent[][]) {
  const merged = new Map<string, FlashscoreFeedEvent>();

  for (const events of eventLists) {
    for (const event of events) {
      merged.set(event.eventId, event);
    }
  }

  return [...merged.values()];
}

export function collectFinalsEvents(input: {
  summaryHtml: string;
  fixturesHtml: string;
}) {
  const summary = extractSummaryFeeds(input.summaryHtml);
  const fixturesFeed = extractInitialFeedData(input.fixturesHtml, "fixtures");
  const resultsFeed = extractInitialFeedData(input.fixturesHtml, "results");

  return filterWorldCup2026FinalsEvents(
    mergeFeedEvents(
      summary.results,
      summary.fixtures,
      fixturesFeed ? parseFeedEvents(fixturesFeed) : [],
      resultsFeed ? parseFeedEvents(resultsFeed) : [],
    ),
  );
}

export function getScraperUserAgent() {
  const contactUrl = env("SCRAPER_CONTACT_URL").trim();
  if (contactUrl) {
    return `world-cup-bets/0.1 (+${contactUrl}; respects robots and ToS)`;
  }

  return "world-cup-bets/0.1 (set SCRAPER_CONTACT_URL; respects robots and ToS)";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CachedRateLimitedFetcher {
  private lastRequestAt = 0;
  private readonly options: Required<FetcherOptions>;

  constructor(
    private readonly db: AppDatabase,
    options: FetcherOptions = {},
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.options = {
      minDelayMs: options.minDelayMs ?? DEFAULT_FETCHER_OPTIONS.minDelayMs,
      retries: options.retries ?? DEFAULT_FETCHER_OPTIONS.retries,
      cacheTtlMs: options.cacheTtlMs ?? DEFAULT_FETCHER_OPTIONS.cacheTtlMs,
    };
  }

  async fetchHtml(url: string) {
    const cached = await sqlGet<ScrapedPageRow>(
      this.db,
      `SELECT url, fetched_at, html
       FROM scraped_pages
       WHERE url = ?`,
      [url],
    );

    if (cached && Date.now() - cached.fetched_at <= this.options.cacheTtlMs) {
      return { html: cached.html, fromCache: true };
    }

    const waitMs = Math.max(
      0,
      this.options.minDelayMs - (Date.now() - this.lastRequestAt),
    );
    if (waitMs > 0) {
      await delay(waitMs);
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.options.retries; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          headers: {
            "user-agent": getScraperUserAgent(),
          },
        });
        this.lastRequestAt = Date.now();

        if (!response.ok) {
          throw new Error(`Failed to fetch ${url}: ${response.status}`);
        }

        const html = await response.text();
        await sqlRun(
          this.db,
          `INSERT INTO scraped_pages (url, fetched_at, html, etag, last_modified)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(url) DO UPDATE SET
             fetched_at = excluded.fetched_at,
             html = excluded.html,
             etag = excluded.etag,
             last_modified = excluded.last_modified`,
          [
            url,
            Date.now(),
            html,
            response.headers.get("etag"),
            response.headers.get("last-modified"),
          ],
        );

        return { html, fromCache: false };
      } catch (error) {
        lastError = error;
        if (attempt < this.options.retries) {
          await delay(300 * (attempt + 1));
        }
      }
    }

    throw lastError;
  }
}

function teamId(rawId: string) {
  return `team_${rawId.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

function matchId(rawId: string) {
  return `match_${rawId.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

function absoluteUrl(baseUrl: string, maybeRelative: string) {
  if (
    maybeRelative.startsWith("http://") ||
    maybeRelative.startsWith("https://")
  ) {
    return maybeRelative;
  }
  return new URL(maybeRelative, baseUrl).toString();
}

async function upsertTeam(
  db: AppDatabase,
  sourceId: string,
  name: string,
  group?: string,
) {
  await sqlRun(
    db,
    `INSERT INTO teams (id, source_id, name, group_code, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       source_id = excluded.source_id,
       name = excluded.name,
       group_code = COALESCE(excluded.group_code, teams.group_code),
       updated_at = excluded.updated_at`,
    [teamId(sourceId), sourceId, name, group ?? null, Date.now()],
  );
}

async function enrichEventScores(
  fetcher: CachedRateLimitedFetcher,
  event: FlashscoreFeedEvent,
  baseUrl: string,
) {
  if (event.homeGoals == null || event.awayGoals == null) {
    return event;
  }

  const hasRegulationScores =
    event.homeGoals90 != null && event.awayGoals90 != null;
  if (hasRegulationScores) {
    return event;
  }

  if (!isKnockoutStage(event.round)) {
    return {
      ...event,
      homeGoals90: event.homeGoals,
      awayGoals90: event.awayGoals,
      wentToExtraTime: false,
    };
  }

  const matchUrl = absoluteUrl(baseUrl, `/match/${event.eventId}/`);
  const page = await fetcher.fetchHtml(matchUrl);
  const detailFeed = extractMatchDetailFeed(page.html);
  const resolved = resolveEventScores(event, detailFeed);

  if (!resolved) {
    return event;
  }

  return {
    ...event,
    homeGoals90: resolved.homeGoals90,
    awayGoals90: resolved.awayGoals90,
    wentToExtraTime: resolved.wentToExtraTime,
  };
}

async function upsertMatch(
  db: AppDatabase,
  input: {
    competitionId: string;
    event: FlashscoreFeedEvent;
    baseUrl: string;
  },
) {
  const resolved = resolveEventScores(input.event);
  const status =
    resolved != null
      ? "FINISHED"
      : "SCHEDULED";
  const sourceUrl = absoluteUrl(
    input.baseUrl,
    `/match/${input.event.eventId}/`,
  );

  await sqlRun(
    db,
    `INSERT INTO matches (
      id,
      source_id,
      competition_id,
      stage,
      group_code,
      kickoff_at,
      home_team_id,
      away_team_id,
      home_goals,
      away_goals,
      home_goals_90,
      away_goals_90,
      went_to_extra_time,
      status,
      source_url,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      competition_id = excluded.competition_id,
      stage = excluded.stage,
      group_code = excluded.group_code,
      kickoff_at = excluded.kickoff_at,
      home_team_id = excluded.home_team_id,
      away_team_id = excluded.away_team_id,
      home_goals = excluded.home_goals,
      away_goals = excluded.away_goals,
      home_goals_90 = excluded.home_goals_90,
      away_goals_90 = excluded.away_goals_90,
      went_to_extra_time = excluded.went_to_extra_time,
      status = excluded.status,
      source_url = excluded.source_url,
      updated_at = excluded.updated_at`,
    [
      matchId(input.event.eventId),
      input.event.eventId,
      input.competitionId,
      input.event.round ?? "Tournament",
      input.event.round ?? null,
      input.event.unixTime * 1000,
      teamId(input.event.homeTeamId),
      teamId(input.event.awayTeamId),
      resolved?.homeGoalsFt ?? null,
      resolved?.awayGoalsFt ?? null,
      resolved?.homeGoals90 ?? null,
      resolved?.awayGoals90 ?? null,
      resolved?.wentToExtraTime ? 1 : 0,
      status,
      sourceUrl,
      Date.now(),
    ],
  );
}

export async function crawlFlashscoreCompetition(
  db: AppDatabase,
  input: {
    competitionName: string;
    sourceUrl: string;
    baseUrl: string;
    fetchImpl?: typeof fetch;
    minDelayMs?: number;
    retries?: number;
  },
) {
  const jobId = randomUUID();
  const startedAt = Date.now();
  await sqlRun(
    db,
    `INSERT INTO crawl_jobs (id, source_url, status, started_at)
     VALUES (?, ?, 'RUNNING', ?)`,
    [jobId, input.sourceUrl, startedAt],
  );

  try {
    const competitionId = `competition_${input.competitionName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")}`;
    await sqlRun(
      db,
      `INSERT INTO competitions (id, name, source_url, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(source_url) DO UPDATE SET
         name = excluded.name,
         updated_at = excluded.updated_at`,
      [competitionId, input.competitionName, input.sourceUrl, Date.now()],
    );

    const fetcherOptions: FetcherOptions = {};
    if (input.minDelayMs != null) {
      fetcherOptions.minDelayMs = input.minDelayMs;
    }
    if (input.retries != null) {
      fetcherOptions.retries = input.retries;
    }

    const fetcher = new CachedRateLimitedFetcher(
      db,
      fetcherOptions,
      input.fetchImpl,
    );
    const page = await fetcher.fetchHtml(input.sourceUrl);
    const fixturesPage = await fetcher.fetchHtml(
      getTournamentFixturesPageUrl(input.sourceUrl),
    );
    const events = collectFinalsEvents({
      summaryHtml: page.html,
      fixturesHtml: fixturesPage.html,
    });
    const seenTeams = new Set<string>();
    const seenMatches = new Set<string>();

    for (const rawEvent of events) {
      const event = await enrichEventScores(fetcher, rawEvent, input.baseUrl);

      if (!seenTeams.has(event.homeTeamId)) {
        await upsertTeam(db, event.homeTeamId, event.homeTeamName, event.round);
        seenTeams.add(event.homeTeamId);
      }
      if (!seenTeams.has(event.awayTeamId)) {
        await upsertTeam(db, event.awayTeamId, event.awayTeamName, event.round);
        seenTeams.add(event.awayTeamId);
      }
      if (!seenMatches.has(event.eventId)) {
        const storedMatchId = matchId(event.eventId);
        await upsertMatch(db, {
          competitionId,
          event,
          baseUrl: input.baseUrl,
        });
        const resolved = resolveEventScores(event);
        if (resolved != null) {
          await recalculateScores(db, storedMatchId);
        }
        seenMatches.add(event.eventId);
      }
    }

    await sqlRun(
      db,
      `DELETE FROM matches
       WHERE kickoff_at < ? OR kickoff_at > ?`,
      [WORLD_CUP_2026_FINALS_START_MS, WORLD_CUP_2026_FINALS_END_MS],
    );

    await sqlRun(
      db,
      `UPDATE crawl_jobs
       SET status = 'SUCCEEDED',
         teams_count = ?,
         matches_count = ?,
         finished_at = ?
       WHERE id = ?`,
      [seenTeams.size, seenMatches.size, Date.now(), jobId],
    );

    return {
      teams: seenTeams.size,
      matches: seenMatches.size,
      jobStatus: "SUCCEEDED" as const,
    };
  } catch (error) {
    await sqlRun(
      db,
      `UPDATE crawl_jobs
       SET status = 'FAILED',
         error = ?,
         finished_at = ?
       WHERE id = ?`,
      [
        error instanceof Error ? error.message : "Unknown crawl error",
        Date.now(),
        jobId,
      ],
    );
    throw error;
  }
}
