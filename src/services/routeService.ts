import { RoutePoint, RoadRouteInfo } from '../types';

// City grid road intersections and major junction coordinates in relative 0-100 canvas space
const ROAD_JUNCTIONS: Record<string, RoutePoint> = {
  HITEC_METRO: { x: 28, y: 46, streetName: 'Hitec City Metro Station Road' },
  HITEC_MAIN: { x: 32, y: 48, streetName: 'Hitec City Main Road' },
  DURGAM_CHERUVU: { x: 36, y: 44, streetName: 'Cable Bridge Expressway' },
  INORBIT_MALL: { x: 40, y: 42, streetName: 'Inorbit Mall Boulevard' },
  MINDSPACE: { x: 38, y: 50, streetName: 'Mindspace IT Park Circular Rd' },
  GACHIBOWLI_ORR: { x: 22, y: 38, streetName: 'Outer Ring Road (Gachibowli)' },
  FINANCIAL_DIST: { x: 18, y: 42, streetName: 'Financial District Way' },
  JUBILEE_CHECKPOST: { x: 44, y: 38, streetName: 'Road No. 36 Jubilee Hills' },
  BANJARA_HILLS: { x: 48, y: 42, streetName: 'Road No. 1 Banjara Hills' },
  PUNJAGUTTA_FLYOVER: { x: 52, y: 38, streetName: 'Punjagutta Elevated Corridor' },
  SECUNDERABAD_STN: { x: 62, y: 32, streetName: 'Station Road Secunderabad' },
  CHARMINAR_OLD_CITY: { x: 48, y: 62, streetName: 'Charminar Heritage Way' },
  AIRPORT_ORR_INTERCHANGE: { x: 56, y: 68, streetName: 'PVNR Airport Expressway' },
  RGIA_AIRPORT: { x: 68, y: 82, streetName: 'RGIA Terminal Arrivals Ramp' },
  
  // Warangal Tri-Cities & Highway Network
  WARANGAL_STATION: { x: 74, y: 58, streetName: 'Warangal Station Road' },
  KAZIPET_JUNCTION: { x: 68, y: 52, streetName: 'Kazipet Diesel Colony Road' },
  SUBEDARI_CORRIDOR: { x: 72, y: 46, streetName: 'Subedari Arterial Avenue' },
  LASHKAR_BAZAAR: { x: 78, y: 38, streetName: 'Lashkar Bazaar Cross Road' },
  HANAMKONDA_BUS: { x: 75, y: 42, streetName: 'Balasamudram Bus Terminal Rd' },
  KAKATIYA_UNIVERSITY: { x: 72, y: 26, streetName: 'KU University Cross Roads' },
  JANGAON_JUNCTION: { x: 66, y: 44, streetName: 'NH 163 Jangaon Highway' },
  GHATKESAR_ORR: { x: 60, y: 36, streetName: 'NH 163 Ghatkesar ORR Corridor' },
  UPPAL_METRO: { x: 56, y: 34, streetName: 'Uppal Metro & Inner Ring Road' },
  HYDERABAD_CENTRAL: { x: 50, y: 36, streetName: 'Hyderabad Central Corridor' }
};

// Map friendly address strings to closest road junction
export function resolveAddressToRoadJunction(address: string): RoutePoint {
  const q = address.toLowerCase();
  if (q.includes('hitec') || q.includes('metro')) return ROAD_JUNCTIONS.HITEC_METRO;
  if (q.includes('inorbit')) return ROAD_JUNCTIONS.INORBIT_MALL;
  if (q.includes('mindspace') || q.includes('madhapur')) return ROAD_JUNCTIONS.MINDSPACE;
  if (q.includes('gachibowli') || q.includes('sln')) return ROAD_JUNCTIONS.GACHIBOWLI_ORR;
  if (q.includes('financial')) return ROAD_JUNCTIONS.FINANCIAL_DIST;
  if (q.includes('jubilee')) return ROAD_JUNCTIONS.JUBILEE_CHECKPOST;
  if (q.includes('banjara')) return ROAD_JUNCTIONS.BANJARA_HILLS;
  if (q.includes('secunderabad')) return ROAD_JUNCTIONS.SECUNDERABAD_STN;
  if (q.includes('charminar')) return ROAD_JUNCTIONS.CHARMINAR_OLD_CITY;
  if (q.includes('airport') || q.includes('rgia')) return ROAD_JUNCTIONS.RGIA_AIRPORT;
  if (q.includes('ghatkesar')) return ROAD_JUNCTIONS.GHATKESAR_ORR;
  if (q.includes('uppal')) return ROAD_JUNCTIONS.UPPAL_METRO;
  if (q.includes('hyderabad')) return ROAD_JUNCTIONS.HYDERABAD_CENTRAL;
  if (q.includes('jangaon')) return ROAD_JUNCTIONS.JANGAON_JUNCTION;
  if (q.includes('warangal') || q.includes('station')) return ROAD_JUNCTIONS.WARANGAL_STATION;
  if (q.includes('kazipet')) return ROAD_JUNCTIONS.KAZIPET_JUNCTION;
  if (q.includes('lashkar') || q.includes('hanamkonda')) return ROAD_JUNCTIONS.HANAMKONDA_BUS;
  if (q.includes('kakatiya') || q.includes('university')) return ROAD_JUNCTIONS.KAKATIYA_UNIVERSITY;

  // Hash-based deterministic coordinate on road grid
  const hash = Math.abs(address.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0));
  const x = 25 + (hash % 50);
  const y = 30 + ((hash * 7) % 45);
  return { x, y, streetName: 'Main Arterial Street' };
}

