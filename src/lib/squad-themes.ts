import { supabase } from "@/integrations/supabase/client";

export interface SquadTheme {
  key: string;
  label: string;
  primary: string;
  accent: string;
  dot: string;
  gradient?: string;
  pageBg?: string;
  cardBg?: string;
  cardGradient?: string;
  borderColor?: string;
  secondaryBg?: string;
  mutedFg?: string;
  foreground?: string;
  background?: string;
  popoverBg?: string;
  destructive?: string;
  ring?: string;
  inputBg?: string;
}

export const SQUAD_THEMES: Record<string, SquadTheme> = {
  default: {
    key: "default",
    label: "Default",
    primary: "175 85% 55%",
    accent: "12 90% 62%",
    dot: "#2dd4bf",
  },
  midnight_blue: {
    key: "midnight_blue",
    label: "Midnight Blue",
    primary: "212 100% 72%",
    accent: "265 94% 70%",
    dot: "#4a7bcc",
    gradient: "linear-gradient(135deg, hsl(212 100% 66%), hsl(262 92% 62%))",
    pageBg: "radial-gradient(circle at top left, hsl(208 100% 58%) 0%, hsl(230 90% 38%) 30%, hsl(257 82% 33%) 68%, hsl(275 70% 18%) 100%)",
    background: "226 74% 27%",
    cardBg: "226 62% 33%",
    cardGradient: "linear-gradient(145deg, hsl(215 78% 40%), hsl(236 66% 28%) 55%, hsl(260 60% 31%))",
    popoverBg: "226 60% 30%",
    secondaryBg: "225 52% 37%",
    borderColor: "214 92% 63%",
    inputBg: "225 46% 41%",
    mutedFg: "214 70% 84%",
    foreground: "220 25% 95%",
    ring: "212 100% 72%",
  },
  blood_orange: {
    key: "blood_orange",
    label: "Blood Orange",
    primary: "18 100% 66%",
    accent: "352 96% 60%",
    dot: "#e85d3a",
    gradient: "linear-gradient(135deg, hsl(24 100% 60%), hsl(352 92% 52%))",
    pageBg: "radial-gradient(circle at top, hsl(20 100% 56%) 0%, hsl(10 88% 48%) 28%, hsl(354 86% 42%) 62%, hsl(335 72% 23%) 100%)",
    background: "10 74% 30%",
    cardBg: "9 60% 36%",
    cardGradient: "linear-gradient(145deg, hsl(21 88% 46%), hsl(10 72% 38%) 48%, hsl(352 66% 33%) 100%)",
    popoverBg: "10 58% 34%",
    secondaryBg: "8 54% 41%",
    borderColor: "18 100% 66%",
    inputBg: "9 50% 43%",
    mutedFg: "22 92% 86%",
    foreground: "8 18% 95%",
    ring: "18 100% 66%",
  },
  royal_purple: {
    key: "royal_purple",
    label: "Royal Purple",
    primary: "283 100% 78%",
    accent: "322 92% 72%",
    dot: "#9b59b6",
    gradient: "linear-gradient(135deg, hsl(282 98% 72%), hsl(320 88% 68%))",
    pageBg: "radial-gradient(circle at top left, hsl(291 100% 68%) 0%, hsl(281 92% 54%) 28%, hsl(266 84% 42%) 62%, hsl(250 70% 25%) 100%)",
    background: "272 68% 32%",
    cardBg: "275 58% 40%",
    cardGradient: "linear-gradient(145deg, hsl(289 86% 56%), hsl(273 72% 42%) 52%, hsl(255 62% 34%))",
    popoverBg: "275 54% 37%",
    secondaryBg: "276 46% 45%",
    borderColor: "298 88% 76%",
    inputBg: "275 42% 48%",
    mutedFg: "292 90% 88%",
    foreground: "270 18% 96%",
    ring: "283 100% 78%",
  },
  stealth_black: {
    key: "stealth_black",
    label: "Stealth Black",
    primary: "0 0% 70%",
    accent: "0 0% 50%",
    dot: "#8c8c8c",
    pageBg: "linear-gradient(180deg, hsl(0 0% 5%) 0%, hsl(0 0% 2%) 100%)",
    background: "0 0% 4%",
    cardBg: "0 0% 10%",
    cardGradient: "linear-gradient(135deg, hsl(0 0% 12%), hsl(0 0% 7%))",
    popoverBg: "0 0% 12%",
    secondaryBg: "0 0% 14%",
    borderColor: "0 0% 20%",
    inputBg: "0 0% 16%",
    mutedFg: "0 0% 48%",
    foreground: "0 0% 85%",
    ring: "0 0% 50%",
  },
  golden_command: {
    key: "golden_command",
    label: "Golden Command",
    primary: "48 100% 68%",
    accent: "30 100% 61%",
    dot: "#d4a017",
    gradient: "linear-gradient(135deg, hsl(49 100% 64%), hsl(28 100% 56%))",
    pageBg: "radial-gradient(circle at top, hsl(50 100% 62%) 0%, hsl(39 96% 52%) 22%, hsl(28 92% 44%) 58%, hsl(18 75% 26%) 100%)",
    background: "34 62% 31%",
    cardBg: "35 54% 39%",
    cardGradient: "linear-gradient(145deg, hsl(46 86% 54%), hsl(34 78% 42%) 48%, hsl(22 68% 35%))",
    popoverBg: "35 50% 36%",
    secondaryBg: "35 44% 45%",
    borderColor: "48 100% 68%",
    inputBg: "35 40% 48%",
    mutedFg: "50 92% 88%",
    foreground: "38 18% 95%",
    ring: "48 100% 68%",
  },
  arctic: {
    key: "arctic",
    label: "Arctic",
    primary: "186 100% 76%",
    accent: "206 100% 82%",
    dot: "#7ec8e3",
    gradient: "linear-gradient(135deg, hsl(186 100% 72%), hsl(210 96% 80%))",
    pageBg: "radial-gradient(circle at bottom right, hsl(186 100% 76%) 0%, hsl(197 95% 66%) 24%, hsl(208 88% 58%) 56%, hsl(220 70% 34%) 100%)",
    background: "201 64% 35%",
    cardBg: "200 52% 43%",
    cardGradient: "linear-gradient(145deg, hsl(186 88% 68%), hsl(201 74% 52%) 54%, hsl(218 60% 39%))",
    popoverBg: "201 48% 41%",
    secondaryBg: "200 42% 49%",
    borderColor: "186 100% 76%",
    inputBg: "201 38% 52%",
    mutedFg: "193 88% 92%",
    foreground: "200 18% 96%",
    ring: "186 100% 76%",
  },
};

