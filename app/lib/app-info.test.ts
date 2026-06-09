import { describe, expect, test } from "bun:test";
import { getAppInfo } from "./app-info";

describe("app info", () => {
  test("returns the product name used across the app", () => {
    expect(getAppInfo()).toEqual({
      name: "World Cup Bets",
      tagline: "Predict every match. Climb the office leaderboard.",
    });
  });
});
