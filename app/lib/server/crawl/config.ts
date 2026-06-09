import { env } from "../env";

export const DEFAULT_FLASHSCORE_WC_URL =
  "https://www.flashscore.com/football/world/world-championship/";

export function getFlashscoreCrawlConfig() {
  return {
    competitionName: env("FLASHSCORE_COMPETITION_NAME", "World Cup 2026").trim(),
    sourceUrl: env("FLASHSCORE_SOURCE_URL", DEFAULT_FLASHSCORE_WC_URL).trim(),
    baseUrl: env("FLASHSCORE_BASE_URL", "https://www.flashscore.com").trim(),
  };
}

export function getDailyCrawlScheduleConfig() {
  const enabled = env("DAILY_CRAWL_ENABLED", "true") !== "false";
  const hour = Number(env("DAILY_CRAWL_HOUR", "4"));
  const timeZone = env("DAILY_CRAWL_TIMEZONE", "UTC").trim();

  return {
    enabled,
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 4,
    timeZone,
    pollIntervalMs: Number(env("DAILY_CRAWL_POLL_MS", String(60_000))),
  };
}
