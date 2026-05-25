// Generates per-scene George VOs, concatenates to vo.mp3, writes vo-timings.json
// Run: ELEVENLABS_API_KEY=... node remotion/scripts/generate-vo.mjs
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.resolve(__dirname, '../public/audio');
const OUT = path.join(AUDIO_DIR, 'vo.mp3');
const TIMINGS = path.join(AUDIO_DIR, 'vo-timings.json');

const VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'; // George
const FPS = 30;
const TAIL_FRAMES = 12;       // ~0.4s breathing room after each line
const MIN_FRAMES = 150;       // 5s minimum per scene
const TRANSITION_FRAMES = 10; // matches MainVideo.tsx

const SCENES = [
  { id: 'onboarding',  text: "Politics moves fast — and most of us can't keep up with who really represents us. Polipulse fixes that." },
  { id: 'quizTopics',  text: "Start by picking the federal issues you actually care about — your top three." },
  { id: 'quizButtons', text: "Then answer twenty-four short questions. Tap how strongly you agree or disagree — no jargon, no traps." },
  { id: 'feed',        text: "In seconds, we match you with every official representing you, from the President down to your town council." },
  { id: 'candidates',  text: "Each one earns a score, from L ten on the far left to R ten on the far right — built from real voting records and public statements." },
  { id: 'donor',       text: "Then go deeper. See exactly who's funding their campaign — every donor, every PAC, every dollar." },
  { id: 'committees',  text: "Browse the top committees raising the most, and the outside groups spending hundreds of millions to sway your vote." },
  { id: 'closing',     text: "No spin. No vibes. Just receipts. Polipulse — know your representatives, follow the money, cast a smarter vote." },
];

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) { console.error('ELEVENLABS_API_KEY missing'); process.exit(1); }

await fs.mkdir(AUDIO_DIR, { recursive: true });

const timings = [];
let startFrame = 0;
const concatList = [];

for (let i = 0; i < SCENES.length; i++) {
  const s = SCENES[i];
  const prev = SCENES[i - 1]?.text;
  const next = SCENES[i + 1]?.text;
  const file = path.join(AUDIO_DIR, `vo-${s.id}.mp3`);

  console.log(`[${i + 1}/${SCENES.length}] ${s.id} ...`);
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: s.text,
      model_id: 'eleven_multilingual_v2',
      previous_text: prev,
      next_text: next,
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true, speed: 1.0 },
    }),
  });
  if (!resp.ok) { console.error('TTS failed', resp.status, await resp.text()); process.exit(1); }
  await fs.writeFile(file, Buffer.from(await resp.arrayBuffer()));

  const dur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "${file}"`).toString().trim());
  const frames = Math.max(MIN_FRAMES, Math.ceil(dur * FPS) + TAIL_FRAMES);
  timings.push({ id: s.id, durationInFrames: frames, startFrame, audioDurationSec: dur });
  startFrame += frames - TRANSITION_FRAMES; // next scene starts during fade
  concatList.push(`file '${file.replace(/'/g, "'\\''")}'`);
}

// Concat MP3s. Re-encode for clean joins.
const listPath = path.join(AUDIO_DIR, '_concat.txt');
await fs.writeFile(listPath, concatList.join('\n'));
execSync(`ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:a libmp3lame -b:a 192k "${OUT}"`, { stdio: 'inherit' });
await fs.unlink(listPath);

await fs.writeFile(TIMINGS, JSON.stringify({ fps: FPS, transitionFrames: TRANSITION_FRAMES, scenes: timings }, null, 2));
console.log('Wrote', OUT, 'and', TIMINGS);
console.log('Total frames:', timings.reduce((a, s) => a + s.durationInFrames, 0) - (timings.length - 1) * TRANSITION_FRAMES);
