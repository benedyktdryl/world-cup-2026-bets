export type FinishedGroupMatch = {
  groupCode: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  homeGoals: number;
  awayGoals: number;
};

export type GroupStandingTeam = {
  teamId: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

function emptyTeam(teamId: string, name: string): GroupStandingTeam {
  return {
    teamId,
    name,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  };
}

function applyResult(
  team: GroupStandingTeam,
  goalsFor: number,
  goalsAgainst: number,
) {
  team.played += 1;
  team.goalsFor += goalsFor;
  team.goalsAgainst += goalsAgainst;
  team.goalDifference = team.goalsFor - team.goalsAgainst;

  if (goalsFor > goalsAgainst) {
    team.won += 1;
    team.points += 3;
  } else if (goalsFor === goalsAgainst) {
    team.drawn += 1;
    team.points += 1;
  } else {
    team.lost += 1;
  }
}

export function buildGroupStandings(matches: FinishedGroupMatch[]) {
  const groups = new Map<string, Map<string, GroupStandingTeam>>();

  for (const match of matches) {
    const group =
      groups.get(match.groupCode) ?? new Map<string, GroupStandingTeam>();
    groups.set(match.groupCode, group);

    const home =
      group.get(match.homeTeamId) ??
      emptyTeam(match.homeTeamId, match.homeTeamName);
    const away =
      group.get(match.awayTeamId) ??
      emptyTeam(match.awayTeamId, match.awayTeamName);

    applyResult(home, match.homeGoals, match.awayGoals);
    applyResult(away, match.awayGoals, match.homeGoals);

    group.set(home.teamId, home);
    group.set(away.teamId, away);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([groupCode, teams]: [string, Map<string, GroupStandingTeam>]) => ({
      groupCode,
      teams: [...teams.values()].sort(
        (left, right) =>
          right.points - left.points ||
          right.goalDifference - left.goalDifference ||
          right.goalsFor - left.goalsFor ||
          left.name.localeCompare(right.name),
      ),
    }));
}
