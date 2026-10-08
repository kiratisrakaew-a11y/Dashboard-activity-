/**
 * DataHealth — กฎตรวจคุณภาพข้อมูล (pure function)
 * แสดงปัญหาให้ HEAD เห็นเท่านั้น แอปจะไม่แก้ไข DB ให้
 *
 * severity: high | medium | low
 */

var HEALTH_RULES = {
  CASE_CLOSED_ACTIVITY_STILL_OPEN: { severity: 'high', label: 'มี Activity สรุปผล (CLOSED) แล้ว แต่ Case ยังเป็น OPEN' },
  CASE_NO_ACTIVITY: { severity: 'high', label: 'Case ยังไม่มี Activity เลย' },
  CASE_STATUS_CLOSED_NO_DATE: { severity: 'medium', label: 'Case ปิดแล้วแต่ไม่มี Closed_At' },
  CASE_REQUIRED_BEFORE_REQUEST: { severity: 'medium', label: 'Required_Date อยู่ก่อน Request_Date' },
  CASE_INTAKE_INCOMPLETE: { severity: 'low', label: 'Intake ยังไม่ครบ (Intake_Complete = FALSE)' },
  CASE_NO_BUYER: { severity: 'high', label: 'Case ไม่มี Buyer_Owner' },
  CASE_NO_PRICE: { severity: 'medium', label: 'ต่อรอง/สรุปผลแล้ว แต่ไม่ระบุราคาเริ่มต้นหรือราคาสุดท้าย — วัดผลการต่อรองไม่ได้' },
  CASE_AI_INCONSISTENT: { severity: 'medium', label: 'AI พบข้อมูลขัดกันระหว่าง Activity ใน Case' },
  CASE_FEW_QUOTES: { severity: 'medium', label: 'จัดซื้อปกติ (NORMAL) สรุปผลแล้วแต่เทียบราคาน้อยกว่าเกณฑ์' },
  ACT_NO_CHANNEL: { severity: 'low', label: 'Activity ไม่ระบุ Channel' },
  ACT_SHORT_DESC: { severity: 'medium', label: 'คำอธิบาย Activity สั้นเกินไป' },
  ACT_NEXT_NO_DATE: { severity: 'low', label: 'มี Next_Action แต่ไม่มีวันที่' },
  ACT_FORGOT_DONE: { severity: 'low', label: 'Next action เลยกำหนดแต่มี Activity ใหม่แล้ว (น่าจะลืมติ๊ก Done)' },
  ACT_OVERDUE: { severity: 'high', label: 'Next action เลยกำหนดและยังไม่มีความคืบหน้า' },
  ACT_UNKNOWN_VENDOR: { severity: 'medium', label: 'Vendor_ID ไม่พบในชีต Vendors' },
  ACT_VENDOR_BLACKLIST: { severity: 'high', label: 'ติดต่อ Vendor ที่สถานะ BLACKLIST/INACTIVE' },
  ACT_BEFORE_REQUEST: { severity: 'low', label: 'วันที่ Activity อยู่ก่อนวันที่รับเรื่อง (Request_Date)' },
  ACT_CASE_NOT_FOUND: { severity: 'high', label: 'Activity อ้างถึง Case_ID ที่ไม่มีอยู่' },
  ACT_TYPE_MISMATCH: { severity: 'medium', label: 'AI ประเมินว่าเนื้อหาไม่ตรงกับ Activity_Type' },
  ACT_DUPLICATE_DESC: { severity: 'low', label: 'คำอธิบายซ้ำกับ Activity อื่นใน Case เดียวกัน' }
};

