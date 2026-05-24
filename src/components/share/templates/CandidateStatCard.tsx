import { forwardRef } from 'react';
import { CardData, CARD_SIZE, formatScoreSafe } from './types';
import { PulseMark } from './PulseMark';

type Variant = 'classic' | 'holo' | 'night';

interface Props {
  data: CardData;
  variant?: Variant;
}

const variantStyles: Record<Variant, { bg: string; border: string; stripe: string; patriotic: boolean }> = {
  classic: {
    bg: 'linear-gradient(160deg, hsl(221 82% 20%) 0%, hsl(214 89% 28%) 45%, hsl(0 76% 42%) 100%)',
    border: 'hsl(0 0% 98%)',
    stripe: 'hsl(0 0% 100% / 0.18)',
    patriotic: true,
  },
  holo: {
    bg: 'linear-gradient(135deg, hsl(215 95% 92%) 0%, hsl(0 100% 96%) 50%, hsl(220 90% 90%) 100%)',
    border: 'hsl(218 76% 34%)',
    stripe: 'hsl(0 71% 52% / 0.14)',
    patriotic: false,
  },
  night: {
    bg: 'linear-gradient(160deg, hsl(228 61% 13%) 0%, hsl(215 75% 18%) 60%, hsl(0 62% 28%) 100%)',
    border: 'hsl(0 0% 96%)',
    stripe: 'hsl(0 0% 100% / 0.13)',
    patriotic: true,
  },
};

const partyChipColor = (party?: string) => {
  const p = (party ?? '').toLowerCase();
  if (p.startsWith('dem')) return 'hsl(214 89% 52%)';
  if (p.startsWith('rep')) return 'hsl(0 76% 50%)';
  if (p.startsWith('ind')) return 'hsl(270 60% 55%)';
  return 'hsl(220 10% 50%)';
};

const partyInitial = (party?: string) => {
  const p = (party ?? '').toLowerCase();
  if (p.startsWith('dem')) return 'D';
  if (p.startsWith('rep')) return 'R';
  if (p.startsWith('ind')) return 'I';
  return '?';
};

