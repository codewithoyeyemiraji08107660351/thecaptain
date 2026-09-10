import { motion, AnimatePresence } from "framer-motion";
import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdmiralAnnouncementProps {
  open: boolean;
  username: string;
  avatar: string;
  completedCommands: number;
  failedMissions: number;
  commandsIssued: number;
  coupsPerformed: number;
  onDismiss: () => void;
}

const AdmiralAnnouncement = ({
  open, username, avatar, completedCommands,
  failedMissions, commandsIssued, coupsPerformed, onDismiss,
}: AdmiralAnnouncementProps) => {
  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[250] flex items-center justify-center"
        style={{
          background: "radial-gradient(ellipse at center, rgba(255,215,0,0.1) 0%, rgba(0,0,0,0.95) 70%)",
        }}
      >
        {/* Golden particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 30 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full"
              style={{
                background: i % 3 === 0 ? "gold" : i % 3 === 1 ? "#FFD700" : "#FFA500",
                left: `${Math.random() * 100}%`,
                top: `${100 + Math.random() * 20}%`,
                boxShadow: "0 0 8px 3px gold",
              }}
              animate={{
                y: [0, -window.innerHeight * 1.2],
                opacity: [0, 1, 1, 0],
                x: [0, (Math.random() - 0.5) * 100],
              }}
              transition={{
                duration: 3 + Math.random() * 2,
                repeat: Infinity,
                delay: Math.random() * 3,
              }}
            />
          ))}
        </div>

        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.4, delay: 0.2 }}
          className="flex flex-col items-center px-8 py-6 max-w-sm relative z-10"
        >
          <motion.div
            animate={{ rotate: [0, -5, 5, -3, 0] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
          >
            <Crown className="w-12 h-12 mb-4" style={{ color: "gold", filter: "drop-shadow(0 0 12px gold)" }} />
          </motion.div>

          <motion.div
            className="text-6xl mb-3 invert-protect"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            style={{ filter: "drop-shadow(0 0 12px gold)" }}
          >
            {avatar}
          </motion.div>

          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-xl font-display font-black text-center mb-1"
            style={{ color: "gold", textShadow: "0 0 20px rgba(255,215,0,0.5)" }}
          >
            {username} has reached ADMIRAL
          </motion.p>

          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-xs text-muted-foreground mb-4"
          >
            after completing {completedCommands} commands
          </motion.p>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="w-full space-y-1.5 mb-6"
          >
            <div className="flex justify-between text-xs px-4 py-1.5 rounded-lg bg-secondary/30">
              <span className="text-muted-foreground">Missions failed</span>
              <span className="font-bold">{failedMissions}</span>
            </div>
            <div className="flex justify-between text-xs px-4 py-1.5 rounded-lg bg-secondary/30">
              <span className="text-muted-foreground">Commands issued</span>
              <span className="font-bold">{commandsIssued}</span>
            </div>
            <div className="flex justify-between text-xs px-4 py-1.5 rounded-lg bg-secondary/30">
              <span className="text-muted-foreground">Coups performed</span>
              <span className="font-bold">{coupsPerformed}</span>
            </div>
          </motion.div>

          <Button
            variant="hero"
            className="w-full"
            style={{ background: "linear-gradient(135deg, #FFD700, #FFA500)", color: "#000" }}
            onClick={onDismiss}
          >
            👑 All Hail the Admiral!
          </Button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AdmiralAnnouncement;
