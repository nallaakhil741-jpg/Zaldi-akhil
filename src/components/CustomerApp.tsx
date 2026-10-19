import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  MapPin, X, Clock, Phone, MessageSquare, 
  ShieldCheck, Star, CheckCircle, Check, ChevronRight, Wallet, 
  Settings, HelpCircle, Shield, LogOut, Tag, ArrowRight, ArrowLeft,
  Share2, Users, Sparkles, Navigation, Calendar, Box,
  Package, User, Briefcase, Laptop, AlertTriangle, Scale,
  Info, Plus, Minus, AlertCircle, ChevronDown, ChevronUp, Receipt, CheckCircle2, Headphones, Camera
} from 'lucide-react';
import { 
  CustomerTab, BookingStatus, Driver, RideOrder, VehicleTier, ServiceMode, RoadRouteInfo 
} from '../types';
import { 
  VEHICLE_OPTIONS, MOCK_LOCATIONS, MOCK_CARPOOLS, 
  OUTSTATION_PACKAGES, PAST_RIDES_MOCK, INITIAL_DRIVERS 
} from '../services/mockData';
import { fetchLiveRoadRoute, resolveAddressToRoadJunction } from '../services/routeService';
import { resolveAddressToGeoCoord, RoutingEngineType } from '../services/routingEngineService';
import { fetchPlaceDetails, fetchPlacePredictions, PlacePrediction, SelectedPlace } from '../services/placesService';
import { InteractiveMap } from './InteractiveMap';
import { ChatModal, CallModal, WalletModal, SafetyModal } from './Modals';
import { sounds } from '../services/audio';
import { Vehicle3dIcon } from './Vehicle3dIcon';
import { Vehicle5dIcon, getVehicleTheme } from './Vehicle5dIcon';
import { LocationPinType } from './Boy3dPin';
import { CarpoolSection, AvailableCarpoolDriver, AVAILABLE_CARPOOL_DRIVERS } from './CarpoolSection';
import { 
  DEFAULT_GPS_COORDS, 
  DEFAULT_GPS_ADDRESS, 
  reverseGeocodeRealWorldAddress 
} from '../services/geocodingService';
import { tripChatBroadcaster } from '../services/tripChatService';

// Parcel Specifications across all vehicle tiers
const VEHICLE_PARCEL_SPECS: Record<string, { maxWeight: number; types: { label: string; icon: string; desc?: string }[] }> = {
  BIKE: {
    maxWeight: 20,
    types: [
      { label: 'Documents & Envelopes', icon: '📄', desc: 'Papers, certificates & files' },
      { label: 'Food & Groceries', icon: '🍱', desc: 'Tiffin, takeaway & packed food' },
      { label: 'Clothes & Small Box', icon: '👕', desc: 'Apparel, shoes & gifts' },
      { label: 'Electronics & Gadgets', icon: '📱', desc: 'Phones, chargers & gadgets' },
      { label: 'Medicines & Urgent Items', icon: '💊', desc: 'Prescriptions & emergency care' },
      { label: 'Small Box / Gift Parcel', icon: '📦', desc: 'Compact parcels & pouches' }
    ]
  },
  AUTO: {
    maxWeight: 100,
    types: [
      { label: 'Cartons & Medium Boxes', icon: '📦', desc: 'Corrugated cartons & storage boxes' },
      { label: 'Home Appliances & TV', icon: '📺', desc: 'Microwaves, TVs & electronics' },
      { label: 'Catering & Bulk Food', icon: '🍲', desc: 'Catering vessels & event food' },
      { label: 'Retail & Commercial Stock', icon: '🛍️', desc: 'Inventory & boutique parcels' },
      { label: 'Tools & Hardware', icon: '🧰', desc: 'Machinery tools & supplies' },
      { label: 'Bulk Freight (up to 100kg)', icon: '📦', desc: 'Heavy boxes & medium freight' }
    ]
  },
  CAB: {
    maxWeight: 250,
    types: [
      { label: 'Luggage & Travel Bags', icon: '🧳', desc: 'Airport luggage, suitcases & gear' },
      { label: 'Electronics & Fragile Items', icon: '💻', desc: 'Monitors, PCs & sensitive equipment' },
      { label: 'Catering & Bulk Food Orders', icon: '🎂', desc: 'Party catering & bulk perishables' },
      { label: 'Retail Stock & Boutique Boxes', icon: '🛍️', desc: 'Apparel cartons & store goods' },
      { label: 'Urgent Secured Documents', icon: '📁', desc: 'Confidential files & legal packages' },
      { label: 'Car Boot Cargo (up to 250kg)', icon: '📦', desc: 'Sedan boot delivery' }
    ]
  },
  PREMIUM: {
    maxWeight: 450,
    types: [
      { label: 'Heavy Luggage & Family Travel', icon: '🧳', desc: 'Multiple large suitcases & sports gear' },
      { label: 'Event & Exhibition Equipment', icon: '🎪', desc: 'Banners, standees & audio setups' },
      { label: 'Bulk Wholesale Packages', icon: '📦', desc: 'Commercial boxes & distribution' },
      { label: 'Home Appliances & Decor', icon: '🛋️', desc: 'Small furniture, TVs & decor sets' },
      { label: 'Industrial Kits & Hardware', icon: '⚙️', desc: 'Specialized tools & components' },
      { label: 'Zaldi XL SUV Load (up to 450kg)', icon: '🚙', desc: 'Full SUV boot & rear cargo space' }
    ]
  },
  TRUCK: {
    maxWeight: 750,
    types: [
      { label: 'Commercial Cargo & Freight', icon: '🚛', desc: 'Wholesale goods & industrial cargo' },
      { label: 'Pallets & Warehouse Stock', icon: '📦', desc: 'Palletized goods & distribution' },
      { label: 'Home Furniture & Relocation', icon: '🛋️', desc: 'Sofas, beds & house shifting' },
      { label: 'Industrial Hardware & Tools', icon: '⚙️', desc: 'Heavy engineering equipment' },
      { label: 'Construction Materials', icon: '🧱', desc: 'Cement bags, tiles & paints' },
      { label: 'Mini Truck Full Load (up to 750kg)', icon: '🚚', desc: 'Full vehicle load transportation' }
    ]
  }
};

const VEHICLE_MAX_SEATS: Record<string, { max: number; label: string }> = {
  BIKE: { max: 1, label: '1 Rider allowed (Bike Solo)' },
  AUTO: { max: 3, label: 'Max 3 Seats' },
  CAB: { max: 4, label: 'Max 4 Seats' },
  PREMIUM: { max: 6, label: 'Max 6 Seats' },
  TRUCK: { max: 2, label: 'Max 2 Seats' }
};

interface CustomerAppProps {
  activeDriver: Driver;
  orders: RideOrder[];
  onNewOrder: (order: RideOrder) => void;
  onUpdateOrder: (orderId: string, updates: Partial<RideOrder>) => void;
  onSendMessage?: (orderId: string, sender: 'PASSENGER' | 'DRIVER', text: string) => void;
  onSwitchToCaptain?: () => void;
  activeTab?: CustomerTab;
  onTabChange?: (tab: CustomerTab) => void;
}

