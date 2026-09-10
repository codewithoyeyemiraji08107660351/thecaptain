import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getThemeDotColor } from "@/lib/squad-themes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, ChevronRight, Zap, Settings, Sparkles, ShoppingBag, Loader2, Crown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { canSpinToday } from "@/lib/streak";
import { toast } from "sonner";
import CreateGroupDialog from "@/components/CreateGroupDialog";
import AppSettings from "@/components/AppSettings";
import UpgradeDialog from "@/components/UpgradeDialog";
import ShopDialog from "@/components/ShopDialog";
import InviteHandler from "@/components/InviteHandler";
import AmbientOverlay from "@/components/AmbientOverlay";
import SquadReorderDialog from "@/components/SquadReorderDialog";
import { playButtonSound, playSquadSelectSound, playUpgradeSound } from "@/lib/sounds";
import { useVisualMode } from "@/hooks/use-visual-mode";
import { computeStreak, getStreakDisplay } from "@/lib/streak";
import DailySpinDialog from "@/components/DailySpinDialog";
import { type SortMode, getUserSquadPreferences, setUserSquadPreferences, orderSquads, DEFAULT_PREFS } from "@/lib/squad-order";
import type { Group } from "@/lib/mockData";
import { notificationTriggers } from "@/services/notificationTriggers";
import { isNotificationEnabled } from "@/lib/notifications";
import { usePurchase } from "@/contexts/PurchaseContext";
import { Capacitor } from "@capacitor/core";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const sendNotificationIfEnabled = async (
  notificationType: string,
  triggerFn: () => Promise<any>
): Promise<any> => {
  if (isNotificationEnabled(notificationType as any)) {
    try {
      return await triggerFn();
    } catch (error) {
      console.error(`Failed to send ${notificationType} notification:`, error);
      return null;
    }
  }
  return null;
};

