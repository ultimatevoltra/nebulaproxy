const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readJson(name, fallback) {
  const p = filePath(name);
  try {
    if (!fs.existsSync(p)) {
      writeJson(name, fallback);
      return fallback;
    }
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[store] Failed to read ${name}.json:`, err.message);
    return fallback;
  }
}

function writeJson(name, data) {
  const p = filePath(name);
  const tmp = `${p}.tmp`;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, p);
  return data;
}

module.exports = { readJson, writeJson, DATA_DIR };