export const CustomerApp: React.FC<CustomerAppProps> = ({
  activeDriver,
  orders,
  onNewOrder,
  onUpdateOrder,
  onSendMessage,
  onSwitchToCaptain,
  activeTab,
  onTabChange
}) => {
  // Navigation & UI state
  const [customerTab, setCustomerTabState] = useState<CustomerTab>(activeTab || 'BOOKING');

  useEffect(() => {
    if (activeTab && activeTab !== customerTab) {
      setCustomerTabState(activeTab);
    }
  }, [activeTab]);

  const setCustomerTab = (tab: CustomerTab) => {
    setCustomerTabState(tab);
    onTabChange?.(tab);
  };

  const [isNightMode, setIsNightMode] = useState(false);
  const [activeInput, setActiveInput] = useState<'drop' | null>(null);
  const [locationPinType, setLocationPinType] = useState<LocationPinType>('character_pin');
  const [isDrawerExpanded, setIsDrawerExpanded] = useState<boolean>(false);
  const [locationSearchError, setLocationSearchError] = useState<string | null>(null);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [isResolvingPlace, setIsResolvingPlace] = useState(false);

  // Booking fields
  const [pickup, setPickup] = useState(DEFAULT_GPS_ADDRESS);
  const [drop, setDrop] = useState('');
  const [dropQuery, setDropQuery] = useState('');
  const [pickupPlace, setPickupPlace] = useState<SelectedPlace | null>(null);
  const [dropPlace, setDropPlace] = useState<SelectedPlace | null>(null);
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('AUTO');
  const [promoCode, setPromoCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'WALLET' | 'UPI' | 'CASH'>('WALLET');
  const [showPaymentsSheet, setShowPaymentsSheet] = useState(false);
  const [paymentsSheetPage, setPaymentsSheetPage] = useState<'PAYMENT' | 'COUPONS'>('PAYMENT');
  const [upiApp, setUpiApp] = useState('PhonePe');

  // Service Mode for all vehicles ('PERSON' | 'PARCEL')
  const [serviceModes, setServiceModes] = useState<Record<string, ServiceMode>>({
    BIKE: 'PERSON',
    AUTO: 'PERSON',
    CAB: 'PERSON',
    PREMIUM: 'PERSON',
    TRUCK: 'PARCEL'
  });

  // Parcel details per vehicle
  const [parcelTypes, setParcelTypes] = useState<Record<string, string>>({
    BIKE: 'Documents & Envelopes',
    AUTO: 'Cartons & Medium Boxes',
    CAB: 'Luggage & Travel Bags',
    PREMIUM: 'Heavy Luggage & Family Travel',
    TRUCK: 'Commercial Cargo & Freight'
  });
  const [isParcelDropdownOpen, setIsParcelDropdownOpen] = useState(false);
  const [customParcelInput, setCustomParcelInput] = useState('');
  const [parcelPhotos, setParcelPhotos] = useState<string[]>([]);
  const [parcelPhotoError, setParcelPhotoError] = useState<string | null>(null);
  const parcelPhotoInputRef = useRef<HTMLInputElement>(null);

  const [parcelWeights, setParcelWeights] = useState<Record<string, number>>({
    BIKE: 5,
    AUTO: 25,
    CAB: 35,
    PREMIUM: 70,
    TRUCK: 200
  });

  // Person Mode Passengers per vehicle (+ increases only one, - decreases only one)
  const [passengersByVehicle, setPassengersByVehicle] = useState<Record<string, number>>({
    BIKE: 1,
    AUTO: 1,
    CAB: 1,
    PREMIUM: 1,
    TRUCK: 1
  });

  // Wallet Balance
  const [walletBalance, setWalletBalance] = useState(480);
  const [isWalletOpen, setIsWalletOpen] = useState(false);

  // Search autocomplete
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const dropInputRef = useRef<HTMLInputElement>(null);
  const drawerScrollRef = useRef<HTMLDivElement>(null);
  const placeResolutionIdRef = useRef(0);

  // Active ride tracking
  const activeOrder = orders.find(o => 
    [
      'FINDING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_COMING', 'DRIVER_ARRIVED', 
      'TRIP_STARTED', 'TRIP_COMPLETED',
      'SEARCHING', 'MATCHED', 'ARRIVING', 'IN_PROGRESS'
    ].includes(o.status)
  ) || null;

  const unreadCaptainMessages = (activeOrder?.messages || []).filter(
    m => m.sender === 'DRIVER' && !m.readByPassenger
  ).length;
  const latestMessage = activeOrder?.messages && activeOrder.messages.length > 0 
    ? activeOrder.messages[activeOrder.messages.length - 1] 
    : null;

  // Rating state for completed ride
  const [selectedRating, setSelectedRating] = useState(5);
  const [driverTip, setDriverTip] = useState<number>(0);
  const [selectedCompliments, setSelectedCompliments] = useState<string[]>(['Polite Driver', 'Clean Vehicle']);

  // Modals
  const [showChat, setShowChat] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [showFareBreakdown, setShowFareBreakdown] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<(typeof PAST_RIDES_MOCK)[number] | null>(null);

  // Outstation selected booking modal state
  const [selectedOutstationPkg, setSelectedOutstationPkg] = useState<string | null>(null);
  const [outstationDays, setOutstationDays] = useState(2);

  // Carpool booked state
  const [joinedPoolId, setJoinedPoolId] = useState<string | null>(null);
  const [activeCarpoolDriver, setActiveCarpoolDriver] = useState<AvailableCarpoolDriver | null>(AVAILABLE_CARPOOL_DRIVERS[0]);
  const [activeCarpoolDriverPos, setActiveCarpoolDriverPos] = useState<{ x: number; y: number; headingDeg: number } | null>(null);
  const [isCarpoolMapFocused, setIsCarpoolMapFocused] = useState<boolean>(false);

  // Fixed Location Pin for Pickup Collection State (Screen-fixed pin, map moves underneath)
  const [showFixedPin, setShowFixedPin] = useState(true);
  const [fixedPinPos, setFixedPinPos] = useState(DEFAULT_GPS_COORDS);
  const [fixedPinAddress, setFixedPinAddress] = useState(DEFAULT_GPS_ADDRESS);
  const [locationToast, setLocationToast] = useState<string | null>(null);
  const [showSupportModal, setShowSupportModal] = useState<boolean>(false);
  const [bookingNoticeToast, setBookingNoticeToast] = useState<string | null>(null);

  // Map movement updates only the fixed-pin preview; it does not commit a ride address.
  const handleAddressResolved = (addr: string, center: { x: number; y: number }) => {
    setFixedPinAddress(addr);
    setFixedPinPos(center);
  };

  // Confirming a map pin commits its resolved address as a manual location selection.
  const handleConfirmLocation = (addr: string) => {
    sounds.playSuccess();
    setPickup(addr);
    setPickupPlace({ placeId: '', formattedAddress: addr, ...resolveAddressToGeoCoord(addr) });
    setFixedPinAddress(addr);
    setActiveInput(null);
    setSearchQuery('');
    if (!drop) {
      dropInputRef.current?.focus();
    }
  };

  // Return to Device's GPS Position
  const handleUseCurrentLocation = () => {
    sounds.playTap();
    setFixedPinPos(DEFAULT_GPS_COORDS);
    setFixedPinAddress(DEFAULT_GPS_ADDRESS);
    setPickup(DEFAULT_GPS_ADDRESS);
    setPickupPlace({ placeId: '', formattedAddress: DEFAULT_GPS_ADDRESS, ...resolveAddressToGeoCoord(DEFAULT_GPS_ADDRESS) });
    setActiveInput(null);
    setSearchQuery('');
  };

  // Selected vehicle object
  const selectedVehicle = VEHICLE_OPTIONS.find(v => v.id === selectedVehicleId) || VEHICLE_OPTIONS[0];

  // Active Service Mode for the selected vehicle ('PERSON' or 'PARCEL')
  const currentMode: ServiceMode = useMemo(() => {
    if (selectedVehicleId === 'TRUCK') return 'PARCEL';
    if (selectedVehicleId === 'CAB' || selectedVehicleId === 'PREMIUM') return 'PERSON';
    return serviceModes[selectedVehicleId] || 'PERSON';
  }, [selectedVehicleId, serviceModes]);

  // Active Tier Configuration based on selected vehicle and mode (in all bike, auto, cab, zaldi xl, mini truck)
  const activeTierConfig = useMemo(() => {
    const isParcel = currentMode === 'PARCEL';
    const parcelSpec = VEHICLE_PARCEL_SPECS[selectedVehicleId] || VEHICLE_PARCEL_SPECS.BIKE;
    return {
      id: selectedVehicle.id,
      name: isParcel ? `${selectedVehicle.name.split(' ')[0]} Parcel` : selectedVehicle.name,
      capacity: isParcel ? `Max ${parcelSpec.maxWeight} kg` : selectedVehicle.capacity,
      baseFare: 25,
      perKm: 8.0,
      etaMin: selectedVehicle.etaMin,
      icon: isParcel ? '📦' : selectedVehicle.icon,
      badge: selectedVehicle.badge,
      description: selectedVehicle.description
    };
  }, [selectedVehicleId, currentMode, selectedVehicle]);

  // Specific Captain matching the chosen vehicle tier
  const currentDriver = useMemo<Driver>(() => {
    if (selectedVehicleId === 'BIKE') return INITIAL_DRIVERS[0]; // Ravi (Bike)
    if (selectedVehicleId === 'AUTO') return INITIAL_DRIVERS[1]; // Vikram (Auto)
    if (selectedVehicleId === 'CAB' || selectedVehicleId === 'PREMIUM') return INITIAL_DRIVERS[2]; // Priya (Cab)
    if (selectedVehicleId === 'TRUCK') return INITIAL_DRIVERS[3]; // Suresh (Truck)
    return activeDriver;
  }, [selectedVehicleId, activeDriver]);

  // Real Road Routing Engine State (Google Maps Routes API & OSRM)
  const [routingEngine, setRoutingEngine] = useState<RoutingEngineType>('GOOGLE_MAPS_ROUTES_API');
  const [liveRoadRoute, setLiveRoadRoute] = useState<RoadRouteInfo | null>(null);
  const [isLoadingRoadRoute, setIsLoadingRoadRoute] = useState(false);
  const [roadRouteError, setRoadRouteError] = useState<string | null>(null);

  // Fetch authentic road network route from Google Maps Routes API or OSRM
  useEffect(() => {
    if (!pickupPlace || !dropPlace) {
      setLiveRoadRoute(null);
      setDistanceKm(0);
      setIsLoadingRoadRoute(false);
      setRoadRouteError(null);
      return;
    }
    let isMounted = true;
    setIsLoadingRoadRoute(true);
    setRoadRouteError(null);
    setLiveRoadRoute(null);
    setDistanceKm(0);

    fetchLiveRoadRoute(
      pickupPlace.formattedAddress,
      dropPlace.formattedAddress,
      routingEngine,
      pickupPlace,
      dropPlace
    )
      .then(res => {
        if (isMounted) {
          setLiveRoadRoute(res);
          setIsLoadingRoadRoute(false);
          if (res.totalDistanceKm > 0) {
            setDistanceKm(res.totalDistanceKm);
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsLoadingRoadRoute(false);
          setRoadRouteError('Could not calculate a road route. Please select the locations again and retry.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [pickupPlace, dropPlace, routingEngine]);

  const effectiveRoadRouteInfo = liveRoadRoute;
  const hasSelectedRoute = Boolean(
    pickupPlace && dropPlace && effectiveRoadRouteInfo && !isLoadingRoadRoute
  );

  // Extra luggage fee is removed for bike and auto passenger trips
  const extraLuggageFee = 0;

  // Detailed Fare Breakdown Calculation (Base Fare + Distance Charge + Taxes)
  // All vehicles have base fare ₹25, per-km charge ₹8.00, and 5% statutory GST
  const baseFareAmount = distanceKm > 0 ? 25 : 0;
  const distanceChargeAmount = distanceKm > 0 ? Math.round(distanceKm * 8) : 0;
  const taxAmount = distanceKm > 0 ? Math.max(1, Math.round((baseFareAmount + distanceChargeAmount) * 0.05)) : 0;
  const grossFare = baseFareAmount + distanceChargeAmount + taxAmount;
  const rawFare = grossFare;
  const finalCalculatedFare = distanceKm > 0 
    ? Math.max(rawFare - discountAmount, 15) 
    : 0;

  // Active specs for current vehicle
  const currentParcelSpec = VEHICLE_PARCEL_SPECS[selectedVehicleId] || VEHICLE_PARCEL_SPECS.BIKE;
  const currentParcelWeight = parcelWeights[selectedVehicleId] || 1;
  const currentParcelType = parcelTypes[selectedVehicleId] || currentParcelSpec.types[0].label;
  const currentParcelItem = currentParcelSpec.types.find(t => t.label === currentParcelType) || {
    label: currentParcelType,
    icon: '📦',
    desc: 'Custom cargo / parcel item'
  };
  const currentSeatSpec = VEHICLE_MAX_SEATS[selectedVehicleId] || VEHICLE_MAX_SEATS.BIKE;
  const currentPassengers = passengersByVehicle[selectedVehicleId] || 1;

  // Weight Limit Violations & Validation Checks for Parcels across all vehicles
  const isWeightExceeded = useMemo(() => {
    if (currentMode === 'PARCEL') {
      return currentParcelWeight > currentParcelSpec.maxWeight;
    }
    return false;
  }, [currentMode, currentParcelWeight, currentParcelSpec]);

  const weightExceededMessage = useMemo(() => {
    if (currentMode === 'PARCEL' && currentParcelWeight > currentParcelSpec.maxWeight) {
      return `${selectedVehicle.name} cannot carry parcels above ${currentParcelSpec.maxWeight} kg (Current: ${currentParcelWeight} kg).`;
    }
    return null;
  }, [currentMode, currentParcelWeight, currentParcelSpec, selectedVehicle]);

  // Search Google Places without changing the committed route while the user types.
  useEffect(() => {
    const query = searchQuery.trim();
    if (!activeInput || query.length < 2) {
      setSuggestions([]);
      setLocationSearchError(null);
      setIsSearchingPlaces(false);
      return;
    }

    let isActive = true;
    setSuggestions([]);
    setIsSearchingPlaces(true);
    const timer = window.setTimeout(() => {
      fetchPlacePredictions(query)
        .then(results => {
          if (isActive) {
            setSuggestions(results);
            setIsSearchingPlaces(false);
          }
        })
        .catch(error => {
          if (!isActive) return;
          setSuggestions([]);
          setIsSearchingPlaces(false);
          setLocationSearchError(error instanceof Error ? error.message : 'Location suggestions could not be loaded.');
        });
    }, 250);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
      setIsSearchingPlaces(false);
    };
  }, [activeInput, searchQuery]);

  // Real-time smooth driver animation effect advancing through all driver statuses
  useEffect(() => {
    if (!activeOrder) return;

    // 1. FINDING_DRIVER -> DRIVER_ASSIGNED after 2.4s
    if (activeOrder.status === 'FINDING_DRIVER' || activeOrder.status === 'SEARCHING') {
      const timer = setTimeout(() => {
        sounds.playSuccess();
        onUpdateOrder(activeOrder.id, { status: 'DRIVER_ASSIGNED', progressPercent: 0 });
      }, 2400);
      return () => clearTimeout(timer);
    }

    // 2. DRIVER_ASSIGNED -> DRIVER_COMING after 1.6s
    if (activeOrder.status === 'DRIVER_ASSIGNED') {
      const timer = setTimeout(() => {
        sounds.playPop();
        onUpdateOrder(activeOrder.id, { status: 'DRIVER_COMING', progressPercent: 0 });
      }, 1600);
      return () => clearTimeout(timer);
    }

    // 3. DRIVER_COMING: Smooth continuous progress along Driver -> Pickup route
    if (activeOrder.status === 'DRIVER_COMING') {
      const interval = setInterval(() => {
        const next = Math.min(100, +(activeOrder.progressPercent + 9.2).toFixed(1));
        if (next >= 100) {
          clearInterval(interval);
          sounds.playAlert();
          onUpdateOrder(activeOrder.id, { status: 'DRIVER_ARRIVED', progressPercent: 100 });
        } else {
          onUpdateOrder(activeOrder.id, { progressPercent: next });
        }
      }, 500);
      return () => clearInterval(interval);
    }

    // 4. DRIVER_ARRIVED -> auto transition to TRIP_STARTED after 3.8s (or rider boarding)
    if (activeOrder.status === 'DRIVER_ARRIVED') {
      const timer = setTimeout(() => {
        sounds.playPop();
        onUpdateOrder(activeOrder.id, { status: 'TRIP_STARTED', progressPercent: 0 });
      }, 3800);
      return () => clearTimeout(timer);
    }

    // 5. TRIP_STARTED / IN_PROGRESS: Smooth continuous progress along actual road route to destination
    if (activeOrder.status === 'TRIP_STARTED' || activeOrder.status === 'IN_PROGRESS') {
      const interval = setInterval(() => {
        const next = Math.min(100, +(activeOrder.progressPercent + 4.8).toFixed(1));
        if (next >= 100) {
          clearInterval(interval);
          sounds.playSuccess();
          onUpdateOrder(activeOrder.id, { status: 'TRIP_COMPLETED', progressPercent: 100 });
        } else {
          onUpdateOrder(activeOrder.id, { progressPercent: next });
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [activeOrder?.id, activeOrder?.status, activeOrder?.progressPercent, onUpdateOrder]);

  const handleSelectLocation = async (prediction: PlacePrediction) => {
    if (!activeInput) return;
    const requestId = ++placeResolutionIdRef.current;
    sounds.playPop();
    setSuggestions([]);
    setLocationSearchError(null);
    setIsResolvingPlace(true);
    try {
      const place = await fetchPlaceDetails(prediction.placeId);
      if (requestId !== placeResolutionIdRef.current) return;
      setDrop(place.formattedAddress);
      setDropQuery(place.formattedAddress);
      setDropPlace(place);
      setActiveInput(null);
      setSearchQuery('');
    } catch (error) {
      if (requestId === placeResolutionIdRef.current) {
        setLocationSearchError(error instanceof Error ? error.message : 'The selected address could not be loaded.');
      }
    } finally {
      if (requestId === placeResolutionIdRef.current) setIsResolvingPlace(false);
    }
  };

  const searchForLocation = (query: string) => {
    setActiveInput('drop');
    setSearchQuery(query);
    setLocationSearchError(null);
    setDropQuery(query);
    window.setTimeout(() => {
      dropInputRef.current?.focus();
    }, 0);
  };

  const handleApplyPromo = (code = promoCode) => {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      setPromoMessage('Enter a coupon code to apply.');
      return;
    }
    sounds.playPing();
    if (normalizedCode === 'ZALDI50' || normalizedCode === 'SAVE50') {
      setDiscountAmount(50);
      setPromoCode(normalizedCode);
      setPromoMessage(`Coupon ${normalizedCode} applied! ₹50 OFF.`);
    } else if (normalizedCode === 'FIRST') {
      setDiscountAmount(75);
      setPromoCode(normalizedCode);
      setPromoMessage('Coupon FIRST applied! ₹75 OFF.');
    } else {
      setPromoMessage('That coupon code is invalid. Check the code and try again.');
    }
  };

  const handleSelectPaymentMethod = (method: 'WALLET' | 'UPI' | 'CASH', app?: string) => {
    setPaymentMethod(method);
    if (method === 'UPI' && app) setUpiApp(app);
    sounds.playSuccess();
    setPaymentsSheetPage('PAYMENT');
    setShowPaymentsSheet(false);
  };

  // Start booking flow
  const handleConfirmBooking = () => {
    if (!pickupPlace || !dropPlace || !liveRoadRoute || isLoadingRoadRoute) return;
    if (currentMode === 'PARCEL' && parcelPhotos.length === 0) {
      setParcelPhotoError('At least one parcel photo is required before booking.');
      parcelPhotoInputRef.current?.click();
      return;
    }
    sounds.playAlert();

    const rideId = "TRP-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    const newRide: RideOrder = {
      id: rideId,
      customerName: "Akhil Nalla",
      customerPhone: "+91 98480-12345",
      pickup,
      drop,
      pickupPlaceId: pickupPlace.placeId || undefined,
      dropPlaceId: dropPlace.placeId || undefined,
      pickupCoordinates: { lat: pickupPlace.lat, lng: pickupPlace.lng },
      dropCoordinates: { lat: dropPlace.lat, lng: dropPlace.lng },
      distanceKm: effectiveRoadRouteInfo!.totalDistanceKm,
      fare: rawFare,
      discount: discountAmount,
      finalFare: finalCalculatedFare,
      vehicleTier: `${activeTierConfig.name} • ${currentMode === 'PARCEL' ? 'Parcel' : 'Person'}`,
      vehicleIcon: currentMode === 'PARCEL' ? '📦' : activeTierConfig.icon,
      driverId: currentDriver.id,
      riderPin: String(Math.floor(1000 + Math.random() * 9000)),
      status: 'FINDING_DRIVER',
      paymentMethod,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      progressPercent: 0,
      serviceMode: currentMode,
      parcelType: currentMode === 'PARCEL' ? currentParcelType : undefined,
      parcelWeightKg: currentMode === 'PARCEL' ? currentParcelWeight : undefined,
      parcelPhotos: currentMode === 'PARCEL' ? parcelPhotos : undefined,
      luggageWeightKg: undefined,
      extraLuggageFee: 0,
      messages: [
        tripChatBroadcaster.createMessage({
          orderId: rideId,
          sender: 'DRIVER',
          senderName: `${currentDriver.name} (Captain)`,
          text: `Hello! I have accepted your ride to ${drop}. Reaching your pickup spot in ~3 mins.`
        })
      ]
    };

    onNewOrder(newRide);
    if (currentMode === 'PARCEL') {
      setParcelPhotos([]);
      setParcelPhotoError(null);
    }
  };

  const handleCancelBooking = (orderId: string) => {
    sounds.playPop();
    onUpdateOrder(orderId, { status: 'CANCELLED' });
  };

  // Sheet height calculation
  const isHomeTab = customerTab === 'BOOKING';
  const getSheetHeight = () => {
    if (customerTab === 'CARPOOL') {
      return '0px';
    }
    if (customerTab === 'OUTSTATION' || customerTab === 'HISTORY' || customerTab === 'PROFILE') {
      return 'calc(100% - 62px - env(safe-area-inset-bottom, 0px))';
    }
    if (activeOrder) {
      if (['FINDING_DRIVER', 'SEARCHING'].includes(activeOrder.status)) return '380px';
      if (['DRIVER_ASSIGNED', 'DRIVER_COMING'].includes(activeOrder.status)) return '450px';
      if (activeOrder.status === 'DRIVER_ARRIVED') return '440px';
      if (['TRIP_STARTED', 'IN_PROGRESS', 'ARRIVING'].includes(activeOrder.status)) return '470px';
      if (['TRIP_COMPLETED', 'COMPLETED'].includes(activeOrder.status)) return '540px';
    }
    if (activeInput) return '85%';
    if (isDrawerExpanded) return '85%';
    if (drop && distanceKm > 0) return '70%';

    // Idle state: perfectly balanced top half map with 3D pin + bottom half booking options
    return '54%';
  };

  return (
    <div className="w-full h-[100svh] min-h-[100svh] max-h-[100svh] bg-white text-slate-900 flex flex-col font-sans overflow-hidden relative select-none">
      
      {/* Full-bleed Android Mobile Viewport */}
      <div className="relative w-full h-full flex-1 flex flex-col font-sans overflow-hidden bg-white">
        
        {/* Full-bleed Carpool Experience (Positioned seamlessly above bottom nav) */}
        {customerTab === 'CARPOOL' && (
          <div className="absolute inset-0 bottom-[calc(62px+env(safe-area-inset-bottom,0px))] z-30 bg-white flex flex-col overflow-hidden">
            <CarpoolSection
              currentAddress={pickup || fixedPinAddress || 'Hanamkonda, Warangal'}
              walletBalance={walletBalance}
              passengerDestination={drop || 'Hyderabad'}
              onDeductFare={(amt) => setWalletBalance(prev => Math.max(0, prev - amt))}
              onDriverChange={(driver, pos) => {
                setActiveCarpoolDriver(driver);
                setActiveCarpoolDriverPos(pos);
              }}
              onViewRouteOnMap={(driver) => {
                setActiveCarpoolDriver(driver);
                setIsCarpoolMapFocused(true);
                sounds.playPop();
              }}
              isMapFocused={isCarpoolMapFocused}
              onToggleMapFocus={() => setIsCarpoolMapFocused(prev => !prev)}
                onUpdatePickupLocation={(newAddr) => {
                setPickup(newAddr);
                  setPickupPlace(null);
                  setLiveRoadRoute(null);
                  setDistanceKm(0);
                  setFixedPinAddress(newAddr);
                }}
                onSelectDropoffLocation={(newDrop) => {
                  setDrop(newDrop);
                  setDropQuery(newDrop);
                  setDropPlace(null);
                  setLiveRoadRoute(null);
                  setDistanceKm(0);
                }}
              onBookCarpoolSuccess={(poolId) => {
                setJoinedPoolId(poolId);
              }}
              onSwitchTab={(tab) => {
                setCustomerTab(tab);
                sounds.playPop();
              }}
            />
          </div>
        )}

        {/* Map Background Area (Top 55-60%, expands when viewing carpool route) */}
        <div className={`absolute top-0 left-0 right-0 ${customerTab === 'CARPOOL' && isCarpoolMapFocused ? 'h-[78%]' : 'h-[62%]'} z-0 overflow-hidden transition-all duration-300`}>
          <InteractiveMap
            pickup={pickup || (customerTab === 'CARPOOL' ? 'Hanamkonda Bus Terminal' : (fixedPinAddress || DEFAULT_GPS_ADDRESS))}
            drop={drop || (customerTab === 'CARPOOL' ? 'Hyderabad' : '')}
            status={activeOrder?.status || 'IDLE'}
            progressPercent={activeOrder?.progressPercent || 0}
            vehicleTierName={activeOrder?.vehicleTier || activeTierConfig.name}
            selectedVehicleId={selectedVehicleId}
            vehicleIcon={activeOrder?.vehicleIcon || (currentMode === 'PARCEL' ? '📦' : activeTierConfig.icon)}
            driverName={currentDriver.name}
            driverPlate={currentDriver.plate}
            isNightMode={isNightMode}
            onToggleNightMode={() => setIsNightMode(!isNightMode)}
            showFixedPin={showFixedPin && !drop && !isCarpoolMapFocused && !joinedPoolId && customerTab !== 'CARPOOL'}
            showNearbyDrivers={customerTab === 'BOOKING'}
            fixedPinAddress={fixedPinAddress}
            fixedPinPos={fixedPinPos}
            onAddressResolved={handleAddressResolved}
            onConfirmLocation={handleConfirmLocation}
            onUseCurrentLocation={handleUseCurrentLocation}
            locationPinType={locationPinType}
            onChangePinType={setLocationPinType}
            onUpdatePickup={(newAddr) => {
              setPickup(newAddr);
              setPickupPlace({ placeId: '', formattedAddress: newAddr, ...resolveAddressToGeoCoord(newAddr) });
              setFixedPinAddress(newAddr);
              if (activeOrder) {
                onUpdateOrder(activeOrder.id, { pickup: newAddr });
              }
            }}
            carpoolRoutePolyline={customerTab === 'CARPOOL' ? activeCarpoolDriver?.routePolyline : undefined}
            carpoolStops={customerTab === 'CARPOOL' ? activeCarpoolDriver?.corridorStops : undefined}
            carpoolDriverPos={customerTab === 'CARPOOL' ? (activeCarpoolDriverPos || undefined) : undefined}
            carpoolDriverName={customerTab === 'CARPOOL' ? activeCarpoolDriver?.driverName : undefined}
            isCarpoolActive={customerTab === 'CARPOOL'}
            routingEngine={routingEngine}
            onRoutingEngineChange={setRoutingEngine}
            managedRoute
            managedRouteInfo={effectiveRoadRouteInfo}
            onSelectDropoffLocation={(newDrop) => {
              sounds.playSuccess();
              setDrop(newDrop);
              setDropQuery(newDrop);
              setDropPlace({ placeId: '', formattedAddress: newDrop, ...resolveAddressToGeoCoord(newDrop) });
            }}
          />

          {/* Carpool Live Map Focused Floating Bar */}
          {customerTab === 'CARPOOL' && isCarpoolMapFocused && activeCarpoolDriver && (
            <div className="absolute top-16 left-4 right-4 z-40 animate-in fade-in slide-in-from-top-2">
              <div className="bg-slate-900/95 backdrop-blur-md text-white px-3.5 py-2.5 rounded-2xl shadow-2xl border border-blue-500/50 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-black truncate">
                      {activeCarpoolDriver.driverName} • {activeCarpoolDriver.vehicle}
                    </div>
                    <div className="text-[10px] text-blue-300 font-semibold truncate">
                      {activeCarpoolDriver.from.split(' ')[0]} → {activeCarpoolDriver.to.split(' ')[0]}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    sounds.playPop();
                    setIsCarpoolMapFocused(false);
                  }}
                  className="px-2.5 py-1 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-[10px] flex-shrink-0 transition shadow-sm"
                >
                  Booking Details
                </button>
              </div>
            </div>
          )}

          {/* Top Brand Header Bar over Map (Safe-area aware for Android notch/status bar) */}
          <div className="absolute top-[max(env(safe-area-inset-top,0px),0.5rem)] left-0 right-0 px-3.5 sm:px-5 flex justify-between items-center z-30 pointer-events-none">
            <div className="flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 sm:px-3.5 py-1.5 rounded-2xl shadow-md border border-slate-200 pointer-events-auto">
              <div className="w-6 h-6 rounded-lg bg-brand-blue flex items-center justify-center font-black text-white text-xs shadow-md">
                Z
              </div>
              <span className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">
                Zaldi <span className="text-emerald-600 text-[10px] sm:text-xs font-semibold">Fast</span>
              </span>
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
              <button 
                onClick={() => setIsWalletOpen(true)}
                className="flex items-center gap-1.5 bg-white/95 backdrop-blur-md px-2.5 sm:px-3 py-1.5 rounded-2xl shadow-md border border-slate-200 text-xs font-bold text-slate-800 hover:border-blue-500 transition active:scale-95"
              >
                <Wallet className="w-3.5 h-3.5 text-brand-blue" />
                <span>₹{walletBalance}</span>
              </button>

              <button 
                onClick={() => setShowSafety(true)}
                title="Safety Shield"
                className="p-2 bg-white/95 backdrop-blur-md rounded-2xl shadow-md border border-slate-200 text-slate-700 hover:text-emerald-600 transition active:scale-95"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
              </button>
            </div>
          </div>

        </div>

        {/* Bottom Sheet Drawer */}
        <div
          className={`absolute left-0 right-0 w-full bg-white rounded-t-3xl shadow-[0_-15px_40px_rgba(0,0,0,0.1)] border-t border-slate-100 transition-all duration-300 ease-in-out z-20 flex flex-col ${
            customerTab === 'CARPOOL'
              ? 'hidden pointer-events-none'
              : (customerTab === 'OUTSTATION' || customerTab === 'HISTORY' || customerTab === 'PROFILE')
              ? 'h-[calc(100%-62px-env(safe-area-inset-bottom,0px))] max-h-full'
              : 'max-h-[calc(100%-70px-env(safe-area-inset-top,0px))]'
          }`}
          style={{ 
            height: customerTab === 'CARPOOL' ? '0px' : getSheetHeight(), 
            bottom: 'calc(62px + env(safe-area-inset-bottom, 0px))' 
          }}
        >
          {/* Pull Handle (Tap to expand/collapse) */}
          <div 
            onClick={() => {
              sounds.playTap();
              setIsDrawerExpanded(prev => !prev);
            }}
            className="w-12 h-1.5 bg-slate-300 hover:bg-slate-400 rounded-full mx-auto mt-2.5 mb-2 flex-shrink-0 cursor-pointer transition active:scale-95" 
            title="Tap to expand / collapse details"
          />

          <div ref={drawerScrollRef} className={`flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y px-3.5 sm:px-5 no-scrollbar relative text-slate-900 ${(currentMode === 'PERSON' || customerTab === 'CARPOOL') ? 'pb-2' : 'pb-6'}`} style={{ WebkitOverflowScrolling: 'touch' }}>
            
            {/* =========================================
                1. BOOKING TAB
               ========================================= */}
            {customerTab === 'BOOKING' && (
              <>
                {/* STATE A: IDLE / SELECTING ROUTE */}
                {!activeOrder && (
                  <div className="space-y-3 pt-0.5">
                    
                    {/* Destination search */}
                    <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-2.5 sm:p-3 relative shadow-xs space-y-2">
                      {/* Destination Input Row */}
                      <div className="flex items-center gap-2.5 bg-white border border-slate-200/90 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-rose-500/20 focus-within:border-rose-500 transition shadow-2xs">
                        <div className="w-3.5 h-3.5 rounded-sm bg-rose-500 border-2 border-white shadow-xs flex-shrink-0 ring-2 ring-rose-500/30" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[9px] font-black uppercase tracking-wider text-rose-600 leading-none">
                            Destination Point
                          </div>
                          <input 
                            ref={dropInputRef}
                            type="text" 
                            value={dropQuery}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && suggestions[0]) {
                                event.preventDefault();
                                void handleSelectLocation(suggestions[0]);
                              }
                            }}
                            onChange={(e) => {
                              const val = e.target.value;
                              setDropQuery(val);
                              setSearchQuery(val);
                              setLocationSearchError(null);
                            }}
                            onFocus={() => {
                              setActiveInput('drop');
                              setSearchQuery(dropQuery);
                            }}
                            placeholder="Where to Next ?"
                            className="w-full bg-transparent font-bold text-xs outline-none text-slate-900 placeholder:text-slate-400 truncate mt-0.5"
                          />
                        </div>

                        {/* Clear Drop Button */}
                        {drop && (
                          <button 
                            type="button"
                            onClick={() => {
                              sounds.playPop();
                              setDrop('');
                              setDropQuery('');
                              setDropPlace(null);
                              setLiveRoadRoute(null);
                              setDistanceKm(0);
                              dropInputRef.current?.focus();
                            }} 
                            title="Clear Drop"
                            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition flex-shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Autocomplete Dropdown */}
                      {activeInput && (suggestions.length > 0 || isSearchingPlaces || isResolvingPlace || locationSearchError) && (
                        <div className="absolute top-[102%] left-0 right-0 bg-white shadow-2xl border border-slate-200 rounded-2xl z-50 max-h-52 overflow-y-auto p-1 divide-y divide-slate-100 animate-in fade-in">
                          <div className="px-3 py-1.5 text-[10px] font-extrabold uppercase text-slate-400">
                            Select Destination
                          </div>
                          {isResolvingPlace && (
                            <div className="px-3 py-2 text-xs font-semibold text-slate-500">Loading selected address…</div>
                          )}
                          {isSearchingPlaces && !isResolvingPlace && (
                            <div role="status" className="px-3 py-2 text-xs font-semibold text-slate-500">Searching addresses…</div>
                          )}
                          {locationSearchError && (
                            <div role="alert" className="px-3 py-2 text-xs font-semibold text-rose-600">{locationSearchError}</div>
                          )}
                          {suggestions.map((place) => (
                            <button
                              type="button"
                              key={place.placeId}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => void handleSelectLocation(place)}
                              className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-slate-100 rounded-xl cursor-pointer transition"
                            >
                              <div className="p-1.5 rounded-lg bg-blue-50 text-brand-blue flex-shrink-0">
                                <Clock className="w-3.5 h-3.5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-slate-900 truncate">{place.primaryText}</div>
                                <div className="text-[10px] text-slate-500 truncate">{place.secondaryText || place.description}</div>
                              </div>
                            </button>
                          ))}
                          {suggestions.length > 0 && (
                            <div className="px-3 py-1 text-right text-[9px] font-semibold text-slate-400">
                              Powered by Google
                            </div>
                          )}
                          {!isSearchingPlaces && !isResolvingPlace && !locationSearchError && suggestions.length === 0 && searchQuery.trim().length >= 2 && (
                            <div className="px-3 py-2 text-xs font-semibold text-slate-500">No matching addresses found.</div>
                          )}
                        </div>
                      )}
                    </div>

                    {isLoadingRoadRoute && (
                      <div role="status" className="px-3 py-2 rounded-xl bg-blue-50 border border-blue-200 text-xs font-bold text-blue-700">
                        Calculating road route…
                      </div>
                    )}
                    {roadRouteError && (
                      <div role="alert" className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700 flex items-center justify-between gap-2">
                        <span>{roadRouteError}</span>
                        <button
                          type="button"
                          onClick={() => setPickupPlace(current => current ? { ...current } : current)}
                          className="flex-shrink-0 underline"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                    {hasSelectedRoute && effectiveRoadRouteInfo && (
                      <div className="grid grid-cols-3 gap-2 p-2.5 bg-white/80 border border-slate-200 rounded-2xl text-center">
                        <div className="min-w-0">
                          <div className="text-[10px] text-slate-500 font-semibold">Road Distance</div>
                          <div className="text-xs font-black text-slate-900 font-mono">{effectiveRoadRouteInfo.totalDistanceKm} km</div>
                        </div>
                        <div className="min-w-0 border-x border-slate-200">
                          <div className="text-[10px] text-slate-500 font-semibold">Travel Time</div>
                          <div className="text-xs font-black text-slate-900 font-mono">~{effectiveRoadRouteInfo.estimatedTravelTimeMin} min</div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] text-slate-500 font-semibold">Driver ETA</div>
                          <div className="text-xs font-black text-emerald-700 font-mono">{selectedVehicle.etaMin} min</div>
                        </div>
                      </div>
                    )}

                    {/* Quick Popular Destination Chips */}
                    {!drop && (
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                        <span className="text-[10px] font-bold text-slate-400 flex-shrink-0 pl-0.5">Quick:</span>
                        {MOCK_LOCATIONS.slice(0, 4).map((loc) => (
                          <button
                            key={loc.id}
                            onClick={() => searchForLocation(loc.name)}
                            className="flex-shrink-0 px-2.5 py-1 rounded-full bg-slate-100 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-[11px] font-semibold text-slate-700 hover:text-brand-blue transition flex items-center gap-1 shadow-2xs active:scale-95"
                          >
                            <MapPin className="w-3 h-3 text-brand-blue flex-shrink-0" />
                            <span>{loc.name.split(' ')[0]}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Location Confirmation Banner Toast */}
                    {locationToast && (
                      <div className="px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold animate-in fade-in">
                        <Check className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{locationToast}</span>
                      </div>
                    )}

                    {/* Quick Location Chips */}
                    {!pickup && !drop && (
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                        <button
                          onClick={handleUseCurrentLocation}
                          className="flex-shrink-0 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-800 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 transition flex items-center gap-1.5"
                        >
                          <Navigation className="w-3 h-3 text-emerald-500" />
                          <span>Use Current Location</span>
                        </button>
                        {MOCK_LOCATIONS.slice(0, 4).map((loc) => (
                          <button
                            key={loc.id}
                            onClick={() => searchForLocation(loc.name)}
                            className="flex-shrink-0 px-3 py-1.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-700 transition flex items-center gap-1.5 shadow-xs"
                          >
                            <MapPin className="w-3 h-3 text-brand-blue" />
                            <span>{loc.name.split(' ')[0]}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Vehicle Tier Horizontal Carousel */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-500 whitespace-nowrap py-0.5">
                        <span className="flex-shrink-0 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-[10px] font-black border border-cyan-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
                          <span>18 Captains Active</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="flex-shrink-0 text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1">
                            <span className="text-slate-700 dark:text-slate-200 font-bold">Est.Dist :</span>
                            <span className="font-black text-slate-950 dark:text-white">
                              {hasSelectedRoute ? `${distanceKm} kms` : '--'}
                            </span>
                          </span>
                          {hasSelectedRoute && (
                            <button
                              type="button"
                              onClick={() => {
                                sounds.playTap();
                                setShowFareBreakdown(true);
                              }}
                              className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-brand-blue border border-blue-200 text-[10px] font-black transition cursor-pointer shadow-2xs"
                              title="View detailed fare breakdown"
                            >
                              <Info className="w-3 h-3 text-brand-blue" />
                              <span>Fare Breakdown</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div role="group" aria-label="Vehicle options" className="flex gap-2 sm:gap-2.5 overflow-x-auto py-2.5 px-1 -mx-0.5 scroll-smooth">
                        {VEHICLE_OPTIONS.map((v) => {
                          const isSelected = selectedVehicleId === v.id;

                          // Consistent Equalized Pricing: Base ₹25 + ₹8.00/km + 5% GST
                          const hasRoute = hasSelectedRoute && distanceKm > 0;
                          const tierDistanceCharge = hasRoute ? Math.round(distanceKm * 8) : 0;
                          const tierTax = hasRoute ? Math.max(1, Math.round((25 + tierDistanceCharge) * 0.05)) : 0;
                          const tierFare = hasRoute 
                            ? Math.max(25 + tierDistanceCharge + tierTax - discountAmount, 15)
                            : null;

                          return (
                            <div 
                              key={v.id}
                              onClick={() => {
                                setSelectedVehicleId(v.id);
                                sounds.playPop();
                              }}
                              className={`group flex-shrink-0 w-[106px] sm:w-[114px] p-2.5 rounded-2xl border-2 flex flex-col items-center justify-center transition-all duration-200 cursor-pointer relative overflow-visible select-none bg-white ${
                                isSelected 
                                  ? 'border-brand-blue shadow-lg scale-[1.02] ring-2 ring-blue-500/20' 
                                  : 'border-slate-200 hover:border-slate-300 hover:scale-[1.01]'
                              }`}
                              style={{
                                backgroundColor: '#ffffff',
                                boxShadow: isSelected ? '0 10px 25px -5px rgba(0, 102, 255, 0.2), 0 8px 10px -6px rgba(0, 102, 255, 0.1)' : undefined
                              }}
                            >
                              {/* 5D Holographic Badge */}
                              {v.badge && (
                                <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-[8px] font-black text-white uppercase tracking-wider shadow-xs whitespace-nowrap z-10">
                                  {v.badge}
                                </span>
                              )}
                              
                              {/* 5D Vehicle Icon Container */}
                              <div className="w-12 h-12 mb-1 flex items-center justify-center relative bg-white rounded-xl">
                                <Vehicle5dIcon 
                                  type={v.id} 
                                  size={44} 
                                  isSelected={isSelected}
                                  showAura={false}
                                />
                              </div>

                              <span className="font-black text-xs text-slate-800 text-center leading-tight tracking-tight">
                                {v.name}
                              </span>

                              {/* Capacity: Mini truck is strictly commercial cargo max 750kg */}
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold text-center mt-0.5">
                                {v.id === 'TRUCK' ? 'Max 750 kg' : v.capacity}
                              </span>

                              {/* Price rate display: clicking opens detailed fare breakdown */}
                              {hasRoute && tierFare !== null && (
                                <div 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedVehicleId(v.id);
                                    sounds.playTap();
                                    setShowFareBreakdown(true);
                                  }}
                                  className="flex items-center justify-center gap-1 mt-1.5 pt-1.5 border-t border-slate-100 w-full group/fare hover:text-brand-blue transition"
                                  title="Click to view detailed fare breakdown"
                                >
                                  <span className="font-black text-xs text-slate-900 group-hover/fare:text-brand-blue">
                                    ₹{tierFare}
                                  </span>
                                  <Info className="w-2.5 h-2.5 text-slate-400 group-hover/fare:text-brand-blue" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ====================================================
                        SERVICE MODE CONTROLS (RIDE vs TRANSPORT FOR ALL VEHICLES)
                       ==================================================== */}
                    <div className="space-y-3 p-3.5 bg-white rounded-2xl border border-slate-200 shadow-xs animate-in fade-in">
                      
                      {/* Services Header & Ride (Person) vs Transport (Parcel) Segmented Controls */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-black text-slate-900 flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5 text-brand-blue" />
                            <span>Services:</span>
                          </span>
                        </div>

                        {selectedVehicleId === 'TRUCK' ? (
                          // For Mini Truck: strictly dedicated to Commercial Cargo / Freight
                          <div className="bg-white px-3 py-1.5 rounded-xl border border-amber-300/80 shadow-xs flex items-center gap-1.5 text-xs font-black text-amber-700 dark:text-amber-300">
                            <Package className="w-3.5 h-3.5 text-amber-500" />
                            <span>Cargo Freight & Transport (Max 750 kg)</span>
                          </div>
                        ) : (
                          <div className="bg-white p-0.5 rounded-xl flex items-center gap-1 border border-slate-200 flex-shrink-0 shadow-xs">
                              <button
                                type="button"
                                onClick={() => {
                                  sounds.playPop();
                                  setServiceModes(prev => ({ ...prev, [selectedVehicleId]: 'PERSON' }));
                                }}
                                className={`py-1.5 px-3 rounded-lg text-xs font-black flex items-center gap-1.5 transition ${
                                  currentMode === 'PERSON'
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                <User className="w-3.5 h-3.5" />
                                <span>Ride</span>
                              </button>

                              {selectedVehicleId !== 'CAB' && selectedVehicleId !== 'PREMIUM' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    sounds.playPop();
                                    setServiceModes(prev => ({ ...prev, [selectedVehicleId]: 'PARCEL' }));
                                  }}
                                  className={`py-1.5 px-3 rounded-lg text-xs font-black flex items-center gap-1.5 transition ${
                                    currentMode === 'PARCEL'
                                      ? 'bg-amber-500 text-white shadow-md'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  <Package className="w-3.5 h-3.5" />
                                  <span>Transport</span>
                                  <span className="text-[9px] px-1 py-0.2 rounded bg-amber-400/20 text-amber-200 font-bold">
                                    Max {currentParcelSpec.maxWeight}kg
                                  </span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                      {/* Transport (Parcel) Service Options for all vehicles */}
                      {currentMode === 'PARCEL' && (
                        <div className="space-y-3 pt-1 border-t border-slate-200/80 dark:border-slate-700/60">
                          {/* Type of Parcel / Cargo Dropdown Selector */}
                          <div className="space-y-2 bg-white dark:bg-slate-900/90 p-3 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-xs relative">
                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300">
                              <span className="flex items-center gap-1">
                                <Package className="w-3.5 h-3.5 text-amber-500" />
                                <span>Type of Parcel / Cargo:</span>
                              </span>
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold bg-white px-2 py-0.5 rounded-full border border-amber-300 shadow-xs">
                                {currentParcelSpec.types.length} Types
                              </span>
                            </div>

                            {/* Dropdown Container */}
                            <div className="relative">
                              {/* Dropdown Trigger Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  sounds.playTap();
                                  setIsParcelDropdownOpen(true);
                                }}
                                className="w-full p-2.5 sm:p-3 rounded-2xl border-2 transition flex items-center justify-between gap-2 shadow-xs text-left bg-white hover:bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-amber-400"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-8 h-8 rounded-xl bg-white border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center text-base flex-shrink-0 shadow-xs">
                                    {currentParcelItem.icon}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                      <span>Parcel Type</span>
                                      <span className="w-1 h-1 rounded-full bg-amber-400"></span>
                                      <span className="text-amber-600 dark:text-amber-400">{selectedVehicle.name}</span>
                                    </div>
                                    <div className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                                      {currentParcelType}
                                    </div>
                                    {currentParcelItem.desc && (
                                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">
                                        {currentParcelItem.desc}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="px-2 py-0.5 rounded-md bg-white border border-amber-300 text-amber-700 dark:text-amber-300 font-extrabold text-[10px] hidden xs:inline-block shadow-xs">
                                    Select
                                  </span>
                                  <div className="w-6 h-6 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 shadow-xs">
                                    <ChevronDown className="w-4 h-4 text-slate-500" />
                                  </div>
                                </div>
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-800 dark:bg-amber-950/20">
                            <input
                              ref={parcelPhotoInputRef}
                              type="file"
                              accept="image/*"
                              capture="environment"
                              multiple
                              className="hidden"
                              aria-label="Take or add parcel photos"
                              onChange={async event => {
                                const input = event.currentTarget;
                                const files = Array.from(input.files || []);
                                input.value = '';
                                if (files.length === 0) return;
                                if (files.some(file => !file.type.startsWith('image/'))) {
                                  setParcelPhotoError('Please select valid parcel photos.');
                                  return;
                                }

                                const readPhoto = (file: File) => new Promise<string>((resolve, reject) => {
                                  const reader = new FileReader();
                                  reader.onerror = () => reject(new Error('Could not read a parcel photo.'));
                                  reader.onload = () => {
                                    if (typeof reader.result === 'string') resolve(reader.result);
                                    else reject(new Error('Could not load a parcel photo.'));
                                  };
                                  reader.readAsDataURL(file);
                                });

                                try {
                                  const photos = await Promise.all(files.map(readPhoto));
                                  setParcelPhotos(prev => [...prev, ...photos]);
                                  setParcelPhotoError(null);
                                } catch {
                                  setParcelPhotoError('Could not read the selected parcel photos. Please try again.');
                                }
                              }}
                            />
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 dark:text-white">
                                  <Camera className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                  Parcel photo <span className="text-rose-600">Required</span>
                                </div>
                                <p className="mt-0.5 text-[10px] text-slate-500">
                                  Add one or more clear photos so the captain can identify your parcel.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setParcelPhotoError(null);
                                  parcelPhotoInputRef.current?.click();
                                }}
                                className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-white transition hover:bg-amber-600"
                              >
                                <Camera className="h-3.5 w-3.5" />
                                {parcelPhotos.length > 0 ? 'Add photos' : 'Take photo'}
                              </button>
                            </div>
                            {parcelPhotos.length > 0 && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                                  <CheckCircle2 className="h-4 w-4" />
                                  {parcelPhotos.length} photo{parcelPhotos.length === 1 ? '' : 's'} attached to delivery
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {parcelPhotos.map((photo, index) => (
                                    <div key={`${index}-${photo.slice(0, 32)}`} className="relative">
                                      <img
                                        src={photo}
                                        alt={`Parcel photo ${index + 1}`}
                                        className="h-16 w-16 rounded-lg object-cover"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setParcelPhotos(prev => prev.filter((_, photoIndex) => photoIndex !== index))}
                                        className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-900 p-1 text-white"
                                        aria-label={`Remove parcel photo ${index + 1}`}
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {parcelPhotoError && (
                              <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                                {parcelPhotoError}
                              </p>
                            )}
                          </div>

                          {/* Weight Selector & Limit Validation (Deleted for Bike) */}
                          {selectedVehicleId !== 'BIKE' && (
                            <div className="space-y-2 bg-white dark:bg-slate-900/90 p-3 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-xs">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-white">
                                  <Scale className="w-3.5 h-3.5 text-amber-500" />
                                  <span>Weight:</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-base font-black text-slate-900 dark:text-white">
                                    {currentParcelWeight} kg
                                  </span>
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                    currentParcelWeight > currentParcelSpec.maxWeight
                                      ? 'bg-white text-rose-600 border border-rose-400 shadow-xs animate-pulse'
                                      : 'bg-white text-emerald-600 border border-emerald-400 shadow-xs'
                                  }`}>
                                    Limit: Max {currentParcelSpec.maxWeight} kg
                                  </span>
                                </div>
                              </div>

                              {/* Stepper (+ increase only one, - decrease only one) */}
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    sounds.playPop();
                                    setParcelWeights(prev => ({
                                      ...prev,
                                      [selectedVehicleId]: Math.max(1, (prev[selectedVehicleId] || 1) - 1)
                                    }));
                                  }}
                                  disabled={currentParcelWeight <= 1}
                                  className="w-8 h-8 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-black text-slate-700 dark:text-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition shadow-xs"
                                  title="Decrease only one kg (-1)"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>

                                <input 
                                  type="range"
                                  min={1}
                                  max={currentParcelSpec.maxWeight}
                                  step={1}
                                  value={currentParcelWeight}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setParcelWeights(prev => ({
                                      ...prev,
                                      [selectedVehicleId]: Math.min(currentParcelSpec.maxWeight, Math.max(1, val))
                                    }));
                                  }}
                                  className="flex-1 accent-amber-500 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                                />

                                <button
                                  type="button"
                                  onClick={() => {
                                    sounds.playPop();
                                    setParcelWeights(prev => ({
                                      ...prev,
                                      [selectedVehicleId]: Math.min(currentParcelSpec.maxWeight, (prev[selectedVehicleId] || 1) + 1)
                                    }));
                                  }}
                                  disabled={currentParcelWeight >= currentParcelSpec.maxWeight}
                                  className="w-8 h-8 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-black text-slate-700 dark:text-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition shadow-xs"
                                  title="Increase only one kg (+1)"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Person (Ride) Mode Options for Bike & Auto (Deleted for Car & Zaldi XL per request) */}
                      {currentMode === 'PERSON' && selectedVehicleId !== 'CAB' && selectedVehicleId !== 'PREMIUM' && (
                        <div className="space-y-3 pt-1 border-t border-slate-200/80">
                          <div className="p-3 bg-slate-50/90 rounded-2xl border border-slate-200 space-y-2.5">
                            {/* Vehicle Tier Ride Details Header */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-base shadow-2xs flex-shrink-0">
                                  {selectedVehicle.icon}
                                </span>
                                <div className="min-w-0">
                                  <span className="text-xs font-black text-slate-900 block leading-tight truncate">
                                    {selectedVehicle.name} • Ride Options
                                  </span>
                                  <span className="text-[10px] text-slate-500 block truncate">
                                    {selectedVehicleId === 'BIKE' && 'Solo rider • Helmet provided • Fast transit'}
                                    {selectedVehicleId === 'AUTO' && 'Up to 3 passengers • Direct city route'}
                                    {selectedVehicleId === 'TRUCK' && 'Up to 2 passengers with cargo'}
                                  </span>
                                </div>
                              </div>
                              
                              {/* Passenger Counter for multi-passenger vehicles (Auto) */}
                              {selectedVehicleId !== 'BIKE' && selectedVehicleId !== 'TRUCK' ? (
                                <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-xl border border-slate-200 shadow-2xs flex-shrink-0">
                                  <span className="text-[10px] font-bold text-slate-500">Seats:</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      sounds.playPop();
                                      setPassengersByVehicle(prev => ({
                                        ...prev,
                                        [selectedVehicleId]: Math.max(1, (prev[selectedVehicleId] || 1) - 1)
                                      }));
                                    }}
                                    disabled={(passengersByVehicle[selectedVehicleId] || 1) <= 1}
                                    className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center font-black text-slate-700 text-xs transition"
                                    title="Decrease passenger count"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="font-black text-xs text-slate-900 w-4 text-center">
                                    {passengersByVehicle[selectedVehicleId] || 1}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      sounds.playPop();
                                      const maxSeats = currentSeatSpec.max;
                                      setPassengersByVehicle(prev => ({
                                        ...prev,
                                        [selectedVehicleId]: Math.min(maxSeats, (prev[selectedVehicleId] || 1) + 1)
                                      }));
                                    }}
                                    disabled={(passengersByVehicle[selectedVehicleId] || 1) >= currentSeatSpec.max}
                                    className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center font-black text-slate-700 text-xs transition"
                                    title="Increase passenger count"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-brand-blue text-[10px] font-black flex-shrink-0">
                                  {selectedVehicleId === 'BIKE' ? '1 Rider (Solo)' : '2 Riders Max'}
                                </span>
                              )}
                            </div>

                            {/* Ride Feature Badges */}
                            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
                              {selectedVehicleId === 'BIKE' && (
                                <>
                                  <span className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-[10px] font-bold flex items-center gap-1 flex-shrink-0 shadow-2xs">
                                    ⛑️ Helmet Provided
                                  </span>
                                  <span className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-[10px] font-bold flex items-center gap-1 flex-shrink-0 shadow-2xs">
                                    ⚡ Zero Traffic Delay
                                  </span>
                                  <span className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-[10px] font-bold flex items-center gap-1 flex-shrink-0 shadow-2xs">
                                    💰 Most Economical
                                  </span>
                                </>
                              )}
                              {selectedVehicleId === 'AUTO' && (
                                <>
                                  <span className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-[10px] font-bold flex items-center gap-1 flex-shrink-0 shadow-2xs">
                                    🛺 3-Seater Auto
                                  </span>
                                  <span className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-[10px] font-bold flex items-center gap-1 flex-shrink-0 shadow-2xs">
                                    ⏱️ Quick Nearby Pickup
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Prominent Highway Carpool Quick Access Banner */}
                    <div
                      onClick={() => {
                        sounds.playSuccess();
                        setCustomerTab('CARPOOL');
                      }}
                      className="p-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-slate-900 text-white rounded-2xl shadow-md border border-emerald-500/40 flex items-center justify-between cursor-pointer hover:shadow-lg hover:scale-[1.01] transition group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center text-lg flex-shrink-0 border border-white/20 shadow-inner">
                          🚗
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-400 text-slate-950 px-2 py-0.5 rounded-full shadow-2xs">
                              HIGHWAY CARPOOL
                            </span>
                            <span className="text-[10px] text-emerald-200 font-bold">Warangal ⇄ Hyderabad Corridor</span>
                          </div>
                          <p className="text-xs font-black text-white mt-0.5 truncate">
                            Share rides, pick intermediate stops & save up to 70% • From ₹80
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-xs font-black text-emerald-300 group-hover:translate-x-1 transition flex-shrink-0 pl-2">
                        <span>Open Hub</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </div>

                  </div>
                )}

                {/* 1. FINDING DRIVER */}
                {activeOrder && (activeOrder.status === 'FINDING_DRIVER' || activeOrder.status === 'SEARCHING') && (
                  <div className="flex flex-col items-center justify-center py-5 text-center space-y-4 animate-in fade-in">
                    <div className="relative flex items-center justify-center w-20 h-20">
                      <div className="w-16 h-16 rounded-2xl bg-white border-2 border-brand-blue flex items-center justify-center shadow-lg">
                        <Vehicle3dIcon type={activeOrder.vehicleTier} size={46} className="filter drop-shadow-md" />
                      </div>
                    </div>
                    <div>
                      <h3 className="font-black text-lg text-slate-900 dark:text-white">Finding Driver...</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Connecting with nearby available captains</p>
                    </div>
                    <div className="w-full max-w-xs bg-slate-100 dark:bg-slate-800 p-3 rounded-2xl text-xs space-y-1.5">
                      <div className="flex justify-between font-medium text-slate-500">
                        <span>Pickup:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[170px]">{activeOrder.pickup}</span>
                      </div>
                      <div className="flex justify-between font-medium text-slate-500">
                        <span>Destination:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[170px]">{activeOrder.drop}</span>
                      </div>
                      {activeOrder.serviceMode === 'PARCEL' && (
                        <div className="flex justify-between font-medium text-amber-600 dark:text-amber-400">
                          <span>Transport Item:</span>
                          <span className="font-bold truncate max-w-[170px]">{activeOrder.parcelType} ({activeOrder.parcelWeightKg} kg)</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center font-medium text-slate-500 pt-1 border-t border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-1.5">
                          <span>Estimated Fare:</span>
                          <button
                            type="button"
                            onClick={() => { sounds.playTap(); setShowFareBreakdown(true); }}
                            className="text-[10px] text-brand-blue font-bold hover:underline flex items-center gap-0.5 cursor-pointer"
                            title="View detailed fare breakdown"
                          >
                            <Info className="w-2.5 h-2.5" />
                            <span>Breakdown</span>
                          </button>
                        </div>
                        <span className="font-black text-emerald-500 text-sm">₹{activeOrder.finalFare}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleCancelBooking(activeOrder.id)}
                      className="text-xs font-bold text-rose-500 hover:text-rose-600 underline"
                    >
                      Cancel Search
                    </button>
                  </div>
                )}

                {/* 2. DRIVER ASSIGNED */}
                {activeOrder && activeOrder.status === 'DRIVER_ASSIGNED' && (
                  <div className="space-y-4 pt-1 animate-in fade-in">
                    <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 rounded-2xl p-3">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                          Driver Assigned
                        </span>
                        <div className="text-xs font-bold text-slate-800 dark:text-white mt-0.5">
                          Captain matched! Preparing departure
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-black">
                        ✓
                      </div>
                    </div>

                    {/* Driver Card */}
                    <div className="flex items-center gap-3.5 p-3.5 bg-slate-50 dark:bg-slate-800/70 rounded-2xl border border-slate-200 dark:border-slate-700/80">
                      <div className="w-12 h-12 rounded-2xl bg-brand-blue/20 border-2 border-brand-blue/40 flex items-center justify-center font-black text-lg text-brand-blue flex-shrink-0">
                        {currentDriver.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="font-black text-sm text-slate-900 dark:text-white truncate">{currentDriver.name}</h4>
                          <div className="flex items-center gap-1 text-xs font-black text-amber-500">
                            <Star className="w-3.5 h-3.5 fill-amber-500" />
                            <span>{currentDriver.rating}</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{currentDriver.vehicleModel}</p>
                        <div className="inline-block mt-1 px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-[10px] font-bold text-slate-800 dark:text-slate-200">
                          {currentDriver.plate}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. DRIVER COMING */}
                {activeOrder && activeOrder.status === 'DRIVER_COMING' && (
                  <div className="space-y-4 pt-1 animate-in fade-in">
                    <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/80 rounded-2xl p-3">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-brand-blue">
                          Driver Coming
                        </span>
                        <div className="text-xs font-bold text-slate-800 dark:text-white mt-0.5">
                          En route to pickup (~2 mins away)
                        </div>
                      </div>
                      <div className="text-right bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-700/60 shadow-sm">
                        <div className="text-[9px] font-extrabold uppercase text-slate-400">Rider PIN</div>
                        <div className="text-sm font-black font-mono text-brand-blue tracking-widest">{activeOrder.riderPin}</div>
                      </div>
                    </div>

                    {/* Driver Card */}
                    <div className="flex items-center gap-3.5 p-3.5 bg-slate-50 dark:bg-slate-800/70 rounded-2xl border border-slate-200 dark:border-slate-700/80">
                      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                        <Vehicle3dIcon type={activeOrder.vehicleTier || selectedVehicle.name} size={38} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="font-black text-sm text-slate-900 dark:text-white truncate">{currentDriver.name}</h4>
                          <div className="flex items-center gap-1 text-xs font-black text-amber-500">
                            <Star className="w-3.5 h-3.5 fill-amber-500" />
                            <span>{currentDriver.rating}</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{currentDriver.vehicleModel}</p>
                        <div className="inline-block mt-1 px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-[10px] font-bold text-slate-800 dark:text-slate-200">
                          {currentDriver.plate}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => setShowCall(true)} className="py-2.5 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-emerald-100 transition">
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call</span>
                      </button>
                      <button onClick={() => setShowChat(true)} className="py-2.5 px-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-brand-blue dark:text-blue-400 border border-blue-200 dark:border-blue-800 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-blue-100 transition relative">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Chat</span>
                        {unreadCaptainMessages > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white font-mono text-[9px] font-black animate-pulse">
                            {unreadCaptainMessages}
                          </span>
                        )}
                      </button>
                      <button onClick={() => setShowSafety(true)} className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-slate-200 transition">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Safety</span>
                      </button>
                    </div>

                    {/* Cockpit In-Line Live Messaging Strip */}
                    <div 
                      onClick={() => setShowChat(true)}
                      className="p-2.5 rounded-2xl bg-blue-50/90 dark:bg-slate-850 dark:bg-slate-800/80 border border-blue-200/80 dark:border-slate-700/80 flex items-center justify-between cursor-pointer hover:bg-blue-100/60 transition shadow-xs group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-xl bg-blue-600/10 text-brand-blue flex items-center justify-center flex-shrink-0 relative">
                          <MessageSquare className="w-3.5 h-3.5" />
                          {unreadCaptainMessages > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                          )}
                        </div>
                        <div className="min-w-0 text-left">
                          <div className="text-[11px] font-black text-slate-800 dark:text-white flex items-center gap-1.5 truncate">
                            <span>Chat with Captain {currentDriver.name}</span>
                            {unreadCaptainMessages > 0 && (
                              <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[9px] font-bold">New</span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {latestMessage 
                              ? `${latestMessage.senderName}: "${latestMessage.text}"` 
                              : 'Tap to send pickup landmarks or notes...'}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black text-brand-blue group-hover:translate-x-0.5 transition flex-shrink-0 ml-2">
                        Open →
                      </span>
                    </div>

                    {/* Approach Progress */}
                    <div className="space-y-1 bg-slate-100 dark:bg-slate-800/50 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700/60">
                      <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                        <span>Captain Approach to Pickup</span>
                        <span className="font-bold text-slate-800 dark:text-white">{activeOrder.progressPercent}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-blue transition-all duration-300 ease-linear" style={{ width: `${activeOrder.progressPercent}%` }}></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. DRIVER ARRIVED */}
                {activeOrder && activeOrder.status === 'DRIVER_ARRIVED' && (
                  <div className="space-y-4 pt-1 animate-in fade-in">
                    <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 rounded-2xl p-3">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                          Driver Arrived
                        </span>
                        <div className="text-xs font-bold text-slate-800 dark:text-white mt-0.5">
                          Captain has arrived at your pickup spot!
                        </div>
                      </div>
                      <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center text-lg shadow-md animate-bounce">
                        📍
                      </div>
                    </div>

                    {/* Prominent OTP Card */}
                    <div className="p-3.5 bg-slate-900 border border-slate-700 rounded-2xl text-center space-y-1 shadow-lg">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Share this PIN with Captain
                      </span>
                      <div className="text-2xl font-black font-mono tracking-widest text-emerald-400">
                        {activeOrder.riderPin}
                      </div>
                      <p className="text-[10px] text-slate-400">Trip will start as soon as OTP is shared</p>
                    </div>

                    {/* Driver Card */}
                    <div className="flex items-center gap-3.5 p-3.5 bg-slate-50 dark:bg-slate-800/70 rounded-2xl border border-slate-200 dark:border-slate-700/80">
                      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                        <Vehicle3dIcon type={activeOrder.vehicleTier || selectedVehicle.name} size={38} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="font-black text-sm text-slate-900 dark:text-white truncate">{currentDriver.name}</h4>
                          <div className="flex items-center gap-1 text-xs font-black text-amber-500">
                            <Star className="w-3.5 h-3.5 fill-amber-500" />
                            <span>{currentDriver.rating}</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{currentDriver.vehicleModel}</p>
                        <div className="inline-block mt-1 px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-[10px] font-bold text-slate-800 dark:text-slate-200">
                          {currentDriver.plate}
                        </div>
                      </div>
                    </div>

                    {/* Actions in Arrived State */}
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => setShowCall(true)} className="py-2.5 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-emerald-100 transition">
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call</span>
                      </button>
                      <button onClick={() => setShowChat(true)} className="py-2.5 px-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-brand-blue dark:text-blue-400 border border-blue-200 dark:border-blue-800 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-blue-100 transition relative">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Chat</span>
                        {unreadCaptainMessages > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white font-mono text-[9px] font-black animate-pulse">
                            {unreadCaptainMessages}
                          </span>
                        )}
                      </button>
                      <button onClick={() => setShowSafety(true)} className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-slate-200 transition">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Safety</span>
                      </button>
                    </div>

                    {/* Cockpit In-Line Live Messaging Strip */}
                    <div 
                      onClick={() => setShowChat(true)}
                      className="p-2.5 rounded-2xl bg-blue-50/90 dark:bg-slate-850 dark:bg-slate-800/80 border border-blue-200/80 dark:border-slate-700/80 flex items-center justify-between cursor-pointer hover:bg-blue-100/60 transition shadow-xs group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-xl bg-blue-600/10 text-brand-blue flex items-center justify-center flex-shrink-0 relative">
                          <MessageSquare className="w-3.5 h-3.5" />
                          {unreadCaptainMessages > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                          )}
                        </div>
                        <div className="min-w-0 text-left">
                          <div className="text-[11px] font-black text-slate-800 dark:text-white flex items-center gap-1.5 truncate">
                            <span>Chat with Captain {currentDriver.name}</span>
                            {unreadCaptainMessages > 0 && (
                              <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[9px] font-bold">New</span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {latestMessage 
                              ? `${latestMessage.senderName}: "${latestMessage.text}"` 
                              : 'Captain waiting at pickup spot. Tap to message...'}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black text-brand-blue group-hover:translate-x-0.5 transition flex-shrink-0 ml-2">
                        Open →
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        sounds.playPop();
                        onUpdateOrder(activeOrder.id, { status: 'TRIP_STARTED', progressPercent: 0 });
                      }}
                      className="w-full py-3.5 rounded-2xl bg-brand-blue hover:bg-blue-600 text-white font-black text-sm shadow-xl shadow-blue-600/30 transition flex items-center justify-center gap-2"
                    >
                      <span>Start Trip Now</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* 5. TRIP STARTED */}
                {activeOrder && (activeOrder.status === 'TRIP_STARTED' || activeOrder.status === 'IN_PROGRESS' || activeOrder.status === 'ARRIVING') && (
                  <div className="space-y-4 pt-1 animate-in fade-in">
                    <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/80 rounded-2xl p-3">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-brand-blue">
                          Trip Started
                        </span>
                        <div className="text-xs font-bold text-slate-800 dark:text-white mt-0.5">
                          En route along actual road network
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-emerald-400">
                        <Navigation className="w-3 h-3 animate-spin" />
                        <span>42 km/h</span>
                      </div>
                    </div>

                    {/* Driver Card */}
                    <div className="flex items-center gap-3.5 p-3.5 bg-slate-50 dark:bg-slate-800/70 rounded-2xl border border-slate-200 dark:border-slate-700/80">
                      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                        <Vehicle3dIcon type={activeOrder.vehicleTier || selectedVehicle.name} size={38} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="font-black text-sm text-slate-900 dark:text-white truncate">{currentDriver.name}</h4>
                          <div className="flex items-center gap-1 text-xs font-black text-amber-500">
                            <Star className="w-3.5 h-3.5 fill-amber-500" />
                            <span>{currentDriver.rating}</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{currentDriver.vehicleModel}</p>
                        <div className="inline-block mt-1 px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-[10px] font-bold text-slate-800 dark:text-slate-200">
                          {currentDriver.plate}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => setShowCall(true)} className="py-2.5 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-bold text-xs flex items-center justify-center gap-1.5">
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call</span>
                      </button>
                      <button onClick={() => setShowChat(true)} className="py-2.5 px-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-brand-blue dark:text-blue-400 border border-blue-200 dark:border-blue-800 font-bold text-xs flex items-center justify-center gap-1.5 relative">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Chat</span>
                        {unreadCaptainMessages > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white font-mono text-[9px] font-black animate-pulse">
                            {unreadCaptainMessages}
                          </span>
                        )}
                      </button>
                      <button onClick={() => setShowSafety(true)} className="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-bold text-xs flex items-center justify-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Safety</span>
                      </button>
                    </div>

                    {/* Cockpit In-Line Live Messaging Strip */}
                    <div 
                      onClick={() => setShowChat(true)}
                      className="p-2.5 rounded-2xl bg-blue-50/90 dark:bg-slate-850 dark:bg-slate-800/80 border border-blue-200/80 dark:border-slate-700/80 flex items-center justify-between cursor-pointer hover:bg-blue-100/60 transition shadow-xs group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-xl bg-blue-600/10 text-brand-blue flex items-center justify-center flex-shrink-0 relative">
                          <MessageSquare className="w-3.5 h-3.5" />
                          {unreadCaptainMessages > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                          )}
                        </div>
                        <div className="min-w-0 text-left">
                          <div className="text-[11px] font-black text-slate-800 dark:text-white flex items-center gap-1.5 truncate">
                            <span>Chat with Captain {currentDriver.name}</span>
                            {unreadCaptainMessages > 0 && (
                              <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[9px] font-bold">New</span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {latestMessage 
                              ? `${latestMessage.senderName}: "${latestMessage.text}"` 
                              : 'Tap to message captain during ride...'}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black text-brand-blue group-hover:translate-x-0.5 transition flex-shrink-0 ml-2">
                        Open →
                      </span>
                    </div>

                    {/* Road Progress Bar */}
                    <div className="space-y-1 bg-slate-100 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200 dark:border-slate-700/60">
                      <div className="flex justify-between text-xs font-semibold text-slate-500">
                        <span>Road Route Progress</span>
                        <span className="font-bold text-slate-800 dark:text-white">{activeOrder.progressPercent}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-blue transition-all duration-300 ease-linear" style={{ width: `${activeOrder.progressPercent}%` }}></div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          onUpdateOrder(activeOrder.id, { status: 'TRIP_COMPLETED', progressPercent: 100 });
                          sounds.playSuccess();
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold hover:bg-slate-800 transition"
                      >
                        ⚡ Complete Trip Now
                      </button>
                      <button 
                        onClick={() => handleCancelBooking(activeOrder.id)}
                        className="px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-rose-500 text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* STATE D: COMPLETED / PAYMENT */}
                {activeOrder && (activeOrder.status === 'COMPLETED' || activeOrder.status === 'TRIP_COMPLETED') && (
                  <div className="flex flex-col items-center justify-center py-4 space-y-4 animate-in fade-in relative">
                    {/* Close / Dismiss Popup */}
                    <button 
                      onClick={() => {
                        sounds.playPop();
                        onUpdateOrder(activeOrder.id, { status: 'COMPLETED' });
                        setPickup('');
                        setDrop('');
                        setDropQuery('');
                        setPickupPlace(null);
                        setDropPlace(null);
                        setLiveRoadRoute(null);
                        setDistanceKm(0);
                        setDiscountAmount(0);
                        setDriverTip(0);
                      }}
                      className="absolute top-1 right-1 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                      title="Dismiss"
                    >
                      <X className="w-4 h-4" />
                    </button>

                    <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-500 border-2 border-emerald-500/40 flex items-center justify-center shadow-lg">
                      <CheckCircle className="w-9 h-9" />
                    </div>

                    <div className="text-center">
                      <h3 className="font-black text-xl text-slate-900 dark:text-white">Trip Completed!</h3>
                      <p className="text-xs text-slate-500">Hope you had a safe and smooth journey</p>
                    </div>

                    {/* Fare receipt */}
                    <div className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-4 rounded-2xl text-center space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Fare</span>
                      <div className="text-3xl font-black text-slate-900 dark:text-white">
                        ₹{activeOrder.finalFare + driverTip}
                      </div>
                      <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        Paid via {activeOrder.paymentMethod} • Ref {activeOrder.id}
                      </div>
                      <button
                        type="button"
                        onClick={() => { sounds.playTap(); setShowFareBreakdown(true); }}
                        className="inline-flex items-center gap-1 text-[11px] font-black text-brand-blue hover:underline pt-1 cursor-pointer"
                        title="View detailed fare breakdown"
                      >
                        <Receipt className="w-3 h-3 text-brand-blue" />
                        <span>View Detailed Fare Breakdown</span>
                      </button>
                      {activeOrder.serviceMode === 'PARCEL' && (
                        <div className="text-[10px] text-amber-600 dark:text-amber-400 font-bold pt-0.5">
                          📦 {activeOrder.parcelType} ({activeOrder.parcelWeightKg} kg)
                        </div>
                      )}
                    </div>

                    {/* Tip Driver Chips */}
                    <div className="w-full space-y-1.5">
                      <div className="text-xs font-bold text-slate-500">Add a tip for Captain {activeDriver.name.split(' ')[0]}</div>
                      <div className="flex gap-2">
                        {[0, 20, 50, 100].map(tip => (
                          <button
                            key={tip}
                            onClick={() => {
                              setDriverTip(tip);
                              sounds.playPop();
                            }}
                            className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition ${
                              driverTip === tip 
                                ? 'bg-brand-blue text-white border-brand-blue'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {tip === 0 ? 'No tip' : `+₹${tip}`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Star Rating */}
                    <div className="flex gap-2 py-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => {
                            setSelectedRating(star);
                            sounds.playPop();
                          }}
                          className="p-1 transition hover:scale-110 active:scale-95"
                        >
                          <Star className={`w-6 h-6 ${
                            star <= selectedRating 
                              ? 'text-amber-400 fill-amber-400' 
                              : 'text-slate-300 dark:text-slate-700'
                          }`} />
                        </button>
                      ))}
                    </div>

                    <button 
                      onClick={() => {
                        sounds.playSuccess();
                        onUpdateOrder(activeOrder.id, { status: 'COMPLETED' });
                        setPickup('');
                        setDrop('');
                        setDropQuery('');
                        setPickupPlace(null);
                        setDropPlace(null);
                        setLiveRoadRoute(null);
                        setDistanceKm(0);
                        setDiscountAmount(0);
                        setDriverTip(0);
                      }}
                      className="w-full py-3.5 rounded-xl bg-brand-blue hover:bg-blue-600 text-white font-black text-sm shadow-xl shadow-blue-600/30 transition"
                    >
                      Done & Book Next Ride
                    </button>
                  </div>
                )}
              </>
            )}

            {/* =========================================
                2. CARPOOL TAB (Rendered full-bleed above map)
               ========================================= */}

            {/* =========================================
                3. OUTSTATION TAB
               ========================================= */}
            {customerTab === 'OUTSTATION' && (
              <div className="space-y-4 pt-1 pb-6">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        sounds.playPop();
                        setCustomerTab('BOOKING');
                      }}
                      className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 transition active:scale-95"
                      title="Back to Booking"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                      <h3 className="font-black text-lg text-slate-900 dark:text-white">Outstation & Rentals</h3>
                      <p className="text-[11px] text-slate-500">Intercity travel, self-drive, or private chauffeurs</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {OUTSTATION_PACKAGES.map((pkg) => (
                    <div 
                      key={pkg.id}
                      className="p-4 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2.5 shadow-sm"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/40 text-brand-blue text-[9px] font-black uppercase">
                            {pkg.tag}
                          </span>
                          <h4 className="font-black text-sm text-slate-900 dark:text-white mt-1">{pkg.title}</h4>
                        </div>
                        <span className="text-xs font-black text-slate-900 dark:text-white">{pkg.pricing}</span>
                      </div>

                      <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                        {pkg.features.map((feat, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                            <span>{feat}</span>
                          </div>
                        ))}
                      </div>

                      <button 
                        onClick={() => {
                          setSelectedOutstationPkg(pkg.title);
                          sounds.playPop();
                        }}
                        className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-brand-blue text-white font-bold text-xs transition active:scale-98"
                      >
                        Reserve {pkg.category} Package
                      </button>
                    </div>
                  ))}
                </div>

                {/* Quick Outstation modal */}
                {selectedOutstationPkg && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded-2xl text-xs space-y-2.5 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-brand-blue">Booking Request: {selectedOutstationPkg}</div>
                      <button 
                        onClick={() => setSelectedOutstationPkg(null)} 
                        className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between bg-white dark:bg-slate-900/80 p-2.5 rounded-xl border border-blue-100 dark:border-blue-900/50">
                      <span className="text-slate-600 dark:text-slate-300 font-semibold">Trip Duration:</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setOutstationDays(Math.max(outstationDays - 1, 1))} className="w-7 h-7 bg-slate-100 dark:bg-slate-800 rounded-lg border font-bold flex items-center justify-center active:scale-95">-</button>
                        <span className="font-black min-w-[50px] text-center">{outstationDays} Days</span>
                        <button onClick={() => setOutstationDays(outstationDays + 1)} className="w-7 h-7 bg-slate-100 dark:bg-slate-800 rounded-lg border font-bold flex items-center justify-center active:scale-95">+</button>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        sounds.playSuccess();
                        setBookingNoticeToast(`🚀 Outstation Trip Confirmed for ${outstationDays} Days! A coordinator will call you.`);
                        setSelectedOutstationPkg(null);
                        setTimeout(() => setBookingNoticeToast(null), 4000);
                      }}
                      className="w-full py-2.5 bg-brand-blue text-white rounded-xl font-bold transition active:scale-98 shadow-md"
                    >
                      Confirm Intercity Booking
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* =========================================
                4. HISTORY TAB
               ========================================= */}
            {customerTab === 'HISTORY' && (
              <div className="space-y-4 pt-1 pb-6">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        sounds.playPop();
                        setCustomerTab('BOOKING');
                      }}
                      className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 transition active:scale-95"
                      title="Back to Booking"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                      <h3 className="font-black text-lg text-slate-900 dark:text-white">Trip History</h3>
                      <p className="text-[11px] text-slate-500">Your completed rides and delivery receipts</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-brand-blue bg-blue-50 dark:bg-blue-950/60 px-2 py-1 rounded-lg">
                    {PAST_RIDES_MOCK.length} Trips
                  </span>
                </div>

                <div className="space-y-3">
                  {PAST_RIDES_MOCK.map((trip) => (
                    <div 
                      key={trip.id}
                      className="p-3.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2 shadow-sm"
                    >
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-extrabold text-slate-400">{trip.date}</span>
                        <span className="font-black text-emerald-600 dark:text-emerald-400">₹{trip.fare}</span>
                      </div>
                      <div className="text-xs font-bold text-slate-800 dark:text-white space-y-0.5">
                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          <span>{trip.pickup}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                          <span>{trip.drop}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700/60 text-[11px]">
                        <span className="text-slate-400">{trip.vehicleTier} • {trip.driverName}</span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              sounds.playTap();
                              setSelectedTransaction(trip);
                            }}
                            className="font-bold text-slate-600 dark:text-slate-300 hover:text-brand-blue"
                          >
                            Transaction details
                          </button>
                          <button
                            onClick={() => {
                              setPickup('');
                              setDrop('');
                              setDropQuery(trip.drop);
                              setPickupPlace(null);
                              setDropPlace(null);
                              setLiveRoadRoute(null);
                              setDistanceKm(0);
                              setCustomerTab('BOOKING');
                              sounds.playPop();
                            }}
                            className="font-bold text-brand-blue hover:underline"
                          >
                            Rebook →
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* =========================================
                5. PROFILE TAB
               ========================================= */}
            {customerTab === 'PROFILE' && (
              <div className="space-y-4 pt-1 pb-6">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        sounds.playPop();
                        setCustomerTab('BOOKING');
                      }}
                      className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 transition active:scale-95"
                      title="Back to Booking"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                      <h3 className="font-black text-lg text-slate-900 dark:text-white">Account & Profile</h3>
                      <p className="text-[11px] text-slate-500">Manage preferences and rider credentials</p>
                    </div>
                  </div>
                </div>
                
                {/* Profile Header Card */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl flex items-center gap-3.5 shadow-sm">
                  <div className="w-14 h-14 rounded-2xl bg-brand-blue text-white font-black text-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                    AN
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-black text-base text-slate-900 dark:text-white">Akhil Nalla</h4>
                      <span className="px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-500 font-extrabold text-[9px]">Gold</span>
                    </div>
                    <p className="text-xs text-brand-blue font-bold">+91 98480-12345</p>
                    <p className="text-[11px] text-slate-400">akhil.nalla@zaldi.in</p>
                  </div>
                </div>

                {/* Drive with Zaldi / Captain Switcher Card for Mobile Phone */}
                {onSwitchToCaptain && (
                  <div className="p-3.5 bg-gradient-to-r from-blue-700 via-brand-blue to-indigo-700 text-white rounded-2xl flex items-center justify-between shadow-md">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-lg">
                        🏍️
                      </div>
                      <div>
                        <div className="font-black text-xs">Captain Partner Cockpit</div>
                        <div className="text-[10px] text-blue-100 font-medium">Switch to Captain Driver Mode</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        sounds.playSuccess();
                        onSwitchToCaptain();
                      }}
                      className="px-3.5 py-1.5 bg-white text-brand-blue hover:bg-blue-50 rounded-xl font-black text-xs shadow transition active:scale-95"
                    >
                      Launch
                    </button>
                  </div>
                )}

                {/* Zaldi Wallet Banner */}
                <div className="p-4 bg-gradient-to-r from-blue-900/40 to-slate-900 border border-blue-500/30 rounded-2xl flex items-center justify-between shadow-sm">
                  <div>
                    <span className="text-[10px] font-black uppercase text-blue-400">Zaldi Wallet Balance</span>
                    <div className="text-2xl font-black text-white mt-0.5">₹{walletBalance.toFixed(2)}</div>
                  </div>
                  <button 
                    onClick={() => setIsWalletOpen(true)}
                    className="px-3.5 py-2 bg-brand-blue hover:bg-blue-600 text-white rounded-xl font-bold text-xs shadow-md transition"
                  >
                    + Add Funds
                  </button>
                </div>

                {/* Saved Places */}
                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-500 px-1">Saved Addresses</div>
                  
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex items-center justify-between text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                    <div className="flex items-center gap-3">
                      <span className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-brand-blue">🏠</span>
                      <div>
                        <div className="font-bold text-slate-800 dark:text-white">Home</div>
                        <div className="text-[10px] text-slate-400">Road No 12, Banjara Hills, Hyderabad</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex items-center justify-between text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                    <div className="flex items-center gap-3">
                      <span className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-brand-blue">💼</span>
                      <div>
                        <div className="font-bold text-slate-800 dark:text-white">Work / Office</div>
                        <div className="text-[10px] text-slate-400">Building 9, Mindspace IT Park, Hitec City</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>

                {/* App Preferences */}
                <div className="space-y-1 pt-1">
                  <div className="text-xs font-bold text-slate-500 px-1">Preferences & Support</div>
                  
                  <button 
                    onClick={() => setShowSafety(true)}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex items-center justify-between text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    <div className="flex items-center gap-3">
                      <Shield className="w-4 h-4 text-emerald-500" />
                      <span className="font-bold text-slate-800 dark:text-white">Safety Center & SOS Contacts</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>

                  <button 
                    onClick={() => setIsNightMode(!isNightMode)}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex items-center justify-between text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    <div className="flex items-center gap-3">
                      <Settings className="w-4 h-4 text-brand-blue" />
                      <span className="font-bold text-slate-800 dark:text-white">Map Style: {isNightMode ? 'Dark Neon' : 'Light Street'}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>

                  <button 
                    onClick={() => setShowSupportModal(true)}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex items-center justify-between text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    <div className="flex items-center gap-3">
                      <Headphones className="w-4 h-4 text-amber-500" />
                      <span className="font-bold text-slate-800 dark:text-white">24x7 Help & Live Support</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                </div>

              </div>
            )}

          </div>

          {/* ====================================================
              FIXED ACTION BAR (COUPON, PAYMENT & CONFIRM BUTTON)
              Fixed directly above div:nth-of-type(3) (Bottom Navigation Bar)
             ==================================================== */}
          {customerTab === 'BOOKING' && !activeOrder && (
            <div className="p-3 bg-white/98 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-8px_30px_rgba(0,0,0,0.1)] z-30 flex-shrink-0 space-y-2">
              <button
                type="button"
                onClick={() => {
                  sounds.playTap();
                  setPaymentsSheetPage('PAYMENT');
                  setShowPaymentsSheet(true);
                }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-left shadow-xs hover:border-blue-300 transition"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Wallet className="w-4 h-4 text-brand-blue flex-shrink-0" />
                  <span className="text-xs font-black text-slate-800">Payments &amp; Coupons</span>
                  <span className="text-[10px] font-semibold text-slate-500 truncate">
                    {paymentMethod === 'WALLET'
                      ? `Zaldi Wallet • ₹${Math.round(walletBalance)}`
                      : paymentMethod === 'UPI'
                      ? `UPI • ${upiApp}`
                      : 'Cash after ride'}
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {discountAmount > 0 && <span className="text-[10px] font-black text-emerald-700">Coupon applied</span>}
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </button>

              {/* Itemized Fare Summary Strip with Breakdown Trigger */}
              {hasSelectedRoute && distanceKm > 0 && (
                <div 
                  onClick={() => { sounds.playTap(); setShowFareBreakdown(true); }}
                  className="flex items-center justify-between px-3 py-1.5 bg-blue-50/80 hover:bg-blue-100/80 border border-blue-200/90 rounded-xl text-xs cursor-pointer transition shadow-2xs group"
                  title="Click to view full base fare, distance charge & tax breakdown"
                >
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-700 font-semibold truncate">
                    <Receipt className="w-3.5 h-3.5 text-brand-blue flex-shrink-0" />
                    <span>Base ₹{baseFareAmount}</span>
                    <span className="text-slate-400">+</span>
                    <span>Dist ₹{distanceChargeAmount}</span>
                    <span className="text-slate-400">+</span>
                    <span>Taxes ₹{taxAmount}</span>
                    {discountAmount > 0 && (
                      <span className="text-emerald-700 font-bold ml-1">-₹{discountAmount}</span>
                    )}
                  </div>
                  <span className="text-[10px] font-black text-brand-blue flex items-center gap-0.5 flex-shrink-0">
                    <span>Breakdown</span>
                    <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition" />
                  </span>
                </div>
              )}

              {/* Confirm Delivery / Ride / Enter Pickup & Drop Button */}
              <button 
                onClick={() => {
                  if (!pickupPlace) {
                    sounds.playTap();
                    setLocationToast('Confirm your pickup using the map pin.');
                    window.setTimeout(() => setLocationToast(null), 2500);
                  } else if (!dropPlace) {
                    sounds.playTap();
                    setActiveInput('drop');
                    setSearchQuery(dropQuery);
                    dropInputRef.current?.focus();
                    drawerScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  } else if (!activeInput && hasSelectedRoute && !isWeightExceeded) {
                    if (currentMode === 'PARCEL' && parcelPhotos.length === 0) {
                      setParcelPhotoError('At least one parcel photo is required before booking.');
                      parcelPhotoInputRef.current?.click();
                    } else {
                      handleConfirmBooking();
                    }
                  }
                }}
                disabled={Boolean((pickupPlace && dropPlace && isWeightExceeded) || isLoadingRoadRoute)}
                className={`w-full py-3 sm:py-3.5 px-3 rounded-2xl font-black text-xs sm:text-sm shadow-xl flex justify-center items-center gap-2 transition-all active:scale-98 ${
                  !pickupPlace || !dropPlace
                    ? 'bg-brand-blue hover:bg-blue-600 text-white shadow-blue-500/25 ring-2 ring-blue-500/20'
                    : isWeightExceeded || roadRouteError || !hasSelectedRoute
                    ? 'bg-rose-500/20 text-rose-500 border border-rose-500/40 cursor-not-allowed shadow-none'
                    : currentMode === 'PARCEL'
                    ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/30'
                    : 'bg-brand-blue text-white shadow-blue-600/30 hover:bg-blue-600'
                }`}
              >
                {currentMode === 'PARCEL' && parcelPhotos.length === 0
                  ? <Camera className="w-4 h-4 flex-shrink-0" />
                  : <Navigation className="w-4 h-4 flex-shrink-0" />}
                <span className="truncate">
                  {!pickupPlace
                    ? 'Confirm Pickup on Map'
                    : !dropPlace
                    ? 'Select Destination'
                    : isLoadingRoadRoute
                    ? 'Calculating Road Route…'
                    : roadRouteError || !hasSelectedRoute
                    ? 'Road Route Unavailable'
                    : isWeightExceeded 
                    ? `Weight Exceeded (${weightExceededMessage})`
                    : currentMode === 'PARCEL'
                    && parcelPhotos.length === 0
                    ? 'Take Required Parcel Photo'
                    : currentMode === 'PARCEL'
                    ? `Confirm ${activeTierConfig.name} Delivery • ₹${finalCalculatedFare}`
                    : `Confirm ${activeTierConfig.name} Ride • ₹${finalCalculatedFare}`}
                </span>
                <ArrowRight className="w-4 h-4 flex-shrink-0" />
              </button>
            </div>
          )}
        </div>

        {/* Bottom Navigation Bar */}
        <div className="absolute bottom-0 left-0 right-0 w-full h-[calc(62px+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)] bg-white/98 backdrop-blur-md border-t border-slate-200 flex justify-between items-center px-1 sm:px-3 z-40">
          <button 
            onClick={() => {
              setCustomerTab('BOOKING');
              sounds.playPop();
            }}
            className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-0.5 gap-0.5 transition ${
              customerTab === 'BOOKING' ? 'text-brand-blue font-black' : 'text-slate-400 hover:text-slate-600 font-semibold'
            }`}
          >
            <Navigation className={`w-5 h-5 flex-shrink-0 ${customerTab === 'BOOKING' ? 'stroke-[2.5px]' : 'stroke-2'}`} />
            <span className="text-[10px] leading-tight truncate max-w-full">Ride</span>
          </button>

          <button 
            onClick={() => {
              setCustomerTab('CARPOOL');
              sounds.playPop();
            }}
            className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-0.5 gap-0.5 transition ${
              customerTab === 'CARPOOL' ? 'text-brand-blue font-black' : 'text-slate-400 hover:text-slate-600 font-semibold'
            }`}
          >
            <Users className={`w-5 h-5 flex-shrink-0 ${customerTab === 'CARPOOL' ? 'stroke-[2.5px]' : 'stroke-2'}`} />
            <span className="text-[10px] leading-tight truncate max-w-full">Carpool</span>
          </button>

          <button 
            onClick={() => {
              setCustomerTab('OUTSTATION');
              sounds.playPop();
            }}
            className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-0.5 gap-0.5 transition ${
              customerTab === 'OUTSTATION' ? 'text-brand-blue font-black' : 'text-slate-400 hover:text-slate-600 font-semibold'
            }`}
          >
            <Calendar className={`w-5 h-5 flex-shrink-0 ${customerTab === 'OUTSTATION' ? 'stroke-[2.5px]' : 'stroke-2'}`} />
            <span className="text-[10px] leading-tight truncate max-w-full">Outstation</span>
          </button>

          <button 
            onClick={() => {
              setCustomerTab('HISTORY');
              sounds.playPop();
            }}
            className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-0.5 gap-0.5 transition ${
              customerTab === 'HISTORY' ? 'text-brand-blue font-black' : 'text-slate-400 hover:text-slate-600 font-semibold'
            }`}
          >
            <Clock className={`w-5 h-5 flex-shrink-0 ${customerTab === 'HISTORY' ? 'stroke-[2.5px]' : 'stroke-2'}`} />
            <span className="text-[10px] leading-tight truncate max-w-full">History</span>
          </button>

          <button 
            onClick={() => {
              setCustomerTab('PROFILE');
              sounds.playPop();
            }}
            className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1 px-0.5 gap-0.5 transition ${
              customerTab === 'PROFILE' ? 'text-brand-blue font-black' : 'text-slate-400 hover:text-slate-600 font-semibold'
            }`}
          >
            <div className={`w-5 h-5 rounded-full border flex-shrink-0 ${
              customerTab === 'PROFILE' ? 'border-brand-blue bg-blue-100 text-brand-blue font-black' : 'border-slate-400'
            } flex items-center justify-center text-[10px] font-black`}>
              A
            </div>
            <span className="text-[10px] leading-tight truncate max-w-full">Account</span>
          </button>
        </div>

      </div>

      {/* In-App Modals */}
      {showChat && activeOrder && (
        <ChatModal 
          driver={activeDriver} 
          order={activeOrder} 
          onClose={() => setShowChat(false)} 
          onSendMessage={onSendMessage}
          role="PASSENGER"
          onSwitchRole={onSwitchToCaptain}
        />
      )}

      {showCall && (
        <CallModal 
          driver={activeDriver} 
          onClose={() => setShowCall(false)} 
        />
      )}

      {isWalletOpen && (
        <WalletModal 
          currentBalance={walletBalance} 
          onAddFunds={(amt) => setWalletBalance(prev => prev + amt)} 
          onClose={() => setIsWalletOpen(false)} 
        />
      )}

      {showSafety && (
        <SafetyModal 
          order={activeOrder} 
          onClose={() => setShowSafety(false)} 
        />
      )}

      {isParcelDropdownOpen && createPortal(
        <div
          className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm animate-in fade-in"
          onClick={() => setIsParcelDropdownOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="parcel-type-dialog-title"
            className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-amber-500/30 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 animate-in zoom-in-95"
            onClick={event => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h2 id="parcel-type-dialog-title" className="font-black text-slate-900 dark:text-white">
                    Select Parcel Type
                  </h2>
                  <p className="text-xs text-slate-500">
                    {selectedVehicle.name} · Max {currentParcelSpec.maxWeight} kg
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsParcelDropdownOpen(false)}
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                aria-label="Close parcel type selection"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 space-y-1 overflow-y-auto p-3">
              {currentParcelSpec.types.map(type => {
                const isSelected = currentParcelType === type.label;
                return (
                  <button
                    type="button"
                    key={type.label}
                    onClick={() => {
                      sounds.playPop();
                      setParcelTypes(prev => ({ ...prev, [selectedVehicleId]: type.label }));
                      setIsParcelDropdownOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition ${
                      isSelected
                        ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'border-transparent text-slate-800 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-lg">
                        {type.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold">{type.label}</span>
                        {type.desc && <span className="mt-0.5 block text-xs text-slate-500">{type.desc}</span>}
                      </span>
                    </span>
                    {isSelected && <Check className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />}
                  </button>
                );
              })}
            </div>

            <footer className="border-t border-slate-200 p-4 dark:border-slate-700">
              <label htmlFor="custom-parcel-type" className="mb-2 block text-xs font-bold text-slate-600 dark:text-slate-300">
                Or enter a custom parcel type
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="custom-parcel-type"
                  type="text"
                  value={customParcelInput}
                  onChange={event => setCustomParcelInput(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && customParcelInput.trim()) {
                      sounds.playSuccess();
                      setParcelTypes(prev => ({ ...prev, [selectedVehicleId]: customParcelInput.trim() }));
                      setCustomParcelInput('');
                      setIsParcelDropdownOpen(false);
                    }
                  }}
                  placeholder="Custom parcel type..."
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <button
                  type="button"
                  disabled={!customParcelInput.trim()}
                  onClick={() => {
                    if (!customParcelInput.trim()) return;
                    sounds.playSuccess();
                    setParcelTypes(prev => ({ ...prev, [selectedVehicleId]: customParcelInput.trim() }));
                    setCustomParcelInput('');
                    setIsParcelDropdownOpen(false);
                  }}
                  className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-black text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Set
                </button>
              </div>
            </footer>
          </section>
        </div>,
        document.body
      )}

      {selectedTransaction && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/65 p-0 backdrop-blur-sm animate-in fade-in sm:items-center sm:p-4"
          onClick={() => setSelectedTransaction(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-details-title"
            className="w-full max-w-md overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:rounded-3xl"
            onClick={event => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand-blue dark:bg-blue-950/60">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <h2 id="transaction-details-title" className="font-black text-slate-900 dark:text-white">
                    Transaction details
                  </h2>
                  <p className="text-xs text-slate-500">Ride receipt</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTransaction(null)}
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                aria-label="Close transaction details"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="max-h-[70dvh] space-y-5 overflow-y-auto p-5">
              <div className="rounded-2xl bg-emerald-50 p-4 text-center dark:bg-emerald-950/40">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                  Amount paid
                </span>
                <div className="mt-1 text-3xl font-black text-slate-900 dark:text-white">
                  ₹{selectedTransaction.fare}
                </div>
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:bg-slate-900 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  {selectedTransaction.status}
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 text-sm dark:border-slate-800">
                  <span className="text-slate-500">Transaction reference</span>
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">{selectedTransaction.id}</span>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 text-sm dark:border-slate-800">
                  <span className="text-slate-500">Date</span>
                  <span className="text-right font-semibold text-slate-900 dark:text-white">{selectedTransaction.date}</span>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 text-sm dark:border-slate-800">
                  <span className="text-slate-500">Vehicle</span>
                  <span className="text-right font-semibold text-slate-900 dark:text-white">{selectedTransaction.vehicleTier}</span>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 text-sm dark:border-slate-800">
                  <span className="text-slate-500">Captain</span>
                  <span className="text-right font-semibold text-slate-900 dark:text-white">{selectedTransaction.driverName}</span>
                </div>
                <div className="space-y-2 border-b border-slate-100 pb-3 text-sm dark:border-slate-800">
                  <div className="flex items-start gap-2">
                    <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
                    <span className="text-slate-700 dark:text-slate-200">{selectedTransaction.pickup}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-rose-500" />
                    <span className="text-slate-700 dark:text-slate-200">{selectedTransaction.drop}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Trip rating</span>
                  <span className="flex items-center gap-1 font-bold text-amber-500">
                    <Star className="h-4 w-4 fill-amber-400" />
                    {selectedTransaction.rating}/5
                  </span>
                </div>
              </div>
            </div>

            <footer className="border-t border-slate-200 p-4 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setSelectedTransaction(null)}
                className="w-full rounded-xl bg-brand-blue py-3 text-sm font-black text-white transition hover:bg-blue-600"
              >
                Done
              </button>
            </footer>
          </section>
        </div>
      )}

      {showPaymentsSheet && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/65 backdrop-blur-sm animate-in fade-in">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="payments-sheet-title"
            className="flex h-[100svh] max-h-[100svh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-slate-50 shadow-2xl animate-in slide-in-from-bottom-4"
          >
            <header className="flex flex-shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top,0px))]">
              <button
                type="button"
                onClick={() => {
                  sounds.playTap();
                  if (paymentsSheetPage === 'COUPONS') setPaymentsSheetPage('PAYMENT');
                  else setShowPaymentsSheet(false);
                }}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
                aria-label={paymentsSheetPage === 'COUPONS' ? 'Back to payments' : 'Back to booking'}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <h2 id="payments-sheet-title" className="text-base font-black text-slate-900">
                  {paymentsSheetPage === 'COUPONS' ? 'Available Coupons' : 'Payments & Coupons'}
                </h2>
                <p className="text-xs text-slate-500">
                  {paymentsSheetPage === 'COUPONS' ? 'Choose an offer for your ride' : 'Choose how you want to pay'}
                </p>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
              {paymentsSheetPage === 'PAYMENT' ? (
                <div className="space-y-5">
                  <section className="space-y-3">
                    <div>
                      <h3 className="text-sm font-black text-slate-900">Apply a coupon</h3>
                      <p className="mt-0.5 text-xs text-slate-500">Save on your next ride with a promo code.</p>
                    </div>
                    <div className="flex gap-2">
                      <div className="relative min-w-0 flex-1">
                        <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={promoCode}
                          onChange={event => {
                            setPromoCode(event.target.value.toUpperCase());
                            setPromoMessage(null);
                          }}
                          onKeyDown={event => {
                            if (event.key === 'Enter') handleApplyPromo();
                          }}
                          placeholder="Enter promo code"
                          aria-label="Promo code"
                          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm font-bold uppercase text-slate-900 outline-none transition placeholder:normal-case placeholder:font-medium placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleApplyPromo()}
                        className="rounded-xl bg-brand-blue px-4 text-sm font-black text-white transition hover:bg-blue-600 active:scale-95"
                      >
                        Apply
                      </button>
                    </div>
                    {promoMessage && (
                      <p role={promoMessage.startsWith('Coupon ') ? 'status' : 'alert'} className={`text-xs font-bold ${promoMessage.startsWith('Coupon ') ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {promoMessage}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        sounds.playTap();
                        setPaymentsSheetPage('COUPONS');
                      }}
                      className="text-xs font-black text-brand-blue underline underline-offset-2"
                    >
                      View available coupons
                    </button>
                    {discountAmount > 0 && (
                      <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
                        <span className="font-bold text-emerald-800">{promoCode} applied</span>
                        <span className="font-black text-emerald-800">−₹{discountAmount}</span>
                      </div>
                    )}
                  </section>

                  <section role="radiogroup" aria-label="Payment method" className="space-y-3">
                    <h3 className="text-sm font-black text-slate-900">Payment method</h3>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={paymentMethod === 'WALLET'}
                      onClick={() => handleSelectPaymentMethod('WALLET')}
                      className={`w-full rounded-2xl border p-4 text-left transition ${paymentMethod === 'WALLET' ? 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/10' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-brand-blue">
                            <Wallet className="h-5 w-5" />
                          </span>
                          <span>
                            <span className="block text-sm font-black text-slate-900">Zaldi Wallet</span>
                            <span className="mt-0.5 block text-xs font-semibold text-slate-500">Available balance</span>
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-black text-slate-900">₹{walletBalance.toFixed(0)}</span>
                          <span className={`h-5 w-5 rounded-full border-2 ${paymentMethod === 'WALLET' ? 'border-blue-600 bg-blue-600 ring-2 ring-white ring-inset' : 'border-slate-300'}`} />
                        </span>
                      </span>
                    </button>

                    <div className={`rounded-2xl border p-4 transition ${paymentMethod === 'UPI' ? 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/10' : 'border-slate-200 bg-white'}`}>
                      <div className="space-y-2">
                        <div className="pb-1">
                          <div className="text-xs font-black text-slate-900">UPI</div>
                          <div className="mt-0.5 text-[11px] font-semibold text-slate-500">Choose your UPI app</div>
                        </div>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={paymentMethod === 'UPI' && upiApp === 'PhonePe'}
                          onClick={() => {
                            handleSelectPaymentMethod('UPI', 'PhonePe');
                          }}
                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left ${paymentMethod === 'UPI' && upiApp === 'PhonePe' ? 'border-violet-300 bg-white' : 'border-transparent hover:bg-white/70'}`}
                        >
                          <span className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-sm font-black text-violet-700">P</span>
                            <span className="text-xs font-black text-slate-800">PhonePe</span>
                          </span>
                          <span className={`h-4 w-4 rounded-full border-2 ${paymentMethod === 'UPI' && upiApp === 'PhonePe' ? 'border-blue-600 bg-blue-600 ring-2 ring-white ring-inset' : 'border-slate-300'}`} />
                        </button>

                        <button
                          type="button"
                          role="radio"
                          aria-checked={paymentMethod === 'UPI' && upiApp === 'Google Pay'}
                          onClick={() => handleSelectPaymentMethod('UPI', 'Google Pay')}
                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left ${paymentMethod === 'UPI' && upiApp === 'Google Pay' ? 'border-blue-300 bg-white' : 'border-transparent hover:bg-white/70'}`}
                        >
                          <span className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-sm font-black text-blue-700">G</span>
                            <span className="text-xs font-black text-slate-800">Google Pay</span>
                          </span>
                          <span className={`h-4 w-4 rounded-full border-2 ${paymentMethod === 'UPI' && upiApp === 'Google Pay' ? 'border-blue-600 bg-blue-600 ring-2 ring-white ring-inset' : 'border-slate-300'}`} />
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={paymentMethod === 'CASH'}
                      onClick={() => handleSelectPaymentMethod('CASH')}
                      className={`w-full rounded-2xl border p-4 text-left transition ${paymentMethod === 'CASH' ? 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/10' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-lg">₹</span>
                          <span>
                            <span className="block text-sm font-black text-slate-900">Cash</span>
                            <span className="mt-0.5 block text-xs font-semibold text-slate-500">Select cash payment after the ride</span>
                          </span>
                        </span>
                        <span className={`h-5 w-5 rounded-full border-2 ${paymentMethod === 'CASH' ? 'border-blue-600 bg-blue-600 ring-2 ring-white ring-inset' : 'border-slate-300'}`} />
                      </span>
                    </button>
                  </section>
                </div>
              ) : (
                <div className="space-y-3">
                  {[
                    { code: 'ZALDI50', value: '₹50 OFF', title: 'Ride more, save more', detail: 'Get ₹50 off your fare.' },
                    { code: 'SAVE50', value: '₹50 OFF', title: 'A little ride bonus', detail: 'Get ₹50 off your fare.' },
                    { code: 'FIRST', value: '₹75 OFF', title: 'First ride offer', detail: 'Get ₹75 off your fare.' }
                  ].map(coupon => (
                    <div key={coupon.code} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-black text-slate-900">{coupon.title}</div>
                          <div className="mt-1 text-xs text-slate-500">{coupon.detail}</div>
                        </div>
                        <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">{coupon.value}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-dashed border-slate-200 pt-3">
                        <span className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black tracking-wide text-slate-800">{coupon.code}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setPromoCode(coupon.code);
                            handleApplyPromo(coupon.code);
                            setPaymentsSheetPage('PAYMENT');
                          }}
                          className="text-xs font-black text-brand-blue"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </section>
        </div>
      )}

      {/* =========================================================================
          DETAILED FARE BREAKDOWN MODAL (BASE FARE + DISTANCE CHARGE + TAXES)
         ========================================================================= */}
      {showFareBreakdown && (() => {
        const isOrderActive = Boolean(activeOrder);
        const displayDist = isOrderActive 
          ? (activeOrder?.distanceKm || distanceKm) 
          : (distanceKm > 0 ? distanceKm : 0);
        const displayBase = displayDist > 0 ? 25 : 25;
        const displayDistCharge = displayDist > 0 ? Math.round(displayDist * 8) : 0;
        const displayTax = displayDist > 0 
          ? Math.max(1, Math.round((displayBase + displayDistCharge) * 0.05)) 
          : 0;
        const displayGross = displayBase + displayDistCharge + displayTax;
        const displayDiscount = isOrderActive ? (activeOrder?.discount || 0) : discountAmount;
        const displayFinal = isOrderActive 
          ? activeOrder!.finalFare 
          : (displayDist > 0 ? Math.max(displayGross - displayDiscount, 15) : 25);
        const displayVehicleName = isOrderActive ? activeOrder!.vehicleTier : activeTierConfig.name;
        const displayVehicleIcon = isOrderActive ? activeOrder!.vehicleIcon : (currentMode === 'PARCEL' ? '📦' : activeTierConfig.icon);
        const displayPickup = isOrderActive ? activeOrder!.pickup : (pickup || fixedPinAddress || 'Pickup Point');
        const displayDrop = isOrderActive ? activeOrder!.drop : (drop || 'Destination Point');

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3.5 sm:p-4 animate-in fade-in overflow-y-auto">
            <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl border border-slate-100 max-h-[92vh] overflow-y-auto no-scrollbar">
              
              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-blue-50 text-brand-blue flex items-center justify-center font-black">
                    <Receipt className="w-5 h-5 text-brand-blue" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-slate-900 leading-tight">Detailed Fare Breakdown</h3>
                    <p className="text-[10px] text-slate-500">Transparent billing • Zero hidden charges</p>
                  </div>
                </div>
                <button 
                  onClick={() => { sounds.playTap(); setShowFareBreakdown(false); }}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                  title="Close Breakdown"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Route & Vehicle Context Card */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/90 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{displayVehicleIcon}</span>
                    <div>
                      <span className="font-black text-xs text-slate-900 block leading-tight">{displayVehicleName}</span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {currentMode === 'PARCEL' ? 'Cargo Transport' : 'Passenger Ride'}
                      </span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-blue-100 text-brand-blue text-[10px] font-black font-mono">
                    {displayDist > 0 ? `${displayDist} km` : 'Rate Preview'}
                  </span>
                </div>

                <div className="space-y-1 text-[11px] pt-1.5 border-t border-slate-200/70">
                  <div className="flex items-center gap-1.5 text-slate-700 truncate font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></span>
                    <span className="truncate">{displayPickup}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700 truncate font-medium">
                    <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0"></span>
                    <span className="truncate">{displayDrop}</span>
                  </div>
                </div>
              </div>

              {/* Itemized Calculation Breakdown */}
              <div className="space-y-2.5">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
                  Trip Fare Calculation
                </span>

                {/* 1. Base Fare */}
                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      <span className="text-xs font-black text-slate-900">Base Fare</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Vehicle dispatch & initial boarding flag fall</p>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-xs text-slate-900 font-mono">₹{displayBase}</span>
                    <span className="block text-[9px] text-slate-400">Fixed</span>
                  </div>
                </div>

                {/* 2. Distance Charge */}
                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                      <span className="text-xs font-black text-slate-900">Distance Charge</span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      {displayDist > 0 ? `${displayDist} km × ₹8.00 / km actual road route` : 'Standard rate: ₹8.00 per km'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-xs text-slate-900 font-mono">₹{displayDistCharge}</span>
                    <span className="block text-[9px] text-slate-400">@ ₹8/km</span>
                  </div>
                </div>

                {/* 3. Taxes & Statutory Fees */}
                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      <span className="text-xs font-black text-slate-900">Taxes & Statutory Fees</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Government GST (5% Passenger Transport Cess)</p>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-xs text-slate-900 font-mono">₹{displayTax}</span>
                    <span className="block text-[9px] text-slate-400">5% GST</span>
                  </div>
                </div>

                {/* Subtotal row */}
                <div className="flex items-center justify-between px-2.5 py-1 text-xs text-slate-500">
                  <span>Gross Total (Base + Dist + Taxes)</span>
                  <span className="font-bold text-slate-700">₹{displayGross}</span>
                </div>

                {/* 4. Promo Discount (if applied) */}
                {displayDiscount > 0 && (
                  <div className="flex items-center justify-between p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-xs font-black text-emerald-800">
                          Promo Discount {promoCode ? `(${promoCode})` : ''}
                        </span>
                      </div>
                      <p className="text-[10px] text-emerald-700">Applied coupon savings</p>
                    </div>
                    <span className="font-black text-xs text-emerald-700 font-mono">-₹{displayDiscount}</span>
                  </div>
                )}

                {/* 5. Final Calculated Fare Card */}
                <div className="p-3 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl flex items-center justify-between shadow-md">
                  <div>
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block">Final Fare Payable</span>
                    <span className="text-[10px] text-emerald-400 font-semibold">
                      Via {isOrderActive ? activeOrder!.paymentMethod : paymentMethod} • All inclusive
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-emerald-400 font-mono">₹{displayFinal}</span>
                  </div>
                </div>
              </div>

              {/* Fair Pricing Guarantee Callout */}
              <div className="p-2.5 bg-blue-50/70 rounded-xl border border-blue-200/70 space-y-1 text-[10px] text-slate-600">
                <div className="flex items-center gap-1.5 font-bold text-brand-blue">
                  <ShieldCheck className="w-3.5 h-3.5 text-brand-blue flex-shrink-0" />
                  <span>Transparent Pricing Guarantee</span>
                </div>
                <p className="leading-relaxed">
                  Bike, Auto, Cab, XL and Mini Truck all share uniform ₹8/km road network pricing and ₹25 base flag fall. No peak surge multipliers or unexpected waiting fees.
                </p>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => { sounds.playTap(); setShowFareBreakdown(false); }}
                className="w-full py-3 bg-[#00875A] hover:bg-[#00704A] text-white rounded-2xl font-black text-xs shadow-md shadow-emerald-700/20 transition cursor-pointer"
              >
                Understood • Close Breakdown
              </button>
            </div>
          </div>
        );
      })()}

      {/* 24x7 Support & Help Modal */}
      {showSupportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom-6">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
                  <Headphones className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900 dark:text-white">24x7 Zaldi Support</h3>
                  <p className="text-[10px] text-slate-500">Instant ride assistance & captain escalation</p>
                </div>
              </div>
              <button 
                onClick={() => setShowSupportModal(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <a 
                href="tel:18004199922" 
                className="p-3 bg-blue-50 dark:bg-blue-950/60 rounded-xl border border-blue-200 dark:border-blue-900/50 flex items-center justify-between text-xs transition active:scale-98"
              >
                <div className="flex items-center gap-2.5">
                  <Phone className="w-4 h-4 text-brand-blue" />
                  <div>
                    <div className="font-black text-slate-900 dark:text-white">1800-419-9922 (Toll-Free)</div>
                    <div className="text-[10px] text-slate-500">24x7 Dedicated Mobile Helpline</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-brand-blue bg-white dark:bg-slate-800 px-2 py-1 rounded-lg shadow-xs">
                  Call Now
                </span>
              </a>

              <a 
                href="mailto:support@zaldi.in" 
                className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs transition active:scale-98"
              >
                <div className="flex items-center gap-2.5">
                  <MessageSquare className="w-4 h-4 text-emerald-600" />
                  <div>
                    <div className="font-black text-slate-900 dark:text-white">support@zaldi.in</div>
                    <div className="text-[10px] text-slate-500">Response within 15 minutes</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 px-2 py-1 rounded-lg shadow-xs">
                  Email
                </span>
              </a>
            </div>

            <button 
              onClick={() => setShowSupportModal(false)}
              className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Floating Mobile Booking Notice Toast */}
      {bookingNoticeToast && (
        <div className="fixed top-14 left-4 right-4 z-50 flex justify-center pointer-events-none animate-in fade-in slide-in-from-top-3">
          <div className="bg-slate-900/95 text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-emerald-500/50 flex items-center gap-2 text-xs font-bold max-w-sm pointer-events-auto">
            <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="line-clamp-2">{bookingNoticeToast}</span>
          </div>
        </div>
      )}

    </div>
  );
};
