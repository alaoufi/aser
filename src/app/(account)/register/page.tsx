import { AccountShell } from "@/components/forms/shared";
import { ProfileForm } from "@/components/forms/profile";
export default function Register() {
  return (
    <AccountShell>
      <ProfileForm registration />
    </AccountShell>
  );
}
