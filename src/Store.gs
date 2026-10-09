/**
 * Store — อ่าน/เขียน Spreadsheet แยก "Activity Dashboard — AI Store"
 * เป็นที่เดียวในระบบที่มีการเขียนข้อมูล และจะปฏิเสธถ้า STORE_ID เป็นไฟล์เดียวกับ DB
 */

var STORE_SHEETS = {
  AI_Reviews: ['Activity_ID', 'Activity_Version', 'Hash', 'Provider', 'Model', 'Score', 'Grade',
    'Criteria_JSON', 'Missing', 'Suggestion', 'Improved_Example', 'Type_Mismatch', 'Suggested_Type',
    'Extracted_JSON', 'Tokens_In', 'Tokens_Out', 'Reviewed_At'],
  AI_Runs: ['Started_At', 'Finished_At', 'Provider', 'Model', 'Pending', 'Reviewed', 'Errors', 'Message',
    'Cases_Pending', 'Cases_Reviewed'],
  Settings: ['Key', 'Value', 'Description'],
  Criteria: ['Method', 'Activity_Type', 'Criteria', 'Is_Active', 'Note'],
  Case_Reviews: ['Case_ID', 'Hash', 'Activity_Count', 'Provider', 'Model', 'Score', 'Grade', 'Summary',
    'Criteria_JSON', 'Missing_Steps', 'Inconsistencies', 'Ready_To_Close', 'Next_Step', 'Risk',
    'Savings_JSON', 'Tokens_In', 'Tokens_Out', 'Reviewed_At'],
  Holidays: ['Date', 'Name', 'Note']
};

/** วันหยุดตั้งต้น (ปี 2026) — HEAD ควรตรวจ/แก้ให้ตรงกับประกาศวันหยุดของบริษัท และเพิ่มปีถัดไปเอง */
function holidaySeed_() {
  var note = 'ตรวจกับประกาศวันหยุดบริษัท — เพิ่ม/ลบแถวได้ (รูปแบบวันที่ YYYY-MM-DD)';
  return [
    ['2026-01-01', 'วันขึ้นปีใหม่'], ['2026-03-03', 'วันมาฆบูชา'], ['2026-04-06', 'วันจักรี'],
    ['2026-04-13', 'วันสงกรานต์'], ['2026-04-14', 'วันสงกรานต์'], ['2026-04-15', 'วันสงกรานต์'],
    ['2026-05-01', 'วันแรงงานแห่งชาติ'], ['2026-05-04', 'วันฉัตรมงคล'], ['2026-06-01', 'ชดเชยวันวิสาขบูชา (31 พ.ค.)'],
    ['2026-06-03', 'วันเฉลิมพระชนมพรรษาพระราชินี'], ['2026-07-28', 'วันเฉลิมพระชนมพรรษา ร.10'], ['2026-07-29', 'วันอาสาฬหบูชา'],
    ['2026-08-12', 'วันแม่แห่งชาติ'], ['2026-10-13', 'วันนวมินทรมหาราช'], ['2026-10-23', 'วันปิยมหาราช'],
    ['2026-12-07', 'ชดเชยวันพ่อแห่งชาติ (5 ธ.ค.)'], ['2026-12-10', 'วันรัฐธรรมนูญ'], ['2026-12-31', 'วันสิ้นปี']
  ].map(function (r) { return [r[0], r[1], note]; });
}

