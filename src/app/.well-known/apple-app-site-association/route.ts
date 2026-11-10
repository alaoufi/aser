import { getAppLinks } from "@/server/settings";
export const dynamic = "force-dynamic";
/** ملف آبل لربط تطبيق الآيفون بالموقع (الروابط العامة واعتماد كلمات المرور). */
export async function GET() {
  const { iosAppIds } = await getAppLinks();
  return Response.json(
    {
      applinks: {
        details: iosAppIds.length
          ? [{ appIDs: iosAppIds, components: [{ "/": "/*" }] }]
          : [],
      },
      webcredentials: { apps: iosAppIds },
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
