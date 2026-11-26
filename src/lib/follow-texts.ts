import type { SiteTexts } from "./site-texts";

/** نصوص زر «نبّهني» (تنبيهات الأسرة) من «نصوص الموقع». */
export type FollowTexts = {
  button: string;
  following: string;
  title: string;
  intro: string;
  optNew: string;
  optSchedule: string;
  scopeAll: string;
  scopeSelected: string;
  consent: string;
  save: string;
  update: string;
  stop: string;
  login: string;
};

/** نصوص الزر من «نصوص الموقع» (الخادم). */
export function followTexts(t: SiteTexts): FollowTexts {
  return {
    button: t["alerts.button"],
    following: t["alerts.following"],
    title: t["alerts.title"],
    intro: t["alerts.intro"],
    optNew: t["alerts.optNew"],
    optSchedule: t["alerts.optSchedule"],
    scopeAll: t["alerts.scopeAll"],
    scopeSelected: t["alerts.scopeSelected"],
    consent: t["alerts.consent"],
    save: t["alerts.save"],
    update: t["alerts.update"],
    stop: t["alerts.stop"],
    login: t["alerts.login"],
  };
}
