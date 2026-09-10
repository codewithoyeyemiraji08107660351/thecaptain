import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const SafetyDisclaimerPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" className="mb-6" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>

        <h1 className="text-3xl font-display font-bold mb-2 text-primary">Safety Disclaimer</h1>
        <p className="text-sm text-muted-foreground mb-8"><em>Risk Acknowledgement</em></p>

        <div className="space-y-8 text-sm text-foreground/90 leading-relaxed">
          <section>
            <p><strong>The Captain</strong> is a social entertainment game where players may issue commands or challenges to other players.</p>
            <p className="mt-3"><em><strong>By using this App you acknowledge and agree that:</strong></em></p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>All commands and challenges are created by users</li>
              <li>The App does not verify, approve, or monitor all challenges</li>
              <li>Participation in any challenge is voluntary</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">Your Rights</h2>
            <p><em><strong>You are never required to perform a command or challenge.</strong></em></p>
            <p className="mt-2"><em><strong>You may decline any challenge</strong></em> that you believe to be unsafe, illegal, or inappropriate.</p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">Assumption of Risk</h2>
            <p><em><strong>By participating in any challenge you acknowledge that:</strong></em></p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li><em><strong>you do so entirely at your own risk</strong></em></li>
              <li>you are responsible for assessing your own safety</li>
              <li>you are responsible for complying with local laws</li>
              <li><em>you are responsible for any consequences arising from your participation</em></li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">No Liability</h2>
            <p><em><strong>To the fullest extent permitted by law, the App and its owner are not responsible for:</strong></em></p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Personal injury</li>
              <li>Health issues</li>
              <li>Accidents</li>
              <li>Property damage</li>
              <li>Emotional distress</li>
              <li>Financial loss</li>
              <li>Criminal charges</li>
              <li>Misuse of the App by other users</li>
              <li><em>Any indirect, incidental, or consequential damages</em></li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">Responsible Use</h2>
            <p><em><strong>Users must exercise good judgment</strong></em> and avoid any activity that could:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Endanger themselves</li>
              <li>Endanger others</li>
              <li>Violate laws</li>
              <li><em>Cause physical, emotional, or financial harm</em></li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">Emergency</h2>
            <p><em>If you or someone else is in immediate danger, please contact your local emergency services immediately. The App is not a substitute for professional advice, emergency services, or law enforcement.</em></p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default SafetyDisclaimerPage;
