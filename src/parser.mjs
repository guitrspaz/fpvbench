import { AppError, containsControlText } from "./errors.mjs";

export const MAX_RAW_BYTES = 1024 * 1024;
const indexed = new Set([
  "aux",
  "adjrange",
  "serial",
  "servo",
  "rxrange",
  "rxfail",
  "led",
  "color",
  "mmix",
  "smix",
  "vtx",
]);
const singles = new Set(["mixer", "map", "name"]);
const knownCommands = new Set([
  ...indexed,
  ...singles,
  "resource",
  "dma",
  "timer",
  "mode_color",
  "vtxtable",
  "feature",
  "beeper",
  "beacon",
]);

/** Human-readable grouping; names and values always retain their original spelling. */
export function categoryFor(name) {
  if (
    /^(p_|i_|d_|f_|d_min|d_max|pid|iterm|feedforward|anti_gravity|simplified|angle|horizon|level)/i.test(
      name,
    )
  )
    return "PID tuning";
  if (/rate|expo|throttle|rc_smoothing/i.test(name))
    return "Rates and response";
  if (/gyro|filter|lpf|notch|dterm/i.test(name)) return "Filters";
  if (/failsafe|rescue|gps/i.test(name)) return "Failsafe and navigation";
  if (/vbat|battery|current|voltage/i.test(name)) return "Battery";
  if (/osd|vtx|camera|display/i.test(name)) return "Video and OSD";
  if (/motor|dshot|resource|dma|timer|servo|mmix|smix/i.test(name))
    return "Hardware";
  if (/rx|serial|aux|adjrange|map/i.test(name)) return "Receiver and modes";
  return "Other";
}

function commandIdentity(name, value) {
  const tokens = value.split(/\s+/);
  if (name === "feature" || name === "beeper" || name === "beacon") {
    return /^-?[A-Z][A-Z0-9_]*$/.test(value) ? value.replace(/^-/, "") : null;
  }
  if (indexed.has(name)) {
    if (name === "smix" && ["reverse", "rule"].includes(tokens[0]))
      return tokens.length >= 4 &&
        /^\d+$/.test(tokens[1]) &&
        /^\d+$/.test(tokens[2])
        ? tokens.slice(0, 3).join(":")
        : null;
    return /^\d+$/.test(tokens[0]) && tokens.length >= 2 ? tokens[0] : null;
  }
  if (name === "dma" && tokens[0] === "pin")
    return /^[A-Z]\d+$/.test(tokens[1]) && tokens.length >= 3
      ? `pin:${tokens[1]}`
      : null;
  if (name === "resource" || name === "dma")
    return /^[A-Z][A-Z0-9_]*$/.test(tokens[0]) &&
      /^\d+$/.test(tokens[1]) &&
      tokens.length >= 3
      ? tokens.slice(0, 2).join(":")
      : null;
  if (name === "timer")
    return /^[A-Z]\d+$/.test(tokens[0]) && tokens.length >= 2
      ? tokens[0]
      : null;
  if (name === "mode_color")
    return tokens.length >= 3 &&
      tokens.slice(0, 2).every((token) => /^\d+$/.test(token))
      ? tokens.slice(0, 2).join(":")
      : null;
  if (name === "vtxtable") {
    if (["band", "powervalues", "powerlabels"].includes(tokens[0]))
      return tokens[0] === "band"
        ? /^\d+$/.test(tokens[1]) && tokens.length >= 4
          ? `band:${tokens[1]}`
          : null
        : tokens.length >= 2
          ? tokens[0]
          : null;
    if (
      ["bands", "channels", "powerlevels"].includes(tokens[0]) &&
      /^\d+$/.test(tokens[1])
    )
      return tokens[0];
    return null;
  }
  return singles.has(name) && value ? "" : null;
}

