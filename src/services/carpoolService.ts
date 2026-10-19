import { RoutePoint } from '../types';

/**
 * Geometric helper: Distance from a point P to a line segment AB.
 * Returns { distanceUnits, projectionPoint, projectionFraction }
 */
export function pointToSegmentDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): { distance: number; projection: { x: number; y: number }; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const dist = Math.hypot(p.x - a.x, p.y - a.y);
    return { distance: dist, projection: { x: a.x, y: a.y }, t: 0 };
  }

  // Projection scalar t: dot product / lenSq
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  const distance = Math.hypot(p.x - projX, p.y - projY);

  return { distance, projection: { x: projX, y: projY }, t };
}

/**
 * 1. ROUTE INTERPOLATION (The "On-Route" Check)
 * Calculates the perpendicular distance from passenger location to the driver's route polyline.
 * In our calibrated canvas space (1 canvas unit ≈ 0.22 km = 220m),
 * 500 meters is approximately 2.27 canvas units (0.50 km / 0.22 km).
 */
export function calculatePassengerOnRoute(
  passengerPos: { x: number; y: number },
  polylinePoints: RoutePoint[],
  maxToleranceMeters: number = 500
): {
  isOnRoute: boolean;
  distanceFromHighwayMeters: number;
  closestPoint: { x: number; y: number };
  segmentIndex: number;
  routeProgressFraction: number; // 0 to 1 along the entire driver route
} {
  if (polylinePoints.length < 2) {
    return {
      isOnRoute: false,
      distanceFromHighwayMeters: 9999,
      closestPoint: { x: 0, y: 0 },
      segmentIndex: 0,
      routeProgressFraction: 0
    };
  }

  // Precompute segment lengths and total length
  const segLengths: number[] = [];
  let totalLength = 0;
  for (let i = 0; i < polylinePoints.length - 1; i++) {
    const len = Math.hypot(
      polylinePoints[i + 1].x - polylinePoints[i].x,
      polylinePoints[i + 1].y - polylinePoints[i].y
    );
    segLengths.push(len);
    totalLength += len;
  }

  let minDistanceCanvasUnits = Infinity;
  let bestProjection = { x: polylinePoints[0].x, y: polylinePoints[0].y };
  let bestSegIndex = 0;
  let bestDistAlongRoute = 0;

  let currentDistAccum = 0;
  for (let i = 0; i < polylinePoints.length - 1; i++) {
    const a = polylinePoints[i];
    const b = polylinePoints[i + 1];
    const { distance, projection, t } = pointToSegmentDistance(passengerPos, a, b);

    if (distance < minDistanceCanvasUnits) {
      minDistanceCanvasUnits = distance;
      bestProjection = projection;
      bestSegIndex = i;
      bestDistAlongRoute = currentDistAccum + t * segLengths[i];
    }
    currentDistAccum += segLengths[i];
  }

  // 1 canvas unit = 220 meters
  const distanceFromHighwayMeters = Math.round(minDistanceCanvasUnits * 220);
  const isOnRoute = distanceFromHighwayMeters <= maxToleranceMeters;
  const routeProgressFraction = totalLength > 0 ? bestDistAlongRoute / totalLength : 0;

  return {
    isOnRoute,
    distanceFromHighwayMeters,
    closestPoint: bestProjection,
    segmentIndex: bestSegIndex,
    routeProgressFraction
  };
}

/**
 * 3. DIRECTIONAL FILTERING (The "Passed-Point" Edge Case)
 * Calculates the driver's bearing against the passenger's location.
 * Computes:
 * - Direct distance to passenger in km.
 * - Angle between driver's velocity heading vector and vector towards passenger.
 * - If angle > 90° (dot product < 0), the driver is moving away / has passed the passenger.
 * - Drop condition: if driver has already passed (moving away), drop immediately even if inside 5km!
 */
export function calculateDirectionalPassedPoint(
  driverPos: { x: number; y: number },
  driverHeadingDeg: number,
  passengerPos: { x: number; y: number },
  cutoffRadiusKm: number = 5.0
): {
  distanceKm: number;
  relativeBearingDeg: number;
  isMovingTowardsPassenger: boolean;
  hasPassedPassenger: boolean;
  isEligibleBeforeCutoff: boolean;
  dropReason?: string;
} {
  // Distance in canvas units: 1 unit ≈ 0.22 km
  const canvasDist = Math.hypot(passengerPos.x - driverPos.x, passengerPos.y - driverPos.y);
  const distanceKm = +(canvasDist * 0.22).toFixed(2);

  // Vector from driver to passenger
  const toPassX = passengerPos.x - driverPos.x;
  const toPassY = passengerPos.y - driverPos.y;

  // Driver heading angle converted to radians
  const headingRad = (driverHeadingDeg * Math.PI) / 180;
  // In screen SVG coords (Y is down): dx = sin(heading), dy = -cos(heading)
  const dirX = Math.sin(headingRad);
  const dirY = -Math.cos(headingRad);

  // Vector normalization
  const passVecLen = Math.hypot(toPassX, toPassY);
  let dot = 0;
  if (passVecLen > 0) {
    dot = (dirX * (toPassX / passVecLen)) + (dirY * (toPassY / passVecLen));
  }

  // Dot product > 0 means within ±90 degrees in front of vehicle (moving towards)
  // Dot product <= 0 means behind the vehicle (has passed / moving away)
  const isMovingTowardsPassenger = dot > 0.05;
  const hasPassedPassenger = dot <= 0.05 && distanceKm > 0.15;

  let isEligible = true;
  let dropReason: string | undefined;

  if (distanceKm > cutoffRadiusKm) {
    isEligible = false;
    dropReason = `Beyond ${cutoffRadiusKm}km coverage radius (${distanceKm}km away)`;
  } else if (hasPassedPassenger) {
    isEligible = false;
    dropReason = `Driver has passed pickup point (bearing away by ${Math.round(Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI)}°)`;
  }

  return {
    distanceKm,
    relativeBearingDeg: Math.round(Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI),
    isMovingTowardsPassenger,
    hasPassedPassenger,
    isEligibleBeforeCutoff: isEligible,
    dropReason
  };
}

/**
 * 2. THROTTLED LOCATION TELEMETRY
 * Tracks client-side updates: pushes new location only if moved >= minDistanceMeters
 * OR elapsed >= maxIntervalMs.
 */
export interface TelemetryThrottleState {
  lastPushedPos: { x: number; y: number } | null;
  lastPushedTime: number;
  totalPushesSaved: number;
  totalWritesSent: number;
}

export function evaluateLocationThrottle(
  currentPos: { x: number; y: number },
  currentTime: number,
  state: TelemetryThrottleState,
  minDistanceMeters: number = 50,
  maxIntervalMs: number = 10000
): {
  shouldPush: boolean;
  distanceMovedMeters: number;
  elapsedMs: number;
  reason: 'DISTANCE' | 'TIME_ELAPSED' | 'INITIAL' | 'THROTTLED';
} {
  if (!state.lastPushedPos) {
    return {
      shouldPush: true,
      distanceMovedMeters: 0,
      elapsedMs: 0,
      reason: 'INITIAL'
    };
  }

  const canvasDist = Math.hypot(
    currentPos.x - state.lastPushedPos.x,
    currentPos.y - state.lastPushedPos.y
  );
  const distanceMovedMeters = Math.round(canvasDist * 220);
  const elapsedMs = currentTime - state.lastPushedTime;

  if (distanceMovedMeters >= minDistanceMeters) {
    return {
      shouldPush: true,
      distanceMovedMeters,
      elapsedMs,
      reason: 'DISTANCE'
    };
  }

  if (elapsedMs >= maxIntervalMs) {
    return {
      shouldPush: true,
      distanceMovedMeters,
      elapsedMs,
      reason: 'TIME_ELAPSED'
    };
  }

  return {
    shouldPush: false,
    distanceMovedMeters,
    elapsedMs,
    reason: 'THROTTLED'
  };
}

/**
 * 4. DYNAMIC SEAT CAPACITY MANAGEMENT ALONG ROUTE SEGMENTS
 * Represents discrete segments of the driver's journey (e.g., stops A -> B -> C -> D).
 * Seat bookings consume capacity only on overlapping segments!
 */
export interface CarpoolRouteStop {
  id: string;
  name: string;
  order: number;
  location: { x: number; y: number };
  eta: string;
}

