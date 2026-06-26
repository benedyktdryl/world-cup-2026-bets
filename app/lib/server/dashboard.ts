import { MATCHES_ORDER_BY, normalizeStageLabel } from "~/lib/matches";
import { getLeaderboard } from "~/lib/server/betting";
import type { AppDatabase } from "./db";
import { sqlAll, sqlGet } from "./sql";

type MatchSpotlightRow = {
  id: string;
  kickoff_at: number;
  status: string;
  home_team: string | null;
  away_team: string | null;
  home_goals: number | null;
  away_goals: number | null;
  home_goals_90: number | null;
  away_goals_90: number | null;
  went_to_extra_time: number;
};

type UserScoreRow = {
  match_id: string;
  kickoff_at: number;
  stage: string;
  home_team: string | null;
  away_team: string | null;
  predicted_home_goals: number | null;
  predicted_away_goals: number | null;
  home_goals_90: number | null;
  away_goals_90: number | null;
  points: number;
  reason: "EXACT" | "RESULT" | "MISS";
};

type UserStatsRow = {
  total_points: number;
  exact: number;
  result: number;
  miss: number;
  settled: number;
};

type PoolReasonRow = {
  reason: "EXACT" | "RESULT" | "MISS";
  count: number;
};

type PoolScoreRow = {
  user_id: string;
  match_id: string;
  kickoff_at: number;
  points: number;
};

const MATCH_SPOTLIGHT_SELECT = `
  matches.id,
  matches.kickoff_at,
  matches.status,
  matches.home_goals,
  matches.away_goals,
  matches.home_goals_90,
  matches.away_goals_90,
  matches.went_to_extra_time,
  home.name AS home_team,
  away.name AS away_team
`;

export type DashboardSpotlight =
  | { kind: "live"; match: MatchSpotlightRow }
  | { kind: "upcoming"; match: MatchSpotlightRow }
  | { kind: "recent"; match: MatchSpotlightRow };

export type DashboardTrendPoint = {
  label: string;
  kickoffAt: number;
  points: number;
  cumulative: number;
  poolCumulative: number;
  rank: number;
  rankDelta: number;
  reason: "EXACT" | "RESULT" | "MISS";
};

export type DashboardStageBreakdown = {
  stage: string;
  label: string;
  points: number;
  exact: number;
  result: number;
  miss: number;
  settled: number;
};

export type DashboardPickHistory = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: number;
  predictedHomeGoals: number;
  predictedAwayGoals: number;
  actualHomeGoals90: number;
  actualAwayGoals90: number;
  points: number;
  reason: "EXACT" | "RESULT" | "MISS";
};

export type DashboardData = {
  matches: number;
  bets: number;
  stats: {
    totalPoints: number;
    exact: number;
    result: number;
    miss: number;
    settled: number;
    accuracy: number;
    rank: number | null;
    playerCount: number;
    rankDeltaSinceLastMatch: number | null;
  };
  spotlight: DashboardSpotlight | null;
  trend: DashboardTrendPoint[];
  stageBreakdown: DashboardStageBreakdown[];
  pickHistory: DashboardPickHistory[];
  poolBreakdown: { exact: number; result: number; miss: number };
  recentScores: Array<{
    homeTeam: string;
    awayTeam: string;
    points: number;
    reason: "EXACT" | "RESULT" | "MISS";
    kickoffAt: number;
  }>;
  leaders: Awaited<ReturnType<typeof getLeaderboard>>;
};

async function getSpotlightMatch(
  db: AppDatabase,
  now: number,
): Promise<DashboardSpotlight | null> {
  const live = await sqlGet<MatchSpotlightRow>(
    db,
    `SELECT ${MATCH_SPOTLIGHT_SELECT}
     FROM matches
     LEFT JOIN teams home ON home.id = matches.home_team_id
     LEFT JOIN teams away ON away.id = matches.away_team_id
     WHERE matches.status = 'LIVE'
     ORDER BY ${MATCHES_ORDER_BY}
     LIMIT 1`,
  );
  if (live) {
    return { kind: "live", match: live };
  }

  const upcoming = await sqlGet<MatchSpotlightRow>(
    db,
    `SELECT ${MATCH_SPOTLIGHT_SELECT}
     FROM matches
     LEFT JOIN teams home ON home.id = matches.home_team_id
     LEFT JOIN teams away ON away.id = matches.away_team_id
     WHERE matches.status = 'SCHEDULED' AND matches.kickoff_at > ?
     ORDER BY ${MATCHES_ORDER_BY}
     LIMIT 1`,
    [now],
  );
  if (upcoming) {
    return { kind: "upcoming", match: upcoming };
  }

  const recent = await sqlGet<MatchSpotlightRow>(
    db,
    `SELECT ${MATCH_SPOTLIGHT_SELECT}
     FROM matches
     LEFT JOIN teams home ON home.id = matches.home_team_id
     LEFT JOIN teams away ON away.id = matches.away_team_id
     WHERE matches.status = 'FINISHED'
     ORDER BY matches.kickoff_at DESC
     LIMIT 1`,
  );
  if (recent) {
    return { kind: "recent", match: recent };
  }

  return null;
}