/** Parse a Betaflight CLI export as inert evidence. Never execute commands or infer defaults. */
export function parseExport(rawText) {
  if (typeof rawText !== "string" || !rawText.trim())
    throw new AppError("Import a non-empty Betaflight text export.");
  if (Buffer.byteLength(rawText, "utf8") > MAX_RAW_BYTES)
    throw new AppError("Betaflight exports must be 1 MiB or smaller.", 413);
  if (containsControlText(rawText))
    throw new AppError("The import must be plain UTF-8 text, not binary data.");
  const lines = rawText.replace(/^\ufeff/, "").split(/\r?\n/);
  const header = lines.find((line) =>
    /^\s*#?\s*Betaflight(?:\s*\/|\s*$)/i.test(line),
  );
  if (!header) throw new AppError("A Betaflight firmware header is required.");
  const metadata = header.match(
    /Betaflight\s*\/\s*(.*?)\s+(\d+\.\d+(?:\.\d+)?(?:-[\w.-]+)?)(?:\s|$)/i,
  );
  const firmware = {
    version: metadata?.[2] ?? null,
    board: metadata?.[1] ?? null,
    mspApi: header.match(/MSP API\s*:\s*([\d.]+)/i)?.[1] ?? null,
    boardName: null,
    manufacturer: null,
  };
  let exportKind = "unknown",
    exportScope = "unknown",
    scope = "global",
    profile = null;
  let activeProfile = null,
    activeRateProfile = null,
    restore = null,
    ended = false;
  const settings = new Map(),
    commands = new Map(),
    warnings = [];
  const add = (map, record) => {
    if (map.has(record.key))
      warnings.push(
        `Duplicate key ${record.key} on line ${record.line}; the last explicit value is shown. Original evidence is preserved.`,
      );
    map.set(record.key, record);
  };
  lines.forEach((original, index) => {
    const lineNumber = index + 1;
    let line = original.trim();
    if (!line) return;
    const exportMatch = line.match(
      /^#?\s*(dump|diff)(?:\s+(all|master|profile|rates|hardware))?(?:\s+(?:defaults|bare))?\s*$/i,
    );
    if (exportMatch) {
      exportKind = exportMatch[1].toLowerCase();
      exportScope = exportMatch[2]?.toLowerCase() === "all" ? "all" : "partial";
      return;
    }
    if (/^#\s*restore original (rateprofile|profile) selection/i.test(line)) {
      restore = /rateprofile/i.test(line) ? "rate" : "pid";
      return;
    }
    if (/^#\s*(master|global|hardware)\s*$/i.test(line)) {
      scope = "global";
      profile = null;
      return;
    }
    // A CLI prompt may prefix a real command; other hash lines remain comments.
    const metadataComment = line.match(
      /^#\s*(board_name|manufacturer_id)\s*[:=]\s*(.+)$/,
    );
    if (metadataComment) {
      firmware[
        metadataComment[1] === "board_name" ? "boardName" : "manufacturer"
      ] = metadataComment[2];
      return;
    }
    const promptCommand = line.match(/^#\s+([a-z][a-z0-9_]*)\b/);
    if (
      promptCommand &&
      (knownCommands.has(promptCommand[1]) ||
        [
          "set",
          "profile",
          "rateprofile",
          "board_name",
          "manufacturer_id",
          "save",
          "batch",
        ].includes(promptCommand[1]))
    )
      line = line.replace(/^#\s+/, "");
    if (line.startsWith("#") || /^Betaflight(?:\s|$)/i.test(line)) return;
    if (/^(?:save(?:\s+noreboot)?|batch end)\s*$/.test(line)) {
      ended = true;
      return;
    }
    if (
      /^(?:batch start|defaults(?: nosave)?|version|dump|diff|mmix reset|smix reset)\s*$/.test(
        line,
      )
    )
      return;
    const boardMatch = line.match(/^(board_name|manufacturer_id)\s+(.+)$/);
    if (boardMatch) {
      firmware[boardMatch[1] === "board_name" ? "boardName" : "manufacturer"] =
        boardMatch[2];
      return;
    }
    const profileMatch = line.match(/^(profile|rateprofile)\s+(\d+)$/);
    if (profileMatch) {
      const type = profileMatch[1] === "profile" ? "pid" : "rate";
      const number = Number(profileMatch[2]);
      if (!Number.isSafeInteger(number) || number > 255) {
        warnings.push(
          `Invalid profile number on line ${lineNumber}; original evidence is preserved.`,
        );
        return;
      }
      if (restore === type) {
        if (type === "pid") activeProfile = number;
        else activeRateProfile = number;
        restore = null;
      }
      scope = type;
      profile = number;
      return;
    }
    const setMatch = line.match(/^set\s+([a-zA-Z][\w]*)\s*=\s*(.*)$/);
    if (setMatch) {
      const name = setMatch[1];
      add(settings, {
        key:
          scope === "global" ? `global:${name}` : `${scope}:${profile}:${name}`,
        name,
        value: setMatch[2],
        scope,
        profile,
        category: categoryFor(name),
        line: lineNumber,
      });
      return;
    }
    const commandMatch = line.match(/^([a-z][a-z0-9_]*)\s+(.+)$/);
    if (commandMatch) {
      const [, name, value] = commandMatch;
      const identity = commandIdentity(name, value);
      if (identity !== null) {
        add(commands, {
          key: `command:${name}${identity ? `:${identity}` : ""}`,
          name,
          value,
          category: categoryFor(name),
          line: lineNumber,
        });
        return;
      }
    }
    warnings.push(
      `Unknown command or unrecognized line ${lineNumber}; consult the preserved original export.`,
    );
  });
  if (!settings.size && !commands.size)
    throw new AppError(
      "The export contains no recognized setting or configuration command.",
    );
  if (!firmware.version)
    warnings.push("Firmware version is missing; compatibility is unknown.");
  if (exportScope !== "all")
    warnings.push(
      `The export scope is ${exportScope}; omitted settings are unknown.`,
    );
  if (exportKind === "diff")
    warnings.push(
      "This diff omits firmware defaults; omitted values are unknown.",
    );
  if (!ended)
    warnings.push(
      "No save or batch-end marker was found; the export may be truncated.",
    );
  return {
    firmware,
    exportKind,
    exportScope,
    activeProfile,
    activeRateProfile,
    settings: [...settings.values()],
    commands: [...commands.values()],
    warnings,
  };
}
