import { AccountShell, LoginForm } from "@/components/forms/shared";
export const metadata = {
  title: "تسجيل الدخول",
  description:
    "ادخل إلى أكلات جدتنا باسم المستخدم أو الجوال وكلمة المرور، أو أنشئ حسابًا بعد التحقق من الجوال.",
};
export default function Login() {
  return (
    <AccountShell navigation={false}>
      <LoginForm />
    </AccountShell>
  );
}
