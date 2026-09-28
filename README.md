# Shares Mindes

Weekly projects and experiments for the Shares Mindes course.

## Projects

- **Week 3 — Small Pieces**: an interactive collage exploring parts and the whole. [Open website](https://zixuanlydia.github.io/Shares-Mindes/week-03/) · [Project notes](week-03/README.md) · [Source code](week-03/)
- **Week 4 — Small Pieces in Time**: arrange scenes, change their order, play a story, save to Firebase and share a read-only snapshot. [Open website](https://zixuanlydia.github.io/Shares-Mindes/week-04/) · [Project notes](week-04/README.md) · [Source code](week-04/)

Each week's project lives in its own folder, such as `week-03`. Future assignments can be added without replacing earlier work.

## Run locally

From this folder, run `python3 -m http.server 8000`, then visit `http://localhost:8000/week-03/`.

AI collage materials were generated in advance; there is no live AI model call. Week 3 is browser-local. Week 4 keeps a local draft and uploads scene data and embedded images to Firebase only when the visitor saves to cloud or publishes a share. Shared snapshots are readable by anyone with the link; private drafts are not. Visitor creations are not uploaded to GitHub.