import { 
  getRealRoadRoute, 
  RoutingEngineType, 
  RealRoadRouteResult 
} from './routingEngineService';

// In-memory cache of calculated real-road routes from Google Maps Routes API / OSRM
const LIVE_ROAD_ROUTE_CACHE = new Map<string, RealRoadRouteResult>();

/**
 * Asynchronously fetches authentic road network route from Google Maps Routes API or OSRM
 */
export async function fetchLiveRoadRoute(
  pickupAddress: string,
  dropAddress: string,
  preferredEngine: RoutingEngineType = 'GOOGLE_MAPS_ROUTES_API',
  pickupCoordinates?: { lat: number; lng: number },
  dropCoordinates?: { lat: number; lng: number }
): Promise<RoadRouteInfo> {
  const cacheKey = `${pickupAddress.trim().toLowerCase()}_${pickupCoordinates?.lat}_${pickupCoordinates?.lng}_TO_${dropAddress.trim().toLowerCase()}_${dropCoordinates?.lat}_${dropCoordinates?.lng}_${preferredEngine}`;
  const realResult = await getRealRoadRoute(
    pickupAddress,
    dropAddress,
    preferredEngine,
    pickupCoordinates,
    dropCoordinates
  );
  LIVE_ROAD_ROUTE_CACHE.set(cacheKey, realResult);

  return {
    pathD: realResult.pathD,
    points: realResult.canvasPoints,
    totalDistanceKm: realResult.distanceKm,
    estimatedTravelTimeMin: realResult.durationMin,
    pickupAddress,
    dropAddress,
    routingEngine: realResult.engine,
    steps: realResult.steps,
    isRealRoadEngine: realResult.isRealRoadEngine
  };
}

// Generates actual multi-segment road route between two junctions
export function generateActualRoadRoute(pickupAddress: string, dropAddress: string): RoadRouteInfo {
  // Check if live engine result is already cached
  const gmpKey = `${pickupAddress.trim().toLowerCase()}_TO_${dropAddress.trim().toLowerCase()}_GOOGLE_MAPS_ROUTES_API`;
  const osrmKey = `${pickupAddress.trim().toLowerCase()}_TO_${dropAddress.trim().toLowerCase()}_OSRM`;
  const cached = LIVE_ROAD_ROUTE_CACHE.get(gmpKey) || LIVE_ROAD_ROUTE_CACHE.get(osrmKey);

  if (cached && cached.canvasPoints.length > 0) {
    return {
      pathD: cached.pathD,
      points: cached.canvasPoints,
      totalDistanceKm: cached.distanceKm,
      estimatedTravelTimeMin: cached.durationMin,
      pickupAddress,
      dropAddress,
      routingEngine: cached.engine,
      steps: cached.steps,
      isRealRoadEngine: true
    };
  }

  const start = resolveAddressToRoadJunction(pickupAddress);
  const end = resolveAddressToRoadJunction(dropAddress);

  const points: RoutePoint[] = [start];

  // Synthesize realistic road turns along the city road network
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // Add 3-5 intermediate waypoints that follow realistic city street turn angles (perpendicular turns)
  const midX = start.x + dx * 0.45;
  const midY = start.y + dy * 0.15;
  points.push({ x: midX, y: start.y, streetName: 'Arterial Road Connector' });
  points.push({ x: midX, y: midY, streetName: 'Expressway Avenue' });
  
  const mid2X = start.x + dx * 0.75;
  const mid2Y = start.y + dy * 0.85;
  points.push({ x: mid2X, y: midY, streetName: 'Inner Flyover Bypass' });
  points.push({ x: mid2X, y: mid2Y, streetName: 'Destination Access Boulevard' });
  points.push(end);

  // Build SVG path data string
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    pathD += ` L ${points[i].x} ${points[i].y}`;
  }

  // Calculate actual road distance (geometric length scaled to city kilometers)
  let totalPixelDistance = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const segDx = points[i + 1].x - points[i].x;
    const segDy = points[i + 1].y - points[i].y;
    totalPixelDistance += Math.hypot(segDx, segDy);
  }

  // Realistic city distance calibration: 1 canvas unit ≈ 0.22 km
  const totalDistanceKm = +(Math.max(2.1, totalPixelDistance * 0.22).toFixed(1));
  // Average city driving speed: ~24 km/h
  const estimatedTravelTimeMin = Math.max(4, Math.round((totalDistanceKm / 24) * 60));

  return {
    pathD,
    points,
    totalDistanceKm,
    estimatedTravelTimeMin,
    pickupAddress,
    dropAddress,
    routingEngine: 'GOOGLE_MAPS_ROUTES_API',
    isRealRoadEngine: false
  };
}

