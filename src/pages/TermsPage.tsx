import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const TermsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" className="mb-6" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>

        <h1 className="text-3xl font-display font-bold mb-2 text-primary">Terms and Conditions</h1>
        <p className="text-sm text-muted-foreground mb-8"><em>Last Updated: 10th March 2026</em></p>

        <div className="space-y-8 text-sm text-foreground/90 leading-relaxed">
          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">1. Acceptance of Terms</h2>
            <p>By creating an account, downloading, or using <strong>The Captain</strong> ("the App"), you agree to be bound by these Terms and Conditions. <em><strong>If you do not agree, you must not use the App.</strong></em></p>
            <p className="mt-2">The App is a social entertainment platform that allows users to issue challenges and interact with other members within private groups ("Squads").</p>
            <p className="mt-2"><em><strong>You must be at least 18 years old</strong></em> (or the legal age in your jurisdiction) to use the App.</p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">2. Entertainment Purpose Only</h2>
            <p><em><strong>The App is intended solely for entertainment purposes.</strong></em></p>
            <p className="mt-2">Challenges, commands, tasks, and other user-generated activities are created by users and are <em><strong>not endorsed, verified, or approved</strong></em> by the App or its owner.</p>
            <p className="mt-2"><em><strong>Users participate in any activity entirely at their own risk.</strong></em></p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">3. User Responsibility</h2>
            <p><em><strong>You agree that you are fully responsible for your actions and decisions</strong></em> when using the App.</p>
            <p className="mt-2">You must not:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Issue illegal tasks</li>
              <li>Encourage dangerous behaviour</li>
              <li>Harass, threaten, or abuse other users</li>
              <li>Violate local laws</li>
              <li>Use the App for fraud or scams</li>
              <li>Use the App to promote criminal activity</li>
            </ul>
            <p className="mt-2">You acknowledge that the App cannot control or monitor all user activity.</p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">4. Assumption of Risk</h2>
            <p>By using the App, you acknowledge that some activities suggested or created by users may involve physical activity, social pressure, or personal risk.</p>
            <p className="mt-2"><em><strong>You agree that you:</strong></em></p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li><em><strong>voluntarily participate in any challenge</strong></em></li>
              <li><em><strong>may decline or ignore any command at any time</strong></em></li>
              <li>are responsible for evaluating whether an activity is safe</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">5. Limitation of Liability</h2>
            <p><em><strong>To the maximum extent permitted by law, the App and its owner shall not be liable for any damages</strong></em>, including but not limited to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>personal injury</li>
              <li>accidents</li>
              <li>property damage</li>
              <li>health complications</li>
              <li>emotional distress</li>
              <li>financial loss</li>
              <li>loss of income</li>
              <li>criminal charges or legal consequences</li>
              <li>misuse of the App by other users</li>
            </ul>
            <p className="mt-2"><em><strong>The App does not supervise or enforce challenges and cannot guarantee the safety or legality of any activity.</strong></em></p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">6. User-Generated Content</h2>
            <p>Users may create commands, messages, images, and other content.</p>
            <p className="mt-2">By submitting content, you agree that:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>you are responsible for the content you create</li>
              <li>the content does not violate laws or rights of others</li>
              <li>the App may remove content at its discretion</li>
            </ul>
            <p className="mt-2">The App does not guarantee monitoring of all content.</p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">7. In-App Purchases</h2>
            <p>The App may offer optional in-app purchases including:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Action Credits</li>
              <li>Super Action Credits</li>
              <li>Premium upgrades</li>
            </ul>
            <p className="mt-2"><em><strong>All purchases are processed through the respective app stores and are non-refundable except where required by law.</strong></em></p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">8. Account Termination</h2>
            <p>The App reserves the right to suspend or terminate accounts that:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>violate these Terms</li>
              <li>engage in abusive behaviour</li>
              <li>attempt to exploit or manipulate the system</li>
              <li>violate laws</li>
            </ul>
            <p className="mt-2"><em><strong>Termination may occur without prior notice.</strong></em></p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">9. Disclaimer of Warranties</h2>
            <p><em><strong>The App is provided "as is" and "as available."</strong></em></p>
            <p className="mt-2">We make no guarantees that:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>the App will always be available</li>
              <li>the App will be error-free</li>
              <li>other users will behave appropriately</li>
              <li>challenges or interactions will be safe</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">10. Indemnification</h2>
            <p><em><strong>You agree to indemnify and hold harmless</strong></em> the App, its owner, and affiliates from any claims, damages, losses, liabilities, legal fees, or expenses arising from:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>your use of the App</li>
              <li>your participation in challenges</li>
              <li>your violation of laws</li>
              <li>your violation of these Terms</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">11. Changes to Terms</h2>
            <p>These Terms may be updated at any time. <em><strong>Continued use of the App after changes constitutes acceptance of the updated Terms.</strong></em></p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">12. Governing Law</h2>
            <p>These Terms are governed by the <em><strong>laws of Australia</strong></em>, without regard to conflict of law principles.</p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">13. Challenge Participation & Liability Waiver</h2>
            <p>By using The Captain and participating in any commands, challenges, or missions issued within the App, you acknowledge and agree to the following:</p>
            
            <h3 className="text-base font-display font-bold text-foreground mt-4 mb-2">Voluntary Participation</h3>
            <p>All commands, challenges, or tasks within the App are created and issued by users, <em><strong>not by the App or its owner.</strong></em></p>
            <p className="mt-2"><em><strong>Participation in any challenge is entirely voluntary.</strong></em> You are never required to perform any task, command, or activity suggested by another user.</p>
            <p className="mt-2">You agree that you may <em><strong>decline, ignore, or refuse any command at any time</strong></em> if you believe it may be unsafe, illegal, inappropriate, or beyond your personal comfort level.</p>

            <h3 className="text-base font-display font-bold text-foreground mt-4 mb-2">14. Release of Liability</h3>
            <p><em><strong>To the maximum extent permitted by law</strong></em>, you agree to release, waive, and discharge the App, its owner, developers, operators, and affiliates from any and all liability for:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>injury or death</li>
              <li>health complications</li>
              <li>accidents or incidents</li>
              <li>property damage</li>
              <li>financial losses</li>
              <li>legal consequences</li>
              <li>criminal activity committed by users</li>
              <li>misuse of the App by other users</li>
              <li>challenges created or performed by users</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsPage;
