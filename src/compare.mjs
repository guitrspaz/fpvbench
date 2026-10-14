import { AppError } from "./errors.mjs";

/** Public history summary excludes full source and per-setting records. */
export function summarizeSnapshot(snapshot) {
  const { rawText: _rawText, parsed, ...rest } = snapshot;
  const { settings, commands, ...parsedSummary } = parsed;
  return {
    ...rest,
    parsed: parsedSummary,
    settingCount: settings.length,
    commandCount: commands.length,
  };
}

/** Compare explicit namespaced evidence. Sparse omissions are never treated as defaults. */
export function compareSnapshots(from, to) {
  if (from.aircraftId !== to.aircraftId)
    throw new AppError("Choose two snapshots from the same aircraft.", 409);
  const warnings = [];
  if (from.parsed.firmware.version !== to.parsed.firmware.version)
    warnings.push(
      "Firmware versions differ; setting meanings and defaults may differ.",
    );
  for (const key of ["board", "boardName", "manufacturer"]) {
    if (from.parsed.firmware[key] !== to.parsed.firmware[key]) {
      warnings.push(
        "Board metadata differs; configuration compatibility is not established.",
      );
      break;
    }
  }
  const complete = (snapshot) =>
    snapshot.parsed.exportKind === "dump" &&
    snapshot.parsed.exportScope === "all" &&
    !snapshot.parsed.warnings.some((warning) =>
      /truncated|Duplicate|Unknown command/.test(warning),
    );
  if (!complete(from) || !complete(to))
    warnings.push(
      "At least one export is sparse or incomplete; a missing value on that side remains unknown.",
    );
  warnings.push(
    ...from.parsed.warnings.map((w) => `From: ${w}`),
    ...to.parsed.warnings.map((w) => `To: ${w}`),
  );
  const records = (snapshot) => {
    const records = [
      ...snapshot.parsed.settings,
      ...snapshot.parsed.commands.map((record) => ({
        ...record,
        scope: "global",
        profile: null,
      })),
    ];
    for (const [field, name] of [
      ["activeProfile", "Active PID profile"],
      ["activeRateProfile", "Active rate profile"],
    ]) {
      if (snapshot.parsed[field] !== null)
        records.push({
          key: `selection:${field}`,
          name,
          value: String(snapshot.parsed[field]),
          category: "Selected profiles",
          scope: "global",
          profile: null,
        });
    }
    return new Map(records.map((record) => [record.key, record]));
  };
  const left = records(from),
    right = records(to);
  const counts = { changed: 0, added: 0, removed: 0, unchanged: 0, unknown: 0 };
  const rows = [...new Set([...left.keys(), ...right.keys()])]
    .sort()
    .map((key) => {
      const a = left.get(key),
        b = right.get(key),
        evidence = b ?? a;
      let change, detail;
      if (a && b) {
        change = a.value === b.value ? "unchanged" : "changed";
        detail = "Both exports contain an explicit value.";
      } else if (!a) {
        change =
          complete(from) && !key.startsWith("selection:") ? "added" : "unknown";
        detail =
          change === "unknown"
            ? "The earlier export omits this value; its earlier state is unknown."
            : "This key is explicit only in the later export.";
      } else {
        change =
          complete(to) && !key.startsWith("selection:") ? "removed" : "unknown";
        detail =
          change === "unknown"
            ? "The later export omits this value; its later state is unknown."
            : "This key is explicit only in the earlier export.";
      }
      counts[change]++;
      return {
        key,
        name: evidence.name,
        category: evidence.category,
        scope: evidence.scope,
        profile: evidence.profile,
        from: a?.value ?? null,
        to: b?.value ?? null,
        change,
        detail,
      };
    });
  return {
    from: summarizeSnapshot(from),
    to: summarizeSnapshot(to),
    rows,
    warnings: [...new Set(warnings)],
    counts,
  };
}
