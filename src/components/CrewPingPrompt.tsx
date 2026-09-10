import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { playBubblePopSound } from "@/lib/sounds";

export interface CrewPingEvent {
  id: string;
  fromUserId: string;
  fromUsername: string;
  fromAvatar: string;
  message: string;
  timestamp: number;
  audienceUserIds: string[];
  seenByUserIds: string[];
}

const CrewPingPrompt = ({
  event,
  currentUserId,
  onDismiss,
}: {
  event: CrewPingEvent | null;
  currentUserId: string;
  onDismiss: () => void;
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!event || event.fromUserId === currentUserId) {
      setVisible(false);
      return;
    }
    // Check if current user is in audience and hasn't seen it
    if (!event.audienceUserIds.includes(currentUserId)) {
      setVisible(false);
      return;
    }
    if (event.seenByUserIds.includes(currentUserId)) {
      setVisible(false);
      return;
    }

    setVisible(true);
    playBubblePopSound();
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, 10000);
    return () => clearTimeout(timer);
  }, [event?.id, currentUserId]);

  if (!visible || !event) return null;

  return (
    <Dialog open={visible} onOpenChange={(open) => { if (!open) { setVisible(false); onDismiss(); } }}>
      <DialogContent className="bg-card border-primary/30 max-w-xs text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center gap-3 py-4"
        >
          <motion.span
            className="text-4xl invert-protect"
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 0.8, repeat: 2 }}
          >
            📢
          </motion.span>
          <div className="flex items-center gap-2">
            <span className="text-2xl invert-protect">{event.fromAvatar}</span>
            <p className="text-sm font-display font-bold text-primary">@{event.fromUsername}</p>
          </div>
          <p className="text-sm text-foreground break-words">{event.message}</p>
          <p className="text-[10px] text-muted-foreground/60 animate-pulse">Auto-dismisses in 10 seconds</p>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

export default CrewPingPrompt;
