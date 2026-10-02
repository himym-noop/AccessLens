"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  findNearestHospital,
  Hospital,
} from "@/lib/hospitals";

type AssistanceType =
  | "physical"
  | "medical"
  | "location";

type LocationState =
  | "idle"
  | "requesting"
  | "shared"
  | "denied"
  | "error";

type LocationData = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

type AssignedHospital = Hospital & {
  distanceKm: number;
};

type RequestStatus =
  | "active"
  | "responding"
  | "resolved"
  | "cancelled";

type LatestScan = {
  profile?: string;
  scanContext?: string;
  environment?: string;
  observations?: unknown[];
  barriers?: string[];
  features?: string[];
  uncertainties?: string[];
  message?: string;
  nextScan?: unknown;
};

const ASSISTANCE_LABELS: Record<
  AssistanceType,
  string
> = {
  physical: "Physical assistance",
  medical: "Medical assistance",
  location: "Help finding my way",
};

const STATUS_LABELS: Record<
  RequestStatus,
  string
> = {
  active: "Request sent",
  responding: "Hospital responding",
  resolved: "Request resolved",
  cancelled: "Request cancelled",
};

function getProfileLabel(
  profile?: string,
) {
  if (profile === "wheelchair") {
    return "Wheelchair";
  }

  if (profile === "mobility") {
    return "Limited mobility";
  }

  if (profile === "visual") {
    return "Visual accessibility";
  }

  return "Accessibility profile";
}

