import { expect } from "@std/expect";
import { server } from "./weather.ts";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

Deno.test("weather", async () => {
  const client = new Client(
    {
      name: "test client",
      version: "1.0",
    },
    {
      capabilities: {},
    }
  );
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  const result = await client.callTool({
    // What’s the weather in Sacramento?
    name: "get-forecast",
    arguments: {
      "latitude": 38.5816,
      "longitude": -121.4944
    },
  });
  expect(result).toEqual({
    content: expect.anything(),
  });
});
