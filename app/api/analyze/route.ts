import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

import {
  AccessibilityMode,
  AccessibilityThresholds,
  EvidenceStatus,
  Observation,
  ScanContext,
  ScanMemory,
  RouteConflict,
  buildScanRouteGraph,
  buildScanToScanRoute,
  buildRouteTransitions,
  detectRouteConflicts,
  reasonAboutAccessibility,
} from "@/lib/accessibility";

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

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

function isValidDataUri(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("data:image/")
  );
}

function normalize(
  value: string,
) {
  return value
    .toLowerCase()
    .trim();
}

function sanitizePreviousScans(
  scans: unknown,
): ScanMemory[] {
  if (!Array.isArray(scans)) {
    return [];
  }

  const validContexts: ScanContext[] =
    [
      "entrance",
      "pathway",
      "hallway",
      "stairs",
      "ramp",
      "elevator",
      "destination",
      "unknown",
    ];

  return scans
    .map((scan, index) => {
      if (
        !scan ||
        typeof scan !==
          "object"
      ) {
        return null;
      }

      const item =
        scan as Record<
          string,
          unknown
        >;

      const observations =
        Array.isArray(
          item.observations,
        )
          ? item.observations
              .map(
                (
                  observation,
                ) => {
                  if (
                    !observation ||
                    typeof observation !==
                      "object"
                  ) {
                    return null;
                  }

                  const obs =
                    observation as Record<
                      string,
                      unknown
                    >;

                  if (
                    typeof obs.feature !==
                      "string" ||
                    typeof obs.evidence !==
                      "string"
                  ) {
                    return null;
                  }

                  const status =
                    obs.status;

                  const confidence =
                    obs.confidence;

                  if (
                    status !==
                      "confirmed" &&
                    status !==
                      "uncertain" &&
                    status !==
                      "not_visible"
                  ) {
                    return null;
                  }

                  if (
                    confidence !==
                      "high" &&
                    confidence !==
                      "medium" &&
                    confidence !==
                      "low"
                  ) {
                    return null;
                  }

                  return {
                    feature:
                      obs.feature,
                    status,
                    confidence,
                    evidence:
                      obs.evidence,
                  } as Observation;
                },
              )
              .filter(
                (
                  value,
                ): value is Observation =>
                  Boolean(value),
              )
          : [];

      const context =
        validContexts.includes(
          item.context as ScanContext,
        )
          ? (item.context as ScanContext)
          : "unknown";

      return {
        scanNumber:
          typeof item.scanNumber ===
          "number"
            ? item.scanNumber
            : index + 1,

        context,

        environment:
          typeof item.environment ===
          "string"
            ? item.environment
            : "Unknown environment",

        observations,
      };
    })
    .filter(
      (
        scan,
      ): scan is ScanMemory =>
        Boolean(scan),
    );
}

/*
|--------------------------------------------------------------------------
| Evidence helpers
|--------------------------------------------------------------------------
*/

function hasFeature(
  scans: ScanMemory[],
  keywords: string[],
  statuses: EvidenceStatus[] = [
    "confirmed",
  ],
) {
  return scans.some(
    (scan) =>
      scan.observations.some(
        (observation) =>
          statuses.includes(
            observation.status,
          ) &&
          keywords.some(
            (keyword) =>
              normalize(
                observation.feature,
              ).includes(
                keyword,
              ),
          ),
      ),
  );
}

function hasFeatureInScan(
  scan: ScanMemory,
  keywords: string[],
  statuses: EvidenceStatus[] = [
    "confirmed",
  ],
) {
  return scan.observations.some(
    (observation) =>
      statuses.includes(
        observation.status,
      ) &&
      keywords.some(
        (keyword) =>
          normalize(
            observation.feature,
          ).includes(
            keyword,
          ),
      ),
  );
}

function hasTransitionEvidence(
  scan: ScanMemory,
) {
  return scan.observations.some(
    (observation) =>
      observation.status ===
        "confirmed" &&
      /door|doorway|entrance|exit|ramp|elevator|lift|hallway|pathway|turn|landing/i.test(
        observation.feature,
      ),
  );
}

