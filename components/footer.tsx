import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-[#070d1a] py-6 mt-auto">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
          <div className="text-gray-400">
            © {new Date().getFullYear()} Corebound. All rights reserved.
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-6 text-gray-400">
              <Link 
                href="/terms" 
                className="hover:text-white transition-colors"
              >
                Terms
              </Link>
              <Link 
                href="/privacy" 
                className="hover:text-white transition-colors"
              >
                Privacy
              </Link>
              <Link 
                href="/risk" 
                className="hover:text-white transition-colors"
              >
                Risk
              </Link>
            </div>
            <Link href="/contact">
              <Button 
                size="sm" 
                variant="outline"
                className="bg-transparent border border-blue-700 text-white hover:text-white hover:border-blue-500 hover:bg-blue-900/50 transition-all"
              >
                Contact Us
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
