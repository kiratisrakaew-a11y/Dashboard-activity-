/**
 * Triggers — ตั้งค่าครั้งแรกและ trigger รายชั่วโมง
 *
 * วิธีใช้: เปิด Apps Script editor → เลือกฟังก์ชัน setup → Run (ครั้งเดียว)
 */

function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('DB_ID')) props.setProperty('DB_ID', DEFAULTS.DB_ID);
  var dbId = props.getProperty('DB_ID');
  var storeId = props.getProperty('STORE_ID') || '';

  var ss = Store.ensure(storeId, dbId);
  props.setProperty('STORE_ID', ss.getId());
  configMemo_ = null;

  // ทดสอบว่าอ่าน DB ได้ (อ่านอย่างเดียว)
  var meta = DbReader.readMeta();
  installHourlyTrigger();
  console.log('AI Store: ' + ss.getUrl());
  console.log('DB (read-only): ' + meta.name + ' — ' + meta.url);
  return { store: ss.getUrl(), db: meta.url };
}

function installHourlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runAiBatch') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runAiBatch').timeBased().everyHours(1).create();
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

/** ทดสอบ provider ที่ตั้งไว้ด้วย Activity ล่าสุด 1 รายการ (ไม่บันทึกผล) */
function testAiProvider() {
  var ctx = loadReviewContext_();
  var acts = DbReader.readActivities();
  var a = acts[acts.length - 1];
  var review = reviewOne_(a, ctx);
  console.log(ctx.cfg.AI_PROVIDER + ' / ' + ctx.cfg.AI_MODEL + ' → ' + a.Activity_ID + ' score ' + review.score);
  console.log(JSON.stringify(review, null, 2));
  return review;
}
