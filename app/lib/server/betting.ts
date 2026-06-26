import { randomUUID } from "node:crypto";
import { isMatchLockedForBetting } from "~/lib/match-betting";
import type { AppDatabase } from "./db";
import { sqlAll, sqlGet, sqlRun, sqlTransaction } from "./sql";

export type ScoreReason = "EXACT" | "RESULT" | "MISS";

type MatchRow = {
  id: string;
  kickoff_at: number;
  stage: string;
  group_code: string | null;
  home_goals: number | null;
  away_goals: number | null;
  home_goals_90: number | null;
  away_goals_90: number | null;
  went_to_extra_time: number;
  status: "SCHEDULED" | "LIVE" | "FINISHED";
  home_team: string | null;
  away_team: string | null;
};

export type { MatchBettingState } from "~/lib/match-betting";
export {
  isMatchLockedForBetting,
  isUnfetchedKnockoutMatch,
} from "~/lib/match-betting";

type BetRow = {
  user_id: string;
  match_id: string;
  predicted_home_goals: number;
  predicted_away_goals: number;
};

type LeaderboardRow = {
  user_id: string;
  display_name: string;
  points: number | null;
  exact_scores: number | null;
  result_hits: number | null;
  total_bets: number | null;
};

export function scorePrediction(input: {
  predictedHomeGoals: number;
  predictedAwayGoals: number;
  actualHomeGoals: number;
  actualAwayGoals: number;
}): { points: number; reason: ScoreReason } {
  if (
    input.predictedHomeGoals === input.actualHomeGoals &&
    input.predictedAwayGoals === input.actualAwayGoals
  ) {
    return { points: 3, reason: "EXACT" };
  }

  const predictedResult = resultOf(
    input.predictedHomeGoals,
    input.predictedAwayGoals,
  );
  const actualResult = resultOf(input.actualHomeGoals, input.actualAwayGoals);

  if (predictedResult === actualResult) {
    return { points: 1, reason: "RESULT" };
  }

  return { points: 0, reason: "MISS" };
}

export function getScoringGoals(match: {
  home_goals_90: number | null;
  away_goals_90: number | null;
  home_goals: number | null;
  away_goals: number | null;
}) {
  if (match.home_goals_90 != null && match.away_goals_90 != null) {
    return {
      homeGoals: match.home_goals_90,
      awayGoals: match.away_goals_90,
    };
  }

  if (match.home_goals != null && match.away_goals != null) {
    return {
      homeGoals: match.home_goals,
      awayGoals: match.away_goals,
    };
  }

  return null;
}

function resultOf(homeGoals: number, awayGoals: number) {
  if (homeGoals > awayGoals) {
    return "HOME";
  }
  if (awayGoals > homeGoals) {
    return "AWAY";
  }
  return "DRAW";
}

async function getMatch(db: AppDatabase, matchId: string) {
  const match = await sqlGet<MatchRow>(
    db,
    `SELECT
      matches.id,
      matches.kickoff_at,
      matches.stage,
      matches.group_code,
      matches.home_goals,
      matches.away_goals,
      matches.home_goals_90,
      matches.away_goals_90,
      matches.went_to_extra_time,
      matches.status,
      home.name AS home_team,
      away.name AS away_team
     FROM matches
     LEFT JOIN teams home ON home.id = matches.home_team_id
     LEFT JOIN teams away ON away.id = matches.away_team_id
     WHERE matches.id = ?`,
    [matchId],
  );

  if (!match) {
    throw new Error("MATCH_NOT_FOUND");
  }

  return match;
}

