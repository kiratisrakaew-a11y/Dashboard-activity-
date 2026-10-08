/**
 * Store — อ่าน/เขียน Spreadsheet แยก "Activity Dashboard — AI Store"
 * เป็นที่เดียวในระบบที่มีการเขียนข้อมูล และจะปฏิเสธถ้า STORE_ID เป็นไฟล์เดียวกับ DB
 */

var STORE_SHEETS = {
  AI_Reviews: ['Activity_ID', 'Activity_Version', 'Hash', 'Provider', 'Model', 'Score', 'Grade',
    'Criteria_JSON', 'Missing', 'Suggestion', 'Improved_Example', 'Type_Mismatch', 'Suggested_Type',
    'Extracted_JSON', 'Tokens_In', 'Tokens_Out', 'Reviewed_At'],
  AI_Runs: ['Started_At', 'Finished_At', 'Provider', 'Model', 'Pending', 'Reviewed', 'Errors', 'Message'],
  Settings: ['Key', 'Value', 'Description']
};

function settingsSeed_() {
  return [
    ['AI_PROVIDER', DEFAULTS.AI_PROVIDER, 'openai | gemini | claude (ต้องตั้ง API key ใน Script Properties ด้วย)'],
    ['AI_MODEL', '', 'ว่าง = ใช้ค่าเริ่มต้นของ provider'],
    ['AI_EFFORT', DEFAULTS.AI_EFFORT, 'Claude เท่านั้น: low | medium | high'],
    ['STALE_DAYS', DEFAULTS.STALE_DAYS, 'Case ที่ไม่มี Activity เกินกี่วันถือว่านิ่ง'],
    ['SCORE_THRESHOLD', DEFAULTS.SCORE_THRESHOLD, 'คะแนน AI ต่ำกว่านี้ = ต้องปรับปรุง'],
    ['MIN_QUOTES', DEFAULTS.MIN_QUOTES, 'จำนวน vendor ขั้นต่ำที่ควรเทียบราคา (Method NORMAL)'],
    ['SHORT_DESC_CHARS', DEFAULTS.SHORT_DESC_CHARS, 'คำอธิบายสั้นกว่านี้ถือว่าสั้นเกินไป'],
    ['BATCH_SIZE', DEFAULTS.BATCH_SIZE, 'จำนวน Activity ที่ AI ตรวจต่อรอบ']
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

  function sheet_(name) {
    var sh = open_().getSheetByName(name);
    if (!sh) throw new Error('AI Store ไม่มีชีต ' + name + ' — รัน setup() อีกครั้ง');
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

  function upsertReviews(list) {
    if (!list.length) return;
    var sh = sheet_('AI_Reviews');
    var last = sh.getLastRow();
    var ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
    var appends = [];
    list.forEach(function (rv) {
      var idx = ids.indexOf(rv.activity_id);
      if (idx >= 0) sh.getRange(idx + 2, 1, 1, STORE_SHEETS.AI_Reviews.length).setValues([toRow_(rv)]);
      else appends.push(toRow_(rv));
    });
    if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, appends[0].length).setValues(appends);
  }

  function logRun(run) {
    sheet_('AI_Runs').appendRow([run.started_at, run.finished_at, run.provider || '', run.model || '',
      run.pending, run.reviewed, run.errors, run.message || '']);
  }

  function readRuns(limit) {
    var sh = sheet_('AI_Runs');
    var last = sh.getLastRow();
    if (last < 2) return [];
    var n = Math.min(limit || 10, last - 1);
    return sh.getRange(last - n + 1, 1, n, STORE_SHEETS.AI_Runs.length).getValues().reverse().map(function (r) {
      return { started: String(r[0]), finished: String(r[1]), provider: r[2], model: r[3], pending: r[4], reviewed: r[5], errors: r[6], message: r[7] };
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
    ensure: ensure
  };
})();
