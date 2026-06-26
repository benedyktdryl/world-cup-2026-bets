"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart";

const trendChartConfig = {
  cumulative: {
    label: "Your points",
    color: "var(--chart-1)",
  },
  poolCumulative: {
    label: "Pool average",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

const breakdownChartConfig = {
  exact: {
    label: "Exact score",
    color: "var(--chart-1)",
  },
  result: {
    label: "Correct result",
    color: "var(--chart-2)",
  },
  miss: {
    label: "Miss",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

const poolChartConfig = {
  exact: {
    label: "Exact",
    color: "var(--chart-1)",
  },
  result: {
    label: "Result",
    color: "var(--chart-2)",
  },
  miss: {
    label: "Miss",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

type TrendPoint = {
  label: string;
  cumulative: number;
  poolCumulative?: number;
  points: number;
  rank?: number;
  rankDelta?: number;
};

type StageBreakdownPoint = {
  label: string;
  points: number;
  exact: number;
  result: number;
  miss: number;
};

type Breakdown = {
  exact: number;
  result: number;
  miss: number;
};

function formatRankDelta(rankDelta?: number) {
  if (rankDelta == null || rankDelta === 0) {
    return "No change";
  }
  if (rankDelta < 0) {
    return `Up ${Math.abs(rankDelta)}`;
  }
  return `Down ${rankDelta}`;
}

export function PointsTrendChart({ data }: { data: TrendPoint[] }) {
  if (!data.length) {
    return (
      <p className="flex h-48 items-center justify-center text-muted-foreground text-sm">
        Points trend appears after your first settled match.
      </p>
    );
  }

  const showPoolAverage = data.some((point) => (point.poolCumulative ?? 0) > 0);

  return (
    <ChartContainer config={trendChartConfig} className="h-48 w-full">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="pointsFill" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-cumulative)"
              stopOpacity={0.35}
            />
            <stop
              offset="100%"
              stopColor="var(--color-cumulative)"
              stopOpacity={0.02}
            />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          hide={data.length > 6}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={28}
          allowDecimals={false}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.label ?? ""
              }
              formatter={(value, name, item) => {
                if (name === "poolCumulative") {
                  return (
                    <span className="font-medium tabular-nums">
                      Pool avg: {value} pts
                    </span>
                  );
                }

                return (
                  <div className="grid gap-1">
                    <span className="flex items-center gap-2">
                      <span className="font-medium tabular-nums">
                        {value} pts
                      </span>
                      <span className="text-muted-foreground">
                        (+{item.payload.points} this match)
                      </span>
                    </span>
                    {item.payload.rank != null ? (
                      <span className="text-muted-foreground text-xs">
                        Rank #{item.payload.rank} ·{" "}
                        {formatRankDelta(item.payload.rankDelta)}
                      </span>
                    ) : null}
                  </div>
                );
              }}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="cumulative"
          stroke="var(--color-cumulative)"
          fill="url(#pointsFill)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--color-cumulative)" }}
          activeDot={{ r: 5 }}
        />
        {showPoolAverage ? (
          <Line
            type="monotone"
            dataKey="poolCumulative"
            stroke="var(--color-poolCumulative)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
          />
        ) : null}
      </AreaChart>
    </ChartContainer>
  );
}

export function StageBreakdownChart({ data }: { data: StageBreakdownPoint[] }) {
  if (!data.length) {
    return (
      <p className="flex h-48 items-center justify-center text-muted-foreground text-sm">
        Stage performance appears once matches settle.
      </p>
    );
  }

  return (
    <ChartContainer config={breakdownChartConfig} className="h-48 w-full">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={12}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={28}
          allowDecimals={false}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <span className="font-medium tabular-nums">
                  {breakdownChartConfig[
                    name as keyof typeof breakdownChartConfig
                  ]?.label ?? name}
                  : {value}
                </span>
              )}
            />
          }
        />
        <Bar
          dataKey="exact"
          stackId="stage"
          fill="var(--color-exact)"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="result"
          stackId="stage"
          fill="var(--color-result)"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="miss"
          stackId="stage"
          fill="var(--color-miss)"
          radius={[6, 6, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}

export function PredictionBreakdownChart({ data }: { data: Breakdown }) {
  const chartData = [
    { key: "exact", value: data.exact, fill: "var(--color-exact)" },
    { key: "result", value: data.result, fill: "var(--color-result)" },
    { key: "miss", value: data.miss, fill: "var(--color-miss)" },
  ].filter((item) => item.value > 0);

  const total = data.exact + data.result + data.miss;

  if (!total) {
    return (
      <p className="flex h-48 items-center justify-center text-muted-foreground text-sm">
        Your prediction mix shows up once matches settle.
      </p>
    );
  }

  return (
    <div className="flex h-48 items-center gap-4">
      <ChartContainer
        config={breakdownChartConfig}
        className="aspect-square h-full max-h-48 flex-1"
      >
        <PieChart>
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, name) => (
                  <span className="font-medium tabular-nums">
                    {breakdownChartConfig[
                      name as keyof typeof breakdownChartConfig
                    ]?.label ?? name}
                    : {value}
                  </span>
                )}
              />
            }
          />
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="key"
            innerRadius="58%"
            outerRadius="82%"
            strokeWidth={2}
            stroke="var(--background)"
          >
            {chartData.map((entry) => (
              <Cell key={entry.key} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="grid shrink-0 gap-2 text-sm">
        {chartData.map((item) => (
          <li key={item.key} className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-full"
              style={{ background: item.fill }}
            />
            <span className="text-muted-foreground">
              {
                breakdownChartConfig[
                  item.key as keyof typeof breakdownChartConfig
                ]?.label
              }
            </span>
            <span className="ml-auto font-medium tabular-nums">
              {Math.round((item.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PoolTrendChart({ data }: { data: Breakdown }) {
  const chartData = [
    { label: "Exact", key: "exact", count: data.exact },
    { label: "Result", key: "result", count: data.result },
    { label: "Miss", key: "miss", count: data.miss },
  ];

  const total = chartData.reduce((sum, item) => sum + item.count, 0);

  if (!total) {
    return (
      <p className="flex h-40 items-center justify-center text-muted-foreground text-sm">
        Pool trends appear once anyone has settled predictions.
      </p>
    );
  }

  return (
    <ChartContainer config={poolChartConfig} className="h-40 w-full">
      <BarChart
        data={chartData}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={28}
          allowDecimals={false}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <span className="font-medium tabular-nums">
                  {value} predictions (
                  {Math.round((Number(value) / total) * 100)}%)
                </span>
              )}
            />
          }
        />
        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
          {chartData.map((entry) => (
            <Cell key={entry.key} fill={`var(--color-${entry.key})`} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
