import type { FastifyInstance } from "fastify";
import type { BudgetStore } from "../budget.js";

export function registerHealthRoute(app: FastifyInstance, budget: Pick<BudgetStore, "ping">): void {
  app.get("/healthz", async (_request, reply) => {
    try {
      await budget.ping();
      return { status: "ok" };
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
  });
}
