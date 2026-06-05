import { forwardRef } from 'react';
import { CardData, CARD_SIZE } from './types';
import { PulseMark } from './PulseMark';

interface Props {
  data: CardData;
}

const partyColor = (party: string) => {
  const p = (party ?? '').toLowerCase();
  if (p.startsWith('dem')) return 'hsl(217 91% 60%)';
  if (p.startsWith('rep')) return 'hsl(0 84% 60%)';
  if (p.startsWith('ind')) return 'hsl(271 76% 60%)';
  return 'hsl(var(--muted-foreground))';
};

const confidenceTone = (c: number) =>
  c >= 70 ? 'hsl(142 71% 45%)' : c >= 40 ? 'hsl(38 92% 50%)' : 'hsl(0 84% 60%)';
const confidenceLabel = (c: number) => (c >= 70 ? 'High' : c >= 40 ? 'Medium' : 'Low');

/**
 * AI ANALYSIS — shares the AI-generated profile (summary + confidence + signals)
 * for a donor, candidate, committee, or bill. Mirrors the in-app analysis dialog.
 */
export const AIAnalysisCard = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const title = data.analysisTitle ?? 'Analysis';
  const subtitle = data.analysisSubtitle ?? 'AI Analysis';
  const summary = data.analysisSummary ?? '';
  const confidence =
    typeof data.analysisConfidence === 'number'
      ? Math.max(0, Math.min(100, Math.round(data.analysisConfidence)))
      : null;
  const coverage = data.analysisDataCoverageLabel;
  const causes = (data.analysisCauses ?? []).slice(0, 4);
  const partySupport = (data.analysisPartySupport ?? []).slice(0, 3);

  const titleSize = title.length > 26 ? 64 : title.length > 16 ? 80 : 92;

  return (
    <div
      ref={ref}
      style={{
        width: CARD_SIZE,
        height: CARD_SIZE,
        background: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
        padding: 80,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 44,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <PulseMark size={64} />
          <div style={{ fontWeight: 700, fontSize: 32, letterSpacing: -0.5 }}>Pulse</div>
        </div>
        <div
          style={{
            background: 'hsl(var(--primary) / 0.1)',
            color: 'hsl(var(--primary))',
            padding: '12px 24px',
            borderRadius: 999,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 1,
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 24 }}>✦</span>
          {subtitle}
        </div>
      </div>

      {/* Subject name */}
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            fontSize: 22,
            color: 'hsl(var(--muted-foreground))',
            textTransform: 'uppercase',
            letterSpacing: 3,
            marginBottom: 12,
            fontWeight: 600,
          }}
        >
          AI-Generated Analysis
        </div>
        <div
          style={{
            fontSize: titleSize,
            fontWeight: 800,
            letterSpacing: -2,
            lineHeight: 1.05,
            color: 'hsl(var(--foreground))',
          }}
        >
          {title}
        </div>
      </div>

      {/* Confidence + data coverage */}
      {(confidence != null || coverage) && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
          {coverage && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'hsl(var(--muted) / 0.5)',
                border: '2px solid hsl(var(--border))',
                borderRadius: 16,
                padding: '14px 22px',
                fontSize: 24,
                fontWeight: 600,
              }}
            >
              <span style={{ color: 'hsl(var(--primary))' }}>▦</span>
              {coverage}
            </div>
          )}
          {confidence != null && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                background: 'hsl(var(--muted) / 0.5)',
                border: '2px solid hsl(var(--border))',
                borderRadius: 16,
                padding: '14px 22px',
                flex: 1,
                minWidth: 360,
              }}
            >
              <span style={{ fontSize: 24, fontWeight: 600, color: 'hsl(var(--muted-foreground))' }}>
                Confidence
              </span>
              <div
                style={{
                  flex: 1,
                  height: 12,
                  borderRadius: 999,
                  background: 'hsl(var(--muted))',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${confidence}%`,
                    background: confidenceTone(confidence),
                  }}
                />
              </div>
              <span style={{ fontSize: 24, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {confidence}/100 · {confidenceLabel(confidence)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Summary — the meat of the analysis */}
      <div
        style={{
          flex: 1,
          fontSize: 34,
          lineHeight: 1.45,
          color: 'hsl(var(--foreground))',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: partySupport.length > 0 || causes.length > 0 ? 6 : 9,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {summary}
      </div>

      {/* Party support bars */}
      {partySupport.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 28 }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 2,
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            Party support
          </div>
          {partySupport.map((p) => (
            <div key={p.party} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24 }}>
                <span style={{ fontWeight: 600 }}>{p.party}</span>
                <span style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {Math.round((p.share ?? 0) * 100)}%
                </span>
              </div>
              <div
                style={{
                  height: 12,
                  borderRadius: 999,
                  background: 'hsl(var(--muted))',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, (p.share ?? 0) * 100)}%`,
                    background: partyColor(p.party),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Causes (only when there's no party-support block) */}
      {partySupport.length === 0 && causes.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
          {causes.map((c, i) => (
            <div
              key={i}
              style={{
                background: 'hsl(var(--secondary))',
                color: 'hsl(var(--secondary-foreground))',
                borderRadius: 999,
                padding: '10px 22px',
                fontSize: 24,
                fontWeight: 600,
              }}
            >
              {c}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 36,
          paddingTop: 28,
          borderTop: '2px solid hsl(var(--border))',
          fontSize: 22,
          color: 'hsl(var(--muted-foreground))',
        }}
      >
        <span>AI-generated · verify with linked sources</span>
        <span style={{ fontWeight: 700, color: 'hsl(var(--foreground))' }}>{data.brandHost}</span>
      </div>
    </div>
  );
});
AIAnalysisCard.displayName = 'AIAnalysisCard';
