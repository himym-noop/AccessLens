"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Hospital } from "@/lib/hospitals";

export default function HospitalsPage() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadHospitals();
  }, []);

  async function loadHospitals() {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("hospitals")
      .select(
        "id,name,latitude,longitude,phone,is_connected,is_available",
      )
      .order("name");

    if (error) {
      setMessage("Could not load the hospital network.");
      setLoading(false);
      return;
    }

    setHospitals((data as Hospital[]) ?? []);
    setLoading(false);
  }

  async function toggleAvailability(
    hospital: Hospital,
  ) {
    setUpdating(hospital.id);
    setMessage("");

    const { error } = await supabase
      .from("hospitals")
      .update({
        is_available: !hospital.is_available,
        updated_at: new Date().toISOString(),
      })
      .eq("id", hospital.id);

    if (error) {
      setMessage(
        "Could not update hospital availability.",
      );
      setUpdating(null);
      return;
    }

    setHospitals((current) =>
      current.map((item) =>
        item.id === hospital.id
          ? {
              ...item,
              is_available:
                !item.is_available,
            }
          : item,
      ),
    );

    setUpdating(null);
  }

  async function toggleConnection(
    hospital: Hospital,
  ) {
    setUpdating(hospital.id);
    setMessage("");

    const { error } = await supabase
      .from("hospitals")
      .update({
        is_connected: !hospital.is_connected,
        updated_at: new Date().toISOString(),
      })
      .eq("id", hospital.id);

    if (error) {
      setMessage(
        "Could not update hospital connection.",
      );
      setUpdating(null);
      return;
    }

    setHospitals((current) =>
      current.map((item) =>
        item.id === hospital.id
          ? {
              ...item,
              is_connected:
                !item.is_connected,
            }
          : item,
      ),
    );

    setUpdating(null);
  }

  const connectedCount = hospitals.filter(
    (hospital) => hospital.is_connected,
  ).length;

  const availableCount = hospitals.filter(
    (hospital) =>
      hospital.is_connected &&
      hospital.is_available,
  ).length;

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto min-h-screen max-w-6xl px-5 py-8 md:px-10">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-lime-300">
              ACCESSLENS
            </p>

            <p className="mt-2 text-xs text-white/40">
              Hospital network
            </p>
          </div>

          <a
            href="/respond"
            className="border border-white/10 px-4 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-white/50 transition hover:border-lime-300/40 hover:text-lime-300"
          >
            Dashboard
          </a>
        </header>

        <section className="py-12 md:py-16">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-lime-300">
            CONNECTED NETWORK
          </p>

          <h1 className="mt-4 text-4xl font-black tracking-[-0.04em] md:text-6xl">
            Hospital network.
          </h1>

          <p className="mt-5 max-w-2xl text-sm leading-7 text-white/45 md:text-base">
            Connected hospitals can receive
            AccessLens assistance requests.
            Availability determines whether a
            hospital can currently receive new
            requests.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="border border-white/10 p-6">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30">
              Hospitals
            </p>

            <p className="mt-3 text-4xl font-black">
              {hospitals.length}
            </p>
          </div>

          <div className="border border-white/10 p-6">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30">
              Connected
            </p>

            <p className="mt-3 text-4xl font-black text-lime-300">
              {connectedCount}
            </p>
          </div>

          <div className="border border-white/10 p-6">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/30">
              Available
            </p>

            <p className="mt-3 text-4xl font-black">
              {availableCount}
            </p>
          </div>
        </section>

        {message && (
          <div className="mt-6 border border-red-300/20 bg-red-300/[0.03] p-5">
            <p className="text-sm text-red-200">
              {message}
            </p>
          </div>
        )}

        <section className="mt-8">
          {loading ? (
            <div className="border border-white/10 p-8">
              <p className="text-sm text-white/40">
                Loading hospital network...
              </p>
            </div>
          ) : hospitals.length === 0 ? (
            <div className="border border-white/10 p-8">
              <p className="text-sm text-white/40">
                No hospitals found.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {hospitals.map((hospital) => (
                <div
                  key={hospital.id}
                  className="border border-white/10 bg-white/[0.02] p-6 md:p-8"
                >
                  <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-3 w-3 rounded-full ${
                            hospital.is_connected &&
                            hospital.is_available
                              ? "bg-lime-300"
                              : hospital.is_connected
                                ? "bg-yellow-300"
                                : "bg-white/20"
                          }`}
                        />

                        <h2 className="text-xl font-black">
                          {hospital.name}
                        </h2>
                      </div>

                      <p className="mt-3 text-sm text-white/40">
                        {hospital.is_connected
                          ? hospital.is_available
                            ? "Connected · Available"
                            : "Connected · Unavailable"
                          : "Disconnected"}
                      </p>

                      <p className="mt-2 text-xs text-white/25">
                        {hospital.phone ||
                          "No phone configured"}
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        onClick={() =>
                          toggleConnection(
                            hospital,
                          )
                        }
                        disabled={
                          updating ===
                          hospital.id
                        }
                        className="border border-white/10 px-5 py-3 text-[9px] font-black uppercase tracking-[0.16em] text-white/60 transition hover:border-lime-300/40 hover:text-lime-300 disabled:opacity-40"
                      >
                        {updating ===
                        hospital.id
                          ? "Updating..."
                          : hospital.is_connected
                            ? "Disconnect"
                            : "Connect"}
                      </button>

                      <button
                        onClick={() =>
                          toggleAvailability(
                            hospital,
                          )
                        }
                        disabled={
                          updating ===
                          hospital.id
                        }
                        className={`px-5 py-3 text-[9px] font-black uppercase tracking-[0.16em] transition disabled:opacity-40 ${
                          hospital.is_available
                            ? "border border-yellow-300/30 text-yellow-300 hover:bg-yellow-300 hover:text-black"
                            : "bg-lime-300 text-black hover:bg-lime-200"
                        }`}
                      >
                        {hospital.is_available
                          ? "Set unavailable"
                          : "Set available"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-12 border-t border-white/10 py-8">
          <p className="text-xs leading-6 text-white/25">
            Hospital connection and availability
            controls are part of the AccessLens
            prototype network. Real deployment would
            require authenticated hospital accounts
            and verified institutional partnerships.
          </p>
        </footer>
      </div>
    </main>
  );
}