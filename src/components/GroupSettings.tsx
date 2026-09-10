// src/components/GroupSettings.tsx
import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Settings, Crown, Link, UserMinus, Shield, Copy, Check, ChevronUp, ChevronDown, BookOpen, LogOut, Clock, Share2, Bug, Send, Gift, Palette, Lock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import type { Group, User } from "@/lib/mockData";
import { getMaxCaptains, getMaxCaptainFails } from "@/lib/mockData";
import RankBadge from "@/components/RankBadge";
import { getRank, isViceAdmiral, isAdmiral, isChiefPettyOfficer } from "@/lib/ranks";
import { Input } from "@/components/ui/input";
import { playButtonSound, playTabSwitchSound } from "@/lib/sounds";
import SquadThemeSelector from "@/components/SquadThemeSelector";
import GiftCreditsDialog from "@/components/GiftCreditsDialog";

interface GroupSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: Group;
  currentUser: User;
  isPremium?: boolean;
  onUpdateGroup: (group: Group) => void;
  onEjectMember: (userId: string) => void;
  onPromoteMember?: (userId: string) => void;
  onDemoteMember?: (userId: string) => void;
  onRemoveStrike?: (userId: string) => void;
  onLeaveGroup?: () => void;
  onResetSquad?: () => void;
  onTransferAdmin?: (userId: string) => void;
  rankActionLoading?: Record<string, boolean>;
  onOpenUpgrade?: () => void;
  // ✅ Add refresh callback
  onRefreshGroup?: () => void;
}

