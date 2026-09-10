import type { Group, GroupMessage, PunishmentPoll, ServeAction } from "@/lib/mockData";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const uniqueIds = (ids: unknown[]): string[] =>
  Array.from(new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0)));

const parseDate = (value: unknown): Date => {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
};

const hydrateServe = (serve: any): ServeAction => ({
  ...serve,
  createdAt: parseDate(serve?.createdAt),
  expiresAt: parseDate(serve?.expiresAt),
});

const hydrateMessage = (msg: any): GroupMessage => ({
  ...msg,
  createdAt: parseDate(msg?.createdAt),
});

const hydratePoll = (poll: any): PunishmentPoll => ({
  ...poll,
  createdAt: parseDate(poll?.createdAt),
  expiresAt: parseDate(poll?.expiresAt),
  punishmentDeadline: poll?.punishmentDeadline ? parseDate(poll.punishmentDeadline) : undefined,
});

export const pruneGroupRetention = (group: Group): Group => {
  const cutoff = Date.now() - THIRTY_DAYS_MS;

  const messages = group.messages.filter((m) => parseDate(m.createdAt).getTime() >= cutoff);
  const serveHistory = group.serveHistory.filter((s) => parseDate(s.createdAt).getTime() >= cutoff);

  return {
    ...group,
    messages,
    serveHistory,
    memberStatusById: group.memberStatusById || {},
    activeServes: group.activeServes.map((s) => ({
      ...s,
      createdAt: parseDate(s.createdAt),
      expiresAt: parseDate(s.expiresAt),
    })),
    activePolls: group.activePolls.map((p) => ({
      ...p,
      createdAt: parseDate(p.createdAt),
      expiresAt: parseDate(p.expiresAt),
      punishmentDeadline: p.punishmentDeadline ? parseDate(p.punishmentDeadline) : undefined,
    })),
    activePoll: group.activePoll
      ? {
          ...group.activePoll,
          createdAt: parseDate(group.activePoll.createdAt),
          expiresAt: parseDate(group.activePoll.expiresAt),
          punishmentDeadline: group.activePoll.punishmentDeadline ? parseDate(group.activePoll.punishmentDeadline) : undefined,
        }
      : null,
    currentServe: group.currentServe
      ? {
          ...group.currentServe,
          createdAt: parseDate(group.currentServe.createdAt),
          expiresAt: parseDate(group.currentServe.expiresAt),
        }
      : null,
  };
};

export const serializeGroupState = (group: Group) => {
  const pruned = pruneGroupRetention(group);

  return {
    currentCardHolderIds: uniqueIds(pruned.currentCardHolderIds),
    currentCardHolderId: uniqueIds(pruned.currentCardHolderIds)[0] || pruned.currentCardHolderId,
    currentServe: pruned.currentServe
      ? {
          ...pruned.currentServe,
          createdAt: parseDate(pruned.currentServe.createdAt).toISOString(),
          expiresAt: parseDate(pruned.currentServe.expiresAt).toISOString(),
        }
      : null,
    activeServes: pruned.activeServes.map((serve) => ({
      ...serve,
      createdAt: parseDate(serve.createdAt).toISOString(),
      expiresAt: parseDate(serve.expiresAt).toISOString(),
    })),
    serveHistory: pruned.serveHistory.map((serve) => ({
      ...serve,
      createdAt: parseDate(serve.createdAt).toISOString(),
      expiresAt: parseDate(serve.expiresAt).toISOString(),
    })),
    messages: pruned.messages.map((msg) => ({
      ...msg,
      createdAt: parseDate(msg.createdAt).toISOString(),
    })),
    activePolls: pruned.activePolls.map((poll) => ({
      ...poll,
      createdAt: parseDate(poll.createdAt).toISOString(),
      expiresAt: parseDate(poll.expiresAt).toISOString(),
      punishmentDeadline: poll.punishmentDeadline ? parseDate(poll.punishmentDeadline).toISOString() : null,
    })),
    activePoll: pruned.activePoll
      ? {
          ...pruned.activePoll,
          createdAt: parseDate(pruned.activePoll.createdAt).toISOString(),
          expiresAt: parseDate(pruned.activePoll.expiresAt).toISOString(),
          punishmentDeadline: pruned.activePoll.punishmentDeadline
            ? parseDate(pruned.activePoll.punishmentDeadline).toISOString()
            : null,
        }
      : null,
    exemptUserIds: pruned.exemptUserIds || [],
    captainFailCounts: pruned.captainFailCounts || {},
    captainStartDates: pruned.captainStartDates || {},
    memberStatusById: pruned.memberStatusById || {},
    gameStarted: pruned.gameStarted || false,
    lastCommandEvent: pruned.lastCommandEvent || null,
    lastActionEvent: pruned.lastActionEvent || null,
    lastSuperActionEvent: pruned.lastSuperActionEvent || null,
    captainDepartureLottery: pruned.captainDepartureLottery || null,
    initialCaptainLotteryEvent: pruned.initialCaptainLotteryEvent || null,
    squadResetEvent: pruned.squadResetEvent || null,
    memberDepartureEvent: pruned.memberDepartureEvent || null,
    lastAutoFailEvent: pruned.lastAutoFailEvent || null,
    crewPingEvent: pruned.crewPingEvent || null,
  };
};

