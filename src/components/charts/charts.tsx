/**
 * Chart building blocks on top of Recharts. Every chart receives already-derived
 * data (see features/metrics.ts) and renders an accessible text summary.
 */
import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface Datum {
  key: string;
  name: string;
  value: number;
  fill: string;
}

interface TooltipPayloadItem {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  fill?: string;
  dataKey?: string | number;
  payload?: { fill?: string };
}

export function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: readonly TooltipPayloadItem[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      {label !== undefined && <p className="mb-1 font-medium">{label}</p>}
      <ul className="space-y-0.5">
        {payload.map((p, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="size-2 rounded-sm" style={{ background: p.color ?? p.payload?.fill ?? p.fill }} aria-hidden />
            <span className="text-muted-foreground">{p.name}</span>
            <span className="ml-auto pl-3 font-semibold tabular-nums">{String(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChartCard({
  title,
  description,
  summary,
  children,
  className,
  height = 240,
  actions,
  raw,
}: {
  title: string;
  description?: string;
  summary: string;
  children: React.ReactElement;
  className?: string;
  height?: number;
  actions?: React.ReactNode;
  /** Render children as-is (for composite charts that manage their own container). */
  raw?: boolean;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {actions}
      </CardHeader>
      <CardContent className="flex-1">
        <figure>
          <div style={{ height }} aria-hidden>
            {raw ? (
              children
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {children}
              </ResponsiveContainer>
            )}
          </div>
          <figcaption className="sr-only">{summary}</figcaption>
        </figure>
      </CardContent>
    </Card>
  );
}

const axis = { stroke: "var(--chart-axis)", fontSize: 11, tickLine: false, axisLine: false } as const;

export function DonutChart({ data, centerLabel, centerValue }: { data: Datum[]; centerLabel: string; centerValue: React.ReactNode }) {
  const total = data.reduce((n, d) => n + d.value, 0);
  return (
    <div className="flex h-full flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-full min-h-40 w-full sm:w-1/2">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<ChartTooltip />} />
            <Pie data={total ? data : [{ key: "none", name: "No data", value: 1, fill: "var(--muted)" }]} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="92%" paddingAngle={total ? 2 : 0} stroke="none" isAnimationActive>
              {(total ? data : [{ fill: "var(--muted)" }]).map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">{centerValue}</span>
          <span className="text-[10px] text-muted-foreground">{centerLabel}</span>
        </div>
      </div>
      <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:w-1/2 sm:grid-cols-1">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ background: d.fill }} aria-hidden />
            <span className="truncate text-muted-foreground">{d.name}</span>
            <span className="ml-auto font-semibold tabular-nums">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface SeriesDef {
  key: string;
  name: string;
  color: string;
  stack?: string;
}

export function StackedBars({ data, xKey, series, layout = "horizontal", legend = true }: { data: object[]; xKey: string; series: SeriesDef[]; layout?: "horizontal" | "vertical"; legend?: boolean }) {
  const vertical = layout === "vertical";
  return (
    <BarChart data={data} layout={vertical ? "vertical" : "horizontal"} margin={{ top: 4, right: 8, left: vertical ? 8 : -18, bottom: 0 }} barCategoryGap="22%">
      <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={vertical} horizontal={!vertical} />
      {vertical ? (
        <>
          <XAxis type="number" allowDecimals={false} {...axis} />
          <YAxis type="category" dataKey={xKey} width={110} {...axis} />
        </>
      ) : (
        <>
          <XAxis dataKey={xKey} {...axis} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} {...axis} />
        </>
      )}
      <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--accent)", opacity: 0.5 }} />
      {legend && <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />}
      {series.map((s, i) => (
        <Bar key={s.key} dataKey={s.key} name={s.name} stackId={s.stack} fill={s.color} radius={i === series.length - 1 || !s.stack ? (vertical ? [0, 3, 3, 0] : [3, 3, 0, 0]) : 0} maxBarSize={vertical ? 16 : 34} />
      ))}
    </BarChart>
  );
}

export function TrendArea({ data, xKey, series }: { data: object[]; xKey: string; series: SeriesDef[] }) {
  return (
    <AreaChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
      <defs>
        {series.map((s) => (
          <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={s.color} stopOpacity={0} />
          </linearGradient>
        ))}
      </defs>
      <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey={xKey} {...axis} interval="preserveStartEnd" />
      <YAxis allowDecimals={false} {...axis} />
      <Tooltip content={<ChartTooltip />} />
      <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
      {series.map((s) => (
        <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} fill={`url(#grad-${s.key})`} stackId={s.stack} />
      ))}
    </AreaChart>
  );
}

export function TrendLines({ data, xKey, series }: { data: object[]; xKey: string; series: SeriesDef[] }) {
  return (
    <LineChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
      <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey={xKey} {...axis} interval="preserveStartEnd" />
      <YAxis allowDecimals={false} {...axis} />
      <Tooltip content={<ChartTooltip />} />
      <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
      {series.map((s) => (
        <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      ))}
    </LineChart>
  );
}

export function summarize(data: { name: string; value: number }[]): string {
  return data.map((d) => `${d.name}: ${d.value}`).join(", ");
}
