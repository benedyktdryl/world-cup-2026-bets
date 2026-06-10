import { isMatchLockedForBetting, type MatchBettingState } from "~/lib/match-betting";
import type { AppDatabase } from "./db";
import { sqlAll } from "./sql";

type ProfileStatsRow = {
  user_id: string;
  email: string;
  display_name: string;
  role: "USER" | "ADMIN";
  created_at: number;
  bets_placed: number;
  points: number;
  exact_scores: number;
};

type MatchRow = MatchBettingState;

export type RegisteredUserStats = {
  userId: string;
  email: string;
  displayName: string;
  role: "USER" | "ADMIN";
  createdAt: number;
  betsPlaced: number;
  points: number;
  exactScores: number;
  completionPercent: number;
  openCompletionPercent: number;
};

export type ContestBettingSummary = {
  totalUsers: number;
  totalMatches: number;
  openMatches: number;
  averageBetsPlaced: number;
  averageCompletionPercent: number;
};

export function countOpenMatches(matches: MatchRow[], now = new Date()) {
  return matches.filter((match) => !isMatchLockedForBetting(match, now)).length;
}

function percent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 100);
}

export async function getRegisteredUserStats(
  db: AppDatabase,
  now = new Date(),
) {
  const [profiles, matches] = await Promise.all([
    sqlAll<ProfileStatsRow>(
      db,
      `SELECT
        profiles.user_id,
        profiles.email,
        profiles.display_name,
        profiles.role,
        profiles.created_at,
        (
          SELECT COUNT(*)
          FROM bets
          WHERE bets.user_id = profiles.user_id
        ) AS bets_placed,
        (
          SELECT COALESCE(SUM(points), 0)
          FROM scores
          WHERE scores.user_id = profiles.user_id
        ) AS points,
        (
          SELECT COUNT(*)
          FROM scores
          WHERE scores.user_id = profiles.user_id
            AND scores.reason = 'EXACT'
        ) AS exact_scores
      FROM profiles
      ORDER BY profiles.created_at DESC`,
    ),
    sqlAll<MatchRow>(
      db,
      `SELECT
        matches.kickoff_at,
        matches.stage,
        matches.group_code,
        matches.status,
        home.name AS home_team,
        away.name AS away_team
      FROM matches
      LEFT JOIN teams home ON home.id = matches.home_team_id
      LEFT JOIN teams away ON away.id = matches.away_team_id`,
    ),
  ]);

  const totalMatches = matches.length;
  const openMatches = countOpenMatches(matches, now);

  const users: RegisteredUserStats[] = profiles.map((profile) => ({
    userId: profile.user_id,
    email: profile.email,
    displayName: profile.display_name,
    role: profile.role,
    createdAt: profile.created_at,
    betsPlaced: profile.bets_placed,
    points: profile.points,
    exactScores: profile.exact_scores,
    completionPercent: percent(profile.bets_placed, totalMatches),
    openCompletionPercent: percent(profile.bets_placed, openMatches),
  }));

  const summary: ContestBettingSummary = {
    totalUsers: users.length,
    totalMatches,
    openMatches,
    averageBetsPlaced:
      users.length === 0
        ? 0
        : Math.round(
            users.reduce((sum, user) => sum + user.betsPlaced, 0) / users.length,
          ),
    averageCompletionPercent:
      users.length === 0
        ? 0
        : Math.round(
            users.reduce((sum, user) => sum + user.completionPercent, 0) /
              users.length,
          ),
  };

  return { users, summary };
}
