import { forwardRef } from 'react';
import { CardData, CARD_SIZE } from './types';
import { PulseMark } from './PulseMark';

interface Props {
  data: CardData;
}

const VIOLET = '#7C3AED';
const VIOLET_LIT = '#A78BFA';
const VIOLET_GLOW = '#C4B5FD';
const BG = '#0A0812';
const BG2 = '#120D1E';
const PANEL = '#16102A';
const PANEL2 = '#1C1535';
const INK = '#F1F5F9';
const MUTED = '#64748B';
const MUTED_LIGHT = '#94A3B8';
const BORDER = '#231B3A';
const GREEN = '#10B981';
const RED = '#EF4444';

const partyColor = (party?: string) => {
  const p = (party ?? '').toLowerCase();
  if (p.startsWith('dem')) return '#3B82F6';
  if (p.startsWith('rep')) return '#EF4444';
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

// Maps score -10…10 to 0…100%
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

// Derive 3 "key issue" labels from available data, in priority order:
// 1. aiCauses (AI-labeled topics), 2. primaryCause from top donors, 3. generic fallback
const deriveIssues = (data: CardData): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (s: string) => {
    const k = s.trim().toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(s.trim());
  };

  // aiCauses come from AI analysis (may not always be present)
  (data.aiCauses ?? []).forEach((c) => add(c));
  // primaryCause labels from top donors (always available when donors exist)
  (data.topDonors ?? []).forEach((d) => d.primaryCause && add(d.primaryCause));
  // primaryCause from outside spenders
  (data.topSpenders ?? []).forEach((s) => s.primaryCause && add(s.primaryCause));
  // Funding breakdown labels
  (data.fundingBreakdown ?? []).forEach((b) => b.label && out.length < 3 && add(b.label));

  return out.slice(0, 3);
};

