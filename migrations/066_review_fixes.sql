-- إصلاحات المراجعة (2026-11-24).
-- 1) اسم العميل في المحادثة: محادثة تبدؤها أسرة من «طلب عميل» لم يوافق صاحبه على إظهار اسمه
--    تُعلَّم مجهولة، فيظهر للأسرة «عميل» حتى يطلب منها.
-- 2) أرقام الأعضاء: التسلسل التلقائي بعدّاد مستقل، فلا يقفز بعد رقم مميز عالٍ تمنحه الإدارة
--    (كان يبدأ من أعلى رقم موجود: منح 7777 يجعل التالي 7778).
BEGIN;
ALTER TABLE jdatna.conversations ADD COLUMN IF NOT EXISTS anonymous_customer boolean NOT NULL DEFAULT false;

CREATE SEQUENCE IF NOT EXISTS jdatna.member_no_seq START 100 MINVALUE 100;
-- يبدأ من آخر رقم مُنح تلقائيًا: أعلى رقم لم تغيّره الإدارة (الأرقام المغيَّرة لها سطر في السجل،
-- والرقم القديم فيه هو التلقائي).
SELECT setval('jdatna.member_no_seq', greatest(100, coalesce((
  SELECT max(n) FROM (
    SELECT u.member_no AS n FROM jdatna.users u
      WHERE NOT EXISTS (SELECT 1 FROM jdatna.member_no_history h WHERE h.user_id = u.id)
    UNION ALL
    SELECT min(h.member_no) FROM jdatna.member_no_history h GROUP BY h.user_id
  ) x), 100)));

CREATE OR REPLACE FUNCTION jdatna.next_member_no() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('jdatna.member_no'));
  LOOP
    n := nextval('jdatna.member_no_seq');
    EXIT WHEN NOT jdatna.member_no_reserved(n)
      AND NOT EXISTS (SELECT 1 FROM jdatna.users WHERE member_no = n)
      AND NOT EXISTS (SELECT 1 FROM jdatna.member_no_history WHERE member_no = n);
  END LOOP;
  RETURN n;
END $$;
COMMIT;
