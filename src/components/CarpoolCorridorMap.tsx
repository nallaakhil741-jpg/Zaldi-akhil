import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Crosshair, MapPin } from 'lucide-react';
import { sounds } from '../services/audio';
import { renderVectorVehicleSvg, getVehicleTheme } from './Vehicle5dIcon';

interface CarpoolCorridorMapProps {
  pickupAddress: string;
  dropoffAddress: string;
  driverId?: string;
  driverName?: string;
  driverProgress?: number;
  vehicleTier?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
  liveSpeedKmh?: number;
  onRecenter?: () => void;
}

export const CarpoolCorridorMap: React.FC<CarpoolCorridorMapProps> = ({
  pickupAddress,
  dropoffAddress,
  driverId,
  driverName = 'Ramesh Kumar',
  driverProgress = 0.42,
  vehicleTier = 'Cab Prime Sedan',
  vehiclePlate = 'TS 09 AB 1234',
  vehicleModel = 'Maruti Ertiga',
  liveSpeedKmh = 68,
  onRecenter
}) => {
  // Animated vehicle progress along the highway
  const [carAnimProgress, setCarAnimProgress] = useState(driverProgress);
  const lastDriverKeyRef = useRef<string>(driverId || driverName);
  const [hasRecentlyChangedDriver, setHasRecentlyChangedDriver] = useState(false);
  const [mapZoom, setMapZoom] = useState(1);
  const touchDistanceRef = useRef<number | null>(null);
  const isPinchingRef = useRef(false);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const tapStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;

    if (event.touches.length === 2) {
      const [first, second] = Array.from(event.touches);
      touchDistanceRef.current = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
      isPinchingRef.current = true;
      lastTapRef.current = null;
      tapStartRef.current = null;
    } else if (event.touches.length === 1) {
      const touch = event.touches[0];
      tapStartRef.current = { x: touch.clientX, y: touch.clientY };
    } else {
      tapStartRef.current = null;
    }
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const previousDistance = touchDistanceRef.current;
    if (event.touches.length === 2 && previousDistance !== null && previousDistance > 0) {
      const [first, second] = Array.from(event.touches);
      const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
      if (distance > 0) {
        setMapZoom(currentZoom => Math.max(1, Math.min(3, currentZoom * distance / previousDistance)));
        touchDistanceRef.current = distance;
      }
      return;
    }

    if (event.touches.length === 1 && tapStartRef.current) {
      const touch = event.touches[0];
      if (Math.hypot(touch.clientX - tapStartRef.current.x, touch.clientY - tapStartRef.current.y) > 12) {
        tapStartRef.current = null;
      }
    }
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length > 0) return;

    touchDistanceRef.current = null;
    if (isPinchingRef.current) {
      isPinchingRef.current = false;
      lastTapRef.current = null;
      tapStartRef.current = null;
      return;
    }

    const tapStart = tapStartRef.current;
    tapStartRef.current = null;
    if (!tapStart || (event.target as HTMLElement).closest('button')) return;

    const now = Date.now();
    const previousTap = lastTapRef.current;
    if (
      previousTap &&
      now - previousTap.time <= 300 &&
      Math.hypot(tapStart.x - previousTap.x, tapStart.y - previousTap.y) <= 24
    ) {
      setMapZoom(currentZoom => Math.min(3, currentZoom * 1.5));
      lastTapRef.current = null;
      return;
    }

    lastTapRef.current = { ...tapStart, time: now };
  };

  const handleTouchCancel = () => {
    touchDistanceRef.current = null;
    isPinchingRef.current = false;
    lastTapRef.current = null;
    tapStartRef.current = null;
  };

  // Immediately jump to the selected driver's live current car location whenever rider selection changes
  useEffect(() => {
    const currentKey = driverId || driverName;
    if (lastDriverKeyRef.current !== currentKey) {
      lastDriverKeyRef.current = currentKey;
      if (typeof driverProgress === 'number' && driverProgress >= 0) {
        setCarAnimProgress(driverProgress);
        setHasRecentlyChangedDriver(true);
        const timer = setTimeout(() => setHasRecentlyChangedDriver(false), 1400);
        return () => clearTimeout(timer);
      }
    }
  }, [driverId, driverName, driverProgress]);

  // Smooth forward highway travel progression - strictly forward, zero reverse motion
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const startAnimation = () => {
      if (!interval && !document.hidden) {
        interval = setInterval(() => {
          setCarAnimProgress(prev => {
            const next = prev + 0.008;
            return next > 0.94 ? 0.08 : next;
          });
        }, 500);
      }
    };
    const stopAnimation = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };
    const handleVisibilityChange = () => {
      if (document.hidden) stopAnimation();
      else startAnimation();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    startAnimation();
    return () => {
      stopAnimation();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Road waypoints definition in SVG coordinates (viewBox 0 0 1000 500)
  const waypoints = [
    { id: 'hanamkonda', name: 'Hanamkonda', x: 195, y: 125, isPickup: true, pinType: 'green' },
    { id: 'warangal', name: 'Warangal', x: 320, y: 155, isPickup: false, pinType: 'node' },
    { id: 'ghatkesar', name: 'Ghatkesar', x: 550, y: 185, isPickup: false, pinType: 'node' },
    { id: 'uppal', name: 'Uppal', x: 655, y: 220, isPickup: false, pinType: 'node' },
    { id: 'hyderabad', name: 'Hyderabad Central', x: 795, y: 255, isDropoff: true, pinType: 'red' },
  ];

  // Smooth SVG road curve string
  const roadPathD = "M 195 125 C 240 130, 280 142, 320 155 C 370 172, 420 182, 470 185 C 510 187, 530 184, 550 185 C 585 186, 620 205, 655 220 C 695 238, 745 252, 795 255";

  // Road path points for car trajectory
  const pts = useMemo(() => [
    { x: 195, y: 125 }, // Hanamkonda (Start)
    { x: 320, y: 155 }, // Warangal
    { x: 440, y: 184 },
    { x: 550, y: 185 }, // Ghatkesar
    { x: 655, y: 220 }, // Uppal
    { x: 795, y: 255 }  // Hyderabad Central (End)
  ], []);

  // Calculate car position along the parametric curve
  // Ensures car moves forward in direction of motion with zero reverse movement
  const getCarPosOnCurve = (t: number) => {
    const segmentCount = pts.length - 1;
    const clampedT = Math.max(0, Math.min(0.999, t));
    const indexFloat = clampedT * segmentCount;
    const idx = Math.min(segmentCount - 1, Math.floor(indexFloat));
    const frac = indexFloat - idx;
    const p1 = pts[idx];
    const p2 = pts[idx + 1];
    const curX = p1.x + frac * (p2.x - p1.x);
    const curY = p1.y + frac * (p2.y - p1.y);
    const angleRad = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const roadAngleDeg = (angleRad * 180) / Math.PI;
    return { x: curX, y: curY, roadAngleDeg };
  };

  const carPos = getCarPosOnCurve(carAnimProgress);
  const vehicleTheme = getVehicleTheme(vehicleTier);

  return (
    <div
      className="relative w-full h-full overflow-hidden select-none bg-[#F3F4EE]"
      style={{ touchAction: 'none' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      <div
        className="absolute inset-0"
        style={{ transform: `scale(${mapZoom})`, transformOrigin: 'center' }}
      >
      {/* -----------------------------------------------------------------
          1. REALISTIC TOPOGRAPHIC MAP CANVAS & ROADS
         ----------------------------------------------------------------- */}
      <svg
        viewBox="0 0 1000 500"
        className="w-full h-full object-cover"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {/* Subtle terrain topography patterns */}
          <pattern id="terrain-grid" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M 80 0 L 0 0 0 80" fill="none" stroke="#E5E7EB" strokeWidth="0.8" opacity="0.6" />
          </pattern>

          {/* Road drop shadow */}
          <filter id="road-glow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#1E3A8A" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* Base Map Terrain Fills */}
        <rect width="1000" height="500" fill="#F4F4EE" />
        <rect width="1000" height="500" fill="url(#terrain-grid)" />

        {/* Forest / Nature Reserves Green Accents (Realistic background features) */}
        <path
          d="M 60 40 Q 120 20 180 50 Q 240 80 200 130 Q 140 150 90 120 Z"
          fill="#DCFCE7"
          opacity="0.85"
        />
        <path
          d="M 640 40 Q 720 20 800 60 Q 840 120 780 150 Q 700 160 660 110 Z"
          fill="#DCFCE7"
          opacity="0.75"
        />
        <path
          d="M 380 320 Q 460 290 540 330 Q 560 410 490 440 Q 400 450 360 380 Z"
          fill="#E2F1E5"
          opacity="0.9"
        />
        <path
          d="M 740 330 Q 820 300 900 340 Q 940 420 860 460 Q 780 470 730 400 Z"
          fill="#DCFCE7"
          opacity="0.7"
        />

        {/* Water Bodies (Lakes / Reservoirs) */}
        <path
          d="M 280 40 Q 330 30 360 60 Q 370 100 320 110 Q 270 100 260 70 Z"
          fill="#CFE6FC"
          opacity="0.8"
        />
        <path
          d="M 690 350 Q 740 330 780 360 Q 770 410 720 420 Q 670 400 680 370 Z"
          fill="#CFE6FC"
          opacity="0.8"
        />

        {/* Minor Road Network / Secondary Arterials */}
        <path
          d="M 120 200 C 220 190, 310 240, 420 230 C 510 220, 600 270, 700 260 C 800 250, 890 280, 960 300"
          fill="none"
          stroke="#E2E8F0"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path
          d="M 320 0 C 330 80, 310 160, 330 250 C 350 340, 360 420, 370 500"
          fill="none"
          stroke="#E2E8F0"
          strokeWidth="3"
        />
        <path
          d="M 550 0 C 540 90, 560 180, 550 280 C 540 380, 560 440, 570 500"
          fill="none"
          stroke="#E2E8F0"
          strokeWidth="3"
        />
        <path
          d="M 0 350 C 180 340, 340 360, 500 340 C 650 320, 800 360, 1000 330"
          fill="none"
          stroke="#E5E7EB"
          strokeWidth="2.5"
        />

        {/* Outer Highway Border (Dark Blue Casing) */}
        <path
          d={roadPathD}
          fill="none"
          stroke="#1D4ED8"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#road-glow)"
        />

        {/* Inner Vibrant Highway Line (Bright Google Maps Blue) */}
        <path
          d={roadPathD}
          fill="none"
          stroke="#2563EB"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Highway Waypoint Rings along the path */}
        {waypoints.map(wp => {
          if (wp.pinType === 'node') {
            return (
              <g key={wp.id}>
                {/* Outer shadow/border */}
                <circle cx={wp.x} cy={wp.y} r="7.5" fill="#1D4ED8" />
                {/* Inner white circle */}
                <circle cx={wp.x} cy={wp.y} r="4.8" fill="#FFFFFF" />
              </g>
            );
          }
          return null;
        })}

        {/* Subtle SVG ground contact track shadow beneath vehicle */}
        <ellipse
          cx={carPos.x}
          cy={carPos.y + 4}
          rx="22"
          ry="10"
          fill="#0F172A"
          opacity="0.25"
          filter="blur(2px)"
        />
      </svg>

      {/* -----------------------------------------------------------------
          2. FLOATING WAYPOINT LABELS & PINS (HTML Overlay for crisp typography)
         ----------------------------------------------------------------- */}
      {/* 1. Hanamkonda (Start/Pickup - Green Pin) */}
      <div 
        className="absolute z-10 flex flex-col items-center pointer-events-none transform -translate-x-1/2 -translate-y-full"
        style={{ left: '19.5%', top: '25%' }}
      >
        <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg shadow-md border border-slate-200/90 whitespace-nowrap">
          <div className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center -ml-0.5 shadow-2xs">
            <MapPin className="w-2.5 h-2.5 fill-white stroke-none" />
          </div>
          <span className="font-extrabold text-xs text-slate-900 tracking-tight">Hanamkonda</span>
        </div>
        <div className="w-2.5 h-2.5 bg-emerald-700 rounded-full ring-2 ring-white shadow-xs -mt-1"></div>
      </div>

      {/* 2. Warangal (Node - White Pill) */}
      <div 
        className="absolute z-10 pointer-events-none transform -translate-x-1/2 -translate-y-full pb-1"
        style={{ left: '32%', top: '31%' }}
      >
        <div className="bg-white px-2.5 py-0.5 rounded-lg shadow-md border border-slate-200/90 whitespace-nowrap">
          <span className="font-extrabold text-xs text-slate-900 tracking-tight">Warangal</span>
        </div>
      </div>

      {/* 3. Ghatkesar (Node - White Pill) */}
      <div 
        className="absolute z-10 pointer-events-none transform -translate-x-1/2 -translate-y-full pb-1"
        style={{ left: '55%', top: '37%' }}
      >
        <div className="bg-white px-2.5 py-0.5 rounded-lg shadow-md border border-slate-200/90 whitespace-nowrap">
          <span className="font-extrabold text-xs text-slate-900 tracking-tight">Ghatkesar</span>
        </div>
      </div>

      {/* 4. Uppal (Node - White Pill) */}
      <div 
        className="absolute z-10 pointer-events-none transform -translate-x-1/2 -translate-y-full pb-1"
        style={{ left: '65.5%', top: '44%' }}
      >
        <div className="bg-white px-2.5 py-0.5 rounded-lg shadow-md border border-slate-200/90 whitespace-nowrap">
          <span className="font-extrabold text-xs text-slate-900 tracking-tight">Uppal</span>
        </div>
      </div>

      {/* 5. Hyderabad Central (Destination - Red Pin) */}
      <div 
        className="absolute z-10 flex flex-col items-center pointer-events-none transform -translate-x-1/2 -translate-y-full"
        style={{ left: '79.5%', top: '51%' }}
      >
        <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg shadow-md border border-slate-200/90 whitespace-nowrap">
          <div className="w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center -ml-0.5 shadow-2xs">
            <MapPin className="w-2.5 h-2.5 fill-white stroke-none" />
          </div>
          <span className="font-extrabold text-xs text-slate-900 tracking-tight">Hyderabad Central</span>
        </div>
        <div className="w-2.5 h-2.5 bg-rose-700 rounded-full ring-2 ring-white shadow-xs -mt-1"></div>
      </div>

      {/* -----------------------------------------------------------------
          2B. MOVING CARPOOL VEHICLE (FORWARD FACING ALONG ROAD)
         ----------------------------------------------------------------- */}
      <div
        className="absolute z-20 flex flex-col items-center pointer-events-none transform -translate-x-1/2 -translate-y-1/2 transition-all duration-100 ease-linear"
        style={{
          left: `${(carPos.x / 1000) * 100}%`,
          top: `${(carPos.y / 500) * 100}%`
        }}
      >
        {/* 1. Driver Name & Live Speed Pill (Matching Ride Section) */}
        <div className="mb-1 px-2.5 py-0.5 rounded-full bg-slate-950/95 text-white border border-emerald-400 text-[9px] font-black shadow-xl flex items-center gap-1.5 whitespace-nowrap backdrop-blur-md">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span>{driverName} • {liveSpeedKmh} km/h</span>
        </div>

        {/* 2. Upright Forward-Facing Vehicle with Wheels on Highway Surface */}
        <div 
          className="relative flex items-center justify-center transition-transform duration-100 ease-linear"
          style={{
            width: 62,
            height: 32,
            transform: `rotate(${carPos.roadAngleDeg}deg)`
          }}
        >
          {/* Visual beacon pulse when selecting a new rider to highlight current car location */}
          {hasRecentlyChangedDriver && (
            <div className="absolute inset-0 -m-3 rounded-full border-2 border-emerald-400 animate-ping pointer-events-none" />
          )}

          {/* Dynamic Forward Headlight Projection Beam (illuminating the road ahead towards Hyderabad Central) */}
          <div 
            className="absolute top-1/2 -right-8 -translate-y-1/2 w-11 h-7 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at left, rgba(254, 240, 138, 0.8) 0%, rgba(253, 224, 71, 0.35) 45%, transparent 75%)',
              clipPath: 'polygon(0% 30%, 100% 0%, 100% 100%, 0% 70%)',
              filter: 'blur(1.5px)'
            }}
          />

          {/* Neon Ambient Road Underglow Aura matching vehicle tier */}
          <div 
            className="absolute inset-x-1 bottom-0 h-3.5 rounded-full blur-[3px] pointer-events-none opacity-50"
            style={{ backgroundColor: vehicleTheme.glowColor || 'rgba(37, 99, 235, 0.6)' }}
          />

          {/* Ground Contact Shadow beneath Wheels on Highway Surface */}
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-[85%] h-2.5 bg-black/60 rounded-full blur-[1.5px] pointer-events-none" />

          {/* Upright Vector Car Chassis with Headlights pointing forward to the right towards Hyderabad */}
          <div 
            className="relative z-10 w-full h-full flex items-center justify-center filter drop-shadow-[0_2px_5px_rgba(0,0,0,0.55)]"
            style={{
              transform: (vehicleTier || '').toUpperCase().includes('BIKE') || (vehicleTier || '').toUpperCase().includes('AUTO')
                ? 'none'
                : 'scaleX(-1)'
            }}
          >
            {renderVectorVehicleSvg(vehicleTier || 'CAB', false, 'w-full h-full')}
          </div>
        </div>

        {/* 3. Driver License Plate Tag (Matching Ride Section) */}
        <div className="mt-1 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/85 text-white text-[8px] font-bold border border-slate-700/80 shadow-md whitespace-nowrap">
          <span className="text-blue-400 font-semibold">{vehicleTier.replace('Prime', '').replace('Sedan', '').trim() || 'Cab Prime'}</span>
          <span className="text-slate-500">•</span>
          <span className="font-mono text-amber-300 font-bold">{vehiclePlate}</span>
        </div>
      </div>
      </div>

      {/* -----------------------------------------------------------------
          3. FLOATING BUTTON (BOTTOM LEFT): RECENTER / GPS
         ----------------------------------------------------------------- */}
      <div className="absolute bottom-4 left-4 z-20">
        <button
          onClick={() => {
            sounds.playTap();
            onRecenter?.();
          }}
          className="w-10 h-10 rounded-full bg-white shadow-lg border border-slate-200 text-slate-700 flex items-center justify-center hover:bg-slate-50 transition active:scale-95 cursor-pointer"
          title="Recenter GPS Location"
        >
          <Crosshair className="w-5 h-5 text-slate-700 stroke-[2.2]" />
        </button>
      </div>
    </div>
  );
};