function formatTrendLabel(
  homeTeam: string | null,
  awayTeam: string | null,
  kickoffAt: number,
) {
  const home = homeTeam ?? "TBD";
  const away = awayTeam ?? "TBD";
  const shortDate = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(kickoffAt));
  return `${home} vs ${away} · ${shortDate}`;
}

function buildLeaderboardRankings(
  rows: PoolScoreRow[],
  matchOrder: string[],
) {
  const pointsByUser = new Map<string, number>();
  const rankings: Array<Map<string, number>> = [];

  for (const matchId of matchOrder) {
    for (const row of rows.filter((entry) => entry.match_id === matchId)) {
      pointsByUser.set(
        row.user_id,
        (pointsByUser.get(row.user_id) ?? 0) + row.points,
      );
    }

    const sortedUsers = [...pointsByUser.entries()].sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    });

    const rankMap = new Map<string, number>();
    sortedUsers.forEach(([userId], index) => {
      rankMap.set(userId, index + 1);
    });
    rankings.push(rankMap);
  }

  return rankings;
}

function buildPoolAverageTrend(
  rows: PoolScoreRow[],
  matchOrder: string[],
  kickoffByMatch: Map<string, number>,
) {
  const pointsByUser = new Map<string, number>();
  const poolTrend: Array<{ kickoffAt: number; poolCumulative: number }> = [];

  for (const matchId of matchOrder) {
    for (const row of rows.filter((entry) => entry.match_id === matchId)) {
      pointsByUser.set(
        row.user_id,
        (pointsByUser.get(row.user_id) ?? 0) + row.points,
      );
    }

    const totals = [...pointsByUser.values()];
    const average =
      totals.length > 0
        ? totals.reduce((sum, value) => sum + value, 0) / totals.length
        : 0;

    poolTrend.push({
      kickoffAt: kickoffByMatch.get(matchId) ?? 0,
      poolCumulative: Math.round(average * 10) / 10,
    });
  }

  return poolTrend;
}

export async function getStageBreakdown(
  db: AppDatabase,
  userId: string,
): Promise<DashboardStageBreakdown[]> {
  const rows = await sqlAll<{
    stage: string;
    points: number;
    exact: number;
    result: number;
    miss: number;
    settled: number;
  }>(
    db,
    `SELECT
      matches.stage AS stage,
      COALESCE(SUM(scores.points), 0) AS points,
      COALESCE(SUM(CASE WHEN scores.reason = 'EXACT' THEN 1 ELSE 0 END), 0) AS exact,
      COALESCE(SUM(CASE WHEN scores.reason = 'RESULT' THEN 1 ELSE 0 END), 0) AS result,
      COALESCE(SUM(CASE WHEN scores.reason = 'MISS' THEN 1 ELSE 0 END), 0) AS miss,
      COUNT(scores.match_id) AS settled
    FROM scores
    JOIN matches ON matches.id = scores.match_id
    WHERE scores.user_id = ?
    GROUP BY matches.stage
    ORDER BY MIN(matches.kickoff_at) ASC`,
    [userId],
  );

  const grouped = new Map<string, DashboardStageBreakdown>();

  for (const row of rows) {
    const label = normalizeStageLabel(row.stage);
    const existing = grouped.get(label);

    if (existing) {
      existing.points += row.points;
      existing.exact += row.exact;
      existing.result += row.result;
      existing.miss += row.miss;
      existing.settled += row.settled;
      continue;
    }

    grouped.set(label, {
      stage: row.stage,
      label,
      points: row.points,
      exact: row.exact,
      result: row.result,
      miss: row.miss,
      settled: row.settled,
    });
  }

  return [...grouped.values()];
}

