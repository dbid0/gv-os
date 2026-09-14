import { describe, expect, it } from "vitest";

import {
  bearerKey,
  generateKey,
  hashKey,
  isKeyShape,
  KEY_PREFIX,
  keyLabel,
} from "@/lib/mcp/keys";
import {
  checkArguments,
  handleMessage,
  INSTRUCTIONS,
  RPC,
  SERVER_NAME,
  ToolInputError,
  type ToolDefinition,
} from "@/lib/mcp/protocol";

describe("MCP keys", () => {
  it("generates a prefixed 32-byte base64url key from the random source", () => {
    const key = generateKey((n) => Buffer.alloc(n, 7));
    expect(key.startsWith(KEY_PREFIX)).toBe(true);
    expect(isKeyShape(key)).toBe(true);
    expect(key).toBe(KEY_PREFIX + Buffer.alloc(32, 7).toString("base64url"));
    expect(isKeyShape(generateKey())).toBe(true);
    expect(generateKey()).not.toBe(generateKey());
  });

  it("hashes to 64 hex chars, deterministically, and labels without the secret", () => {
    const key = generateKey((n) => Buffer.alloc(n, 1));
    expect(hashKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashKey(key)).toBe(hashKey(key));
    expect(hashKey(key)).not.toBe(hashKey(`${key}x`));
    expect(keyLabel(key)).toBe(key.slice(0, KEY_PREFIX.length + 8));
  });

  it("reads a bearer key only when it has the key's exact shape", () => {
    const key = generateKey((n) => Buffer.alloc(n, 2));
    expect(bearerKey(`Bearer ${key}`)).toBe(key);
    expect(bearerKey(`  Bearer   ${key}  `)).toBe(key);
    expect(bearerKey(null)).toBeNull();
    expect(bearerKey(undefined)).toBeNull();
    expect(bearerKey("")).toBeNull();
    expect(bearerKey(`Basic ${key}`)).toBeNull();
    expect(bearerKey("Bearer sk_live_nope")).toBeNull();
    expect(bearerKey(`Bearer ${key}extra`)).toBeNull();
  });
});

const tools: ToolDefinition[] = [
  {
    name: "echo",
    description: "Echo a slug.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Which offer." },
        limit: { type: "integer", description: "How many." },
        state: { type: "string", description: "Filter.", enum: ["a", "b"] },
      },
      required: ["slug"],
      additionalProperties: false,
    },
    run: async (args) => ({ got: args }),
  },
  {
    name: "teach",
    description: "Always a teaching error.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => {
      throw new ToolInputError("Call list_offers first.");
    },
  },
  {
    name: "boom",
    description: "Crashes.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => {
      throw new Error("db down: secret connection string");
    },
  },
  {
    name: "plain",
    description: "Returns text.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => "hello",
  },
];

const call = (method: string, params?: unknown, id: number | string = 1) =>
  handleMessage({ jsonrpc: "2.0", id, method, params }, tools);

