/**
 * Metrics — คำนวณ KPI ทั้งหมดจากข้อมูลที่อ่านมาแล้ว (pure function)
 *
 * input:
 *   data = { cases, activities, users, vendors, lists, reviews, cfg, today }
 *     reviews : { Activity_ID: reviewObject } จาก AI Store
 *     today   : เลขวัน (dayNum_) ของวันนี้
 */

function computeSavings_(review) {
  return computeSavingsFrom_(review && review.extracted);
}

/** x = { initial_price, final_price, estimate_price, quantity, price_basis } */
function computeSavingsFrom_(x) {
  if (!x) return null;
  var ini = Number(x.initial_price), fin = Number(x.final_price);
  if (!(ini > 0) || !(fin > 0) || fin > ini) return null;
  var qty = (x.price_basis === 'per_unit' && Number(x.quantity) > 0) ? Number(x.quantity) : 1;
  var est = Number(x.estimate_price) > 0 ? Number(x.estimate_price) : null;
  return {
    initial: ini,
    final: fin,
    estimate: est,
    quantity: qty,
    basis: x.price_basis || 'unknown',
    saving: round2_((ini - fin) * qty),
    pct: round2_((ini - fin) / ini * 100),
    vsEstimatePct: est ? round2_((fin - est) / est * 100) : null
  };
}

/** สาเหตุที่วัดผลการต่อรองของ Case ไม่ได้ */
var PRICE_GAP_LABEL = {
  NO_BOTH: 'ไม่ระบุทั้งราคาเริ่มต้นและราคาสุดท้าย',
  NO_INITIAL: 'ไม่ระบุราคาเริ่มต้น (ราคาเสนอครั้งแรก)',
  NO_FINAL: 'ไม่ระบุราคาสุดท้าย (ราคาที่ต่อรองได้/ราคาปิด)',
  SPLIT: 'มีราคาแต่อยู่คนละ Activity — รอ AI ตรวจทั้ง Case',
  INVALID: 'ราคาสุดท้ายสูงกว่าราคาเริ่มต้น หรือตัวเลขไม่สอดคล้อง',
  NOT_REVIEWED: 'AI ยังไม่ได้ตรวจ'
};

/**
 * หาสาเหตุที่ Case (ที่ต่อรอง/สรุปผลแล้ว) วัดผลการต่อรองไม่ได้
 *   caseSavings : savings จาก AI ตรวจทั้ง Case (หรือ null)
 *   actExtracts : extracted จาก AI ราย Activity ของ Case นี้
 */
function priceGapReason_(caseSavings, actExtracts) {
  function has(v) { return Number(v) > 0; }
  if (caseSavings) {
    var i = has(caseSavings.initial_price), f = has(caseSavings.final_price);
    if (!i && !f) return 'NO_BOTH';
    if (!i) return 'NO_INITIAL';
    if (!f) return 'NO_FINAL';
    return 'INVALID';
  }
  var xs = (actExtracts || []).filter(function (x) { return x; });
  if (!xs.length) return 'NOT_REVIEWED';
  var anyI = xs.some(function (x) { return has(x.initial_price); });
  var anyF = xs.some(function (x) { return has(x.final_price); });
  if (!anyI && !anyF) return 'NO_BOTH';
  if (!anyI) return 'NO_INITIAL';
  if (!anyF) return 'NO_FINAL';
  var same = xs.some(function (x) { return has(x.initial_price) && has(x.final_price); });
  return same ? 'INVALID' : 'SPLIT';
}

/**
 * สรุปผลการต่อรองจากหลาย Case (ใช้ทั้งรายคนและทั้งทีม)
 *   pct    = % ลดลงแบบถ่วงน้ำหนักด้วยยอดเงิน (ตัวเลขหลัก)
 *   avgPct = % เฉลี่ยต่อ Case (ดูความสม่ำเสมอ)
 *   vsEstimatePct = ราคาสุดท้ายเทียบราคาประมาณการ (เฉพาะ Case ที่มีประมาณการ; ติดลบ = ต่ำกว่างบ)
 */
