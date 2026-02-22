import { StrategyForm } from "@/components/strategy-form";

export default function NewStrategyPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] page-container">
      <div className="container mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-12">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight mb-1 sm:mb-2">Create Strategy</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Configure your AI trading strategy parameters</p>
          </div>
          <StrategyForm />
        </div>
      </div>
    </div>
  );
}
