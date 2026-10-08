const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./load')();
// ค่าที่มาจาก vm context มี prototype คนละ realm → แปลงเป็น plain ก่อนเทียบ
const plain = (x) => JSON.parse(JSON.stringify(x));
const fixtures = require('./fixtures');

test('dayNum_ ใช้เวลาไทย (UTC+7)', () => {
  assert.equal(G.dayStr_(G.dayNum_('2026-09-30T17:00:00.000Z')), '2026-10-01');
  assert.equal(G.dayStr_(G.dayNum_('2026-10-01T16:59:00.000Z')), '2026-10-01');
  assert.equal(G.dayNum_(''), null);
  assert.equal(G.dayStr_(G.weekStart_(G.dayNum_('2026-10-08T03:00:00.000Z'))), '2026-10-05'); // วันจันทร์
});

test('computeDashboard_: ภาพรวม / next action / savings', () => {
  const d = fixtures(G);
  const dash = G.computeDashboard_(d);
  const o = dash.overview;
  assert.equal(o.totalCases, 3);
  assert.equal(o.openCases, 3);
  assert.equal(o.totalActivities, 4);
  assert.equal(o.overdueNextActions, 0);
  assert.equal(o.forgotDone, 2);          // A1, A2 มี Activity ใหม่ตามมาแล้ว
  assert.equal(o.dueSoon, 1);             // A4 ครบกำหนดพรุ่งนี้
  assert.equal(o.staleCases, 1);          // C3
  assert.equal(o.noActivityCases, 1);
  assert.equal(o.pastRequired, 1);        // C1
  assert.equal(o.closedButOpen, 1);       // C1
  assert.equal(o.fewQuotes, 1);           // C1 NORMAL, 2 vendors < 3
  assert.equal(o.savingsTotal, 20000);    // (100000-90000) × 2 จาก CLOSED activity
  assert.equal(o.savingsPct, 10);

  const c1 = dash.cases.find(c => c.id === 'C1');
  assert.equal(c1.stage, 3);
  assert.equal(c1.vendorsContacted, 2);
  assert.equal(c1.firstResponseDays, 0);
  assert.equal(c1.savings.vsEstimatePct, 5.88);
  const c2 = dash.cases.find(c => c.id === 'C2');
  assert.equal(c2.firstResponseDays, 5);
  assert.equal(c2.stale, false);

  const a = dash.buyers.find(b => b.email === 'a@x.co');
  assert.equal(a.avgScore, 70);
  assert.equal(a.lowScore, 1);
  assert.equal(a.openCases, 2);
  assert.equal(dash.ai.reviewed, 2);
  assert.equal(dash.ai.pending, 2);
  assert.equal(dash.funnel.find(f => f.stage === 3).count, 1);
});

test('computeSavings_ ปฏิเสธข้อมูลที่ไม่สมเหตุสมผล', () => {
  assert.equal(G.computeSavings_(null), null);
  assert.equal(G.computeSavings_({ extracted: { initial_price: 100, final_price: 120 } }), null);
  assert.equal(G.computeSavings_({ extracted: { initial_price: null, final_price: 120 } }), null);
});

test('checkDataHealth_ เจอปัญหาที่คาดไว้', () => {
  const d = fixtures(G);
  const dash = G.computeDashboard_(d);
  const h = G.checkDataHealth_(d, dash);
  const codes = h.issues.map(i => i.code + ':' + i.recordId).sort();
  assert.deepEqual(plain(codes), [
    'ACT_FORGOT_DONE:A1', 'ACT_FORGOT_DONE:A2', 'ACT_NO_CHANNEL:A2', 'ACT_SHORT_DESC:A1',
    'ACT_TYPE_MISMATCH:A3', 'ACT_UNKNOWN_VENDOR:A4', 'ACT_VENDOR_BLACKLIST:A3',
    'CASE_CLOSED_ACTIVITY_STILL_OPEN:C1', 'CASE_FEW_QUOTES:C1', 'CASE_INTAKE_INCOMPLETE:C2', 'CASE_NO_ACTIVITY:C3',
    'CASE_REQUIRED_BEFORE_REQUEST:C1'
  ]);
  assert.equal(h.issues[0].severity, 'high');
  assert.equal(h.issues.find(i => i.code === 'ACT_NO_CHANNEL').row, 3);
});

