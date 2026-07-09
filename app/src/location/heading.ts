// Device compass heading from the orientation sensor (magnetometer). Used to
// draw a "which way the phone is pointing" beam on the GPS marker, like Google
// Maps. Works offline — no network involved.
//
// iOS exposes a true-north heading directly via `webkitCompassHeading` (and
// gates access behind DeviceOrientationEvent.requestPermission, iOS 13+, which
// must be called from a user gesture). Other platforms fall back to the
// absolute `alpha` angle, adjusted for the current screen orientation.

type HeadingCb = (degClockwiseFromNorth: number) => void;

interface IOSOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

interface IOSDeviceOrientationCtor {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
}

export function headingSupported(): boolean {
  return typeof window !== "undefined" && "DeviceOrientationEvent" in window;
}

/**
 * Begin compass-heading updates. Resolves to a stop() function, or null if the
 * sensor is unavailable or permission was denied (callers should degrade to a
 * plain location dot with no beam). Must be called from a user gesture on iOS.
 */
export async function startHeading(cb: HeadingCb): Promise<(() => void) | null> {
  if (!headingSupported()) return null;

  const ctor = window.DeviceOrientationEvent as unknown as IOSDeviceOrientationCtor;
  if (typeof ctor.requestPermission === "function") {
    try {
      if ((await ctor.requestPermission()) !== "granted") return null;
    } catch {
      return null;
    }
  }

  const handler = (e: DeviceOrientationEvent) => {
    const ev = e as IOSOrientationEvent;
    let heading: number | null = null;
    if (typeof ev.webkitCompassHeading === "number") {
      // iOS: already degrees clockwise from true north.
      heading = ev.webkitCompassHeading;
    } else if (ev.absolute && typeof ev.alpha === "number") {
      // Others: `alpha` is counter-clockwise from north in the device frame;
      // add the screen rotation so it tracks when the phone is turned.
      const screenAngle = window.screen?.orientation?.angle ?? 0;
      heading = 360 - ev.alpha + screenAngle;
    }
    if (heading != null && !Number.isNaN(heading)) {
      cb(((heading % 360) + 360) % 360);
    }
  };

  // `deviceorientationabsolute` is the reliable absolute feed on Android Chrome;
  // plain `deviceorientation` carries webkitCompassHeading on iOS.
  const type =
    "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
  window.addEventListener(type, handler as EventListener, true);
  return () => window.removeEventListener(type, handler as EventListener, true);
}
