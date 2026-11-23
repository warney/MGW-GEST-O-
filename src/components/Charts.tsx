import { useState } from 'react';
import type { ChartPoint } from '../utils/finance';
import { formatCurrencyBRL } from '../utils/finance';

interface ChartBaseProps {
  data: ChartPoint[];
  emptyText?: string;
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-56 flex items-center justify-center text-sm text-[#6B7280] border border-dashed border-[#E5E7EB] rounded-xl">
      {message}
    </div>
  );
}

export function Revenue7DaysChart({ data }: ChartBaseProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxVal = Math.max(...data.map((d) => d.revenue), 100);
  const hasAny = data.some((d) => d.revenue > 0);

  if (!hasAny) {
    return <EmptyChart message="Nenhuma venda registrada nos últimos 7 dias." />;
  }

  const width = 560;
  const height = 220;
  const padLeft = 58;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 32;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const stepX = chartW / Math.max(1, data.length);
  const barW = Math.min(34, stepX * 0.56);

  const ticks = [0, 0.5, 1];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-56 overflow-visible"
        role="img"
        aria-label="Gráfico de faturamento dos últimos 7 dias"
      >
        {ticks.map((t) => {
          const y = padTop + chartH - t * chartH;
          const val = maxVal * t;
          return (
            <g key={t}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                stroke="#E5E7EB"
                strokeDasharray={t === 0 ? undefined : '3 3'}
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-[#6B7280] text-[10px] font-mono tabular-nums"
              >
                {val >= 1000 ? `R$${(val / 1000).toFixed(1)}k` : `R$${Math.round(val)}`}
              </text>
            </g>
          );
        })}

        {data.map((point, idx) => {
          const x = padLeft + idx * stepX + (stepX - barW) / 2;
          const barH = (point.revenue / maxVal) * chartH;
          const y = padTop + chartH - barH;
          const isHovered = hoveredIdx === idx;
          return (
            <g
              key={point.key}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer"
            >
              <rect
                x={padLeft + idx * stepX}
                y={padTop}
                width={stepX}
                height={chartH + padBottom}
                fill="transparent"
              />
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(2, barH)}
                rx={6}
                fill={isHovered ? '#F5C842' : '#EAB308'}
                className="transition-colors duration-150"
              />
              <text
                x={padLeft + idx * stepX + stepX / 2}
                y={height - 10}
                textAnchor="middle"
                className="fill-[#6B7280] text-[11px] font-mono tabular-nums"
              >
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>

      {hoveredIdx !== null && data[hoveredIdx] && (
        <div className="mt-2 flex items-center justify-between text-xs text-[#4B5563] border-t border-[#E5E7EB] pt-2 font-mono tabular-nums">
          <span>{data[hoveredIdx].label}</span>
          <span className="text-[#EAB308] font-semibold">
            {formatCurrencyBRL(data[hoveredIdx].revenue)} · {data[hoveredIdx].qty} X-Saladas
          </span>
        </div>
      )}
    </div>
  );
}

export function XSaladaDailyChart({ data }: ChartBaseProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxQty = Math.max(...data.map((d) => d.qty), 5);
  const hasAny = data.some((d) => d.qty > 0);

  if (!hasAny) {
    return <EmptyChart message="Nenhum X-Salada vendido no período exibido." />;
  }

  const width = 560;
  const height = 220;
  const padLeft = 40;
  const padRight = 16;
  const padTop = 22;
  const padBottom = 32;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const stepX = chartW / Math.max(1, data.length);
  const barW = Math.min(34, stepX * 0.54);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-56 overflow-visible"
        role="img"
        aria-label="Gráfico de quantidade de X-Saladas vendidos por dia"
      >
        {[0, 0.5, 1].map((t) => {
          const y = padTop + chartH - t * chartH;
          return (
            <g key={t}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                stroke="#E5E7EB"
                strokeDasharray={t === 0 ? undefined : '3 3'}
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-[#6B7280] text-[10px] font-mono tabular-nums"
              >
                {Math.round(maxQty * t)}
              </text>
            </g>
          );
        })}

        {data.map((point, idx) => {
          const x = padLeft + idx * stepX + (stepX - barW) / 2;
          const barH = (point.qty / maxQty) * chartH;
          const y = padTop + chartH - barH;
          const isHovered = hoveredIdx === idx;
          return (
            <g
              key={point.key}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer"
            >
              <rect
                x={padLeft + idx * stepX}
                y={padTop}
                width={stepX}
                height={chartH + padBottom}
                fill="transparent"
              />
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(2, barH)}
                rx={6}
                fill={isHovered ? '#FBE7A2' : '#D97706'}
                className="transition-colors duration-150"
              />
              {point.qty > 0 && (
                <text
                  x={x + barW / 2}
                  y={Math.max(12, y - 6)}
                  textAnchor="middle"
                  className="fill-[#111827] text-[10px] font-mono font-semibold tabular-nums"
                >
                  {point.qty}
                </text>
              )}
              <text
                x={padLeft + idx * stepX + stepX / 2}
                y={height - 10}
                textAnchor="middle"
                className="fill-[#6B7280] text-[11px] font-mono tabular-nums"
              >
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>

      {hoveredIdx !== null && data[hoveredIdx] && (
        <div className="mt-2 flex items-center justify-between text-xs text-[#4B5563] border-t border-[#E5E7EB] pt-2 font-mono tabular-nums">
          <span>{data[hoveredIdx].label}</span>
          <span className="text-[#F5C842] font-semibold">
            {data[hoveredIdx].qty} X-Saladas · {formatCurrencyBRL(data[hoveredIdx].revenue)}
          </span>
        </div>
      )}
    </div>
  );
}

export function RevenueVsExpensesChart({ data }: ChartBaseProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxVal = Math.max(
    ...data.map((d) => Math.max(d.revenue, d.expenses)),
    100,
  );
  const hasAny = data.some((d) => d.revenue > 0 || d.expenses > 0);

  if (!hasAny) {
    return <EmptyChart message="Sem movimentações financeiras neste recorte." />;
  }

  const width = 560;
  const height = 220;
  const padLeft = 58;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 32;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const stepX = chartW / Math.max(1, data.length);
  const groupW = Math.min(38, stepX * 0.68);
  const barW = Math.max(6, (groupW - 4) / 2);

  return (
    <div className="relative">
      <div className="flex items-center gap-5 mb-2 text-xs text-[#6B7280]">
        <span className="inline-flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#EAB308]" aria-hidden="true" />
          Faturamento
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#EF4444]" aria-hidden="true" />
          Despesas
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-52 overflow-visible"
        role="img"
        aria-label="Comparativo entre faturamento e despesas"
      >
        {[0, 0.5, 1].map((t) => {
          const y = padTop + chartH - t * chartH;
          const val = maxVal * t;
          return (
            <g key={t}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                stroke="#E5E7EB"
                strokeDasharray={t === 0 ? undefined : '3 3'}
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-[#6B7280] text-[10px] font-mono tabular-nums"
              >
                {val >= 1000 ? `R$${(val / 1000).toFixed(1)}k` : `R$${Math.round(val)}`}
              </text>
            </g>
          );
        })}

        {data.map((point, idx) => {
          const groupX = padLeft + idx * stepX + (stepX - groupW) / 2;
          const revH = (point.revenue / maxVal) * chartH;
          const expH = (point.expenses / maxVal) * chartH;
          const showLabel = data.length <= 8 || idx % 2 === 0 || idx === data.length - 1;

          return (
            <g
              key={point.key}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer"
            >
              <rect
                x={padLeft + idx * stepX}
                y={padTop}
                width={stepX}
                height={chartH + padBottom}
                fill="transparent"
              />
              <rect
                x={groupX}
                y={padTop + chartH - revH}
                width={barW}
                height={Math.max(2, revH)}
                rx={3}
                fill={hoveredIdx === idx ? '#F5C842' : '#EAB308'}
              />
              <rect
                x={groupX + barW + 4}
                y={padTop + chartH - expH}
                width={barW}
                height={Math.max(2, expH)}
                rx={3}
                fill={hoveredIdx === idx ? '#F87171' : '#EF4444'}
              />
              {showLabel && (
                <text
                  x={padLeft + idx * stepX + stepX / 2}
                  y={height - 10}
                  textAnchor="middle"
                  className="fill-[#6B7280] text-[10px] font-mono tabular-nums"
                >
                  {point.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hoveredIdx !== null && data[hoveredIdx] && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#4B5563] border-t border-[#E5E7EB] pt-2 font-mono tabular-nums">
          <span>{data[hoveredIdx].label}</span>
          <span>
            Fat: <strong className="text-[#EAB308]">{formatCurrencyBRL(data[hoveredIdx].revenue)}</strong>
            {' · '}
            Desp: <strong className="text-[#F87171]">{formatCurrencyBRL(data[hoveredIdx].expenses)}</strong>
            {' · '}
            Lucro:{' '}
            <strong className={data[hoveredIdx].profit >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'}>
              {formatCurrencyBRL(data[hoveredIdx].profit)}
            </strong>
          </span>
        </div>
      )}
    </div>
  );
}

export function MonthlyProfitEvolutionChart({ data }: ChartBaseProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const hasAny = data.some((d) => d.revenue > 0 || d.expenses > 0);

  if (!hasAny) {
    return <EmptyChart message="Sem histórico mensal suficiente para exibir evolução." />;
  }

  const values = data.map((d) => d.profit);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(100, ...values);
  const range = Math.max(1, maxVal - minVal);

  const width = 560;
  const height = 220;
  const padLeft = 60;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 32;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const points = data.map((d, idx) => {
    const x =
      data.length === 1
        ? padLeft + chartW / 2
        : padLeft + (idx / (data.length - 1)) * chartW;
    const y = padTop + chartH - ((d.profit - minVal) / range) * chartH;
    return { x, y, ...d };
  });

  const linePath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const zeroY = padTop + chartH - ((0 - minVal) / range) * chartH;
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${zeroY.toFixed(1)} L ${points[0].x.toFixed(1)} ${zeroY.toFixed(1)} Z`
      : '';

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-56 overflow-visible"
        role="img"
        aria-label="Evolução do lucro líquido mensal"
      >
        <defs>
          <linearGradient id="mgwProfitFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22C55E" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#22C55E" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {[minVal, (minVal + maxVal) / 2, maxVal].map((val, idx) => {
          const y = padTop + chartH - ((val - minVal) / range) * chartH;
          return (
            <g key={idx}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                stroke={val === 0 ? '#334155' : '#E5E7EB'}
                strokeDasharray={val === 0 ? undefined : '3 3'}
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-[#6B7280] text-[10px] font-mono tabular-nums"
              >
                {Math.abs(val) >= 1000
                  ? `R$${(val / 1000).toFixed(1)}k`
                  : `R$${Math.round(val)}`}
              </text>
            </g>
          );
        })}

        {areaPath && <path d={areaPath} fill="url(#mgwProfitFill)" />}

        <path
          d={linePath}
          fill="none"
          stroke="#22C55E"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((p, idx) => (
          <g
            key={p.key}
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
            className="cursor-pointer"
          >
            <circle cx={p.x} cy={p.y} r={14} fill="transparent" />
            <circle
              cx={p.x}
              cy={p.y}
              r={hoveredIdx === idx ? 6 : 4}
              fill={p.profit >= 0 ? '#22C55E' : '#EF4444'}
              stroke="#F9FAFB"
              strokeWidth={2}
            />
            <text
              x={p.x}
              y={height - 10}
              textAnchor="middle"
              className="fill-[#6B7280] text-[10px] font-mono tabular-nums"
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>

      {hoveredIdx !== null && points[hoveredIdx] && (
        <div className="mt-2 flex items-center justify-between text-xs text-[#4B5563] border-t border-[#E5E7EB] pt-2 font-mono tabular-nums">
          <span>{points[hoveredIdx].label}</span>
          <span
            className={
              points[hoveredIdx].profit >= 0
                ? 'text-[#22C55E] font-semibold'
                : 'text-[#EF4444] font-semibold'
            }
          >
            Lucro: {formatCurrencyBRL(points[hoveredIdx].profit)} · Fat:{' '}
            {formatCurrencyBRL(points[hoveredIdx].revenue)}
          </span>
        </div>
      )}
    </div>
  );
}

interface FinancialHealthChartProps {
  data: ChartPoint[];
  revenue: number;
  expenses: number;
  periodCaption: string;
}

export function FinancialHealthChart({
  data,
  revenue,
  expenses,
  periodCaption,
}: FinancialHealthChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const totalFlow = Math.max(0, revenue) + Math.max(0, expenses);
  const netProfit = revenue - expenses;
  const expenseSharePct =
    revenue > 0
      ? Math.min(100, Math.max(0, (expenses / revenue) * 100))
      : expenses > 0
        ? 100
        : 0;
  const profitSharePct =
    revenue > 0 && netProfit > 0 ? Math.max(0, 100 - expenseSharePct) : 0;

  const hasSeriesActivity = data.some((d) => d.revenue > 0 || d.expenses > 0);
  const maxAbsProfit = Math.max(
    50,
    ...data.map((d) => Math.abs(d.profit)),
  );

  const width = 360;
  const height = 74;
  const padLeft = 6;
  const padRight = 6;
  const padTop = 8;
  const padBottom = 18;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const zeroY = padTop + chartH * 0.62;
  const posMaxH = zeroY - padTop;
  const negMaxH = padTop + chartH - zeroY;
  const stepX = chartW / Math.max(1, data.length);
  const barW = Math.min(22, stepX * 0.56);

  const activePoint =
    hoveredIdx !== null && data[hoveredIdx] ? data[hoveredIdx] : null;

  return (
    <div className="space-y-2">
      {/* Compact Revenue vs Expenses Proportion Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-[#6B7280]">
          <span>Composição ({periodCaption})</span>
          <span className="font-mono tabular-nums text-[#4B5563]">
            {totalFlow === 0
              ? 'Sem valores no período'
              : netProfit >= 0
                ? `Sobra ${profitSharePct.toFixed(0)}% · Custos ${expenseSharePct.toFixed(0)}%`
                : `Custos acima da receita`}
          </span>
        </div>
        <div
          className="h-2 w-full bg-[#F1F3F5] rounded-full overflow-hidden flex"
          aria-label="Proporção entre lucro líquido e despesas"
        >
          {totalFlow > 0 && (
            <>
              {profitSharePct > 0 && (
                <div
                  className="h-full bg-[#22C55E] transition-all duration-300"
                  style={{ width: `${profitSharePct}%` }}
                />
              )}
              {expenseSharePct > 0 && (
                <div
                  className="h-full bg-[#EF4444] transition-all duration-300"
                  style={{ width: `${expenseSharePct}%` }}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Compact Net Balance Mini-Chart */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[74px] overflow-visible"
          role="img"
          aria-label="Gráfico compacto de saldo líquido da saúde financeira"
        >
          <line
            x1={padLeft}
            x2={width - padRight}
            y1={zeroY}
            y2={zeroY}
            stroke="#E5E7EB"
            strokeWidth={1}
          />

          {data.map((d, idx) => {
            const x = padLeft + idx * stepX + (stepX - barW) / 2;
            const isPositive = d.profit >= 0;
            const rawH =
              d.profit === 0
                ? 2
                : isPositive
                  ? Math.max(4, (d.profit / maxAbsProfit) * posMaxH)
                  : Math.max(4, (Math.abs(d.profit) / maxAbsProfit) * negMaxH);
            const y = isPositive ? zeroY - rawH : zeroY;
            const fill =
              d.revenue === 0 && d.expenses === 0
                ? '#E5E7EB'
                : isPositive
                  ? hoveredIdx === idx
                    ? '#4ADE80'
                    : '#22C55E'
                  : hoveredIdx === idx
                    ? '#F87171'
                    : '#EF4444';

            return (
              <g
                key={d.key}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={() =>
                  setHoveredIdx((prev) => (prev === idx ? null : idx))
                }
                className="cursor-pointer"
              >
                <rect
                  x={padLeft + idx * stepX}
                  y={0}
                  width={stepX}
                  height={height}
                  fill="transparent"
                />
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={rawH}
                  rx={3}
                  fill={fill}
                />
                <text
                  x={x + barW / 2}
                  y={height - 3}
                  textAnchor="middle"
                  className="fill-[#6B7280] text-[9px] font-mono tabular-nums"
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="flex items-center justify-between text-[11px] text-[#6B7280] pt-0.5 font-mono tabular-nums">
          {activePoint ? (
            <>
              <span className="text-[#4B5563]">{activePoint.label}</span>
              <span
                className={
                  activePoint.profit >= 0
                    ? 'text-[#22C55E] font-semibold'
                    : 'text-[#EF4444] font-semibold'
                }
              >
                Saldo: {formatCurrencyBRL(activePoint.profit)} (Fat:{' '}
                {formatCurrencyBRL(activePoint.revenue)})
              </span>
            </>
          ) : (
            <>
              <span>
                {hasSeriesActivity
                  ? 'Saldo líquido por período'
                  : 'Aguardando lançamentos'}
              </span>
              <span className="inline-flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
                  Lucro
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#EF4444]" />
                  Despesas
                </span>
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
