"use client";

import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  AccessibilityMode,
  AccessibilityReasoning,
  AccessibilityThresholds,
  RouteConflict,
  RouteGraphStep,
  RouteTransition,
  ScanContext,
  ScanMemory,
} from "@/lib/accessibility";

type NextScanInstruction = {
  title: string;
  instruction: string;
  reason: string;
};

type Observation = {
  feature: string;
  status: "confirmed" | "uncertain" | "not_visible";
  confidence: "high" | "medium" | "low";
  evidence: string;
};

type Result = AccessibilityReasoning & {
  environment: string;
  scanContext: ScanContext;
  contextEvidence: string[];
  currentScanObservations: Observation[];
  observations: Observation[];
  nextScan: NextScanInstruction | null;
  scanRoute: string[];
  routeGraph: RouteGraphStep[];
  routeTransitions: RouteTransition[];
  routeConflicts: RouteConflict[];
  profile: AccessibilityMode;
  thresholds: AccessibilityThresholds;
  scanNumber: number;
};

type StoredScan = ScanMemory;

const DEFAULT_THRESHOLDS: AccessibilityThresholds = {
  maxStepHeight: 2,
  minDoorWidth: 80,
  maxSlope: 8,
};

const modeLabels: Record<
  AccessibilityMode,
  string
> = {
  wheelchair: "Wheelchair",
  mobility: "Limited mobility",
  visual: "Visual",
};

const contextLabels: Record<
  ScanContext,
  string
> = {
  entrance: "Entrance",
  pathway: "Pathway",
  hallway: "Hallway",
  stairs: "Stairs",
  ramp: "Ramp",
  elevator: "Elevator",
  destination: "Destination",
  unknown: "Unknown",
};

function statusLabel(
  status: Observation["status"],
) {
  if (status === "confirmed") {
    return "Confirmed";
  }

  if (status === "uncertain") {
    return "Uncertain";
  }

  return "Not visible";
}

function statusClass(
  status: Observation["status"],
) {
  if (status === "confirmed") {
    return "border-lime-300/20 bg-lime-300/5 text-lime-300";
  }

  if (status === "uncertain") {
    return "border-yellow-200/20 bg-yellow-200/5 text-yellow-100";
  }

  return "border-white/10 bg-white/[0.02] text-white/30";
}

function confidenceLabel(
  confidence: Observation["confidence"],
) {
  return confidence.toUpperCase();
}

function transitionClass(
  status: RouteTransition["status"],
) {
  if (status === "supported") {
    return "text-lime-300";
  }

  if (status === "blocked") {
    return "text-red-300";
  }

  return "text-yellow-200";
}

function transitionLabel(
  status: RouteTransition["status"],
) {
  if (status === "supported") {
    return "Supported";
  }

  if (status === "blocked") {
    return "Blocked";
  }

  return "Uncertain";
}

function graphStatusClass(
  status: RouteGraphStep["accessStatus"],
) {
  if (status === "supported") {
    return "text-lime-300";
  }

  if (status === "blocked") {
    return "text-red-300";
  }

  return "text-yellow-200";
}

function graphStatusSymbol(
  status: RouteGraphStep["accessStatus"],
) {
  if (status === "supported") {
    return "✓";
  }

  if (status === "blocked") {
    return "×";
  }

  return "!";
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
      return "↔";
    case "stairs":
      return "⇅";
    case "ramp":
      return "╱";
    case "elevator":
      return "⇵";
    case "destination":
      return "●";
    default:
      return "?";
  }
}

function getOverallRouteStatus(
  routeGraph: RouteGraphStep[],
  conflicts: RouteConflict[],
) {
  if (
    routeGraph.some(
      (step) =>
        step.accessStatus === "blocked",
    )
  ) {
    return {
      label: "Barrier detected",
      className: "text-red-300",
    };
  }

  if (
    conflicts.length > 0 ||
    routeGraph.some(
      (step) =>
        step.accessStatus === "uncertain",
    )
  ) {
    return {
      label: "Evidence incomplete",
      className: "text-yellow-200",
    };
  }

  if (routeGraph.length > 0) {
    return {
      label: "Potentially supported",
      className: "text-lime-300",
    };
  }

  return {
    label: "Start scanning",
    className: "text-white/50",
  };
}

