-- عزل حسابات أنشأها مراجعو المتاجر بأرقام جوال عادية (قرار المالك 2026-11-24: «نعم اعزلها كلها»).
-- ظهرت في «الأعضاء» بأرقام 103 «Jdatna2026Review» و106 «Reviewer account» (أسرة «اكلات نجدية»)
-- و108 «Reviewer account»، ولم تكن من أرقام المراجعة المعروفة فعوملت كحسابات حقيقية،
-- فوصلت رسائلها لمسجلين حقيقيين.
-- بعد العزل: الحساب لا يراسل حسابًا حقيقيًا ولا العكس (assertReviewUsers وassertReviewPair)،
-- والأسرة لا تظهر في الموقع ولا يطلب منها العملاء (review_only).
-- الشرط برقم العضو والاسم معًا، فلا يمس حسابًا آخر إن تغيّر أحدهما.
BEGIN;
UPDATE jdatna.users SET review_account = true
 WHERE (member_no = 103 AND name = 'Jdatna2026Review')
    OR (member_no IN (106, 108) AND name = 'Reviewer account');

UPDATE jdatna.producer_profiles p SET review_only = true, updated_at = now()
  FROM jdatna.users u
 WHERE u.id = p.user_id AND u.review_account
   AND ((u.member_no = 103 AND u.name = 'Jdatna2026Review')
     OR (u.member_no IN (106, 108) AND u.name = 'Reviewer account'));
COMMIT;
