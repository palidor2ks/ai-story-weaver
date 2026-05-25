import { Screenshot } from "../components/Screenshot";
import { colors } from "../theme";
export const QuizSlider: React.FC = () => (
  <Screenshot
    src="quiz.png"
    eyebrow="STEP 2 · 24 QUESTIONS"
    title={<>Slide your position. <span style={{ color: colors.primary }}>Left to right.</span></>}
    sub="Twenty-four short, plain-English questions. No jargon, no political traps — just where you actually stand."
    zoomFrom={1.0} zoomTo={1.1}
    panFromY={0} panToY={-4}
    captionSide="left"
  />
);
