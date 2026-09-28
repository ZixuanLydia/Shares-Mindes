# Small Pieces in Time — Week 4

An extension of Week 3's collage: editable pieces become scenes, and scene order becomes a story. Week 3 is unchanged.

## Use

Add images or the three pre-generated AI materials; drag, resize, rotate, layer, and float each piece. Name the scene, add a caption, and choose its duration. Create or duplicate up to six scenes, reorder with Move earlier / Move later, then Play from start. Playback locks editing, ends after the final scene, and stops on Escape or when the page is hidden. Scene deletion has one-step undo.

The Week 4 draft saves locally under a separate storage key. Export/import JSON for portable backups. Copy my Week 3 collage reads the original without modifying it; it works only on the same browser and origin. Alternatively export the Week 3 JSON and import it here.

## Firebase status

**Connected and tested on September 28, 2026.** The `shared-mindes` project uses Anonymous Authentication and Realtime Database with the supplied access rules. Live tests passed for save/load, public snapshot reading, and denial of unauthenticated/other-user access to private stories and share writes. Setup notes: [FIREBASE-SETUP.md](FIREBASE-SETUP.md).

Sharing was also tested end-to-end: play all three scenes, disable the link (new reads are denied), and re-enable the same link. Local tests: `node --test week-04/story.test.mjs week-04/share.test.mjs`.

The prepared integration uses Firebase Anonymous Authentication and Realtime Database. Each browser identity has one private cloud slot at `users/{uid}/week04`; saving updates that slot. The name is metadata, not authentication. This is not account-based cross-device sync: clearing browser data may lose the anonymous identity. Export JSON before changing browsers or clearing storage.

Explicit cloud saves include the complete ordered scene description and embedded resized user images. JSON is stored as a serialized payload with schema version and server timestamp. The supplied rules deny unauthenticated and other-user access to private drafts. They cap payload length; the client separately validates scene data. Review abuse controls and App Check before broader public use. This classroom prototype is not a public multi-user production service.

## Read-only sharing

Create / update share link publishes a separate snapshot after confirmation. Anyone with the random link can view and play it at `view.html?story=UUID`, without signing in; they cannot change it. This includes the story's images, captions and optional name. Private edits are not reflected until the creator publishes again. The same browser identity can turn sharing off (a reversible change), but cannot recall copies already downloaded by a reader. A link is not a private invitation: recipients can forward it.

One random share ID per anonymous identity is stored at `users/{uid}/shareId`; its snapshot is stored at `shares/{UUID}`. Rules allow public reads only at an enabled individual share, deny listing the shares collection, and allow writing only by the owning identity. The read-only page never signs in, writes to Firebase, or replaces a local draft. A localhost share link is only a preview; use the deployed site's link for your teacher.

## Run locally

From the repository root: `python3 -m http.server 8000`, then open `http://localhost:8000/week-04/`. Static HTML/CSS/JavaScript, no bundler. Firebase SDK modules load from Google's CDN only after configuration. Built-in image files are the same pre-generated AI materials as Week 3; there is no live image-generation API.

Limits: 6 scenes, 12 pieces per scene, cloud/import JSON under 3 MB, image input under 15 MB and 40 megapixels. Imported images resize to 420 px on their longest side. Local browser quota can be smaller than a large story; errors are visible and JSON export remains available.
