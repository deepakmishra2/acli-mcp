import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Builds the ACLI argument list from a tool call.
// v1 ACLI convention:
//   - path params → positional args (in order they appear in the URL path)
//   - query/body params → --key=value flags
export function buildAcliArgs(meta, inputArgs) {
  const { cliName, paramOrder, path } = meta;

  // Extract path param names in the order they appear in the URL
  const pathParamNames = (path.match(/\{([^}]+)\}/g) || []).map(s => s.slice(1, -1));

  const positional = [];
  const flags = [];

  for (const [key, value] of Object.entries(inputArgs || {})) {
    if (value === undefined || value === null || value === '') continue;

    if (pathParamNames.includes(key)) {
      // Place positional args in path order
      const idx = pathParamNames.indexOf(key);
      positional[idx] = String(value);
    } else {
      flags.push(`--${key}=${value}`);
    }
  }

  return ['api:' + cliName, ...positional.filter(Boolean), ...flags, '--no-interaction'];
}

export async function runV1Tool(meta, inputArgs) {
  const args = buildAcliArgs(meta, inputArgs);

  process.stderr.write(`Running: acli ${args.join(' ')}\n`);

  try {
    const { stdout, stderr } = await execFileAsync('acli', args, {
      timeout: 30_000,
      env: { ...process.env },
    });
    return stdout || stderr || '(no output)';
  } catch (err) {
    const msg = err.stderr || err.stdout || err.message;
    return `Error running acli ${args[0]}:\n${msg}`;
  }
}
