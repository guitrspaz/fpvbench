import { createFilingService } from "./import-filing.mjs";
import { createServer as httpServer } from "node:http";
import { createAirdataService } from './airdata.mjs';
import { readFile, realpath } from "node:fs/promises";
import { resolve, dirname, extname, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";
import { createStore } from "./store.mjs";
import { compareSnapshots } from "./compare.mjs";
import { AppError, assertSafeObject } from "./errors.mjs";

const publicDefault = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../public",
);
const examplesDefault = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../examples",
);
const BODY_LIMIT = 1536 * 1024;
const FLIGHT_BODY_LIMIT = 36 * 1024 * 1024;
const applicationVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

function verifyLocalRequest(req) {
  const host = req.headers.host;
  if (
    typeof host !== "string" ||
    !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host)
  )
    throw new AppError("Only loopback hostnames are allowed.", 403);
  const parsedHost = new URL(`http://${host}`);
  if (parsedHost.port && Number(parsedHost.port) !== req.socket.localPort)
    throw new AppError("Host port must match the local server.", 403);
  const origin = req.headers.origin;
  if (origin && origin !== `http://${host}`)
    throw new AppError("Only the local application origin is allowed.", 403);
  if (req.headers["sec-fetch-site"] === "cross-site")
    throw new AppError("Cross-site requests are not allowed.", 403);
}
async function body(req, limit = BODY_LIMIT) {
  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      req.headers["content-type"] ?? "",
    )
  )
    throw new AppError("Use application/json content type.", 415);
  if (Number(req.headers["content-length"]) > limit)
    throw new AppError("Request body is too large.", 413);
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit)
      throw new AppError("Request body is too large.", 413);
    chunks.push(chunk);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("The request body must be valid JSON.");
  }
  assertSafeObject(value);
  return value;
}
function json(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}
function attachment(res, filename, content, type) {
  const safe =
    filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "export.txt";
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${safe}"`,
  });
  res.end(content);
}

