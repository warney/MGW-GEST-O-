import { useState } from 'react';
import type { DashboardFinancialHealthView, DashboardRevenueDayPoint } from '../utils/dashboardSummary';
import type { ChartPoint } from '../utils/finance';
import { formatCurrencyBRL, formatDateBR } from '../utils/finance';

interface ChartBaseProps {
  data: ChartPoint[];
  emptyText?: string;
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-56 flex flex-col items-center justify-center text-center px-4 text-sm text-[#778094] bg-[#F9FAFC] border border-dashed border-[#E8EAF0] rounded-xl">
      <p>{message}</p>
    </div>
  );
}

function buildTopRoundedBarPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): string {
  const safeH = Math.max(0, height);
  const safeW = Math.max(0, width);
  const r = Math.min(radius, safeW / 2, safeH);
  if (safeH <= 0 || safeW <= 0) return '';
  if (r <= 0.5) {
    return `M ${x} ${y + safeH} L ${x} ${y} L ${x + safeW} ${y} L ${x + safeW} ${y + safeH} Z`;
  }
  return [
    `M ${x} ${y + safeH}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + safeW - r} ${y}`,
    `Q ${x + safeW} ${y} ${x + safeW} ${y + r}`,
    `L ${x + safeW} ${y + safeH}`,
    'Z',
  ].join(' ');
}

