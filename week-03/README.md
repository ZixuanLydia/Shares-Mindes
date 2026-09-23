# Small Pieces

A small Share Mind Week 3 collage experiment: independent image pieces become a different whole through arrangement.

Serve this folder through a static HTTP server and open `index.html`. From the repository root, run `python3 -m http.server 8000` and visit `http://localhost:8000/week-03/`. No dependencies, keys or paid APIs. User images are resized locally and never uploaded to a server. JSON state, including imported image data, is saved to this browser's localStorage. Export JSON for a backup; there is no cloud synchronization. The library contains pre-generated AI material, not live model integration. The non-text model experiment happens during material preparation, outside this website.

Drag individual pieces, resize, rotate, change their order, or enable gentle floating. Arrow keys move a focused piece; Shift moves farther. Reduced-motion preferences disable animation. Import supports PNG, JPEG and WebP, with a 12-piece limit. Browser storage errors are surfaced; JSON export remains available.