export interface SegmentSeatOccupancy {
  fromStopId: string;
  toStopId: string;
  fromStopName: string;
  toStopName: string;
  totalSeats: number;
  bookedSeats: number;
  availableSeats: number;
  passengerNames: string[];
}

export interface CarpoolSegmentBooking {
  bookingId: string;
  passengerName: string;
  fromStopId: string;
  toStopId: string;
  seatsCount: number;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  bookedAt: string;
}

export function calculateSegmentSeatCapacities(
  stops: CarpoolRouteStop[],
  totalVehicleSeats: number,
  bookings: CarpoolSegmentBooking[]
): SegmentSeatOccupancy[] {
  const sortedStops = [...stops].sort((a, b) => a.order - b.order);
  const segments: SegmentSeatOccupancy[] = [];

  for (let i = 0; i < sortedStops.length - 1; i++) {
    const fromStop = sortedStops[i];
    const toStop = sortedStops[i + 1];

    // Find all active bookings that traverse this specific segment (from <= i and to >= i + 1)
    const overlappingBookings = bookings.filter(b => {
      if (b.status !== 'ACTIVE') return false;
      const bFromIdx = sortedStops.findIndex(s => s.id === b.fromStopId);
      const bToIdx = sortedStops.findIndex(s => s.id === b.toStopId);
      return bFromIdx <= i && bToIdx >= i + 1;
    });

    const bookedSeats = overlappingBookings.reduce((sum, b) => sum + b.seatsCount, 0);
    const availableSeats = Math.max(0, totalVehicleSeats - bookedSeats);
    const passengerNames = overlappingBookings.map(b => `${b.passengerName} (${b.seatsCount} seat${b.seatsCount > 1 ? 's' : ''})`);

    segments.push({
      fromStopId: fromStop.id,
      toStopId: toStop.id,
      fromStopName: fromStop.name,
      toStopName: toStop.name,
      totalSeats: totalVehicleSeats,
      bookedSeats,
      availableSeats,
      passengerNames
    });
  }

  return segments;
}

/**
 * Checks if a requested seat booking is valid for all segments between start and end stop
 */
export function canBookSeatsForSubTrip(
  fromStopId: string,
  toStopId: string,
  requestedSeats: number,
  stops: CarpoolRouteStop[],
  segments: SegmentSeatOccupancy[]
): {
  canBook: boolean;
  minAvailableSeatsAcrossTrip: number;
  bottleneckSegment?: SegmentSeatOccupancy;
} {
  const sortedStops = [...stops].sort((a, b) => a.order - b.order);
  const fromIdx = sortedStops.findIndex(s => s.id === fromStopId);
  const toIdx = sortedStops.findIndex(s => s.id === toStopId);

  if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) {
    return { canBook: false, minAvailableSeatsAcrossTrip: 0 };
  }

  // Check segments between fromIdx and toIdx
  let minAvail = Infinity;
  let bottleneck: SegmentSeatOccupancy | undefined;

  for (let i = fromIdx; i < toIdx; i++) {
    const seg = segments[i];
    if (seg.availableSeats < minAvail) {
      minAvail = seg.availableSeats;
      bottleneck = seg;
    }
  }

  return {
    canBook: minAvail >= requestedSeats,
    minAvailableSeatsAcrossTrip: minAvail === Infinity ? 0 : minAvail,
    bottleneckSegment: bottleneck
  };
}

/**
 * 5. SMART ROUTE MATCHING & FLEXIBLE PICKUP / DROP ENGINE
 * 
 * Compares passenger pickup & destination against driver's corridor stops and polyline:
 * - Direct route match: Driver's route reaches your destination.
 * - Connected route match: Driver passes through a suitable point near your destination.
 * - Partial journey: Travel part of the way and select an intermediate drop-off.
 */
export type RouteMatchType = 'DIRECT' | 'CONNECTED' | 'PARTIAL' | 'NO_MATCH';

export interface VerifiedTransferConnection {
  transferHubId: string;
  transferHubName: string;
  destinationMatch: string;
  transitMode: 'METRO' | 'AIRPORT_EXPRESS' | 'ORR_SHUTTLE' | 'INTERCITY_BUS';
  connectionName: string;
  transferDurationMin: number;
  totalTripEstimatedMin: number;
  instructions: string;
}

export interface CarpoolRouteStop {
  id: string;
  name: string;
  order: number;
  location: { x: number; y: number };
  eta: string;
  distanceFromOriginKm?: number;
  isLegallyApprovedStop?: boolean;
  legalStopType?: string; // 'Designated Bus Bay' | 'Metro Kiss-and-Ride' | 'Highway Toll Transit Stop' | 'Airport Commercial Drop'
  legalStopNotes?: string;
}

// Master registry of verified transfer points and their transit connections
export const ROUTE_MATCHING_SCENARIOS_META: Record<MatchingScenarioCode, {
  name: string;
  title: string;
  shortTag: string;
  condition: string;
  passengerFlow: string;
  systemAction: string;
  badgeStyle: {
    bg: string;
    text: string;
    border: string;
    pillBg: string;
    pillText: string;
  };
}> = {
  S1: {
    name: 'Scenario 1: Exact Origin Match',
    title: 'Exact Origin Match (High Priority)',
    shortTag: 'Zero Deadhead',
    condition: "The Driver's starting point is identical to the Passenger's pickup location.",
    passengerFlow: "The Passenger boards at the very beginning of the Driver's journey.",
    systemAction: "Flag this as a high-priority match since it requires zero deviation or deadhead miles for the Driver to reach the pickup point.",
    badgeStyle: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-900',
      border: 'border-emerald-300',
      pillBg: 'bg-emerald-600',
      pillText: 'text-white'
    }
  },
  S2: {
    name: 'Scenario 2: En-Route Pickup & Drop-off Match',
    title: 'En-Route Pickup & Drop-off Match',
    shortTag: 'Mid-Route Pickup',
    condition: "The Driver starts at a different location, but their active route passes directly through both the Passenger's requested pickup point and destination.",
    passengerFlow: "The Passenger boards mid-route and alights mid-route or at the final destination.",
    systemAction: "Calculate the estimated time of arrival (ETA) for the Driver to reach the Passenger's mid-route pickup point and notify the Passenger to wait.",
    badgeStyle: {
      bg: 'bg-blue-50',
      text: 'text-blue-900',
      border: 'border-blue-300',
      pillBg: 'bg-blue-600',
      pillText: 'text-white'
    }
  },
  S4: {
    name: 'Scenario 4: Intermediate Stop as Destination',
    title: 'Intermediate Stop as Destination',
    shortTag: 'Alight Early • Seat Freed',
    condition: "The Driver's final destination is further along, but the Passenger's destination perfectly matches one of the Driver's pre-added intermediate stops.",
    passengerFlow: "The Passenger books the ride, boards at the pickup point, and alights early at their designated intermediate stop while the Driver continues the journey.",
    systemAction: "System confirms the match, sets the Passenger's drop-off pin to the selected intermediate stop, and frees up that seat/capacity for the remainder of the Driver's trip.",
    badgeStyle: {
      bg: 'bg-teal-50',
      text: 'text-teal-900',
      border: 'border-teal-300',
      pillBg: 'bg-teal-600',
      pillText: 'text-white'
    }
  },
  S5: {
    name: 'Scenario 5: Partial Route Ride (Best Alternative Stop)',
    title: 'Partial Route Ride (Best Alternative Stop)',
    shortTag: '0 km Driver Deviation',
    condition: "The Passenger's true destination is not strictly on the Driver's route. However, the Passenger chooses to book a ride to one of the Driver's existing intermediate stops because it gets them closer to their final destination.",
    passengerFlow: "The Passenger reviews the Driver's visible stops, selects the one geographically closest to their true destination, and completes the 'last mile' independently after drop-off.",
    systemAction: "The system treats the selected intermediate stop as the official drop-off location. Fare and navigation are calculated strictly up to that selected stop, with no route deviation required from the Driver.",
    badgeStyle: {
      bg: 'bg-amber-50',
      text: 'text-amber-900',
      border: 'border-amber-300',
      pillBg: 'bg-amber-600',
      pillText: 'text-white'
    }
  },
  NONE: {
    name: 'No Route Match',
    title: 'No Route Match',
    shortTag: 'Separate Corridor',
    condition: 'No suitable route point or valid corridor connection exists between driver trajectory and requested passenger trip.',
    passengerFlow: 'Passenger requested trip does not intersect the driver corridor.',
    systemAction: 'Unmatched. Vehicle travels along separate non-connecting highway.',
    badgeStyle: {
      bg: 'bg-rose-50',
      text: 'text-rose-800',
      border: 'border-rose-300',
      pillBg: 'bg-rose-600',
      pillText: 'text-white'
    }
  }
};

