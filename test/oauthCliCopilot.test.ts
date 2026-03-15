import { assert } from "chai";
import { parseCopilotModelsResponse } from "../src/utils/oauthCli";

describe("oauthCli Copilot model parsing", function () {
  it("should parse the OpenAI-style data array returned by Copilot", function () {
    const models = parseCopilotModelsResponse({
      data: [
        {
          id: "gpt-5.4",
          name: "GPT-5.4",
          object: "model",
          capabilities: { family: "gpt-5.4" },
        },
        {
          id: "claude-sonnet-4.6",
          name: "Claude Sonnet 4.6",
          object: "model",
          capabilities: { family: "claude-sonnet-4.6" },
        },
      ],
    });

    assert.deepEqual(models, [
      { id: "claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
      { id: "gpt-5.4", label: "GPT-5.4" },
    ]);
  });

  it("should accept fallback models arrays and de-duplicate by id", function () {
    const models = parseCopilotModelsResponse({
      models: [
        { id: "gpt-4o", label: "GPT-4o" },
        { model: "gpt-4o", name: "GPT-4o Duplicate" },
        { model: "o3-mini", name: "o3 Mini" },
      ],
    });

    assert.deepEqual(models, [
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "o3-mini", label: "o3 Mini" },
    ]);
  });

  it("should return an empty list for unexpected payloads", function () {
    assert.deepEqual(parseCopilotModelsResponse({ ok: true }), []);
    assert.deepEqual(parseCopilotModelsResponse(null), []);
  });
});
