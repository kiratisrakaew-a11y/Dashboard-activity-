/**
 * Config — ค่าตั้งต้นและการอ่านค่าตั้ง
 *
 * ลำดับความสำคัญ: Settings ชีตใน AI Store  >  Script Properties  >  DEFAULTS
 * API key อ่านจาก Script Properties เท่านั้น (ห้ามเก็บในชีต)
 */

var DEFAULTS = {
  DB_ID: '1fs5fP-xcqLbx76czQj-h6caCWxFXOc18i2DEZkLHRW4', // Buyer Procurement Activity — DB (อ่านอย่างเดียว)
  AI_PROVIDER: 'claude',          // openai | gemini | claude
  AI_MODEL: '',                   // ว่าง = ใช้ DEFAULT_MODELS[provider]
  AI_EFFORT: 'low',               // ใช้กับ Claude เท่านั้น
  STALE_DAYS: 3,                  // Case ที่ไม่มี Activity เกินกี่วันถือว่านิ่ง
  SCORE_THRESHOLD: 60,            // คะแนน AI ต่ำกว่านี้ = ต้องปรับปรุง
  MIN_QUOTES: 3,                  // จำนวน vendor ขั้นต่ำที่ควรเทียบราคา
  SHORT_DESC_CHARS: 30,           // คำอธิบายสั้นกว่านี้ = สั้นเกินไป
  BATCH_SIZE: 15,                 // จำนวน Activity ที่ AI ตรวจต่อรอบ
  CASE_BATCH_SIZE: 10,            // จำนวน Case ที่ AI ตรวจทั้ง Case ต่อรอบ
  WORK_START: '08:00',            // เวลาเริ่มงาน (ใช้คิดระยะเวลา Case เป็นเวลาทำงาน)
  WORK_END: '17:00',              // เวลาเลิกงาน — ไม่นับ ส.–อา. และวันในชีต Holidays ของ AI Store
  CACHE_SECONDS: 300              // แคชข้อมูลที่อ่านจาก DB
};

var DEFAULT_MODELS = {
  openai: 'gpt-4.1-mini',
  gemini: 'gemini-2.5-flash',
  claude: 'claude-opus-5-5'
};

var API_KEY_PROPS = {
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  claude: 'ANTHROPIC_API_KEY'
};

/** คีย์ที่ HEAD เปลี่ยนได้จากหน้า UI (เก็บในชีต Settings ของ AI Store) */
var EDITABLE_SETTINGS = ['AI_PROVIDER', 'AI_MODEL', 'AI_EFFORT', 'STALE_DAYS', 'SCORE_THRESHOLD',
  'MIN_QUOTES', 'SHORT_DESC_CHARS', 'BATCH_SIZE', 'CASE_BATCH_SIZE', 'WORK_START', 'WORK_END'];

var configMemo_ = null; // memo ต่อ 1 execution

function getConfig_() {
  if (configMemo_) return configMemo_;
  var props = PropertiesService.getScriptProperties().getProperties();
  var cfg = {};
  Object.keys(DEFAULTS).forEach(function (k) { cfg[k] = DEFAULTS[k]; });
  Object.keys(props).forEach(function (k) {
    if (k in DEFAULTS && props[k] !== '') cfg[k] = props[k];
  });
  cfg.STORE_ID = props.STORE_ID || '';
  if (cfg.STORE_ID) {
    var overrides = Store.readSettings(cfg.STORE_ID, cfg.DB_ID);
    EDITABLE_SETTINGS.forEach(function (k) {
      if (overrides[k] !== undefined && overrides[k] !== '') cfg[k] = overrides[k];
    });
  }
  ['STALE_DAYS', 'SCORE_THRESHOLD', 'MIN_QUOTES', 'SHORT_DESC_CHARS', 'BATCH_SIZE', 'CASE_BATCH_SIZE', 'CACHE_SECONDS']
    .forEach(function (k) { cfg[k] = Number(cfg[k]); });
  cfg.AI_PROVIDER = String(cfg.AI_PROVIDER).toLowerCase();
  if (!cfg.AI_MODEL) cfg.AI_MODEL = DEFAULT_MODELS[cfg.AI_PROVIDER] || '';
  configMemo_ = cfg;
  return cfg;
}

function getApiKey_(provider) {
  var prop = API_KEY_PROPS[provider];
  if (!prop) throw new Error('ไม่รู้จัก AI provider: ' + provider);
  var key = PropertiesService.getScriptProperties().getProperty(prop);
  if (!key) throw new Error('ยังไม่ได้ตั้ง Script Property ' + prop);
  return key;
}