/*
|--------------------------------------------------------------------------
| Route Gap Engine
|--------------------------------------------------------------------------
|
| This searches the WHOLE route for missing evidence.
|
| It does not simply ask:
|
| "What did the latest image contain?"
|
| It asks:
|
| "What part of the route would still prevent us from
| confidently understanding the user's path?"
|--------------------------------------------------------------------------
*/

function findRouteGaps(
  scans: ScanMemory[],
  mode: AccessibilityMode,
  conflicts: RouteConflict[],
): RouteGap[] {
  const gaps: RouteGap[] = [];

  if (!scans.length) {
    return gaps;
  }

  /*
   * Critical conflicts.
   */

  for (const conflict of conflicts) {
    gaps.push({
      priority:
        conflict.severity ===
        "high"
          ? "critical"
          : "high",

      title:
        "Resolve route connection",

      instruction:
        `Capture the space connecting scans ${conflict.scanNumbers.join(
          " and ",
        )}. Keep the camera wide enough to show both sides of the transition.`,

      reason:
        conflict.issue,

      fromScan:
        conflict.scanNumbers[0],

      toScan:
        conflict.scanNumbers[
          conflict.scanNumbers.length -
            1
        ],
    });
  }

  /*
   * Missing transition between consecutive scans.
   */

  for (
    let i = 0;
    i <
    scans.length - 1;
    i++
  ) {
    const current =
      scans[i];

    const next =
      scans[i + 1];

    const currentHasTransition =
      hasTransitionEvidence(
        current,
      );

    const nextHasTransition =
      hasTransitionEvidence(
        next,
      );

    const currentHasUncertainty =
      hasFeatureInScan(
        current,
        [
          "door",
          "path",
          "ramp",
          "elevator",
          "stairs",
          "obstacle",
        ],
        ["uncertain"],
      );

    const nextHasUncertainty =
      hasFeatureInScan(
        next,
        [
          "door",
          "path",
          "ramp",
          "elevator",
          "stairs",
          "obstacle",
        ],
        ["uncertain"],
      );

    if (
      !currentHasTransition &&
      !nextHasTransition
    ) {
      gaps.push({
        priority: "high",

        title:
          `Verify ${current.context} → ${next.context}`,

        instruction:
          `Capture the space connecting the ${current.context} to the ${next.context}. Show the transition rather than only one side of it.`,

        reason:
          "Both route points exist, but the visual connection between them is weak.",

        fromScan:
          current.scanNumber,

        toScan:
          next.scanNumber,

        targetContext:
          next.context,
      });
    } else if (
      currentHasUncertainty ||
      nextHasUncertainty
    ) {
      gaps.push({
        priority: "high",

        title:
          `Resolve ${current.context} → ${next.context}`,

        instruction:
          `Re-scan the transition between the ${current.context} and ${next.context} with a wider view.`,

        reason:
          "One or more observations affecting this transition remain uncertain.",

        fromScan:
          current.scanNumber,

        toScan:
          next.scanNumber,

        targetContext:
          next.context,
      });
    }
  }

  /*
   * Wheelchair / mobility:
   * stairs require an alternative.
   */

  if (
    mode === "wheelchair" ||
    mode === "mobility"
  ) {
    const hasStairs =
      hasFeature(
        scans,
        [
          "stairs",
          "steps",
          "staircase",
        ],
      );

    const hasAlternative =
      hasFeature(
        scans,
        [
          "ramp",
          "elevator",
          "lift",
          "step-free",
        ],
      );

    if (
      hasStairs &&
      !hasAlternative
    ) {
      gaps.push({
        priority: "critical",

        title:
          "Find a step-free alternative",

        instruction:
          "Scan around the stairs for a ramp, elevator, lift, or other step-free route.",

        reason:
          "The route contains stairs but no confirmed step-free alternative has been found.",

        targetContext:
          "ramp",
      });
    }
  }

  /*
   * Ramp continuation.
   */

  scans.forEach(
    (scan) => {
      if (
        scan.context !==
        "ramp"
      ) {
        return;
      }

      const hasContinuation =
        hasFeatureInScan(
          scan,
          [
            "door",
            "hallway",
            "pathway",
            "landing",
            "exit",
            "top",
          ],
        );

      if (!hasContinuation) {
        gaps.push({
          priority: "high",

          title:
            "Verify ramp connection",

          instruction:
            "Capture where the ramp ends and show the path, doorway, or landing it connects to.",

          reason:
            "The ramp is visible, but its connection to the next route segment has not been established.",

          fromScan:
            scan.scanNumber,

          targetContext:
            "pathway",
        });
      }
    },
  );

  /*
   * Elevator continuation.
   */

  scans.forEach(
    (scan) => {
      if (
        scan.context !==
        "elevator"
      ) {
        return;
      }

      const hasContinuation =
        hasFeatureInScan(
          scan,
          [
            "hallway",
            "pathway",
            "door",
            "exit",
            "corridor",
          ],
        );

      if (!hasContinuation) {
        gaps.push({
          priority: "high",

          title:
            "Verify elevator exit",

          instruction:
            "Capture the area immediately outside the elevator and show where the route continues.",

          reason:
            "The elevator provides a possible vertical connection, but the route beyond it is not established.",

          fromScan:
            scan.scanNumber,

          targetContext:
            "hallway",
        });
      }
    },
  );

  /*
   * Entrance must connect to interior route.
   */

  const entrance =
    scans.find(
      (scan) =>
        scan.context ===
        "entrance",
    );

  if (
    entrance &&
    scans.length === 1
  ) {
    gaps.push({
      priority: "high",

      title:
        "Establish the interior route",

      instruction:
        "Capture the space immediately beyond the entrance, including the first hallway, pathway, ramp, or elevator.",

      reason:
        "The entrance is known, but the route into the building has not yet been established.",

      fromScan:
        entrance.scanNumber,
    });
  }

  /*
   * Hallway/pathway without destination evidence.
   */

  const hasDestination =
    scans.some(
      (scan) =>
        scan.context ===
        "destination",
    );

  if (
    scans.length >= 3 &&
    !hasDestination
  ) {
    const latest =
      scans[
        scans.length - 1
      ];

    if (
      latest.context ===
        "hallway" ||
      latest.context ===
        "pathway"
    ) {
      gaps.push({
        priority: "medium",

        title:
          "Find the destination route",

        instruction:
          "Continue forward and capture the next major doorway, sign, landmark, or destination area.",

        reason:
          "The route has been established across several scans but has not yet reached a confirmed destination.",

        fromScan:
          latest.scanNumber,
      });
    }
  }

  return gaps;
}

