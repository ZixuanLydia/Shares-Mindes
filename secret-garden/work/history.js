// History presents the scene's saved records and opens the same flower by ID.
(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const dayFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });
  const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
  const timeFormat = new Intl.DateTimeFormat("en-US", { timeStyle: "medium" });
  const colorNames = { peach: "Peach", lilac: "Lilac", blue: "Ice blue" };
  const formNames = { cup: "Cup", flared: "Flared", tall: "Tall" };
  const sharedView = () => window.GardenData.status
    ? window.GardenData.status.mode !== "local" : Boolean(window.GardenData.isShared);

  function setup({ listFlowers, onOpen, onSelect }) {
    const trigger = byId("open-history");
    const panel = byId("history-panel");
    const tabs = [byId("history-my"), byId("history-timeline")];
    const list = byId("history-list");
    const empty = byId("history-empty");
    const count = byId("history-count");
    let activeTab = 0;
    let returnScroll = 0;
    let rowsById = new Map();

    function makeRow(record, date, timeline) {
      const row = document.createElement("button");
      row.className = "history-row";
      row.type = "button";
      row.dataset.flowerId = record.id;
      const thought = document.createElement("span");
      thought.className = "history-row-title";
      thought.textContent = record.thought;
      const metadata = document.createElement("span");
      metadata.className = "history-row-meta";
      const appearance = colorNames[record.appearance.color] + " · " + formNames[record.appearance.form];
      const stamp = document.createElement("time");
      stamp.dateTime = record.createdAt;
      stamp.textContent = timeline ? timeFormat.format(date) : dateFormat.format(date);
      if (sharedView()) metadata.append(record.author.name + " · ");
      metadata.append(stamp, " · " + appearance);
      const growth = document.createElement("span");
      growth.className = "history-row-growth";
      const recorded = window.GardenData.growthFor(record).some(point => point.source !== "snapshot");
      growth.textContent = Math.round(record.appearance.openness * 100) + "% open · "
        + (recorded ? "Growth recorded" : "Saved state");
      row.append(thought, metadata, growth);
      row.addEventListener("click", () => {
        returnScroll = list.scrollTop;
        onSelect(record.id);
      });
      rowsById.set(record.id, row);
      return row;
    }

    function render() {
      const timeline = activeTab === 1;
      const records = listFlowers().filter(record => timeline || !sharedView()
        || window.GardenData.isOwn(record)).sort((first, second) =>
        Date.parse(second.createdAt) - Date.parse(first.createdAt) || first.id.localeCompare(second.id));
      panel.dataset.historyView = timeline ? "timeline" : "my";
      list.setAttribute("aria-labelledby", tabs[activeTab].id);
      for (const [index, tab] of tabs.entries()) {
        tab.setAttribute("aria-selected", String(index === activeTab));
        tab.tabIndex = index === activeTab ? 0 : -1;
      }

      if (count) {
        count.hidden = records.length === 0;
        count.textContent = records.length + (records.length === 1 ? " flower" : " flowers");
      }
      empty.hidden = records.length > 0;
      empty.textContent = sharedView() && timeline
        ? "Be the first to plant a thought in this garden."
        : "Your planted flowers will appear here.";
      rowsById = new Map();
      const content = document.createDocumentFragment();
      if (timeline) {
        let lastDay = "";
        let group;
        for (const record of records) {
          const date = new Date(record.createdAt);
          const day = date.toDateString();
          if (day !== lastDay) {
            lastDay = day;
            group = document.createElement("section");
            group.className = "history-group";
            const heading = document.createElement("h3");
            heading.className = "history-date";
            heading.textContent = dayFormat.format(date);
            group.append(heading);
            content.append(group);
          }
          group.append(makeRow(record, date, true));
        }
      } else {
        for (const record of records) content.append(makeRow(record, new Date(record.createdAt), false));
      }
      list.replaceChildren(content);
    }

    // Live arrivals update the open history without moving the reader or stealing
    // focus from controls outside the list. My Flowers remains the owner's view.
    function refresh() {
      if (panel.hidden) return false;
      const scroll = list.scrollTop;
      const focusedId = list.contains(document.activeElement)
        ? document.activeElement?.dataset.flowerId : null;
      render();
      list.scrollTop = scroll;
      if (focusedId) rowsById.get(focusedId)?.focus({ preventScroll: true });
      return true;
    }

    function open(restoreId = null) {
      onOpen();
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      render();
      const returnRow = rowsById.get(restoreId);
      list.scrollTop = returnRow ? returnScroll : 0;
      (returnRow ?? tabs[activeTab]).focus({ preventScroll: true });
    }

    function close(restoreFocus = true) {
      if (panel.hidden) return false;
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      if (restoreFocus) trigger.focus({ preventScroll: true });
      return true;
    }

    function activate(index) {
      activeTab = index;
      render();
      list.scrollTop = 0;
      tabs[index].focus({ preventScroll: true });
    }

    for (const [index, tab] of tabs.entries()) {
      tab.addEventListener("click", () => activate(index));
      tab.addEventListener("keydown", (event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          activate(1 - index);
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          activate(event.key === "Home" ? 0 : tabs.length - 1);
        }
      });
    }
    trigger.addEventListener("click", () => {
      if (!close()) open();
    });
    byId("history-close").addEventListener("click", () => close());

    return { open, close, refresh };
  }

  window.GardenHistory = { setup };
})();
