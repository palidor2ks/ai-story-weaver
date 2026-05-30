import { forwardRef, useEffect, useState } from 'react';
import { CardData, CARD_SIZE, formatScoreSafe } from './types';
import { PulseMark } from './PulseMark';
import { proxiedImageUrl } from '@/lib/imageProxy';

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

const formatDistrictLabel = (state?: string | null, district?: string | null) => {
  const cleanedDistrict = district?.trim();
  if (!cleanedDistrict) return '';

  const cleanedState = state?.trim().toUpperCase();
  const normalizedDistrict = /^district\s+/i.test(cleanedDistrict)
    ? cleanedDistrict.replace(/^district\s+/i, '')
    : cleanedDistrict;

  return cleanedState ? `${cleanedState}-${normalizedDistrict}` : `District ${normalizedDistrict}`;
};

const formatDataYearLabel = (cycle?: string | null) => {
  const trimmed = cycle?.trim();
  if (!trimmed || trimmed.toLowerCase() === 'all') return '';
  return /cycle/i.test(trimmed) ? trimmed : `${trimmed} Cycle`;
};

const scoreToPercent = (score?: number | null) => {
  if (score === null || score === undefined || !Number.isFinite(score)) return 50;
  const clamped = Math.max(-10, Math.min(10, score));
  return ((clamped + 10) / 20) * 100;
};

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
  const districtLabel = formatDistrictLabel(data.candidateState, data.candidateDistrict);
  const officeLabel = districtLabel ? `${office} · ${districtLabel}` : office;
  const party = data.candidateParty ?? 'Nonpartisan';
  const image = data.candidateImage;

  const ideology = formatScoreSafe(data.candidateScore);
  const ideologyPosition = scoreToPercent(data.candidateScore);
  const hasIdeologyScore =
    data.candidateScore !== null &&
    data.candidateScore !== undefined &&
    Number.isFinite(data.candidateScore);

  const topSpenders = (data.topSpenders ?? []).slice(0, 2);
  const topDonors = (data.topDonors ?? []).slice(0, 3);
  const fundingBreakdown = (data.fundingBreakdown ?? [])
    .slice()
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4);
  const dataYearLabel = formatDataYearLabel(data.fundingCycle ?? data.ieCycle);
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
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
                fontWeight: 800,
                whiteSpace: 'nowrap',
              }}
            >
              {dataYearLabel}
            </div>
            <div
              style={{
                fontSize: 18,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: mutedColor,
                textAlign: 'right',
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
                  src={image.startsWith('data:') ? image : proxiedImageUrl(image)}
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
              <div style={{ fontSize: 20, marginTop: 4, color: mutedColor }}>{officeLabel}</div>
            </div>
          </div>

          {/* Hero ideology spectrum */}
          <div
            style={{
              border: `3px solid ${innerBorder}`,
              borderRadius: 20,
              padding: '18px 18px 16px',
              background: panelBg,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: mutedColor,
                  fontWeight: 800,
                }}
              >
                Ideology Spectrum
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 900,
                  color: hasIdeologyScore ? textColor : mutedColor,
                  letterSpacing: -0.6,
                }}
              >
                {ideology}
              </div>
            </div>
            <div
              style={{
                position: 'relative',
                height: 42,
                margin: '0 4px',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 12,
                  height: 18,
                  borderRadius: 999,
                  background:
                    'linear-gradient(90deg, hsl(214 89% 56%) 0%, hsl(270 72% 66%) 50%, hsl(0 76% 52%) 100%)',
                  boxShadow:
                    'inset 0 0 0 2px hsl(0 0% 100% / 0.35), 0 6px 14px hsl(220 80% 4% / 0.35)',
                  opacity: hasIdeologyScore ? 1 : 0.45,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 5,
                  width: 3,
                  height: 32,
                  borderRadius: 999,
                  background: 'hsl(0 0% 100% / 0.7)',
                  transform: 'translateX(-50%)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: `${ideologyPosition}%`,
                  top: 0,
                  width: 42,
                  height: 42,
                  borderRadius: '50%',
                  border: `5px solid ${FLAG_WHITE}`,
                  background: hasIdeologyScore ? FLAG_NAVY_DEEP : 'hsl(220 15% 35%)',
                  transform: 'translateX(-50%)',
                  boxShadow: '0 7px 18px hsl(220 80% 4% / 0.5)',
                }}
              />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                color: mutedColor,
                fontSize: 15,
                fontWeight: 800,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                marginTop: 6,
              }}
            >
              <span>Left</span>
              <span style={{ textAlign: 'center' }}>Center</span>
              <span style={{ textAlign: 'right' }}>Right</span>
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
                    {s.primaryCause && (
                      <div
                        style={{
                          marginTop: 8,
                          display: 'inline-flex',
                          alignItems: 'center',
                          maxWidth: '100%',
                          border: '1px solid hsl(0 0% 100% / 0.35)',
                          borderRadius: 999,
                          padding: '4px 10px',
                          color: 'hsl(214 35% 90%)',
                          background: 'hsl(0 0% 100% / 0.08)',
                          fontSize: 13,
                          fontWeight: 800,
                          letterSpacing: 0.6,
                          textTransform: 'uppercase',
                        }}
                      >
                        Primary cause: {truncate(s.primaryCause, 24)}
                      </div>
                    )}
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
