// src/pages/GroupDetailPage.tsx
import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Crown, Zap, Check, X, Settings, Skull, Users, User as UserIcon, Camera, Share2, X as XIcon, ShoppingBag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { type Group, type GroupMessage, type MemberStatus, type PunishmentPoll, type ServeAction, type User, getMaxCaptainFails } from "@/lib/mockData";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ServeModal from "@/components/ServeModal";
import ServedNotification from "@/components/ServedNotification";
import GroupSettings from "@/components/GroupSettings";
import GroupActivityFeed from "@/components/GroupActivityFeed";
import RankBadge from "@/components/RankBadge";
import PunishmentPollView, { CreatePollDialog } from "@/components/PunishmentPoll";
import UserProfileDialog from "@/components/UserProfileDialog";
import CrewDialog from "@/components/CrewDialog";
import ActionSelector, { SpinWheel, type ActionType } from "@/components/ActionSelector";
import SuperActionSelector, { type SuperActionType } from "@/components/SuperActionSelector";
import { CoupAnimation, RankLotteryAnimation, SaboteurAnimation } from "@/components/SuperActionAnimations";
import ActionAnimation, { type ActionEvent } from "@/components/ActionAnimations";
import CommandIssuedAnimation, { type CommandEvent } from "@/components/CommandIssuedAnimation";
import CaptainLotteryAnimation from "@/components/CaptainLotteryAnimation";
import SquadResetAnimation from "@/components/SquadResetAnimation";
import MemberDepartureAnimation from "@/components/MemberDepartureAnimation";
import MemberEjectedAnimation from "@/components/MemberEjectedAnimation";
import OverlayFX from "@/components/OverlayFX";
import ShopDialog from "@/components/ShopDialog";
import CreditAwardPrompt from "@/components/CreditAwardPrompt";
import LegendaryCommandAnimation from "@/components/LegendaryCommandAnimation";
import AdmiralAnnouncement from "@/components/AdmiralAnnouncement";
import LeaderboardView from "@/components/LeaderboardView";
import UpgradeDialog from "@/components/UpgradeDialog";
import { useCreditReplenishment } from "@/hooks/use-credit-replenishment";
import { getRank, getNextRank, isAdmiral, isAbleSeaman, isChiefPettyOfficer, isMidshipman, isCaptainRank, isViceAdmiral, demoteOneRank } from "@/lib/ranks";
import RankMilestonePrompt, { useRankMilestones, clearLostMilestoneKeys } from "@/components/RankMilestonePrompt";
import CrewPingPrompt from "@/components/CrewPingPrompt";
import AmbientOverlay from "@/components/AmbientOverlay";
import { useLastOnlineHeartbeat } from "@/hooks/use-last-online";
import { getNotificationSettings, isNotificationEnabled } from "@/lib/notifications";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { sendPushNotification } from "@/lib/pushNotifications";
import { applyPersistedGroupState, pruneGroupRetention, serializeGroupState } from "@/lib/group-state-sync";
import { DEV_UNLIMITED_ACTION_CREDITS, DEV_UNLIMITED_SUPER_CREDITS } from "@/lib/dev-config";
import { trackStat, trackHighestRank } from "@/lib/lifetime-stats";
import { getThemeStyle, getUserSquadTheme, setUserSquadTheme, getThemeButtonColors } from "@/lib/squad-themes";
import GiftCreditsDialog from "@/components/GiftCreditsDialog";
import OnboardingGuide from "@/components/OnboardingGuide";
import { notificationTriggers } from "@/services/notificationTriggers";
import {
  playButtonSound, playSendCommandSound, playMissionSuccessSound,
  playMissionFailedSound, playPromotionSound, playDemotionSound,
  playProfileSound, playBackSound, playActionButtonSound,
  playAutoFailSound, playAutoFailStrikeSound,
} from "@/lib/sounds";

type AnimationSeenType = "command" | "action" | "super_action" | "departure_lottery" | "reset" | "initial_lottery" | "member_departure" | "auto_fail";

// ============================================
// ✅ HELPER: Get correct notification setting key
// ============================================
const getNotificationSettingKey = (type: string): string => {
  const mapping: Record<string, string> = {
    'receivedCommands': 'receivedCommands',
    'newCommands': 'newCommands',
    'failedCommands': 'failedCommands',
    'newMessages': 'newMessages',
    'mentions': 'mentions',
    'newMembers': 'newMembers',
    'polls': 'polls',
    'pollResults': 'polls',
    'pollUpdates': 'polls',
    'creditGifting': 'creditGifting',
    'warnings': 'warnings',
    'actionCreditsAgainstYou': 'actionCreditsAgainstYou',
    'superActionsAgainstYou': 'superActionsAgainstYou',
    'dailySpinReminder': 'dailySpinReminder',
  };
  return mapping[type] || type;
};

// ============================================
// ✅ HELPER: Send notification with settings check
// ============================================
const sendNotificationIfEnabled = async (
  notificationType: string,
  triggerFn: () => Promise<any>
): Promise<any> => {
  const settingKey = getNotificationSettingKey(notificationType);
  if (isNotificationEnabled(settingKey as any)) {
    try {
      return await triggerFn();
    } catch (error) {
      console.error(`Failed to send ${notificationType} notification:`, error);
      return null;
    }
  }
  return null;
};

// ============================================
// ✅ HELPER: Dedupe IDs
// ============================================
const dedupeIds = (ids: string[]) => Array.from(new Set(ids));

// ============================================
// ✅ HELPER: Get deterministic initial lottery
// ============================================
const getDeterministicInitialLottery = (members: User[], squadId: string) => {
  const sortedMembers = [...members].sort((a, b) => a.id.localeCompare(b.id));
  const audienceUserIds = sortedMembers.map((m) => m.id);

  let hash = 0;
  const seed = `${squadId}:${audienceUserIds.join(":")}`;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }

  const winner = sortedMembers[Math.abs(hash) % sortedMembers.length];
  const eventId = `initial-${squadId}-${audienceUserIds.join("-")}`;

  return {
    winner,
    event: {
      id: eventId,
      winnerId: winner.id,
      timestamp: Date.now(),
      audienceUserIds,
      seenByUserIds: [],
    } satisfies NonNullable<Group["initialCaptainLotteryEvent"]>,
  };
};

// ============================================
// ✅ HELPER: Mission Reports component (extracted)
// ============================================
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const COLLAPSED_REPORTS = 3;

