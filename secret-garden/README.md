# Secret Garden

**A Garden of Shared Thoughts** is a desktop interaction project for NYU ITP Shared Minds. Plant a thought as a glass flower, shape its bloom with your hand, and explore connections through camera movement, gathering flowers, two-color fusion, and growth replay.

**This is a source-code submission with a local preview. Secret Garden is not deployed as a public, click-to-play website.** Viewing its HTML on GitHub displays the source. Download or clone the repository and follow the steps below to run it.

## Run locally

Requires Python 3. Open a terminal in the `secret-garden` project folder, where this README is located, and run:

```sh
python3 server/shared_garden.py
```

Open **http://127.0.0.1:8851/** and keep the terminal running. On macOS, you can instead double-click `outputs/Start Shared Garden.command`.

For trusted Wi-Fi sharing, run `python3 server/shared_garden.py --host 0.0.0.0` and give the second computer the **Invite on this Wi-Fi** address printed in the terminal. For two people on one computer, use two independent browsers. The host can use the camera on localhost; ordinary HTTP Wi-Fi visitors use mouse controls.

For a single-user static preview, run `python3 -m http.server 8000 --bind 127.0.0.1 --directory outputs` and open **http://127.0.0.1:8000/Secret%20Garden.html**.

Keep `outputs/body-assets` and `outputs/semantic-assets` with the HTML. They contain the local hand-tracking and sentence-embedding models.

## What is implemented

The project uses procedural 3D petals, MediaPipe hand tracking, multilingual MiniLM sentence embeddings, JSON, localStorage, and a local SQLite service with separate author identities. Association words are labeled presets, and fusion sentences use local composition rules. There is no generative AI service, UMAP layout, or Firebase connection in Secret Garden.

Flower records persist in the browser or `server/data/garden.sqlite3`. Keep the database and browser identity to retain work and ownership. The submission package contains no personal flower database or session credentials.

## Build and documentation

After editing source files in `work`, run `python3 work/build-preview.py` to rebuild `outputs/Secret Garden.html`. Node checks are in `work/*qa.cjs`; from `server`, run `python3 -B -m unittest test_shared_garden.py` for the backend checks.

- [User guide and demonstration steps](outputs/USER_GUIDE.md)
- [V1 implementation and course audit](<outputs/Secret Garden V1 Audit.md>)
- [Model and runtime licenses](outputs/semantic-assets/NOTICE.txt), [hand-tracking notice](outputs/body-assets/NOTICE.txt), and [font licenses](outputs/type-assets/NOTICE.txt)