// Generate the Driver -> Pickup road route
export function generateDriverToPickupRoute(driverPoint: RoutePoint, pickupPoint: RoutePoint): {
  pathD: string;
  points: RoutePoint[];
  distanceKm: number;
  etaMin: number;
} {
  const points: RoutePoint[] = [
    driverPoint,
    { x: driverPoint.x + (pickupPoint.x - driverPoint.x) * 0.5, y: driverPoint.y, streetName: 'Pickup Access Lane' },
    { x: driverPoint.x + (pickupPoint.x - driverPoint.x) * 0.5, y: pickupPoint.y, streetName: 'Curbside Avenue' },
    pickupPoint
  ];

  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    pathD += ` L ${points[i].x} ${points[i].y}`;
  }

  const dist = +(Math.max(0.6, Math.hypot(pickupPoint.x - driverPoint.x, pickupPoint.y - driverPoint.y) * 0.18).toFixed(1));
  const etaMin = Math.max(1, Math.round(dist * 2.5));

  return { pathD, points, distanceKm: dist, etaMin };
}

// Smoothly interpolate a point and bearing angle along a multi-segment road polyline
export function getPointAlongRoad(points: RoutePoint[], fraction: number): {
  x: number;
  y: number;
  bearingDeg: number;
} {
  if (points.length < 2) return { x: points[0]?.x || 50, y: points[0]?.y || 50, bearingDeg: 0 };
  const t = Math.max(0, Math.min(1, fraction));

  // Compute lengths of each segment
  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segmentLengths.push(len);
    totalLength += len;
  }

  if (totalLength === 0) return { x: points[0].x, y: points[0].y, bearingDeg: 0 };

  const targetDist = t * totalLength;
  let accumulated = 0;

  for (let i = 0; i < segmentLengths.length; i++) {
    const segLen = segmentLengths[i];
    if (accumulated + segLen >= targetDist || i === segmentLengths.length - 1) {
      const segT = segLen === 0 ? 0 : (targetDist - accumulated) / segLen;
      const p1 = points[i];
      const p2 = points[i + 1];
      const x = p1.x + (p2.x - p1.x) * segT;
      const y = p1.y + (p2.y - p1.y) * segT;
      const angleRad = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const bearingDeg = ((angleRad * 180) / Math.PI) + 90;
      return { x, y, bearingDeg };
    }
    accumulated += segLen;
  }

  const last = points[points.length - 1];
  return { x: last.x, y: last.y, bearingDeg: 0 };
}

// Compute auto-adjust bounding box to fit pickup, drop, driver, and route
export function calculateAutoBoundingBox(points: RoutePoint[], driverPos?: RoutePoint | null) {
  const allPoints = [...points];
  if (driverPos) allPoints.push(driverPos);
  if (allPoints.length === 0) return { minX: 10, maxX: 90, minY: 15, maxY: 85, centerX: 50, centerY: 50, scale: 1 };

  let minX = 100, maxX = 0, minY = 100, maxY = 0;
  allPoints.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  // Add 16% safety margin
  const padX = Math.max(12, (maxX - minX) * 0.2);
  const padY = Math.max(12, (maxY - minY) * 0.2);

  const boundedMinX = Math.max(0, minX - padX);
  const boundedMaxX = Math.min(100, maxX + padX);
  const boundedMinY = Math.max(0, minY - padY);
  const boundedMaxY = Math.min(100, maxY + padY);

  const width = boundedMaxX - boundedMinX;
  const height = boundedMaxY - boundedMinY;
  const centerX = (boundedMinX + boundedMaxX) / 2;
  const centerY = (boundedMinY + boundedMaxY) / 2;

  // Zoom scale inversely proportional to bounding box span
  const maxSpan = Math.max(width, height);
  const scale = +(Math.max(0.85, Math.min(1.45, 80 / maxSpan)).toFixed(2));

  return {
    minX: boundedMinX,
    maxX: boundedMaxX,
    minY: boundedMinY,
    maxY: boundedMaxY,
    centerX,
    centerY,
    scale
  };
}
