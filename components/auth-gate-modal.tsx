"use client";

import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";

interface AuthGateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnTo?: string;
  title?: string;
  description?: string;
}

export function AuthGateModal({
  open,
  onOpenChange,
  returnTo,
  title = "Sign in required",
  description = "Please sign in or create an account to access this feature.",
}: AuthGateModalProps) {
  const router = useRouter();

  const handleSignIn = () => {
    onOpenChange(false);
    const authUrl = returnTo ? `/auth?next=${encodeURIComponent(returnTo)}` : "/auth";
    router.push(authUrl);
  };

  const handleSignUp = () => {
    onOpenChange(false);
    const authUrl = returnTo ? `/auth?next=${encodeURIComponent(returnTo)}&tab=signup` : "/auth?tab=signup";
    router.push(authUrl);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        onClose={() => onOpenChange(false)} 
        className="sm:max-w-md border-slate-200/60"
        style={{ 
          background: 'linear-gradient(135deg, #ffffff 0%, #f0f7ff 50%, #f8fafc 100%)'
        }}
      >
        {/* Header with accent dot */}
        <div className="mb-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <h2 className="text-xl font-bold text-slate-800">{title}</h2>
          </div>
          <p className="text-slate-600">{description}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <Button
            onClick={handleSignIn}
            className="flex-1 h-11 text-base font-semibold bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl shadow-md shadow-blue-500/20"
          >
            Sign In
          </Button>
          <Button
            onClick={handleSignUp}
            variant="outline"
            className="flex-1 h-11 text-base font-semibold border-slate-300 text-slate-700 hover:bg-blue-50/50 hover:text-slate-800 hover:border-blue-300 rounded-xl"
          >
            Sign Up
          </Button>
        </div>
        <p className="text-center text-sm text-slate-500 mt-4">
          Join Corebound to build strategies, compete in the Arena, and connect with other traders.
        </p>
      </DialogContent>
    </Dialog>
  );
}
