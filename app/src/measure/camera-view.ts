// Live camera viewfinder for the height tool (Phase 2 precise aiming).
//
// Native: @capacitor-community/camera-preview renders the rear camera *behind*
// the WKWebView (`toBack`), so we add a body class that makes the app shell
// transparent and lets the feed show through under the HTML crosshair/HUD.
// Browser (dev): there is no toBack, so we stream getUserMedia into a <video>
// placed inside the overlay instead. Either way the caller overlays its HUD on
// top of `container`.

import { Capacitor } from "@capacitor/core";
import { CameraPreview } from "@capacitor-community/camera-preview";

const isNative = Capacitor.isNativePlatform();

export interface CameraView {
  stop(): Promise<void>;
}

/** Start the viewfinder. Resolves once the feed is live; rejects if the camera
 *  is unavailable or permission is denied (caller falls back to manual mode). */
export async function startCameraView(container: HTMLElement): Promise<CameraView> {
  if (isNative) {
    await CameraPreview.start({
      position: "rear",
      toBack: true,
      disableAudio: true,
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    });
    document.body.classList.add("cam-active");
    return {
      async stop() {
        document.body.classList.remove("cam-active");
        try {
          await CameraPreview.stop();
        } catch {
          // Already stopped — ignore.
        }
      },
    };
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
  });
  const video = document.createElement("video");
  video.className = "cam-video";
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  container.prepend(video);
  return {
    async stop() {
      for (const track of stream.getTracks()) track.stop();
      video.remove();
    },
  };
}
