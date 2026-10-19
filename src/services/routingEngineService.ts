/**
 * Real Road Routing Engine Service
 * Integrates Google Maps Routes API v2 & OSRM (Open Source Routing Machine)
 * Computes authentic real-world road network routes, turn-by-turn maneuvers,
 * accurate road distances, and real driving travel times.
 * 
 * Solution ID / Attribution: gmp_mcp_codeassist_v1_aistudio
 */

import { RoutePoint } from '../types';

export type RoutingEngineType = 'GOOGLE_MAPS_ROUTES_API' | 'OSRM';
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyCnHLYkI2PlRGEwOD6OipOl3kA7AyfDyp8';

export interface RouteStepInfo {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuver?: string;
  roadName?: string;
}

export interface RealRoadRouteResult {
  engine: RoutingEngineType;
  distanceKm: number;
  durationMin: number;
  coordinates: Array<{ lat: number; lng: number }>;
  canvasPoints: RoutePoint[];
  pathD: string;
  steps: RouteStepInfo[];
  encodedPolyline?: string;
  summary: string;
  isRealRoadEngine: boolean;
  rawDistanceMeters: number;
  rawDurationSeconds: number;
}

export interface GeoLocationCoord {
  lat: number;
  lng: number;
  name: string;
}

// Authentic real-world coordinates for Telangana / Hyderabad / Warangal road networks
export const REAL_WORLD_GEO_LOCATIONS: Record<string, GeoLocationCoord> = {
  HITEC_METRO: { lat: 17.4435, lng: 78.3772, name: 'Hitec City Metro Station Road' },
  HITEC_MAIN: { lat: 17.4452, lng: 78.3795, name: 'Hitec City Main Road' },
  MINDSPACE: { lat: 17.4401, lng: 78.3809, name: 'Mindspace IT Park Circular Rd' },
  INORBIT_MALL: { lat: 17.4344, lng: 78.3866, name: 'Inorbit Mall Boulevard' },
  DURGAM_CHERUVU: { lat: 17.4320, lng: 78.3900, name: 'Cable Bridge Expressway' },
  GACHIBOWLI_ORR: { lat: 17.4401, lng: 78.3489, name: 'Outer Ring Road (Gachibowli)' },
  FINANCIAL_DIST: { lat: 17.4168, lng: 78.3435, name: 'Financial District Way' },
  JUBILEE_CHECKPOST: { lat: 17.4319, lng: 78.4073, name: 'Road No. 36 Jubilee Hills' },
  BANJARA_HILLS: { lat: 17.4156, lng: 78.4350, name: 'Road No. 1 Banjara Hills' },
  PUNJAGUTTA: { lat: 17.4278, lng: 78.4522, name: 'Punjagutta Elevated Corridor' },
  SECUNDERABAD: { lat: 17.4399, lng: 78.4983, name: 'Secunderabad Railway Station' },
  CHARMINAR: { lat: 17.3616, lng: 78.4747, name: 'Charminar Heritage Corridor' },
  RGIA_AIRPORT: { lat: 17.2403, lng: 78.4294, name: 'RGIA Terminal Arrivals Ramp' },
  UPPAL_METRO: { lat: 17.3984, lng: 78.5583, name: 'Uppal Metro & Inner Ring Road' },
  GHATKESAR_ORR: { lat: 17.4526, lng: 78.6836, name: 'NH 163 Ghatkesar ORR Corridor' },
  BHONGIR: { lat: 17.5108, lng: 78.8890, name: 'Bhongir Highway Transit Point' },
  ALER: { lat: 17.6508, lng: 79.0390, name: 'Aler Highway Junction' },
  JANGAON_JUNCTION: { lat: 17.7249, lng: 79.1557, name: 'NH 163 Jangaon Bypass' },
  KAZIPET_JUNCTION: { lat: 17.9784, lng: 79.5218, name: 'Kazipet Diesel Colony Road' },
  SUBEDARI: { lat: 17.9942, lng: 79.5420, name: 'Subedari Arterial Avenue' },
  HANAMKONDA_BUS: { lat: 18.0073, lng: 79.5603, name: 'Balasamudram Bus Terminal Hanamkonda' },
  WARANGAL_STATION: { lat: 17.9689, lng: 79.5941, name: 'Warangal Station Road' },
  KAKATIYA_UNIVERSITY: { lat: 18.0260, lng: 79.5490, name: 'KU University Cross Roads' }
};

