import { expect } from "@std/expect";
import { CreateSessionInput, server } from "./todo_server.ts";

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

Deno.test("create_session", async () => {
  const result = await client.callTool({
    name: "create_session",
    arguments: {
      initial_tasks: [
        "Create a weather app",
        "Write tests for the app",
      ],
    } as CreateSessionInput,
  });
  const content = result.content as mcpOutputContent;
  expect(JSON.parse(content[0].text)).toEqual({
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
