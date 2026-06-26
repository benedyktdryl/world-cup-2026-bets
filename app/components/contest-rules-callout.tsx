import { contestRulesSummary } from "~/lib/contest-rules";

export function ContestRulesCallout() {
  return (
    <details className="rounded-xl border bg-muted/20 px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium text-foreground">
        Contest rules
      </summary>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
        {contestRulesSummary.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ol>
    </details>
  );
}
