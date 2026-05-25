import { AbsoluteFill, Audio, staticFile } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Grid } from "./components/Grid";
import { Onboarding } from "./scenes/Onboarding";
import { QuizTopics } from "./scenes/QuizTopics";
import { QuizSlider } from "./scenes/QuizSlider";
import { Feed } from "./scenes/Feed";
import { Candidates } from "./scenes/Candidates";
import { Donor } from "./scenes/Donor";
import { Committees } from "./scenes/Committees";
import { Closing } from "./scenes/Closing";
import timings from "../public/audio/vo-timings.json";

const T = timings.transitionFrames;
const byId = Object.fromEntries(timings.scenes.map((s: any) => [s.id, s.durationInFrames]));

export const TOTAL_FRAMES =
  timings.scenes.reduce((a: number, s: any) => a + s.durationInFrames, 0) -
  (timings.scenes.length - 1) * T;

const fadeT = () => (
  <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
);

const SCENES: Array<[string, React.FC]> = [
  ["onboarding", Onboarding],
  ["quizTopics", QuizTopics],
  ["quizButtons", QuizSlider],
  ["feed", Feed],
  ["candidates", Candidates],
  ["donor", Donor],
  ["committees", Committees],
  ["closing", Closing],
];

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      <Grid />
      <Audio src={staticFile("audio/vo.mp3")} volume={1} />
      <TransitionSeries>
        {SCENES.map(([id, Comp], i) => (
          <>
            <TransitionSeries.Sequence key={id} durationInFrames={byId[id]}>
              <Comp />
            </TransitionSeries.Sequence>
            {i < SCENES.length - 1 ? fadeT() : null}
          </>
        ))}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
