import { Screenshot } from "../components/Screenshot";
import { colors } from "../theme";
export const Candidates: React.FC = () => (
  <Screenshot
    src="candidates.png"
    eyebrow="SCORED L10 → R10"
    title={<>One scale. <span style={{ color: colors.red }}>Every</span> <span style={{ color: colors.primary }}>politician</span>.</>}
    sub="Built from real voting records and public statements — not vibes. 600+ officials and growing."
    zoomFrom={1.0} zoomTo={1.18}
    panFromY={-5} panToY={-25}
    captionSide="left"
  />
);