const GroupSettings = ({ 
  open, 
  onOpenChange, 
  group, 
  currentUser, 
  isPremium = false, 
  onUpdateGroup, 
  onEjectMember, 
  onPromoteMember, 
  onDemoteMember, 
  onRemoveStrike, 
  onLeaveGroup, 
  onResetSquad, 
  onTransferAdmin, 
  rankActionLoading = {}, 
  onOpenUpgrade,
  onRefreshGroup // ✅ New prop
}: GroupSettingsProps) => {
  const isAdmin = currentUser.id === group.adminId || isAdmiral(currentUser.completedCommands);
  const canManageRanks = isAdmin || isViceAdmiral(currentUser.completedCommands);
  const maxAllowed = getMaxCaptains(group.members.length);
  const [copied, setCopied] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const [ejectTarget, setEjectTarget] = useState<string | null>(null);
  const ejectMember = group.members.find(m => m.id === ejectTarget);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showTransferListFromSettings, setShowTransferListFromSettings] = useState(false);
  const [transferTargetFromSettings, setTransferTargetFromSettings] = useState<User | null>(null);
  const transferEligibleSettings = group.members.filter(m => 
    m.id !== currentUser.id && m.id !== group.adminId && !isAdmiral(m.completedCommands)
  );
  const [holdProgress, setHoldProgress] = useState(0);
  const holdStartRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);
  const [showBugReport, setShowBugReport] = useState(false);
  const [bugMessage, setBugMessage] = useState("");
  const [bugSending, setBugSending] = useState(false);
  const [bugSent, setBugSent] = useState(false);
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [giftTarget, setGiftTarget] = useState<User | null>(null);

  const handleSubmitBugReport = async () => {
    if (!bugMessage.trim() || bugSending) return;
    setBugSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-bug-report", {
        body: {
          message: bugMessage.trim(),
          username: currentUser.username,
          squad_id: group.id,
        },
      });
      if (error) throw error;
      setBugSent(true);
      setBugMessage("");
      setTimeout(() => { setBugSent(false); setShowBugReport(false); }, 4000);
    } catch (err: any) {
      toast.error("Failed to submit bug report");
    } finally {
      setBugSending(false);
    }
  };

  const startHold = useCallback(() => {
    holdStartRef.current = Date.now();
    const tick = () => {
      const elapsed = Date.now() - holdStartRef.current;
      const progress = Math.min(elapsed / 3000, 1);
      setHoldProgress(progress);
      if (progress >= 1) {
        setShowResetConfirm(true);
        setHoldProgress(0);
        return;
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const stopHold = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    setHoldProgress(0);
  }, []);

  const sortedMembers = [...group.members].sort((a, b) => b.completedCommands - a.completedCommands);

  const handleCaptainCountChange = (count: number) => {
    if (count < 1 || count > maxAllowed) return;
    onUpdateGroup({ ...group, captainCount: count });
  };

  const handleToggleOpen = (isOpen: boolean) => {
    onUpdateGroup({ ...group, isOpen });
  };

  const [generatingLink, setGeneratingLink] = useState(false);

  const generateAndCopyLink = async () => {
    setGeneratingLink(true);
    const { data, error } = await (supabase.rpc as any)("regenerate_invite_link", { _squad_id: group.id });
    setGeneratingLink(false);
    if (error || !data || !data[0]) {
      navigator.clipboard.writeText(group.inviteCode);
    } else {
      const newCode = data[0].invite_code;
      navigator.clipboard.writeText(newCode);
      onUpdateGroup({ ...group, inviteCode: newCode });
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareApp = async () => {
    playButtonSound();
    const shareData = {
      title: "THE CAPTAIN",
      text: "Join me on THE CAPTAIN — the ultimate dare & command game! 🏴‍☠️",
      url: "https://thecaptain.app/download",
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch {}
    } else {
      navigator.clipboard.writeText(shareData.url);
    }
  };

  const handleClose = (openState: boolean) => {
    if (openState) return;
    onOpenChange(false);
  };

  const canGenerateLink = isAdmin || group.isOpen;
  const isMemberAdmiral = (member: User) => isAdmiral(member.completedCommands);
  const isMemberAdmin = (member: User) => member.id === group.adminId || isMemberAdmiral(member);

  const handleGiftSuccess = useCallback(async (amount: number) => {
    // Show success toast
    toast.success(`✅ ${amount} credit${amount > 1 ? "s" : ""} gifted to ${giftTarget?.username}!`);
    
    // ✅ Update the group with refreshed member data
    if (onRefreshGroup) {
      onRefreshGroup();
    }
    
    onUpdateGroup({ ...group });
    
    // ✅ Clear the gift target
    setGiftTarget(null);
  }, [giftTarget, onRefreshGroup, onUpdateGroup, group]);

  return (
    <>
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card border-border max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-2xl font-display flex items-center gap-2">
            <Settings className="w-6 h-6 text-primary" />
            Squad Settings
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="mt-2 flex-1 flex flex-col min-h-0" onValueChange={() => playTabSwitchSound()}>
          <TabsList className="w-full bg-secondary/50 shrink-0">
            <TabsTrigger value="general" className="flex-1 text-xs">General</TabsTrigger>
            <TabsTrigger value="members" className="flex-1 text-xs">Crew</TabsTrigger>
            <TabsTrigger value="rules" className="flex-1 text-xs">
              <BookOpen className="w-3 h-3 mr-1" />Rules
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="flex-1 min-h-0 !mt-1">
            <div className="h-[55vh] overflow-y-auto overscroll-contain touch-pan-y scrollbar-none pr-2">
              <div className="space-y-5 mt-4">
                {isAdmin && (
                  <div className="p-4 rounded-xl bg-secondary/50">
                    <Label className="text-sm font-semibold mb-2 block">Squad Name</Label>
                    <div className="flex gap-2">
                      <Input value={editName} onChange={e => { if (e.target.value.length <= 20) setEditName(e.target.value); }} className="bg-background/50" maxLength={20} />
                      <Button variant="outline" size="sm" onClick={() => { playButtonSound(); onUpdateGroup({ ...group, name: editName }); }} disabled={!editName.trim() || editName === group.name}>Save</Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{editName.length}/20 characters</p>
                  </div>
                )}

                <div className="p-4 rounded-xl bg-secondary/50">
                  <div className="flex items-center gap-2 mb-3">
                    <Crown className="w-4 h-4 text-primary" />
                    <Label className="text-sm font-semibold">Number of Captains</Label>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    With {group.members.length} members, you can have up to {maxAllowed} captain{maxAllowed > 1 ? "s" : ""}.
                  </p>
                  {isAdmin ? (
                    <div className="flex gap-2">
                      {Array.from({ length: maxAllowed }, (_, i) => i + 1).map(n => (
                        <button
                          key={n}
                          onClick={() => handleCaptainCountChange(n)}
                          className={`w-10 h-10 rounded-lg font-bold text-sm transition-all ${
                            group.captainCount === n
                              ? "bg-primary text-primary-foreground glow-primary"
                              : "bg-background border border-border hover:border-primary/40"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm font-medium">
                      Currently {group.currentCardHolderIds.length} captain{group.currentCardHolderIds.length > 1 ? "s" : ""}
                    </p>
                  )}
                </div>

                {/* Punishment Time Limit */}
                {isAdmin && (
                  <div className="p-4 rounded-xl bg-secondary/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-accent" />
                      <Label className="text-sm font-semibold">Punishment Time Limit</Label>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">How long the punished member has to complete their punishment.</p>
                    <div className="flex items-center gap-3">
                      <Slider
                        value={[group.punishmentDurationHours]}
                        onValueChange={([v]) => onUpdateGroup({ ...group, punishmentDurationHours: v })}
                        min={1} max={48} step={1}
                        className="flex-1"
                      />
                      <span className="text-sm font-bold w-10 text-right">{group.punishmentDurationHours}h</span>
                    </div>
                  </div>
                )}

                {/* Captain Fail Limit */}
                {isAdmin && (
                  <div className="p-4 rounded-xl bg-secondary/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Crown className="w-4 h-4 text-accent" />
                      <Label className="text-sm font-semibold">Captain Fail Limit</Label>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      How many failed commands before a Captain loses the title. 0 = unlimited. Max {getMaxCaptainFails(group.members.length)} for {group.members.length} members.
                    </p>
                    <div className="flex gap-2">
                      {Array.from({ length: getMaxCaptainFails(group.members.length) + 1 }, (_, i) => i).map(n => (
                        <button
                          key={n}
                          onClick={() => onUpdateGroup({ ...group, captainFailLimit: n })}
                          className={`w-10 h-10 rounded-lg font-bold text-sm transition-all ${
                            (group.captainFailLimit ?? 3) === n
                              ? "bg-accent text-accent-foreground"
                              : "bg-background border border-border hover:border-accent/40"
                          }`}
                        >
                          {n === 0 ? "∞" : n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Open Squad */}
                {isAdmin && (
                  <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/50">
                    <div>
                      <Label className="text-sm font-semibold">Open Squad</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {group.isOpen ? "Any member can generate invite links" : "Only admins can generate invite links"}
                      </p>
                    </div>
                    <Switch checked={group.isOpen} onCheckedChange={handleToggleOpen} />
                  </div>
                )}

                {/* Squad Theme */}
                <button
                  onClick={() => { playButtonSound(); setShowThemeSelector(true); }}
                  className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary/50 hover:bg-secondary/80 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-primary" />
                    <Label className="text-sm font-semibold cursor-pointer">🎨 Squad Theme</Label>
                  </div>
                  {!isPremium && (
                    <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </button>

                {canGenerateLink && (
                  <div className="p-4 rounded-xl bg-secondary/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Link className="w-4 h-4 text-primary" />
                      <Label className="text-sm font-semibold">Invite Code</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-sm font-mono bg-background/50 px-3 py-2 rounded-lg border border-border text-center tracking-widest font-bold">
                        {group.inviteCode}
                      </code>
                      <Button variant="outline" size="sm" onClick={generateAndCopyLink} disabled={generatingLink}>
                        {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">Generates a 10-min invite link and copies to clipboard</p>
                  </div>
                )}

                {!canGenerateLink && (
                  <div className="p-4 rounded-xl bg-secondary/50 text-center">
                    <Shield className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      This is a closed squad. Only admins can generate invite links.
                    </p>
                  </div>
                )}

                {/* Leave Group */}
                <Button
                  variant="ghost"
                  className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 font-semibold"
                  onClick={() => {
                    playButtonSound();
                    if (onLeaveGroup) onLeaveGroup();
                    onOpenChange(false);
                  }}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Leave Squad
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="members" className="!mt-1 flex-1 min-h-0 flex flex-col">
            <div className="h-[50vh] overflow-y-auto overscroll-contain touch-pan-y scrollbar-none pr-2">
              <div className="space-y-2 mt-4">
                {sortedMembers.map(member => {
                  const memberIsAdmin = isMemberAdmin(member);
                  const memberIsAdmiral = isMemberAdmiral(member);
                  return (
                    <div key={member.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
                      <span className="text-2xl invert-protect">{member.avatar}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-xs truncate">{member.username}</span>
                          {memberIsAdmin && (() => {
                            const isCurrentUserNonAdmiralAdmin = currentUser.id === group.adminId && !isAdmiral(currentUser.completedCommands);
                            const canTransfer = isCurrentUserNonAdmiralAdmin && onTransferAdmin && member.id === currentUser.id;
                            return canTransfer ? (
                              <button
                                className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold shrink-0 hover:bg-primary/20 transition-colors cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowTransferListFromSettings(true);
                                }}
                              >
                                Admin
                              </button>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold shrink-0">Admin</span>
                            );
                          })()}
                        </div>
                        <p className="text-xs text-muted-foreground">{getRank(member.completedCommands).title}</p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        {isChiefPettyOfficer(currentUser.completedCommands) && member.strikes > 0 && (
                          <span className="text-xs">{"❌".repeat(Math.min(member.strikes, 3))}</span>
                        )}
                        {member.warnings > 0 && (
                          <span className="text-xs">{"⚠️".repeat(Math.min(member.warnings, 3))}</span>
                        )}
                        <div className="flex items-center gap-1">
                          <RankBadge completedCommands={member.completedCommands} strikes={member.strikes} warnings={member.warnings} showStrikes={false} showWarnings={false} />
                          {member.id !== currentUser.id && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-primary hover:text-primary" onClick={() => setGiftTarget(member)} title="Gift Credits">
                              <Gift className="w-4 h-4" />
                            </Button>
                          )}
                          {canManageRanks && !memberIsAdmiral && member.id !== group.adminId && member.id !== currentUser.id && (
                            <>
                              {isAdmin && onRemoveStrike && member.strikes > 0 && (
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => onRemoveStrike(member.id)} title="Remove Strike">
                                  ❎
                                </Button>
                              )}
                              {onPromoteMember && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-success hover:text-success"
                                  onClick={() => onPromoteMember(member.id)}
                                  title="Promote"
                                  disabled={!!rankActionLoading[member.id]}
                                >
                                  <ChevronUp className="w-4 h-4" />
                                </Button>
                              )}
                              {onDemoteMember && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-accent hover:text-accent"
                                  onClick={() => onDemoteMember(member.id)}
                                  title="Demote"
                                  disabled={!!rankActionLoading[member.id]}
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </Button>
                              )}
                              {isAdmin && (
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setEjectTarget(member.id)} title="Eject">
                                  <UserMinus className="w-4 h-4" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Share App & Reset Buttons */}
            <div className="pt-3 border-t border-border mt-5 shrink-0 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-auto py-2"
                onClick={handleShareApp}
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share App
              </Button>
              {currentUser.id === group.adminId && onResetSquad && (
                <Button
                  variant="destructive"
                  className="relative overflow-hidden select-none h-auto py-2"
                  onMouseDown={startHold}
                  onMouseUp={stopHold}
                  onMouseLeave={stopHold}
                  onTouchStart={startHold}
                  onTouchEnd={stopHold}
                  onTouchCancel={stopHold}
                >
                  {holdProgress > 0 && (
                    <div
                      className="absolute inset-0 bg-destructive-foreground/20 transition-none"
                      style={{ width: `${holdProgress * 100}%` }}
                    />
                  )}
                  <span className="relative z-10 flex flex-col items-center leading-tight text-xs">
                    <span className="font-bold">Reset</span>
                    <span className="opacity-80 text-[10px]">Hold for 3 sec</span>
                  </span>
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="rules" className="!mt-0 flex-1 min-h-0 !pt-0">
            <div className="flex justify-end mb-1 mt-0.5">
              <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={() => { playButtonSound(); setShowBugReport(true); }}>
                <Bug className="w-3 h-3" />
                Report Bug
              </Button>
            </div>
            <div className="h-[50vh] overflow-y-auto overscroll-contain touch-pan-y scrollbar-none pr-2">
              {/* ... rules content (unchanged) ... */}
              <div className="space-y-3">
                {/* Simplified Gameplay */}
                <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
                  <h3 className="font-display font-bold text-sm mb-2 text-primary">🎮 How To Play</h3>
                  <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                    <li><strong className="text-foreground">The Captain issues a command</strong> — a dare or task — to a fellow crew member with a time limit.</li>
                    <li><strong className="text-foreground">Complete, fail, or use an action</strong> — the crew member can complete the mission, fail it (earning a strike), or spend an Action Credit to redirect/block it.</li>
                    <li><strong className="text-foreground">Success = promotion</strong> — completing the mission earns you The Captain title, a rank-up, and the power to command next.</li>
                    <li><strong className="text-foreground">3 strikes = punishment</strong> — fail 3 missions and the squad votes on your punishment. 3 warnings = ejection.</li>
                    <li><strong className="text-foreground">Be Strategic</strong> — use Actions to redirect commands, Super Actions to overthrow Captains or swap ranks, and unlock milestone abilities as you climb the ranks to gain the upper hand.</li>
                    <li><strong className="text-foreground">Climb the ranks</strong> — progress from Pleb to Admiral across 20 ranks. Unlock special abilities at milestone ranks. See how far your squad can go!</li>
                  </ol>
                </div>
                {/* ... rest of rules (unchanged) ... */}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!ejectTarget} onOpenChange={(open) => { if (!open) setEjectTarget(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eject {ejectMember?.username}?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to eject this member from the squadron? This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setEjectTarget(null)}>Nay</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (ejectTarget) { onEjectMember(ejectTarget); setEjectTarget(null); } }}>Yay</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure you want to fully reset the squad?</AlertDialogTitle>
          <AlertDialogDescription>
            This will reset all crew members' ranks to Pleb, remove all strikes and warnings, and trigger a new Captain Lottery.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Nay</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { setShowResetConfirm(false); onResetSquad?.(); }}>Yay</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Admin Transfer from Squad Settings */}
    <Dialog open={showTransferListFromSettings} onOpenChange={setShowTransferListFromSettings}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg font-display">👑 Transfer Admin Authority</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">Select a crew member to transfer admin authority to:</p>
        <div className="max-h-[400px] overflow-y-auto overscroll-contain touch-pan-y scrollbar-none pr-2">
          <div className="space-y-1.5">
            {transferEligibleSettings.map(member => {
              const rank = getRank(member.completedCommands);
              return (
                <button
                  key={member.id}
                  onClick={() => {
                    setTransferTargetFromSettings(member);
                    setShowTransferListFromSettings(false);
                  }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-secondary/50 hover:bg-secondary/80 transition-colors text-left"
                >
                  <span className="text-xl invert-protect">{member.avatar}</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-xs truncate">{member.username}</span>
                    <p className="text-[10px] text-muted-foreground">{rank.title}</p>
                  </div>
                  <RankBadge completedCommands={member.completedCommands} strikes={member.strikes} showStrikes={false} size="sm" />
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!transferTargetFromSettings} onOpenChange={(o) => !o && setTransferTargetFromSettings(null)}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure you want to transfer Admin Authority?</AlertDialogTitle>
          <AlertDialogDescription>
            You are about to transfer admin authority to <strong>{transferTargetFromSettings?.username}</strong>. You will become a normal crew member.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setTransferTargetFromSettings(null)}>Nay</AlertDialogCancel>
          <AlertDialogAction
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => {
              if (transferTargetFromSettings && onTransferAdmin) {
                onTransferAdmin(transferTargetFromSettings.id);
                setTransferTargetFromSettings(null);
                setShowTransferListFromSettings(false);
                onOpenChange(false);
              }
            }}
          >
            Yar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Bug Report Dialog */}
    <Dialog open={showBugReport} onOpenChange={(o) => { if (!o) { setShowBugReport(false); setBugSent(false); setBugMessage(""); } }}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg font-display">🐛 Report Bug</DialogTitle>
        </DialogHeader>
        {bugSent ? (
          <div className="text-center py-4">
            <p className="text-sm font-semibold text-foreground">Thank you kindly for reporting this bug,</p>
            <p className="text-sm font-semibold text-foreground">the developers will look into this!</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              value={bugMessage}
              onChange={(e) => setBugMessage(e.target.value.slice(0, 500))}
              placeholder="Please provide in great detail of the bug that you are reporting"
              className="min-h-[120px] text-sm resize-none"
              maxLength={500}
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">{bugMessage.length}/500</span>
              <Button
                variant="hero"
                size="sm"
                className="gap-1"
                disabled={!bugMessage.trim() || bugSending}
                onClick={handleSubmitBugReport}
              >
                <Send className="w-3 h-3" />
                {bugSending ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Squad Theme Selector */}
    <SquadThemeSelector
      open={showThemeSelector}
      onOpenChange={setShowThemeSelector}
      currentTheme={group.theme || "default"}
      isPremium={isPremium}
      onSelectTheme={(theme) => onUpdateGroup({ ...group, theme })}
      onOpenUpgrade={onOpenUpgrade}
    />

    {/* ✅ Gift Credits Dialog - Fixed with proper onSuccess */}
    <GiftCreditsDialog
      open={!!giftTarget}
      onOpenChange={(o) => { 
        if (!o) setGiftTarget(null); 
      }}
      recipient={giftTarget}
      senderCredits={currentUser.actionCredits}
      senderId={currentUser.id}
      senderName={currentUser.username}
      onSuccess={handleGiftSuccess}
    />
    </>
  );
};

export default GroupSettings;