// Master registry of verified transfer points and their transit connections
export const VERIFIED_TRANSFER_HUBS: Record<string, VerifiedTransferConnection[]> = {
  'Uppal Metro Hub': [
    {
      transferHubId: 'hub-uppal-mindspace',
      transferHubName: 'Uppal Metro Hub',
      destinationMatch: 'mindspace',
      transitMode: 'METRO',
      connectionName: 'Hyderabad Metro (Blue Line)',
      transferDurationMin: 24,
      totalTripEstimatedMin: 90,
      instructions: 'Step off at Uppal Metro dedicated Kiss-and-Ride bay. Board Hyderabad Metro Blue Line directly to Mindspace / Raidurg (trains every 4 mins).'
    },
    {
      transferHubId: 'hub-uppal-hitec',
      transferHubName: 'Uppal Metro Hub',
      destinationMatch: 'hitec',
      transitMode: 'METRO',
      connectionName: 'Hyderabad Metro (Blue Line)',
      transferDurationMin: 22,
      totalTripEstimatedMin: 88,
      instructions: 'Transfer to Blue Line Metro towards Hitec City. Fast direct elevated rail avoiding city traffic.'
    },
    {
      transferHubId: 'hub-uppal-airport',
      transferHubName: 'Uppal Metro Hub',
      destinationMatch: 'airport',
      transitMode: 'AIRPORT_EXPRESS',
      connectionName: 'Pushpak Airport Liner (AC-12)',
      transferDurationMin: 45,
      totalTripEstimatedMin: 110,
      instructions: 'Transfer at Uppal Ring Road Pushpak AC Express Coach directly to RGIA Airport Terminal via Outer Ring Road.'
    },
    {
      transferHubId: 'hub-uppal-secunderabad',
      transferHubName: 'Uppal Metro Hub',
      destinationMatch: 'secunderabad',
      transitMode: 'METRO',
      connectionName: 'Hyderabad Metro Line 3 / City Bus 18',
      transferDurationMin: 15,
      totalTripEstimatedMin: 80,
      instructions: 'Transfer at Uppal Metro cross-terminal to Secunderabad Rail Terminal.'
    }
  ],
  'Secunderabad Stn': [
    {
      transferHubId: 'hub-secunderabad-airport',
      transferHubName: 'Secunderabad Stn',
      destinationMatch: 'airport',
      transitMode: 'AIRPORT_EXPRESS',
      connectionName: 'Pushpak AC Airport Express (Direct)',
      transferDurationMin: 38,
      totalTripEstimatedMin: 78,
      instructions: 'Alight at Secunderabad Railway West Gate. Board direct Pushpak AC Express every 15 mins to RGIA Airport Departures.'
    },
    {
      transferHubId: 'hub-secunderabad-mindspace',
      transferHubName: 'Secunderabad Stn',
      destinationMatch: 'mindspace',
      transitMode: 'METRO',
      connectionName: 'Parade Grounds Interchange to Blue Line',
      transferDurationMin: 20,
      totalTripEstimatedMin: 65,
      instructions: 'Step into Parade Grounds Metro interchange, board Blue Line direct to Mindspace IT Park.'
    }
  ],
  'Ghatkesar ORR Junction': [
    {
      transferHubId: 'hub-ghatkesar-airport',
      transferHubName: 'Ghatkesar ORR Junction',
      destinationMatch: 'airport',
      transitMode: 'ORR_SHUTTLE',
      connectionName: 'Nehru ORR Expressway Feeder',
      transferDurationMin: 32,
      totalTripEstimatedMin: 85,
      instructions: 'Alight at Ghatkesar Toll Plaza designated carpool bay. Take ORR Express Shuttle directly down expressway south to RGIA.'
    },
    {
      transferHubId: 'hub-ghatkesar-hyderabad',
      transferHubName: 'Ghatkesar ORR Junction',
      destinationMatch: 'hyderabad',
      transitMode: 'METRO',
      connectionName: 'Uppal Expressway Link & Metro',
      transferDurationMin: 22,
      totalTripEstimatedMin: 75,
      instructions: 'Take 12-min connecting electric shuttle to Uppal Metro Station into Hyderabad Core.'
    }
  ]
};

export type MatchingScenarioCode = 'S1' | 'S2' | 'S4' | 'S5' | 'NONE';

export interface MatchingScenarioDetails {
  scenarioCode: MatchingScenarioCode;
  scenarioName: string;
  scenarioTitle: string;
  conditionDescription: string;
  passengerFlow: string;
  systemAction: string;
  isHighPriorityZeroDeadhead?: boolean;
  midRoutePickupEtaMin?: number;
  lastMileDistanceKm?: number;
  freedUpDownstreamSeats?: number;
  pickupDoesNotMatchRiderDestination?: boolean;
  destinationMatchesRiderDestination?: boolean;
  badgeStyle: {
    bg: string;
    text: string;
    border: string;
    pillBg: string;
    pillText: string;
  };
}

export interface RouteMatchAnalysis {
  matchType: RouteMatchType;
  matchTitle: string;
  matchDescription: string;
  matchBadgeColor: {
    bg: string;
    text: string;
    border: string;
  };
  scenario: MatchingScenarioDetails;
  applicableScenarios: MatchingScenarioCode[];
  compatibilityScore: number; // 0 to 100%
  pickupStop: CarpoolRouteStop;
  pickupDistanceKm: number;
  dropoffStop: CarpoolRouteStop;
  dropoffDistanceKm: number;
  isPartialRoute: boolean;
  recommendedIntermediateDropoff?: CarpoolRouteStop;
  availableIntermediateDropoffs: CarpoolRouteStop[];
  estimatedArrivalMin: number;
  tripDistanceKm: number;
  calculatedFare: number;
  remainingSeats: number;
  availableSeats?: number;
  routeHighlights: string;
  verifiedTransfer?: VerifiedTransferConnection;
  isLegallyVerifiedStop: boolean;
  legalStopBadgeText: string;
  unmatchedReason?: string;
  pickupDoesNotMatchRiderDestination?: boolean;
  destinationMatchesRiderDestination?: boolean;
}

function getRouteStopDistancesKm(stops: CarpoolRouteStop[]): number[] {
  if (stops.every(stop => Number.isFinite(stop.distanceFromOriginKm))) {
    return stops.map(stop => stop.distanceFromOriginKm!);
  }

  const cumulativeCanvasDistances = [0];
  for (let index = 1; index < stops.length; index++) {
    const previous = stops[index - 1].location;
    const current = stops[index].location;
    cumulativeCanvasDistances.push(
      cumulativeCanvasDistances[index - 1] + Math.hypot(current.x - previous.x, current.y - previous.y)
    );
  }

  const totalCanvasDistance = cumulativeCanvasDistances[cumulativeCanvasDistances.length - 1] || 1;
  const estimatedRouteDistanceKm = stops[stops.length - 1]?.distanceFromOriginKm || 145;
  return cumulativeCanvasDistances.map(distance => +(distance / totalCanvasDistance * estimatedRouteDistanceKm).toFixed(1));
}

function getTripDistanceKm(
  stops: CarpoolRouteStop[],
  pickupStop: CarpoolRouteStop,
  dropoffStop: CarpoolRouteStop
): { tripDistanceKm: number; routeDistanceKm: number } {
  const distances = getRouteStopDistancesKm(stops);
  const pickupIndex = stops.findIndex(stop => stop.id === pickupStop.id);
  const dropoffIndex = stops.findIndex(stop => stop.id === dropoffStop.id);
  const routeDistanceKm = distances[distances.length - 1] || 145;
  const tripDistanceKm = pickupIndex >= 0 && dropoffIndex >= pickupIndex
    ? Math.max(0, distances[dropoffIndex] - distances[pickupIndex])
    : 0;

  return { tripDistanceKm, routeDistanceKm };
}

/**
 * Evaluates whether a destination address or junction connects via a verified transfer hub
 */
