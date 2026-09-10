import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Image, Upload, Camera, ArrowDown, ChevronUp, Loader2, X, CornerDownRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Group, GroupMessage, ReplyContext, User } from "@/lib/mockData";
import UserProfileDialog from "@/components/UserProfileDialog";
import { playMessageSendSound, playBubblePopSound, playButtonSound } from "@/lib/sounds";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useGiphySearch } from "@/hooks/use-giphy";
import { isLieutenant } from "@/lib/ranks";
import { supabase } from "@/integrations/supabase/client";
import { getThemeUserColorHues } from "@/lib/squad-themes";

interface GroupActivityFeedProps {
  group: Group;
  currentUser: User;
  onSendMessage: (content: string, mentions: string[], replyTo?: ReplyContext) => void;
  gameActive?: boolean;
  personalTheme?: string;
}

const COLLAPSED_MESSAGES = 4;
const EXPANDED_MAX_HEIGHT = 392; // ~7 messages
const PHOTO_EXPIRY_MS = 2 * 60 * 60 * 1000;
const DOUBLE_TAP_MS = 300;

const GroupActivityFeed = ({ group, currentUser, onSendMessage, gameActive = true, personalTheme = "default" }: GroupActivityFeedProps) => {
  const [input, setInput] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const profileUser = profileUserId ? group.members.find(m => m.id === profileUserId) ?? null : null;
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyContext | null>(null);
  const lastTapRef = useRef<{ id: string; ts: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  // Map of userId -> chemlight activation time (chemlight_until - 24h = activation time)
  const [chemlightData, setChemlightData] = useState<Map<string, { activatedAt: Date; expiresAt: Date }>>(new Map());

  useEffect(() => {
    const memberIds = group.members.map(m => m.id);
    if (memberIds.length === 0) {
      setChemlightData(new Map());
      return;
    }

    let cancelled = false;

    const refreshChemlights = async () => {
      const { data } = await (supabase as any)
        .from("daily_spins")
        .select("user_id, chemlight_until")
        .in("user_id", memberIds);

      if (cancelled || !data) return;

      const now = new Date();
      const map = new Map<string, { activatedAt: Date; expiresAt: Date }>();
      (data as any[]).forEach((d: any) => {
        if (!d.chemlight_until) return;
        const expiresAt = new Date(d.chemlight_until);
        if (expiresAt <= now) return;
        const activatedAt = new Date(expiresAt.getTime() - 24 * 60 * 60 * 1000);
        map.set(d.user_id, { activatedAt, expiresAt });
      });

      setChemlightData(map);
    };

    void refreshChemlights();
    const pollId = window.setInterval(refreshChemlights, 3000);
    const cleanupId = window.setInterval(() => {
      const now = new Date();
      setChemlightData((prev) => new Map([...prev].filter(([, value]) => value.expiresAt > now)));
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      window.clearInterval(cleanupId);
    };
  }, [group.members]);

  const commsMessages = group.messages.filter(msg => {
    if (msg.type === "comment") return true;
    if (msg.type === "action" && /COMMANDS/.test(msg.content)) return true;
    // Squad events: joins, departures, ejections
    if (msg.type === "action" && /has joined the squadron|has abandoned the squadron|has been EJECTED|Welcome aboard/.test(msg.content)) return true;
    return false;
  });

  const [prevMsgCount, setPrevMsgCount] = useState(commsMessages.length);

  const scrollToBottom = useCallback(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (!feedRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
    setShowScrollDown(scrollHeight - scrollTop - clientHeight > 60);
  }, []);

  useEffect(() => {
    if (expanded) scrollToBottom();
    if (commsMessages.length > prevMsgCount && prevMsgCount > 0) {
      playBubblePopSound();
    }
    setPrevMsgCount(commsMessages.length);
  }, [commsMessages.length]);

  useEffect(() => {
    if (!isMobile || !window.visualViewport) {
      setIsKeyboardOpen(false);
      return;
    }
    const handleViewportChange = () => {
      const keyboardHeight = Math.max(0, window.innerHeight - window.visualViewport!.height - window.visualViewport!.offsetTop);
      setIsKeyboardOpen(keyboardHeight > 120);
    };
    handleViewportChange();
    window.visualViewport.addEventListener("resize", handleViewportChange);
    window.visualViewport.addEventListener("scroll", handleViewportChange);
    return () => {
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("scroll", handleViewportChange);
    };
  }, [isMobile]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 88) + "px";
    }
  }, [input]);

  // When expanded, scroll to bottom
  useEffect(() => {
    if (expanded) {
      setTimeout(scrollToBottom, 50);
    }
  }, [expanded]);

  const handleInputChange = (value: string) => {
    setInput(value);
    const pos = textareaRef.current?.selectionStart || 0;
    setCursorPos(pos);
    const textBeforeCursor = value.slice(0, pos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      setShowMentions(true);
      setMentionFilter(atMatch[1].toLowerCase());
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (member: User) => {
    const textBeforeCursor = input.slice(0, cursorPos);
    const textAfterCursor = input.slice(cursorPos);
    const beforeAt = textBeforeCursor.replace(/@\w*$/, "");
    const newText = `${beforeAt}@${member.username} ${textAfterCursor}`;
    setInput(newText);
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  const handleSend = () => {
    if (!input.trim()) return;
    const mentionMatches = input.match(/@(\w+)/g) || [];
    const mentionedUsernames = mentionMatches.map(m => m.slice(1).toLowerCase());

    // Handle @crew — ping all members (3/day limit)
    const hasCrewMention = mentionedUsernames.includes("crew");
    let mentionedIds: string[];
    if (hasCrewMention && canUseCrew) {
      if (!canCrewPingToday) {
        toast.error("You've used all 3 @crew pings for today");
        return;
      }
      mentionedIds = group.members.filter(m => m.id !== currentUser.id).map(m => m.id);
      try {
        const raw = localStorage.getItem(crewPingKey);
        const timestamps: number[] = raw ? JSON.parse(raw) : [];
        timestamps.push(Date.now());
        localStorage.setItem(crewPingKey, JSON.stringify(timestamps));
      } catch {}
    } else {
      mentionedIds = group.members
        .filter(m => mentionedUsernames.includes(m.username.toLowerCase()))
        .map(m => m.id);
    }
    onSendMessage(input.trim(), mentionedIds, replyTarget ?? undefined);
    setInput("");
    setReplyTarget(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    playMessageSendSound();
  };

  const { gifs: giphyGifs, loading: gifsLoading, search: searchGifs, searchQuery: gifSearch } = useGiphySearch();
  const [showGifPicker, setShowGifPicker] = useState(false);

  const sendGif = (url: string) => {
    onSendMessage(`![gif](${url})`, []);
    setShowGifPicker(false);
    playMessageSendSound();
  };

  const compressImage = (file: File, maxWidth = 800, quality = 0.7): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas not supported")); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
      img.src = url;
    });
  };

  const sendPhoto = async (file: File) => {
    try {
      const dataUrl = await compressImage(file);
      onSendMessage(`![photo|${Date.now()}](${dataUrl})`, []);
      setShowGifPicker(false);
      playMessageSendSound();
    } catch {
      toast.error("Failed to process photo");
    }
  };

  const handleImageUpload = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) sendPhoto(file);
    };
    inp.click();
  };

  const handleCameraCapture = () => {
    if (cameraInputRef.current) {
      // Reset value to allow re-selecting same file
      cameraInputRef.current.value = "";
      cameraInputRef.current.click();
    }
  };

  const handleCameraFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) sendPhoto(file);
    e.target.value = "";
  };

  const canUseCrew = isLieutenant(currentUser.completedCommands);
  const crewPingKey = `crew-ping-dates:${group.id}:${currentUser.id}`;
  const MAX_CREW_PINGS_PER_DAY = 3;
  const getCrewPingsToday = (): number => {
    try {
      const raw = localStorage.getItem(crewPingKey);
      if (!raw) return 0;
      const timestamps: number[] = JSON.parse(raw);
      const todayStart = new Date(); todayStart.setHours(0,0,0,0);
      return timestamps.filter(t => t >= todayStart.getTime()).length;
    } catch { return 0; }
  };
  const crewPingsUsedToday = getCrewPingsToday();
  const canCrewPingToday = crewPingsUsedToday < MAX_CREW_PINGS_PER_DAY;

  const filteredMembers = (() => {
    const members = group.members.filter(
      m => m.id !== currentUser.id && m.username.toLowerCase().includes(mentionFilter)
    );
    // Show @crew option for Lieutenant+ when typing @
    if (canUseCrew && "crew".includes(mentionFilter.toLowerCase())) {
      return [{ id: "__crew__", username: "crew", avatar: "📢", completedCommands: 0, strikes: 0, consecutiveFails: 0, warnings: 0, firstName: "", lastName: "", email: "" } as User, ...members];
    }
    return members;
  })();

  const handleUsernameTap = (userId: string) => {
    setProfileUserId(userId);
  };

  const getUserColor = (userId: string) => {
    const sortedIds = [...group.members].map(m => m.id).sort();
    const index = sortedIds.indexOf(userId);
    const total = Math.max(sortedIds.length, 1);
    const themeColors = getThemeUserColorHues(personalTheme);
    if (themeColors.hues.length > 0) {
      // Use theme-specific hue palette
      const hue = themeColors.hues[index % themeColors.hues.length];
      const [satMin, satMax] = themeColors.satRange;
      const [lightMin, lightMax] = themeColors.lightRange;
      const saturation = satMin + (index % 3) * Math.round((satMax - satMin) / 2);
      const lightness = lightMin + (index % 4) * Math.round((lightMax - lightMin) / 3);
      return `hsl(${hue} ${saturation}% ${lightness}%)`;
    }
    // Default: golden angle
    const hue = Math.round((index * 360 / total + index * 137.508) % 360);
    const saturation = 70 + (index % 3) * 10;
    const lightness = 60 + (index % 4) * 5;
    return `hsl(${hue} ${saturation}% ${lightness}%)`;
  };

  const formatMessage = (msg: GroupMessage) => {
    const user = group.members.find(m => m.id === msg.userId);
    // Return raw content — rendering is handled by renderSafeContent
    return { user, content: msg.content, userColor: getUserColor(msg.userId) };
  };

  /** Render message content as safe React nodes — no dangerouslySetInnerHTML */
  const renderSafeContent = (rawContent: string, msg: GroupMessage) => {
    // Split content by @mentions and emoji, render as safe JSX
    const parts: React.ReactNode[] = [];
    // Build a regex that matches @username mentions
    const mentionNames = group.members.map(m => m.username).filter(Boolean);
    const mentionPattern = mentionNames.length > 0
      ? new RegExp(`(@(?:${mentionNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'gi')
      : null;

    const segments = mentionPattern ? rawContent.split(mentionPattern) : [rawContent];
    segments.forEach((seg, i) => {
      if (!seg) return;
      const mentionMatch = mentionPattern && seg.match(/^@(.+)$/i);
      if (mentionMatch) {
        const member = group.members.find(m => m.username.toLowerCase() === mentionMatch[1].toLowerCase());
        if (member) {
          parts.push(
            <span key={i} className="text-primary font-semibold cursor-pointer" onClick={(e) => { e.stopPropagation(); handleUsernameTap(member.id); }}>
              {seg}
            </span>
          );
          return;
        }
      }
      // Wrap emoji chars with invert-protect
      const emojiSplit = seg.split(/([\p{Emoji_Presentation}\p{Extended_Pictographic}])/gu);
      emojiSplit.forEach((part, j) => {
        if (!part) return;
        if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]$/u.test(part)) {
          parts.push(<span key={`${i}-${j}`} className="invert-protect">{part}</span>);
        } else {
          parts.push(<span key={`${i}-${j}`}>{part}</span>);
        }
      });
    });
    return <>{parts}</>;
  };

  const isPhotoExpired = (content: string) => {
    const match = content.match(/!\[photo\|(\d+)\]/);
    if (!match) return false;
    const ts = parseInt(match[1]);
    return Date.now() - ts > PHOTO_EXPIRY_MS;
  };

  const getPhotoUrl = (content: string) => {
    return content.match(/!\[photo\|\d+\]\((.+?)\)/)?.[1] || "";
  };

  const shouldFloatComposer = isMobile && isKeyboardOpen && expanded;

  const displayMessages = expanded ? commsMessages : commsMessages.slice(-COLLAPSED_MESSAGES);

  /**
   * Strip markdown image tokens / shorten content into a clean preview line.
   * For command alerts, reformat as: "Captain › prompt › Target".
   */
  const buildReplyContext = (msg: GroupMessage): ReplyContext => {
    const author = group.members.find(m => m.id === msg.userId);
    const authorName = author?.username || "Crew";

    // Detect a "X COMMANDS Y to: \"prompt\" [..]" alert
    const cmdMatch = msg.type === "action" && msg.content.match(/^(.+?)\s+COMMANDS\s+(.+?)\s+to:\s+"(.+?)"/i);
    if (cmdMatch) {
      const captainName = cmdMatch[1].trim();
      const targetName = cmdMatch[2].trim();
      const prompt = cmdMatch[3].trim();
      const captain = group.members.find(m => m.username.toLowerCase() === captainName.toLowerCase());
      const target = group.members.find(m => m.username.toLowerCase() === targetName.toLowerCase());
      const involved = [captain?.id, target?.id].filter((x): x is string => !!x);
      return {
        messageId: msg.id,
        authorId: msg.userId,
        authorName: captainName,
        kind: "command",
        preview: `${captainName} › ${prompt} › ${targetName}`,
        commandUserIds: involved,
      };
    }

    // GIF / photo previews
    let preview = msg.content;
    if (preview.includes("![gif](")) preview = "🎞️ GIF";
    else if (preview.includes("![photo|")) preview = "📷 Photo";
    else preview = preview.replace(/!\[(?:gif|photo\|\d+)\]\(.+?\)/g, "").trim();

    if (preview.length > 80) preview = preview.slice(0, 77) + "...";
    if (!preview) preview = "Message";

    return {
      messageId: msg.id,
      authorId: msg.userId,
      authorName,
      kind: msg.type === "action" ? "action" : "comment",
      preview,
    };
  };

  /** Track taps on bubbles; when the same bubble is tapped twice within DOUBLE_TAP_MS, start a reply. */
  const handleBubbleTap = (msg: GroupMessage) => {
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.id === msg.id && now - last.ts <= DOUBLE_TAP_MS) {
      lastTapRef.current = null;
      const ctx = buildReplyContext(msg);
      setReplyTarget(ctx);
      setExpanded(true);
      setTimeout(() => textareaRef.current?.focus(), 50);
    } else {
      lastTapRef.current = { id: msg.id, ts: now };
    }
  };

  const renderQuotedReply = (replyTo: ReplyContext) => (
    <div className="mb-1.5 pl-2 border-l-2 border-primary/60 bg-background/40 rounded-r-md py-1 pr-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <CornerDownRight className="w-2.5 h-2.5" />
        <span>Replying to <span className="font-semibold text-foreground/80">{replyTo.authorName}</span></span>
      </div>
      <p className="text-[11px] text-foreground/70 italic break-all [overflow-wrap:anywhere] line-clamp-2">{replyTo.preview}</p>
    </div>
  );

  const renderMessageBubble = (msg: GroupMessage) => {
    const { user, content, userColor } = formatMessage(msg);
    const isGif = content.includes("![gif](");
    const isPhoto = content.includes("![photo|");
    const photoExpired = isPhoto && isPhotoExpired(content);
    // Chemlight: only applies to messages sent AFTER the chemlight was activated
    const chemlightInfo = chemlightData.get(msg.userId);
    const hasChemlight = msg.type === "comment" && !!chemlightInfo && new Date(msg.createdAt) >= chemlightInfo.activatedAt;

    return (
      <div
        key={msg.id}
        className={`p-2 rounded-xl text-xs break-words overflow-hidden [overflow-wrap:anywhere] ${
          msg.type === "action" ? "bg-primary/5 border border-primary/10" : "bg-secondary/50"
        }`}
        style={hasChemlight ? {
          boxShadow: "0 0 0 1.5px rgba(192, 192, 210, 0.5), 0 0 10px 3px rgba(200, 200, 220, 0.4), 0 0 20px 6px rgba(180, 185, 210, 0.2)",
          border: "1px solid rgba(200, 205, 220, 0.7)",
          background: "linear-gradient(135deg, rgba(210, 215, 230, 0.12), rgba(190, 195, 215, 0.08) 45%, rgba(180, 185, 200, 0.05))",
        } : undefined}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          // Skip if a button/link was the actual hit target — let it handle its own click
          if (target.closest("button, a")) return;
          const userId = target.getAttribute("data-userid");
          if (userId) {
            handleUsernameTap(userId);
            return;
          }
          handleBubbleTap(msg);
        }}
        onDoubleClick={(e) => {
          // Desktop fallback for native double-click
          const target = e.target as HTMLElement;
          if (target.closest("button, a")) return;
          const ctx = buildReplyContext(msg);
          setReplyTarget(ctx);
          setExpanded(true);
          setTimeout(() => textareaRef.current?.focus(), 50);
        }}
      >
        {msg.replyTo && renderQuotedReply(msg.replyTo)}
        {msg.type === "comment" && (
          <button
            className="font-semibold text-xs mr-3 transition-colors text-foreground"
            onClick={(e) => { e.stopPropagation(); handleUsernameTap(msg.userId); }}
          >
            <span className="invert-protect">{user?.avatar}</span> {user?.username}
          </button>
        )}
        {isGif ? (
          <img src={content.match(/!\[gif\]\((.+?)\)/)?.[1] || ""} alt="gif" className="rounded-lg max-w-[140px] max-h-[105px] mt-1 invert-protect" loading="lazy" />
        ) : isPhoto ? (
          photoExpired ? (
            <p className="text-xs text-muted-foreground italic mt-1">📷 Photo expired (2hr limit)</p>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); setViewingPhoto(getPhotoUrl(content)); }}>
              <img src={getPhotoUrl(content)} alt="photo" className="rounded-lg max-w-[200px] max-h-[150px] mt-1 cursor-pointer hover:opacity-80 transition-opacity invert-protect" loading="lazy" />
            </button>
          )
        ) : (
          <span className="break-all [overflow-wrap:anywhere]" style={msg.type === "comment" ? { color: userColor, textShadow: hasChemlight ? "0 0 6px rgba(200, 205, 225, 0.8), 0 0 12px rgba(180, 185, 210, 0.5)" : undefined } : undefined}>{renderSafeContent(content, msg)}</span>
        )}
        <span className="text-[9px] text-muted-foreground/60 ml-2">
          {new Date(msg.createdAt).toLocaleDateString([], { day: "numeric", month: "short" })}{" "}
          {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    );
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground font-semibold">Comms</h2>
        {expanded && (
          <button
            onClick={() => setExpanded(false)}
            className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ChevronUp className="w-3 h-3" />
            Collapse
          </button>
        )}
      </div>

      <div className="relative">
        {/* Collapsed: static view of latest messages, tap to expand */}
        {!expanded ? (
          <div
            className="space-y-2 cursor-pointer"
            onClick={() => setExpanded(true)}
          >
            {displayMessages.length === 0 && gameActive && (
              <p className="text-sm text-muted-foreground text-center py-4">No comms yet</p>
            )}
            {displayMessages.map(msg => renderMessageBubble(msg))}
            <p className="text-[10px] text-muted-foreground text-center py-1">
              Tap here to send a message
            </p>
            {!gameActive && (
              <div className="bg-accent/10 border border-accent/30 rounded-lg p-2 text-center">
                <p className="text-xs font-display font-semibold text-accent">⚓ Must have 4 crew members to begin</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Expanded: full scrollable feed */}
            <div
              ref={feedRef}
              onScroll={handleScroll}
              className="space-y-2 overflow-y-auto mb-3 scrollbar-none"
              style={{ maxHeight: `${EXPANDED_MAX_HEIGHT}px` }}
            >
              {commsMessages.map(msg => renderMessageBubble(msg))}
              {commsMessages.length === 0 && gameActive && (
                <p className="text-sm text-muted-foreground text-center py-4">No comms yet</p>
              )}
              {!gameActive && (
                <div className="sticky bottom-0 bg-accent/10 border border-accent/30 rounded-lg p-2 mt-2 text-center">
                  <p className="text-xs font-display font-semibold text-accent">⚓ Must have 4 crew members to begin</p>
                </div>
              )}
            </div>

            {/* Scroll to bottom arrow */}
            {showScrollDown && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-16 right-2 z-10 bg-primary text-primary-foreground rounded-full p-1.5 shadow-lg hover:opacity-90 transition-opacity"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
            )}

            {/* Input — only visible when expanded */}
            {shouldFloatComposer && <div className="h-20" />}
            <div
              className={
                shouldFloatComposer
                  ? "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
                  : "relative sticky bottom-0 bg-background pt-1"
              }
            >
              {showMentions && filteredMembers.length > 0 && (
                <div className="absolute bottom-full mb-1 left-0 w-full bg-popover border border-border rounded-xl shadow-lg p-1 z-10">
                  {filteredMembers.map(member => (
                    <button
                      key={member.id}
                      onClick={() => insertMention(member)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors text-left"
                    >
                      <span className="text-lg invert-protect">{member.avatar}</span>
                      <span className="text-xs font-medium">{member.username}</span>
                    </button>
                  ))}
                </div>
              )}
              {replyTarget && (
                <div className="mb-2 ml-2 flex items-start gap-2 pl-3 pr-2 py-2 bg-secondary/40 border-l-2 border-primary rounded-r-lg">
                  <CornerDownRight className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground">
                      Replying to <span className="font-semibold text-foreground/90">{replyTarget.authorName}</span>
                    </p>
                    <p className="text-[11px] text-foreground/70 italic break-all [overflow-wrap:anywhere] line-clamp-2">
                      {replyTarget.preview}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Cancel reply"
                    onClick={() => { setReplyTarget(null); playButtonSound(); }}
                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-md hover:bg-secondary"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <div className="flex gap-2 items-end">
                <Popover open={showGifPicker} onOpenChange={setShowGifPicker}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-[52px] w-10 shrink-0" title="GIF & Photos" onClick={() => playButtonSound()}>
                      <Image className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-2" side="top" align="start">
                    <div className="flex items-center gap-2 mb-2">
                      <Input placeholder="Search GIFs..." value={gifSearch} onChange={e => searchGifs(e.target.value)} className="text-xs h-8 flex-1" />
                      <Button variant="outline" size="sm" className="h-8 px-2 shrink-0" onClick={handleImageUpload} title="Upload Photo">
                        <Upload className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 px-2 shrink-0" onClick={handleCameraCapture} title="Take Photo">
                        <Camera className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCameraFileChange} key="camera-input" />
                    <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto scrollbar-thin">
                      {gifsLoading && (
                        <div className="col-span-2 flex justify-center py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      {!gifsLoading && giphyGifs.length === 0 && (
                        <p className="col-span-2 text-[10px] text-muted-foreground text-center py-4">No GIFs found</p>
                      )}
                      {!gifsLoading && giphyGifs.map((gif) => (
                        <button key={gif.id} onClick={() => sendGif(gif.url)} className="rounded-lg overflow-hidden hover:ring-2 ring-primary transition-all">
                          <img src={gif.preview || gif.url} alt={gif.title} className="w-full h-20 object-cover" loading="lazy" />
                        </button>
                      ))}
                    </div>
                    
                  </PopoverContent>
                </Popover>
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => handleInputChange(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Type your message here..."
                  className="bg-secondary/50 border-border resize-none min-h-[52px] max-h-[88px] py-3 overflow-y-auto flex-1 text-[16px]"
                  rows={1}
                />
                <Button variant="hero" size="icon" className="shrink-0 h-10 w-10 self-end mb-[6px]" onClick={handleSend} disabled={!input.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Full-size photo viewer */}
      <Dialog open={!!viewingPhoto} onOpenChange={(o) => !o && setViewingPhoto(null)}>
        <DialogContent className="bg-card border-border max-w-lg p-2">
          {viewingPhoto && (
            <div className="flex flex-col items-center gap-2">
              <img src={viewingPhoto} alt="Full photo" className="max-w-full max-h-[70vh] rounded-lg" />
              <a href={viewingPhoto} download="photo.jpg" className="text-xs text-primary hover:underline">
                💾 Save Photo
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <UserProfileDialog
        open={!!profileUser}
        onOpenChange={(open) => !open && setProfileUserId(null)}
        user={profileUser}
        enlistDate={profileUser ? undefined : undefined}
      />
    </div>
  );
};

export default GroupActivityFeed;
