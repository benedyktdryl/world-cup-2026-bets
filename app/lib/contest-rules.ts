import { BETTING_CLOSE_WINDOW_MS } from "~/lib/match-betting";

export const BETTING_CLOSE_HOURS = BETTING_CLOSE_WINDOW_MS / (60 * 60 * 1000);

export const contestRulesSummary = [
  `Predictions lock ${BETTING_CLOSE_HOURS} hours before kickoff — edit freely until then.`,
  "Predict the score after 90 minutes (regular time). Extra time and penalty shootouts do not count toward your points.",
  "Each match earns 0, 1, or 3 points (miss, correct result, or exact 90-minute score).",
  "The match list may show the full-time result when a game goes to extra time; your points are always based on the 90-minute score.",
  "Knockout fixtures unlock for betting once both teams are known.",
  "Participation is invite-only for your company email domain.",
  "Late joiners are welcome, but only matches you predicted before the lock count toward your score.",
  "Leaderboard ranking: total points, then exact scores, then correct results.",
] as const;
