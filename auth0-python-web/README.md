# Auth0 Python SDK setup

This directory is a minimal server-side Auth0 Regular Web Application sample for the official Auth0 Python SDK. The main PoliPulse app in this repository is a React/Vite/Supabase TypeScript app, so this Python integration is intentionally isolated and does not replace the existing client app by default.

## 1. Confirm Auth0 application URLs

Your current Auth0 configuration should include:

- Allowed Callback URL: `https://www.polipulseapp.com/callback`
- Allowed Logout URL: `https://www.polipulseapp.com/`
- Application Type: `Regular Web Application`
- Token Endpoint Auth Method: `client_secret_post`

If you run this Python app on a different origin, add that origin's exact callback and logout URLs in Auth0 before testing.

## 2. Install dependencies

From this directory:

```bash
uv sync
```

Or with pip:

```bash
python -m venv .venv
. .venv/bin/activate
pip install "auth0-server-python>=1.0.0b1,<2" "flask[async]" python-dotenv markupsafe
```

## 3. Configure environment variables

Copy the example file and fill secrets locally or in your deployment secret manager:

```bash
cp .env.example .env
openssl rand -hex 32
```

Set the generated value as `AUTH0_SECRET`. Also set `AUTH0_CLIENT_SECRET` to the secret from Auth0. Do not commit `.env`.

## 4. Run the app

```bash
uv run python start.py
```

The app exposes:

- `/` - home page that shows login/signup links or the current Auth0 user profile
- `/login` - starts Auth0 Universal Login using `ServerClient.start_interactive_login`
- `/callback` - completes login using `ServerClient.complete_interactive_login`
- `/logout` - logs out using `ServerClient.logout`

## Important note

Auth0 handles user authentication. It is not the same thing as ID.me identity proofing/KYC. If the product needs a verified-identity badge, decide whether Auth0 login is sufficient or whether a separate verification provider/manual review flow is still required.
