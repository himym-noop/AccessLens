"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

type AccessibilityMode =
  | "wheelchair"
  | "mobility"
  | "visual";

type ScanContext =
  | "entrance"
  | "pathway"
  | "hallway"
  | "stairs"
  | "ramp"
  | "elevator"
  | "destination"
  | "unknown";

type Observation = {
  feature: string;
  status:
    | "confirmed"
    | "uncertain"
    | "not_visible";
  confidence:
    | "high"
    | "medium"
    | "low";
  evidence: string;
};

type RouteGraphStep = {
  scanNumber: number;
  context: ScanContext;
  environment: string;
  accessStatus:
    | "supported"
    | "uncertain"
    | "blocked";
  confidence:
    | "high"
    | "medium"
    | "low";
  evidence: string[];
};

type RouteConflict = {
  scanNumbers: number[];
  contexts: ScanContext[];
  issue: string;
  evidence: string[];
  severity:
    | "high"
    | "medium"
    | "low";
};

type RouteTransition = {
  fromScan: number;
  toScan: number;
  fromContext: ScanContext;
  toContext: ScanContext;
  status:
    | "supported"
    | "uncertain"
    | "blocked";
  evidence: string[];
  confidence:
    | "high"
    | "medium"
    | "low";
  reason: string;
};

type RouteGap = {
  priority:
    | "critical"
    | "high"
    | "medium"
    | "low";
  title: string;
  instruction: string;
  reason: string;
  fromScan?: number;
  toScan?: number;
  targetContext?: ScanContext;
};

type NextScanInstruction = {
  title: string;
  instruction: string;
  reason: string;
  priority:
    | "critical"
    | "high"
    | "medium"
    | "low";
  targetContext?: ScanContext;
};

type ScanMemory = {
  scanNumber: number;
  context: ScanContext;
  environment: string;
  observations: Observation[];
};

type RouteResult = {
  scanNumber: number;
  profile: AccessibilityMode;
  scanContext: ScanContext;
  environment: string;

  observations: Observation[];

  status:
    | "accessible"
    | "potentially_accessible"
    | "barrier_detected"
    | "insufficient_evidence";

  barriers: string[];
  features: string[];
  uncertainties: string[];
  whatWouldChangeMyAnswer: string[];

  message: string;
  suggestedRoute: string[];

  scanRoute: unknown[];
  routeGraph: RouteGraphStep[];
  routeTransitions: RouteTransition[];
  routeConflicts: RouteConflict[];

  routeGaps: RouteGap[];

  nextScan:
    | NextScanInstruction
    | null;

  confidence: {
    level:
      | "high"
      | "medium"
      | "low";
    headline: string;
    explanation: string;
  };

  routeSummary: {
    scans: number;
    supportedTransitions: number;
    uncertainTransitions: number;
    blockedTransitions: number;
    conflicts: number;
    routeGaps: number;
  };

  routeMessage: string;
};

function contextLabel(
  context: ScanContext,
) {
  switch (context) {
    case "entrance":
      return "ENTRANCE";
    case "pathway":
      return "PATHWAY";
    case "hallway":
      return "HALLWAY";
    case "stairs":
      return "STAIRS";
    case "ramp":
      return "RAMP";
    case "elevator":
      return "ELEVATOR";
    case "destination":
      return "DESTINATION";
    default:
      return "AREA";
  }
}

function contextIcon(
  context: ScanContext,
) {
  switch (context) {
    case "entrance":
      return "↳";
    case "pathway":
      return "→";
    case "hallway":
      return "═";
    case "stairs":
      return "⇅";
    case "ramp":
      return "↗";
    case "elevator":
      return "⇧";
    case "destination":
      return "◎";
    default:
      return "•";
  }
}

function priorityLabel(
  priority:
    | "critical"
    | "high"
    | "medium"
    | "low",
) {
  switch (priority) {
    case "critical":
      return "CRITICAL";
    case "high":
      return "HIGH PRIORITY";
    case "medium":
      return "NEXT";
    default:
      return "OPTIONAL";
  }
}

