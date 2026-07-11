// Tree-height math — the two-angle tangent (hypsometer) method.
//
// Stand a known *horizontal* distance D from the trunk. Sight the top and the
// base of the tree and read the elevation angle of each above (positive) or
// below (negative) horizontal. The vertical distance from eye level to the top
// is D·tan(top); to the base it is D·tan(base) (negative when the base sits
// below eye level, the usual case on flat ground). Their difference is the
// height, so eye height cancels and it works on slopes too.
//
// Angles are in degrees; distance and the result in metres.

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Two-angle method: height from horizontal distance + top/base elevation angles. */
export function heightFromAngles(distanceM: number, topDeg: number, baseDeg: number): number {
  return distanceM * (Math.tan(toRad(topDeg)) - Math.tan(toRad(baseDeg)));
}

/** Single-angle fallback: top angle + the observer's eye height above the base. */
export function heightFromTop(distanceM: number, topDeg: number, eyeHeightM: number): number {
  return distanceM * Math.tan(toRad(topDeg)) + eyeHeightM;
}
