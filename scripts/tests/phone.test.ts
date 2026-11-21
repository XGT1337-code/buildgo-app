import assert from "node:assert/strict";
import { cleanNational, phoneError, phoneDigitLimit, toInternational } from "../../artifacts/agrolink/lib/phone";

for (const [country, dial, national, expected] of [
  ["AZ", "994", "501234567", "+994501234567"],
  ["AZ", "994", "0501234567", "+994501234567"],
  ["RU", "7", "9123456789", "+79123456789"],
  ["RU", "7", "89123456789", "+79123456789"],
  ["KZ", "7", "7012345678", "+77012345678"],
  ["US", "1", "2025550123", "+12025550123"],
  ["TR", "90", "5321234567", "+905321234567"],
  ["GB", "44", "07700900123", "+447700900123"],
  ["IT", "39", "0212345678", "+390212345678"],
  ["DE", "49", "15123456789", "+4915123456789"],
  ["BS", "1", "2423591234", "+12423591234"],
]) {
  assert.equal(phoneError(national, dial, country), null, country);
  assert.equal(toInternational(national, dial, country), expected, country);
  assert.ok(phoneDigitLimit(country) >= national.length, country);
}
assert.equal(cleanNational("+994 50 123 45 67", "994"), "501234567");
assert.equal(cleanNational("00994 50 123 45 67", "994"), "501234567");
assert.equal(cleanNational("0212345678", "39"), "0212345678");
assert.ok(phoneError("50123", "994", "AZ"));
assert.ok(phoneError("50123456789", "994", "AZ"));
assert.ok(phoneError("202555012", "1", "US"));
assert.equal(phoneError("", "994", "AZ"), null);
console.log("Phone normalization, country lengths and paste tests passed.");
