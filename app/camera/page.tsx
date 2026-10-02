"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

type NextScanInstruction = {
  title: string;
  instruction: string;
  reason: string;
};

export default function CameraPage() {
  const router = useRouter();

  const videoRef =
    useRef<HTMLVideoElement>(null);

  const streamRef =
    useRef<MediaStream | null>(null);

  const [cameraReady, setCameraReady] =
    useState(false);

  const [error, setError] =
    useState("");

  const [nextScan, setNextScan] =
    useState<NextScanInstruction | null>(
      null,
    );

  const [showGuide, setShowGuide] =
    useState(true);

  useEffect(() => {
    const stored =
      sessionStorage.getItem(
        "accesslens_next_scan",
      );

    if (stored) {
      try {
        setNextScan(
          JSON.parse(stored),
        );
      } catch {
        setNextScan(null);
      }
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, []);

  async function startCamera() {
    try {
      setError("");

      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            video: {
              facingMode: {
                ideal: "environment",
              },
              width: {
                ideal: 1920,
              },
              height: {
                ideal: 1080,
              },
            },
            audio: false,
          },
        );

      streamRef.current =
        stream;

      if (videoRef.current) {
        videoRef.current.srcObject =
          stream;

        await videoRef.current.play();
      }

      setCameraReady(true);
    } catch {
      setError(
        "Camera access was unavailable. Please allow camera access and try again.",
      );
    }
  }

  function stopCamera() {
    streamRef.current
      ?.getTracks()
      .forEach(
        (track) =>
          track.stop(),
      );

    streamRef.current = null;
  }

  function captureImage() {
    const video =
      videoRef.current;

    if (!video) {
      return;
    }

    if (
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      setError(
        "Camera is not ready yet.",
      );

      return;
    }

    const canvas =
      document.createElement(
        "canvas",
      );

    canvas.width =
      video.videoWidth;

    canvas.height =
      video.videoHeight;

    const context =
      canvas.getContext("2d");

    if (!context) {
      setError(
        "Could not capture the image.",
      );

      return;
    }

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const image =
      canvas.toDataURL(
        "image/jpeg",
        0.9,
      );

    sessionStorage.setItem(
      "accesslens_camera_image",
      image,
    );

    sessionStorage.setItem(
      "accesslens_auto_analyze",
      "true",
    );

    sessionStorage.removeItem(
      "accesslens_next_scan",
    );

    stopCamera();

    router.push(
      "/scan?camera=true",
    );
  }

  function cancelGuide() {
    setShowGuide(false);
  }

  function reopenGuide() {
    setShowGuide(true);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
      />

      <div className="absolute inset-0 bg-black/35" />

      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90" />

      <header className="absolute left-0 right-0 top-0 z-20 px-5 py-5">
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              stopCamera();
              router.back();
            }}
            className="border border-white/15 bg-black/30 px-4 py-3 text-[9px] font-black uppercase tracking-[0.2em] backdrop-blur"
          >
            Back
          </button>

          <div className="text-center">
            <div className="text-sm font-black tracking-[-0.03em]">
              ACCESS
              <span className="text-lime-300">
                LENS
              </span>
            </div>

            <div className="mt-1 text-[7px] font-black uppercase tracking-[0.25em] text-white/40">
              Guided scan
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${
                cameraReady
                  ? "animate-pulse bg-lime-300"
                  : "bg-yellow-200"
              }`}
            />

            <span className="text-[8px] font-black uppercase tracking-[0.15em] text-white/50">
              {cameraReady
                ? "LIVE"
                : "STARTING"}
            </span>
          </div>
        </div>
      </header>

      {nextScan &&
        showGuide && (
          <div className="absolute left-4 right-4 top-24 z-20 md:left-auto md:right-6 md:w-[390px]">
            <div className="border border-lime-300/30 bg-black/80 p-5 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div className="text-[8px] font-black uppercase tracking-[0.25em] text-lime-300">
                  NEXT EVIDENCE
                </div>

                <button
                  onClick={
                    cancelGuide
                  }
                  className="text-[9px] font-black uppercase tracking-[0.15em] text-white/30 hover:text-white"
                >
                  Hide
                </button>
              </div>

              <h1 className="mt-4 text-xl font-black tracking-[-0.03em]">
                {nextScan.title}
              </h1>

              <p className="mt-3 text-sm leading-6 text-white/60">
                {nextScan.instruction}
              </p>

              <div className="mt-4 border-l border-lime-300/40 pl-3">
                <div className="text-[8px] font-black uppercase tracking-[0.15em] text-white/25">
                  Why
                </div>

                <div className="mt-1 text-xs leading-5 text-white/40">
                  {nextScan.reason}
                </div>
              </div>
            </div>
          </div>
        )}

      {!showGuide &&
        nextScan && (
          <button
            onClick={
              reopenGuide
            }
            className="absolute right-5 top-24 z-20 border border-lime-300/30 bg-black/70 px-4 py-3 text-[8px] font-black uppercase tracking-[0.18em] text-lime-300 backdrop-blur"
          >
            Show guidance
          </button>
        )}

      <div className="absolute left-1/2 top-1/2 z-10 h-64 w-64 -translate-x-1/2 -translate-y-1/2 md:h-80 md:w-80">
        <div className="absolute left-0 top-0 h-12 w-12 border-l-2 border-t-2 border-lime-300" />

        <div className="absolute right-0 top-0 h-12 w-12 border-r-2 border-t-2 border-lime-300" />

        <div className="absolute bottom-0 left-0 h-12 w-12 border-b-2 border-l-2 border-lime-300" />

        <div className="absolute bottom-0 right-0 h-12 w-12 border-b-2 border-r-2 border-lime-300" />

        <div className="absolute left-0 right-0 top-1/2 h-px animate-pulse bg-lime-300/40" />

        <div className="absolute bottom-0 left-1/2 top-0 w-px bg-lime-300/10" />
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-20 px-5 pb-8">
        <div className="mx-auto max-w-xl">
          {error && (
            <div className="mb-4 border border-red-300/20 bg-black/70 p-4 text-center text-xs leading-5 text-red-200 backdrop-blur">
              {error}

              <button
                onClick={
                  startCamera
                }
                className="ml-2 font-black underline"
              >
                Retry
              </button>
            </div>
          )}

          <div className="mb-6 text-center">
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/60">
              {nextScan
                ? "Frame the requested evidence"
                : "Frame the accessibility evidence"}
            </div>

            <div className="mt-2 text-xs text-white/30">
              Keep the relevant area visible before
              capturing.
            </div>
          </div>

          <div className="flex items-center justify-center">
            <button
              onClick={
                captureImage
              }
              disabled={
                !cameraReady
              }
              className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/80 bg-white/10 backdrop-blur transition active:scale-95 disabled:opacity-30"
            >
              <div className="h-14 w-14 rounded-full bg-white" />
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}