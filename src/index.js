#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { buildTools } from './tool-builder.js';
import { runV1Tool } from './acli-runner.js';
import { runV3Tool } from './api-runner.js';

process.stderr.write('acli-mcp: loading specs...\n');
const { tools } = await buildTools();
process.stderr.write(`acli-mcp: ${tools.length} tools loaded\n`);

// Index tools by name for fast lookup
const toolIndex = new Map(tools.map((t) => [t.name, t]));

const server = new Server(
  { name: 'acli-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// List all available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

// Execute a tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = toolIndex.get(name);

  if (!tool) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  let result;
  if (tool._meta.type === 'v1') {
    result = await runV1Tool(tool._meta, args);
  } else {
    result = await runV3Tool(tool._meta, args);
  }

  return {
    content: [{ type: 'text', text: result }],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
