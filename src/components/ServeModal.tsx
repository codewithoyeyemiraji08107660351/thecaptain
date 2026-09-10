import { useState, useMemo, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Zap, Timer, ChevronDown, Shuffle } from "lucide-react";
import type { User } from "@/lib/mockData";
import { notificationTriggers } from "@/services/notificationTriggers";
import { isNotificationEnabled } from "@/lib/notifications";
import { useAuth } from "@/contexts/AuthContext";

interface ServeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: User[];
  onServe: (toUserId: string, prompt: string, durationHours: number, isCollateral?: boolean) => void;
  squadId?: string;
  squadName?: string;
  onNotificationSent?: (serveId: string, userIds: string[]) => void;
}

const EXAMPLE_PROMPTS = [
  "Come over and DRINK UP!",
  "Call off that shift tomorrow",
  "Help finish off all the available alchi",
  "Scream out at the top of your lungs",
  "Text your ex 'you up?' and don't explain",
  "Order the extra round",
  "Dance on the table",
  "Wake the neighbours",
  "Make tomorrow regret tonight",
  "Don't go home yet",
  "Lez Hit The Clurbs",
  "Make eye contact and commit",
  "Send the risky text",
  "Make a speech nobody asked for",
  "Start a group FaceTime and cause problems",
  "Take the hit for me",
  "Drink for me for the rest of the night",
  "Chuck it all on BLACK",
  "Chuck it all on RED",
];

const TIME_STEPS = [0.25, 0.5, 0.75, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24];
const DEFAULT_TIME_INDEX = 3;