export default function ScanPage() {
  const router = useRouter();

  const [mode, setMode] =
    useState<AccessibilityMode>(
      "wheelchair",
    );

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
    useState("");

  const [scanHistory, setScanHistory] =
    useState<Result[]>([]);

  const [previousScans, setPreviousScans] =
    useState<StoredScan[]>([]);

  const [scanCount, setScanCount] =
    useState(0);

  const [
    expandedTransition,
    setExpandedTransition,
  ] = useState<number | null>(null);

  const [
    showTechnical,
    setShowTechnical,
  ] = useState(false);

  const [
    dragActive,
    setDragActive,
  ] = useState(false);

  useEffect(() => {
    const storedMode =
      sessionStorage.getItem(
        "accesslens_mode",
      );

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
      try {
        setThresholds(
          JSON.parse(
            storedThresholds,
          ),
        );
      } catch {
        setThresholds(
          DEFAULT_THRESHOLDS,
        );
      }
    }

    const storedPreviousScans =
      sessionStorage.getItem(
        "accesslens_previous_scans",
      );

    if (storedPreviousScans) {
      try {
        const parsed =
          JSON.parse(
            storedPreviousScans,
          );

        if (Array.isArray(parsed)) {
          setPreviousScans(parsed);
          setScanCount(
            parsed.length,
          );
        }
      } catch {
        setPreviousScans([]);
      }
    }

    const cameraImage =
      sessionStorage.getItem(
        "accesslens_camera_image",
      );

    const autoAnalyze =
      sessionStorage.getItem(
        "accesslens_auto_analyze",
      );

    if (cameraImage) {
      setImage(cameraImage);

      if (autoAnalyze === "true") {
        sessionStorage.removeItem(
          "accesslens_auto_analyze",
        );

        setTimeout(() => {
          analyzeImage(
            cameraImage,
          );
        }, 100);
      }
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(
      "accesslens_mode",
      mode,
    );
  }, [mode]);

  useEffect(() => {
    sessionStorage.setItem(
      "accesslens_thresholds",
      JSON.stringify(
        thresholds,
      ),
    );
  }, [thresholds]);

  async function analyzeImage(
    imageToAnalyze?: string,
  ) {
    const targetImage =
      imageToAnalyze ?? image;

    if (!targetImage) {
      setError(
        "Add an image before scanning.",
      );
      return;
    }

    setLoading(true);
    setError("");

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
              image: targetImage,
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
            "The accessibility scan failed.",
        );
      }

      const nextResult =
        data as Result;

      setResult(
        nextResult,
      );

      setScanCount(
        nextResult.scanNumber,
      );

      setScanHistory(
        (current) => [
          ...current,
          nextResult,
        ],
      );

      const scanMemory: StoredScan = {
        scanNumber:
          nextResult.scanNumber,
        context:
          nextResult.scanContext,
        environment:
          nextResult.environment,
        observations:
          nextResult.currentScanObservations ??
          nextResult.observations ??
          [],
      };

      const updatedPreviousScans = [
        ...previousScans,
        scanMemory,
      ];

      setPreviousScans(
        updatedPreviousScans,
      );

      sessionStorage.setItem(
        "accesslens_previous_scans",
        JSON.stringify(
          updatedPreviousScans,
        ),
      );

      sessionStorage.setItem(
        "accesslens_latest_scan",
        JSON.stringify(
          nextResult,
        ),
      );

      if (nextResult.nextScan) {
        sessionStorage.setItem(
          "accesslens_next_scan",
          JSON.stringify(
            nextResult.nextScan,
          ),
        );
      } else {
        sessionStorage.removeItem(
          "accesslens_next_scan",
        );
      }

      sessionStorage.removeItem(
        "accesslens_camera_image",
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

  function handleFile(
    file: File,
  ) {
    if (
      !file.type.startsWith(
        "image/",
      )
    ) {
      setError(
        "Please upload an image file.",
      );
      return;
    }

    const reader =
      new FileReader();

    reader.onload = () => {
      const value =
        reader.result;

      if (
        typeof value ===
        "string"
      ) {
        setImage(value);
        setResult(null);
        setError("");
      }
    };

    reader.readAsDataURL(
      file,
    );
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file =
      event.target.files?.[0];

    if (file) {
      handleFile(file);
    }
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    setDragActive(false);

    const file =
      event.dataTransfer.files?.[0];

    if (file) {
      handleFile(file);
    }
  }

  function openCamera() {
    router.push(
      "/camera",
    );
  }

  function startNewJourney() {
    sessionStorage.removeItem(
      "accesslens_previous_scans",
    );

    sessionStorage.removeItem(
      "accesslens_latest_scan",
    );

    sessionStorage.removeItem(
      "accesslens_next_scan",
    );

    sessionStorage.removeItem(
      "accesslens_camera_image",
    );

    sessionStorage.removeItem(
      "accesslens_auto_analyze",
    );

    setImage(null);
    setResult(null);
    setScanHistory([]);
    setPreviousScans([]);
    setScanCount(0);
    setError("");

    router.push(
      "/scan",
    );
  }

  function continueScanning() {
    if (result?.nextScan) {
      sessionStorage.setItem(
        "accesslens_next_scan",
        JSON.stringify(
          result.nextScan,
        ),
      );
    }

    router.push(
      "/camera",
    );
  }

  const routeStatus =
    useMemo(
      () =>
        getOverallRouteStatus(
          result?.routeGraph ??
            [],
          result?.routeConflicts ??
            [],
        ),
      [result],
    );

  const routeGraph =
    result?.routeGraph ?? [];

  const transitions =
    result?.routeTransitions ??
    [];

  const conflicts =
    result?.routeConflicts ??
    [];

  const observations =
    result?.currentScanObservations ??
    result?.observations ??
    [];

  const confirmedCount =
    observations.filter(
      (item) =>
        item.status ===
        "confirmed",
    ).length;

  const uncertainCount =
    observations.filter(
      (item) =>
        item.status ===
        "uncertain",
    ).length;

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto min-h-screen max-w-7xl">
        <header className="border-b border-white/10 px-5 py-5 md:px-8">
          <div className="flex items-center justify-between">
            <button
              onClick={() =>
                router.push("/")
              }
              className="text-left"
            >
              <div className="text-sm font-black tracking-[-0.04em]">
                ACCESS
                <span className="text-lime-300">
                  LENS
                </span>
              </div>

              <div className="mt-1 text-[7px] font-black uppercase tracking-[0.25em] text-white/25">
                Visual accessibility intelligence
              </div>
            </button>

            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-lime-300" />

              <span className="text-[8px] font-black uppercase tracking-[0.15em] text-white/30">
                Scan {scanCount || "—"}
              </span>
            </div>
          </div>
        </header>

        <section className="px-5 pb-10 pt-12 md:px-8 md:pt-16">
          <div className="max-w-4xl">
            <div className="text-[9px] font-black uppercase tracking-[0.3em] text-lime-300">
              Visual route intelligence
            </div>

            <h1 className="mt-5 text-5xl font-black leading-[0.9] tracking-[-0.07em] md:text-7xl">
              Don't just scan
              <br />
              the space.
              <br />
              <span className="text-lime-300">
                Build the route.
              </span>
            </h1>

            <p className="mt-7 max-w-2xl text-sm leading-7 text-white/45 md:text-base">
              AccessLens analyzes visible
              accessibility evidence,
              remembers previous scans,
              identifies uncertainty, and
              guides you toward the next
              evidence needed to understand
              the route.
            </p>
          </div>
        </section>

        <section className="border-y border-white/10 px-5 py-5 md:px-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">
                Accessibility profile
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  Object.keys(
                    modeLabels,
                  ) as AccessibilityMode[]
                ).map(
                  (
                    option,
                  ) => (
                    <button
                      key={
                        option
                      }
                      onClick={() =>
                        setMode(
                          option,
                        )
                      }
                      className={`border px-4 py-3 text-[8px] font-black uppercase tracking-[0.15em] transition ${
                        mode ===
                        option
                          ? "border-lime-300 bg-lime-300 text-black"
                          : "border-white/10 bg-white/[0.02] text-white/40 hover:border-white/20 hover:text-white"
                      }`}
                    >
                      {
                        modeLabels[
                          option
                        ]
                      }
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="text-left md:text-right">
              <div className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">
                Current journey
              </div>

              <div className="mt-2 text-sm font-black">
                {scanCount === 0
                  ? "No scans yet"
                  : `${scanCount} evidence scan${
                      scanCount ===
                      1
                        ? ""
                        : "s"
                    }`}
              </div>
            </div>
          </div>
        </section>

        <section className="grid border-b border-white/10 md:grid-cols-[1.2fr_0.8fr]">
          <div className="border-b border-white/10 p-5 md:border-b-0 md:border-r md:p-8">
            <div
              onDragOver={(
                event,
              ) => {
                event.preventDefault();
                setDragActive(
                  true,
                );
              }}
              onDragLeave={() =>
                setDragActive(
                  false,
                )
              }
              onDrop={
                handleDrop
              }
              className={`relative min-h-[430px] overflow-hidden border transition ${
                dragActive
                  ? "border-lime-300 bg-lime-300/5"
                  : "border-white/10 bg-white/[0.015]"
              }`}
            >
              {image ? (
                <>
                  <img
                    src={image}
                    alt="Uploaded accessibility scan"
                    className="absolute inset-0 h-full w-full object-cover"
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />

                  <div className="absolute bottom-0 left-0 right-0 p-6">
                    <div className="text-[8px] font-black uppercase tracking-[0.2em] text-lime-300">
                      Evidence loaded
                    </div>

                    <div className="mt-2 text-xl font-black">
                      Ready to analyze
                    </div>

                    <div className="mt-2 max-w-lg text-xs leading-5 text-white/50">
                      AccessLens will use
                      this image as
                      primary visual
                      evidence. Previous
                      scans provide
                      context, not facts
                      about what is not
                      visible.
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex min-h-[430px] flex-col items-center justify-center px-8 text-center">
                  <div className="text-[9px] font-black uppercase tracking-[0.25em] text-lime-300">
                    Start evidence collection
                  </div>

                  <h2 className="mt-5 max-w-lg text-3xl font-black tracking-[-0.05em] md:text-4xl">
                    Show AccessLens
                    what you can see.
                  </h2>

                  <p className="mt-4 max-w-md text-sm leading-6 text-white/35">
                    Capture an entrance,
                    pathway, ramp,
                    elevator, hallway,
                    obstacle, or other
                    accessibility evidence.
                  </p>

                  <div className="mt-8 flex flex-wrap justify-center gap-3">
                    <button
                      onClick={
                        openCamera
                      }
                      className="bg-lime-300 px-6 py-4 text-[9px] font-black uppercase tracking-[0.2em] text-black transition hover:bg-lime-200"
                    >
                      Open camera
                    </button>

                    <label className="cursor-pointer border border-white/10 bg-white/[0.02] px-6 py-4 text-[9px] font-black uppercase tracking-[0.2em] text-white/60 transition hover:border-white/20 hover:text-white">
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
                  </div>

                  <div className="mt-8 text-[8px] font-black uppercase tracking-[0.15em] text-white/15">
                    Or drag an image here
                  </div>
                </div>
              )}

              {image && (
                <div className="absolute right-5 top-5 flex gap-2">
                  <label className="cursor-pointer border border-white/10 bg-black/60 px-4 py-3 text-[8px] font-black uppercase tracking-[0.15em] backdrop-blur">
                    Replace

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
                    className="border border-lime-300/30 bg-black/60 px-4 py-3 text-[8px] font-black uppercase tracking-[0.15em] text-lime-300 backdrop-blur"
                  >
                    Camera
                  </button>
                </div>
              )}
            </div>

            {image && (
              <button
                onClick={() =>
                  analyzeImage()
                }
                disabled={
                  loading
                }
                className="mt-4 w-full bg-lime-300 px-6 py-5 text-[9px] font-black uppercase tracking-[0.2em] text-black transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading
                  ? "Analyzing visible evidence..."
                  : "Analyze this scan →"}
              </button>
            )}

            {error && (
              <div className="mt-4 border border-red-300/20 bg-red-300/5 p-4 text-xs leading-6 text-red-200">
                {error}
              </div>
            )}
          </div>

          <div className="p-5 md:p-8">
            <div className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">
              Evidence rules
            </div>

            <div className="mt-6 space-y-6">
              <div>
                <div className="text-sm font-black">
                  Visible evidence only
                </div>

                <div className="mt-2 text-xs leading-6 text-white/35">
                  AccessLens does not invent
                  dimensions, facilities, or
                  conditions that cannot be
                  supported by the image.
                </div>
              </div>

              <div>
                <div className="text-sm font-black">
                  Uncertainty stays visible
                </div>

                <div className="mt-2 text-xs leading-6 text-white/35">
                  If something cannot be
                  determined, the system
                  tells you what remains
                  unknown.
                </div>
              </div>

              <div>
                <div className="text-sm font-black">
                  Previous scans are memory
                </div>

                <div className="mt-2 text-xs leading-6 text-white/35">
                  Earlier evidence helps
                  establish route context,
                  but the current image
                  remains the primary source.
                </div>
              </div>

              <div className="border-t border-white/10 pt-6">
                <div className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">
                  Profile
                </div>

                <div className="mt-2 text-lg font-black text-lime-300">
                  {
                    modeLabels[
                      mode
                    ]
                  }
                </div>
              </div>
            </div>
          </div>
        </section>

        {result && (
          <>
            <section className="border-b border-white/10 px-5 py-8 md:px-8">
              <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="text-[8px] font-black uppercase tracking-[0.2em] text-lime-300">
                    Scan {result.scanNumber} ·{" "}
                    {
                      contextLabels[
                        result.scanContext
                      ]
                    }
                  </div>

                  <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] md:text-4xl">
                    {result.environment}
                  </h2>

                  <p className="mt-3 max-w-2xl text-sm leading-6 text-white/40">
                    {result.message}
                  </p>
                </div>

                <div className="md:text-right">
                  <div className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">
                    Route status
                  </div>

                  <div
                    className={`mt-2 text-lg font-black ${routeStatus.className}`}
                  >
                    {
                      routeStatus.label
                    }
                  </div>
                </div>
              </div>
            </section>

            <section className="grid border-b border-white/10 md:grid-cols-3">
              <div className="border-b border-white/10 p-6 md:border-b-0 md:border-r">
                <div className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">
                  Confirmed evidence
                </div>

                <div className="mt-3 text-4xl font-black text-lime-300">
                  {
                    confirmedCount
                  }
                </div>
              </div>

              <div className="border-b border-white/10 p-6 md:border-b-0 md:border-r">
                <div className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">
                  Uncertain evidence
                </div>

                <div className="mt-3 text-4xl font-black text-yellow-200">
                  {
                    uncertainCount
                  }
                </div>
              </div>

              <div className="p-6">
                <div className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">
                  Route points
                </div>

                <div className="mt-3 text-4xl font-black">
                  {
                    routeGraph.length
                  }
                </div>
              </div>
            </section>

            <section className="border-b border-white/10 px-5 py-10 md:px-8">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="text-[8px] font-black uppercase tracking-[0.25em] text-lime-300">
                    Route intelligence
                  </div>

                  <h2 className="mt-3 text-3xl font-black tracking-[-0.05em]">
                    The route so far
                  </h2>
                </div>

                <button
                  onClick={() =>
                    router.push(
                      "/live-route",
                    )
                  }
                  className="border border-lime-300/30 px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] text-lime-300 transition hover:bg-lime-300 hover:text-black"
                >
                  Enter Live Route →
                </button>
              </div>

              {routeGraph.length ===
              0 ? (
                <div className="mt-8 border border-white/10 p-8 text-center">
                  <div className="text-sm font-black">
                    Route graph is building.
                  </div>

                  <div className="mt-2 text-xs text-white/30">
                    Continue scanning connected
                    spaces to build the route.
                  </div>
                </div>
              ) : (
                <div className="mt-8 grid gap-px border border-white/10 bg-white/10 md:grid-cols-2">
                  {routeGraph.map(
                    (
                      step,
                      index,
                    ) => (
                      <div
                        key={`${step.scanNumber}-${index}`}
                        className="bg-black p-6"
                      >
                        <div className="flex items-start justify-between gap-5">
                          <div className="flex items-start gap-4">
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-sm font-black ${graphStatusClass(
                                step.accessStatus,
                              )}`}
                            >
                              {graphStatusSymbol(
                                step.accessStatus,
                              )}
                            </div>

                            <div>
                              <div className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">
                                Scan{" "}
                                {
                                  step.scanNumber
                                }
                              </div>

                              <div className="mt-1 text-lg font-black">
                                {
                                  contextLabels[
                                    step.context
                                  ]
                                }
                              </div>
                            </div>
                          </div>

                          <div
                            className={`text-[8px] font-black uppercase tracking-[0.15em] ${graphStatusClass(
                              step.accessStatus,
                            )}`}
                          >
                            {
                              step.accessStatus
                            }
                          </div>
                        </div>

                        <div className="mt-5 text-xs leading-6 text-white/40">
                          {
                            step.environment
                          }
                        </div>

                        {step.evidence
                          ?.length >
                          0 && (
                          <div className="mt-5 space-y-2">
                            {step.evidence.map(
                              (
                                evidence,
                                evidenceIndex,
                              ) => (
                                <div
                                  key={
                                    evidenceIndex
                                  }
                                  className="border-l border-white/10 pl-3 text-[10px] leading-5 text-white/30"
                                >
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
              )}
            </section>

            {transitions.length >
              0 && (
              <section className="border-b border-white/10 px-5 py-10 md:px-8">
                <div className="text-[8px] font-black uppercase tracking-[0.25em] text-white/25">
                  Route transitions
                </div>

                <h2 className="mt-3 text-2xl font-black tracking-[-0.04em]">
                  What connects each scan?
                </h2>

                <div className="mt-6 space-y-2">
                  {transitions.map(
                    (
                      transition,
                      index,
                    ) => (
                      <button
                        key={`${transition.fromScan}-${transition.toScan}-${index}`}
                        onClick={() =>
                          setExpandedTransition(
                            expandedTransition ===
                              index
                              ? null
                              : index,
                          )
                        }
                        className="w-full border border-white/10 bg-white/[0.015] p-5 text-left transition hover:bg-white/[0.03]"
                      >
                        <div className="flex items-center justify-between gap-5">
                          <div className="flex items-center gap-4">
                            <span className="text-xs font-black text-white/30">
                              {
                                transition.fromScan
                              }
                            </span>

                            <span className="text-white/20">
                              →
                            </span>

                            <span className="text-xs font-black">
                              {
                                transition.toScan
                              }
                            </span>

                            <span className="hidden text-[8px] font-black uppercase tracking-[0.15em] text-white/25 md:block">
                              {
                                contextLabels[
                                  transition.fromContext
                                ]
                              }{" "}
                              →{" "}
                              {
                                contextLabels[
                                  transition.toContext
                                ]
                              }
                            </span>
                          </div>

                          <span
                            className={`text-[8px] font-black uppercase tracking-[0.15em] ${transitionClass(
                              transition.status,
                            )}`}
                          >
                            {transitionLabel(
                              transition.status,
                            )}
                          </span>
                        </div>

                        {expandedTransition ===
                          index && (
                          <div className="mt-5 border-t border-white/10 pt-5">
                            <div className="text-xs leading-6 text-white/45">
                              {
                                transition.reason
                              }
                            </div>

                            {transition
                              .evidence
                              ?.length >
                              0 && (
                              <div className="mt-4 space-y-2">
                                {transition.evidence.map(
                                  (
                                    evidence,
                                    evidenceIndex,
                                  ) => (
                                    <div
                                      key={
                                        evidenceIndex
                                      }
                                      className="border-l border-lime-300/20 pl-3 text-[10px] leading-5 text-white/30"
                                    >
                                      {
                                        evidence
                                      }
                                    </div>
                                  ),
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    ),
                  )}
                </div>
              </section>
            )}

            <section className="border-b border-white/10 px-5 py-10 md:px-8">
              <div className="text-[8px] font-black uppercase tracking-[0.25em] text-white/25">
                Current evidence
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2">
                {observations.map(
                  (
                    observation,
                    index,
                  ) => (
                    <div
                      key={`${observation.feature}-${index}`}
                      className={`border p-5 ${statusClass(
                        observation.status,
                      )}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-black">
                            {
                              observation.feature
                            }
                          </div>

                          <div className="mt-2 text-xs leading-5 text-white/40">
                            {
                              observation.evidence
                            }
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <div className="text-[8px] font-black uppercase tracking-[0.12em]">
                            {statusLabel(
                              observation.status,
                            )}
                          </div>

                          <div className="mt-1 text-[7px] font-black uppercase tracking-[0.1em] opacity-40">
                            {confidenceLabel(
                              observation.confidence,
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </section>

            <section className="grid border-b border-white/10 md:grid-cols-2">
              <div className="border-b border-white/10 p-6 md:border-b-0 md:border-r md:p-8">
                <div className="text-[8px] font-black uppercase tracking-[0.2em] text-lime-300">
                  Access signals
                </div>

                <div className="mt-5 space-y-3">
                  {result.features.length >
                  0 ? (
                    result.features.map(
                      (
                        feature,
                        index,
                      ) => (
                        <div
                          key={
                            index
                          }
                          className="border-l border-lime-300/30 pl-3 text-sm text-white/60"
                        >
                          {
                            feature
                          }
                        </div>
                      ),
                    )
                  ) : (
                    <div className="text-sm text-white/25">
                      No confirmed access
                      signals yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 md:p-8">
                <div className="text-[8px] font-black uppercase tracking-[0.2em] text-red-300">
                  Barriers
                </div>

                <div className="mt-5 space-y-3">
                  {result.barriers.length >
                  0 ? (
                    result.barriers.map(
                      (
                        barrier,
                        index,
                      ) => (
                        <div
                          key={
                            index
                          }
                          className="border-l border-red-300/30 pl-3 text-sm text-white/60"
                        >
                          {
                            barrier
                          }
                        </div>
                      ),
                    )
                  ) : (
                    <div className="text-sm text-white/25">
                      No explicit barrier
                      detected in this
                      scan.
                    </div>
                  )}
                </div>
              </div>
            </section>

            {conflicts.length >
              0 && (
              <section className="border-b border-white/10 bg-red-300/[0.03] px-5 py-10 md:px-8">
                <div className="text-[8px] font-black uppercase tracking-[0.25em] text-red-300">
                  Route conflict
                </div>

                <h2 className="mt-3 text-2xl font-black tracking-[-0.04em]">
                  Earlier evidence needs
                  to be reconciled.
                </h2>

                <div className="mt-6 space-y-4">
                  {conflicts.map(
                    (
                      conflict,
                      index,
                    ) => (
                      <div
                        key={
                          index
                        }
                        className="border border-red-300/15 bg-red-300/5 p-5"
                      >
                        <div className="text-sm font-black">
                          {
                            conflict.issue
                          }
                        </div>

                        <div className="mt-3 text-xs leading-6 text-white/40">
                          Scans{" "}
                          {conflict.scanNumbers.join(
                            " and ",
                          )}{" "}
                          contain evidence
                          that does not fully
                          agree.
                        </div>

                        {conflict
                          .evidence
                          ?.length >
                          0 && (
                          <div className="mt-4 space-y-2">
                            {conflict.evidence.map(
                              (
                                evidence,
                                evidenceIndex,
                              ) => (
                                <div
                                  key={
                                    evidenceIndex
                                  }
                                  className="border-l border-red-300/20 pl-3 text-[10px] leading-5 text-white/30"
                                >
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

            <section className="border-b border-white/10 px-5 py-10 md:px-8">
              <div className="text-[8px] font-black uppercase tracking-[0.25em] text-yellow-200">
                What would change my answer?
              </div>

              <h2 className="mt-3 text-2xl font-black tracking-[-0.04em]">
                Don't hide the uncertainty.
              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/35">
                AccessLens identifies the
                specific evidence that could
                make the route assessment
                stronger or change it.
              </p>

              <div className="mt-6 space-y-3">
                {result
                  .whatWouldChangeMyAnswer
                  .length > 0 ? (
                  result.whatWouldChangeMyAnswer.map(
                    (
                      item,
                      index,
                    ) => (
                      <div
                        key={
                          index
                        }
                        className="border border-yellow-200/10 bg-yellow-200/[0.02] p-4 text-sm text-white/50"
                      >
                        {item}
                      </div>
                    ),
                  )
                ) : (
                  <div className="text-sm text-white/25">
                    No additional evidence
                    request was generated
                    for this scan.
                  </div>
                )}
              </div>
            </section>

            {result.nextScan && (
              <section className="border-b border-white/10 bg-lime-300 px-5 py-10 text-black md:px-8">
                <div className="text-[8px] font-black uppercase tracking-[0.25em] opacity-60">
                  NEXT EVIDENCE
                </div>

                <h2 className="mt-3 max-w-3xl text-3xl font-black tracking-[-0.05em] md:text-4xl">
                  {
                    result.nextScan
                      .title
                  }
                </h2>

                <p className="mt-4 max-w-2xl text-sm leading-6 opacity-70">
                  {
                    result.nextScan
                      .instruction
                  }
                </p>

                <div className="mt-4 max-w-2xl border-l border-black/30 pl-3 text-xs leading-5 opacity-60">
                  {
                    result.nextScan
                      .reason
                  }
                </div>

                <button
                  onClick={
                    continueScanning
                  }
                  className="mt-7 bg-black px-6 py-4 text-[9px] font-black uppercase tracking-[0.2em] text-lime-300 transition hover:bg-black/80"
                >
                  Scan next →
                </button>
              </section>
            )}

            <section className="grid border-b border-white/10 md:grid-cols-3">
              <button
                onClick={() =>
                  router.push(
                    "/assist",
                  )
                }
                className="border-b border-white/10 p-6 text-left transition hover:bg-white/[0.02] md:border-b-0 md:border-r md:p-8"
              >
                <div className="text-[8px] font-black uppercase tracking-[0.2em] text-lime-300">
                  Human backup
                </div>

                <div className="mt-3 text-xl font-black">
                  Need assistance?
                </div>

                <div className="mt-2 text-xs leading-5 text-white/30">
                  Share your location
                  voluntarily and connect
                  to an available hospital.
                </div>
              </button>

              <button
                onClick={() =>
                  router.push(
                    "/live-route",
                  )
                }
                className="border-b border-white/10 bg-lime-300/[0.03] p-6 text-left transition hover:bg-lime-300/[0.06] md:border-b-0 md:border-r md:p-8"
              >
                <div className="text-[8px] font-black uppercase tracking-[0.2em] text-lime-300">
                  Route mode
                </div>

                <div className="mt-3 text-xl font-black">
                  Enter Live Route →
                </div>

                <div className="mt-2 text-xs leading-5 text-white/30">
                  Stay inside the route,
                  track progress, and see
                  the next evidence needed.
                </div>
              </button>

              <button
                onClick={
                  startNewJourney
                }
                className="p-6 text-left transition hover:bg-white/[0.02] md:p-8"
              >
                <div className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">
                  Reset
                </div>

                <div className="mt-3 text-xl font-black">
                  Start new journey
                </div>

                <div className="mt-2 text-xs leading-5 text-white/30">
                  Clear the current scan
                  journey and begin again.
                </div>
              </button>
            </section>

            <section className="border-b border-white/10 px-5 py-6 md:px-8">
              <button
                onClick={() =>
                  setShowTechnical(
                    !showTechnical,
                  )
                }
                className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25 hover:text-white"
              >
                {showTechnical
                  ? "Hide technical evidence"
                  : "Show technical evidence"}
              </button>

              {showTechnical && (
                <pre className="mt-5 max-h-[600px] overflow-auto border border-white/10 bg-white/[0.02] p-5 text-[9px] leading-5 text-white/30">
                  {JSON.stringify(
                    result,
                    null,
                    2,
                  )}
                </pre>
              )}
            </section>
          </>
        )}

        {!result &&
          scanCount === 0 && (
            <section className="border-b border-white/10 px-5 py-10 md:px-8">
              <div className="text-[8px] font-black uppercase tracking-[0.25em] text-white/25">
                How AccessLens thinks
              </div>

              <div className="mt-6 grid gap-px border border-white/10 bg-white/10 md:grid-cols-4">
                {[
                  {
                    number:
                      "01",
                    title:
                      "SEE",
                    text: "Capture what is physically visible.",
                  },
                  {
                    number:
                      "02",
                    title:
                      "UNDERSTAND",
                    text: "Identify accessibility evidence and uncertainty.",
                  },
                  {
                    number:
                      "03",
                    title:
                      "CONNECT",
                    text: "Combine scans into a route through the space.",
                  },
                  {
                    number:
                      "04",
                    title:
                      "ASSIST",
                    text: "Connect the person to human help when needed.",
                  },
                ].map(
                  (
                    item,
                  ) => (
                    <div
                      key={
                        item.number
                      }
                      className="bg-black p-6"
                    >
                      <div className="text-[8px] font-black tracking-[0.2em] text-lime-300">
                        {
                          item.number
                        }
                      </div>

                      <div className="mt-5 text-lg font-black">
                        {
                          item.title
                        }
                      </div>

                      <div className="mt-2 text-xs leading-5 text-white/30">
                        {
                          item.text
                        }
                      </div>
                    </div>
                  ),
                )}
              </div>
            </section>
          )}

        <footer className="px-5 py-10 text-center md:px-8">
          <div className="text-[8px] font-black uppercase tracking-[0.15em] text-white/20">
            AccessLens provides
            evidence-based visual
            guidance. It does not
            guarantee accessibility.
          </div>
        </footer>
      </div>
    </main>
  );
}