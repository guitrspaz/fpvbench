const $ = (selector, root = document) => root.querySelector(selector);
const content = $("#content");
let state = { aircraft: [], snapshots: [], sessions: [] };
let aircraftId = localStorage.getItem("fpvbench.aircraft") || "";
let currentView = "overview";
let detailId = null;
let editingSessionId = null;
let renderRevision = 0;
let fileRevision = 0;
let fileReading = false;
let importFilename = "pasted-export.txt";
let originalFileText = null;
let noticeTimer;

function element(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value !== null && value !== undefined)
      node.setAttribute(key, String(value));
  }
  node.append(
    ...children.filter((child) => child !== null && child !== undefined),
  );
  return node;
}

function button(text, action, className = "secondary") {
  return element("button", {
    type: "button",
    class: className,
    text,
    onclick: action,
  });
}

function badge(text, tone = "") {
  return element("span", { class: `badge ${tone}`, text });
}

function date(value, withTime = false) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
  }).format(new Date(value));
}

function selectedAircraft() {
  return state.aircraft.find((item) => item.id === aircraftId);
}

function snapshots() {
  return state.snapshots
    .filter((item) => item.aircraftId === aircraftId)
    .sort((a, b) => new Date(b.importedAt) - new Date(a.importedAt));
}

function sessions() {
  return state.sessions
    .filter((item) => item.aircraftId === aircraftId)
    .sort((a, b) => new Date(b.flownAt) - new Date(a.flownAt));
}

