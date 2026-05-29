import { forwardRef, useEffect, useState } from 'react';
import { CardData, CARD_SIZE, formatScoreSafe } from './types';
import { PulseMark } from './PulseMark';

interface Props {
  data: CardData;
  // variant kept for API compatibility with the modal registry
  variant?: 'classic' | 'holo' | 'night';
}

const FLAG_NAVY = 'hsl(220 70% 18%)';
const FLAG_NAVY_DEEP = 'hsl(220 78% 11%)';
const FLAG_RED = 'hsl(0 76% 46%)';
const FLAG_WHITE = 'hsl(0 0% 100%)';

const partyChipColor = (party?: string) => {
  const p = (party ?? '').toLowerCase();
  if (p.startsWith('dem')) return 'hsl(214 89% 52%)';
  if (p.startsWith('rep')) return FLAG_RED;
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

const fmtMoneyShort = (n?: number | null) => {
  if (n === null || n === undefined || !Number.isFinite(n) || n <= 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
};

const truncate = (s: string, max = 30) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

export const CandidateStatCard = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [data.candidateImage]);


  const textColor = FLAG_WHITE;
  const mutedColor = 'hsl(214 35% 82%)';
  const panelBg = 'hsl(220 50% 14% / 0.78)';
  const innerBorder = FLAG_WHITE;

  const name = data.candidateName ?? 'Candidate';
  const office = data.candidateOffice ?? 'Public Official';
  const party = data.candidateParty ?? 'Nonpartisan';
  const image = data.candidateImage;

  const ideology = formatScoreSafe(data.candidateScore);

  const topSpenders = (data.topSpenders ?? []).slice(0, 2);
  const topDonors = (data.topDonors ?? []).slice(0, 3);
  const fundingBreakdown = (data.fundingBreakdown ?? []).slice(0, 4);
  const cycleLabel = data.ieCycle ? ` · ${data.ieCycle}` : '';

  const topics = [
    ...(data.agreements ?? []),
    ...(data.disagreements ?? []),
  ]
    .slice()
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 3);

  // Outer background = full US flag gradient
  const cardBg = `linear-gradient(160deg, ${FLAG_NAVY_DEEP} 0%, ${FLAG_NAVY} 50%, ${FLAG_RED} 100%)`;
  // Inner panel = solid navy so content reads cleanly
  const panelInner = `linear-gradient(180deg, hsl(220 60% 13%) 0%, hsl(220 55% 16%) 100%)`;

  return (
    <div
      ref={ref}
      style={{
        width: CARD_SIZE,
        height: CARD_SIZE,
        background: cardBg,
        color: textColor,
        padding: 32,
        fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
      }}
    >
      <div
        style={{
          height: '100%',
          border: `5px solid ${innerBorder}`,
          borderRadius: 36,
          overflow: 'hidden',
          position: 'relative',
          background: panelInner,
        }}
      >
        {/* Red bottom accent bar (subtle flag stripe) */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 10,
            background: FLAG_RED,
          }}
        />

        <div
          style={{
            position: 'relative',
            height: '100%',
            padding: 28,
            paddingBottom: 28,
            display: 'grid',
            gridTemplateRows: 'auto auto auto auto auto 1fr auto',
            gap: 12,
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
          <div style={{ display: 'flex', gap: 22, alignItems: 'center' }}>
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: 20,
                border: `4px solid ${innerBorder}`,
                overflow: 'hidden',
                background: panelBg,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {image && !imgFailed ? (
                <img
                  src={image}
                  alt=""
                  crossOrigin="anonymous"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={() => setImgFailed(true)}
                />
              ) : (
                <div style={{ fontSize: 48, fontWeight: 900, color: mutedColor }}>
                  {name
                    .split(' ')
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join('')}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 46,
                    fontWeight: 900,
                    letterSpacing: -1.2,
                    lineHeight: 1.02,
                  }}
                >
                  {name}
                </span>
                <span
                  style={{
                    background: partyChipColor(party),
                    color: FLAG_WHITE,
                    fontWeight: 800,
                    fontSize: 22,
                    padding: '4px 14px',
                    borderRadius: 999,
                  }}
                >
                  {partyInitial(party)}
                </span>
              </div>
              <div style={{ fontSize: 20, marginTop: 4, color: mutedColor }}>{office}</div>
            </div>
          </div>

          {/* Hero ideology score */}
          <div
            style={{
              border: `3px solid ${innerBorder}`,
              borderRadius: 20,
              padding: '12px 16px',
              textAlign: 'center',
              background: panelBg,
            }}
          >
            <div style={{ fontSize: 60, fontWeight: 900, lineHeight: 1, letterSpacing: -2 }}>
              {ideology}
            </div>
            <div
              style={{
                fontSize: 14,
                marginTop: 6,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: mutedColor,
              }}
            >
              Ideology Score
            </div>
          </div>

          {/* Top Outside Spenders */}
          {topSpenders.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 13,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: mutedColor,
                  marginBottom: 6,
                  fontWeight: 700,
                }}
              >
                Top Outside Spenders{cycleLabel}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {topSpenders.map((s, i) => (
                  <div
                    key={`${s.name}-${i}`}
                    style={{
                      border: `2px solid ${innerBorder}`,
                      borderRadius: 14,
                      padding: '10px 14px',
                      background: panelBg,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        lineHeight: 1.2,
                        marginBottom: 6,
                        minHeight: 36,
                      }}
                    >
                      {truncate(s.name, 42)}
                    </div>
                    <div style={{ display: 'flex', gap: 14, fontSize: 18, fontWeight: 800 }}>
                      <span style={{ color: 'hsl(150 70% 70%)' }}>↑ {fmtMoneyShort(s.support)}</span>
                      <span style={{ color: 'hsl(0 80% 72%)' }}>↓ {fmtMoneyShort(s.oppose)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Donors */}
          {topDonors.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 13,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: mutedColor,
                  marginBottom: 6,
                  fontWeight: 700,
                }}
              >
                Top Donors
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {topDonors.map((d, i) => (
                  <div
                    key={`${d.name}-${i}`}
                    style={{
                      border: `2px solid ${innerBorder}`,
                      borderRadius: 12,
                      padding: '10px 12px',
                      background: panelBg,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        lineHeight: 1.2,
                        marginBottom: 4,
                        minHeight: 34,
                      }}
                    >
                      {truncate(d.name, 32)}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: FLAG_WHITE }}>
                      {fmtMoneyShort(d.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Funding Sources — carried over from the Patriot Card for the Stat Card */}
          {fundingBreakdown.length > 0 ? (
            <div
              style={{
                alignSelf: 'end',
                border: `2px solid ${innerBorder}`,
                borderRadius: 14,
                padding: '10px 14px',
                background: panelBg,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: mutedColor,
                  marginBottom: 6,
                  fontWeight: 700,
                }}
              >
                Funding Sources{data.fundingCycle ? ` · ${data.fundingCycle} Cycle` : ''}
              </div>
              <div style={{ display: 'grid', gap: 5 }}>
                {fundingBreakdown.map((b) => (
                  <div key={b.label}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: 12,
                        marginBottom: 2,
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 700, color: textColor }}>
                        {truncate(b.label, 38)}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: b.color }}>{b.pct}%</span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 999,
                        background: 'hsl(0 0% 100% / 0.14)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.max(2, b.pct)}%`,
                          height: '100%',
                          background: b.color,
                          borderRadius: 999,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'end' }}>
              {topics.slice(0, 2).map((t) => {
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
                    <div style={{ fontSize: 18, fontWeight: 600 }}>{truncate(t.topicName, 22)}</div>
                    <div
                      style={{
                        height: 12,
                        background: 'hsl(0 0% 100% / 0.15)',
                        borderRadius: 999,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background:
                            t.score < 0
                              ? 'hsl(214 89% 60%)'
                              : t.score > 0
                              ? FLAG_RED
                              : 'hsl(270 60% 60%)',
                          borderRadius: 999,
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, textAlign: 'right' }}>
                      {formatScoreSafe(t.score)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 18,
              color: mutedColor,
            }}
          >
            <span>Know your vote.</span>
            <span style={{ fontWeight: 700, color: textColor }}>{data.brandHost}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

CandidateStatCard.displayName = 'CandidateStatCard';