/** เกณฑ์ตั้งต้นของงาน SPECIAL (เลือก Vendor รายเดียว ไม่ต้องมีคู่เทียบ) — 1 เกณฑ์ต่อบรรทัด */
function criteriaSeed_() {
  var note = 'SPECIAL ไม่ต้องมีคู่เทียบ — แก้ได้ (1 เกณฑ์ต่อบรรทัด) ลบแถว/ตั้ง Is_Active=FALSE เพื่อกลับไปใช้ hint ใน DB';
  return [
    ['SPECIAL', 'CONTACT VENDOR', [
      'ชื่อ Vendor ที่ติดต่อ',
      'เรื่องที่ติดต่อ',
      'เหตุผลที่ใช้ Vendor รายเดียว (ผู้ให้บริการรายเดียว / ต่อสัญญาเดิม / งานเร่งด่วน / ผู้ขอระบุ)',
      'Vendor ตอบว่าอย่างไร',
      'ขั้นตอนต่อไป'
    ].join('\n'), true, note],
    ['SPECIAL', 'NEGOTIATION', [
      'ชื่อ Vendor ที่ติดต่อ',
      'ราคาตั้งต้น vs ราคาที่ต่อรองได้',
      'ราคาอ้างอิงที่ใช้เทียบ (ราคาเดิม / PO เก่า / ราคาประมาณการ / historical price)',
      'Vendor ยอมอะไรเพิ่ม (เครดิตเทอม/ของแถม/ส่วนลด)',
      'ขั้นตอนต่อไป'
    ].join('\n'), true, note],
    ['SPECIAL', 'CLOSED', [
      'Vendor ที่เลือก และเหตุผลที่ใช้ Vendor รายเดียว',
      'ราคาอ้างอิงที่ยืนยันว่าราคาเหมาะสม (ราคาเดิม / PO เก่า / ราคาประมาณการ / historical price)',
      'ราคาสุดท้ายที่ปิด',
      'ส่วนต่างจาก Budget / ราคาอ้างอิง (Savings)'
    ].join('\n'), true, note],
    ['NORMAL', 'CASE', CASE_DEFAULT_CRITERIA.NORMAL.join('\n'), true, 'เกณฑ์ AI ตรวจทั้ง Case (จัดซื้อปกติ)'],
    ['SPECIAL', 'CASE', CASE_DEFAULT_CRITERIA.SPECIAL.join('\n'), true, 'เกณฑ์ AI ตรวจทั้ง Case (กรณีพิเศษ)']
  ];
}

function settingsSeed_() {
  return [
    ['AI_PROVIDER', DEFAULTS.AI_PROVIDER, 'openai | gemini | claude (ต้องตั้ง API key ใน Script Properties ด้วย)'],
    ['AI_MODEL', '', 'ว่าง = ใช้ค่าเริ่มต้นของ provider'],
    ['AI_EFFORT', DEFAULTS.AI_EFFORT, 'Claude เท่านั้น: low | medium | high'],
    ['STALE_DAYS', DEFAULTS.STALE_DAYS, 'Case ที่ไม่มี Activity เกินกี่วันถือว่านิ่ง'],
    ['SCORE_THRESHOLD', DEFAULTS.SCORE_THRESHOLD, 'คะแนน AI ต่ำกว่านี้ = ต้องปรับปรุง'],
    ['MIN_QUOTES', DEFAULTS.MIN_QUOTES, 'จำนวน vendor ขั้นต่ำที่ควรเทียบราคา (Method NORMAL)'],
    ['SHORT_DESC_CHARS', DEFAULTS.SHORT_DESC_CHARS, 'คำอธิบายสั้นกว่านี้ถือว่าสั้นเกินไป'],
    ['BATCH_SIZE', DEFAULTS.BATCH_SIZE, 'จำนวน Activity ที่ AI ตรวจต่อรอบ'],
    ['CASE_BATCH_SIZE', DEFAULTS.CASE_BATCH_SIZE, 'จำนวน Case ที่ AI ตรวจทั้ง Case ต่อรอบ']
  ];
}

