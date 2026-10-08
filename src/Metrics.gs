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
      date: a.Activity_Date, day: dayNum_(a.Activity_Date),
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
    var stage = 0, vendorSet = {};
    list.forEach(function (a) {
      stage = Math.max(stage, STAGE_RANK[a.type] || 0);
      if (a.vendorId) vendorSet[a.vendorId] = 1;
    });
    // savings: ใช้ Activity ล่าสุดที่ AI ดึงตัวเลขได้ (ให้ CLOSED มาก่อน)
    // savings: ใช้ผล AI ตรวจทั้ง Case ก่อน ไม่งั้นใช้ Activity ล่าสุดที่ AI ดึงตัวเลขได้ (ให้ CLOSED มาก่อน)
    var cr = (data.caseReviews || {})[c.Case_ID] || null;
    var sav = cr ? computeSavingsFrom_(cr.savings) : null;
    if (sav) sav.source = 'case';
    if (!sav) {
      list.slice().reverse().sort(function (x, y) { return (y.type === 'CLOSED') - (x.type === 'CLOSED'); })
        .some(function (a) { sav = computeSavings_(reviews[a.id]); return !!sav; });
      if (sav) sav.source = 'activity';
    }
    var scores = list.map(function (a) { return a.score; });
    return {
      id: c.Case_ID, row: c._row, ref: c.Request_Ref || '', requester: c.Requester_Name || '',
      dept: c.Department_Code || '', method: c.Method || '', budget: c.Budget_Type || '', subType: c.Sub_Type || '',
      buyer: lower_(c.Buyer_Owner), status: c.Status || '', prNo: c.PR_No || '',
      intakeComplete: c.Intake_Complete === true,
      requestDate: dayStr_(reqDay), requiredDate: dayStr_(reqdDay),
      ageDays: reqDay === null ? null : today - reqDay,
      pastRequired: open && reqdDay !== null && reqdDay < today,
      activityCount: list.length,
      lastActivity: dayStr_(lastDay), daysSinceLast: lastDay === null ? null : today - lastDay,
      firstResponseDays: (firstDay === null || reqDay === null || firstDay === Infinity) ? null : Math.max(0, firstDay - reqDay),
      stage: stage, stageLabel: STAGE_LABEL[stage],
      vendorsContacted: Object.keys(vendorSet).length,
      hasClosedActivity: stage === 3,
      stale: open && (lastDay === null ? (reqDay !== null && today - reqDay > cfg.STALE_DAYS) : today - lastDay > cfg.STALE_DAYS),
      avgScore: avg_(scores),
      savings: sav,
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
      channels: countBy_(myActs, function (a) { return a.channel; })
    };
  }).sort(function (x, y) { return y.openCases - x.openCases; });

  // ---------- Weekly trend ----------
  var weeks = {};
  function wk(d) { var k = dayStr_(weekStart_(d)); return (weeks[k] = weeks[k] || { week: k, newCases: 0, activities: 0, scores: [] }); }
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
    pending: withActs.filter(function (c) { return !c.caseReview || c.caseReview.stale; }).length,
    avgScore: avg_(caseRev.map(function (c) { return c.caseReview.score; })),
    readyToClose: caseRev.filter(function (c) { return c.caseReview.readyToClose && c.status === 'OPEN'; }).length,
    withInconsistency: caseRev.filter(function (c) { return c.caseReview.inconsistencies.length > 0; }).length,
    highRisk: caseRev.filter(function (c) { return c.caseReview.risk === 'high' && c.status === 'OPEN'; }).length
  };

  // ---------- Overview ----------
  var savedCases = cases.filter(function (c) { return c.savings; });
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
    savingsTotal: round2_(savedCases.reduce(function (s, c) { return s + c.savings.saving; }, 0)),
    savingsInitialTotal: round2_(savedCases.reduce(function (s, c) { return s + c.savings.initial * c.savings.quantity; }, 0)),
    savingsCases: savedCases.length
  };
  overview.savingsPct = overview.savingsInitialTotal ? round2_(overview.savingsTotal / overview.savingsInitialTotal * 100) : null;

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
      bySubType: countBy_(openCases, function (c) { return c.subType; }),
      byBuyer: countBy_(openCases, function (c) { return c.buyer; }),
      byActivityType: countBy_(acts, function (a) { return a.type; }),
      byChannel: countBy_(acts, function (a) { return a.channel; })
    },
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
