import { expect } from "@std/expect";
import {
  CreateSessionInput,
  CreateSessionOutput,
  server,
} from "./todo_server.ts";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const client = new Client(
  {
    name: "test client",
    version: "1.0",
  },
  {
    capabilities: {},
  },
);
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await Promise.all([
  client.connect(clientTransport),
  server.connect(serverTransport),
]);
type mcpOutputContent = { type: string; text: string }[];

async function createSession(client: Client) {
  const result = await client.callTool({
    name: "create_session",
    arguments: {
      initial_tasks: [
        "Create a weather app",
        "Write tests for the app",
      ],
    } as CreateSessionInput,
  });
  return result;
}

function extractContent<T>(
  result: unknown,
): T {
  return JSON.parse(
    (result as { content: mcpOutputContent }).content[0].text,
  ) as T;
}

Deno.test("create_session", async () => {
  const result = await createSession(client);
  expect(extractContent(result)).toEqual({
    session_id: expect.any(String),
    tasks: [
      {
        id: expect.any(String),
        description: "Create a weather app",
        status: "pending",
      },
      {
        id: expect.any(String),
        description: "Write tests for the app",
        status: "pending",
      },
    ],
  });
});

Deno.test("update_task_status", async () => {
  const createResult = await createSession(client);
  const sessionId =
    extractContent<CreateSessionOutput>(createResult).session_id;
  const taskId = extractContent<CreateSessionOutput>(createResult).tasks[0].id;
  const result = await client.callTool({
    name: "update_task_status",
    arguments: {
      session_id: sessionId,
      task_id: taskId,
      status: "completed",
    },
  });

  expect(extractContent(result)).toEqual({
    updated_task: {
      id: taskId,
      description: "Create a weather app",
      status: "completed",
    },
    tasks: [
      {
        id: expect.any(String),
        description: "Create a weather app",
        status: "completed",
      },
      {
        id: expect.any(String),
        description: "Write tests for the app",
        status: "pending",
      },
    ],
  });
});
