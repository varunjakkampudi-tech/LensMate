import { BrokerError } from "@lensmate/core";
import { aiErrorText, plain, translate } from "./assistant";
import { BrokerCallBlocked, callBroker } from "../broker-call";

jest.mock("../broker-call", () => {
  const actual = jest.requireActual("../broker-call");
  return { ...actual, callBroker: jest.fn(), callBrokerVision: jest.fn() };
});

const reply = (text: string) => ({
  requestId: "r",
  text,
  usage: { promptTokens: 1, completionTokens: 1 },
  costPaise: 1,
  source: "mock",
});

describe("assistant helpers", () => {
  it("strips markdown emphasis and headings for speech", () => {
    expect(plain("## Title\n**bold** and __under__\n- item")).toBe("Title\nbold and under\n• item");
  });

  it("parses the translation JSON and its uncertain words", async () => {
    (callBroker as jest.Mock).mockResolvedValue(
      reply('{"translation":"నమస్తే","uncertain":["నమస్తే"]}'),
    );
    const result = await translate("Hello", "en", "te");
    expect(result.translation).toBe("నమస్తే");
    expect(result.uncertain).toEqual(["నమస్తే"]);
  });

  it("marks a non-JSON translation as wholly uncertain instead of hiding it", async () => {
    (callBroker as jest.Mock).mockResolvedValue(reply("Bonjour"));
    const result = await translate("Hello", "en", "fr");
    expect(result).toMatchObject({ translation: "Bonjour", uncertain: ["Bonjour"] });
  });

  it("explains refusals in plain words", () => {
    expect(aiErrorText(new BrokerCallBlocked("NOT_ENROLLED"))).toMatch(/Enrol this phone/);
    expect(aiErrorText(new BrokerError("BUDGET_EXHAUSTED", "PROVIDER_ERROR", false))).toMatch(
      /cap/,
    );
    expect(aiErrorText(new Error("x"))).toMatch(/went wrong/);
  });
});
