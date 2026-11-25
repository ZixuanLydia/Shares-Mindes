from base64 import b64encode
from pathlib import Path

root = Path(__file__).resolve().parent.parent
work = root / "work"
page = (work / "garden-template.html").read_text()
image = b64encode((work / "garden.jpg").read_bytes()).decode("ascii")
page = page.replace("__GARDEN_JPEG__", image)
for marker, file in {
    "__TYPE_FONTS__": "type-fonts.css",
    "__TYPOGRAPHY_CSS__": "typography.css",
    "__PLANT_CSS__": "plant.css",
    "__PLANT_ENTRY__": "plant-entry.html",
    "__PLANT_MARKUP__": "plant-markup.html",
    "__HISTORY_CSS__": "history.css",
    "__HISTORY_ENTRY__": "history-entry.html",
    "__HISTORY_MARKUP__": "history-markup.html",
    "__HISTORY_APP__": "history.js",
    "__FOCUS_CSS__": "focus.css",
    "__FOCUS_MARKUP__": "focus-markup.html",
    "__FOCUS_APP__": "focus.js",
    "__REPLAY_CSS__": "replay.css",
    "__REPLAY_MARKUP__": "replay-markup.html",
    "__REPLAY_APP__": "replay.js",
    "__BODY_CSS__": "body.css",
    "__BODY_ENTRY__": "body-entry.html",
    "__BODY_MARKUP__": "body-markup.html",
    "__BODY_DETECTOR__": "body-detector.js",
    "__BODY_CAMERA__": "body-camera.js",
    "__BODY_HAND__": "body-hand.js",
    "__BODY_MOTION__": "body-motion.js",
    "__CONNECTIONS_DATA__": "connections.js",
    "__SEMANTIC_ENGINE__": "semantic-engine.js",
    "__SEMANTIC_WORKER__": "semantic-worker.js",
    "__CONNECTIONS_MOTION__": "connection-motion.js",
    "__CONNECTIONS_DRAG__": "connection-drag.js",
    "__FLOWER_RENDERER__": "flower.js",
    "__GARDEN_DATA__": "garden-data.js",
    "__SHARED_APP__": "shared-garden.js",
    "__SHARED_CSS__": "shared.css",
    "__POSITION_DRAG_APP__": "garden-drag.js",
    "__POSITION_DRAG_CSS__": "garden-drag.css",
    "__INTRO_CSS__": "intro.css",
    "__INTRO_APP__": "intro.js",
    "__PLANT_APP__": "plant.js",
    "__GARDEN_APP__": "garden.js",
}.items():
    page = page.replace(marker, (work / file).read_text().rstrip())
(root / "outputs" / "Secret Garden.html").write_text(page)