// A blurred "locked" alignment bar — represents the user's own match score
const LockedAlignmentBar = () => (
  <div style={{ position: 'relative' }}>
    {/* Fake gradient bar */}
    <div style={{
      height: 64,
      borderRadius: 14,
      background: `linear-gradient(90deg, ${PANEL2}, ${VIOLET}33, ${PANEL2})`,
      border: `1.5px solid ${BORDER}`,
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Fake content stripes inside */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16,
      }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: BORDER }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ height: 12, borderRadius: 999, background: BORDER, width: '60%' }} />
          <div style={{ height: 8, borderRadius: 999, background: BORDER, width: '40%' }} />
        </div>
        <div style={{ width: 64, height: 28, borderRadius: 8, background: BORDER }} />
      </div>
    </div>
    {/* Lock overlay */}
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 12,
      background: 'rgba(10, 8, 18, 0.55)',
      borderRadius: 14,
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={VIOLET_GLOW} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <span style={{ fontSize: 17, fontWeight: 700, color: VIOLET_GLOW, letterSpacing: 0.3 }}>
        Your alignment score — sign up to see
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

  return (
    <div
      ref={ref}
      style={{
        width: CARD_SIZE,
        height: CARD_SIZE,
        background: `linear-gradient(155deg, ${BG} 0%, ${BG2} 100%)`,
        color: INK,
        padding: '52px 60px',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Left violet accent stripe */}
      <div style={{
        position: 'absolute',
        left: 0, top: 0, bottom: 0,
        width: 10,
        background: `linear-gradient(180deg, ${VIOLET_LIT} 0%, ${VIOLET} 100%)`,
      }} />

      {/* Top-right decorative glow */}
      <div style={{
        position: 'absolute',
        right: -120, top: -140,
        width: 460, height: 460,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${VIOLET}1A 0%, transparent 65%)`,
        pointerEvents: 'none',
      }} />

      {/* ── Header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 38,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <PulseMark size={44} />
          <span style={{ fontWeight: 800, fontSize: 27, letterSpacing: -0.3 }}>PoliPulse</span>
        </div>
        <div style={{
          background: `${VIOLET}22`,
          border: `2px solid ${VIOLET_LIT}55`,
          color: VIOLET_GLOW,
          borderRadius: 999,
          padding: '9px 22px',
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: 2.5,
          textTransform: 'uppercase' as const,
        }}>
          Where Do They Stand?
        </div>
      </div>

      {/* ── Candidate identity ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <span style={{ fontSize: 58, fontWeight: 900, letterSpacing: -2, lineHeight: 1.02 }}>
            {truncate(lastName, 18)}'s
          </span>
          <span style={{
            fontSize: 30, fontWeight: 900, color: VIOLET_LIT, letterSpacing: -0.5,
          }}>
            record
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' as const }}>
          <span style={{ fontSize: 22, color: MUTED_LIGHT, fontWeight: 500 }}>{officeLine}</span>
          {party && (
            <span style={{
              background: `${partyColor(party)}22`,
              border: `1.5px solid ${partyColor(party)}66`,
              color: partyColor(party),
              borderRadius: 999,
              padding: '4px 14px',
              fontSize: 18,
              fontWeight: 800,
            }}>
              {partyInitial(party)} · {party.split(' ')[0]}
            </span>
          )}
        </div>
      </div>

      {/* ── Ideology spectrum ── */}
      <div style={{
        background: PANEL,
        border: `1.5px solid ${BORDER}`,
        borderRadius: 18,
        padding: '22px 26px',
        marginBottom: 24,
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: 20,
        }}>
          <div style={{
            fontSize: 13, color: MUTED, letterSpacing: 2.5,
            textTransform: 'uppercase' as const, fontWeight: 700,
          }}>
            Voting record ideology
          </div>
          <div style={{
            fontSize: 22, fontWeight: 800,
            color: hasScore ? INK : MUTED,
            letterSpacing: -0.3,
          }}>
            {ideologyLabel(data.candidateScore)}
          </div>
        </div>

        {/* Spectrum bar */}
        <div style={{ position: 'relative', height: 48, margin: '0 6px' }}>
          {/* Track */}
          <div style={{
            position: 'absolute', left: 0, right: 0, top: 14,
            height: 18, borderRadius: 999,
            background: 'linear-gradient(90deg, #3B82F6 0%, #8B5CF6 50%, #EF4444 100%)',
            opacity: hasScore ? 1 : 0.35,
            boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.15)',
          }} />
          {/* Center tick */}
          <div style={{
            position: 'absolute', left: '50%', top: 8, width: 3, height: 30,
            background: 'rgba(255,255,255,0.5)', transform: 'translateX(-50%)', borderRadius: 999,
          }} />
          {/* Candidate dot */}
          <div style={{
            position: 'absolute',
            left: `${ideologyPct}%`,
            top: 0,
            transform: 'translateX(-50%)',
            width: 48, height: 48,
            borderRadius: '50%',
            border: `5px solid ${INK}`,
            background: hasScore ? PANEL2 : MUTED,
            boxShadow: `0 0 0 3px ${VIOLET}88, 0 8px 20px rgba(0,0,0,0.5)`,
          }} />
        </div>

        {/* Axis labels */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          fontSize: 14, color: MUTED, fontWeight: 700,
          letterSpacing: 1.2, textTransform: 'uppercase' as const, marginTop: 8,
        }}>
          <span>← Progressive</span>
          <span style={{ textAlign: 'center' }}>Moderate</span>
          <span style={{ textAlign: 'right' }}>Conservative →</span>
        </div>
      </div>

      {/* ── Key issues / causes ── */}
      {issues.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 13, color: MUTED, letterSpacing: 2.5,
            textTransform: 'uppercase' as const, fontWeight: 700, marginBottom: 14,
          }}>
            Key issues their donors care about
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
            {issues.map((issue, i) => {
              const colors = [
                { bg: `${VIOLET}20`, border: `${VIOLET_LIT}55`, text: VIOLET_GLOW },
                { bg: `${GREEN}18`, border: `${GREEN}44`, text: '#6EE7B7' },
                { bg: `${RED}18`, border: `${RED}44`, text: '#FCA5A5' },
              ];
              const c = colors[i % colors.length];
              return (
                <div key={issue} style={{
                  background: c.bg,
                  border: `1.5px solid ${c.border}`,
                  color: c.text,
                  borderRadius: 10,
                  padding: '10px 20px',
                  fontSize: 20,
                  fontWeight: 800,
                  letterSpacing: 0.2,
                }}>
                  {issue}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Section label for locked area ── */}
      <div style={{
        fontSize: 13, color: MUTED, letterSpacing: 2.5,
        textTransform: 'uppercase' as const, fontWeight: 700, marginBottom: 12,
      }}>
        Your alignment with {lastName}
      </div>

      {/* ── Locked alignment bar ── */}
      <LockedAlignmentBar />

      {/* ── CTA banner ── */}
      <div style={{
        background: `linear-gradient(90deg, ${VIOLET}D0, #5B21B6D0)`,
        borderRadius: 18,
        padding: '22px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 24,
        gap: 20,
      }}>
        <div>
          <div style={{
            fontSize: 24, fontWeight: 900, color: INK, letterSpacing: -0.4, lineHeight: 1.1,
          }}>
            Do you agree with their record?
          </div>
          <div style={{
            fontSize: 16, color: VIOLET_GLOW, marginTop: 4, fontWeight: 600,
          }}>
            2-min quiz · free · polipulseapp.com
          </div>
        </div>
        <div style={{
          background: INK,
          color: VIOLET,
          borderRadius: 12,
          padding: '12px 26px',
          fontSize: 18,
          fontWeight: 900,
          letterSpacing: 0.3,
          whiteSpace: 'nowrap' as const,
          flexShrink: 0,
        }}>
          Find My Match →
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 18, fontSize: 16, color: MUTED,
      }}>
        <span>Based on voting record & FEC data</span>
        <span style={{ fontWeight: 700, color: MUTED_LIGHT }}>{data.brandHost}</span>
      </div>
    </div>
  );
});

PolicyPositionsCard.displayName = 'PolicyPositionsCard';
