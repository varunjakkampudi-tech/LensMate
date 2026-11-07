import type { FastifyInstance } from "fastify";
import type { BudgetStore } from "../budget.js";
import type { BrokerConfig } from "../config.js";
import { authenticateDevice, type DeviceStore } from "../devices.js";

interface UsageRouteDependencies {
  readonly config: Pick<BrokerConfig, "monthlyCapPaise" | "mode">;
  readonly budget: Pick<BudgetStore, "summary">;
  readonly devices: DeviceStore;
  readonly now: () => number;
  readonly monthFor: (epochMs: number) => string;
}

export function registerUsageRoute(
  app: FastifyInstance,
  { config, budget, devices, now, monthFor }: UsageRouteDependencies,
): void {
  app.get("/v1/usage", async (request, reply) => {
    const client = await authenticateDevice(request.headers.authorization, devices);
    if (client === null) {
      return reply.code(401).send({ error: "unauthorized", code: "UNAUTHORIZED" });
    }
    const month = monthFor(now());
    const summary = await budget.summary(month);
    return {
      month,
      capPaise: config.monthlyCapPaise,
      spentPaise: summary.spentPaise,
      reservedPaise: summary.reservedPaise,
      remainingPaise: Math.max(
        0,
        config.monthlyCapPaise - summary.spentPaise - summary.reservedPaise,
      ),
      source: config.mode === "live" ? "openrouter" : "mock",
    };
  });
}
