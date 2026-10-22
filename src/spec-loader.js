import { readFile, writeFile, access } from 'fs/promises';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', 'cache');

const SPECS = {
  v1: {
    file: 'acquia-spec.json',
    url: 'https://raw.githubusercontent.com/acquia/cli/main/assets/acquia-spec.json',
  },
  v3: {
    file: 'acquia-v3-spec.json',
    url: 'https://raw.githubusercontent.com/acquia/cli/main/assets/acquia-v3-spec.json',
  },
};

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadSpec(name) {
  const spec = SPECS[name];
  const dest = path.join(CACHE_DIR, spec.file);

  if (await fileExists(dest)) {
    return dest;
  }

  process.stderr.write(`Downloading ${spec.file}...\n`);
  const res = await fetch(spec.url);
  if (!res.ok) throw new Error(`Failed to download ${spec.file}: ${res.status}`);

  const data = await res.text();
  await writeFile(dest, data, 'utf8');
  process.stderr.write(`Cached ${spec.file}\n`);
  return dest;
}

export async function loadSpec(name) {
  const filePath = await downloadSpec(name);
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}
