// src/components/AppSettings.tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings, LogOut, Bell, Volume2, Search, Save, Trash2, Loader2, BarChart3, Lock } from "lucide-react";
import LifetimeStatsDialog from "@/components/LifetimeStatsDialog";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getSoundSettings, saveSoundSettings, type SoundSettings, playButtonSound, getAllSoundsMaster, setAllSoundsMaster } from "@/lib/sounds";
import { isBgMusicEnabled, setBgMusicEnabled, startBgMusic, pauseBgMusic, resumeBgMusic } from "@/lib/bg-music";
import { 
  getNotificationSettings, 
  saveNotificationSettings, 
  type NotificationSettings, 
  getAllAlertsMaster, 
  setAllAlertsMaster, 
  NOTIFICATION_LABELS,
  syncNotificationSettingsToSupabase,
  ensureUserNotificationSettings
} from "@/lib/notifications";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface AppSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUsernameChange?: () => void;
  onOpenUpgrade?: () => void;
}

// Standard emoji keyboard order
const AVATARS = [
  "😀", "😍", "🥹", "😱", "😭", "🥳", "🧐", "🤓", "😎", "🥸", "🤩", "🤪", "🤣", "😘",
  "🤥", "🤑", "🤠", "🤯", "🤬", "😶‍🌫️", "🥺", "😷", "🤕", "☹️", "😖", "😣", "😫", "😒",
  "😏", "👽", "💩", "🤡", "👺", "😈", "👹", "💀", "👻", "🤖",
  "👅", "🫦", "💋", "🩸", "🦶", "🦻", "👃", "👂", "👀", "💅", "🫰", "🤏", "🤙",
  "👩‍🎤", "🧑‍🎤", "💂‍♀️", "💂", "🦸‍♂️", "🦹‍♀️", "👨‍🦽", "🧑",
  "🦊", "🐺", "🦅", "🦁", "🐉", "🦈", "🐙", "🦇", "🦂", "🐍", "🦎", "🐊", "🦩", "🐧",
  "⚓", "🔮", "💎", "🗡️", "🛡️", "🏹", "⚔️", "👑", "🏆", "🎲", "🃏", "♠️", "♦️", "♣️", "♥️", "🎯",
  "🔥", "🌸", "🌙", "⛈️", "🌊", "🌋", "❄️", "🌪️",
  "🏴‍☠️", "🎃", "🎭", "🎪", "🎨", "🎵", "🎸", "🥊",
];

