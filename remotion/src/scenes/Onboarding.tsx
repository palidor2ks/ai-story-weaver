import { Screenshot } from "../components/Screenshot";
import { colors } from "../theme";
export const Onboarding: React.FC = () => (
  <Screenshot
    src="onboarding.png"
    eyebrow="POLIPULSE"
    title={<>Politics moves <span style={{ color: colors.primary }}>fast</span>.</>}
    sub="Most of us can't keep up with who really represents us. Polipulse fixes that — in under three minutes."
    zoomFrom={1.02} zoomTo={1.12}
    panFromY={0} panToY={-3}
    captionSide="left"
  />
);
