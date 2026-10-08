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
