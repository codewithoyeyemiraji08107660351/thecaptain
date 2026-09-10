export interface Rank {
  title: string;
  abbreviation: string;
  commandsRequired: number;
  badge: string;
}

// Rank thresholds:
// Pleb → CPO: 1 command per rank
// CPO → SBLT: 2 commands per rank
// SBLT → CAPT: 3 commands per rank
// CAPT → VADM: 4 commands per rank
// VADM → ADML: 7 commands
export const RANKS: Rank[] = [
  { title: "Pleb", abbreviation: "PLEB", commandsRequired: 0, badge: "🪨" },
  { title: "Seaman", abbreviation: "SMN", commandsRequired: 1, badge: "⚓" },
  { title: "Able Seaman", abbreviation: "AB", commandsRequired: 2, badge: "🔱" },
  { title: "Leading Seaman", abbreviation: "LS", commandsRequired: 3, badge: "⛵" },
  { title: "Petty Officer", abbreviation: "PO", commandsRequired: 4, badge: "🛡️" },
  { title: "Chief Petty Officer", abbreviation: "CPO", commandsRequired: 5, badge: "⚔️" },
  { title: "Warrant Officer", abbreviation: "WO", commandsRequired: 7, badge: "🎖️" },
  { title: "Warrant Officer Superior", abbreviation: "WOS", commandsRequired: 9, badge: "🏅" },
  { title: "Midshipman", abbreviation: "MIDN", commandsRequired: 11, badge: "🧭" },
  { title: "Acting Sub Lieutenant", abbreviation: "ASLT", commandsRequired: 13, badge: "🔰" },
  { title: "Sub Lieutenant", abbreviation: "SBLT", commandsRequired: 15, badge: "💎" },
  { title: "Lieutenant", abbreviation: "LEUT", commandsRequired: 18, badge: "⭐" },
  { title: "Lieutenant Commander", abbreviation: "LCDR", commandsRequired: 21, badge: "🌟" },
  { title: "Chaplain", abbreviation: "CHAP", commandsRequired: 24, badge: "✝️" },
  { title: "Commander", abbreviation: "CMDR", commandsRequired: 27, badge: "🎯" },
  { title: "Captain", abbreviation: "CAPT", commandsRequired: 30, badge: "🧿" },
  { title: "Commodore", abbreviation: "CDRE", commandsRequired: 34, badge: "🏆" },
  { title: "Rear Admiral", abbreviation: "RADM", commandsRequired: 38, badge: "🦅" },
  { title: "Vice Admiral", abbreviation: "VADM", commandsRequired: 42, badge: "⚜️" },
  { title: "Admiral", abbreviation: "ADML", commandsRequired: 49, badge: "👑" },
];

export function getRank(completedCommands: number): Rank {
  let rank = RANKS[0];
  for (const r of RANKS) {
    if (completedCommands >= r.commandsRequired) {
      rank = r;
    }
  }
  return rank;
}

export function getNextRank(completedCommands: number): Rank | null {
  const currentRank = getRank(completedCommands);
  const idx = RANKS.indexOf(currentRank);
  return idx < RANKS.length - 1 ? RANKS[idx + 1] : null;
}

export function getCommandsToNextRank(completedCommands: number): number {
  const nextRank = getNextRank(completedCommands);
  if (!nextRank) return 0;
  return nextRank.commandsRequired - completedCommands;
}

export function getRankProgress(completedCommands: number): number {
  const currentRank = getRank(completedCommands);
  const nextRank = getNextRank(completedCommands);
  if (!nextRank) return 100;
  const rangeTotal = nextRank.commandsRequired - currentRank.commandsRequired;
  const rangeDone = completedCommands - currentRank.commandsRequired;
  return Math.min(100, Math.round((rangeDone / rangeTotal) * 100));
}

export function isAdmiral(completedCommands: number): boolean {
  return completedCommands >= 49;
}

export function isViceAdmiral(completedCommands: number): boolean {
  return completedCommands >= 42;
}

export function isCaptainRank(completedCommands: number): boolean {
  return completedCommands >= 30;
}

export function isLieutenant(completedCommands: number): boolean {
  return completedCommands >= 18;
}

export function isMidshipman(completedCommands: number): boolean {
  return completedCommands >= 11;
}

export function isChiefPettyOfficer(completedCommands: number): boolean {
  return completedCommands >= 5;
}

export function isAbleSeaman(completedCommands: number): boolean {
  return completedCommands >= 2;
}

export function demoteOneRank(completedCommands: number): number {
  const currentRank = getRank(completedCommands);
  const currentIdx = RANKS.indexOf(currentRank);
  if (currentIdx <= 0) return 0;
  return RANKS[currentIdx - 1].commandsRequired;
}
