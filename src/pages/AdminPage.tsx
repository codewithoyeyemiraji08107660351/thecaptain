import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Search, Loader2, Plus, Minus } from "lucide-react";

const ADMIN_USER_ID = "10bda2dd-b909-454e-8353-2729536ab6c9"; // smbowl

interface UserResult {
  id: string;
  username: string;
  avatar: string;
  action_credits: number;
  super_action_credits: number;
  completed_commands: number;
  strikes: number;
  warnings: number;
  created_at: string;
}

const AdminPage = () => {
  const { user, isReady } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<UserResult | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<any[]>([]);
  const [creditAmount, setCreditAmount] = useState(1);
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => {
    if (isReady && (!user || user.id !== ADMIN_USER_ID)) {
      navigate("/squads", { replace: true });
    }
  }, [isReady, user, navigate]);

  if (!isReady || !user || user.id !== ADMIN_USER_ID) return null;

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResult(null);
    setEmail(null);
    setActivityLog([]);

    // Search by username
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .ilike("username", query.trim())
      .limit(1);

    if (!data || data.length === 0) {
      toast.error("User not found");
      setSearching(false);
      return;
    }

    const p = data[0];
    setResult({
      id: p.id,
      username: p.username,
      avatar: p.avatar,
      action_credits: p.action_credits,
      super_action_credits: p.super_action_credits,
      completed_commands: p.completed_commands,
      strikes: p.strikes,
      warnings: p.warnings,
      created_at: p.created_at,
    });

    // Fetch email via edge function
    try {
      const { data: emailData } = await supabase.functions.invoke("get-email-by-username", {
        body: { username: p.username },
      });
      if (emailData?.email) setEmail(emailData.email);
    } catch {}

    // Fetch recent activity: squads, spins, bug reports
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const logs: any[] = [];

    // Squad memberships
    const { data: memberships } = await supabase
      .from("squad_members")
      .select("squad_id, joined_at, is_captain")
      .eq("user_id", p.id);
    if (memberships) {
      for (const m of memberships) {
        const { data: squad } = await supabase.from("squads").select("name").eq("id", m.squad_id).maybeSingle();
        logs.push({ type: "membership", squad: squad?.name || m.squad_id, joined: m.joined_at, isCaptain: m.is_captain });
      }
    }

    // Daily spins
    const { data: spins } = await (supabase as any)
      .from("daily_spins")
      .select("*")
      .eq("user_id", p.id);
    if (spins) {
      for (const s of spins as any[]) {
        logs.push({ type: "spin", lastSpinAt: s.last_spin_at, hasReroll: s.has_reroll, chemlightUntil: s.chemlight_until, boostedUntil: s.boosted_odds_until });
      }
    }

    // Bug reports
    const { data: bugs } = await supabase
      .from("bug_reports")
      .select("*")
      .eq("user_id", p.id)
      .gte("created_at", threeDaysAgo)
      .order("created_at", { ascending: false })
      .limit(10);
    if (bugs) {
      for (const b of bugs) {
        logs.push({ type: "bug_report", message: b.message, created_at: b.created_at });
      }
    }

    // Lifetime stats
    const { data: stats } = await (supabase as any)
      .from("user_lifetime_stats")
      .select("*")
      .eq("user_id", p.id)
      .maybeSingle();
    if (stats) {
      logs.push({ type: "lifetime_stats", ...stats });
    }

    setActivityLog(logs);
    setSearching(false);
  };

  const handleAdjustCredits = async (creditType: "action" | "super", delta: number) => {
    if (!result || adjusting) return;
    setAdjusting(true);
    const field = creditType === "action" ? "action_credits" : "super_action_credits";
    const currentVal = creditType === "action" ? result.action_credits : result.super_action_credits;
    const newVal = Math.max(0, currentVal + delta);

    const { error } = await supabase
      .from("profiles")
      .update({ [field]: newVal } as any)
      .eq("id", result.id);

    if (error) {
      toast.error(`Failed: ${error.message}`);
    } else {
      toast.success(`${creditType === "action" ? "Action" : "Super"} Credits updated: ${currentVal} → ${newVal}`);
      setResult({ ...result, [field]: newVal });
    }
    setAdjusting(false);
  };

  return (
    <div className="min-h-screen bg-background p-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/squads")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-display font-bold">Admin Diagnostics</h1>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-6">
        <Input
          placeholder="Search by username..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <Button onClick={handleSearch} disabled={searching}>
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>

      {result && (
        <div className="space-y-4">
          {/* Profile card */}
          <div className="card-game rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl invert-protect">{result.avatar}</span>
              <div>
                <p className="font-display font-bold">{result.username}</p>
                {email && <p className="text-xs text-muted-foreground">{email}</p>}
                <p className="text-xs text-muted-foreground">ID: {result.id}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-secondary/50 rounded-lg p-2">
                <p className="text-muted-foreground">Commands</p>
                <p className="font-bold">{result.completed_commands}</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-2">
                <p className="text-muted-foreground">Strikes / Warnings</p>
                <p className="font-bold">{result.strikes} / {result.warnings}</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-2">
                <p className="text-muted-foreground">Action Credits</p>
                <p className="font-bold text-accent">{result.action_credits}</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-2">
                <p className="text-muted-foreground">Super Credits</p>
                <p className="font-bold" style={{ color: "hsl(270 80% 60%)" }}>{result.super_action_credits}</p>
              </div>
            </div>
          </div>

          {/* Credit Adjustment */}
          <div className="card-game rounded-xl p-4">
            <h3 className="font-display font-bold text-sm mb-3">Manual Credit Adjustment</h3>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-muted-foreground">Amount:</span>
              <Input
                type="number"
                min={1}
                max={999}
                value={creditAmount}
                onChange={(e) => setCreditAmount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 h-8 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" className="text-xs" onClick={() => handleAdjustCredits("action", creditAmount)} disabled={adjusting}>
                <Plus className="w-3 h-3 mr-1" /> Action Credits
              </Button>
              <Button size="sm" variant="destructive" className="text-xs" onClick={() => handleAdjustCredits("action", -creditAmount)} disabled={adjusting}>
                <Minus className="w-3 h-3 mr-1" /> Action Credits
              </Button>
              <Button size="sm" className="text-xs" style={{ background: "hsl(270 80% 60%)" }} onClick={() => handleAdjustCredits("super", creditAmount)} disabled={adjusting}>
                <Plus className="w-3 h-3 mr-1" /> Super Credits
              </Button>
              <Button size="sm" variant="destructive" className="text-xs" onClick={() => handleAdjustCredits("super", -creditAmount)} disabled={adjusting}>
                <Minus className="w-3 h-3 mr-1" /> Super Credits
              </Button>
            </div>
          </div>

          {/* Activity Log */}
          <div className="card-game rounded-xl p-4">
            <h3 className="font-display font-bold text-sm mb-3">Activity (3 days)</h3>
            {activityLog.length === 0 ? (
              <p className="text-xs text-muted-foreground">No activity found</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {activityLog.map((log, i) => (
                  <div key={i} className="text-xs bg-secondary/30 rounded-lg p-2">
                    {log.type === "membership" && (
                      <p>🏴‍☠️ <strong>Squad:</strong> {log.squad} — Joined: {new Date(log.joined).toLocaleDateString()} {log.isCaptain ? "⚓ Captain" : ""}</p>
                    )}
                    {log.type === "spin" && (
                      <p>🎰 <strong>Spin:</strong> Last: {log.lastSpinAt ? new Date(log.lastSpinAt).toLocaleString() : "Never"} | Reroll: {log.hasReroll ? "Yes" : "No"}{log.chemlightUntil ? ` | Chemlight until ${new Date(log.chemlightUntil).toLocaleString()}` : ""}</p>
                    )}
                    {log.type === "bug_report" && (
                      <p>🐛 <strong>Bug:</strong> {log.message} — {new Date(log.created_at).toLocaleString()}</p>
                    )}
                    {log.type === "lifetime_stats" && (
                      <div>
                        <p className="font-bold mb-1">📊 Lifetime Stats</p>
                        <div className="grid grid-cols-2 gap-1">
                          <span>Commands received: {log.commands_received}</span>
                          <span>Commands completed: {log.commands_completed}</span>
                          <span>Commands failed: {log.commands_failed}</span>
                          <span>Commands issued: {log.commands_issued}</span>
                          <span>Total strikes: {log.total_strikes}</span>
                          <span>Total warnings: {log.total_warnings}</span>
                          <span>Action credits used: {log.total_action_credits_used}</span>
                          <span>Super credits used: {log.total_super_credits_used}</span>
                          <span>Total spins: {log.total_spins}</span>
                          <span>Squads joined: {log.total_squads_joined}</span>
                          <span>Shield uses: {log.shield_uses}</span>
                          <span>Coup uses: {log.coup_uses}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPage;