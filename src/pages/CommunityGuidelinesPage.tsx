import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const CommunityGuidelinesPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" className="mb-6" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>

        <h1 className="text-3xl font-display font-bold mb-2 text-primary">Community Guidelines</h1>
        <p className="text-sm text-muted-foreground mb-8"><em>The Captain is designed as a fun social game. To ensure a safe and enjoyable experience for everyone, users must follow these guidelines.</em></p>

        <div className="space-y-8 text-sm text-foreground/90 leading-relaxed">
          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">Respect Other Players</h2>
            <p><em><strong>Users must treat all members with respect.</strong></em></p>
            <p className="mt-2">Do not:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Harass</li>
              <li>Bully</li>
              <li>Threaten</li>
              <li>Intimidate</li>
              <li>Target individuals with abusive behaviour</li>
              <li><em>Engage in discriminatory conduct based on race, gender, sexuality, religion, or any other characteristic</em></li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">No Dangerous Challenges</h2>
            <p><em><strong>Commands must not encourage or require activities that could cause harm.</strong></em></p>
            <p className="mt-2">Prohibited challenges include but are not limited to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Physical harm</li>
              <li>Dangerous stunts</li>
              <li>Excessive alcohol consumption</li>
              <li>Illegal activities</li>
              <li>Harassment of strangers</li>
              <li>Property damage</li>
              <li><em>Self-harm or activities promoting eating disorders</em></li>
              <li><em>Activities that endanger minors or vulnerable persons</em></li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">No Illegal Activity</h2>
            <p><em><strong>The App must not be used to:</strong></em></p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Commit crimes</li>
              <li>Plan illegal behaviour</li>
              <li>Promote illegal substances</li>
              <li>Encourage trespassing or vandalism</li>
              <li><em>Share or distribute illegal content</em></li>
            </ul>
            <p className="mt-2"><em><strong>Users are responsible for complying with all local laws.</strong></em></p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">No Financial Exploitation</h2>
            <p><em><strong>Users may not use the App to:</strong></em></p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Request money</li>
              <li>Conduct scams</li>
              <li>Run betting or gambling schemes</li>
              <li>Manipulate other users financially</li>
              <li><em>Solicit personal financial information</em></li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">No Explicit or Inappropriate Content</h2>
            <p><em>Users must not share sexually explicit, violent, or otherwise inappropriate content within squads. Content that violates community standards may be removed without notice.</em></p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">Moderation</h2>
            <p>The App may remove content or suspend accounts that violate these guidelines.</p>
            <p className="mt-2"><em><strong>Repeated violations may result in permanent account removal.</strong></em></p>
          </section>

          <section>
            <h2 className="text-lg font-display font-bold text-foreground mb-3">Reporting</h2>
            <p><em>If you encounter behaviour that violates these guidelines, please report it to <strong>smurfmunchbowl@gmail.com</strong>. We take all reports seriously and will investigate appropriately.</em></p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default CommunityGuidelinesPage;
