import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { familyCertificate } from "@/server/certificates";
import { getSiteTexts } from "@/server/settings";
import { siteTextDefaults } from "@/lib/site-texts";
/** شهادة «أسرة مميزة» للأسرة وتقدّمها نحوها. */
export const GET = api(async (request) => {
  const user = await requireUser(request, ["producer", "admin"]);
  const texts = await getSiteTexts();
  return json({
    ...(await familyCertificate(user)),
    how: texts["certificate.how"] || siteTextDefaults["certificate.how"],
  });
});
