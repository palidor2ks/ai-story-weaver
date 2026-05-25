import { Screenshot } from "../components/Screenshot";
import { colors } from "../theme";
export const QuizTopics: React.FC = () => (
  <Screenshot
    src="quiz-topics.png"
    eyebrow="STEP 1 · PICK YOUR ISSUES"
    title={<>Choose what <span style={{ color: colors.primaryGlow }}>matters</span> to you.</>}
    sub="Six federal topics. Pick your top three — order matters. We weight your match by what you care about most."
    zoomFrom={1.0} zoomTo={1.08}
    captionSide="right"
  />
);
