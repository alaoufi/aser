import { AccountShell, LoginForm } from "@/components/forms/shared";
import { RegisterGuide } from "@/components/public/register-guide";
import { SITE_VERSION } from "@/lib/version";
export const metadata = {
  title: "تسجيل الدخول",
  description:
    "ادخل إلى أكلات جدتنا باسم المستخدم أو الجوال وكلمة المرور، أو أنشئ حسابًا بعد التحقق من الجوال.",
};
export default function Login() {
  return (
    <AccountShell navigation={false}>
      {/* أول زيارة: دليل التسجيل مفتوح أعلى النموذج، ثم يبقى زرًّا ظاهرًا. */}
      <RegisterGuide version={SITE_VERSION} autoOpen />
      <LoginForm />
    </AccountShell>
  );
}
