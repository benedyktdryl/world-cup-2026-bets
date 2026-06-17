import { MATCHES_ORDER_BY } from "~/lib/matches";
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
};

type UserScoreRow = {
  kickoff_at: number;
  home_team: string | null;
  away_team: string | null;
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

const MATCH_SPOTLIGHT_SELECT = `
  matches.id,
  matches.kickoff_at,
  matches.status,
  matches.home_goals,
  matches.away_goals,
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
  };
  spotlight: DashboardSpotlight | null;
  trend: DashboardTrendPoint[];
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
      matches.kickoff_at,
      home.name AS home_team,
      away.name AS away_team,
      scores.points,
      scores.reason
    FROM scores
    JOIN matches ON matches.id = scores.match_id
    LEFT JOIN teams home ON home.id = matches.home_team_id
    LEFT JOIN teams away ON away.id = matches.away_team_id
    WHERE scores.user_id = ?
    ORDER BY matches.kickoff_at ASC`,
    [userId],
  );

  let cumulative = 0;
  const trend: DashboardTrendPoint[] = scoreRows.map((row) => {
    cumulative += row.points;
    return {
      label: formatTrendLabel(row.home_team, row.away_team, row.kickoff_at),
      kickoffAt: row.kickoff_at,
      points: row.points,
      cumulative,
      reason: row.reason,
    };
  });

  const poolRows = await sqlAll<PoolReasonRow>(
    db,
    `SELECT reason, COUNT(*) AS count
     FROM scores
     GROUP BY reason`,
  );

  const poolBreakdown = {
    exact: poolRows.find((row) => row.reason === "EXACT")?.count ?? 0,
    result: poolRows.find((row) => row.reason === "RESULT")?.count ?? 0,
    miss: poolRows.find((row) => row.reason === "MISS")?.count ?? 0,
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
    },
    spotlight: await getSpotlightMatch(db, now),
    trend,
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