function formatAxisMoney(val: number): string {
  if (val === 0) return '0';
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

interface Revenue7DaysChartProps {
  data: Array<ChartPoint & Partial<DashboardRevenueDayPoint>>;
}

export function Revenue7DaysChart({ data }: Revenue7DaysChartProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const rawMax = Math.max(...data.map((d) => d.revenue), 0);
  const hasAny = data.some((d) => d.revenue > 0);

  if (!hasAny) {
    return (
      <EmptyChart message="Nenhuma venda registrada neste período de 7 dias." />
    );
  }

  const maxVal = computeNiceMaxValue(rawMax);
  const width = 620;
  const height = 248;
  const padLeft = 52;
  const padRight = 14;
  const padTop = 18;
  const padBottom = 46;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const stepX = chartW / Math.max(1, data.length);
  const barW = Math.min(44, stepX * 0.56);
  const ticks = [0, 1 / 3, 2 / 3, 1];

  const activePoint = activeIdx !== null ? data[activeIdx] : null;
  const tooltipLeftPct =
    activeIdx !== null
      ? Math.min(84, Math.max(16, ((activeIdx + 0.5) / Math.max(1, data.length)) * 100))
      : 50;

  return (
    <div
      className="relative select-none overflow-x-clip"
      onMouseLeave={() => setActiveIdx(null)}
    >
      {activePoint && (
        <div
          role="status"
          style={{ left: `${tooltipLeftPct}%` }}
          className="pointer-events-none absolute -top-2 -translate-x-1/2 z-20 rounded-xl bg-[#172033] text-white px-3 py-2 shadow-[0_10px_25px_rgba(23,32,51,0.22)] whitespace-nowrap transition-all duration-150"
        >
          <p className="text-[11px] font-medium text-[#CBD5E1]">
            {activePoint.weekdayLabel ? `${activePoint.weekdayLabel} · ` : ''}
            {activePoint.fullDateLabel || formatDateBR(activePoint.key)}
          </p>
          <p className="text-xs font-bold font-mono tabular-nums text-[#FFC928] mt-0.5">
            {formatCurrencyBRL(activePoint.revenue)}
          </p>
          {activePoint.qty > 0 && (
            <p className="text-[10px] text-[#CBD5E1] font-mono tabular-nums">
              {activePoint.qty} {activePoint.qty === 1 ? 'item vendido' : 'itens vendidos'}
            </p>
          )}
        </div>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[230px] sm:h-[248px] overflow-visible"
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

        {data.map((point, idx) => {
          const x = padLeft + idx * stepX + (stepX - barW) / 2;
          const barH = point.revenue > 0 ? Math.max(6, (point.revenue / maxVal) * chartH) : 0;
          const y = padTop + chartH - barH;
          const isActive = activeIdx === idx;
          const barPath = buildTopRoundedBarPath(x, y, barW, barH, 8);
          const centerX = padLeft + idx * stepX + stepX / 2;

          return (
            <g
              key={point.key}
              tabIndex={0}
              role="button"
              aria-label={`${point.weekdayLabel ? `${point.weekdayLabel}, ` : ''}${point.fullDateLabel || formatDateBR(point.key)}: ${formatCurrencyBRL(point.revenue)}`}
              onMouseEnter={() => setActiveIdx(idx)}
              onFocus={() => setActiveIdx(idx)}
              onBlur={() => setActiveIdx((prev) => (prev === idx ? null : prev))}
              onClick={() => setActiveIdx((prev) => (prev === idx ? null : idx))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveIdx((prev) => (prev === idx ? null : idx));
                } else if (e.key === 'Escape') {
                  setActiveIdx(null);
                }
              }}
              className="cursor-pointer focus:outline-none"
            >
              <rect
                x={padLeft + idx * stepX}
                y={padTop}
                width={stepX}
                height={chartH + padBottom}
                fill="transparent"
              />

              {isActive && (
                <rect
                  x={x - 4}
                  y={padTop}
                  width={barW + 8}
                  height={chartH}
                  rx={10}
                  fill="#F5F6FA"
                />
              )}

              {barH > 0 ? (
                <path
                  d={barPath}
                  fill={isActive ? '#FFC928' : '#F5B900'}
                  className="transition-colors duration-150"
                >
                  <animate
                    attributeName="opacity"
                    from="0.35"
                    to="1"
                    dur="0.28s"
                    begin="0s"
                    fill="freeze"
                  />
                </path>
              ) : (
                <line
                  x1={x}
                  x2={x + barW}
                  y1={padTop + chartH - 1}
                  y2={padTop + chartH - 1}
                  stroke="#D5D9E4"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              )}

              <text
                x={centerX}
                y={height - 22}
                textAnchor="middle"
                className={`text-[11px] font-medium ${
                  isActive ? 'fill-[#172033] font-semibold' : 'fill-[#778094]'
                }`}
              >
                {point.weekdayLabel || point.label}
              </text>
              {point.weekdayLabel && (
                <text
                  x={centerX}
                  y={height - 7}
                  textAnchor="middle"
                  className="fill-[#9EA6B8] text-[10px] font-mono tabular-nums"
                >
                  {point.shortDateLabel || point.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

interface FinancialHealthDoughnutProps {
  health: DashboardFinancialHealthView;
}

export function FinancialHealthDoughnutChart({
  health,
}: FinancialHealthDoughnutProps) {
  const [hovered, setHovered] = useState(false);

  const size = 164;
  const strokeWidth = 17;
  const center = size / 2;
  const radius = center - strokeWidth / 2 - 4;
  const circumference = 2 * Math.PI * radius;

  const isNegative = health.isAvailable && health.summary.netProfit < 0;
  const arcPercent = !health.isAvailable
    ? 0
    : isNegative
      ? 100
      : Math.max(4, health.positiveArcPercent);
  const dashOffset = circumference - (arcPercent / 100) * circumference;

  const strokeRef = !health.isAvailable
    ? '#E8EAF0'
    : isNegative
      ? '#E35D62'
      : health.status === 'critico'
        ? '#E35D62'
        : health.status === 'atencao'
          ? '#F5B900'
          : 'url(#mgwHealthRingGrad)';

  return (
    <div
      tabIndex={0}
      role="button"
      aria-expanded={hovered}
      aria-label={
        health.isAvailable && health.centerPercent !== null
          ? `Saúde financeira: margem líquida de ${health.centerPercent}%. Pressione Enter para ver detalhes.`
          : 'Saúde financeira indisponível sem movimentações'
      }
      className="relative flex items-center justify-center shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-[#F5B900] focus-visible:outline-offset-4"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onClick={() => setHovered((prev) => !prev)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setHovered((prev) => !prev);
        } else if (e.key === 'Escape') {
          setHovered(false);
        }
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={
          health.isAvailable && health.centerPercent !== null
            ? `Saúde financeira: margem líquida de ${health.centerPercent}%`
            : 'Saúde financeira indisponível sem movimentações'
        }
        className="w-[144px] h-[144px] sm:w-[158px] sm:h-[158px] cursor-pointer"
      >
        <defs>
          <linearGradient id="mgwHealthRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFC928" />
            <stop offset="55%" stopColor="#F5B900" />
            <stop offset="100%" stopColor="#16A36A" />
          </linearGradient>
        </defs>

        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#EEF0F6"
          strokeWidth={strokeWidth}
        />

        {health.isAvailable && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={strokeRef}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${center} ${center})`}
            className="transition-all duration-500 ease-out"
          />
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4 text-center">
        <span
          data-testid="health-doughnut-percent"
          className={`text-2xl sm:text-[28px] font-extrabold font-mono tabular-nums tracking-tight leading-none ${
            !health.isAvailable
              ? 'text-[#778094]'
              : isNegative
                ? 'text-[#E35D62]'
                : 'text-[#172033]'
          }`}
        >
          {health.centerPercent !== null ? `${health.centerPercent}%` : '—'}
        </span>
        <span className="text-[10px] font-medium text-[#778094] mt-1">
          {health.isAvailable ? 'Margem' : 'Sem dados'}
        </span>
      </div>

      {hovered && health.isAvailable && (
        <div
          role="status"
          className="absolute -bottom-2 translate-y-full left-1/2 -translate-x-1/2 z-20 w-52 rounded-xl bg-[#172033] text-white p-2.5 text-[11px] shadow-[0_12px_28px_rgba(23,32,51,0.22)] pointer-events-none"
        >
          <div className="flex justify-between gap-2">
            <span className="text-[#CBD5E1]">Faturamento</span>
            <span className="font-mono font-semibold text-[#FFC928]">
              {formatCurrencyBRL(health.summary.revenue)}
            </span>
          </div>
          <div className="flex justify-between gap-2 mt-1">
            <span className="text-[#CBD5E1]">Despesas</span>
            <span className="font-mono font-semibold text-[#FCA5A5]">
              {formatCurrencyBRL(health.summary.expenses)}
            </span>
          </div>
          <div className="flex justify-between gap-2 mt-1 pt-1 border-t border-white/15">
            <span className="text-[#CBD5E1]">Resultado</span>
            <span
              className={`font-mono font-bold ${
                health.summary.netProfit >= 0 ? 'text-[#6EE7B7]' : 'text-[#FCA5A5]'
              }`}
            >
              {formatCurrencyBRL(health.summary.netProfit)}
            </span>
          </div>
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
    <div
      className="relative overflow-x-clip"
      onMouseLeave={() => setHoveredIdx(null)}
    >
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
                stroke="#E8EAF0"
                strokeDasharray={t === 0 ? undefined : '3 3'}
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-[#778094] text-[10px] font-mono tabular-nums"
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
              tabIndex={0}
              role="button"
              aria-label={`${point.label}: ${point.qty} X-Saladas, ${formatCurrencyBRL(point.revenue)}`}
              onMouseEnter={() => setHoveredIdx(idx)}
              onFocus={() => setHoveredIdx(idx)}
              onBlur={() => setHoveredIdx((prev) => (prev === idx ? null : prev))}
              onClick={() => setHoveredIdx((prev) => (prev === idx ? null : idx))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setHoveredIdx((prev) => (prev === idx ? null : idx));
                } else if (e.key === 'Escape') {
                  setHoveredIdx(null);
                }
              }}
              className="cursor-pointer focus:outline-none"
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
                fill={isHovered ? '#FFC928' : '#F5B900'}
                className="transition-colors duration-150"
              />
              {point.qty > 0 && (
                <text
                  x={x + barW / 2}
                  y={Math.max(12, y - 6)}
                  textAnchor="middle"
                  className="fill-[#172033] text-[10px] font-mono font-semibold tabular-nums"
                >
                  {point.qty}
                </text>
              )}
              <text
                x={padLeft + idx * stepX + stepX / 2}
                y={height - 10}
                textAnchor="middle"
                className="fill-[#778094] text-[11px] font-mono tabular-nums"
              >
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>

      {hoveredIdx !== null && data[hoveredIdx] && (
        <div className="mt-2 flex items-center justify-between text-xs text-[#778094] border-t border-[#E8EAF0] pt-2 font-mono tabular-nums">
          <span>{data[hoveredIdx].label}</span>
          <span className="text-[#B38300] font-semibold">
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
    <div
      className="relative overflow-x-clip"
      onMouseLeave={() => setHoveredIdx(null)}
    >
      <div className="flex items-center gap-5 mb-2 text-xs text-[#778094]">
        <span className="inline-flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#F5B900]" aria-hidden="true" />
          Faturamento
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#E35D62]" aria-hidden="true" />
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
                stroke="#E8EAF0"
                strokeDasharray={t === 0 ? undefined : '3 3'}
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-[#778094] text-[10px] font-mono tabular-nums"
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
              tabIndex={0}
              role="button"
              aria-label={`${point.label}: Faturamento ${formatCurrencyBRL(point.revenue)}, Despesas ${formatCurrencyBRL(point.expenses)}`}
              onMouseEnter={() => setHoveredIdx(idx)}
              onFocus={() => setHoveredIdx(idx)}
              onBlur={() => setHoveredIdx((prev) => (prev === idx ? null : prev))}
              onClick={() => setHoveredIdx((prev) => (prev === idx ? null : idx))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setHoveredIdx((prev) => (prev === idx ? null : idx));
                } else if (e.key === 'Escape') {
                  setHoveredIdx(null);
                }
              }}
              className="cursor-pointer focus:outline-none"
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
                fill={hoveredIdx === idx ? '#FFC928' : '#F5B900'}
              />
              <rect
                x={groupX + barW + 4}
                y={padTop + chartH - expH}
                width={barW}
                height={Math.max(2, expH)}
                rx={3}
                fill={hoveredIdx === idx ? '#F87171' : '#E35D62'}
              />
              {showLabel && (
                <text
                  x={padLeft + idx * stepX + stepX / 2}
                  y={height - 10}
                  textAnchor="middle"
                  className="fill-[#778094] text-[10px] font-mono tabular-nums"
                >
                  {point.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hoveredIdx !== null && data[hoveredIdx] && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#778094] border-t border-[#E8EAF0] pt-2 font-mono tabular-nums">
          <span>{data[hoveredIdx].label}</span>
          <span>
            Fat: <strong className="text-[#B38300]">{formatCurrencyBRL(data[hoveredIdx].revenue)}</strong>
            {' · '}
            Desp: <strong className="text-[#E35D62]">{formatCurrencyBRL(data[hoveredIdx].expenses)}</strong>
            {' · '}
            Lucro:{' '}
            <strong className={data[hoveredIdx].profit >= 0 ? 'text-[#16A36A]' : 'text-[#E35D62]'}>
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
    <div
      className="relative overflow-x-clip"
      onMouseLeave={() => setHoveredIdx(null)}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-56 overflow-visible"
        role="img"
        aria-label="Evolução do lucro líquido mensal"
      >
        <defs>
          <linearGradient id="mgwProfitFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16A36A" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#16A36A" stopOpacity="0.0" />
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
                stroke={val === 0 ? '#CBD5E1' : '#E8EAF0'}
                strokeDasharray={val === 0 ? undefined : '3 3'}
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-[#778094] text-[10px] font-mono tabular-nums"
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
          stroke="#16A36A"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((p, idx) => (
          <g
            key={p.key}
            tabIndex={0}
            role="button"
            aria-label={`${p.label}: Lucro ${formatCurrencyBRL(p.profit)}, Faturamento ${formatCurrencyBRL(p.revenue)}`}
            onMouseEnter={() => setHoveredIdx(idx)}
            onFocus={() => setHoveredIdx(idx)}
            onBlur={() => setHoveredIdx((prev) => (prev === idx ? null : prev))}
            onClick={() => setHoveredIdx((prev) => (prev === idx ? null : idx))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setHoveredIdx((prev) => (prev === idx ? null : idx));
              } else if (e.key === 'Escape') {
                setHoveredIdx(null);
              }
            }}
            className="cursor-pointer focus:outline-none"
          >
            <circle cx={p.x} cy={p.y} r={14} fill="transparent" />
            <circle
              cx={p.x}
              cy={p.y}
              r={hoveredIdx === idx ? 6 : 4}
              fill={p.profit >= 0 ? '#16A36A' : '#E35D62'}
              stroke="#FFFFFF"
              strokeWidth={2}
            />
            <text
              x={p.x}
              y={height - 10}
              textAnchor="middle"
              className="fill-[#778094] text-[10px] font-mono tabular-nums"
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>

      {hoveredIdx !== null && points[hoveredIdx] && (
        <div className="mt-2 flex items-center justify-between text-xs text-[#778094] border-t border-[#E8EAF0] pt-2 font-mono tabular-nums">
          <span>{points[hoveredIdx].label}</span>
          <span
            className={
              points[hoveredIdx].profit >= 0
                ? 'text-[#16A36A] font-semibold'
                : 'text-[#E35D62] font-semibold'
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
