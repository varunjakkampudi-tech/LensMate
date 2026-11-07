import { readFileSync } from "node:fs";

/**
 * Reads a value from NAME, or from the file named by NAME_FILE (Docker secrets). Both at once is an error. The value
 * is never included in an error message.
 */
export function readEnvValue(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  const direct = trimmed(env[name]);
  const path = trimmed(env[`${name}_FILE`]);
  if (direct !== undefined && path !== undefined) {
    throw new Error(`set ${name} or ${name}_FILE, not both`);
  }
  if (path === undefined) {
    return direct;
  }
  try {
    return trimmed(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${name}_FILE could not be read`);
  }
}

function trimmed(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result === undefined || result === "" ? undefined : result;
}