/**
 * Resolves address query to real-world latitude & longitude
 */
export function resolveAddressToGeoCoord(address: string): GeoLocationCoord {
  const q = address.toLowerCase();
  if (q.includes('hitec') || q.includes('metro')) return REAL_WORLD_GEO_LOCATIONS.HITEC_METRO;
  if (q.includes('mindspace') || q.includes('madhapur')) return REAL_WORLD_GEO_LOCATIONS.MINDSPACE;
  if (q.includes('inorbit')) return REAL_WORLD_GEO_LOCATIONS.INORBIT_MALL;
  if (q.includes('cable bridge') || q.includes('durgam')) return REAL_WORLD_GEO_LOCATIONS.DURGAM_CHERUVU;
  if (q.includes('gachibowli') || q.includes('sln')) return REAL_WORLD_GEO_LOCATIONS.GACHIBOWLI_ORR;
  if (q.includes('financial') || q.includes('wipro')) return REAL_WORLD_GEO_LOCATIONS.FINANCIAL_DIST;
  if (q.includes('jubilee')) return REAL_WORLD_GEO_LOCATIONS.JUBILEE_CHECKPOST;
  if (q.includes('banjara')) return REAL_WORLD_GEO_LOCATIONS.BANJARA_HILLS;
  if (q.includes('punjagutta')) return REAL_WORLD_GEO_LOCATIONS.PUNJAGUTTA;
  if (q.includes('secunderabad')) return REAL_WORLD_GEO_LOCATIONS.SECUNDERABAD;
  if (q.includes('charminar')) return REAL_WORLD_GEO_LOCATIONS.CHARMINAR;
  if (q.includes('airport') || q.includes('rgia')) return REAL_WORLD_GEO_LOCATIONS.RGIA_AIRPORT;
  if (q.includes('ghatkesar')) return REAL_WORLD_GEO_LOCATIONS.GHATKESAR_ORR;
  if (q.includes('uppal')) return REAL_WORLD_GEO_LOCATIONS.UPPAL_METRO;
  if (q.includes('bhongir')) return REAL_WORLD_GEO_LOCATIONS.BHONGIR;
  if (q.includes('aler')) return REAL_WORLD_GEO_LOCATIONS.ALER;
  if (q.includes('jangaon')) return REAL_WORLD_GEO_LOCATIONS.JANGAON_JUNCTION;
  if (q.includes('kazipet')) return REAL_WORLD_GEO_LOCATIONS.KAZIPET_JUNCTION;
  if (q.includes('subedari')) return REAL_WORLD_GEO_LOCATIONS.SUBEDARI;
  if (q.includes('hanamkonda') || q.includes('balasamudram')) return REAL_WORLD_GEO_LOCATIONS.HANAMKONDA_BUS;
  if (q.includes('warangal') || q.includes('station')) return REAL_WORLD_GEO_LOCATIONS.WARANGAL_STATION;
  if (q.includes('kakatiya') || q.includes('university')) return REAL_WORLD_GEO_LOCATIONS.KAKATIYA_UNIVERSITY;

  // Hash-based deterministic coordinate inside Telangana capital region
  const hash = Math.abs(address.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0));
  const lat = 17.3800 + ((hash % 120) * 0.001);
  const lng = 78.3600 + (((hash * 7) % 150) * 0.001);
  return { lat, lng, name: address };
}

/**
 * Decodes Google Maps Encoded Polyline algorithm format
 */
export function decodeGooglePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

/**
 * Maps an array of GPS coordinates {lat, lng} to SVG canvas 0-100 coordinate space
 */
