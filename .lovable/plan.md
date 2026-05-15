## Plan

1. **Fix the alias picker state**
   - When opening the attach dialog, automatically preselect a valid active alias when only one active alias exists.
   - If there are multiple active aliases, keep the picker empty so the user must choose intentionally.

2. **Make the disabled state obvious**
   - Update the Attach button behavior so it is disabled only when there is no selected alias, no target donor, or an attach request is already running.
   - Add a clear inline hint when no active aliases exist.

3. **Validate the attach flow**
   - Confirm the modal opens with the expected alias selection state.
   - Confirm clicking Attach calls `attach-donors-to-alias` and closes the modal on success.