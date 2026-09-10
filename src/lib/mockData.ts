export interface User {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string;
  completedCommands: number;
  strikes: number;
  consecutiveFails: number;
  warnings: number;
  actionCredits: number;
  superActionCredits: number;
  lastSeenAt?: string | null;
}

export interface MemberStatus {
  strikes: number;
  warnings: number;
  consecutiveFails: number;
  completedCommands?: number;
}

export interface ServeAction {
  id: string;
  fromUserId: string;
  toUserId: string;
  prompt: string;
  completed: boolean;
  failed: boolean;
  createdAt: Date;
  expiresAt: Date;
  durationHours: number;
  isLegendary?: boolean;
}

/**
 * Snapshot of the message that was double-tapped to start a reply.
 * Stored on the new reply so we can render the quoted bubble even if
 * the original later scrolls away or the original author leaves the squad.
 */
export interface ReplyContext {
  /** Original message id (for jump-to-message in future) */
  messageId: string;
  /** Original author's user id (used for the @mention notification) */
  authorId: string;
  /** Original author's display name at the time of reply */
  authorName: string;
  /** Original message kind */
  kind: "comment" | "command" | "action";
  /** Short preview text shown in the quoted bubble */
  preview: string;
  /**
   * For command alerts only: both the captain and the target are notified.
   * Populated when replying to a "X COMMANDS Y" alert so we can ping both.
   */
  commandUserIds?: string[];
}

export interface GroupMessage {
  id: string;
  userId: string;
  type: "action" | "comment";
  content: string;
  mentions: string[];
  createdAt: Date;
  /** Optional: present when this message is a reply to another */
  replyTo?: ReplyContext;
}

export interface PunishmentPoll {
  id: string;
  targetUserId: string;
  options: string[];
  votes: Record<string, string>;
  createdAt: Date;
  expiresAt: Date;
  completed: boolean;
  winningOption?: string;
  punishmentCompleted?: boolean;
  punishmentDeadline?: Date;
}

export interface Group {
  id: string;
  name: string;
  adminId: string;
  members: User[];
  maxCards: number;
  isOpen: boolean;
  inviteCode: string;
  captainCount: number;
  currentCardHolderIds: string[];
  currentCardHolderId: string;
  currentServe: ServeAction | null;
  activeServes: ServeAction[];
  serveHistory: ServeAction[];
  messages: GroupMessage[];
  activePolls: PunishmentPoll[];
  activePoll: PunishmentPoll | null;
  pollDurationHours: number;
  punishmentDurationHours: number;
  commandDurationHours: number;
  captainFailLimit: number;
  exemptUserIds: string[];
  captainFailCounts: Record<string, number>;
  captainStartDates?: Record<string, number>;
  memberStatusById: Record<string, MemberStatus>;
  gameStarted: boolean;
  lastCommandEvent?: {
    id: string;
    captainId: string;
    targetId: string;
    prompt: string;
    timestamp: number;
    audienceUserIds?: string[];
    seenByUserIds?: string[];
  } | null;
  lastActionEvent?: {
    id: string;
    action: string;
    actorId: string;
    targetId?: string;
    timestamp: number;
    audienceUserIds?: string[];
    seenByUserIds?: string[];
  } | null;
  lastSuperActionEvent?: {
    id: string;
    action: "coup" | "rank_lottery" | "saboteur";
    actorId: string;
    targetId?: string;
    /** For coup: old captain id */
    oldCaptainId?: string;
    timestamp: number;
    audienceUserIds?: string[];
    seenByUserIds?: string[];
  } | null;
  captainDepartureLottery?: {
    id?: string;
    winnerId: string;
    departedUserId: string;
    timestamp: number;
    audienceUserIds?: string[];
    seenByUserIds?: string[];
  } | null;
  initialCaptainLotteryEvent?: {
    id?: string;
    winnerId: string;
    timestamp: number;
    audienceUserIds?: string[];
    seenByUserIds?: string[];
  } | null;
  squadResetEvent?: {
    id?: string;
    winnerId: string;
    timestamp: number;
    audienceUserIds?: string[];
    seenByUserIds?: string[];
  } | null;
  memberDepartureEvent?: {
    id: string;
    userId: string;
    username: string;
    avatar: string;
    type: "left" | "ejected";
    timestamp: number;
    audienceUserIds?: string[];
    seenByUserIds?: string[];
  } | null;
  lastAutoFailEvent?: {
    id: string;
    userId: string;
    username: string;
    avatar: string;
    timestamp: number;
    audienceUserIds?: string[];
    seenByUserIds?: string[];
  } | null;
  crewPingEvent?: {
    id: string;
    fromUserId: string;
    fromUsername: string;
    fromAvatar: string;
    message: string;
    timestamp: number;
    audienceUserIds: string[];
    seenByUserIds: string[];
  } | null;
  theme?: string;
}

