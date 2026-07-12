// Live camera viewfinder for the height tool (Phase 2 precise aiming).
//
// We stream the rear camera into a plain <video> element inside the overlay, on
// both web and native. iOS WKWebView supports getUserMedia (iOS 14.3+, needs
// NSCameraUsageDescription, which the app ships) and `playsinline` so it plays
// in place rather than going fullscreen. Keeping the feed as DOM content means
// the HUD/crosshair simply layer on top — no webview-transparency tricks.

export interface CameraView {
  stop(): Promise<void>;
}

/** Start the viewfinder inside `container`. Resolves once the feed is live;
 *  rejects if the camera is unavailable or permission is denied (the caller
 *  falls back to tilt-only capture). */
export async function startCameraView(container: HTMLElement): Promise<CameraView> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
    audio: false,
  });
  const video = document.createElement("video");
  video.className = "cam-video";
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", ""); // iOS: play inline, not fullscreen
  video.srcObject = stream;
  container.prepend(video);
  try {
    await video.play();
  } catch {
    // Autoplay policies vary; the stream is attached regardless.
  }
  return {
    async stop() {
      for (const track of stream.getTracks()) track.stop();
      video.remove();
    },
  };
}