export function findTransferConnection(
  driverStops: CarpoolRouteStop[],
  destinationAddress: string
): { transferStop: CarpoolRouteStop; connection: VerifiedTransferConnection } | null {
  const destLower = destinationAddress.toLowerCase();
  
  for (const stop of driverStops) {
    const stopLower = stop.name.toLowerCase();
    let hubConnections: VerifiedTransferConnection[] | undefined = VERIFIED_TRANSFER_HUBS[stop.name];

    if (!hubConnections) {
      for (const [hubKey, conns] of Object.entries(VERIFIED_TRANSFER_HUBS)) {
        const hubKeyLower = hubKey.toLowerCase();
        if (
          stopLower.includes(hubKeyLower) || 
          hubKeyLower.includes(stopLower) ||
          (stopLower.includes('uppal') && hubKeyLower.includes('uppal')) ||
          (stopLower.includes('ghatkesar') && hubKeyLower.includes('ghatkesar')) ||
          (stopLower.includes('secunderabad') && hubKeyLower.includes('secunderabad'))
        ) {
          hubConnections = conns;
          break;
        }
      }
    }

    if (hubConnections) {
      for (const conn of hubConnections) {
        if (destLower.includes(conn.destinationMatch)) {
          return { transferStop: stop, connection: conn };
        }
      }
    }
  }

  return null;
}

