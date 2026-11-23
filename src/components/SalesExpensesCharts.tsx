import { useId, useState } from 'react';
import { BarChart3, PieChart } from 'lucide-react';
import { formatCurrencyBRL } from '../utils/finance';
import type { SalesDailyChartPoint } from '../utils/salesExpensesSummary';

function formatAxisMoney(val: number): string {
  if (val <= 0) return '0';
  if (val >= 1000) {
    const k = val / 1000;
    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1).replace('.', ',')}k`;
  }
  return `R$${Math.round(val)}`;
}

function computeNiceMaxValue(rawMax: number): number {
  if (rawMax <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const normalized = rawMax / magnitude;
  let niceFactor = 10;
  if (normalized <= 1.2) niceFactor = 1.2;
  else if (normalized <= 1.5) niceFactor = 1.5;
  else if (normalized <= 2) niceFactor = 2;
  else if (normalized <= 3) niceFactor = 3;
  else if (normalized <= 4) niceFactor = 4;
  else if (normalized <= 5) niceFactor = 5;
  else if (normalized <= 6) niceFactor = 6;
  else if (normalized <= 8) niceFactor = 8;
  return niceFactor * magnitude;
}

function formatPercentBR(val: number): string {
  return `${val.toFixed(1).replace('.', ',')}%`;
}

interface SalesByDayAreaChartProps {
  data: SalesDailyChartPoint[];
}

export function SalesByDayAreaChart({ data }: SalesByDayAreaChartProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const gradientId = useId();

  const hasSales = data.some((d) => d.revenue > 0);
  if (data.length === 0 || !hasSales) {
    return (
      <div className="h-[236px] flex flex-col items-center justify-center text-center px-4 bg-[#F9FAFC] border border-dashed border-[#E8EAF0] rounded-xl gap-2">
        <div className="w-10 h-10 rounded-full bg-white border border-[#E8EAF0] text-[#778094] flex items-center justify-center">
          <BarChart3 className="w-4 h-4" aria-hidden="true" />
        </div>
        <p className="text-xs sm:text-sm font-medium text-[#778094]">
          Nenhuma venda registrada no período selecionado.
        </p>
      </div>
    );
  }

  const rawMax = Math.max(...data.map((d) => d.revenue), 0);
  const maxVal = computeNiceMaxValue(rawMax);

  const width = 640;
  const height = 244;
  const padLeft = 52;
  const padRight = 18;
  const padTop = 20;
  const padBottom = 34;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const baselineY = padTop + chartH;

  const points = data.map((item, idx) => {
    const x =
      data.length === 1
        ? padLeft + chartW / 2
        : padLeft + (idx / (data.length - 1)) * chartW;
    const y =
      item.revenue > 0
        ? padTop + chartH - (item.revenue / maxVal) * chartH
        : baselineY;
    return { x, y, item, idx };
  });

  const linePath =
    points.length === 1
      ? `M ${padLeft} ${points[0].y} L ${width - padRight} ${points[0].y}`
      : points
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
          .join(' ');

  const areaPath =
    points.length === 1
      ? `M ${padLeft} ${baselineY} L ${padLeft} ${points[0].y} L ${width - padRight} ${points[0].y} L ${width - padRight} ${baselineY} Z`
      : `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${baselineY} L ${points[0].x.toFixed(2)} ${baselineY} Z`;

  const yTicks = [0, 1 / 3, 2 / 3, 1];
  const xLabelStep =
    data.length <= 8
      ? 1
      : data.length <= 16
        ? 2
        : Math.max(1, Math.ceil(data.length / 7));

  const activePoint =
    activeIdx !== null && points[activeIdx] ? points[activeIdx] : null;
  const tooltipLeftPct = activePoint
    ? Math.min(84, Math.max(16, (activePoint.x / width) * 100))
    : 50;
  const sliceWidth = data.length > 1 ? chartW / (data.length - 1) : chartW;

  return (
    <div
      className="relative select-none overflow-x-clip"
      onMouseLeave={() => setActiveIdx(null)}
    >
      {activePoint && (
        <div
          role="status"
          style={{ left: `${tooltipLeftPct}%` }}
          className="pointer-events-none absolute -top-2 -translate-x-1/2 z-20 rounded-xl bg-white border border-[#E8EAF0] px-3.5 py-2 shadow-[0_8px_22px_rgba(23,32,51,0.12)] whitespace-nowrap transition-all duration-150"
        >
          <p className="text-xs sm:text-[13px] font-extrabold font-mono tabular-nums text-[#172033]">
            {formatCurrencyBRL(activePoint.item.revenue)}
          </p>
          <p className="text-[11px] font-medium text-[#778094] mt-0.5">
            {activePoint.item.fullDateLabel}
            {activePoint.item.ordersCount > 0
              ? ` · ${activePoint.item.ordersCount} ${
                  activePoint.item.ordersCount === 1 ? 'pedido' : 'pedidos'
                }`
              : ''}
          </p>
        </div>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[226px] sm:h-[244px] overflow-visible"
        role="img"
        aria-label="Gráfico de vendas por dia"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F5B900" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#F5B900" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {yTicks.map((t) => {
          const y = padTop + chartH - t * chartH;
          const val = maxVal * t;
          return (
            <g key={t}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                stroke={t === 0 ? '#E8EAF0' : '#F0F2F7'}
                strokeWidth={1}
              />
              <text
                x={padLeft - 10}
                y={y + 4}
                textAnchor="end"
                className="fill-[#778094] text-[11px] font-mono tabular-nums"
              >
                {formatAxisMoney(val)}
              </text>
            </g>
          );
        })}

        {/* Area Fill */}
        <path d={areaPath} fill={`url(#${gradientId})`}>
          <animate
            attributeName="opacity"
            from="0"
            to="1"
            dur="0.32s"
            fill="freeze"
          />
        </path>

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="#F5B900"
          strokeWidth={2.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <animate
            attributeName="opacity"
            from="0.25"
            to="1"
            dur="0.28s"
            fill="freeze"
          />
        </path>

        {/* Active Vertical Guide */}
        {activePoint && (
          <line
            x1={activePoint.x}
            x2={activePoint.x}
            y1={padTop}
            y2={baselineY}
            stroke="#D5D9E4"
            strokeDasharray="3 3"
            strokeWidth={1.25}
          />
        )}

        {/* Data Points + Hit Zones + X-axis Labels */}
        {points.map((pt) => {
          const isActive = activeIdx === pt.idx;
          const showDot =
            isActive ||
            data.length <= 14 ||
            pt.item.revenue > 0;
          const showXLabel =
            data.length <= 8 ||
            pt.idx === 0 ||
            pt.idx === points.length - 1 ||
            pt.idx % xLabelStep === 0;

          const hitX =
            data.length === 1
              ? padLeft
              : Math.max(padLeft - 8, pt.x - sliceWidth / 2);
          const hitW =
            data.length === 1 ? chartW : sliceWidth;

          return (
            <g
              key={pt.item.date}
              tabIndex={0}
              role="button"
              aria-label={`${pt.item.fullDateLabel}: ${formatCurrencyBRL(pt.item.revenue)}${
                pt.item.ordersCount > 0
                  ? `, ${pt.item.ordersCount} ${
                      pt.item.ordersCount === 1 ? 'pedido' : 'pedidos'
                    }`
                  : ''
              }`}
              onMouseEnter={() => setActiveIdx(pt.idx)}
              onFocus={() => setActiveIdx(pt.idx)}
              onBlur={() =>
                setActiveIdx((prev) => (prev === pt.idx ? null : prev))
              }
              onClick={() =>
                setActiveIdx((prev) => (prev === pt.idx ? null : pt.idx))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveIdx((prev) => (prev === pt.idx ? null : pt.idx));
                } else if (e.key === 'Escape') {
                  setActiveIdx(null);
                }
              }}
              className="cursor-pointer focus:outline-none"
            >
              <rect
                x={hitX}
                y={padTop}
                width={hitW}
                height={chartH + padBottom}
                fill="transparent"
              />

              {showDot && (
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isActive ? 5.5 : data.length <= 14 ? 3.5 : 2.5}
                  fill={isActive ? '#172033' : '#F5B900'}
                  stroke="#FFFFFF"
                  strokeWidth={isActive ? 2.5 : 1.5}
                />
              )}

              {showXLabel && (
                <text
                  x={pt.x}
                  y={height - 10}
                  textAnchor="middle"
                  className={`text-[10.5px] font-mono tabular-nums ${
                    isActive
                      ? 'fill-[#172033] font-bold'
                      : 'fill-[#778094] font-medium'
                  }`}
                >
                  {pt.item.shortDate}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export interface DoughnutSegmentItem {
  key: string;
  label: string;
  amount: number;
  sharePercent: number;
  count: number;
  color: string;
}

interface InteractiveBreakdownDoughnutChartProps {
  segments: DoughnutSegmentItem[];
  totalAmount: number;
  centerIdleLabel?: string;
  emptyMessage: string;
  countUnitSingular?: string;
  countUnitPlural?: string;
  ariaLabel: string;
}

export function InteractiveBreakdownDoughnutChart({
  segments,
  totalAmount,
  centerIdleLabel = 'Total',
  emptyMessage,
  countUnitSingular = 'registro',
  countUnitPlural = 'registros',
  ariaLabel,
}: InteractiveBreakdownDoughnutChartProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  if (segments.length === 0 || totalAmount <= 0) {
    return (
      <div className="h-[220px] flex flex-col items-center justify-center text-center px-4 bg-[#F9FAFC] border border-dashed border-[#E8EAF0] rounded-xl gap-2">
        <div className="w-10 h-10 rounded-full bg-white border border-[#E8EAF0] text-[#778094] flex items-center justify-center">
          <PieChart className="w-4 h-4" aria-hidden="true" />
        </div>
        <p className="text-xs sm:text-sm font-medium text-[#778094]">
          {emptyMessage}
        </p>
      </div>
    );
  }

  const size = 164;
  const center = size / 2;
  const radius = 58;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * radius;

  // Normalize arcs so total fills 100% of ring cleanly
  const sumAmounts = segments.reduce((acc, s) => acc + Math.max(0, s.amount), 0);
  let cumulativeFraction = 0;

  const activeSegment =
    segments.find((s) => s.key === activeKey) ?? null;

  return (
    <div
      className="relative flex flex-col sm:flex-row items-center gap-5 sm:gap-6"
      onMouseLeave={() => setActiveKey(null)}
    >
      {/* Floating Tooltip */}
      {activeSegment && (
        <div
          role="status"
          className="pointer-events-none absolute -top-2 left-1/2 sm:left-20 -translate-x-1/2 z-20 rounded-xl bg-white border border-[#E8EAF0] px-3.5 py-2 shadow-[0_8px_22px_rgba(23,32,51,0.12)] whitespace-nowrap"
        >
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: activeSegment.color }}
              aria-hidden="true"
            />
            <span className="text-xs font-bold text-[#172033]">
              {activeSegment.label}
            </span>
          </div>
          <p className="text-xs font-extrabold font-mono tabular-nums text-[#172033] mt-0.5">
            {formatCurrencyBRL(activeSegment.amount)} ·{' '}
            <span className="text-[#778094] font-semibold">
              {formatPercentBR(activeSegment.sharePercent)}
            </span>
          </p>
          <p className="text-[10.5px] text-[#778094] font-mono tabular-nums">
            {activeSegment.count}{' '}
            {activeSegment.count === 1 ? countUnitSingular : countUnitPlural}
          </p>
        </div>
      )}

      {/* Doughnut Ring */}
      <div className="relative w-[164px] h-[164px] shrink-0 flex items-center justify-center">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          role="img"
          aria-label={ariaLabel}
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#F0F2F7"
            strokeWidth={strokeWidth}
          />
          {segments.map((seg) => {
            const fraction =
              sumAmounts > 0 ? Math.max(0, seg.amount) / sumAmounts : 0;
            const dashLength = fraction * circumference;
            const dashOffset = -cumulativeFraction * circumference;
            cumulativeFraction += fraction;
            const isHovered = activeKey === seg.key;

            return (
              <circle
                key={seg.key}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={`${Math.max(0, dashLength - (segments.length > 1 ? 1.5 : 0))} ${circumference}`}
                strokeDashoffset={dashOffset}
                tabIndex={0}
                role="button"
                aria-label={`${seg.label}: ${formatCurrencyBRL(seg.amount)} (${formatPercentBR(seg.sharePercent)})`}
                onMouseEnter={() => setActiveKey(seg.key)}
                onFocus={() => setActiveKey(seg.key)}
                onBlur={() =>
                  setActiveKey((prev) => (prev === seg.key ? null : prev))
                }
                onClick={() =>
                  setActiveKey((prev) => (prev === seg.key ? null : seg.key))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveKey((prev) => (prev === seg.key ? null : seg.key));
                  } else if (e.key === 'Escape') {
                    setActiveKey(null);
                  }
                }}
                className="cursor-pointer transition-all duration-150 focus:outline-none"
              />
            );
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
          <span className="text-[10px] font-semibold text-[#778094] truncate max-w-[92px]">
            {activeSegment ? activeSegment.label : centerIdleLabel}
          </span>
          <span className="text-xs sm:text-[13px] font-extrabold text-[#172033] font-mono tabular-nums mt-0.5">
            {activeSegment
              ? formatPercentBR(activeSegment.sharePercent)
              : formatCurrencyBRL(totalAmount)}
          </span>
        </div>
      </div>

      {/* Lateral Legend */}
      <ul className="flex-1 w-full space-y-2.5 min-w-0">
        {segments.map((seg) => {
          const isHovered = activeKey === seg.key;
          return (
            <li key={seg.key}>
              <button
                type="button"
                aria-pressed={isHovered}
                onMouseEnter={() => setActiveKey(seg.key)}
                onFocus={() => setActiveKey(seg.key)}
                onBlur={() =>
                  setActiveKey((prev) => (prev === seg.key ? null : prev))
                }
                onClick={() =>
                  setActiveKey((prev) => (prev === seg.key ? null : seg.key))
                }
                className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition-colors cursor-pointer ${
                  isHovered ? 'bg-[#F7F8FC]' : 'hover:bg-[#F7F8FC]/70'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: seg.color }}
                    aria-hidden="true"
                  />
                  <span className="text-xs sm:text-[13px] font-semibold text-[#172033] truncate">
                    {seg.label}
                  </span>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 font-mono tabular-nums">
                  <span className="text-[11px] text-[#778094]">
                    {formatCurrencyBRL(seg.amount)}
                  </span>
                  <span className="text-xs font-bold text-[#172033] w-12 text-right">
                    {formatPercentBR(seg.sharePercent)}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
