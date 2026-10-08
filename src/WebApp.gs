/**
 * WebApp — doGet และ API ที่หน้าเว็บเรียกผ่าน google.script.run
 * ทุก API ตรวจสิทธิ์ HEAD ก่อนเสมอ
 */

function doGet() {
  var user;
  try {
    user = requireHead_();
  } catch (e) {
    var denied = HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;padding:40px;text-align:center">' +
      '<h2>ไม่มีสิทธิ์เข้าใช้</h2><p>' + String(e.message).replace(/[<>&]/g, '') + '</p></div>');
    return denied.setTitle('Activity Dashboard');
  }
  var t = HtmlService.createTemplateFromFile('ui/Index');
  t.userName = user.Name || user.Email;
  return t.evaluate()
    .setTitle('Procurement Activity Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function loadData_() {
  var cfg = getConfig_();
  var cases = DbReader.readCases();
  var activities = DbReader.readActivities();
  var settings = DbReader.readSettings();
  var storeCriteria = {};
  try { storeCriteria = Store.readCriteria(); } catch (e) { console.warn(e.message); }
  var critVer = criteriaVersion_(settings, storeCriteria);
  var methodByCase = {};
  cases.forEach(function (c) { methodByCase[c.Case_ID] = c.Method; });
  var reviews = {};
  try { reviews = Store.readReviews(); } catch (e) { console.warn(e.message); }
  activities.forEach(function (a) {
    var r = reviews[a.Activity_ID];
    if (r) r.stale = r.hash !== activityFingerprint_(a, critVer, methodByCase[a.Case_ID]);
  });
  // ส่งเฉพาะ vendor ที่ถูกอ้างถึง
  var allVendors = DbReader.readVendorsMap();
  var vendors = {};
  activities.forEach(function (a) { if (a.Vendor_ID && allVendors[a.Vendor_ID]) vendors[a.Vendor_ID] = allVendors[a.Vendor_ID]; });
  return {
    cfg: cfg, cases: cases, activities: activities, users: DbReader.readUsers(),
    vendors: vendors, reviews: reviews, settings: settings, storeCriteria: storeCriteria, today: dayNum_(new Date())
  };
}

/** ข้อมูลทั้งหมดของหน้า Dashboard (ส่งเป็น JSON string) */
function apiGetDashboard() {
  var user = requireHead_();
  var data = loadData_();
  var dash = computeDashboard_(data);
  dash.health = checkDataHealth_(data, dash);
  dash.meta = DbReader.readMeta();
  dash.lists = DbReader.readLists();
  dash.criteria = {};
  METHODS.forEach(function (m) {
    dash.criteria[m] = {};
    ACTIVITY_TYPES.forEach(function (t) {
      var src = criteriaSource_(data.settings, t, m, data.storeCriteria);
      dash.criteria[m][t] = { source: src.source, list: src.list.concat(GENERIC_CRITERIA) };
    });
  });
  dash.settings = publicSettings_(data.cfg);
  try { dash.runs = Store.readRuns(5); } catch (e) { dash.runs = []; }
  dash.user = { email: user.Email, name: user.Name };
  dash.generatedAt = new Date().toISOString();
  return JSON.stringify(dash);
}

function publicSettings_(cfg) {
  var out = {};
  EDITABLE_SETTINGS.forEach(function (k) { out[k] = cfg[k]; });
  var props = PropertiesService.getScriptProperties();
  out.keys = {};
  Object.keys(API_KEY_PROPS).forEach(function (p) { out.keys[p] = !!props.getProperty(API_KEY_PROPS[p]); });
  out.defaultModels = DEFAULT_MODELS;
  out.storeUrl = cfg.STORE_ID ? 'https://docs.google.com/spreadsheets/d/' + cfg.STORE_ID + '/edit' : '';
  return out;
}

function apiReviewNow(activityId) {
  requireHead_();
  return JSON.stringify(reviewActivityNow_(String(activityId)));
}

function apiRunBatch() {
  requireHead_();
  return JSON.stringify(runAiBatch());
}

function apiSaveSettings(obj) {
  requireHead_();
  var clean = {};
  EDITABLE_SETTINGS.forEach(function (k) { if (obj && obj[k] !== undefined) clean[k] = obj[k]; });
  if (clean.AI_PROVIDER && !API_KEY_PROPS[clean.AI_PROVIDER]) throw new Error('provider ไม่ถูกต้อง');
  Store.writeSettings(clean);
  return JSON.stringify(publicSettings_(getConfig_()));
}

function apiRefresh() {
  requireHead_();
  DbReader.clearCache();
  return apiGetDashboard();
}
