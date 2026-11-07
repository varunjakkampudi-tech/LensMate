/* global console, process */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CATALOGUE_URL = "https://openrouter.ai/api/v1/models";
const PRICING_SOURCE = fileURLToPath(new URL("../src/pricing.ts", import.meta.url));

function readModelAllowlist(source) {
  const list = source.match(/export const MODEL_ALLOWLIST\s*:[^=]+?=\s*\[([\s\S]*?)\n\];/);
  if (list?.[1] === undefined) {
    throw new Error("Could not locate MODEL_ALLOWLIST in pricing.ts");
  }

  const models = [...list[1].matchAll(/\{([\s\S]*?)\}/g)].map(([, fields]) => {
    const id = fields?.match(/\bid:\s*"([^"]+)"/)?.[1];
    const input = fields?.match(/\binputMicroUsdPerMillion:\s*([\d_]+)/)?.[1];
    const output = fields?.match(/\boutputMicroUsdPerMillion:\s*([\d_]+)/)?.[1];
    if (id === undefined || input === undefined || output === undefined) {
      throw new Error("Could not parse a model price from MODEL_ALLOWLIST");
    }
    return {
      id,
      inputMicroUsdPerMillion: Number(input.replaceAll("_", "")),
      outputMicroUsdPerMillion: Number(output.replaceAll("_", "")),
    };
  });

  if (models.length === 0) {
    throw new Error("MODEL_ALLOWLIST is empty or could not be parsed");
  }
  return models;
}

function catalogueUsdPerMillion(pricePerToken) {
  const price = Number(pricePerToken);
  return Number.isFinite(price) && price >= 0 ? price * 1_000_000 : null;
}

function formatPrice(value) {
  return value === null ? "not listed" : `$${value.toFixed(6)}`;
}

function matchesPrice(cataloguePrice, localMicroUsdPerMillion) {
  return (
    cataloguePrice !== null &&
    Math.abs(cataloguePrice - localMicroUsdPerMillion / 1_000_000) < 0.000000001
  );
}

async function main() {
  const localModels = readModelAllowlist(readFileSync(PRICING_SOURCE, "utf8"));
  const response = await fetch(CATALOGUE_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`OpenRouter catalogue returned HTTP ${response.status}`);
  }

  const catalogue = await response.json();
  if (!Array.isArray(catalogue.data)) {
    throw new Error("OpenRouter catalogue response did not include a model list");
  }
  const catalogueById = new Map(catalogue.data.map((model) => [model.id, model]));

  const rows = localModels.map((local) => {
    const model = catalogueById.get(local.id);
    const prompt = catalogueUsdPerMillion(model?.pricing?.prompt);
    const completion = catalogueUsdPerMillion(model?.pricing?.completion);
    const promptMatches = matchesPrice(prompt, local.inputMicroUsdPerMillion);
    const completionMatches = matchesPrice(completion, local.outputMicroUsdPerMillion);
    return {
      id: local.id,
      catalogue: `${formatPrice(prompt)} / ${formatPrice(completion)}`,
      local: `$${(local.inputMicroUsdPerMillion / 1_000_000).toFixed(6)} / $${(local.outputMicroUsdPerMillion / 1_000_000).toFixed(6)}`,
      match: promptMatches && completionMatches,
    };
  });

  const widths = {
    id: Math.max("id".length, ...rows.map((row) => row.id.length)),
    catalogue: Math.max(
      "catalogue prompt / completion (USD per million)".length,
      ...rows.map((row) => row.catalogue.length),
    ),
    local: Math.max(
      "our prompt / completion (USD per million)".length,
      ...rows.map((row) => row.local.length),
    ),
  };
  const header = `| ${"id".padEnd(widths.id)} | ${"catalogue prompt / completion (USD per million)".padEnd(widths.catalogue)} | ${"our prompt / completion (USD per million)".padEnd(widths.local)} | match |`;
  const separator = `|-${"-".repeat(widths.id)}-|-${"-".repeat(widths.catalogue)}-|-${"-".repeat(widths.local)}-|-------|`;
  console.log(header);
  console.log(separator);
  for (const row of rows) {
    console.log(
      `| ${row.id.padEnd(widths.id)} | ${row.catalogue.padEnd(widths.catalogue)} | ${row.local.padEnd(widths.local)} | ${row.match ? "yes" : "no"}    |`,
    );
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`Pricing verification could not complete: ${message}`);
  process.exitCode = 1;
});
