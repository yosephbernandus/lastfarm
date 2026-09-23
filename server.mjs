import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyLocally, parseInterpretRequest, parseSemanticResult } from "./src/semantic.js";
import { buildTypeSafeRequest, parseTypeSafeResponse, resolveJevConfiguration } from "./src/jev-adapter.js";
import { generateDialogue, resolveDialogueConfiguration } from "./src/dialogue-generator.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST_ROOT = resolve(ROOT, "dist");
const DEFAULT_PORT = 8787;
const BODY_LIMIT = 16 * 1024;
const PROVIDER_TIMEOUT_MS = 3200;
const MAX_CACHED_REQUESTS = 200;
const responseCache = new Map();
const inFlightRequests = new Map();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function loadDotEnv() {
  try {
    const source = readFileSync(join(ROOT, ".env"), "utf8");
    source.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match || process.env[match[1]] !== undefined) return;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

loadDotEnv();

function providerConfigured() {
  return resolveJevConfiguration().configured;
}

function dialogueProviderConfigured() {
  return resolveDialogueConfiguration().configured;
}

function jsonResponse(response, status, body) {
  const serialized = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(serialized),
    "x-content-type-options": "nosniff",
  });
  response.end(serialized);
}

function textResponse(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

async function readJsonBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) {
      const error = new Error("request body too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    const parseError = new Error("request body must be valid JSON");
    parseError.statusCode = 400;
    throw parseError;
  }
}

function cacheResponse(request, fingerprint, response) {
  responseCache.set(request.requestId, { fingerprint, response });
  if (responseCache.size > MAX_CACHED_REQUESTS) {
    responseCache.delete(responseCache.keys().next().value);
  }
}

function fallbackSemantic(request, reason) {
  return {
    semanticProvider: "local-fallback",
    semanticFallbackReason: reason,
    result: classifyLocally(request),
  };
}

async function requestProvider(request) {
  const configuration = resolveJevConfiguration();
  if (!configuration.configured) return { ok: false, reason: "provider-unconfigured" };

  let providerBody;
  let authHeader;
  let parseResponse;
  if (configuration.protocol === "typesafe-systemone") {
    providerBody = buildTypeSafeRequest(request, configuration.model);
    authHeader = `Bearer ${configuration.key}`;
    parseResponse = (data) => parseTypeSafeResponse(data, request);
  } else if (configuration.protocol === "generic") {
    providerBody = request;
    authHeader = configuration.genericAuthPrefix
      ? `${configuration.genericAuthPrefix} ${configuration.key}`
      : configuration.key;
    parseResponse = (data) => {
      const candidate = data && typeof data === "object" && data.result ? data.result : data;
      return parseSemanticResult(candidate, request);
    };
  } else {
    return { ok: false, reason: "provider-protocol-unsupported" };
  }

  const headerName = configuration.protocol === "typesafe-systemone"
    ? "Authorization"
    : configuration.genericAuthHeader;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const upstream = await fetch(configuration.url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        [headerName]: authHeader,
      },
      body: JSON.stringify(providerBody),
      signal: controller.signal,
    });
    if (!upstream.ok) return { ok: false, reason: `provider-http-${upstream.status}` };
    let data;
    try {
      data = await upstream.json();
    } catch (error) {
      return { ok: false, reason: "provider-invalid-json" };
    }
    const parsed = parseResponse(data);
    if (!parsed.ok) return { ok: false, reason: "provider-invalid-result" };
    return { ok: true, result: parsed.value };
  } catch (error) {
    return { ok: false, reason: error.name === "AbortError" ? "provider-timeout" : "provider-unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

async function handleInterpret(request, response) {
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    jsonResponse(response, error.statusCode || 400, { ok: false, error: error.message });
    return;
  }
  const parsedRequest = parseInterpretRequest(body);
  if (!parsedRequest.ok) {
    jsonResponse(response, 400, { ok: false, error: parsedRequest.error });
    return;
  }
  const input = parsedRequest.value;
  const fingerprint = JSON.stringify(input);
  const cached = responseCache.get(input.requestId);
  if (cached) {
    if (cached.fingerprint !== fingerprint) {
      jsonResponse(response, 409, { ok: false, error: "requestId already used with different input" });
      return;
    }
    jsonResponse(response, 200, { ...cached.response, deduplicated: true });
    return;
  }

  const existing = inFlightRequests.get(input.requestId);
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      jsonResponse(response, 409, { ok: false, error: "requestId already used with different input" });
      return;
    }
    const envelope = await existing.promise;
    jsonResponse(response, 200, { ...envelope, deduplicated: true });
    return;
  }

  const promise = (async () => {
    try {
      const semantic = providerConfigured()
        ? await requestProvider(input)
        : { ok: false, reason: "provider-unconfigured" };
      const semanticEnvelope = semantic.ok
        ? { semanticProvider: "jev-adapter", semanticFallbackReason: null, result: semantic.result }
        : fallbackSemantic(input, semantic.reason);

      const authoritativeResult = structuredClone(semanticEnvelope.result);
      const generated = await generateDialogue(structuredClone(input), structuredClone(authoritativeResult), {
        configuration: resolveDialogueConfiguration(),
      });
      const envelope = {
        ok: true,
        ...semanticEnvelope,
        result: authoritativeResult,
        dialogueProvider: generated.ok ? generated.provider : "authored-fallback",
        dialogueFallbackReason: generated.ok ? null : generated.reason,
        generatedDialogue: generated.ok ? generated.text : null,
      };
      cacheResponse(input, fingerprint, envelope);
      return envelope;
    } catch {
      const envelope = {
        ok: true,
        ...fallbackSemantic(input, "interpretation-unavailable"),
        dialogueProvider: "authored-fallback",
        dialogueFallbackReason: "dialogue-unavailable",
        generatedDialogue: null,
      };
      cacheResponse(input, fingerprint, envelope);
      return envelope;
    }
  })();
  inFlightRequests.set(input.requestId, { fingerprint, promise });
  try {
    const envelope = await promise;
    jsonResponse(response, 200, envelope);
  } catch {
    inFlightRequests.delete(input.requestId);
    jsonResponse(response, 200, {
      ok: true,
      ...fallbackSemantic(input, "interpretation-unavailable"),
      dialogueProvider: "authored-fallback",
      dialogueFallbackReason: "dialogue-unavailable",
      generatedDialogue: null,
    });
  } finally {
    if (inFlightRequests.get(input.requestId)?.promise === promise) inFlightRequests.delete(input.requestId);
  }
}

