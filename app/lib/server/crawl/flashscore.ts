import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db";

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
      homeGoals: parseInteger(tokenMap.get("AG")),
      awayGoals: parseInteger(tokenMap.get("AS")),
    });
  }

  return events;
}

export function extractInitialFeedData(html: string, feedKey: string) {
  const escapedKey = feedKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `cjs\\.initialFeeds\\["${escapedKey}"\\]\\s*=\\s*\\{[\\s\\S]*?data:\\s*\`([\\s\\S]*?)\`,`,
    "m",
  );
  return html.match(regex)?.[1] ?? null;
}

export function extractSummaryFeeds(html: string): FlashscoreSummaryFeeds {
  const resultsFeed = extractInitialFeedData(html, "summary-results");
  const fixturesFeed = extractInitialFeedData(html, "summary-fixtures");

  return {
    results: resultsFeed ? parseFeedEvents(resultsFeed) : [],
    fixtures: fixturesFeed ? parseFeedEvents(fixturesFeed) : [],
  };
}

export function getScraperUserAgent() {
  const contactUrl = Bun.env.SCRAPER_CONTACT_URL?.trim();
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
    this.options = { ...DEFAULT_FETCHER_OPTIONS, ...options };
  }

  async fetchHtml(url: string) {
    const cached = this.db
      .query<ScrapedPageRow, [string]>(
        `SELECT url, fetched_at, html
         FROM scraped_pages
         WHERE url = ?`,
      )
      .get(url);

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
        this.db
          .query(
            `INSERT INTO scraped_pages (url, fetched_at, html, etag, last_modified)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(url) DO UPDATE SET
               fetched_at = excluded.fetched_at,
               html = excluded.html,
               etag = excluded.etag,
               last_modified = excluded.last_modified`,
          )
          .run(
            url,
            Date.now(),
            html,
            response.headers.get("etag"),
            response.headers.get("last-modified"),
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

function upsertTeam(
  db: AppDatabase,
  sourceId: string,
  name: string,
  group?: string,
) {
  db.query(
    `INSERT INTO teams (id, source_id, name, group_code, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       source_id = excluded.source_id,
       name = excluded.name,
       group_code = COALESCE(excluded.group_code, teams.group_code),
       updated_at = excluded.updated_at`,
  ).run(teamId(sourceId), sourceId, name, group ?? null, Date.now());
}

function upsertMatch(
  db: AppDatabase,
  input: {
    competitionId: string;
    event: FlashscoreFeedEvent;
    baseUrl: string;
  },
) {
  const status =
    input.event.homeGoals != null && input.event.awayGoals != null
      ? "FINISHED"
      : "SCHEDULED";
  const sourceUrl = absoluteUrl(
    input.baseUrl,
    `/match/${input.event.eventId}/`,
  );

  db.query(
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
      status,
      source_url,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      competition_id = excluded.competition_id,
      stage = excluded.stage,
      group_code = excluded.group_code,
      kickoff_at = excluded.kickoff_at,
      home_team_id = excluded.home_team_id,
      away_team_id = excluded.away_team_id,
      home_goals = excluded.home_goals,
      away_goals = excluded.away_goals,
      status = excluded.status,
      source_url = excluded.source_url,
      updated_at = excluded.updated_at`,
  ).run(
    matchId(input.event.eventId),
    input.event.eventId,
    input.competitionId,
    input.event.round ?? "Tournament",
    input.event.round ?? null,
    input.event.unixTime * 1000,
    teamId(input.event.homeTeamId),
    teamId(input.event.awayTeamId),
    input.event.homeGoals ?? null,
    input.event.awayGoals ?? null,
    status,
    sourceUrl,
    Date.now(),
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
  db.query(
    `INSERT INTO crawl_jobs (id, source_url, status, started_at)
     VALUES (?, ?, 'RUNNING', ?)`,
  ).run(jobId, input.sourceUrl, startedAt);

  try {
    const competitionId = `competition_${input.competitionName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")}`;
    db.query(
      `INSERT INTO competitions (id, name, source_url, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(source_url) DO UPDATE SET
         name = excluded.name,
         updated_at = excluded.updated_at`,
    ).run(competitionId, input.competitionName, input.sourceUrl, Date.now());

    const fetcher = new CachedRateLimitedFetcher(
      db,
      {
        minDelayMs: input.minDelayMs,
        retries: input.retries,
      },
      input.fetchImpl,
    );
    const page = await fetcher.fetchHtml(input.sourceUrl);
    const feeds = extractSummaryFeeds(page.html);
    const events = [...feeds.results, ...feeds.fixtures];
    const seenTeams = new Set<string>();
    const seenMatches = new Set<string>();

    for (const event of events) {
      if (!seenTeams.has(event.homeTeamId)) {
        upsertTeam(db, event.homeTeamId, event.homeTeamName, event.round);
        seenTeams.add(event.homeTeamId);
      }
      if (!seenTeams.has(event.awayTeamId)) {
        upsertTeam(db, event.awayTeamId, event.awayTeamName, event.round);
        seenTeams.add(event.awayTeamId);
      }
      if (!seenMatches.has(event.eventId)) {
        upsertMatch(db, { competitionId, event, baseUrl: input.baseUrl });
        seenMatches.add(event.eventId);
      }
    }

    db.query(
      `UPDATE crawl_jobs
       SET status = 'SUCCEEDED',
         teams_count = ?,
         matches_count = ?,
         finished_at = ?
       WHERE id = ?`,
    ).run(seenTeams.size, seenMatches.size, Date.now(), jobId);

    return {
      teams: seenTeams.size,
      matches: seenMatches.size,
      jobStatus: "SUCCEEDED" as const,
    };
  } catch (error) {
    db.query(
      `UPDATE crawl_jobs
       SET status = 'FAILED',
         error = ?,
         finished_at = ?
       WHERE id = ?`,
    ).run(
      error instanceof Error ? error.message : "Unknown crawl error",
      Date.now(),
      jobId,
    );
    throw error;
  }
}
