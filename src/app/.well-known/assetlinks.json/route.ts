import { getAppLinks } from "@/server/settings";
export const dynamic = "force-dynamic";
/** ملف تحقق قوقل بلاي (Digital Asset Links): يربط تطبيق أندرويد بالموقع ليفتحه كاملًا. */
export async function GET() {
  const links = await getAppLinks();
  const body =
    links.androidPackage && links.androidFingerprints.length
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: links.androidPackage,
              sha256_cert_fingerprints: links.androidFingerprints,
            },
          },
        ]
      : [];
  return Response.json(body, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