test('SPECIAL ไม่ถูกตรวจเรื่องจำนวนคู่เทียบ และมีคะแนนแยกตาม Method', () => {
  const d = fixtures(G);
  d.cases[0].Method = 'SPECIAL';                    // C1 เลือก Vendor รายเดียวได้
  const dash = G.computeDashboard_(d);
  const h = G.checkDataHealth_(d, dash);
  assert.equal(h.issues.filter(i => i.code === 'CASE_FEW_QUOTES').length, 0);
  assert.equal(dash.overview.fewQuotes, 0);
  assert.deepEqual(plain(dash.ai.byMethod), { SPECIAL: { avg: 70, count: 2 } });
  assert.equal(dash.activities.find(a => a.id === 'A1').method, 'SPECIAL');
});

test('summarizeSavings_: % ถ่วงน้ำหนัก, % เฉลี่ยต่อ Case, จำนวน, เทียบประมาณการ', () => {
  const mk = (ini, fin, qty, est) => ({ savings: G.computeSavingsFrom_({ initial_price: ini, final_price: fin, quantity: qty,
    price_basis: qty ? 'per_unit' : 'total', estimate_price: est }) });
  const cases = [
    mk(100000, 90000, null, 95000),   // ลด 10,000 (10%) ต่ำกว่าประมาณการ
    mk(1000, 500, 2, null),           // ลด 500×2 = 1,000 (50%)
    mk(50000, 50000, null, null),     // ไม่ได้ลด (0%)
    { savings: null }                 // ไม่มีตัวเลข → ไม่นับ
  ];
  const n = G.summarizeSavings_(cases);
  assert.equal(n.cases, 3);
  assert.equal(n.initial, 152000);
  assert.equal(n.saving, 11000);
  assert.equal(n.pct, 7.24);           // 11000 / 152000
  assert.equal(n.avgPct, 20);          // (10 + 50 + 0) / 3
  assert.equal(n.minPct, 0);
  assert.equal(n.maxPct, 50);
  assert.equal(n.vsEstimatePct, -5.26); // (90000 - 95000) / 95000
  const empty = G.summarizeSavings_([]);
  assert.equal(empty.cases, 0);
  assert.equal(empty.pct, null);
  assert.equal(empty.vsEstimatePct, null);
});

test('computeDashboard_: ผลการต่อรองรายคน และรวมทั้งทีม', () => {
  const d = fixtures(G);
  const dash = G.computeDashboard_(d);
  const a = dash.buyers.find(b => b.email === 'a@x.co');
  const b = dash.buyers.find(b => b.email === 'b@x.co');
  assert.equal(a.nego.cases, 1);
  assert.equal(a.nego.saving, 20000);
  assert.equal(a.nego.pct, 10);
  assert.equal(a.nego.vsEstimatePct, 5.88);
  assert.equal(a.closedCases, 1);
  assert.equal(b.nego.cases, 0);
  assert.equal(b.nego.pct, null);
  assert.equal(dash.nego.saving, 20000);
  assert.equal(dash.overview.savingsPct, 10);
  assert.equal(dash.overview.savingsTotal, 20000);
});

test('priceGapReason_ บอกสาเหตุที่วัดผลการต่อรองไม่ได้', () => {
  const P = (i, f) => ({ initial_price: i, final_price: f });
  // จาก AI ตรวจทั้ง Case
  assert.equal(G.priceGapReason_(P(null, null), []), 'NO_BOTH');
  assert.equal(G.priceGapReason_(P(null, 900), []), 'NO_INITIAL');
  assert.equal(G.priceGapReason_(P(1000, null), []), 'NO_FINAL');
  assert.equal(G.priceGapReason_(P(1000, 1200), []), 'INVALID');
  // จาก AI ราย Activity
  assert.equal(G.priceGapReason_(null, []), 'NOT_REVIEWED');
  assert.equal(G.priceGapReason_(null, [null, null]), 'NOT_REVIEWED');
  assert.equal(G.priceGapReason_(null, [P(null, null)]), 'NO_BOTH');
  assert.equal(G.priceGapReason_(null, [P(1000, null), P(null, null)]), 'NO_FINAL');
  assert.equal(G.priceGapReason_(null, [P(1000, null), P(null, 900)]), 'SPLIT');
});

