# Secret Garden User Guide

Secret Garden is a desktop prototype for NYU ITP Shared Minds. Each thought becomes a glass flower that can bloom, move, connect with other flowers, and retain a history.

**The GitHub submission provides source code, screenshots, and local running instructions. Secret Garden has not been deployed as an online interactive website.** A GitHub HTML file view shows code; use a local preview to interact with the garden.

## Start the local garden

Requires Python 3. Run commands from the Secret Garden project folder, which contains `server`, `work`, and `outputs`.

```sh
python3 server/shared_garden.py
```

Open **http://127.0.0.1:8851/**. Keep the terminal open during the demonstration; press **Control+C** to stop it. On macOS, double-clicking **Start Shared Garden.command** in `outputs` starts the same service and opens the garden.

To share with another computer on a trusted Wi-Fi network, run:

```sh
python3 server/shared_garden.py --host 0.0.0.0
```

The other computer opens the **Invite on this Wi-Fi** address printed in the terminal. Both visitors must use the same service. Updates normally appear within one or two seconds. For two visitors on one computer, use two independent browsers or a regular and a private window; two regular tabs usually share one identity.

For a single-user static preview without the shared service, run:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory outputs
```

Open **http://127.0.0.1:8000/Secret%20Garden.html**. The HTML can also be opened directly, but browser file-storage restrictions vary. Static preview, direct-file preview, different ports, and the shared service have separate browser storage; existing records do not migrate automatically.

Keep **body-assets** and **semantic-assets** beside the HTML. The background and fonts are embedded. Font and model loading does not require a paid service. This version is intended for desktop use.

## Plant and explore

1. Click **Plant a Thought**, enter a thought and an optional nickname, then click **Next**. Later drafts reuse the last nickname.
2. Read the **Preset associations** and choose a flower shape and color. The words are displayed presets, not editable AI suggestions.
3. Click **Grow flower**. Drag the flower upward or adjust the bloom slider. The slider also supports keyboard controls. You can plant a bud, a partly open flower, or a full bloom.
4. Click **Plant in Garden**. The new flower appears in the scene with its current bloom state and recorded growth.
5. Click a flower to look closer. Over approximately two seconds, the camera approaches and rises to an almost overhead view while the petals open.
6. The thought, nickname, creation time, and keywords fade in beside the flower. Click **Back to Garden** or press **Esc** to return.

The title appears and fades out on every page load. Clicking or starting an interaction dismisses it sooner. This introduction never reads or writes flower records; reduced-motion mode skips the animation.

Move the mouse to experience depth-dependent parallax. The **Parallax** control turns it on or off. The central **Demo flower** is explicitly a demonstration object, not another person's work. After returning from its focus view, its bloom controls offer **Bud**, **Half-open**, **Bloom**, playback, pause, and reset.

## Move flowers and continue growth

- Hold and drag a flower to change its position. A short movement threshold separates dragging from clicking to focus.
- Release your own flower to save its new position. In shared mode, the new position also synchronizes to other visitors.
- Another person's flower can be moved temporarily; it returns to its saved position after release. The central demo flower can be repositioned for the current visit.
- To continue opening your own planted flower, hold **Shift** and drag upward. Once it is selected, the **Up Arrow** also continues growth. Release to save a pointer-driven growth change.
- Press **Esc** to cancel a move. Losing window focus or resizing also cancels an unfinished move without saving it.

Moving a flower does not change its color, shape, depth, bloom progress, or growth history. Saved growth only advances; temporary focus and Body animation can open and close without overwriting that saved state.

## Find connections and fuse flowers

In a planted flower's overhead view, click **Find Connections**. The garden compares the meanings of original thoughts. Up to four related flowers gather around the focus; stronger connections appear closer and produce more noticeable light and pollen. The accompanying list can show all matches above the threshold.

Drag a gathered small flower until it touches the main flower. Their petals interleave into a two-color glass flower and warm light travels along the rims. They stay joined after release. A composed sentence appears beside them, with both original thoughts and authors retained below it.

Click an empty area or **Separate flowers** to split them. The small flower follows an arc back to its gathered position. Click a gathered flower or its list entry to switch focus smoothly. **Hide Connections** or **Back to Garden** restores the saved garden layout. These poses and fusions are temporary presentation states and do not rewrite either original work.

## Use Body mode

1. Click **Body mode**, then **Enable camera**, and grant camera access. The mirrored preview and garden marker show the hand's location.
2. Open your palm to open the flower; slowly make a fist to close it. Partly extended fingers produce intermediate bloom states.
3. Move an open hand near another flower to change the target. Closing the hand or pulling it back keeps the previous target. Movement can produce gentle sway and light spreading to nearby flowers.
4. In **Plant a Thought → Grow flower**, the same hand controls shape the draft's bloom and record its opening and closing sequence for planting.
5. **Pause camera** stops the camera, **Resume camera** starts it again, and **Close** ends tracking. Focus, details, history, text/style steps, and hidden tabs automatically pause the camera.

The host's localhost address can use the camera. Ordinary HTTP Wi-Fi visitor addresses usually cannot; mouse and keyboard controls remain available. See the [browser camera security requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

MediaPipe computes hand landmarks locally. Only video is requested, with audio disabled. Camera frames are not uploaded or saved. Denied permissions, unavailable hardware, or model-loading failure leave the mouse controls usable. Tracking uses the newest frame and smoothing rather than queuing old frames. Very small movement is filtered as noise.

The chosen Body interaction is palm opening and fist closing; the earlier dwell-to-grow experiment is no longer a second control scheme. Body effects on existing garden flowers are temporary. Grow preserves the last draft state and records its gesture sequence when the flower is planted.

## View history and replay growth

**My Flowers** lists work created by the current browser identity. **Timeline** browses all shared authors by creation time, newest first. Click an entry to reopen the original flower and its details; **Back** returns to the previous list position.

Click **Replay growth** in the details. The camera moves closer and plays the saved bloom samples, including their time, progress, and input source. Pause, restart, or seek through the replay. Long idle periods are compressed into a short presentation. Exiting restores the flower's saved bloom state.

Older flowers without recorded motion show **Saved state**. Their past gestures cannot be reconstructed from a final bloom value. Future recorded growth can extend the known history. Normal focus, temporary Body resonance, and fusion are presentation animations rather than saved growth samples.

## Data and identity

Each flower is an independent JSON record with an ID, author snapshot, original thought, associations, form, color, size, openness, position, creation time, and growth samples. A simplified example is:

```json
{
  "id": "flower-id",
  "author": { "id": "author-id", "name": "Mira" },
  "thought": "I remember the quiet sound of rain.",
  "associations": ["Stillness", "Movement", "Reflection"],
  "appearance": { "form": "cup", "color": "peach", "size": 0.39, "openness": 0.65 },
  "position": { "x": 0.82, "y": 0.61, "z": 0.43 },
  "createdAt": "2026-11-24T20:00:00.000Z",
  "growth": [{ "id": "sample-id", "at": "2026-11-24T20:00:00.000Z", "openness": 0.65, "source": "planted" }]
}
```

Single-user records use **localStorage**, under `secret-garden:v1`. Shared records persist in **server/data/garden.sqlite3** on the host, while `secret-garden:shared:v1` holds a separate browser cache and retry queue. Stopping and restarting the same server does not clear its database. Preserve that database and the browser identity. Clearing browser site data can remove local-only work or shared ownership credentials; there is no account recovery or cross-device login.

Only authors can save their flowers' positions and growth. Everyone in the shared garden can view thoughts and use presentation interactions. Pending changes are labeled **Waiting to share** and are retried after reconnection. Local-only records are not automatically published into the shared garden. The submission package excludes personal records, session credentials, and test databases.

## Technology and extension interfaces

Flowers use procedural three-dimensional petal surfaces with front and back faces, thickness, rounded edges, and folds, projected onto Canvas 2D. The overhead view redraws the same geometry continuously. The garden background is a static image with layered parallax; this is a hybrid scene rather than a freely navigable 3D world.

Semantic ranking uses a quantized **paraphrase-multilingual-MiniLM-L12-v2** model: 384-dimensional sentence vectors compared with cosine similarity. English and Chinese thoughts can match. Preset association words do not determine the semantic ranking. The prototype threshold is 0.34; a similarity score is not a probability or accuracy value.

The roughly 110 MB semantic runtime/model assets load on first use and run locally in a Worker. Vectors are cached in IndexedDB when available. The fusion sentence and explanatory themes use local composition rules rather than a generative language model. Model failure is disclosed and falls back to the older keyword matcher. Gathering uses fixed directions adjusted by similarity, not UMAP.

| Interface | Purpose |
| --- | --- |
| `GardenData.load()` / `save(flowers)` | Read and merge flower records. |
| `createFlower(draft)` | Create a validated independent record with its ID, timestamp, and author snapshot. |
| `saveBloom(id, openness, options)` / `savePosition(id, position)` | Persist growth and position separately. |
| `growthPoint(...)` / `growthFor(record)` | Record samples and read compatible growth history. |
| `getNickname()` / `setNickname(name)` | Read or update the next draft's nickname. |
| `GardenShared` | Asynchronous shared records, server-issued identity, ownership checks, synchronization, and retries. |
| `GardenSemantic.embed(texts)` | Calculate sentence vectors independently of flower data. |

Secret Garden has no Firebase connection, paid AI API, generative AI suggestions, UMAP layout, or public deployment. Earlier Week 4 and Week 5 coursework in the course repository separately contains Firebase integration and recorded tests; it should be considered separately from Secret Garden's implementation. Independent Colab/training experiments and Blog/Dashboard materials are also separate deliverables. See the [implementation and course audit](<Secret Garden V1 Audit.md>) for status and verification limits.

Model and runtime attribution is in [semantic-assets/NOTICE.txt](semantic-assets/NOTICE.txt) and [body-assets/NOTICE.txt](body-assets/NOTICE.txt). Font attribution is in [type-assets/NOTICE.txt](type-assets/NOTICE.txt). These notices link the upstream sources and included licenses.
