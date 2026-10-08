/**
 * Util — ฟังก์ชันกลางที่เป็น pure JS (ไม่เรียก service ของ Google) จึงทดสอบด้วย Node ได้
 */

var BKK_OFFSET_MS = 7 * 3600 * 1000; // Asia/Bangkok ไม่มี DST

/** แปลงวันที่ (ISO string / Date) เป็นเลขวันตามเวลาไทย; ว่าง → null */
function dayNum_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var t = v instanceof Date ? v.getTime() : Date.parse(v);
  if (isNaN(t)) return null;
  return Math.floor((t + BKK_OFFSET_MS) / 86400000);
}

/** เลขวัน → 'YYYY-MM-DD' */
function dayStr_(d) {
  if (d === null || d === undefined) return '';
  return new Date(d * 86400000).toISOString().slice(0, 10);
}

/** วันจันทร์ของสัปดาห์ (เลขวัน) — 1970-01-01 เป็นวันพฤหัส */
function weekStart_(d) {
  return d - ((d + 3) % 7);
}

function isBlank_(v) {
  return v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function lower_(v) {
  return String(v || '').trim().toLowerCase();
}

function countBy_(arr, fn) {
  var out = {};
  arr.forEach(function (x) {
    var k = fn(x);
    if (isBlank_(k)) k = '(ว่าง)';
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

function avg_(nums) {
  var xs = nums.filter(function (n) { return typeof n === 'number' && !isNaN(n); });
  if (!xs.length) return null;
  return Math.round(xs.reduce(function (a, b) { return a + b; }, 0) / xs.length * 10) / 10;
}

function round2_(n) {
  return Math.round(n * 100) / 100;
}

/** FNV-1a 32-bit — ใช้ทำ fingerprint สำหรับแคชผล AI */
function fnv1a_(str) {
  var h = 0x811c9dc5;
  str = String(str);
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

/** ลำดับขั้นของ Activity_Type ใน funnel */
var STAGE_RANK = { 'CONTACT VENDOR': 1, 'FOLLOW_UP': 1, 'OTHER': 0, 'NEGOTIATION': 2, 'CLOSED': 3 };
var STAGE_LABEL = { 0: 'ยังไม่เริ่ม', 1: 'ติดต่อ/ขอราคา', 2: 'เจรจาต่อรอง', 3: 'สรุปผลแล้ว' };
