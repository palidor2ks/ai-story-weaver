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

// 8 sequences, 7 fade transitions x 10 frames overlap = 70 overlap.
// Sum sequences = 1870 → total = 1800 frames = 60s @ 30fps.
const fadeT = () => (
  <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 10 })} />
);

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      <Grid />
      <Audio src={staticFile("audio/vo.mp3")} volume={1} />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={200}><Onboarding /></TransitionSeries.Sequence>
        {fadeT()}
        <TransitionSeries.Sequence durationInFrames={240}><QuizTopics /></TransitionSeries.Sequence>
        {fadeT()}
        <TransitionSeries.Sequence durationInFrames={260}><QuizSlider /></TransitionSeries.Sequence>
        {fadeT()}
        <TransitionSeries.Sequence durationInFrames={270}><Feed /></TransitionSeries.Sequence>
        {fadeT()}
        <TransitionSeries.Sequence durationInFrames={230}><Candidates /></TransitionSeries.Sequence>
        {fadeT()}
        <TransitionSeries.Sequence durationInFrames={250}><Donor /></TransitionSeries.Sequence>
        {fadeT()}
        <TransitionSeries.Sequence durationInFrames={240}><Committees /></TransitionSeries.Sequence>
        {fadeT()}
        <TransitionSeries.Sequence durationInFrames={180}><Closing /></TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