/*
|--------------------------------------------------------------------------
| Choose the single most useful gap.
|--------------------------------------------------------------------------
*/

function chooseBestRouteGap(
  gaps: RouteGap[],
): RouteGap | null {
  if (!gaps.length) {
    return null;
  }

  const priorityValue = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  return [...gaps].sort(
    (a, b) =>
      priorityValue[
        b.priority
      ] -
      priorityValue[
        a.priority
      ],
  )[0];
}

/*
|--------------------------------------------------------------------------
| Adaptive Next Evidence
|--------------------------------------------------------------------------
*/

function createNextScanInstruction(
  scans: ScanMemory[],
  mode: AccessibilityMode,
  routeConflicts: RouteConflict[],
): NextScanInstruction | null {
  if (!scans.length) {
    return {
      title: "Find the entrance",
      instruction:
        "Start by capturing the main entrance and the area immediately around it.",
      reason:
        "AccessLens needs an initial spatial anchor before it can build a route.",
      priority: "critical",
      targetContext:
        "entrance",
    };
  }

  const latest =
    scans[scans.length - 1];

  if (
    latest.context ===
    "destination"
  ) {
    return null;
  }

  /*
   * First search the entire route for gaps.
   */

  const gaps =
    findRouteGaps(
      scans,
      mode,
      routeConflicts,
    );

  const bestGap =
    chooseBestRouteGap(
      gaps,
    );

  if (bestGap) {
    return {
      title:
        bestGap.title,

      instruction:
        bestGap.instruction,

      reason:
        bestGap.reason,

      priority:
        bestGap.priority,

      targetContext:
        bestGap.targetContext,
    };
  }

  /*
   * If no major gap exists,
   * inspect unresolved evidence.
   */

  const unresolved =
    scans.flatMap(
      (scan) =>
        scan.observations
          .filter(
            (observation) =>
              observation.status ===
              "uncertain",
          )
          .map(
            (observation) => ({
              scan,
              observation,
            }),
          ),
    );

  const importantUncertainty =
    unresolved.find(
      ({
        observation,
      }) =>
        /stairs|step|ramp|slope|door|width|elevator|lift|obstacle|path|entrance/i.test(
          observation.feature,
        ),
    );

  if (
    importantUncertainty
  ) {
    return {
      title:
        "Resolve uncertain evidence",

      instruction:
        `Capture a wider view of the ${importantUncertainty.observation.feature}.`,

      reason:
        "This evidence could affect route accessibility but is not yet reliable enough.",

      priority: "high",

      targetContext:
        importantUncertainty
          .scan.context,
    };
  }

  /*
   * Context-specific continuation.
   */

  switch (
    latest.context
  ) {
    case "entrance":
      return {
        title:
          "Continue past the entrance",
        instruction:
          "Capture the next connected hallway, pathway, ramp, elevator, or doorway.",
        reason:
          "The entrance is established and the route needs its next connected segment.",
        priority: "medium",
      };

    case "hallway":
      return {
        title:
          "Find the next route change",
        instruction:
          "Capture the next doorway, turn, ramp, elevator, sign, or destination area.",
        reason:
          "The hallway is known but the next meaningful route transition is not.",
        priority: "medium",
      };

    case "pathway":
      return {
        title:
          "Follow the route forward",
        instruction:
          "Capture the next meaningful transition or destination area.",
        reason:
          "The current path is known and AccessLens needs the next route anchor.",
        priority: "medium",
      };

    case "stairs":
      return {
        title:
          mode ===
            "wheelchair" ||
          mode === "mobility"
            ? "Search beside the stairs"
            : "Capture beyond the stairs",

        instruction:
          mode ===
            "wheelchair" ||
          mode === "mobility"
            ? "Look around the stairs for a ramp, elevator, lift, or other step-free route."
            : "Capture the landing and the route continuing beyond the stairs.",

        reason:
          "The next usable route segment has not been established.",

        priority:
          mode ===
            "wheelchair" ||
          mode === "mobility"
            ? "high"
            : "medium",
      };

    case "ramp":
      return {
        title:
          "Capture the end of the ramp",
        instruction:
          "Show where the ramp leads and include the surrounding pathway or doorway.",
        reason:
          "The route needs evidence of what the ramp connects to.",
        priority: "high",
      };

    case "elevator":
      return {
        title:
          "Capture beyond the elevator",
        instruction:
          "Show the area outside the elevator and where the route continues.",
        reason:
          "The elevator establishes vertical movement, but the next route segment remains unknown.",
        priority: "high",
      };

    default:
      return {
        title:
          "Find the next route anchor",
        instruction:
          "Capture a wider view showing where the current space connects to another area.",
        reason:
          "AccessLens needs another connected observation to extend the route.",
        priority: "medium",
      };
  }
}

