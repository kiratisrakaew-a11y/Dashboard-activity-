/**
 * DbReader — ช่องทางเดียวที่แตะ DB "Buyer Procurement Activity — DB"
 *
 * !!! READ-ONLY !!!
 * ไฟล์นี้ใช้ได้แค่ getValues()/getSheetId()/getLastRow()/getLastColumn() เท่านั้น
 * ห้ามมีคำสั่งเขียนใดๆ — scripts/check-readonly.sh จะ fail ถ้าเจอ
 */
var DbReader = (function () {

  function db_() {
    return SpreadsheetApp.openById(getConfig_().DB_ID);
  }

  function normalize_(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
    return v;
  }

  /** อ่านทั้งชีตเป็น array ของ object; เก็บเลขแถวจริงไว้ใน _row */
  function readSheet_(name, maxCols) {
    var sh = db_().getSheetByName(name);
    if (!sh) throw new Error('ไม่พบชีต ' + name + ' ใน DB');
    var lastRow = sh.getLastRow();
    var lastCol = maxCols ? Math.min(maxCols, sh.getLastColumn()) : sh.getLastColumn();
    if (lastRow < 1 || lastCol < 1) return [];
    var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
    var header = values[0].map(function (h) { return String(h).trim(); });
    var out = [];
    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      if (row[0] === '' || row[0] === null) continue;
      var obj = { _row: r + 1 };
      for (var c = 0; c < header.length; c++) {
        if (header[c]) obj[header[c]] = normalize_(row[c]);
      }
      if (obj.Is_Deleted === true) continue;
      out.push(obj);
    }
    return out;
  }

  // ---------- แคชแบบแบ่งก้อน (CacheService จำกัด 100KB ต่อคีย์) ----------
  var CHUNK = 90000;

  function cached_(key, loader) {
    var cache = CacheService.getScriptCache();
    var ttl = getConfig_().CACHE_SECONDS;
    try {
      var head = cache.get(key + ':n');
      if (head) {
        var n = Number(head);
        var keys = [];
        for (var i = 0; i < n; i++) keys.push(key + ':' + i);
        var parts = cache.getAll(keys);
        var s = '';
        for (var j = 0; j < n; j++) {
          if (parts[keys[j]] == null) { s = null; break; }
          s += parts[keys[j]];
        }
        if (s !== null) return JSON.parse(s);
      }
    } catch (e) { /* แคชเสีย → อ่านใหม่ */ }

    var data = loader();
    try {
      var json = JSON.stringify(data);
      var map = {};
      var count = Math.ceil(json.length / CHUNK) || 1;
      for (var k = 0; k < count; k++) map[key + ':' + k] = json.substr(k * CHUNK, CHUNK);
      map[key + ':n'] = String(count);
      cache.putAll(map, ttl);
    } catch (e2) { /* ใหญ่เกินแคช → ข้าม */ }
    return data;
  }

  function clearCache() {
    var cache = CacheService.getScriptCache();
    ['db:cases', 'db:activities', 'db:users', 'db:vendors', 'db:settings', 'db:lists', 'db:status', 'db:meta']
      .forEach(function (k) { cache.remove(k + ':n'); });
  }

  // ---------- public readers ----------
  function readCases() { return cached_('db:cases', function () { return readSheet_('Cases'); }); }
  function readActivities() { return cached_('db:activities', function () { return readSheet_('Activities'); }); }
  function readUsers() { return cached_('db:users', function () { return readSheet_('Users'); }); }
  function readStatusMaster() { return cached_('db:status', function () { return readSheet_('Status_Master'); }); }

  /** Vendors → { VEN-xxxxx: {name, status, categories} } (อ่านแค่ 10 คอลัมน์แรก) */
  function readVendorsMap() {
    return cached_('db:vendors', function () {
      var map = {};
      readSheet_('Vendors', 10).forEach(function (v) {
        map[v.Vendor_ID] = { name: v.Vendor_Name || '', status: v.Vendor_Status || '', categories: v.Categories || '' };
      });
      return map;
    });
  }

  /** Config_Settings → { Key: Value } */
  function readSettings() {
    return cached_('db:settings', function () {
      var map = {};
      readSheet_('Config_Settings').forEach(function (r) { map[r.Key] = r.Value; });
      return map;
    });
  }

  /** Config_Lists → { LIST_NAME: { CODE: Label_TH } } */
  function readLists() {
    return cached_('db:lists', function () {
      var map = {};
      readSheet_('Config_Lists').forEach(function (r) {
        if (r.Is_Active === false) return;
        (map[r.List_Name] = map[r.List_Name] || {})[r.Code] = r.Label_TH;
      });
      return map;
    });
  }

  /** gid ของแต่ละชีต (ใช้ทำลิงก์ไปแก้ใน Sheet เอง) */
  function readMeta() {
    return cached_('db:meta', function () {
      var ss = db_();
      var gids = {};
      ss.getSheets().forEach(function (s) { gids[s.getName()] = s.getSheetId(); });
      return { url: ss.getUrl(), name: ss.getName(), gids: gids };
    });
  }

  return {
    readCases: readCases,
    readActivities: readActivities,
    readUsers: readUsers,
    readStatusMaster: readStatusMaster,
    readVendorsMap: readVendorsMap,
    readSettings: readSettings,
    readLists: readLists,
    readMeta: readMeta,
    clearCache: clearCache
  };
})();