const AppSettings = ({ open, onOpenChange, onUsernameChange, onOpenUpgrade }: AppSettingsProps) => {
  const navigate = useNavigate();
  const { profile, signOut, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const [showStats, setShowStats] = useState(false);
  const isPremium = profile?.is_premium ?? false;

  const handleLogout = async () => {
    await signOut();
    onOpenChange(false);
    navigate("/");
  };

  const [stayLoggedIn, setStayLoggedIn] = useState(() => {
    const stored = localStorage.getItem("stay-logged-in");
    return stored === null ? true : stored === "true";
  });
  const [username, setUsername] = useState(profile?.username || "");
  const [selectedAvatar, setSelectedAvatar] = useState(profile?.avatar || "🧑");
  const [soundSettings, setSoundSettings] = useState<SoundSettings>(getSoundSettings());
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(getNotificationSettings());
  const [allAlerts, setAllAlerts] = useState(getAllAlertsMaster());
  const [allSounds, setAllSounds] = useState(getAllSoundsMaster());
  const [bgMusic, setBgMusic] = useState(isBgMusicEnabled());
  const [saving, setSaving] = useState(false);

  const [savedUsername, setSavedUsername] = useState(profile?.username || "");
  const [savedAvatar, setSavedAvatar] = useState(profile?.avatar || "🧑");
  const [savedStayLoggedIn, setSavedStayLoggedIn] = useState(() => {
    const stored = localStorage.getItem("stay-logged-in");
    return stored === null ? true : stored === "true";
  });

  const [usernameChecked, setUsernameChecked] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(true);
  const [checking, setChecking] = useState(false);

  const getLastUsernameChange = (): Date | null => {
    const stored = localStorage.getItem("lastUsernameChange");
    return stored ? new Date(stored) : null;
  };
  const lastChange = getLastUsernameChange();
  const daysSinceChange = lastChange ? Math.floor((Date.now() - lastChange.getTime()) / (1000 * 60 * 60 * 24)) : null;
  const canChangeUsername = daysSinceChange === null || daysSinceChange >= 30;
  const daysRemaining = daysSinceChange !== null ? Math.max(0, 30 - daysSinceChange) : 0;

  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);

  const isDirty = username !== savedUsername || selectedAvatar !== savedAvatar || stayLoggedIn !== savedStayLoggedIn;

  const checkUsername = async () => {
    if (!username.trim() || username === savedUsername) return;
    setChecking(true);
    playButtonSound();
    const { data: available } = await supabase.rpc("check_username_available", { _username: username.trim() });
    const isSelf = username.toLowerCase() === savedUsername?.toLowerCase();
    setUsernameAvailable(available === true || isSelf);
    setUsernameChecked(true);
    setChecking(false);
  };

  const canSave = () => {
    if (!isDirty) return false;
    if (username !== savedUsername) {
      return usernameChecked && usernameAvailable;
    }
    return true;
  };

  const handleSave = async () => {
    playButtonSound();
    if (!profile) return;
    setSaving(true);

    const updates: Record<string, string> = {};
    if (username !== savedUsername) updates.username = username.trim().toLowerCase();
    if (selectedAvatar !== savedAvatar) updates.avatar = selectedAvatar;

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", profile.id);

      if (error) {
        toast.error("Failed to save: " + error.message);
        setSaving(false);
        return;
      }

      if (updates.username) {
        localStorage.setItem("lastUsernameChange", new Date().toISOString());
      }

      await refreshProfile();
      await queryClient.invalidateQueries({ queryKey: ["user-squads"] });
    }

    setSavedUsername(updates.username || savedUsername);
    setSavedAvatar(updates.avatar || savedAvatar);
    localStorage.setItem("stay-logged-in", String(stayLoggedIn));
    setSavedStayLoggedIn(stayLoggedIn);
    setUsernameChecked(false);
    setSaving(false);
    onUsernameChange?.();
    onOpenChange(false);
    toast.success("Settings saved!");
  };

  const handleDiscard = () => {
    playButtonSound();
    setUsername(savedUsername);
    setSelectedAvatar(savedAvatar);
    setStayLoggedIn(savedStayLoggedIn);
    setUsernameChecked(false);
    onOpenChange(false);
  };

  const handleClose = (openState: boolean) => {
    if (openState) return;
    if (isDirty) {
      setShowUnsavedPrompt(true);
    } else {
      onOpenChange(false);
    }
  };

  const updateSound = (key: keyof SoundSettings, val: boolean) => {
    const updated = { ...soundSettings, [key]: val };
    setSoundSettings(updated);
    saveSoundSettings(updated);
  };


  const updateNotif = (key: keyof NotificationSettings, val: boolean) => {
    const updated = { ...notifSettings, [key]: val };
    setNotifSettings(updated);
    saveNotificationSettings(updated);
    
    if (profile?.id) {
      syncNotificationSettingsToSupabase(profile.id);
    }
    
    const allEnabled = Object.values(updated).every(v => v === true);
    const allDisabled = Object.values(updated).every(v => v === false);
    
    if (allEnabled && !allAlerts) {
      setAllAlerts(true);
      setAllAlertsMaster(true);
    }
    if (allDisabled && allAlerts) {
      setAllAlerts(false);
      setAllAlertsMaster(false);
    }
  };


  const toggleAllAlerts = (on: boolean) => {
    setAllAlerts(on);
    setAllAlertsMaster(on);
    
   
    const newSettings = { ...notifSettings };
    (Object.keys(notifSettings) as (keyof NotificationSettings)[]).forEach(key => {
      newSettings[key] = on;
    });
    setNotifSettings(newSettings);
    saveNotificationSettings(newSettings);
    
    if (profile?.id) {
      syncNotificationSettingsToSupabase(profile.id);
    }
  };

  const toggleAllSounds = (on: boolean) => {
    setAllSounds(on);
    setAllSoundsMaster(on);
  };

  const toggleBgMusic = (on: boolean) => {
    setBgMusic(on);
    setBgMusicEnabled(on);
    if (on) {
      startBgMusic();
      resumeBgMusic();
    } else {
      pauseBgMusic();
    }
  };

  const handleTabChange = () => {
    playButtonSound();
  };

  const bottomButtons = (
    <div className="flex gap-2 pt-3 border-t border-border mt-3 shrink-0">
      <Button variant="ghost" className="flex-1 text-muted-foreground hover:text-foreground" onClick={handleDiscard}>
        <Trash2 className="w-4 h-4 mr-1" />Discard
      </Button>
      <Button variant="ghost" className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleLogout}>
        <LogOut className="w-4 h-4 mr-1" />Log Out
      </Button>
      <Button variant="default" className="flex-1" disabled={!canSave() || saving} onClick={handleSave}>
        {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
        Save
      </Button>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent
          className="bg-card border-border max-w-md max-h-[85vh] flex flex-col [&>button]:hidden"
          onInteractOutside={(e) => { if (isDirty) { e.preventDefault(); setShowUnsavedPrompt(true); } }}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-xl font-display flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              General Settings
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="general" className="mt-2 flex-1 flex flex-col min-h-0" onValueChange={handleTabChange}>
            <TabsList className="w-full bg-secondary/50 shrink-0">
              <TabsTrigger value="general" className="flex-1 text-xs">General</TabsTrigger>
              <TabsTrigger value="notifications" className="flex-1 text-xs">
                <Bell className="w-3 h-3 mr-1" />Alerts
              </TabsTrigger>
              <TabsTrigger value="sounds" className="flex-1 text-xs">
                <Volume2 className="w-3 h-3 mr-1" />Sounds
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="flex-1 flex flex-col min-h-0">
              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-5 mt-2 pr-2">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                    <div>
                      <Label className="text-sm font-semibold">Stay Logged In</Label>
                      <p className="text-xs text-muted-foreground">Keep session active</p>
                    </div>
                    <Switch checked={stayLoggedIn} onCheckedChange={setStayLoggedIn} />
                  </div>

                  {/* My Stats Button */}
                  <button
                    onClick={() => { playButtonSound(); setShowStats(true); }}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-secondary/50 hover:bg-secondary/80 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-primary" />
                      <Label className="text-sm font-semibold cursor-pointer">📊 My Stats</Label>
                    </div>
                    {!isPremium && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                  </button>

                  {isPremium ? (
                    <div>
                      <Label className="text-xs text-muted-foreground">Change Username</Label>
                      {!canChangeUsername && (
                        <p className="text-xs text-accent mt-1">🔒 You can change your username again in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}</p>
                      )}
                      <div className="flex gap-2 mt-1">
                        <Input
                          value={username}
                          onChange={e => { if (e.target.value.length <= 15) { setUsername(e.target.value); setUsernameChecked(false); } }}
                          className="bg-secondary/50 border-border flex-1"
                          maxLength={15}
                          disabled={!canChangeUsername}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={checkUsername}
                          disabled={!canChangeUsername || !username.trim() || username === savedUsername || checking}
                          className="shrink-0"
                        >
                          <Search className="w-3.5 h-3.5 mr-1" />
                          {checking ? "..." : "Check"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{username.length}/15 characters • Can be changed once every 30 days</p>
                      {usernameChecked && (
                        <p className={`text-xs mt-1 ${usernameAvailable ? "text-success" : "text-destructive"}`}>
                          {usernameAvailable ? "✅ Username is available!" : "❌ Username is taken. Try another."}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-secondary/50 border border-border">
                      <p className="text-sm font-semibold">🔒 Username changes are a Full Version feature</p>
                      <button
                        className="text-xs text-primary hover:underline mt-1"
                        onClick={() => { onOpenChange(false); onOpenUpgrade?.(); }}
                      >
                        Upgrade — $1.99
                      </button>
                    </div>
                  )}

                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Change Icon</Label>
                    <ScrollArea className="h-[240px]">
                      <div className="grid grid-cols-5 gap-1.5 pr-2">
                        {AVATARS.map(av => (
                          <button
                            key={av}
                            onClick={() => setSelectedAvatar(av)}
                            className={`text-xl p-2 rounded-lg transition-all invert-protect ${
                              selectedAvatar === av ? "bg-primary/20 border border-primary/40 scale-110" : "bg-secondary/50 hover:bg-secondary"
                            }`}
                          >
                            {av}
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </ScrollArea>
              {bottomButtons}
            </TabsContent>

            <TabsContent value="notifications" className="flex-1 flex flex-col min-h-0 data-[state=inactive]:hidden">
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y scrollbar-none pr-2">
                <div className="space-y-2 mt-2">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20">
                    <div>
                      <Label className="text-sm font-semibold">All Alerts</Label>
                      <p className="text-xs text-muted-foreground">Master toggle for all alerts</p>
                    </div>
                    <Switch checked={allAlerts} onCheckedChange={toggleAllAlerts} />
                  </div>
                  {([
                    "receivedCommands",
                    "newCommands",
                    "failedCommands",
                    "newMessages",
                    "mentions",
                    "newMembers",
                    "polls",
                    "creditGifting",
                    "warnings",
                    "actionCreditsAgainstYou",
                    "superActionsAgainstYou",
                    "dailySpinReminder",
                  ] as (keyof NotificationSettings)[]).map((key) => {
                    const meta = NOTIFICATION_LABELS[key];
                    return (
                      <div
                        key={key}
                        className={`flex items-center justify-between p-3 rounded-xl bg-secondary/50 transition-opacity ${!allAlerts ? "opacity-50" : ""}`}
                      >
                        <div className="flex-1 pr-3">
                          <Label className="text-sm font-semibold">{meta.label}</Label>
                          <p className="text-xs text-muted-foreground">{meta.description}</p>
                        </div>
                        <Switch
                          checked={notifSettings[key]}
                          onCheckedChange={v => updateNotif(key, v)}
                          disabled={!allAlerts}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="sounds" className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y scrollbar-none pr-2">
                <div className="space-y-2 mt-2">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20">
                    <div>
                      <Label className="text-sm font-semibold">All Sounds</Label>
                      <p className="text-xs text-muted-foreground">Master toggle for all sounds</p>
                    </div>
                    <Switch checked={allSounds} onCheckedChange={toggleAllSounds} />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                    <Label className="text-sm font-semibold">Background Music</Label>
                    <Switch checked={bgMusic} onCheckedChange={toggleBgMusic} />
                  </div>
                  {allSounds && ([
                    ["buttonPress", "Button Press"],
                    ["newMessages", "New Messages"],
                    ["receiveCommand", "Receive Command"],
                    ["sendCommand", "Send Command"],
                    ["missionResult", "Mission Successful / Mission Failed"],
                    ["promotionDemotion", "Promotion / Demotion"],
                    ["squadSelect", "Squad Select"],
                    ["tabSwitch", "Tab Switch"],
                  ] as [keyof SoundSettings, string][]).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                      <Label className="text-sm">{label}</Label>
                      <Switch checked={soundSettings[key]} onCheckedChange={v => updateSound(key, v)} />
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showUnsavedPrompt} onOpenChange={setShowUnsavedPrompt}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Save your changes?</AlertDialogTitle>
            <AlertDialogDescription>You have unsaved changes. Do you want to save them before closing?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowUnsavedPrompt(false);
              setUsername(savedUsername);
              setSelectedAvatar(savedAvatar);
              setStayLoggedIn(savedStayLoggedIn);
              setUsernameChecked(false);
              onOpenChange(false);
            }}>
              No
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (canSave()) handleSave();
              setShowUnsavedPrompt(false);
              onOpenChange(false);
            }}>
              Yes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lifetime Stats */}
      <LifetimeStatsDialog
        open={showStats}
        onOpenChange={setShowStats}
        userId={profile?.id}
        isPremium={isPremium}
        memberSince={profile ? (profile as any).created_at : undefined}
        onOpenUpgrade={() => { setShowStats(false); onOpenChange(false); onOpenUpgrade?.(); }}
      />
    </>
  );
};

export default AppSettings;