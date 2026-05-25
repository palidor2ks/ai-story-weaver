import { Screenshot } from "../components/Screenshot";
import { colors } from "../theme";
export const Feed: React.FC = () => (
  <Screenshot
    src="home-tall.png"
    eyebrow="YOUR PERSONAL FEED"
    title={<>Every official <span style={{ color: colors.primaryGlow }}>representing you</span>.</>}
    sub="From the President down to your town council — instantly matched, instantly scored against your views."
    zoomFrom={1.0} zoomTo={1.2}
    panFromY={0} panToY={-40}
    captionSide="right"
  />
);