export function matchDriverRouteToPassenger(
  driver: {
    id: string;
    driverName: string;
    from: string;
    to: string;
    basePricePerSeat: number;
    totalSeats: number;
    corridorStops: CarpoolRouteStop[];
    routePolyline: RoutePoint[];
  },
  passengerPickupPos: { x: number; y: number },
  passengerDestPos?: { x: number; y: number } | null,
  passengerDestAddress?: string,
  bookings: CarpoolSegmentBooking[] = [],
  passengerPickupAddress?: string
): RouteMatchAnalysis {
  const rawStops = driver.corridorStops || (driver as any).intermediateStops || (driver as any).stops || [];
  const sortedStops = [...rawStops]
    .map((s: any, idx: number) => ({ ...s, id: s.id || `stop-${s.order ?? idx}` }))
    .sort((a, b) => a.order - b.order);

  // 1. Calculate road geometry distance from passenger pickup to driver route
  let bestPickupStop = sortedStops[0];
  let minPickupDistCanvas = Infinity;

  sortedStops.forEach(stop => {
    const d = Math.hypot(stop.location.x - passengerPickupPos.x, stop.location.y - passengerPickupPos.y);
    if (d < minPickupDistCanvas) {
      minPickupDistCanvas = d;
      bestPickupStop = stop;
    }
  });

  const pickupDistanceKm = +(minPickupDistCanvas * 0.22).toFixed(1);

  // Candidate drop-off stops strictly after pickup stop
  const candidateDropStops = sortedStops.filter(s => s.order > bestPickupStop.order);
  const validStops = candidateDropStops.length > 0 ? candidateDropStops : [sortedStops[sortedStops.length - 1]];

  let bestDropoffStop = validStops[validStops.length - 1];
  let minDropDistCanvas = Infinity;

  if (passengerDestPos) {
    validStops.forEach(stop => {
      const d = Math.hypot(stop.location.x - passengerDestPos.x, stop.location.y - passengerDestPos.y);
      if (d < minDropDistCanvas) {
        minDropDistCanvas = d;
        bestDropoffStop = stop;
      }
    });
  } else {
    minDropDistCanvas = 0;
  }

  const dropoffDistanceKm = +(minDropDistCanvas * 0.22).toFixed(1);

  // Check road-route geometry distance from destination to driver's route polyline
  let destDistanceToPolylineMeters = 99999;
  if (passengerDestPos && driver.routePolyline.length > 1) {
    const polylineCheck = calculatePassengerOnRoute(passengerDestPos, driver.routePolyline, 3000);
    destDistanceToPolylineMeters = polylineCheck.distanceFromHighwayMeters;
  }

  // 2. Verified Transfer Point Lookup
  const destAddressClean = passengerDestAddress || '';
  const transferInfo = findTransferConnection(validStops, destAddressClean);

  // 3. Precise destination name match
  const destText = destAddressClean.toLowerCase().trim();
  const driverToText = driver.to.toLowerCase();
  const dropStopText = bestDropoffStop.name.toLowerCase();

  // Strict Direct Match Rules:
  // Must be an actual route point or approved stop within <= 1.5 km (or 1500m to road polyline).
  // "Do not mark a destination as direct merely because it is in the same city."
  const isDirectStopNameMatch = Boolean(
    destText &&
    (dropStopText.includes(destText) ||
     (driverToText.includes(destText) && dropoffDistanceKm <= 2.2))
  );

  const isGeometricallyAtDestination = dropoffDistanceKm <= 1.5 || destDistanceToPolylineMeters <= 1500;
  const isDirectMatch = Boolean(passengerDestPos && (isDirectStopNameMatch || isGeometricallyAtDestination));

  // Determine Directional / Coverage Validity
  // If pickup is too far away (> 7.5 km) with no corridor overlap, or driver has passed, mark as NO_MATCH
  const isPickupTooFar = pickupDistanceKm > 7.5;

  const terminalStop = sortedStops[sortedStops.length - 1];
  const pickupAddressText = (passengerPickupAddress || '').toLowerCase().trim();
  const terminalStopNameLower = terminalStop.name.toLowerCase().trim();

  // Critical check: Does passenger pickup location match rider's destination?
  const isPickupMatchingRiderDestination = Boolean(
    bestPickupStop.order === terminalStop.order ||
    (bestPickupStop.id && terminalStop.id && bestPickupStop.id === terminalStop.id) ||
    (pickupAddressText && (
      pickupAddressText === driverToText ||
      pickupAddressText.includes(driverToText) ||
      driverToText.includes(pickupAddressText) ||
      pickupAddressText.includes(terminalStopNameLower)
    ) && minPickupDistCanvas <= 4)
  );

  let matchType: RouteMatchType = 'DIRECT';
  let matchTitle = "Direct route match";
  let matchDescription = "Driver's route reaches your destination.";
  let isPartialRoute = false;
  let unmatchedReason: string | undefined;

  if (isPickupMatchingRiderDestination) {
    matchType = 'NO_MATCH';
    matchTitle = 'Pickup at Rider Destination';
    matchDescription = "Passenger pickup location matches rider's destination. Boarding cannot happen at the final destination.";
    unmatchedReason = "Passenger pickup location matches rider destination. Rider terminates journey at this destination.";
  } else if (!passengerDestPos) {
    matchType = 'DIRECT';
    matchTitle = 'Direct corridor ride';
    matchDescription = "Departs near your pickup with stops along the highway.";
  } else if (isPickupTooFar) {
    matchType = 'NO_MATCH';
    matchTitle = 'No match';
    matchDescription = `Driver departs outside your pickup corridor (${pickupDistanceKm} km away).`;
    unmatchedReason = `Pickup distance (${pickupDistanceKm} km) exceeds local corridor threshold.`;
  } else if (isDirectMatch) {
    matchType = 'DIRECT';
    matchTitle = 'Direct route match';
    matchDescription = "Driver's route reaches your destination or designated drop-off point.";
  } else if (transferInfo) {
    matchType = 'CONNECTED';
    matchTitle = 'Connected route match';
    matchDescription = `Driver reaches ${transferInfo.transferStop.name} verified transfer point for ${transferInfo.connection.connectionName}.`;
    bestDropoffStop = transferInfo.transferStop;
  } else {
    // Check if the driver covers part of the passenger's journey towards destination
    // Vector check: Is dropoff stop closer to passenger destination than pickup stop?
    const pickupToDestDist = passengerDestPos 
      ? Math.hypot(passengerDestPos.x - passengerPickupPos.x, passengerDestPos.y - passengerPickupPos.y)
      : 0;
    const dropToDestDist = passengerDestPos
      ? Math.hypot(passengerDestPos.x - bestDropoffStop.location.x, passengerDestPos.y - bestDropoffStop.location.y)
      : 0;
    
    const isProgressingTowardsDestination = dropToDestDist < pickupToDestDist * 0.92;

    if (isProgressingTowardsDestination && validStops.length > 0) {
      matchType = 'PARTIAL';
      matchTitle = 'Partial journey';
      matchDescription = `Driver covers journey to ${bestDropoffStop.name}. Select an intermediate drop-off.`;
      isPartialRoute = true;
    } else {
      matchType = 'NO_MATCH';
      matchTitle = 'No route match';
      matchDescription = 'Driver route does not connect or progress towards requested destination.';
      unmatchedReason = 'Vehicle corridor does not intersect passenger destination or verified transfer hubs.';
    }
  }

  // 4. Calculate fare from the selected pickup-to-drop-off route distance
  const journeySegments = Math.max(1, bestDropoffStop.order - bestPickupStop.order);
  const { tripDistanceKm, routeDistanceKm } = getTripDistanceKm(sortedStops, bestPickupStop, bestDropoffStop);
  const calculatedFare = matchType === 'NO_MATCH' 
    ? driver.basePricePerSeat 
    : Math.round(Math.max(50, driver.basePricePerSeat * Math.min(1, tripDistanceKm / routeDistanceKm)));

  // 5. Seat capacities along selected sub-trip
  const segOccupancy = calculateSegmentSeatCapacities(sortedStops, driver.totalSeats, bookings);
  const eligibility = canBookSeatsForSubTrip(bestPickupStop.id, bestDropoffStop.id, 1, sortedStops, segOccupancy);
  const remainingSeats = eligibility.minAvailableSeatsAcrossTrip;

  // 6. Compatibility Score computation
  let baseScore = 0;
  if (matchType === 'DIRECT') baseScore = 96;
  else if (matchType === 'CONNECTED') baseScore = 86;
  else if (matchType === 'PARTIAL') baseScore = 72;
  else baseScore = 20;

  const pickupPenalty = Math.min(25, pickupDistanceKm * 3.2);
  const dropPenalty = matchType === 'DIRECT' ? 0 : Math.min(22, dropoffDistanceKm * 1.5);
  const seatBonus = remainingSeats > 0 ? 5 : -30;

  const compatibilityScore = matchType === 'NO_MATCH' 
    ? Math.max(5, Math.min(30, Math.round(baseScore - pickupPenalty)))
    : Math.max(45, Math.min(99, Math.round(baseScore - pickupPenalty - dropPenalty + seatBonus)));

  // ETA in minutes
  const estimatedArrivalMin = Math.round(10 + journeySegments * 18);

  const matchBadgeColor = matchType === 'DIRECT' 
    ? { bg: 'bg-emerald-50 text-emerald-800 border-emerald-300', text: 'text-emerald-700', border: 'border-emerald-400' }
    : matchType === 'CONNECTED'
    ? { bg: 'bg-blue-50 text-blue-800 border-blue-300', text: 'text-blue-700', border: 'border-blue-400' }
    : matchType === 'PARTIAL'
    ? { bg: 'bg-amber-50 text-amber-800 border-amber-300', text: 'text-amber-700', border: 'border-amber-400' }
    : { bg: 'bg-rose-50 text-rose-800 border-rose-300', text: 'text-rose-700', border: 'border-rose-400' };

  // Legal verification details
  const isLegallyVerifiedStop = bestDropoffStop.isLegallyApprovedStop !== false;
  const legalStopBadgeText = bestDropoffStop.legalStopType 
    ? `Authorized Stop: ${bestDropoffStop.legalStopType}`
    : 'Authorized Passenger Pickup/Drop Bay';

  // -------------------------------------------------------------------------
  // 7. DYNAMIC ROUTE & STOP MATCHING USE CASES (SCENARIOS 1 TO 5)
  // -------------------------------------------------------------------------
  const originStop = sortedStops[0];

  // Scenario 1: Exact Origin Match
  // Driver's starting point is identical to Passenger's pickup location
  const distToOriginCanvas = Math.hypot(originStop.location.x - passengerPickupPos.x, originStop.location.y - passengerPickupPos.y);
  const distToOriginKm = +(distToOriginCanvas * 0.22).toFixed(1);
  const driverFromLower = driver.from.toLowerCase();
  const originStopLower = originStop.name.toLowerCase();
  const isPickupAtOriginName = Boolean(
    pickupAddressText && (
      pickupAddressText === driverFromLower ||
      pickupAddressText.includes(driverFromLower) ||
      driverFromLower.includes(pickupAddressText) ||
      pickupAddressText.includes(originStopLower) ||
      originStopLower.includes(pickupAddressText)
    )
  );

  const isExactOriginMatch = bestPickupStop.order === 0 && (distToOriginKm <= 1.0 || isPickupAtOriginName);

  // Scenario 2: En-Route Pickup & Drop-off Match
  // Driver starts at a different location (order > 0), but route passes directly through pickup
  const isEnRoutePickup = bestPickupStop.order > 0 && pickupDistanceKm <= 1.5;
  const midRoutePickupEtaMin = Math.round(15 + bestPickupStop.order * 15);

  // Scenario 4: Intermediate Stop as Destination
  // Driver's final destination is further along, but passenger destination matches an intermediate stop
  const isIntermediateStopAsDest = Boolean(
    passengerDestPos &&
    bestDropoffStop.order < terminalStop.order &&
    (dropoffDistanceKm <= 1.5 || (destText && dropStopText.includes(destText)))
  );

  // Downstream seat capacity freed up for remaining trip:
  const freedUpDownstreamSeats = isIntermediateStopAsDest 
    ? Math.min(driver.totalSeats, remainingSeats + 1)
    : undefined;

  // Scenario 5: Partial Route Ride (Best Alternative Stop)
  // Passenger destination is off-route. Passenger selects the closest intermediate stop
  const isPartialAlternativeStop = matchType === 'PARTIAL' || (!isIntermediateStopAsDest && bestDropoffStop.order !== terminalStop.order && Boolean(passengerDestPos));

  const applicableScenarios: MatchingScenarioCode[] = [];
  if (matchType !== 'NO_MATCH') {
    if (isExactOriginMatch) applicableScenarios.push('S1');
    if (isEnRoutePickup) applicableScenarios.push('S2');
    if (isIntermediateStopAsDest) applicableScenarios.push('S4');
    if (isPartialAlternativeStop) applicableScenarios.push('S5');
  } else {
    applicableScenarios.push('NONE');
  }

  // Determine Primary Scenario
  let scenario: MatchingScenarioDetails;

  if (matchType === 'NO_MATCH') {
    scenario = {
      scenarioCode: 'NONE',
      scenarioName: 'No Route Match',
      scenarioTitle: 'No Match',
      conditionDescription: 'No suitable route point or valid corridor connection exists.',
      passengerFlow: 'Passenger requested trip does not intersect the driver route.',
      systemAction: 'Unmatched. Vehicle travels along separate non-connecting highway.',
      badgeStyle: {
        bg: 'bg-rose-50',
        text: 'text-rose-800',
        border: 'border-rose-300',
        pillBg: 'bg-rose-600',
        pillText: 'text-white'
      }
    };
  } else if (isIntermediateStopAsDest) {
    scenario = {
      scenarioCode: 'S4',
      scenarioName: 'Scenario 4: Intermediate Stop as Destination',
      scenarioTitle: 'Intermediate Stop Destination',
      conditionDescription: `Driver terminal is further along (${terminalStop.name}); your destination matches intermediate stop (${bestDropoffStop.name}).`,
      passengerFlow: `Board at ${bestPickupStop.name}, alight early at ${bestDropoffStop.name} while driver continues onward.`,
      systemAction: `Drop-off pin set to ${bestDropoffStop.name}. Frees up downstream seat capacity for remainder of journey.`,
      freedUpDownstreamSeats,
      badgeStyle: {
        bg: 'bg-teal-50',
        text: 'text-teal-900',
        border: 'border-teal-300',
        pillBg: 'bg-teal-600',
        pillText: 'text-white'
      }
    };
  } else if (isExactOriginMatch && bestDropoffStop.order === terminalStop.order) {
    scenario = {
      scenarioCode: 'S1',
      scenarioName: 'Scenario 1: Exact Origin Match',
      scenarioTitle: 'Exact Origin Match (Zero Deadhead)',
      conditionDescription: `Driver starting point (${originStop.name}) is identical to your pickup with zero deviation.`,
      passengerFlow: `Board at the very beginning of the journey at ${originStop.name} with zero deadhead miles for driver.`,
      systemAction: 'Flagged as high-priority match requiring zero driver deviation or deadhead miles.',
      isHighPriorityZeroDeadhead: true,
      badgeStyle: {
        bg: 'bg-emerald-50',
        text: 'text-emerald-900',
        border: 'border-emerald-300',
        pillBg: 'bg-emerald-600',
        pillText: 'text-white'
      }
    };
  } else if (isExactOriginMatch) {
    scenario = {
      scenarioCode: 'S1',
      scenarioName: 'Scenario 1: Exact Origin Match',
      scenarioTitle: 'Exact Origin Match (High Priority)',
      conditionDescription: `Driver starting point (${originStop.name}) is identical to your pickup location.`,
      passengerFlow: `Board at the very beginning of the driver's journey at ${originStop.name}.`,
      systemAction: 'Flagged as high-priority match requiring zero deadhead miles for driver.',
      isHighPriorityZeroDeadhead: true,
      badgeStyle: {
        bg: 'bg-emerald-50',
        text: 'text-emerald-900',
        border: 'border-emerald-300',
        pillBg: 'bg-emerald-600',
        pillText: 'text-white'
      }
    };
  } else if (isEnRoutePickup && matchType === 'DIRECT') {
    scenario = {
      scenarioCode: 'S2',
      scenarioName: 'Scenario 2: En-Route Pickup & Drop-off Match',
      scenarioTitle: 'En-Route Pickup Match',
      conditionDescription: `Driver starts at ${originStop.name}; active route passes directly through your pickup at ${bestPickupStop.name}.`,
      passengerFlow: `Board mid-route at ${bestPickupStop.name} and alight at ${bestDropoffStop.name}.`,
      systemAction: `Driver arrival ETA calculated (${midRoutePickupEtaMin} mins). Passenger notified to wait at designated pickup bay.`,
      midRoutePickupEtaMin,
      badgeStyle: {
        bg: 'bg-blue-50',
        text: 'text-blue-900',
        border: 'border-blue-300',
        pillBg: 'bg-blue-600',
        pillText: 'text-white'
      }
    };
  } else {
    scenario = {
      scenarioCode: 'S5',
      scenarioName: 'Scenario 5: Partial Route Ride (Best Alternative Stop)',
      scenarioTitle: 'Partial Route • Best Alternative Stop',
      conditionDescription: `Destination is not on driver route; ${bestDropoffStop.name} is the geographically closest stop.`,
      passengerFlow: `Alight at ${bestDropoffStop.name} and complete the last mile (${dropoffDistanceKm} km) independently.`,
      systemAction: `Official drop-off set to ${bestDropoffStop.name}. Fare (₹${calculatedFare}) calculated strictly to this stop with 0 km driver deviation.`,
      lastMileDistanceKm: dropoffDistanceKm,
      badgeStyle: {
        bg: 'bg-amber-50',
        text: 'text-amber-900',
        border: 'border-amber-300',
        pillBg: 'bg-amber-600',
        pillText: 'text-white'
      }
    };
  }

  return {
    matchType,
    matchTitle,
    matchDescription,
    matchBadgeColor,
    scenario,
    applicableScenarios,
    compatibilityScore,
    pickupStop: bestPickupStop,
    pickupDistanceKm,
    dropoffStop: bestDropoffStop,
    dropoffDistanceKm,
    isPartialRoute,
    recommendedIntermediateDropoff: isPartialRoute ? bestDropoffStop : undefined,
    availableIntermediateDropoffs: validStops,
    estimatedArrivalMin,
    tripDistanceKm: matchType === 'NO_MATCH' ? routeDistanceKm : tripDistanceKm,
    calculatedFare,
    remainingSeats,
    availableSeats: remainingSeats,
    routeHighlights: `${bestPickupStop.name.split(' ')[0]} → ${bestDropoffStop.name.split(' ')[0]}`,
    verifiedTransfer: transferInfo?.connection,
    isLegallyVerifiedStop,
    legalStopBadgeText,
    unmatchedReason,
    pickupDoesNotMatchRiderDestination: !isPickupMatchingRiderDestination,
    destinationMatchesRiderDestination: Boolean(bestDropoffStop.order === terminalStop.order || (destText && driverToText.includes(destText)))
  };
}

