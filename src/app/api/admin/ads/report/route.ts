import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { adsReport, reportCsv } from "@/server/ads";
/** تقرير الإعلانات للمدة: JSON، أو ملف CSV بـ ?format=csv. */
export const GET = api(async (request) => {
  const q = new URL(request.url).searchParams;
  const report = await adsReport(await requireUser(request), {
    from: q.get("from") ?? "",
    to: q.get("to") ?? "",
    campaignId: q.get("campaignId") ?? "",
  });
  if (q.get("format") !== "csv") return json(report);
  return new Response(reportCsv(report.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ads-${q.get("from")}-${q.get("to")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
