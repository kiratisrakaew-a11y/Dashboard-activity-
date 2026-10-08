#!/usr/bin/env bash
# ตรวจว่าโค้ดไม่มีทางเขียนลง DB "Buyer Procurement Activity — DB"
#  1) DbReader.gs ต้องไม่มีคำสั่งเขียนของ SpreadsheetApp
#  2) openById(...DB_ID) ต้องอยู่ใน DbReader.gs เท่านั้น
#  3) ไฟล์อื่นห้ามใส่ DB ID ตรงๆ (ยกเว้น Config.gs ที่เป็นค่าเริ่มต้น)
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0
DB_ID='1fs5fP-xcqLbx76czQj-h6caCWxFXOc18i2DEZkLHRW4'
WRITE_RE='\.(setValue|setValues|setFormula|setFormulas|setFormulaR1C1|setRichTextValue|setNote|setNotes|appendRow|insertRow|insertRows|insertRowAfter|insertRowBefore|insertColumn|deleteRow|deleteRows|deleteColumn|clear|clearContent|clearContents|clearFormats|sort|setName|insertSheet|deleteSheet|copyTo|moveTo|protect|setDataValidation|setBackground|setFontWeight|setFrozenRows|hideSheet|createTextFinder|replaceAllWith|randomize|trimWhitespace|removeDuplicates|setActiveSheet|setSpreadsheetTimeZone|addEditor|addViewer)\('

if grep -nE "$WRITE_RE" src/DbReader.gs; then
  echo "✗ DbReader.gs มีคำสั่งเขียน — ห้ามเด็ดขาด"; fail=1
fi
if grep -rnE 'openById\([^)]*DB_ID' src --include='*.gs' | grep -v '^src/DbReader.gs:'; then
  echo "✗ มีไฟล์อื่นนอกจาก DbReader.gs เปิด DB"; fail=1
fi
if grep -rn "$DB_ID" src --include='*.gs' --include='*.html' | grep -v '^src/Config.gs:'; then
  echo "✗ พบ DB ID ใส่ตรงๆ นอก Config.gs"; fail=1
fi
if ! grep -q "storeId === dbId" src/Store.gs; then
  echo "✗ Store.gs ต้องมีการป้องกัน STORE_ID === DB_ID"; fail=1
fi
if [ "$fail" = 0 ]; then echo "✓ read-only check ผ่าน"; fi
exit $fail
