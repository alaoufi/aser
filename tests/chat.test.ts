import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import {
  startConversation,
  listConversations,
  conversationMessages,
  sendMessage,
  unreadConversations,
  moderateConversation,
  markDelivered,
  sendVoice,
  voiceOf,
  deleteConversation,
  adminDeletedConversations,
  adminDeletedTranscript,
  adminVoice,
} from "../src/server/chat";

test(
  "isolated chat: members start with approved families, only participants read, messages persist and unread clears",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const tag = randomUUID().slice(0, 8);
    const mk = (role: "customer" | "producer", name: string) => ({
      id: randomUUID(),
      name,
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role,
    });
    const customer = mk("customer", "عميل محادثة"),
      family = mk("producer", "صاحبة الأسرة"),
      outsider = mk("customer", "غريب"),
      pending = mk("producer", "أسرة غير معتمدة");
    const familyId = randomUUID(),
      pendingId = randomUUID();
    const ids: { product?: string; admin?: string } = {};
    try {
      for (const u of [customer, family, outsider, pending])
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [u.id, u.name, u.phone, u.role],
        );
      const city = (
        await pool.query(
          "SELECT id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' LIMIT 1",
        )
      ).rows[0].id;
      for (const [id, owner, status] of [
        [familyId, family, "approved"],
        [pendingId, pending, "pending"],
      ] as const)
        await pool.query(
          "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            id,
            owner.id,
            "chat-" + tag + "-" + id,
            "أسرة " + status,
            city,
            owner.phone,
            status,
          ],
        );
      await assert.rejects(
        startConversation(customer, {
          producer: "chat-" + tag + "-" + pendingId,
        }),
        { status: 404 },
      );
      await assert.rejects(
        startConversation(family, { producer: "chat-" + tag + "-" + familyId }),
        { status: 400 },
      );
      const { id } = await startConversation(customer, {
        producer: "chat-" + tag + "-" + familyId,
      });
      assert.equal(
        (
          await startConversation(customer, {
            producer: "chat-" + tag + "-" + familyId,
          })
        ).id,
        id,
        "one conversation per member and family",
      );
      await sendMessage(customer, id, { body: "  السلام عليكم، متى الجريش؟ " });
      await assert.rejects(sendMessage(customer, id, { body: "   " }));
      await assert.rejects(sendMessage(outsider, id, { body: "تطفل" }), {
        status: 404,
      });
      await assert.rejects(conversationMessages(outsider, id), { status: 404 });
      await assert.rejects(conversationMessages(customer, "not-a-uuid"), {
        status: 404,
      });

      // الأسرة ترى المحادثة باسم العميل، ورسالة غير مقروءة.
      const familyList = await listConversations(family);
      const row = familyList.find((c) => c.id === id)!;
      assert.equal(row.side, "producer");
      assert.equal(row.title, customer.name);
      assert.equal(row.unread, 1);
      assert.equal(row.preview, "السلام عليكم، متى الجريش؟");
      assert.equal((await unreadConversations(family)).total, 1);
      // الصفحة مخفية (read=false): تُجلب الرسالة ولا تُعلَّم مقروءة.
      const hidden = await conversationMessages(family, id, undefined, false);
      assert.equal(hidden.messages.length, 1);
      assert.equal((await unreadConversations(family)).total, 1);
      const opened = await conversationMessages(family, id);
      assert.equal(opened.messages.length, 1);
      assert.equal(opened.messages[0].mine, false);
      assert.equal(
        (await unreadConversations(family)).total,
        0,
        "opening marks read",
      );

      const reply = await sendMessage(family, id, {
        body: "جاهز بكرة إن شاء الله",
      });
      const customerList = await listConversations(customer);
      assert.equal(
        customerList.find((c) => c.id === id)?.title,
        "أسرة approved",
      );
      assert.equal((await unreadConversations(customer)).total, 1);
      const later = await conversationMessages(
        customer,
        id,
        new Date(new Date(reply.createdAt).getTime() - 1).toISOString(),
      );
      assert.deepEqual(
        later.messages.map((m) => m.body),
        ["جاهز بكرة إن شاء الله"],
      );
      const all = await conversationMessages(customer, id);
      assert.deepEqual(
        all.messages.map((m) => [m.mine, m.body]),
        [
          [true, "السلام عليكم، متى الجريش؟"],
          [false, "جاهز بكرة إن شاء الله"],
        ],
      );
      assert.equal((await listConversations(outsider)).length, 0);

      // علامات واتساب: أُرسلت ← وصلت (فحص الطرف الآخر) ← قُرئت (فتحه للمحادثة).
      const tick = await sendMessage(customer, id, { body: "وصلت؟" });
      const ms = (v: unknown) => new Date(v as string).getTime();
      const at = ms(tick.createdAt);
      let view = (await conversationMessages(customer, id)).conversation;
      assert.ok(ms(view.otherDeliveredAt) < at, "sent only");
      await markDelivered(family);
      view = (await conversationMessages(customer, id)).conversation;
      assert.ok(ms(view.otherDeliveredAt) >= at, "delivered");
      assert.ok(ms(view.otherReadAt) < at, "not read yet");
      await conversationMessages(family, id);
      view = (await conversationMessages(customer, id)).conversation;
      assert.ok(ms(view.otherReadAt) >= at, "read");

      // تنبيه الرسائل الجديدة: المجموع وأحدث المحادثات بنص آخر رسالة.
      await sendMessage(family, id, { body: "وصلك الطلب؟" });
      const alert = await unreadConversations(customer);
      assert.equal(alert.total, 1);
      assert.equal(alert.conversations[0].id, id);
      assert.equal(alert.conversations[0].preview, "وصلك الطلب؟");
      assert.equal((await unreadConversations(outsider)).total, 0);

      // بدء المحادثة من الطلب: صاحب الطلب والأسرة يصلان لنفس المحادثة، وغيرهما لا.
      const productId = randomUUID(),
        orderId = randomUUID(),
        guestOrder = randomUUID();
      ids.product = productId;
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status) VALUES($1,$2,'طبق المحادثة','test','meal','available')",
        [productId, familyId],
      );
      for (const [oid, uid] of [
        [orderId, customer.id],
        [guestOrder, null],
      ])
        await pool.query(
          "INSERT INTO jdatna.order_requests(id,request_key,request_hash,user_id,producer_id,product_id,snapshot,customer_name,phone,quantity,meal,start_date,end_date,status) VALUES($1,$2,'h',$3,$4,$5,'{}','عميل','+966500000000',1,'lunch',current_date+1,current_date+1,'pending')",
          [oid, randomUUID(), uid, familyId, productId],
        );
      assert.equal(
        (await startConversation(customer, { order: orderId })).id,
        id,
      );
      assert.equal(
        (await startConversation(family, { order: orderId })).id,
        id,
      );
      await assert.rejects(startConversation(outsider, { order: orderId }), {
        status: 404,
      });
      await assert.rejects(startConversation(family, { order: guestOrder }), {
        status: 400,
      });
      await assert.rejects(
        startConversation(customer, { order: orderId, producer: "x" }),
      );

      // الحظر يوقف الإرسال للطرفين، ولا يلغيه إلا من حظر، والبلاغ يصل للإدارة.
      assert.deepEqual(
        await moderateConversation(customer, id, { action: "block" }),
        {
          reported: false,
          blocked: true,
          blockedByMe: true,
        },
      );
      await assert.rejects(sendMessage(family, id, { body: "مرحبا" }), {
        status: 403,
      });
      await assert.rejects(sendMessage(customer, id, { body: "مرحبا" }), {
        status: 403,
      });
      assert.equal(
        (await conversationMessages(family, id)).conversation.blocked,
        true,
      );
      assert.equal(
        (await conversationMessages(family, id)).conversation.blockedByMe,
        false,
      );
      await assert.rejects(
        moderateConversation(family, id, { action: "unblock" }),
        { status: 403 },
      );
      await assert.rejects(
        moderateConversation(outsider, id, { action: "block" }),
        { status: 404 },
      );
      await moderateConversation(customer, id, { action: "unblock" });
      await sendMessage(family, id, { body: "تم" });
      await assert.rejects(
        moderateConversation(family, id, { action: "report", reason: "قصير" }),
      );
      const reported = await moderateConversation(family, id, {
        action: "report",
        reason: "رسائل مزعجة متكررة من العميل",
      });
      assert.deepEqual(reported, {
        reported: true,
        blocked: false,
        blockedByMe: false,
      });
      const report = (
        await pool.query(
          "SELECT reporter_id,producer_id,reason FROM jdatna.reports WHERE producer_id=$1",
          [familyId],
        )
      ).rows[0];
      assert.equal(report.reporter_id, family.id);
      assert.match(report.reason, /بلاغ محادثة/);

      // الرسائل الصوتية: صيغة صوت حقيقية فقط، حتى دقيقتين، ولطرفي المحادثة فقط.
      const webm = new Uint8Array(400);
      webm.set([0x1a, 0x45, 0xdf, 0xa3]);
      webm.fill(7, 4);
      const voice = await sendVoice(customer, id, webm, 3200);
      assert.equal(voice.voiceMs, 3200);
      assert.equal(voice.body, "🎤 رسالة صوتية (0:03)");
      const heard = (await conversationMessages(family, id)).messages.find(
        (m) => m.id === voice.id,
      );
      assert.equal(heard?.voiceMs, 3200);
      assert.equal(heard?.mine, false);
      assert.equal(
        (await conversationMessages(family, id)).messages.find(
          (m) => m.body === "تم",
        )?.voiceMs,
        null,
      );
      const audio = await voiceOf(family, id, voice.id);
      assert.equal(audio.mime, "audio/webm");
      assert.deepEqual(new Uint8Array(audio.data), webm);
      assert.equal((await voiceOf(customer, id, voice.id)).mime, "audio/webm");
      await assert.rejects(voiceOf(outsider, id, voice.id), { status: 404 });
      await assert.rejects(voiceOf(family, id, randomUUID()), { status: 404 });
      const mp4 = new Uint8Array(400);
      mp4.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]);
      assert.equal(
        (
          await voiceOf(
            family,
            id,
            (await sendVoice(family, id, mp4, 61000)).id,
          )
        ).mime,
        "audio/mp4",
      );
      await assert.rejects(
        sendVoice(customer, id, new Uint8Array(400).fill(65), 3000),
        { status: 400 },
      );
      await assert.rejects(sendVoice(customer, id, webm, 121_000));
      await assert.rejects(sendVoice(customer, id, webm, 100));
      await assert.rejects(
        sendVoice(customer, id, webm.subarray(0, 50), 3000),
        {
          status: 400,
        },
      );
      await assert.rejects(sendVoice(outsider, id, webm, 3000), {
        status: 404,
      });
      await moderateConversation(customer, id, { action: "block" });
      await assert.rejects(sendVoice(family, id, webm, 3000), { status: 403 });

      // حذف المحادثة: تختفي من الطرفين، وتبقى كاملة للإدارة.
      const admin = { ...mk("customer", "مدير"), role: "admin" as const };
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,'admin',now())",
        [admin.id, admin.name, admin.phone],
      );
      ids.admin = admin.id;
      const before = (await conversationMessages(customer, id)).messages.length;
      await assert.rejects(deleteConversation(outsider, id), { status: 404 });
      assert.deepEqual(await deleteConversation(customer, id), {
        deleted: true,
      });
      for (const who of [customer, family]) {
        assert.equal(
          (await listConversations(who)).some((x) => x.id === id),
          false,
        );
        await assert.rejects(conversationMessages(who, id), { status: 404 });
        await assert.rejects(sendMessage(who, id, { body: "هل وصلت؟" }), {
          status: 404,
        });
        await assert.rejects(voiceOf(who, id, voice.id), { status: 404 });
      }
      await assert.rejects(deleteConversation(family, id), { status: 404 });
      for (const who of [customer, family])
        await assert.rejects(adminDeletedConversations(who), { status: 403 });
      const deletion = (await adminDeletedConversations(admin)).find(
        (d) => d.conversationId === id,
      );
      assert.ok(deletion);
      assert.equal(deletion.deletedBy, customer.name);
      assert.equal(deletion.messages, before);
      const transcript = await adminDeletedTranscript(admin, deletion.id);
      assert.equal(transcript.length, before);
      assert.ok(transcript.some((m) => m.body === "تم"));
      assert.equal((await adminVoice(admin, voice.id)).mime, "audio/webm");
      await assert.rejects(adminDeletedTranscript(family, deletion.id), {
        status: 403,
      });
      // بدء المحادثة من جديد: تعود فارغة للطرفين، والقديم للإدارة فقط.
      assert.equal(
        (
          await startConversation(customer, {
            producer: "chat-" + tag + "-" + familyId,
          })
        ).id,
        id,
      );
      assert.equal((await conversationMessages(family, id)).messages.length, 0);
      assert.equal(
        (await listConversations(family)).find((x) => x.id === id)?.preview,
        null,
      );
      await assert.rejects(voiceOf(customer, id, voice.id), { status: 404 });
      await moderateConversation(customer, id, { action: "unblock" });
      const fresh = await sendMessage(family, id, { body: "أهلًا من جديد" });
      assert.deepEqual(
        (await conversationMessages(customer, id)).messages.map((m) => m.id),
        [fresh.id],
      );
      // صوت محادثة قائمة لا تسمعه الإدارة من هنا.
      const live = await sendVoice(customer, id, webm, 2000);
      await assert.rejects(adminVoice(admin, live.id), { status: 404 });
      assert.equal(
        (await adminDeletedTranscript(admin, deletion.id)).length,
        before,
      );
    } finally {
      await pool.query(
        "DELETE FROM jdatna.reports WHERE producer_id=ANY($1::uuid[])",
        [[familyId, pendingId]],
      );
      if (ids.product) {
        await pool.query(
          "DELETE FROM jdatna.order_requests WHERE product_id=$1",
          [ids.product],
        );
        await pool.query("DELETE FROM jdatna.products WHERE id=$1", [
          ids.product,
        ]);
      }
      await pool.query(
        "DELETE FROM jdatna.conversation_deletions WHERE conversation_id IN (SELECT id FROM jdatna.conversations WHERE producer_id=ANY($1::uuid[]))",
        [[familyId, pendingId]],
      );
      await pool.query(
        "DELETE FROM jdatna.messages WHERE conversation_id IN (SELECT id FROM jdatna.conversations WHERE producer_id=ANY($1::uuid[]))",
        [[familyId, pendingId]],
      );
      if (ids.admin)
        await pool.query("DELETE FROM jdatna.users WHERE id=$1", [ids.admin]);
      await pool.query(
        "DELETE FROM jdatna.conversations WHERE producer_id=ANY($1::uuid[])",
        [[familyId, pendingId]],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [[familyId, pendingId]],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        [customer.id, family.id, outsider.id, pending.id],
      ]);
      await pool.end();
    }
  },
);