export async function upsertBet(
  db: AppDatabase,
  input: {
    userId: string;
    matchId: string;
    predictedHomeGoals: number;
    predictedAwayGoals: number;
    now?: Date;
  },
) {
  const match = await getMatch(db, input.matchId);
  const now = input.now ?? new Date();
  if (isMatchLockedForBetting(match, now)) {
    throw new Error("MATCH_LOCKED");
  }

  const updatedAt = now.getTime();
  await sqlRun(
    db,
    `INSERT INTO bets (
      id,
      user_id,
      match_id,
      predicted_home_goals,
      predicted_away_goals,
      locked_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, match_id) DO UPDATE SET
      predicted_home_goals = excluded.predicted_home_goals,
      predicted_away_goals = excluded.predicted_away_goals,
      locked_at = excluded.locked_at,
      updated_at = excluded.updated_at`,
    [
      randomUUID(),
      input.userId,
      input.matchId,
      input.predictedHomeGoals,
      input.predictedAwayGoals,
      match.kickoff_at,
      updatedAt,
    ],
  );
}

export async function settleMatch(
  db: AppDatabase,
  input: {
    matchId: string;
    homeGoals: number;
    awayGoals: number;
    homeGoals90?: number;
    awayGoals90?: number;
    wentToExtraTime?: boolean;
  },
) {
  const homeGoals90 = input.homeGoals90 ?? input.homeGoals;
  const awayGoals90 = input.awayGoals90 ?? input.awayGoals;
  const wentToExtraTime =
    input.wentToExtraTime ??
    (homeGoals90 !== input.homeGoals || awayGoals90 !== input.awayGoals);

  await sqlRun(
    db,
    `UPDATE matches
     SET home_goals = ?,
       away_goals = ?,
       home_goals_90 = ?,
       away_goals_90 = ?,
       went_to_extra_time = ?,
       status = 'FINISHED',
       updated_at = ?
     WHERE id = ?`,
    [
      input.homeGoals,
      input.awayGoals,
      homeGoals90,
      awayGoals90,
      wentToExtraTime ? 1 : 0,
      Date.now(),
      input.matchId,
    ],
  );
}

export async function recalculateScores(db: AppDatabase, matchId: string) {
  const match = await getMatch(db, matchId);
  const scoringGoals = getScoringGoals(match);
  if (match.status !== "FINISHED" || scoringGoals == null) {
    return;
  }

  const bets = await sqlAll<BetRow>(
    db,
    `SELECT user_id, match_id, predicted_home_goals, predicted_away_goals
     FROM bets
     WHERE match_id = ?`,
    [matchId],
  );

  const now = Date.now();
  await sqlTransaction(db, async (tx) => {
    for (const bet of bets) {
      const score = scorePrediction({
        predictedHomeGoals: bet.predicted_home_goals,
        predictedAwayGoals: bet.predicted_away_goals,
        actualHomeGoals: scoringGoals.homeGoals,
        actualAwayGoals: scoringGoals.awayGoals,
      });

      await sqlRun(
        tx,
        `INSERT INTO scores (user_id, match_id, points, reason, calculated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, match_id) DO UPDATE SET
           points = excluded.points,
           reason = excluded.reason,
           calculated_at = excluded.calculated_at`,
        [bet.user_id, bet.match_id, score.points, score.reason, now],
      );
    }
  });
}

export async function getLeaderboard(db: AppDatabase) {
  const rows = await sqlAll<LeaderboardRow>(
    db,
    `SELECT
      profiles.user_id,
      profiles.display_name,
      COALESCE(SUM(scores.points), 0) AS points,
      COALESCE(SUM(CASE WHEN scores.reason = 'EXACT' THEN 1 ELSE 0 END), 0)
        AS exact_scores,
      COALESCE(SUM(CASE WHEN scores.reason = 'RESULT' THEN 1 ELSE 0 END), 0)
        AS result_hits,
      COUNT(scores.match_id) AS total_bets
    FROM profiles
    LEFT JOIN scores ON scores.user_id = profiles.user_id
    GROUP BY profiles.user_id, profiles.display_name
    ORDER BY points DESC, exact_scores DESC, result_hits DESC, profiles.display_name ASC`,
  );

  return rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    points: row.points ?? 0,
    exactScores: row.exact_scores ?? 0,
    resultHits: row.result_hits ?? 0,
    totalBets: row.total_bets ?? 0,
  }));
}
