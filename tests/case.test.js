const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./load')();
const fixtures = require('./fixtures');
const plain = (x) => JSON.parse(JSON.stringify(x));

const CASE = { Case_ID: 'C1', Method: 'NORMAL', Status: 'OPEN', Request_Ref: 'ซื้อจอ', Sub_Type: 'S', Budget_Type: 'OPEX',
  Request_Date: '2026-09-30T17:00:00.000Z' };
const A1 = { Activity_ID: 'A1', Case_ID: 'C1', Version: 1, Activity_Type: 'CONTACT VENDOR', Activity_Date: '2026-10-01T04:00:00.000Z',
  Activity_Description: 'ขอราคา V1', Next_Action: 'ติดตาม', Next_Action_Done: false, Vendor_ID: 'V1', Updated_At: '2026-10-01T04:00:00.000Z' };
const A2 = { Activity_ID: 'A2', Case_ID: 'C1', Version: 1, Activity_Type: 'CLOSED', Activity_Date: '2026-10-03T04:00:00.000Z',
  Activity_Description: 'เลือก V1 ราคา 90,000', Next_Action: '', Next_Action_Done: false, Vendor_ID: 'V1', Updated_At: '2026-10-03T04:00:00.000Z' };

test('caseFingerprint_ เปลี่ยนเมื่อเพิ่ม/แก้ Activity, Method หรือเกณฑ์ และไม่สนลำดับ', () => {
  const f = G.caseFingerprint_(CASE, [A1], 'v');
  assert.equal(f, G.caseFingerprint_({ ...CASE }, [{ ...A1 }], 'v'));
  assert.notEqual(f, G.caseFingerprint_(CASE, [A1, A2], 'v'));                    // เพิ่ม Activity
  assert.notEqual(f, G.caseFingerprint_(CASE, [{ ...A1, Version: 2 }], 'v'));     // แก้ Activity
  assert.notEqual(f, G.caseFingerprint_(CASE, [{ ...A1, Next_Action_Done: true }], 'v'));
  assert.notEqual(f, G.caseFingerprint_({ ...CASE, Method: 'SPECIAL' }, [A1], 'v'));
  assert.notEqual(f, G.caseFingerprint_(CASE, [A1], 'w'));
  assert.equal(G.caseFingerprint_(CASE, [A1, A2], 'v'), G.caseFingerprint_(CASE, [A2, A1], 'v'));
});

test('pendingCases_ ตรวจ Case ที่มี Activity ใหม่ ข้าม Case ที่ไม่มี Activity และที่ไม่เปลี่ยน', () => {
  const C2 = { ...CASE, Case_ID: 'C2' };
  const C3 = { ...CASE, Case_ID: 'C3' };
  const B1 = { ...A1, Activity_ID: 'B1', Case_ID: 'C2', Activity_Type: 'CLOSED', Updated_At: '2026-10-05T00:00:00.000Z' };
  const acts = { C1: [A1], C2: [B1] };
  const reviewed = { C1: { hash: G.caseFingerprint_(CASE, [A1], 'v') } };
  assert.deepEqual(plain(G.pendingCases_([CASE, C2, C3], acts, reviewed, 'v').map(c => c.Case_ID)), ['C2']);
  // C1 มีแค่ CONTACT VENDOR (ยังไม่สรุปผล) → ไม่เข้าคิว แม้จะเคยถูกกดตรวจเอง
  // เพิ่ม A2 (CLOSED) เข้า C1 → สรุปผลแล้วและมีการเปลี่ยนแปลง → ต้องเข้าคิว เรียงตาม Activity ล่าสุด
  acts.C1 = [A1, { ...A2, Updated_At: '2026-10-07T00:00:00.000Z' }];
  assert.deepEqual(plain(G.pendingCases_([CASE, C2, C3], acts, reviewed, 'v').map(c => c.Case_ID)), ['C1', 'C2']);
});

test('caseCriteria_ ใช้ชีต Criteria ก่อน แล้วค่าในโค้ด แยก NORMAL/SPECIAL', () => {
  assert.equal(G.caseCriteria_('NORMAL', {}).source, 'ค่าตั้งต้นในระบบ');
  assert.ok(G.caseCriteria_('NORMAL', {}).list.some(c => /เหตุผลที่ไม่เลือกเจ้าอื่น/.test(c)));
  assert.ok(!G.caseCriteria_('SPECIAL', {}).list.some(c => /ไม่เลือกเจ้าอื่น/.test(c)));
  assert.deepEqual(plain(G.caseCriteria_('special', { 'SPECIAL|CASE': ['ก'] }).list), ['ก']);
  assert.notEqual(G.caseCriteriaVersion_({}), G.caseCriteriaVersion_({ 'SPECIAL|CASE': ['ก'] }));
  assert.equal(G.caseCriteriaVersion_({}), G.caseCriteriaVersion_({ 'SPECIAL|CLOSED': ['ก'] })); // เกณฑ์ราย Activity ไม่กระทบ
});

