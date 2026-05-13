## What's already wired

Good news — the signup confirmation email is **already wired automatically**. No new code is needed to trigger it:

- `signUp()` in `src/context/AuthContext.tsx` calls `supabase.auth.signUp({ email, password, options: { emailRedirectTo, data: { name } } })`
- Supabase Auth automatically routes the confirmation email through the deployed `auth-email-hook`, which renders `supabase/functions/_shared/email-templates/signup.tsx`
- A `/verify-email` page already exists with a "Resend" button using `supabase.auth.resend({ type: 'signup' })`

So whenever a user signs up, they'll get a confirmation email — as soon as DNS for `notify.www.polipulseapp.com` finishes verifying.

## What needs polish

The current `signup.tsx` template is the unbranded scaffold (black button, generic "Verify Email" copy). I'll brand it to match PoliPulse.

## Plan

1. **Rewrite `signup.tsx`** with PoliPulse branding:
   - Primary color `hsl(233, 69%, 30%)` (#171a3a) for the button and accents
   - Friendlier copy: "Welcome to PoliPulse — confirm your email to get started"
   - CTA: "Confirm email"
   - White background, rounded button matching app's `--radius`
   - Mention next step ("Then take the quiz to see where you stand")

2. **Redeploy `auth-email-hook`** so the new template renders.

3. **Verify Supabase Auth has email confirmation enabled** (Auth → Providers → Email → "Confirm email"). If it's off, no email gets sent regardless of templates. I'll check and call it out.

4. **No changes to signup logic** — it's already correct.

## Out of scope (ask if you want them)

- Sending the separate transactional `welcome` email *after* the user confirms their address (would fire on the first authenticated session). Right now the confirmation email itself acts as the welcome.
- Changing the confirm-link redirect target (currently `/`).

## Note on delivery

Emails will only actually arrive once `notify.www.polipulseapp.com` finishes DNS verification. You can monitor in **Cloud → Emails**. Until then, Supabase falls back to its default plain confirmation email.
