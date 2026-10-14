const $ = (selector, root = document) => root.querySelector(selector);
const content = $("#content");
let state = { aircraft: [], snapshots: [], sessions: [], flightLogs: [] };
let aircraftId = localStorage.getItem("fpvbench.aircraft") || "";
let currentView = "overview";
let detailId = null;
let editingSessionId = null;
let editingFlightLogId = null;
let flightDetailId = null;
let renderRevision = 0;
let fileRevision = 0;
let fileReading = false;
let importFilename = "pasted-export.txt";
let originalFileText = null;
let noticeTimer;
let aiSettings = { available: false };

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
  [state] = await Promise.all([api("/api/state"), readAiSettings()]);
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
  $("#import-flights").disabled = !aircraftId;
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
  flights: ["FROM YOUR FLIGHT RECORDS", "DJI flight imports", "Original files, sourced flight details, and available local telemetry."],
  settings: ["OPTIONAL ASSISTANCE", "Settings", "Keep the workbench offline, or enable an optional OpenAI assistant."],
};

async function render() {
  const revision = ++renderRevision;
  const [eyebrow, title, description] = viewCopy[currentView];
  $("#page-eyebrow").textContent = eyebrow;
  $("#page-title").textContent = title;
  $("#page-description").textContent = selectedAircraft() && currentView !== "settings"
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
  $(".heading-actions").hidden = currentView === "settings";
  if (currentView === "settings") return showSettings();
  if (!aircraftId) return showOnboarding();
  if (currentView === "overview") showOverview();
  if (currentView === "history") {
    if (detailId && snapshots().some((item) => item.id === detailId))
      await showDetail(detailId, revision);
    else showHistory();
  }
  if (currentView === "compare") showCompare(revision);
  if (currentView === "sessions") showSessions();
  if (currentView === "flights") {
    if (flightDetailId && flightLogs().some(item => item.id === flightDetailId)) await showFlightDetail(flightDetailId, revision);
    else showFlightLogs();
  }
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
  if (aiSettings.available) content.append(recapPanel(renderRevision));
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
    if (aiSettings.available) {
      const assistantPanel = snapshotAiPanel(snapshot, revision);
      content.prepend(assistantPanel);
    }
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

async function readAiSettings() {
  try { aiSettings = await api("/api/ai/settings"); }
  catch { aiSettings = { available: false, reason: "Optional AI settings are unavailable. The offline workbench remains usable." }; }
  if (!aiSettings.available) document.querySelectorAll(".ai-feature").forEach(node => node.remove());
  return aiSettings;
}

async function aiAction(path, payload, method = "POST") {
  try { return await api(path, payload, method); }
  finally { await readAiSettings(); }
}

function money(value) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(value ?? 0);
}

