import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Seo } from '@/components/Seo';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Privacy Policy — Pulse"
        description="How Pulse collects, uses, stores, and protects your personal information and quiz responses."
        path="/privacy"
      />
      <main className="container max-w-3xl py-10">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <article className="prose prose-slate max-w-none">
          <h1 className="font-display text-4xl font-bold text-foreground mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-8">Effective date: May 9, 2026</p>

          <Section title="1. Information We Collect">
            <ul>
              <li><strong>Account information:</strong> name, email, password (hashed), and any profile details you choose to add.</li>
              <li><strong>Address:</strong> used to match you with your federal, state, and local representatives. Stored on your profile.</li>
              <li><strong>Quiz responses:</strong> your answers to political-position questions, used to compute your alignment scores.</li>
              <li><strong>Usage data:</strong> pages visited, features used, and basic device/browser info for product improvement.</li>
            </ul>
          </Section>

          <Section title="2. How We Use Your Information">
            <ul>
              <li>Match you with candidates, parties, and representatives based on your address and quiz answers.</li>
              <li>Generate personalized comparisons and AI-written explanations.</li>
              <li>Operate, secure, and improve the Service.</li>
              <li>Communicate with you about your account or material changes to the Service.</li>
            </ul>
          </Section>

          <Section title="3. Third-Party Services">
            <p>We rely on the following providers to operate Pulse:</p>
            <ul>
              <li><strong>Lovable Cloud / Supabase</strong> — database, authentication, file storage, edge functions.</li>
              <li><strong>Google Places</strong> — address autocomplete and geocoding.</li>
              <li><strong>Lovable AI Gateway</strong> and <strong>Perplexity</strong> — AI research and natural-language explanations.</li>
              <li><strong>Congress.gov, FEC, OpenStates</strong> — public political and campaign-finance data.</li>
            </ul>
            <p>These providers process data on our behalf under their own privacy and security commitments.</p>
          </Section>

          <Section title="4. What We Do Not Do">
            <p>We do not sell your personal information. We do not share your quiz answers or address with candidates, campaigns, advertisers, or other users.</p>
          </Section>

          <Section title="5. Cookies and Local Storage">
            <p>We use cookies and browser local storage to keep you signed in and remember preferences. You can clear them in your browser at any time.</p>
          </Section>

          <Section title="6. Your Rights">
            <p>You may access, correct, export, or delete your data at any time. Email <a className="text-primary underline" href="mailto:support@polipulseapp.com">support@polipulseapp.com</a> to make a request. EU/UK and California residents have additional rights under GDPR and CCPA respectively.</p>
          </Section>

          <Section title="7. Data Retention">
            <p>We retain your account data for as long as your account is active. When you delete your account, we remove your personal data within 30 days, except where retention is required by law.</p>
          </Section>

          <Section title="8. Children's Privacy">
            <p>Pulse is not directed to children under 18 and we do not knowingly collect data from them.</p>
          </Section>

          <Section title="9. Security">
            <p>We use industry-standard practices including encryption in transit, hashed passwords, and row-level access controls. No system is perfectly secure, but we work to protect your data.</p>
          </Section>

          <Section title="10. Changes to This Policy">
            <p>We may update this Privacy Policy from time to time. We will post the updated version here with a new effective date.</p>
          </Section>

          <Section title="11. Contact">
            <p>Privacy questions or requests: <a className="text-primary underline" href="mailto:support@polipulseapp.com">support@polipulseapp.com</a>.</p>
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