/** Create the localhost application server with an isolated or configured persistent workspace. */
export async function createServer({
  dataDir = process.env.FPVBENCH_DATA_DIR || resolve(homedir(), ".fpvbench"),
  publicDir = publicDefault,
  examplesDir = examplesDefault,
  storeFactory = createStore,
  aiFactory,
  assistantFactory,
  airdataFactory = createAirdataService,
  filingFactory = createFilingService,
} = {}) {
  const store = await storeFactory(dataDir);
  let ai, assistant;
  try {
    ai = await (aiFactory ?? (await import("./ai-service.mjs")).createAiService)(dataDir);
    assistant = await (assistantFactory ?? (await import("./assistant.mjs")).createAssistant)({ store, ai });
  } catch {
    try { await ai?.close(); } catch { /* Preserve core workspace availability. */ }
    ai = unavailableAiService();
    assistant = {
      getSettings: ai.getSettings,
      updateSettings: ai.updateSettings,
      checkConnection: ai.checkConnection,
      reviewSnapshot: ai.run,
      getSnapshotReview: ai.run,
      recapFlights: ai.run,
      close: ai.close,
    };
  }
  const airdata = await airdataFactory(dataDir, { store });
  const filing = await filingFactory(dataDir, { store, airdata });
  const automaticTasks = new Set();
  const automaticReviews = new Map();
  let closing = false;
  let closeResourcesPromise;
  const closeResources = () => {
    if (!closeResourcesPromise) {
      closing = true;
      closeResourcesPromise = (async () => {
        await Promise.allSettled(automaticTasks);
        await filing.close();
        try { await assistant.close(); }
        finally { try { await ai.close(); } finally { try { await airdata.close(); } finally { await store.close(); } } }
      })();
    }
    return closeResourcesPromise;
  };
  const queueAutomaticReview = snapshotId => {
    if (closing || automaticTasks.size) return;
    const task = Promise.resolve().then(async () => {
      const settings = await assistant.getSettings();
      if (settings.available && settings.automaticReview && !closing) {
        automaticReviews.set(snapshotId, "pending");
        if (automaticReviews.size > 100) automaticReviews.delete(automaticReviews.keys().next().value);
        try { await assistant.reviewSnapshot(snapshotId, {}); automaticReviews.delete(snapshotId); }
        catch { automaticReviews.set(snapshotId, "failed"); }
      }
    }).catch(() => {}).finally(() => automaticTasks.delete(task));
    automaticTasks.add(task);
  };
  const publicRoot = resolve(publicDir);
  const server = httpServer(async (req, res) => {
    res.setHeader("Content-Security-Policy", CSP);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    try {
      verifyLocalRequest(req);
      let rawPath;
      try {
        rawPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
      } catch {
        throw new AppError("Invalid request path.");
      }
      if (
        rawPath.includes("\0") ||
        rawPath.includes("\\") ||
        rawPath.split("/").includes("..")
      )
        throw new AppError("Unsafe request path.", 403);
      const url = new URL(req.url, `http://${req.headers.host}`),
        path = url.pathname;
      const match = path.match(
        /^\/api\/(aircraft|snapshots|sessions|flight-logs)\/([^/]+)(\/(?:raw|frames))?$/,
      );
      const journalRoute=path.match(/^\/api\/aircraft\/([^/]+)\/(journal|brief)(?:\/([^/]+))?$/);
      if(journalRoute) {
        const [,aircraftId,resource,entryId]=journalRoute;
        if(resource==="brief"&&!entryId&&req.method==="GET") return json(res,200,store.getBrief(aircraftId));
        if(resource==="journal") {
          if(!entryId&&req.method==="GET") return json(res,200,store.getJournal(aircraftId));
          if(!entryId&&req.method==="POST") return json(res,201,await store.createJournalEntry(aircraftId,await body(req,65536)));
          if(entryId&&req.method==="PATCH") return json(res,200,await store.updateJournalEntry(aircraftId,entryId,await body(req,65536)));
        }
        throw new AppError("API route was not found.",404);
      }
      if(path==="/api/filing/settings"&&req.method==="GET")return json(res,200,await filing.getSettings());
      if(path==="/api/filing/settings"&&req.method==="PATCH")return json(res,200,await filing.updateSettings(await body(req,8192)));
      if(path==="/api/filing/scan"&&req.method==="GET")return json(res,200,await filing.getScan());
      if(path==="/api/filing/scan"&&req.method==="POST"){emptyAiBody(await body(req,1024));return json(res,200,await filing.scanFolder());}
      if(path==="/api/filing/import"&&req.method==="POST")return json(res,200,await filing.importFiles(await body(req,8192)));
      if (path === "/api/airdata/settings" && req.method === "GET") return json(res, 200, await airdata.getSettings());
      if (path === "/api/airdata/settings" && req.method === "PATCH") return json(res, 200, await airdata.updateSettings(await body(req, 4096)));
      if (path === "/api/airdata/check" && req.method === "POST") { emptyAiBody(await body(req, 1024)); return json(res, 200, await airdata.checkConnection()); }
      if (["/api/airdata/send", "/api/airdata/refresh"].includes(path) && req.method === "POST") {
        const input = await body(req, 8192);
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => key !== "ids")) throw new AppError("Select log record IDs.");
        return json(res, 200, await (path.endsWith("/send") ? airdata.sendLogs(input.ids) : airdata.refreshJobs(input.ids)));
      }
      if (path === "/api/log-imports" && req.method === "POST") {
        const result = await store.importLog(await body(req, FLIGHT_BODY_LIMIT));
        return json(res, result.duplicate ? 200 : 201, result);
      }
      if (path.startsWith("/api/ai/")) {
        if (path === "/api/ai/settings" && req.method === "GET")
          return json(res, 200, publicAiSettings(await assistant.getSettings()));
        if (path === "/api/ai/settings" && req.method === "PATCH")
          return json(res, 200, publicAiSettings(await assistant.updateSettings(await body(req, 16 * 1024))));
        if (path === "/api/ai/check" && req.method === "POST") {
          emptyAiBody(await body(req, 1024));
          return json(res, 200, publicAiSettings(await assistant.checkConnection()));
        }
        const reviewMatch = path.match(/^\/api\/ai\/review\/([^/]+)$/);
        if (reviewMatch && req.method === "GET") {
          await requireAi(assistant);
          const pendingStatus = automaticReviews.get(reviewMatch[1]);
          if (pendingStatus) return json(res, 200, { status: pendingStatus });
          return json(res, 200, await assistant.getSnapshotReview(reviewMatch[1]));
        }
        if (path === "/api/ai/review" && req.method === "POST") {
          const input = await body(req, 16 * 1024);
          if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["snapshotId", "question"].includes(key))
            || typeof input.snapshotId !== "string" || !input.snapshotId
            || (input.question !== undefined && (typeof input.question !== "string" || input.question.length > 1000)))
            throw new AppError("Provide a snapshot ID and an optional question of 1000 characters or fewer.");
          await requireAi(assistant);
          return json(res, 200, await assistant.reviewSnapshot(input.snapshotId, { question: input.question }));
        }
        if (path === "/api/ai/recap" && req.method === "POST") {
          const input = await body(req, 1024);
          if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["aircraftId", "units"].includes(key))
            || (input.units !== undefined && !["metric", "imperial"].includes(input.units))
            || typeof input.aircraftId !== "string" || !input.aircraftId.trim())
            throw new AppError("Provide the selected aircraft ID.");
          await requireAi(assistant);
          return json(res, 200, await assistant.recapFlights(input.aircraftId, { units: input.units }));
        }
        throw new AppError("API route was not found.", 404);
      }
      if (req.method === "GET" && path === "/api/health")
        return json(res, 200, { application: "FPVBench", version: applicationVersion });
      if (req.method === "GET" && path === "/api/state")
        return json(res, 200, store.getState());
      if (req.method === "GET" && path === "/api/export")
        return attachment(
          res,
          "fpvbench-workspace.json",
          JSON.stringify(await store.exportWorkspace(), null, 2) + "\n",
          "application/json; charset=utf-8",
        );
      if (req.method === "GET" && path === "/api/compare") {
        if (!url.searchParams.get("from") || !url.searchParams.get("to"))
          throw new AppError("Choose from and to snapshot IDs.");
        return json(
          res,
          200,
          compareSnapshots(
            store.getSnapshot(url.searchParams.get("from")),
            store.getSnapshot(url.searchParams.get("to")),
          ),
        );
      }
      if (req.method === "POST" && path === "/api/aircraft")
        return json(res, 201, await store.createAircraft(await body(req)));
      if (req.method === "POST" && path === "/api/snapshots") {
        const snapshot = await store.importSnapshot(await body(req));
        queueAutomaticReview(snapshot.id);
        return json(res, 201, snapshot);
      }
      if (req.method === "POST" && path === "/api/sessions")
        return json(res, 201, await store.createSession(await body(req)));
      if (req.method === "POST" && path === "/api/flight-logs/match-unassigned") {
        emptyAiBody(await body(req, 1024));
        return json(res, 200, await store.matchUnassignedFlightLogs());
      }
      if (req.method === "POST" && path === "/api/flight-logs/mark-uploaded")
        return json(res, 200, await store.markFlightLogsUploaded(await body(req, 65536)));
      if (req.method === "POST" && path === "/api/flight-logs") {
        const result = await store.importFlightLog(await body(req, FLIGHT_BODY_LIMIT));
        return json(res, result.duplicate ? 200 : 201, result);
      }
      if (
        match &&
        !match[3] &&
        req.method === "PATCH" &&
        match[1] === "aircraft"
      )
        return json(
          res,
          200,
          await store.updateAircraft(match[2], await body(req)),
        );
      if (
        match &&
        !match[3] &&
        req.method === "PATCH" &&
        match[1] === "sessions"
      )
        return json(
          res,
          200,
          await store.updateSession(match[2], await body(req)),
        );
      if (match && !match[3] && req.method === "PATCH" && match[1] === "flight-logs")
        return json(res, 200, await store.updateFlightLog(match[2], await body(req)));
      if (match && req.method === "GET" && match[1] === "snapshots") {
        const snapshot = store.getSnapshot(match[2]);
        if (match[3] === "/frames") throw new AppError("API route was not found.", 404);
        return match[3] === "/raw"
          ? attachment(
              res,
              snapshot.filename,
              snapshot.rawText,
              "text/plain; charset=utf-8",
            )
          : json(res, 200, snapshot);
      }
      if (match && req.method === "GET" && match[1] === "flight-logs") {
        if (match[3] === "/raw") {
          const original = await store.getFlightOriginal(match[2]);
          const flightLog = store.getFlightLog(match[2]);
          return attachment(res, flightLog.filename, original.bytes ?? original,
            flightLog.format === "dji-json" ? "application/json" : "application/octet-stream");
        }
        if (match[3] === "/frames") {
          const offset = integerQuery(url, "offset", 0, Number.MAX_SAFE_INTEGER);
          const limit = integerQuery(url, "limit", 100, 1000, 1);
          return json(res, 200, await store.getFlightFrames(match[2], offset, limit));
        }
        return json(res, 200, store.getFlightLog(match[2]));
      }
      if (path.startsWith("/api/"))
        throw new AppError("API route was not found.", 404);
      if (req.method !== "GET" && req.method !== "HEAD")
        throw new AppError("Route was not found.", 404);
      const isExample = rawPath.startsWith("/examples/");
      const root = isExample ? resolve(examplesDir) : publicRoot;
      const relativePath = isExample
        ? rawPath.slice("/examples".length)
        : rawPath;
      const target = resolve(
        root,
        "." + (relativePath === "/" ? "/index.html" : relativePath),
      );
      if (!target.startsWith(root + sep))
        throw new AppError("Unsafe request path.", 403);
      let resolved, bytes;
      try {
        resolved = await realpath(target);
        if (!resolved.startsWith(root + sep))
          throw new AppError("Unsafe static file.", 403);
        bytes = await readFile(resolved);
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (["ENOENT", "EISDIR", "ENOTDIR"].includes(error.code))
          throw new AppError("File was not found.", 404);
        throw error;
      }
      res.writeHead(200, {
        "Content-Type": types[extname(target)] ?? "application/octet-stream",
      });
      res.end(req.method === "HEAD" ? undefined : bytes);
    } catch (error) {
      const status = error instanceof AppError ? error.status : 500;
      if (!res.headersSent)
        json(res, status, {
          error:
            (req.url ?? "").startsWith("/api/ai/") && status !== 404
              ? "The optional AI request could not be completed. Check Settings for availability, allowance, and connection status."
              : status === 500
              ? "An unexpected local application error occurred."
              : error.message,
        });
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  const closeServer = server.close.bind(server);
  server.close = (callback) =>
    closeServer(async (error) => {
      try {
        await closeResources();
        callback?.(error);
      } catch (closeError) {
        callback?.(closeError);
      }
    });
  server.once("error", () => {
    void closeResources().catch(() => {
      console.error(
        "Unable to release the workspace lock. Inspect it while servers are stopped.",
      );
    });
  });
  return server;
}

