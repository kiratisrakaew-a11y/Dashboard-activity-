// ข้อมูลสมมติ (ไม่ใช่ข้อมูลจริงจาก DB)
module.exports = function fixtures(G) {
  const today = G.dayNum_('2026-10-08T03:00:00.000Z');
  const cfg = { STALE_DAYS: 3, SCORE_THRESHOLD: 60, MIN_QUOTES: 3, SHORT_DESC_CHARS: 30 };
  const users = [
    { Email: 'head@x.co', Name: 'head', Role: 'HEAD', Is_Active: true },
    { Email: 'a@x.co', Name: 'buyerA', Role: 'BUYER', Is_Active: true },
    { Email: 'b@x.co', Name: 'buyerB', Role: 'BUYER', Is_Active: true }
  ];
  const cases = [
    { _row: 2, Case_ID: 'C1', Request_Date: '2026-09-30T17:00:00.000Z', Required_Date: '2026-09-07T17:00:00.000Z',
      Department_Code: 'AIR', Method: 'NORMAL', Budget_Type: 'OPEX', Sub_Type: 'S1', Buyer_Owner: 'a@x.co',
      Status: 'OPEN', Intake_Complete: true, PR_No: '' },
    { _row: 3, Case_ID: 'C2', Request_Date: '2026-10-01T17:00:00.000Z', Required_Date: '',
      Department_Code: 'DGT', Method: 'SPECIAL', Budget_Type: 'CAPEX', Sub_Type: 'S2', Buyer_Owner: 'b@x.co',
      Status: 'OPEN', Intake_Complete: false, PR_No: '' },
    { _row: 4, Case_ID: 'C3', Request_Date: '2026-09-20T17:00:00.000Z', Required_Date: '2026-12-01T17:00:00.000Z',
      Department_Code: 'AIR', Method: 'NORMAL', Budget_Type: 'OPEX', Sub_Type: 'S1', Buyer_Owner: 'a@x.co',
      Status: 'OPEN', Intake_Complete: true, PR_No: '' }
  ];
  const activities = [
    { _row: 2, Activity_ID: 'A1', Case_ID: 'C1', Vendor_ID: 'V1', Activity_Date: '2026-10-01T04:00:00.000Z',
      Activity_Type: 'CONTACT VENDOR', Channel: 'LINE', Activity_Description: 'ขอราคา', Performed_By: 'a@x.co',
      Next_Action: 'ติดตามใบเสนอราคา', Next_Action_Date: '2026-10-02T17:00:00.000Z', Next_Action_Done: false, Version: 1 },
    { _row: 3, Activity_ID: 'A2', Case_ID: 'C1', Vendor_ID: 'V1', Activity_Date: '2026-10-05T04:00:00.000Z',
      Activity_Type: 'NEGOTIATION', Channel: '', Activity_Description: 'ต่อรองราคา Rev.0 = 100,000 บาท เหลือ 90,000 บาท ลดลง 10%',
      Performed_By: 'a@x.co', Next_Action: 'รออนุมัติ', Next_Action_Date: '2026-10-06T17:00:00.000Z', Next_Action_Done: false, Version: 2 },
    { _row: 4, Activity_ID: 'A3', Case_ID: 'C1', Vendor_ID: 'V2', Activity_Date: '2026-10-06T04:00:00.000Z',
      Activity_Type: 'CLOSED', Channel: 'EMAIL', Activity_Description: 'เลือก V2 ราคาต่ำสุด Final 90,000 บาท เครดิต 30 วัน',
      Performed_By: 'a@x.co', Next_Action: '', Next_Action_Date: '', Next_Action_Done: false, Version: 1 },
    { _row: 5, Activity_ID: 'A4', Case_ID: 'C2', Vendor_ID: 'V9', Activity_Date: '2026-10-07T04:00:00.000Z',
      Activity_Type: 'CONTACT VENDOR', Channel: 'PHONE', Activity_Description: 'ติดต่อคุณแป้ง ขอราคางานโครงสร้างตาม BOQ',
      Performed_By: 'b@x.co', Next_Action: 'ติดตาม', Next_Action_Date: '2026-10-08T17:00:00.000Z', Next_Action_Done: false, Version: 1 }
  ];
  const vendors = { V1: { name: 'บจก. หนึ่ง', status: 'APPROVED' }, V2: { name: 'บจก. สอง', status: 'BLACKLIST' } };
  const reviews = {
    A2: { score: 50, grade: 'C', type_mismatch: false, criteria: [],
      extracted: { initial_price: 100000, final_price: 90000, estimate_price: null, quantity: null, price_basis: 'total' } },
    A3: { score: 90, grade: 'A', type_mismatch: true, suggested_type: 'NEGOTIATION', criteria: [],
      extracted: { initial_price: 100000, final_price: 90000, estimate_price: 85000, quantity: 2, price_basis: 'per_unit' } }
  };
  return { cfg, users, cases, activities, vendors, reviews, today, settings: {} };
};
