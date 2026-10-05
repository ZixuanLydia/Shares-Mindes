# Small Pieces Together — Week 5

Extends Week 4 without changing it: collage editing, scenes and playback plus public story discovery and thoughtful replies instead of likes.

## Use

Make a story, add a nickname, explicitly publish a snapshot. One public story per browser identity; republishing replaces it. Private cloud saves remain separate. Copy Week 4 from the same browser/origin, or import its exported JSON.

Explore the latest 20 public stories. Search loaded nicknames/titles/captions or choose a random story. Refresh for updates. Open a story and save one reply (up to 500 characters); saving again replaces it. Only the reply's author identity can modify/delete it.

Demo mode has 24 explicitly fictional users. It is local only, never uploaded, and replies are disabled.

## Identity and privacy

Firebase anonymous authentication supplies a persistent browser identity, not a verified name or cross-device login. Nicknames are self-chosen and can duplicate others. Clearing browser data can lose ownership; export JSON backups. No emails are displayed. Public stories can be copied. Removing a story hides its replies; publishing again restores them.

Private draft: users/{uid}/week05. Public stories: social05/stories/{uid}. Replies: social05/replies/{storyUid}/{replyAuthorUid}.

## Setup and verification

Week 5 rules were published on October 5, 2026. Twenty-three live checks using two separate anonymous identities passed, including private-save isolation, public discovery, replies, ownership, invalid writes, and hide/republish behavior. Six local tests also pass. See FIREBASE-SETUP.md. No new account or billing upgrade.

[Open the editor](https://zixuanlydia.github.io/Shares-Mindes/week-05/) · [Explore stories](https://zixuanlydia.github.io/Shares-Mindes/week-05/community.html)

Combined rules preserve Week 4, add owner-only writes, payload bounds, server timestamps and limited list queries. Client validation restricts images to built-in files or embedded raster images; names/replies render as text, not HTML.

Run python3 -m http.server 8000 from share-mind and open http://127.0.0.1:8000/week-05/. Test: node --test week-05/story.test.mjs week-05/social.test.mjs.

Limits: 6 scenes, 12 pieces/scene, private JSON 3 MB, public snapshot 500 KB, latest 20 stories/replies. Classroom prototype: no moderation/reporting, rate limiting, App Check, full pagination, real-time subscriptions or account recovery. Review these before wider public use. No live AI call; image materials generated in advance.