export async function getDashboardData(
  db: AppDatabase,
  userId: string,
  now = Date.now(),
): Promise<DashboardData> {
  const matches =
    (
      await sqlGet<{ total: number }>(
        db,
        "SELECT COUNT(*) AS total FROM matches",
      )
    )?.total ?? 0;

  const bets =
    (
      await sqlGet<{ total: number }>(
        db,
        "SELECT COUNT(*) AS total FROM bets WHERE user_id = ?",
        [userId],
      )
    )?.total ?? 0;

  const userStats = await sqlGet<UserStatsRow>(
    db,
    `SELECT
      COALESCE(SUM(points), 0) AS total_points,
      COALESCE(SUM(CASE WHEN reason = 'EXACT' THEN 1 ELSE 0 END), 0) AS exact,
      COALESCE(SUM(CASE WHEN reason = 'RESULT' THEN 1 ELSE 0 END), 0) AS result,
      COALESCE(SUM(CASE WHEN reason = 'MISS' THEN 1 ELSE 0 END), 0) AS miss,
      COUNT(*) AS settled
    FROM scores
    WHERE user_id = ?`,
    [userId],
  );

  const scoreRows = await sqlAll<UserScoreRow>(
    db,
    `SELECT
      matches.id AS match_id,
      matches.kickoff_at,
      matches.stage,
      home.name AS home_team,
      away.name AS away_team,
      bets.predicted_home_goals,
      bets.predicted_away_goals,
      matches.home_goals_90,
      matches.away_goals_90,
      scores.points,
      scores.reason
    FROM scores
    JOIN matches ON matches.id = scores.match_id
    LEFT JOIN teams home ON home.id = matches.home_team_id
    LEFT JOIN teams away ON away.id = matches.away_team_id
    LEFT JOIN bets ON bets.match_id = matches.id AND bets.user_id = scores.user_id
    WHERE scores.user_id = ?
    ORDER BY matches.kickoff_at ASC`,
    [userId],
  );

  const poolRows = await sqlAll<PoolScoreRow>(
    db,
    `SELECT
      scores.user_id,
      scores.match_id,
      matches.kickoff_at,
      scores.points
    FROM scores
    JOIN matches ON matches.id = scores.match_id
    ORDER BY matches.kickoff_at ASC, scores.user_id ASC`,
  );

  const matchOrder = [...new Set(poolRows.map((row) => row.match_id))];
  const kickoffByMatch = new Map(
    poolRows.map((row) => [row.match_id, row.kickoff_at]),
  );
  const rankings = buildLeaderboardRankings(poolRows, matchOrder);
  const poolTrend = buildPoolAverageTrend(poolRows, matchOrder, kickoffByMatch);

  let cumulative = 0;
  let previousRank: number | null = null;
  const trend: DashboardTrendPoint[] = scoreRows.map((row, index) => {
    cumulative += row.points;
    const rankMap = rankings[index];
    const rank = rankMap?.get(userId) ?? 1;
    const rankDelta = previousRank == null ? 0 : rank - previousRank;
    previousRank = rank;

    return {
      label: formatTrendLabel(row.home_team, row.away_team, row.kickoff_at),
      kickoffAt: row.kickoff_at,
      points: row.points,
      cumulative,
      poolCumulative: poolTrend[index]?.poolCumulative ?? 0,
      rank,
      rankDelta,
      reason: row.reason,
    };
  });

  const poolReasonRows = await sqlAll<PoolReasonRow>(
    db,
    `SELECT reason, COUNT(*) AS count
     FROM scores
     GROUP BY reason`,
  );

  const poolBreakdown = {
    exact: poolReasonRows.find((row) => row.reason === "EXACT")?.count ?? 0,
    result: poolReasonRows.find((row) => row.reason === "RESULT")?.count ?? 0,
    miss: poolReasonRows.find((row) => row.reason === "MISS")?.count ?? 0,
  };

  const leaders = await getLeaderboard(db);
  const activeLeaders = leaders.filter((leader) => leader.totalBets > 0);
  const rankIndex = activeLeaders.findIndex(
    (leader) => leader.userId === userId,
  );

  const settled = userStats?.settled ?? 0;
  const exact = userStats?.exact ?? 0;
  const result = userStats?.result ?? 0;
  const hits = exact + result;
  const lastTrendPoint = trend.at(-1);

  const pickHistory: DashboardPickHistory[] = scoreRows.map((row) => ({
    matchId: row.match_id,
    homeTeam: row.home_team ?? "TBD",
    awayTeam: row.away_team ?? "TBD",
    kickoffAt: row.kickoff_at,
    predictedHomeGoals: row.predicted_home_goals ?? 0,
    predictedAwayGoals: row.predicted_away_goals ?? 0,
    actualHomeGoals90: row.home_goals_90 ?? 0,
    actualAwayGoals90: row.away_goals_90 ?? 0,
    points: row.points,
    reason: row.reason,
  }));

  return {
    matches,
    bets,
    stats: {
      totalPoints: userStats?.total_points ?? 0,
      exact,
      result,
      miss: userStats?.miss ?? 0,
      settled,
      accuracy: settled > 0 ? Math.round((hits / settled) * 100) : 0,
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      playerCount: activeLeaders.length,
      rankDeltaSinceLastMatch: lastTrendPoint?.rankDelta ?? null,
    },
    spotlight: await getSpotlightMatch(db, now),
    trend,
    stageBreakdown: await getStageBreakdown(db, userId),
    pickHistory,
    poolBreakdown,
    recentScores: [...scoreRows]
      .reverse()
      .slice(0, 5)
      .map((row) => ({
        homeTeam: row.home_team ?? "TBD",
        awayTeam: row.away_team ?? "TBD",
        points: row.points,
        reason: row.reason,
        kickoffAt: row.kickoff_at,
      })),
    leaders: leaders.slice(0, 5),
  };
}
