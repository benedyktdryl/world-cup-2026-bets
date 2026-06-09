import { describe, expect, test } from "bun:test";
import { compareMatchesBySchedule } from "./matches";

describe("compareMatchesBySchedule", () => {
  test("orders by kickoff time first", () => {
    const earlier = {
      id: "b",
      kickoff_at: 1,
      stage: "Final",
      group_code: null,
    };
    const later = {
      id: "a",
      kickoff_at: 2,
      stage: "Round 1",
      group_code: null,
    };

    expect(compareMatchesBySchedule(earlier, later)).toBeLessThan(0);
  });

  test("orders same-day group rounds before knockout stages", () => {
    const groupMatch = {
      id: "group",
      kickoff_at: 100,
      stage: "Round 1",
      group_code: "Round 1",
    };
    const semiFinal = {
      id: "semi",
      kickoff_at: 100,
      stage: "Semi-finals",
      group_code: "Semi-finals",
    };

    expect(compareMatchesBySchedule(groupMatch, semiFinal)).toBeLessThan(0);
  });
});