function showSettings() {
  const settings = aiSettings;
  const panel = element("section", { class: "panel settings-panel" }, panelHeading("OpenAI API (ChatGPT models)",
    "This API-key integration uses separate OpenAI API billing."));
  const form = element("form", { id: "ai-settings-form" });
  const key = element("input", { type: "password", name: "apiKey", id: "ai-api-key", autocomplete: "off", placeholder: settings.keyConfigured ? "A key is configured · leave blank to keep it" : "Enter your OpenAI API key", spellcheck: "false" });
  const enabled = element("input", { type: "checkbox", name: "enabled", id: "ai-enabled" });
  enabled.checked = settings.enabled === true;
  const automatic = element("input", { type: "checkbox", name: "automaticReview", id: "ai-automatic-review" });
  automatic.checked = settings.automaticReview === true;
  const budget = element("input", { type: "number", name: "monthlyBudgetUSD", id: "ai-budget", min: 0, max: 1000, step: "0.01", value: settings.monthlyBudgetUSD ?? 0, required: "" });
  const errorNode = element("p", { class: "form-error", role: "alert", hidden: "" });
  const save = element("button", { type: "submit", class: "primary", text: "Save AI settings" });
  const remove = button("Remove API key", async event => {
    const target = event.currentTarget;
    target.disabled = true;
    try {
      await api("/api/ai/settings", { apiKey: null }, "PATCH");
      key.value = "";
      await readAiSettings();
      notify("API key removed. Optional AI features are unavailable.");
      if (currentView === "settings") await render();
    } catch (error) {
      errorNode.textContent = error.message;
      errorNode.hidden = false;
      target.disabled = false;
    }
  });
  remove.disabled = !settings.keyConfigured;
  form.append(element("label", { class: "checkbox-label" }, enabled,
    element("span", { text: "Enable optional OpenAI assistance" })),
    element("label", {}, "OpenAI API key", key),
    element("p", { class: "form-help", text: "The key is stored in an owner-private local file on this computer. It is never sent back to this browser or included in workspace exports. Saving a key makes no API call." }),
    element("label", {}, "Monthly app allowance (USD)", budget),
    element("p", { class: "form-help", text: "Default $0 keeps AI unavailable. This is FPVBench’s conservative local estimate for the UTC calendar month, not your provider balance or an account-wide spending cap." }),
    element("label", { class: "checkbox-label" }, automatic,
      element("span", {}, "Automatically review newly imported Betaflight setups",
        element("small", { text: "Opt in to one billed analysis after an import when AI is available. Importing still succeeds if analysis fails; there are no automatic retries." }))),
    element("div", { class: "ai-consent" }, element("h3", { text: "What leaves this computer" }),
      element("p", { text: "Setup analysis sends selected tuning, rate, filter, and protocol settings plus your optional goal question to OpenAI. Flight recaps send aggregate measurements and aircraft labels. Exact coordinates, locations, notes, media references, serials, and original files are excluded." }),
      element("p", { text: "Advice explains existing evidence and may require verification. FPVBench does not generate or apply controller configurations." })),
    errorNode, element("div", { class: "form-actions" }, remove, save));
  form.addEventListener("submit", async event => {
    event.preventDefault();
    errorNode.hidden = true;
    save.disabled = true;
    const payload = { enabled: enabled.checked, automaticReview: automatic.checked, monthlyBudgetUSD: Number(budget.value) };
    if (key.value.trim()) payload.apiKey = key.value.trim();
    try {
      await api("/api/ai/settings", payload, "PATCH");
      key.value = "";
      await readAiSettings();
      notify("AI settings saved. Saving does not make a billed API call.");
      if (currentView === "settings") await render();
    } catch (error) {
      errorNode.textContent = error.message;
      errorNode.hidden = false;
      save.disabled = false;
    }
  });
  const check = button("Test connection · small billed API call", async event => {
    const target = event.currentTarget;
    target.disabled = true;
    target.textContent = "Testing connection…";
    try {
      await aiAction("/api/ai/check", {});
      notify("Connection test completed. Availability reflects the latest verified result.");
    } catch (error) { notify(error.message, true); }
    if (currentView === "settings") await render();
  });
  check.id = "ai-check-connection";
  check.disabled = !settings.keyConfigured || !settings.enabled || !(settings.remainingUSD > 0);
  const status = element("section", { class: "panel" }, panelHeading("Availability and allowance", "No API call runs when you open this page."),
    element("div", { class: "metadata" }, badge((settings.billingState || "unverified").toUpperCase(), settings.available ? "green" : "amber"),
      badge(settings.keyConfigured ? "KEY CONFIGURED" : "NO KEY")),
    element("p", { id: "ai-availability-reason", class: "notes", text: settings.reason || "Configure a key, enable AI, set a positive allowance, and explicitly test the connection." }),
    element("div", { class: "stats" }, stat("Allowance", money(settings.monthlyBudgetUSD), "App allowance this UTC month"),
      stat("Estimated usage", money(settings.spentUSD), "Includes uncertain-charge reservations"),
      stat("Remaining", money(settings.remainingUSD), "Conservative local estimate")),
    element("p", { class: "form-help", text: settings.verifiedAt ? `Last successful verification: ${date(settings.verifiedAt, true)}. This does not establish your current account balance.` : "The API account has not been verified. A successful explicit connection test is required." }),
    check,
    element("p", { class: "form-help", text: `Model: ${settings.model || "Not available"}${settings.priceCheckedAt ? ` · Pricing checked ${settings.priceCheckedAt}` : ""}. Checks and analyses use the configured monthly allowance.` }));
  panel.append(form);
  content.replaceChildren(panel, status);
}

