import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDomainVerification } from "../src/server/settings";

// رمز إثبات ملكية النطاق: يُقبل الرمز وحده أو الوسم كاملًا، والفارغ يحذف، وغير الصالح يُرفض.
test("domain verification accepts the code or the full tag", () => {
  const code =
    "aed803b71f263ba31aa9162eca5e837d59c709569175f3879002a44cf3b04496";
  assert.equal(parseDomainVerification({ code }), code);
  assert.equal(
    parseDomainVerification({
      code: `<meta name="domain-verification" content="${code}">`,
    }),
    code,
  );
  assert.equal(
    parseDomainVerification({
      code: `  <meta name='domain-verification' content='${code}' />  `,
    }),
    code,
  );
  assert.equal(
    parseDomainVerification({ code: `domain-verification=${code}` }),
    code,
  );
  assert.equal(parseDomainVerification({ code: "" }), "");
  assert.throws(() =>
    parseDomainVerification({ code: '"><script>x</script>' }),
  );
  assert.throws(() => parseDomainVerification({ code: "short" }));
  assert.throws(() => parseDomainVerification({ code, extra: 1 }));
});
