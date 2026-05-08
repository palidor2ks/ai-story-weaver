The portrait is filling the image element with `object-cover`, but the source photo has extra dark/empty space around Trump’s head and shoulders. Because the avatar frame is a short rectangle, `object-cover` crops to the photo’s existing composition instead of zooming tightly into the face.

Plan:
1. Update the candidate profile avatar rendering so the large profile portrait can use stronger image positioning/zoom inside the frame.
2. Keep the existing fallback initials behavior unchanged.
3. Scope the change to profile/avatar presentation only, without touching candidate data or image URLs.

Technical details:
- Adjust `OfficialAvatar` to support optional image-fit/position styling for profile portraits.
- Pass the tighter crop option from `CandidateProfile.tsx` for the large hero image.