async function api(path, body, method = "POST") {
  const response = await fetch(
    path,
    body === undefined
      ? {}
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}

function notify(message, error = false) {
  clearTimeout(noticeTimer);
  const notice = $("#notice");
  notice.textContent = message;
  notice.className = error ? "error" : "";
  notice.hidden = false;
  noticeTimer = setTimeout(
    () => {
      notice.hidden = true;
    },
    error ? 14000 : 7000,
  );
}

async function refresh() {
  state = await api("/api/state");
  if (!selectedAircraft()) aircraftId = state.aircraft[0]?.id || "";
  localStorage.setItem("fpvbench.aircraft", aircraftId);
  const selector = $("#aircraft-select");
  selector.replaceChildren(
    ...(state.aircraft.length
      ? state.aircraft.map((item) =>
          element("option", { value: item.id, text: item.name }),
        )
      : [element("option", { value: "", text: "No aircraft yet" })]),
  );
  selector.value = aircraftId;
  $("#import-snapshot").disabled = !aircraftId;
  $("#new-session").disabled = !aircraftId;
  await render();
}

function empty(
  title,
  description,
  action,
  actionLabel = "Import your first setup",
) {
  return element(
    "div",
    { class: "panel empty" },
    element("div", { class: "empty-symbol", "aria-hidden": "true", text: "◈" }),
    element("h2", { text: title }),
    element("p", { text: description }),
    action ? button(actionLabel, action, "primary") : null,
  );
}

function showOnboarding() {
  const panel = empty(
    "A fresh start for your fleet",
    "Keep your preferred setup, see what changed, and connect each experiment to a flight. Start by adding your first aircraft.",
    () => openDialog("aircraft"),
    "+ Add your first aircraft",
  );
  panel.classList.add("onboarding");
  const steps = element("div", { class: "steps" });
  [
    [
      "01",
      "Save your setup",
      "Import a Betaflight dump or diff. Every snapshot keeps the exact original export.",
    ],
    [
      "02",
      "Make changes visible",
      "Compare settings against a preferred baseline, including gaps in sparse exports.",
    ],
    [
      "03",
      "Learn from each flight",
      "Record your setup, conditions, and observations in one place.",
    ],
  ].forEach(([number, title, description]) =>
    steps.append(
      element(
        "div",
        {},
        element("span", { class: "step-number", text: number }),
        element("h3", { text: title }),
        element("p", { text: description }),
      ),
    ),
  );
  panel.append(steps);
  content.replaceChildren(panel);
}

const viewCopy = {
  overview: [
    "SETUP. FLY. LEARN.",
    "Your flight workbench",
    "A clear record of your setup, and what happened next.",
  ],
  history: [
    "PRESERVED, EVERY TIME",
    "Setup history",
    "Your original exports, saved as immutable snapshots.",
  ],
  compare: [
    "UNDERSTAND THE CHANGE",
    "Compare setups",
    "Literal settings side by side, with uncertainty kept visible.",
  ],
  sessions: [
    "FROM THE FIELD",
    "Flight sessions",
    "Connect your setup to conditions, observations, and results.",
  ],
};

async function render() {
  const revision = ++renderRevision;
  const [eyebrow, title, description] = viewCopy[currentView];
  $("#page-eyebrow").textContent = eyebrow;
  $("#page-title").textContent = title;
  $("#page-description").textContent = selectedAircraft()
    ? `${selectedAircraft().name} · ${description}`
    : description;
  $("#breadcrumb").textContent =
    `WORKBENCH / ${currentView === "history" ? "SETUP HISTORY" : currentView.toUpperCase()}`;
  document.querySelectorAll(".nav-item").forEach((item) => {
    const active = item.dataset.view === currentView;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  if (!aircraftId) return showOnboarding();
  if (currentView === "overview") showOverview();
  if (currentView === "history") {
    if (detailId && snapshots().some((item) => item.id === detailId))
      await showDetail(detailId, revision);
    else showHistory();
  }
  if (currentView === "compare") showCompare(revision);
  if (currentView === "sessions") showSessions();
}

function panelHeading(title, description, action) {
  return element(
    "div",
    { class: "panel-heading" },
    element(
      "div",
      {},
      element("h2", { text: title }),
      description ? element("p", { text: description }) : null,
    ),
    action || null,
  );
}

function stat(label, value, note) {
  return element(
    "div",
    { class: "stat" },
    element("div", { class: "stat-label", text: label }),
    element("div", { class: "stat-value", text: value }),
    element("div", { class: "stat-note", text: note }),
  );
}

function showOverview() {
  const history = snapshots();
  const flights = sessions();
  const baseline = history.find(
    (item) => item.id === selectedAircraft().baselineSnapshotId,
  );
  const stats = element(
    "div",
    { class: "stats" },
    stat("Setup snapshots", history.length, "Original exports preserved"),
    stat(
      "Flight sessions",
      flights.length,
      flights[0]
        ? `Last flight ${date(flights[0].flownAt)}`
        : "Ready for your first flight",
    ),
    stat(
      "Preferred baseline",
      baseline ? "Saved" : "Not set",
      baseline ? baseline.label : "Choose a trusted reference",
    ),
  );
  const historyPanel = element(
    "section",
    { class: "panel" },
    panelHeading(
      "Recent setups",
      "A trail of changes, without overwriting the past.",
      button("View all →", () => navigate("history"), "text-button"),
    ),
  );
  if (history.length)
    history
      .slice(0, 4)
      .forEach((item) => historyPanel.append(snapshotRow(item)));
  else
    historyPanel.append(
      element("p", {
        class: "muted",
        text: "No snapshots yet. Import a CLI export to start your setup history.",
      }),
      button("↑ Import setup", () => openImport(), "text-button"),
    );
  const baselinePanel = element(
    "section",
    { class: "panel" },
    panelHeading(
      "Your reference setup",
      "Keep a preferred point of comparison.",
    ),
  );
  if (baseline)
    baselinePanel.append(
      element("h3", { text: baseline.label }),
      element("p", {
        class: "item-meta",
        text: `${baseline.parsed.firmware.version || "Version unknown"} · Imported ${date(baseline.importedAt)}`,
      }),
      element("p", {
        class: "notes",
        text: baseline.notes || "No notes on this setup.",
      }),
      button(
        "Inspect baseline →",
        () => viewSnapshot(baseline.id),
        "text-button",
      ),
    );
  else
    baselinePanel.append(
      element("p", {
        class: "muted",
        text: "Open any saved snapshot and mark it as your preferred baseline.",
      }),
    );
  baselinePanel.append(
    element("p", {
      class: "proof-note",
      text: "A preferred baseline is a reference you select. Its saved date does not confirm the current controller setup.",
    }),
  );
  const flightPanel = element(
    "section",
    { class: "panel" },
    panelHeading(
      "Latest flights",
      "Capture what the setup felt like.",
      button("View all →", () => navigate("sessions"), "text-button"),
    ),
  );
  if (flights.length)
    flights.slice(0, 3).forEach((item) =>
      flightPanel.append(
        element(
          "div",
          { class: "item-row" },
          element(
            "div",
            {},
            element("h3", { text: item.title }),
            element("p", {
              class: "item-meta",
              text: `${date(item.flownAt, true)}${item.location ? ` · ${item.location}` : ""}`,
            }),
          ),
          element(
            "div",
            { class: "row-actions" },
            outcomeBadge(item.outcome),
            button("Edit", () => openSession(item), "text-button"),
          ),
        ),
      ),
    );
  else
    flightPanel.append(
      element("p", {
        class: "muted",
        text: "No sessions logged. You can record a flight with or without a setup snapshot.",
      }),
    );
  content.replaceChildren(
    stats,
    element("div", { class: "two-col" }, historyPanel, baselinePanel),
    flightPanel,
  );
}

function snapshotRow(snapshot) {
  const baseline = selectedAircraft().baselineSnapshotId === snapshot.id;
  return element(
    "div",
    { class: "item-row" },
    element(
      "div",
      {},
      button(snapshot.label, () => viewSnapshot(snapshot.id), "item-title"),
      element("p", {
        class: "item-meta",
        text: `${date(snapshot.importedAt, true)} · ${snapshot.parsed.firmware.version || "Firmware unknown"} · ${snapshot.settingCount} settings`,
      }),
    ),
    element(
      "div",
      { class: "row-actions" },
      baseline ? badge("BASELINE", "amber") : null,
      badge(`${snapshot.parsed.exportKind} ${snapshot.parsed.exportScope}`),
      button("Inspect →", () => viewSnapshot(snapshot.id), "text-button"),
    ),
  );
}

function showHistory() {
  const history = snapshots();
  if (!history.length)
    return content.replaceChildren(
      empty(
        "Your setup history starts here",
        "Export dump all or diff all from Betaflight, then import the text file. Snapshots preserve the original source and can be linked to flight sessions.",
        openImport,
      ),
    );
  const panel = element(
    "section",
    { class: "panel" },
    panelHeading(
      `${history.length} saved ${history.length === 1 ? "snapshot" : "snapshots"}`,
      "Select a setup to explore its settings and original source.",
    ),
  );
  history.forEach((item) => panel.append(snapshotRow(item)));
  content.replaceChildren(panel);
}

function warningBox(warnings) {
  if (!warnings.length) return null;
  return element(
    "div",
    { class: "warning-box" },
    element("strong", { text: "Keep these limits in view" }),
    element("ul", {}, ...warnings.map((text) => element("li", { text }))),
  );
}

function filterSelect(label, values) {
  const select = element(
    "select",
    { "aria-label": label },
    element("option", { value: "", text: label }),
  );
  [...new Set(values)]
    .sort()
    .forEach((value) =>
      select.append(element("option", { value, text: value })),
    );
  return select;
}

function profileLabel(row) {
  return row.scope === "pid"
    ? `PID ${row.profile ?? "unknown"}`
    : row.scope === "rate"
      ? `Rate ${row.profile ?? "unknown"}`
      : "Global";
}

async function showDetail(id, revision) {
  content.replaceChildren(
    element("p", { class: "loading", text: "Loading snapshot…" }),
  );
  try {
    const snapshot = await api(`/api/snapshots/${encodeURIComponent(id)}`);
    if (revision !== renderRevision || snapshot.aircraftId !== aircraftId)
      return;
    const baseline = selectedAircraft().baselineSnapshotId === id;
    const panel = element(
      "section",
      { class: "panel" },
      button(
        "← All snapshots",
        () => {
          detailId = null;
          render();
        },
        "text-button",
      ),
      element(
        "div",
        { class: "detail-heading" },
        element(
          "div",
          {},
          element("h2", { text: snapshot.label }),
          element("p", {
            text: `Imported ${date(snapshot.importedAt, true)} · ${snapshot.filename}`,
          }),
        ),
        element(
          "div",
          { class: "detail-actions" },
          element("a", {
            class: "secondary",
            href: `/api/snapshots/${encodeURIComponent(id)}/raw`,
            download: "",
            text: "↓ Original export",
          }),
          baseline
            ? badge("PREFERRED BASELINE", "amber")
            : button(
                "Set as baseline",
                async (event) => {
                  const target = event.currentTarget;
                  target.disabled = true;
                  try {
                    await api(
                      `/api/aircraft/${encodeURIComponent(aircraftId)}`,
                      { baselineSnapshotId: id },
                      "PATCH",
                    );
                    await refresh();
                    notify("Preferred baseline saved.");
                  } catch (error) {
                    notify(error.message, true);
                    target.disabled = false;
                  }
                },
                "primary",
              ),
        ),
      ),
    );
    const firmware = snapshot.parsed.firmware;
    const metadata = element("div", { class: "metadata" });
    [
      ["Firmware", firmware.version || "Unknown"],
      ["Board", firmware.boardName || firmware.board || "Unknown"],
      [
        "Export",
        `${snapshot.parsed.exportKind} / ${snapshot.parsed.exportScope}`,
      ],
      ["Selected PID", snapshot.parsed.activeProfile ?? "Unknown"],
      ["Selected rate", snapshot.parsed.activeRateProfile ?? "Unknown"],
    ].forEach(([label, value]) =>
      metadata.append(
        element("span", {}, `${label} `, element("strong", { text: value })),
      ),
    );
    panel.append(
      metadata,
      snapshot.notes
        ? element("p", { class: "notes", text: snapshot.notes })
        : null,
      warningBox(snapshot.parsed.warnings),
      element("p", {
        class: "proof-note",
        text: "These values describe this export. Unknown settings are preserved as evidence; sparse exports do not include every firmware default.",
      }),
    );
    const entries = [
      ...snapshot.parsed.settings,
      ...snapshot.parsed.commands.map((command) => ({
        ...command,
        scope: "global",
        profile: null,
      })),
    ];
    const search = element("input", {
      type: "search",
      "aria-label": "Search settings",
      placeholder: "Search names or values…",
    });
    const category = filterSelect(
      "All categories",
      entries.map((item) => item.category),
    );
    const profile = filterSelect("All profiles", entries.map(profileLabel));
    const resultCount = element("p", { class: "result-count" });
    const table = element(
      "table",
      {},
      element(
        "thead",
        {},
        element(
          "tr",
          {},
          ...["Setting / command", "Value", "Profile", "Category"].map((text) =>
            element("th", { scope: "col", text }),
          ),
        ),
      ),
    );
    const tbody = element("tbody");
    table.append(tbody);
    const update = () => {
      const query = search.value.toLowerCase().trim();
      const filtered = entries.filter(
        (item) =>
          (!category.value || item.category === category.value) &&
          (!profile.value || profileLabel(item) === profile.value) &&
          (!query ||
            `${item.name} ${item.value} ${item.key}`
              .toLowerCase()
              .includes(query)),
      );
      resultCount.textContent = `${filtered.length} of ${entries.length} settings and commands`;
      tbody.replaceChildren(
        ...filtered.map((item) =>
          element(
            "tr",
            {},
            element(
              "td",
              {},
              element("span", { class: "setting-name", text: item.name }),
              element("span", {
                class: "cell-subtitle",
                text: `Source line ${item.line}`,
              }),
            ),
            element("td", {}, element("code", { text: item.value })),
            element("td", { text: profileLabel(item) }),
            element("td", { text: item.category }),
          ),
        ),
      );
      if (!filtered.length)
        tbody.append(
          element(
            "tr",
            {},
            element("td", {
              colspan: 4,
              class: "muted",
              text: "No settings match these filters.",
            }),
          ),
        );
    };
    [search, category, profile].forEach((item) =>
      item.addEventListener("input", update),
    );
    panel.append(
      element("div", { class: "toolbar" }, search, category, profile),
      resultCount,
      element("div", { class: "table-wrap" }, table),
    );
    update();
    content.replaceChildren(panel);
  } catch (error) {
    if (revision === renderRevision)
      content.replaceChildren(
        empty(
          "Snapshot could not be loaded",
          error.message,
          () => {
            detailId = null;
            render();
          },
          "Back to history",
        ),
      );
  }
}

function showCompare(revision) {
  const history = snapshots();
  if (history.length < 2)
    return content.replaceChildren(
      empty(
        "Two setups tell the story",
        "Import at least two snapshots for this aircraft to compare their settings. A sparse export leaves some values unknown.",
        openImport,
        "↑ Import another setup",
      ),
    );
  const panel = element("section", { class: "panel" });
  const fromSelect = element("select", { "aria-label": "Earlier setup" });
  const toSelect = element("select", { "aria-label": "Later setup" });
  for (const select of [fromSelect, toSelect])
    history.forEach((item) =>
      select.append(
        element("option", {
          value: item.id,
          text: `${item.label} · ${date(item.importedAt)}`,
        }),
      ),
    );
  fromSelect.value = selectedAircraft().baselineSnapshotId || history[1].id;
  toSelect.value =
    history.find((item) => item.id !== fromSelect.value)?.id || history[0].id;
  const results = element("div");
  panel.append(
    element(
      "div",
      { class: "compare-pickers" },
      element("label", {}, "Reference / earlier setup", fromSelect),
      element("span", {
        class: "compare-arrow",
        "aria-hidden": "true",
        text: "→",
      }),
      element("label", {}, "Compared / later setup", toSelect),
    ),
    element("p", {
      class: "selection-note",
      text: "Missing values in diff or partial exports are unknown. Comparisons describe exports and do not certify compatibility or flightworthiness.",
    }),
    results,
  );
  content.replaceChildren(panel);
  let comparisonRevision = 0;
  const update = async () => {
    const requestRevision = ++comparisonRevision;
    results.replaceChildren(
      element("p", { class: "loading", text: "Comparing exports…" }),
    );
    try {
      const comparison = await api(
        `/api/compare?from=${encodeURIComponent(fromSelect.value)}&to=${encodeURIComponent(toSelect.value)}`,
      );
      if (revision !== renderRevision || requestRevision !== comparisonRevision)
        return;
      showComparisonResults(results, comparison);
    } catch (error) {
      if (revision === renderRevision && requestRevision === comparisonRevision)
        results.replaceChildren(warningBox([error.message]));
    }
  };
  fromSelect.addEventListener("change", update);
  toSelect.addEventListener("change", update);
  update();
}

function showComparisonResults(container, comparison) {
  const counts = element("div", { class: "comparison-counts" });
  ["changed", "added", "removed", "unknown", "unchanged"].forEach((key) =>
    counts.append(
      element(
        "span",
        {},
        element("strong", { text: comparison.counts[key] }),
        key,
      ),
    ),
  );
  const search = element("input", {
    type: "search",
    placeholder: "Search comparison…",
    "aria-label": "Search comparison",
  });
  const change = element(
    "select",
    { "aria-label": "Change filter" },
    ...[
      ["changes", "Changes + unknown"],
      ["", "All rows"],
      ["changed", "Changed"],
      ["added", "Added"],
      ["removed", "Removed"],
      ["unknown", "Unknown"],
      ["unchanged", "Unchanged"],
    ].map(([value, text]) => element("option", { value, text })),
  );
  const category = filterSelect(
    "All categories",
    comparison.rows.map((item) => item.category),
  );
  const profile = filterSelect(
    "All profiles",
    comparison.rows.map(profileLabel),
  );
  const resultCount = element("p", { class: "result-count" });
  const table = element(
    "table",
    {},
    element(
      "thead",
      {},
      element(
        "tr",
        {},
        ...[
          "Setting / command",
          comparison.from.label,
          comparison.to.label,
          "Change",
        ].map((text) => element("th", { scope: "col", text })),
      ),
    ),
  );
  const tbody = element("tbody");
  table.append(tbody);
  const update = () => {
    const query = search.value.trim().toLowerCase();
    const rows = comparison.rows.filter(
      (item) =>
        (change.value === "changes"
          ? item.change !== "unchanged"
          : !change.value || item.change === change.value) &&
        (!category.value || item.category === category.value) &&
        (!profile.value || profileLabel(item) === profile.value) &&
        (!query ||
          `${item.name} ${item.from ?? ""} ${item.to ?? ""}`
            .toLowerCase()
            .includes(query)),
    );
    resultCount.textContent = `${rows.length} of ${comparison.rows.length} rows`;
    tbody.replaceChildren(
      ...rows.map((item) =>
        element(
          "tr",
          { class: item.change === "changed" ? "changed-row" : "" },
          element(
            "td",
            {},
            element("span", { class: "setting-name", text: item.name }),
            element("span", {
              class: "cell-subtitle",
              text: `${profileLabel(item)} · ${item.category}`,
            }),
          ),
          comparisonValue(item.from, item.change),
          comparisonValue(item.to, item.change),
          element(
            "td",
            {},
            badge(
              item.change,
              item.change === "unknown" || item.change === "changed"
                ? "amber"
                : "",
            ),
            item.detail
              ? element("span", { class: "cell-subtitle", text: item.detail })
              : null,
          ),
        ),
      ),
    );
    if (!rows.length)
      tbody.append(
        element(
          "tr",
          {},
          element("td", {
            colspan: 4,
            class: "muted",
            text: "No rows match these filters.",
          }),
        ),
      );
  };
  [search, change, category, profile].forEach((item) =>
    item.addEventListener("input", update),
  );
  container.replaceChildren(
    warningBox(comparison.warnings) || document.createTextNode(""),
    counts,
    element("div", { class: "toolbar" }, search, change, category, profile),
    resultCount,
    element("div", { class: "table-wrap" }, table),
  );
  update();
}

function comparisonValue(value, change) {
  return element(
    "td",
    {},
    value === null
      ? element("span", {
          class: change === "unknown" ? "unknown-value" : "muted",
          text:
            change === "unknown" ? "Unknown · not in export" : "Not present",
        })
      : element("code", { text: value }),
  );
}

function outcomeBadge(outcome) {
  return badge(
    {
      better: "BETTER",
      same: "ABOUT THE SAME",
      worse: "WORSE",
      unrated: "NOT RATED",
    }[outcome] || "NOT RATED",
    outcome === "better" ? "green" : outcome === "worse" ? "red" : "",
  );
}

function showSessions() {
  const flights = sessions();
  if (!flights.length)
    return content.replaceChildren(
      empty(
        "Put your next flight on record",
        "Log conditions, battery, props, and what you noticed. Link a setup snapshot when you have one, and explicitly record whether you checked the aircraft.",
        () => openSession(),
        "+ Log your first flight",
      ),
    );
  const grid = element("div", { class: "session-grid" });
  flights.forEach((session) => {
    const snapshot = snapshots().find((item) => item.id === session.snapshotId);
    const properties = element("dl", { class: "session-properties" });
    [
      ["Setup", snapshot?.label || "No linked snapshot"],
      [
        "Setup check",
        session.confirmedSetup ? "Confirmed for this session" : "Not confirmed",
      ],
      ["Battery", session.battery || "Not recorded"],
      ["Props", session.props || "Not recorded"],
      ["Conditions", session.conditions || "Not recorded"],
      [
        "Duration",
        session.durationMinutes === null
          ? "Not recorded"
          : `${session.durationMinutes} min`,
      ],
    ].forEach(([label, value]) =>
      properties.append(
        element(
          "div",
          {},
          element("dt", { text: label }),
          element("dd", { text: value }),
        ),
      ),
    );
    grid.append(
      element(
        "article",
        { class: "panel session-card" },
        element(
          "div",
          { class: "panel-heading" },
          element(
            "div",
            {},
            element("h3", { text: session.title }),
            element("p", {
              text: `${date(session.flownAt, true)}${session.location ? ` · ${session.location}` : ""}`,
            }),
          ),
          button("Edit", () => openSession(session), "text-button"),
        ),
        outcomeBadge(session.outcome),
        properties,
        session.notes
          ? element("p", { class: "notes", text: session.notes })
          : null,
        session.mediaRefs.length
          ? element(
              "div",
              {},
              element("p", {
                class: "field-label",
                text: "FOOTAGE / LOG REFERENCES",
              }),
              element(
                "ul",
                { class: "media-refs" },
                ...session.mediaRefs.map((text) => element("li", { text })),
              ),
            )
          : null,
      ),
    );
  });
  content.replaceChildren(grid);
}

function navigate(view) {
  currentView = view;
  detailId = null;
  render();
}

function viewSnapshot(id) {
  currentView = "history";
  detailId = id;
  render();
}

function openDialog(name) {
  const dialog = $(`#${name}-dialog`);
  $(".form-error", dialog).hidden = true;
  dialog.showModal();
  $("input", dialog)?.focus();
}

function openImport() {
  if (!aircraftId) return;
  const form = $("#import-form");
  form.reset();
  fileRevision++;
  fileReading = false;
  importFilename = "pasted-export.txt";
  originalFileText = null;
  openDialog("import");
}

function localDateTime(value) {
  const time = new Date(value);
  const shifted = new Date(time.getTime() - time.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}

function openSession(session = null) {
  if (!aircraftId) return;
  editingSessionId = session?.id || null;
  const form = $("#session-form");
  form.reset();
  const select = form.elements.snapshotId;
  select.replaceChildren(
    element("option", { value: "", text: "No linked snapshot" }),
    ...snapshots().map((item) =>
      element("option", { value: item.id, text: item.label }),
    ),
  );
  $("#session-title").textContent = session
    ? "Edit flight session"
    : "Log a flight session";
  form.elements.flownAt.value = localDateTime(session?.flownAt || new Date());
  if (session) {
    [
      "title",
      "snapshotId",
      "location",
      "durationMinutes",
      "battery",
      "props",
      "conditions",
      "notes",
      "outcome",
    ].forEach((key) => {
      form.elements[key].value = session[key] ?? "";
    });
    form.elements.confirmedSetup.checked = session.confirmedSetup;
    form.elements.mediaRefs.value = session.mediaRefs.join("\n");
  }
  openDialog("session");
}

function submitForm(formId, save) {
  const form = $(`#${formId}`);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = $("button[type=submit]", form);
    const errorNode = $(".form-error", form);
    const label = submit.textContent;
    errorNode.hidden = true;
    submit.disabled = true;
    submit.textContent = "Saving…";
    try {
      await save(form);
      form.closest("dialog").close();
      await refresh();
    } catch (error) {
      errorNode.textContent = error.message;
      errorNode.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = label;
    }
  });
}

$("#add-aircraft").addEventListener("click", () => {
  $("#aircraft-form").reset();
  openDialog("aircraft");
});
$("#import-snapshot").addEventListener("click", openImport);
$("#new-session").addEventListener("click", () => openSession());
$("#aircraft-select").addEventListener("change", (event) => {
  aircraftId = event.target.value;
  localStorage.setItem("fpvbench.aircraft", aircraftId);
  detailId = null;
  render();
});
document
  .querySelectorAll(".nav-item")
  .forEach((item) =>
    item.addEventListener("click", () => navigate(item.dataset.view)),
  );
document.querySelectorAll(".close-dialog").forEach((item) =>
  item.addEventListener("click", () => {
    const dialog = item.closest("dialog");
    if (!$("button[type=submit]", dialog).disabled) dialog.close();
  }),
);
document.querySelectorAll("dialog").forEach((dialog) =>
  dialog.addEventListener("cancel", (event) => {
    if ($("button[type=submit]", dialog).disabled) event.preventDefault();
  }),
);

$("#import-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  const revision = ++fileRevision;
  originalFileText = null;
  importFilename = "pasted-export.txt";
  fileReading = false;
  if (!file) return;
  const form = $("#import-form");
  const errorNode = $(".form-error", form);
  errorNode.hidden = true;
  try {
    if (file.size > 1024 * 1024)
      throw new Error("Choose a text export smaller than 1 MiB.");
    fileReading = true;
    const rawText = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(await file.arrayBuffer());
    if (revision !== fileRevision) return;
    form.elements.rawText.value = rawText;
    originalFileText = rawText;
    importFilename = file.name;
    if (!form.elements.label.value)
      form.elements.label.value = file.name.replace(/\.[^.]+$/, "");
  } catch (error) {
    if (revision === fileRevision) {
      errorNode.textContent = error.message;
      errorNode.hidden = false;
      form.elements.rawText.value = "";
      event.target.value = "";
      importFilename = "pasted-export.txt";
      originalFileText = null;
    }
  } finally {
    if (revision === fileRevision) fileReading = false;
  }
});

$("#import-form").elements.rawText.addEventListener("input", () => {
  originalFileText = null;
  importFilename = "edited-export.txt";
});

submitForm("aircraft-form", async (form) => {
  const result = await api("/api/aircraft", {
    name: form.elements.name.value,
    kind: form.elements.kind.value,
    notes: form.elements.notes.value,
  });
  aircraftId = result.id;
  currentView = "overview";
  detailId = null;
  notify("Aircraft added. Your workbench is ready.");
});

submitForm("import-form", async (form) => {
  if (fileReading)
    throw new Error(
      "The export file is still loading. Try saving again in a moment.",
    );
  if (!form.elements.rawText.value.trim())
    throw new Error("Choose a Betaflight text export or paste its contents.");
  const result = await api("/api/snapshots", {
    aircraftId,
    label: form.elements.label.value,
    notes: form.elements.notes.value,
    filename: importFilename,
    rawText: originalFileText ?? form.elements.rawText.value,
  });
  currentView = "history";
  detailId = result.id;
  notify("Snapshot saved. The original export is preserved.");
});

submitForm("session-form", async (form) => {
  const payload = {
    aircraftId,
    snapshotId: form.elements.snapshotId.value || null,
    title: form.elements.title.value,
    flownAt: new Date(form.elements.flownAt.value).toISOString(),
    location: form.elements.location.value,
    durationMinutes:
      form.elements.durationMinutes.value === ""
        ? null
        : Number(form.elements.durationMinutes.value),
    battery: form.elements.battery.value,
    props: form.elements.props.value,
    conditions: form.elements.conditions.value,
    notes: form.elements.notes.value,
    outcome: form.elements.outcome.value,
    confirmedSetup: form.elements.confirmedSetup.checked,
    mediaRefs: form.elements.mediaRefs.value
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean),
  };
  if (editingSessionId) {
    delete payload.aircraftId;
    await api(
      `/api/sessions/${encodeURIComponent(editingSessionId)}`,
      payload,
      "PATCH",
    );
  } else await api("/api/sessions", payload);
  currentView = "sessions";
  detailId = null;
  notify(
    editingSessionId ? "Flight session updated." : "Flight session saved.",
  );
});

refresh().catch((error) => {
  notify(error.message, true);
  $("#aircraft-select").replaceChildren(
    element("option", { value: "", text: "Workspace unavailable" }),
  );
  $("#import-snapshot").disabled = true;
  $("#new-session").disabled = true;
  content.replaceChildren(
    empty(
      "The workspace could not be opened",
      "Check that the local server is running. If it reports damaged storage, preserve the workspace file before attempting recovery.",
      () => window.location.reload(),
      "Try again",
    ),
  );
});
