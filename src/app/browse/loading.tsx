import { T } from "@/components/site-texts";
export default function Loading() {
  return (
    <div className="wrap page-space" role="status" aria-live="polite">
      <p className="eyebrow">
        <T k="p.browseLoading.t1" />
      </p>
      <div className="loading-skeleton" />
      <span>
        <T k="p.browseLoading.t2" />
      </span>
    </div>
  );
}