function summarizeSavings_(cases) {
  var list = (cases || []).filter(function (c) { return c.savings; });
  var initial = 0, saving = 0, finalWithEst = 0, estimate = 0;
  var pcts = list.map(function (c) {
    var s = c.savings;
    initial += s.initial * s.quantity;
    saving += s.saving;
    if (s.estimate) { finalWithEst += s.final * s.quantity; estimate += s.estimate * s.quantity; }
    return s.pct;
  });
  return {
    cases: list.length,
    initial: round2_(initial),
    saving: round2_(saving),
    pct: initial ? round2_(saving / initial * 100) : null,
    unmeasured: (cases || []).filter(function (c) { return c.priceGap && c.priceGap.code !== 'NOT_REVIEWED'; }).length,
    notReviewed: (cases || []).filter(function (c) { return c.priceGap && c.priceGap.code === 'NOT_REVIEWED'; }).length,
    avgPct: pcts.length ? round2_(pcts.reduce(function (a, b) { return a + b; }, 0) / pcts.length) : null,
    minPct: pcts.length ? Math.min.apply(null, pcts) : null,
    maxPct: pcts.length ? Math.max.apply(null, pcts) : null,
    finalWithEst: round2_(finalWithEst),
    estimate: round2_(estimate),
    vsEstimatePct: estimate ? round2_((finalWithEst - estimate) / estimate * 100) : null
  };
}

/** เฉลี่ยจำนวน Vendor ต่อ Case (เฉพาะ Case ที่มี Activity) แยก NORMAL / SPECIAL */
function summarizeVendors_(cases, minQuotes) {
  var withActs = (cases || []).filter(function (c) { return c.activityCount > 0; });
  function part(list) {
    return {
      cases: list.length,
      avgContacted: avg_(list.map(function (c) { return c.vendorsContacted; })),
      avgNegotiated: avg_(list.map(function (c) { return c.vendorsNegotiated; }))
    };
  }
  var out = part(withActs);
  out.normal = part(withActs.filter(function (c) { return c.method === 'NORMAL'; }));
  // นับเฉพาะ Case ที่สรุปผลแล้ว (เหมือนตัวกรอง "เทียบราคาน้อยกว่าเกณฑ์") — Case ที่ยังขอราคาอยู่อาจยังติดต่อไม่ครบ
  out.normal.belowMin = withActs.filter(function (c) {
    return c.method === 'NORMAL' && c.hasClosedActivity && c.vendorsContacted < minQuotes;
  }).length;
  out.normal.metMin = withActs.filter(function (c) { return c.method === 'NORMAL' && c.vendorsContacted >= minQuotes; }).length;
  out.special = part(withActs.filter(function (c) { return c.method === 'SPECIAL'; }));
  out.negotiatedCases = withActs.filter(function (c) { return c.hasNegotiation; }).length;
  out.negotiatedPct = withActs.length ? round2_(out.negotiatedCases / withActs.length * 100) : null;
  return out;
}

/** key ของสัปดาห์ (วันจันทร์) — ใช้ร่วมกันระหว่าง weekly[] กับ cases[]/activities[] เพื่อให้คลิกกราฟแล้วกรองตรงกัน */
function weekKey_(d) { return d === null ? '' : dayStr_(weekStart_(d)); }

