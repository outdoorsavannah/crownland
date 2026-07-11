// Curated gazetteer of BC communities for offline "nearest town" lookup.
// Coordinates are approximate community centres (a few decimals is plenty to
// pick the nearest). Extend freely — it is just a flat list.

export interface Town {
  name: string;
  lat: number;
  lng: number;
}

export const BC_TOWNS: Town[] = [
  { name: "Victoria", lat: 48.428, lng: -123.365 },
  { name: "Sooke", lat: 48.375, lng: -123.727 },
  { name: "Port Renfrew", lat: 48.555, lng: -124.421 },
  { name: "Sidney", lat: 48.65, lng: -123.399 },
  { name: "Duncan", lat: 48.779, lng: -123.708 },
  { name: "Ladysmith", lat: 48.995, lng: -123.817 },
  { name: "Chemainus", lat: 48.925, lng: -123.716 },
  { name: "Nanaimo", lat: 49.166, lng: -123.941 },
  { name: "Parksville", lat: 49.315, lng: -124.313 },
  { name: "Qualicum Beach", lat: 49.35, lng: -124.443 },
  { name: "Port Alberni", lat: 49.235, lng: -124.805 },
  { name: "Ucluelet", lat: 48.941, lng: -125.545 },
  { name: "Tofino", lat: 49.153, lng: -125.906 },
  { name: "Courtenay", lat: 49.687, lng: -124.994 },
  { name: "Comox", lat: 49.673, lng: -124.928 },
  { name: "Campbell River", lat: 50.024, lng: -125.244 },
  { name: "Gold River", lat: 49.777, lng: -126.052 },
  { name: "Sayward", lat: 50.383, lng: -125.96 },
  { name: "Port McNeill", lat: 50.588, lng: -127.086 },
  { name: "Port Hardy", lat: 50.72, lng: -127.493 },
  { name: "Vancouver", lat: 49.283, lng: -123.121 },
  { name: "Bowen Island", lat: 49.383, lng: -123.336 },
  { name: "Richmond", lat: 49.166, lng: -123.134 },
  { name: "Delta", lat: 49.084, lng: -123.058 },
  { name: "Surrey", lat: 49.106, lng: -122.826 },
  { name: "Langley", lat: 49.104, lng: -122.66 },
  { name: "Maple Ridge", lat: 49.219, lng: -122.598 },
  { name: "Mission", lat: 49.133, lng: -122.309 },
  { name: "Abbotsford", lat: 49.05, lng: -122.329 },
  { name: "Chilliwack", lat: 49.158, lng: -121.951 },
  { name: "Hope", lat: 49.383, lng: -121.442 },
  { name: "Squamish", lat: 49.702, lng: -123.156 },
  { name: "Whistler", lat: 50.116, lng: -122.957 },
  { name: "Pemberton", lat: 50.32, lng: -122.8 },
  { name: "Sechelt", lat: 49.474, lng: -123.754 },
  { name: "Gibsons", lat: 49.402, lng: -123.504 },
  { name: "Powell River", lat: 49.835, lng: -124.523 },
  { name: "Kelowna", lat: 49.888, lng: -119.496 },
  { name: "West Kelowna", lat: 49.863, lng: -119.583 },
  { name: "Peachland", lat: 49.773, lng: -119.74 },
  { name: "Summerland", lat: 49.6, lng: -119.678 },
  { name: "Penticton", lat: 49.499, lng: -119.594 },
  { name: "Oliver", lat: 49.182, lng: -119.55 },
  { name: "Osoyoos", lat: 49.032, lng: -119.466 },
  { name: "Keremeos", lat: 49.204, lng: -119.828 },
  { name: "Princeton", lat: 49.459, lng: -120.507 },
  { name: "Merritt", lat: 50.112, lng: -120.788 },
  { name: "Logan Lake", lat: 50.494, lng: -120.808 },
  { name: "Vernon", lat: 50.267, lng: -119.272 },
  { name: "Enderby", lat: 50.55, lng: -119.14 },
  { name: "Armstrong", lat: 50.448, lng: -119.196 },
  { name: "Salmon Arm", lat: 50.7, lng: -119.284 },
  { name: "Sicamous", lat: 50.837, lng: -118.985 },
  { name: "Kamloops", lat: 50.674, lng: -120.327 },
  { name: "Barriere", lat: 51.185, lng: -120.126 },
  { name: "Clearwater", lat: 51.65, lng: -120.033 },
  { name: "Ashcroft", lat: 50.725, lng: -121.283 },
  { name: "Cache Creek", lat: 50.812, lng: -121.328 },
  { name: "Lillooet", lat: 50.686, lng: -121.936 },
  { name: "Lytton", lat: 50.232, lng: -121.582 },
  { name: "Clinton", lat: 51.09, lng: -121.585 },
  { name: "100 Mile House", lat: 51.643, lng: -121.296 },
  { name: "Williams Lake", lat: 52.129, lng: -122.14 },
  { name: "Quesnel", lat: 52.988, lng: -122.495 },
  { name: "Bella Coola", lat: 52.374, lng: -126.756 },
  { name: "Prince George", lat: 53.917, lng: -122.749 },
  { name: "Vanderhoof", lat: 54.014, lng: -124.01 },
  { name: "Fort St. James", lat: 54.442, lng: -124.253 },
  { name: "Burns Lake", lat: 54.23, lng: -125.76 },
  { name: "Houston", lat: 54.399, lng: -126.653 },
  { name: "Smithers", lat: 54.78, lng: -127.174 },
  { name: "Hazelton", lat: 55.256, lng: -127.671 },
  { name: "Terrace", lat: 54.518, lng: -128.603 },
  { name: "Kitimat", lat: 54.055, lng: -128.653 },
  { name: "Prince Rupert", lat: 54.312, lng: -130.32 },
  { name: "Stewart", lat: 55.936, lng: -129.995 },
  { name: "Masset", lat: 54.012, lng: -132.146 },
  { name: "Daajing Giids", lat: 53.254, lng: -132.073 },
  { name: "Mackenzie", lat: 55.339, lng: -123.093 },
  { name: "Chetwynd", lat: 55.696, lng: -121.629 },
  { name: "Tumbler Ridge", lat: 55.13, lng: -120.994 },
  { name: "Dawson Creek", lat: 55.76, lng: -120.236 },
  { name: "Fort St. John", lat: 56.252, lng: -120.846 },
  { name: "Hudson's Hope", lat: 56.024, lng: -121.909 },
  { name: "Fort Nelson", lat: 58.805, lng: -122.7 },
  { name: "Dease Lake", lat: 58.437, lng: -129.999 },
  { name: "Atlin", lat: 59.577, lng: -133.7 },
  { name: "Valemount", lat: 52.831, lng: -119.267 },
  { name: "McBride", lat: 53.301, lng: -120.166 },
  { name: "Revelstoke", lat: 50.998, lng: -118.196 },
  { name: "Golden", lat: 51.296, lng: -116.965 },
  { name: "Invermere", lat: 50.507, lng: -116.029 },
  { name: "Nakusp", lat: 50.243, lng: -117.801 },
  { name: "Kaslo", lat: 49.914, lng: -116.911 },
  { name: "New Denver", lat: 49.994, lng: -117.372 },
  { name: "Nelson", lat: 49.494, lng: -117.297 },
  { name: "Castlegar", lat: 49.324, lng: -117.66 },
  { name: "Trail", lat: 49.096, lng: -117.712 },
  { name: "Rossland", lat: 49.078, lng: -117.802 },
  { name: "Grand Forks", lat: 49.03, lng: -118.44 },
  { name: "Midway", lat: 49.006, lng: -118.771 },
  { name: "Creston", lat: 49.096, lng: -116.513 },
  { name: "Cranbrook", lat: 49.512, lng: -115.769 },
  { name: "Kimberley", lat: 49.669, lng: -115.977 },
  { name: "Fernie", lat: 49.504, lng: -115.063 },
  { name: "Sparwood", lat: 49.733, lng: -114.885 },
  { name: "Elkford", lat: 50.024, lng: -114.923 },
];

const EARTH_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(s));
}

/** Nearest community to a point, with its distance in km (null if list empty). */
export function nearestTown(lat: number, lng: number): { name: string; km: number } | null {
  let best: { name: string; km: number } | null = null;
  for (const t of BC_TOWNS) {
    const km = haversineKm(lat, lng, t.lat, t.lng);
    if (!best || km < best.km) best = { name: t.name, km };
  }
  return best;
}
