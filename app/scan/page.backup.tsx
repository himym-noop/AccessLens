"use client";

import {
  ChangeEvent,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  AccessibilityMode,
  AccessibilityThresholds,
  Observation,
  RouteConflict,
  RouteGraphStep,
  RouteStep,
  RouteTransition,
  ScanContext,
} from "@/lib/accessibility";

type NextScanInstruction = {
  title: string;
  instruction: string;
  reason: string;
};

type Result = {
  environment: string;
  scanContext: ScanContext;
  contextEvidence: string[];
  currentScanObservations: Observation[];
  observations: Observation[];
  status:
    | "accessible"
    | "potentially_accessible"
    | "barrier_detected"
    | "insufficient_evidence"
    | string;
  barriers: string[];
  features: string[];
  uncertainties: string[];
  whatWouldChangeMyAnswer: string[];
  nextScan?: NextScanInstruction;
  message: string;
  suggestedRoute: string[];
  scanRoute?: RouteStep[];
  routeGraph?: RouteGraphStep[];
  routeTransitions?: RouteTransition[];
  routeConflicts?: RouteConflict[];
  profile: AccessibilityMode;
  thresholds: AccessibilityThresholds;
};

type StoredScan = {
  scanNumber: number;
  context: ScanContext;
  environment: string;
  observations: Observation[];
};

const DEFAULT_THRESHOLDS: AccessibilityThresholds = {
  maxStepHeight: 2,
  minDoorWidth: 80,
  maxSlope: 8,
};

const MODE_LABELS: Record<AccessibilityMode, string> = {
  wheelchair: "Wheelchair",
  mobility: "Limited mobility",
  visual: "Visual",
};

const CONTEXT_LABELS: Record<ScanContext, string> = {
  entrance: "Entrance",
  pathway: "Pathway",
  hallway: "Hallway",
  stairs: "Stairs",
  ramp: "Ramp",
  elevator: "Elevator",
  destination: "Destination",
  unknown: "Unknown",
};

function statusLabel(status: string) {
  switch (status) {
    case "accessible":
    case "potentially_accessible":
      return "POTENTIALLY ACCESSIBLE";

    case "barrier_detected":
      return "BARRIER DETECTED";

    default:
      return "INSUFFICIENT EVIDENCE";
  }
}

function statusClasses(status: string) {
  switch (status) {
    case "accessible":
    case "potentially_accessible":
      return "border-lime-300/30 bg-lime-300/10 text-lime-200";

    case "barrier_detected":
      return "border-red-300/30 bg-red-300/10 text-red-200";

    default:
      return "border-yellow-300/30 bg-yellow-300/10 text-yellow-200";
  }
}

function transitionClasses(
  status: RouteTransition["status"],
) {
  switch (status) {
    case "supported":
      return "border-lime-300/20 bg-lime-300/[0.06]";

    case "blocked":
      return "border-red-300/20 bg-red-300/[0.06]";

    default:
      return "border-yellow-300/20 bg-yellow-300/[0.05]";
  }
}

function transitionLabel(
  status: RouteTransition["status"],
) {
  switch (status) {
    case "supported":
      return "✓ SUPPORTED";

    case "blocked":
      return "✕ BLOCKED";

    default:
      return "? UNCERTAIN";
  }
}