test('Case ที่ต่อรองแล้วแต่ไม่มีราคา → priceGap, นับรายคน และขึ้น Data Health', () => {
  const d = fixtures(G);
  // C2 ของ buyer b: เพิ่ม NEGOTIATION ที่ไม่มีตัวเลข และ AI ตรวจแล้วไม่พบราคาเริ่มต้น
  d.activities.push({ _row: 6, Activity_ID: 'A5', Case_ID: 'C2', Vendor_ID: 'V1', Activity_Date: '2026-10-07T06:00:00.000Z',
    Activity_Type: 'NEGOTIATION', Channel: 'LINE', Activity_Description: 'ต่อรองแล้ว ได้ราคา 50,000 บาท', Performed_By: 'b@x.co',
    Next_Action: '', Next_Action_Date: '', Next_Action_Done: false, Version: 1 });
  d.reviews.A5 = { score: 60, grade: 'C', criteria: [],
    extracted: { initial_price: null, final_price: 50000, estimate_price: null, quantity: null, price_basis: 'total' } };
  const dash = G.computeDashboard_(d);
  const c2 = dash.cases.find(c => c.id === 'C2');
  assert.equal(c2.priceGap.code, 'NO_INITIAL');
  assert.equal(dash.cases.find(c => c.id === 'C1').priceGap, null);   // มีตัวเลขครบ
  assert.equal(dash.cases.find(c => c.id === 'C3').priceGap, null);   // ยังไม่ถึงขั้นต่อรอง
  assert.equal(dash.buyers.find(b => b.email === 'b@x.co').nego.unmeasured, 1);
  assert.equal(dash.nego.unmeasured, 1);
  const h = G.checkDataHealth_(d, dash);
  assert.ok(h.issues.some(i => i.code === 'CASE_NO_PRICE' && i.caseId === 'C2' && /ราคาเริ่มต้น/.test(i.detail)));
  // ยังไม่ถูกตรวจ → นับเป็นรอ AI ไม่ขึ้น Data Health
  delete d.reviews.A5;
  const dash2 = G.computeDashboard_(d);
  assert.equal(dash2.cases.find(c => c.id === 'C2').priceGap.code, 'NOT_REVIEWED');
  assert.equal(dash2.nego.notReviewed, 1);
  assert.equal(dash2.nego.unmeasured, 0);
  assert.ok(!G.checkDataHealth_(d, dash2).issues.some(i => i.code === 'CASE_NO_PRICE'));
});

test('summarizeVendors_: เฉลี่ย Vendor ที่ติดต่อ/ต่อรองต่อ Case แยก NORMAL/SPECIAL', () => {
  const C = (method, contacted, negotiated, acts = 1, closed = true) => ({ method, vendorsContacted: contacted, vendorsNegotiated: negotiated,
    activityCount: acts, hasClosedActivity: closed });
  const v = G.summarizeVendors_([C('NORMAL', 4, 2), C('NORMAL', 1, 1), C('SPECIAL', 1, 1), C('NORMAL', 0, 0, 0),
    C('NORMAL', 1, 0, 1, false)], 3);
  assert.equal(v.cases, 4);                 // ไม่นับ Case ที่ไม่มี Activity
  assert.equal(v.avgContacted, 1.8);        // (4+1+1+1)/4
  assert.equal(v.avgNegotiated, 1);         // (2+1+1+0)/4
  assert.equal(v.normal.cases, 3);
  assert.equal(v.normal.avgContacted, 2);   // (4+1+1)/3
  assert.equal(v.normal.belowMin, 1);       // นับเฉพาะที่สรุปผลแล้ว (ตัวที่ยังขอราคาไม่นับ)
  assert.equal(v.special.avgContacted, 1);
  assert.equal(v.normal.metMin, 1);         // มีแค่ Case ที่ติดต่อ 4 ราย
  const e = G.summarizeVendors_([], 3);
  assert.equal(e.cases, 0);
  assert.equal(e.avgContacted, null);
});

