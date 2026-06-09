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
    header: "Fixture",
    cell: ({ row }) => {
      const match = row.original;
      return (
        <div className="flex min-w-48 flex-col gap-1">
          <span className="font-medium">
            {match.home_team ?? "TBD"}{" "}
            <span className="text-muted-foreground">vs</span>{" "}
            {match.away_team ?? "TBD"}
          </span>
          {match.status === "FINISHED" ? (
            <span className="text-muted-foreground text-sm tabular-nums">
              Final {match.home_goals}-{match.away_goals}
            </span>
          ) : null}
        </div>
      );
    },
  },
  {
    id: "prediction",
    header: "Your prediction",
    cell: ({ row }) => {
      const match = row.original;
      const locked = isMatchLockedForBetting(match);
      const homeInputId = `${match.id}-predicted-home`;
      const awayInputId = `${match.id}-predicted-away`;

      return (
        <Form method="post" className="flex items-end gap-2">
          <input type="hidden" name="matchId" value={match.id} />
          <label htmlFor={homeInputId} className="flex flex-col gap-1 text-xs">
            Home
            <Input
              id={homeInputId}
              name="predictedHomeGoals"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={match.predicted_home_goals ?? ""}
              disabled={locked}
              className="w-16"
              aria-label="Predicted home goals"
            />
          </label>
          <label htmlFor={awayInputId} className="flex flex-col gap-1 text-xs">
            Away
            <Input
              id={awayInputId}
              name="predictedAwayGoals"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={match.predicted_away_goals ?? ""}
              disabled={locked}
              className="w-16"
              aria-label="Predicted away goals"
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
