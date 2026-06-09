import { describe, expect, test } from "bun:test";
import { buildGroupStandings } from "./standings";

describe("group standings", () => {
  test("orders teams by points then goal difference then goals for", () => {
    const standings = buildGroupStandings([
      {
        groupCode: "A",
        homeTeamId: "poland",
        homeTeamName: "Poland",
        awayTeamId: "germany",
        awayTeamName: "Germany",
        homeGoals: 2,
        awayGoals: 1,
      },
      {
        groupCode: "A",
        homeTeamId: "germany",
        homeTeamName: "Germany",
        awayTeamId: "france",
        awayTeamName: "France",
        homeGoals: 3,
        awayGoals: 0,
      },
    ]);

    expect(standings).toEqual([
      {
        groupCode: "A",
        teams: [
          {
            teamId: "germany",
            name: "Germany",
            played: 2,
            won: 1,
            drawn: 0,
            lost: 1,
            goalsFor: 4,
            goalsAgainst: 2,
            goalDifference: 2,
            points: 3,
          },
          {
            teamId: "poland",
            name: "Poland",
            played: 1,
            won: 1,
            drawn: 0,
            lost: 0,
            goalsFor: 2,
            goalsAgainst: 1,
            goalDifference: 1,
            points: 3,
          },
          {
            teamId: "france",
            name: "France",
            played: 1,
            won: 0,
            drawn: 0,
            lost: 1,
            goalsFor: 0,
            goalsAgainst: 3,
            goalDifference: -3,
            points: 0,
          },
        ],
      },
    ]);
  });
});
