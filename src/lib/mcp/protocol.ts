/**
 * THE GV OS MCP SERVER — protocol layer.
 *
 * A small, hand-rolled JSON-RPC 2.0 handler speaking the Model Context Protocol
 * over plain HTTP POST (the Streamable HTTP transport's request/response form;
 * no server-initiated stream). It knows four methods — initialize, ping,
 * tools/list, tools/call — and answers notifications with nothing.
 *
 * The design lesson taken from the reference product: the server ships no
 * prompts. Its tools are narrow and read-only, and when a call is wrong the
 * error is a sentence that teaches the caller's own Claude what to do next.
 *
 * Pure: tools are injected, so the whole protocol is testable without a
 * database or a network.
 */

export const SERVER_NAME = "gv-os";
export const SERVER_VERSION = "1.0.0";
export const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export const INSTRUCTIONS =
  "GV OS is Global Ventures' agency operating system. These tools are read-only. " +
  "Start with list_offers to get each offer's slug, then pass that slug to the " +
  "offer tools. Money is reported in dollars with two decimals; a null means " +
  "the value is unknown, never zero.";

export type JsonSchema = {
  type: "object";
  properties: Record<string, { type: string; description: string; enum?: string[] }>;
  required?: string[];
  additionalProperties: false;
};

export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  run: (args: Record<string, unknown>) => Promise<unknown>;
};

/** Thrown by a tool to return a teaching error instead of a stack trace. */
export class ToolInputError extends Error {}

type JsonRpcId = string | number | null;

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string } };

export const RPC = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

const fail = (id: JsonRpcId, code: number, message: string): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

const text = (value: unknown, isError = false): ToolResult => ({
  content: [
    {
      type: "text",
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
    },
  ],
  ...(isError ? { isError: true } : {}),
});

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Validate tool arguments against the tool's schema; a sentence per problem. */
export function checkArguments(schema: JsonSchema, args: unknown): string[] {
  if (args !== undefined && !isObject(args)) {
    return ['Arguments must be an object, like {"slug": "my-offer"}.'];
  }
  const given = (args ?? {}) as Record<string, unknown>;
  const problems: string[] = [];
  for (const key of schema.required ?? []) {
    if (given[key] === undefined || given[key] === null || given[key] === "") {
      problems.push(`"${key}" is required: ${schema.properties[key].description}`);
    }
  }
  for (const [key, value] of Object.entries(given)) {
    const prop = schema.properties[key];
    if (!prop) {
      problems.push(
        `"${key}" isn't an argument of this tool. It takes: ${Object.keys(schema.properties).join(", ") || "nothing"}.`,
      );
      continue;
    }
    if (value === undefined || value === null) continue;
    if (prop.type === "string" && typeof value !== "string") {
      problems.push(`"${key}" must be text.`);
    } else if (prop.type === "integer" && !Number.isInteger(value)) {
      problems.push(`"${key}" must be a whole number.`);
    } else if (prop.enum && !prop.enum.includes(String(value))) {
      problems.push(`"${key}" must be one of: ${prop.enum.join(", ")}.`);
    }
  }
  return problems;
}

/**
 * Handle one JSON-RPC message. Returns the response, or null for a
 * notification (a message with no id), which must not be answered.
 */
export async function handleMessage(
  message: unknown,
  tools: ToolDefinition[],
): Promise<JsonRpcResponse | null> {
  if (Array.isArray(message)) {
    return fail(
      null,
      RPC.invalidRequest,
      "Batched requests aren't supported. Send one request per POST.",
    );
  }
  if (
    !isObject(message) ||
    message.jsonrpc !== "2.0" ||
    typeof message.method !== "string"
  ) {
    return fail(null, RPC.invalidRequest, "Not a JSON-RPC 2.0 request.");
  }
  const isNotification = !("id" in message);
  const id = (message.id ?? null) as JsonRpcId;
  if (isNotification) return null;

  const params = isObject(message.params) ? message.params : {};

  switch (message.method) {
    case "initialize": {
      const requested =
        typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = (SUPPORTED_PROTOCOLS as readonly string[]).includes(
        requested,
      )
        ? requested
        : SUPPORTED_PROTOCOLS[0];
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          instructions: INSTRUCTIONS,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: { readOnlyHint: true },
          })),
        },
      };
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const tool = tools.find((t) => t.name === name);
      if (!tool) {
        return fail(
          id,
          RPC.invalidParams,
          `There's no tool called "${name}". Available: ${tools.map((t) => t.name).join(", ")}.`,
        );
      }
      const problems = checkArguments(tool.inputSchema, params.arguments);
      if (problems.length > 0) {
        return { jsonrpc: "2.0", id, result: text(problems.join("\n"), true) };
      }
      try {
        const value = await tool.run(
          (params.arguments ?? {}) as Record<string, unknown>,
        );
        return { jsonrpc: "2.0", id, result: text(value) };
      } catch (error) {
        if (error instanceof ToolInputError) {
          return { jsonrpc: "2.0", id, result: text(error.message, true) };
        }
        return {
          jsonrpc: "2.0",
          id,
          result: text(
            "GV OS couldn't read that just now. Try again in a moment.",
            true,
          ),
        };
      }
    }
    default:
      return fail(id, RPC.methodNotFound, `Unknown method "${message.method}".`);
  }
}