function aiReportContent(envelope) {
  const report = envelope?.report ?? envelope?.result?.report ?? envelope?.result ?? envelope;
  const output = element("div", { class: "ai-report" });
  if (!report || typeof report.summary !== "string") return output;
  output.append(element("p", { class: "ai-disclosure", text: "AI-generated explanation · verify against your setup and the referenced documentation." }));
  const context = envelope.context ?? envelope.evidence;
  if (context && typeof context.question === "string") {
    if (context.question.trim()) output.append(
      element("h3", { text: envelope.cached ? "Goal used for this saved explanation" : "Goal used for this explanation" }),
      element("p", { class: "ai-goal", text: context.question }));
    else output.append(element("p", { class: "proof-note", text: "General setup review · no goal question supplied." }));
  }
  output.append(element("p", { class: "ai-summary", text: report.summary }));
  for (const [key, title] of [["observations", "Observations"], ["questions", "Questions to consider"], ["limitations", "Evidence limits"]]) {
    if (Array.isArray(report[key]) && report[key].length) output.append(element("h3", { text: title }),
      element("ul", {}, ...report[key].map(text => element("li", { text }))));
  }
  if (context) {
    const snapshotId = context.snapshotId ?? context.sourceSnapshotId;
    const baselineId = context.baselineSnapshotId ?? context.baselineId;
    const contextLines = [];
    if (snapshotId) contextLines.push(`Setup: ${snapshots().find(item => item.id === snapshotId)?.label || "Saved setup"}`);
    if (baselineId) contextLines.push(`Preferred baseline: ${snapshots().find(item => item.id === baselineId)?.label || "Saved preferred baseline"}`);
    else if (snapshotId) contextLines.push("No preferred baseline supplied");
    if (context.snapshotImportedAt) contextLines.push(`Snapshot imported ${date(context.snapshotImportedAt, true)}`);
    if (context.baselineImportedAt) contextLines.push(`Baseline imported ${date(context.baselineImportedAt, true)}`);
    if (contextLines.length) output.append(element("p", { class: "proof-note", text: contextLines.join(" · ") }));
  }
  if (envelope.generatedAt) output.append(element("p", { class: "proof-note", text: `${envelope.cached ? "Saved explanation" : "Explanation created"} ${date(envelope.generatedAt, true)}. Opening saved evidence makes no billed call.` }));
  const sources = envelope.sources ?? report.sources ?? [];
  if (Array.isArray(sources) && sources.length) {
    const list = element("ul", { class: "ai-sources" });
    for (const source of sources) {
      try {
        const url = new URL(typeof source === "string" ? source : source.url ?? source.href);
        if (url.protocol !== "https:" || url.hostname !== "betaflight.com") continue;
        list.append(element("li", {}, element("a", { href: url.href, target: "_blank", rel: "noopener noreferrer", text: source.title ?? source.label ?? url.pathname })));
      } catch { /* Unrecognized source links are not rendered. */ }
    }
    if (list.childElementCount) output.append(element("h3", { text: "Referenced documentation" }), list);
  }
  if (envelope.facts) {
    output.append(element("h3", { text: "Computed facts used in this recap" }), factsContent(envelope.facts));
  }
  return output;
}

function factsContent(value) {
  if (value === null) return element("span", { class: "muted", text: "Unknown" });
  if (Array.isArray(value)) return element("ul", {}, ...value.map(item => element("li", {}, factsContent(item))));
  if (typeof value === "object") {
    const list = element("dl", { class: "ai-facts" });
    for (const [key, item] of Object.entries(value)) list.append(element("div", {},
      element("dt", { text: key.replace(/([a-z])([A-Z])/g, "$1 $2") }), element("dd", {}, factsContent(item))));
    return list;
  }
  return element("span", { text: String(value) });
}

