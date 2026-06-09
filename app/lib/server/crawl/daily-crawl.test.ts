import { describe, expect, test } from "bun:test";
import { getZonedTime, shouldRunDailyCrawl } from "./daily-crawl";

describe("daily crawl scheduler", () => {
  test("getZonedTime returns calendar day and hour in the configured timezone", () => {
    const zoned = getZonedTime(
      new Date("2026-06-10T03:30:00.000Z"),
      "Europe/Warsaw",
    );

    expect(zoned.hour).toBe(5);
    expect(zoned.dayKey).toBe("2026-06-10");
  });

  test("waits until the configured hour in the target timezone", () => {
    const beforeWindow = new Date("2026-06-10T01:30:00.000Z");

    expect(
      shouldRunDailyCrawl(beforeWindow, null, {
        hour: 4,
        timeZone: "UTC",
      }),
    ).toBe(false);
  });

  test("runs once per day after the configured hour", () => {
    const afterWindow = new Date("2026-06-10T04:15:00.000Z");

    expect(
      shouldRunDailyCrawl(afterWindow, null, {
        hour: 4,
        timeZone: "UTC",
      }),
    ).toBe(true);

    expect(
      shouldRunDailyCrawl(afterWindow, "2026-06-10", {
        hour: 4,
        timeZone: "UTC",
      }),
    ).toBe(false);
  });
});
