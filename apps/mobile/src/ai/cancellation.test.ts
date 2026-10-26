/**
 * Cancellation of an assistant request. Stand-ins: the broker transport (mocked, no provider called) and the notes
 * store (mocked). The request wrapper, the agent loop and the cancellation error are the real code.
 */
import { askText, RequestCancelled } from "./assistant";
import { callBroker } from "../broker-call";
import { runAgentTask } from "./agent";
import { saveItem } from "../memory/vault";

jest.mock("../broker-call", () => {
  const actual = jest.requireActual("../broker-call");
  return { ...actual, callBroker: jest.fn(), callBrokerVision: jest.fn() };
});
jest.mock("../memory/vault", () => ({
  saveItem: jest.fn(async () => ({})),
  listItems: jest.fn(async () => []),
}));

const transport = callBroker as unknown as jest.Mock;
const save = saveItem as unknown as jest.Mock;

function reply(text: string) {
  return {
    requestId: "r",
    text,
    usage: { promptTokens: 1, completionTokens: 1 },
    costPaise: 3,
    source: "mock",
  };
}

/** A transport call that never answers, but rejects when its signal is aborted (as a real fetch does). */
function hangUntilAborted() {
  return (_request: unknown, signal: AbortSignal) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("cancelling a request", () => {
  it("does not send a request when it is already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      askText([{ role: "user", content: "hi" }], "en", "", controller.signal),
    ).rejects.toBeInstanceOf(RequestCancelled);
    expect(transport).not.toHaveBeenCalled();
  });

  it("stops waiting for a request that hangs, and reports a cancellation rather than an error", async () => {
    transport.mockImplementation(hangUntilAborted());
    const controller = new AbortController();

    const pending = askText([{ role: "user", content: "hi" }], "en", "", controller.signal);
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(RequestCancelled);
    const signal = transport.mock.calls[0]?.[1] as AbortSignal;
    expect(signal.aborted).toBe(true);
  });

  it("discards an answer that arrives after cancellation", async () => {
    let finish: (value: unknown) => void = () => undefined;
    transport.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const controller = new AbortController();

    const pending = askText([{ role: "user", content: "hi" }], "en", "", controller.signal);
    controller.abort();
    finish(reply("Late answer"));

    await expect(pending).rejects.toBeInstanceOf(RequestCancelled);
  });

  it("runs no tool and saves nothing once the task is cancelled during planning", async () => {
    const controller = new AbortController();
    transport.mockImplementation(async () => {
      controller.abort();
      return reply('{"calls":[{"tool":"save_note","input":{"title":"t","text":"x"}}]}');
    });
    const steps: string[] = [];

    await expect(
      runAgentTask("remember this", "en", (s) => steps.push(s.agent), controller.signal),
    ).rejects.toBeInstanceOf(RequestCancelled);

    expect(save).not.toHaveBeenCalled();
    expect(steps).toEqual([]);
  });

  it("passes the cancel signal to the translate request, so it can be stopped", async () => {
    transport
      .mockResolvedValueOnce(
        reply('{"calls":[{"tool":"translate","input":{"text":"hi","from":"en","to":"te"}}]}'),
      )
      .mockImplementationOnce(hangUntilAborted())
      .mockResolvedValue(reply("ok"));
    const controller = new AbortController();

    const pending = runAgentTask("say hi", "en", () => undefined, controller.signal);
    setTimeout(() => controller.abort(), 5);

    await expect(pending).rejects.toBeInstanceOf(RequestCancelled);
    const translateSignal = transport.mock.calls[1]?.[1] as AbortSignal;
    expect(translateSignal.aborted).toBe(true);
  });

  it("still returns a normal answer when nothing is cancelled", async () => {
    transport
      .mockResolvedValueOnce(reply('{"calls":[]}'))
      .mockResolvedValueOnce(reply("Here is the answer."));

    const result = await runAgentTask("hello", "en", () => undefined, new AbortController().signal);

    expect(result.answer).toBe("Here is the answer.");
  });
});
