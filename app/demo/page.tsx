"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type DemoStatus =
  | "waiting"
  | "responding"
  | "resolved";

type StoredRequest = {
  id?: string;
  status?: string;
  hospital?: {
    name?: string;
  };
};

export default function DemoPage() {
  const router = useRouter();

  const [requestId, setRequestId] =
    useState<string | null>(null);

  const [requestStatus, setRequestStatus] =
    useState<DemoStatus>("waiting");

  const [hospitalName, setHospitalName] =
    useState("Connected hospital");

  const [message, setMessage] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  useEffect(() => {
    loadExistingRequest();
  }, []);

  useEffect(() => {
    if (!requestId) {
      return;
    }

    const channel = supabase
      .channel(
        `demo-assistance-${requestId}`,
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
          const status =
            payload.new?.status;

          if (
            status === "responding"
          ) {
            setRequestStatus(
              "responding",
            );
          }

          if (
            status === "resolved"
          ) {
            setRequestStatus(
              "resolved",
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(
        channel,
      );
    };
  }, [requestId]);

  async function loadExistingRequest() {
    const storedId =
      sessionStorage.getItem(
        "accesslens_assistance_request",
      );

    if (!storedId) {
      return;
    }

    setRequestId(storedId);

    const { data, error } =
      await supabase
        .from(
          "assistance_requests",
        )
        .select(
          `
            id,
            status,
            hospital_id,
            hospitals (
              name
            )
          `,
        )
        .eq(
          "id",
          storedId,
        )
        .maybeSingle();

    if (error || !data) {
      return;
    }

    const request =
      data as unknown as StoredRequest;

    if (
      request.hospital?.name
    ) {
      setHospitalName(
        request.hospital.name,
      );
    }

    if (
      data.status ===
      "responding"
    ) {
      setRequestStatus(
        "responding",
      );
    }

    if (
      data.status ===
      "resolved"
    ) {
      setRequestStatus(
        "resolved",
      );
    }
  }

  function startRealExperience() {
    router.push("/scan");
  }

  function openCamera() {
    router.push("/camera");
  }

  function openAssistance() {
    router.push("/assist");
  }

  function openHospitalDashboard() {
    router.push("/respond");
  }

  async function createDemoAssistance() {
    setLoading(true);
    setMessage("");

    try {
      const location =
        sessionStorage.getItem(
          "accesslens_location",
        );

      if (!location) {
        setMessage(
          "Start the real assistance flow so AccessLens can request your location with your permission.",
        );

        setLoading(false);

        return;
      }

      const parsedLocation =
        JSON.parse(location);

      const {
        data: hospitals,
        error:
          hospitalsError,
      } = await supabase
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
        )
        .order("name");

      if (
        hospitalsError ||
        !hospitals ||
        hospitals.length === 0
      ) {
        throw new Error(
          "No connected hospital is currently available.",
        );
      }

      const hospital =
        hospitals[0];

      const latestScan =
        sessionStorage.getItem(
          "accesslens_latest_scan",
        );

      let scanSnapshot =
        null;

      if (latestScan) {
        try {
          scanSnapshot =
            JSON.parse(
              latestScan,
            );
        } catch {
          scanSnapshot = null;
        }
      }

      const {
        data,
        error,
      } = await supabase
        .from(
          "assistance_requests",
        )
        .insert({
          assistance_type:
            "physical",
          latitude:
            parsedLocation.latitude,
          longitude:
            parsedLocation.longitude,
          accuracy:
            parsedLocation.accuracy ??
            null,
          hospital_id:
            hospital.id,
          accessibility_mode:
            scanSnapshot?.profile ??
            null,
          scan_context:
            scanSnapshot?.scanContext ??
            null,
          scan_environment:
            scanSnapshot?.environment ??
            null,
          scan_snapshot:
            scanSnapshot,
          status: "active",
        })
        .select(
          "id,status",
        )
        .single();

      if (error) {
        throw new Error(
          error.message,
        );
      }

      setRequestId(
        data.id,
      );

      setRequestStatus(
        "waiting",
      );

      setHospitalName(
        hospital.name,
      );

      sessionStorage.setItem(
        "accesslens_assistance_request",
        data.id,
      );

      setMessage(
        "Assistance request created successfully.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function markResponding() {
    if (!requestId) {
      openHospitalDashboard();
      return;
    }

    const { error } =
      await supabase
        .from(
          "assistance_requests",
        )
        .update({
          status:
            "responding",
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          requestId,
        );

    if (error) {
      setMessage(
        error.message,
      );

      return;
    }

    setRequestStatus(
      "responding",
    );
  }

  async function markResolved() {
    if (!requestId) {
      openHospitalDashboard();
      return;
    }

    const { error } =
      await supabase
        .from(
          "assistance_requests",
        )
        .update({
          status:
            "resolved",
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          requestId,
        );

    if (error) {
      setMessage(
        error.message,
      );

      return;
    }

    setRequestStatus(
      "resolved",
    );
  }

  function resetDemo() {
    sessionStorage.removeItem(
      "accesslens_assistance_request",
    );

    sessionStorage.removeItem(
      "accesslens_latest_scan",
    );

    sessionStorage.removeItem(
      "accesslens_previous_scans",
    );

    sessionStorage.removeItem(
      "accesslens_next_scan",
    );

    setRequestId(null);
    setRequestStatus(
      "waiting",
    );
    setMessage("");

    router.push("/scan");
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 px-6 py-5 md:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <button
            onClick={() =>
              router.push("/")
            }
            className="text-left"
          >
            <div className="text-xl font-black tracking-[-0.05em]">
              ACCESS
              <span className="text-lime-300">
                LENS
              </span>
            </div>

            <div className="mt-1 text-[8px] font-black uppercase tracking-[0.3em] text-white/25">
              Competition mode
            </div>
          </button>

          <button
            onClick={() =>
              router.push(
                "/scan",
              )
            }
            className="border border-white/10 px-4 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/40 transition hover:text-white"
          >
            Open product
          </button>
        </div>
      </header>

      <div className="h-1 bg-white/5">
        <div className="h-full w-full bg-lime-300" />
      </div>

      <section className="mx-auto max-w-7xl px-6 py-12 md:px-10 md:py-20">
        <div className="grid min-h-[65vh] items-center gap-14 lg:grid-cols-[1.1fr_0.7fr]">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.3em] text-lime-300">
              AccessLens
            </div>

            <h1 className="mt-6 max-w-5xl text-5xl font-black leading-[0.88] tracking-[-0.07em] md:text-8xl">
              Don't just
              <br />
              scan the
              <br />
              <span className="text-white/25">
                space.
              </span>
              <br />
              Build the route.
            </h1>

            <p className="mt-8 max-w-xl text-sm leading-7 text-white/40 md:text-base">
              AccessLens uses visual evidence to
              understand accessibility, connect
              scans into a route, preserve
              uncertainty, and connect users to
              assistance when needed.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={
                  startRealExperience
                }
                className="bg-lime-300 px-8 py-4 text-[9px] font-black uppercase tracking-[0.22em] text-black transition hover:bg-white"
              >
                Start real demo
              </button>

              <button
                onClick={
                  openCamera
                }
                className="border border-white/10 px-8 py-4 text-[9px] font-black uppercase tracking-[0.22em] text-white/40 transition hover:border-white/20 hover:text-white"
              >
                Open camera
              </button>
            </div>
          </div>

          <div className="border border-white/10 p-6 md:p-8">
            <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/25">
              The journey
            </div>

            <div className="mt-8">
              <JourneyStep
                number="01"
                title="SEE"
                text="Capture the environment."
                active
              />

              <JourneyStep
                number="02"
                title="UNDERSTAND"
                text="Extract visible accessibility evidence."
                active
              />

              <JourneyStep
                number="03"
                title="CONNECT"
                text="Build a route from multiple scans."
                active
              />

              <JourneyStep
                number="04"
                title="ASSIST"
                text="Create an assistance request."
                active
              />

              <JourneyStep
                number="05"
                title="RESPOND"
                text="Connect the user with a responder."
                active
                last
              />
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-px bg-white/10 md:grid-cols-3">
          <FeatureBlock
            number="01"
            title="Visual evidence"
            text="AccessLens reasons from what is actually visible instead of inventing hidden information."
          />

          <FeatureBlock
            number="02"
            title="Route intelligence"
            text="Individual scans become connected spatial evidence rather than isolated image results."
          />

          <FeatureBlock
            number="03"
            title="Human assistance"
            text="When technology isn't enough, the workflow connects the user to a responder."
          />
        </div>

        <div className="mt-20 border-t border-white/10 pt-12">
          <div className="grid gap-8 md:grid-cols-4">
            <Stat
              value="SCAN"
              label="Visual evidence"
            />

            <Stat
              value="REASON"
              label="Accessibility analysis"
            />

            <Stat
              value="ROUTE"
              label="Connected journey"
            />

            <Stat
              value="ASSIST"
              label="Human response"
            />
          </div>
        </div>

        <div className="mt-20 border border-white/10 p-6 md:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.25em] text-lime-300">
                Live product
              </div>

              <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] md:text-5xl">
                Ready to see the actual system?
              </h2>

              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/35">
                Start with the real scanner. Your
                Gemini analysis, route memory,
                assistance system, Supabase
                requests, and hospital dashboard
                remain connected.
              </p>
            </div>

            <button
              onClick={
                startRealExperience
              }
              className="shrink-0 bg-lime-300 px-8 py-5 text-[9px] font-black uppercase tracking-[0.2em] text-black transition hover:bg-white"
            >
              Launch AccessLens
            </button>
          </div>
        </div>

        {requestId && (
          <div className="mt-20 border border-white/10">
            <div className="border-b border-white/10 px-6 py-5 md:px-8">
              <div className="text-[9px] font-black uppercase tracking-[0.25em] text-white/25">
                Existing assistance request
              </div>
            </div>

            <div className="grid gap-8 p-6 md:p-8 lg:grid-cols-[1fr_0.5fr]">
              <div>
                <div className="text-2xl font-black">
                  {hospitalName}
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      requestStatus ===
                      "resolved"
                        ? "bg-lime-300"
                        : requestStatus ===
                          "responding"
                        ? "animate-pulse bg-lime-300"
                        : "bg-yellow-200"
                    }`}
                  />

                  <span className="text-sm font-bold text-white/60">
                    {requestStatus ===
                    "waiting"
                      ? "Request sent"
                      : requestStatus ===
                        "responding"
                      ? "Hospital responding"
                      : "Request resolved"}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {requestStatus ===
                  "waiting" && (
                  <button
                    onClick={
                      markResponding
                    }
                    className="bg-lime-300 px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] text-black"
                  >
                    Hospital: Respond
                  </button>
                )}

                {requestStatus ===
                  "responding" && (
                  <button
                    onClick={
                      markResolved
                    }
                    className="border border-lime-300/30 px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] text-lime-300"
                  >
                    Hospital: Resolve
                  </button>
                )}

                {requestStatus ===
                  "resolved" && (
                  <div className="border border-lime-300/20 p-4 text-center text-[9px] font-black uppercase tracking-[0.15em] text-lime-300">
                    Assistance resolved
                  </div>
                )}

                <button
                  onClick={
                    openHospitalDashboard
                  }
                  className="border border-white/10 px-5 py-4 text-[9px] font-black uppercase tracking-[0.18em] text-white/40 transition hover:text-white"
                >
                  Open hospital dashboard
                </button>
              </div>
            </div>
          </div>
        )}

        {message && (
          <div className="mt-8 border border-white/10 p-5 text-sm text-white/40">
            {message}
          </div>
        )}

        <div className="mt-20 flex flex-col gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <button
            onClick={
              openAssistance
            }
            className="border border-white/10 px-6 py-4 text-[9px] font-black uppercase tracking-[0.18em] text-white/40 transition hover:text-white"
          >
            Assistance
          </button>

          <button
            onClick={
              openHospitalDashboard
            }
            className="border border-white/10 px-6 py-4 text-[9px] font-black uppercase tracking-[0.18em] text-white/40 transition hover:text-white"
          >
            Hospital dashboard
          </button>

          <button
            onClick={
              resetDemo
            }
            className="border border-white/10 px-6 py-4 text-[9px] font-black uppercase tracking-[0.18em] text-white/40 transition hover:text-white"
          >
            New journey
          </button>
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-8 md:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-[8px] font-black uppercase tracking-[0.2em] text-white/20 sm:flex-row sm:items-center sm:justify-between">
          <span>
            ACCESSLENS
          </span>

          <span>
            Evidence → Route → Assistance
          </span>
        </div>
      </footer>
    </main>
  );
}

function JourneyStep({
  number,
  title,
  text,
  active = false,
  last = false,
}: {
  number: string;
  title: string;
  text: string;
  active?: boolean;
  last?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[8px] font-black ${
            active
              ? "border-lime-300/30 bg-lime-300/[0.05] text-lime-300"
              : "border-white/10 text-white/20"
          }`}
        >
          {number}
        </div>

        {!last && (
          <div className="h-12 w-px bg-white/10" />
        )}
      </div>

      <div className="pb-6">
        <div className="text-xs font-black tracking-wide">
          {title}
        </div>

        <div className="mt-1 text-xs leading-5 text-white/30">
          {text}
        </div>
      </div>
    </div>
  );
}

function FeatureBlock({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="bg-black p-6 md:p-8">
      <div className="text-[9px] font-black text-lime-300">
        {number}
      </div>

      <div className="mt-6 text-lg font-black">
        {title}
      </div>

      <p className="mt-3 text-xs leading-6 text-white/30">
        {text}
      </p>
    </div>
  );
}

function Stat({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div>
      <div className="text-2xl font-black tracking-[-0.03em] text-white">
        {value}
      </div>

      <div className="mt-2 text-[8px] font-black uppercase tracking-[0.18em] text-white/20">
        {label}
      </div>
    </div>
  );
}