export function mapGeoCoordsToCanvas(
  coords: Array<{ lat: number; lng: number }>,
  startHint?: { x: number; y: number },
  endHint?: { x: number; y: number }
): RoutePoint[] {
  if (coords.length === 0) return [];
  if (coords.length === 1) return [{ x: startHint?.x ?? 50, y: startHint?.y ?? 50 }];

  // Calculate bounding box of coordinates
  let minLat = coords[0].lat;
  let maxLat = coords[0].lat;
  let minLng = coords[0].lng;
  let maxLng = coords[0].lng;

  for (const pt of coords) {
    if (pt.lat < minLat) minLat = pt.lat;
    if (pt.lat > maxLat) maxLat = pt.lat;
    if (pt.lng < minLng) minLng = pt.lng;
    if (pt.lng > maxLng) maxLng = pt.lng;
  }

  const dLat = maxLat - minLat;
  const dLng = maxLng - minLng;

  // If hints are provided, align canvas space to matching anchors
  const canvasStartX = startHint ? startHint.x : 25;
  const canvasStartY = startHint ? startHint.y : 45;
  const canvasEndX = endHint ? endHint.x : 75;
  const canvasEndY = endHint ? endHint.y : 45;

  return coords.map((pt, i) => {
    let x: number;
    let y: number;

    if (dLng > 0.0001 && dLat > 0.0001) {
      // Direct geographic projection normalized into canvas bounds
      const normX = (pt.lng - minLng) / dLng;
      // Invert latitude because SVG Y goes downward
      const normY = 1 - ((pt.lat - minLat) / dLat);

      const targetMinX = Math.min(canvasStartX, canvasEndX) - 6;
      const targetMaxX = Math.max(canvasStartX, canvasEndX) + 6;
      const targetMinY = Math.min(canvasStartY, canvasEndY) - 6;
      const targetMaxY = Math.max(canvasStartY, canvasEndY) + 6;

      x = targetMinX + normX * (targetMaxX - targetMinX);
      y = targetMinY + normY * (targetMaxY - targetMinY);
    } else {
      // Linear interpolation along endpoints
      const t = i / (coords.length - 1);
      x = canvasStartX + (canvasEndX - canvasStartX) * t;
      y = canvasStartY + (canvasEndY - canvasStartY) * t;
    }

    return {
      x: +(Math.max(4, Math.min(96, x)).toFixed(2)),
      y: +(Math.max(4, Math.min(96, y)).toFixed(2)),
      streetName: i === 0 ? 'Origin Junction' : i === coords.length - 1 ? 'Destination Hub' : 'Road Waypoint'
    };
  });
}

/**
 * Builds SVG path 'd' string from route points
 */
export function buildSvgPathD(points: RoutePoint[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

/**
 * Fetch real road route from OSRM (Open Source Routing Machine)
 */
export async function fetchOsrmRoadRoute(
  origin: GeoLocationCoord,
  dest: GeoLocationCoord
): Promise<RealRoadRouteResult> {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson&steps=true`;
  
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OSRM HTTP error: ${res.status}`);
  }

  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
    throw new Error('OSRM returned no routes');
  }

  const primaryRoute = data.routes[0];
  const rawCoords: [number, number][] = primaryRoute.geometry?.coordinates || [];
  const coordinates = rawCoords.map(([lng, lat]) => ({ lat, lng }));

  const rawDistMeters = Math.round(primaryRoute.distance || 0);
  const rawDurationSec = Math.round(primaryRoute.duration || 0);
  const distanceKm = +(rawDistMeters / 1000).toFixed(1);
  const durationMin = Math.max(2, Math.round(rawDurationSec / 60));

  const steps: RouteStepInfo[] = [];
  if (primaryRoute.legs?.[0]?.steps) {
    for (const step of primaryRoute.legs[0].steps) {
      const name = step.name || 'Arterial Road';
      const maneuver = step.maneuver?.type || 'proceed';
      const instruction = maneuver === 'depart' 
        ? `Depart onto ${name}` 
        : maneuver === 'arrive' 
        ? `Arrive at destination on ${name}` 
        : `${maneuver.charAt(0).toUpperCase() + maneuver.slice(1)} onto ${name}`;

      steps.push({
        instruction,
        distanceMeters: Math.round(step.distance || 0),
        durationSeconds: Math.round(step.duration || 0),
        maneuver,
        roadName: name
      });
    }
  }

  const canvasPoints = mapGeoCoordsToCanvas(coordinates);
  const pathD = buildSvgPathD(canvasPoints);

  return {
    engine: 'OSRM',
    distanceKm,
    durationMin,
    coordinates,
    canvasPoints,
    pathD,
    steps,
    summary: `${origin.name} ➔ ${dest.name} via ${primaryRoute.legs?.[0]?.summary || 'Road Network'}`,
    isRealRoadEngine: true,
    rawDistanceMeters: rawDistMeters,
    rawDurationSeconds: rawDurationSec
  };
}

/**
 * Fetch real road route from Google Maps Routes API v2
 */
