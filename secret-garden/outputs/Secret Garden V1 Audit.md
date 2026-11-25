# Secret Garden V1 Development and Course Audit

V1 tests completed November 24, 2026. English documentation updated November 25, 2026 for the GitHub Pages release. Recorded test scope: the existing desktop prototype, its browser-local mode, and its local or LAN shared mode.

**[Open the Secret Garden public demo](https://zixuanlydia.github.io/Shares-Mindes/secret-garden/).** The GitHub Pages release provides the existing single-user desktop experience, including local hand tracking, semantic discovery, fusion, and browser-local persistence. It has no shared cloud or Firebase backend. The core V1 demonstration passed the recorded local browser tests; those November 24 measurements are retained below.

The November 24 audit rebuilt the existing HTML and tested the interface, data layer, and Python backend. No blocking defect was found that required changes to the flower geometry, camera, or persistence logic. Existing artwork and user records were preserved. Test flowers used separate preview addresses and a temporary database.

For practical setup and controls, see the [User Guide](USER_GUIDE.md).

## Status key

- **Complete**: implemented and passed the stated test scope.
- **Partial**: implemented with a limitation, or a corresponding physical or scale test remains outstanding.
- **Not implemented**: absent from this prototype or no separate experimental result has been supplied.
- **Rule based**: working preset or composition logic, not generative AI output.

## 1 Website feature audit

### A Basic experience

| Item | Status | Current behavior and evidence |
| --- | --- | --- |
| Welcome and entry | Complete | Local and shared pages open normally. The title appears and fades on each refresh; interaction can dismiss it early. Timing, reduced motion, and separation from saved flower data passed tests. |
| Nickname entry and persistence | Complete | Each flower stores its author's nickname at creation. A later planting reuses the nickname, and details retain it after refresh. |
| Plant a Thought input | Complete | Empty input is rejected. Valid text reaches styling. Closing an unfinished draft does not plant an extra flower. |
| Suggested associations | Rule based | The interface explicitly labels them **Preset associations**. Text rules choose preset words; no text generation model produces them. |
| Association selection and editing | Not implemented | Words are displayed but cannot be individually selected or edited. They do not automatically determine appearance. This remains a later feature. |
| Flower form, color, and parameters | Complete | Cup, Flared, and Tall forms; Peach, Lilac, and Ice blue colors; and bloom amount are selectable. Size and initial position are assigned by the program rather than a separate size editor. |
| Generation and preview | Complete | Shape, color, and Grow previews work. Returning to styling and continuing to Grow works. |
| Bud-to-bloom animation | Complete | Keyboard adjustment, upward mouse dragging from 0% to 56%, and the demo's play, pause, stage, and reset controls passed. Stage changes animate smoothly. |
| Plant in Garden | Complete | A local user and two independent shared visitors successfully planted flowers. |
| New flowers in the scene | Complete | Authors, colors, forms, and openness render correctly. Unsubmitted drafts stay outside the saved collection. |
| Refresh recovery | Complete | Local text, nickname, form, color, 60% openness, and growth history recovered. Both shared visitors recovered all three test flowers after refresh. |

### B Visual style and space

| Item | Status | Current behavior and evidence |
| --- | --- | --- |
| Existing glass-flower style | Complete | The audit preserved material, geometry, and typography. Garden, overhead, and two-color fusion views were checked in screenshots. |
| Foreground, middle ground, and background depth | Complete | A background image, foreground mask, parallax layers, and independent flower depths create the layered space. |
| Camera movement and parallax | Complete | The Parallax toggle and garden-to-focus movement work. |
| Natural sway | Complete | Subtle continuous sway remains active. Related numerical and rendering checks passed; this is not an FPS benchmark. |
| Hover highlight | Complete | A native pointer hover over an unselected flower produced a soft halo, reaching opacity 0.66 without accidentally entering focus. |
| Independent selection | Complete | Planted flowers, the demo flower, related flowers, and history entries open independently with the correct author and properties. |
| Performance as flower count grows | Partial | Browser acceptance used three shared flowers plus the demo. Small-flower caching, pixel-density limits, and a maximum of four related flowers are implemented. Tens or hundreds of flowers have not been stress-tested. |

The petals are **procedural three-dimensional surfaces**, with thickness, rounded edges, and folds, projected onto Canvas 2D. The overhead view redraws the same geometry continuously. The background uses a static image and parallax layers. This is a hybrid scene, not a fully modeled world with free roaming. The tested effect does not require replacement flower images for different viewing angles.

### C Flower Focus

| Item | Status | Current behavior and evidence |
| --- | --- | --- |
| Smooth approach after clicking | Complete | Planted and demo flowers entered an approximately two-second focus transition. |
| Camera rising from the side | Complete | A continuous camera path changes the view; geometry checks cover side, oblique, and overhead poses. |
| Flower center facing the viewer | Complete | The final view is close to 88 degrees overhead, with the petal arrangement and center visible. |
| Bloom coordinated with camera movement | Complete | The flower opens during focus. Returning restores its saved openness rather than overwriting the artwork. |
| Soft text and author reveal | Complete | Original text, nickname, time, and keywords appear beside the flower without an opaque information card. |
| Back to Garden | Complete | Normal focus and growth replay return to the garden and restore the saved scene and openness. |
| Switching between flowers | Complete | Switching from a Cup flower to a related Tall flower worked, followed by hiding connections and returning. The motion suite passed 2,700 numerical cases. |

### D Interactions between flowers

| Item | Status | Current behavior and evidence |
| --- | --- | --- |
| Flower Connections glow | Complete | Real semantic similarity influences distance, glow, and response strength. |
| Whisper or pollen flow | Complete | Connection drawing and particle-limit checks passed, and the browser connection scene worked. This is an animation behavior, not a separate button. |
| Resonance chain | Partial | Continuous sample tests produced sway, light-point propagation, and echo across flowers. A live human hand sweeping across flowers still needs an in-person check. |
| Garden Rearrangement | Complete | Find Connections gathers related flowers from their saved positions around the focused flower. |
| Unrelated flowers recede | Complete | Surrounding flowers dim during focus. An unrelated train-ticket thought was excluded from family-dinner results. |
| Reset or layout restoration | Complete | Hide Connections and Back to Garden restore the saved layout from before discovery. They do not undo a user's intentionally saved placement. No extra Reset button is required. |
| Continuing to another flower | Complete | Clicking a gathered flower smoothly changes focus and updates its related content. |
| Drag, merge, and separate | Complete | A native drag onto the main flower produced a persistent two-color fusion after release. Clicking open garden space separated the pair. Both originals remained visible. |
| New fusion sentence | Rule based | Local composition rules combine specific details from the two thoughts. This is not writing from a generative language model. |
| Repositioning in the garden | Complete | An author's flower stays at its released position and recovers after refresh without accidental focus. Other authors' flowers return after temporary movement; ownership and return behavior are covered by pointer and backend tests. |

## 2 Body interaction verification

| Item | Status | Test scope |
| --- | --- | --- |
| User-initiated camera access | Complete | Chrome granted one-time permission. Real video reached 320 by 240 pixels and readyState 4. |
| Real tracking model | Complete | The local MediaPipe HandLandmarker loaded and reached **Show one hand to the camera**. Tracking was not replaced by a mock model. |
| Pause, resume, and close | Complete | Pause stopped playback, Resume restarted tracking, and Close hid the panel. Lifecycle tests and code checks cover track stopping and late results. |
| Open palm to bloom and fist to close | Partial | The real 21-landmark algorithm, continuous openness mapping, and smoothing passed tests. No live human palm-to-fist sequence was performed in the November 24 audit. |
| Position, speed, and cross-flower response | Partial | Simulated 12 Hz detector samples with 60 Hz drawing produced chained light points and sway. This does not certify physical hand feel. |
| Dwell-to-bloom | Replaced design | The earlier dwell scheme was replaced by the user's chosen continuous palm-and-fist control. It is not mixed with automatic dwell growth. |
| Mouse fallback | Complete | Camera permission waiting can be paused or closed, and planting still works. Native Grow dragging succeeded. Denial and device-failure paths are covered by lifecycle tests and code checks. |
| Video privacy | Complete | The page requests video without audio. Frames feed local inference; there is no video-upload or recording path. Audit screenshots do not contain camera footage. |

For class, use localhost on the presenting computer for Body. Visitors using an ordinary LAN HTTP address generally need the mouse fallback. Allow camera access and load the local models before the live presentation.

## 3 Course themes and separate submissions

The numbering below follows the project's eleven-theme checklist. In the official calendar, week 7 was a schedule adjustment, so Spatial, Body, Metaphor, Level, and Research correspond to calendar weeks 8, 9, 10, 11, and 12.

| Theme | Secret Garden implementation | Separate coursework and submission status |
| --- | --- | --- |
| 1 Rethink | Complete: thoughts become flowers with editable appearance, continuous opening, planting, and interaction. | Personal writing and submission status have not been checked. |
| 2 Alignment | Preset words are rule based. Generative associations, word editing, and AI-driven appearance suggestions are not implemented. Manual appearance choices work. | Source is uploaded to [the course repository](https://github.com/ZixuanLydia/Shares-Mindes/tree/secret-garden-v1/secret-garden). Dashboard or Profile submission is unverified. An API is an exploration route, not a requirement to buy a paid service. [Assignment](https://itpima.web.app/smf26/alignment-with-neural-networks/) |
| 3 Implicit / Explicit | Complete: independent JSON includes thought, author, appearance, position, time, and growth. Objects can be controlled and combined. MediaPipe is real non-text ML input, using a pretrained model. | Blog documentation of the exploration remains a separate submission check. |
| 4 Time | Complete: creation time, persistence, loading, Timeline, growth samples, replay, and refresh recovery. Secret Garden uses localStorage and SQLite, not Firebase. | The earlier [Week 4](https://github.com/ZixuanLydia/Shares-Mindes/blob/main/week-04/README.md) and [Week 5](https://github.com/ZixuanLydia/Shares-Mindes/blob/main/week-05/README.md) assignments already contain Firebase integration code and documented live-test results. Therefore, Firebase should not be marked absent from the student's entire coursework. Those older live services were not re-tested in this audit. [Time assignment](https://itpima.web.app/smf26/time/) |
| 5 Social | Complete locally: independent author identities, nicknames, My Flowers, all-author Timeline, author details, real two-browser sharing, and discovery across authors. Timeline supplies all-artwork browsing without a separate All Flowers tab. | The GitHub Pages demo is publicly hosted, with a separate garden in each browser. Internet-wide sharing, formal accounts, and cross-device identity recovery are not implemented in Secret Garden. Formal login is not the only identity route in the assignment. [Assignment](https://itpima.web.app/smf26/social/) |
| 6 HyperSpace | Complete: real 384-dimensional multilingual embeddings, cosine ranking, cross-language discovery, similarity-driven gathering, and navigation through flower selection. UMAP is not implemented; four gathering slots with adjusted distances are not dimensional reduction. | The UMAP experiment or its agreed alternative remains to be documented. [Assignment](https://itpima.web.app/smf26/handles-in-hyperspace/) |
| 7 Spatial | Complete: 3D petals, independent positions and depths, limited camera motion, parallax, overhead focus, and distance expressing connection strength. | The hybrid scene does not require a fully modeled free-roaming world. |
| 8 Body | Camera access, real model loading, local inference, lifecycle controls, and mouse fallback passed. Live human hand feel remains unverified. | A real palm-and-fist demonstration can provide further class or blog evidence. |
| 9 Interface Metaphor | Complete in the prototype: planting represents expression; flowers represent thoughts; semantic gathering and fusion help discover others. The space reorganizes around the current selection. | Concept sketches, explanation, and Blog Writing submission are unverified. [Assignment](https://itpima.web.app/smf26/interface-metaphor/) |
| 10 Level | No executed Colab Notebook or self-trained small-model result is included in this project. Using pretrained tracking or embeddings does not itself complete that experiment. | Colab, an ML5 small network, or a Tiny LLM is a possible route; interpolation is an optional experiment direction. Manifesto submission is unverified. No additional website page is required. [Assignment](https://itpima.web.app/smf26/level/) |
| 11 Research | Secret Garden is an existing final-project prototype that can be developed further. A NotebookLM result or link has not been supplied in the project materials. | Proposal, audience, motivation, method, plan, prior art, first step, NotebookLM sources, and Dashboard links require a separate submission check. [Assignment](https://itpima.web.app/smf26/research/) |

The production app does not automatically populate fictional Mira or Leo artworks. Its central example is explicitly labeled **Demo flower**. Names such as Audit Mira, Demo Mira, and Demo Leo in audit evidence identify test visitors and a separate test database. The source package contains no private artwork database or user sessions.

The app supports multilingual user writing. A person's original thought stays in its authored language; this is different from the language of the interface and documentation.

## 4 Recorded test results and evidence

### Browser flows tested on November 24

- Local welcome, empty-input validation, nickname, form and color, Grow, planting at 60%, refresh recovery, My Flowers, Timeline, details, replay seeking, and returning.
- Demo focus, play, pause, bloom stages, and reset.
- Native Grow mouse dragging from 0% to 56%, own-flower repositioning without accidental focus, and soft hover feedback.
- Two independent identities in an in-app browser and Chrome planted and automatically saw each other's flowers. My Flowers counts were one and two; the shared Timeline showed three. Both refreshes recovered the collection.
- Real multilingual embeddings connected a family-dinner memory across languages while excluding an unrelated train-ticket sentence.
- Gathering, light effects, native drag fusion, persistent merge after release, original-text retention, blank-space separation, focus switching, Hide Connections, and Back to Garden.
- An existing own bud continued to 10% through keyboard control and saved to the shared garden. Display-only focus did not overwrite saved openness.
- Real Chrome camera access, local model loading, pause, resume, and close, without saving video or camera screenshots.
- Final browser logs contained no blocking script errors or warnings.

### Automated checks passed on November 24

Fourteen existing Node suites passed: intro, garden-history, shared-data, shared-ui, shared-scene, position-data, garden-drag, garden-position-scene, body-hand, body-continuity, semantic-connections, semantic-motion, semantic-focus, and connection-fusion.

Eight backend HTTP and SQLite tests passed. They covered two authors, creation and reading, ownership, restart recovery, concurrency, openness, position, and input validation, using temporary databases. An additional 167 surface, camera, and fusion-pose checks completed 1,772,810 finite coordinate or gradient operations. Connection motion covered 2,700 cases. These are correctness checks, not flower-count FPS stress tests.

| Evidence | View |
| --- | --- |
| [Garden](<Secret Garden V1 garden.jpg>) | Glass flowers and layered background |
| [Overhead focus](<Secret Garden V1 focus.jpg>) | Petal arrangement and text layout |
| [Connections](<Secret Garden V1 connections.jpg>) | Semantic discovery and spatial gathering |
| [Fusion](<Secret Garden V1 fusion.jpg>) | Two-color petals, combined sentence, and original thoughts |
| [Timeline](<Secret Garden V1 timeline.jpg>) | Works from independent test visitors |

Presentation screenshots were refreshed on November 25 with English example thoughts and English dates. The English planting, Timeline, focus, semantic discovery, and drag-fusion flow was checked again with two independent browser identities; the three affected history, shared-interface, and focus test suites also passed. Original user thoughts remain multilingual. The numerical measurements above are from the November 24 audit.

### Verification limits

The November 24 shared browser test used two independent browsers on one computer, not two physical Wi-Fi devices. Local-mode browser testing used static HTTP; direct-file behavior was covered by the same code and data tests. Live human gesture feel, large flower counts, other operating systems, and public HTTPS access were outside that recorded test scope. The public release does not extend these historical results to cross-device or cross-network sharing.

## 5 Remaining work

| Priority | Work | Category | Effect on V1 |
| --- | --- | --- | --- |
| Before presentation | Test a real palm-and-fist sequence and a cross-flower sweep on the presenting computer; preload both models. | Acceptance | Needed to confirm Body feel. The mouse flow already works. |
| Before a two-device demo | Confirm both physical computers can reach the same LAN service address. | Acceptance | Two-browser sharing passed. LAN visitors retain mouse control. |
| Later | Define the intended maximum flower count, measure performance, and optimize based on results. | Website performance | A three-flower demo passed; arbitrary scale is not certified. |
| P2 | Real text suggestions, appearance mapping, and editing or selecting suggestions. | Website feature | Clearly labeled presets remain usable. |
| P2 | UMAP layout experiment integrated with current gathering motion. | Website and technical experiment | Real embeddings and semantic gathering already work. |
| Coursework | Relate earlier Week 4 and Week 5 Firebase evidence to the Time and Social requirements. | Course evidence | Secret Garden does not need an unrequested cloud setup for today's demonstration. |
| Coursework | Complete and retain a Colab or self-training experiment. | Level experiment | Can be separate from the website. |
| Coursework | Verify sketches, blog posts, Manifesto, Proposal, NotebookLM, and Dashboard links. | Submission materials | Determines assignment completeness, not local website operation. |
| For internet sharing | Choose shared-backend storage and verify cross-network behavior over HTTPS. | Future shared deployment | The public GitHub Pages demo is single-user. Existing Python SQLite sharing remains local or LAN only. |
| Deferred | Complete the project owner's two-step verification before alternative Firebase Hosting publication. | Hosting option | GitHub Pages supplies the current public demo; Firebase Hosting does not itself add a shared backend. |

## 6 Running and submitting V1

### Local presentation

Keep the project structure intact. On macOS, double-click **outputs/Start Shared Garden.command** and keep its terminal window open. It requires Python 3 and opens `http://127.0.0.1:8851/`. Existing artworks remain in `server/data/garden.sqlite3`.

Another computer on the same Wi-Fi uses the **Invite on this Wi-Fi** address printed in that terminal. Identity belongs to a browser. Changing a nickname does not create a second user; use independent browsers for a two-person demonstration on one computer.

For single-user static preview, run `python3 -m http.server 8000 --bind 127.0.0.1 --directory outputs` from the project root, then open `http://127.0.0.1:8000/Secret%20Garden.html`. Direct-file mode, different ports, and shared mode have separate storage origins. Artworks are not automatically migrated between them.

Keep **body-assets** and **semantic-assets** with the HTML. They provide real local hand tracking and semantic inference. Fonts and background are embedded. First semantic discovery loads approximately 110 MB of local resources; later uses can reuse cached sentence vectors.

### GitHub submission and live access

The project source is uploaded under `secret-garden` on the `secret-garden-v1` branch of [Shares-Mindes](https://github.com/ZixuanLydia/Shares-Mindes). That branch is the repository's default source view, alongside the earlier assignments. The public demo is available through the existing GitHub Pages route at **[Secret Garden](https://zixuanlydia.github.io/Shares-Mindes/secret-garden/)**.

A teacher can open the public demo directly, browse the source, English instructions, audit, and screenshots on GitHub, or download the project for local shared use. Opening an HTML file in GitHub's file viewer displays source; it does not launch the interactive garden. Public-demo records stay in the visitor's browser and do not synchronize with other visitors or the local SQLite service.

Alternative Firebase Hosting publication remains deferred pending the project owner's two-step verification. There is no Firebase backend in this release. Public access to the prototype does not establish completion of the separate coursework and submission checks listed above.

The V1 handoff package contains the app, local model resources, Python shared service, build sources, tests, and documentation. It excludes private databases and browser sessions. Preserve the directory structure after extraction.