export function getMaxCaptainFails(memberCount: number): number {
  if (memberCount >= 7) return 5;
  if (memberCount >= 6) return 4;
  if (memberCount >= 5) return 3;
  return 2;
}

export function getMaxCaptains(memberCount: number): number {
  if (memberCount >= 25) return 5;
  if (memberCount >= 20) return 4;
  if (memberCount >= 15) return 3;
  if (memberCount >= 10) return 2;
  return 1;
}

export const mockUsers: User[] = [
  { id: "1", username: "you", firstName: "John", lastName: "Doe", email: "john@test.com", avatar: "🧑", completedCommands: 5, strikes: 0, consecutiveFails: 0, warnings: 0, actionCredits: 1, superActionCredits: 1 },
  { id: "2", username: "alex_j", firstName: "Alex", lastName: "Johnson", email: "alex@test.com", avatar: "🦊", completedCommands: 12, strikes: 1, consecutiveFails: 1, warnings: 0, actionCredits: 3, superActionCredits: 1 },
  { id: "3", username: "maria99", firstName: "Maria", lastName: "Santos", email: "maria@test.com", avatar: "🌸", completedCommands: 3, strikes: 0, consecutiveFails: 0, warnings: 0, actionCredits: 1, superActionCredits: 1 },
  { id: "4", username: "the_chad", firstName: "Chad", lastName: "Williams", email: "chad@test.com", avatar: "🔥", completedCommands: 18, strikes: 2, consecutiveFails: 0, warnings: 0, actionCredits: 0, superActionCredits: 1 },
  { id: "5", username: "luna_moon", firstName: "Luna", lastName: "Moon", email: "luna@test.com", avatar: "🌙", completedCommands: 0, strikes: 0, consecutiveFails: 0, warnings: 0, actionCredits: 1, superActionCredits: 1 },
];

export const mockGroups: Group[] = [
  {
    id: "g1",
    name: "Friday Night Crew",
    adminId: "1",
    members: [mockUsers[0], mockUsers[1], mockUsers[2], mockUsers[3]],
    maxCards: 3,
    isOpen: false,
    inviteCode: "FNC-2024",
    captainCount: 1,
    currentCardHolderIds: ["1"],
    currentCardHolderId: "1",
    currentServe: null,
    activeServes: [],
    serveHistory: [
      {
        id: "s1",
        fromUserId: "2",
        toUserId: "3",
        prompt: "You have to do 20 push-ups right now 💪",
        completed: true,
        failed: false,
        createdAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() - 86400000 + 86400000),
        durationHours: 24,
      },
    ],
    messages: [
      {
        id: "m1",
        userId: "2",
        type: "action",
        content: "🦊 alex_j commanded 🌸 maria99: \"You have to do 20 push-ups right now 💪\"",
        mentions: [],
        createdAt: new Date(Date.now() - 86400000),
      },
      {
        id: "m2",
        userId: "3",
        type: "comment",
        content: "No way 😂 that was brutal",
        mentions: [],
        createdAt: new Date(Date.now() - 80000000),
      },
    ],
    activePolls: [],
    activePoll: null,
    pollDurationHours: 6,
    punishmentDurationHours: 12,
    commandDurationHours: 2,
    captainFailLimit: 3,
    exemptUserIds: [],
    captainFailCounts: {},
    memberStatusById: {},
    gameStarted: true,
  },
  {
    id: "g2",
    name: "College Besties",
    adminId: "2",
    members: [mockUsers[0], mockUsers[1], mockUsers[4]],
    maxCards: 2,
    isOpen: true,
    inviteCode: "COL-BFF",
    captainCount: 1,
    currentCardHolderIds: ["2"],
    currentCardHolderId: "2",
    currentServe: {
      id: "s2",
      fromUserId: "2",
      toUserId: "1",
      prompt: "You have to come hang out with me tonight! 🎉",
      completed: false,
      failed: false,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 2 * 3600000),
      durationHours: 2,
    },
    activeServes: [
      {
        id: "s2",
        fromUserId: "2",
        toUserId: "1",
        prompt: "You have to come hang out with me tonight! 🎉",
        completed: false,
        failed: false,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 2 * 3600000),
        durationHours: 2,
      },
    ],
    serveHistory: [],
    messages: [
      {
        id: "m3",
        userId: "2",
        type: "action",
        content: "🦊 alex_j commanded 🧑 you: \"You have to come hang out with me tonight! 🎉\"",
        mentions: ["1"],
        createdAt: new Date(),
      },
    ],
    activePolls: [],
    activePoll: null,
    pollDurationHours: 6,
    punishmentDurationHours: 12,
    commandDurationHours: 2,
    captainFailLimit: 3,
    exemptUserIds: [],
    captainFailCounts: {},
    memberStatusById: {},
    gameStarted: false,
  },
];
