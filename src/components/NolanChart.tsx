import { useMemo } from 'react';

interface NolanChartProps {
  democratAlignment: number;
  republicanAlignment: number;
  greenAlignment: number;
  libertarianAlignment: number;
  className?: string;
}

// Canonical positions on the Nolan Chart (0–100 each axis).
// economic: 0 = fully regulated/collectivist, 100 = fully free-market.
// personal: 0 = fully authoritarian, 100 = fully libertarian/progressive.
const PARTIES = {
  democrat:    { economic: 30, personal: 72, color: '#3b82f6', label: 'Democrat',    short: 'D' },
  republican:  { economic: 70, personal: 30, color: '#ef4444', label: 'Republican',  short: 'R' },
  libertarian: { economic: 88, personal: 88, color: '#d97706', label: 'Libertarian', short: 'L' },
  green:       { economic: 22, personal: 68, color: '#22c55e', label: 'Green',       short: 'G' },
} as const;

const W = 300;
const H = 300;
const PAD = 52;
const CW = W - 2 * PAD;
const CH = H - 2 * PAD;

function toX(score: number) { return PAD + (score / 100) * CW; }
function toY(score: number) { return PAD + ((100 - score) / 100) * CH; } // Y is inverted

export function NolanChart({
  democratAlignment,
  republicanAlignment,
  greenAlignment,
  libertarianAlignment,
  className,
}: NolanChartProps) {
  const { economicScore, personalScore } = useMemo(() => {
    const total = democratAlignment + republicanAlignment + greenAlignment + libertarianAlignment;
    if (total === 0) return { economicScore: 50, personalScore: 50 };

    return {
      economicScore: Math.round(
        (democratAlignment  * PARTIES.democrat.economic +
         republicanAlignment * PARTIES.republican.economic +
         libertarianAlignment * PARTIES.libertarian.economic +
         greenAlignment      * PARTIES.green.economic) / total
      ),
      personalScore: Math.round(
        (democratAlignment  * PARTIES.democrat.personal +
         republicanAlignment * PARTIES.republican.personal +
         libertarianAlignment * PARTIES.libertarian.personal +
         greenAlignment      * PARTIES.green.personal) / total
      ),
    };
  }, [democratAlignment, republicanAlignment, greenAlignment, libertarianAlignment]);

  const userX = toX(economicScore);
  const userY = toY(personalScore);

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-[300px] mx-auto"
        aria-label="Nolan Chart political compass"
      >
        {/* Quadrant fills */}
        <rect x={PAD}          y={PAD}          width={CW / 2} height={CH / 2} fill="#dbeafe" opacity={0.55} />
        <rect x={PAD + CW / 2} y={PAD}          width={CW / 2} height={CH / 2} fill="#fef3c7" opacity={0.55} />
        <rect x={PAD}          y={PAD + CH / 2} width={CW / 2} height={CH / 2} fill="#f3f4f6" opacity={0.55} />
        <rect x={PAD + CW / 2} y={PAD + CH / 2} width={CW / 2} height={CH / 2} fill="#fee2e2" opacity={0.55} />

        {/* Chart border */}
        <rect x={PAD} y={PAD} width={CW} height={CH} fill="none" stroke="#d1d5db" strokeWidth={1} />

        {/* Center cross */}
        <line x1={PAD + CW / 2} y1={PAD}       x2={PAD + CW / 2} y2={PAD + CH} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 3" />
        <line x1={PAD}           y1={PAD + CH / 2} x2={PAD + CW} y2={PAD + CH / 2} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 3" />

        {/* Quadrant labels */}
        <text x={PAD + CW * 0.25} y={PAD + 13}       textAnchor="middle" fontSize={9} fill="#6b7280" fontWeight="600">Liberal</text>
        <text x={PAD + CW * 0.75} y={PAD + 13}       textAnchor="middle" fontSize={9} fill="#92400e" fontWeight="600">Libertarian</text>
        <text x={PAD + CW * 0.25} y={PAD + CH - 5}   textAnchor="middle" fontSize={9} fill="#6b7280" fontWeight="600">Authoritarian</text>
        <text x={PAD + CW * 0.75} y={PAD + CH - 5}   textAnchor="middle" fontSize={9} fill="#6b7280" fontWeight="600">Conservative</text>

        {/* Party markers */}
        {(Object.entries(PARTIES) as [string, typeof PARTIES[keyof typeof PARTIES]][]).map(([key, pos]) => (
          <g key={key}>
            <circle cx={toX(pos.economic)} cy={toY(pos.personal)} r={5} fill={pos.color} opacity={0.85} />
            <text
              x={toX(pos.economic)}
              y={toY(pos.personal) - 7}
              textAnchor="middle"
              fontSize={8}
              fill={pos.color}
              fontWeight="700"
            >
              {pos.short}
            </text>
          </g>
        ))}

        {/* User dot */}
        <circle cx={userX} cy={userY} r={8} fill="#7c3aed" stroke="white" strokeWidth={2} />
        <text x={userX} y={userY - 12} textAnchor="middle" fontSize={9} fill="#7c3aed" fontWeight="700">You</text>

        {/* X-axis label */}
        <text x={PAD + CW / 2} y={H - 8} textAnchor="middle" fontSize={8.5} fill="#6b7280">
          ← Regulated · Economic Freedom · Free Market →
        </text>

        {/* Y-axis label (rotated) */}
        <text
          x={13}
          y={PAD + CH / 2}
          textAnchor="middle"
          fontSize={8.5}
          fill="#6b7280"
          transform={`rotate(-90, 13, ${PAD + CH / 2})`}
        >
          ← Auth · Personal Freedom · Liberty →
        </text>
      </svg>

      {/* Axis scores */}
      <div className="mt-2 flex justify-center gap-6 text-xs text-muted-foreground">
        <span>Economic freedom: <strong className="text-foreground">{economicScore}%</strong></span>
        <span>Personal freedom: <strong className="text-foreground">{personalScore}%</strong></span>
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 justify-center text-xs">
        {(Object.entries(PARTIES) as [string, typeof PARTIES[keyof typeof PARTIES]][]).map(([key, pos]) => (
          <span key={key} className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: pos.color }} />
            {pos.label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-violet-600" />
          You
        </span>
      </div>
    </div>
  );
}