export const applyPersistedGroupState = (baseGroup: Group, state: any): Group => {
  if (!state || typeof state !== "object") {
    return pruneGroupRetention(baseGroup);
  }

  const rawCaptainIds = Array.isArray(state.currentCardHolderIds) && state.currentCardHolderIds.length > 0
    ? uniqueIds(state.currentCardHolderIds)
    : uniqueIds(baseGroup.currentCardHolderIds);

  // Enforce max_captains cap so captain count never exceeds the squad setting
  const maxCaptains = baseGroup.captainCount ?? baseGroup.maxCards ?? rawCaptainIds.length;
  const persistedCaptainIds = maxCaptains > 0 && rawCaptainIds.length > maxCaptains
    ? rawCaptainIds.slice(0, maxCaptains)
    : rawCaptainIds;

  const statusById = (state.memberStatusById && typeof state.memberStatusById === "object") ? state.memberStatusById : {};

  const nextGroup: Group = {
    ...baseGroup,
    currentCardHolderIds: persistedCaptainIds,
    currentCardHolderId: persistedCaptainIds[0] || baseGroup.currentCardHolderId,
    currentServe: "currentServe" in state
      ? (state.currentServe ? hydrateServe(state.currentServe) : null)
      : baseGroup.currentServe,
    activeServes: Array.isArray(state.activeServes)
      ? state.activeServes.map(hydrateServe).filter((s: ServeAction) => !s.completed && !s.failed)
      : baseGroup.activeServes,
    serveHistory: Array.isArray(state.serveHistory)
      ? state.serveHistory.map(hydrateServe)
      : baseGroup.serveHistory,
    messages: Array.isArray(state.messages)
      ? state.messages.map(hydrateMessage)
      : baseGroup.messages,
    activePolls: Array.isArray(state.activePolls)
      ? state.activePolls.map(hydratePoll)
      : baseGroup.activePolls,
    activePoll: state.activePoll ? hydratePoll(state.activePoll) : baseGroup.activePoll,
    exemptUserIds: Array.isArray(state.exemptUserIds) ? state.exemptUserIds : [],
    captainFailCounts: (state.captainFailCounts && typeof state.captainFailCounts === "object") ? state.captainFailCounts : {},
    captainStartDates: (state.captainStartDates && typeof state.captainStartDates === "object") ? state.captainStartDates : {},
    memberStatusById: statusById,
    // Apply memberStatusById to member objects so strikes/warnings/consecutiveFails stay in sync
    members: baseGroup.members.map((m) => {
      const scoped = statusById[m.id];
      if (!scoped) return { ...m, strikes: Math.min(m.strikes ?? 0, 3), warnings: Math.min(m.warnings ?? 0, 3), consecutiveFails: m.consecutiveFails ?? 0 };
      return {
        ...m,
        completedCommands: scoped.completedCommands !== undefined ? scoped.completedCommands : m.completedCommands,
        strikes: Math.min(scoped.strikes ?? 0, 3),
        warnings: Math.min(scoped.warnings ?? 0, 3),
        consecutiveFails: scoped.consecutiveFails ?? 0,
      };
    }),
    gameStarted: !!state.gameStarted,
    lastCommandEvent: state.lastCommandEvent || null,
    lastActionEvent: state.lastActionEvent || null,
    lastSuperActionEvent: state.lastSuperActionEvent || null,
    captainDepartureLottery: state.captainDepartureLottery || null,
    initialCaptainLotteryEvent: state.initialCaptainLotteryEvent || null,
    squadResetEvent: state.squadResetEvent || null,
    memberDepartureEvent: state.memberDepartureEvent || null,
    lastAutoFailEvent: state.lastAutoFailEvent || null,
    crewPingEvent: state.crewPingEvent || null,
  };

  return pruneGroupRetention(nextGroup);
};