/**
 * 8. DYNAMIC STOP SELECTION RE-EVALUATION
 * When a passenger selects any intermediate stop or the terminal stop on a driver's route,
 * this function recalculates the exact scenario, fare, freed up seats, and ETA.
 */
export function recalculateMatchForSelectedStop(
  originalMatch: RouteMatchAnalysis,
  driver: {
    id: string;
    from: string;
    to: string;
    basePricePerSeat: number;
    totalSeats: number;
    corridorStops: CarpoolRouteStop[];
  },
  selectedStopId: string,
  passengerTrueDestination?: string
): RouteMatchAnalysis {
  const rawStops = driver.corridorStops || (driver as any).intermediateStops || (driver as any).stops || [];
  const sortedStops = [...rawStops].sort((a, b) => a.order - b.order);
  const selectedStop = sortedStops.find(s => s.id === selectedStopId) || originalMatch.dropoffStop;
  const originStop = sortedStops[0];
  const terminalStop = sortedStops[sortedStops.length - 1];
  const pickupStop = originalMatch.pickupStop;

  const journeySegments = Math.max(1, selectedStop.order - pickupStop.order);
  const { tripDistanceKm, routeDistanceKm } = getTripDistanceKm(sortedStops, pickupStop, selectedStop);
  const recalculatedFare = Math.round(Math.max(50, driver.basePricePerSeat * Math.min(1, tripDistanceKm / routeDistanceKm)));
  const estimatedArrivalMin = Math.round(10 + journeySegments * 18);

  const isTerminalSelected = selectedStop.id === terminalStop.id;
  const isIntermediateSelected = selectedStop.order < terminalStop.order;
  const isOriginBoarding = pickupStop.order === 0;

  // Evaluate which scenario applies to this specific selected stop
  let scenario: MatchingScenarioDetails;
  let matchType: RouteMatchType = originalMatch.matchType;
  const applicableScenarios: MatchingScenarioCode[] = [];

  const trueDestLower = (passengerTrueDestination || '').toLowerCase().trim();
  const selectedStopLower = selectedStop.name.toLowerCase();
  const isExactIntermediateMatch = trueDestLower && selectedStopLower.includes(trueDestLower);
  const isTerminalExactMatch = trueDestLower && (terminalStop.name.toLowerCase().includes(trueDestLower) || driver.to.toLowerCase().includes(trueDestLower));

  if (isOriginBoarding && isTerminalSelected && (!trueDestLower || isTerminalExactMatch)) {
    // S1: Exact Origin Match
    applicableScenarios.push('S1');
    scenario = {
      scenarioCode: 'S1',
      scenarioName: 'Scenario 1: Exact Origin Match',
      scenarioTitle: 'Exact Origin Match (High Priority)',
      conditionDescription: `Driver starting point (${originStop.name}) is identical to your pickup location. Zero deviation.`,
      passengerFlow: `The Passenger boards at the very beginning of the Driver's journey at ${originStop.name}.`,
      systemAction: `Flagged as high-priority match requiring zero deviation or deadhead miles for driver. Pairs directly to ${terminalStop.name}.`,
      isHighPriorityZeroDeadhead: true,
      badgeStyle: ROUTE_MATCHING_SCENARIOS_META.S1.badgeStyle
    };
    matchType = 'DIRECT';
  } else if (isIntermediateSelected && isExactIntermediateMatch) {
    // Scenario 4: Intermediate Stop as Destination (Matches Passenger's destination)
    applicableScenarios.push('S4');
    const freedUpSeats = Math.min(driver.totalSeats, originalMatch.remainingSeats + 1);
    scenario = {
      scenarioCode: 'S4',
      scenarioName: 'Scenario 4: Intermediate Stop as Destination',
      scenarioTitle: 'Intermediate Stop as Destination',
      conditionDescription: `Driver's final destination is further along (${terminalStop.name}), but your destination perfectly matches intermediate stop (${selectedStop.name}).`,
      passengerFlow: `Book the ride, board at ${pickupStop.name}, and alight early at ${selectedStop.name} while Driver continues onward.`,
      systemAction: `System confirms match, sets drop-off pin to ${selectedStop.name}, and frees up downstream seat capacity (+1 seat) for remainder of trip.`,
      freedUpDownstreamSeats: freedUpSeats,
      badgeStyle: ROUTE_MATCHING_SCENARIOS_META.S4.badgeStyle
    };
    matchType = 'DIRECT';
  } else if (isTerminalSelected) {
    // Terminal Destination Selected - En-Route Pickup & Drop-off Match (S2)
    applicableScenarios.push('S2');
    const midEta = Math.round(15 + pickupStop.order * 15);
    scenario = {
      scenarioCode: 'S2',
      scenarioName: 'Scenario 2: En-Route Pickup & Drop-off Match',
      scenarioTitle: 'En-Route Pickup & Drop-off Match',
      conditionDescription: `Driver starts at ${originStop.name}, but active route passes directly through your pickup (${pickupStop.name}) and continues to destination (${terminalStop.name}).`,
      passengerFlow: `Board mid-route at ${pickupStop.name} and alight at driver destination (${terminalStop.name}).`,
      systemAction: `Calculate ETA (${midEta} min) for Driver to reach mid-route pickup point and notify Passenger to wait. Fare: ₹${recalculatedFare}.`,
      midRoutePickupEtaMin: midEta,
      badgeStyle: ROUTE_MATCHING_SCENARIOS_META.S2.badgeStyle
    };
    matchType = 'DIRECT';
  } else if (!isOriginBoarding && !isTerminalSelected && trueDestLower && selectedStopLower.includes(trueDestLower)) {
    // Scenario 2: En-Route Pickup & Drop-off Match
    applicableScenarios.push('S2');
    const midEta = Math.round(15 + pickupStop.order * 15);
    scenario = {
      scenarioCode: 'S2',
      scenarioName: 'Scenario 2: En-Route Pickup & Drop-off Match',
      scenarioTitle: 'En-Route Pickup & Drop-off Match',
      conditionDescription: `Driver starts at ${originStop.name}, but active route passes directly through both your pickup (${pickupStop.name}) and destination (${selectedStop.name}).`,
      passengerFlow: `Board mid-route at ${pickupStop.name} and alight mid-route at ${selectedStop.name}.`,
      systemAction: `Calculate ETA (${midEta} min) for Driver to reach mid-route pickup point and notify Passenger to wait.`,
      midRoutePickupEtaMin: midEta,
      badgeStyle: ROUTE_MATCHING_SCENARIOS_META.S2.badgeStyle
    };
    matchType = 'DIRECT';
  } else {
    // Scenario 5: Partial Route Ride (Best Alternative Stop)
    applicableScenarios.push('S5');
    const lastMileDist = +(Math.hypot(selectedStop.location.x - 50, selectedStop.location.y - 36) * 0.22).toFixed(1);
    scenario = {
      scenarioCode: 'S5',
      scenarioName: 'Scenario 5: Partial Route Ride (Best Alternative Stop)',
      scenarioTitle: 'Partial Route Ride (Best Alternative Stop)',
      conditionDescription: `True destination is not strictly on Driver's route. Passenger selected ${selectedStop.name} because it gets them closest.`,
      passengerFlow: `Review Driver's visible stops, alight at ${selectedStop.name}, and complete the last mile (~${lastMileDist} km) independently after drop-off.`,
      systemAction: `Treat ${selectedStop.name} as official drop-off location. Fare (₹${recalculatedFare}) and navigation calculated strictly up to selected stop, with 0 km Driver deviation.`,
      lastMileDistanceKm: lastMileDist,
      badgeStyle: ROUTE_MATCHING_SCENARIOS_META.S5.badgeStyle
    };
    matchType = 'PARTIAL';
  }

  return {
    ...originalMatch,
    matchType,
    dropoffStop: selectedStop,
    calculatedFare: recalculatedFare,
    tripDistanceKm,
    estimatedArrivalMin,
    scenario,
    applicableScenarios: applicableScenarios.length > 0 ? applicableScenarios : originalMatch.applicableScenarios,
    routeHighlights: `${pickupStop.name.split(' ')[0]} → ${selectedStop.name.split(' ')[0]}`
  };
}