const formatTime = (hours: number) => {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours}h`;
};

const ServeModal = ({ 
  open, 
  onOpenChange, 
  members, 
  onServe,
  squadId,
  squadName = "Squad",
  onNotificationSent
}: ServeModalProps) => {
  const { user } = useAuth();
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [timeIndex, setTimeIndex] = useState(DEFAULT_TIME_INDEX);
  const [isCollateral, setIsCollateral] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const serveIdRef = useRef<string | null>(null);
  const notificationsSentRef = useRef<Set<string>>(new Set());

  const durationHours = TIME_STEPS[timeIndex];

  const placeholder = useMemo(() => {
    return `"${EXAMPLE_PROMPTS[Math.floor(Math.random() * EXAMPLE_PROMPTS.length)]}"`;
  }, [open]);

  const generateServeId = useCallback((): string => {
    return `serve_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }, []);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      setSelectedUser("");
      setPrompt("");
      setTimeIndex(DEFAULT_TIME_INDEX);
      setIsCollateral(false);
      setIsSending(false);
      serveIdRef.current = null;
      notificationsSentRef.current.clear();
    }
    onOpenChange(newOpen);
  }, [onOpenChange]);

  const handleCollateral = () => {
    if (members.length === 0) return;
    const randomMember = members[Math.floor(Math.random() * members.length)];
    setSelectedUser(randomMember.id);
    setIsCollateral(true);
  };

 
  const sendCommandNotifications = useCallback(async (
    targetUserId: string,
    senderName: string,
    serveId: string
  ) => {
    const notificationIds: string[] = [];
    
    try {
      
      if (isNotificationEnabled('newCommands') && squadId && members.length > 1) {
        const otherMemberIds = members
          .filter(m => m.id !== targetUserId && m.id !== user?.id)
          .map(m => m.id);
        
        if (otherMemberIds.length > 0) {
          const result = await notificationTriggers.triggerNewSquadCommand(
            squadId,
            squadName,
            senderName,
            otherMemberIds
          );
          if (result) {
            otherMemberIds.forEach(id => notificationIds.push(`new_${id}`));
          }
          console.log(`✅ New squad command notification sent to ${otherMemberIds.length} members`);
        }
      }

      if (onNotificationSent) {
        onNotificationSent(serveId, notificationIds);
      }

      return notificationIds;
    } catch (error) {
      console.error('Failed to send command notifications:', error);
      return notificationIds;
    }
  }, [members, squadId, squadName, user?.id, onNotificationSent]);

  const handleServe = async () => {
    if (!selectedUser || !prompt.trim()) return;
    if (isSending) return;
    
    const serveId = generateServeId();
    serveIdRef.current = serveId;
    
    setIsSending(true);
    
    try {
      // ✅ Call the original onServe callback
      onServe(selectedUser, prompt.trim(), durationHours, isCollateral);

      // ✅ Send notifications if user is authenticated
      if (user?.id) {
        const targetUser = members.find(m => m.id === selectedUser);
        const senderName = user.user_metadata?.full_name || 
                          user.email?.split('@')[0] || 
                          'Someone';
        
      
        await sendCommandNotifications(
          selectedUser,
          senderName,
          serveId
        );

        if (isCollateral) {
          toast.success(`🎲 Collateral command sent to a random member!`);
        } else {
          toast.success(`⚓ Command sent to ${targetUser?.username || 'member'}!`);
        }
      }

      setSelectedUser("");
      setPrompt("");
      setTimeIndex(DEFAULT_TIME_INDEX);
      setIsCollateral(false);
      setIsSending(false);
      
      setTimeout(() => {
        onOpenChange(false);
      }, 300);

    } catch (error) {
      console.error('Failed to send command:', error);
      toast.error("Failed to send command. Please try again.");
      setIsSending(false);
    }
  };

  const handleMinimizeKeyboard = () => {
    textareaRef.current?.blur();
  };

  const handleSelectUser = (userId: string) => {
    setSelectedUser(userId);
    setIsCollateral(false);
  };

  const getSelectedUsername = () => {
    const member = members.find(m => m.id === selectedUser);
    return member?.username || 'Unknown';
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-card border-border max-w-md max-h-[85vh] flex flex-col overflow-hidden px-5">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-2xl font-display flex items-center gap-2">
            <Zap className="w-6 h-6 text-accent" />
            Command Someone
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-4 mt-2 pr-2">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-muted-foreground">Your command</label>
                <button
                  onClick={() => toast("⚠️ Reminder:\nCommands must not involve illegal activity, dangerous behaviour, or harm to others.", { duration: 5000 })}
                  className="text-sm cursor-pointer hover:opacity-80 transition-opacity"
                  title="Command Reminder"
                >
                  ⚠️
                </button>
              </div>
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  placeholder={placeholder}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  className="bg-secondary/50 border-border resize-none ring-offset-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 pr-10 text-[16px]"
                  rows={3}
                  disabled={isSending}
                />
                <button
                  type="button"
                  onClick={handleMinimizeKeyboard}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                  title="Minimize keyboard"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-secondary/50">
              <div className="flex items-center gap-2 mb-2">
                <Timer className="w-4 h-4 text-primary" />
                <Label className="text-sm font-semibold">Time Limit</Label>
                <span className="text-sm font-bold text-primary ml-auto">{formatTime(durationHours)}</span>
              </div>
              <Slider
                value={[timeIndex]}
                onValueChange={([v]) => setTimeIndex(v)}
                min={0} max={TIME_STEPS.length - 1} step={1}
                className="w-full"
                disabled={isSending}
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">30 min</span>
                <span className="text-[10px] text-muted-foreground">24h</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-muted-foreground">Who are you commanding?</label>
                <button
                  onClick={handleCollateral}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isCollateral
                      ? "bg-accent/20 text-accent border border-accent/40"
                      : "bg-secondary/50 text-muted-foreground hover:text-foreground border border-border hover:border-accent/40"
                  }`}
                  title="Collateral — Randomly select a target"
                  disabled={isSending}
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  Collateral
                </button>
              </div>

              {isCollateral && selectedUser && (
                <div className="mb-2 p-2 rounded-lg bg-accent/10 border border-accent/30 text-center">
                  <p className="text-xs text-accent font-semibold">
                    🎲 Collateral armed!
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Target will be revealed after command is issued</p>
                </div>
              )}

              {selectedUser && !isCollateral && (
                <div className="mb-2 p-2 rounded-lg bg-primary/10 border border-primary/30 text-center">
                  <p className="text-xs text-primary font-semibold">
                    👤 Target: {getSelectedUsername()}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {members.map(member => (
                  <button
                    key={member.id}
                    onClick={() => handleSelectUser(member.id)}
                    className={`p-3 rounded-xl border text-left transition-all duration-200 ${
                      !isCollateral && selectedUser === member.id
                        ? "border-accent bg-accent/10"
                        : "border-border bg-secondary/50 hover:border-muted-foreground"
                    } ${isSending ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={isSending}
                  >
                    <span className="text-xl mr-2 invert-protect">{member.avatar}</span>
                    <span className="font-medium text-sm">{member.username}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="pt-3 border-t border-border mt-2 shrink-0">
          <Button
            variant="serve"
            className="w-full text-lg py-7"
            disabled={!selectedUser || !prompt.trim() || isSending}
            onClick={handleServe}
          >
            {isSending ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Sending...
              </>
            ) : (
              <>
                <Zap className="w-5 h-5 mr-2" />
                {isCollateral ? "COLLATERAL COMMAND" : "COMMAND"}
                <Zap className="w-5 h-5 ml-2" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ServeModal;