import type { AppDatabase } from "../db";
import { getFlashscoreCrawlConfig } from "./config";
import { crawlFlashscoreCompetition } from "./flashscore";

export async function runWorldCupCrawl(db: AppDatabase) {
  const config = getFlashscoreCrawlConfig();

  return crawlFlashscoreCompetition(db, {
    ...config,
    minDelayMs: 1200,
    retries: 3,
  });
}