function graphStatusLabel(
  status: RouteGraphStep["accessStatus"],
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

function graphStatusClasses(
  status: RouteGraphStep["accessStatus"],
) {
  switch (status) {
    case "supported":
      return "border-lime-300/30 bg-lime-300/10 text-lime-300";

    case "blocked":
      return "border-red-300/30 bg-red-300/10 text-red-300";

    default:
      return "border-yellow-300/30 bg-yellow-300/10 text-yellow-300";
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
      return "→";

    case "stairs":
      return "⇧";

    case "ramp":
      return "↗";

    case "elevator":
      return "⇅";

    case "destination":
      return "◎";

    default:
      return "•";
  }
}

export default function ScanPage() {
  const router = useRouter();

  const [mode, setMode] =
    useState<AccessibilityMode>("wheelchair");

  const [thresholds, setThresholds] =
    useState<AccessibilityThresholds>(
      DEFAULT_THRESHOLDS,
    );

  const [image, setImage] =
    useState<string | null>(null);

  const [result, setResult] =
    useState<Result | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [
    expandedTransition,
    setExpandedTransition,
  ] = useState<number | null>(null);

  const [scanHistory, setScanHistory] =
    useState<StoredScan[]>([]);

  const [previousScans, setPreviousScans] =
    useState<StoredScan[]>([]);

  const [scanCount, setScanCount] =
    useState(0);

  const [
    showTechnicalDetails,
    setShowTechnicalDetails,
  ] = useState(false);

  const [dragActive, setDragActive] =
    useState(false);

  const currentScanNumber =
    scanCount + 1;

  useEffect(() => {
    try {
      const storedMode =
        sessionStorage.getItem(
          "accesslens_mode",
        ) as AccessibilityMode | null;

      if (
        storedMode === "wheelchair" ||
        storedMode === "mobility" ||
        storedMode === "visual"
      ) {
        setMode(storedMode);
      }

      const storedThresholds =
        sessionStorage.getItem(
          "accesslens_thresholds",
        );

      if (storedThresholds) {
        const parsed =
          JSON.parse(storedThresholds);

        if (parsed) {
          setThresholds({
            ...DEFAULT_THRESHOLDS,
            ...parsed,
          });
        }
      }

      const storedHistory =
        sessionStorage.getItem(
          "accesslens_scan_history",
        );

      if (storedHistory) {
        const parsed =
          JSON.parse(storedHistory);

        if (Array.isArray(parsed)) {
          setScanHistory(parsed);
        }
      }

      const storedPreviousScans =
        sessionStorage.getItem(
          "accesslens_previous_scans",
        );

      if (storedPreviousScans) {
        const parsed =
          JSON.parse(
            storedPreviousScans,
          );

        if (Array.isArray(parsed)) {
          setPreviousScans(parsed);
          setScanCount(parsed.length);
        }
      }

      const cameraImage =
        sessionStorage.getItem(
          "accesslens_camera_image",
        );

      if (cameraImage) {
        setImage(cameraImage);

        sessionStorage.removeItem(
          "accesslens_camera_image",
        );

        const shouldAnalyze =
          sessionStorage.getItem(
            "accesslens_auto_analyze",
          );

        if (shouldAnalyze === "true") {
          sessionStorage.removeItem(
            "accesslens_auto_analyze",
          );

          setTimeout(() => {
            void analyzeImage(
              cameraImage,
            );
          }, 150);
        }
      }
    } catch {
      // Session storage is optional.
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        "accesslens_mode",
        mode,
      );

      sessionStorage.setItem(
        "accesslens_thresholds",
        JSON.stringify(thresholds),
      );
    } catch {
      // Ignore storage errors.
    }
  }, [mode, thresholds]);

  const routeTransitions =
    result?.routeTransitions ?? [];

  const routeGraph =
    result?.routeGraph ?? [];

  const routeConflicts =
    result?.routeConflicts ?? [];

  function fileToDataUrl(
    file: File,
  ) {
    return new Promise<string>(
      (resolve, reject) => {
        const reader =
          new FileReader();

        reader.onload = () => {
          if (
            typeof reader.result ===
            "string"
          ) {
            resolve(
              reader.result,
            );
          } else {
            reject(
              new Error(
                "Could not read image.",
              ),
            );
          }
        };

        reader.onerror = () => {
          reject(
            new Error(
              "Could not read image.",
            ),
          );
        };

        reader.readAsDataURL(file);
      },
    );
  }

  async function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file =
      event.target.files?.[0];

    if (!file) return;

    if (
      !file.type.startsWith("image/")
    ) {
      setError(
        "Please select an image file.",
      );
      return;
    }

    try {
      setError(null);

      const dataUrl =
        await fileToDataUrl(file);

      setImage(dataUrl);
      setResult(null);
    } catch {
      setError(
        "Unable to load that image.",
      );
    }
  }

  async function handleDrop(
    event: React.DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    setDragActive(false);

    const file =
      event.dataTransfer.files?.[0];

    if (!file) return;

    if (
      !file.type.startsWith("image/")
    ) {
      setError(
        "Please drop an image file.",
      );
      return;
    }

    try {
      setError(null);

      const dataUrl =
        await fileToDataUrl(file);

      setImage(dataUrl);
      setResult(null);
    } catch {
      setError(
        "Unable to load that image.",
      );
    }
  }

  async function analyzeImage(
    imageToAnalyze:
      | string
      | null = image,
  ) {
    if (!imageToAnalyze) {
      setError(
        "Add an image before scanning.",
      );
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setExpandedTransition(null);

    try {
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
              image: imageToAnalyze,
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
          data?.error ||
            "AccessLens could not analyze this image.",
        );
      }

      const nextResult =
        data as Result;

      setResult(nextResult);

      const newScan: StoredScan = {
        scanNumber:
          currentScanNumber,
        context:
          nextResult.scanContext,
        environment:
          nextResult.environment,
        observations:
          nextResult
            .currentScanObservations
            ?.length
            ? nextResult.currentScanObservations
            : nextResult.observations,
      };

      const updatedScans = [
        ...previousScans,
        newScan,
      ];

      setPreviousScans(
        updatedScans,
      );

      setScanCount(
        updatedScans.length,
      );

      setScanHistory(
        (current) => {
          const updated = [
            ...current,
            newScan,
          ];

          try {
            sessionStorage.setItem(
              "accesslens_scan_history",
              JSON.stringify(
                updated,
              ),
            );

            sessionStorage.setItem(
              "accesslens_previous_scans",
              JSON.stringify(
                updated,
              ),
            );
          } catch {
            // Ignore storage errors.
          }

          return updated;
        },
      );
    } catch (scanError) {
      setError(
        scanError instanceof Error
          ? scanError.message
          : "Something went wrong while analyzing the image.",
      );
    } finally {
      setLoading(false);
    }
  }

  function resetCurrentScan() {
    setImage(null);
    setResult(null);
    setError(null);
    setExpandedTransition(null);
  }

  function startNewJourney() {
    setImage(null);
    setResult(null);
    setError(null);
    setExpandedTransition(null);
    setPreviousScans([]);
    setScanHistory([]);
    setScanCount(0);

    try {
      sessionStorage.removeItem(
        "accesslens_previous_scans",
      );

      sessionStorage.removeItem(
        "accesslens_scan_history",
      );

      sessionStorage.removeItem(
        "accesslens_next_scan",
      );
    } catch {
      // Ignore storage errors.
    }
  }

  function openCamera() {
    try {
      if (result?.nextScan) {
        sessionStorage.setItem(
          "accesslens_next_scan",
          JSON.stringify(
            result.nextScan,
          ),
        );
      } else {
        sessionStorage.removeItem(
          "accesslens_next_scan",
        );
      }
    } catch {
      // Ignore storage errors.
    }

    router.push("/camera");
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto max-w-7xl px-5 pb-24 pt-6 md:px-10">

        {/* HEADER */}

        <header className="mb-14 flex items-center justify-between border-b border-white/10 pb-5">
          <button
            onClick={() =>
              router.push("/")
            }
            className="text-left"
          >
            <div className="text-lg font-black tracking-[-0.04em]">
              ACCESS
              <span className="text-lime-300">
                LENS
              </span>
            </div>

            <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.25em] text-white/30">
              Visual accessibility intelligence
            </div>
          </button>

          <div className="flex items-center gap-3">
            {scanCount > 0 && (
              <div className="hidden text-right sm:block">
                <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/30">
                  Scan journey
                </div>

                <div className="mt-1 text-sm font-black">
                  {scanCount}{" "}
                  {scanCount === 1
                    ? "scan"
                    : "scans"}
                </div>
              </div>
            )}

            <button
              onClick={
                startNewJourney
              }
              className="border border-white/15 px-4 py-2 text-[10px] font-black uppercase tracking-wide text-white/60 transition hover:border-white/30 hover:text-white"
            >
              New journey
            </button>
          </div>
        </header>

        {/* HERO */}

        <section className="mb-12">
          <div className="max-w-4xl">
            <div className="mb-5 text-[10px] font-black uppercase tracking-[0.3em] text-lime-300">
              SCAN{" "}
              {currentScanNumber
                .toString()
                .padStart(2, "0")}
            </div>

            <h1 className="text-4xl font-black tracking-[-0.05em] md:text-6xl">
              See the space.
              <br />
              <span className="text-white/30">
                Understand the barriers.
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-7 text-white/50 md:text-lg">
              Upload or capture a view of
              the environment. AccessLens
              identifies visible accessibility
              evidence and builds a route
              hypothesis from what can actually
              be seen.
            </p>
          </div>
        </section>

        {/* PROFILE */}

        <section className="mb-10 border-y border-white/10 py-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30">
                Accessibility profile
              </div>

              <div className="mt-2 text-sm text-white/50">
                The same visual evidence is
                interpreted for different
                accessibility needs.
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                Object.keys(
                  MODE_LABELS,
                ) as AccessibilityMode[]
              ).map((profile) => (
                <button
                  key={profile}
                  onClick={() =>
                    setMode(profile)
                  }
                  className={`px-5 py-3 text-[10px] font-black uppercase tracking-wide transition ${
                    mode === profile
                      ? "bg-lime-300 text-black"
                      : "border border-white/15 text-white/50 hover:border-white/30 hover:text-white"
                  }`}
                >
                  {
                    MODE_LABELS[
                      profile
                    ]
                  }
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* UPLOAD */}

        {!image && (
          <section className="mb-16">
            <div
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragActive(false);
              }}
              onDrop={handleDrop}
              className={`relative min-h-[360px] border border-dashed p-8 transition md:p-14 ${
                dragActive
                  ? "border-lime-300 bg-lime-300/[0.05]"
                  : "border-white/15 hover:border-white/30"
              }`}
            >
              <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
                <div className="mb-6 text-5xl font-black text-white/10">
                  +
                </div>

                <div className="text-xl font-black tracking-tight">
                  Add a view of the space
                </div>

                <p className="mt-3 max-w-md text-sm leading-6 text-white/40">
                  Upload a photo or use the
                  camera. For useful route
                  evidence, include the path
                  ahead and any visible
                  transition points.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <label className="cursor-pointer bg-lime-300 px-7 py-4 text-xs font-black uppercase tracking-wide text-black transition hover:bg-lime-200">
                    Upload image

                    <input
                      type="file"
                      accept="image/*"
                      onChange={
                        handleFileChange
                      }
                      className="hidden"
                    />
                  </label>

                  <button
                    onClick={
                      openCamera
                    }
                    className="border border-white/20 px-7 py-4 text-xs font-black uppercase tracking-wide text-white transition hover:border-white/40"
                  >
                    Open camera
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* IMAGE */}

        {image && (
          <section className="mb-12">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30">
                  Current evidence
                </div>

                <div className="mt-2 text-xl font-black">
                  Scan{" "}
                  {currentScanNumber}
                </div>
              </div>

              <button
                onClick={
                  resetCurrentScan
                }
                className="text-[10px] font-black uppercase tracking-wide text-white/40 hover:text-white"
              >
                Remove
              </button>
            </div>

            <div className="relative overflow-hidden border border-white/10 bg-white/[0.03]">
              <img
                src={image}
                alt="Uploaded environment"
                className="max-h-[650px] w-full object-contain"
              />
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() =>
                  void analyzeImage()
                }
                disabled={loading}
                className="bg-lime-300 px-7 py-4 text-xs font-black uppercase tracking-wide text-black transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading
                  ? "Analyzing evidence..."
                  : "Analyze this space →"}
              </button>

              <button
                onClick={
                  openCamera
                }
                disabled={loading}
                className="border border-white/15 px-7 py-4 text-xs font-black uppercase tracking-wide text-white/60 transition hover:border-white/30 hover:text-white disabled:opacity-40"
              >
                Capture another view
              </button>
            </div>
          </section>
        )}

        {/* ERROR */}

        {error && (
          <section className="mb-12 border border-red-300/20 bg-red-300/[0.05] p-6">
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-red-300">
              Scan error
            </div>

            <p className="mt-3 text-sm leading-6 text-red-100/70">
              {error}
            </p>
          </section>
        )}

        {/* LOADING */}

        {loading && (
          <section className="mb-16 border-y border-lime-300/10 py-10">
            <div className="flex items-center gap-5">
              <div className="h-3 w-3 animate-pulse rounded-full bg-lime-300" />

              <div>
                <div className="text-sm font-black">
                  Reading visible evidence
                </div>

                <div className="mt-1 text-xs text-white/40">
                  AccessLens is analyzing the
                  current image without assuming
                  what is outside the frame.
                </div>
              </div>
            </div>
          </section>
        )}

        {/* RESULTS */}

        {result && !loading && (
          <>
            {/* ASSESSMENT */}

            <section className="mb-16">
              <div className="mb-6 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30">
                    Accessibility assessment
                  </div>

                  <div className="mt-3 text-3xl font-black tracking-tight md:text-5xl">
                    {statusLabel(
                      result.status,
                    )}
                  </div>
                </div>

                <div
                  className={`inline-flex w-fit border px-4 py-3 text-[10px] font-black uppercase tracking-wide ${statusClasses(
                    result.status,
                  )}`}
                >
                  {
                    CONTEXT_LABELS[
                      result.scanContext
                    ]
                  }
                </div>
              </div>

              <div className="max-w-4xl border-l-2 border-lime-300 pl-6">
                <p className="text-base leading-8 text-white/70 md:text-lg">
                  {result.message}
                </p>
              </div>
            </section>

            {/* ENVIRONMENT */}

            <section className="mb-16 grid gap-12 md:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30">
                  What AccessLens sees
                </div>

                <div className="mt-5 text-2xl font-black tracking-tight">
                  {
                    result.environment
                  }
                </div>

                {result.contextEvidence
                  ?.length > 0 && (
                  <div className="mt-7 space-y-3">
                    {result.contextEvidence.map(
                      (
                        evidence,
                        index,
                      ) => (
                        <div
                          key={`${evidence}-${index}`}
                          className="border-b border-white/10 pb-3 text-sm leading-6 text-white/50"
                        >
                          {evidence}
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30">
                  Profile
                </div>

                <div className="mt-4 text-xl font-black">
                  {MODE_LABELS[mode]}
                </div>

                <div className="mt-6 space-y-4 text-xs text-white/40">
                  <div className="flex justify-between border-b border-white/10 pb-3">
                    <span>
                      Max step
                    </span>

                    <span className="text-white/70">
                      {
                        thresholds.maxStepHeight
                      }{" "}
                      cm
                    </span>
                  </div>

                  <div className="flex justify-between border-b border-white/10 pb-3">
                    <span>
                      Min door width
                    </span>

                    <span className="text-white/70">
                      {
                        thresholds.minDoorWidth
                      }{" "}
                      cm
                    </span>
                  </div>

                  <div className="flex justify-between border-b border-white/10 pb-3">
                    <span>
                      Max slope
                    </span>

                    <span className="text-white/70">
                      {
                        thresholds.maxSlope
                      }
                      %
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* CURRENT OBSERVATIONS */}

            <section className="mb-16">
              <div className="mb-6">
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30">
                  Current scan
                </div>

                <h2 className="mt-2 text-2xl font-black tracking-tight">
                  Visible evidence
                </h2>
              </div>

              <div className="grid gap-x-10 md:grid-cols-2">
                {(
                  result
                    .currentScanObservations
                    ?.length
                    ? result.currentScanObservations
                    : result.observations
                ).map(
                  (
                    observation,
                    index,
                  ) => (
                    <div
                      key={`${observation.feature}-${index}`}
                      className="border-b border-white/10 py-5"
                    >
                      <div className="flex items-start justify-between gap-5">
                        <div>
                          <div className="text-sm font-black uppercase tracking-wide">
                            {
                              observation.feature
                            }
                          </div>

                          <p className="mt-2 text-sm leading-6 text-white/50">
                            {
                              observation.evidence
                            }
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <div
                            className={`text-[9px] font-black uppercase tracking-wide ${
                              observation.status ===
                              "confirmed"
                                ? "text-lime-300"
                                : observation.status ===
                                    "uncertain"
                                  ? "text-yellow-300"
                                  : "text-white/30"
                            }`}
                          >
                            {
                              observation.status
                            }
                          </div>

                          <div className="mt-1 text-[9px] uppercase tracking-wide text-white/20">
                            {
                              observation.confidence
                            }{" "}
                            confidence
                          </div>
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </section>

            {/* FEATURES / BARRIERS */}

            <section className="mb-16 grid gap-12 md:grid-cols-2">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-lime-300">
                  Access features
                </div>

                <div className="mt-6 space-y-4">
                  {result.features
                    .length > 0 ? (
                    result.features.map(
                      (
                        feature,
                        index,
                      ) => (
                        <div
                          key={`${feature}-${index}`}
                          className="flex gap-4 border-b border-white/10 pb-4"
                        >
                          <span className="text-lime-300">
                            +
                          </span>

                          <span className="text-sm leading-6 text-white/60">
                            {feature}
                          </span>
                        </div>
                      ),
                    )
                  ) : (
                    <p className="text-sm text-white/30">
                      No positive accessibility
                      feature was confidently
                      visible.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-red-300">
                  Potential barriers
                </div>

                <div className="mt-6 space-y-4">
                  {result.barriers
                    .length > 0 ? (
                    result.barriers.map(
                      (
                        barrier,
                        index,
                      ) => (
                        <div
                          key={`${barrier}-${index}`}
                          className="flex gap-4 border-b border-white/10 pb-4"
                        >
                          <span className="text-red-300">
                            !
                          </span>

                          <span className="text-sm leading-6 text-white/60">
                            {barrier}
                          </span>
                        </div>
                      ),
                    )
                  ) : (
                    <p className="text-sm text-white/30">
                      No explicit barrier was
                      confidently detected in
                      the visible frame.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* VISUAL ROUTE MAP */}

            <section className="mb-16">
              <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-lime-300">
                    ROUTE MAP
                  </div>

                  <h2 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
                    What the journey looks like
                  </h2>

                  <p className="mt-3 max-w-2xl text-sm leading-6 text-white/40">
                    Each node represents a scanned
                    environment. Connections represent
                    evidence-based route hypotheses
                    between scans.
                  </p>
                </div>

                {routeGraph.length > 0 && (
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/25">
                    {routeGraph.length}{" "}
                    {routeGraph.length === 1
                      ? "point"
                      : "points"}{" "}
                    mapped
                  </div>
                )}
              </div>

              {routeGraph.length === 0 ? (
                <div className="border border-dashed border-white/15 px-6 py-12 text-center">
                  <div className="text-4xl font-black text-white/10">
                    →
                  </div>

                  <div className="mt-4 text-sm font-black">
                    Your route will appear here
                  </div>

                  <p className="mx-auto mt-2 max-w-md text-xs leading-6 text-white/30">
                    Continue scanning connected
                    spaces to build a visual
                    journey.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto pb-4">
                  <div className="flex min-w-max items-center px-2 py-8">
                    {routeGraph.map(
                      (
                        node,
                        index,
                      ) => {
                        const nextTransition =
                          routeTransitions[
                            index
                          ];

                        return (
                          <div
                            key={`${node.scanNumber}-${index}`}
                            className="flex items-center"
                          >
                            {/* NODE */}

                            <div className="group relative w-[190px]">
                              <div
                                className={`relative border p-5 transition duration-200 hover:-translate-y-1 ${graphStatusClasses(
                                  node.accessStatus,
                                )}`}
                              >
                                {/* scan number */}

                                <div className="absolute -top-3 left-4 bg-[#050505] px-2 text-[9px] font-black tracking-[0.2em] text-white/40">
                                  SCAN{" "}
                                  {String(
                                    node.scanNumber,
                                  ).padStart(
                                    2,
                                    "0",
                                  )}
                                </div>

                                {/* icon */}

                                <div className="flex h-12 w-12 items-center justify-center border border-current text-xl">
                                  {
                                    contextIcon(
                                      node.context,
                                    )
                                  }
                                </div>

                                <div className="mt-5 text-lg font-black">
                                  {
                                    CONTEXT_LABELS[
                                      node.context
                                    ]
                                  }
                                </div>

                                <div className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-white/40">
                                  {
                                    node.environment
                                  }
                                </div>

                                <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-3">
                                  <span
                                    className={`text-[8px] font-black uppercase tracking-[0.15em]`}
                                  >
                                    {
                                      graphStatusLabel(
                                        node.accessStatus,
                                      )
                                    }
                                  </span>

                                  <span className="text-[8px] uppercase tracking-wide text-white/25">
                                    {
                                      node.confidence
                                    }
                                  </span>
                                </div>
                              </div>

                              {/* evidence strip */}

                              {node.evidence
                                .length >
                                0 && (
                                <div className="mt-2 space-y-1">
                                  {node.evidence
                                    .slice(
                                      0,
                                      2,
                                    )
                                    .map(
                                      (
                                        evidence,
                                        evidenceIndex,
                                      ) => (
                                        <div
                                          key={`${evidence}-${evidenceIndex}`}
                                          className="truncate text-[9px] text-white/25"
                                        >
                                          •{" "}
                                          {
                                            evidence
                                          }
                                        </div>
                                      ),
                                    )}
                                </div>
                              )}
                            </div>

                            {/* CONNECTION */}

                            {index <
                              routeGraph.length -
                                1 && (
                              <div className="flex w-[150px] flex-col items-center px-4">
                                <div
                                  className={`mb-2 text-[8px] font-black uppercase tracking-[0.15em] ${
                                    nextTransition?.status ===
                                    "supported"
                                      ? "text-lime-300"
                                      : nextTransition?.status ===
                                          "blocked"
                                        ? "text-red-300"
                                        : "text-yellow-300"
                                  }`}
                                >
                                  {nextTransition
                                    ? transitionLabel(
                                        nextTransition.status,
                                      )
                                    : "UNCERTAIN"}
                                </div>

                                <div className="flex w-full items-center">
                                  <div
                                    className={`h-px flex-1 ${
                                      nextTransition?.status ===
                                      "supported"
                                        ? "bg-lime-300/50"
                                        : nextTransition?.status ===
                                            "blocked"
                                          ? "bg-red-300/50"
                                          : "bg-yellow-300/50"
                                    }`}
                                  />

                                  <div
                                    className={`text-lg ${
                                      nextTransition?.status ===
                                      "supported"
                                        ? "text-lime-300"
                                        : nextTransition?.status ===
                                            "blocked"
                                          ? "text-red-300"
                                          : "text-yellow-300"
                                    }`}
                                  >
                                    →
                                  </div>
                                </div>

                                {nextTransition && (
                                  <div className="mt-2 text-center text-[8px] uppercase tracking-wide text-white/20">
                                    {
                                      nextTransition.confidence
                                    }{" "}
                                    confidence
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              )}

              {/* MAP LEGEND */}

              {routeGraph.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-5 border-t border-white/10 pt-5">
                  <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wide text-white/30">
                    <span className="h-2 w-2 rounded-full bg-lime-300" />
                    Supported
                  </div>

                  <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wide text-white/30">
                    <span className="h-2 w-2 rounded-full bg-yellow-300" />
                    Needs evidence
                  </div>

                  <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wide text-white/30">
                    <span className="h-2 w-2 rounded-full bg-red-300" />
                    Blocked
                  </div>
                </div>
              )}
            </section>

            {/* TRANSITIONS */}

            {routeTransitions.length >
              0 && (
              <section className="mb-16">
                <div className="mb-7">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30">
                    Scan-to-scan reasoning
                  </div>

                  <h2 className="mt-2 text-2xl font-black tracking-tight">
                    Route transitions
                  </h2>
                </div>

                <div className="space-y-3">
                  {routeTransitions.map(
                    (
                      transition,
                      index,
                    ) => {
                      const expanded =
                        expandedTransition ===
                        index;

                      return (
                        <div
                          key={`${transition.fromScan}-${transition.toScan}-${index}`}
                          className={`border ${transitionClasses(
                            transition.status,
                          )}`}
                        >
                          <button
                            onClick={() =>
                              setExpandedTransition(
                                expanded
                                  ? null
                                  : index,
                              )
                            }
                            className="w-full px-5 py-5 text-left"
                          >
                            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                              <div>
                                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">
                                  Scan{" "}
                                  {
                                    transition.fromScan
                                  }{" "}
                                  → Scan{" "}
                                  {
                                    transition.toScan
                                  }
                                </div>

                                <div className="mt-2 text-base font-black">
                                  {
                                    CONTEXT_LABELS[
                                      transition.fromContext
                                    ]
                                  }{" "}
                                  →{" "}
                                  {
                                    CONTEXT_LABELS[
                                      transition.toContext
                                    ]
                                  }
                                </div>
                              </div>

                              <div className="flex items-center gap-4">
                                <div
                                  className={`text-[9px] font-black uppercase tracking-wide ${
                                    transition.status ===
                                    "supported"
                                      ? "text-lime-300"
                                      : transition.status ===
                                          "blocked"
                                        ? "text-red-300"
                                        : "text-yellow-300"
                                  }`}
                                >
                                  {transitionLabel(
                                    transition.status,
                                  )}
                                </div>

                                <div className="text-white/20">
                                  {expanded
                                    ? "−"
                                    : "+"}
                                </div>
                              </div>
                            </div>
                          </button>

                          {expanded && (
                            <div className="border-t border-white/10 px-5 py-5">
                              <p className="text-sm leading-7 text-white/60">
                                {
                                  transition.reason
                                }
                              </p>

                              {transition
                                .evidence
                                .length >
                                0 && (
                                <div className="mt-5 space-y-2">
                                  {transition.evidence.map(
                                    (
                                      evidence,
                                      evidenceIndex,
                                    ) => (
                                      <div
                                        key={`${evidence}-${evidenceIndex}`}
                                        className="text-xs leading-5 text-white/35"
                                      >
                                        •{" "}
                                        {
                                          evidence
                                        }
                                      </div>
                                    ),
                                  )}
                                </div>
                              )}

                              <div className="mt-5 text-[9px] font-black uppercase tracking-[0.2em] text-white/20">
                                {
                                  transition.confidence
                                }{" "}
                                confidence
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    },
                  )}
                </div>
              </section>
            )}

            {/* CONFLICTS */}

            {routeConflicts.length >
              0 && (
              <section className="mb-16">
                <div className="mb-6">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-yellow-300">
                    Route verification
                  </div>

                  <h2 className="mt-2 text-2xl font-black tracking-tight">
                    Evidence conflicts
                  </h2>
                </div>

                <div className="space-y-4">
                  {routeConflicts.map(
                    (
                      conflict,
                      index,
                    ) => (
                      <div
                        key={`${conflict.issue}-${index}`}
                        className="border border-yellow-300/20 bg-yellow-300/[0.04] p-6"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="text-sm font-black">
                            {
                              conflict.issue
                            }
                          </div>

                          <div className="text-[9px] font-black uppercase tracking-wide text-yellow-300">
                            {
                              conflict.severity
                            }{" "}
                            priority
                          </div>
                        </div>

                        <div className="mt-3 text-xs text-white/30">
                          Scans{" "}
                          {conflict.scanNumbers.join(
                            " → ",
                          )}
                        </div>

                        {conflict
                          .evidence
                          .length >
                          0 && (
                          <div className="mt-5 space-y-2">
                            {conflict.evidence.map(
                              (
                                evidence,
                                evidenceIndex,
                              ) => (
                                <div
                                  key={`${evidence}-${evidenceIndex}`}
                                  className="text-sm leading-6 text-white/50"
                                >
                                  •{" "}
                                  {
                                    evidence
                                  }
                                </div>
                              ),
                            )}
                          </div>
                        )}
                      </div>
                    ),
                  )}
                </div>
              </section>
            )}

            {/* WHAT WOULD CHANGE */}

            {result
              .whatWouldChangeMyAnswer
              .length > 0 && (
              <section className="mb-10 border-l-2 border-yellow-300 pl-6">
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-yellow-300">
                  What would change my answer
                </div>

                <div className="mt-5 space-y-4">
                  {result.whatWouldChangeMyAnswer.map(
                    (
                      item,
                      index,
                    ) => (
                      <div
                        key={`${item}-${index}`}
                        className="text-sm leading-7 text-white/60"
                      >
                        {item}
                      </div>
                    ),
                  )}
                </div>
              </section>
            )}

            {/* NEXT EVIDENCE */}

            {result.nextScan && (
              <section className="mb-14 border-y border-lime-300/20 py-8">
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                  <div className="max-w-2xl">
                    <div className="text-[10px] font-black uppercase tracking-[0.25em] text-lime-300">
                      Next evidence to collect
                    </div>

                    <div className="mt-3 text-2xl font-black tracking-tight md:text-3xl">
                      {
                        result.nextScan.title
                      }
                    </div>

                    <p className="mt-4 text-base leading-7 text-white/70">
                      {
                        result.nextScan
                          .instruction
                      }
                    </p>

                    <p className="mt-3 text-sm leading-6 text-white/40">
                      {
                        result.nextScan
                          .reason
                      }
                    </p>
                  </div>

                  <button
                    onClick={
                      openCamera
                    }
                    className="shrink-0 bg-lime-300 px-6 py-4 text-xs font-black uppercase tracking-wide text-black transition hover:bg-lime-200"
                  >
                    Scan this next →
                  </button>
                </div>
              </section>
            )}

            {/* SUGGESTED ROUTE */}

            {result.suggestedRoute
              .length > 0 && (
              <section className="mb-16">
                <div className="mb-6">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30">
                    Suggested path
                  </div>

                  <h2 className="mt-2 text-2xl font-black tracking-tight">
                    What the current evidence suggests
                  </h2>
                </div>

                <div className="space-y-3">
                  {result.suggestedRoute.map(
                    (
                      step,
                      index,
                    ) => (
                      <div
                        key={`${step}-${index}`}
                        className="flex gap-5 border-b border-white/10 py-5"
                      >
                        <div className="text-sm font-black text-lime-300">
                          {String(
                            index + 1,
                          ).padStart(
                            2,
                            "0",
                          )}
                        </div>

                        <div className="text-sm leading-7 text-white/60">
                          {step}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </section>
            )}

            {/* SCAN JOURNEY */}

            {previousScans.length >
              0 && (
              <section className="mb-16">
                <div className="mb-7 flex items-end justify-between">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30">
                      Scan memory
                    </div>

                    <h2 className="mt-2 text-2xl font-black tracking-tight">
                      Your scan journey
                    </h2>
                  </div>

                  <div className="text-[10px] font-black uppercase tracking-wide text-white/20">
                    {
                      previousScans.length
                    }{" "}
                    captured
                  </div>
                </div>

                <div className="space-y-0">
                  {previousScans.map(
                    (
                      scan,
                      index,
                    ) => (
                      <div
                        key={`${scan.scanNumber}-${index}`}
                        className="flex gap-5 border-b border-white/10 py-6"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 text-[10px] font-black">
                          {
                            scan.scanNumber
                          }
                        </div>

                        <div>
                          <div className="text-sm font-black">
                            {
                              CONTEXT_LABELS[
                                scan.context
                              ]
                            }
                          </div>

                          <div className="mt-1 text-xs text-white/30">
                            {
                              scan.environment
                            }
                          </div>

                          {scan
                            .observations
                            .length >
                            0 && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {scan.observations
                                .slice(
                                  0,
                                  5,
                                )
                                .map(
                                  (
                                    observation,
                                    observationIndex,
                                  ) => (
                                    <span
                                      key={`${observation.feature}-${observationIndex}`}
                                      className="border border-white/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white/30"
                                    >
                                      {
                                        observation.feature
                                      }
                                    </span>
                                  ),
                                )}
                            </div>
                          )}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </section>
            )}

            {/* UNCERTAINTY */}

            {result.uncertainties
              .length > 0 && (
              <section className="mb-16 border-y border-white/10 py-10">
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30">
                  Uncertainty
                </div>

                <div className="mt-6 max-w-3xl space-y-4">
                  {result.uncertainties.map(
                    (
                      uncertainty,
                      index,
                    ) => (
                      <p
                        key={`${uncertainty}-${index}`}
                        className="text-sm leading-7 text-white/50"
                      >
                        {uncertainty}
                      </p>
                    ),
                  )}
                </div>
              </section>
            )}

            {/* TECHNICAL DETAILS */}

            <section className="mb-16">
              <button
                onClick={() =>
                  setShowTechnicalDetails(
                    (current) =>
                      !current,
                  )
                }
                className="text-[10px] font-black uppercase tracking-[0.25em] text-white/25 transition hover:text-white/60"
              >
                {showTechnicalDetails
                  ? "− Hide technical details"
                  : "+ Show technical details"}
              </button>

              {showTechnicalDetails && (
                <div className="mt-6 overflow-x-auto border border-white/10 bg-white/[0.02] p-5">
                  <pre className="text-[10px] leading-5 text-white/30">
                    {JSON.stringify(
                      {
                        scanContext:
                          result.scanContext,
                        profile:
                          result.profile,
                        observations:
                          result.observations,
                        routeGraph:
                          result.routeGraph,
                        routeTransitions:
                          result.routeTransitions,
                        routeConflicts:
                          result.routeConflicts,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </div>
              )}
            </section>

            {/* ACTIONS */}

            <section className="mb-12 flex flex-col gap-3 border-t border-white/10 pt-10 sm:flex-row">
              <button
                onClick={
                  openCamera
                }
                className="bg-lime-300 px-7 py-4 text-xs font-black uppercase tracking-wide text-black transition hover:bg-lime-200"
              >
                Continue scanning →
              </button>

              <button
                onClick={() => {
                  setImage(null);
                  setResult(null);
                  setError(null);
                }}
                className="border border-white/15 px-7 py-4 text-xs font-black uppercase tracking-wide text-white/60 transition hover:border-white/30 hover:text-white"
              >
                Analyze another image
              </button>
            </section>

            {/* DISCLAIMER */}

            <section className="border-t border-white/10 pt-8">
              <p className="max-w-4xl text-[11px] leading-6 text-white/25">
                AccessLens provides visual
                accessibility intelligence based
                only on the evidence visible in
                scanned images. It does not
                guarantee that a route is physically
                accessible, does not measure
                dimensions with certainty, and
                cannot verify conditions outside the
                captured view. Always verify
                important accessibility requirements
                directly.
              </p>
            </section>
          </>
        )}

        {/* EMPTY STATE */}

        {!image &&
          !result &&
          !loading &&
          !error && (
            <section className="border-t border-white/10 pt-8">
              <div className="grid gap-8 md:grid-cols-3">
                <div>
                  <div className="text-3xl font-black text-white/10">
                    01
                  </div>

                  <div className="mt-4 text-sm font-black">
                    Capture
                  </div>

                  <p className="mt-2 text-xs leading-6 text-white/30">
                    Show AccessLens the
                    environment in front of
                    you.
                  </p>
                </div>

                <div>
                  <div className="text-3xl font-black text-white/10">
                    02
                  </div>

                  <div className="mt-4 text-sm font-black">
                    Understand
                  </div>

                  <p className="mt-2 text-xs leading-6 text-white/30">
                    Separate visible evidence
                    from assumptions.
                  </p>
                </div>

                <div>
                  <div className="text-3xl font-black text-white/10">
                    03
                  </div>

                  <div className="mt-4 text-sm font-black">
                    Continue
                  </div>

                  <p className="mt-2 text-xs leading-6 text-white/30">
                    Collect the next piece of
                    evidence needed to
                    understand the route.
                  </p>
                </div>
              </div>
            </section>
          )}
      </div>
    </main>
  );
}