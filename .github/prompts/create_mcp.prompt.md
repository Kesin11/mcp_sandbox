---
mode: 'agent'
description: "公式のガイドに従ってMCPサーバーを実装するときのドキュメントを与えるプロンプト"
---
Anthropicの公式ガイドに従ってMCPサーバーを実装してください。

## MCPの実装ガイド
ドキュメントはNode.jsのTypeScriptで書かれていますが、DenoのTypeScriptで実装してください。

- `fetch` を使用してドキュメントを取得する https://modelcontextprotocol.io/llms-full.txt
- `fetch` を使用してドキュメントを取得する https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/refs/heads/main/README.md

## テストコード
既存のテストコードを参考に実装したtoolに対応するテストコードを作成してください。
以下のようにClientとInmemoryTransportをインポートしてください。

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
```