test('buildCasePrompt_ ใส่ทุก Activity ตามลำดับวันที่ ภายใน <case>', () => {
  const p = G.buildCasePrompt_(CASE, [A2, A1], { V1: { name: 'บจก. หนึ่ง' } }, ['ก', 'ข']);
  assert.match(p.user, /<case>[\s\S]*<\/case>/);
  assert.ok(p.user.indexOf('(A1)') < p.user.indexOf('(A2)'));
  assert.match(p.user, /Timeline \(2 Activity/);
  assert.match(p.user, /บจก\. หนึ่ง/);
  assert.match(p.user, /1\. ก\n2\. ข/);
  assert.match(p.system, /SPECIAL = กรณีพิเศษ/);
});

test('validateCaseReview_ คิดคะแนนและทำความสะอาดข้อมูล', () => {
  const r = G.validateCaseReview_({
    summary: 'ส', criteria: [{ name: 'ก', result: 'yes', comment: '' }, { name: 'ข', result: 'partial', comment: '' }],
    missing_steps: ['x', ' '], inconsistencies: ['ราคาไม่ตรง'], ready_to_close: true, next_step: 'ส่งอนุมัติ', risk: 'weird',
    savings: { vendor_selected: 'V', initial_price: '100000', final_price: 90000, estimate_price: null, quantity: null, price_basis: 'total' }
  }, ['ก', 'ข']);
  assert.equal(r.score, 75);
  assert.equal(r.grade, 'B');
  assert.deepEqual(plain(r.missing_steps), ['x']);
  assert.equal(r.risk, 'medium');
  assert.equal(r.savings.initial_price, 100000);
  assert.equal(r.ready_to_close, true);
});

test('Dashboard ใช้ savings จาก Case review ก่อน และสรุป ai.cases', () => {
  const d = fixtures(G);
  d.caseReviews = {
    C1: { score: 80, grade: 'B', summary: 's', criteria: [], missing_steps: [], inconsistencies: ['ราคา CLOSED ไม่ตรงกับ NEGOTIATION'],
      ready_to_close: true, next_step: 'n', risk: 'high', stale: false,
      savings: { initial_price: 200000, final_price: 150000, estimate_price: null, quantity: null, price_basis: 'total' } }
  };
  const dash = G.computeDashboard_(d);
  const c1 = dash.cases.find(c => c.id === 'C1');
  assert.equal(c1.savings.saving, 50000);
  assert.equal(c1.savings.source, 'case');
  assert.equal(c1.caseReview.readyToClose, true);
  // C2 มีแค่ CONTACT VENDOR → ยังไม่สรุปผล ไม่นับว่ารอตรวจ
  assert.deepEqual(plain(dash.ai.cases), { reviewed: 1, pending: 0, waitingClose: 1, avgScore: 80, readyToClose: 1,
    withInconsistency: 1, highRisk: 1 });
  assert.equal(dash.cases.find(c => c.id === 'C1').caseReviewEligible, true);
  assert.equal(dash.cases.find(c => c.id === 'C2').caseReviewEligible, false);
  const h = G.checkDataHealth_(d, dash);
  assert.ok(h.issues.some(i => i.code === 'CASE_AI_INCONSISTENT' && i.caseId === 'C1'));
  // ไม่มี Case review → ใช้วิธีเดิมจาก Activity
  delete d.caseReviews;
  const c1b = G.computeDashboard_(d).cases.find(c => c.id === 'C1');
  assert.equal(c1b.savings.source, 'activity');
});

test('scoreCriteria_ จับคู่ชื่อเกณฑ์ที่ AI ใส่เลขลำดับนำหน้า (ไม่เติมซ้ำ)', () => {
  const expected = ['ระบุเหตุผลที่ใช้ Vendor รายเดียว', 'มีราคาอ้างอิง', 'Next action ล่าสุดชัดเจน'];
  const ai = [
    { name: '1. ระบุเหตุผลที่ใช้ Vendor รายเดียว', result: 'no', comment: 'ไม่พบ' },
    { name: '2) มีราคาอ้างอิง', result: 'yes', comment: '' },
    { name: 'ข้อ 3 Next action ล่าสุดชัดเจน', result: 'yes', comment: '' }
  ];
  const r = G.scoreCriteria_(ai, expected);
  assert.equal(r.criteria.length, 3);
  assert.equal(r.score, 67);
  assert.deepEqual(plain(r.criteria.map(c => c.name)), expected);
  assert.ok(!r.criteria.some(c => /ไม่ได้ประเมิน/.test(c.comment)));
  // ชื่อเพี้ยนแต่จำนวนเท่ากัน → จับคู่ตามลำดับ
  const r2 = G.scoreCriteria_([{ name: 'x', result: 'yes' }, { name: 'y', result: 'yes' }, { name: 'z', result: 'no' }], expected);
  assert.equal(r2.score, 67);
  // ตอบไม่ครบจริง → ข้อที่ขาดนับเป็น no
  const r3 = G.scoreCriteria_([{ name: 'มีราคาอ้างอิง', result: 'yes' }], expected);
  assert.equal(r3.criteria.length, 3);
  assert.equal(r3.score, 33);
  assert.equal(r3.criteria[0].comment, '(AI ไม่ได้ประเมินเกณฑ์นี้)');
});

test('caseReviewEligible_: ตรวจทั้ง Case เมื่อมี Activity CLOSED หรือสถานะ CLOSED เท่านั้น', () => {
  assert.equal(G.caseReviewEligible_(CASE, [A1]), false);                       // CONTACT VENDOR อย่างเดียว
  assert.equal(G.caseReviewEligible_(CASE, [A1, { ...A1, Activity_Type: 'NEGOTIATION' }]), false);
  assert.equal(G.caseReviewEligible_(CASE, [A1, A2]), true);                    // มี CLOSED
  assert.equal(G.caseReviewEligible_({ ...CASE, Status: 'CLOSED' }, [A1]), true);
  assert.equal(G.caseReviewEligible_({ ...CASE, Status: 'CANCELLED' }, [A1]), false);
  // ยังไม่สรุปผลและไม่เคยตรวจ → ไม่เข้าคิว
  assert.equal(G.pendingCases_([CASE], { C1: [A1] }, {}, 'v').length, 0);
  assert.equal(G.pendingCases_([CASE], { C1: [A1, A2] }, {}, 'v').length, 1);
});

test('withEpoch_ + needsCatchUp_: "ตรวจใหม่ทั้งหมด" ทำให้รายการที่ตรวจแล้วกลับมารอตรวจ และตรวจต่อเนื่องจนครบ', () => {
  assert.equal(G.withEpoch_('v', { REVIEW_EPOCH: '' }), 'v');
  assert.equal(G.withEpoch_('v', {}), 'v');
  const v2 = G.withEpoch_('v', { REVIEW_EPOCH: 1760000000000 });
  assert.notEqual(v2, 'v');
  // Case ที่สรุปผลแล้วและตรวจแล้ว → พอเปลี่ยนรอบต้องกลับเข้าคิว; Case ที่ยังไม่สรุปผลยังไม่เข้า
  const C2 = { ...CASE, Case_ID: 'C2' };
  const B1 = { ...A1, Activity_ID: 'B1', Case_ID: 'C2', Activity_Type: 'CLOSED' };
  const acts = { C1: [A1], C2: [B1] };
  const reviewed = { C2: { hash: G.caseFingerprint_(C2, [B1], 'v') } };
  assert.equal(G.pendingCases_([CASE, C2], acts, reviewed, 'v').length, 0);
  assert.deepEqual(plain(G.pendingCases_([CASE, C2], acts, reviewed, v2).map(c => c.Case_ID)), ['C2']);
  // Activity
  const crit = 'cv';
  const actRev = { [A1.Activity_ID]: { hash: G.activityFingerprint_(A1, crit, 'NORMAL') } };
  assert.equal(G.pendingActivities_([A1], actRev, crit, { C1: 'NORMAL' }).length, 0);
  assert.equal(G.pendingActivities_([A1], actRev, G.withEpoch_(crit, { REVIEW_EPOCH: 1 }), { C1: 'NORMAL' }).length, 1);
  // ตรวจต่อเนื่อง
  assert.equal(G.needsCatchUp_({ pending: 40, reviewed: 15, cases_pending: 0, cases_reviewed: 0 }), true);
  assert.equal(G.needsCatchUp_({ pending: 10, reviewed: 10, cases_pending: 5, cases_reviewed: 2 }), true);
  assert.equal(G.needsCatchUp_({ pending: 40, reviewed: 0, cases_pending: 5, cases_reviewed: 0 }), false); // ไม่มีความคืบหน้า (key/quota มีปัญหา)
  assert.equal(G.needsCatchUp_({ pending: 3, reviewed: 3, cases_pending: 1, cases_reviewed: 1 }), false);
  assert.equal(G.needsCatchUp_({ skipped: 'x' }), false);
});