function priorityClass(
  priority:
    | "critical"
    | "high"
    | "medium"
    | "low",
) {
  switch (priority) {
    case "critical":
      return "border-red-400/40 bg-red-400/10 text-red-200";
    case "high":
      return "border-orange-400/40 bg-orange-400/10 text-orange-200";
    case "medium":
      return "border-lime-300/30 bg-lime-300/10 text-lime-200";
    default:
      return "border-white/10 bg-white/5 text-white/60";
  }
}

function transitionClass(
  status:
    | "supported"
    | "uncertain"
    | "blocked",
) {
  switch (status) {
    case "supported":
      return "border-lime-300/30 bg-lime-300/5";
    case "blocked":
      return "border-red-400/30 bg-red-400/5";
    default:
      return "border-orange-300/30 bg-orange-300/5";
  }
}

function statusLabel(
  status:
    | "supported"
    | "uncertain"
    | "blocked",
) {
  switch (status) {
    case "supported":
      return "SUPPORTED";
    case "blocked":
      return "BLOCKED";
    default:
      return "UNCERTAIN";
  }
}

export default function LiveRoutePage() {
  const router =
    useRouter();

  const videoRef =
    useRef<HTMLVideoElement | null>(
      null,
    );

  const canvasRef =
    useRef<HTMLCanvasElement | null>(
      null,
    );

  const currentStepRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const [cameraReady, setCameraReady] =
    useState(false);

  const [cameraError, setCameraError] =
    useState("");

  const [processing, setProcessing] =
    useState(false);

  const [mode, setMode] =
    useState<AccessibilityMode>(
      "wheelchair",
    );

  const [previousScans, setPreviousScans] =
    useState<ScanMemory[]>([]);

  const [latestResult, setLatestResult] =
    useState<RouteResult | null>(
      null,
    );

  const [nextScan, setNextScan] =
    useState<NextScanInstruction | null>(
      null,
    );

  const [guidanceVisible, setGuidanceVisible] =
    useState(true);

  const [routePanelOpen, setRoutePanelOpen] =
    useState(true);

  const [evidencePanelOpen, setEvidencePanelOpen] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [hasStarted, setHasStarted] =
    useState(false);

  const [destinationReached, setDestinationReached] =
    useState(false);

  /*
   * Load the existing route.
   */

  useEffect(() => {
    try {
      const storedMode =
        sessionStorage.getItem(
          "accesslens_mode",
        );

      const storedScans =
        sessionStorage.getItem(
          "accesslens_previous_scans",
        );

      const storedLatest =
        sessionStorage.getItem(
          "accesslens_latest_scan",
        );

      if (
        storedMode ===
          "wheelchair" ||
        storedMode ===
          "mobility" ||
        storedMode ===
          "visual"
      ) {
        setMode(storedMode);
      }

      if (storedScans) {
        const parsed =
          JSON.parse(
            storedScans,
          );

        if (Array.isArray(parsed)) {
          setPreviousScans(
            parsed,
          );
        }
      }

      if (storedLatest) {
        const parsed =
          JSON.parse(
            storedLatest,
          );

        if (
          parsed &&
          typeof parsed ===
            "object"
        ) {
          setLatestResult(
            parsed,
          );

          setNextScan(
            parsed.nextScan ??
              null,
          );
        }
      }
    } catch {
      // Ignore invalid session state.
    }
  }, []);

  /*
   * Open camera.
   */

  useEffect(() => {
    let stream:
      | MediaStream
      | null = null;

    async function startCamera() {
      try {
        setCameraError("");

        if (
          !navigator.mediaDevices
            ?.getUserMedia
        ) {
          throw new Error(
            "Camera access is not supported in this browser.",
          );
        }

        stream =
          await navigator.mediaDevices.getUserMedia(
            {
              video: {
                facingMode: {
                  ideal:
                    "environment",
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

        if (
          videoRef.current
        ) {
          videoRef.current.srcObject =
            stream;

          await videoRef.current.play();

          setCameraReady(
            true,
          );
        }
      } catch (error) {
        setCameraError(
          error instanceof Error
            ? error.message
            : "Unable to access the camera.",
        );
      }
    }

    startCamera();

    return () => {
      stream
        ?.getTracks()
        .forEach(
          (track) =>
            track.stop(),
        );
    };
  }, []);

  /*
   * Persist route.
   */

  useEffect(() => {
    if (
      previousScans.length >
      0
    ) {
      sessionStorage.setItem(
        "accesslens_previous_scans",
        JSON.stringify(
          previousScans,
        ),
      );
    }
  }, [previousScans]);

  /*
   * Persist latest result.
   */

  useEffect(() => {
    if (latestResult) {
      sessionStorage.setItem(
        "accesslens_latest_scan",
        JSON.stringify(
          latestResult,
        ),
      );
    }
  }, [latestResult]);

  /*
   * Persist next evidence.
   */

  useEffect(() => {
    if (nextScan) {
      sessionStorage.setItem(
        "accesslens_next_scan",
        JSON.stringify(
          nextScan,
        ),
      );
    } else {
      sessionStorage.removeItem(
        "accesslens_next_scan",
      );
    }
  }, [nextScan]);

  /*
   * Current route position.
   */

  const route =
    latestResult?.routeGraph ??
    [];

  const currentIndex =
    Math.max(
      0,
      route.length - 1,
    );

  const currentRouteStep =
    route[currentIndex] ??
    null;

  const routeProgress =
    route.length <= 1
      ? 0
      : Math.round(
          (currentIndex /
            (route.length -
              1)) *
            100,
        );

  /*
   * Detect destination.
   */

  useEffect(() => {
    if (!latestResult) {
      return;
    }

    const graphReached =
      latestResult.routeGraph.some(
        (step) =>
          step.context ===
          "destination",
      );

    const environmentReached =
      /destination|room|office|counter|reception|clinic|ward|classroom|exit/i.test(
        latestResult.environment,
      );

    setDestinationReached(
      graphReached ||
        environmentReached,
    );
  }, [latestResult]);

  /*
   * Keep the current route segment visible.
   */

  useEffect(() => {
    if (
      !currentStepRef.current
    ) {
      return;
    }

    currentStepRef.current.scrollIntoView(
      {
        behavior: "smooth",
        block: "center",
        inline: "center",
      },
    );
  }, [currentIndex]);

  /*
   * Capture the current camera frame.
   */

  function captureFrame() {
    const video =
      videoRef.current;

    const canvas =
      canvasRef.current;

    if (
      !video ||
      !canvas ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      throw new Error(
        "Camera frame is not ready.",
      );
    }

    canvas.width =
      video.videoWidth;

    canvas.height =
      video.videoHeight;

    const context =
      canvas.getContext(
        "2d",
      );

    if (!context) {
      throw new Error(
        "Unable to process camera frame.",
      );
    }

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    return canvas.toDataURL(
      "image/jpeg",
      0.9,
    );
  }

  /*
   * Analyze current position.
   */

  async function analyzeCurrentPosition() {
    if (
      processing ||
      !cameraReady
    ) {
      return;
    }

    try {
      setProcessing(true);
      setMessage("");

      const image =
        captureFrame();

      const thresholds = {
        maxStepHeight: 2,
        minDoorWidth: 80,
        maxSlope: 8,
      };

      const response =
        await fetch(
          "/api/analyze",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              image,
              mode,
              thresholds,
              previousScans,
            }),
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ??
            "Route analysis failed.",
        );
      }

      const result =
        data as RouteResult;

      setLatestResult(
        result,
      );

      setNextScan(
        result.nextScan ??
          null,
      );

      setHasStarted(
        true,
      );

      setMessage(
        result.routeMessage,
      );

      /*
       * Update route memory.
       *
       * Avoid duplicate scan numbers.
       */

      const newScan: ScanMemory =
        {
          scanNumber:
            result.scanNumber,

          context:
            result.scanContext,

          environment:
            result.environment,

          observations:
            result.observations,
        };

      setPreviousScans(
        (existing) => {
          const withoutDuplicate =
            existing.filter(
              (scan) =>
                scan.scanNumber !==
                newScan.scanNumber,
            );

          return [
            ...withoutDuplicate,
            newScan,
          ].sort(
            (a, b) =>
              a.scanNumber -
              b.scanNumber,
          );
        },
      );

      if (
        result.nextScan
      ) {
        sessionStorage.setItem(
          "accesslens_next_scan",
          JSON.stringify(
            result.nextScan,
          ),
        );
      }

      /*
       * If the route is complete,
       * clear stale next-evidence instructions.
       */

      if (
        result.routeGraph.some(
          (step) =>
            step.context ===
            "destination",
        )
      ) {
        setNextScan(
          null,
        );

        sessionStorage.removeItem(
          "accesslens_next_scan",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to analyze the current position.",
      );
    } finally {
      setProcessing(
        false,
      );
    }
  }

  /*
   * Start the route with the existing scan.
   */

  async function startRoute() {
    if (
      latestResult &&
      previousScans.length >
        0
    ) {
      setHasStarted(
        true,
      );

      return;
    }

    await analyzeCurrentPosition();
  }

  /*
   * Current instruction.
   *
   * The route-gap engine gets priority.
   */

  const activeInstruction =
    nextScan ??
    latestResult?.nextScan ??
    null;

  const routeGapCount =
    latestResult?.routeSummary
      ?.routeGaps ?? 0;

  const conflictCount =
    latestResult?.routeSummary
      ?.conflicts ?? 0;

  const currentConfidence =
    latestResult?.confidence ??
    null;

  /*
   * Current target context.
   */

  const targetContext =
    activeInstruction?.targetContext ??
    null;

  /*
   * Dynamic camera framing hint.
   */

  const framingHint =
    targetContext ===
    "ramp"
      ? "Keep the ramp and where it leads inside the frame."
      : targetContext ===
          "hallway"
        ? "Keep the route ahead and the connecting doorway visible."
        : targetContext ===
            "elevator"
          ? "Keep the elevator exit and the space beyond it visible."
          : targetContext ===
              "entrance"
            ? "Keep the entrance and the first connected space visible."
            : "Keep the route transition visible in one wide frame.";

  return (
    <main className="min-h-screen bg-[#050706] text-white">
      <canvas
        ref={canvasRef}
        className="hidden"
      />

      {/* CAMERA */}
      <div className="fixed inset-0 bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full object-cover"
        />

        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90" />

        {/* TOP BAR */}
        <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-5 py-5">
          <button
            onClick={() =>
              router.push(
                "/scan",
              )
            }
            className="rounded-full border border-white/15 bg-black/50 px-4 py-2 text-sm backdrop-blur"
          >
            ← Exit
          </button>

          <div className="rounded-full border border-lime-300/30 bg-lime-300/10 px-4 py-2 text-xs font-semibold tracking-[0.2em] text-lime-200">
            LIVE ROUTE
          </div>

          <div className="rounded-full border border-white/15 bg-black/50 px-4 py-2 text-xs text-white/70 backdrop-blur">
            {mode}
          </div>
        </div>

        {/* NEXT EVIDENCE */}
        {guidanceVisible &&
          activeInstruction &&
          !destinationReached && (
            <div className="absolute left-4 right-4 top-20 z-20">
              <div
                className={`rounded-[28px] border p-5 backdrop-blur-xl ${priorityClass(
                  activeInstruction.priority,
                )}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 text-[10px] font-bold tracking-[0.25em] opacity-70">
                      {priorityLabel(
                        activeInstruction.priority,
                      )}
                    </div>

                    <h1 className="text-2xl font-black tracking-tight">
                      {
                        activeInstruction.title
                      }
                    </h1>
                  </div>

                  <button
                    onClick={() =>
                      setGuidanceVisible(
                        false,
                      )
                    }
                    className="text-xs opacity-60"
                  >
                    Hide
                  </button>
                </div>

                <p className="mt-3 text-sm leading-6 text-white/85">
                  {
                    activeInstruction.instruction
                  }
                </p>

                <div className="mt-4 border-t border-white/10 pt-3">
                  <div className="text-[10px] font-bold tracking-[0.2em] opacity-50">
                    WHY THIS MATTERS
                  </div>

                  <p className="mt-1 text-xs leading-5 opacity-70">
                    {
                      activeInstruction.reason
                    }
                  </p>
                </div>

                {targetContext && (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-black/30 px-3 py-2 text-[10px] font-bold tracking-[0.15em]">
                    TARGET
                    <span className="text-lime-200">
                      {
                        contextLabel(
                          targetContext,
                        )
                      }
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

        {!guidanceVisible &&
          activeInstruction &&
          !destinationReached && (
            <button
              onClick={() =>
                setGuidanceVisible(
                  true,
                )
              }
              className="absolute left-4 right-4 top-20 z-20 rounded-full border border-lime-300/30 bg-black/70 px-5 py-3 text-left text-xs font-semibold backdrop-blur"
            >
              NEXT EVIDENCE · SHOW
            </button>
          )}

        {/* SCAN TARGET */}
        {!destinationReached && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="relative h-[42vh] w-[82vw] max-w-[520px]">
              <div className="absolute left-0 top-0 h-12 w-12 border-l-2 border-t-2 border-lime-300" />
              <div className="absolute right-0 top-0 h-12 w-12 border-r-2 border-t-2 border-lime-300" />
              <div className="absolute bottom-0 left-0 h-12 w-12 border-b-2 border-l-2 border-lime-300" />
              <div className="absolute bottom-0 right-0 h-12 w-12 border-b-2 border-r-2 border-lime-300" />

              <div className="absolute left-0 right-0 top-1/2 h-px bg-lime-300/50 shadow-[0_0_20px_rgba(190,255,100,0.8)]" />
            </div>
          </div>
        )}

        {/* BOTTOM INFO */}
        <div className="absolute bottom-0 left-0 right-0 z-20">
          <div className="mx-auto max-w-3xl px-4 pb-5">
            {destinationReached ? (
              <div className="rounded-[30px] border border-lime-300/40 bg-[#071008]/90 p-6 backdrop-blur-xl">
                <div className="text-xs font-bold tracking-[0.25em] text-lime-200">
                  DESTINATION REACHED
                </div>

                <h2 className="mt-2 text-3xl font-black">
                  Destination evidence detected.
                </h2>

                <p className="mt-2 text-sm leading-6 text-white/60">
                  AccessLens has detected evidence consistent with the destination area. This does not guarantee complete accessibility.
                </p>

                <button
                  onClick={() =>
                    router.push(
                      "/scan",
                    )
                  }
                  className="mt-5 w-full rounded-full bg-lime-300 px-5 py-4 text-sm font-black text-black"
                >
                  VIEW FULL ROUTE
                </button>
              </div>
            ) : (
              <div className="rounded-[30px] border border-white/10 bg-black/70 p-5 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-bold tracking-[0.25em] text-lime-200">
                      FRAME THIS EVIDENCE
                    </div>

                    <p className="mt-1 text-sm text-white/70">
                      {framingHint}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-black">
                      {routeProgress}%
                    </div>

                    <div className="text-[9px] tracking-[0.15em] text-white/40">
                      ROUTE
                    </div>
                  </div>
                </div>

                {/* PROGRESS */}
                <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-lime-300 transition-all duration-500"
                    style={{
                      width: `${routeProgress}%`,
                    }}
                  />
                </div>

                {/* MAIN ACTION */}
                <button
                  onClick={
                    analyzeCurrentPosition
                  }
                  disabled={
                    processing ||
                    !cameraReady
                  }
                  className="mt-5 w-full rounded-full bg-lime-300 px-5 py-4 text-sm font-black text-black disabled:opacity-40"
                >
                  {processing
                    ? "ANALYZING ROUTE..."
                    : hasStarted
                      ? "SCAN CURRENT POSITION"
                      : "START LIVE ROUTE"}
                </button>

                {message && (
                  <p className="mt-3 text-center text-xs leading-5 text-white/50">
                    {message}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ROUTE PANEL */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 transform border-t border-white/10 bg-[#080b09]/95 backdrop-blur-2xl transition-transform duration-300 ${
          routePanelOpen
            ? "translate-y-0"
            : "translate-y-[calc(100%-68px)]"
        }`}
      >
        <div className="mx-auto max-w-4xl px-5">
          <button
            onClick={() =>
              setRoutePanelOpen(
                (value) =>
                  !value,
              )
            }
            className="flex w-full items-center justify-between py-5"
          >
            <div className="text-left">
              <div className="text-[10px] font-bold tracking-[0.25em] text-lime-200">
                ROUTE INTELLIGENCE
              </div>

              <div className="mt-1 text-sm font-semibold">
                {route.length} route points
              </div>
            </div>

            <span className="text-white/50">
              {routePanelOpen
                ? "↓"
                : "↑"}
            </span>
          </button>

          {routePanelOpen && (
            <div className="pb-8">
              {/* ROUTE STRIP */}
              <div className="flex gap-3 overflow-x-auto pb-5">
                {route.map(
                  (
                    step,
                    index,
                  ) => {
                    const isCurrent =
                      index ===
                      currentIndex;

                    const isPast =
                      index <
                      currentIndex;

                    return (
                      <div
                        key={`${step.scanNumber}-${index}`}
                        ref={
                          isCurrent
                            ? currentStepRef
                            : undefined
                        }
                        className={`min-w-[150px] rounded-2xl border p-4 transition ${
                          isCurrent
                            ? "border-lime-300/50 bg-lime-300/10"
                            : isPast
                              ? "border-white/10 bg-white/[0.03]"
                              : "border-white/5 bg-white/[0.015]"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-2xl">
                            {contextIcon(
                              step.context,
                            )}
                          </span>

                          <span className="text-[9px] tracking-[0.2em] text-white/30">
                            #{step.scanNumber}
                          </span>
                        </div>

                        <div className="mt-4 text-xs font-black tracking-[0.12em]">
                          {contextLabel(
                            step.context,
                          )}
                        </div>

                        <div className="mt-1 line-clamp-2 text-xs text-white/45">
                          {
                            step.environment
                          }
                        </div>

                        <div className="mt-4 text-[9px] font-bold tracking-[0.15em]">
                          {step.accessStatus.toUpperCase()}
                        </div>
                      </div>
                    );
                  },
                )}
              </div>

              {/* GAP ALERT */}
              {routeGapCount >
                0 && (
                <div className="mb-4 rounded-2xl border border-orange-300/30 bg-orange-300/5 p-4">
                  <div className="text-[10px] font-bold tracking-[0.2em] text-orange-200">
                    MISSING ROUTE EVIDENCE
                  </div>

                  <div className="mt-2 text-sm font-semibold">
                    {routeGapCount} route{" "}
                    {routeGapCount ===
                    1
                      ? "gap"
                      : "gaps"}{" "}
                    detected.
                  </div>

                  <p className="mt-1 text-xs leading-5 text-white/50">
                    The next evidence instruction is targeting the highest-priority gap.
                  </p>
                </div>
              )}

              {/* CONFLICT ALERT */}
              {conflictCount >
                0 && (
                <div className="mb-4 rounded-2xl border border-red-400/30 bg-red-400/5 p-4">
                  <div className="text-[10px] font-bold tracking-[0.2em] text-red-200">
                    ROUTE CONFLICT
                  </div>

                  <div className="mt-2 text-sm font-semibold">
                    {conflictCount} conflicting{" "}
                    {conflictCount ===
                    1
                      ? "observation"
                      : "observations"}{" "}
                    detected.
                  </div>
                </div>
              )}

              {/* CONFIDENCE */}
              {currentConfidence && (
                <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] tracking-[0.2em] text-white/40">
                        ROUTE CONFIDENCE
                      </div>

                      <div className="mt-1 text-lg font-black">
                        {
                          currentConfidence.headline
                        }
                      </div>
                    </div>

                    <div className="text-xs font-bold uppercase text-lime-200">
                      {
                        currentConfidence.level
                      }
                    </div>
                  </div>

                  <p className="mt-2 text-xs leading-5 text-white/50">
                    {
                      currentConfidence.explanation
                    }
                  </p>
                </div>
              )}

              {/* TRANSITIONS */}
              {latestResult &&
                latestResult.routeTransitions
                  .length >
                  0 && (
                  <div className="space-y-2">
                    <div className="mb-3 text-[10px] font-bold tracking-[0.2em] text-white/35">
                      ROUTE CONNECTIONS
                    </div>

                    {latestResult.routeTransitions.map(
                      (
                        transition,
                        index,
                      ) => (
                        <div
                          key={`${transition.fromScan}-${transition.toScan}-${index}`}
                          className={`rounded-2xl border p-4 ${transitionClass(
                            transition.status,
                          )}`}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="text-xs font-bold">
                              {
                                contextLabel(
                                  transition.fromContext,
                                )
                              }{" "}
                              →
                              {" "}
                              {
                                contextLabel(
                                  transition.toContext,
                                )
                              }
                            </div>

                            <div className="text-[9px] font-bold tracking-[0.15em]">
                              {statusLabel(
                                transition.status,
                              )}
                            </div>
                          </div>

                          <p className="mt-2 text-xs leading-5 text-white/50">
                            {
                              transition.reason
                            }
                          </p>

                          {transition.evidence
                            .length >
                            0 && (
                            <div className="mt-3 text-[10px] text-white/35">
                              {
                                transition.evidence
                                  .join(
                                    " · ",
                                  )
                              }
                            </div>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                )}

              {/* EVIDENCE */}
              {latestResult && (
                <div className="mt-5">
                  <button
                    onClick={() =>
                      setEvidencePanelOpen(
                        (value) =>
                          !value,
                      )
                    }
                    className="flex w-full items-center justify-between border-t border-white/10 py-4 text-left"
                  >
                    <span className="text-[10px] font-bold tracking-[0.2em] text-white/40">
                      CURRENT EVIDENCE
                    </span>

                    <span className="text-white/30">
                      {evidencePanelOpen
                        ? "−"
                        : "+"}
                    </span>
                  </button>

                  {evidencePanelOpen && (
                    <div className="space-y-2 pb-4">
                      {latestResult.observations.map(
                        (
                          observation,
                          index,
                        ) => (
                          <div
                            key={`${observation.feature}-${index}`}
                            className="rounded-xl border border-white/5 bg-white/[0.02] p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs font-semibold">
                                {
                                  observation.feature
                                }
                              </span>

                              <span className="text-[9px] uppercase text-white/35">
                                {
                                  observation.status
                                }
                              </span>
                            </div>

                            <p className="mt-1 text-[11px] leading-5 text-white/40">
                              {
                                observation.evidence
                              }
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ACTIONS */}
              <div className="grid grid-cols-2 gap-3 pt-3">
                <button
                  onClick={() =>
                    router.push(
                      "/assist",
                    )
                  }
                  className="rounded-full border border-white/10 px-4 py-3 text-xs font-bold"
                >
                  NEED ASSISTANCE
                </button>

                <button
                  onClick={() =>
                    router.push(
                      "/scan",
                    )
                  }
                  className="rounded-full border border-lime-300/30 bg-lime-300/10 px-4 py-3 text-xs font-bold text-lime-200"
                >
                  FULL ANALYSIS
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CAMERA ERROR */}
      {cameraError && (
        <div className="fixed inset-x-4 bottom-24 z-50 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100 backdrop-blur-xl">
          {cameraError}

          <button
            onClick={() =>
              window.location.reload()
            }
            className="mt-3 block rounded-full border border-white/10 px-4 py-2 text-xs"
          >
            Retry camera
          </button>
        </div>
      )}
    </main>
  );
}