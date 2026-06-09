export type MatchBettingState = {
  kickoff_at: number;
  stage: string;
  group_code: string | null;
  status: string;
  home_team?: string | null;
  away_team?: string | null;
};

export const BETTING_CLOSE_WINDOW_MS = 12 * 60 * 60 * 1000;

const KNOCKOUT_STAGE_PATTERN =
  /1\/\d+|round of \d+|quarter-?final|semi-?final|final/i;
const QUALIFIER_STAGE_PATTERN = /^round \d+$/i;

export function isUnfetchedKnockoutMatch(match: MatchBettingState) {
  if (QUALIFIER_STAGE_PATTERN.test(match.stage.trim())) {
    return false;
  }

  if (!KNOCKOUT_STAGE_PATTERN.test(match.stage)) {
    return false;
  }

  const homeTeam = match.home_team?.trim();
  const awayTeam = match.away_team?.trim();

  if (!homeTeam || !awayTeam) {
    return true;
  }

  return homeTeam === "TBD" || awayTeam === "TBD";
}

export function getBettingCloseAt(kickoffAt: number) {
  return kickoffAt - BETTING_CLOSE_WINDOW_MS;
}

export function isMatchLockedForBetting(
  match: MatchBettingState,
  now: Date = new Date(),
) {
  if (isUnfetchedKnockoutMatch(match)) {
    return true;
  }

  if (match.status === "FINISHED" || match.status === "LIVE") {
    return true;
  }

  return now.getTime() >= getBettingCloseAt(match.kickoff_at);
}