/*
|--------------------------------------------------------------------------
| Transition explanation
|--------------------------------------------------------------------------
*/

function transitionReason(
  status:
    | "supported"
    | "uncertain"
    | "blocked",
  fromContext: ScanContext,
  toContext: ScanContext,
  evidence: string[],
) {
  if (
    status === "blocked"
  ) {
    return `The transition from ${fromContext} to ${toContext} contains evidence of a barrier without enough evidence of a usable alternative.`;
  }

  if (
    status === "supported"
  ) {
    return `Evidence supports a route transition from ${fromContext} to ${toContext}.`;
  }

  if (evidence.length > 0) {
    return `The transition from ${fromContext} to ${toContext} is possible, but the available evidence does not fully establish the connection.`;
  }

  return `More visual evidence is needed to confirm the transition from ${fromContext} to ${toContext}.`;
}

/*
|--------------------------------------------------------------------------
| Route confidence
|--------------------------------------------------------------------------
*/

function buildConfidenceSummary(
  transitions: ReturnType<
    typeof buildRouteTransitions
  >,
  conflicts: RouteConflict[],
) {
  if (
    conflicts.some(
      (conflict) =>
        conflict.severity ===
        "high",
    )
  ) {
    return {
      level: "low" as const,
      headline:
        "Route needs verification",
      explanation:
        "At least one important route connection contains conflicting evidence.",
    };
  }

  if (
    transitions.some(
      (transition) =>
        transition.status ===
        "blocked",
    )
  ) {
    return {
      level: "low" as const,
      headline:
        "A route barrier is present",
      explanation:
        "The current evidence contains a transition with a detected barrier.",
    };
  }

  if (
    transitions.some(
      (transition) =>
        transition.status ===
        "uncertain",
    )
  ) {
    return {
      level: "medium" as const,
      headline:
        "Route partially verified",
      explanation:
        "The route has supporting evidence, but one or more connections still need additional visual confirmation.",
    };
  }

  if (
    transitions.length > 0
  ) {
    return {
      level: "high" as const,
      headline:
        "Route evidence is consistent",
      explanation:
        "The scanned route transitions currently contain consistent supporting evidence.",
    };
  }

  return {
    level: "low" as const,
    headline:
      "More route evidence needed",
    explanation:
      "There is not yet enough route history to assess route consistency.",
  };
}

