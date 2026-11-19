import { AccountShell } from "@/components/forms/shared";
import { ProfileForm } from "@/components/forms/profile";
import { RegisterGuide } from "@/components/public/register-guide";
import { SITE_VERSION } from "@/lib/version";
export default function Register() {
  return (
    <AccountShell>
      <RegisterGuide version={SITE_VERSION} />
      <ProfileForm registration />
    </AccountShell>
  );
}
