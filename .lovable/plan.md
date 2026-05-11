## Two fixes to implement

### 1. Hide admin-only UI from non-admins on candidate profile
File: `src/pages/CandidateProfile.tsx` (line 290-294)

Wrap the "Overridden" badge with `isAdmin`:
```tsx
{candidate.hasOverride && isAdmin && (
  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/30">
    Overridden
  </Badge>
)}
```
The "Edit" button is already gated by `canEdit = isAdmin || isPoliticianOwner`, so no change there.

### 2. Dark initials on light avatar fallback
File: `src/components/OfficialAvatar.tsx`

Add a text-color helper mirroring `getPartyBgColor`:
```tsx
const getPartyTextColor = (party: string) => {
  switch (party) {
    case 'Democrat':
    case 'Republican':
    case 'Independent':
      return 'text-white';
    default:
      return 'text-foreground'; // dark on light bg-muted
  }
};
```
Replace `text-white` on line 88 with `getPartyTextColor(party)`.

### Verification
- Visit `/candidate/mayor_nj_piscataway` logged out → no "Overridden" badge, no "Edit" button. As admin → both visible.
- Visit `/feed` → "SARE, DIANE" and other unknown-party avatars show dark initials on the light gray circle; party-colored avatars (blue/red/purple) keep white initials.