describe("handleMessage", () => {
  it("initializes with the client's supported protocol, else the newest", async () => {
    expect(await call("initialize", { protocolVersion: "2025-03-26" })).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: "1.0.0" },
        instructions: INSTRUCTIONS,
      },
    });
    const unknown = await call("initialize", { protocolVersion: "1999-01-01" });
    expect(
      (unknown as { result: { protocolVersion: string } }).result.protocolVersion,
    ).toBe("2025-06-18");
    const none = await call("initialize");
    expect(
      (none as { result: { protocolVersion: string } }).result.protocolVersion,
    ).toBe("2025-06-18");
  });

  it("answers ping and never answers a notification", async () => {
    expect(await call("ping", undefined, "p")).toEqual({
      jsonrpc: "2.0",
      id: "p",
      result: {},
    });
    expect(
      await handleMessage(
        { jsonrpc: "2.0", method: "notifications/initialized" },
        tools,
      ),
    ).toBeNull();
  });

  it("lists tools as read-only with their schemas", async () => {
    const res = (await call("tools/list")) as {
      result: { tools: { name: string; annotations: unknown; inputSchema: unknown }[] };
    };
    expect(res.result.tools.map((t) => t.name)).toEqual([
      "echo",
      "teach",
      "boom",
      "plain",
    ]);
    expect(res.result.tools[0].annotations).toEqual({ readOnlyHint: true });
    expect(res.result.tools[0].inputSchema).toBe(tools[0].inputSchema);
  });

  it("calls a tool and returns its value as JSON text, or text as-is", async () => {
    expect(
      await call("tools/call", { name: "echo", arguments: { slug: "x", limit: 2 } }),
    ).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({ got: { slug: "x", limit: 2 } }, null, 2),
          },
        ],
      },
    });
    expect(await call("tools/call", { name: "plain" })).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { content: [{ type: "text", text: "hello" }] },
    });
  });

  it("turns bad arguments into teaching sentences, as a tool error", async () => {
    const res = (await call("tools/call", {
      name: "echo",
      arguments: { limit: 1.5, state: "c", other: true },
    })) as { result: { isError: boolean; content: { text: string }[] } };
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text.split("\n")).toEqual([
      '"slug" is required: Which offer.',
      '"limit" must be a whole number.',
      '"state" must be one of: a, b.',
      '"other" isn\'t an argument of this tool. It takes: slug, limit, state.',
    ]);
  });

  it("returns a ToolInputError verbatim but never leaks an internal error", async () => {
    const teach = (await call("tools/call", { name: "teach" })) as {
      result: { isError: boolean; content: { text: string }[] };
    };
    expect(teach.result).toEqual({
      content: [{ type: "text", text: "Call list_offers first." }],
      isError: true,
    });
    const boom = (await call("tools/call", { name: "boom" })) as {
      result: { content: { text: string }[] };
    };
    expect(boom.result.content[0].text).toBe(
      "GV OS couldn't read that just now. Try again in a moment.",
    );
    expect(JSON.stringify(boom)).not.toContain("secret");
  });

  it("refuses unknown tools, unknown methods, batches and malformed messages", async () => {
    expect(await call("tools/call", { name: "nope" })).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: RPC.invalidParams,
        message: 'There\'s no tool called "nope". Available: echo, teach, boom, plain.',
      },
    });
    expect(await call("tools/call", {})).toMatchObject({
      error: { code: RPC.invalidParams },
    });
    expect(await call("resources/list")).toMatchObject({
      error: { code: RPC.methodNotFound, message: 'Unknown method "resources/list".' },
    });
    expect(
      await handleMessage([{ jsonrpc: "2.0", id: 1, method: "ping" }], tools),
    ).toMatchObject({
      error: { code: RPC.invalidRequest },
    });
    for (const bad of [
      null,
      "ping",
      { id: 1, method: "ping" },
      { jsonrpc: "2.0", id: 1 },
    ]) {
      expect(await handleMessage(bad, tools)).toMatchObject({
        id: null,
        error: { code: RPC.invalidRequest },
      });
    }
  });

  it("treats non-object params as empty", async () => {
    expect(await call("tools/call", "echo")).toMatchObject({
      error: { code: RPC.invalidParams },
    });
  });
});

describe("checkArguments", () => {
  const schema = tools[0].inputSchema;
  it("accepts good arguments and an omitted object for a no-argument tool", () => {
    expect(
      checkArguments(schema, { slug: "x", limit: 3, state: "a", unused: undefined }),
    ).toEqual([
      '"unused" isn\'t an argument of this tool. It takes: slug, limit, state.',
    ]);
    expect(checkArguments(tools[1].inputSchema, undefined)).toEqual([]);
    expect(checkArguments(schema, { slug: "x", state: null })).toEqual([]);
  });

  it("rejects non-object arguments, text of the wrong type, and empty required values", () => {
    expect(checkArguments(schema, [1])).toEqual([
      'Arguments must be an object, like {"slug": "my-offer"}.',
    ]);
    expect(checkArguments(schema, { slug: 5 })).toEqual(['"slug" must be text.']);
    expect(checkArguments(schema, { slug: "" })).toEqual([
      '"slug" is required: Which offer.',
    ]);
    expect(checkArguments(tools[1].inputSchema, { x: 1 })).toEqual([
      '"x" isn\'t an argument of this tool. It takes: nothing.',
    ]);
  });
});
