// โหลดไฟล์ .gs ที่เป็น pure function เข้า context เดียวกัน (เหมือน global scope ของ Apps Script)
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FILES = ['Config.gs', 'Util.gs', 'Metrics.gs', 'DataHealth.gs', 'AiReview.gs', 'AiProvider.gs'];

module.exports = function load() {
  const ctx = vm.createContext({ console });
  for (const f of FILES) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  return ctx;
};
