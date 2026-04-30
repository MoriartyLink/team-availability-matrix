# Security Specification

## Data Invariants
1. An Availability slot must have a userId matching the authenticated user.
2. A user cannot modify another user's profile.
3. Groups can be read by anyone, but created/updated by authenticated users.
4. Availability slots must have a startTime between 0 and 1440.
5. Availability slots should have a groupId matching the user's groupId for efficient filtering.

## The "Dirty Dozen" Payloads
1. **Identity Spoofing**: Try to create a User profile with a different `uid` than `request.auth.uid`.
2. **Unauthorized Write**: Try to edit another user's profile.
3. **Ghost Field**: Try to add `isAdmin: true` to a profile.
4. **Invalid Time**: Create availability with `startTime: -10`.
5. **Resource Exhaustion**: Create availability with `duration: 999999`.
6. **ID Poisoning**: Create availability with a 500-char string ID.
7. **Cross-user Access**: User A tries to delete User B's availability.
8. **Malicious Enum**: Create availability with `type: "super-busy"`.
9. **Missing Required**: Create profile without `name`.
10. **State Shortcut**: Try to update `createdAt`.
11. **PII Breach**: Authenticated user tries a blanket `get` on a private user profile (if we had private fields).
12. **Relational Orphan**: Create availability for a non-existent groupId.

## Tests
I will implement `firestore.rules` to reject all the above.
