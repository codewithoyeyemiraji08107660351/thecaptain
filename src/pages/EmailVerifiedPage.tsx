import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Anchor, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const EmailVerifiedPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative bg-background">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-md w-full"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 mb-8"
        >
          <CheckCircle className="w-10 h-10 text-primary" />
        </motion.div>

        <h1 className="text-3xl sm:text-4xl font-bold font-display tracking-tight mb-4 text-foreground">
          Email Verified
        </h1>

        <p className="text-muted-foreground text-base sm:text-lg mb-8">
          Thank you for verifying your email. Please return to the app to deploy or press the button below.
        </p>

        <Button
          variant="hero"
          size="lg"
          className="text-lg px-10 py-6"
          onClick={() => navigate("/", { replace: true })}
        >
          <Anchor className="w-5 h-5 mr-2" />
          Return to Base
        </Button>
      </motion.div>
    </div>
  );
};

export default EmailVerifiedPage;
