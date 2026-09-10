import { useMemo } from "react";
import { Crown, Target, TrendingUp, CheckCircle, XCircle, Trophy } from "lucide-react";
import type { Group, User, GroupMessage } from "@/lib/mockData";

interface LeaderboardViewProps {
  group: Group;
}

const getWeekStart = (): Date => {
  const now = new Date();
  const day = now.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
};

// Convert to AEST (UTC+11 for AEDT / UTC+10 for AEST)
const getWeekStartAEST = (): Date => {
  // Get current time in AEST (Australia/Sydney)
  const now = new Date();
  const aestOffset = 11; // AEDT (summer), use 10 for AEST (winter)
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const aestNow = new Date(utc + aestOffset * 3600000);
  
  const day = aestNow.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(aestNow);
  monday.setDate(aestNow.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  
  // Convert back to local time for comparison
  const mondayUTC = monday.getTime() - aestOffset * 3600000 - now.getTimezoneOffset() * 60000;
  return new Date(mondayUTC);
};

const formatDateOrdinal = (date: Date): string => {
  const day = date.getDate();
  const suffix = day === 1 || day === 21 || day === 31 ? "st" :
                 day === 2 || day === 22 ? "nd" :
                 day === 3 || day === 23 ? "rd" : "th";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day}${suffix} of ${months[date.getMonth()]} ${date.getFullYear()}`;
};

interface LeaderboardStats {
  commandsIssued: number;
  successes: number;
  failures: number;
  promotions: number;
}

const computeStats = (
  members: User[],
  messages: GroupMessage[],
  serveHistory: Group["serveHistory"],
  filterFn?: (date: Date) => boolean
): Record<string, LeaderboardStats> => {
  const memberStats: Record<string, LeaderboardStats> = {};
  members.forEach(m => {
    memberStats[m.id] = { commandsIssued: 0, successes: 0, failures: 0, promotions: 0 };
  });

  const filteredMessages = filterFn
    ? messages.filter(m => filterFn(new Date(m.createdAt)))
    : messages;

  const filteredServes = filterFn
    ? serveHistory.filter(s => filterFn(new Date(s.createdAt)))
    : serveHistory;

  filteredMessages.forEach(msg => {
    if (msg.type !== "action") return;
    if (msg.content.includes("COMMANDS")) {
      if (memberStats[msg.userId]) memberStats[msg.userId].commandsIssued++;
    }
    if (msg.content.includes("completed the mission")) {
      const mentionedId = msg.mentions?.[0];
      if (mentionedId && memberStats[mentionedId]) memberStats[mentionedId].successes++;
    }
    if (msg.content.includes("FAILED the mission") || msg.content.includes("ran out of time")) {
      const mentionedId = msg.mentions?.[0];
      if (mentionedId && memberStats[mentionedId]) memberStats[mentionedId].failures++;
    }
    if (msg.content.includes("promoted")) {
      const mentionedId = msg.mentions?.[0];
      if (mentionedId && memberStats[mentionedId]) memberStats[mentionedId].promotions++;
    }
  });

  filteredServes.forEach(s => {
    if (memberStats[s.fromUserId]) memberStats[s.fromUserId].commandsIssued++;
    if (s.completed && memberStats[s.toUserId]) memberStats[s.toUserId].successes++;
    if (s.failed && memberStats[s.toUserId]) memberStats[s.toUserId].failures++;
  });

  return memberStats;
};

const LeaderboardView = ({ group }: LeaderboardViewProps) => {
  const weekStart = useMemo(() => getWeekStartAEST(), []);

  const weekStats = useMemo(() =>
    computeStats(
      group.members,
      group.messages,
      group.serveHistory,
      (date) => date.getTime() >= weekStart.getTime()
    ),
    [group.members, group.messages, group.serveHistory, weekStart]
  );

  const allTimeStats = useMemo(() =>
    computeStats(group.members, group.messages, group.serveHistory),
    [group.members, group.messages, group.serveHistory]
  );

  const getMemberById = (id: string) => group.members.find(m => m.id === id);

  const buildCategories = (stats: Record<string, LeaderboardStats>) => [
    {
      title: "Most Commands Issued",
      icon: <Target className="w-4 h-4" />,
      data: Object.entries(stats)
        .sort(([, a], [, b]) => b.commandsIssued - a.commandsIssued)
        .filter(([, s]) => s.commandsIssued > 0)
        .slice(0, 3),
      getValue: (s: LeaderboardStats) => s.commandsIssued,
      label: "commands",
    },
    {
      title: "Most Promotions",
      icon: <TrendingUp className="w-4 h-4" />,
      data: Object.entries(stats)
        .sort(([, a], [, b]) => b.promotions - a.promotions)
        .filter(([, s]) => s.promotions > 0)
        .slice(0, 3),
      getValue: (s: LeaderboardStats) => s.promotions,
      label: "promotions",
    },
    {
      title: "Most Successful Commands",
      icon: <CheckCircle className="w-4 h-4" />,
      data: Object.entries(stats)
        .sort(([, a], [, b]) => b.successes - a.successes)
        .filter(([, s]) => s.successes > 0)
        .slice(0, 3),
      getValue: (s: LeaderboardStats) => s.successes,
      label: "successes",
    },
    {
      title: "Most Failures",
      icon: <XCircle className="w-4 h-4" />,
      data: Object.entries(stats)
        .sort(([, a], [, b]) => b.failures - a.failures)
        .filter(([, s]) => s.failures > 0)
        .slice(0, 3),
      getValue: (s: LeaderboardStats) => s.failures,
      label: "failures",
    },
  ];

  const weeklyCategories = buildCategories(weekStats);
  const allTimeCategories = buildCategories(allTimeStats);

  const medals = ["🥇", "🥈", "🥉"];

  const renderCategories = (categories: ReturnType<typeof buildCategories>) => (
    <>
      {categories.map(cat => (
        <div key={cat.title} className="rounded-xl p-3 bg-secondary/30 border border-border">
          <div className="flex items-center gap-2 mb-2">
            {cat.icon}
            <p className="font-display font-bold text-xs">{cat.title}</p>
          </div>
          {cat.data.length === 0 ? (
            <p className="text-xs text-muted-foreground">No data yet</p>
          ) : (
            <div className="space-y-1">
              {cat.data.map(([memberId, memberStats], idx) => {
                const member = getMemberById(memberId);
                if (!member) return null;
                return (
                  <div key={memberId} className="flex items-center gap-2 text-xs">
                    <span className="invert-protect">{medals[idx] || `${idx + 1}.`}</span>
                    <span className="invert-protect">{member.avatar}</span>
                    <span className="font-medium flex-1 truncate">{member.username}</span>
                    <span className="font-bold text-primary">{cat.getValue(memberStats)}</span>
                    <span className="text-muted-foreground text-[10px]">{cat.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </>
  );

  return (
    <div className="space-y-4 mt-6">
      {/* All Time Leaderboard */}
      <div className="flex items-center gap-2 mb-2">
        <Trophy className="w-4 h-4 text-accent" />
        <h3 className="font-display font-bold text-sm text-accent">All Time Leaderboard</h3>
      </div>
      {renderCategories(allTimeCategories)}

      {/* Weekly Leaderboard */}
      <div className="flex items-center gap-2 mb-2 mt-8">
        <Crown className="w-4 h-4 text-primary" />
        <h3 className="font-display font-bold text-sm text-primary">Weekly Leaderboard</h3>
      </div>
      <p className="text-[10px] text-muted-foreground -mt-3">
        Resets every Monday 00:00 AEST
        <br />
        Week {formatDateOrdinal(weekStart)}
      </p>
      {renderCategories(weeklyCategories)}
    </div>
  );
};

export default LeaderboardView;
