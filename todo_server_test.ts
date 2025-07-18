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

Deno.test("get_tasks", async () => {
  const createResult = await createSession(client);
  const sessionId =
    extractContent<CreateSessionOutput>(createResult).session_id;

  const result = await client.callTool({
    name: "get_tasks",
    arguments: {
      session_id: sessionId,
    },
  });

  expect(extractContent(result)).toEqual({
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

Deno.test("create_session with empty initial_tasks should throw error", async () => {
  const result = await client.callTool({
    name: "create_session",
    arguments: {
      initial_tasks: [],
    } as CreateSessionInput,
  });

  // In case of MCP error, isError: true is returned
  expect((result as { isError: boolean }).isError).toBe(true);
  expect((result as { content: mcpOutputContent }).content[0].text).toContain(
    "initial_tasks must not be empty",
  );
});

Deno.test("update_tasks", async () => {
  const createResult = await createSession(client);
  const sessionId =
    extractContent<CreateSessionOutput>(createResult).session_id;
  const tasks = extractContent<CreateSessionOutput>(createResult).tasks;

  // Update both tasks
  const updatedTasks = [
    {
      ...tasks[0],
      status: "completed" as const,
    },
    {
      ...tasks[1],
      description: "Write more tests for the app",
    },
  ];

  const result = await client.callTool({
    name: "update_tasks",
    arguments: {
      session_id: sessionId,
      tasks: updatedTasks,
    },
  });

  expect(extractContent(result)).toEqual({
    tasks: [
      {
        id: tasks[0].id,
        description: "Create a weather app",
        status: "completed",
      },
      {
        id: tasks[1].id,
        description: "Write more tests for the app",
        status: "pending",
      },
    ],
  });
});

Deno.test("update_tasks with adding new task", async () => {
  const createResult = await createSession(client);
  const sessionId =
    extractContent<CreateSessionOutput>(createResult).session_id;
  const tasks = extractContent<CreateSessionOutput>(createResult).tasks;

  const newTasks = [
    ...tasks,
    {
      id: "3",
      description: "Deploy the app",
      status: "pending" as const,
    },
  ];

  const result = await client.callTool({
    name: "update_tasks",
    arguments: {
      session_id: sessionId,
      tasks: newTasks,
    },
  });

  expect(extractContent(result)).toEqual({
    tasks: [
      {
        id: tasks[0].id,
        description: "Create a weather app",
        status: "pending",
      },
      {
        id: tasks[1].id,
        description: "Write tests for the app",
        status: "pending",
      },
      {
        id: "3",
        description: "Deploy the app",
        status: "pending",
      },
    ],
  });
});
