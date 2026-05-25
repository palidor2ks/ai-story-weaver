import { loadFont as loadGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

export const grotesk = loadGrotesk("normal", { weights: ["500", "700"], subsets: ["latin"] }).fontFamily;
export const inter = loadInter("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily;

export const colors = {
  bg: "#0B1220",
  bg2: "#0F172A",
  ink: "#E2E8F0",
  muted: "#64748B",
  primary: "#3B82F6",
  primaryGlow: "#60A5FA",
  red: "#EF4444",
  blue: "#1D4ED8",
  green: "#10B981",
  card: "#111B2E",
  border: "#1E293B",
};