function publicAiSettings(settings) {
  const keys = ["provider", "model", "enabled", "keyConfigured", "monthlyBudgetUSD", "spentUSD", "remainingUSD", "automaticReview", "available", "reason", "verifiedAt", "billingState", "priceCheckedAt"];
  return Object.fromEntries(keys.map(key => [key, settings[key]]));
}

function unavailableAiService() {
  const reason = "AI configuration unavailable; preserve local files before repair";
  const unavailable = () => { throw new AppError(reason, 409); };
  return {
    getSettings: () => ({ provider: "openai", model: "gpt-5.4-mini-2026-03-17", enabled: false, keyConfigured: false,
      monthlyBudgetUSD: 0, spentUSD: 0, remainingUSD: 0, automaticReview: false, available: false, reason,
      verifiedAt: null, billingState: "unverified", priceCheckedAt: "2026-10-14" }),
    updateSettings: unavailable, checkConnection: unavailable, run: unavailable, close: async () => {},
  };
}

function emptyAiBody(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length)
    throw new AppError("This action accepts an empty JSON object.");
}

async function requireAi(assistant) {
  const settings = await assistant.getSettings();
  if (!settings.available) throw new AppError("Optional AI is unavailable. Check Settings.", 409);
}

function integerQuery(url, key, defaultValue, max, min = 0) {
  const text = url.searchParams.get(key);
  if (text === null) return defaultValue;
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) < min || Number(text) > max)
    throw new AppError(`${key} must be an integer from ${min} to ${max}.`);
  return Number(text);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const port = Number(process.env.PORT ?? 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be an integer from 1 to 65535.");
  const server = await createServer();
  server.once("error", (error) => {
    console.error(`Cannot start FPVBench (${error.code ?? "server error"}).`);
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () =>
      server.close(() => {
        process.exitCode = 0;
      }),
    );
  server.listen(port, "127.0.0.1", () =>
    console.log(`FPVBench is available at http://127.0.0.1:${port}`),
  );
}
