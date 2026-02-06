export default function RiskPage() {
  return (
    <div className="min-h-screen bg-[#070d1a] py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl">
        <div className="bg-[#0A0E1A] border border-blue-900/50 rounded-lg p-8">
          <h1 className="text-3xl font-bold text-white mb-6">Risk Disclosure</h1>
          <div className="prose prose-invert max-w-none space-y-6 text-gray-300">
            <p className="text-sm text-gray-400">Last Updated: 2026-02-01</p>
            
            <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-6 my-6">
              <h3 className="text-lg font-bold text-yellow-400 mb-3">⚠️ Important Warning</h3>
              <p className="text-yellow-200">
                Trading involves substantial risk of loss and is not suitable for everyone. You could lose some or all of your invested capital. 
                Only trade with money you can afford to lose.
              </p>
            </div>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">1. No Financial Advice or Fiduciary Relationship</h2>
              <p className="font-semibold text-yellow-400">
                Corebound does NOT provide financial, investment, or trading advice. We are NOT your broker, advisor, fiduciary, or agent.
              </p>
              <p>
                "Corebound" refers to the trading strategy platform accessible at coreboundai.io, provided as a technology tool. Nothing on this Platform 
                constitutes a recommendation to buy, sell, or hold any asset. All information is for educational and informational purposes only.
              </p>
              <p className="mt-4">
                <strong>No Fiduciary Duty:</strong> Corebound does not owe you any fiduciary duty or special duty of care. You are solely responsible for 
                your own investment decisions, research, and due diligence. We do not act on your behalf or in your best interest—you are an independent user 
                of a software tool.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">2. Simulated vs. Live Trading</h2>
              <p className="font-semibold text-yellow-400">
                Simulated (paper) trading results are NOT indicative of live trading performance.
              </p>
              <p>
                The Platform offers both virtual trading (simulated with $100,000 virtual capital) and live trading (real orders on connected exchanges). 
                Important differences:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Simulated Trading:</strong> No real money at risk. Fills are assumed at market prices without slippage, fees, or liquidity constraints. 
                Results are hypothetical and do not reflect real trading conditions.</li>
                <li><strong>Live Trading:</strong> You risk real capital. Subject to exchange fees, slippage, partial fills, rejected orders, and execution delays. 
                Performance will differ from simulated results.</li>
                <li><strong>Psychological Factors:</strong> Trading with real money involves emotions (fear, greed) that do not exist in simulation</li>
              </ul>
              <p className="mt-4 font-semibold text-red-400">
                Strong performance in virtual trading does NOT guarantee success in live trading. You may experience significant losses when trading live.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">3. AI-Generated Strategies Are Not Guaranteed</h2>
              <p>
                The Platform allows you to create trading strategies using AI models. These strategies are:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Experimental:</strong> AI models can produce unpredictable, irrational, or erroneous results</li>
                <li><strong>Untested:</strong> Your specific strategy may not have been validated in live market conditions</li>
                <li><strong>Subject to Error:</strong> AI can misinterpret data, make logical errors, hallucinate information, or behave unexpectedly</li>
                <li><strong>Past Performance Irrelevant:</strong> Historical backtests and paper trading results do not predict future performance</li>
                <li><strong>Model Limitations:</strong> AI models have training cutoff dates and may not understand current market conditions</li>
              </ul>
              <p className="mt-4 font-semibold text-red-400">
                AI-generated trading decisions can and often do lead to significant financial losses.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">4. Market Risks</h2>
              <p>Trading in financial markets carries inherent risks including:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Market Volatility:</strong> Prices can move rapidly and unpredictably</li>
                <li><strong>Liquidity Risk:</strong> You may not be able to exit positions when desired</li>
                <li><strong>Leverage Risk:</strong> Leveraged positions can amplify both gains and losses</li>
                <li><strong>Gap Risk:</strong> Markets can gap past your stop-loss orders</li>
                <li><strong>Systemic Risk:</strong> Exchange outages, regulatory changes, black swan events</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">5. Technical and Platform Risks</h2>
              <p>Using Corebound involves additional risks:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Software Bugs:</strong> The Platform may contain errors that affect trading</li>
                <li><strong>Execution Delays:</strong> Orders may be delayed or fail to execute</li>
                <li><strong>Data Inaccuracy:</strong> Market data feeds may be incorrect or delayed</li>
                <li><strong>Downtime:</strong> The Platform or connected exchanges may become unavailable</li>
                <li><strong>API Failures:</strong> Third-party AI or exchange APIs may fail</li>
                <li><strong>Security Breaches:</strong> Despite security measures, unauthorized access is possible</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">6. Automated Trading Risks</h2>
              <p className="font-semibold text-yellow-400">
                Automated trading can execute many trades rapidly without your direct oversight, potentially leading to cascading losses.
              </p>
              <p>Specific risks include:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Runaway strategies that place excessive orders</li>
                <li>Logic errors that cause unintended behavior</li>
                <li>Inability to intervene quickly during fast-moving markets</li>
                <li>Over-trading that racks up fees and slippage</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">7. API Key and Exchange Connection Risks</h2>
              <p className="font-semibold text-yellow-400">
                When you connect an exchange to enable live trading, you grant the Platform access to place orders on your behalf via API keys.
              </p>
              <p className="mt-4">Critical risks include:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Full Trading Access:</strong> API keys grant the Platform permission to execute trades, which can result in losses</li>
                <li><strong>Your Responsibility:</strong> YOU are responsible for enabling live trading and setting appropriate risk limits</li>
                <li><strong>Key Security:</strong> If your API keys are compromised, unauthorized trades may occur</li>
                <li><strong>Revocation:</strong> You can revoke API keys at any time through your exchange account or Platform settings</li>
                <li><strong>No Fund Custody:</strong> We do NOT custody your funds. All assets remain in your exchange account</li>
                <li><strong>Exchange Risks:</strong> The exchange may fail, be hacked, go bankrupt, or become inaccessible</li>
                <li><strong>Withdrawal Restrictions:</strong> Exchanges may freeze withdrawals or impose restrictions without notice</li>
              </ul>
              <p className="mt-4 font-semibold text-red-400">
                Only connect exchanges and enable live trading if you fully understand and accept these risks. You can lose all funds in your exchange account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">8. Cryptocurrency and Derivative Risks</h2>
              <p>
                If you trade cryptocurrencies or derivatives:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>These markets are highly volatile and speculative</li>
                <li>Regulatory frameworks are evolving and uncertain</li>
                <li>Exchanges may be unregulated or located in foreign jurisdictions</li>
                <li>You may lose access to funds if an exchange fails or is hacked</li>
                <li>Tax treatment may be complex and varies by jurisdiction</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">9. No Guarantee of Profit - YOU CAN LOSE EVERYTHING</h2>
              <p className="font-semibold text-red-400 text-lg">
                YOU CAN LOSE SOME OR ALL OF YOUR INVESTED CAPITAL. THERE IS NO GUARANTEE YOU WILL MAKE MONEY. MOST TRADERS LOSE MONEY.
              </p>
              <p className="mt-4">
                Trading is speculative and carries extreme risk. Do NOT trade with:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Money you cannot afford to lose completely</li>
                <li>Borrowed funds or money needed for living expenses</li>
                <li>Retirement savings or emergency funds</li>
              </ul>
              <p className="mt-4">
                Past performance, whether real or simulated, does NOT predict or guarantee future results. Market conditions change constantly. 
                A strategy that was profitable in the past may lose money in the future.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">10. Leaderboard and Community Risks</h2>
              <p>
                The Arena leaderboard and community features display user performance for educational and entertainment purposes only. This is NOT:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>An endorsement of any trading strategy</li>
                <li>A recommendation to copy or follow any user</li>
                <li>A guarantee that high-performing strategies will continue to perform well</li>
              </ul>
              <p className="mt-4">
                Top-ranked strategies may have:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Benefited from luck or unusual market conditions</li>
                <li>Taken excessive risk that is not sustainable</li>
                <li>Used leverage or position sizes inappropriate for your risk tolerance</li>
                <li>Performed well in simulation but may fail in live trading</li>
              </ul>
              <p className="mt-4 font-semibold text-yellow-400">
                Do not make trading decisions based solely on leaderboard rankings or community posts.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">11. Your Sole Responsibility</h2>
              <p className="font-semibold text-lg">By using Corebound, you explicitly acknowledge and accept that:</p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li><strong>Trading Decisions:</strong> You are solely and exclusively responsible for all trading decisions and outcomes</li>
                <li><strong>Risk Understanding:</strong> You understand and accept all risks described in this disclosure</li>
                <li><strong>Financial Capacity:</strong> You have the financial capacity to bear complete loss of invested capital</li>
                <li><strong>No Reliance on Corebound:</strong> You will not rely on the Platform, AI models, or any content for financial advice</li>
                <li><strong>Due Diligence:</strong> You will conduct your own independent research and analysis</li>
                <li><strong>Live Trading Authorization:</strong> If you enable live trading, YOU authorize the Platform to execute trades and accept all associated risks</li>
                <li><strong>Risk Limits:</strong> You are responsible for setting appropriate position sizes, leverage limits, and stop-losses</li>
                <li><strong>Monitoring:</strong> You are responsible for monitoring your positions and strategies</li>
                <li><strong>API Key Management:</strong> You are responsible for the security of your exchange API keys and any unauthorized use</li>
                <li><strong>Full Liability:</strong> You accept full responsibility and liability for any and all losses incurred</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">12. Seek Professional Advice</h2>
              <p>
                Before trading or investing any capital, you should consult with a licensed financial advisor, certified public accountant, 
                or attorney who can evaluate your personal financial situation, risk tolerance, and investment objectives.
              </p>
              <p className="mt-4">
                Corebound does not provide personalized financial, legal, tax, or investment advice. Ensure you fully understand all risks before committing capital.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mt-8 mb-4">13. Contact</h2>
              <p>
                For questions about this Risk Disclosure, contact us at: <a href="mailto:support@coreboundai.io" className="text-blue-400 hover:underline">support@coreboundai.io</a>
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
