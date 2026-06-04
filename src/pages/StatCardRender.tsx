import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import { useCandidateShareCardData } from '@/hooks/useCandidateShareCardData';
import { CandidateStatCard } from '@/components/share/templates/CandidateStatCard';
import { CARD_SIZE } from '@/components/share/templates/types';

/**
 * Headless render target for the automatic social-post pipeline.
 *
 * This renders the EXACT same `CandidateStatCard` the in-app share button uses
 * (same component, same data hook) at a fixed 1080×1080, with no app chrome, so
 * a headless browser (the `services/card-renderer` service) can screenshot it.
 *
 * When the card data has loaded and the layout has settled we set
 * `window.__CARD_READY__ = true` (and a `data-card-ready` attribute) so the
 * renderer knows exactly when to capture instead of guessing with a timeout.
 *
 * Public + unauthenticated on purpose — it shows only already-public profile
 * data, and the screenshotter runs anonymously.
 */
export default function StatCardRender() {
  const { candidateId } = useParams();
  const { data: cardData, loading } = useCandidateShareCardData(candidateId ?? null);
  const [ready, setReady] = useState(false);
  const settleTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!cardData || loading) return;
    // Give web fonts + the (already-inlined) image a tick to paint before we
    // signal ready, so the screenshot isn't captured mid-layout.
    settleTimer.current = window.setTimeout(() => {
      setReady(true);
      (window as unknown as { __CARD_READY__?: boolean }).__CARD_READY__ = true;
      document.documentElement.setAttribute('data-card-ready', 'true');
    }, 400);
    return () => {
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
    };
  }, [cardData, loading]);

  return (
    <div
      style={{
        width: CARD_SIZE,
        height: CARD_SIZE,
        position: 'absolute',
        top: 0,
        left: 0,
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      {cardData && (
        <div id="card-root" data-ready={ready ? 'true' : 'false'} style={{ width: CARD_SIZE, height: CARD_SIZE }}>
          <CandidateStatCard
            data={{ kind: 'candidate-alignment', ...cardData } as never}
            variant="classic"
          />
        </div>
      )}
    </div>
  );
}
