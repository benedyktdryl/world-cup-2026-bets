import type { AppDatabase } from "../db";
import { closeAppDatabase, createAppDatabase, ensureMigrations } from "../db";
import { getDailyCrawlScheduleConfig } from "./config";
import { runWorldCupCrawl } from "./run-crawl";

type ZonedTime = {
  dayKey: string;
  hour: number;
};

export function getZonedTime(date: Date, timeZone: string): ZonedTime {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    dayKey: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
  };
}

export function shouldRunDailyCrawl(
  now: Date,
  lastRunDayKey: string | null,
  config: { hour: number; timeZone: string },
) {
  const zoned = getZonedTime(now, config.timeZone);

  if (zoned.hour < config.hour) {
    return false;
  }

  return zoned.dayKey !== lastRunDayKey;
}

export async function executeDailyCrawl(db: AppDatabase) {
  const result = await runWorldCupCrawl(db);
  console.log(
    `[daily-crawl] Crawled ${result.matches} matches and ${result.teams} teams.`,
  );
  return result;
}

export function startDailyCrawlScheduler(
  options: {
    db?: AppDatabase;
    now?: () => Date;
    onRun?: (dayKey: string) => void;
  } = {},
) {
  const schedule = getDailyCrawlScheduleConfig();
  if (!schedule.enabled) {
    console.log("[daily-crawl] Scheduler disabled.");
    return () => {};
  }

  const db = options.db ?? createAppDatabase();
  const ownsDatabase = options.db == null;
  void ensureMigrations(db);

  let lastRunDayKey: string | null = null;
  let running = false;

  const tick = async () => {
    if (running) {
      return;
    }

    const now = options.now?.() ?? new Date();
    const zoned = getZonedTime(now, schedule.timeZone);

    if (!shouldRunDailyCrawl(now, lastRunDayKey, schedule)) {
      return;
    }

    running = true;
    try {
      await executeDailyCrawl(db);
      lastRunDayKey = zoned.dayKey;
      options.onRun?.(zoned.dayKey);
    } catch (error) {
      console.error(
        "[daily-crawl] Failed:",
        error instanceof Error ? error.message : error,
      );
    } finally {
      running = false;
    }
  };

  console.log(
    `[daily-crawl] Scheduler active for ${schedule.hour}:00 ${schedule.timeZone}.`,
  );

  void tick();
  const interval = setInterval(() => {
    void tick();
  }, schedule.pollIntervalMs);

  return () => {
    clearInterval(interval);
    if (ownsDatabase) {
      closeAppDatabase(db);
    }
  };
}
