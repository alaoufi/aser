import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SessionUser } from "../src/lib/types";
import { cleanPhone } from "../src/server/directory";

/**
 * «دليلي» و«طلبات العملاء» (قرار المالك 2026-11-22): الدليل لصاحبه وحده، ويظهر فيه من بيانات تواصل
 * الأسرة ما تسمح به فقط. وطلب العميل لا يُظهر اسمه أو جواله أو واتسابه إلا بموافقته على كل واحد.
 */
test("phone numbers are cleaned to one form, and junk is refused", () => {
  assert.equal(cleanPhone("0551234567"), "+966551234567");
  assert.equal(cleanPhone("055 123 4567"), "+966551234567");
  assert.equal(cleanPhone("٠٥٥١٢٣٤٥٦٧"), "+966551234567");
  assert.equal(cleanPhone("00971501234567"), "+971501234567");
  assert.equal(cleanPhone(""), null);
  assert.throws(() => cleanPhone("abc"));
});

test(
  "the directory is private and shows only allowed contact details; requests hide what the customer did not allow",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const dir = await import("../src/server/directory");
    const req = await import("../src/server/customer-requests");
    const { startConversation } = await import("../src/server/chat");
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const users: string[] = [];
    const phone = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const mk = async (role: string) => {
      const id = randomUUID();
      users.push(id);
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
        [id, "عضو " + role, phone(), role],
      );
      return { id, name: "عضو " + role, phone: "", role } as SessionUser;
    };
    const city = (
      await pool.query<{ id: string }>(
        "SELECT id FROM jdatna.cities ORDER BY id LIMIT 1",
      )
    ).rows[0].id;
    const customer = await mk("customer");
    const other = await mk("customer");
    const familyUser = await mk("producer");
    const familyId = randomUUID();
    const slug = "dir-" + familyId;
    const familyPhone = phone();
    try {
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,whatsapp,status,show_phone,show_whatsapp) VALUES($1,$2,$3,'أسرة الدليل',$4,$5,$5,'approved',true,false)",
        [familyId, familyUser.id, slug, city, familyPhone],
      );
      // العميل يحفظ الأسرة: جوالها ظاهر (سمحت)، وواتسابها مخفي (لم تسمح).
      await dir.addToDirectory(customer, { producer: slug });
      await dir.addToDirectory(customer, { producer: slug }); // لا تكرار
      let list = await dir.listDirectory(customer);
      assert.equal(list.length, 1);
      assert.equal(list[0].kind, "family");
      assert.equal(list[0].phone, familyPhone);
      assert.equal(list[0].whatsapp, null);
      assert.ok(await dir.inDirectory(customer, { producer: slug }));
      // الأسرة تخفي جوالها لاحقًا: يختفي من الدليل فورًا.
      await pool.query(
        "UPDATE jdatna.producer_profiles SET show_phone=false WHERE id=$1",
        [familyId],
      );
      list = await dir.listDirectory(customer);
      assert.equal(list[0].phone, null);
      // وصاحب الدليل يضيف رقمًا بنفسه فيظهر له.
      await dir.updateDirectoryEntry(customer, list[0].id, {
        phone: "0551112222",
      });
      assert.equal(
        (await dir.listDirectory(customer))[0].ownPhone,
        "+966551112222",
      );
      // جهة يدوية ومن الجوال، والدليل لا يراه غير صاحبه.
      await dir.addToDirectory(customer, {
        contact: { name: "أم سعد", phone: "0553334444" },
      });
      const imported = await dir.importContacts(customer, {
        contacts: [
          { name: "خالة", phone: "055 555 6666" },
          { name: "مكرر", phone: "0553334444" },
          { name: "خطأ", phone: "x" },
        ],
      });
      assert.deepEqual(imported, { added: 1, skipped: 2 });
      assert.equal((await dir.listDirectory(customer)).length, 3);
      assert.equal((await dir.listDirectory(other)).length, 0);
      await assert.rejects(
        dir.removeDirectoryEntry(other, list[0].id),
        { status: 404 },
        "لا يحذف من دليل غيره",
      );
      // الأسرة لا تحفظ عميلًا لم يطلب منها ولم يراسلها.
      await assert.rejects(
        dir.addToDirectory(familyUser, { customer: other.id }),
        { status: 404 },
      );
      await assert.rejects(
        dir.addToDirectory(customer, { customer: other.id }),
        { status: 403 },
        "العميل لا يحفظ عملاء",
      );

      // طلب عميل بلا موافقات: الأسرة ترى «عميل» بلا اسم ولا جوال ولا واتساب.
      const { id } = await req.createCustomerRequest(customer, {
        body: "جريش لعشرة أشخاص",
        cityId: city,
        people: 10,
      });
      let board = await req.openCustomerRequests(familyUser);
      let mine = board.find((r) => r.id === id);
      assert.ok(mine);
      assert.equal(mine.name, null);
      assert.equal(mine.phone, null);
      assert.equal(mine.whatsapp, null);
      // العميل نفسه يرى بياناته في طلباته.
      assert.ok((await req.myCustomerRequests(customer))[0].phone);
      // العميل لا يرى لوحة الطلبات.
      await assert.rejects(req.openCustomerRequests(other), { status: 403 });
      // بموافقة على الاسم والواتساب فقط.
      const second = await req.createCustomerRequest(customer, {
        body: "مرقوق",
        cityId: city,
        showName: true,
        showWhatsapp: true,
        whatsapp: "0557778888",
      });
      board = await req.openCustomerRequests(familyUser);
      mine = board.find((r) => r.id === second.id);
      assert.equal(mine?.name, customer.name);
      assert.equal(mine?.phone, null);
      assert.equal(mine?.whatsapp, "+966557778888");
      await assert.rejects(
        req.createCustomerRequest(customer, {
          body: "بلا رقم",
          cityId: city,
          showWhatsapp: true,
        }),
        { status: 400 },
      );
      // الأسرة تراسل صاحب الطلب، فتصبح عميلتها ويمكن حفظه في دليلها.
      const conv = await startConversation(familyUser, { request: id });
      assert.ok(conv.id);
      await dir.addToDirectory(familyUser, { customer: customer.id });
      assert.equal((await dir.listDirectory(familyUser))[0].kind, "customer");
      // إغلاق الطلب يخفيه من اللوحة.
      await req.closeCustomerRequest(customer, id);
      board = await req.openCustomerRequests(familyUser);
      assert.ok(!board.some((r) => r.id === id));
      await assert.rejects(startConversation(familyUser, { request: id }), {
        status: 404,
      });
    } finally {
      await pool.query(
        "DELETE FROM jdatna.messages WHERE conversation_id IN (SELECT id FROM jdatna.conversations WHERE producer_id=$1)",
        [familyId],
      );
      await pool.query(
        "DELETE FROM jdatna.conversations WHERE producer_id=$1",
        [familyId],
      );
      await pool.query(
        "DELETE FROM jdatna.customer_requests WHERE user_id=ANY($1::uuid[])",
        [users],
      );
      await pool.query(
        "DELETE FROM jdatna.directory_entries WHERE owner_id=ANY($1::uuid[])",
        [users],
      );
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        familyId,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users,
      ]);
      await pool.end();
    }
  },
);
