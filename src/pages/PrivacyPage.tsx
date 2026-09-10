import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const PrivacyPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" className="mb-6" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>

        <h1 className="text-3xl font-display font-bold mb-2 text-primary">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8"><em>Last Updated: 10th March 2026</em></p>

        <div className="space-y-8 text-sm text-foreground/90 leading-relaxed">
          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">1. Overview</h2>
            <p>This Privacy Policy explains how <strong>The Captain</strong> collects, uses, and protects your information.</p>
            <p className="mt-2"><em><strong>We are committed to protecting your privacy.</strong></em></p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">2. Information We Collect</h2>
            <p>We may collect the following information:</p>
            
            <h3 className="text-base font-display font-bold text-foreground mt-4 mb-2">Account Information</h3>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Username</li>
              <li>User ID</li>
              <li>Email address</li>
              <li>Squad membership</li>
              <li>Game progress and rankings</li>
            </ul>

            <h3 className="text-base font-display font-bold text-foreground mt-4 mb-2">Usage Data</h3>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Commands issued</li>
              <li>Game interactions</li>
              <li>App usage analytics</li>
            </ul>

            <h3 className="text-base font-display font-bold text-foreground mt-4 mb-2">Device Information</h3>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Device type</li>
              <li>Operating system</li>
              <li>App version</li>
            </ul>

            <h3 className="text-base font-display font-bold text-foreground mt-4 mb-2">Optional Media</h3>
            <p>Users may upload photos or messages within squads.</p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">3. How We Use Your Information</h2>
            <p>Your information may be used to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Operate and maintain the App</li>
              <li>Provide game functionality</li>
              <li>Improve features and performance</li>
              <li>Prevent fraud and abuse</li>
              <li>Enforce rules</li>
              <li><em>Comply with legal obligations</em></li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">4. User Content</h2>
            <p>Content shared within squads (messages, photos, commands) is <em><strong>visible to other squad members.</strong></em></p>
            <p className="mt-2">Photos shared in the Comms system may automatically delete after a set period as described in the app.</p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">5. Data Storage</h2>
            <p>We take reasonable measures to protect your information. However, <em><strong>no online system can be guaranteed 100% secure.</strong></em></p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">6. Third-Party Services</h2>
            <p>The App may use third-party services such as:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Authentication providers</li>
              <li>Analytics tools</li>
              <li>Payment processors</li>
              <li>App store platforms</li>
              <li>Push notification services</li>
            </ul>
            <p className="mt-2"><em>These services may collect information according to their own privacy policies.</em></p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">7. Data Retention</h2>
            <p>We retain data only as long as necessary to operate the App and comply with legal obligations.</p>
            <p className="mt-2"><em><strong>Users may request account deletion where applicable.</strong></em></p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">8. Children's Privacy</h2>
            <p><em><strong>The App is not intended for users under 18.</strong></em></p>
            <p className="mt-2">We do not knowingly collect personal data from minors.</p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">9. Data Breach Notification</h2>
            <p>In the event of a data breach that may affect your personal information, <em><strong>we will notify affected users as soon as reasonably practicable</strong></em> in accordance with applicable data protection laws.</p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">10. Your Rights</h2>
            <p>Subject to applicable law, you may have the right to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to processing of your data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">11. Changes to Privacy Policy</h2>
            <p>We may update this policy periodically. <em><strong>Continued use of the App after updates constitutes acceptance.</strong></em></p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">12. Contact</h2>
            <p>For questions regarding this Privacy Policy:</p>
            <p className="mt-2"><strong>Contact:</strong> smurfmunchbowl@gmail.com</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPage;