/**
 * =========================================================================
 * 9. POLYLINE-TO-STOPS GENERATION ENGINE (AUTO-STOP LOGIC MODELS)
 * Converts high-density polyline paths (e.g., thousands of coordinates)
 * into a manageable list of 5-10 strategic, bookable intermediate stops.
 *
 * Implements:
 * 1. Distance or Time-Based Intervals (5km / 10-15min intervals)
 * 2. Major Junctions & Maneuvers (Highway exits, ring road merges, toll plazas)
 * 3. Points of Interest (POI) Snapping (Metro stations, bus terminals, kiss-and-ride hubs within 500m)
 *
 * Database Architecture Object:
 * {
 *   driverId: string,
 *   routePolyline: string | RoutePoint[],
 *   nodes: [
 *     { type: "origin", location: { lat: number, lng: number }, stopIndex: 0 },
 *     { type: "auto_stop", location: { lat: number, lng: number }, stopIndex: 1, stopName: string, enabled: boolean },
 *     ...
 *     { type: "destination", location: { lat: number, lng: number }, stopIndex: N }
 *   ]
 * }
 * =========================================================================
 */

export type AutoStopLogicModel = 'INTERVAL' | 'JUNCTIONS' | 'POI_SNAPPING';

export interface RouteAutoNode {
  id: string;
  type: 'origin' | 'auto_stop' | 'destination';
  stopIndex: number;
  name: string;
  location: { x: number; y: number; lat?: number; lng?: number };
  etaOffset: string;
  legalStopType: string;
  sourceModel: AutoStopLogicModel;
  enabled: boolean; // UI toggle: driver can toggle off unsafe intersections
  confidenceScore: number; // 0 to 100
  poiType?: string;
}

export interface TripRouteDatabaseObject {
  driverId: string;
  routePolyline: string;
  logicModelApplied: AutoStopLogicModel;
  deviationToleranceKm: number; // 1 to 2 km generous radius for passenger matching
  nodes: RouteAutoNode[];
  totalDistanceKm: number;
  estimatedDrivingMinutes: number;
}

/** Known Corridor POIs for snapping within 500m */
export const CORRIDOR_POIS: Array<{
  name: string;
  type: string;
  location: { x: number; y: number; lat: number; lng: number };
  legalStopType: string;
}> = [
  { name: 'Warangal Central Bus Station', type: 'Bus Terminal', location: { x: 74, y: 58, lat: 17.9689, lng: 79.5941 }, legalStopType: 'Authorized Bus Terminal Bay' },
  { name: 'Hanamkonda Public Gardens Bus Bay', type: 'Metro/Bus Bay', location: { x: 75, y: 42, lat: 18.0073, lng: 79.5539 }, legalStopType: 'Designated Bus Bay' },
  { name: 'Kazipet Railway Junction Transit', type: 'Railway Hub', location: { x: 68, y: 52, lat: 17.9794, lng: 79.5218 }, legalStopType: 'Railway Transit Lane' },
  { name: 'Jangaon Highway Bus Shelter', type: 'Highway Transit', location: { x: 66, y: 44, lat: 17.7214, lng: 79.1601 }, legalStopType: 'Highway Passenger Bay' },
  { name: 'Aler Toll Plaza Rest Area', type: 'Toll Plaza', location: { x: 63, y: 40, lat: 17.6510, lng: 78.9660 }, legalStopType: 'ORR Toll Plazas' },
  { name: 'Bhongir Fort Highway Kiss-and-Ride', type: 'Transit Point', location: { x: 61, y: 38, lat: 17.5111, lng: 78.8890 }, legalStopType: 'Highway Passenger Bay' },
  { name: 'Ghatkesar ORR Highway Transit Bay', type: 'ORR Junction', location: { x: 60, y: 36, lat: 17.4529, lng: 78.6826 }, legalStopType: 'ORR Highway Transit Bay' },
  { name: 'Uppal Metro Interchange Bay', type: 'Metro Station', location: { x: 56, y: 34, lat: 17.4018, lng: 78.5602 }, legalStopType: 'Metro Kiss-and-Ride Bay' },
  { name: 'Secunderabad Railway Terminal Bay', type: 'Railway Terminal', location: { x: 52, y: 30, lat: 17.4334, lng: 78.5017 }, legalStopType: 'Railway Terminal Bay' },
  { name: 'Hyderabad Central MGBS Transit Hub', type: 'Central Hub', location: { x: 50, y: 36, lat: 17.3784, lng: 78.4812 }, legalStopType: 'Central Transit Hub' },
  { name: 'LB Nagar Ring Road Flyover Bay', type: 'Ring Road Hub', location: { x: 54, y: 46, lat: 17.3457, lng: 78.5522 }, legalStopType: 'Ring Road Transit Hub' },
  { name: 'Mindspace Hitec City Regulated Bay', type: 'IT Corridor Hub', location: { x: 38, y: 50, lat: 17.4435, lng: 78.3772 }, legalStopType: 'IT Park Regulated Drop Bay' }
];

