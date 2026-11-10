"use client";
import { useState } from "react";
import { s } from "./shared";

/** نطاق التوصيل: داخل نطاق التغطية، أو جميع مناطق المملكة بالشحن (يضاف على السعر). */
export function DeliveryScopeFields({
  defaultScope = "coverage",
  defaultFee = null,
  legend = "نطاق التوصيل",
}: {
  defaultScope?: "coverage" | "kingdom";
  defaultFee?: number | null;
  legend?: string;
}) {
  const [scope, setScope] = useState(defaultScope);
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className={s.checks}>
        <label>
          <input
            type="radio"
            name="deliveryScope"
            value="coverage"
            checked={scope === "coverage"}
            onChange={() => setScope("coverage")}
          />
          داخل نطاق التغطية
        </label>
        <label>
          <input
            type="radio"
            name="deliveryScope"
            value="kingdom"
            checked={scope === "kingdom"}
            onChange={() => setScope("kingdom")}
          />
          جميع مناطق المملكة (بالشحن)
        </label>
      </div>
      {scope === "kingdom" && (
        <label className={s.field}>
          رسوم الشحن (ريال، تضاف على السعر)
          <input
            name="shippingFee"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            defaultValue={defaultFee ?? ""}
            placeholder="اتركها فارغة إذا كانت بالاتفاق"
          />
        </label>
      )}
    </fieldset>
  );
}

/** يقرأ نطاق التوصيل من النموذج بصيغة الخادم. */
export function readDeliveryScope(f: FormData) {
  const deliveryScope =
    f.get("deliveryScope") === "kingdom" ? "kingdom" : "coverage";
  const raw = String(f.get("shippingFee") ?? "").trim();
  return {
    deliveryScope,
    shippingFee:
      deliveryScope === "kingdom" && raw !== ""
        ? Math.round(Number(raw) * 100) / 100
        : null,
  } as const;
}