function snapshotAiPanel(snapshot, revision) {
  const panel = element("section", { class: "panel ai-feature", id: "ai-snapshot-review" },
    panelHeading("AI setup explanation", "Optional billed analysis of selected existing settings and your preferred baseline."));
  const question = element("textarea", { maxlength: 1000, rows: 2, id: "ai-goal-question", placeholder: "Optional: what flying feel or behavior would you like to understand?" });
  const result = element("div", { "aria-live": "polite" });
  let active = false;
  let questionEdited = false;
  question.addEventListener("input", () => { questionEdited = true; });
  const review = button("Review setup with AI", async event => {
    if (active || !aiSettings.available) return;
    active = true;
    const target = event.currentTarget;
    target.disabled = true;
    result.replaceChildren(element("p", { class: "loading", text: "Reviewing selected setup evidence…" }));
    try {
      const response = await aiAction("/api/ai/review", { snapshotId: snapshot.id, question: question.value });
      if (revision === renderRevision && aiSettings.available) result.replaceChildren(aiReportContent(response));
    } catch (error) {
      if (revision === renderRevision && aiSettings.available) result.replaceChildren(warningBox([error.message]));
      notify(error.message, true);
    } finally {
      active = false;
      target.disabled = false;
    }
  }, "primary");
  panel.append(element("label", {}, "Flying goal or question (optional)", question), review,
    element("p", { class: "proof-note", text: "This sends selected tuning fields and your question to OpenAI. No raw export, notes, locations, or device identifiers are sent. Advice does not certify flightworthiness or apply settings." }), result);
  const readCached = async (attempt = 0) => {
    if (revision !== renderRevision || !aiSettings.available || active) return;
    try {
      const cached = await api(`/api/ai/review/${encodeURIComponent(snapshot.id)}`);
      if (revision !== renderRevision || !aiSettings.available || active) return;
      if (cached?.status === "pending") {
        result.replaceChildren(element("p", { class: "loading", text: "The requested setup review is pending. Reading its status makes no billed call." }));
        if (attempt < 24) setTimeout(() => { void readCached(attempt + 1); }, 1000);
      } else if (cached?.status === "failed") result.replaceChildren(warningBox(["The previous optional review did not complete. No automatic retry was made. Check Settings before requesting another review."]));
      else if (cached) {
        if (!questionEdited && typeof cached.context?.question === "string") question.value = cached.context.question;
        result.replaceChildren(aiReportContent(cached));
      }
    } catch {
      await readAiSettings();
    }
  };
  void readCached();
  return panel;
}

