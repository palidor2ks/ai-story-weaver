import { Loader2 } from 'lucide-react';
import { useNolanPositions } from '@/hooks/useNolanPositions';

interface NolanChartProps {
  className?: string;
}

// Static display metadata — colours and labels never change; positions come from the DB.
const PARTY_META: Record<string, { color: string; label: string; short: string }> = {
  democrat:    { color: '#3b82f6', label: 'Democrat',    short: 'D' },
  republican:  { color: '#ef4444', label: 'Republican',  short: 'R' },
  libertarian: { color: '#d97706', label: 'Libertarian', short: 'L' },
  green:       { color: '#22c55e', label: 'Green',       short: 'G' },
};

const W = 480;
const H = 480;
const PAD = 72;
const CW = W - 2 * PAD;
const CH = H - 2 * PAD;

function toX(score: number) { return PAD + (score / 100) * CW; }
function toY(score: number) { return PAD + ((100 - score) / 100) * CH; } // Y inverted

export function NolanChart({ className }: NolanChartProps) {
  const { data, isLoading } = useNolanPositions();

  const userX = toX(data?.userPosition.economic ?? 50);
  const userY = toY(data?.userPosition.personal  ?? 50);

  return (
    <div className={className}>
      {isLoading ? (
        <div className="flex items-center justify-center h-[200px] text-muted-foreground gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading compass…</span>
        </div>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full max-w-[560px] mx-auto"
            aria-label="Nolan Chart political compass"
          >
            {/* Quadrant fills */}
            <rect x={PAD}          y={PAD}          width={CW / 2} height={CH / 2} fill="#dbeafe" opacity={0.55} />
            <rect x={PAD + CW / 2} y={PAD}          width={CW / 2} height={CH / 2} fill="#fef3c7" opacity={0.55} />
            <rect x={PAD}          y={PAD + CH / 2} width={CW / 2} height={CH / 2} fill="#f3f4f6" opacity={0.55} />
            <rect x={PAD + CW / 2} y={PAD + CH / 2} width={CW / 2} height={CH / 2} fill="#fee2e2" opacity={0.55} />

            {/* Chart border */}
            <rect x={PAD} y={PAD} width={CW} height={CH} fill="none" stroke="#d1d5db" strokeWidth={1} />

            {/* Centre cross */}
            <line x1={PAD + CW / 2} y1={PAD}          x2={PAD + CW / 2} y2={PAD + CH}     stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 3" />
            <line x1={PAD}           y1={PAD + CH / 2} x2={PAD + CW}     y2={PAD + CH / 2} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 3" />

            {/* Quadrant labels */}
            <text x={PAD + CW * 0.25} y={PAD + 18}     textAnchor="middle" fontSize={13} fill="#6b7280" fontWeight="600">Liberal</text>
            <text x={PAD + CW * 0.75} y={PAD + 18}     textAnchor="middle" fontSize={13} fill="#92400e" fontWeight="600">Libertarian</text>
            <text x={PAD + CW * 0.25} y={PAD + CH - 7} textAnchor="middle" fontSize={13} fill="#6b7280" fontWeight="600">Authoritarian</text>
            <text x={PAD + CW * 0.75} y={PAD + CH - 7} textAnchor="middle" fontSize={13} fill="#6b7280" fontWeight="600">Conservative</text>

            {/* Party markers — scored only on questions the user answered */}
            {data && Object.entries(data.partyPositions).map(([partyId, pos]) => {
              const meta = PARTY_META[partyId];
              if (!meta) return null;
              return (
                <g key={partyId}>
                  <circle cx={toX(pos.economic)} cy={toY(pos.personal)} r={8} fill={meta.color} opacity={0.85} />
                  <text
                    x={toX(pos.economic)}
                    y={toY(pos.personal) - 11}
                    textAnchor="middle"
                    fontSize={12}
                    fill={meta.color}
                    fontWeight="700"
                  >
                    {meta.short}
                  </text>
                </g>
              );
            })}

            {/* User dot */}
            <circle cx={userX} cy={userY} r={12} fill="#7c3aed" stroke="white" strokeWidth={2.5} />
            <text x={userX} y={userY - 17} textAnchor="middle" fontSize={13} fill="#7c3aed" fontWeight="700">You</text>

            {/* X-axis label */}
            <text x={PAD + CW / 2} y={H - 10} textAnchor="middle" fontSize={12} fill="#6b7280">
              ← Regulated · Economic Freedom · Free Market →
            </text>

            {/* Y-axis label (rotated) */}
            <text
              x={18}
              y={PAD + CH / 2}
              textAnchor="middle"
              fontSize={12}
              fill="#6b7280"
              transform={`rotate(-90, 18, ${PAD + CH / 2})`}
            >
              ← Auth · Personal Freedom · Liberty →
            </text>
          </svg>

          {/* Axis scores */}
          <div className="mt-2 flex justify-center gap-6 text-xs text-muted-foreground">
            <span>Economic freedom: <strong className="text-foreground">{data?.userPosition.economic ?? 50}%</strong></span>
            <span>Personal freedom: <strong className="text-foreground">{data?.userPosition.personal ?? 50}%</strong></span>
          </div>

          {/* Legend */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 justify-center text-xs">
            {Object.entries(PARTY_META).map(([key, meta]) => (
              <span key={key} className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
                {meta.label}
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-violet-600" />
              You
            </span>
          </div>

          {/* Scope note */}
          <p className="mt-3 text-center text-xs text-muted-foreground italic">
            All positions are based only on the questions you've answered.
            Party dots shift as you answer more questions.
          </p>
        </>
      )}
    </div>
  );
}