test('computeDashboard_: vendorStats ราย Buyer และทั้งทีม', () => {
  const d = fixtures(G);
  const dash = G.computeDashboard_(d);
  const c1 = dash.cases.find(c => c.id === 'C1');
  assert.equal(c1.vendorsContacted, 2);
  assert.equal(c1.vendorsNegotiated, 2);    // V1 (NEGOTIATION) + V2 (CLOSED)
  const a = dash.buyers.find(b => b.email === 'a@x.co').vendorStats;
  assert.equal(a.cases, 1);                 // C3 ไม่มี Activity
  assert.equal(a.normal.avgContacted, 2);
  assert.equal(a.normal.belowMin, 1);
  assert.equal(dash.vendorStats.cases, 2);
  assert.equal(dash.vendorStats.avgNegotiated, 1);  // C1=2, C2=0
  assert.equal(dash.vendorStats.negotiatedCases, 1); // C1 มี NEGOTIATION
  assert.equal(dash.vendorStats.negotiatedPct, 50);
});

test('week ของ Case/Activity ตรงกับ weekly[] และ byMethodAll นับทุก Case (ใช้กับกราฟที่คลิกได้)', () => {
  const d = fixtures(G);
  const dash = G.computeDashboard_(d);
  dash.weekly.forEach((w) => {
    assert.equal(dash.activities.filter((a) => a.week === w.week).length, w.activities);
    assert.equal(dash.cases.filter((c) => c.week === w.week).length, w.newCases);
  });
  const all = Object.values(dash.breakdown.byMethodAll).reduce((s, n) => s + n, 0);
  assert.equal(all, dash.cases.length);
  assert.equal(G.weekKey_(null), '');
});

test('caseValue_: ราคาสุดท้าย → ราคาเสนอแรก → ประมาณการ, คูณจำนวน, ผลทั้ง Case มาก่อน', () => {
  const v = (a, b) => plain(G.caseValue_(a, b));
  assert.equal(G.caseValue_(null, []), null);
  assert.equal(G.caseValue_({ final_price: null, initial_price: 0 }, [null]), null);
  assert.deepEqual(v({ final_price: 900, initial_price: 1000 }, [{ final_price: 5 }]), { value: 900, basis: 'final', source: 'case' });
  assert.deepEqual(v({ initial_price: 1000 }, []), { value: 1000, basis: 'initial', source: 'case' });
  assert.deepEqual(v(null, [{ estimate_price: 50, quantity: 3, price_basis: 'per_unit' }]), { value: 150, basis: 'estimate', source: 'activity' });
  // ราคาสุดท้ายจาก Activity ใดก็ได้ ดีกว่าราคาเสนอแรกจาก Activity แรกในลำดับ
  assert.deepEqual(v(null, [{ initial_price: 1000 }, { final_price: 800 }]), { value: 800, basis: 'final', source: 'activity' });
});

test('computeDashboard_: มูลค่า Case, วันที่สรุปผล และวันที่ใช้จัดอันดับ', () => {
  const dash = G.computeDashboard_(fixtures(G));
  const c1 = dash.cases.find((c) => c.id === 'C1');
  assert.equal(c1.closedDate, '2026-10-06');
  assert.equal(c1.rankDate, '2026-10-06');
  assert.equal(c1.value.basis, 'final');
  assert.equal(c1.value.value, c1.savings.final * c1.savings.quantity);
  const c2 = dash.cases.find((c) => c.id === 'C2');
  assert.equal(c2.closedDate, '');
  assert.equal(c2.rankDate, '2026-10-07');
  assert.equal(c2.value, null);
  assert.equal(dash.cases.find((c) => c.id === 'C3').rankDate, '');
});
