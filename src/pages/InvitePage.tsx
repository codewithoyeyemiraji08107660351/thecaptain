// src/pages/InvitePage.tsx
import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { savePendingInvite } from "@/utils/inviteStorage";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { notificationTriggers } from "@/services/notificationTriggers";
import { isNotificationEnabled } from "@/lib/notifications";
import { toast } from "sonner";

// ============================================
// ✅ HELPER: Send notification with settings check
// ============================================
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

const InvitePage = () => {
  const { code } = useParams();
  const { user, isReady } = useAuth();
  const navigate = useNavigate();
  const processedRef = useRef(false);
  const isMountedRef = useRef(true);
  const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
        notificationTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = isMountedRef.current;

    if (!code || !isReady) return;

    if (processedRef.current) return;
    processedRef.current = true;

    const processInviteCode = async () => {
      await savePendingInvite(code);
    };

    processInviteCode();

    if (user) {
      const processInvite = async () => {
        try {
          // Look up squad by invite code
          const { data: squadData, error: squadError } = await supabase
            .rpc("lookup_squad_by_invite_code", { _invite_code: code });

          if (squadError || !squadData || squadData.length === 0) {
            console.error("Invalid invite code:", squadError);
            if (isMounted) toast.error("Invalid or expired invite link");
            if (isMounted) navigate("/squads", { replace: true });
            return;
          }

          const squad = squadData[0];
          
          // Check if already a member
          const { data: existingMember } = await supabase
            .from("squad_members")
            .select("id")
            .eq("squad_id", squad.id)
            .eq("user_id", user.id)
            .maybeSingle();

          if (existingMember) {
            if (isMounted) toast.info("You are already a member of this squad");
            if (isMounted) navigate("/squads", { replace: true });
            return;
          }

          // Add user to squad
          const { error: joinError } = await supabase
            .from("squad_members")
            .insert({
              squad_id: squad.id,
              user_id: user.id,
              is_captain: false,
              joined_at: new Date().toISOString(),
            });

          if (joinError) {
            console.error("Failed to join squad:", joinError);
            if (isMounted) toast.error("Failed to join squad");
            if (isMounted) navigate("/squads", { replace: true });
            return;
          }

          // Get user profile for display name
          const { data: userProfile } = await supabase
            .from("profiles")
            .select("username, first_name, last_name, avatar")
            .eq("id", user.id)
            .single();

          const memberName = userProfile?.username || 
                             userProfile?.first_name || 
                             (userProfile?.first_name && userProfile?.last_name 
                               ? `${userProfile.first_name} ${userProfile.last_name}` 
                               : null) ||
                             "A new member";

          // ✅ Get existing members to notify (exclude the new member)
          const { data: existingMembers, error: membersError } = await supabase
            .from("squad_members")
            .select("user_id")
            .eq("squad_id", squad.id)
            .neq("user_id", user.id);

          if (membersError) {
            console.error("Failed to fetch existing members:", membersError);
          }

          // ✅ FIXED: Send new member notifications with proper settings check
          if (existingMembers && existingMembers.length > 0) {
            console.log(`📨 Sending ${existingMembers.length} new member notifications...`);
            
            // ✅ Set timeout to prevent hanging
            notificationTimeoutRef.current = setTimeout(() => {
              console.warn("⚠️ Notification sending taking too long, continuing...");
            }, 5000);

            try {
              // ✅ Use the helper function with 'newMembers' key
              const notificationResults = await Promise.allSettled(
                existingMembers.map(member => 
                  sendNotificationIfEnabled('newMembers', async () => {
                    return await notificationTriggers.triggerNewMember(
                      member.user_id,
                      memberName,
                      squad.id,
                      squad.name
                    );
                  })
                )
              );

              const successful = notificationResults.filter(r => r.status === 'fulfilled').length;
              const failed = notificationResults.filter(r => r.status === 'rejected').length;
              
              if (failed > 0) {
                console.warn(`⚠️ Sent ${successful}/${existingMembers.length} notifications (${failed} failed)`);
              } else if (successful > 0) {
                console.log(`✅ Sent ${successful} new member notifications`);
              }
              
              // ✅ Log detailed results for debugging
              notificationResults.forEach((result, index) => {
                if (result.status === 'rejected') {
                  console.error(`❌ Notification ${index + 1} failed:`, result.reason);
                }
              });
              
            } catch (notificationError) {
              console.error("Error sending notifications:", notificationError);
            } finally {
              if (notificationTimeoutRef.current) {
                clearTimeout(notificationTimeoutRef.current);
                notificationTimeoutRef.current = null;
              }
            }
          } else {
            console.log("ℹ️ No existing members to notify");
          }

          if (isMounted) {
            toast.success(`🎉 Welcome to ${squad.name}!`);
            navigate("/squads", { replace: true });
          }
          
        } catch (error) {
          console.error("Error processing invite:", error);
          if (isMounted) {
            toast.error("Something went wrong. Please try again.");
            navigate("/squads", { replace: true });
          }
        }
      };

      processInvite();
    } else {
      if (isMounted) navigate("/", { replace: true });
    }
  }, [code, user, isReady, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
};

export default InvitePage;