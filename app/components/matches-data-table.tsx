"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Form } from "react-router";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { DataTable } from "~/components/ui/data-table";
import { Input } from "~/components/ui/input";
import {
  isMatchLockedForBetting,
  isUnfetchedKnockoutMatch,
} from "~/lib/match-betting";

export type MatchTableRow = {
  id: string;
  kickoff_at: number;
  stage: string;
  group_code: string | null;
  status: string;
  home_goals: number | null;
  away_goals: number | null;
  home_team: string | null;
  away_team: string | null;
  predicted_home_goals: number | null;
  predicted_away_goals: number | null;
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function lockLabel(match: MatchTableRow) {
  if (match.status === "FINISHED") {
    return "Finished";
  }
  if (isUnfetchedKnockoutMatch(match)) {
    return "Awaiting teams";
  }
  return "Locked";
}

const columns: ColumnDef<MatchTableRow>[] = [
  {
    accessorKey: "kickoff_at",
    header: "Kickoff",
    cell: ({ row }) => (
      <div className="flex min-w-36 flex-col gap-1">
        <span className="font-medium">
          {dateFormatter.format(new Date(row.original.kickoff_at))}
        </span>
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">{row.original.stage}</Badge>
          {row.original.group_code &&
          row.original.group_code !== row.original.stage ? (
            <Badge variant="outline">{row.original.group_code}</Badge>
          ) : null}
        </div>
      </div>
    ),
  },
  {
    id: "fixture",
    header: () => (
      <div className="flex flex-col gap-0.5">
        <span>Fixture</span>
        <span className="font-normal text-muted-foreground text-xs">
          Home (left) · Away (right)
        </span>
      </div>
    ),
    cell: ({ row }) => {
      const match = row.original;
      return (
        <div className="flex min-w-56 flex-col gap-2">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Home
              </span>
              <span className="font-medium">{match.home_team ?? "TBD"}</span>
            </div>
            <span className="text-muted-foreground text-xs">vs</span>
            <div className="flex flex-col gap-0.5 text-right">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Away
              </span>
              <span className="font-medium">{match.away_team ?? "TBD"}</span>
            </div>
          </div>
          {match.status === "FINISHED" ? (
            <span className="text-muted-foreground text-sm tabular-nums">
              Final {match.home_goals}:{match.away_goals} (home:away)
            </span>
          ) : null}
        </div>
      );
    },
  },
  {
    id: "prediction",
    header: () => (
      <div className="flex flex-col gap-0.5">
        <span>Your prediction</span>
        <span className="font-normal text-muted-foreground text-xs">
          Left = home goals · Right = away goals
        </span>
      </div>
    ),
    cell: ({ row }) => {
      const match = row.original;
      const locked = isMatchLockedForBetting(match);
      const homeInputId = `${match.id}-predicted-home`;
      const awayInputId = `${match.id}-predicted-away`;
      const homeTeam = match.home_team ?? "Home";
      const awayTeam = match.away_team ?? "Away";

      return (
        <Form method="post" className="flex items-end gap-2">
          <input type="hidden" name="matchId" value={match.id} />
          <label htmlFor={homeInputId} className="flex max-w-24 flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Home
            </span>
            <span className="truncate text-xs" title={homeTeam}>
              {homeTeam}
            </span>
            <Input
              id={homeInputId}
              name="predictedHomeGoals"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={match.predicted_home_goals ?? ""}
              disabled={locked}
              className="w-16"
              aria-label={`Predicted goals for ${homeTeam} (home)`}
            />
          </label>
          <span aria-hidden className="pb-2 text-muted-foreground text-xs">
            :
          </span>
          <label htmlFor={awayInputId} className="flex max-w-24 flex-col gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Away
            </span>
            <span className="truncate text-xs" title={awayTeam}>
              {awayTeam}
            </span>
            <Input
              id={awayInputId}
              name="predictedAwayGoals"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={match.predicted_away_goals ?? ""}
              disabled={locked}
              className="w-16"
              aria-label={`Predicted goals for ${awayTeam} (away)`}
            />
          </label>
          <Button type="submit" size="sm" disabled={locked}>
            {locked ? lockLabel(match) : "Save"}
          </Button>
        </Form>
      );
    },
  },
];

export function MatchesDataTable({ matches }: { matches: MatchTableRow[] }) {
  return <DataTable columns={columns} data={matches} />;
}
