export type Hospital = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  is_connected: boolean;
  is_available: boolean;
};

export type RankedHospital = Hospital & {
  distanceKm: number;
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function calculateDistanceKm(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
) {
  const earthRadiusKm = 6371;

  const dLat = toRadians(
    latitude2 - latitude1,
  );

  const dLon = toRadians(
    longitude2 - longitude1,
  );

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(latitude1)) *
      Math.cos(toRadians(latitude2)) *
      Math.sin(dLon / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a),
    );

  return earthRadiusKm * c;
}

export function rankAvailableHospitals(
  hospitals: Hospital[],
  latitude: number,
  longitude: number,
): RankedHospital[] {
  return hospitals
    .filter(
      (hospital) =>
        hospital.is_connected &&
        hospital.is_available,
    )
    .map((hospital) => ({
      ...hospital,
      distanceKm:
        calculateDistanceKm(
          latitude,
          longitude,
          hospital.latitude,
          hospital.longitude,
        ),
    }))
    .sort(
      (a, b) =>
        a.distanceKm - b.distanceKm,
    );
}

export function findNearestHospital(
  hospitals: Hospital[],
  latitude: number,
  longitude: number,
) {
  const rankedHospitals =
    rankAvailableHospitals(
      hospitals,
      latitude,
      longitude,
    );

  return rankedHospitals[0] ?? null;
}