## Change

In `src/App.tsx`, update the `/donor/:id` route guard from `requireAuth={false}` to `requireAuth` so individual spender/donor profile pages require login. The `/top-spenders`, `/donors`, and `/committees` list pages remain public (unchanged).

That's the only edit needed.