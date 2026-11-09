import { Suspense } from "react";
import { Messages } from "@/components/forms/chat";
export const metadata = { title: "المحادثات" };
export default function Page() {
  return (
    <Suspense fallback={<p role="status">جارٍ تحميل المحادثات…</p>}>
      <Messages />
    </Suspense>
  );
}
