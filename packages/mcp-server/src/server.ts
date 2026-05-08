/**
 * gigflow-mcp — MCP server using Streamable HTTP transport.
 *
 * The MCP TypeScript SDK ships a Streamable HTTP transport, but to keep the
 * Container Apps deployment simple we wrap the protocol in a thin Hono app.
 * The handlers below speak JSON-RPC 2.0 over HTTP with optional SSE.
 */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { z } from 'zod';
import { verifyEntraToken, AuthError, type McpAuthContext } from './auth/entra.js';
import { tools, buildToolContext } from './tools/index.js';
import { resources } from './resources/index.js';
import { prompts } from './prompts/index.js';
import { logger } from './lib/logger.js';
import { zodToJsonSchema } from './lib/zod-to-json-schema.js';

const app = new Hono();

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'gigflow-mcp', version: '0.1.0' };

type JsonRpcReq = {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcRes = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

function ok(id: JsonRpcReq['id'], result: unknown): JsonRpcRes {
  return { jsonrpc: '2.0', id: id ?? null, result };
}
function err(
  id: JsonRpcReq['id'],
  code: number,
  message: string,
  data?: unknown,
): JsonRpcRes {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message, data },
  };
}

app.get('/healthz', (c) => c.text('ok'));

app.post('/mcp', async (c) => {
  let auth: McpAuthContext;
  try {
    auth = await verifyEntraToken(c.req.header('authorization'));
  } catch (e) {
    if (e instanceof AuthError) {
      return c.json(
        err(null, -32001, e.code),
        e.status,
      );
    }
    return c.json(err(null, -32603, 'internal'), 500);
  }

  const body = (await c.req.json().catch(() => null)) as JsonRpcReq | null;
  if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return c.json(err(null, -32700, 'parse_error'), 400);
  }

  try {
    const res = await dispatch(body, auth);
    return c.json(res);
  } catch (e) {
    logger.error({ err: String(e), method: body.method }, 'mcp dispatch failed');
    return c.json(err(body.id ?? null, -32603, String(e)));
  }
});

async function dispatch(
  req: JsonRpcReq,
  auth: McpAuthContext,
): Promise<JsonRpcRes> {
  const { method, params, id } = req;
  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      serverInfo: SERVER_INFO,
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false },
        prompts: { listChanged: false },
      },
    });
  }
  if (method === 'tools/list') {
    return ok(id, {
      tools: Object.values(tools).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: zodToJsonSchema(t.inputSchema as z.ZodObject<z.ZodRawShape>),
      })),
    });
  }
  if (method === 'tools/call') {
    const name = String(params?.name ?? '');
    const args = (params?.arguments ?? {}) as Record<string, unknown>;
    const tool = tools[name];
    if (!tool) return err(id, -32601, `unknown_tool:${name}`);
    const parsed = tool.inputSchema.safeParse(args);
    if (!parsed.success) {
      return err(id, -32602, 'invalid_args', parsed.error.flatten());
    }
    const ctx = buildToolContext(auth);
    const start = Date.now();
    const data = await tool.execute(parsed.data, ctx);
    logger.info(
      {
        tool: name,
        tenantId: auth.tenantId,
        userId: auth.userId,
        latencyMs: Date.now() - start,
      },
      'mcp_tool_called',
    );
    return ok(id, {
      content: [
        { type: 'text', text: JSON.stringify(data, null, 2) },
      ],
      isError: false,
      structuredContent: data,
    });
  }
  if (method === 'resources/list') {
    // Static, template-based listing.
    return ok(id, {
      resources: resources.map((r) => ({
        uri: r.uriTemplate,
        name: r.uriTemplate,
        mimeType: r.uriTemplate.endsWith('journal/{yearMonth}')
          ? 'text/markdown'
          : 'application/json',
      })),
    });
  }
  if (method === 'resources/read') {
    const uri = String(params?.uri ?? '');
    for (const r of resources) {
      const match = r.match(uri);
      if (match) {
        const ctx = buildToolContext(auth);
        const out = await r.read(match, ctx);
        return ok(id, out);
      }
    }
    return err(id, -32602, `unknown_resource:${uri}`);
  }
  if (method === 'prompts/list') {
    return ok(id, {
      prompts: prompts.map((p) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments,
      })),
    });
  }
  if (method === 'prompts/get') {
    const name = String(params?.name ?? '');
    const args = (params?.arguments ?? {}) as Record<string, string>;
    const p = prompts.find((x) => x.name === name);
    if (!p) return err(id, -32601, `unknown_prompt:${name}`);
    return ok(id, { messages: p.build(args) });
  }
  if (method === 'ping') return ok(id, {});
  return err(id, -32601, `method_not_found:${method}`);
}

const port = Number(process.env.PORT ?? 3333);
serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ port: info.port }, 'gigflow-mcp listening');
});

export default app;
