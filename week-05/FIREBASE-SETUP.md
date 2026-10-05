# Week 5 Firebase setup

Use the existing shared-mindes project. Do not recreate it or alter Week 4.

1. Compare database.rules.json to deployed rules. It retains all Week 4 subtrees and adds users/{uid}/week05 and social05.
2. With owner approval, paste the combined rules into Realtime Database → Rules and publish. Root read/write remain false. Only explicitly published stories and replies become public.
3. Anonymous authentication is already enabled. No new provider, billing or credential needed.
4. Test two separate browser identities: A private-save/publish; B read public story/reply. Neither can read the other's private draft or modify the other's story/reply.
5. Test unauthenticated writes, unbounded list queries, oversized records and extra fields are denied.
6. Test hiding stories hides their replies, and republishing restores them.
7. Deploy week-05 beside week-04 in the existing GitHub Pages repository. Localhost and Pages have different browser identities.

Verified October 5, 2026: combined rules published; 23 live checks passed with two independent anonymous identities. Test public story/reply and temporary sign-in accounts were removed. One tiny private test fixture remains because private-draft deletion is intentionally denied. Existing user data was not changed. Never upload service-account keys or passwords or enable full-database public writes.