const GroupsPage = () => {
  const navigate = useNavigate();
  const { user, refreshProfile, profile } = useAuth();
  const { isPremium, refreshPremiumStatus, isLoading: isPurchaseLoading } = usePurchase();
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showDailySpin, setShowDailySpin] = useState(false);
  const [hasSpunToday, setHasSpunToday] = useState(false);
  const [showReorder, setShowReorder] = useState(false);
  const [sortPrefs, setSortPrefs] = useState(DEFAULT_PREFS);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    getUserSquadPreferences(user.id).then(p => setSortPrefs(p));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const checkSpin = async () => {
      const { data } = await (supabase as any)
        .from("daily_spins")
        .select("last_spin_at, has_reroll")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setHasSpunToday(!canSpinToday(data.last_spin_at) && !data.has_reroll);
      } else {
        setHasSpunToday(false);
      }
    };
    checkSpin();
  }, [user?.id, showDailySpin]);

  const handleFullVersionActivated = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchSquads(),
        refreshProfile()
      ]);
      
      toast.success("Full Version activated! 🎉");
    } catch (error) {
      console.error('Error refreshing after Full Version activation:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const [, setRefresh] = useState(0);
  const [_showAmb, _setShowAmb] = useState(false);
  const _shRef = useRef<NodeJS.Timeout | null>(null);
  const _lpRef = useRef<NodeJS.Timeout | null>(null);
  const forceRefresh = () => setRefresh(r => r + 1);
  const { toggle: _vmToggle } = useVisualMode();

  useEffect(() => {
    return () => {
      if (_shRef.current) clearTimeout(_shRef.current);
      if (_lpRef.current) clearTimeout(_lpRef.current);
    };
  }, []);

  
  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return;

    const perUserKey = `pending-ejection-notice:${user.id}`;
    const queueKey = "pending-ejection-notices";
    let groupName = "the group";
    let hasNotice = false;

    const raw = window.localStorage.getItem(perUserKey);
    if (raw) {
      hasNotice = true;
      try {
        const parsed = JSON.parse(raw) as { groupName?: string };
        if (parsed?.groupName) groupName = parsed.groupName;
      } catch {
        // ignore malformed payloads
      }
      window.localStorage.removeItem(perUserKey);
    }

    if (!hasNotice) {
      try {
        const queueRaw = window.localStorage.getItem(queueKey);
        const queue = queueRaw ? JSON.parse(queueRaw) as Array<{
          userId?: string;
          groupName?: string;
          shownAt?: number | null;
        }> : [];

        const idx = queue.findIndex((entry) => entry?.userId === user.id && !entry?.shownAt);
        if (idx >= 0) {
          hasNotice = true;
          groupName = queue[idx]?.groupName || groupName;
          queue[idx] = { ...queue[idx], shownAt: Date.now() };
          window.localStorage.setItem(queueKey, JSON.stringify(queue));
        }
      } catch {
        // ignore malformed queue payloads
      }
    }

    if (hasNotice) {
      toast.error(`You have been ejected from ${groupName}.`);
    }
  }, [user?.id]);

  const { data: squads, isLoading, refetch: refetchSquads } = useQuery({
    queryKey: ["user-squads", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data: memberRows, error: memberError } = await supabase
        .from("squad_members")
        .select("squad_id, is_captain, joined_at")
        .eq("user_id", user.id);

      if (memberError) throw memberError;
      if (!memberRows || memberRows.length === 0) return [];

      const squadIds = memberRows.map(r => r.squad_id);

      const { data: squadRows, error: squadError } = await supabase
        .from("squads")
        .select("*")
        .in("id", squadIds);

      if (squadError) throw squadError;

      const { data: allMembers } = await supabase
        .from("squad_members")
        .select("squad_id, user_id, is_captain")
        .in("squad_id", squadIds);

      const { data: liveStates } = await supabase
        .from("squad_live_state")
        .select("squad_id, state")
        .in("squad_id", squadIds);

      const captainUserIds = (allMembers || []).filter(m => m.is_captain).map(m => m.user_id);
      let captainProfiles: Record<string, { username: string; avatar: string }> = {};
      if (captainUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username, avatar")
          .in("id", captainUserIds);
        if (profiles) {
          profiles.forEach(p => { captainProfiles[p.id] = p; });
        }
      }

      const now = Date.now();
      const recentCutoff = now - 7 * 24 * 60 * 60 * 1000;
      return (squadRows || []).map(squad => {
        const members = (allMembers || []).filter(m => m.squad_id === squad.id);
        const captain = members.find(m => m.is_captain);
        const captainProfile = captain ? captainProfiles[captain.user_id] : null;
        const membership = (memberRows || []).find(row => row.squad_id === squad.id);

        const liveState = (liveStates || []).find(ls => ls.squad_id === squad.id);
        const groupState = liveState?.state as unknown as Group | null;
        const activeServes = (groupState?.activeServes || []).filter(
          serve => new Date(serve.expiresAt).getTime() > now && !serve.completed && !serve.failed
        );
        const activeCommandCount = activeServes.length;
        const activePollCount = (groupState?.activePolls || []).filter(
          poll => new Date(poll.expiresAt).getTime() > now
        ).length;
        const recentMessages = (groupState?.messages || []).filter(
          message => new Date(message.createdAt).getTime() >= recentCutoff
        ).length;
        const recentServes = (groupState?.serveHistory || []).filter(
          serve => new Date(serve.createdAt).getTime() >= recentCutoff
        ).length;
        const activityScore = recentMessages + (recentServes * 3) + (activeCommandCount * 4) + (activePollCount * 2);
        const pendingActionCount = activeCommandCount + activePollCount;

        const allServeDates = [
          ...((groupState?.serveHistory || []).map(s => s.createdAt)),
          ...((groupState?.activeServes || []).map(s => s.createdAt)),
        ];
        const streakDays = computeStreak(allServeDates);
        const streakDisplay = getStreakDisplay(streakDays);

        return {
          ...squad,
          joined_at: membership?.joined_at || squad.created_at,
          memberCount: members.length,
          captainUsername: captainProfile?.username || null,
          captainAvatar: captainProfile?.avatar || null,
          hasActiveCaptain: !!captain,
          activeCommandCount,
          activityScore,
          pendingActionCount,
          streakDisplay,
        };
      });
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    return () => {
      setShowCreate(false);
      setShowUpgrade(false);
    };
  }, []);

  