const fmtMoneyShort = (s?: string | number | null) => {
  if (s === null || s === undefined || s === '') return null;
  if (typeof s === 'string') return s;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

export const CandidateStatCard = forwardRef<HTMLDivElement, Props>(
  ({ data, variant = 'classic' }, ref) => {
    const v = variantStyles[variant];
    const textColor = v.patriotic ? 'hsl(0 0% 100%)' : 'hsl(220 40% 12%)';
    const mutedColor = v.patriotic ? 'hsl(214 29% 85%)' : 'hsl(220 15% 38%)';
    const panelBg = v.patriotic ? 'hsl(220 37% 18% / 0.78)' : 'hsl(0 0% 100% / 0.78)';

    const name = data.candidateName ?? 'Candidate';
    const office = data.candidateOffice ?? 'Public Official';
    const party = data.candidateParty ?? 'Nonpartisan';
    const image = data.candidateImage;

    const ideology = formatScoreSafe(data.candidateScore);
    const matchDisplay =
      data.matchScore !== undefined && data.matchScore !== null && data.matchScore > 0
        ? `${Math.round(data.matchScore)}%`
        : '—';
    const votingDisplay =
      data.votingRecordPct !== undefined && data.votingRecordPct !== null
        ? `${Math.round(data.votingRecordPct)}%`
        : '—';

    const support = fmtMoneyShort(data.ieSupport);
    const oppose = fmtMoneyShort(data.ieOppose);
    const ieDisplay =
      support || oppose ? `↑${support ?? '$0'} ↓${oppose ?? '$0'}` : '—';
    const ieLabel = data.ieCycle ? `Outside '${String(data.ieCycle).slice(-2)}` : 'Outside Spend';

    const topics = [
      ...(data.agreements ?? []),
      ...(data.disagreements ?? []),
    ]
      .slice()
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, 3);

    return (
      <div
        ref={ref}
        style={{
          width: CARD_SIZE,
          height: CARD_SIZE,
          background: v.bg,
          color: textColor,
          padding: 48,
          fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
        }}
      >
        <div
          style={{
            height: '100%',
            border: `5px solid ${v.border}`,
            borderRadius: 36,
            overflow: 'hidden',
            position: 'relative',
            background: v.patriotic ? 'hsl(221 40% 14% / 0.55)' : 'hsl(0 0% 100% / 0.55)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `repeating-linear-gradient(-18deg, ${v.stripe} 0px, ${v.stripe} 36px, transparent 36px, transparent 72px)`,
            }}
          />

          <div
            style={{
              position: 'relative',
              height: '100%',
              padding: 40,
              display: 'grid',
              gridTemplateRows: 'auto auto auto 1fr auto',
              gap: 22,
            }}
          >
            {/* Top brand bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <PulseMark size={44} />
                <span style={{ fontWeight: 800, fontSize: 26, letterSpacing: -0.3 }}>
                  Pulse Stat Card
                </span>
              </div>
              <div
                style={{
                  fontSize: 18,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: mutedColor,
                }}
              >
                {data.incumbent ? 'Incumbent' : 'Candidate'}
              </div>
            </div>

            {/* Identity row: photo + name */}
            <div style={{ display: 'flex', gap: 26, alignItems: 'center' }}>
              <div
                style={{
                  width: 170,
                  height: 170,
                  borderRadius: 24,
                  border: `4px solid ${v.border}`,
                  overflow: 'hidden',
                  background: panelBg,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {image ? (
                  <img
                    src={image}
                    alt={name}
                    crossOrigin="anonymous"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ fontSize: 70, fontWeight: 900, color: mutedColor }}>
                    {name
                      .split(' ')
                      .map((s) => s[0])
                      .slice(0, 2)
                      .join('')}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      fontSize: 62,
                      fontWeight: 900,
                      letterSpacing: -1.5,
                      lineHeight: 1.02,
                    }}
                  >
                    {name}
                  </span>
                  <span
                    style={{
                      background: partyChipColor(party),
                      color: 'hsl(0 0% 100%)',
                      fontWeight: 800,
                      fontSize: 28,
                      padding: '6px 18px',
                      borderRadius: 999,
                    }}
                  >
                    {partyInitial(party)}
                  </span>
                </div>
                <div style={{ fontSize: 26, marginTop: 8, color: mutedColor }}>{office}</div>
              </div>
            </div>

            {/* Hero ideology score */}
            <div
              style={{
                border: `3px solid ${v.border}`,
                borderRadius: 24,
                padding: '22px 16px',
                textAlign: 'center',
                background: panelBg,
              }}
            >
              <div style={{ fontSize: 88, fontWeight: 900, lineHeight: 1, letterSpacing: -2 }}>
                {ideology}
              </div>
              <div
                style={{
                  fontSize: 18,
                  marginTop: 10,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: mutedColor,
                }}
              >
                Ideology Score
              </div>
            </div>

            {/* Stat grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 16,
                alignSelf: 'center',
              }}
            >
              {[
                { value: matchDisplay, label: 'Match' },
                { value: votingDisplay, label: 'Votes Cast' },
                { value: ieDisplay, label: ieLabel },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    border: `2px solid ${v.border}`,
                    borderRadius: 18,
                    padding: '20px 10px',
                    textAlign: 'center',
                    background: panelBg,
                  }}
                >
                  <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1 }}>{s.value}</div>
                  <div
                    style={{
                      fontSize: 15,
                      marginTop: 8,
                      letterSpacing: 1.2,
                      textTransform: 'uppercase',
                      color: mutedColor,
                    }}
                  >
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Top topics */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topics.map((t) => {
                const pct = Math.min(100, Math.abs(t.score) * 10);
                return (
                  <div
                    key={t.topicName}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '220px 1fr 90px',
                      alignItems: 'center',
                      gap: 14,
                    }}
                  >
                    <div style={{ fontSize: 20, fontWeight: 600 }}>{t.topicName}</div>
                    <div
                      style={{
                        height: 14,
                        background: v.patriotic ? 'hsl(0 0% 100% / 0.15)' : 'hsl(220 15% 85%)',
                        borderRadius: 999,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background:
                            t.score < 0 ? 'hsl(214 89% 55%)' : t.score > 0 ? 'hsl(0 76% 55%)' : 'hsl(270 60% 55%)',
                          borderRadius: 999,
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, textAlign: 'right' }}>
                      {formatScoreSafe(t.score)}
                    </div>
                  </div>
                );
              })}
              {topics.length === 0 && (
                <div style={{ fontSize: 18, color: mutedColor, textAlign: 'center', padding: 16 }}>
                  Take the quiz to see topic alignment
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 20,
                color: mutedColor,
                paddingTop: 6,
              }}
            >
              <span>Know your vote.</span>
              <span style={{ fontWeight: 700, color: textColor }}>{data.brandHost}</span>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

CandidateStatCard.displayName = 'CandidateStatCard';
