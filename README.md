# acli-mcp

An [MCP](https://modelcontextprotocol.io) server that exposes the **Acquia Cloud Platform** API as AI-callable tools. Point an MCP client (Claude Code, Claude Desktop, etc.) at it and you can manage Acquia applications, environments, databases, domains, and more through natural language.

## What it does

On startup the server downloads two official Acquia OpenAPI specs and generates one MCP tool per operation — nearly 500 tools in total (~340 v1 + ~160 v3), grouped into two families:

- **`v1_*` tools** — the classic Cloud API, run through your local [`acli`](https://github.com/acquia/cli) binary (`acli api:<command>`). These map 1:1 to ACLI's `api:*` commands.
- **`v3_*` tools** — the newer Cloud API v3, called directly over HTTPS against `https://cloud.acquia.com/api/v3`, authenticated with your Acquia OAuth credentials.

The tool list is generated from the specs at runtime, so it stays in sync with Acquia's API without code changes. Specs are cached under `cache/` after the first download.

### Capabilities at a glance

Because tools are generated from the full API surface, coverage is broad. Common things you can do:

- **Applications** — list apps, view details, rename, manage tags
- **Environments** — list/inspect environments, deploy code, switch branches, copy databases and files between environments, manage variables and domains
- **Databases** — list databases, create/restore backups, copy across environments
- **Domains & SSL** — add/remove domains, clear caches, manage certificates
- **Code & deployments** — deploy artifacts, switch code refs, track deployment status
- **Subscriptions & organizations** — list subscriptions, members, teams, permissions
- **Logs & monitoring** — download log snapshots, stream logs, read metrics
- **Codebases & sites (v3)** — manage codebases, sites, site instances, launch groups, failover groups
- **Security (v3)** — IP rules, rate-limiting rules, custom WAF rules, SSO/identity providers

## Architecture

```
src/
  index.js         MCP server — wires the transport, lists tools, dispatches calls
  spec-loader.js   Downloads + caches the v1 and v3 OpenAPI specs
  tool-builder.js  Turns each spec operation into an MCP tool + JSON input schema
  acli-runner.js   Executes v1 tools via the local `acli` binary
  api-runner.js    Executes v3 tools via direct authenticated HTTPS calls
```

- **v1 execution**: path parameters become positional args, everything else becomes `--key=value` flags, and the command runs as `acli api:<name> ... --no-interaction`.
- **v3 execution**: path params fill `{placeholders}` in the URL, remaining params become query string (GET) or JSON body (write methods). Auth uses an OAuth client-credentials token minted from your stored key/secret.

## Requirements

- **Node.js** 18+ (uses the built-in `fetch`)
- **[Acquia CLI (`acli`)](https://docs.acquia.com/acquia-cli)** on your `PATH` — required for `v1_*` tools
- **Acquia Cloud API credentials** — needed for `v3_*` tools (and for `acli` itself)

Authenticate once with:

```bash
acli auth:login
```

This writes your key/secret to `~/.acquia/cloud_api.conf`, which the server reads to obtain OAuth tokens. No credentials are stored in this repo.

## Installation

```bash
git clone git@github.com:deepakmishra2/acli-mcp.git
cd acli-mcp
npm install
```

## Usage

The server speaks MCP over stdio. Run it directly to confirm it loads:

```bash
npm start
# acli-mcp: loading specs...
# acli-mcp: 496 tools loaded
```

(The first run downloads the specs; subsequent runs use the `cache/`.)

### Register with Claude Code

```bash
claude mcp add acli -- node /absolute/path/to/acli-mcp/src/index.js
```

### Register with Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "acli": {
      "command": "node",
      "args": ["/absolute/path/to/acli-mcp/src/index.js"]
    }
  }
}
```

Restart the client and the Acquia tools become available.

## Examples

Once connected, you can ask your MCP client things like:

> **"List all my Acquia applications."**
> → calls `v1_applications_list`

> **"Show me the environments for application `a47ac10b-...`."**
> → calls `v1_applications_environment_list`

> **"Create a database backup of `my_db` on the prod environment."**
> → calls `v1_environments_database_backup_create`

> **"Copy the database from the staging environment to dev."**
> → calls `v1_environments_database_copy`

> **"Deploy the `release-2.1` tag to the production environment."**
> → calls `v1_environments_code_switch` / `v1_environments_code_deploy`

> **"Add the domain `www.example.com` to this environment and clear its cache."**
> → calls `v1_environments_domain_create`, then `v1_environments_domain_clear_caches`

> **"List the codebases in my subscription."** (v3)
> → calls `v3_getcodebasesbysubscriptionid`

> **"Create an IP block rule for 203.0.113.0/24 on this subscription."** (v3)
> → calls `v3_createiprulebysubscriptionuuid`

The model picks the right tool and fills in parameters from your request; you only need the relevant IDs (application UUID, environment ID, etc.), which you can also discover by asking it to list them first.

## Documentation & help

Every tool here is a thin wrapper over an official Acquia command or API operation. If you're ever unsure what a command does, what a parameter means, or which IDs it expects, go straight to Acquia's own docs:

- **[Acquia Cloud API documentation](https://cloudapi-docs.acquia.com/)** — the full reference for every API endpoint, including request parameters, bodies, and responses. Best for understanding what any `v1_*` or `v3_*` tool actually calls.
- **[Acquia CLI (`acli`) documentation](https://docs.acquia.com/acquia-cli)** — overview and usage of the `acli` binary that backs the `v1_*` tools. It also links to the full list of `acli` commands.

To match a tool back to its Acquia docs: drop the `v1_`/`v3_` prefix and look up the underlying command (`v1_environments_database_copy` → the `api:environments:database-copy` command / the "copy database" endpoint). You can also ask your MCP client to describe a tool — the description and parameter list are pulled directly from the Acquia spec.

## How tool names are formed

- v1: `v1_` + the ACLI command name with non-alphanumerics replaced by `_` (e.g. `applications:environment:list` → `v1_applications_environment_list`).
- v3: `v3_` + the spec's `operationId`, lowercased (e.g. `getCodebasesBySubscriptionId` → `v3_getcodebasesbysubscriptionid`).

## Notes

- `v1_*` tools shell out to `acli`; if it isn't installed or on `PATH`, those calls return a clear error while `v3_*` tools keep working.
- v1 commands time out after 30 seconds.
- Specs are cached indefinitely once downloaded — delete `cache/*.json` to force a refresh against the latest Acquia API.
