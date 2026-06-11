import { BETTING_CLOSE_WINDOW_MS } from "~/lib/match-betting";

export const BETTING_CLOSE_HOURS = BETTING_CLOSE_WINDOW_MS / (60 * 60 * 1000);

export const contestRulesSummary = [
  `Predictions lock ${BETTING_CLOSE_HOURS} hours before kickoff — edit freely until then.`,
  "Predict match scores; each match earns 0, 1, or 3 points (exact score, correct result, or miss).",
  "Participation is invite-only for your company email domain.",
  "Late joiners are welcome, but only matches you predicted before the lock count toward your score.",
  "Leaderboard ranking: total points, then exact scores, then correct results.",
] as const;