function computeDashboard_(data) {
  var cfg = data.cfg, today = data.today;
  var reviews = data.reviews || {};
  var vendors = data.vendors || {};
  var usersByEmail = {};
  (data.users || []).forEach(function (u) { usersByEmail[lower_(u.Email)] = u; });

  // ---------- Activities ----------
  var methodByCase = {};
  data.cases.forEach(function (c) { methodByCase[c.Case_ID] = c.Method || ''; });
  var actsByCase = {};
  var acts = data.activities.map(function (a) {
    var r = reviews[a.Activity_ID] || null;
    var v = vendors[a.Vendor_ID] || null;
    var item = {
      id: a.Activity_ID, row: a._row, caseId: a.Case_ID, vendorId: a.Vendor_ID || '',
      vendorName: v ? v.name : '', vendorStatus: v ? v.status : '',
      type: a.Activity_Type || '', channel: a.Channel || '', method: methodByCase[a.Case_ID] || '',
      date: a.Activity_Date, day: dayNum_(a.Activity_Date), week: weekKey_(dayNum_(a.Activity_Date)),
      by: lower_(a.Performed_By), desc: String(a.Activity_Description || ''),
      nextAction: a.Next_Action || '', nextDate: a.Next_Action_Date || '', nextDay: dayNum_(a.Next_Action_Date),
      nextDone: a.Next_Action_Done === true, version: a.Version,
      score: r ? r.score : null, grade: r ? r.grade : '', suggestion: r ? r.suggestion : '',
      improvedExample: r ? r.improved_example : '',
      missing: r ? r.missing : [], typeMismatch: r ? !!r.type_mismatch : false,
      suggestedType: r ? r.suggested_type : '', criteria: r ? r.criteria : [],
      reviewStale: r ? !!r.stale : false, reviewedAt: r ? r.reviewed_at : ''
    };
    (actsByCase[item.caseId] = actsByCase[item.caseId] || []).push(item);
    return item;
  });
  Object.keys(actsByCase).forEach(function (k) {
    actsByCase[k].sort(function (x, y) { return (x.day || 0) - (y.day || 0) || String(x.date).localeCompare(String(y.date)); });
  });

  // ---------- Next actions ----------
  var overdue = [], dueSoon = [], forgotDone = [];
  acts.forEach(function (a) {
    if (a.nextDone || a.nextDay === null) return;
    var later = (actsByCase[a.caseId] || []).some(function (b) {
      return b !== a && String(b.date) > String(a.date);
    });
    var entry = { id: a.id, row: a.row, caseId: a.caseId, by: a.by, nextAction: a.nextAction,
      nextDate: dayStr_(a.nextDay), daysLate: today - a.nextDay };
    if (a.nextDay < today) {
      if (later) forgotDone.push(entry); else overdue.push(entry);
    } else if (a.nextDay <= today + 1) {
      dueSoon.push(entry);
    }
  });
  overdue.sort(function (x, y) { return y.daysLate - x.daysLate; });

  // ---------- Cases ----------
  var cases = data.cases.map(function (c) {
    var list = actsByCase[c.Case_ID] || [];
    var reqDay = dayNum_(c.Request_Date);
    var reqdDay = dayNum_(c.Required_Date);
    var open = c.Status === 'OPEN';
    var lastDay = list.length ? Math.max.apply(null, list.map(function (a) { return a.day || 0; })) : null;
    var firstDay = list.length ? Math.min.apply(null, list.map(function (a) { return a.day === null ? Infinity : a.day; })) : null;
    var stage = 0, vendorSet = {}, negoSet = {};
    list.forEach(function (a) {
      stage = Math.max(stage, STAGE_RANK[a.type] || 0);
      if (a.vendorId) {
        vendorSet[a.vendorId] = 1;
        if (a.type === 'NEGOTIATION' || a.type === 'CLOSED') negoSet[a.vendorId] = 1;
      }
    });
    // savings: ใช้ผล AI ตรวจทั้ง Case ก่อน ไม่งั้นใช้ Activity ล่าสุดที่ AI ดึงตัวเลขได้ (ให้ CLOSED มาก่อน)
    var cr = (data.caseReviews || {})[c.Case_ID] || null;
    var sav = cr ? computeSavingsFrom_(cr.savings) : null;
    if (sav) { sav.source = 'case'; sav.vendor = (cr.savings && cr.savings.vendor) || ''; }
    if (!sav) {
      list.slice().reverse().sort(function (x, y) { return (y.type === 'CLOSED') - (x.type === 'CLOSED'); })
        .some(function (a) { sav = computeSavings_(reviews[a.id]); return !!sav; });
      if (sav) { sav.source = 'activity'; sav.vendor = ''; }
    }
    // Case ที่ต่อรอง/สรุปผลแล้ว (ขั้น NEGOTIATION ขึ้นไป) แต่วัดผลไม่ได้
    var priceGap = null;
    if (!sav && stage >= 2) {
      var code = priceGapReason_(cr ? cr.savings : null, list.map(function (a) { var r = reviews[a.id]; return r ? r.extracted : null; }));
      priceGap = { code: code, label: PRICE_GAP_LABEL[code] };
    }
    var scores = list.map(function (a) { return a.score; });
    return {
      id: c.Case_ID, row: c._row, ref: c.Request_Ref || '', requester: c.Requester_Name || '',
      dept: c.Department_Code || '', method: c.Method || '', budget: c.Budget_Type || '', subType: c.Sub_Type || '',
      buyer: lower_(c.Buyer_Owner), status: c.Status || '', prNo: c.PR_No || '',
      intakeComplete: c.Intake_Complete === true,
      requestDate: dayStr_(reqDay), requiredDate: dayStr_(reqdDay), week: weekKey_(reqDay),
      ageDays: reqDay === null ? null : today - reqDay,
      pastRequired: open && reqdDay !== null && reqdDay < today,
      activityCount: list.length,
      lastActivity: dayStr_(lastDay), daysSinceLast: lastDay === null ? null : today - lastDay,
      firstResponseDays: (firstDay === null || reqDay === null || firstDay === Infinity) ? null : Math.max(0, firstDay - reqDay),
      stage: stage, stageLabel: STAGE_LABEL[stage],
      vendorsContacted: Object.keys(vendorSet).length,
      vendorsNegotiated: Object.keys(negoSet).length,
      hasNegotiation: list.some(function (a) { return a.type === 'NEGOTIATION'; }),
      hasClosedActivity: stage === 3,
      caseReviewEligible: stage === 3 || c.Status === 'CLOSED',
      stale: open && (lastDay === null ? (reqDay !== null && today - reqDay > cfg.STALE_DAYS) : today - lastDay > cfg.STALE_DAYS),
      avgScore: avg_(scores),
      savings: sav,
      priceGap: priceGap,
      caseReview: cr ? {
        score: cr.score, grade: cr.grade, summary: cr.summary, criteria: cr.criteria,
        missing: cr.missing_steps || [], inconsistencies: cr.inconsistencies || [],
        readyToClose: !!cr.ready_to_close, nextStep: cr.next_step, risk: cr.risk,
        stale: !!cr.stale, reviewedAt: cr.reviewed_at, activityCount: cr.activity_count
      } : null
    };
  });
  var openCases = cases.filter(function (c) { return c.status === 'OPEN'; });

  // ---------- Buyers ----------
  var buyerEmails = {};
  (data.users || []).forEach(function (u) { if (u.Role === 'BUYER' && u.Is_Active === true) buyerEmails[lower_(u.Email)] = 1; });
  cases.forEach(function (c) { if (c.buyer) buyerEmails[c.buyer] = 1; });
  acts.forEach(function (a) { if (a.by) buyerEmails[a.by] = 1; });
  var buyers = Object.keys(buyerEmails).map(function (email) {
    var myCases = cases.filter(function (c) { return c.buyer === email; });
    var myOpen = myCases.filter(function (c) { return c.status === 'OPEN'; });
    var myActs = acts.filter(function (a) { return a.by === email; });
    var reviewed = myActs.filter(function (a) { return a.score !== null; });
    var u = usersByEmail[email];
    return {
      email: email, name: u ? u.Name : email.split('@')[0], role: u ? u.Role : '',
      openCases: myOpen.length, totalCases: myCases.length,
      staleCases: myOpen.filter(function (c) { return c.stale; }).length,
      activitiesTotal: myActs.length,
      activities7d: myActs.filter(function (a) { return a.day !== null && a.day > today - 7; }).length,
      overdue: overdue.filter(function (o) { return o.by === email; }).length,
      forgotDone: forgotDone.filter(function (o) { return o.by === email; }).length,
      avgScore: avg_(reviewed.map(function (a) { return a.score; })),
      reviewed: reviewed.length,
      lowScore: reviewed.filter(function (a) { return a.score < cfg.SCORE_THRESHOLD; }).length,
      avgFirstResponseDays: avg_(myCases.map(function (c) { return c.firstResponseDays; })),
      savings: round2_(myCases.reduce(function (s, c) { return s + (c.savings ? c.savings.saving : 0); }, 0)),
      nego: summarizeSavings_(myCases),
      vendorStats: summarizeVendors_(myCases, cfg.MIN_QUOTES),
      closedCases: myCases.filter(function (c) { return c.hasClosedActivity; }).length,
      channels: countBy_(myActs, function (a) { return a.channel; })
    };
  }).sort(function (x, y) { return y.openCases - x.openCases; });

  // ---------- Weekly trend ----------
  var weeks = {};
  function wk(d) { var k = weekKey_(d); return (weeks[k] = weeks[k] || { week: k, newCases: 0, activities: 0, scores: [] }); }
  cases.forEach(function (c) { var d = dayNum_(c.requestDate); if (d !== null) wk(d).newCases++; });
  acts.forEach(function (a) { if (a.day !== null) { var w = wk(a.day); w.activities++; if (a.score !== null) w.scores.push(a.score); } });
  var weekly = Object.keys(weeks).sort().map(function (k) {
    var w = weeks[k];
    return { week: w.week, newCases: w.newCases, activities: w.activities, avgScore: avg_(w.scores) };
  });

  // ---------- Vendors ----------
  var vmap = {};
  acts.forEach(function (a) {
    if (!a.vendorId) return;
    var v = vmap[a.vendorId] = vmap[a.vendorId] || { id: a.vendorId, name: a.vendorName, status: a.vendorStatus, activities: 0, cases: {} };
    v.activities++; v.cases[a.caseId] = 1;
  });
  var vendorList = Object.keys(vmap).map(function (k) {
    var v = vmap[k]; return { id: v.id, name: v.name, status: v.status, activities: v.activities, cases: Object.keys(v.cases).length };
  }).sort(function (x, y) { return y.activities - x.activities; });

  // ---------- AI ----------
  var reviewedActs = acts.filter(function (a) { return a.score !== null; });
  var byType = {};
  reviewedActs.forEach(function (a) { (byType[a.type] = byType[a.type] || []).push(a.score); });
  Object.keys(byType).forEach(function (k) { byType[k] = avg_(byType[k]); });
  var byMethod = {};
  reviewedActs.forEach(function (a) { (byMethod[a.method || '(ว่าง)'] = byMethod[a.method || '(ว่าง)'] || []).push(a.score); });
  Object.keys(byMethod).forEach(function (k) { byMethod[k] = { avg: avg_(byMethod[k]), count: byMethod[k].length }; });
  var aiSummary = {
    reviewed: reviewedActs.length,
    pending: acts.length - reviewedActs.length,
    avgScore: avg_(reviewedActs.map(function (a) { return a.score; })),
    byType: byType,
    byMethod: byMethod,
    gradeDist: countBy_(reviewedActs, function (a) { return a.grade; }),
    lowCount: reviewedActs.filter(function (a) { return a.score < cfg.SCORE_THRESHOLD; }).length,
    typeMismatchCount: reviewedActs.filter(function (a) { return a.typeMismatch; }).length
  };
  var withActs = cases.filter(function (c) { return c.activityCount > 0; });
  var caseRev = withActs.filter(function (c) { return c.caseReview; });
  aiSummary.cases = {
    reviewed: caseRev.length,
    pending: withActs.filter(function (c) { return c.caseReviewEligible && (!c.caseReview || c.caseReview.stale); }).length,
    waitingClose: withActs.filter(function (c) { return !c.caseReviewEligible; }).length,
    avgScore: avg_(caseRev.map(function (c) { return c.caseReview.score; })),
    readyToClose: caseRev.filter(function (c) { return c.caseReview.readyToClose && c.status === 'OPEN'; }).length,
    withInconsistency: caseRev.filter(function (c) { return c.caseReview.inconsistencies.length > 0; }).length,
    highRisk: caseRev.filter(function (c) { return c.caseReview.risk === 'high' && c.status === 'OPEN'; }).length
  };

  // ---------- Overview ----------
  var teamNego = summarizeSavings_(cases);
  teamNego.closedCases = cases.filter(function (c) { return c.hasClosedActivity; }).length;
  var overview = {
    totalCases: cases.length,
    openCases: openCases.length,
    closedCases: cases.filter(function (c) { return c.status === 'CLOSED'; }).length,
    newCases7d: cases.filter(function (c) { var d = dayNum_(c.requestDate); return d !== null && d > today - 7; }).length,
    totalActivities: acts.length,
    activities7d: acts.filter(function (a) { return a.day !== null && a.day > today - 7; }).length,
    overdueNextActions: overdue.length,
    forgotDone: forgotDone.length,
    dueSoon: dueSoon.length,
    staleCases: openCases.filter(function (c) { return c.stale; }).length,
    noActivityCases: cases.filter(function (c) { return c.activityCount === 0; }).length,
    pastRequired: openCases.filter(function (c) { return c.pastRequired; }).length,
    closedButOpen: openCases.filter(function (c) { return c.hasClosedActivity; }).length,
    fewQuotes: cases.filter(function (c) { return c.hasClosedActivity && c.method === 'NORMAL' && c.vendorsContacted < cfg.MIN_QUOTES; }).length,
    avgCaseAge: avg_(openCases.map(function (c) { return c.ageDays; })),
    avgFirstResponseDays: avg_(cases.map(function (c) { return c.firstResponseDays; })),
    avgScore: aiSummary.avgScore,
    savingsTotal: teamNego.saving,
    savingsInitialTotal: teamNego.initial,
    savingsCases: teamNego.cases,
    savingsPct: teamNego.pct
  };

  var funnel = [0, 1, 2, 3].map(function (s) {
    return { stage: s, label: STAGE_LABEL[s], count: openCases.filter(function (c) { return c.stage === s; }).length };
  });

  return {
    today: dayStr_(today),
    overview: overview,
    breakdown: {
      byDept: countBy_(openCases, function (c) { return c.dept; }),
      byBudget: countBy_(openCases, function (c) { return c.budget; }),
      byMethod: countBy_(openCases, function (c) { return c.method; }),
      byMethodAll: countBy_(cases, function (c) { return c.method; }),
      bySubType: countBy_(openCases, function (c) { return c.subType; }),
      byBuyer: countBy_(openCases, function (c) { return c.buyer; }),
      byActivityType: countBy_(acts, function (a) { return a.type; }),
      byChannel: countBy_(acts, function (a) { return a.channel; })
    },
    nego: teamNego,
    vendorStats: summarizeVendors_(cases, cfg.MIN_QUOTES),
    funnel: funnel,
    weekly: weekly,
    buyers: buyers,
    cases: cases,
    activities: acts,
    nextActions: { overdue: overdue, dueSoon: dueSoon, forgotDone: forgotDone },
    vendors: vendorList,
    ai: aiSummary
  };
}