export const getThemeStyle = (themeKey: string = "default"): Record<string, string> => {
  const theme = SQUAD_THEMES[themeKey] || SQUAD_THEMES.default;
  if (themeKey === "default") return {};
  const style: Record<string, string> = {
    "--primary": theme.primary,
    "--primary-foreground": "220 20% 7%",
    "--ring": theme.ring || theme.primary,
    "--glow-primary": theme.primary,
    "--accent": theme.accent,
    "--accent-foreground": "220 20% 7%",
  };
  if (theme.pageBg) style["--theme-page-bg"] = theme.pageBg;
  if (theme.background) style["--background"] = theme.background;
  if (theme.cardBg) style["--card"] = theme.cardBg;
  if (theme.cardBg) style["--card-foreground"] = theme.foreground || "210 20% 92%";
  if (theme.cardGradient) style["--theme-card-gradient"] = theme.cardGradient;
  if (theme.popoverBg) style["--popover"] = theme.popoverBg;
  if (theme.popoverBg) style["--popover-foreground"] = theme.foreground || "210 20% 92%";
  if (theme.secondaryBg) style["--secondary"] = theme.secondaryBg;
  if (theme.secondaryBg) style["--secondary-foreground"] = theme.foreground || "210 20% 85%";
  if (theme.borderColor) style["--border"] = theme.borderColor;
  if (theme.inputBg) style["--input"] = theme.inputBg;
  if (theme.mutedFg) {
    style["--muted"] = theme.secondaryBg || "220 15% 15%";
    style["--muted-foreground"] = theme.mutedFg;
  }
  if (theme.foreground) style["--foreground"] = theme.foreground;
  if (theme.background) {
    style["--sidebar-background"] = theme.background;
    style["--sidebar-foreground"] = theme.foreground || "210 20% 92%";
  }
  return style;
};

export const getThemeDotColor = (themeKey: string = "default"): string => {
  return SQUAD_THEMES[themeKey]?.dot || SQUAD_THEMES.default.dot;
};

/**
 * Returns theme-specific hue ranges for user message colors.
 * Each theme defines hue bands that contrast well with its background.
 */