async function serveStatic(pathname, response, headOnly = false) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const candidate = resolve(DIST_ROOT, `.${normalize(requestedPath)}`);
  const relativePath = relative(DIST_ROOT, candidate);
  if (relativePath.startsWith("..") || relativePath.includes(`..${sep}`)) {
    textResponse(response, 403, "Forbidden\n");
    return;
  }
  try {
    const fileStats = await stat(candidate);
    if (!fileStats.isFile()) {
      textResponse(response, 404, "Not found\n");
      return;
    }
    response.writeHead(200, {
      "content-type": MIME_TYPES[extname(candidate).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-cache",
      "content-length": fileStats.size,
      "x-content-type-options": "nosniff",
    });
    if (headOnly) {
      response.end();
      return;
    }
    response.end(await readFile(candidate));
  } catch (error) {
    textResponse(response, error.code === "ENOENT" ? 404 : 500, error.code === "ENOENT" ? "Not found\n" : "Server error\n");
  }
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", "http://localhost");
  if (requestUrl.pathname === "/api/health" && request.method === "GET") {
    const semanticAvailable = providerConfigured();
    const dialogueAvailable = dialogueProviderConfigured();
    jsonResponse(response, 200, {
      ok: true,
      providerAvailable: semanticAvailable,
      semanticProviderAvailable: semanticAvailable,
      dialogueProviderAvailable: dialogueAvailable,
    });
    return;
  }
  if (requestUrl.pathname === "/api/npc/interpret" && request.method === "POST") {
    await handleInterpret(request, response);
    return;
  }
  if (requestUrl.pathname.startsWith("/api/")) {
    jsonResponse(response, 404, { ok: false, error: "not_found" });
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    textResponse(response, 405, "Method not allowed\n");
    return;
  }
  await serveStatic(requestUrl.pathname, response, request.method === "HEAD");
});

const port = Number.parseInt(process.env.PORT || String(DEFAULT_PORT), 10) || DEFAULT_PORT;
server.listen(port, "127.0.0.1", () => {
  console.log(`Lastlight Farm running at http://127.0.0.1:${port}`);
  console.log(`Semantic provider: ${providerConfigured() ? "configured" : "local fallback"}`);
});