function recapPanel(revision) {
  const panel = element("section", { class: "panel ai-feature", id: "ai-flight-recap" },
    panelHeading("A light flight recap", "AI explains computed aggregate facts across imported flight records; coverage counts remain visible."));
  const result = element("div", { "aria-live": "polite" });
  const recap = button("Create AI flight recap", async event => {
    const target = event.currentTarget;
    target.disabled = true;
    result.replaceChildren(element("p", { class: "loading", text: "Preparing your aggregate flight recap…" }));
    try {
      const response = await aiAction("/api/ai/recap", {});
      if (revision === renderRevision && aiSettings.available) result.replaceChildren(aiReportContent(response));
    } catch (error) {
      notify(error.message, true);
      if (revision === renderRevision && aiSettings.available) result.replaceChildren(warningBox([error.message]));
    } finally { target.disabled = false; }
  }, "primary");
  panel.append(recap, element("p", { class: "proof-note", text: "This sends aircraft labels and aggregate measurements to OpenAI, without coordinates, notes, raw telemetry, or original files. Distance describes distance flown, not range from the pilot." }), result);
  return panel;
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
    const imported = flightLogs().find(item => item.id === session.flightLogId);
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
        imported ? element("p", { class: "item-meta" }, "Imported DJI flight · ",
          button(imported.filename, () => viewFlight(imported.id), "text-button")) : null,
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

function flightLogs() {
  return (state.flightLogs || []).filter(item => item.aircraftId === aircraftId)
    .sort((a, b) => new Date(b.importedAt) - new Date(a.importedAt));
}

function viewFlight(id) {
  currentView = "flights";
  flightDetailId = id;
  detailId = null;
  render();
}

function flightStatus(log) {
  return badge(log.status === "decoded" ? "DECODED" : "SUMMARY ONLY", log.status === "decoded" ? "green" : "amber");
}

const airdataLabels = { unknown: "Not recorded", "not-uploaded": "Not uploaded", uploaded: "Uploaded" };

function airdataBadge(log) {
  const status = log.airdataStatus || "unknown";
  return badge(`AirData: ${airdataLabels[status] || airdataLabels.unknown}`, status === "uploaded" ? "green" : "");
}

function showFlightLogs() {
  const logs = flightLogs();
  if (!logs.length) return content.replaceChildren(empty("Bring your flight records into the workbench",
    "Import copied DJI TXT records or compatible decoded JSON. Original bytes are preserved, and available flight details populate a session without retyping.",
    openFlightImport, "↑ Import DJI flights"));
  const panel = element("section", { class: "panel" }, panelHeading(`${logs.length} imported ${logs.length === 1 ? "flight" : "flights"}`,
    "Flight details remain separate from your editable session observations."));
  const filter = element("select", { "aria-label": "Filter AirData upload status", id: "airdata-status-filter" },
    element("option", { value: "", text: "All AirData statuses" }),
    ...Object.entries(airdataLabels).map(([value, text]) => element("option", { value, text })));
  const rows = element("div");
  const count = element("p", { class: "result-count" });
  const update = () => {
    const selected = logs.filter(log => !filter.value || (log.airdataStatus || "unknown") === filter.value);
    count.textContent = `${selected.length} of ${logs.length} flights`;
    rows.replaceChildren(...selected.map(log => element("div", { class: "item-row" },
    element("div", {}, button(log.filename, () => viewFlight(log.id), "item-title"),
      element("p", { class: "item-meta", text: `${log.summary.startTime ? date(log.summary.startTime, true) : "Flight date unavailable"} · ${log.sourceDevice || "Source device not recorded"} · Version ${log.logVersion}` })),
    element("div", { class: "row-actions" }, flightStatus(log), airdataBadge(log), button("Inspect →", () => viewFlight(log.id), "text-button")))));
    if (!selected.length) rows.append(element("p", { class: "muted", text: "No imports match this AirData status." }));
  };
  filter.addEventListener("change", update);
  panel.append(element("div", { class: "toolbar" }, filter), count, rows);
  update();
  content.replaceChildren(panel);
}

function metric(value, unit = "", fractionDigits = 1) {
  return value === null || value === undefined ? "Not available"
    : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: fractionDigits }).format(value)}${unit ? ` ${unit}` : ""}`;
}

async function showFlightDetail(id, revision) {
  content.replaceChildren(element("p", { class: "loading", text: "Loading flight details…" }));
  try {
    const log = await api(`/api/flight-logs/${encodeURIComponent(id)}`);
    if (revision !== renderRevision || log.aircraftId !== aircraftId) return;
    const summary = log.summary;
    const linkedSession = sessions().find(item => item.flightLogId === log.id);
    const actions = element("div", { class: "detail-actions" },
      element("a", { class: "secondary", href: `/api/flight-logs/${encodeURIComponent(id)}/raw`, download: "", text: "↓ Original flight record" }),
      linkedSession ? button("Edit session notes", () => openSession(linkedSession), "primary") : null);
    const panel = element("section", { class: "panel" },
      button("← All DJI imports", () => { flightDetailId = null; render(); }, "text-button"),
      element("div", { class: "detail-heading" }, element("div", {}, element("h2", { text: log.filename }),
        element("p", { text: `Imported ${date(log.importedAt, true)} · ${log.sourceDevice || "Source device not recorded"}` })), actions),
      element("div", { class: "metadata" }, flightStatus(log), badge(`LOG VERSION ${log.logVersion}`),
        badge(log.format), badge(`${metric(log.byteLength / 1024, "KiB")} ORIGINAL`)),
      warningBox(log.warnings));
    const properties = element("dl", { class: "flight-properties" });
    [
      ["Flight start", summary.startTime ? date(summary.startTime, true) : "Not available"],
      ["Duration", metric(summary.durationSeconds, "seconds")],
      ["Distance", metric(summary.distanceMeters, "m")],
      ["Maximum height", metric(summary.maxHeightMeters, "m")],
      ["Maximum horizontal speed", metric(summary.maxHorizontalSpeedMps, "m/s")],
      ["Aircraft name", summary.aircraftName || "Not available"],
      ["Aircraft model", summary.aircraftModel || "Not available"],
      ["Location", summary.location || "Not available"],
      ["Start coordinate", summary.startCoordinate
        ? `${metric(summary.startCoordinate.latitude, "", 6)}, ${metric(summary.startCoordinate.longitude, "", 6)}` : "Not available"],
      ["Telemetry frames", metric(log.frameCount, "", 0)],
    ].forEach(([label, value]) => properties.append(element("div", {}, element("dt", { text: label }), element("dd", { text: value }))));
    panel.append(properties,
      element("p", { class: "proof-note", text: "Values are sourced from this flight record. Unavailable fields stay unknown. Telemetry does not describe or confirm Betaflight settings." }));
    const airdataSelect = element("select", { id: "flight-airdata-status", "aria-label": "AirData upload status" },
      ...Object.entries(airdataLabels).map(([value, text]) => element("option", { value, text })));
    airdataSelect.value = log.airdataStatus || "unknown";
    const saveStatus = button("Save AirData status", async event => {
      const target = event.currentTarget;
      target.disabled = true;
      airdataSelect.disabled = true;
      try {
        await api(`/api/flight-logs/${encodeURIComponent(id)}`, { airdataStatus: airdataSelect.value }, "PATCH");
        notify("AirData status saved.");
        await refresh();
      } catch (error) {
        notify(error.message, true);
        target.disabled = false;
        airdataSelect.disabled = false;
      }
    });
    panel.append(element("div", { class: "airdata-tracker" },
      element("h3", { text: "AirData upload tracking" }),
      element("p", { class: "form-help", text: "Track uploads you perform in AirData. This status is your manual record; importing here does not upload or verify anything in AirData." }),
      element("div", { class: "toolbar" }, element("label", {}, "AirData upload status", airdataSelect), saveStatus)));
    if (!linkedSession) panel.append(element("p", { class: "warning-box", text: "No session was created because the flight start date was unavailable. This original record is saved; you can create a manual session from Flight sessions." }));
    const framesPanel = element("section", { class: "panel" }, panelHeading("Local telemetry", log.status === "summary-only"
      ? "Telemetry is unavailable for this record; the readable details above remain useful."
      : "Browse available normalized frames. No remote map tiles or external requests."));
    content.replaceChildren(panel, framesPanel);
    if (!log.frameCount) return framesPanel.append(element("p", { class: "muted", text: "No decoded telemetry frames are stored for this flight." }));
    let offset = 0;
    let frameRevision = 0;
    const pageSize = 100;
    const frameArea = element("div");
    const count = element("p", { class: "result-count" });
    const previous = button("← Previous", () => { offset = Math.max(0, offset - pageSize); loadFrames(); });
    const next = button("Next →", () => { offset += pageSize; loadFrames(); });
    framesPanel.append(frameArea, element("div", { class: "telemetry-pagination" }, previous, count, next));
    const loadFrames = async () => {
      const requestRevision = ++frameRevision;
      previous.disabled = true;
      next.disabled = true;
      frameArea.replaceChildren(element("p", { class: "loading", text: "Loading telemetry…" }));
      try {
        const result = await api(`/api/flight-logs/${encodeURIComponent(id)}/frames?offset=${offset}&limit=${pageSize}`);
        if (revision !== renderRevision || requestRevision !== frameRevision) return;
        const table = element("table", {}, element("thead", {}, element("tr", {},
          ...["Time", "Elapsed (s)", "Latitude", "Longitude", "Altitude (m)", "Battery (%)", "Speed (m/s)"].map(text => element("th", { scope: "col", text })))),
        element("tbody", {}, ...result.frames.map(frame => element("tr", {},
          element("td", { text: frame.timestamp ? date(frame.timestamp, true) : "Unknown" }),
          ...[frame.elapsedSeconds, frame.latitude, frame.longitude, frame.altitudeMeters, frame.batteryPercent, frame.horizontalSpeedMps]
            .map((value, index) => element("td", { text: metric(value, "", index === 1 || index === 2 ? 6 : 2) }))))));
        frameArea.replaceChildren(element("div", { class: "table-wrap" }, table));
        count.textContent = `${result.frames.length ? offset + 1 : 0}–${offset + result.frames.length} of ${result.total} frames`;
        previous.disabled = offset === 0;
        next.disabled = offset + result.frames.length >= result.total;
      } catch (error) {
        if (revision !== renderRevision || requestRevision !== frameRevision) return;
        frameArea.replaceChildren(warningBox([error.message]));
        previous.disabled = offset === 0;
        next.disabled = true;
      }
    };
    await loadFrames();
  } catch (error) {
    if (revision === renderRevision) content.replaceChildren(empty("Flight details could not be loaded", error.message,
      () => { flightDetailId = null; render(); }, "Back to imports"));
  }
}

function openFlightImport() {
  if (!aircraftId) return;
  $("#flight-import-form").reset();
  $("#flight-import-results").replaceChildren();
  openDialog("flight-import");
}

function bytesToBase64(bytes) {
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 32768)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  return btoa(chunks.join(""));
}

$("#flight-import-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const files = [...form.elements.files.files];
  if (!files.length) return;
  const importAircraftId = aircraftId;
  const sourceDevice = form.elements.sourceDevice.value;
  const submit = $("button[type=submit]", form);
  const results = $("#flight-import-results");
  const errorNode = $(".form-error", form);
  results.replaceChildren();
  errorNode.hidden = true;
  submit.disabled = true;
  form.elements.files.disabled = true;
  form.elements.sourceDevice.disabled = true;
  let saved = 0;
  let failed = 0;
  try {
    for (const [index, file] of files.entries()) {
      submit.textContent = `Importing ${index + 1} of ${files.length}…`;
      const row = element("div", { class: "batch-result" }, element("strong", { text: file.name }));
      results.append(row);
      try {
        if (file.size > 25 * 1024 * 1024) throw new Error("File exceeds the 25 MiB limit.");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const result = await api("/api/flight-logs", { aircraftId: importAircraftId, filename: file.name, sourceDevice, contentBase64: bytesToBase64(bytes) });
        saved++;
        row.append(badge(result.duplicate ? "ALREADY IMPORTED" : "SAVED", "green"),
          element("p", { text: `${result.flightLog.status === "decoded" ? "Decoded telemetry" : "Summary only"} · ${result.session ? "Linked flight session available" : "Saved without a session; flight date unavailable"}` }),
          warningBox(result.flightLog.warnings));
      } catch (error) {
        failed++;
        row.append(badge("NOT IMPORTED", "red"), element("p", { class: "form-error", text: error.message }));
      }
    }
    currentView = "flights";
    flightDetailId = null;
    await refresh();
    results.prepend(element("p", { class: "batch-summary", text: `${saved} saved or already imported · ${failed} failed. Successful imports are retained.` }));
  } catch (error) {
    errorNode.textContent = error.message;
    errorNode.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = "Import selected flights";
    form.elements.files.disabled = false;
    form.elements.sourceDevice.disabled = false;
  }
});

function navigate(view) {
  currentView = view;
  detailId = null;
  flightDetailId = null;
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
  editingFlightLogId = session?.flightLogId || null;
  const form = $("#session-form");
  form.reset();
  const origin = $("#session-import-origin");
  origin.hidden = !editingFlightLogId;
  origin.textContent = editingFlightLogId ? "This session is linked to an imported DJI record. Editing your observations preserves that original link and its immutable flight details." : "";
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
$("#import-flights").addEventListener("click", openFlightImport);
$("#aircraft-select").addEventListener("change", (event) => {
  aircraftId = event.target.value;
  localStorage.setItem("fpvbench.aircraft", aircraftId);
  detailId = null;
  flightDetailId = null;
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
    flightLogId: editingFlightLogId,
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
  $("#import-flights").disabled = true;
  content.replaceChildren(
    empty(
      "The workspace could not be opened",
      "Check that the local server is running. If it reports damaged storage, preserve the workspace file before attempting recovery.",
      () => window.location.reload(),
      "Try again",
    ),
  );
});
