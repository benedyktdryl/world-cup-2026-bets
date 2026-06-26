export type MatchScheduleFields = {
  id: string;
  kickoff_at: number;
  stage: string;
  group_code: string | null;
};

export const MATCHES_ORDER_BY = `
  matches.kickoff_at ASC,
  CASE
    WHEN matches.stage GLOB 'Group *' THEN 0
    WHEN matches.stage GLOB 'Round [0-9]*' THEN 1
    WHEN matches.stage LIKE '%1/16%' OR matches.stage LIKE '%1/8%' THEN 2
    WHEN matches.stage LIKE '%Quarter%' THEN 3
    WHEN matches.stage LIKE '%Semi%' THEN 4
    WHEN matches.stage LIKE '%Final%' THEN 5
    ELSE 6
  END,
  matches.group_code ASC,
  matches.stage ASC,
  matches.id ASC
`;

function stageRank(stage: string) {
  if (/^group /i.test(stage)) {
    return 0;
  }
  if (/^round \d+$/i.test(stage)) {
    return 100 + Number(stage.match(/\d+/)?.[0] ?? 0);
  }
  if (/1\/16|round of 16/i.test(stage)) {
    return 200;
  }
  if (/1\/8|quarter/i.test(stage)) {
    return 300;
  }
  if (/semi/i.test(stage)) {
    return 400;
  }
  if (/final/i.test(stage)) {
    return 500;
  }
  return 600;
}

export function compareMatchesBySchedule(
  left: MatchScheduleFields,
  right: MatchScheduleFields,
) {
  if (left.kickoff_at !== right.kickoff_at) {
    return left.kickoff_at - right.kickoff_at;
  }

  const stageDiff = stageRank(left.stage) - stageRank(right.stage);
  if (stageDiff !== 0) {
    return stageDiff;
  }

  const groupDiff = (left.group_code ?? "").localeCompare(
    right.group_code ?? "",
  );
  if (groupDiff !== 0) {
    return groupDiff;
  }

  return left.id.localeCompare(right.id);
}

export function normalizeStageLabel(stage: string) {
  const trimmed = stage.trim();

  if (/^group /i.test(trimmed) || /^round \d+$/i.test(trimmed)) {
    return "Group stage";
  }
  if (/1\/16|round of 16/i.test(trimmed)) {
    return "Round of 16";
  }
  if (/1\/8|quarter/i.test(trimmed)) {
    return "Quarter-finals";
  }
  if (/semi/i.test(trimmed)) {
    return "Semi-finals";
  }
  if (/final/i.test(trimmed)) {
    return "Final";
  }

  return trimmed;
}
