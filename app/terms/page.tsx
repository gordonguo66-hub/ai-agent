export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#070d1a] py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <div className="bg-[#0A0E1A] border border-blue-900/50 rounded-lg p-8">
          <h1 className="text-3xl font-bold text-white mb-6">Terms of Service</h1>
          <div className="prose prose-invert max-w-none space-y-6 text-gray-300">
            <p className="text-sm text-gray-400">Last Updated: 2026-02-01</p>
            
            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">1. Acceptance of Terms</h2>
              <p>
                By accessing or using Corebound ("the Platform"), you agree to be bound by these Terms of Service. 
                "Corebound" refers to the trading strategy platform and associated services accessible at coreboundai.io, operated as a technology service.
                If you do not agree to these terms, do not use the Platform.
              </p>
              <p className="mt-4 font-semibold text-yellow-400">
                No Fiduciary Relationship: These Terms do not create any partnership, joint venture, employment, agency, or fiduciary relationship between 
                you and Corebound. We do not act as your fiduciary, advisor, or in any similar capacity.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">2. Description of Service</h2>
              <p>
                Corebound provides a platform for creating and testing AI-powered trading strategies. The Platform allows users to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Design trading strategies using AI models</li>
                <li>Test strategies with virtual capital</li>
                <li>Connect to supported exchanges for live trading (at user's discretion)</li>
                <li>Participate in performance leaderboards</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">3. No Financial Advice</h2>
              <p className="font-semibold text-yellow-400">
                Corebound and its operators do NOT provide financial, investment, or trading advice. The Platform is provided for informational and educational purposes only.
              </p>
              <p>
                All trading decisions are made solely by you. We do not recommend any specific trading strategy, asset, or action. You are responsible for your own investment research and decisions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">4. Regulatory Positioning</h2>
              <p className="font-semibold text-yellow-400">
                Corebound is NOT a broker, dealer, investment advisor, commodity trading advisor (CTA), or any other regulated financial entity.
              </p>
              <p>
                We are a software platform that provides tools for creating and testing trading strategies. You are solely responsible for 
                determining if your use of the Platform complies with applicable regulations in your jurisdiction. We do not provide regulatory 
                compliance advice.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">5. User Responsibilities and Acceptable Use</h2>
              <p>You agree to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Provide accurate account information</li>
                <li>Maintain the security of your account credentials and API keys</li>
                <li>Comply with all applicable laws and regulations</li>
                <li>Not use the Platform for illegal, fraudulent, or unauthorized purposes</li>
                <li>Not engage in market manipulation, wash trading, or other prohibited trading practices</li>
                <li>Not attempt to hack, reverse engineer, scrape, or disrupt the Platform</li>
                <li>Not abuse, overload, or interfere with Platform infrastructure</li>
                <li>Not impersonate others or misrepresent your identity</li>
                <li>Not violate intellectual property rights of Corebound or third parties</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">6. AI and Automation Risks</h2>
              <p>
                AI models can be unpredictable and may produce unexpected results. Past performance of any strategy does not guarantee future results. 
                Automated trading carries significant risks including the potential for rapid losses. See our Risk Disclosure for more details.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">7. No Warranties - "As-Is" Service</h2>
              <p className="font-semibold text-yellow-400">
                THE PLATFORM IS PROVIDED "AS-IS" AND "AS-AVAILABLE" WITHOUT ANY WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.
              </p>
              <p>
                To the maximum extent permitted by law, Corebound disclaims all warranties including but not limited to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Warranties of merchantability, fitness for a particular purpose, and non-infringement</li>
                <li>Warranties that the Platform will be uninterrupted, error-free, or secure</li>
                <li>Warranties regarding the accuracy, reliability, or completeness of any data or content</li>
                <li>Warranties that defects will be corrected or that the Platform is free of viruses</li>
              </ul>
              <p className="mt-4">
                You acknowledge that your use of the Platform is at your sole risk and discretion.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">8. Limitation of Liability</h2>
              <p className="font-semibold text-red-400">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, COREBOUND AND ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Trading losses, investment losses, or loss of profits</li>
                <li>Indirect, incidental, special, consequential, or punitive damages</li>
                <li>Loss of data, revenue, goodwill, or business opportunities</li>
                <li>Damages arising from unauthorized access, data breaches, or security incidents</li>
                <li>Damages caused by third-party services, exchanges, or AI providers</li>
                <li>Damages from Platform errors, bugs, downtime, or unavailability</li>
              </ul>
              <p className="mt-4 font-semibold">
                IN NO EVENT SHALL OUR TOTAL LIABILITY EXCEED THE GREATER OF (A) THE FEES YOU PAID US IN THE 12 MONTHS PRIOR TO THE EVENT GIVING RISE TO LIABILITY, OR (B) $100 USD.
              </p>
              <p className="mt-4">
                This limitation applies regardless of the legal theory (contract, tort, negligence, strict liability, or otherwise) and even if 
                we have been advised of the possibility of such damages. Some jurisdictions do not allow exclusion of certain warranties or 
                limitation of liability, so some limitations may not apply to you.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">9. Indemnification</h2>
              <p>
                You agree to indemnify, defend, and hold harmless Corebound and its affiliates, officers, directors, employees, agents, licensors, and 
                service providers from and against any and all claims, liabilities, damages, losses, costs, expenses, or fees (including reasonable 
                attorneys' fees) arising from or relating to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Your use or misuse of the Platform</li>
                <li>Your violation of these Terms of Service</li>
                <li>Your violation of any applicable laws or regulations</li>
                <li>Your trading activities and any resulting losses</li>
                <li>Your infringement of any third-party rights (intellectual property, privacy, etc.)</li>
                <li>Any content or data you submit to the Platform</li>
                <li>Your use of third-party exchanges or AI providers</li>
              </ul>
              <p className="mt-4">
                We reserve the right to assume exclusive defense and control of any matter subject to indemnification, and you agree to cooperate 
                with our defense of such claims.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">10. Third-Party Services and Integrations</h2>
              <p>
                The Platform enables you to integrate with third-party services including cryptocurrency exchanges (e.g., Hyperliquid), 
                AI model providers (e.g., OpenAI, Anthropic, Google, DeepSeek), and other services. Important disclaimers:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>No Control:</strong> We do not control, operate, or endorse any third-party services</li>
                <li><strong>Your Relationship:</strong> Any integration is directly between you and the third party</li>
                <li><strong>No Liability:</strong> We are not responsible for third-party actions, errors, downtime, data breaches, policy changes, or fees</li>
                <li><strong>API Keys:</strong> You are responsible for securing and managing your API keys. We store them encrypted but are not liable for unauthorized use</li>
                <li><strong>Exchange Risks:</strong> We do not custody funds. All trading occurs directly with your exchange account via API</li>
                <li><strong>Your Due Diligence:</strong> Review third-party terms before connecting any service</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">11. Termination and Effect of Termination</h2>
              <p>
                <strong>We may terminate or suspend your account:</strong>
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Immediately for violations of these Terms</li>
                <li>For suspicious activity, fraud, or abuse</li>
                <li>For prolonged inactivity</li>
                <li>At our sole discretion with or without notice</li>
              </ul>
              <p className="mt-4">
                <strong>You may terminate your account</strong> at any time by contacting support@coreboundai.io.
              </p>
              <p className="mt-4">
                <strong>Effect of Termination:</strong> Upon termination, your right to access the Platform immediately ceases. We may delete your 
                account data, though we may retain certain information as required by law or for legitimate business purposes. The following sections 
                survive termination: Sections 3 (No Financial Advice), 7 (No Warranties), 8 (Limitation of Liability), 9 (Indemnification), 
                12 (Intellectual Property), and 15 (Governing Law).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">12. Intellectual Property</h2>
              <p>
                All content, trademarks, logos, software, and intellectual property on the Platform are owned by Corebound or its licensors and are 
                protected by copyright, trademark, and other laws. You are granted a limited, non-exclusive, non-transferable license to access and 
                use the Platform for its intended purpose only.
              </p>
              <p className="mt-4">You may not:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Copy, modify, distribute, sell, or lease any part of the Platform</li>
                <li>Reverse engineer, decompile, or attempt to extract source code</li>
                <li>Remove or alter any proprietary notices</li>
                <li>Use Corebound trademarks without written permission</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">13. Changes to Service and Terms</h2>
              <p>
                We reserve the right to modify, suspend, or discontinue any part of the Platform at any time without notice or liability. 
                We may also update these Terms of Service at any time by posting the revised terms on the Platform.
              </p>
              <p className="mt-4">
                Your continued use after changes constitutes acceptance of the updated terms. We will indicate the "Last Updated" date at the top. 
                For material changes, we may provide additional notice via email or prominent Platform notification.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">14. Assignment and Transfer</h2>
              <p>
                You may not assign or transfer your rights or obligations under these Terms without our prior written consent. 
                We may assign or transfer our rights and obligations to any affiliate or successor entity without restriction.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">15. Governing Law and Dispute Resolution</h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of England and Wales, without regard to conflict of law principles.
              </p>
              <p className="mt-4">
                <strong>Arbitration Agreement:</strong> Any dispute, claim, or controversy arising out of or relating to these Terms or your use of the 
                Platform shall be resolved by binding arbitration seated in London, United Kingdom, in accordance with the rules of the London Court of 
                International Arbitration (LCIA). The arbitration shall be conducted in English by a single arbitrator.
              </p>
              <p className="mt-4">
                <strong>Class Action Waiver:</strong> You agree to resolve disputes on an individual basis only. You waive any right to participate in 
                class-action lawsuits or class-wide arbitration.
              </p>
              <p className="mt-4">
                <strong>Exceptions:</strong> Either party may seek injunctive relief in any court of competent jurisdiction to prevent infringement of 
                intellectual property rights.
              </p>
              <p className="mt-4 font-semibold">
                <strong>Consumer Rights:</strong> Nothing in this section limits or waives any non-waivable consumer rights you may have under applicable law 
                in your jurisdiction.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">16. Severability</h2>
              <p>
                If any provision of these Terms is found to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full 
                force and effect. The invalid provision shall be modified to the minimum extent necessary to make it valid and enforceable.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">17. Entire Agreement and No Waiver</h2>
              <p>
                These Terms of Service, together with our Privacy Policy and Risk Disclosure, constitute the entire agreement between you and Corebound 
                regarding the Platform and supersede all prior agreements or understandings.
              </p>
              <p className="mt-4">
                Our failure to enforce any right or provision of these Terms shall not constitute a waiver of such right or provision. Any waiver must 
                be in writing and signed by an authorized representative of Corebound.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">18. Contact</h2>
              <p>
                For questions about these Terms of Service, contact us at: <a href="mailto:support@coreboundai.io" className="text-blue-400 hover:underline">support@coreboundai.io</a>
              </p>
              <p className="mt-2">
                Website: <a href="https://coreboundai.io" className="text-blue-400 hover:underline">coreboundai.io</a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