const handleNewSquad = useCallback(() => {
  playButtonSound();

  if (isRefreshing || isPurchaseLoading) return;

  const squadCount = squads?.length ?? 0;
  const maxFreeSquads = 1;

  if (!isPremium && squadCount >= maxFreeSquads) {
    playUpgradeSound();
    setShowUpgrade(true);
    return;
  }

  setShowUpgrade(false);

  requestAnimationFrame(() => {
    setShowCreate(true);
  });
}, [
  isRefreshing,
  isPurchaseLoading,
  squads?.length,
  isPremium,
]);


  useEffect(() => {
    if (!user?.id || !squads || squads.length === 0) return;

    const squadIds = new Set(squads.map(s => s.id));
    
    const channel = supabase
      .channel("squad-live-state-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "squad_live_state",
        },
        async (payload) => {
          const newRecord = payload.new as { squad_id?: string; state?: any } | null;
          const oldRecord = payload.old as { squad_id?: string; state?: any } | null;
          
          const squadId = newRecord?.squad_id || oldRecord?.squad_id;

          if (!squadId || !squadIds.has(squadId)) return;
          
          const newState = payload.new as any;
          const oldState = payload.old as any;
          
          if (!newState?.state) return;
          
          // ============================================
          // ✅ NEW MESSAGE notifications - KEEP
          // ============================================
          const newMessages = newState.state.messages || [];
          const oldMessages = oldState?.state?.messages || [];
          
          if (newMessages.length > oldMessages.length) {
            const newMsg = newMessages[newMessages.length - 1];
            const squad = squads.find(s => s.id === squadId);
            
            if (squad && newMsg) {
              const { data: members } = await supabase
                .from("squad_members")
                .select("user_id")
                .eq("squad_id", squad.id);
              
              if (members) {
                await Promise.all(
                  members
                    .filter(member => member.user_id !== newMsg.userId)
                    .map(async (member) => {
                      const mentioned = newMsg.content?.toLowerCase().includes(`@${newMsg.username?.toLowerCase()}`) || 
                                       newMsg.content?.toLowerCase().includes(`@${newMsg.userId}`);
                      
                      if (mentioned) {
                        return sendNotificationIfEnabled('mentions', async () => {
                          return await notificationTriggers.triggerMention(
                            member.user_id,
                            newMsg.username || "Someone",
                            squad.id,
                            squad.name
                          );
                        });
                      } else {
                        return sendNotificationIfEnabled('newMessages', async () => {
                          return await notificationTriggers.triggerNewMessage(
                            member.user_id,
                            newMsg.username || "Someone",
                            squad.id,
                            newMsg.content || ""
                          );
                        });
                      }
                    })
                );
              }
            }
          }
      
          
          refetchSquads();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, squads, refetchSquads]);

  useEffect(() => {
    if (!user?.id || !squads || squads.length === 0) return;
    
    const squadIds = new Set(squads.map(s => s.id));
    
    const memberChannel = supabase
      .channel("squad-member-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "squad_members",
        },
        async (payload) => {
          const newMember = payload.new as any;
          const squadId = newMember?.squad_id;
          
          if (!squadId || !squadIds.has(squadId)) return;
          
          const squad = squads.find(s => s.id === squadId);
          
          if (squad && newMember.user_id !== user.id) {
            const { data: newUserProfile } = await supabase
              .from("profiles")
              .select("username")
              .eq("id", newMember.user_id)
              .single();
            
            const { data: existingMembers } = await supabase
              .from("squad_members")
              .select("user_id")
              .eq("squad_id", squad.id)
              .neq("user_id", newMember.user_id);
            
            if (existingMembers) {
              await Promise.all(
                existingMembers.map(member =>
                  sendNotificationIfEnabled('newMembers', async () => {
                    return await notificationTriggers.triggerNewMember(
                      member.user_id,
                      newUserProfile?.username || "A new member",
                      squad.id,
                      squad.name
                    );
                  })
                )
              );
            }
          }
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(memberChannel);
    };
  }, [user?.id, squads]);

  // ============================================
  // ✅ CREDIT tracking - KEEP
  // ============================================
  useEffect(() => {
    if (!user?.id) return;
    
    const creditChannel = supabase
      .channel("credit-changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        async (payload) => {
          const newProfile = payload.new as any;
          const oldProfile = payload.old as any;
          
          if (newProfile?.action_credits > oldProfile?.action_credits) {
            console.log("Credits increased by:", newProfile.action_credits - oldProfile.action_credits);
          }
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(creditChannel);
    };
  }, [user?.id]);

  // ============================================
  // ✅ DAILY SPIN REMINDER - KEEP
  // ============================================
  useEffect(() => {
    if (!user?.id) return;
    
    const checkReminder = async () => {
      if (!isNotificationEnabled('dailySpinReminder')) {
        console.log('Daily spin reminder notifications are disabled, skipping');
        return;
      }

      const { data } = await (supabase as any)
        .from("daily_spins")
        .select("last_spin_at")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (data?.last_spin_at) {
        const lastSpin = new Date(data.last_spin_at);
        const now = new Date();
        const hoursSinceSpin = (now.getTime() - lastSpin.getTime()) / (1000 * 60 * 60);
        
        // Only remind if it's been more than 24 hours
        if (hoursSinceSpin >= 24) {
          const today = new Date().toDateString();
          const reminderKey = `spin-reminder-${user.id}-${today}`;
          if (!localStorage.getItem(reminderKey)) {
            try {
              await notificationTriggers.triggerDailySpinReminder(user.id);
              localStorage.setItem(reminderKey, "sent");
              console.log('✅ Daily spin reminder sent');
            } catch (error) {
              console.error('Failed to send daily spin reminder:', error);
            }
          }
        }
      }
    };
    
    // Check immediately and then every hour
    const timeout = setTimeout(() => {
      checkReminder();
    }, 5000); // Wait 5 seconds for app to load
    
    const interval = setInterval(checkReminder, 60 * 60 * 1000);
    
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [user?.id]);

  const handleTitleDown = useCallback(() => {
    _lpRef.current = setTimeout(() => {
      _vmToggle();
    }, 3500);
  }, [_vmToggle]);

  const handleTitleUp = useCallback(() => {
    if (_lpRef.current) {
      clearTimeout(_lpRef.current);
      _lpRef.current = null;
    }
  }, []);

  return (
    <div className="min-h-screen px-6 py-8 max-w-2xl mx-auto relative pb-24 overflow-y-auto">
      <InviteHandler onAccepted={() => refetchSquads()} />

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1
            className="text-3xl font-bold font-display text-gradient-primary select-none"
            onMouseDown={handleTitleDown}
            onMouseUp={handleTitleUp}
            onMouseLeave={handleTitleUp}
            onTouchStart={handleTitleDown}
            onTouchEnd={handleTitleUp}
            onTouchCancel={handleTitleUp}
          >
            The Squadrons
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Tap a squadron to play</p>
        </div>
        <div className="flex items-center gap-2">
          {isPremium && (
            <div className="flex items-center gap-1 bg-gradient-to-r from-primary/20 to-accent/20 rounded-full px-2 py-1 mr-1">
              <Crown className="w-3 h-3 text-primary" />
              <span className="text-xs font-semibold text-primary">FULL VERSION</span>
            </div>
          )}
          <Button variant="ghost" size="icon" onClick={() => { playButtonSound(); setShowSettings(true); }} title="General Settings">
            <Settings className="w-5 h-5" />
          </Button>
          <Button
            variant="hero"
            size="sm"
            onClick={handleNewSquad}
            disabled={isRefreshing || isPurchaseLoading}
          >
            {isRefreshing || isPurchaseLoading ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-1" />
            )}
            New Squad
          </Button>
        </div>
      </div>

      {/* Reorder control – sits just above the squad list */}
      {isPremium && squads && squads.length > 1 && (
        <div className="flex justify-end mb-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors rounded-md border border-border/60 bg-secondary/40 px-2.5 py-1.5">
                ↑↓ Reorder
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {([
                ["date_joined", "Date Joined"],
                ["alphabetical", "Alphabetical"],
                ["most_active", "Most Active"],
                ["pending_actions", "Pending Actions"],
                ["custom", "Custom"],
              ] as [SortMode, string][]).map(([mode, label]) => (
                <DropdownMenuItem
                  key={mode}
                  onClick={() => {
                    playButtonSound();
                    if (mode === "custom") {
                      setShowReorder(true);
                      return;
                    }
                    const newDesc = sortPrefs.sort_mode === mode ? !sortPrefs.sort_desc : false;
                    const newPrefs = { ...sortPrefs, sort_mode: mode, sort_desc: newDesc };
                    setSortPrefs(newPrefs);
                    if (user?.id) void setUserSquadPreferences(user.id, newPrefs);
                  }}
                  className={`flex items-center justify-between ${sortPrefs.sort_mode === mode ? "bg-secondary text-foreground font-semibold" : ""}`}
                >
                  {label}
                  {sortPrefs.sort_mode === mode && (
                    <span className={`text-sm font-bold ${sortPrefs.sort_desc ? "text-orange-400" : "text-primary"}`}>
                      {sortPrefs.sort_desc ? "↑" : "↓"}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Groups list */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : squads && squads.length > 0 ? (
          <AnimatePresence>
            {orderSquads(squads, sortPrefs).map((squad, i) => (
              <motion.div
                key={squad.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100, height: 0, marginBottom: 0, padding: 0, overflow: "hidden" }}
                transition={{ delay: i * 0.1, layout: { duration: 0.3 } }}
                onClick={() => { playSquadSelectSound(); navigate(`/group/${squad.id}`); }}
                className="card-game rounded-xl p-5 cursor-pointer hover:border-primary/40 transition-all duration-300 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {squad.theme && squad.theme !== "default" && (
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getThemeDotColor(squad.theme) }} />
                      )}
                      <h3 className="text-lg font-bold font-display">{squad.name}</h3>
                      {squad.streakDisplay && (
                        <span className="flex items-center gap-0.5 text-sm font-bold" style={{ color: squad.streakDisplay.color }}>
                          <span className="invert-protect">{squad.streakDisplay.emoji}</span>
                          {squad.streakDisplay.days}
                        </span>
                      )}
                      {squad.activeCommandCount > 0 && (
                        <Badge variant="destructive" className="text-[10px] px-2 py-0 h-5 animate-pulse">
                          {squad.activeCommandCount > 1 ? `${squad.activeCommandCount} ` : ''}LIVE
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 shrink-0">
                        <Users className="w-3.5 h-3.5" />
                        {squad.memberCount}
                      </span>
                      {squad.hasActiveCaptain && (
                        <span className="flex items-center gap-1 truncate">
                          <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="truncate"><span className="invert-protect" style={{ display: 'inline-block' }}>{squad.captainAvatar}</span> {squad.captainUsername} is Captain</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        ) : (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground font-medium">No squads yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create your first squad to get started</p>
          </div>
        )}
      </div>

      {/* Full Version banner */}
      {!isPremium && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-6 p-4 rounded-xl card-game border border-primary/20 cursor-pointer hover:border-primary/40 transition-all"
          onClick={() => {
            playUpgradeSound();
            setShowUpgrade(true);
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Crown className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-display font-bold text-sm">Get Full Version</p>
              <p className="text-xs text-muted-foreground">Unlimited squads · Themes · Stats · One-time purchase</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </motion.div>
      )}

      {/* Daily Spin Button — fixed bottom left */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5 }}
        className="fixed bottom-6 left-6 z-40"
      >
        <button
          className={`rounded-full h-14 w-14 flex items-center justify-center shadow-lg transition-all ${
            hasSpunToday
              ? "bg-muted/50 opacity-40 border border-border"
              : "bg-[hsl(var(--super))] border-2 border-[hsl(var(--super))] shadow-[0_0_16px_hsl(var(--super)/0.5)]"
          }`}
          onClick={() => { playButtonSound(); setShowDailySpin(true); }}
        >
          <span className="text-xl" style={{ filter: "grayscale(1)" }}>🎲</span>
        </button>
      </motion.div>

      {/* SHOP Button — fixed bottom right */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5 }}
        className="fixed bottom-6 right-6 z-40"
      >
        <Button
          variant="serve"
          size="lg"
          className="rounded-full h-14 w-14 p-0 shadow-lg"
          onClick={() => { playButtonSound(); setShowShop(true); }}
          onTouchStart={() => { _shRef.current = setTimeout(() => _setShowAmb(true), 5000); }}
          onTouchEnd={() => { if (_shRef.current) clearTimeout(_shRef.current); }}
          onTouchCancel={() => { if (_shRef.current) clearTimeout(_shRef.current); }}
          onMouseDown={() => { _shRef.current = setTimeout(() => _setShowAmb(true), 5000); }}
          onMouseUp={() => { if (_shRef.current) clearTimeout(_shRef.current); }}
          onMouseLeave={() => { if (_shRef.current) clearTimeout(_shRef.current); }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <ShoppingBag className="w-6 h-6" />
        </Button>
      </motion.div>

      {/* Create Group Dialog */}
      {showCreate && (
        <CreateGroupDialog
          key={`create-squad-${showCreate}`}
          open={showCreate}
          onOpenChange={(open) => {
            setShowCreate(open);
          }}
        />
      )}

      <AppSettings 
        open={showSettings} 
        onOpenChange={setShowSettings} 
        onUsernameChange={forceRefresh} 
        onOpenUpgrade={() => { 
          setShowSettings(false);
          setShowUpgrade(true);
        }} 
      />
      
      <UpgradeDialog 
        open={showUpgrade} 
        onOpenChange={setShowUpgrade} 
        onPurchaseComplete={handleFullVersionActivated}
      />
      
      <ShopDialog
        open={showShop}
        onOpenChange={setShowShop}
        isPremium={isPremium}
        actionCredits={profile?.action_credits ?? 0} 
        superActionCredits={profile?.super_action_credits ?? 0}
        userId={user?.id}
        onBuyFullVersion={() => { 
          setShowShop(false);
          refetchSquads();
          refreshProfile();
        }}
        onBuyActions={() => { 
          setShowShop(false);
          refreshProfile();
          refetchSquads();
        }}
        onBuySuperActions={() => { 
          setShowShop(false);
          refreshProfile();
          refetchSquads();
        }}
        onAdRewardGranted={() => {
          refreshProfile();
          refetchSquads();
        }}
      />
      
      <DailySpinDialog open={showDailySpin} onOpenChange={setShowDailySpin} />
      <AmbientOverlay open={_showAmb} onComplete={() => _setShowAmb(false)} />
      <SquadReorderDialog
        open={showReorder}
        onOpenChange={setShowReorder}
        squads={(squads || []).map(s => ({ id: s.id, name: s.name }))}
        currentOrder={sortPrefs.custom_order}
        onSave={(order) => {
          const newPrefs = { ...sortPrefs, sort_mode: "custom" as SortMode, custom_order: order };
          setSortPrefs(newPrefs);
          if (user?.id) void setUserSquadPreferences(user.id, newPrefs);
        }}
      />
    </div>
  );
};

export default GroupsPage;