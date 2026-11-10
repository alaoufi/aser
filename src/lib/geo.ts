/** نقطة على الخريطة: [خط العرض، خط الطول]. */
export type LatLng = [number, number];

/** حدود تقريبية واسعة للمملكة لرفض النقاط الخاطئة بوضوح. */
export const saudiBounds = { minLat: 15, maxLat: 33, minLng: 33, maxLng: 57 };
export function inSaudiBounds([lat, lng]: LatLng) {
  return (
    lat >= saudiBounds.minLat &&
    lat <= saudiBounds.maxLat &&
    lng >= saudiBounds.minLng &&
    lng <= saudiBounds.maxLng
  );
}

/**
 * هل النقطة داخل المضلع؟ (خوارزمية تقاطع الشعاع). على مستوى المدن تكفي
 * معاملة الإحداثيات كمستوٍ، والنقطة على الحافة تُحسب داخلها.
 */
export function pointInPolygon([lat, lng]: LatLng, polygon: LatLng[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    // على الحافة: ضمن النطاق.
    const cross = (lng - xi) * (yj - yi) - (lat - yi) * (xj - xi);
    if (
      Math.abs(cross) < 1e-12 &&
      lng >= Math.min(xi, xj) &&
      lng <= Math.max(xi, xj) &&
      lat >= Math.min(yi, yj) &&
      lat <= Math.max(yi, yj)
    )
      return true;
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}
