export type AccessibilityMode =
  | "wheelchair"
  | "mobility"
  | "visual";

export type EvidenceStatus =
  | "confirmed"
  | "uncertain"
  | "not_visible";

export type Observation = {
  feature: string;
  status: EvidenceStatus;
  confidence:
    | "high"
    | "medium"
    | "low";
  evidence: string;
};

export type AccessibilityThresholds = {
  maxStepHeight: number;
  minDoorWidth: number;
  maxSlope: number;
};

export type ScanContext =
  | "entrance"
  | "pathway"
  | "hallway"
  | "stairs"
  | "ramp"
  | "elevator"
  | "destination"
  | "unknown";

export type ScanMemory = {
  scanNumber: number;
  context: ScanContext;
  environment: string;
  observations: Observation[];
};

export type RouteStep = {
  label: string;
  scanNumber?: number;
  context?: ScanContext;
  confidence:
    | "high"
    | "medium"
    | "low";
  evidence?: string[];
  transition?: string;
};

export type RouteGraphStep = {
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

export type RouteConflict = {
  scanNumbers: number[];
  contexts: ScanContext[];
  issue: string;
  evidence: string[];
  severity:
    | "high"
    | "medium"
    | "low";
};

export type RouteTransition = {
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

export type AccessibilityReasoning = {
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
};

function normalize(
  value: string,
) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesFeature(
  observation: Observation,
  terms: string[],
) {
  const feature =
    normalize(observation.feature);

  const evidence =
    normalize(observation.evidence);

  return terms.some(
    (term) =>
      feature.includes(term) ||
      evidence.includes(term),
  );
}

function containsFeature(
  observations: Observation[],
  terms: string[],
) {
  return observations.some(
    (observation) =>
      observation.status ===
        "confirmed" &&
      matchesFeature(
        observation,
        terms,
      ),
  );
}

function determineScanContext(
  observations: Observation[],
): ScanContext {
  if (
    containsFeature(observations, [
      "elevator",
      "lift",
    ])
  ) {
    return "elevator";
  }

  if (
    containsFeature(observations, [
      "stairs",
      "stair",
      "step",
    ])
  ) {
    return "stairs";
  }

  if (
    containsFeature(observations, [
      "ramp",
      "slope",
    ])
  ) {
    return "ramp";
  }

  if (
    containsFeature(observations, [
      "entrance",
      "entry",
      "door",
    ])
  ) {
    return "entrance";
  }

  if (
    containsFeature(observations, [
      "hallway",
      "corridor",
      "hall",
    ])
  ) {
    return "hallway";
  }

  if (
    containsFeature(observations, [
      "path",
      "pathway",
      "walkway",
      "corridor",
    ])
  ) {
    return "pathway";
  }

  if (
    containsFeature(observations, [
      "destination",
      "room",
      "counter",
      "desk",
    ])
  ) {
    return "destination";
  }

  return "unknown";
}

export function createScanMemory(
  scanNumber: number,
  environment: string,
  observations: Observation[],
  scanContext?: ScanContext,
): ScanMemory {
  return {
    scanNumber,
    environment,
    observations,
    context:
      scanContext ||
      determineScanContext(
        observations,
      ),
  };
}

function hasPositiveAccessEvidence(
  scan: ScanMemory,
  mode: AccessibilityMode,
) {
  const observations =
    scan.observations;

  if (mode === "visual") {
    return observations.some(
      (observation) =>
        observation.status ===
          "confirmed" &&
        (
          matchesFeature(
            observation,
            [
              "clear path",
              "signage",
              "wayfinding",
              "visible entrance",
              "lighting",
              "landmark",
              "open path",
            ],
          ) ||
          observation.confidence ===
            "high"
        ),
    );
  }

  return observations.some(
    (observation) =>
      observation.status ===
        "confirmed" &&
      matchesFeature(
        observation,
        [
          "ramp",
          "elevator",
          "lift",
          "accessible entrance",
          "accessible door",
          "level entrance",
          "flat path",
          "clear path",
          "wide doorway",
          "handrail",
        ],
      ),
  );
}

function hasBarrierEvidence(
  scan: ScanMemory,
  mode: AccessibilityMode,
) {
  const observations =
    scan.observations;

  if (mode === "visual") {
    return observations.some(
      (observation) =>
        observation.status ===
          "confirmed" &&
        matchesFeature(
          observation,
          [
            "blocked path",
            "obstacle",
            "poor signage",
            "unclear signage",
          ],
        ),
    );
  }

  return observations.some(
    (observation) =>
      observation.status ===
        "confirmed" &&
      matchesFeature(
        observation,
        [
          "stairs",
          "step",
          "blocked",
          "obstacle",
          "narrow door",
          "narrow passage",
          "steep ramp",
          "barrier",
        ],
      ),
  );
}

function getEvidence(
  scan: ScanMemory,
  positive: boolean,
) {
  return scan.observations
    .filter(
      (observation) => {
        const text =
          normalize(
            `${observation.feature} ${observation.evidence}`,
          );

        if (positive) {
          return (
            observation.status ===
              "confirmed" &&
            ![
              "stairs",
              "blocked",
              "obstacle",
              "barrier",
            ].some(
              (term) =>
                text.includes(term),
            )
          );
        }

        return (
          observation.status ===
            "confirmed" &&
          [
            "stairs",
            "blocked",
            "obstacle",
            "barrier",
            "narrow",
            "steep",
          ].some(
            (term) =>
              text.includes(term),
          )
        );
      },
    )
    .map(
      (observation) =>
        observation.evidence,
    )
    .slice(0, 4);
}

function getConfidence(
  observations: Observation[],
) {
  if (
    observations.some(
      (observation) =>
        observation.confidence ===
          "high" &&
        observation.status ===
          "confirmed",
    )
  ) {
    return "high" as const;
  }

  if (
    observations.some(
      (observation) =>
        observation.confidence ===
          "medium" &&
        observation.status ===
          "confirmed",
    )
  ) {
    return "medium" as const;
  }

  return "low" as const;
}

export function reasonAboutAccessibility(
  scan: {
    observations: Observation[];
  },
  mode: AccessibilityMode,
  thresholds: AccessibilityThresholds,
): AccessibilityReasoning {
  const observations =
    scan.observations;

  const barriers =
    observations
      .filter(
        (observation) =>
          observation.status ===
            "confirmed" &&
          (
            matchesFeature(
              observation,
              [
                "stairs",
                "step",
                "obstacle",
                "blocked",
                "barrier",
                "narrow passage",
                "narrow door",
                "steep ramp",
              ],
            ) ||
            (
              mode !== "visual" &&
              matchesFeature(
                observation,
                [
                  "no ramp",
                  "no elevator",
                ],
              )
            )
          ),
      )
      .map(
        (observation) =>
          observation.feature,
      );

  const features =
    observations
      .filter(
        (observation) =>
          observation.status ===
            "confirmed" &&
          !barriers.includes(
            observation.feature,
          ),
      )
      .map(
        (observation) =>
          observation.feature,
      );

  const uncertainties =
    observations
      .filter(
        (observation) =>
          observation.status !==
          "confirmed",
      )
      .map(
        (observation) =>
          observation.evidence ||
          observation.feature,
      );

  const whatWouldChangeMyAnswer =
    uncertainties.length > 0
      ? uncertainties
          .slice(0, 4)
          .map(
            (item) =>
              `More visual evidence about ${item}.`,
          )
      : [
          "A clearer view of the full path.",
          "A closer view of any transition, doorway, ramp, or obstacle.",
        ];

  let status:
    | "accessible"
    | "potentially_accessible"
    | "barrier_detected"
    | "insufficient_evidence";

  if (barriers.length > 0) {
    status =
      "barrier_detected";
  } else if (
    features.length > 0
  ) {
    status =
      "potentially_accessible";
  } else {
    status =
      "insufficient_evidence";
  }

  const message =
    status ===
    "barrier_detected"
      ? "A potential accessibility barrier is visibly supported by this scan."
      : status ===
          "potentially_accessible"
        ? "The scan shows features that may support accessibility, but this does not certify the space."
        : "There is not enough visible evidence to make a strong accessibility assessment.";

  const suggestedRoute =
    features.length > 0
      ? features.slice(0, 4)
      : [];

  return {
    status,
    barriers,
    features,
    uncertainties,
    whatWouldChangeMyAnswer,
    message,
    suggestedRoute,
  };
}

/* -------------------------------------------------------------------------- */
/* ROUTE REASONING                                                            */
/* -------------------------------------------------------------------------- */

function contextCanFollow(
  from: ScanContext,
  to: ScanContext,
) {
  const transitions: Record<
    ScanContext,
    ScanContext[]
  > = {
    entrance: [
      "pathway",
      "hallway",
      "ramp",
      "elevator",
      "stairs",
      "destination",
      "unknown",
    ],

    pathway: [
      "pathway",
      "hallway",
      "ramp",
      "elevator",
      "stairs",
      "destination",
      "unknown",
    ],

    hallway: [
      "hallway",
      "elevator",
      "stairs",
      "ramp",
      "destination",
      "unknown",
    ],

    ramp: [
      "pathway",
      "hallway",
      "entrance",
      "destination",
      "unknown",
    ],

    stairs: [
      "hallway",
      "pathway",
      "destination",
      "unknown",
    ],

    elevator: [
      "hallway",
      "pathway",
      "destination",
      "unknown",
    ],

    destination: [
      "unknown",
    ],

    unknown: [
      "entrance",
      "pathway",
      "hallway",
      "stairs",
      "ramp",
      "elevator",
      "destination",
      "unknown",
    ],
  };

  return transitions[from].includes(to);
}

function hasTransitionEvidence(
  scan: ScanMemory,
  direction:
    | "exit"
    | "entry",
) {
  const exitTerms = [
    "door",
    "entrance",
    "exit",
    "opening",
    "path",
    "pathway",
    "hallway",
    "corridor",
    "ramp",
    "elevator",
    "stairs",
  ];

  const entryTerms = [
    "door",
    "entrance",
    "opening",
    "path",
    "pathway",
    "hallway",
    "corridor",
    "ramp",
    "elevator",
    "stairs",
    "destination",
  ];

  const terms =
    direction === "exit"
      ? exitTerms
      : entryTerms;

  return scan.observations.some(
    (observation) =>
      observation.status ===
        "confirmed" &&
      matchesFeature(
        observation,
        terms,
      ),
  );
}

function analyzeTransition(
  from: ScanMemory,
  to: ScanMemory,
  mode: AccessibilityMode,
): RouteTransition {
  const evidence: string[] = [];

  const fromBarrier =
    hasBarrierEvidence(
      from,
      mode,
    );

  const toBarrier =
    hasBarrierEvidence(
      to,
      mode,
    );

  const fromAccess =
    hasPositiveAccessEvidence(
      from,
      mode,
    );

  const toAccess =
    hasPositiveAccessEvidence(
      to,
      mode,
    );

  const fromExit =
    hasTransitionEvidence(
      from,
      "exit",
    );

  const toEntry =
    hasTransitionEvidence(
      to,
      "entry",
    );

  const logicalContext =
    contextCanFollow(
      from.context,
      to.context,
    );

  /*
   * BLOCKED
   *
   * A transition is blocked only when there is
   * explicit barrier evidence and no meaningful
   * access evidence that could resolve it.
   */

  if (
    mode !== "visual" &&
    (
      fromBarrier ||
      toBarrier
    ) &&
    !(
      fromAccess &&
      toAccess
    )
  ) {
    if (fromBarrier) {
      evidence.push(
        ...getEvidence(
          from,
          false,
        ),
      );
    }

    if (toBarrier) {
      evidence.push(
        ...getEvidence(
          to,
          false,
        ),
      );
    }

    return {
      fromScan:
        from.scanNumber,

      toScan:
        to.scanNumber,

      fromContext:
        from.context,

      toContext:
        to.context,

      status: "blocked",

      confidence:
        fromBarrier &&
        toBarrier
          ? "high"
          : "medium",

      evidence:
        Array.from(
          new Set(evidence),
        ).slice(0, 6),

      reason:
        "A visible barrier was identified in one of the scans, and the available evidence does not show a sufficiently clear accessible transition around it.",
    };
  }

  /*
   * SUPPORTED
   *
   * Strongest case:
   * - contexts logically follow
   * - both scans contain positive access evidence
   * - transition evidence exists
   */

  if (
    logicalContext &&
    fromAccess &&
    toAccess &&
    fromExit &&
    toEntry
  ) {
    evidence.push(
      ...getEvidence(
        from,
        true,
      ),
    );

    evidence.push(
      ...getEvidence(
        to,
        true,
      ),
    );

    return {
      fromScan:
        from.scanNumber,

      toScan:
        to.scanNumber,

      fromContext:
        from.context,

      toContext:
        to.context,

      status: "supported",

      confidence: "high",

      evidence:
        Array.from(
          new Set(evidence),
        ).slice(0, 6),

      reason:
        "Both scans contain relevant access evidence, the spatial contexts are logically compatible, and visible transition features are present on both sides.",
    };
  }

  /*
   * MODERATE SUPPORT
   */

  if (
    logicalContext &&
    (
      (
        fromAccess &&
        toAccess
      ) ||
      (
        fromExit &&
        toEntry
      )
    )
  ) {
    evidence.push(
      ...getEvidence(
        from,
        true,
      ),
    );

    evidence.push(
      ...getEvidence(
        to,
        true,
      ),
    );

    return {
      fromScan:
        from.scanNumber,

      toScan:
        to.scanNumber,

      fromContext:
        from.context,

      toContext:
        to.context,

      status: "supported",

      confidence: "medium",

      evidence:
        Array.from(
          new Set(evidence),
        ).slice(0, 6),

      reason:
        "The scans contain compatible accessibility evidence and a plausible spatial progression, but the images do not directly show the physical connection between them.",
    };
  }

  /*
   * UNCERTAIN
   */

  if (
    !logicalContext
  ) {
    evidence.push(
      `The observed contexts (${from.context} → ${to.context}) do not provide enough visual information to establish a logical progression.`,
    );
  }

  if (!fromExit) {
    evidence.push(
      "The previous scan does not clearly show an exit, opening, path, or other transition feature.",
    );
  }

  if (!toEntry) {
    evidence.push(
      "The next scan does not clearly show how the space is entered.",
    );
  }

  if (
    !fromAccess &&
    !toAccess
  ) {
    evidence.push(
      "Neither scan contains strong accessibility-supporting evidence for the transition.",
    );
  }

  return {
    fromScan:
      from.scanNumber,

    toScan:
      to.scanNumber,

    fromContext:
      from.context,

    toContext:
      to.context,

    status: "uncertain",

    confidence: "low",

    evidence:
      Array.from(
        new Set(evidence),
      ).slice(0, 6),

    reason:
      "The two scans may belong to the same journey, but the available visual evidence is insufficient to establish a reliable transition between them.",
  };
}

export function buildRouteTransitions(
  scans: ScanMemory[],
  mode: AccessibilityMode,
): RouteTransition[] {
  if (scans.length < 2) {
    return [];
  }

  const orderedScans =
    [...scans].sort(
      (a, b) =>
        a.scanNumber -
        b.scanNumber,
    );

  const transitions: RouteTransition[] =
    [];

  for (
    let index = 0;
    index <
    orderedScans.length - 1;
    index++
  ) {
    transitions.push(
      analyzeTransition(
        orderedScans[index],
        orderedScans[index + 1],
        mode,
      ),
    );
  }

  return transitions;
}

/* -------------------------------------------------------------------------- */
/* ROUTE GRAPH                                                                */
/* -------------------------------------------------------------------------- */

export function buildScanRouteGraph(
  scans: ScanMemory[],
  mode: AccessibilityMode,
): RouteGraphStep[] {
  return [...scans]
    .sort(
      (a, b) =>
        a.scanNumber -
        b.scanNumber,
    )
    .map((scan) => {
      const barrier =
        hasBarrierEvidence(
          scan,
          mode,
        );

      const access =
        hasPositiveAccessEvidence(
          scan,
          mode,
        );

      let accessStatus:
        | "supported"
        | "uncertain"
        | "blocked";

      if (barrier && !access) {
        accessStatus =
          "blocked";
      } else if (access) {
        accessStatus =
          "supported";
      } else {
        accessStatus =
          "uncertain";
      }

      return {
        scanNumber:
          scan.scanNumber,

        context:
          scan.context,

        environment:
          scan.environment,

        accessStatus,

        confidence:
          getConfidence(
            scan.observations,
          ),

        evidence:
          scan.observations
            .filter(
              (observation) =>
                observation.status ===
                "confirmed",
            )
            .map(
              (observation) =>
                observation.evidence,
            )
            .slice(0, 5),
      };
    });
}

/* -------------------------------------------------------------------------- */
/* SIMPLE ROUTE                                                               */
/* -------------------------------------------------------------------------- */

export function buildScanToScanRoute(
  scans: ScanMemory[],
  mode: AccessibilityMode,
): string[] {
  if (scans.length === 0) {
    return [];
  }

  const orderedScans =
    [...scans].sort(
      (a, b) =>
        a.scanNumber -
        b.scanNumber,
    );

  return orderedScans.map(
    (scan) => {
      if (
        hasBarrierEvidence(
          scan,
          mode,
        )
      ) {
        return `${scan.context} — barrier detected`;
      }

      if (
        hasPositiveAccessEvidence(
          scan,
          mode,
        )
      ) {
        return `${scan.context} — visually supported`;
      }

      return `${scan.context} — more evidence needed`;
    },
  );
}

/* -------------------------------------------------------------------------- */
/* CONTRADICTIONS                                                             */
/* -------------------------------------------------------------------------- */

export function detectRouteConflicts(
  scans: ScanMemory[],
  mode: AccessibilityMode,
): RouteConflict[] {
  const conflicts: RouteConflict[] =
    [];

  const ordered =
    [...scans].sort(
      (a, b) =>
        a.scanNumber -
        b.scanNumber,
    );

  for (
    let index = 0;
    index < ordered.length;
    index++
  ) {
    const scan =
      ordered[index];

    const hasBarrier =
      hasBarrierEvidence(
        scan,
        mode,
      );

    const hasAccess =
      hasPositiveAccessEvidence(
        scan,
        mode,
      );

    if (
      hasBarrier &&
      hasAccess
    ) {
      conflicts.push({
        scanNumbers: [
          scan.scanNumber,
        ],

        contexts: [
          scan.context,
        ],

        issue:
          "The same scan contains both accessibility-supporting evidence and barrier evidence.",

        evidence:
          scan.observations
            .filter(
              (observation) =>
                observation.status ===
                "confirmed",
            )
            .map(
              (observation) =>
                observation.evidence,
            )
            .slice(0, 6),

        severity: "medium",
      });
    }
  }

  for (
    let index = 0;
    index <
    ordered.length - 1;
    index++
  ) {
    const from =
      ordered[index];

    const to =
      ordered[index + 1];

    if (
      from.context ===
        "destination" &&
      to.context !==
        "unknown"
    ) {
      conflicts.push({
        scanNumbers: [
          from.scanNumber,
          to.scanNumber,
        ],

        contexts: [
          from.context,
          to.context,
        ],

        issue:
          "A destination scan is followed by another spatial context, so the journey order may need additional evidence.",

        evidence: [
          `Scan ${from.scanNumber} was identified as a destination.`,
          `Scan ${to.scanNumber} was identified as ${to.context}.`,
        ],

        severity: "low",
      });
    }
  }

  return conflicts;
}

export function getRouteLabel(
  context: ScanContext,
) {
  switch (context) {
    case "entrance":
      return "Entrance";

    case "pathway":
      return "Pathway";

    case "hallway":
      return "Hallway";

    case "stairs":
      return "Stairs";

    case "ramp":
      return "Ramp";

    case "elevator":
      return "Elevator";

    case "destination":
      return "Destination";

    default:
      return "Unknown";
  }
}