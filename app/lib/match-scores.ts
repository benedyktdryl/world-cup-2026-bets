export function formatFinishedMatchScore(match: {
  home_goals: number | null;
  away_goals: number | null;
  home_goals_90?: number | null;
  away_goals_90?: number | null;
  went_to_extra_time?: boolean | number | null;
}) {
  if (match.home_goals == null || match.away_goals == null) {
    return null;
  }

  const wentToExtraTime = Boolean(match.went_to_extra_time);
  const home90 = match.home_goals_90 ?? match.home_goals;
  const away90 = match.away_goals_90 ?? match.away_goals;

  if (wentToExtraTime) {
    return `${home90}:${away90} (90′) · ${match.home_goals}:${match.away_goals} AET`;
  }

  return `Final ${match.home_goals}:${match.away_goals}`;
}