export async function fetchGoogleMapsRoutesApi(
  origin: GeoLocationCoord,
  dest: GeoLocationCoord
): Promise<RealRoadRouteResult> {
  const apiKey = GOOGLE_MAPS_API_KEY;
  
  // Prefer server proxy /api/google-routes in Vite to bypass browser CORS; fallback to direct
  const endpoint = '/api/google-routes/directions/v2:computeRoutes';

  const reqBody = {
    origin: {
      location: {
        latLng: {
          latitude: origin.lat,
          longitude: origin.lng
        }
      }
    },
    destination: {
      location: {
        latLng: {
          latitude: dest.lat,
          longitude: dest.lng
        }
      }
    },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    computeAlternativeRoutes: false,
    routeModifiers: {
      avoidTolls: false,
      avoidHighways: false,
      avoidFerries: true
    },
    languageCode: 'en-US',
    units: 'METRIC',
    internalUsageAttributionIds: [
      'gmp_mcp_codeassist_v1_aistudio'
    ]
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.description,routes.legs',
      'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio'
    },
    body: JSON.stringify(reqBody)
  });

  if (!response.ok) {
    if (response.status === 429) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
    throw new Error(`Google Maps Routes API error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.routes || data.routes.length === 0) {
    throw new Error('Google Maps Routes API returned no routes');
  }

  const primaryRoute = data.routes[0];
  const encodedPolyline = primaryRoute.polyline?.encodedPolyline || '';
  const coordinates = encodedPolyline ? decodeGooglePolyline(encodedPolyline) : [];

  const rawDistMeters = primaryRoute.distanceMeters || 0;
  // duration is in format "345s"
  const durationStr = primaryRoute.duration || '0s';
  const rawDurationSec = parseInt(durationStr.replace('s', ''), 10) || 0;

  const distanceKm = +(rawDistMeters / 1000).toFixed(1);
  const durationMin = Math.max(2, Math.round(rawDurationSec / 60));

  const steps: RouteStepInfo[] = [];
  if (primaryRoute.legs?.[0]?.steps) {
    for (const st of primaryRoute.legs[0].steps) {
      steps.push({
        instruction: st.navigationInstruction?.instructions || 'Proceed along highway route',
        distanceMeters: st.distanceMeters || 0,
        durationSeconds: parseInt((st.staticDuration || '0s').replace('s', ''), 10) || 0
      });
    }
  }

  const canvasPoints = mapGeoCoordsToCanvas(coordinates);
  const pathD = buildSvgPathD(canvasPoints);

  return {
    engine: 'GOOGLE_MAPS_ROUTES_API',
    distanceKm,
    durationMin,
    coordinates,
    canvasPoints,
    pathD,
    steps,
    encodedPolyline,
    summary: primaryRoute.description || `${origin.name} ➔ ${dest.name}`,
    isRealRoadEngine: true,
    rawDistanceMeters: rawDistMeters,
    rawDurationSeconds: rawDurationSec
  };
}

/**
 * Universal Real Road Router:
 * Fetches real road route from specified engine (or tries Google Maps Routes API first, falling back to OSRM)
 */
export async function getRealRoadRoute(
  pickupAddress: string,
  dropAddress: string,
  preferredEngine: RoutingEngineType = 'GOOGLE_MAPS_ROUTES_API',
  pickupCoordinates?: Pick<GeoLocationCoord, 'lat' | 'lng'>,
  dropCoordinates?: Pick<GeoLocationCoord, 'lat' | 'lng'>
): Promise<RealRoadRouteResult> {
  const origin = pickupCoordinates
    ? { ...pickupCoordinates, name: pickupAddress }
    : resolveAddressToGeoCoord(pickupAddress);
  const dest = dropCoordinates
    ? { ...dropCoordinates, name: dropAddress }
    : resolveAddressToGeoCoord(dropAddress);

  if (preferredEngine === 'GOOGLE_MAPS_ROUTES_API') {
    try {
      const gmpRoute = await fetchGoogleMapsRoutesApi(origin, dest);
      return gmpRoute;
    } catch (err) {
      console.warn('Google Maps Routes API fallback to OSRM:', err);
      // Fallback seamlessly to OSRM
      return await fetchOsrmRoadRoute(origin, dest);
    }
  }

  // Otherwise prefer OSRM directly
  try {
    return await fetchOsrmRoadRoute(origin, dest);
  } catch (err) {
    console.warn('OSRM error, attempting Google Maps Routes API:', err);
    return await fetchGoogleMapsRoutesApi(origin, dest);
  }
}