function checkDataHealth_(data, dash) {
  var cfg = data.cfg;
  var issues = [];
  function add(code, sheet, row, recordId, caseId, detail) {
    var r = HEALTH_RULES[code];
    issues.push({ code: code, severity: r.severity, label: r.label, sheet: sheet, row: row,
      recordId: recordId, caseId: caseId || '', detail: detail || '' });
  }

  var caseById = {};
  data.cases.forEach(function (c) { caseById[c.Case_ID] = c; });
  var dashCase = {};
  dash.cases.forEach(function (c) { dashCase[c.id] = c; });

  data.cases.forEach(function (c) {
    var d = dashCase[c.Case_ID];
    if (c.Status === 'OPEN' && d && d.hasClosedActivity) add('CASE_CLOSED_ACTIVITY_STILL_OPEN', 'Cases', c._row, c.Case_ID, c.Case_ID, 'PR_No: ' + (c.PR_No || '-'));
    if (d && d.activityCount === 0 && c.Status === 'OPEN') add('CASE_NO_ACTIVITY', 'Cases', c._row, c.Case_ID, c.Case_ID, 'อายุ ' + d.ageDays + ' วัน');
    if (c.Status === 'CLOSED' && isBlank_(c.Closed_At)) add('CASE_STATUS_CLOSED_NO_DATE', 'Cases', c._row, c.Case_ID, c.Case_ID);
    var rq = dayNum_(c.Request_Date), rd = dayNum_(c.Required_Date);
    if (rq !== null && rd !== null && rd < rq) add('CASE_REQUIRED_BEFORE_REQUEST', 'Cases', c._row, c.Case_ID, c.Case_ID, dayStr_(rd) + ' < ' + dayStr_(rq));
    if (c.Intake_Complete === false && c.Status === 'OPEN') add('CASE_INTAKE_INCOMPLETE', 'Cases', c._row, c.Case_ID, c.Case_ID, c.Intake_Note || '');
    if (isBlank_(c.Buyer_Owner)) add('CASE_NO_BUYER', 'Cases', c._row, c.Case_ID, c.Case_ID);
    if (d && d.priceGap && d.priceGap.code !== 'NOT_REVIEWED') {
      add('CASE_NO_PRICE', 'Cases', c._row, c.Case_ID, c.Case_ID, d.priceGap.label + ' (ขั้น: ' + d.stageLabel + ')');
    }
    if (d && d.caseReview && d.caseReview.inconsistencies.length) {
      add('CASE_AI_INCONSISTENT', 'Cases', c._row, c.Case_ID, c.Case_ID, d.caseReview.inconsistencies.join(' / '));
    }
    // SPECIAL เลือก Vendor รายเดียวได้ จึงตรวจเฉพาะ NORMAL
    if (c.Method === 'NORMAL' && d && d.hasClosedActivity && d.vendorsContacted < cfg.MIN_QUOTES) {
      add('CASE_FEW_QUOTES', 'Cases', c._row, c.Case_ID, c.Case_ID, 'ติดต่อ ' + d.vendorsContacted + ' ราย (เกณฑ์ ' + cfg.MIN_QUOTES + ' ราย)');
    }
  });

  var seenDesc = {};
  dash.activities.forEach(function (a) {
    var c = caseById[a.caseId];
    if (!c) add('ACT_CASE_NOT_FOUND', 'Activities', a.row, a.id, a.caseId);
    if (isBlank_(a.channel)) add('ACT_NO_CHANNEL', 'Activities', a.row, a.id, a.caseId);
    var len = a.desc.trim().length;
    if (len < cfg.SHORT_DESC_CHARS) add('ACT_SHORT_DESC', 'Activities', a.row, a.id, a.caseId, len + ' ตัวอักษร: "' + a.desc.trim() + '"');
    if (!isBlank_(a.nextAction) && a.nextDay === null && !a.nextDone) add('ACT_NEXT_NO_DATE', 'Activities', a.row, a.id, a.caseId, a.nextAction);
    if (a.vendorId && !a.vendorName && !a.vendorStatus) add('ACT_UNKNOWN_VENDOR', 'Activities', a.row, a.id, a.caseId, a.vendorId);
    if (a.vendorStatus === 'BLACKLIST' || a.vendorStatus === 'INACTIVE') add('ACT_VENDOR_BLACKLIST', 'Activities', a.row, a.id, a.caseId, a.vendorName + ' (' + a.vendorStatus + ')');
    if (c) {
      var rq = dayNum_(c.Request_Date);
      if (rq !== null && a.day !== null && a.day < rq) add('ACT_BEFORE_REQUEST', 'Activities', a.row, a.id, a.caseId, dayStr_(a.day) + ' < ' + dayStr_(rq));
    }
    if (a.typeMismatch) add('ACT_TYPE_MISMATCH', 'Activities', a.row, a.id, a.caseId, a.type + ' → ควรเป็น ' + (a.suggestedType || '?'));
    var key = a.caseId + '|' + a.desc.trim();
    if (len >= cfg.SHORT_DESC_CHARS) {
      if (seenDesc[key]) add('ACT_DUPLICATE_DESC', 'Activities', a.row, a.id, a.caseId, 'ซ้ำกับ ' + seenDesc[key]);
      else seenDesc[key] = a.id;
    }
  });

  dash.nextActions.overdue.forEach(function (o) {
    add('ACT_OVERDUE', 'Activities', o.row, o.id, o.caseId, o.nextAction + ' (เลย ' + o.daysLate + ' วัน)');
  });
  dash.nextActions.forgotDone.forEach(function (o) {
    add('ACT_FORGOT_DONE', 'Activities', o.row, o.id, o.caseId, o.nextAction + ' (กำหนด ' + o.nextDate + ')');
  });

  var rank = { high: 0, medium: 1, low: 2 };
  issues.sort(function (x, y) { return rank[x.severity] - rank[y.severity] || String(x.recordId).localeCompare(String(y.recordId)); });
  return {
    issues: issues,
    summary: countBy_(issues, function (i) { return i.code; }),
    bySeverity: countBy_(issues, function (i) { return i.severity; }),
    rules: HEALTH_RULES
  };
}
