import { forwardRef } from 'react';
import { CardData, CARD_SIZE } from './types';
import { PulseMark } from './PulseMark';

interface Props {
  data: CardData;
}

// Matches CandidateStatCard shell exactly
const FLAG_NAVY = 'hsl(220 70% 18%)';
const FLAG_NAVY_DEEP = 'hsl(220 78% 11%)';
const FLAG_RED = 'hsl(0 76% 46%)';
const FLAG_WHITE = 'hsl(0 0% 100%)';
const MUTED = 'hsl(214 35% 82%)';
const PANEL_BG = 'hsl(220 50% 14% / 0.78)';
const INNER_BG = 'linear-gradient(180deg, hsl(220 60% 13%) 0%, hsl(220 55% 16%) 100%)';

// Violet accent — "quiz / alignment" theme
const VIOLET = '#7C3AED';
const VIOLET_LIT = '#A78BFA';
const VIOLET_GLOW = '#C4B5FD';

const partyColor = (party?: string) => {
  const p = (party ?? '').toLowerCase();
  if (p.startsWith('dem')) return 'hsl(214 89% 52%)';
  if (p.startsWith('rep')) return FLAG_RED;
  if (p.startsWith('ind')) return '#A855F7';
  return MUTED;
};

const partyInitial = (party?: string) => {
  const p = (party ?? '').toLowerCase();
  if (p.startsWith('dem')) return 'D';
  if (p.startsWith('rep')) return 'R';
  if (p.startsWith('ind')) return 'I';
  return '?';
};

const scoreToPercent = (score?: number | null) => {
  if (score == null || !Number.isFinite(score)) return 50;
  return ((Math.max(-10, Math.min(10, score)) + 10) / 20) * 100;
};

const ideologyLabel = (score?: number | null) => {
  if (score == null || !Number.isFinite(score)) return 'Not yet scored';
  if (score <= -7) return 'Strongly Progressive';
  if (score <= -4) return 'Progressive';
  if (score <= -1.5) return 'Center-Left';
  if (score < 1.5) return 'Moderate / Centrist';
  if (score < 4) return 'Center-Right';
  if (score < 7) return 'Conservative';
  return 'Strongly Conservative';
};

const truncate = (s: string, max = 22) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

const deriveIssues = (data: CardData): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (s: string) => {
    const k = s.trim().toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(s.trim());
  };
  (data.aiCauses ?? []).forEach((c) => add(c));
  (data.topDonors ?? []).forEach((d) => d.primaryCause && add(d.primaryCause));
  (data.topSpenders ?? []).forEach((s) => s.primaryCause && add(s.primaryCause));
  return out.slice(0, 3);
};

const LockedAlignmentBar = ({ lastName }: { lastName: string }) => (
  <div style={{ position: 'relative' }}>
    <div style={{
      height: 72,
      borderRadius: 14,
      background: PANEL_BG,
      border: `1.5px solid ${FLAG_WHITE}22`,
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16,
      }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: `${FLAG_WHITE}18` }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ height: 13, borderRadius: 999, background: `${FLAG_WHITE}18`, width: '55%' }} />
          <div style={{ height: 9, borderRadius: 999, background: `${FLAG_WHITE}12`, width: '38%' }} />
        </div>
        <div style={{ width: 72, height: 30, borderRadius: 8, background: `${FLAG_WHITE}18` }} />
      </div>
    </div>
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 12, borderRadius: 14,
      background: 'rgba(8, 10, 24, 0.52)',
    }}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={VIOLET_GLOW} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <span style={{ fontSize: 16, fontWeight: 700, color: VIOLET_GLOW, letterSpacing: 0.3 }}>
        Your alignment with {lastName} — sign up to see
      </span>
    </div>
  </div>
);

