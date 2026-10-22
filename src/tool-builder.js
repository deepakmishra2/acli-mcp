import { loadSpec } from './spec-loader.js';

// Resolves a $ref like "#/components/parameters/Foo" from the spec
function resolveRef(ref, spec) {
  if (!ref.startsWith('#/')) return null;
  const parts = ref.slice(2).split('/');
  let node = spec;
  for (const part of parts) {
    node = node?.[part];
    if (!node) return null;
  }
  return node;
}

function buildInputSchema(op, spec) {
  const properties = {};
  const required = [];
  const paramOrder = { path: [], query: [], body: [] };

  for (const raw of op.parameters || []) {
    const param = raw.$ref ? resolveRef(raw.$ref, spec) : raw;
    if (!param?.name) continue;

    const schema = param.schema || {};
    properties[param.name] = {
      type: schema.type || 'string',
      description: param.description || param.name,
      ...(schema.enum ? { enum: schema.enum } : {}),
    };

    if (param.required) required.push(param.name);
    (paramOrder[param.in] || paramOrder.query).push(param.name);
  }

  // Request body params
  const bodyContent =
    op.requestBody?.content?.['application/json'] ||
    op.requestBody?.content?.['application/hal+json'];
  const bodySchema = bodyContent?.schema;

  if (bodySchema?.properties) {
    for (const [key, prop] of Object.entries(bodySchema.properties)) {
      properties[key] = {
        type: prop.type || 'string',
        description: prop.description || key,
        ...(prop.enum ? { enum: prop.enum } : {}),
      };
      if (bodySchema.required?.includes(key)) required.push(key);
      paramOrder.body.push(key);
    }
  }

  return {
    schema: {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    },
    paramOrder,
  };
}

function v1Tool(op, path, method, spec) {
  const cliName = op['x-cli-name'];
  // MCP tool names: only alphanumeric + underscore
  const name = ('v1_' + cliName.replace(/[^a-z0-9]/gi, '_')).toLowerCase();
  const { schema, paramOrder } = buildInputSchema(op, spec);

  return {
    name,
    description: `[ACLI v1] ${op.summary || op.description || cliName}`,
    inputSchema: schema,
    _meta: { type: 'v1', cliName, method, path, paramOrder },
  };
}

function v3Tool(op, path, method, spec) {
  const name = ('v3_' + op.operationId.replace(/[^a-z0-9]/gi, '_')).toLowerCase();
  const { schema, paramOrder } = buildInputSchema(op, spec);

  return {
    name,
    description: `[Acquia v3 API] ${op.summary || op.description || op.operationId}`,
    inputSchema: schema,
    _meta: { type: 'v3', operationId: op.operationId, method, path, paramOrder },
  };
}

export async function buildTools() {
  const [v1Spec, v3Spec] = await Promise.all([loadSpec('v1'), loadSpec('v3')]);

  const tools = [];
  const seen = new Set();

  // v1 — commands with x-cli-name map 1:1 to ACLI commands
  for (const [path, item] of Object.entries(v1Spec.paths || {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const op = item[method];
      if (!op?.['x-cli-name']) continue;
      const tool = v1Tool(op, path, method, v1Spec);
      if (!seen.has(tool.name)) {
        seen.add(tool.name);
        tools.push(tool);
      }
    }
  }

  // v3 — direct API operations (no x-cli-name, use operationId)
  for (const [path, item] of Object.entries(v3Spec.paths || {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const op = item[method];
      if (!op?.operationId) continue;
      const tool = v3Tool(op, path, method, v3Spec);
      if (!seen.has(tool.name)) {
        seen.add(tool.name);
        tools.push(tool);
      }
    }
  }

  return { tools, v1Spec, v3Spec };
}