/**
 * Douglas-Peucker Polyline Simplification Algorithm.
 * Reduces 2,000+ coordinates down to a clean, simplified polygon envelope of essential vertices.
 */
export function douglasPeuckerSimplify(
  points: RoutePoint[],
  epsilon: number = 2.0
): RoutePoint[] {
  if (points.length <= 2) return points;

  let dmax = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const { distance } = pointToSegmentDistance(points[i], first, last);
    if (distance > dmax) {
      index = i;
      dmax = distance;
    }
  }

  if (dmax > epsilon) {
    const recResults1 = douglasPeuckerSimplify(points.slice(0, index + 1), epsilon);
    const recResults2 = douglasPeuckerSimplify(points.slice(index), epsilon);
    return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
  } else {
    return [first, last];
  }
}

/**
 * Converts a massive polyline into 5-10 intermediate stops using one of the 3 specified logic models:
 * 1. INTERVAL: Drops pins every 5km / 10-15min driving time
 * 2. JUNCTIONS: Converts major turns, highway ramps and junctions into pull-over stops
 * 3. POI_SNAPPING: Snaps to recognized bus stops, metro stations, or landmarks within 500m
 */
export function generateAutoIntermediateStops(
  origin: { name: string; x: number; y: number },
  destination: { name: string; x: number; y: number },
  model: AutoStopLogicModel = 'JUNCTIONS',
  maxNodes: number = 8
): RouteAutoNode[] {
  // Generate a calibrated corridor polyline between origin and destination
  const densePolyline: RoutePoint[] = [];
  const steps = 40; // Simulated dense polyline (40-60 points)
  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    // Add realistic highway curvature
    const curveOffset = Math.sin(frac * Math.PI) * 4.5;
    densePolyline.push({
      x: +(origin.x + frac * (destination.x - origin.x) + curveOffset * 0.4).toFixed(2),
      y: +(origin.y + frac * (destination.y - origin.y) + curveOffset * 0.2).toFixed(2),
      streetName: `NH163 Highway Km ${Math.round(frac * 145)}`
    });
  }

  // First simplify polyline via Douglas-Peucker
  const simplified = douglasPeuckerSimplify(densePolyline, 1.8);

  const candidateNodes: RouteAutoNode[] = [];

  // Model 1: Distance or Time-Based Intervals (Every 5-8km / 12-15 mins)
  if (model === 'INTERVAL') {
    const totalDistKm = 145;
    const intervalKm = Math.max(15, Math.round(totalDistKm / (maxNodes + 1)));
    const count = Math.min(maxNodes, Math.floor(totalDistKm / intervalKm));

    for (let i = 1; i <= count; i++) {
      const frac = i / (count + 1);
      const polyIdx = Math.min(densePolyline.length - 1, Math.round(frac * (densePolyline.length - 1)));
      const pt = densePolyline[polyIdx];
      const distFromStart = Math.round(frac * totalDistKm);
      const etaMin = Math.round(frac * 120);

      candidateNodes.push({
        id: `auto-int-${i}`,
        type: 'auto_stop',
        stopIndex: i,
        name: `Km ${distFromStart} Highway Bay (${pt.streetName || 'Transit Point'})`,
        location: { x: pt.x, y: pt.y, lat: 17.5 + frac * 0.4, lng: 79.1 - frac * 0.6 },
        etaOffset: `+${etaMin} mins`,
        legalStopType: 'Highway Passenger Bay',
        sourceModel: 'INTERVAL',
        enabled: true,
        confidenceScore: 88
      });
    }
  } 
  // Model 2: Major Junctions & Maneuvers (Highway On-Ramps, Toll Plazas, Flyover Exits)
  else if (model === 'JUNCTIONS') {
    const majorJunctionNames = [
      { name: 'Kazipet Highway Ramp', eta: '+25 mins', type: 'Railway Transit Lane' },
      { name: 'Jangaon Bypass Ring Merge', eta: '+50 mins', type: 'Highway Passenger Bay' },
      { name: 'Aler Tollway Slip Road', eta: '+1 hr 10m', type: 'ORR Toll Plazas' },
      { name: 'Bhongir Flyover Pull-Over Bay', eta: '+1 hr 30m', type: 'Highway Passenger Bay' },
      { name: 'Ghatkesar ORR Interchange', eta: '+1 hr 45m', type: 'ORR Highway Transit Bay' },
      { name: 'Uppal Metro Flyover Kiss-and-Ride', eta: '+2 hrs', type: 'Metro Kiss-and-Ride Bay' }
    ];

    const selectedJunctions = majorJunctionNames.slice(0, maxNodes);
    selectedJunctions.forEach((junc, idx) => {
      const frac = (idx + 1) / (selectedJunctions.length + 1);
      const polyIdx = Math.min(simplified.length - 1, Math.round(frac * (simplified.length - 1)));
      const pt = simplified[polyIdx] || densePolyline[Math.round(frac * densePolyline.length)];

      candidateNodes.push({
        id: `auto-junc-${idx + 1}`,
        type: 'auto_stop',
        stopIndex: idx + 1,
        name: junc.name,
        location: { x: pt.x, y: pt.y, lat: 17.55 + frac * 0.35, lng: 79.15 - frac * 0.55 },
        etaOffset: junc.eta,
        legalStopType: junc.type,
        sourceModel: 'JUNCTIONS',
        enabled: true,
        confidenceScore: 94
      });
    });
  } 
  // Model 3: Points of Interest (POI) Snapping within 500 meters
  else {
    CORRIDOR_POIS.forEach((poi, idx) => {
      // Check distance from highway polyline in canvas units (1 unit ≈ 220m, 500m ≈ 2.27 units)
      const onRouteCheck = calculatePassengerOnRoute(poi.location, densePolyline, 1500);
      if (onRouteCheck.isOnRoute && candidateNodes.length < maxNodes) {
        candidateNodes.push({
          id: `auto-poi-${idx + 1}`,
          type: 'auto_stop',
          stopIndex: candidateNodes.length + 1,
          name: poi.name,
          location: { x: poi.location.x, y: poi.location.y, lat: poi.location.lat, lng: poi.location.lng },
          etaOffset: `+${Math.round(onRouteCheck.routeProgressFraction * 120)} mins`,
          legalStopType: poi.legalStopType,
          sourceModel: 'POI_SNAPPING',
          enabled: true,
          confidenceScore: 98,
          poiType: poi.type
        });
      }
    });
  }

  // Cap nodes between 5 and 10 to keep database & queries light
  const finalIntermediateStops = candidateNodes.slice(0, 8);

  // Return full sequence with origin (order 0) and destination (order N+1)
  const fullNodes: RouteAutoNode[] = [
    {
      id: 'node-origin',
      type: 'origin',
      stopIndex: 0,
      name: origin.name,
      location: { x: origin.x, y: origin.y, lat: 17.96, lng: 79.59 },
      etaOffset: '08:00 AM (Start)',
      legalStopType: 'Authorized Bus Terminal Bay',
      sourceModel: model,
      enabled: true,
      confidenceScore: 100
    },
    ...finalIntermediateStops.map((st, i) => ({ ...st, stopIndex: i + 1 })),
    {
      id: 'node-dest',
      type: 'destination',
      stopIndex: finalIntermediateStops.length + 1,
      name: destination.name,
      location: { x: destination.x, y: destination.y, lat: 17.38, lng: 78.48 },
      etaOffset: '+2 hrs 15m (Destination)',
      legalStopType: 'Central Transit Hub',
      sourceModel: model,
      enabled: true,
      confidenceScore: 100
    }
  ];

  return fullNodes;
}

/**
 * Creates the simulated database TripRoute object for seamless backend persistence
 */
export function buildDatabaseTripRouteObject(
  driverId: string,
  origin: { name: string; x: number; y: number },
  destination: { name: string; x: number; y: number },
  nodes: RouteAutoNode[],
  model: AutoStopLogicModel
): TripRouteDatabaseObject {
  // Encoded polyline representation (base64 mock string representing Google Maps polyline)
  const encodedPolyline = `_p~iF~ps|U_ulLnnqC_mqNvxq` + Buffer.from(JSON.stringify(nodes.map(n => n.location))).toString('base64').substring(0, 32);

  return {
    driverId,
    routePolyline: encodedPolyline,
    logicModelApplied: model,
    deviationToleranceKm: 1.5, // Generous 1.5km radius for passenger matching
    nodes,
    totalDistanceKm: 145,
    estimatedDrivingMinutes: 135
  };
}