export const PolicyPositionsCard = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const name = data.candidateName ?? 'This Candidate';
  const lastName = name.split(' ').slice(-1)[0] ?? name;
  const party = data.candidateParty ?? '';
  const officeLine = [data.candidateOffice, data.candidateState].filter(Boolean).join(' · ');
  const issues = deriveIssues(data);
  const ideologyPct = scoreToPercent(data.candidateScore);
  const hasScore = data.candidateScore != null && Number.isFinite(data.candidateScore);

  const cardBg = `linear-gradient(160deg, ${FLAG_NAVY_DEEP} 0%, ${FLAG_NAVY} 50%, ${FLAG_RED} 100%)`;
  const issueColors = [
    { bg: `${VIOLET}28`, border: `${VIOLET_LIT}55`, text: VIOLET_GLOW },
    { bg: 'hsl(142 72% 35% / 0.22)', border: 'hsl(142 72% 56% / 0.5)', text: 'hsl(142 76% 82%)' },
    { bg: 'hsl(38 92% 45% / 0.22)', border: 'hsl(38 92% 58% / 0.55)', text: 'hsl(45 96% 82%)' },
  ];

  return (
    <div
      ref={ref}
      style={{
        width: CARD_SIZE,
        height: CARD_SIZE,
        background: cardBg,
        color: FLAG_WHITE,
        padding: 32,
        fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
      }}
    >
      {/* Inner panel — mirrors CandidateStatCard */}
      <div style={{
        height: '100%',
        border: `5px solid ${FLAG_WHITE}`,
        borderRadius: 36,
        overflow: 'hidden',
        position: 'relative',
        background: INNER_BG,
      }}>
        {/* Red bottom stripe */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: 10,
          background: FLAG_RED,
        }} />

        <div style={{
          position: 'relative', height: '100%',
          padding: 28, paddingBottom: 28,
          display: 'flex', flexDirection: 'column', gap: 0,
        }}>
          {/* ── Header ── */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 26,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <PulseMark size={42} />
              <span style={{ fontWeight: 800, fontSize: 25, letterSpacing: -0.3 }}>PoliPulse</span>
            </div>
            <div style={{
              background: `${VIOLET}28`,
              border: `2px solid ${VIOLET_LIT}55`,
              color: VIOLET_GLOW,
              borderRadius: 999,
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: 2.5,
              textTransform: 'uppercase' as const,
            }}>
              Where Do They Stand?
            </div>
          </div>

          {/* ── Candidate identity ── */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' as const, marginBottom: 8 }}>
              <span style={{ fontSize: 60, fontWeight: 900, letterSpacing: -2, lineHeight: 1.02 }}>
                {truncate(lastName, 18)}'s
              </span>
              <span style={{ fontSize: 36, fontWeight: 900, color: VIOLET_LIT, letterSpacing: -0.5 }}>
                record
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: 20, color: MUTED, fontWeight: 500 }}>{officeLine}</span>
              {party && (
                <span style={{
                  background: `${partyColor(party)}22`,
                  border: `1.5px solid ${partyColor(party)}66`,
                  color: partyColor(party),
                  borderRadius: 999, padding: '4px 14px',
                  fontSize: 16, fontWeight: 800,
                }}>
                  {partyInitial(party)} · {party.split(' ')[0]}
                </span>
              )}
            </div>
          </div>

          {/* ── Ideology spectrum ── */}
          <div style={{
            background: PANEL_BG,
            border: `2px solid ${FLAG_WHITE}22`,
            borderRadius: 18,
            padding: '18px 22px',
            marginBottom: 20,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              marginBottom: 18,
            }}>
              <div style={{
                fontSize: 12, color: MUTED, letterSpacing: 2.5,
                textTransform: 'uppercase' as const, fontWeight: 700,
              }}>
                Voting record ideology
              </div>
              <div style={{
                fontSize: 20, fontWeight: 800,
                color: hasScore ? FLAG_WHITE : MUTED,
                letterSpacing: -0.3,
              }}>
                {ideologyLabel(data.candidateScore)}
              </div>
            </div>
            <div style={{ position: 'relative', height: 46, margin: '0 4px' }}>
              <div style={{
                position: 'absolute', left: 0, right: 0, top: 13,
                height: 18, borderRadius: 999,
                background: 'linear-gradient(90deg, hsl(214 89% 56%) 0%, hsl(270 72% 66%) 50%, hsl(0 76% 52%) 100%)',
                boxShadow: 'inset 0 0 0 2px hsl(0 0% 100% / 0.2)',
                opacity: hasScore ? 1 : 0.4,
              }} />
              <div style={{
                position: 'absolute', left: '50%', top: 7, width: 3, height: 30,
                background: `${FLAG_WHITE}60`, transform: 'translateX(-50%)', borderRadius: 999,
              }} />
              <div style={{
                position: 'absolute',
                left: `${ideologyPct}%`, top: 0,
                transform: 'translateX(-50%)',
                width: 46, height: 46, borderRadius: '50%',
                border: `5px solid ${FLAG_WHITE}`,
                background: hasScore ? FLAG_NAVY_DEEP : MUTED,
                boxShadow: `0 0 0 3px ${VIOLET}88, 0 8px 20px rgba(0,0,0,0.5)`,
              }} />
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              fontSize: 13, color: MUTED, fontWeight: 700,
              letterSpacing: 1.2, textTransform: 'uppercase' as const, marginTop: 6,
            }}>
              <span>← Progressive</span>
              <span style={{ textAlign: 'center' }}>Moderate</span>
              <span style={{ textAlign: 'right' }}>Conservative →</span>
            </div>
          </div>

          {/* ── Key issue chips ── */}
          {issues.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 12, color: MUTED, letterSpacing: 2.5,
                textTransform: 'uppercase' as const, fontWeight: 700, marginBottom: 12,
              }}>
                Key issues their donors care about
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
                {issues.map((issue, i) => {
                  const c = issueColors[i % issueColors.length];
                  return (
                    <div key={issue} style={{
                      background: c.bg,
                      border: `1.5px solid ${c.border}`,
                      color: c.text,
                      borderRadius: 10, padding: '10px 18px',
                      fontSize: 19, fontWeight: 800, letterSpacing: 0.1,
                    }}>
                      {issue}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Locked alignment bar ── */}
          <LockedAlignmentBar lastName={lastName} />

          {/* ── CTA banner ── */}
          <div style={{
            background: `linear-gradient(90deg, ${VIOLET}D8, #5B21B6D8)`,
            borderRadius: 16,
            padding: '18px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 18,
            gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: FLAG_WHITE, letterSpacing: -0.3, lineHeight: 1.1 }}>
                Do you agree with their record?
              </div>
              <div style={{ fontSize: 14, color: VIOLET_GLOW, marginTop: 3, fontWeight: 600 }}>
                2-min quiz · free · polipulseapp.com
              </div>
            </div>
            <div style={{
              background: FLAG_WHITE, color: VIOLET,
              borderRadius: 10, padding: '10px 22px',
              fontSize: 17, fontWeight: 900, letterSpacing: 0.3,
              whiteSpace: 'nowrap' as const, flexShrink: 0,
            }}>
              Find My Match →
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 14, fontSize: 15, color: MUTED,
          }}>
            <span>Based on voting record &amp; FEC data</span>
            <span style={{ fontWeight: 700, color: FLAG_WHITE }}>{data.brandHost}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

PolicyPositionsCard.displayName = 'PolicyPositionsCard';
