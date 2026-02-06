export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#070d1a] py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <div className="bg-[#0A0E1A] border border-blue-900/50 rounded-lg p-8">
          <h1 className="text-3xl font-bold text-white mb-6">Privacy Policy</h1>
          <div className="prose prose-invert max-w-none space-y-6 text-gray-300">
            <p className="text-sm text-gray-400">Last Updated: 2026-02-01</p>
            
            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">1. Data Controller</h2>
              <p>
                Corebound (the trading strategy platform accessible at coreboundai.io) is the data controller responsible for your personal data collected 
                through the Platform ("we," "us," or "our"). "Corebound" refers to the platform and associated services operated as a technology service.
              </p>
              <p className="mt-4">
                For data protection inquiries, contact: <a href="mailto:support@coreboundai.io" className="text-blue-400 hover:underline">support@coreboundai.io</a>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">2. Information We Collect</h2>
              <p>When you use Corebound, we may collect:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Account Information:</strong> Email address, username, password (encrypted)</li>
                <li><strong>Profile Data:</strong> Display name, avatar, bio, and other optional profile information</li>
                <li><strong>Trading Data:</strong> Strategies you create, trading sessions, performance metrics</li>
                <li><strong>API Keys:</strong> Encrypted credentials for AI providers and exchanges (if you connect them)</li>
                <li><strong>Usage Data:</strong> IP address, browser type, device information, pages visited</li>
                <li><strong>Legal Acceptance:</strong> Timestamp and metadata when you accept our Terms and Risk Disclosure</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">3. How We Use Your Information</h2>
              <p>We process your personal data for the following purposes:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Provide and maintain the Platform</li>
                <li>Process your trading strategies and execute trades (when authorized)</li>
                <li>Display leaderboard and community features</li>
                <li>Communicate with you about your account</li>
                <li>Improve and optimize the Platform</li>
                <li>Comply with legal obligations</li>
                <li>Prevent fraud and abuse</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">4. Legal Bases for Processing</h2>
              <p>We process your personal data based on the following legal grounds:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Contract Performance:</strong> Processing necessary to provide the Platform services you requested</li>
                <li><strong>Legitimate Interests:</strong> Platform improvement, fraud prevention, security, and analytics</li>
                <li><strong>Consent:</strong> Where you have provided explicit consent (e.g., marketing communications)</li>
                <li><strong>Legal Obligation:</strong> Compliance with applicable laws and regulations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">5. Data Sharing and Processors</h2>
              <p className="font-semibold">We do NOT sell your personal data to third parties.</p>
              <p className="mt-4">We may share information with:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Service Providers (Processors):</strong> 
                  <ul className="list-circle pl-6 mt-2 space-y-1">
                    <li>Vercel (hosting and infrastructure)</li>
                    <li>Supabase (database and authentication)</li>
                    <li>Resend (email delivery)</li>
                    <li>AI providers (only when you connect them: OpenAI, Anthropic, Google, DeepSeek, etc.)</li>
                  </ul>
                </li>
                <li><strong>Exchanges:</strong> Only when you explicitly connect an exchange and authorize trading via API keys</li>
                <li><strong>Legal Requirements:</strong> If required by law, court order, or to protect our legal rights</li>
                <li><strong>Public Information:</strong> Your username, display name, avatar, and trading performance metrics may be publicly visible on leaderboards and community features</li>
                <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your data may be transferred to the successor entity</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">6. Data Security</h2>
              <p>
                We implement reasonable technical and organizational security measures to protect your data, including:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Encryption of sensitive data in transit (TLS/HTTPS) and at rest (AES-256 for passwords and API keys)</li>
                <li>Secure database access controls and row-level security policies</li>
                <li>Regular security audits and updates</li>
                <li>Access logging and monitoring for suspicious activity</li>
              </ul>
              <p className="mt-4 font-semibold text-yellow-400">
                However, no system is 100% secure. We cannot guarantee absolute security. In the event of a data breach, we will notify affected users 
                in accordance with applicable law, but we are not liable for damages resulting from unauthorized access or security incidents.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">7. Data Retention and Deletion</h2>
              <p>
                <strong>Retention Period:</strong> We retain your personal data for as long as your account is active, plus:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Trading data and performance metrics: Retained for regulatory and dispute resolution purposes (up to 7 years)</li>
                <li>Legal acceptance records: Retained indefinitely for compliance purposes</li>
                <li>Communication logs: Retained for up to 2 years</li>
                <li>Usage analytics: Aggregated/anonymized data may be retained indefinitely</li>
              </ul>
              <p className="mt-4">
                <strong>Account Deletion:</strong> You may request deletion of your account and personal data by emailing <a href="mailto:support@coreboundai.io" className="text-blue-400 hover:underline">support@coreboundai.io</a>. 
                We will process your request and delete your data within 30 days, except where retention is required by law or for legitimate purposes (e.g., preventing fraud, 
                resolving disputes, or fulfilling legal obligations). Some information may remain in backup systems for a limited period before permanent deletion.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">8. International Data Transfers</h2>
              <p>
                The Platform is operated globally and your personal data may be transferred to and processed in countries outside your country of residence, 
                including the United States and European Union, where data protection laws may differ from those in your jurisdiction.
              </p>
              <p className="mt-4">
                Where we transfer personal data outside the UK or European Economic Area (EEA), we rely on appropriate safeguards and lawful transfer mechanisms, including:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Standard Contractual Clauses (SCCs) approved by the European Commission or UK authorities</li>
                <li>Adequacy decisions by the European Commission or UK government recognizing equivalent data protection standards</li>
                <li>Other legally compliant transfer mechanisms as permitted by applicable law</li>
              </ul>
              <p className="mt-4">
                These transfers are necessary to provide the Platform services, including hosting (Vercel, Supabase), AI model integrations, and other 
                technical operations. For more information about our international transfer safeguards, contact support@coreboundai.io.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">9. Cookies and Tracking</h2>
              <p>
                We use cookies and similar technologies for:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Essential Cookies:</strong> Authentication, session management, security</li>
                <li><strong>Functional Cookies:</strong> Preferences, settings, timezone</li>
                <li><strong>Analytics:</strong> Usage patterns, performance metrics (aggregated/anonymized)</li>
              </ul>
              <p className="mt-4">
                You can control cookies through your browser settings, but disabling essential cookies may prevent you from using certain Platform features.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">10. Third-Party Links and Services</h2>
              <p>
                The Platform may contain links to third-party websites or integrate with third-party services (exchanges, AI providers). 
                We are not responsible for their privacy practices. Review their privacy policies before providing any information or connecting services.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">11. Children's Privacy</h2>
              <p>
                The Platform is not intended for users under 18 years of age. We do not knowingly collect personal information from children. 
                If you believe a child has provided us with personal information, please contact us at <a href="mailto:support@coreboundai.io" className="text-blue-400 hover:underline">support@coreboundai.io</a> and we will delete it promptly.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">12. Your Privacy Rights</h2>
              <p>Depending on your location, you may have the following rights regarding your personal data:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Right of Access:</strong> Request a copy of your personal data</li>
                <li><strong>Right to Rectification:</strong> Correct inaccurate or incomplete data</li>
                <li><strong>Right to Erasure:</strong> Request deletion of your data (subject to legal retention requirements)</li>
                <li><strong>Right to Restrict Processing:</strong> Limit how we use your data in certain circumstances</li>
                <li><strong>Right to Data Portability:</strong> Receive your data in a machine-readable format</li>
                <li><strong>Right to Object:</strong> Object to processing based on legitimate interests</li>
                <li><strong>Right to Withdraw Consent:</strong> Where processing is based on consent</li>
              </ul>
              <p className="mt-4">
                To exercise these rights, contact us at <a href="mailto:support@coreboundai.io" className="text-blue-400 hover:underline">support@coreboundai.io</a>. We will respond within 30 days (or sooner as required by applicable law).
              </p>
              <p className="mt-4">
                <strong>Right to Lodge a Complaint:</strong> If you are in the UK or EEA, you have the right to lodge a complaint with your local 
                supervisory authority. For UK users, this is the Information Commissioner's Office (ICO): <a href="https://ico.org.uk" className="text-blue-400 hover:underline" target="_blank" rel="noopener">ico.org.uk</a>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">13. Changes to Privacy Policy</h2>
              <p>
                We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or business operations. 
                We will notify you of material changes by email or through a prominent notice on the Platform. The "Last Updated" date at the top indicates the 
                most recent revision.
              </p>
              <p className="mt-4">
                Your continued use of the Platform after changes become effective constitutes your acceptance of the updated Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">14. Contact</h2>
              <p>
                For privacy-related questions, data subject requests, or to exercise your rights, contact us at: <a href="mailto:support@coreboundai.io" className="text-blue-400 hover:underline">support@coreboundai.io</a>
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