function buildRouteMessage(
  conflicts: RouteConflict[],
  transitions: ReturnType<
    typeof buildRouteTransitions
  >,
) {
  if (
    conflicts.length > 0
  ) {
    return "AccessLens found conflicting route evidence. Capture the missing connection before continuing.";
  }

  if (
    transitions.some(
      (transition) =>
        transition.status ===
        "blocked",
    )
  ) {
    return "A potential route barrier was detected. Look for an alternative before continuing.";
  }

  if (
    transitions.some(
      (transition) =>
        transition.status ===
        "uncertain",
    )
  ) {
    return "The route is partially established. Additional evidence is needed for one or more transitions.";
  }

  if (
    transitions.length > 0
  ) {
    return "The scanned route currently has consistent supporting evidence.";
  }

  return "Continue scanning to build the route.";
}

/*
|--------------------------------------------------------------------------
| API
|--------------------------------------------------------------------------
*/

export async function POST(
  request: Request,
) {
  try {
    if (
      !process.env.GEMINI_API_KEY
    ) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY is not configured.",
        },
        {
          status: 500,
        },
      );
    }

    const body =
      await request.json();

    const {
      image,
      mode,
      thresholds,
      previousScans,
    } = body;

    if (!isValidDataUri(image)) {
      return NextResponse.json(
        {
          error:
            "A valid image data URI is required.",
        },
        {
          status: 400,
        },
      );
    }

    const validModes: AccessibilityMode[] =
      [
        "wheelchair",
        "mobility",
        "visual",
      ];

    const selectedMode: AccessibilityMode =
      validModes.includes(
        mode,
      )
        ? mode
        : "wheelchair";

    const selectedThresholds: AccessibilityThresholds =
      {
        maxStepHeight:
          typeof thresholds
            ?.maxStepHeight ===
          "number"
            ? thresholds.maxStepHeight
            : 2,

        minDoorWidth:
          typeof thresholds
            ?.minDoorWidth ===
          "number"
            ? thresholds.minDoorWidth
            : 80,

        maxSlope:
          typeof thresholds
            ?.maxSlope ===
          "number"
            ? thresholds.maxSlope
            : 8,
      };

    const cleanPreviousScans =
      sanitizePreviousScans(
        previousScans,
      );

    const commaIndex =
      image.indexOf(",");

    if (
      commaIndex === -1
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid image data.",
        },
        {
          status: 400,
        },
      );
    }

    const mimeMatch =
      image.match(
        /^data:(image\/[^;]+);base64,/,
      );

    const mimeType =
      mimeMatch?.[1] ||
      "image/jpeg";

    const base64Image =
      image.slice(
        commaIndex + 1,
      );

    const scanNumber =
      cleanPreviousScans.length +
      1;

    const previousContext =
      cleanPreviousScans.length >
      0
        ? JSON.stringify(
            cleanPreviousScans,
            null,
            2,
          )
        : "No previous scans.";

    /*
     * Gemini is responsible for visual evidence extraction.
     *
     * The route intelligence itself is handled
     * deterministically below.
     */

    const prompt = `
You are the visual evidence engine for AccessLens.

Selected accessibility profile:
${selectedMode}

Thresholds:
- Maximum step height: ${selectedThresholds.maxStepHeight}
- Minimum door width: ${selectedThresholds.minDoorWidth} cm
- Maximum slope: ${selectedThresholds.maxSlope}%

Current scan number:
${scanNumber}

Analyze ONLY what is visibly supported by the CURRENT IMAGE.

Previous scans are memory only.
Do not assume previous observations are still true.
Do not invent connections between areas.
Do not fabricate measurements.
Do not guarantee accessibility.

Identify visible:
- stairs
- steps
- ramps
- slopes
- elevators
- lifts
- doors
- doorways
- thresholds
- hallways
- pathways
- obstacles
- narrow passages
- blocked areas
- handrails
- signs
- landmarks
- entrances
- exits
- destination-like spaces
- route transitions

For every important observation:
- confirmed = visible evidence supports it
- uncertain = something is visible but cannot be confidently established
- not_visible = relevant evidence cannot be determined

Return ONLY JSON:

{
  "environment": "short description",
  "scanContext": "entrance | pathway | hallway | stairs | ramp | elevator | destination | unknown",
  "observations": [
    {
      "feature": "feature name",
      "status": "confirmed | uncertain | not_visible",
      "confidence": "high | medium | low",
      "evidence": "visible evidence"
    }
  ]
}

Previous scan memory:
${previousContext}
`;

    const result =
      await ai.models.generateContent(
        {
          model:
            "gemini-3.8-flash",

          contents: [
            {
              role: "user",

              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: base64Image,
                  },
                },

                {
                  text: prompt,
                },
              ],
            },
          ],
        },
      );

    const rawText =
      result.text ??
      "";

    let parsed:
      | {
          environment?: string;
          scanContext?: string;
          observations?: unknown[];
        }
      | null = null;

    try {
      const cleaned =
        rawText
          .replace(
            /^```json\s*/i,
            "",
          )
          .replace(
            /^```\s*/i,
            "",
          )
          .replace(
            /\s*```$/i,
            "",
          )
          .trim();

      parsed =
        JSON.parse(
          cleaned,
        );
    } catch {
      return NextResponse.json(
        {
          error:
            "Gemini returned an invalid analysis format.",
        },
        {
          status: 502,
        },
      );
    }

    const validContexts: ScanContext[] =
      [
        "entrance",
        "pathway",
        "hallway",
        "stairs",
        "ramp",
        "elevator",
        "destination",
        "unknown",
      ];

    const scanContext =
      validContexts.includes(
        parsed?.scanContext as ScanContext,
      )
        ? (parsed?.scanContext as ScanContext)
        : "unknown";

    const observations: Observation[] =
      Array.isArray(
        parsed?.observations,
      )
        ? parsed.observations
            .map(
              (item) => {
                if (
                  !item ||
                  typeof item !==
                    "object"
                ) {
                  return null;
                }

                const observation =
                  item as Record<
                    string,
                    unknown
                  >;

                if (
                  typeof observation.feature !==
                    "string" ||
                  typeof observation.evidence !==
                    "string"
                ) {
                  return null;
                }

                if (
                  observation.status !==
                    "confirmed" &&
                  observation.status !==
                    "uncertain" &&
                  observation.status !==
                    "not_visible"
                ) {
                  return null;
                }

                if (
                  observation.confidence !==
                    "high" &&
                  observation.confidence !==
                    "medium" &&
                  observation.confidence !==
                    "low"
                ) {
                  return null;
                }

                return {
                  feature:
                    observation.feature,
                  status:
                    observation.status,
                  confidence:
                    observation.confidence,
                  evidence:
                    observation.evidence,
                } as Observation;
              },
            )
            .filter(
              (
                value,
              ): value is Observation =>
                Boolean(value),
            )
        : [];

    const currentScan: ScanMemory =
      {
        scanNumber,

        context:
          scanContext,

        environment:
          typeof parsed
            ?.environment ===
          "string"
            ? parsed.environment
            : "Unknown environment",

        observations,
      };

    const combinedScans = [
      ...cleanPreviousScans,
      currentScan,
    ];

    /*
     * Current-scan accessibility reasoning.
     */

    const reasoning =
      reasonAboutAccessibility(
        { observations },
        selectedMode,
        selectedThresholds,
      );

    /*
     * Whole-route intelligence.
     */

    const scanRoute =
      buildScanToScanRoute(
        combinedScans,
        selectedMode,
      );

    const routeGraph =
      buildScanRouteGraph(
        combinedScans,
        selectedMode,
      );

    const routeTransitions =
      buildRouteTransitions(
        combinedScans,
        selectedMode,
      );

    const routeConflicts =
      detectRouteConflicts(
        combinedScans,
        selectedMode,
      );

    /*
     * Adaptive route-gap engine.
     */

    const routeGaps =
      findRouteGaps(
        combinedScans,
        selectedMode,
        routeConflicts,
      );

    const nextScan =
      createNextScanInstruction(
        combinedScans,
        selectedMode,
        routeConflicts,
      );

    /*
     * Enrich transitions with explanations.
     */

    const enrichedTransitions =
      routeTransitions.map(
        (transition) => ({
          ...transition,

          reason:
            transitionReason(
              transition.status,
              transition.fromContext,
              transition.toContext,
              transition.evidence,
            ),
        }),
      );

    /*
     * Confidence.
     */

    const confidence =
      buildConfidenceSummary(
        routeTransitions,
        routeConflicts,
      );

    /*
     * Route message.
     */

    const routeMessage =
      buildRouteMessage(
        routeConflicts,
        routeTransitions,
      );

    const supportedTransitions =
      enrichedTransitions.filter(
        (transition) =>
          transition.status ===
          "supported",
      ).length;

    const uncertainTransitions =
      enrichedTransitions.filter(
        (transition) =>
          transition.status ===
          "uncertain",
      ).length;

    const blockedTransitions =
      enrichedTransitions.filter(
        (transition) =>
          transition.status ===
          "blocked",
      ).length;

    return NextResponse.json({
      scanNumber,

      profile:
        selectedMode,

      scanContext,

      environment:
        currentScan.environment,

      observations,

      currentScanObservations:
        observations,

      status:
        reasoning.status,

      barriers:
        reasoning.barriers,

      features:
        reasoning.features,

      uncertainties:
        reasoning.uncertainties,

      whatWouldChangeMyAnswer:
        reasoning.whatWouldChangeMyAnswer,

      message:
        reasoning.message,

      suggestedRoute:
        reasoning.suggestedRoute,

      /*
       * Existing route data.
       */

      scanRoute,

      routeGraph,

      routeTransitions:
        enrichedTransitions,

      routeConflicts,

      /*
       * NEW:
       * Full route-gap state.
       */

      routeGaps,

      nextScan,

      confidence,

      routeSummary: {
        scans:
          combinedScans.length,

        supportedTransitions,

        uncertainTransitions,

        blockedTransitions,

        conflicts:
          routeConflicts.length,

        routeGaps:
          routeGaps.length,
      },

      routeMessage,
    });
  } catch (error) {
    console.error(
      "AccessLens analysis error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected analysis error.",
      },
      {
        status: 500,
      },
    );
  }
}