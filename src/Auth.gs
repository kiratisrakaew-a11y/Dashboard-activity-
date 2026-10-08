/**
 * Auth — อนุญาตเฉพาะผู้ใช้ Role = HEAD และ Is_Active = TRUE ในชีต Users ของ DB
 */

function currentEmail_() {
  return String(Session.getActiveUser().getEmail() || '').toLowerCase();
}

function findHead_(email) {
  if (!email) return null;
  var users = DbReader.readUsers();
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (String(u.Email).toLowerCase() === email && u.Role === 'HEAD' && u.Is_Active === true) return u;
  }
  return null;
}

/** ใช้ในทุก API ที่ client เรียก — throw ถ้าไม่ใช่ HEAD */
function requireHead_() {
  var email = currentEmail_();
  var u = findHead_(email);
  if (!u) throw new Error('ไม่มีสิทธิ์เข้าใช้ (' + (email || 'ไม่ทราบอีเมล') + ') — เฉพาะ HEAD เท่านั้น');
  return u;
}
