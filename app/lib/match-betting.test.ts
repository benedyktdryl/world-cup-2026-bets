import { describe, expect, test } from "bun:test";
import { isMatchLockedForBetting } from "./match-betting";

describe("match betting rules", () => {
  test("keeps scheduled tournament fixtures open before kickoff", () => {
    expect(
      isMatchLockedForBetting({
        kickoff_at: Date.now() + 60_000,
        stage: "Round 1",
        group_code: "Round 1",
        status: "SCHEDULED",
        home_team: "Mexico",
        away_team: "South Africa",
      }),
    ).toBe(false);
  });

  test("locks knockout fixtures that have not been fetched yet", () => {
    expect(
      isMatchLockedForBetting({
        kickoff_at: Date.now() + 60_000,
        stage: "1/8",
        group_code: null,
        status: "SCHEDULED",
        home_team: "France",
        away_team: null,
      }),
    ).toBe(true);
  });
});
