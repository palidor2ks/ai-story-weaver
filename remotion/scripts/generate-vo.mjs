// Generates the George voiceover for the 60s explainer.
// Run: ELEVENLABS_API_KEY=... node remotion/scripts/generate-vo.mjs
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../public/audio/vo.mp3');

const VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'; // George
const TEXT = `Politics moves fast — and most of us can't keep up with who really represents us. Polipulse fixes that. Start by picking the federal issues you actually care about. Answer twenty-four short questions — slide your position from left to right on every one. In seconds, we match you with every official representing you, from the President down to your town council. Each one earns a score, from L ten on the far left, to R ten on the far right, based on real voting records and public statements. Then go deeper. See exactly who's funding their campaign — every donor, every PAC, every dollar. Browse the top committees raising the most. Track the outside groups spending hundreds of millions to sway your vote. No spin. No vibes. Just receipts. Polipulse. Know your representatives. Follow the money. Cast a smarter vote.`;

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) { console.error('ELEVENLABS_API_KEY missing'); process.exit(1); }

const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
  method: 'POST',
  headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: TEXT,
    model_id: 'eleven_multilingual_v2',
    voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true, speed: 1.05 },
  }),
});
if (!resp.ok) { console.error('TTS failed', resp.status, await resp.text()); process.exit(1); }
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, Buffer.from(await resp.arrayBuffer()));
console.log('Saved', OUT);
