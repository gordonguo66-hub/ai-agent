import { StrategyForm } from "@/components/strategy-form";
import { AuthGuard } from "@/components/auth-guard";

export default function NewStrategyPage() {
  return (
    <AuthGuard>
      <div className="min-h-[calc(100vh-4rem)] bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="max-w-3xl mx-auto">
            <div className="mb-8">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">Create Strategy</h1>
              <p className="text-muted-foreground">Configure your AI trading strategy parameters</p>
            </div>
            <StrategyForm />
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