export const getThemeUserColorHues = (themeKey: string = "default"): { hues: number[]; satRange: [number, number]; lightRange: [number, number] } => {
  switch (themeKey) {
    case "golden_command":
      // Cool tones: blues, greens, teals
      return { hues: [180, 200, 220, 240, 160, 140, 260, 280], satRange: [70, 90], lightRange: [55, 70] };
    case "midnight_blue":
      // Warm tones: oranges, reds, yellows, pinks
      return { hues: [0, 20, 40, 60, 330, 350, 310, 15], satRange: [80, 95], lightRange: [60, 75] };
    case "blood_orange":
      // Cool tones: blues, greens, teals
      return { hues: [180, 200, 220, 240, 160, 140, 260, 280], satRange: [70, 90], lightRange: [60, 75] };
    case "royal_purple":
      // Warm tones: oranges, yellows, pinks, reds
      return { hues: [0, 25, 45, 60, 330, 350, 15, 40], satRange: [80, 95], lightRange: [60, 75] };
    case "arctic":
      // Dark tones: deep navy, charcoal, dark green, dark purple
      return { hues: [240, 260, 280, 300, 160, 200, 220, 320], satRange: [50, 75], lightRange: [25, 40] };
    default:
      // Full spectrum
      return { hues: [], satRange: [70, 90], lightRange: [60, 75] };
  }
};

/**
 * Theme-specific overrides for the ACTION and SUPER credit buttons.
 * Returns { actionColor, actionBg, superColor, superBg } or null for defaults.
 */
export const getThemeButtonColors = (themeKey: string = "default"): { actionColor: string; actionBg: string; superColor: string; superBg: string } | null => {
  switch (themeKey) {
    case "golden_command":
      return {
        actionColor: "hsl(220 90% 55%)",
        actionBg: "hsl(220 90% 55% / 0.15)",
        superColor: "hsl(270 80% 60%)",
        superBg: "hsl(270 80% 60% / 0.1)",
      };
    case "midnight_blue":
      return {
        actionColor: "hsl(275 100% 78%)",
        actionBg: "hsl(275 100% 78% / 0.2)",
        superColor: "hsl(280 100% 82%)",
        superBg: "hsl(280 100% 82% / 0.2)",
      };
    case "blood_orange":
      return {
        actionColor: "hsl(220 80% 40%)",
        actionBg: "hsl(220 80% 40% / 0.15)",
        superColor: "hsl(260 60% 30%)",
        superBg: "hsl(260 60% 30% / 0.15)",
      };
    case "royal_purple":
      return {
        actionColor: "hsl(var(--accent))",
        actionBg: "hsl(var(--accent) / 0.1)",
        superColor: "hsl(0 0% 95%)",
        superBg: "hsl(0 0% 95% / 0.15)",
      };
    case "arctic":
      return {
        actionColor: "hsl(220 80% 30%)",
        actionBg: "hsl(220 80% 30% / 0.15)",
        superColor: "hsl(270 60% 35%)",
        superBg: "hsl(270 60% 35% / 0.15)",
      };
    default:
      return null;
  }
};

/**
 * Theme-specific punishment poll colors for themes where destructive/red clashes.
 */
export const getThemePollColors = (themeKey: string = "default"): { border: string; bg: string; text: string; barBg: string } | null => {
  switch (themeKey) {
    case "blood_orange":
      return {
        border: "hsl(220 80% 50% / 0.4)",
        bg: "hsl(220 80% 50% / 0.1)",
        text: "hsl(220 80% 65%)",
        barBg: "hsl(220 80% 50% / 0.15)",
      };
    default:
      return null;
  }
};

export async function getUserSquadTheme(userId: string, squadId: string): Promise<string> {
  const { data } = await (supabase as any)
    .from("user_squad_themes")
    .select("theme")
    .eq("user_id", userId)
    .eq("squad_id", squadId)
    .maybeSingle();
  return data?.theme || "default";
}

export async function setUserSquadTheme(userId: string, squadId: string, theme: string): Promise<void> {
  const { data: existingRows } = await (supabase as any)
    .from("user_squad_themes")
    .select("id")
    .eq("user_id", userId)
    .eq("squad_id", squadId)
    .order("updated_at", { ascending: false })
    .limit(1);

  const payload = { user_id: userId, squad_id: squadId, theme, updated_at: new Date().toISOString() };
  const existingId = Array.isArray(existingRows) ? existingRows[0]?.id : existingRows?.id;

  if (existingId) {
    await (supabase as any)
      .from("user_squad_themes")
      .update(payload)
      .eq("id", existingId);
    return;
  }

  await (supabase as any)
    .from("user_squad_themes")
    .insert(payload);
}