function getContextLabel(
  context?: string,
) {
  if (!context) {
    return "Current scan";
  }

  return context
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function formatDistance(
  distanceKm: number,
) {
  if (distanceKm < 1) {
    return `${Math.round(
      distanceKm * 1000,
    )} m away`;
  }

  return `${distanceKm.toFixed(1)} km away`;
}

function formatTime(
  value?: string | null,
) {
  if (!value) {
    return "Just now";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AssistPage() {
  const router = useRouter();

  const [locationState, setLocationState] =
    useState<LocationState>("idle");

  const [location, setLocation] =
    useState<LocationData | null>(null);

  const [assistanceType, setAssistanceType] =
    useState<AssistanceType | null>(null);

  const [hospitals, setHospitals] =
    useState<Hospital[]>([]);

  const [nearestHospital, setNearestHospital] =
    useState<AssignedHospital | null>(null);

  const [requestId, setRequestId] =
    useState<string | null>(null);

  const [requestStatus, setRequestStatus] =
    useState<RequestStatus>("active");

  const [requestCreatedAt, setRequestCreatedAt] =
    useState<string | null>(null);

  const [requestUpdatedAt, setRequestUpdatedAt] =
    useState<string | null>(null);

  const [latestScan, setLatestScan] =
    useState<LatestScan | null>(null);

  const [sharing, setSharing] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [loadingHospitals, setLoadingHospitals] =
    useState(true);

  const [creatingRequest, setCreatingRequest] =
    useState(false);

  const [cancellingRequest, setCancellingRequest] =
    useState(false);

  const [showEvidence, setShowEvidence] =
    useState(false);

  const currentStatusIndex = useMemo(() => {
    if (requestStatus === "cancelled") {
      return -1;
    }

    if (requestStatus === "active") {
      return 1;
    }

    if (requestStatus === "responding") {
      return 2;
    }

    if (requestStatus === "resolved") {
      return 3;
    }

    return 0;
  }, [requestStatus]);

  useEffect(() => {
    loadHospitals();
    loadStoredState();
    loadLatestScan();
  }, []);

  useEffect(() => {
    if (!requestId) {
      return;
    }

    let active = true;

    async function loadCurrentRequest() {
      const { data, error } =
        await supabase
          .from("assistance_requests")
          .select(
            "status,created_at,updated_at,hospital_id",
          )
          .eq("id", requestId)
          .single();

      if (
        error ||
        !data ||
        !active
      ) {
        return;
      }

      setRequestStatus(
        data.status as RequestStatus,
      );

      setRequestCreatedAt(
        data.created_at,
      );

      setRequestUpdatedAt(
        data.updated_at,
      );

      if (data.hospital_id) {
        const hospital =
          hospitals.find(
            (item) =>
              item.id ===
              data.hospital_id,
          );

        if (
          hospital &&
          location
        ) {
          const ranked =
            findNearestHospital(
              [hospital],
              location.latitude,
              location.longitude,
            );

          setNearestHospital(
            ranked,
          );
        }
      }
    }

    loadCurrentRequest();

    const channel = supabase
      .channel(
        `assist-request-${requestId}`,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "assistance_requests",
          filter: `id=eq.${requestId}`,
        },
        (payload) => {
          if (!active) {
            return;
          }

          const next =
            payload.new as {
              status?: RequestStatus;
              updated_at?: string;
            };

          if (next.status) {
            setRequestStatus(
              next.status,
            );
          }

          if (next.updated_at) {
            setRequestUpdatedAt(
              next.updated_at,
            );
          }
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(
        channel,
      );
    };
  }, [
    requestId,
    hospitals,
    location,
  ]);

  async function loadHospitals() {
    setLoadingHospitals(true);

    const { data, error } =
      await supabase
        .from("hospitals")
        .select(
          "id,name,latitude,longitude,phone,is_connected,is_available",
        )
        .eq("is_connected", true)
        .eq("is_available", true)
        .order("name");

    if (error) {
      setMessage(
        "Unable to load the connected assistance network.",
      );
      setHospitals([]);
      setLoadingHospitals(false);
      return;
    }

    setHospitals(
      (data ?? []) as Hospital[],
    );

    setLoadingHospitals(false);
  }

  function loadStoredState() {
    try {
      const storedLocation =
        sessionStorage.getItem(
          "accesslens_location",
        );

      if (storedLocation) {
        const parsed =
          JSON.parse(
            storedLocation,
          ) as LocationData;

        if (
          typeof parsed.latitude ===
            "number" &&
          typeof parsed.longitude ===
            "number"
        ) {
          setLocation(parsed);
          setLocationState(
            "shared",
          );
        }
      }

      const storedRequest =
        sessionStorage.getItem(
          "accesslens_assistance_request",
        );

      if (storedRequest) {
        const parsed =
          JSON.parse(
            storedRequest,
          ) as {
            id?: string;
            assistanceType?: AssistanceType;
            hospital?: AssignedHospital | null;
            status?: RequestStatus;
            createdAt?: string;
          };

        if (parsed.id) {
          setRequestId(parsed.id);
        }

        if (parsed.assistanceType) {
          setAssistanceType(
            parsed.assistanceType,
          );
        }

        if (parsed.hospital) {
          setNearestHospital(
            parsed.hospital,
          );
        }

        if (parsed.status) {
          setRequestStatus(
            parsed.status,
          );
        }

        if (parsed.createdAt) {
          setRequestCreatedAt(
            parsed.createdAt,
          );
        }
      }
    } catch {
      sessionStorage.removeItem(
        "accesslens_location",
      );

      sessionStorage.removeItem(
        "accesslens_assistance_request",
      );
    }
  }

  function loadLatestScan() {
    try {
      const stored =
        sessionStorage.getItem(
          "accesslens_latest_scan",
        );

      if (!stored) {
        return;
      }

      const parsed =
        JSON.parse(
          stored,
        ) as LatestScan;

      setLatestScan(parsed);
    } catch {
      setLatestScan(null);
    }
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationState(
        "error",
      );

      setMessage(
        "Location services are not available on this device.",
      );

      return;
    }

    setLocationState(
      "requesting",
    );

    setMessage("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation: LocationData =
          {
            latitude:
              position.coords
                .latitude,
            longitude:
              position.coords
                .longitude,
            accuracy:
              position.coords
                .accuracy,
          };

        setLocation(
          nextLocation,
        );

        setLocationState(
          "shared",
        );

        sessionStorage.setItem(
          "accesslens_location",
          JSON.stringify(
            nextLocation,
          ),
        );

        setMessage(
          "Location shared for this assistance request.",
        );
      },
      () => {
        setLocationState(
          "denied",
        );

        setMessage(
          "Location permission was not granted. You can try again.",
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      },
    );
  }

  function chooseAssistance(
    type: AssistanceType,
  ) {
    setAssistanceType(type);
    setMessage("");

    if (!location) {
      requestLocation();
    }
  }

  async function createHospitalRequest() {
    if (!assistanceType) {
      setMessage(
        "Choose the type of assistance you need.",
      );
      return;
    }

    if (!location) {
      setMessage(
        "Share your location before sending the request.",
      );
      return;
    }

    setCreatingRequest(true);
    setMessage("");

    try {
      let availableHospitals =
        hospitals;

      if (
        availableHospitals.length ===
        0
      ) {
        const { data, error } =
          await supabase
            .from("hospitals")
            .select(
              "id,name,latitude,longitude,phone,is_connected,is_available",
            )
            .eq(
              "is_connected",
              true,
            )
            .eq(
              "is_available",
              true,
            );

        if (error) {
          throw new Error(
            "Could not load the assistance network.",
          );
        }

        availableHospitals =
          (data ??
            []) as Hospital[];
      }

      const hospital =
        findNearestHospital(
          availableHospitals,
          location.latitude,
          location.longitude,
        );

      if (!hospital) {
        throw new Error(
          "No connected and available hospital is currently responding.",
        );
      }

      const scanSnapshot =
        latestScan
          ? {
              profile:
                latestScan.profile ??
                null,
              scanContext:
                latestScan.scanContext ??
                null,
              environment:
                latestScan.environment ??
                null,
              observations:
                latestScan.observations ??
                [],
              barriers:
                latestScan.barriers ??
                [],
              features:
                latestScan.features ??
                [],
              uncertainties:
                latestScan.uncertainties ??
                [],
              message:
                latestScan.message ??
                null,
            }
          : null;

      const { data, error } =
        await supabase
          .from("assistance_requests")
          .insert({
            assistance_type:
              assistanceType,
            latitude:
              location.latitude,
            longitude:
              location.longitude,
            accuracy:
              location.accuracy,
            hospital_id:
              hospital.id,
            accessibility_mode:
              latestScan?.profile ??
              null,
            scan_context:
              latestScan?.scanContext ??
              null,
            scan_environment:
              latestScan?.environment ??
              null,
            scan_snapshot:
              scanSnapshot,
            status: "active",
          })
          .select(
            "id,status,created_at,updated_at",
          )
          .single();

      if (error) {
        throw new Error(
          error.message ||
            "Unable to create assistance request.",
        );
      }

      setNearestHospital(
        hospital,
      );

      setRequestId(
        data.id,
      );

      setRequestStatus(
        data.status as RequestStatus,
      );

      setRequestCreatedAt(
        data.created_at,
      );

      setRequestUpdatedAt(
        data.updated_at,
      );

      sessionStorage.setItem(
        "accesslens_assistance_request",
        JSON.stringify({
          id: data.id,
          assistanceType,
          hospital,
          status:
            data.status,
          createdAt:
            data.created_at,
        }),
      );

      setMessage(
        "Your assistance request has been sent.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong while creating the request.",
      );
    } finally {
      setCreatingRequest(false);
    }
  }

  async function cancelRequest() {
    if (!requestId) {
      return;
    }

    setCancellingRequest(
      true,
    );
    setMessage("");

    const { error } =
      await supabase
        .from("assistance_requests")
        .update({
          status: "cancelled",
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", requestId);

    if (error) {
      setMessage(
        "Unable to cancel the request.",
      );
      setCancellingRequest(
        false,
      );
      return;
    }

    setRequestStatus(
      "cancelled",
    );

    setRequestUpdatedAt(
      new Date().toISOString(),
    );

    sessionStorage.removeItem(
      "accesslens_assistance_request",
    );

    setMessage(
      "Assistance request cancelled.",
    );

    setCancellingRequest(
      false,
    );
  }

  function startNewRequest() {
    setRequestId(null);
    setRequestStatus(
      "active",
    );
    setRequestCreatedAt(null);
    setRequestUpdatedAt(null);
    setNearestHospital(null);
    setAssistanceType(null);
    setMessage("");

    sessionStorage.removeItem(
      "accesslens_assistance_request",
    );
  }

  const hasActiveRequest =
    Boolean(requestId) &&
    requestStatus !==
      "cancelled";

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 px-6 py-5 md:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <button
            onClick={() =>
              router.push("/scan")
            }
            className="text-left"
          >
            <div className="text-xl font-black tracking-[-0.04em]">
              ACCESS<span className="text-lime-300">LENS</span>
            </div>

            <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.25em] text-white/35">
              Assistance Network
            </div>
          </button>

          <button
            onClick={() =>
              router.push("/scan")
            }
            className="border border-white/15 px-4 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-white/60 transition hover:border-lime-300/40 hover:text-lime-300"
          >
            Back to scan
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-10 md:px-10 md:py-16">
        <div className="max-w-3xl">
          <div className="mb-4 text-[10px] font-black uppercase tracking-[0.3em] text-lime-300">
            Need assistance
          </div>

          <h1 className="text-4xl font-black tracking-[-0.05em] md:text-6xl">
            Get help when
            <br />
            the route isn't enough.
          </h1>

          <p className="mt-5 max-w-2xl text-sm leading-7 text-white/50 md:text-base">
            AccessLens can attach your current
            accessibility scan to an assistance
            request and connect you with an
            available hospital in the connected
            network.
          </p>
        </div>

        {hasActiveRequest ? (
          <div className="mt-12 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
            <section className="border border-white/10 bg-white/[0.025] p-6 md:p-8">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.25em] text-lime-300">
                    Live assistance request
                  </div>

                  <h2 className="mt-3 text-2xl font-black tracking-[-0.03em]">
                    {STATUS_LABELS[
                      requestStatus
                    ]}
                  </h2>

                  <p className="mt-2 text-sm text-white/40">
                    {requestUpdatedAt
                      ? `Updated ${formatTime(
                          requestUpdatedAt,
                        )}`
                      : "Waiting for network response"}
                  </p>
                </div>

                <div className="border border-lime-300/20 px-4 py-3 text-right">
                  <div className="text-[8px] font-black uppercase tracking-[0.2em] text-white/35">
                    Request
                  </div>

                  <div className="mt-1 text-xs font-bold text-lime-300">
                    #{requestId?.slice(
                      0,
                      8,
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-10 space-y-0">
                <StatusStep
                  number="01"
                  title="Request sent"
                  description={
                    requestCreatedAt
                      ? `Created at ${formatTime(
                          requestCreatedAt,
                        )}`
                      : "Your request was created."
                  }
                  active={
                    currentStatusIndex >=
                    1
                  }
                  complete={
                    currentStatusIndex >
                    1
                  }
                />

                <StatusStep
                  number="02"
                  title="Hospital assigned"
                  description={
                    nearestHospital
                      ? nearestHospital.name
                      : "Finding a connected hospital"
                  }
                  active={
                    currentStatusIndex >=
                    1
                  }
                  complete={
                    currentStatusIndex >=
                    2
                  }
                />

                <StatusStep
                  number="03"
                  title="Hospital responding"
                  description={
                    requestStatus ===
                    "responding"
                      ? "A responder has accepted the request."
                      : "Waiting for the hospital to respond."
                  }
                  active={
                    currentStatusIndex >=
                    2
                  }
                  complete={
                    currentStatusIndex >=
                    3
                  }
                />

                <StatusStep
                  number="04"
                  title="Resolved"
                  description={
                    requestStatus ===
                    "resolved"
                      ? "The assistance request has been marked resolved."
                      : "This step completes when assistance is resolved."
                  }
                  active={
                    currentStatusIndex >=
                    3
                  }
                  complete={
                    currentStatusIndex >=
                    3
                  }
                  last
                />
              </div>

              {requestStatus ===
                "responding" && (
                <div className="mt-8 border border-lime-300/20 bg-lime-300/[0.04] p-5">
                  <div className="flex gap-4">
                    <div className="mt-1 h-2 w-2 shrink-0 animate-pulse rounded-full bg-lime-300" />

                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.15em] text-lime-300">
                        Hospital is responding
                      </div>

                      <p className="mt-2 text-sm leading-6 text-white/50">
                        A connected responder has
                        accepted your request. Keep
                        this page open for status
                        updates.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {requestStatus ===
                "resolved" && (
                <div className="mt-8 border border-lime-300/20 bg-lime-300/[0.04] p-5">
                  <div className="text-xs font-black uppercase tracking-[0.15em] text-lime-300">
                    Assistance resolved
                  </div>

                  <p className="mt-2 text-sm leading-6 text-white/50">
                    This request has been closed
                    by the responding hospital.
                  </p>
                </div>
              )}

              {requestStatus !==
                "resolved" && (
                  <button
                    onClick={
                      cancelRequest
                    }
                    disabled={
                      cancellingRequest
                    }
                    className="mt-8 border border-red-300/20 px-5 py-3 text-[9px] font-black uppercase tracking-[0.18em] text-red-300/70 transition hover:border-red-300/40 hover:text-red-300 disabled:opacity-40"
                  >
                    {cancellingRequest
                      ? "Cancelling..."
                      : "Cancel request"}
                  </button>
                )}
            </section>

            <aside className="space-y-6">
              {nearestHospital && (
                <section className="border border-white/10 p-6">
                  <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/35">
                    Assigned hospital
                  </div>

                  <h3 className="mt-4 text-xl font-black">
                    {
                      nearestHospital.name
                    }
                  </h3>

                  <div className="mt-3 text-sm text-lime-300">
                    {formatDistance(
                      nearestHospital.distanceKm,
                    )}
                  </div>

                  {nearestHospital.phone && (
                    <a
                      href={`tel:${nearestHospital.phone}`}
                      className="mt-5 block border border-white/10 px-4 py-3 text-center text-[9px] font-black uppercase tracking-[0.18em] text-white/60 transition hover:border-lime-300/30 hover:text-lime-300"
                    >
                      Call hospital
                    </a>
                  )}

                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${nearestHospital.latitude},${nearestHospital.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block border border-lime-300/20 px-4 py-3 text-center text-[9px] font-black uppercase tracking-[0.18em] text-lime-300 transition hover:bg-lime-300 hover:text-black"
                  >
                    Open location
                  </a>
                </section>
              )}

              <section className="border border-white/10 p-6">
                <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/35">
                  Request details
                </div>

                <div className="mt-5 space-y-4">
                  <DetailRow
                    label="Assistance"
                    value={
                      assistanceType
                        ? ASSISTANCE_LABELS[
                            assistanceType
                          ]
                        : "Not specified"
                    }
                  />

                  <DetailRow
                    label="Accessibility profile"
                    value={getProfileLabel(
                      latestScan?.profile,
                    )}
                  />

                  <DetailRow
                    label="Scan context"
                    value={getContextLabel(
                      latestScan?.scanContext,
                    )}
                  />

                  <DetailRow
                    label="Location"
                    value={
                      location
                        ? "Shared"
                        : "Not shared"
                    }
                  />
                </div>
              </section>
            </aside>
          </div>
        ) : (
          <>
            <section className="mt-12">
              <div className="mb-6">
                <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/35">
                  01 / What do you need?
                </div>

                <h2 className="mt-3 text-2xl font-black tracking-[-0.03em]">
                  Choose the kind of help.
                </h2>
              </div>

              <div className="grid gap-px bg-white/10 md:grid-cols-3">
                <AssistanceOption
                  type="physical"
                  title="Physical assistance"
                  description="I need someone to help me move through the environment."
                  selected={
                    assistanceType ===
                    "physical"
                  }
                  onClick={() =>
                    chooseAssistance(
                      "physical",
                    )
                  }
                />

                <AssistanceOption
                  type="medical"
                  title="Medical assistance"
                  description="I need medical help or attention."
                  selected={
                    assistanceType ===
                    "medical"
                  }
                  onClick={() =>
                    chooseAssistance(
                      "medical",
                    )
                  }
                />

                <AssistanceOption
                  type="location"
                  title="Help finding my way"
                  description="I need help navigating or locating an accessible route."
                  selected={
                    assistanceType ===
                    "location"
                  }
                  onClick={() =>
                    chooseAssistance(
                      "location",
                    )
                  }
                />
              </div>
            </section>

            <section className="mt-10 grid gap-6 lg:grid-cols-2">
              <div className="border border-white/10 p-6 md:p-8">
                <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/35">
                  02 / Location
                </div>

                <h2 className="mt-3 text-xl font-black">
                  Share your location
                </h2>

                <p className="mt-3 text-sm leading-6 text-white/40">
                  Your location is only used to
                  assign the assistance request to
                  a connected hospital.
                </p>

                <div className="mt-7 flex items-center gap-4">
                  <div
                    className={`h-3 w-3 rounded-full ${
                      locationState ===
                      "shared"
                        ? "bg-lime-300"
                        : locationState ===
                          "requesting"
                        ? "animate-pulse bg-yellow-300"
                        : "bg-white/20"
                    }`}
                  />

                  <span className="text-sm font-bold">
                    {locationState ===
                    "shared"
                      ? "Location shared"
                      : locationState ===
                        "requesting"
                      ? "Requesting location..."
                      : "Location not shared"}
                  </span>
                </div>

                {location && (
                  <div className="mt-5 border border-white/10 bg-white/[0.02] p-4 text-xs text-white/35">
                    Accuracy:{" "}
                    {Math.round(
                      location.accuracy,
                    )}
                    m
                  </div>
                )}

                {!location && (
                  <button
                    onClick={
                      requestLocation
                    }
                    disabled={
                      locationState ===
                      "requesting"
                    }
                    className="mt-7 border border-lime-300/30 px-5 py-3 text-[9px] font-black uppercase tracking-[0.18em] text-lime-300 transition hover:bg-lime-300 hover:text-black disabled:opacity-40"
                  >
                    {locationState ===
                    "requesting"
                      ? "Getting location..."
                      : "Share location"}
                  </button>
                )}

                {(locationState ===
                  "denied" ||
                  locationState ===
                    "error") && (
                  <button
                    onClick={
                      requestLocation
                    }
                    className="mt-3 block text-[9px] font-black uppercase tracking-[0.18em] text-white/40 hover:text-lime-300"
                  >
                    Try again
                  </button>
                )}
              </div>

              <div className="border border-white/10 p-6 md:p-8">
                <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/35">
                  03 / Scan evidence
                </div>

                <h2 className="mt-3 text-xl font-black">
                  Attach your latest scan
                </h2>

                {latestScan ? (
                  <>
                    <div className="mt-5 border border-lime-300/20 bg-lime-300/[0.03] p-5">
                      <div className="text-[9px] font-black uppercase tracking-[0.18em] text-lime-300">
                        Scan attached
                      </div>

                      <div className="mt-3 text-sm font-bold">
                        {getContextLabel(
                          latestScan.scanContext,
                        )}
                      </div>

                      <div className="mt-1 text-xs text-white/35">
                        {latestScan.environment ||
                          "Environment recorded"}
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        setShowEvidence(
                          !showEvidence,
                        )
                      }
                      className="mt-4 text-[9px] font-black uppercase tracking-[0.18em] text-white/40 hover:text-lime-300"
                    >
                      {showEvidence
                        ? "Hide evidence"
                        : "View evidence"}
                    </button>

                    {showEvidence && (
                      <div className="mt-4 space-y-2 text-xs text-white/40">
                        {(
                          latestScan.features ??
                          []
                        ).map(
                          (
                            feature,
                            index,
                          ) => (
                            <div
                              key={`feature-${index}`}
                              className="border-l border-lime-300/30 pl-3"
                            >
                              {feature}
                            </div>
                          ),
                        )}

                        {(
                          latestScan.barriers ??
                          []
                        ).map(
                          (
                            barrier,
                            index,
                          ) => (
                            <div
                              key={`barrier-${index}`}
                              className="border-l border-red-300/30 pl-3"
                            >
                              {barrier}
                            </div>
                          ),
                        )}

                        {(
                          latestScan.uncertainties ??
                          []
                        ).map(
                          (
                            uncertainty,
                            index,
                          ) => (
                            <div
                              key={`uncertainty-${index}`}
                              className="border-l border-yellow-300/30 pl-3"
                            >
                              {uncertainty}
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-5 border border-yellow-300/15 bg-yellow-300/[0.03] p-5 text-sm leading-6 text-white/40">
                    No recent scan was found.
                    You can still request
                    assistance, but the hospital
                    will not receive accessibility
                    scan evidence.
                  </div>
                )}
              </div>
            </section>

            <section className="mt-10 border border-white/10 p-6 md:p-8">
              <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/35">
                    04 / Connected network
                  </div>

                  <h2 className="mt-3 text-xl font-black">
                    Hospital assignment
                  </h2>

                  <p className="mt-2 text-sm text-white/40">
                    AccessLens selects the nearest
                    connected and available hospital.
                  </p>
                </div>

                <div className="text-right">
                  {loadingHospitals ? (
                    <div className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30">
                      Checking network...
                    </div>
                  ) : (
                    <div className="text-[9px] font-black uppercase tracking-[0.18em] text-lime-300">
                      {hospitals.length} available
                    </div>
                  )}
                </div>
              </div>

              {location &&
                !loadingHospitals && (
                  <div className="mt-7">
                    {(() => {
                      const hospital =
                        findNearestHospital(
                          hospitals,
                          location.latitude,
                          location.longitude,
                        );

                      if (!hospital) {
                        return (
                          <div className="border border-red-300/20 bg-red-300/[0.03] p-5 text-sm text-red-200/70">
                            No connected and
                            available hospital is
                            currently available.
                          </div>
                        );
                      }

                      return (
                        <div className="flex flex-col justify-between gap-5 border border-lime-300/20 bg-lime-300/[0.03] p-5 md:flex-row md:items-center">
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-[0.18em] text-lime-300">
                              Nearest available
                            </div>

                            <div className="mt-2 text-lg font-black">
                              {
                                hospital.name
                              }
                            </div>
                          </div>

                          <div className="text-sm font-bold text-white/50">
                            {formatDistance(
                              hospital.distanceKm,
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
            </section>

            {message && (
              <div className="mt-6 border border-white/10 bg-white/[0.02] px-5 py-4 text-sm text-white/50">
                {message}
              </div>
            )}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={
                  createHospitalRequest
                }
                disabled={
                  creatingRequest ||
                  !assistanceType ||
                  !location ||
                  loadingHospitals ||
                  hospitals.length ===
                    0
                }
                className="border border-lime-300/30 bg-lime-300 px-7 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-black transition hover:bg-white disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-white/25"
              >
                {creatingRequest
                  ? "Sending request..."
                  : "Request assistance"}
              </button>

              <button
                onClick={() =>
                  router.push(
                    "/scan",
                  )
                }
                className="border border-white/10 px-7 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/50 transition hover:border-white/20 hover:text-white"
              >
                Return to scan
              </button>
            </div>
          </>
        )}

        {requestStatus ===
          "resolved" && (
          <button
            onClick={
              startNewRequest
            }
            className="mt-8 border border-lime-300/30 px-6 py-4 text-[9px] font-black uppercase tracking-[0.18em] text-lime-300 transition hover:bg-lime-300 hover:text-black"
          >
            Start another request
          </button>
        )}

        <div className="mt-16 border-t border-white/10 pt-8">
          <div className="grid gap-8 md:grid-cols-3">
            <InfoBlock
              number="01"
              title="You choose"
              text="Assistance is never triggered automatically. You decide when to share your location and request help."
            />

            <InfoBlock
              number="02"
              title="Evidence travels"
              text="Your latest accessibility scan can accompany the request so the responder has additional context."
            />

            <InfoBlock
              number="03"
              title="Live response"
              text="Hospital status changes are reflected here in real time while the request remains active."
            />
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-8 md:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-[9px] font-bold uppercase tracking-[0.18em] text-white/25 md:flex-row md:items-center md:justify-between">
          <span>
            ACCESSLENS / ASSISTANCE NETWORK
          </span>

          <span>
            Location sharing is voluntary
          </span>
        </div>
      </footer>
    </main>
  );
}

function AssistanceOption({
  type,
  title,
  description,
  selected,
  onClick,
}: {
  type: AssistanceType;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group min-h-48 bg-black p-6 text-left transition md:p-8 ${
        selected
          ? "bg-lime-300 text-black"
          : "hover:bg-white/[0.04]"
      }`}
    >
      <div
        className={`text-[9px] font-black uppercase tracking-[0.2em] ${
          selected
            ? "text-black/50"
            : "text-white/25"
        }`}
      >
        {type}
      </div>

      <div className="mt-8 text-xl font-black tracking-[-0.03em]">
        {title}
      </div>

      <p
        className={`mt-3 text-sm leading-6 ${
          selected
            ? "text-black/60"
            : "text-white/40"
        }`}
      >
        {description}
      </p>
    </button>
  );
}

function StatusStep({
  number,
  title,
  description,
  active,
  complete,
  last = false,
}: {
  number: string;
  title: string;
  description: string;
  active: boolean;
  complete: boolean;
  last?: boolean;
}) {
  return (
    <div className="flex gap-5">
      <div className="flex flex-col items-center">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center border text-[9px] font-black ${
            active
              ? "border-lime-300 bg-lime-300 text-black"
              : "border-white/15 text-white/25"
          }`}
        >
          {complete ? "✓" : number}
        </div>

        {!last && (
          <div
            className={`my-1 h-16 w-px ${
              complete
                ? "bg-lime-300/60"
                : "bg-white/10"
            }`}
          />
        )}
      </div>

      <div className="pb-8">
        <div
          className={`text-sm font-black ${
            active
              ? "text-white"
              : "text-white/30"
          }`}
        >
          {title}
        </div>

        <div className="mt-1 text-xs leading-5 text-white/35">
          {description}
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-3 last:border-0 last:pb-0">
      <span className="text-[9px] font-black uppercase tracking-[0.15em] text-white/25">
        {label}
      </span>

      <span className="text-right text-xs font-bold text-white/60">
        {value}
      </span>
    </div>
  );
}

function InfoBlock({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div>
      <div className="text-[9px] font-black tracking-[0.2em] text-lime-300">
        {number}
      </div>

      <div className="mt-3 text-sm font-black uppercase tracking-[0.12em]">
        {title}
      </div>

      <p className="mt-3 max-w-sm text-xs leading-6 text-white/30">
        {text}
      </p>
    </div>
  );
}