import { readFile } from 'fs/promises';
import { homedir } from 'os';
import path from 'path';

const CLOUD_API_BASE = 'https://cloud.acquia.com/api';

// Reads ACLI credentials from ~/.acquia/cloud_api.conf
async function loadCredentials() {
  const confPath = path.join(homedir(), '.acquia', 'cloud_api.conf');
  const raw = await readFile(confPath, 'utf8');
  const conf = JSON.parse(raw);
  return { key: conf.key, secret: conf.secret };
}

// Gets a bearer token using OAuth client credentials
async function getBearerToken(key, secret) {
  const res = await fetch('https://accounts.acquia.com/api/auth/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: key,
      client_secret: secret,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auth failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  return data.access_token;
}

// Replaces {param} placeholders in path with actual values
function buildUrl(pathTemplate, args) {
  let url = CLOUD_API_BASE + '/v3' + pathTemplate;
  const queryParams = new URLSearchParams();
  const usedKeys = new Set();

  // Fill path params
  url = url.replace(/\{([^}]+)\}/g, (_, key) => {
    usedKeys.add(key);
    return encodeURIComponent(args[key] ?? '');
  });

  // Remaining args become query params (for GET) or body (for POST)
  for (const [key, value] of Object.entries(args || {})) {
    if (!usedKeys.has(key) && value !== undefined && value !== null) {
      queryParams.set(key, String(value));
    }
  }

  return { url, queryParams, usedKeys };
}

export async function runV3Tool(meta, inputArgs) {
  const { method, path: pathTemplate } = meta;

  let creds;
  try {
    creds = await loadCredentials();
  } catch {
    return 'Error: ACLI credentials not found. Run `acli auth:login` first.';
  }

  let token;
  try {
    token = await getBearerToken(creds.key, creds.secret);
  } catch (err) {
    return `Error getting auth token: ${err.message}`;
  }

  const { url, queryParams, usedKeys } = buildUrl(pathTemplate, inputArgs || {});
  const isWrite = ['post', 'put', 'patch', 'delete'].includes(method);

  // Collect body params (non-path, non-query for write methods)
  const bodyArgs = {};
  for (const [key, value] of Object.entries(inputArgs || {})) {
    if (!usedKeys.has(key)) bodyArgs[key] = value;
  }

  const finalUrl = isWrite ? url : `${url}?${queryParams.toString()}`;
  const fetchOpts = {
    method: method.toUpperCase(),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(isWrite ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(isWrite && Object.keys(bodyArgs).length > 0
      ? { body: JSON.stringify(bodyArgs) }
      : {}),
  };

  process.stderr.write(`Calling: ${method.toUpperCase()} ${finalUrl}\n`);

  try {
    const res = await fetch(finalUrl, fetchOpts);
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return text;
    }
    return JSON.stringify(parsed, null, 2);
  } catch (err) {
    return `Error calling v3 API: ${err.message}`;
  }
}
