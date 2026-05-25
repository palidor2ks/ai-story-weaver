import { Screenshot } from "../components/Screenshot";
import { colors } from "../theme";
export const Donor: React.FC = () => (
  <Screenshot
    src="donor.png"
    eyebrow="FOLLOW THE MONEY"
    title={<>See who's <span style={{ color: colors.green }}>writing the checks</span>.</>}
    sub="Every individual donor, every PAC, every dollar — searchable and grouped, straight from FEC filings."
    zoomFrom={1.0} zoomTo={1.15}
    panFromY={0} panToY={-30}
    captionSide="right"
  />
);
