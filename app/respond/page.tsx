"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Hospital } from "@/lib/hospitals";

type AssistanceType =
  | "physical"
  | "medical"
  | "location";

type RequestStatus =
  | "active"
  | "responding"
  | "resolved"
  | "cancelled";

type AssistanceRequest = {
  id: string;
  assistance_type: AssistanceType;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  hospital_id: string | null;
  accessibility_mode: string | null;
  scan_context: string | null;
  scan_environment: string | null;
  scan_snapshot: {
    observations?: unknown[];
    barriers?: string[];
    features?: string[];
    uncertainties?: string[];
    message?: string | null;
    nextScan?: unknown;
  } | null;
  status: RequestStatus;
  created_at: string;
  updated_at: string;
};

function getProfileLabel(
  profile: string | null,
) {
  if (profile === "wheelchair") return "Wheelchair";
  if (profile === "mobility") return "Limited mobility";
  if (profile === "visual") return "Visual";
  return "Not specified";
}

function getContextLabel(
  context: string | null,
) {
  if (!context) return "Unknown";

  return context
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function getAssistanceLabel(
  type: AssistanceType,
) {
  if (type === "physical")
    return "Physical assistance";

  if (type === "medical")
    return "Medical assistance";

  return "Location assistance";
}

function getStatusLabel(
  status: RequestStatus,
) {
  if (status === "active") return "New request";
  if (status === "responding")
    return "Responding";
  if (status === "resolved")
    return "Resolved";

  return "Cancelled";
}

function formatTime(value: string) {
  return new Date(value).toLocaleString();
}

export default function RespondPage() {
  const [hospitals, setHospitals] = useState<
    Hospital[]
  >([]);

  const [selectedHospitalId, setSelectedHospitalId] =
    useState("");

  const [requests, setRequests] = useState<
    AssistanceRequest[]
  >([]);

  const [selectedRequestId, setSelectedRequestId] =
    useState<string | null>(null);

  const [loadingHospitals, setLoadingHospitals] =
    useState(true);

  const [loadingRequests, setLoadingRequests] =
    useState(false);

  const [updatingRequest, setUpdatingRequest] =
    useState<string | null>(null);

  const [message, setMessage] = useState("");

  const selectedHospital = useMemo(
    () =>
      hospitals.find(
        (hospital) =>
          hospital.id === selectedHospitalId,
      ) ?? null,
    [hospitals, selectedHospitalId],
  );

  const selectedRequest = useMemo(
    () =>
      requests.find(
        (request) =>
          request.id === selectedRequestId,
      ) ?? null,
    [requests, selectedRequestId],
  );

  const activeRequests = requests.filter(
    (request) =>
      request.status === "active" ||
      request.status === "responding",
  );

  const newRequests = requests.filter(
    (request) => request.status === "active",
  );

  const respondingRequests = requests.filter(
    (request) =>
      request.status === "responding",
  );

  const resolvedRequests = requests.filter(
    (request) => request.status === "resolved",
  );

  useEffect(() => {
    loadHospitals();
  }, []);

  useEffect(() => {
    if (!selectedHospitalId) {
      setRequests([]);
      setSelectedRequestId(null);
      return;
    }

    loadRequests(selectedHospitalId);

    const channel = supabase
      .channel(
        `hospital-requests-${selectedHospitalId}`,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "assistance_requests",
          filter: `hospital_id=eq.${selectedHospitalId}`,
        },
        () => {
          loadRequests(selectedHospitalId);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedHospitalId]);

  async function loadHospitals() {
    setLoadingHospitals(true);
    setMessage("");

    const { data, error } = await supabase
      .from("hospitals")
      .select(
        "id,name,latitude,longitude,phone,is_connected,is_available",
      )
      .eq("is_connected", true)
      .order("name");

    if (error) {
      setMessage(
        "Could not load connected hospitals.",
      );
      setLoadingHospitals(false);
      return;
    }

    const connectedHospitals =
      (data as Hospital[]) ?? [];

    setHospitals(connectedHospitals);

    if (connectedHospitals.length > 0) {
      setSelectedHospitalId(
        connectedHospitals[0].id,
      );
    }

    setLoadingHospitals(false);
  }

  async function loadRequests(
    hospitalId: string,
  ) {
    setLoadingRequests(true);

    const { data, error } = await supabase
      .from("assistance_requests")
      .select(
        `
          id,
          assistance_type,
          latitude,
          longitude,
          accuracy,
          hospital_id,
          accessibility_mode,
          scan_context,
          scan_environment,
          scan_snapshot,
          status,
          created_at,
          updated_at
        `,
      )
      .eq("hospital_id", hospitalId)
      .neq("status", "cancelled")
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      setMessage(
        "Could not load assistance requests.",
      );
      setLoadingRequests(false);
      return;
    }

    const nextRequests =
      (data as AssistanceRequest[]) ?? [];

    setRequests(nextRequests);

    if (
      selectedRequestId &&
      !nextRequests.some(
        (request) =>
          request.id === selectedRequestId,
      )
    ) {
      setSelectedRequestId(null);
    }

    setLoadingRequests(false);
  }

  async function updateRequestStatus(
    requestId: string,
    status: "responding" | "resolved",
  ) {
    setUpdatingRequest(requestId);
    setMessage("");

    const { error } = await supabase
      .from("assistance_requests")
      .update({
        status,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("hospital_id", selectedHospitalId);

    if (error) {
      setMessage(
        "Could not update the request status.",
      );
      setUpdatingRequest(null);
      return;
    }

    setRequests((current) =>
      current.map((request) =>
        request.id === requestId
          ? {
              ...request,
              status,
              updated_at:
                new Date().toISOString(),
            }
          : request,
      ),
    );

    setUpdatingRequest(null);
  }

  function openMaps(
    latitude: number,
    longitude: number,
  ) {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto min-h-screen max-w-7xl px-5 py-8 md:px-10">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-lime-300">
              ACCESSLENS
            </p>

            <h1 className="mt-2 text-2xl font-black tracking-tight">
              Hospital response
            </h1>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href="/hospitals"
              className="border border-white/10 px-4 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-white/50 transition hover:border-lime-300/40 hover:text-lime-300"
            >
              Hospital network
            </a>

            <a
              href="/"
              className="border border-white/10 px-4 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-white/50 transition hover:border-lime-300/40 hover:text-lime-300"
            >
              AccessLens
            </a>
          </div>
        </header>

        <section className="py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-lime-300">
                RESPONSE CENTER
              </p>

              <h2 className="mt-3 text-4xl font-black tracking-[-0.04em] md:text-6xl">
                Respond to people.
              </h2>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/40 md:text-base">
                View assistance requests assigned
                to a connected hospital and review
                the accessibility evidence captured
                by AccessLens.
              </p>
            </div>

            <div className="w-full md:w-80">
              <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">
                Hospital account
              </label>

              <select
                value={selectedHospitalId}
                onChange={(event) => {
                  setSelectedHospitalId(
                    event.target.value,
                  );
                  setSelectedRequestId(null);
                }}
                disabled={loadingHospitals}
                className="mt-3 w-full appearance-none border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-white outline-none transition focus:border-lime-300/50 disabled:opacity-50"
              >
                {loadingHospitals ? (
                  <option value="">
                    Loading hospitals...
                  </option>
                ) : hospitals.length === 0 ? (
                  <option value="">
                    No connected hospitals
                  </option>
                ) : (
                  hospitals.map((hospital) => (
                    <option
                      key={hospital.id}
                      value={hospital.id}
                      className="bg-black"
                    >
                      {hospital.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </section>

        {message && (
          <div className="mb-6 border border-red-300/20 bg-red-300/[0.03] p-5">
            <p className="text-sm text-red-200">
              {message}
            </p>
          </div>
        )}

        {selectedHospital && (
          <section className="mb-8 border border-white/10 bg-white/[0.02] p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">
                  CURRENT HOSPITAL
                </p>

                <p className="mt-2 text-lg font-black">
                  {selectedHospital.name}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    selectedHospital.is_available
                      ? "bg-lime-300"
                      : "bg-yellow-300"
                  }`}
                />

                <span className="text-xs text-white/50">
                  {selectedHospital.is_available
                    ? "Available"
                    : "Currently unavailable"}
                </span>
              </div>
            </div>
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border border-white/10 p-6">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30">
              New
            </p>

            <p className="mt-3 text-4xl font-black text-lime-300">
              {newRequests.length}
            </p>
          </div>

          <div className="border border-white/10 p-6">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30">
              Responding
            </p>

            <p className="mt-3 text-4xl font-black">
              {respondingRequests.length}
            </p>
          </div>

          <div className="border border-white/10 p-6">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30">
              Resolved
            </p>

            <p className="mt-3 text-4xl font-black">
              {resolvedRequests.length}
            </p>
          </div>

          <div className="border border-white/10 p-6">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30">
              Total
            </p>

            <p className="mt-3 text-4xl font-black">
              {requests.length}
            </p>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.4fr]">
          <div className="border border-white/10">
            <div className="flex items-center justify-between border-b border-white/10 p-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">
                  INCOMING
                </p>

                <h3 className="mt-2 text-lg font-black">
                  Assistance requests
                </h3>
              </div>

              <span className="text-xs text-white/30">
                {activeRequests.length} active
              </span>
            </div>

            {loadingRequests ? (
              <div className="p-8">
                <p className="text-sm text-white/40">
                  Loading requests...
                </p>
              </div>
            ) : requests.length === 0 ? (
              <div className="p-8">
                <p className="text-sm text-white/40">
                  No assistance requests for this
                  hospital yet.
                </p>
              </div>
            ) : (
              <div className="max-h-[700px] overflow-y-auto">
                {requests.map((request) => {
                  const isSelected =
                    request.id ===
                    selectedRequestId;

                  return (
                    <button
                      key={request.id}
                      onClick={() =>
                        setSelectedRequestId(
                          request.id,
                        )
                      }
                      className={`block w-full border-b border-white/10 p-5 text-left transition ${
                        isSelected
                          ? "bg-lime-300/[0.06]"
                          : "hover:bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-black">
                            {getAssistanceLabel(
                              request.assistance_type,
                            )}
                          </p>

                          <p className="mt-2 text-xs text-white/40">
                            {getProfileLabel(
                              request.accessibility_mode,
                            )}
                          </p>
                        </div>

                        <span
                          className={`whitespace-nowrap text-[8px] font-black uppercase tracking-[0.12em] ${
                            request.status ===
                            "active"
                              ? "text-lime-300"
                              : request.status ===
                                  "responding"
                                ? "text-yellow-300"
                                : "text-white/30"
                          }`}
                        >
                          {getStatusLabel(
                            request.status,
                          )}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-white/25">
                        <span>
                          {getContextLabel(
                            request.scan_context,
                          )}
                        </span>

                        <span>
                          {formatTime(
                            request.created_at,
                          )}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border border-white/10">
            {!selectedRequest ? (
              <div className="flex min-h-[500px] items-center justify-center p-10 text-center">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/20">
                    SELECT A REQUEST
                  </p>

                  <p className="mt-4 text-sm text-white/35">
                    Select an assistance request to
                    inspect the user's location and
                    accessibility evidence.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b border-white/10 p-6 md:p-8">
                  <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-lime-300">
                        ASSISTANCE REQUEST
                      </p>

                      <h3 className="mt-3 text-2xl font-black">
                        {getAssistanceLabel(
                          selectedRequest.assistance_type,
                        )}
                      </h3>

                      <p className="mt-2 text-xs text-white/35">
                        {formatTime(
                          selectedRequest.created_at,
                        )}
                      </p>
                    </div>

                    <span
                      className={`border px-4 py-2 text-[9px] font-black uppercase tracking-[0.15em] ${
                        selectedRequest.status ===
                        "active"
                          ? "border-lime-300/30 text-lime-300"
                          : selectedRequest.status ===
                              "responding"
                            ? "border-yellow-300/30 text-yellow-300"
                            : "border-white/10 text-white/30"
                      }`}
                    >
                      {getStatusLabel(
                        selectedRequest.status,
                      )}
                    </span>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <div className="border border-white/10 p-4">
                      <p className="text-[8px] font-black uppercase tracking-[0.15em] text-white/25">
                        Accessibility profile
                      </p>

                      <p className="mt-2 text-sm font-bold">
                        {getProfileLabel(
                          selectedRequest.accessibility_mode,
                        )}
                      </p>
                    </div>

                    <div className="border border-white/10 p-4">
                      <p className="text-[8px] font-black uppercase tracking-[0.15em] text-white/25">
                        Scan context
                      </p>

                      <p className="mt-2 text-sm font-bold">
                        {getContextLabel(
                          selectedRequest.scan_context,
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-8 p-6 md:p-8">
                  <section>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">
                      LATEST SCAN
                    </p>

                    <h4 className="mt-3 text-xl font-black">
                      Visual evidence
                    </h4>

                    {selectedRequest
                      .scan_environment && (
                      <p className="mt-3 text-sm leading-7 text-white/50">
                        {
                          selectedRequest.scan_environment
                        }
                      </p>
                    )}

                    {selectedRequest
                      .scan_snapshot
                      ?.message && (
                      <div className="mt-4 border-l-2 border-lime-300/50 pl-4">
                        <p className="text-sm leading-7 text-white/60">
                          {
                            selectedRequest
                              .scan_snapshot
                              .message
                          }
                        </p>
                      </div>
                    )}
                  </section>

                  <section className="grid gap-6 md:grid-cols-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-lime-300">
                        ACCESS FEATURES
                      </p>

                      {selectedRequest
                        .scan_snapshot
                        ?.features
                        ?.length ? (
                        <ul className="mt-4 space-y-3">
                          {selectedRequest.scan_snapshot.features.map(
                            (feature, index) => (
                              <li
                                key={`${feature}-${index}`}
                                className="text-sm leading-6 text-white/55"
                              >
                                <span className="mr-2 text-lime-300">
                                  +
                                </span>
                                {feature}
                              </li>
                            ),
                          )}
                        </ul>
                      ) : (
                        <p className="mt-4 text-xs text-white/25">
                          No access features recorded.
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-red-300">
                        BARRIERS
                      </p>

                      {selectedRequest
                        .scan_snapshot
                        ?.barriers
                        ?.length ? (
                        <ul className="mt-4 space-y-3">
                          {selectedRequest.scan_snapshot.barriers.map(
                            (barrier, index) => (
                              <li
                                key={`${barrier}-${index}`}
                                className="text-sm leading-6 text-white/55"
                              >
                                <span className="mr-2 text-red-300">
                                  !
                                </span>
                                {barrier}
                              </li>
                            ),
                          )}
                        </ul>
                      ) : (
                        <p className="mt-4 text-xs text-white/25">
                          No barriers recorded.
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-yellow-300">
                        UNCERTAINTIES
                      </p>

                      {selectedRequest
                        .scan_snapshot
                        ?.uncertainties
                        ?.length ? (
                        <ul className="mt-4 space-y-3">
                          {selectedRequest.scan_snapshot.uncertainties.map(
                            (
                              uncertainty,
                              index,
                            ) => (
                              <li
                                key={`${uncertainty}-${index}`}
                                className="text-sm leading-6 text-white/55"
                              >
                                <span className="mr-2 text-yellow-300">
                                  ?
                                </span>
                                {uncertainty}
                              </li>
                            ),
                          )}
                        </ul>
                      ) : (
                        <p className="mt-4 text-xs text-white/25">
                          No uncertainties recorded.
                        </p>
                      )}
                    </div>
                  </section>

                  <section>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">
                      USER LOCATION
                    </p>

                    <div className="mt-4 border border-white/10 p-5">
                      <p className="font-mono text-sm text-white/60">
                        {selectedRequest.latitude.toFixed(
                          6,
                        )}
                        ,{" "}
                        {selectedRequest.longitude.toFixed(
                          6,
                        )}
                      </p>

                      {selectedRequest.accuracy !==
                        null && (
                        <p className="mt-2 text-xs text-white/25">
                          Location accuracy:{" "}
                          {Math.round(
                            selectedRequest.accuracy,
                          )}
                          m
                        </p>
                      )}

                      <button
                        onClick={() =>
                          openMaps(
                            selectedRequest.latitude,
                            selectedRequest.longitude,
                          )
                        }
                        className="mt-5 border border-lime-300/30 px-5 py-3 text-[9px] font-black uppercase tracking-[0.16em] text-lime-300 transition hover:bg-lime-300 hover:text-black"
                      >
                        Open location
                      </button>
                    </div>
                  </section>

                  <section className="border-t border-white/10 pt-8">
                    <div className="flex flex-col gap-3 sm:flex-row">
                      {selectedRequest.status ===
                        "active" && (
                        <button
                          onClick={() =>
                            updateRequestStatus(
                              selectedRequest.id,
                              "responding",
                            )
                          }
                          disabled={
                            updatingRequest ===
                            selectedRequest.id
                          }
                          className="bg-lime-300 px-6 py-4 text-[9px] font-black uppercase tracking-[0.18em] text-black transition hover:bg-lime-200 disabled:opacity-40"
                        >
                          {updatingRequest ===
                          selectedRequest.id
                            ? "Updating..."
                            : "Accept & Respond"}
                        </button>
                      )}

                      {selectedRequest.status ===
                        "responding" && (
                        <button
                          onClick={() =>
                            updateRequestStatus(
                              selectedRequest.id,
                              "resolved",
                            )
                          }
                          disabled={
                            updatingRequest ===
                            selectedRequest.id
                          }
                          className="bg-lime-300 px-6 py-4 text-[9px] font-black uppercase tracking-[0.18em] text-black transition hover:bg-lime-200 disabled:opacity-40"
                        >
                          {updatingRequest ===
                          selectedRequest.id
                            ? "Updating..."
                            : "Mark Resolved"}
                        </button>
                      )}

                      {selectedRequest.status ===
                        "resolved" && (
                        <div className="border border-lime-300/20 px-6 py-4">
                          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-lime-300">
                            Assistance resolved
                          </p>
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </>
            )}
          </div>
        </section>

        <footer className="mt-12 border-t border-white/10 py-8">
          <p className="text-xs leading-6 text-white/25">
            AccessLens accessibility evidence is
            advisory. Hospital staff should verify
            conditions on the ground before providing
            assistance. This prototype does not
            automatically determine medical emergencies
            or dispatch emergency services.
          </p>
        </footer>
      </div>
    </main>
  );
}