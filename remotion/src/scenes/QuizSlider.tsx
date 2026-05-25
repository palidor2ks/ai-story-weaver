import { Screenshot } from "../components/Screenshot";
import { colors } from "../theme";
export const QuizSlider: React.FC = () => (
  <Screenshot
    src="quiz.png"
    eyebrow="STEP 2 · 24 QUESTIONS"
    title={<>Tap how you <span style={{ color: colors.primary }}>feel</span>.</>}
    sub="Twenty-four short, plain-English questions. Five buttons — Strongly Disagree to Strongly Agree. No jargon, no traps."
    zoomFrom={1.0} zoomTo={1.1}
    panFromY={0} panToY={-4}
    captionSide="left"
  />
);
