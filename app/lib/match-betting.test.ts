import { describe, expect, test } from "bun:test";
import {
  BETTING_CLOSE_WINDOW_MS,
  isMatchLockedForBetting,
} from "./match-betting";

describe("match betting rules", () => {
  test("keeps scheduled tournament fixtures open more than 12 hours before kickoff", () => {
    expect(
      isMatchLockedForBetting({
        kickoff_at: Date.now() + BETTING_CLOSE_WINDOW_MS + 60_000,
        stage: "Round 1",
        group_code: "Round 1",
        status: "SCHEDULED",
        home_team: "Mexico",
        away_team: "South Africa",
      }),
    ).toBe(false);
  });

  test("locks bets within 12 hours of kickoff", () => {
    const kickoffAt = Date.now() + BETTING_CLOSE_WINDOW_MS - 60_000;

    expect(
      isMatchLockedForBetting(
        {
          kickoff_at: kickoffAt,
          stage: "Round 1",
          group_code: "Round 1",
          status: "SCHEDULED",
          home_team: "Mexico",
          away_team: "South Africa",
        },
        new Date(kickoffAt - BETTING_CLOSE_WINDOW_MS + 60_000),
      ),
    ).toBe(true);
  });

  test("locks knockout fixtures that have not been fetched yet", () => {
    expect(
      isMatchLockedForBetting({
        kickoff_at: Date.now() + BETTING_CLOSE_WINDOW_MS + 60_000,
        stage: "1/8",
        group_code: null,
        status: "SCHEDULED",
        home_team: "France",
        away_team: null,
      }),
    ).toBe(true);
  });
});
