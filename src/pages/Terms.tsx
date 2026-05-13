import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Seo } from '@/components/Seo';

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Terms of Service — Pulse"
        description="The terms governing your use of Pulse, the political alignment and candidate-comparison service."
        path="/terms"
      />
      <div className="container max-w-3xl py-10">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <article className="prose prose-slate max-w-none">
          <h1 className="font-display text-4xl font-bold text-foreground mb-2">Terms of Service</h1>
          <p className="text-sm text-muted-foreground mb-8">Effective date: May 9, 2026</p>

          <Section title="1. Acceptance of Terms">
            <p>By creating an account or using Pulse (the "Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>
          </Section>

          <Section title="2. Description of the Service">
            <p>Pulse helps users discover where they stand on political issues and compare their views with candidates, parties, and elected representatives. Information shown in the Service is aggregated from public sources (including Congress.gov, the FEC, OpenStates, and official campaign materials) and analyzed with AI. The Service is provided for informational and educational purposes only and may contain errors or out-of-date information. Always verify with primary sources before making voting decisions.</p>
          </Section>

          <Section title="3. Eligibility">
            <p>You must be at least 18 years old to use Pulse. By using the Service, you represent that you meet this requirement.</p>
          </Section>

          <Section title="4. Accounts">
            <p>You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. Notify us immediately of any unauthorized use.</p>
          </Section>

          <Section title="5. Acceptable Use">
            <ul>
              <li>Do not scrape, copy, or republish data from the Service in bulk without written permission.</li>
              <li>Do not use the Service to harass, defame, or threaten any individual or group.</li>
              <li>Do not attempt to manipulate quiz results, ratings, or aggregated data.</li>
              <li>Do not attempt to gain unauthorized access to any portion of the Service or its underlying systems.</li>
            </ul>
          </Section>

          <Section title="6. Intellectual Property">
            <p>The Service, including its design, code, branding, and original content, is owned by Pulse and protected by intellectual property laws. Public source data (legislation, voting records, campaign finance) remains in the public domain or under the licenses of its original publishers.</p>
          </Section>

          <Section title="7. Disclaimers">
            <p>Scores, AI-generated explanations, and candidate comparisons are informational only and do not constitute endorsements. Pulse is not affiliated with any candidate, party, campaign, or government agency. The Service is provided "as is" without warranties of any kind.</p>
          </Section>

          <Section title="8. Limitation of Liability">
            <p>To the maximum extent permitted by law, Pulse and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service.</p>
          </Section>

          <Section title="9. Termination">
            <p>We may suspend or terminate your access to the Service at any time, with or without notice, for any reason, including violation of these Terms.</p>
          </Section>

          <Section title="10. Changes to These Terms">
            <p>We may update these Terms from time to time. Continued use of the Service after changes take effect constitutes acceptance of the updated Terms.</p>
          </Section>

          <Section title="11. Contact">
            <p>Questions about these Terms? Contact us at <a className="text-primary underline" href="mailto:support@polipulseapp.com">support@polipulseapp.com</a>.</p>
          </Section>
        </article>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-xl font-semibold text-foreground mt-6 mb-2">{title}</h2>
      <div className="text-foreground/80 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}
