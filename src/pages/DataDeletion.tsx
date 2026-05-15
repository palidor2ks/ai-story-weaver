import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Seo } from '@/components/Seo';

export default function DataDeletion() {
  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Data Deletion Instructions — Pulse"
        description="How to request deletion of your Pulse account and personal data."
        path="/data-deletion"
      />
      <main className="container max-w-3xl py-10">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <article className="prose prose-slate max-w-none">
          <h1 className="font-display text-4xl font-bold text-foreground mb-2">Data Deletion Instructions</h1>
          <p className="text-sm text-muted-foreground mb-8">Effective date: May 13, 2026</p>

          <Section title="Overview">
            <p>
              Pulse ("we", "us") lets you permanently delete your account and all associated personal data,
              including any information obtained when you sign in or connect through Facebook.
            </p>
          </Section>

          <Section title="Delete from your account">
            <p>If you signed up for Pulse, you can delete your account at any time:</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>Sign in at <a className="text-primary underline" href="https://polipulseapp.com/auth">polipulseapp.com</a>.</li>
              <li>Go to <strong>Profile → Settings</strong>.</li>
              <li>Choose <strong>Delete Account</strong> and confirm.</li>
            </ol>
            <p>Your account, profile, quiz answers, and any data linked to your Facebook login are removed within 30 days.</p>
          </Section>

          <Section title="Request deletion by email">
            <p>
              You can also request deletion by emailing{' '}
              <a className="text-primary underline" href="mailto:support@polipulseapp.com">support@polipulseapp.com</a>{' '}
              from the address associated with your account, with the subject line <strong>"Delete my data"</strong>.
              We will confirm and complete the deletion within 30 days.
            </p>
          </Section>

          <Section title="What gets deleted">
            <ul className="list-disc pl-6 space-y-1">
              <li>Your account and profile (name, email, address, demographics).</li>
              <li>All quiz answers and computed alignment scores.</li>
              <li>Any identifiers received from Facebook Login (e.g. Facebook user ID, email, name).</li>
            </ul>
            <p>
              We may retain a minimal record of the deletion request and any data we are legally required to keep.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions: <a className="text-primary underline" href="mailto:support@polipulseapp.com">support@polipulseapp.com</a>.
            </p>
          </Section>
        </article>
      </main>
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