var Store = (function () {
  var settingsMemo = null;

  function assertSafe_(storeId, dbId) {
    if (!storeId) throw new Error('ยังไม่ได้ตั้งค่า STORE_ID — รันฟังก์ชัน setup() ก่อน');
    if (storeId === dbId) throw new Error('STORE_ID ต้องไม่ใช่ไฟล์ DB — ระบบปฏิเสธการเขียน');
  }

  function open_() {
    var cfg = getConfig_();
    assertSafe_(cfg.STORE_ID, cfg.DB_ID);
    return SpreadsheetApp.openById(cfg.STORE_ID);
  }

  /** คืนชีต — ถ้าเป็นชีตที่ระบบรู้จักแต่ยังไม่มี (deployment เก่า) จะสร้างให้ และเติมหัวคอลัมน์ใหม่ที่ขาด */
  function sheet_(name) {
    var ss = open_();
    var sh = ss.getSheetByName(name);
    var h = STORE_SHEETS[name];
    if (!sh) {
      if (!h) throw new Error('AI Store ไม่มีชีต ' + name + ' — รัน setup() อีกครั้ง');
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
      sh.setFrozenRows(1);
    } else if (h && sh.getLastColumn() < h.length) {
      sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
    }
    return sh;
  }

  function readSettings(storeId, dbId) {
    if (settingsMemo) return settingsMemo;
    var cache = CacheService.getScriptCache();
    var hit = cache.get('store:settings');
    if (hit) return (settingsMemo = JSON.parse(hit));
    assertSafe_(storeId, dbId);
    var sh = SpreadsheetApp.openById(storeId).getSheetByName('Settings');
    var map = {};
    if (sh && sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
        if (r[0] !== '') map[String(r[0]).trim()] = r[1];
      });
    }
    cache.put('store:settings', JSON.stringify(map), 60);
    return (settingsMemo = map);
  }

  function writeSettings(obj) {
    var sh = sheet_('Settings');
    var last = sh.getLastRow();
    var keys = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
    Object.keys(obj).forEach(function (k) {
      if (EDITABLE_SETTINGS.indexOf(k) < 0) return;
      var idx = keys.indexOf(k);
      if (idx >= 0) sh.getRange(idx + 2, 2).setValue(obj[k]);
      else { sh.appendRow([k, obj[k], '']); keys.push(k); }
    });
    settingsMemo = null;
    configMemo_ = null;
    CacheService.getScriptCache().remove('store:settings');
  }

  function parseJson_(s, dflt) {
    try { return s ? JSON.parse(s) : dflt; } catch (e) { return dflt; }
  }

  /** → { Activity_ID: review } */
  function readReviews() {
    var sh = sheet_('AI_Reviews');
    var last = sh.getLastRow();
    var out = {};
    if (last < 2) return out;
    var h = STORE_SHEETS.AI_Reviews;
    sh.getRange(2, 1, last - 1, h.length).getValues().forEach(function (r) {
      if (!r[0]) return;
      var o = {};
      h.forEach(function (k, i) { o[k] = r[i]; });
      out[o.Activity_ID] = {
        activity_id: o.Activity_ID,
        activity_version: o.Activity_Version,
        hash: String(o.Hash),
        provider: o.Provider,
        model: o.Model,
        score: Number(o.Score),
        grade: o.Grade,
        criteria: parseJson_(o.Criteria_JSON, []),
        missing: o.Missing ? String(o.Missing).split('\n') : [],
        suggestion: o.Suggestion,
        improved_example: o.Improved_Example,
        type_mismatch: o.Type_Mismatch === true,
        suggested_type: o.Suggested_Type,
        extracted: parseJson_(o.Extracted_JSON, null),
        reviewed_at: o.Reviewed_At instanceof Date ? o.Reviewed_At.toISOString() : String(o.Reviewed_At)
      };
    });
    return out;
  }

  function toRow_(rv) {
    return [rv.activity_id, rv.activity_version, rv.hash, rv.provider, rv.model, rv.score, rv.grade,
      JSON.stringify(rv.criteria), (rv.missing || []).join('\n'), rv.suggestion, rv.improved_example,
      rv.type_mismatch, rv.suggested_type, JSON.stringify(rv.extracted), rv.tokens_in, rv.tokens_out, rv.reviewed_at];
  }

  /** upsert ตามคีย์ในคอลัมน์ A */
  function upsertRows_(sheetName, rows) {
    if (!rows.length) return;
    var sh = sheet_(sheetName);
    var width = STORE_SHEETS[sheetName].length;
    var last = sh.getLastRow();
    var ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
    var appends = [];
    rows.forEach(function (row) {
      var idx = ids.indexOf(String(row[0]));
      if (idx >= 0) sh.getRange(idx + 2, 1, 1, width).setValues([row]);
      else appends.push(row);
    });
    if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, width).setValues(appends);
  }

  function upsertReviews(list) {
    upsertRows_('AI_Reviews', list.map(toRow_));
  }

  function toCaseRow_(rv) {
    return [rv.case_id, rv.hash, rv.activity_count, rv.provider, rv.model, rv.score, rv.grade, rv.summary,
      JSON.stringify(rv.criteria), (rv.missing_steps || []).join('\n'), (rv.inconsistencies || []).join('\n'),
      rv.ready_to_close, rv.next_step, rv.risk, JSON.stringify(rv.savings), rv.tokens_in, rv.tokens_out, rv.reviewed_at];
  }

  function upsertCaseReviews(list) {
    upsertRows_('Case_Reviews', list.map(toCaseRow_));
  }

  /** → { Case_ID: caseReview } */
  function readCaseReviews() {
    var sh = sheet_('Case_Reviews');
    var last = sh.getLastRow();
    var out = {};
    if (last < 2) return out;
    var h = STORE_SHEETS.Case_Reviews;
    function lines(v) { return v ? String(v).split('\n').filter(function (x) { return x.trim(); }) : []; }
    sh.getRange(2, 1, last - 1, h.length).getValues().forEach(function (r) {
      if (!r[0]) return;
      var o = {};
      h.forEach(function (k, i) { o[k] = r[i]; });
      out[o.Case_ID] = {
        case_id: o.Case_ID,
        hash: String(o.Hash),
        activity_count: Number(o.Activity_Count),
        provider: o.Provider,
        model: o.Model,
        score: Number(o.Score),
        grade: o.Grade,
        summary: String(o.Summary || ''),
        criteria: parseJson_(o.Criteria_JSON, []),
        missing_steps: lines(o.Missing_Steps),
        inconsistencies: lines(o.Inconsistencies),
        ready_to_close: o.Ready_To_Close === true,
        next_step: String(o.Next_Step || ''),
        risk: String(o.Risk || ''),
        savings: parseJson_(o.Savings_JSON, null),
        reviewed_at: o.Reviewed_At instanceof Date ? o.Reviewed_At.toISOString() : String(o.Reviewed_At)
      };
    });
    return out;
  }

  function logRun(run) {
    sheet_('AI_Runs').appendRow([run.started_at, run.finished_at, run.provider || '', run.model || '',
      run.pending, run.reviewed, run.errors, run.message || '', run.cases_pending || 0, run.cases_reviewed || 0]);
  }

  function ensureCriteriaSheet_(ss) {
    var sh = ss.getSheetByName('Criteria');
    if (sh) return sh;
    sh = ss.insertSheet('Criteria');
    var h = STORE_SHEETS.Criteria;
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
    sh.setFrozenRows(1);
    var seed = criteriaSeed_();
    sh.getRange(2, 1, seed.length, h.length).setValues(seed);
    sh.getRange(2, 3, seed.length, 1).setWrap(true);
    return sh;
  }

  function ensureHolidaySheet_(ss) {
    var sh = ss.getSheetByName('Holidays');
    if (sh) return sh;
    sh = ss.insertSheet('Holidays');
    var h = STORE_SHEETS.Holidays, seed = holidaySeed_();
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, seed.length, 1).setNumberFormat('@'); // เก็บเป็นข้อความ YYYY-MM-DD
    sh.getRange(2, 1, seed.length, h.length).setValues(seed);
    return sh;
  }

  /** ชีต Holidays → { 'YYYY-MM-DD': 'ชื่อวันหยุด' } (สร้างชีต + seed ให้ถ้ายังไม่มี) */
  function readHolidays() {
    var cache = CacheService.getScriptCache();
    var hit = cache.get('store:holidays');
    if (hit) return JSON.parse(hit);
    var sh = ensureHolidaySheet_(open_());
    var map = {}, last = sh.getLastRow();
    if (last > 1) {
      sh.getRange(2, 1, last - 1, 2).getValues().forEach(function (r) {
        var d = r[0] instanceof Date ? Utilities.formatDate(r[0], 'Asia/Bangkok', 'yyyy-MM-dd') : String(r[0]).trim().slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) map[d] = String(r[1] || 'วันหยุด');
      });
    }
    cache.put('store:holidays', JSON.stringify(map), 60);
    return map;
  }

  /** ชีต Criteria → { 'SPECIAL|CLOSED': ['เกณฑ์1', ...] } (สร้างชีต + seed ให้ถ้ายังไม่มี) */
  function readCriteria() {
    var cache = CacheService.getScriptCache();
    var hit = cache.get('store:criteria');
    if (hit) return JSON.parse(hit);
    var sh = ensureCriteriaSheet_(open_());
    var map = {};
    var last = sh.getLastRow();
    if (last > 1) {
      sh.getRange(2, 1, last - 1, 4).getValues().forEach(function (r) {
        var method = String(r[0]).trim().toUpperCase(), type = String(r[1]).trim().toUpperCase();
        if (!method || !type || r[3] === false || String(r[3]).toUpperCase() === 'FALSE') return;
        var list = splitCriteriaCell_(r[2]);
        if (list.length) map[method + '|' + type] = list;
      });
    }
    cache.put('store:criteria', JSON.stringify(map), 60);
    return map;
  }

  function readRuns(limit) {
    var sh = sheet_('AI_Runs');
    var last = sh.getLastRow();
    if (last < 2) return [];
    var n = Math.min(limit || 10, last - 1);
    return sh.getRange(last - n + 1, 1, n, STORE_SHEETS.AI_Runs.length).getValues().reverse().map(function (r) {
      return { started: String(r[0]), finished: String(r[1]), provider: r[2], model: r[3], pending: r[4], reviewed: r[5],
        errors: r[6], message: r[7], casesPending: r[8], casesReviewed: r[9] };
    });
  }

  /** สร้างไฟล์และชีตที่จำเป็น (เรียกจาก setup) */
  function ensure(storeId, dbId) {
    var ss;
    if (storeId) {
      assertSafe_(storeId, dbId);
      ss = SpreadsheetApp.openById(storeId);
    } else {
      ss = SpreadsheetApp.create('Activity Dashboard — AI Store');
    }
    Object.keys(STORE_SHEETS).forEach(function (name) {
      var sh = ss.getSheetByName(name) || ss.insertSheet(name);
      var h = STORE_SHEETS[name];
      sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
      sh.setFrozenRows(1);
    });
    if (ss.getSheetByName('Criteria').getLastRow() < 2) {
      var cs = criteriaSeed_();
      ss.getSheetByName('Criteria').getRange(2, 1, cs.length, cs[0].length).setValues(cs);
    }
    var hs = ss.getSheetByName('Holidays');
    if (hs.getLastRow() < 2) {
      var hseed = holidaySeed_();
      hs.getRange(2, 1, hseed.length, 1).setNumberFormat('@');
      hs.getRange(2, 1, hseed.length, hseed[0].length).setValues(hseed);
    }
    var st = ss.getSheetByName('Settings');
    if (st.getLastRow() < 2) {
      var seed = settingsSeed_();
      st.getRange(2, 1, seed.length, 3).setValues(seed);
    }
    var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('แผ่น1');
    if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
    return ss;
  }

  return {
    readSettings: readSettings,
    writeSettings: writeSettings,
    readReviews: readReviews,
    upsertReviews: upsertReviews,
    logRun: logRun,
    readRuns: readRuns,
    readCriteria: readCriteria,
    readHolidays: readHolidays,
    readCaseReviews: readCaseReviews,
    upsertCaseReviews: upsertCaseReviews,
    ensure: ensure
  };
})();
