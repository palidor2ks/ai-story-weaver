import { AbsoluteFill, Audio, staticFile, Series } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Grid } from "./components/Grid";
import { Hook } from "./scenes/Hook";
import { Quiz } from "./scenes/Quiz";
import { Match } from "./scenes/Match";
import { Transparency } from "./scenes/Transparency";
import { Outro } from "./scenes/Outro";

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      <Grid />
      <Audio src={staticFile("audio/vo.mp3")} volume={0.95} />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={70}><Hook /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 10 })} />
        <TransitionSeries.Sequence durationInFrames={95}><Quiz /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 10 })} />
        <TransitionSeries.Sequence durationInFrames={95}><Match /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 10 })} />
        <TransitionSeries.Sequence durationInFrames={125}><Transparency /></TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 10 })} />
        <TransitionSeries.Sequence durationInFrames={95}><Outro /></TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
