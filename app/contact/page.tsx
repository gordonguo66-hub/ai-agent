"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ContactPage() {
  const [copied, setCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText("support@coreboundai.io");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy email:", err);
    }
  };

  return (
    <div className="min-h-screen bg-[#070d1a] py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-2xl">
        <Card className="border-blue-900/50 bg-[#0A0E1A]">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-white">Contact Us</CardTitle>
            <CardDescription className="text-base text-gray-300 space-y-3 pt-2">
              <p>We'd love to hear your suggestions for improvement.</p>
              <p>For any support inquiries, questions, or feedback, please email us at:</p>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="text-center py-8">
              <div className="relative inline-block">
                {/* Tooltip */}
                {showTooltip && !copied && (
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-2 bg-gray-800 text-white text-sm rounded-lg whitespace-nowrap">
                    Click to copy email
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
                  </div>
                )}
                
                {copied && (
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg whitespace-nowrap">
                    ✓ Copied to clipboard!
                  </div>
                )}

                <button
                  onClick={handleCopyEmail}
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  className="px-12 py-6 bg-blue-950/30 border-2 border-blue-600 rounded-2xl hover:bg-blue-950/50 hover:border-blue-500 transition-all group"
                >
                  <span className="text-2xl text-blue-400 group-hover:text-blue-300 font-medium transition-colors">
                    support@coreboundai.io
                  </span>
                </button>
              </div>
            </div>

            <div className="border-t border-blue-900/30 pt-6">
              <p className="text-sm text-gray-400 text-center leading-relaxed">
                Click to copy the email address, then paste it into your email client.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