const MissionReports = ({ messages, members, onUserTap }: {
  messages: GroupMessage[];
  members: User[];
  onUserTap: (user: User) => void;
}) => {
  const cutoff = Date.now() - ONE_MONTH_MS;
  const reportsRef = useRef<HTMLDivElement>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [showScrollUp, setShowScrollUp] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const missionMessages = messages
    .filter(msg => {
      if (msg.type !== "action") return false;
      if (new Date(msg.createdAt).getTime() < cutoff) return false;
      if (/has joined the squadron|has abandoned the squadron|has been EJECTED|Welcome aboard|CAPTAIN LOTTERY/.test(msg.content)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (missionMessages.length === 0) return null;

  const displayMessages = expanded ? missionMessages : missionMessages.slice(0, COLLAPSED_REPORTS);

  const handleScroll = () => {
    if (!reportsRef.current) return;
    setShowScrollUp(reportsRef.current.scrollTop > 60);
  };

  const scrollToTop = () => {
    if (reportsRef.current) {
      reportsRef.current.scrollTop = 0;
    }
  };

  const handleScreenshot = async () => {
    if (!reportsRef.current) return;
    try {
      const dataUrl = await toPng(reportsRef.current, { backgroundColor: "#1a1a2e" });
      setScreenshotUrl(dataUrl);
    } catch {}
  };

  const handleSaveScreenshot = () => {
    if (!screenshotUrl) return;
    const link = document.createElement("a");
    link.download = "mission-reports.png";
    link.href = screenshotUrl;
    link.click();
  };

  const handleShareScreenshot = async () => {
    if (!screenshotUrl) return;
    try {
      const res = await fetch(screenshotUrl);
      const blob = await res.blob();
      const file = new File([blob], "mission-reports.png", { type: "image/png" });
      if (navigator.share) {
        await navigator.share({ files: [file], title: "Mission Reports" });
      }
    } catch {}
  };

  const renderContentWithClickableNames = (content: string, msg: GroupMessage) => {
    const parts: React.ReactNode[] = [];
    const memberNames = members.map(m => m.username).filter(Boolean);
    const namePattern = memberNames.length > 0
      ? new RegExp(`(${memberNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
      : null;

    const segments = namePattern ? content.split(namePattern) : [content];
    segments.forEach((seg, i) => {
      if (!seg) return;
      const member = members.find(m => m.username.toLowerCase() === seg.toLowerCase());
      if (member) {
        parts.push(
          <span key={i} className="cursor-pointer hover:text-primary transition-colors" onClick={() => onUserTap(member)}>
            {seg}
          </span>
        );
      } else {
        const emojiSplit = seg.split(/([\p{Emoji_Presentation}\p{Extended_Pictographic}])/gu);
        emojiSplit.forEach((part, j) => {
          if (!part) return;
          if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]$/u.test(part)) {
            parts.push(<span key={`${i}-${j}`} className="invert-protect">{part}</span>);
          } else {
            parts.push(<span key={`${i}-${j}`}>{part}</span>);
          }
        });
      }
    });
    return <span>{parts}</span>;
  };

  return (
    <>
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm uppercase tracking-widest text-muted-foreground font-semibold">Mission Reports</h2>
          <div className="flex items-center gap-1">
            {expanded && (
              <button
                onClick={() => setExpanded(false)}
                className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors mr-1"
              >
                <ArrowLeft className="w-3 h-3 rotate-90" />
                Collapse
              </button>
            )}
            {expanded && (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleScreenshot} title="Screenshot reports">
                <Camera className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
        <div className="relative">
          {!expanded ? (
            <div
              className="space-y-2 cursor-pointer"
              onClick={() => setExpanded(true)}
            >
              {displayMessages.map(msg => (
                <div key={msg.id} className="p-2.5 rounded-xl text-xs bg-primary/5 border border-primary/10">
                  {renderContentWithClickableNames(msg.content, msg)}
                  <span className="text-[10px] text-muted-foreground ml-2">
                    {new Date(msg.createdAt).toLocaleDateString()} {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
              {missionMessages.length > COLLAPSED_REPORTS && (
                <p className="text-[10px] text-muted-foreground text-center py-1">
                  Tap to see {missionMessages.length - COLLAPSED_REPORTS} older reports...
                </p>
              )}
            </div>
          ) : (
            <>
              <div
                ref={reportsRef}
                onScroll={handleScroll}
                className="overflow-y-auto space-y-2 pr-1 scrollbar-none"
                style={{ maxHeight: "420px" }}
              >
                {missionMessages.map(msg => (
                  <div key={msg.id} className="p-2.5 rounded-xl text-xs bg-primary/5 border border-primary/10">
                    {renderContentWithClickableNames(msg.content, msg)}
                    <span className="text-[10px] text-muted-foreground ml-2">
                      {new Date(msg.createdAt).toLocaleDateString()} {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>

              {showScrollUp && (
                <button
                  onClick={scrollToTop}
                  className="absolute top-2 right-3 z-10 bg-primary text-primary-foreground rounded-full p-1.5 shadow-lg hover:opacity-90 transition-opacity"
                >
                  <ArrowLeft className="w-4 h-4 rotate-90" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {screenshotUrl && (
        <Dialog open={!!screenshotUrl} onOpenChange={() => setScreenshotUrl(null)}>
          <DialogContent className="bg-card border-border max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-lg font-display">📸 Mission Reports Screenshot</DialogTitle>
            </DialogHeader>
            <img src={screenshotUrl} alt="Mission Reports" className="rounded-lg border border-border w-full" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setScreenshotUrl(null)}>
                <XIcon className="w-4 h-4 mr-1" />
                Close
              </Button>
              <Button variant="default" className="flex-1" onClick={handleSaveScreenshot}>
                Save
              </Button>
              <Button variant="hero" className="flex-1" onClick={handleShareScreenshot}>
                <Share2 className="w-4 h-4 mr-1" />
                Share
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

// ============================================
// ✅ MAIN COMPONENT
// ============================================
const GroupDetailPage = () => {
  // ============================================
  // ✅ ALL HOOKS MUST BE CALLED HERE - UNCONDITIONALLY
  // ============================================

  // Router hooks
  const { id } = useParams();
  const navigate = useNavigate();

  // Auth hooks
  const { user, profile, refreshProfile } = useAuth();
  const { awardPrompt, dismissPrompt } = useCreditReplenishment(user?.id);
  const queryClient = useQueryClient();

  // ============================================
  // ✅ ALL useState hooks - UNCONDITIONAL
  // ============================================
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<Group | undefined>(undefined);
  const [captainTransferNotice, setCaptainTransferNotice] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const [missionFailNotice, setMissionFailNotice] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const [rankActionLoading, setRankActionLoading] = useState<Record<string, boolean>>({});
  const [showServeModal, setShowServeModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [showCrew, setShowCrew] = useState(false);
  const [pollTargetUserId, setPollTargetUserId] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [_ntc, _setNtc] = useState(0);
  const [_showArch, _setShowArch] = useState(false);
  const [_showFX, _setShowFX] = useState(false);
  const [showActionSelector, setShowActionSelector] = useState(false);
  const [showSuperActionSelector, setShowSuperActionSelector] = useState(false);
  const [actionServeId, setActionServeId] = useState<string | null>(null);
  const [showSpinWheel, setShowSpinWheel] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [giftTarget, setGiftTarget] = useState<User | null>(null);
  const [memberEnlistDates, setMemberEnlistDates] = useState<Record<string, Date>>({});
  const [personalTheme, setPersonalTheme] = useState<string>("default");
  const [showCaptainLottery, setShowCaptainLottery] = useState(false);
  const [showLegendaryAnim, setShowLegendaryAnim] = useState(false);
  const [legendaryEvent, setLegendaryEvent] = useState<import("@/components/LegendaryCommandAnimation").LegendaryCommandEvent | null>(null);
  const [showAdmiralAnnouncement, setShowAdmiralAnnouncement] = useState(false);
  const [admiralAnnouncementData, setAdmiralAnnouncementData] = useState<{
    username: string; avatar: string; completedCommands: number;
    failedMissions: number; commandsIssued: number; coupsPerformed: number;
  } | null>(null);
  const [captainLotteryMembers, setCaptainLotteryMembers] = useState<User[]>([]);
  const [captainLotteryContext, setCaptainLotteryContext] = useState<{
    type: "initial" | "transfer";
    baseCaptainIds?: string[];
  }>({ type: "initial" });
  const [pendingCaptainTransferLottery, setPendingCaptainTransferLottery] = useState<{
    candidates: User[];
    baseCaptainIds: string[];
  } | null>(null);
  const [resolvingServeIds, setResolvingServeIds] = useState<Record<string, boolean>>({});
  const [captainLotteryWinner, setCaptainLotteryWinner] = useState<User | null>(null);
  const [, setRefresh] = useState(0);
  const [showActionAnim, setShowActionAnim] = useState(false);
  const [actionAnimEvent, setActionAnimEvent] = useState<ActionEvent | null>(null);
  const [showCommandAnim, setShowCommandAnim] = useState(false);
  const [commandAnimEvent, setCommandAnimEvent] = useState<CommandEvent | null>(null);
  const [showResetAnim, setShowResetAnim] = useState(false);
  const [resetAnimMembers, setResetAnimMembers] = useState<User[]>([]);
  const [activeResetEventId, setActiveResetEventId] = useState<string | null>(null);
  const [pendingResetLottery, setPendingResetLottery] = useState<{
    members: User[];
    winner: User;
    shouldStartLottery: boolean;
  } | null>(null);
  const [autoFailAnim, setAutoFailAnim] = useState<{ username: string; avatar: string } | null>(null);
  const [showDepartureAnim, setShowDepartureAnim] = useState(false);
  const [departureAnimData, setDepartureAnimData] = useState<{ username: string; avatar: string; type: "left" | "ejected" } | null>(null);
  const [pendingDepartureLottery, setPendingDepartureLottery] = useState<{
    eventKey: string;
    members: User[];
    winner: User;
  } | null>(null);
  const [tenureTick, setTenureTick] = useState(0);
  const [showCoupAnim, setShowCoupAnim] = useState(false);
  const [coupOldCaptain, setCoupOldCaptain] = useState<User | null>(null);
  const [coupNewCaptain, setCoupNewCaptain] = useState<User | null>(null);
  const [showLotteryAnim, setShowLotteryAnim] = useState(false);
  const [lotteryTarget, setLotteryTarget] = useState<User | null>(null);
  const [pendingLotteryState, setPendingLotteryState] = useState<Group | null>(null);
  const [showSaboteurAnim, setShowSaboteurAnim] = useState(false);
  const [saboteurTarget, setSaboteurTarget] = useState<User | null>(null);
  const [pendingSaboteurState, setPendingSaboteurState] = useState<Group | null>(null);

  // ============================================
  // ✅ ALL useRef hooks - UNCONDITIONAL
  // ============================================
  const isApplyingRemoteUpdateRef = useRef(false);
  const skipPersistRef = useRef(false);
  const groupRef = useRef<Group | undefined>(undefined);
  const latestMissionFailPopupIdRef = useRef<string | null>(null);
  const _htRef = useRef<NodeJS.Timeout | null>(null);
  const actionInProgressRef = useRef(false);
  const lastButtonClickRef = useRef(0);
  const resolvingServeIdsRef = useRef<Set<string>>(new Set());
  const captainLotteryShownRef = useRef(false);
  const lastSeenCommandEventIdRef = useRef<string | null>(null);
  const lastSeenActionEventIdRef = useRef<string | null>(null);
  const lastSeenSuperActionEventIdRef = useRef<string | null>(null);
  const lastSeenDepartureLotteryRef = useRef<number>(0);
  const lastSeenResetEventRef = useRef<number>(0);
  const lastSeenAutoFailEventIdRef = useRef<string | null>(null);
  const lastSeenDepartureEventIdRef = useRef<string | null>(null);
  const activeCaptainDepartureLotteryKeyRef = useRef<string | null>(null);
  const activeInitialLotteryEventIdRef = useRef<string | null>(null);
  const activeMemberDepartureEventIdRef = useRef<string | null>(null);
  const selfLeaveInProgressRef = useRef(false);
  const lastPolledUpdatedAtRef = useRef<string | null>(null);
  const rankLotteryAnimEventIdRef = useRef<string | null>(null);
  const showLotteryAnimRef = useRef(false);
  const showCaptainLotteryRef = useRef(false);

  // ============================================
  // ✅ COMPUTED VALUES (not hooks) - can be used in hooks
  // ============================================
  const currentUser: User = {
    id: user?.id || "",
    username: profile?.username || "",
    firstName: profile?.first_name || "",
    lastName: profile?.last_name || "",
    email: user?.email || "",
    avatar: profile?.avatar || "🧑",
    completedCommands: profile?.completed_commands || 0,
    strikes: profile?.strikes || 0,
    consecutiveFails: profile?.consecutive_fails || 0,
    warnings: profile?.warnings || 0,
    actionCredits: profile?.action_credits ?? 1,
    superActionCredits: profile?.super_action_credits ?? 1,
  };

  const liveCurrentUser = group?.members.find((member) => member.id === currentUser.id) || currentUser;
  const mySquadCommandsForMilestone = group?.members.find(m => m.id === user?.id)?.completedCommands ?? currentUser.completedCommands;
  const { pendingMilestone, dismiss: dismissMilestone } = useRankMilestones(id, user?.id, mySquadCommandsForMilestone);

  // ============================================
  // ✅ useLastOnlineHeartbeat hook
  // ============================================
  useLastOnlineHeartbeat(user?.id);

  // ============================================
  // ✅ ALL useCallback hooks - UNCONDITIONAL
  // ============================================

  // Guard click with cooldown
  const guardClick = useCallback((fn: () => void, cooldownMs = 800) => {
    const now = Date.now();
    if (now - lastButtonClickRef.current < cooldownMs) return;
    lastButtonClickRef.current = now;
    fn();

  }, []);

  // Get animation seen key
  const getAnimationSeenKey = useCallback((type: AnimationSeenType, eventKey: string) => {
    if (!id || !user?.id || !eventKey) return null;
    return `seen-animation:${id}:${user.id}:${type}:${eventKey}`;
  }, [id, user?.id]);

  // Has seen animation locally
  const hasSeenAnimationLocally = useCallback((type: AnimationSeenType, eventKey: string) => {
    const key = getAnimationSeenKey(type, eventKey);
    if (!key || typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }, [getAnimationSeenKey]);

  // Mark animation seen locally
  const markAnimationSeenLocally = useCallback((type: AnimationSeenType, eventKey: string) => {
    const key = getAnimationSeenKey(type, eventKey);
    if (!key || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Ignore storage failures
    }
  }, [getAnimationSeenKey]);

  // Get pending ejection notice key
  const getPendingEjectionNoticeKey = useCallback(() => {
    if (!user?.id) return null;
    return `pending-ejection-notice:${user.id}`;
  }, [user?.id]);

  // Queue ejection notice
  const queueEjectionNotice = useCallback((groupName?: string) => {
    if (typeof window === "undefined") return;

    const resolvedGroupName = groupName || groupRef.current?.name || "Unknown squadron";
    const payload = {
      userId: user?.id || null,
      groupId: id || null,
      groupName: resolvedGroupName,
      createdAt: Date.now(),
      shownAt: null as number | null,
    };

    try {
      const key = getPendingEjectionNoticeKey();
      if (key) {
        window.localStorage.setItem(key, JSON.stringify(payload));
      }

      if (payload.userId) {
        const queueKey = "pending-ejection-notices";
        const rawQueue = window.localStorage.getItem(queueKey);
        const existing = rawQueue ? JSON.parse(rawQueue) as Array<typeof payload> : [];
        const withoutDupes = existing.filter(
          (entry) => !(entry?.userId === payload.userId && entry?.groupId === payload.groupId && !entry?.shownAt)
        );
        withoutDupes.push(payload);
        window.localStorage.setItem(queueKey, JSON.stringify(withoutDupes));
      }
    } catch {
      // Ignore storage write failures
    }
  }, [getPendingEjectionNoticeKey, id, user?.id]);

  // Redirect current user as ejected
  const redirectCurrentUserAsEjected = useCallback((groupName?: string) => {
    if (selfLeaveInProgressRef.current) return;
    queueEjectionNotice(groupName);
    navigate("/squads", { replace: true });
  }, [navigate, queueEjectionNotice]);

  // Get reset seen user IDs
  const getResetSeenUserIds = useCallback((event: Group["squadResetEvent"] | null | undefined): string[] =>
    Array.isArray(event?.seenByUserIds)
      ? event.seenByUserIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [], []);

  const getResetAudienceUserIds = useCallback((event: Group["squadResetEvent"] | null | undefined): string[] =>
    Array.isArray(event?.audienceUserIds)
      ? event.audienceUserIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [], []);

  const shouldPlayResetForUser = useCallback((event: Group["squadResetEvent"] | null | undefined, userId: string | null | undefined): boolean => {
    if (!event || !userId) return false;
    const eventKey = event.id || `legacy-${event.timestamp}`;
    if (hasSeenAnimationLocally("reset", eventKey)) return false;
    const audienceUserIds = getResetAudienceUserIds(event);
    if (audienceUserIds.length > 0 && !audienceUserIds.includes(userId)) return false;
    return !getResetSeenUserIds(event).includes(userId);
  }, [getResetAudienceUserIds, getResetSeenUserIds, hasSeenAnimationLocally]);

  const markResetEventSeen = useCallback((resetEventId: string) => {
    if (!resetEventId || !user?.id) return;
    markAnimationSeenLocally("reset", resetEventId);

    setGroup((prev) => {
      if (!prev?.squadResetEvent) return prev;
      const event = prev.squadResetEvent;
      const currentEventId = event.id || `legacy-${event.timestamp}`;
      if (currentEventId !== resetEventId) return prev;

      const seenSet = new Set(getResetSeenUserIds(event));
      const beforeSize = seenSet.size;
      seenSet.add(user.id);
      if (seenSet.size === beforeSize) return prev;

      const audienceUserIds = getResetAudienceUserIds(event);
      if (audienceUserIds.length > 0 && audienceUserIds.every((memberId) => seenSet.has(memberId))) {
        return {
          ...prev,
          squadResetEvent: null,
        };
      }

      return {
        ...prev,
        squadResetEvent: {
          ...event,
          seenByUserIds: Array.from(seenSet),
        },
      };
    });
  }, [getResetAudienceUserIds, getResetSeenUserIds, markAnimationSeenLocally, user?.id]);

  // Command event seen tracking helpers
  const getCommandSeenUserIds = useCallback((event: Group["lastCommandEvent"] | null | undefined): string[] =>
    Array.isArray(event?.seenByUserIds)
      ? event.seenByUserIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [], []);

  const getCommandAudienceUserIds = useCallback((event: Group["lastCommandEvent"] | null | undefined): string[] =>
    Array.isArray(event?.audienceUserIds)
      ? event.audienceUserIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [], []);

  const shouldPlayCommandForUser = useCallback((event: Group["lastCommandEvent"] | null | undefined, userId: string | null | undefined): boolean => {
    if (!event || !userId) return false;
    if (hasSeenAnimationLocally("command", event.id)) return false;
    const audience = getCommandAudienceUserIds(event);
    if (audience.length > 0 && !audience.includes(userId)) return false;
    return !getCommandSeenUserIds(event).includes(userId);
  }, [getCommandAudienceUserIds, getCommandSeenUserIds, hasSeenAnimationLocally]);

  const markCommandEventSeen = useCallback((commandEventId: string) => {
    if (!commandEventId || !user?.id) return;
    markAnimationSeenLocally("command", commandEventId);

    setGroup((prev) => {
      if (!prev?.lastCommandEvent) return prev;
      if (prev.lastCommandEvent.id !== commandEventId) return prev;

      const seenSet = new Set(getCommandSeenUserIds(prev.lastCommandEvent));
      const beforeSize = seenSet.size;
      seenSet.add(user.id);
      if (seenSet.size === beforeSize) return prev;

      const audience = getCommandAudienceUserIds(prev.lastCommandEvent);
      if (audience.length > 0 && audience.every((uid) => seenSet.has(uid))) {
        return { ...prev, lastCommandEvent: null };
      }

      return {
        ...prev,
        lastCommandEvent: {
          ...prev.lastCommandEvent,
          seenByUserIds: Array.from(seenSet),
        },
      };
    });
  }, [getCommandAudienceUserIds, getCommandSeenUserIds, markAnimationSeenLocally, user?.id]);

  // Action event seen tracking helpers
  const getActionSeenUserIds = useCallback((event: Group["lastActionEvent"] | null | undefined): string[] =>
    Array.isArray(event?.seenByUserIds)
      ? event.seenByUserIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [], []);

  const getActionAudienceUserIds = useCallback((event: Group["lastActionEvent"] | null | undefined): string[] =>
    Array.isArray(event?.audienceUserIds)
      ? event.audienceUserIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [], []);

  const shouldPlayActionForUser = useCallback((event: Group["lastActionEvent"] | null | undefined, userId: string | null | undefined): boolean => {
    if (!event || !userId) return false;
    if (hasSeenAnimationLocally("action", event.id)) return false;
    const audience = getActionAudienceUserIds(event);
    if (audience.length > 0 && !audience.includes(userId)) return false;
    return !getActionSeenUserIds(event).includes(userId);
  }, [getActionAudienceUserIds, getActionSeenUserIds, hasSeenAnimationLocally]);

  const markActionEventSeen = useCallback((actionEventId: string) => {
    if (!actionEventId || !user?.id) return;
    markAnimationSeenLocally("action", actionEventId);

    setGroup((prev) => {
      if (!prev?.lastActionEvent || prev.lastActionEvent.id !== actionEventId) return prev;
      const seenSet = new Set(getActionSeenUserIds(prev.lastActionEvent));
      if (seenSet.has(user.id)) return prev;
      seenSet.add(user.id);
      const audience = getActionAudienceUserIds(prev.lastActionEvent);
      if (audience.length > 0 && audience.every((uid) => seenSet.has(uid))) {
        return { ...prev, lastActionEvent: null };
      }
      return { ...prev, lastActionEvent: { ...prev.lastActionEvent, seenByUserIds: Array.from(seenSet) } };
    });
  }, [getActionAudienceUserIds, getActionSeenUserIds, markAnimationSeenLocally, user?.id]);

  // Super action event seen tracking helpers
  const getSuperActionSeenUserIds = useCallback((event: Group["lastSuperActionEvent"] | null | undefined): string[] =>
    Array.isArray(event?.seenByUserIds)
      ? event.seenByUserIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [], []);

  const getSuperActionAudienceUserIds = useCallback((event: Group["lastSuperActionEvent"] | null | undefined): string[] =>
    Array.isArray(event?.audienceUserIds)
      ? event.audienceUserIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [], []);

  const shouldPlaySuperActionForUser = useCallback((event: Group["lastSuperActionEvent"] | null | undefined, userId: string | null | undefined): boolean => {
    if (!event || !userId) return false;
    if (hasSeenAnimationLocally("super_action", event.id)) return false;
    const audience = getSuperActionAudienceUserIds(event);
    if (audience.length > 0 && !audience.includes(userId)) return false;
    return !getSuperActionSeenUserIds(event).includes(userId);
  }, [getSuperActionAudienceUserIds, getSuperActionSeenUserIds, hasSeenAnimationLocally]);

  const markSuperActionEventSeen = useCallback((superEventId: string) => {
    if (!superEventId || !user?.id) return;
    markAnimationSeenLocally("super_action", superEventId);

    setGroup((prev) => {
      if (!prev?.lastSuperActionEvent || prev.lastSuperActionEvent.id !== superEventId) return prev;
      const seenSet = new Set(getSuperActionSeenUserIds(prev.lastSuperActionEvent));
      if (seenSet.has(user.id)) return prev;
      seenSet.add(user.id);
      const audience = getSuperActionAudienceUserIds(prev.lastSuperActionEvent);
      if (audience.length > 0 && audience.every((uid) => seenSet.has(uid))) {
        return { ...prev, lastSuperActionEvent: null };
      }
      return { ...prev, lastSuperActionEvent: { ...prev.lastSuperActionEvent, seenByUserIds: Array.from(seenSet) } };
    });
  }, [getSuperActionAudienceUserIds, getSuperActionSeenUserIds, markAnimationSeenLocally, user?.id]);

  // Captain departure lottery seen tracking helpers
  const getDepartureSeenUserIds = useCallback((event: Group["captainDepartureLottery"] | null | undefined): string[] =>
    Array.isArray(event?.seenByUserIds)
      ? event.seenByUserIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [], []);

  const getDepartureAudienceUserIds = useCallback((event: Group["captainDepartureLottery"] | null | undefined): string[] =>
    Array.isArray(event?.audienceUserIds)
      ? event.audienceUserIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [], []);

  const getDepartureLotteryEventKey = useCallback((event: Group["captainDepartureLottery"] | null | undefined): string => {
    if (!event) return "";
    return event.id || `${event.timestamp}-${event.departedUserId}-${event.winnerId}`;
  }, []);

  const shouldPlayDepartureForUser = useCallback((event: Group["captainDepartureLottery"] | null | undefined, userId: string | null | undefined): boolean => {
    if (!event || !userId) return false;
    const eventKey = getDepartureLotteryEventKey(event);
    if (!eventKey) return false;
    if (hasSeenAnimationLocally("departure_lottery", eventKey)) return false;
    const audience = getDepartureAudienceUserIds(event);
    if (audience.length > 0 && !audience.includes(userId)) return false;
    return !getDepartureSeenUserIds(event).includes(userId);
  }, [getDepartureAudienceUserIds, getDepartureLotteryEventKey, getDepartureSeenUserIds, hasSeenAnimationLocally]);

  const startDepartureLottery = useCallback((eventKey: string, members: User[], winner: User) => {
    if (!eventKey || members.length === 0) return;
    if (hasSeenAnimationLocally("departure_lottery", eventKey)) return;
    if (activeCaptainDepartureLotteryKeyRef.current === eventKey || showCaptainLotteryRef.current) return;

    activeCaptainDepartureLotteryKeyRef.current = eventKey;
    markAnimationSeenLocally("departure_lottery", eventKey);
    const currentGroup = groupRef.current;
    const departedId = currentGroup?.captainDepartureLottery?.departedUserId;
    const baseCaptainIds = departedId
      ? (currentGroup?.currentCardHolderIds || []).filter(cid => cid !== departedId && cid !== winner.id)
      : [];
    setCaptainLotteryContext({ type: "transfer", baseCaptainIds });
    setCaptainLotteryMembers(members);
    setCaptainLotteryWinner(winner);
    setShowCaptainLottery(true);
  }, [hasSeenAnimationLocally, markAnimationSeenLocally]);

  const markDepartureLotterySeen = useCallback(() => {
    if (!user?.id) return;

    const currentEvent = groupRef.current?.captainDepartureLottery;
    if (currentEvent) {
      const eventKey = getDepartureLotteryEventKey(currentEvent);
      if (eventKey) markAnimationSeenLocally("departure_lottery", eventKey);
    }

    let nextSnapshot: Group | null = null;
    setGroup((prev) => {
      if (!prev?.captainDepartureLottery) return prev;

      const seenSet = new Set(getDepartureSeenUserIds(prev.captainDepartureLottery));
      if (seenSet.has(user.id)) return prev;
      seenSet.add(user.id);

      const audience = getDepartureAudienceUserIds(prev.captainDepartureLottery);
      if (audience.length > 0 && audience.every((uid) => seenSet.has(uid))) {
        nextSnapshot = { ...prev, captainDepartureLottery: null };
        return nextSnapshot;
      }

      nextSnapshot = {
        ...prev,
        captainDepartureLottery: { ...prev.captainDepartureLottery, seenByUserIds: Array.from(seenSet) },
      };
      return nextSnapshot;
    });

    if (nextSnapshot && id) {
      const pruned = pruneGroupRetention(nextSnapshot);
      void (supabase as any)
        .from("squad_live_state")
        .upsert({ squad_id: id, state: serializeGroupState(pruned) }, { onConflict: "squad_id" });
    }
  }, [getDepartureAudienceUserIds, getDepartureLotteryEventKey, getDepartureSeenUserIds, id, markAnimationSeenLocally, user?.id]);

  // Initial lottery helpers
  const getInitialLotterySeenUserIds = useCallback((event: Group["initialCaptainLotteryEvent"] | null | undefined): string[] =>
    Array.isArray(event?.seenByUserIds)
      ? event.seenByUserIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [], []);

  const getInitialLotteryAudienceUserIds = useCallback((event: Group["initialCaptainLotteryEvent"] | null | undefined): string[] =>
    Array.isArray(event?.audienceUserIds)
      ? event.audienceUserIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [], []);

  const getInitialLotteryEventKey = useCallback((event: Group["initialCaptainLotteryEvent"] | null | undefined): string => {
    if (!event) return "";
    if (event.id) return event.id;
    const timestamp = Number(event.timestamp) || 0;
    return `legacy-${timestamp}-${event.winnerId}`;
  }, []);

  const shouldPlayInitialLotteryForUser = useCallback((event: Group["initialCaptainLotteryEvent"] | null | undefined, userId: string | null | undefined): boolean => {
    if (!event || !userId) return false;
    const eventKey = getInitialLotteryEventKey(event);
    if (!eventKey) return false;
    if (hasSeenAnimationLocally("initial_lottery", eventKey)) return false;
    const audience = getInitialLotteryAudienceUserIds(event);
    if (audience.length > 0 && !audience.includes(userId)) return false;
    return !getInitialLotterySeenUserIds(event).includes(userId);
  }, [getInitialLotteryAudienceUserIds, getInitialLotteryEventKey, getInitialLotterySeenUserIds, hasSeenAnimationLocally]);

  const startInitialLottery = useCallback((eventKey: string, members: User[], winner: User) => {
    if (!eventKey || members.length === 0) return;
    if (hasSeenAnimationLocally("initial_lottery", eventKey)) return;
    if (activeInitialLotteryEventIdRef.current === eventKey || showCaptainLotteryRef.current) return;

    activeInitialLotteryEventIdRef.current = eventKey;
    markAnimationSeenLocally("initial_lottery", eventKey);
    setCaptainLotteryContext({ type: "initial" });
    setPendingCaptainTransferLottery(null);
    setCaptainLotteryMembers(members);
    setCaptainLotteryWinner(winner);
    setShowCaptainLottery(true);
  }, [hasSeenAnimationLocally, markAnimationSeenLocally]);

  const markInitialLotterySeen = useCallback(() => {
    if (!user?.id) return;

    const currentEvent = groupRef.current?.initialCaptainLotteryEvent;
    if (currentEvent) {
      const eventKey = getInitialLotteryEventKey(currentEvent);
      if (eventKey) markAnimationSeenLocally("initial_lottery", eventKey);
    }

    let nextSnapshot: Group | null = null;
    setGroup((prev) => {
      if (!prev?.initialCaptainLotteryEvent) return prev;

      const seenSet = new Set(getInitialLotterySeenUserIds(prev.initialCaptainLotteryEvent));
      if (seenSet.has(user.id)) return prev;
      seenSet.add(user.id);

      const audience = getInitialLotteryAudienceUserIds(prev.initialCaptainLotteryEvent);
      if (audience.length > 0 && audience.every((uid) => seenSet.has(uid))) {
        nextSnapshot = { ...prev, initialCaptainLotteryEvent: null };
        return nextSnapshot;
      }

      nextSnapshot = {
        ...prev,
        initialCaptainLotteryEvent: { ...prev.initialCaptainLotteryEvent, seenByUserIds: Array.from(seenSet) },
      };
      return nextSnapshot;
    });

    if (nextSnapshot && id) {
      const pruned = pruneGroupRetention(nextSnapshot);
      void (supabase as any)
        .from("squad_live_state")
        .upsert({ squad_id: id, state: serializeGroupState(pruned) }, { onConflict: "squad_id" });
    }
  }, [getInitialLotteryAudienceUserIds, getInitialLotteryEventKey, getInitialLotterySeenUserIds, id, markAnimationSeenLocally, user?.id]);

  // Member departure event helpers
  const getMemberDepartureSeenUserIds = useCallback((event: Group["memberDepartureEvent"] | null | undefined): string[] =>
    Array.isArray(event?.seenByUserIds)
      ? event.seenByUserIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [], []);

  const getMemberDepartureAudienceUserIds = useCallback((event: Group["memberDepartureEvent"] | null | undefined): string[] =>
    Array.isArray(event?.audienceUserIds)
      ? event.audienceUserIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [], []);

  const shouldPlayMemberDepartureForUser = useCallback((event: Group["memberDepartureEvent"] | null | undefined, userId: string | null | undefined): boolean => {
    if (!event || !userId) return false;
    if (event.userId === userId) return false;
    if (hasSeenAnimationLocally("member_departure", event.id)) return false;
    const audience = getMemberDepartureAudienceUserIds(event);
    if (audience.length > 0 && !audience.includes(userId)) return false;
    return !getMemberDepartureSeenUserIds(event).includes(userId);
  }, [getMemberDepartureAudienceUserIds, getMemberDepartureSeenUserIds, hasSeenAnimationLocally]);

  const markMemberDepartureEventSeen = useCallback((eventId: string) => {
    if (!eventId || !user?.id) return;
    markAnimationSeenLocally("member_departure", eventId);

    let nextSnapshot: Group | null = null;
    setGroup((prev) => {
      if (!prev?.memberDepartureEvent || prev.memberDepartureEvent.id !== eventId) return prev;

      const seenSet = new Set(getMemberDepartureSeenUserIds(prev.memberDepartureEvent));
      if (seenSet.has(user.id)) return prev;
      seenSet.add(user.id);

      const audience = getMemberDepartureAudienceUserIds(prev.memberDepartureEvent);
      if (audience.length > 0 && audience.every((uid) => seenSet.has(uid))) {
        nextSnapshot = { ...prev, memberDepartureEvent: null };
        return nextSnapshot;
      }

      nextSnapshot = {
        ...prev,
        memberDepartureEvent: { ...prev.memberDepartureEvent, seenByUserIds: Array.from(seenSet) },
      };
      return nextSnapshot;
    });

    if (nextSnapshot && id) {
      const pruned = pruneGroupRetention(nextSnapshot);
      void (supabase as any)
        .from("squad_live_state")
        .upsert({ squad_id: id, state: serializeGroupState(pruned) }, { onConflict: "squad_id" });
    }
  }, [getMemberDepartureAudienceUserIds, getMemberDepartureSeenUserIds, id, markAnimationSeenLocally, user?.id]);

  // Auto-fail event helpers
  const getAutoFailSeenUserIds = useCallback((event: Group["lastAutoFailEvent"] | null | undefined): string[] =>
    Array.isArray(event?.seenByUserIds)
      ? event.seenByUserIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [], []);

  const getAutoFailAudienceUserIds = useCallback((event: Group["lastAutoFailEvent"] | null | undefined): string[] =>
    Array.isArray(event?.audienceUserIds)
      ? event.audienceUserIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [], []);

  const shouldPlayAutoFailForUser = useCallback((event: Group["lastAutoFailEvent"] | null | undefined, userId: string | null | undefined): boolean => {
    if (!event || !userId) return false;
    if (hasSeenAnimationLocally("auto_fail", event.id)) return false;
    const audience = getAutoFailAudienceUserIds(event);
    if (audience.length > 0 && !audience.includes(userId)) return false;
    return !getAutoFailSeenUserIds(event).includes(userId);
  }, [getAutoFailAudienceUserIds, getAutoFailSeenUserIds, hasSeenAnimationLocally]);

  const markAutoFailEventSeen = useCallback(() => {
    if (!user?.id) return;
    const currentEvent = groupRef.current?.lastAutoFailEvent;
    if (!currentEvent) return;
    markAnimationSeenLocally("auto_fail", currentEvent.id);

    let nextSnapshot: Group | null = null;
    setGroup((prev) => {
      if (!prev?.lastAutoFailEvent || prev.lastAutoFailEvent.id !== currentEvent.id) return prev;

      const seenSet = new Set(getAutoFailSeenUserIds(prev.lastAutoFailEvent));
      if (seenSet.has(user.id)) return prev;
      seenSet.add(user.id);

      const audience = getAutoFailAudienceUserIds(prev.lastAutoFailEvent);
      if (audience.length > 0 && audience.every((uid) => seenSet.has(uid))) {
        nextSnapshot = { ...prev, lastAutoFailEvent: null };
        return nextSnapshot;
      }

      nextSnapshot = {
        ...prev,
        lastAutoFailEvent: { ...prev.lastAutoFailEvent, seenByUserIds: Array.from(seenSet) },
      };
      return nextSnapshot;
    });

    if (nextSnapshot && id) {
      const pruned = pruneGroupRetention(nextSnapshot);
      void (supabase as any)
        .from("squad_live_state")
        .upsert({ squad_id: id, state: serializeGroupState(pruned) }, { onConflict: "squad_id" });
    }
  }, [getAutoFailAudienceUserIds, getAutoFailSeenUserIds, id, markAnimationSeenLocally, user?.id]);

  // Mark serve resolving
  const markServeResolving = useCallback((serveId: string) => {
    if (resolvingServeIdsRef.current.has(serveId)) return false;
    resolvingServeIdsRef.current.add(serveId);
    setResolvingServeIds((prev) => ({ ...prev, [serveId]: true }));
    return true;
  }, []);

  const clearServeResolving = useCallback((serveId: string) => {
    resolvingServeIdsRef.current.delete(serveId);
    setResolvingServeIds((prev) => {
      const next = { ...prev };
      delete next[serveId];
      return next;
    });
  }, []);

  // Fetch members
  const fetchMembers = useCallback(async (squadId: string) => {
    const { data: memberRows } = await supabase
      .from("squad_members")
      .select("user_id, is_captain, joined_at")
      .eq("squad_id", squadId);

    const memberUserIds = (memberRows || []).map((m) => m.user_id);
    const captainUserIds = (memberRows || []).filter((m) => m.is_captain).map((m) => m.user_id);

    const enlistDates: Record<string, Date> = {};
    (memberRows || []).forEach((m) => {
      enlistDates[m.user_id] = new Date(m.joined_at);
    });
    setMemberEnlistDates(enlistDates);

    let members: User[] = [];
    if (memberUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", memberUserIds);

      members = (profiles || []).map((p) => ({
        id: p.id,
        username: p.username,
        firstName: p.first_name,
        lastName: p.last_name,
        email: "",
        avatar: p.avatar,
        completedCommands: p.completed_commands,
        strikes: p.strikes,
        consecutiveFails: p.consecutive_fails,
        warnings: p.warnings,
        actionCredits: p.action_credits,
        superActionCredits: p.super_action_credits,
        lastSeenAt: p.last_seen_at,
      }));
    }

    return { members, captainUserIds };
  }, []);

  // Persist group state
  const persistGroupState = useCallback(async (nextGroup: Group) => {
    if (!id) return;

    const memberStatusById: Record<string, MemberStatus> = {
      ...(nextGroup.memberStatusById || {}),
    };
    nextGroup.members.forEach((m) => {
      memberStatusById[m.id] = {
        strikes: m.strikes,
        warnings: m.warnings,
        consecutiveFails: m.consecutiveFails,
        completedCommands: m.completedCommands,
      };
    });
    const groupToSerialize = { ...nextGroup, memberStatusById };

    const pruned = pruneGroupRetention(groupToSerialize);
    const { error } = await (supabase as any)
      .from("squad_live_state")
      .upsert({
        squad_id: id,
        state: serializeGroupState(pruned),
      }, { onConflict: "squad_id" });

    if (error) {
      console.error("Failed to persist squad state:", error);
    }
  }, [id]);

  // Refresh members from backend
  const refreshMembersFromBackend = useCallback(async () => {
    if (!id) return;
    const [{ members, captainUserIds }, squadResult] = await Promise.all([
      fetchMembers(id),
      supabase.from("squads").select("admin_id").eq("id", id).maybeSingle(),
    ]);

    if (user?.id && !members.some((m) => m.id === user.id)) {
      redirectCurrentUserAsEjected(groupRef.current?.name);
      return;
    }

    isApplyingRemoteUpdateRef.current = true;
    setGroup((prev) => {
      if (!prev) return prev;
      const nextCaptains = captainUserIds.length > 0 ? captainUserIds : prev.currentCardHolderIds;
      const maxCap = prev.captainCount ?? prev.maxCards ?? nextCaptains.length;
      const cappedCaptains = maxCap > 0 && nextCaptains.length > maxCap ? nextCaptains.slice(0, maxCap) : nextCaptains;
      const statusById = prev.memberStatusById || {};
      const prevMemberMap = new Map(prev.members.map(m => [m.id, m]));
      const prevMemberIds = new Set(prev.members.map(m => m.id));
      const membersWithStatus = members.map((m) => {
        const isReturning = !prevMemberIds.has(m.id);
        if (isReturning) {
          return { ...m, completedCommands: 0, strikes: 0, warnings: 0, consecutiveFails: 0 };
        }
        const scoped = statusById[m.id];
        const prevMember = prevMemberMap.get(m.id);
        return {
          ...m,
          completedCommands: scoped?.completedCommands ?? prevMember?.completedCommands ?? 0,
          strikes: scoped?.strikes ?? prevMember?.strikes ?? 0,
          warnings: scoped?.warnings ?? prevMember?.warnings ?? 0,
          consecutiveFails: scoped?.consecutiveFails ?? prevMember?.consecutiveFails ?? 0,
        };
      });
      const memberIds = new Set(membersWithStatus.map(m => m.id));
      const cleanedMemberStatus = Object.fromEntries(
        Object.entries(statusById).filter(([uid]) => memberIds.has(uid))
      );
      const syncedCaptainFailCounts = cappedCaptains.reduce<Record<string, number>>((acc, captainId) => {
        const wasCaptainBefore = prev.currentCardHolderIds.includes(captainId);
        acc[captainId] = wasCaptainBefore ? (prev.captainFailCounts?.[captainId] || 0) : 0;
        return acc;
      }, {});
      const prevStartDates = prev.captainStartDates || {};
      const syncedStartDates: Record<string, number> = {};
      cappedCaptains.forEach(captainId => {
        syncedStartDates[captainId] = prev.currentCardHolderIds.includes(captainId) 
          ? (prevStartDates[captainId] || Date.now()) 
          : Date.now();
      });
      return {
        ...prev,
        adminId: squadResult?.data?.admin_id ?? prev.adminId,
        members: membersWithStatus,
        memberStatusById: cleanedMemberStatus,
        captainFailCounts: syncedCaptainFailCounts,
        captainStartDates: syncedStartDates,
        currentCardHolderIds: cappedCaptains,
        currentCardHolderId: cappedCaptains[0] || prev.currentCardHolderId,
        gameStarted: membersWithStatus.length >= 4 ? prev.gameStarted : false,
        initialCaptainLotteryEvent: membersWithStatus.length >= 4 ? prev.initialCaptainLotteryEvent : null,
        activeServes: prev.activeServes.filter(s => memberIds.has(s.fromUserId) && memberIds.has(s.toUserId)),
        currentServe: prev.currentServe && memberIds.has(prev.currentServe.toUserId) ? prev.currentServe : null,
        activePolls: prev.activePolls.filter(p => memberIds.has(p.targetUserId)),
        activePoll: prev.activePoll && memberIds.has(prev.activePoll.targetUserId) ? prev.activePoll : null,
        exemptUserIds: (prev.exemptUserIds || []).filter(uid => memberIds.has(uid)),
      };
    });
  }, [fetchMembers, id, redirectCurrentUserAsEjected, user?.id]);

  // Handle update group
  const handleUpdateGroup = useCallback(async (updated: Group) => {
    const prevCaptainCount = group?.captainCount || 0;
    const newCaptainCount = updated.captainCount || 0;
    
    if (updated.theme !== group?.theme && user?.id && id) {
      setPersonalTheme(updated.theme || "default");
      void setUserSquadTheme(user.id, id, updated.theme || "default");
    }

    setGroup(prev => prev ? { ...prev, ...updated, theme: prev.theme } : updated);

    if (!id) return;

    const { error } = await supabase
      .from("squads")
      .update({
        name: updated.name,
        max_captains: updated.captainCount,
        is_open: updated.isOpen,
        poll_duration_hours: updated.pollDurationHours,
        punishment_duration_hours: updated.punishmentDurationHours,
        command_duration_hours: updated.commandDurationHours,
        captain_fail_limit: updated.captainFailLimit,
      } as any)
      .eq("id", id);

    if (error) {
      toast.error(`Failed to save squad settings: ${error.message}`);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["user-squads"] });

    if (newCaptainCount !== prevCaptainCount && isAdmin) {
      const currentCaptainIds = group?.currentCardHolderIds || [];
      const currentCaptainCount = currentCaptainIds.length;

      if (newCaptainCount > currentCaptainCount) {
        const slotsToAdd = newCaptainCount - currentCaptainCount;
        const nonCaptains = (group?.members || []).filter(m => !currentCaptainIds.includes(m.id));
        
        if (nonCaptains.length > 0) {
          const newCaptains: User[] = [];
          const available = [...nonCaptains];
          
          for (let i = 0; i < slotsToAdd && available.length > 0; i++) {
            const weighted = available.map(m => ({
              member: m,
              roll: Math.random() * (Math.max(1, m.completedCommands) + 1),
            })).sort((a, b) => b.roll - a.roll);
            const picked = weighted[0].member;
            newCaptains.push(picked);
            available.splice(available.indexOf(picked), 1);
          }

          const newCaptainIds = dedupeIds([...currentCaptainIds, ...newCaptains.map(c => c.id)]);

          await (supabase.rpc as any)("sync_squad_captains", {
            _squad_id: group?.id,
            _captain_ids: newCaptainIds,
          });

          for (const newCap of newCaptains) {
            const lotteryMsg: GroupMessage = {
              id: `m${Date.now()}_cap_${newCap.id}`,
              userId: group?.adminId || "",
              type: "action",
              content: `🎰 CAPTAIN LOTTERY! ${newCap.avatar} ${newCap.username} has been selected as a new Captain!`,
              mentions: (group?.members || []).map(m => m.id),
              createdAt: new Date(),
            };
            setGroup(prev => prev ? {
              ...prev,
              currentCardHolderIds: newCaptainIds,
              currentCardHolderId: newCaptainIds[0] || "",
              messages: [...prev.messages, lotteryMsg],
            } : prev);
          }

          if (newCaptains.length > 0 && group) {
            setCaptainLotteryContext({ type: "transfer", baseCaptainIds: currentCaptainIds });
            setCaptainLotteryMembers(nonCaptains);
            setCaptainLotteryWinner(newCaptains[0]);
            setShowCaptainLottery(true);
          }

          toast.success(`${newCaptains.length} new captain${newCaptains.length > 1 ? "s" : ""} added!`);
        }
      } else if (newCaptainCount < currentCaptainCount) {
        const slotsToRemove = currentCaptainCount - newCaptainCount;
        const removableCaptains = [...currentCaptainIds];
        const removedCaptainIds: string[] = [];

        for (let i = 0; i < slotsToRemove && removableCaptains.length > newCaptainCount; i++) {
          const idx = Math.floor(Math.random() * removableCaptains.length);
          removedCaptainIds.push(removableCaptains[idx]);
          removableCaptains.splice(idx, 1);
        }

        const remainingCaptainIds = currentCaptainIds.filter(cid => !removedCaptainIds.includes(cid));

        await (supabase.rpc as any)("sync_squad_captains", {
          _squad_id: group?.id,
          _captain_ids: remainingCaptainIds,
        });

        const cancelledServes = (group?.activeServes || []).filter(s =>
          removedCaptainIds.includes(s.fromUserId) && !s.completed && !s.failed
        );

        const messages: GroupMessage[] = [];
        for (const captainId of removedCaptainIds) {
          const captain = (group?.members || []).find(m => m.id === captainId);
          messages.push({
            id: `m${Date.now()}_demote_${captainId}`,
            userId: group?.adminId || "",
            type: "action",
            content: `⚓ ${captain?.avatar || "🧑"} ${captain?.username || "Captain"} has been removed as Captain by admin adjustment.${cancelledServes.some(s => s.fromUserId === captainId) ? " Active command cancelled!" : ""}`,
            mentions: (group?.members || []).map(m => m.id),
            createdAt: new Date(),
          });
        }

        setGroup(prev => prev ? {
          ...prev,
          currentCardHolderIds: remainingCaptainIds,
          currentCardHolderId: remainingCaptainIds[0] || "",
          activeServes: prev.activeServes.filter(s => !cancelledServes.some(cs => cs.id === s.id)),
          currentServe: prev.currentServe && cancelledServes.some(cs => cs.id === prev.currentServe?.id) ? null : prev.currentServe,
          messages: [...prev.messages, ...messages],
        } : prev);

        toast.success(`${removedCaptainIds.length} captain${removedCaptainIds.length > 1 ? "s" : ""} removed.`);
      }
    }
  }, [group, id, queryClient, user?.id]);

  // ============================================
  // ✅ ALL useEffect hooks - UNCONDITIONAL
  // ============================================

  // Keep groupRef in sync
  useEffect(() => { groupRef.current = group; }, [group]);

  // Tenure tick
  useEffect(() => {
    const interval = setInterval(() => setTenureTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  // Load personal theme from DB
  useEffect(() => {
    if (user?.id && id) {
      getUserSquadTheme(user.id, id).then(t => setPersonalTheme(t));
    }
  }, [user?.id, id]);

  // ShowLotteryAnim ref sync
  useEffect(() => {
    showLotteryAnimRef.current = showLotteryAnim;
  }, [showLotteryAnim]);

  // ShowCaptainLottery ref sync
  useEffect(() => {
    showCaptainLotteryRef.current = showCaptainLottery;
  }, [showCaptainLottery]);

  // ============================================
  // ✅ Load squad from backend - LARGE useEffect
  // ============================================
  useEffect(() => {
    if (!id || !user) return;

    const fetchSquad = async () => {
      setLoading(true);

      const { data: squad, error: squadError } = await supabase
        .from("squads")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (squadError || !squad) {
        setGroup(undefined);
        setLoading(false);
        return;
      }

      const { data: rotatedCaptains } = await (supabase.rpc as any)("rotate_inactive_captains", { _squad_id: id });

      const { members, captainUserIds } = await fetchMembers(id);

      const { data: liveStateRow } = await (supabase as any)
        .from("squad_live_state")
        .select("state")
        .eq("squad_id", id)
        .maybeSingle();

      let initialInviteCode = "";
      try {
       const { data: inviteRows, error: inviteErr } = await supabase
          .rpc('get_squad_invite_code', { _squad_id: id });

        if (!inviteErr && inviteRows && inviteRows.length > 0) {
          initialInviteCode = inviteRows[0]?.invite_code ?? "";
        }
      } catch { /* non-admin members cannot read; ignore */ }

      const defaultGroup: Group = {
        id: squad.id,
        name: squad.name,
        adminId: squad.admin_id,
        members,
        maxCards: squad.max_captains,
        isOpen: squad.is_open,
        inviteCode: initialInviteCode,
        captainCount: squad.max_captains,
        currentCardHolderIds: captainUserIds.length > 0 ? captainUserIds : [squad.admin_id],
        currentCardHolderId: captainUserIds[0] || squad.admin_id,
        currentServe: null,
        activeServes: [],
        serveHistory: [],
        messages: [],
        activePolls: [],
        activePoll: null,
        pollDurationHours: squad.poll_duration_hours,
        punishmentDurationHours: squad.punishment_duration_hours,
        commandDurationHours: squad.command_duration_hours,
        captainFailLimit: (squad as any).captain_fail_limit ?? 3,
        exemptUserIds: [],
        captainFailCounts: {},
        captainStartDates: captainUserIds.reduce<Record<string, number>>((acc, cid) => { acc[cid] = Date.now(); return acc; }, {}),
        memberStatusById: {},
        gameStarted: false,
      };

      const merged = applyPersistedGroupState(defaultGroup, liveStateRow?.state);

      const memberStatusById = merged.memberStatusById || {};
      const hasLiveState = !!liveStateRow?.state;
      const membersWithSquadStatus = members.map((member) => {
        const scoped = memberStatusById[member.id];
        if (hasLiveState && scoped) {
          return {
            ...member,
            completedCommands: scoped.completedCommands ?? 0,
            strikes: scoped.strikes ?? 0,
            warnings: scoped.warnings ?? 0,
            consecutiveFails: scoped.consecutiveFails ?? 0,
          };
        }
        return {
          ...member,
          completedCommands: 0,
          strikes: 0,
          warnings: 0,
          consecutiveFails: 0,
        };
      });

      const memberIds = new Set(membersWithSquadStatus.map((m) => m.id));
      const memberStrikeMap: Record<string, number> = {};
      membersWithSquadStatus.forEach((m) => { memberStrikeMap[m.id] = m.strikes; });
      const cleanedPolls = merged.activePolls.filter(p => memberIds.has(p.targetUserId) && (memberStrikeMap[p.targetUserId] ?? 0) >= 3);
      const cleanedServes = merged.activeServes.filter(s => memberIds.has(s.fromUserId) && memberIds.has(s.toUserId));
      const cleanedExempt = (merged.exemptUserIds || []).filter(uid => memberIds.has(uid));
      const cleanedStatus = Object.fromEntries(
        Object.entries(memberStatusById).filter(([memberId]) => memberIds.has(memberId))
      );

      const hydratedGroup = {
        ...merged,
        members: membersWithSquadStatus,
        memberStatusById: cleanedStatus,
        currentCardHolderIds: captainUserIds.length > 0 ? captainUserIds : merged.currentCardHolderIds,
        currentCardHolderId: (captainUserIds.length > 0 ? captainUserIds[0] : merged.currentCardHolderId) || squad.admin_id,
        activePolls: cleanedPolls,
        activePoll: cleanedPolls.length > 0 ? cleanedPolls[cleanedPolls.length - 1] : null,
        activeServes: cleanedServes,
        currentServe: merged.currentServe && memberIds.has(merged.currentServe.toUserId) ? merged.currentServe : null,
        exemptUserIds: cleanedExempt,
        gameStarted: membersWithSquadStatus.length >= 4 ? merged.gameStarted : false,
        initialCaptainLotteryEvent: membersWithSquadStatus.length >= 4 ? merged.initialCaptainLotteryEvent : null,
      };

      if (Array.isArray(rotatedCaptains) && rotatedCaptains.length > 0) {
        const first = rotatedCaptains[0];
        const oldCaptain = members.find((m) => m.id === first.old_captain_id);
        const newCaptain = members.find((m) => m.id === first.new_captain_id);

        if (oldCaptain && newCaptain) {
          setCaptainTransferNotice({
            title: "Captaincy Transferred",
            body: `${oldCaptain.username} lost The Captain title after 10 days of inactivity. ${newCaptain.username} has been promoted.`,
          });

          toast.warning(`Captaincy transferred: ${oldCaptain.username} → ${newCaptain.username}`);

          if (isNotificationEnabled('warnings')) {
            await sendPushNotification(
              oldCaptain.id,
              "Captain title lost",
              `You lost The Captain title after 10 days of inactivity in ${squad.name}.`
            );
            await notificationTriggers.triggerWarning(
              newCaptain.id,
              squad.name,
              `Promoted to Captain due to ${oldCaptain.username}'s inactivity`,
              undefined
            );
          }
        }
      }

      setGroup(hydratedGroup);
      setLoading(false);

      try {
        window.localStorage.setItem(`squad-join-time:${id}:${user.id}`, String(Date.now()));
      } catch { /* ignore */ }

      const candidateEvents = [
        hydratedGroup.lastCommandEvent
          ? { kind: "command" as const, timestamp: hydratedGroup.lastCommandEvent.timestamp, event: hydratedGroup.lastCommandEvent }
          : null,
        hydratedGroup.lastActionEvent
          ? { kind: "action" as const, timestamp: hydratedGroup.lastActionEvent.timestamp, event: hydratedGroup.lastActionEvent }
          : null,
        hydratedGroup.lastSuperActionEvent
          ? { kind: "super_action" as const, timestamp: hydratedGroup.lastSuperActionEvent.timestamp, event: hydratedGroup.lastSuperActionEvent }
          : null,
        hydratedGroup.lastAutoFailEvent
          ? { kind: "auto_fail" as const, timestamp: hydratedGroup.lastAutoFailEvent.timestamp, event: hydratedGroup.lastAutoFailEvent }
          : null,
        hydratedGroup.memberDepartureEvent
          ? { kind: "member_departure" as const, timestamp: hydratedGroup.memberDepartureEvent.timestamp, event: hydratedGroup.memberDepartureEvent }
          : null,
        hydratedGroup.captainDepartureLottery
          ? { kind: "departure_lottery" as const, timestamp: hydratedGroup.captainDepartureLottery.timestamp, event: hydratedGroup.captainDepartureLottery }
          : null,
        hydratedGroup.squadResetEvent
          ? { kind: "reset" as const, timestamp: hydratedGroup.squadResetEvent.timestamp, event: hydratedGroup.squadResetEvent }
          : null,
        hydratedGroup.initialCaptainLotteryEvent && !hydratedGroup.gameStarted
          ? { kind: "initial_lottery" as const, timestamp: hydratedGroup.initialCaptainLotteryEvent.timestamp, event: hydratedGroup.initialCaptainLotteryEvent }
          : null,
      ].filter(Boolean).sort((a, b) => (b!.timestamp || 0) - (a!.timestamp || 0));

      const latestUnseenEvent = candidateEvents.find((candidate) => {
        switch (candidate!.kind) {
          case "command":
            return shouldPlayCommandForUser(candidate!.event as Group["lastCommandEvent"], user.id);
          case "action":
            return shouldPlayActionForUser(candidate!.event as Group["lastActionEvent"], user.id);
          case "super_action":
            return shouldPlaySuperActionForUser(candidate!.event as Group["lastSuperActionEvent"], user.id);
          case "auto_fail":
            return shouldPlayAutoFailForUser(candidate!.event as Group["lastAutoFailEvent"], user.id);
          case "member_departure":
            return shouldPlayMemberDepartureForUser(candidate!.event as Group["memberDepartureEvent"], user.id);
          case "departure_lottery":
            return shouldPlayDepartureForUser(candidate!.event as Group["captainDepartureLottery"], user.id);
          case "reset":
            return shouldPlayResetForUser(candidate!.event as Group["squadResetEvent"], user.id);
          case "initial_lottery":
            return !hydratedGroup.gameStarted && shouldPlayInitialLotteryForUser(candidate!.event as Group["initialCaptainLotteryEvent"], user.id);
          default:
            return false;
        }
      });

      if (latestUnseenEvent?.kind === "departure_lottery") {
        const lottery = latestUnseenEvent.event as Group["captainDepartureLottery"];
        const lotteryKey = getDepartureLotteryEventKey(lottery);
        lastSeenDepartureLotteryRef.current = lottery.timestamp;
        const remainingMembers = hydratedGroup.members.filter((m: User) => m.id !== lottery.departedUserId);
        const winner = remainingMembers.find((m: User) => m.id === lottery.winnerId);
        if (winner && remainingMembers.length > 0 && lotteryKey) {
          startDepartureLottery(lotteryKey, remainingMembers, winner);
        }
      } else if (latestUnseenEvent?.kind === "initial_lottery" && !hydratedGroup.gameStarted) {
        const initialLotteryEvent = latestUnseenEvent.event as Group["initialCaptainLotteryEvent"];
        const initialEventKey = getInitialLotteryEventKey(initialLotteryEvent);
        const initialWinner = hydratedGroup.members.find((m: User) => m.id === initialLotteryEvent.winnerId);
        if (initialWinner && initialEventKey) {
          startInitialLottery(initialEventKey, hydratedGroup.members, initialWinner);
        }
      } else if (latestUnseenEvent?.kind === "reset") {
        const resetEvent = latestUnseenEvent.event as Group["squadResetEvent"];
        const resetTimestamp = Number(resetEvent.timestamp) || Date.now();
        const resetEventId = resetEvent.id || `legacy-${resetTimestamp}`;
        lastSeenResetEventRef.current = Math.max(lastSeenResetEventRef.current, resetTimestamp);
        const resetMembers = hydratedGroup.members.map((m: User) => ({
          ...m,
          completedCommands: 0,
          strikes: 0,
          warnings: 0,
          consecutiveFails: 0,
        }));
        const winner = resetMembers.find((m: User) => m.id === resetEvent.winnerId);
        if (winner) {
          setActiveResetEventId(resetEventId);
          setResetAnimMembers(resetMembers);
          setPendingResetLottery(
            !hydratedGroup.gameStarted && resetMembers.length >= 4
              ? { members: resetMembers, winner, shouldStartLottery: true }
              : null
          );
          setShowResetAnim(true);
        }
      } else if (latestUnseenEvent?.kind === "command") {
        const cmdEvent = latestUnseenEvent.event as Group["lastCommandEvent"];
        lastSeenCommandEventIdRef.current = cmdEvent.id;
        setCommandAnimEvent(cmdEvent);
        setShowCommandAnim(true);
      } else if (latestUnseenEvent?.kind === "action") {
        const actionEvent = latestUnseenEvent.event as Group["lastActionEvent"];
        lastSeenActionEventIdRef.current = actionEvent.id;
        setActionAnimEvent(actionEvent as ActionEvent);
        setShowActionAnim(true);
      } else if (latestUnseenEvent?.kind === "super_action") {
        const sae = latestUnseenEvent.event as Group["lastSuperActionEvent"];
        lastSeenSuperActionEventIdRef.current = sae.id;
        if (sae.action === "coup") {
          const oldCap = hydratedGroup.members.find((m: User) => m.id === sae.oldCaptainId);
          const newCap = hydratedGroup.members.find((m: User) => m.id === sae.actorId);
          if (oldCap && newCap) {
            setCoupOldCaptain(oldCap);
            setCoupNewCaptain(newCap);
            setShowCoupAnim(true);
          }
        } else if (sae.action === "rank_lottery") {
          const target = hydratedGroup.members.find((m: User) => m.id === sae.targetId);
          if (target && rankLotteryAnimEventIdRef.current !== sae.id && !showLotteryAnimRef.current) {
            rankLotteryAnimEventIdRef.current = sae.id;
            showLotteryAnimRef.current = true;
            setLotteryTarget(target);
            setShowLotteryAnim(true);
          }
        } else if (sae.action === "saboteur") {
          const target = hydratedGroup.members.find((m: User) => m.id === sae.targetId);
          if (target) { setSaboteurTarget(target); setShowSaboteurAnim(true); }
        }
      } else if (latestUnseenEvent?.kind === "member_departure") {
        const depEvent = latestUnseenEvent.event as Group["memberDepartureEvent"];
        activeMemberDepartureEventIdRef.current = depEvent.id;
        lastSeenDepartureEventIdRef.current = depEvent.id;
        setDepartureAnimData({ username: depEvent.username, avatar: depEvent.avatar, type: depEvent.type });
        setShowDepartureAnim(true);
      } else if (latestUnseenEvent?.kind === "auto_fail") {
        const autoFailEvent = latestUnseenEvent.event as Group["lastAutoFailEvent"];
        lastSeenAutoFailEventIdRef.current = autoFailEvent.id;
        setAutoFailAnim({ username: autoFailEvent.username, avatar: autoFailEvent.avatar });
        playAutoFailSound();
        setTimeout(() => playAutoFailStrikeSound(), 800);
        setTimeout(() => { setAutoFailAnim(null); markAutoFailEventSeen(); }, 4000);
      }

      if (hydratedGroup.lastCommandEvent) lastSeenCommandEventIdRef.current = hydratedGroup.lastCommandEvent.id;
      if (hydratedGroup.lastActionEvent) lastSeenActionEventIdRef.current = hydratedGroup.lastActionEvent.id;
      if (hydratedGroup.lastSuperActionEvent) lastSeenSuperActionEventIdRef.current = hydratedGroup.lastSuperActionEvent.id;
      if (hydratedGroup.lastAutoFailEvent) lastSeenAutoFailEventIdRef.current = hydratedGroup.lastAutoFailEvent.id;
      if (hydratedGroup.memberDepartureEvent) lastSeenDepartureEventIdRef.current = hydratedGroup.memberDepartureEvent.id;

      for (const candidate of candidateEvents) {
        if (candidate === latestUnseenEvent) continue;
        const c = candidate!;
        switch (c.kind) {
          case "command": markAnimationSeenLocally("command", (c.event as any).id); break;
          case "action": markAnimationSeenLocally("action", (c.event as any).id); break;
          case "super_action": markAnimationSeenLocally("super_action", (c.event as any).id); break;
          case "auto_fail": markAnimationSeenLocally("auto_fail", (c.event as any).id); break;
          case "member_departure": markAnimationSeenLocally("member_departure", (c.event as any).id); break;
          case "departure_lottery": {
            const key = getDepartureLotteryEventKey(c.event as any);
            if (key) markAnimationSeenLocally("departure_lottery", key);
            break;
          }
          case "reset": {
            const re = c.event as any;
            const reKey = re.id || `legacy-${re.timestamp}`;
            markAnimationSeenLocally("reset", reKey);
            break;
          }
          case "initial_lottery": {
            const ilKey = getInitialLotteryEventKey(c.event as any);
            if (ilKey) markAnimationSeenLocally("initial_lottery", ilKey);
            break;
          }
        }
      }

      await persistGroupState(hydratedGroup);
    };

    fetchSquad();
  }, [fetchMembers, getDepartureLotteryEventKey, getInitialLotteryEventKey, id, markAnimationSeenLocally, persistGroupState, shouldPlayActionForUser, shouldPlayAutoFailForUser, shouldPlayCommandForUser, shouldPlayDepartureForUser, shouldPlayInitialLotteryForUser, shouldPlayMemberDepartureForUser, shouldPlayResetForUser, shouldPlaySuperActionForUser, startDepartureLottery, startInitialLottery, user]);

  // Persist every local group state mutation
  useEffect(() => {
    if (!group || !id || loading) return;

    if (isApplyingRemoteUpdateRef.current) {
      isApplyingRemoteUpdateRef.current = false;
      return;
    }

    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }

    void persistGroupState(group);
  }, [group, id, loading, persistGroupState]);

  // ============================================
  // ✅ Realtime sync across users - LARGE useEffect
  // ============================================
  useEffect(() => {
    if (!id || !user) return;

    const channel = supabase
      .channel(`squad-sync:${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "squad_live_state", filter: `squad_id=eq.${id}` },
        (payload) => {
          const nextState = (payload.new as any)?.state;
          if (!nextState) return;

          const currentUserDepartureEvent = nextState.memberDepartureEvent;
          if (
            currentUserDepartureEvent &&
            currentUserDepartureEvent.userId === user.id &&
            currentUserDepartureEvent.type === "ejected"
          ) {
            const eventTimestamp = currentUserDepartureEvent.timestamp || 0;
            const joinTimeKey = `squad-join-time:${id}:${user.id}`;
            const joinTime = Number(window.localStorage.getItem(joinTimeKey) || "0");
            if (eventTimestamp > joinTime) {
              redirectCurrentUserAsEjected(groupRef.current?.name);
              return;
            }
          }

          if (nextState.lastCommandEvent && nextState.lastCommandEvent.id !== lastSeenCommandEventIdRef.current) {
            lastSeenCommandEventIdRef.current = nextState.lastCommandEvent.id;
            if (shouldPlayCommandForUser(nextState.lastCommandEvent, user?.id)) {
              if (nextState.lastCommandEvent.isLegendary) {
                setLegendaryEvent(nextState.lastCommandEvent);
                setShowLegendaryAnim(true);
              } else {
                setCommandAnimEvent(nextState.lastCommandEvent);
                setShowCommandAnim(true);
              }
            }
          }

          if (nextState.lastActionEvent && nextState.lastActionEvent.id !== lastSeenActionEventIdRef.current) {
            lastSeenActionEventIdRef.current = nextState.lastActionEvent.id;
            if (shouldPlayActionForUser(nextState.lastActionEvent, user?.id)) {
              setActionAnimEvent(nextState.lastActionEvent as ActionEvent);
              setShowActionAnim(true);
            }
          }

          if (nextState.lastSuperActionEvent && nextState.lastSuperActionEvent.id !== lastSeenSuperActionEventIdRef.current) {
            lastSeenSuperActionEventIdRef.current = nextState.lastSuperActionEvent.id;
            if (shouldPlaySuperActionForUser(nextState.lastSuperActionEvent, user?.id)) {
              markAnimationSeenLocally("super_action", nextState.lastSuperActionEvent.id);
              const currentGroup = groupRef.current;
              if (currentGroup) {
                const sae = nextState.lastSuperActionEvent;
                if (sae.action === "coup") {
                  const oldCap = currentGroup.members.find((m: User) => m.id === sae.oldCaptainId);
                  const newCap = currentGroup.members.find((m: User) => m.id === sae.actorId);
                  if (oldCap && newCap && !showCoupAnim) {
                    setCoupOldCaptain(oldCap);
                    setCoupNewCaptain(newCap);
                    setShowCoupAnim(true);
                  }
                } else if (sae.action === "rank_lottery") {
                  const target = currentGroup.members.find((m: User) => m.id === sae.targetId);
                  if (target && !showLotteryAnimRef.current && rankLotteryAnimEventIdRef.current !== sae.id) {
                    rankLotteryAnimEventIdRef.current = sae.id;
                    showLotteryAnimRef.current = true;
                    setLotteryTarget(target);
                    setShowLotteryAnim(true);
                  }
                } else if (sae.action === "saboteur") {
                  const target = currentGroup.members.find((m: User) => m.id === sae.targetId);
                  if (target && !showSaboteurAnim) {
                    setSaboteurTarget(target);
                    setShowSaboteurAnim(true);
                  }
                }
              }
            }
          }

          if (
            nextState.captainDepartureLottery &&
            shouldPlayDepartureForUser(nextState.captainDepartureLottery, user?.id)
          ) {
            const lottery = nextState.captainDepartureLottery;
            const lotteryKey = getDepartureLotteryEventKey(lottery);
            lastSeenDepartureLotteryRef.current = lottery.timestamp;
            const currentGroup = groupRef.current;

            if (currentGroup && lotteryKey) {
              const remainingMembers = currentGroup.members.filter(
                (m: User) => m.id !== lottery.departedUserId
              );
              const winner = remainingMembers.find((m: User) => m.id === lottery.winnerId);

              if (winner && remainingMembers.length > 0) {
                startDepartureLottery(lotteryKey, remainingMembers, winner);
              }
            }
          }
          const resetEvent = nextState.squadResetEvent;
          if (resetEvent && Number(resetEvent.timestamp) > lastSeenResetEventRef.current) {
            const resetTimestamp = Number(resetEvent.timestamp);
            const resetEventId = resetEvent.id || `legacy-${resetTimestamp}`;
            lastSeenResetEventRef.current = resetTimestamp;
            const currentGroup = groupRef.current;
            if (currentGroup && shouldPlayResetForUser(resetEvent, user?.id)) {
              const clearedMembers = currentGroup.members.map((m: User) => ({
                ...m,
                completedCommands: 0,
                strikes: 0,
                warnings: 0,
                consecutiveFails: 0,
              }));
              const winner = clearedMembers.find((m: User) => m.id === resetEvent.winnerId);
              if (winner) {
                setActiveResetEventId(resetEventId);
                setResetAnimMembers(clearedMembers);
                setPendingResetLottery(
                  !nextState.gameStarted && clearedMembers.length >= 4
                    ? { members: clearedMembers, winner, shouldStartLottery: true }
                    : null
                );
                setShowResetAnim(true);
              }
            }
          }

          const departureEvent = nextState.memberDepartureEvent;
          const hasDepartureAnim = departureEvent &&
            departureEvent.id !== lastSeenDepartureEventIdRef.current &&
            shouldPlayMemberDepartureForUser(departureEvent, user?.id);

          if (
            hasDepartureAnim &&
            departureEvent &&
            activeMemberDepartureEventIdRef.current !== departureEvent.id
          ) {
            activeMemberDepartureEventIdRef.current = departureEvent.id;
            lastSeenDepartureEventIdRef.current = departureEvent.id;
            setDepartureAnimData({
              username: departureEvent.username,
              avatar: departureEvent.avatar,
              type: departureEvent.type,
            });
            setShowDepartureAnim(true);
          }

          if (nextState.lastAutoFailEvent && nextState.lastAutoFailEvent.id !== lastSeenAutoFailEventIdRef.current) {
            lastSeenAutoFailEventIdRef.current = nextState.lastAutoFailEvent.id;
            if (shouldPlayAutoFailForUser(nextState.lastAutoFailEvent, user?.id)) {
              setAutoFailAnim({ username: nextState.lastAutoFailEvent.username, avatar: nextState.lastAutoFailEvent.avatar });
              playAutoFailSound();
              setTimeout(() => playAutoFailStrikeSound(), 800);
              setTimeout(() => { setAutoFailAnim(null); markAutoFailEventSeen(); }, 4000);
            }
          }

          isApplyingRemoteUpdateRef.current = true;
          setGroup((prev) => {
            if (!prev) return prev;
            const updated = applyPersistedGroupState(prev, nextState);
            const resolvingIds = resolvingServeIdsRef.current;
            if (resolvingIds.size > 0) {
              return {
                ...updated,
                activeServes: updated.activeServes.filter(s => !resolvingIds.has(s.id)),
                currentServe: updated.currentServe && resolvingIds.has(updated.currentServe.id) ? null : updated.currentServe,
              };
            }
            return updated;
          });
          void refreshMembersFromBackend();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "squads", filter: `id=eq.${id}` },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;

          isApplyingRemoteUpdateRef.current = true;
          setGroup((prev) => prev ? ({
            ...prev,
            name: row.name,
            adminId: row.admin_id ?? prev.adminId,
            maxCards: row.max_captains,
            captainCount: row.max_captains,
            isOpen: row.is_open,
            inviteCode: row.invite_code ?? prev.inviteCode,
            pollDurationHours: row.poll_duration_hours,
            punishmentDurationHours: row.punishment_duration_hours,
            commandDurationHours: row.command_duration_hours,
            captainFailLimit: row.captain_fail_limit ?? prev.captainFailLimit,
          }) : prev);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "squad_members", filter: `squad_id=eq.${id}` },
        async (payload) => {
          const newUserId = (payload.new as any)?.user_id;
          if (newUserId && newUserId !== user.id) {
            const { data: newProfile } = await supabase
              .from("profiles")
              .select("username, avatar")
              .eq("id", newUserId)
              .maybeSingle();
            if (newProfile) {
              const joinMsg: GroupMessage = {
                id: `m${Date.now()}`,
                userId: newUserId,
                type: "action",
                content: `🎖️ ${newProfile.avatar} ${newProfile.username} has joined the squadron! Welcome aboard, sailor.`,
                mentions: [],
                createdAt: new Date(),
              };
              let nextSnapshot: Group | null = null;
              setGroup((prev) => {
                if (!prev) return prev;
                const tenSecondsAgo = Date.now() - 10000;
                if (prev.messages.some(m => m.content.includes(`${newProfile.username} has joined the squadron`) && new Date(m.createdAt).getTime() > tenSecondsAgo)) return prev;
                const cleanedStatus = { ...prev.memberStatusById };
                delete cleanedStatus[newUserId];
                const updatedMembers = prev.members.map(m => 
                  m.id === newUserId 
                    ? { ...m, completedCommands: 0, strikes: 0, warnings: 0, consecutiveFails: 0 }
                    : m
                );
                nextSnapshot = { ...prev, members: updatedMembers, messages: [...prev.messages, joinMsg], memberStatusById: cleanedStatus };
                return nextSnapshot;
              });

              if (nextSnapshot && id) {
                const pruned = pruneGroupRetention(nextSnapshot);
                void (supabase as any)
                  .from("squad_live_state")
                  .upsert({ squad_id: id, state: serializeGroupState(pruned) }, { onConflict: "squad_id" });
              }

              if (isNotificationEnabled('newMembers')) {
                const { data: existingMembers } = await supabase
                  .from("squad_members")
                  .select("user_id")
                  .eq("squad_id", id)
                  .neq("user_id", newUserId);
                
                if (existingMembers && existingMembers.length > 0) {
                  for (const member of existingMembers) {
                    await notificationTriggers.triggerNewMember(
                      member.user_id,
                      newProfile.username,
                      id || "",
                      group?.name || "the squadron"
                    );
                  }
                }
              }
            }
          }
          void refreshMembersFromBackend();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "squad_members", filter: `squad_id=eq.${id}` },
        () => {
          void refreshMembersFromBackend();
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "squad_members", filter: `squad_id=eq.${id}` },
        (payload) => {
          const deletedUserId = (payload.old as any)?.user_id;
          if (deletedUserId && deletedUserId === user.id) {
            redirectCurrentUserAsEjected(groupRef.current?.name);
            return;
          }
          void refreshMembersFromBackend();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          const changedUserId = (payload.new as any)?.id;
          if (!changedUserId) return;

          skipPersistRef.current = true;
          setGroup((prev) => {
            if (!prev || !prev.members.some((m) => m.id === changedUserId)) return prev;
            const scopedStatus = prev.memberStatusById?.[changedUserId];
            return {
              ...prev,
              members: prev.members.map((m) => {
                if (m.id !== changedUserId) return m;
                return {
                  ...m,
                  username: (payload.new as any).username,
                  avatar: (payload.new as any).avatar,
                  completedCommands: scopedStatus?.completedCommands ?? (payload.new as any).completed_commands,
                  actionCredits: (payload.new as any).action_credits,
                  superActionCredits: (payload.new as any).super_action_credits,
                  lastSeenAt: (payload.new as any).last_seen_at,
                };
              }),
            };
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [getDepartureLotteryEventKey, id, markAnimationSeenLocally, refreshMembersFromBackend, redirectCurrentUserAsEjected, shouldPlayActionForUser, shouldPlayAutoFailForUser, shouldPlayCommandForUser, shouldPlayDepartureForUser, shouldPlayMemberDepartureForUser, shouldPlayResetForUser, shouldPlaySuperActionForUser, startDepartureLottery, user]);

  // Membership check
  useEffect(() => {
    if (!id || !user?.id) return;

    const checkMembership = async () => {
      if (selfLeaveInProgressRef.current) return;

      const { data, error } = await supabase
        .from("squad_members")
        .select("user_id")
        .eq("squad_id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) return;
      if (!data) {
        redirectCurrentUserAsEjected(groupRef.current?.name);
      }
    };

    void checkMembership();
    const intervalId = window.setInterval(() => {
      void checkMembership();
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [id, redirectCurrentUserAsEjected, user?.id]);

  // Fallback polling
  useEffect(() => {
    if (!id || !user || loading) return;
    let active = true;

    const poll = async () => {
      if (!active) return;
      const { data } = await (supabase as any)
        .from("squad_live_state")
        .select("state, updated_at")
        .eq("squad_id", id)
        .maybeSingle();

      if (!active || !data) return;
      if (data.updated_at === lastPolledUpdatedAtRef.current) return;
      lastPolledUpdatedAtRef.current = data.updated_at;

      const nextState = data.state;
      if (!nextState) return;

      isApplyingRemoteUpdateRef.current = true;
      setGroup((prev) => {
        if (!prev) return prev;
        const updated = applyPersistedGroupState(prev, nextState);
        const resolvingIds = resolvingServeIdsRef.current;
        if (resolvingIds.size > 0) {
          return {
            ...updated,
            activeServes: updated.activeServes.filter(s => !resolvingIds.has(s.id)),
            currentServe: updated.currentServe && resolvingIds.has(updated.currentServe.id) ? null : updated.currentServe,
          };
        }
        return updated;
      });
    };

    const intervalId = window.setInterval(poll, 3000);
    return () => { active = false; window.clearInterval(intervalId); };
  }, [id, user, loading]);

  // Mission fail notice
  useEffect(() => {
    if (!group) return;

    const latestFailMessage = [...group.messages]
      .reverse()
      .find((msg) => msg.type === "action" && msg.content.includes("FAILED the mission"));

    if (!latestFailMessage) return;
    if (latestMissionFailPopupIdRef.current === latestFailMessage.id) return;

    const ageMs = Date.now() - new Date(latestFailMessage.createdAt).getTime();
    if (ageMs > 15000) {
      latestMissionFailPopupIdRef.current = latestFailMessage.id;
      return;
    }

    latestMissionFailPopupIdRef.current = latestFailMessage.id;
    const failedUserId = latestFailMessage.mentions?.[0];
    const failedUser = failedUserId ? group.members.find((m) => m.id === failedUserId) : null;

    setMissionFailNotice({
      title: "Mission Failed",
      body: failedUser
        ? `${failedUser.username} failed the command. Strike recorded.`
        : "A command was failed. Strike recorded.",
    });
  }, [group]);

  // Mission fail notice timeout
  useEffect(() => {
    if (!missionFailNotice) return;
    const timeout = setTimeout(() => setMissionFailNotice(null), 2600);
    return () => clearTimeout(timeout);
  }, [missionFailNotice]);

  // Initial captain lottery
  useEffect(() => {
    if (!group || loading || !id) return;

    if (group.gameStarted) return;

    if (group.squadResetEvent && shouldPlayResetForUser(group.squadResetEvent, user?.id)) return;

    const initialEvent = group.initialCaptainLotteryEvent;
    if (initialEvent) {
      const initialEventKey = getInitialLotteryEventKey(initialEvent);
      const winner = group.members.find((m) => m.id === initialEvent.winnerId);
      if (winner && initialEventKey) {
        startInitialLottery(initialEventKey, group.members, winner);
      }
      return;
    }

    if (group.members.length >= 4) {
      let nextSnapshot: Group | null = null;

      setGroup((prev) => {
        if (!prev || prev.initialCaptainLotteryEvent || prev.gameStarted || prev.members.length < 4) return prev;
        const { event } = getDeterministicInitialLottery(prev.members, prev.id);
        nextSnapshot = { ...prev, initialCaptainLotteryEvent: event };
        return nextSnapshot;
      });

      if (nextSnapshot) {
        const pruned = pruneGroupRetention(nextSnapshot);
        void (supabase as any)
          .from("squad_live_state")
          .upsert({ squad_id: id, state: serializeGroupState(pruned) }, { onConflict: "squad_id" });
      }
    }
  }, [getInitialLotteryEventKey, group, id, loading, shouldPlayResetForUser, startInitialLottery, user?.id]);

  // Auto-fail expired commands
  useEffect(() => {
    if (!group || loading) return;
    const activeServes = group.activeServes.filter(s => !s.completed && !s.failed);
    if (activeServes.length === 0) return;

    const checkExpired = () => {
      const now = Date.now();
      setGroup((prev) => {
        if (!prev) return prev;
        const expired = prev.activeServes.filter(
          s => !s.completed && !s.failed && new Date(s.expiresAt).getTime() <= now && !resolvingServeIdsRef.current.has(s.id)
        );
        if (expired.length === 0) return prev;

        const newMessages: GroupMessage[] = [];
        let updatedMembers = [...prev.members];
        const updatedServes = prev.activeServes.filter(s => !expired.some(e => e.id === s.id));
        const updatedHistory = [...prev.serveHistory];
        let lastAutoFailEvent = prev.lastAutoFailEvent;

        const memberIds = prev.members.map(m => m.id);
        let updatedStatusById = { ...(prev.memberStatusById || {}) };

        for (const serve of expired) {
          const failedUser = prev.members.find(m => m.id === serve.toUserId);
          const newStrikes = Math.min((failedUser?.strikes ?? 0) + 1, 3);
          const newConsecFails = (failedUser?.consecutiveFails ?? 0) + 1;
          const autoDemoteCommands = newStrikes >= 3 && failedUser ? demoteOneRank(failedUser.completedCommands) : null;
          if (autoDemoteCommands !== null && serve.toUserId === user?.id && id) {
            clearLostMilestoneKeys(id, serve.toUserId, autoDemoteCommands);
          }
          updatedMembers = updatedMembers.map(m =>
            m.id === serve.toUserId
              ? { ...m, strikes: newStrikes, consecutiveFails: newConsecFails, ...(autoDemoteCommands !== null ? { completedCommands: autoDemoteCommands } : {}) }
              : m
          );
          updatedStatusById[serve.toUserId] = {
            ...(updatedStatusById[serve.toUserId] || { strikes: 0, warnings: 0, consecutiveFails: 0 }),
            strikes: newStrikes,
            consecutiveFails: newConsecFails,
            ...(autoDemoteCommands !== null ? { completedCommands: autoDemoteCommands } : {}),
          };
          newMessages.push({
            id: `m${Date.now()}_${serve.id}`,
            userId: prev.adminId,
            type: "action",
            content: `⏰ ${failedUser?.username || "Crew member"} ran out of time! Auto-failed. ❌ Strike added!`,
            mentions: [serve.toUserId],
            createdAt: new Date(),
          });
          updatedHistory.push({ ...serve, failed: true });

          const eventId = `autofail_${Date.now()}_${serve.id}`;
          lastAutoFailEvent = {
            id: eventId,
            userId: serve.toUserId,
            username: failedUser?.username || "Crew member",
            avatar: failedUser?.avatar || "🧑",
            timestamp: Date.now(),
            audienceUserIds: memberIds,
            seenByUserIds: [user?.id || ""],
          };

          lastSeenAutoFailEventIdRef.current = eventId;
          setAutoFailAnim({
            username: failedUser?.username || "Crew member",
            avatar: failedUser?.avatar || "🧑",
          });
          playAutoFailSound();
          setTimeout(() => {
            playAutoFailStrikeSound();
          }, 800);
          setTimeout(() => {
            setAutoFailAnim(null);
            markAutoFailEventSeen();
          }, 4000);

          void (supabase.rpc as any)("record_mission_failure", {
            _squad_id: prev.id,
            _target_user_id: serve.toUserId,
          });

          if (isNotificationEnabled('failedCommands')) {
            notificationTriggers.triggerFailedCommand(
              serve.fromUserId,
              failedUser?.username || "Crew member",
              serve.prompt
            );
          }
        }

        return {
          ...prev,
          members: updatedMembers,
          memberStatusById: updatedStatusById,
          activeServes: updatedServes,
          currentServe: prev.currentServe && expired.some(e => e.id === prev.currentServe?.id) ? null : prev.currentServe,
          serveHistory: updatedHistory,
          messages: [...prev.messages, ...newMessages],
          lastAutoFailEvent,
        };
      });
    };

    const interval = setInterval(checkExpired, 5000);
    checkExpired();
    return () => clearInterval(interval);
  }, [group?.activeServes?.length, id, loading, markAutoFailEventSeen, user?.id]);

  // Auto-fail punishment when deadline expires
  useEffect(() => {
    if (!group || loading) return;
    const pollsWithDeadline = group.activePolls.filter(
      p => p.punishmentDeadline && !p.punishmentCompleted && p.punishmentDeadline.getTime() > 0
    );
    if (pollsWithDeadline.length === 0) return;

    const checkPunishmentExpiry = () => {
      const now = Date.now();
      setGroup((prev) => {
        if (!prev) return prev;
        const expired = prev.activePolls.filter(
          p => p.punishmentDeadline && !p.punishmentCompleted && p.punishmentDeadline.getTime() <= now
        );
        if (expired.length === 0) return prev;

        let updatedMembers = [...prev.members];
        let updatedStatusById = { ...(prev.memberStatusById || {}) };
        const newMessages: GroupMessage[] = [];
        let remainingPolls = [...prev.activePolls];

        for (const poll of expired) {
          const targetId = poll.targetUserId;
          const member = prev.members.find(m => m.id === targetId);
          const currentWarnings = member?.warnings ?? 0;
          const newWarnings = Math.min(currentWarnings + 1, 3);

          updatedMembers = updatedMembers.map(m =>
            m.id === targetId ? { ...m, warnings: newWarnings, strikes: 0, consecutiveFails: 0 } : m
          );
          updatedStatusById[targetId] = {
            ...(updatedStatusById[targetId] || {}),
            strikes: 0,
            warnings: newWarnings,
            consecutiveFails: 0,
          };

          if (newWarnings >= 3) {
            newMessages.push({
              id: `m${Date.now()}_paf_${poll.id}`,
              userId: prev.adminId,
              type: "action",
              content: `⏰ ${member?.username || "Crew member"} ran out of time on their punishment! Auto-warning issued. 🚨 3 warnings reached — EJECTION triggered!`,
              mentions: [targetId],
              createdAt: new Date(),
            });
          } else {
            const remaining = 3 - newWarnings;
            newMessages.push({
              id: `m${Date.now()}_paf_${poll.id}`,
              userId: prev.adminId,
              type: "action",
              content: `⏰ ${member?.username || "Crew member"} ran out of time on their punishment! Auto-warning ${newWarnings}/3 issued. Strikes reset. ${remaining} more warning${remaining > 1 ? "s" : ""} until ejection!`,
              mentions: [targetId],
              createdAt: new Date(),
            });
          }

          remainingPolls = remainingPolls.filter(p => p.id !== poll.id);
          void supabase.rpc("apply_punishment_outcome", { _target_user_id: targetId, _squad_id: id, _new_warnings: newWarnings });
          
          if (isNotificationEnabled('warnings')) {
            const remaining = Math.max(0, 3 - newWarnings);
            notificationTriggers.triggerWarning(
              targetId,
              group?.name || "the squadron",
              `Auto-warning for failing punishment - ${newWarnings}/3`,
              undefined
            );
          }
        }

        return {
          ...prev,
          members: updatedMembers,
          memberStatusById: updatedStatusById,
          activePolls: remainingPolls,
          activePoll: prev.activePoll && expired.some(p => p.id === prev.activePoll?.id) ? null : prev.activePoll,
          messages: [...prev.messages, ...newMessages],
        };
      });
    };

    const interval = setInterval(checkPunishmentExpiry, 5000);
    checkPunishmentExpiry();
    return () => clearInterval(interval);
  }, [group?.activePolls?.length, group?.name, id, loading]);

  // Transition to punishment
  const handleTransitionToPunishment = useCallback((pollId: string) => {
    setGroup((prev) => {
      if (!prev) return prev;
      const poll = prev.activePolls.find(p => p.id === pollId);
      if (!poll || poll.punishmentDeadline || poll.punishmentCompleted) return prev;
      if (poll.expiresAt.getTime() > Date.now()) return prev;

      const voteCounts: Record<string, number> = {};
      poll.options.forEach((_, i) => { voteCounts[String(i)] = 0; });
      Object.entries(poll.votes).forEach(([voterId, vote]) => {
        if (voterId === poll.targetUserId) return;
        voteCounts[vote] = (voteCounts[vote] || 0) + 1;
      });
      const sorted = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
      const winningOption = sorted.length > 0 && sorted[0][1] > 0 ? sorted[0][0] : "0";

      const punishmentDeadline = new Date(Date.now() + prev.punishmentDurationHours * 3600000);

      const updatedPolls = prev.activePolls.map(p =>
        p.id === pollId ? { ...p, completed: true, winningOption, punishmentDeadline } : p
      );

      const target = prev.members.find(m => m.id === poll.targetUserId);
      const winningText = poll.options[Number(winningOption)] || "their punishment";
      const transitionMsg: GroupMessage = {
        id: `m${Date.now()}_pt`,
        userId: prev.adminId,
        type: "action",
        content: `⚖️ Voting closed! ${target?.username || "Crew member"} must now complete: "${winningText}" within ${prev.punishmentDurationHours}h`,
        mentions: [poll.targetUserId],
        createdAt: new Date(),
      };

      return {
        ...prev,
        activePolls: updatedPolls,
        activePoll: prev.activePoll?.id === pollId ? updatedPolls.find(p => p.id === pollId) || prev.activePoll : prev.activePoll,
        messages: [...prev.messages, transitionMsg],
      };
    });
  }, []);

  // ============================================
  // ✅ COMPUTED VALUES (after hooks, before conditional returns)
  // ============================================
  const profileUser = profileUserId ? group?.members.find(m => m.id === profileUserId) ?? null : null;
  const resolvedUserId = user?.id || profile?.id || "";
  const isSquadAdmin = !!resolvedUserId && resolvedUserId === group?.adminId;
  const mySquadCommands = group?.members.find(m => m.id === resolvedUserId)?.completedCommands ?? currentUser.completedCommands;
  const isViceAdmin = mySquadCommands >= 49;
  const isAdmin = isSquadAdmin || isViceAdmin;
  const gameActive = group?.members.length >= 4 && (group?.gameStarted || !!group?.initialCaptainLotteryEvent);
  const captains = group?.members.filter(m => group?.currentCardHolderIds.includes(m.id)) || [];
  const isCaptain = group?.currentCardHolderIds.includes(currentUser.id) || false;
  const membersNeedingPunishment = group?.members.filter(m => m.strikes >= 3) || [];
  const activeServeUserIds = group?.activeServes
    .filter(s => !s.completed && !s.failed)
    .map(s => s.toUserId) || [];
  const usersInPunishment = group?.activePolls.map(p => p.targetUserId) || [];
  const commandTargets = group?.members.filter(m =>
    m.id !== currentUser.id &&
    !group?.currentCardHolderIds.includes(m.id) &&
    !activeServeUserIds.includes(m.id) &&
    !(m.strikes >= 3 || usersInPunishment.includes(m.id)) &&
    !(group?.exemptUserIds || []).includes(m.id)
  ) || [];
  const currentUserHasActivePunishment = group?.activePolls.some(p => p.targetUserId === currentUser.id) || false;
  const themeStyle = getThemeStyle(personalTheme);
  const pageBgStyle = themeStyle["--theme-page-bg"]
    ? { ...themeStyle, background: themeStyle["--theme-page-bg"] } as React.CSSProperties
    : themeStyle as React.CSSProperties;

  // ============================================
  // ✅ HANDLER FUNCTIONS (defined here, after hooks, before returns)
  // ============================================

  const handleGroupNameTap = () => {
    const next = _ntc + 1;
    _setNtc(next);
    if (next >= 3) {
      _setNtc(0);
      _setShowArch(true);
    }
  };

  const handleServe = async (toUserId: string, prompt: string, durationHours: number, isCollateral?: boolean) => {
    if (!group) return;
    
    const legendaryRoll = Math.random();
    const isLegendary = legendaryRoll < 0.09;

    const newServe: ServeAction = {
      id: `s${Date.now()}`,
      fromUserId: currentUser.id,
      toUserId,
      prompt,
      completed: false,
      failed: false,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + durationHours * 3600000),
      durationHours,
      isLegendary,
    };
    const toUser = group.members.find(m => m.id === toUserId);
    const durationLabel = durationHours >= 1 ? `${durationHours}h` : `${durationHours * 60}m`;
    const collateralTag = isCollateral ? " 🎲 [COLLATERAL — randomly chosen]" : "";
    const legendaryTag = isLegendary ? " ✨ LEGENDARY COMMAND!" : "";
    const actionMsg: GroupMessage = {
      id: `m${Date.now()}`,
      userId: currentUser.id,
      type: "action",
      content: `${currentUser.username} COMMANDS ${toUser?.username} to: "${prompt}" [${durationLabel}]${collateralTag}${legendaryTag}`,
      mentions: [toUserId],
      createdAt: new Date(),
    };

    void (supabase.rpc as any)("record_captain_command", { _squad_id: group.id });
    trackStat(currentUser.id, "commands_issued");
    trackStat(toUserId, "commands_received");

    await sendNotificationIfEnabled('receivedCommands', async () => {
      return await notificationTriggers.triggerReceivedCommand(
        toUserId,
        currentUser.username,
        newServe.id
      );
    });

    const otherMembers = group.members
      .filter(m => m.id !== currentUser.id && m.id !== toUserId)
      .map(m => m.id);
    
    if (otherMembers.length > 0) {
      await sendNotificationIfEnabled('newCommands', async () => {
        return await notificationTriggers.triggerNewSquadCommand(
          group.id,
          group.name,
          currentUser.username,
          otherMembers
        );
      });
    }

    playSendCommandSound();
    toast(`⚡ Command issued to ${toUser?.username}!${isCollateral ? " (Collateral)" : ""}${isLegendary ? " ✨ LEGENDARY!" : ""}`, { duration: 3000 });

    const memberIds = group.members.map(m => m.id);

    if (isLegendary) {
      const legEvent = {
        id: `leg${Date.now()}`,
        captainId: currentUser.id,
        targetId: toUserId,
        prompt: isCollateral ? `${prompt} 🎲 [COLLATERAL]` : prompt,
        timestamp: Date.now(),
        audienceUserIds: memberIds,
        seenByUserIds: [currentUser.id],
        isLegendary: true,
      };
      setLegendaryEvent(legEvent);
      setShowLegendaryAnim(true);

      const legGroup = {
        ...group,
        currentServe: newServe,
        activeServes: [...group.activeServes, newServe],
        messages: [...group.messages, actionMsg],
        exemptUserIds: [],
        lastCommandEvent: legEvent,
      };
      skipPersistRef.current = true;
      setGroup(legGroup);
      void persistGroupState(legGroup);
    } else {
      const commandEvent: CommandEvent = {
        id: `cmd${Date.now()}`,
        captainId: currentUser.id,
        targetId: toUserId,
        prompt: isCollateral ? `${prompt} 🎲 [COLLATERAL]` : prompt,
        timestamp: Date.now(),
        audienceUserIds: memberIds,
        seenByUserIds: [currentUser.id],
      };
      setCommandAnimEvent(commandEvent);
      setShowCommandAnim(true);

      const cmdGroup = {
        ...group,
        currentServe: newServe,
        activeServes: [...group.activeServes, newServe],
        messages: [...group.messages, actionMsg],
        exemptUserIds: [],
        lastCommandEvent: commandEvent,
      };
      skipPersistRef.current = true;
      setGroup(cmdGroup);
      void persistGroupState(cmdGroup);
    }
    setShowServeModal(false);
  };

  const handleMissionSuccess = async (serveId: string) => {
    if (!group) return;
    if (!markServeResolving(serveId)) return;

    try {
      const serve = group.activeServes.find((s) => s.id === serveId && !s.completed && !s.failed)
        || groupRef.current?.activeServes.find((s) => s.id === serveId && !s.completed && !s.failed);
      if (!serve) { clearServeResolving(serveId); return; }

      if (serve.fromUserId !== currentUser.id || !group.currentCardHolderIds.includes(currentUser.id)) {
        toast.error("This mission is no longer assigned to your captain.");
        return;
      }

      const servedUserId = serve.toUserId;
      const servedUser = group.members.find((m) => m.id === servedUserId);

      const { data: missionData, error: missionError } = await (supabase.rpc as any)("record_mission_success", {
        _squad_id: group.id,
        _target_user_id: servedUserId,
      });

      if (missionError) {
        toast.error(`Couldn't confirm mission success: ${missionError.message}`);
        return;
      }

      const servedUserId2 = serve.toUserId;
      trackStat(servedUserId2, "commands_completed");
      trackHighestRank(servedUserId2, (servedUser?.completedCommands || 0) + 1);

      const prevCommands = servedUser?.completedCommands || 0;
      const isLegendaryServe = serve.isLegendary === true;
      const baseCompleted = Number((missionData?.[0] as any)?.completed_commands ?? prevCommands + 1);
      const completedCommands = isLegendaryServe ? baseCompleted + 1 : baseCompleted;
      if (isLegendaryServe) {
        void supabase.rpc("apply_legendary_bonus", { _target_user_id: servedUserId, _squad_id: id, _completed_commands: completedCommands });
      }
      const nextRank = getNextRank(prevCommands);
      const promoted = !!nextRank && completedCommands >= nextRank.commandsRequired;
      if (promoted) trackStat(servedUserId2, "total_promotions");
      
      const wasAdmiral = isAdmiral(prevCommands);
      const nowAdmiral = isAdmiral(completedCommands);
      if (!wasAdmiral && nowAdmiral && servedUser) {
        const commandsIssued = group.serveHistory.filter(s => s.fromUserId === servedUserId).length;
        const failedMissions = group.serveHistory.filter(s => s.toUserId === servedUserId && s.failed).length;
        const coupsCount = group.messages.filter(m => m.content.includes("COUP") && m.userId === servedUserId).length;
        setAdmiralAnnouncementData({
          username: servedUser.username,
          avatar: servedUser.avatar,
          completedCommands,
          failedMissions,
          commandsIssued,
          coupsPerformed: coupsCount,
        });
        setTimeout(() => setShowAdmiralAnnouncement(true), 2000);

        const admiralCommsMsg: GroupMessage = {
          id: `m${Date.now()}-admiral`,
          userId: servedUserId,
          type: "action",
          content: `👑 ${servedUser.username} has reached the rank of ADMIRAL! All hail! 👑`,
          mentions: group.members.map(m => m.id),
          createdAt: new Date(),
        };
        setGroup(prev => prev ? { ...prev, messages: [...prev.messages, admiralCommsMsg] } : prev);
      }

      const newCardHolderIds = dedupeIds([
        ...group.currentCardHolderIds.filter((captainId) => captainId !== serve.fromUserId),
        servedUserId,
      ]);

      await (supabase.rpc as any)("sync_squad_captains", {
        _squad_id: group.id,
        _captain_ids: newCardHolderIds,
      });

      await sendNotificationIfEnabled('receivedCommands', async () => {
        return await notificationTriggers.triggerReceivedCommand(
          serve.fromUserId,
          servedUser?.username || 'Someone',
          serveId
        );
      });

      const successContent = promoted
        ? `✅ ${servedUser?.username} completed the mission and is now The Captain! ${servedUser?.username} has been promoted to (${nextRank?.abbreviation})`
        : `✅ ${servedUser?.username} completed the mission and is now The Captain!`;

      const successMessage: GroupMessage = {
        id: `m${Date.now()}`,
        userId: serve.fromUserId,
        type: "action",
        content: successContent,
        mentions: [servedUserId],
        createdAt: new Date(),
      };

      playMissionSuccessSound();

      const nextGroup = (() => {
        const latestGroup = groupRef.current || group;
        if (!latestGroup) return latestGroup;
        const updatedMembers = latestGroup.members.map((member) =>
          member.id === servedUserId
            ? { ...member, completedCommands, consecutiveFails: 0 }
            : member
        );

        const prevStartDates = latestGroup.captainStartDates || {};
        const updatedStartDates: Record<string, number> = {};
        newCardHolderIds.forEach(cid => {
          updatedStartDates[cid] = latestGroup.currentCardHolderIds.includes(cid)
            ? (prevStartDates[cid] || Date.now())
            : Date.now();
        });

        return {
          ...latestGroup,
          members: updatedMembers,
          currentCardHolderIds: newCardHolderIds,
          currentCardHolderId: newCardHolderIds[0] || "",
          captainStartDates: updatedStartDates,
          currentServe: null,
          activeServes: latestGroup.activeServes.filter((s) => s.id !== serveId),
          serveHistory: [...latestGroup.serveHistory, { ...serve, completed: true }],
          messages: [...latestGroup.messages, successMessage],
        };
      })();

      skipPersistRef.current = true;
      setGroup(nextGroup);

      if (nextGroup) {
        await persistGroupState(nextGroup);
      }
    } finally {
      setTimeout(() => clearServeResolving(serveId), 3000);
    }
  };

  const handleMissionFailed = async (serveId: string) => {
    if (!group) return;
    if (!markServeResolving(serveId)) return;

    try {
      const serve = group.activeServes.find((s) => s.id === serveId && !s.completed && !s.failed)
        || groupRef.current?.activeServes.find((s) => s.id === serveId && !s.completed && !s.failed);
      if (!serve) { clearServeResolving(serveId); return; }

      if (serve.fromUserId !== currentUser.id || !group.currentCardHolderIds.includes(currentUser.id)) {
        toast.error("This mission is no longer assigned to your captain.");
        return;
      }

      const failedUserId = serve.toUserId;
      const failedUser = group.members.find((m) => m.id === failedUserId);

      const { data: failData, error: failError } = await (supabase.rpc as any)("record_mission_failure", {
        _squad_id: group.id,
        _target_user_id: failedUserId,
      });

      if (failError) {
        toast.error(`Couldn't record mission failure: ${failError.message}`);
        return;
      }

      const newStrikes = Math.min((failedUser?.strikes ?? 0) + 1, 3);
      const newConsecutiveFails = (failedUser?.consecutiveFails ?? 0) + 1;

      let demotedCommands: number | null = null;
      if (newStrikes >= 3 && failedUser) {
        demotedCommands = demoteOneRank(failedUser.completedCommands);
        void supabase.rpc("apply_demotion", { _target_user_id: failedUserId, _squad_id: id, _completed_commands: demotedCommands });
        if (failedUserId === user?.id && id) {
          clearLostMilestoneKeys(id, failedUserId, demotedCommands);
        }
      }

      trackStat(failedUserId, "commands_failed");
      trackStat(failedUserId, "total_strikes");
      if (demotedCommands !== null) trackStat(failedUserId, "total_demotions");

      playMissionFailedSound();
      toast.error(`${failedUser?.username || "Crew member"} failed the mission`, {
        description: `Strike ${Math.min(newStrikes, 3)}/3 recorded.`,
        duration: 3500,
      });

      const captainId = serve.fromUserId;
      const captainName = group.members.find((m) => m.id === captainId)?.username || "The Captain";
      const currentCaptainFails = (group.captainFailCounts?.[captainId] || 0) + 1;
      const failLimit = group.captainFailLimit ?? 3;
      const captainLostCommand = failLimit > 0 && currentCaptainFails >= failLimit;

      let nextCaptainIds = [...group.currentCardHolderIds];
      let transferLogMessage: GroupMessage | null = null;
      let transferCandidates: User[] = [];
      let transferBaseCaptainIds: string[] = [];

      const newCaptainFailCounts = { ...group.captainFailCounts, [captainId]: currentCaptainFails };

      if (captainLostCommand) {
        const lostCaptain = group.members.find((m) => m.id === captainId);
        transferBaseCaptainIds = dedupeIds(group.currentCardHolderIds.filter((cid) => cid !== captainId));
        nextCaptainIds = [...transferBaseCaptainIds];

        const pendingPunishmentIds = new Set(
          group.members
            .filter((m) => ((m.id === failedUserId ? newStrikes : m.strikes) >= 3))
            .map((m) => m.id)
        );
        const activePunishmentTargetIds = new Set(group.activePolls.map((poll) => poll.targetUserId));
        const shieldedIds = new Set(group.exemptUserIds || []);

        const activeCommandUserIds = new Set(
          group.activeServes.filter(s => !s.completed && !s.failed).map(s => s.toUserId)
        );

        const blockedIds = new Set<string>([
          captainId,
          ...group.currentCardHolderIds,
          ...pendingPunishmentIds,
          ...activePunishmentTargetIds,
          ...shieldedIds,
          ...activeCommandUserIds,
        ]);

        transferCandidates = group.members.filter((member) => !blockedIds.has(member.id));

        const transferIntroText = transferCandidates.length > 0
          ? `⚓ ${lostCaptain?.username} lost The Captain title after ${failLimit} failed command${failLimit > 1 ? "s" : ""}! Captain lottery incoming.`
          : `⚓ ${lostCaptain?.username} lost The Captain title after ${failLimit} failed command${failLimit > 1 ? "s" : ""}, but no eligible crew are available for lottery yet.`;

        transferLogMessage = {
          id: `m${Date.now() + 1}`,
          userId: group.adminId,
          type: "action",
          content: transferIntroText,
          mentions: [captainId, ...transferCandidates.map((candidate) => candidate.id)],
          createdAt: new Date(),
        };

        newCaptainFailCounts[captainId] = 0;

        void (supabase.rpc as any)("sync_squad_captains", {
          _squad_id: group.id,
          _captain_ids: nextCaptainIds,
        });
      }

      const failContent = captainLostCommand
        ? `🚫 ${failedUser?.username} FAILED the mission! ❌ Strike added!`
        : `🚫 ${failedUser?.username} FAILED the mission! ${captainName} retains command. ❌ Strike added!`;

      const failMsg: GroupMessage = {
        id: `m${Date.now()}`,
        userId: serve.fromUserId,
        type: "action",
        content: failContent,
        mentions: [failedUserId],
        createdAt: new Date(),
      };

      await sendNotificationIfEnabled('failedCommands', async () => {
        return await notificationTriggers.triggerFailedCommand(
          serve.toUserId,
          captainName,
          serve.prompt.substring(0, 30) + '...',
          serve.id
        );
      });

      const nextGroup = (() => {
        const latestGroup = groupRef.current || group;
        if (!latestGroup) return latestGroup;

        const updatedMembers = latestGroup.members.map((member) =>
          member.id === failedUserId
            ? {
                ...member,
                strikes: newStrikes,
                consecutiveFails: newConsecutiveFails,
                ...(demotedCommands !== null ? { completedCommands: demotedCommands } : {}),
              }
            : member
        );

        const updatedStatusById = { ...(latestGroup.memberStatusById || {}) };
        updatedStatusById[failedUserId] = {
          ...(updatedStatusById[failedUserId] || { strikes: 0, warnings: 0, consecutiveFails: 0 }),
          strikes: newStrikes,
          consecutiveFails: newConsecutiveFails,
          ...(demotedCommands !== null ? { completedCommands: demotedCommands } : {}),
        };

        return {
          ...latestGroup,
          members: updatedMembers,
          memberStatusById: updatedStatusById,
          currentCardHolderIds: nextCaptainIds,
          currentCardHolderId: nextCaptainIds[0] || "",
          currentServe: null,
          activeServes: latestGroup.activeServes.filter((s) => s.id !== serveId),
          serveHistory: [...latestGroup.serveHistory, { ...serve, completed: false, failed: true }],
          messages: transferLogMessage
            ? [...latestGroup.messages, failMsg, transferLogMessage]
            : [...latestGroup.messages, failMsg],
          exemptUserIds: dedupeIds([...(latestGroup.exemptUserIds || []), failedUserId]),
          captainFailCounts: newCaptainFailCounts,
          captainDepartureLottery: transferCandidates.length > 0 ? {
            winnerId: transferCandidates[Math.floor(Math.random() * transferCandidates.length)].id,
            departedUserId: captainId,
            timestamp: Date.now(),
            audienceUserIds: latestGroup.members.map((m: User) => m.id),
            seenByUserIds: [],
          } : latestGroup.captainDepartureLottery,
        };
      })();

      if (nextGroup?.captainDepartureLottery) {
        const winnerId = nextGroup.captainDepartureLottery.winnerId;
        nextGroup.currentCardHolderIds = dedupeIds([...nextCaptainIds, winnerId]);
        nextGroup.currentCardHolderId = nextGroup.currentCardHolderIds[0] || "";
      }

      skipPersistRef.current = true;
      setGroup(nextGroup);

      if (nextGroup) {
        if (nextGroup.captainDepartureLottery) {
          void (supabase.rpc as any)("sync_squad_captains", {
            _squad_id: group.id,
            _captain_ids: nextGroup.currentCardHolderIds,
          });
        }
        void persistGroupState(nextGroup);
      }

      setCaptainTransferNotice(null);
      setPendingCaptainTransferLottery(null);

      if (nextGroup?.captainDepartureLottery && transferCandidates.length > 0) {
        const lottery = nextGroup.captainDepartureLottery;
        const lotteryKey = getDepartureLotteryEventKey(lottery);
        const winner = transferCandidates.find(m => m.id === lottery.winnerId);
        const remainingMembers = nextGroup.members.filter(m => m.id !== lottery.departedUserId);
        if (winner && remainingMembers.length > 0 && lotteryKey) {
          startDepartureLottery(lotteryKey, remainingMembers, winner);
        }
      }

      void refreshMembersFromBackend();

      if (newStrikes >= 3 && isAdmin) {
        setPollTargetUserId(failedUserId);
        setTimeout(() => setShowCreatePoll(true), 500);
      }
    } finally {
      setTimeout(() => clearServeResolving(serveId), 3000);
    }
  };

  const handleCreatePoll = async (options: string[], pollDurationHours: number) => {
    if (!group || !pollTargetUserId) return;
    const poll: PunishmentPoll = {
      id: `poll${Date.now()}`,
      targetUserId: pollTargetUserId,
      options,
      votes: {},
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + pollDurationHours * 3600000),
      completed: false,
    };
    const pollMsg: GroupMessage = {
      id: `m${Date.now()}`,
      userId: group.adminId,
      type: "action",
      content: `⚖️ PUNISHMENT POLL published! ${group.members.find(m => m.id === pollTargetUserId)?.username} received 3 strikes and faces judgment. Cast your votes!`,
      mentions: group.members.map(m => m.id),
      createdAt: new Date(),
    };
    setGroup({
      ...group,
      activePolls: [...group.activePolls, poll],
      activePoll: poll,
      messages: [...group.messages, pollMsg],
    });
    setPollTargetUserId(null);
    
    await sendNotificationIfEnabled('polls', async () => {
      const memberIds = group.members.map(m => m.id);
      for (const memberId of memberIds) {
        if (memberId !== currentUser.id) {
          await notificationTriggers.triggerPollUpdate(
            memberId,
            group.id,
            group.name,
            poll.id
          );
        }
      }
      return true;
    });
  };

  const handlePollResult = useCallback(async (pollId: string) => {
    if (!group) return;
    const poll = group.activePolls.find(p => p.id === pollId);
    if (!poll) return;

    await sendNotificationIfEnabled('polls', async () => {
      const memberIds = group.members.map(m => m.id);
      for (const memberId of memberIds) {
        if (memberId !== currentUser.id) {
          await notificationTriggers.triggerPollResult(
            memberId,
            group.id,
            group.name,
            poll.id,
            poll.winningOption || 'Unknown'
          );
        }
      }
      return true;
    });
  }, [group, currentUser.id]);

  const handleVotePoll = (pollId: string, optionIndex: string) => {
    if (!group) return;
    const selectedPoll = group.activePolls.find((poll) => poll.id === pollId);
    if (!selectedPoll) return;

    if (selectedPoll.targetUserId === currentUser.id) {
      toast.error("You cannot vote on your own punishment poll.");
      return;
    }

    setGroup((prev) => {
      if (!prev) return prev;

      const updatedPolls = prev.activePolls.map((p) => {
        if (p.id !== pollId) return p;

        const sanitizedVotes = Object.fromEntries(
          Object.entries(p.votes).filter(([voterId]) => voterId !== p.targetUserId)
        );

        const newVotes = { ...sanitizedVotes, [currentUser.id]: optionIndex };
        let updatedPoll = { ...p, votes: newVotes };

        const eligibleVoterIds = prev.members
          .filter((m) => m.id !== p.targetUserId)
          .map((m) => m.id);

        const allVoted = eligibleVoterIds.length > 0 && eligibleVoterIds.every((uid) => uid in newVotes);

        if (allVoted) {
          const allVoteValues = eligibleVoterIds.map((uid) => newVotes[uid]);
          const isUnanimous = allVoteValues.every((v) => v === allVoteValues[0]);

          if (isUnanimous) {
            const threeMinFromNow = new Date(Date.now() + 3 * 60000);
            if (updatedPoll.expiresAt.getTime() > threeMinFromNow.getTime()) {
              updatedPoll = { ...updatedPoll, expiresAt: threeMinFromNow };
              toast("🗳️ Unanimous vote! Poll timer reduced to 3 minutes.", { duration: 4000 });
            }
          }
        }

        return updatedPoll;
      });

      const completedPoll = updatedPolls.find(p => p.id === pollId && p.completed);
      if (completedPoll) {
        handlePollResult(pollId);
      }

      return {
        ...prev,
        activePolls: updatedPolls,
        activePoll: prev.activePoll?.id === pollId
          ? updatedPolls.find((p) => p.id === pollId) || prev.activePoll
          : prev.activePoll,
      };
    });
  };

  const handleCompletePunishment = async (pollId: string) => {
    if (!group) return;
    const poll = group.activePolls.find(p => p.id === pollId);
    if (!poll) return;
    const targetId = poll.targetUserId;
    const updatedMembers = group.members.map(m => m.id === targetId ? { ...m, strikes: 0, consecutiveFails: 0 } : m);
    const doneMsg: GroupMessage = {
      id: `m${Date.now()}`,
      userId: group.adminId,
      type: "action",
      content: `🎉 ${group.members.find(m => m.id === targetId)?.username} completed their punishment! Strikes reset.`,
      mentions: [targetId],
      createdAt: new Date(),
    };
    await supabase.rpc("apply_punishment_outcome", { _target_user_id: targetId, _squad_id: id, _new_warnings: 0 });
    const updatedStatusById = { ...(group.memberStatusById || {}) };
    updatedStatusById[targetId] = {
      ...(updatedStatusById[targetId] || { warnings: 0 }),
      strikes: 0,
      consecutiveFails: 0,
    };
    setGroup({
      ...group,
      members: updatedMembers,
      memberStatusById: updatedStatusById,
      activePolls: group.activePolls.filter(p => p.id !== pollId),
      activePoll: group.activePoll?.id === pollId ? null : group.activePoll,
      messages: [...group.messages, doneMsg],
    });
    setTimeout(() => refreshMembersFromBackend(), 500);
  };

  const handleFailPunishment = async (pollId: string) => {
    if (!group) return;
    const poll = group.activePolls.find(p => p.id === pollId);
    if (!poll) return;
    const targetId = poll.targetUserId;
    const member = group.members.find(m => m.id === targetId);
    const newWarnings = Math.min((member?.warnings || 0) + 1, 3);

    if (newWarnings >= 3) {
      const ejectMsg: GroupMessage = {
        id: `m${Date.now()}`,
        userId: group.adminId,
        type: "action",
        content: `🚨 ${member?.username} has been EJECTED from the squadron. What a loser`,
        mentions: [],
        createdAt: new Date(),
      };

      const { data: liveMemberRows } = await supabase
        .from("squad_members")
        .select("user_id")
        .eq("squad_id", group.id);

      const liveAudienceUserIds = (liveMemberRows || [])
        .map((row) => row.user_id)
        .filter((memberId) => memberId !== targetId);
      const localAudienceUserIds = group.members
        .map((m) => m.id)
        .filter((memberId) => memberId !== targetId);
      const departureAudienceUserIds = dedupeIds([...liveAudienceUserIds, ...localAudienceUserIds]);

      await supabase.rpc("reset_member_profile_full", { _target_user_id: targetId, _squad_id: id });

      const wasCaptain = group.currentCardHolderIds.includes(targetId);
      let departureLotteryData: Group["captainDepartureLottery"] = null;
      let nextCaptainIds = group.currentCardHolderIds.filter((cid) => cid !== targetId);

      if (wasCaptain) {
        const remainingMembers = group.members.filter(m => m.id !== targetId);
        if (remainingMembers.length >= 4) {
          const activeCommandUserIds = new Set(
            group.activeServes.filter(s => !s.completed && !s.failed).map(s => s.toUserId)
          );
          const nextCaptainPool = remainingMembers.filter(
            (m) => !group.currentCardHolderIds.includes(m.id) && !activeCommandUserIds.has(m.id)
          );
          const weightedPick = nextCaptainPool
            .map((m) => ({ member: m, roll: Math.random() * (Math.max(1, m.completedCommands) + 1) }))
            .sort((a, b) => b.roll - a.roll)[0]?.member;

          if (weightedPick) {
            nextCaptainIds = nextCaptainIds.concat(weightedPick.id);
            await (supabase.rpc as any)("sync_squad_captains", {
              _squad_id: group.id,
              _captain_ids: nextCaptainIds,
            });

            const lotteryId = `cdl${Date.now()}`;
            departureLotteryData = {
              id: lotteryId,
              winnerId: weightedPick.id,
              departedUserId: targetId,
              timestamp: Date.now(),
              audienceUserIds: departureAudienceUserIds,
              seenByUserIds: [],
            };
            const lotteryKey = getDepartureLotteryEventKey(departureLotteryData);
            if (lotteryKey) {
              setPendingDepartureLottery({ eventKey: lotteryKey, members: remainingMembers, winner: weightedPick });
            }
          }
        }
      }

      const memberDepartureEventData: Group["memberDepartureEvent"] = {
        id: `dep${Date.now()}`,
        userId: targetId,
        username: member?.username || "Unknown",
        avatar: member?.avatar || "🧑",
        type: "ejected",
        timestamp: Date.now(),
        audienceUserIds: departureAudienceUserIds,
        seenByUserIds: [],
      };

      activeMemberDepartureEventIdRef.current = memberDepartureEventData.id;
      lastSeenDepartureEventIdRef.current = memberDepartureEventData.id;
      setDepartureAnimData({ username: member?.username || "Unknown", avatar: member?.avatar || "🧑", type: "ejected" });
      setShowDepartureAnim(true);

      const cleanedStatus = { ...(group.memberStatusById || {}) };
      delete cleanedStatus[targetId];

      toast.error(`${member?.username} has been EJECTED from the squad... Loser`, { duration: 8000 });

      const updatedGroup = {
        ...group,
        members: group.members.filter(m => m.id !== targetId),
        currentCardHolderIds: nextCaptainIds,
        currentCardHolderId: nextCaptainIds[0] || group.currentCardHolderId,
        activePolls: group.activePolls.filter(p => p.id !== pollId),
        activePoll: group.activePoll?.id === pollId ? null : group.activePoll,
        messages: [...group.messages, ejectMsg],
        captainDepartureLottery: departureLotteryData,
        memberDepartureEvent: memberDepartureEventData,
        memberStatusById: cleanedStatus,
      };

      setGroup(updatedGroup);
      await persistGroupState(updatedGroup);
      await supabase.from("squad_members").delete().eq("squad_id", group.id).eq("user_id", targetId);
    } else {
      const updatedMembers = group.members.map(m => m.id === targetId ? { ...m, warnings: newWarnings, strikes: 0, consecutiveFails: 0 } : m);
      const remaining = 3 - newWarnings;
      const warnMsg: GroupMessage = {
        id: `m${Date.now()}`,
        userId: group.adminId,
        type: "action",
        content: `⚠️ ${member?.username} failed their punishment! Warning ${newWarnings}/3 issued. ${remaining} more and they're out!`,
        mentions: [targetId],
        createdAt: new Date(),
      };
      await supabase.rpc("apply_punishment_outcome", { _target_user_id: targetId, _squad_id: id, _new_warnings: newWarnings });
      const updatedStatusById = { ...(group.memberStatusById || {}) };
      updatedStatusById[targetId] = {
        ...(updatedStatusById[targetId] || {}),
        strikes: 0,
        warnings: newWarnings,
        consecutiveFails: 0,
      };
      toast.warning(
        `Received ${newWarnings} WARNING${newWarnings > 1 ? "S" : ""}. ${remaining} more warning${remaining > 1 ? "s" : ""} will result in EJECTION from the squad`,
        { duration: 6000 }
      );
      
      await sendNotificationIfEnabled('warnings', async () => {
        return await notificationTriggers.triggerWarning(
          targetId,
          group.name,
          `Failed punishment - Warning ${newWarnings}/3`,
          undefined
        );
      });
      
      setGroup({
        ...group,
        members: updatedMembers,
        memberStatusById: updatedStatusById,
        activePolls: group.activePolls.filter(p => p.id !== pollId),
        activePoll: group.activePoll?.id === pollId ? null : group.activePoll,
        messages: [...group.messages, warnMsg],
      });
    }
    setTimeout(() => refreshMembersFromBackend(), 500);
  };

  const handleEjectMember = async (userId: string) => {
    if (!group) return;
    const ejected = group.members.find(m => m.id === userId);
    const ejectMsg: GroupMessage = {
      id: `m${Date.now()}`,
      userId: group.adminId,
      type: "action",
      content: `🚫 ${ejected?.username} has been EJECTED from the squadron. What a loser`,
      mentions: [],
      createdAt: new Date(),
    };

    const { data: liveMemberRows } = await supabase
      .from("squad_members")
      .select("user_id")
      .eq("squad_id", group.id);

    const liveAudienceUserIds = (liveMemberRows || [])
      .map((row) => row.user_id)
      .filter((memberId) => memberId !== userId);

    const localAudienceUserIds = group.members
      .map((member) => member.id)
      .filter((memberId) => memberId !== userId);

    const departureAudienceUserIds = dedupeIds([...liveAudienceUserIds, ...localAudienceUserIds]);

    await supabase.rpc("reset_member_profile_full", { _target_user_id: userId, _squad_id: id });

    const wasCaptain = group.currentCardHolderIds.includes(userId);
    let departureLotteryData: Group["captainDepartureLottery"] = null;
    let nextCaptainIdsAfterEject = group.currentCardHolderIds.filter((captainId) => captainId !== userId);

    if (wasCaptain) {
      const remainingMembers = group.members.filter(m => m.id !== userId);
      if (remainingMembers.length >= 4) {
        const activeCommandUserIds = new Set(
          group.activeServes.filter(s => !s.completed && !s.failed).map(s => s.toUserId)
        );
        const nextCaptainPool = remainingMembers.filter(
          (m) => !group.currentCardHolderIds.includes(m.id) && !activeCommandUserIds.has(m.id)
        );
        const weightedPick = nextCaptainPool
          .map((m) => ({ member: m, roll: Math.random() * (Math.max(1, m.completedCommands) + 1) }))
          .sort((a, b) => b.roll - a.roll)[0]?.member;

        if (weightedPick) {
          const nextCaptains = group.currentCardHolderIds
            .filter((captainId) => captainId !== userId)
            .concat(weightedPick.id);

          nextCaptainIdsAfterEject = nextCaptains;

          await (supabase.rpc as any)("sync_squad_captains", {
            _squad_id: group.id,
            _captain_ids: nextCaptains,
          });

          const lotteryId = `cdl${Date.now()}`;
          departureLotteryData = {
            id: lotteryId,
            winnerId: weightedPick.id,
            departedUserId: userId,
            timestamp: Date.now(),
            audienceUserIds: departureAudienceUserIds,
            seenByUserIds: [],
          };

          const lotteryKey = getDepartureLotteryEventKey(departureLotteryData);
          if (lotteryKey) {
            setPendingDepartureLottery({ eventKey: lotteryKey, members: remainingMembers, winner: weightedPick });
          }
        }
      }
    }

    const memberDepartureEventData: Group["memberDepartureEvent"] = {
      id: `dep${Date.now()}`,
      userId: userId,
      username: ejected?.username || "Unknown",
      avatar: ejected?.avatar || "🧑",
      type: "ejected",
      timestamp: Date.now(),
      audienceUserIds: departureAudienceUserIds,
      seenByUserIds: [],
    };

    activeMemberDepartureEventIdRef.current = memberDepartureEventData.id;
    lastSeenDepartureEventIdRef.current = memberDepartureEventData.id;
    setDepartureAnimData({ username: ejected?.username || "Unknown", avatar: ejected?.avatar || "🧑", type: "ejected" });
    setShowDepartureAnim(true);

    const cleanedStatus = { ...(group.memberStatusById || {}) };
    delete cleanedStatus[userId];

    const updatedGroup = {
      ...group,
      members: group.members.filter(m => m.id !== userId),
      currentCardHolderIds: nextCaptainIdsAfterEject,
      currentCardHolderId: nextCaptainIdsAfterEject[0] || "",
      activeServes: group.activeServes.filter(s => s.fromUserId !== userId && s.toUserId !== userId),
      messages: [...group.messages, ejectMsg],
      captainDepartureLottery: departureLotteryData,
      memberDepartureEvent: memberDepartureEventData,
      memberStatusById: cleanedStatus,
    };

    setGroup(updatedGroup);
    await persistGroupState(updatedGroup);

    const { error: removeMemberError } = await supabase
      .from("squad_members")
      .delete()
      .eq("squad_id", group.id)
      .eq("user_id", userId);

    if (removeMemberError) {
      toast.error(`Failed to eject member: ${removeMemberError.message}`);
      return;
    }

    void refreshMembersFromBackend();
  };

  const handleLeaveGroup = async () => {
    if (!user || !id || !group) return;
    selfLeaveInProgressRef.current = true;

    const { data: latestMemberRows } = await supabase
      .from("squad_members")
      .select("user_id")
      .eq("squad_id", id);

    const latestMemberIds = (latestMemberRows || []).map((m) => m.user_id);
    const remainingMemberIds = latestMemberIds.filter((memberId) => memberId !== user.id);

    const departureMsg: GroupMessage = {
      id: `m${Date.now()}`,
      userId: user.id,
      type: "action",
      content: `🏳️ ${currentUser.username} has abandoned the squadron. What a pleb`,
      mentions: [],
      createdAt: new Date(),
    };

    if (remainingMemberIds.length === 0) {
      await (supabase as any).from("squad_live_state").delete().eq("squad_id", id);
      await supabase.from("squad_members").delete().eq("squad_id", id);
      await supabase.from("squads").delete().eq("id", id);
      await queryClient.invalidateQueries({ queryKey: ["user-squads"] });
      toast.success("Squad disbanded — you were the last member.");
      navigate("/squads");
      return;
    }

    const wasCaptain = group.currentCardHolderIds.includes(currentUser.id);
    let departureLotteryData: Group["captainDepartureLottery"] = null;

    if (wasCaptain) {
      if (remainingMemberIds.length >= 4) {
        const activeCommandUserIds = new Set(
          group.activeServes.filter(s => !s.completed && !s.failed).map(s => s.toUserId)
        );
        const nextCaptainPool = group.members.filter(
          (m) => m.id !== currentUser.id && !group.currentCardHolderIds.includes(m.id) && !activeCommandUserIds.has(m.id)
        );
        const weightedPick = nextCaptainPool
          .map((m) => ({ member: m, roll: Math.random() * (Math.max(1, m.completedCommands) + 1) }))
          .sort((a, b) => b.roll - a.roll)[0]?.member;

        if (weightedPick) {
          const nextCaptains = group.currentCardHolderIds
            .filter((captainId) => captainId !== currentUser.id)
            .concat(weightedPick.id);

          await (supabase.rpc as any)("sync_squad_captains", {
            _squad_id: id,
            _captain_ids: nextCaptains,
          });

          const lotteryId = `cdl${Date.now()}`;
          departureLotteryData = {
            id: lotteryId,
            winnerId: weightedPick.id,
            departedUserId: currentUser.id,
            timestamp: Date.now(),
            audienceUserIds: group.members.map(m => m.id).filter(mid => mid !== currentUser.id),
            seenByUserIds: [],
          };
        }
      }
    }

    let adminTransferMsg: GroupMessage | null = null;
    if (group.adminId === currentUser.id) {
      const remainingMembers = group.members.filter((m) => remainingMemberIds.includes(m.id));
      const admiral = remainingMembers.find((m) => m.completedCommands >= 20);
      const newAdminId = admiral ? admiral.id : remainingMemberIds[Math.floor(Math.random() * remainingMemberIds.length)];
      const newAdmin = remainingMembers.find((m) => m.id === newAdminId);
      await (supabase.rpc as any)("transfer_squad_admin", { _squad_id: id, _new_admin_id: newAdminId });
      if (newAdmin) {
        adminTransferMsg = {
          id: `m${Date.now()}_admin`,
          userId: newAdminId,
          type: "action",
          content: `👑 ${currentUser.username} has left. ${newAdmin.avatar} ${newAdmin.username} is now the Admin!`,
          mentions: remainingMemberIds,
          createdAt: new Date(),
        };
      }
    }

    {
      const allMessages = [...group.messages, departureMsg];
      if (adminTransferMsg) allMessages.push(adminTransferMsg);
      const leavingId = user.id;

      const memberDepartureEventData: Group["memberDepartureEvent"] = {
        id: `dep${Date.now()}`,
        userId: leavingId,
        username: currentUser.username,
        avatar: currentUser.avatar,
        type: "left",
        timestamp: Date.now(),
        audienceUserIds: remainingMemberIds,
        seenByUserIds: [],
      };

      const updatedGroup = {
        ...group,
        members: group.members.filter(m => m.id !== leavingId),
        currentCardHolderIds: group.currentCardHolderIds.filter(cid => cid !== leavingId),
        activeServes: group.activeServes.filter(s => s.fromUserId !== leavingId && s.toUserId !== leavingId),
        currentServe: group.currentServe && (group.currentServe.fromUserId === leavingId || group.currentServe.toUserId === leavingId) ? null : group.currentServe,
        activePolls: group.activePolls.filter(p => p.targetUserId !== leavingId),
        activePoll: group.activePoll && group.activePoll.targetUserId === leavingId ? null : group.activePoll,
        exemptUserIds: (group.exemptUserIds || []).filter(uid => uid !== leavingId),
        messages: allMessages,
        captainDepartureLottery: departureLotteryData,
        memberDepartureEvent: memberDepartureEventData,
      };
      await persistGroupState(updatedGroup);
    }

    await supabase.rpc("reset_profile_for_squad_join");
    await supabase.from("squad_members").delete().eq("squad_id", id).eq("user_id", user.id);
    await queryClient.invalidateQueries({ queryKey: ["user-squads"] });
    toast.success("You left the squadron.");
    navigate("/squads");
  };

  const handlePromoteMember = async (userId: string) => {
    if (!group) return;
    if (rankActionLoading[userId]) return;

    const member = group.members.find((m) => m.id === userId);
    if (!member) return;

    const optimisticCount = member.completedCommands + 1;
    setRankActionLoading((prev) => ({ ...prev, [userId]: true }));

    setGroup((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        members: prev.members.map((m) =>
          m.id === userId ? { ...m, completedCommands: optimisticCount } : m
        ),
      };
    });

    const { data, error } = await (supabase.rpc as any)("adjust_member_rank", {
      _squad_id: group.id,
      _target_user_id: userId,
      _delta: 1,
    });

    if (error) {
      toast.error(`Promotion failed: ${error.message}`);
      await refreshMembersFromBackend();
      setRankActionLoading((prev) => ({ ...prev, [userId]: false }));
      return;
    }

    const resolvedCount = Number(
      (typeof data === "number" ? data : (Array.isArray(data) ? (data[0] as any)?.adjust_member_rank : (data as any)?.adjust_member_rank))
      ?? optimisticCount
    );
    const msg: GroupMessage = {
      id: `m${Date.now()}`,
      userId: currentUser.id,
      type: "action",
      content: `⬆️ ${member.avatar} ${member.username} was promoted!`,
      mentions: [userId],
      createdAt: new Date(),
    };

    playPromotionSound();
    setGroup((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        members: prev.members.map((m) =>
          m.id === userId ? { ...m, completedCommands: resolvedCount } : m
        ),
        messages: [...prev.messages, msg],
      };
    });

    setRankActionLoading((prev) => ({ ...prev, [userId]: false }));
    setGroup((prev) => { if (prev) void persistGroupState(prev); return prev; });
    void refreshMembersFromBackend();
  };

  const handleDemoteMember = async (userId: string) => {
    if (!group) return;
    if (rankActionLoading[userId]) return;

    const member = group.members.find((m) => m.id === userId);
    if (!member) return;

    const optimisticCount = Math.max(0, member.completedCommands - 1);
    setRankActionLoading((prev) => ({ ...prev, [userId]: true }));

    setGroup((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        members: prev.members.map((m) =>
          m.id === userId ? { ...m, completedCommands: optimisticCount } : m
        ),
      };
    });

    const { data, error } = await (supabase.rpc as any)("adjust_member_rank", {
      _squad_id: group.id,
      _target_user_id: userId,
      _delta: -1,
    });

    if (error) {
      toast.error(`Demotion failed: ${error.message}`);
      await refreshMembersFromBackend();
      setRankActionLoading((prev) => ({ ...prev, [userId]: false }));
      return;
    }

    const resolvedCount = Number(
      (typeof data === "number" ? data : (Array.isArray(data) ? (data[0] as any)?.adjust_member_rank : (data as any)?.adjust_member_rank))
      ?? optimisticCount
    );
    const msg: GroupMessage = {
      id: `m${Date.now()}`,
      userId: currentUser.id,
      type: "action",
      content: `⬇️ ${member.avatar} ${member.username} was demoted!`,
      mentions: [userId],
      createdAt: new Date(),
    };

    if (userId === user?.id && id) {
      clearLostMilestoneKeys(id, userId, resolvedCount);
    }
    playDemotionSound();
    setGroup((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        members: prev.members.map((m) =>
          m.id === userId ? { ...m, completedCommands: resolvedCount } : m
        ),
        messages: [...prev.messages, msg],
      };
    });

    setRankActionLoading((prev) => ({ ...prev, [userId]: false }));
    setGroup((prev) => { if (prev) void persistGroupState(prev); return prev; });
    void refreshMembersFromBackend();
  };

  const handleRemoveStrike = async (userId: string) => {
    if (!group) return;
    const member = group.members.find(m => m.id === userId);
    if (!member || member.strikes <= 0) return;
    const newStrikes = member.strikes - 1;
    const updatedMembers = group.members.map(m => m.id === userId ? { ...m, strikes: newStrikes } : m);
    const msg: GroupMessage = {
      id: `m${Date.now()}`,
      userId: currentUser.id,
      type: "action",
      content: `❎ ${member.username} had a strike removed by ${currentUser.username}. Now at ${newStrikes} strike${newStrikes !== 1 ? "s" : ""}.`,
      mentions: [userId],
      createdAt: new Date(),
    };
    await supabase.rpc("set_member_strikes", { _target_user_id: userId, _squad_id: id, _strikes: newStrikes });
    setGroup({ ...group, members: updatedMembers, messages: [...group.messages, msg] });
    setTimeout(() => refreshMembersFromBackend(), 300);
  };

  const handleSendMessage = async (content: string, mentions: string[], replyTo?: import("@/lib/mockData").ReplyContext) => {
    if (!group) return;
    const msg: GroupMessage = {
      id: `m${Date.now()}`,
      userId: currentUser.id,
      type: "comment",
      content,
      mentions,
      createdAt: new Date(),
      ...(replyTo ? { replyTo } : {}),
    };

    const isCrewPing = content.match(/@crew\b/i);
    const memberIds = group.members.map(m => m.id);
    let crewPingEvent = group.crewPingEvent || null;

    if (isCrewPing) {
      const crewMessage = content.replace(/@crew\b/i, "").trim();
      crewPingEvent = {
        id: `crew_${Date.now()}`,
        fromUserId: currentUser.id,
        fromUsername: currentUser.username,
        fromAvatar: currentUser.avatar,
        message: crewMessage || "📢 Crew ping!",
        timestamp: Date.now(),
        audienceUserIds: memberIds.filter(mid => mid !== currentUser.id),
        seenByUserIds: [],
      };
    }

    setGroup({ ...group, messages: [...group.messages, msg], crewPingEvent });

    const plainText = content.replace(/!\[(?:gif|photo\|\d+)\]\(.+?\)/g, "").trim();
    const preview = plainText.length > 60 ? plainText.slice(0, 57) + "..." : plainText;

    const recipients = group.members
      .filter(m => m.id !== currentUser.id)
      .map(m => m.id);
    
    if (isNotificationEnabled('newMessages')) {
      for (const recipientId of recipients) {
        if (mentions.includes(recipientId)) {
          await sendNotificationIfEnabled('mentions', async () => {
            return await notificationTriggers.triggerMention(
              recipientId,
              currentUser.username,
              group.id,
              group.name
            );
          });
        } else {
          await sendNotificationIfEnabled('newMessages', async () => {
            return await notificationTriggers.triggerNewMessage(
              recipientId,
              currentUser.username,
              group.id,
              plainText
            );
          });
        }
      }
    }

    if (replyTo) {
      const recipientIds = new Set<string>();
      if (replyTo.kind === "command" && replyTo.commandUserIds?.length) {
        replyTo.commandUserIds.forEach((id) => recipientIds.add(id));
      } else {
        recipientIds.add(replyTo.authorId);
      }
      recipientIds.forEach((rid) => {
        if (rid === currentUser.id) return;
        if (mentions.includes(rid)) return;
        if (isNotificationEnabled('mentions')) {
          notificationTriggers.triggerMention(
            rid,
            currentUser.username,
            group.id,
            group.name
          );
        }
      });
    }
  };

  const handleActionPress = (serveId: string) => {
    if (currentUserHasActivePunishment) {
      toast.error("⚠️ Cannot use actions whilst you have an active punishment.", { duration: 4000 });
      return;
    }
    playActionButtonSound();
    setActionServeId(serveId);
    if (DEV_UNLIMITED_ACTION_CREDITS || currentUser.actionCredits > 0) {
      setShowActionSelector(true);
    } else {
      setShowShop(true);
    }
  };

  const handleSuperActionPress = () => {
    if (currentUserHasActivePunishment) {
      toast.error("⚠️ Cannot use super actions whilst you have an active punishment.", { duration: 4000 });
      return;
    }
    playActionButtonSound();
    if (DEV_UNLIMITED_SUPER_CREDITS || currentUser.superActionCredits > 0) {
      setShowSuperActionSelector(true);
    } else {
      setShowShop(true);
    }
  };

  const handleSelectAction = async (action: ActionType) => {
    if (!group || !actionServeId || actionInProgressRef.current) return;
    actionInProgressRef.current = true;
    const serve = group.activeServes.find(s => s.id === actionServeId);
    if (!serve) { actionInProgressRef.current = false; return; }

    setShowActionSelector(false);

    const memberIds = group.members.map(m => m.id);
    const createActionEvent = (targetId?: string): ActionEvent => ({
      id: `ae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      action,
      actorId: currentUser.id,
      targetId,
      timestamp: Date.now(),
    });
    const createActionEventWithSeen = (targetId?: string) => {
      const event = createActionEvent(targetId);
      return { ...event, audienceUserIds: memberIds, seenByUserIds: [currentUser.id] };
    };

    let targetUserId: string | undefined;

    if (action === "shield") {
      const deductActionCredit = async () => {
        if (DEV_UNLIMITED_ACTION_CREDITS) return;
        await supabase.rpc("spend_action_credits_v2", { _amount: 1 });
        refreshProfile();
      };
      await deductActionCredit();
      trackStat(currentUser.id, "shield_uses");
      trackStat(currentUser.id, "total_action_credits_used");
      const event = createActionEventWithSeen(currentUser.id);
      lastSeenActionEventIdRef.current = event.id;

      const blockedServe = group.activeServes.find(s => s.id === actionServeId);
      const captainId = blockedServe?.fromUserId;
      const captainName = captainId ? group.members.find(m => m.id === captainId)?.username || "The Captain" : "The Captain";
      const currentCaptainFails = captainId ? (group.captainFailCounts?.[captainId] || 0) + 1 : 0;
      const failLimit = group.captainFailLimit ?? 3;
      const captainLostCommand = captainId && failLimit > 0 && currentCaptainFails >= failLimit;

      let newCaptainFailCounts = { ...group.captainFailCounts };
      if (captainId) newCaptainFailCounts[captainId] = currentCaptainFails;

      let nextCaptainIds = [...group.currentCardHolderIds];
      let transferCandidates: User[] = [];
      let transferBaseCaptainIds: string[] = [];
      let transferLogMessage: GroupMessage | null = null;

      if (captainLostCommand && captainId) {
        const lostCaptain = group.members.find(m => m.id === captainId);
        transferBaseCaptainIds = dedupeIds(group.currentCardHolderIds.filter(cid => cid !== captainId));
        nextCaptainIds = [...transferBaseCaptainIds];

        const pendingPunishmentIds = new Set(group.members.filter(m => m.strikes >= 3).map(m => m.id));
        const activePunishmentTargetIds = new Set(group.activePolls.map(poll => poll.targetUserId));
        const shieldedIds = new Set(group.exemptUserIds || []);
        const activeCommandUserIds = new Set(
          group.activeServes.filter(s => !s.completed && !s.failed && s.id !== actionServeId).map(s => s.toUserId)
        );
        const blockedIds = new Set<string>([captainId, ...group.currentCardHolderIds, ...pendingPunishmentIds, ...activePunishmentTargetIds, ...shieldedIds, ...activeCommandUserIds]);
        transferCandidates = group.members.filter(member => !blockedIds.has(member.id));

        newCaptainFailCounts[captainId] = 0;

        void (supabase.rpc as any)("sync_squad_captains", { _squad_id: group.id, _captain_ids: nextCaptainIds });

        transferLogMessage = {
          id: `m${Date.now() + 1}`,
          userId: group.adminId,
          type: "action",
          content: transferCandidates.length > 0
            ? `⚓ ${lostCaptain?.username} lost The Captain title after ${failLimit} failed command${failLimit > 1 ? "s" : ""}! Captain lottery incoming.`
            : `⚓ ${lostCaptain?.username} lost The Captain title after ${failLimit} failed command${failLimit > 1 ? "s" : ""}, but no eligible crew are available for lottery yet.`,
          mentions: [captainId, ...transferCandidates.map(c => c.id)],
          createdAt: new Date(),
        };
      }

      const msg: GroupMessage = {
        id: `m${Date.now()}`,
        userId: currentUser.id,
        type: "action",
        content: `🛡️ ${currentUser.avatar} ${currentUser.username} used SHIELD! Command blocked. No strike applied. Immune until next command is issued to someone else.${captainId ? ` Captain fail recorded for ${captainName}.` : ""}`,
        mentions: [],
        createdAt: new Date(),
      };
      setActionAnimEvent(event);
      setShowActionAnim(true);

      const allMessages = transferLogMessage ? [...group.messages, msg, transferLogMessage] : [...group.messages, msg];

      const departureLotteryData = captainLostCommand && captainId && transferCandidates.length > 0 ? {
        winnerId: transferCandidates[Math.floor(Math.random() * transferCandidates.length)].id,
        departedUserId: captainId,
        timestamp: Date.now(),
        audienceUserIds: group.members.map((m: User) => m.id),
        seenByUserIds: [] as string[],
      } : null;

      const immediateCaptainIds = departureLotteryData
        ? dedupeIds([...nextCaptainIds, departureLotteryData.winnerId])
        : nextCaptainIds;

      const nextGroup = {
        ...group,
        activeServes: group.activeServes.filter(s => s.id !== actionServeId),
        currentServe: group.currentServe?.id === actionServeId ? null : group.currentServe,
        messages: allMessages,
        exemptUserIds: [...(group.exemptUserIds || []), currentUser.id],
        lastActionEvent: event,
        captainFailCounts: newCaptainFailCounts,
        currentCardHolderIds: immediateCaptainIds,
        currentCardHolderId: immediateCaptainIds[0] || group.currentCardHolderId,
        captainDepartureLottery: departureLotteryData || group.captainDepartureLottery,
      };

      setGroup(nextGroup);

      if (departureLotteryData) {
        void (supabase.rpc as any)("sync_squad_captains", {
          _squad_id: group.id,
          _captain_ids: immediateCaptainIds,
        });
      }

      setCaptainTransferNotice(null);
      setPendingCaptainTransferLottery(null);
      actionInProgressRef.current = false;
    } else if (action === "friendly_fire") {
      const actorCommands = group.members.find((member) => member.id === currentUser.id)?.completedCommands ?? currentUser.completedCommands;
      const myRank = getRank(actorCommands);
      const activeServeUserIds = new Set(group.activeServes.filter((s) => !s.completed && !s.failed).map((s) => s.toUserId));
      const punishmentTargetIds = new Set(group.activePolls.map((poll) => poll.targetUserId));
      const exemptIds = new Set(group.exemptUserIds || []);
      const eligibleMembers = group.members.filter((member) => {
        if (member.id === currentUser.id) return false;
        if (group.currentCardHolderIds.includes(member.id)) return false;
        if (activeServeUserIds.has(member.id)) return false;
        if (punishmentTargetIds.has(member.id) || member.strikes >= 3) return false;
        if (exemptIds.has(member.id)) return false;
        return getRank(member.completedCommands).commandsRequired <= myRank.commandsRequired;
      });
      if (eligibleMembers.length === 0) {
        toast.error("No crew members at your rank or below to forward to!");
        actionInProgressRef.current = false; return;
      }
      const deductActionCredit = async () => {
        if (DEV_UNLIMITED_ACTION_CREDITS) return;
        await supabase.rpc("spend_action_credits_v2", { _amount: 1 });
        refreshProfile();
      };
      await deductActionCredit();
      trackStat(currentUser.id, "friendly_fire_uses");
      trackStat(currentUser.id, "total_action_credits_used");
      const target = eligibleMembers[Math.floor(Math.random() * eligibleMembers.length)];
      targetUserId = target.id;
      const event = createActionEventWithSeen(target.id);
      lastSeenActionEventIdRef.current = event.id;
      const msg: GroupMessage = {
        id: `m${Date.now()}`,
        userId: currentUser.id,
        type: "action",
        content: `🔄 ${currentUser.avatar} ${currentUser.username} used FRIENDLY FIRE! Command forwarded to ${target.avatar} ${target.username}!`,
        mentions: [target.id],
        createdAt: new Date(),
      };
      setActionAnimEvent(event);
      setShowActionAnim(true);
      setGroup({
        ...group,
        activeServes: group.activeServes.map(s => s.id === actionServeId ? { ...s, toUserId: target.id } : s),
        messages: [...group.messages, msg],
        lastActionEvent: event,
      });
      
      if (targetUserId && targetUserId !== currentUser.id) {
        await sendNotificationIfEnabled('actionCreditsAgainstYou', async () => {
          return await notificationTriggers.triggerActionUsed(
            targetUserId,
            currentUser.username,
            action
          );
        });
      }
      
      actionInProgressRef.current = false;
    } else if (action === "power_trip") {
      const actorCommands = group.members.find((member) => member.id === currentUser.id)?.completedCommands ?? currentUser.completedCommands;
      const myRank = getRank(actorCommands);
      const activeServeUserIds = new Set(group.activeServes.filter((s) => !s.completed && !s.failed).map((s) => s.toUserId));
      const punishmentTargetIds = new Set(group.activePolls.map((poll) => poll.targetUserId));
      const exemptIds = new Set(group.exemptUserIds || []);
      const eligibleMembers = group.members.filter((member) => {
        if (member.id === currentUser.id) return false;
        if (group.currentCardHolderIds.includes(member.id)) return false;
        if (activeServeUserIds.has(member.id)) return false;
        if (punishmentTargetIds.has(member.id) || member.strikes >= 3) return false;
        if (exemptIds.has(member.id)) return false;
        return getRank(member.completedCommands).commandsRequired <= myRank.commandsRequired;
      });
      const lowest = [...eligibleMembers].sort((a, b) => a.completedCommands - b.completedCommands)[0];
      if (!lowest) {
        toast.error("No crew members at your rank or below to forward to!");
        actionInProgressRef.current = false; return;
      }
      const deductActionCredit = async () => {
        if (DEV_UNLIMITED_ACTION_CREDITS) return;
        await supabase.rpc("spend_action_credits_v2", { _amount: 1 });
        refreshProfile();
      };
      await deductActionCredit();
      trackStat(currentUser.id, "power_trip_uses");
      trackStat(currentUser.id, "total_action_credits_used");
      targetUserId = lowest.id;
      const event = createActionEventWithSeen(lowest.id);
      lastSeenActionEventIdRef.current = event.id;
      const msg: GroupMessage = {
        id: `m${Date.now()}`,
        userId: currentUser.id,
        type: "action",
        content: `⚡ ${currentUser.avatar} ${currentUser.username} used POWER TRIP! Command forwarded to ${lowest.avatar} ${lowest.username}!`,
        mentions: [lowest.id],
        createdAt: new Date(),
      };
      setActionAnimEvent(event);
      setShowActionAnim(true);
      setGroup({
        ...group,
        activeServes: group.activeServes.map(s => s.id === actionServeId ? { ...s, toUserId: lowest.id } : s),
        messages: [...group.messages, msg],
        lastActionEvent: event,
      });
      
      if (targetUserId && targetUserId !== currentUser.id) {
        await sendNotificationIfEnabled('actionCreditsAgainstYou', async () => {
          return await notificationTriggers.triggerActionUsed(
            targetUserId,
            currentUser.username,
            action
          );
        });
      }
      
      actionInProgressRef.current = false;
    } else if (action === "stray_bullet") {
      const lastStrayEvent = group.lastActionEvent;
      const blockedByConsecutiveSelfHit = lastStrayEvent?.action === "stray_bullet"
        && lastStrayEvent.actorId === currentUser.id
        && lastStrayEvent.targetId === currentUser.id;
      if (blockedByConsecutiveSelfHit) {
        toast.error("🔫 Cannot use Stray Bullet twice in a row!", { duration: 4000 });
        actionInProgressRef.current = false; return;
      }
      const deductActionCredit = async () => {
        if (DEV_UNLIMITED_ACTION_CREDITS) return;
        await supabase.rpc("spend_action_credits_v2", { _amount: 1 });
        refreshProfile();
      };
      await deductActionCredit();
      trackStat(currentUser.id, "stray_bullet_uses");
      trackStat(currentUser.id, "total_action_credits_used");
      setShowSpinWheel(true);
    }
  };

  const handleSpinResult = (selectedUser: User) => {
    if (!group || !actionServeId) return;

    const memberIds = group.members.map(m => m.id);
    const event: ActionEvent = {
      id: `ae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      action: "stray_bullet",
      actorId: currentUser.id,
      targetId: selectedUser.id,
      timestamp: Date.now(),
    };
    const eventWithSeen = { ...event, audienceUserIds: memberIds, seenByUserIds: [currentUser.id] };
    lastSeenActionEventIdRef.current = event.id;

    const isSelfHit = selectedUser.id === currentUser.id;
    const msg: GroupMessage = {
      id: `m${Date.now()}`,
      userId: currentUser.id,
      type: "action",
      content: isSelfHit
        ? `🔫 ${currentUser.avatar} ${currentUser.username} used STRAY BULLET! The wheel landed back on ${currentUser.avatar} ${currentUser.username}!`
        : `🔫 ${currentUser.avatar} ${currentUser.username} used STRAY BULLET! The wheel landed on ${selectedUser.avatar} ${selectedUser.username}!`,
      mentions: [selectedUser.id],
      createdAt: new Date(),
    };

    setActionAnimEvent(event);
    setShowActionAnim(true);
    setGroup({
      ...group,
      activeServes: group.activeServes.map((s) => {
        if (s.id !== actionServeId) return s;
        return isSelfHit ? s : { ...s, toUserId: selectedUser.id };
      }),
      messages: [...group.messages, msg],
      lastActionEvent: eventWithSeen,
    });
    
    if (!isSelfHit && selectedUser.id !== currentUser.id) {
      sendNotificationIfEnabled('actionCreditsAgainstYou', async () => {
        return await notificationTriggers.triggerActionUsed(
          selectedUser.id,
          currentUser.username,
          "stray_bullet"
        );
      });
    }

    if (isSelfHit) {
      toast.error("🔫 Stray Bullet landed on you!", { duration: 2500 });
    }

    setTimeout(() => setShowSpinWheel(false), 500);
    setTimeout(() => { actionInProgressRef.current = false; }, 500);
  };

  const handleSelectSuperAction = async (action: SuperActionType) => {
    if (!group || actionInProgressRef.current) return;
    actionInProgressRef.current = true;
    setShowSuperActionSelector(false);
    setRefresh(r => r + 1);

    const deductSuperActionCredit = async () => {
      if (DEV_UNLIMITED_SUPER_CREDITS) return;
      await supabase.rpc("spend_super_action_credits_v2", { _amount: 1 });
      refreshProfile();
    };

    let targetUserId: string | undefined;

    if (action === "coup") {
      if (currentUserHasActivePunishment) {
        toast.error("⚔️ Cannot use Coup D'état whilst you have an active punishment.", { duration: 4000 });
        actionInProgressRef.current = false; return;
      }
      if (group.currentCardHolderIds.includes(currentUser.id)) {
        toast.error("⚔️ You're already a Captain! You can't overthrow yourself.", { duration: 4000 });
        actionInProgressRef.current = false; return;
      }
      const captainsWithActiveCommands = new Set(
        group.activeServes.filter(s => !s.completed && !s.failed).map(s => s.fromUserId)
      );
      const otherCaptains = group.currentCardHolderIds.filter(cid => cid !== currentUser.id);
      const hasIdleCaptain = otherCaptains.some(cid => !captainsWithActiveCommands.has(cid));
      if (!hasIdleCaptain && otherCaptains.length > 0) {
        toast.error("⚔️ Cannot use Coup D'état while there are no available inactive captains.", { duration: 4000 });
        actionInProgressRef.current = false; return;
      }
      const idleCaptains = otherCaptains.filter(cid => !captainsWithActiveCommands.has(cid));
      if (idleCaptains.length === 0) {
        toast.error("No captain to overthrow!");
        actionInProgressRef.current = false; return;
      }
      await deductSuperActionCredit();
      trackStat(currentUser.id, "coup_uses");
      trackStat(currentUser.id, "total_super_credits_used");
      trackStat(currentUser.id, "successful_coups");
      trackStat(currentUser.id, "total_captain_titles");
      const targetCaptainId = idleCaptains[Math.floor(Math.random() * idleCaptains.length)];
      targetUserId = targetCaptainId;
      const targetCaptain = group.members.find(m => m.id === targetCaptainId);
      const newCardHolderIds = dedupeIds(group.currentCardHolderIds.filter(cid => cid !== targetCaptainId).concat(currentUser.id));

      const myActiveServe = group.activeServes.find(s => s.toUserId === currentUser.id && !s.completed && !s.failed);

      const msg: GroupMessage = {
        id: `m${Date.now()}`,
        userId: currentUser.id,
        type: "action",
        content: `⚔️ ${currentUser.avatar} ${currentUser.username} used COUP D'ÉTAT! Overthrew ${targetCaptain?.avatar} ${targetCaptain?.username} and became The Captain!${myActiveServe ? " Active command cancelled!" : ""}`,
        mentions: group.members.map(m => m.id),
        createdAt: new Date(),
      };

      await (supabase.rpc as any)("sync_squad_captains", {
        _squad_id: group.id,
        _captain_ids: newCardHolderIds,
      });

      const memberIds = group.members.map(m => m.id);
      const superEvent = {
        id: `sae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        action: "coup" as const,
        actorId: currentUser.id,
        oldCaptainId: targetCaptain?.id,
        timestamp: Date.now(),
        audienceUserIds: memberIds,
        seenByUserIds: [currentUser.id],
      };
      lastSeenSuperActionEventIdRef.current = superEvent.id;

      const newGroup = {
        ...group,
        currentCardHolderIds: newCardHolderIds,
        currentCardHolderId: newCardHolderIds[0],
        activeServes: myActiveServe
          ? group.activeServes.filter(s => s.id !== myActiveServe.id)
          : group.activeServes,
        currentServe: myActiveServe && group.currentServe?.id === myActiveServe.id ? null : group.currentServe,
        messages: [...group.messages, msg],
        lastSuperActionEvent: superEvent,
        captainFailCounts: { ...(group.captainFailCounts || {}), [currentUser.id]: 0 },
      };

      skipPersistRef.current = true;
      setGroup(newGroup);
      void persistGroupState(newGroup);

      setCoupOldCaptain(targetCaptain || null);
      setCoupNewCaptain(currentUser);
      setShowCoupAnim(true);
      
      if (targetUserId && targetUserId !== currentUser.id) {
        await sendNotificationIfEnabled('superActionsAgainstYou', async () => {
          return await notificationTriggers.triggerSuperActionUsed(
            targetUserId,
            currentUser.username,
            action
          );
        });
      }

      toast(`⚔️ COUP D'ÉTAT! ${currentUser.username} overthrew ${targetCaptain?.username}!`, { duration: 5000 });
    } else if (action === "rank_lottery") {
      const squadScopedStrikes = group.memberStatusById?.[currentUser.id]?.strikes
        ?? group.members.find(m => m.id === currentUser.id)?.strikes
        ?? currentUser.strikes;
      const userHasActivePunishment = squadScopedStrikes >= 3 || group.activePolls.some(p => p.targetUserId === currentUser.id);
      if (userHasActivePunishment) {
        toast.error("🎰 Cannot use Rank Lottery while you have an active punishment!", { duration: 4000 });
        actionInProgressRef.current = false; return;
      }

      const activePunishmentTargetIds = new Set(group.activePolls.map(p => p.targetUserId));
      const others = group.members.filter(m => 
        m.id !== currentUser.id && 
        m.strikes < 3 && 
        !isAdmiral(m.completedCommands) &&
        !activePunishmentTargetIds.has(m.id)
      );
      if (others.length === 0) {
        toast.error("No eligible crew to swap with! (Admirals, users with 3 strikes, or active punishment are excluded)");
        actionInProgressRef.current = false; return;
      }
      await deductSuperActionCredit();
      trackStat(currentUser.id, "rank_lottery_uses");
      trackStat(currentUser.id, "total_super_credits_used");

      const getSquadCommands = (userId: string): number => {
        const scoped = group.memberStatusById?.[userId];
        if (scoped && typeof scoped.completedCommands === "number") return scoped.completedCommands;
        const member = group.members.find(m => m.id === userId);
        return member?.completedCommands ?? 0;
      };

      const myRank = getSquadCommands(currentUser.id);
      const weights = others.map(m => {
        const distance = Math.abs(getSquadCommands(m.id) - myRank);
        return 1 / Math.pow(distance + 1, 1.5);
      });
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let roll = Math.random() * totalWeight;
      let targetIdx = 0;
      for (let i = 0; i < weights.length; i++) {
        roll -= weights[i];
        if (roll <= 0) { targetIdx = i; break; }
      }
      const target = others[targetIdx];
      targetUserId = target.id;
      const myCommands = myRank;
      const targetCommands = getSquadCommands(target.id);

      const updatedMembers = group.members.map(m => {
        if (m.id === currentUser.id) return { ...m, completedCommands: targetCommands };
        if (m.id === target.id) return { ...m, completedCommands: myCommands };
        return m;
      });

      const updatedMemberStatusById = { ...group.memberStatusById };
      const prevStatusMe = updatedMemberStatusById[currentUser.id] || { strikes: 0, warnings: 0, consecutiveFails: 0 };
      const prevStatusTarget = updatedMemberStatusById[target.id] || { strikes: 0, warnings: 0, consecutiveFails: 0 };
      updatedMemberStatusById[currentUser.id] = {
        ...prevStatusMe,
        completedCommands: targetCommands,
      };
      updatedMemberStatusById[target.id] = {
        ...prevStatusTarget,
        completedCommands: myCommands,
      };

      const msg: GroupMessage = {
        id: `m${Date.now()}`,
        userId: currentUser.id,
        type: "action",
        content: `🎰 ${currentUser.avatar} ${currentUser.username} used RANK LOTTERY! Swapped ranks with ${target.avatar} ${target.username}!`,
        mentions: group.members.map(m => m.id),
        createdAt: new Date(),
      };

      const memberIds = group.members.map(m => m.id);
      const superEvent = {
        id: `sae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        action: "rank_lottery" as const,
        actorId: currentUser.id,
        targetId: target.id,
        timestamp: Date.now(),
        audienceUserIds: memberIds,
        seenByUserIds: [currentUser.id],
      };
      lastSeenSuperActionEventIdRef.current = superEvent.id;
      rankLotteryAnimEventIdRef.current = superEvent.id;

      const newGroup = { ...group, members: updatedMembers, memberStatusById: updatedMemberStatusById, messages: [...group.messages, msg], lastSuperActionEvent: superEvent };

      skipPersistRef.current = true;
      setGroup(newGroup);
      void persistGroupState(newGroup);

      setLotteryTarget(target);
      setPendingLotteryState(null);
      showLotteryAnimRef.current = true;
      setShowLotteryAnim(true);
      
      if (targetUserId && targetUserId !== currentUser.id) {
        await sendNotificationIfEnabled('superActionsAgainstYou', async () => {
          return await notificationTriggers.triggerSuperActionUsed(
            targetUserId,
            currentUser.username,
            action
          );
        });
      }

      toast(`🎰 RANK LOTTERY! ${currentUser.username} swapped ranks with ${target.username}!`, { duration: 5000 });
    } else if (action === "saboteur") {
      if (currentUserHasActivePunishment) {
        toast.error("💣 Cannot use Saboteur whilst you have an active punishment.", { duration: 4000 });
        actionInProgressRef.current = false; return;
      }
      const twoMinFromNow = Date.now() + 2 * 60000;
      const targetServes = group.activeServes.filter((s) =>
        !s.completed && !s.failed && new Date(s.expiresAt).getTime() > twoMinFromNow
      );
      if (targetServes.length === 0) {
        toast.error("No active commands to sabotage! (All commands already have ≤ 2 minutes remaining)");
        actionInProgressRef.current = false; return;
      }
      await deductSuperActionCredit();
      trackStat(currentUser.id, "saboteur_uses");
      trackStat(currentUser.id, "total_super_credits_used");
      const targetServeIds = new Set(targetServes.map((serve) => serve.id));
      const targetUsers = dedupeIds(targetServes.map((serve) => serve.toUserId))
        .map((userId) => group.members.find((member) => member.id === userId))
        .filter((member): member is User => !!member);
      const targetUser = targetUsers[0] || null;
      targetUserId = targetUser?.id;
      const newExpiry = new Date(Date.now() + 2 * 60000);

      const msg: GroupMessage = {
        id: `m${Date.now()}`,
        userId: currentUser.id,
        type: "action",
        content: `💣 ${currentUser.avatar} ${currentUser.username} used SABOTEUR! ${targetServes.length} live command${targetServes.length > 1 ? "s were" : " was"} reduced to 2 MINUTES!`,
        mentions: group.members.map(m => m.id),
        createdAt: new Date(),
      };

      const memberIds = group.members.map(m => m.id);
      const superEvent = {
        id: `sae_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        action: "saboteur" as const,
        actorId: currentUser.id,
        targetId: targetUserId,
        timestamp: Date.now(),
        audienceUserIds: memberIds,
        seenByUserIds: [currentUser.id],
      };
      lastSeenSuperActionEventIdRef.current = superEvent.id;

      const newGroup = {
        ...group,
        activeServes: group.activeServes.map((s) => targetServeIds.has(s.id) ? { ...s, expiresAt: newExpiry } : s),
        messages: [...group.messages, msg],
        lastSuperActionEvent: superEvent,
      };

      skipPersistRef.current = true;
      setGroup(newGroup);
      void persistGroupState(newGroup);

      setSaboteurTarget(targetUser);
      setPendingSaboteurState(null);
      setShowSaboteurAnim(true);
      
      if (targetUserId && targetUserId !== currentUser.id) {
        await sendNotificationIfEnabled('superActionsAgainstYou', async () => {
          return await notificationTriggers.triggerSuperActionUsed(
            targetUserId,
            currentUser.username,
            action
          );
        });
      }

      toast(`💣 SABOTEUR! ${targetServes.length} live command${targetServes.length > 1 ? "s" : ""} reduced to 2 minutes!`, { duration: 5000 });
    }
    setTimeout(() => { actionInProgressRef.current = false; }, 500);
  };

  const handleSquadReset = async () => {
    if (!group || !isSquadAdmin) {
      toast.error("Only squad admins can reset the squad.");
      return;
    }

    const { error: resetError } = await (supabase.rpc as any)("reset_squad_profiles", {
      _squad_id: group.id,
    });
    if (resetError) {
      toast.error(`Reset failed: ${resetError.message}`);
      return;
    }

    const memberIds = group.members.map(m => m.id);
    const clearedMembers = group.members.map(m => ({
      ...m,
      completedCommands: 0,
      strikes: 0,
      warnings: 0,
      consecutiveFails: 0,
    }));
    const clearedStatusById: Record<string, { strikes: number; warnings: number; consecutiveFails: number }> = {};
    clearedMembers.forEach(m => {
      clearedStatusById[m.id] = { strikes: 0, warnings: 0, consecutiveFails: 0 };
    });

    const resetTimestamp = Date.now();
    const resetEventId = `${group.id}-reset-${resetTimestamp}`;
    const resetMsg: GroupMessage = {
      id: `m${resetTimestamp}`,
      userId: group.adminId,
      type: "action",
      content: `🔄 SQUAD RESET! All ranks, strikes, and warnings have been cleared. A new Captain will be chosen!`,
      mentions: memberIds,
      createdAt: new Date(resetTimestamp),
    };

    const sorted = [...clearedMembers].sort((a, b) => a.id.localeCompare(b.id));
    let hash = 0;
    for (let i = 0; i < resetEventId.length; i++) {
      hash = ((hash << 5) - hash) + resetEventId.charCodeAt(i);
      hash |= 0;
    }
    const winner = sorted[Math.abs(hash) % sorted.length];

    lastSeenResetEventRef.current = resetTimestamp;

    const { error: syncError } = await (supabase.rpc as any)("sync_squad_captains", {
      _squad_id: group.id,
      _captain_ids: [],
    });
    if (syncError) {
      toast.error(`Reset failed: ${syncError.message}`);
      return;
    }

    const nextGroup = {
      ...group,
      members: clearedMembers,
      memberStatusById: clearedStatusById,
      captainFailCounts: {},
      activeServes: [],
      currentServe: null,
      activePolls: [],
      activePoll: null,
      exemptUserIds: [],
      currentCardHolderIds: [],
      currentCardHolderId: "",
      gameStarted: false,
      messages: [...group.messages, resetMsg],
      lastCommandEvent: null,
      lastActionEvent: null,
      lastSuperActionEvent: null,
      captainDepartureLottery: null,
      initialCaptainLotteryEvent: null,
      squadResetEvent: {
        id: resetEventId,
        winnerId: winner.id,
        timestamp: resetTimestamp,
        audienceUserIds: memberIds,
        seenByUserIds: [],
      },
    };

    skipPersistRef.current = true;
    setGroup(nextGroup);
    await persistGroupState(nextGroup);
    void refreshMembersFromBackend();

    setShowCrew(false);
    setShowSettings(false);
    setActiveResetEventId(resetEventId);
    setResetAnimMembers(clearedMembers);
    setPendingResetLottery({ members: clearedMembers, winner, shouldStartLottery: true });
    setTimeout(() => setShowResetAnim(true), 600);
  };

  const handleCaptainLotteryComplete = async (selectedCaptain: User) => {
    if (!group) return;
    setShowCaptainLottery(false);
    if (captainLotteryContext.type === "initial") {
      activeInitialLotteryEventIdRef.current = null;
      markInitialLotterySeen();
    } else {
      activeCaptainDepartureLotteryKeyRef.current = null;
      markDepartureLotterySeen();
    }

    const baseCaptainIds = captainLotteryContext.type === "transfer"
      ? (captainLotteryContext.baseCaptainIds || [])
      : [];

    const newCaptainIds = dedupeIds([...baseCaptainIds, selectedCaptain.id]);

    void (supabase.rpc as any)("sync_squad_captains", {
      _squad_id: group.id,
      _captain_ids: newCaptainIds,
    }).then(({ error: syncError }: any) => {
      if (syncError) toast.error(`Couldn't finalize captain lottery: ${syncError.message}`);
    });

    const lotteryMsg: GroupMessage = {
      id: `m${Date.now()}`,
      userId: group.adminId,
      type: "action",
      content: captainLotteryContext.type === "initial"
        ? `🎰 CAPTAIN LOTTERY! ${selectedCaptain.avatar} ${selectedCaptain.username} has been selected as the first Captain! Let the games begin! ⚓`
        : `🎰 CAPTAIN LOTTERY! ${selectedCaptain.avatar} ${selectedCaptain.username} has been selected as The Captain!`,
      mentions: group.members.map((m) => m.id),
      createdAt: new Date(),
    };

    const isInitial = captainLotteryContext.type === "initial";

    const nextGroup = (() => {
      const latestGroup = groupRef.current || group;
      if (!latestGroup) return latestGroup;
      return {
        ...latestGroup,
        currentCardHolderIds: newCaptainIds,
        currentCardHolderId: newCaptainIds[0] || "",
        gameStarted: isInitial ? true : latestGroup.gameStarted,
        messages: [...latestGroup.messages, lotteryMsg],
      };
    })();

    skipPersistRef.current = true;
    setGroup(nextGroup);

    if (nextGroup) void persistGroupState(nextGroup);

    setCaptainLotteryContext({ type: "initial" });
  };

  const handleCaptainTransferNoticeAcknowledge = () => {
    const pendingLottery = pendingCaptainTransferLottery;
    setCaptainTransferNotice(null);

    if (!pendingLottery || pendingLottery.candidates.length === 0) return;

    setPendingCaptainTransferLottery(null);
    setCaptainLotteryContext({
      type: "transfer",
      baseCaptainIds: pendingLottery.baseCaptainIds,
    });
    setCaptainLotteryMembers(pendingLottery.candidates);
    setShowCaptainLottery(true);
  };

  const handleCoupAnimComplete = () => {
    setShowCoupAnim(false);
    if (groupRef.current?.lastSuperActionEvent?.id) markSuperActionEventSeen(groupRef.current.lastSuperActionEvent.id);
    void refreshMembersFromBackend();
  };

  const handleLotteryAnimComplete = () => {
    showLotteryAnimRef.current = false;
    setShowLotteryAnim(false);
    rankLotteryAnimEventIdRef.current = null;
    if (groupRef.current?.lastSuperActionEvent?.id) markSuperActionEventSeen(groupRef.current.lastSuperActionEvent.id);
    if (pendingLotteryState) {
      setGroup(pendingLotteryState);
      setPendingLotteryState(null);
    }
    void refreshMembersFromBackend();
  };

  const handleSaboteurAnimComplete = () => {
    setShowSaboteurAnim(false);
    if (groupRef.current?.lastSuperActionEvent?.id) markSuperActionEventSeen(groupRef.current.lastSuperActionEvent.id);
    if (pendingSaboteurState) {
      setGroup(pendingSaboteurState);
      setPendingSaboteurState(null);
    }
  };

  const refreshAfterPurchase = async () => {
    await refreshProfile();
    await refreshMembersFromBackend();
    setRefresh(r => r + 1);
  };

  // ============================================
  // ✅ CONDITIONAL RETURNS - AFTER ALL HOOKS
  // ============================================

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">Loading squad...</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Squad not found</p>
        <Button variant="outline" onClick={() => navigate("/squads")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Squadrons
        </Button>
      </div>
    );
  }

  // ============================================
  // ✅ RENDER
  // ============================================
  return (
    <div className="min-h-screen px-6 py-8 max-w-2xl mx-auto" style={pageBgStyle}>
      {/* All the JSX render code from the original component goes here */}
      {/* I'll include the full render JSX in a condensed form since it's very large */}
      
      {/* Back button and settings */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => { playBackSound(); navigate("/squads"); }} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to squadrons
        </button>
        <Button variant="ghost" size="icon" onClick={() => { playButtonSound(); setShowSettings(true); }}>
          <Settings className="w-5 h-5" />
        </Button>
      </div>

      {/* Group name and status */}
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleGroupNameTap}
            className="text-2xl font-bold font-display hover:text-primary transition-colors"
          >
            {group.name}
          </button>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${group.isOpen ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
            {group.isOpen ? "Open" : "Closed"}
          </span>
        </div>
        <p
          className="text-muted-foreground text-sm mt-1 select-none"
          style={{ WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }}
          onTouchStart={() => {
            if (isMidshipman(mySquadCommands)) {
              _htRef.current = setTimeout(() => _setShowFX(true), 3000);
            }
          }}
          onTouchEnd={() => { if (_htRef.current) clearTimeout(_htRef.current); }}
          onTouchCancel={() => { if (_htRef.current) clearTimeout(_htRef.current); }}
          onMouseDown={() => {
            if (isMidshipman(mySquadCommands)) {
              _htRef.current = setTimeout(() => _setShowFX(true), 3000);
            }
          }}
          onMouseUp={() => { if (_htRef.current) clearTimeout(_htRef.current); }}
          onMouseLeave={() => { if (_htRef.current) clearTimeout(_htRef.current); }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {group.members.length} crew · {captains.length} captain{captains.length > 1 ? "s" : ""}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex mb-1 gap-2 items-center">
        <Button variant="outline" size="sm" className="text-xs h-7 mr-auto" onClick={() => { playProfileSound(); setProfileUserId(currentUser.id); }}>
          <UserIcon className="w-3 h-3 mr-1" />
          Profile
        </Button>
        {(() => {
          const themeBtn = getThemeButtonColors(personalTheme);
          return (
            <>
              <button
                onClick={() => { playButtonSound(); setShowShop(true); }}
                className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg transition-all"
                style={{ color: themeBtn?.actionColor || "hsl(var(--accent))", background: themeBtn?.actionBg || "hsl(var(--accent) / 0.1)" }}
              >
                <Zap className="w-3 h-3" />
                {DEV_UNLIMITED_ACTION_CREDITS ? "∞" : liveCurrentUser.actionCredits} ACTION{!DEV_UNLIMITED_ACTION_CREDITS && liveCurrentUser.actionCredits !== 1 ? "S" : ""}
              </button>
              <button
                className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg transition-all"
                style={{ color: themeBtn?.superColor || "hsl(270 80% 60%)", background: themeBtn?.superBg || "hsl(270 80% 60% / 0.1)" }}
                onClick={handleSuperActionPress}
              >
                <Crown className="w-3 h-3" />
                {DEV_UNLIMITED_SUPER_CREDITS ? "∞" : liveCurrentUser.superActionCredits} SUPER
              </button>
            </>
          );
        })()}
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => { playButtonSound(); setShowCrew(true); }}>
          <Users className="w-3 h-3 mr-1" />
          Crew
        </Button>
      </div>

      {/* Captain display */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card-game rounded-2xl p-3 mb-4 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
        <div className="relative">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-semibold text-center">
            {captains.length > 1 ? "The Captains" : "The Captain"}
          </p>

          <div className="flex justify-center gap-3 flex-wrap">
            {captains.map(captain => {
              const isMe = captain.id === currentUser.id;
              const hasActiveServe = group.activeServes.some(s => s.fromUserId === captain.id && !s.completed && !s.failed);
              const hasResolvingServe = group.activeServes.some(s => s.fromUserId === captain.id && resolvingServeIds[s.id]);
              const failCount = group.captainFailCounts?.[captain.id] || 0;
              return (
                <div key={captain.id} className="text-center min-w-0 relative" style={{ maxWidth: captains.length > 3 ? "70px" : "100px" }}>
                  <button
                    className={`${captains.length > 3 ? "text-2xl" : "text-3xl"} mb-0.5 invert-protect cursor-pointer`}
                    onClick={() => { playProfileSound(); setProfileUserId(captain.id); }}
                  >
                    {captain.avatar}
                  </button>
                  <p className={`${captains.length > 3 ? "text-[10px]" : "text-xs"} font-bold font-display flex items-center justify-center gap-0.5 flex-wrap`}>
                    <Crown className="w-2.5 h-2.5 text-primary" />
                    <button
                      className="truncate hover:text-primary transition-colors"
                      onClick={() => { playProfileSound(); setProfileUserId(captain.id); }}
                    >
                      {captain.username}
                    </button>
                    <RankBadge completedCommands={captain.completedCommands} strikes={captain.strikes} showStrikes={false} showWarnings={false} size="sm" />
                    {isMe && <span className="text-[9px] text-primary">(you)</span>}
                  </p>
                  {isCaptainRank(mySquadCommands) && group.captainStartDates?.[captain.id] && (() => {
                    const elapsed = Date.now() - group.captainStartDates[captain.id];
                    const mins = Math.floor(elapsed / 60000);
                    const hrs = Math.floor(mins / 60);
                    const days = Math.floor(hrs / 24);
                    let tenure = "";
                    if (days > 0) tenure = `${days}d ${hrs % 24}h`;
                    else if (hrs > 0) tenure = `${hrs}h ${mins % 60}m`;
                    else tenure = `${mins}m`;
                    return <p className="text-[9px] text-muted-foreground/60 mt-0.5">{tenure} as Captain</p>;
                  })()}
                  {isMe && !hasActiveServe && !hasResolvingServe && gameActive && (
                    <Button variant="serve" size="sm" className="mt-1.5 text-xs h-8 px-4" onClick={() => guardClick(() => { playButtonSound(); setShowServeModal(true); })}>
                      <Zap className="w-3 h-3 mr-1" />
                      Command
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {captains.length > 0 && (() => {
            const totalFails = captains.reduce((sum, c) => sum + (group.captainFailCounts?.[c.id] || 0), 0);
            if (totalFails === 0) return null;
            const toRoman = (n: number): string => {
              const vals = [10, 9, 5, 4, 1];
              const syms = ["X", "IX", "V", "IV", "I"];
              let result = "";
              for (let i = 0; i < vals.length; i++) {
                while (n >= vals[i]) { result += syms[i]; n -= vals[i]; }
              }
              return result || "0";
            };
            return (
              <span className="absolute bottom-0 right-0 text-[10px] font-display font-bold text-muted-foreground/60">
                {toRoman(totalFails)}
              </span>
            );
          })()}

          {group.activeServes
            .filter((s) =>
              s.fromUserId === currentUser.id &&
              group.currentCardHolderIds.includes(currentUser.id) &&
              !s.completed &&
              !s.failed &&
              !resolvingServeIds[s.id]
            )
            .map(serve => (
              <div key={serve.id} className="mt-3 text-center">
                <p className="text-xs text-muted-foreground mb-2">
                  Waiting for <span className="text-accent font-bold">{group.members.find(m => m.id === serve.toUserId)?.username}</span> to complete...
                </p>
                <div className="flex flex-col items-center gap-2 max-w-[200px] mx-auto">
                  <Button variant="hero" className="w-full h-9 text-sm" onClick={() => handleMissionSuccess(serve.id)} disabled={!!resolvingServeIds[serve.id]}>
                    {resolvingServeIds[serve.id] ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                    Mission Success
                  </Button>
                  <Button variant="destructive" className="w-full h-9 text-sm" onClick={() => handleMissionFailed(serve.id)} disabled={!!resolvingServeIds[serve.id]}>
                    {resolvingServeIds[serve.id] ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <X className="w-4 h-4 mr-2" />}
                    Mission Failed
                  </Button>
                </div>
              </div>
            ))}
        </div>
      </motion.div>

      {/* Game inactive message */}
      {!gameActive && (
        <div className="rounded-xl p-3 mb-4 border border-accent/30 bg-accent/5 text-center">
          <p className="text-sm font-display font-semibold text-accent">⚓ Waiting for crew...</p>
          <p className="text-xs text-muted-foreground mt-1">Must have 4 crew members to begin. ({group.members.length}/4)</p>
        </div>
      )}

      {/* Punishment polls */}
      {gameActive && group.activePolls.map(poll => (
        <PunishmentPollView
          key={poll.id}
          poll={poll}
          group={group}
          currentUser={currentUser}
          onVote={handleVotePoll}
          onCompletePunishment={handleCompletePunishment}
          onFailPunishment={handleFailPunishment}
          onTransitionToPunishment={handleTransitionToPunishment}
          personalTheme={personalTheme}
        />
      ))}

      {/* Punishment required */}
      {gameActive && isAdmin && membersNeedingPunishment.filter(m => !group.activePolls.some(p => p.targetUserId === m.id)).length > 0 && (
        <div className="rounded-xl p-2.5 mb-3 border border-destructive/30 bg-destructive/5">
          <div className="flex items-center gap-2 mb-2">
            <Skull className="w-4 h-4 text-destructive" />
            <span className="font-display font-bold text-destructive text-xs">PUNISHMENT REQUIRED</span>
          </div>
          {membersNeedingPunishment
            .filter(m => !group.activePolls.some(p => p.targetUserId === m.id))
            .map(m => (
              <div key={m.id} className="flex items-center justify-between mt-1">
                <span className="text-xs">{m.avatar} {m.username} — Received 3 strikes</span>
                <Button variant="destructive" size="sm" className="h-6 text-[10px]" onClick={() => { setPollTargetUserId(m.id); setShowCreatePoll(true); }}>Create Poll</Button>
              </div>
            ))}
        </div>
      )}

      {/* Served notifications */}
      {gameActive && (
        <AnimatePresence>
          {group.activeServes
            .filter(s => !s.completed && !s.failed && !resolvingServeIds[s.id])
            .map(serve => (
              <ServedNotification
                key={serve.id}
                serve={serve}
                members={group.members}
                isServed={serve.toUserId === currentUser.id}
                actionCredits={liveCurrentUser.actionCredits}
                onActionPress={serve.toUserId === currentUser.id ? () => handleActionPress(serve.id) : undefined}
              />
            ))}
        </AnimatePresence>
      )}

      {/* Activity feed */}
      <GroupActivityFeed group={group} currentUser={currentUser} onSendMessage={handleSendMessage} gameActive={gameActive} personalTheme={personalTheme} />

      {/* Mission reports */}
      {group.messages.some(m => m.type === "action") && (
        <MissionReports messages={group.messages} members={group.members} onUserTap={(u) => setProfileUserId(u.id)} />
      )}

      {/* Modals and dialogs */}
      <ServeModal open={showServeModal} onOpenChange={setShowServeModal} members={commandTargets} onServe={handleServe} />
      <GroupSettings
        open={showSettings}
        onOpenChange={setShowSettings}
        group={{ ...group, theme: personalTheme }}
        currentUser={group.members.find(m => m.id === currentUser.id) || currentUser}
        isPremium={profile?.is_premium || false}
        onUpdateGroup={handleUpdateGroup}
        onEjectMember={handleEjectMember}
        onPromoteMember={handlePromoteMember}
        onDemoteMember={handleDemoteMember}
        onRemoveStrike={handleRemoveStrike}
        onLeaveGroup={handleLeaveGroup}
        rankActionLoading={rankActionLoading}
        onResetSquad={handleSquadReset}
        onOpenUpgrade={() => { setShowSettings(false); setShowShop(true); }}
        onTransferAdmin={async (targetUserId) => {
          const targetUser = group.members.find(m => m.id === targetUserId);
          if (!targetUser) return;
          await (supabase.rpc as any)("transfer_squad_admin", { _squad_id: group.id, _new_admin_id: targetUserId });
          const msg: GroupMessage = {
            id: `m${Date.now()}`,
            userId: currentUser.id,
            type: "action",
            content: `👑 ${currentUser.username} has transferred Admin Authority to ${targetUser.avatar} ${targetUser.username}!`,
            mentions: group.members.map(m => m.id),
            createdAt: new Date(),
          };
          const nextGroup = { ...group, adminId: targetUserId, messages: [...group.messages, msg] };
          skipPersistRef.current = true;
          setGroup(nextGroup);
          void persistGroupState(nextGroup);
          setShowSettings(false);
          toast.success(`Admin authority transferred to ${targetUser.username}`);
        }}
      />
      <CreatePollDialog open={showCreatePoll} onOpenChange={setShowCreatePoll} targetUser={group.members.find(m => m.id === pollTargetUserId) || null} onCreatePoll={handleCreatePoll} />
      <UserProfileDialog
        open={!!profileUser}
        onOpenChange={(open) => !open && setProfileUserId(null)}
        user={profileUser}
        enlistDate={profileUser ? memberEnlistDates[profileUser.id] : undefined}
        viewerCompletedCommands={mySquadCommands}
        isViewingSelf={profileUser?.id === currentUser.id}
        onGift={(u) => setGiftTarget(u)}
        onFlexRank={(flexUser) => {
          const rank = getRank(flexUser.completedCommands);
          const msg: GroupMessage = {
            id: `m${Date.now()}`,
            userId: currentUser.id,
            type: "comment",
            content: `💪 is flexing their rank: ${rank.badge} ${rank.title} (${rank.abbreviation})!`,
            mentions: [],
            createdAt: new Date(),
          };
          setGroup({ ...group, messages: [...group.messages, msg] });
          setProfileUserId(null);
        }}
      />
      <CrewDialog
        open={showCrew}
        onOpenChange={setShowCrew}
        members={group.members}
        adminId={group.adminId}
        currentUserId={currentUser.id}
        currentUserCommands={mySquadCommands}
        onGiftUser={(u) => setGiftTarget(u)}
      />

      <GiftCreditsDialog
        open={!!giftTarget}
        onOpenChange={(o) => { if (!o) setGiftTarget(null); }}
        recipient={giftTarget}
        senderCredits={liveCurrentUser.actionCredits}
        senderId={currentUser.id}
        onSuccess={async (amount) => {
          const recipientAtSend = giftTarget;
          const snapshot = groupRef.current;

          if (snapshot && recipientAtSend) {
            const giftMsg: GroupMessage = {
              id: `m${Date.now()}_gift`,
              userId: currentUser.id,
              type: "action",
              content: `🎁 ${currentUser.username} gifted ${amount} Action Credit${amount > 1 ? "s" : ""} to ${recipientAtSend.username}`,
              mentions: [recipientAtSend.id],
              createdAt: new Date(),
            };

            const nextGroup = {
              ...snapshot,
              members: snapshot.members.map((member) => {
                if (member.id === currentUser.id) {
                  return { ...member, actionCredits: Math.max(0, (member.actionCredits || 0) - amount) };
                }
                if (member.id === recipientAtSend.id) {
                  return { ...member, actionCredits: (member.actionCredits || 0) + amount };
                }
                return member;
              }),
              messages: [...snapshot.messages, giftMsg],
            };

            skipPersistRef.current = true;
            setGroup(nextGroup);
            await persistGroupState(nextGroup);
          }

          await refreshProfile();
          await refreshMembersFromBackend();

          if (isNotificationEnabled('creditGifting') && recipientAtSend) {
            await notificationTriggers.triggerCreditGifting(
              recipientAtSend.id,
              currentUser.username,
              amount
            );
          }
        }}
      />

      <ActionSelector
        open={showActionSelector}
        onOpenChange={setShowActionSelector}
        credits={currentUser.actionCredits}
        onSelectAction={handleSelectAction}
      />

      <SuperActionSelector
        open={showSuperActionSelector}
        onOpenChange={setShowSuperActionSelector}
        credits={currentUser.superActionCredits}
        onSelectAction={handleSelectSuperAction}
        onOpenShop={() => setShowShop(true)}
      />

      <SpinWheel
        open={showSpinWheel}
        onOpenChange={setShowSpinWheel}
        members={group.members}
        currentUserId={currentUser.id}
        captainIds={group.currentCardHolderIds}
        excludeUserIds={group.activePolls.map(p => p.targetUserId)}
        onResult={handleSpinResult}
      />

      <ShopDialog
        open={showShop}
        onOpenChange={setShowShop}
        isPremium={profile?.is_premium ?? false}
        actionCredits={currentUser.actionCredits}
        superActionCredits={currentUser.superActionCredits}
        userId={currentUser.id}
        onBuyFullVersion={() => {
          setShowShop(false);
          setShowUpgrade(true);
        }}
        onBuyActions={async () => {
          setShowShop(false);
          await refreshAfterPurchase();
          toast.success("Action Credits purchased! Check your balance.");
        }}
        onBuySuperActions={async () => {
          setShowShop(false);
          await refreshAfterPurchase();
          toast.success("Super Action Credits purchased! Check your balance.");
        }}
        onAdRewardGranted={async () => {
          await refreshAfterPurchase();
        }}
      />

      <UpgradeDialog 
        open={showUpgrade} 
        onOpenChange={setShowUpgrade} 
        onPurchaseComplete={async () => { 
          await refreshAfterPurchase();
          setShowUpgrade(false);
          toast.success("Premium activated! Enjoy unlimited features!");
        }}
      />

      {/* Animations */}
      <AnimatePresence>
        {showCoupAnim && coupOldCaptain && coupNewCaptain && (
          <CoupAnimation
            open={showCoupAnim}
            onComplete={handleCoupAnimComplete}
            oldCaptain={coupOldCaptain}
            newCaptain={coupNewCaptain}
          />
        )}
        {showLotteryAnim && lotteryTarget && (
          <RankLotteryAnimation
            open={showLotteryAnim}
            onComplete={handleLotteryAnimComplete}
            members={group.members}
            currentUser={currentUser}
            target={lotteryTarget}
          />
        )}
        {showSaboteurAnim && saboteurTarget && (
          <SaboteurAnimation
            open={showSaboteurAnim}
            onComplete={handleSaboteurAnimComplete}
            targetUser={saboteurTarget}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showActionAnim && actionAnimEvent && (
          <ActionAnimation
            event={actionAnimEvent}
            members={group.members}
            onComplete={() => {
              if (actionAnimEvent?.id) markActionEventSeen(actionAnimEvent.id);
              setShowActionAnim(false);
              setActionAnimEvent(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCommandAnim && commandAnimEvent && (
          <CommandIssuedAnimation
            event={commandAnimEvent}
            members={group.members}
            onComplete={() => {
              if (commandAnimEvent?.id) markCommandEventSeen(commandAnimEvent.id);
              setShowCommandAnim(false);
              setCommandAnimEvent(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Auto-fail animation */}
      <AnimatePresence>
        {autoFailAnim && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-background/90 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: "spring", bounce: 0.4 }}
              className="flex flex-col items-center gap-4 p-8"
            >
              <motion.div
                animate={{ rotate: [0, -10, 10, -10, 0] }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="text-6xl invert-protect"
              >
                ⏰
              </motion.div>
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-lg font-display font-bold text-destructive text-center"
              >
                TIME'S UP!
              </motion.p>
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex flex-col items-center gap-2"
              >
                <span className="text-5xl invert-protect">{autoFailAnim.avatar}</span>
                <p className="text-sm font-display font-bold">{autoFailAnim.username}</p>
                <p className="text-xs text-muted-foreground">failed the command</p>
              </motion.div>
              <motion.p
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.8, type: "spring", bounce: 0.5 }}
                className="text-sm font-bold text-destructive flex items-center gap-1"
              >
                ❌ Strike added!
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Departure animations */}
      <AnimatePresence>
        {showDepartureAnim && departureAnimData && departureAnimData.type === "left" && (
          <MemberDepartureAnimation
            open={showDepartureAnim}
            username={departureAnimData.username}
            avatar={departureAnimData.avatar}
            onComplete={() => {
              setShowDepartureAnim(false);
              activeMemberDepartureEventIdRef.current = null;
              const depEvt = groupRef.current?.memberDepartureEvent;
              if (depEvt?.id) markMemberDepartureEventSeen(depEvt.id);
              setDepartureAnimData(null);

              if (pendingDepartureLottery) {
                startDepartureLottery(
                  pendingDepartureLottery.eventKey,
                  pendingDepartureLottery.members,
                  pendingDepartureLottery.winner
                );
              }

              setPendingDepartureLottery(null);
            }}
          />
        )}
        {showDepartureAnim && departureAnimData && departureAnimData.type === "ejected" && (
          <MemberEjectedAnimation
            open={showDepartureAnim}
            username={departureAnimData.username}
            avatar={departureAnimData.avatar}
            onComplete={() => {
              setShowDepartureAnim(false);
              activeMemberDepartureEventIdRef.current = null;
              const depEvent = groupRef.current?.memberDepartureEvent;
              if (depEvent?.id) markMemberDepartureEventSeen(depEvent.id);
              setDepartureAnimData(null);

              if (pendingDepartureLottery) {
                startDepartureLottery(
                  pendingDepartureLottery.eventKey,
                  pendingDepartureLottery.members,
                  pendingDepartureLottery.winner
                );
              }

              setPendingDepartureLottery(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Reset animation */}
      <AnimatePresence>
        {showResetAnim && resetAnimMembers.length > 0 && (
          <SquadResetAnimation
            open={showResetAnim}
            members={resetAnimMembers}
            onComplete={() => {
              setShowResetAnim(false);

              if (activeResetEventId) {
                markResetEventSeen(activeResetEventId);
                setActiveResetEventId(null);
              }

              if (pendingResetLottery?.shouldStartLottery) {
                captainLotteryShownRef.current = true;
                setCaptainLotteryContext({ type: "initial" });
                setCaptainLotteryMembers(pendingResetLottery.members);
                setCaptainLotteryWinner(pendingResetLottery.winner);
                setShowCaptainLottery(true);
              }

              setPendingResetLottery(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Captain lottery animation */}
      <AnimatePresence>
        {showCaptainLottery && captainLotteryMembers.length > 0 && captainLotteryWinner && (
          <CaptainLotteryAnimation
            open={showCaptainLottery}
            onComplete={handleCaptainLotteryComplete}
            members={captainLotteryMembers}
            winner={captainLotteryWinner}
          />
        )}
      </AnimatePresence>

      {/* Other modals and overlays */}
      <OverlayFX open={_showFX} onComplete={() => _setShowFX(false)} />

      {/* Mission fail notice */}
      <AnimatePresence>
        {missionFailNotice && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            className="fixed top-4 inset-x-3 z-[120] mx-auto max-w-[360px]"
          >
            <div className="rounded-2xl border border-destructive/40 bg-card px-4 py-3 shadow-xl">
              <p className="text-sm font-display font-bold text-destructive">{missionFailNotice.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{missionFailNotice.body}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Captain transfer notice dialog */}
      <Dialog open={!!captainTransferNotice} onOpenChange={(open) => !open && handleCaptainTransferNoticeAcknowledge()}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-display">{captainTransferNotice?.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{captainTransferNotice?.body}</p>
          <Button variant="hero" className="w-full" onClick={handleCaptainTransferNoticeAcknowledge}>
            Acknowledge
          </Button>
        </DialogContent>
      </Dialog>

      {/* Archives overlay */}
      <AnimatePresence>
        {_showArch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm overflow-auto"
            onClick={() => _setShowArch(false)}
          >
            <button
              className="fixed top-4 right-4 z-[110] w-9 h-9 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => _setShowArch(false)}
              aria-label="Close"
            >
              <XIcon className="w-5 h-5" />
            </button>
            <div className="max-w-md mx-auto px-6 py-12" onClick={(e) => e.stopPropagation()}>
              <p className="text-xs text-muted-foreground text-center mb-2">Tap outside or ✕ to close</p>
              <h2 className="text-lg font-display font-bold text-primary text-center mb-6">🏴‍☠️ Squad Archives</h2>
              
              <LeaderboardView group={group} />

              <h3 className="text-sm font-display font-bold text-muted-foreground mt-6 mb-3">📜 The First Commandments</h3>
              <div className="space-y-4">
                {[...group.members]
                  .sort((a, b) => {
                    const dateA = memberEnlistDates[a.id]?.getTime() || 0;
                    const dateB = memberEnlistDates[b.id]?.getTime() || 0;
                    return dateA - dateB;
                  })
                  .map(member => {
                  const firstReceived = group.serveHistory.find(s => s.toUserId === member.id);
                  const firstIssued = group.serveHistory.find(s => s.fromUserId === member.id);
                  const enlistDate = memberEnlistDates[member.id];
                  return (
                    <div key={member.id} className="rounded-xl p-3 bg-secondary/30 border border-border">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-display font-bold text-sm">{member.avatar} {member.username}</p>
                        {enlistDate && (
                          <span className="text-[10px] text-muted-foreground">
                            Enlisted: {enlistDate.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        )}
                      </div>
                      {firstIssued ? (
                        <p className="text-xs text-muted-foreground">
                          📤 First command sent: <span className="text-foreground">"{firstIssued.prompt}"</span>
                          <span className="ml-1 text-[10px]">({new Date(firstIssued.createdAt).toLocaleDateString()})</span>
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">📤 No commands sent yet</p>
                      )}
                      {firstReceived ? (
                        <p className="text-xs text-muted-foreground mt-1">
                          📥 First command received: <span className="text-foreground">"{firstReceived.prompt}"</span>
                          <span className="ml-1 text-[10px]">({new Date(firstReceived.createdAt).toLocaleDateString()})</span>
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">📥 No commands received yet</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legendary command animation */}
      <AnimatePresence>
        {showLegendaryAnim && legendaryEvent && (
          <LegendaryCommandAnimation
            event={legendaryEvent}
            members={group.members}
            personalTheme={personalTheme}
            onComplete={() => {
              setShowLegendaryAnim(false);
              setLegendaryEvent(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Admiral announcement */}
      {showAdmiralAnnouncement && admiralAnnouncementData && (
        <AdmiralAnnouncement
          open={showAdmiralAnnouncement}
          username={admiralAnnouncementData.username}
          avatar={admiralAnnouncementData.avatar}
          completedCommands={admiralAnnouncementData.completedCommands}
          failedMissions={admiralAnnouncementData.failedMissions}
          commandsIssued={admiralAnnouncementData.commandsIssued}
          coupsPerformed={admiralAnnouncementData.coupsPerformed}
          onDismiss={() => {
            setShowAdmiralAnnouncement(false);
            setAdmiralAnnouncementData(null);
          }}
        />
      )}

      {/* Rank milestone prompt */}
      {!showLotteryAnim && !showCaptainLottery && !showActionAnim && !showCommandAnim && !showResetAnim && !showDepartureAnim && !showLegendaryAnim && !showAdmiralAnnouncement && !showSaboteurAnim && (
        <RankMilestonePrompt milestone={pendingMilestone} onDismiss={dismissMilestone} />
      )}

      {/* Crew ping prompt */}
      <CrewPingPrompt
        event={group.crewPingEvent || null}
        currentUserId={currentUser.id}
        onDismiss={() => {
          if (!group.crewPingEvent) return;
          const updated = {
            ...group.crewPingEvent,
            seenByUserIds: [...(group.crewPingEvent.seenByUserIds || []), currentUser.id],
          };
          setGroup({ ...group, crewPingEvent: updated });
        }}
      />

      {/* Onboarding guide */}
      <OnboardingGuide userId={user?.id} squadCount={1} />
    </div>
  );
};

export default GroupDetailPage;