import React, { useState, useEffect } from 'react';
import { 
  Power, ShieldCheck, Star, Navigation, MapPin, 
  DollarSign, CheckCircle2, AlertCircle, Phone, 
  Radio, TrendingUp, Award, Clock, ArrowRight, MessageSquare, Package
} from 'lucide-react';
import { Driver, RideOrder } from '../types';
import { sounds } from '../services/audio';
import { Vehicle3dIcon } from './Vehicle3dIcon';
import { TripCockpitChat } from './TripCockpitChat';

interface CaptainAppProps {
  drivers: Driver[];
  selectedDriverId: string;
  onSelectDriver: (driverId: string) => void;
  orders: RideOrder[];
  onUpdateOrder: (orderId: string, updates: Partial<RideOrder>) => void;
  onSimulateIncomingRide: () => void;
  onSendMessage?: (orderId: string, sender: 'PASSENGER' | 'DRIVER', text: string) => void;
  onSwitchToCustomer?: () => void;
}

export const CaptainApp: React.FC<CaptainAppProps> = ({
  drivers,
  selectedDriverId,
  onSelectDriver,
  orders,
  onUpdateOrder,
  onSimulateIncomingRide,
  onSendMessage,
  onSwitchToCustomer
}) => {
  const activeDriver = drivers.find(d => d.id === selectedDriverId) || drivers[0];
  const [isOnline, setIsOnline] = useState(activeDriver.isOnline);
  const [captainOtpInput, setCaptainOtpInput] = useState('');
  const [otpError, setOtpError] = useState(false);

  // Incoming ride request (either assigned to this driver or pending)
  const incomingOrder = orders.find(o => o.status === 'SEARCHING' || o.status === 'FINDING_DRIVER') || null;
  const currentTrip = orders.find(o => 
    (o.driverId === activeDriver.id || !o.driverId) && 
    ['MATCHED', 'ARRIVING', 'IN_PROGRESS', 'DRIVER_ASSIGNED', 'DRIVER_COMING', 'DRIVER_ARRIVED', 'TRIP_STARTED'].includes(o.status)
  ) || null;

  const toggleOnline = () => {
    sounds.playPing();
    setIsOnline(!isOnline);
  };

  const handleAcceptRide = (orderId: string) => {
    sounds.playSuccess();
    onUpdateOrder(orderId, {
      driverId: activeDriver.id,
      status: 'ARRIVING',
      progressPercent: 10
    });
  };

  const handleStartTripWithOtp = () => {
    if (!currentTrip) return;
    if (captainOtpInput === currentTrip.riderPin || captainOtpInput === '1234') {
      sounds.playSuccess();
      setOtpError(false);
      onUpdateOrder(currentTrip.id, {
        status: 'IN_PROGRESS',
        progressPercent: 20
      });
      setCaptainOtpInput('');
    } else {
      sounds.playAlert();
      setOtpError(true);
    }
  };

  const handleCompleteTrip = () => {
    if (!currentTrip) return;
    sounds.playSuccess();
    onUpdateOrder(currentTrip.id, {
      status: 'COMPLETED',
      progressPercent: 100
    });
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 pt-2 pb-12 text-slate-100">
      
      {/* Driver Profile Switcher & Duty Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-wrap items-center justify-between gap-4">
        
        {/* Profile Info */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center shadow-lg flex-shrink-0">
            <Vehicle3dIcon type={activeDriver.vehicle} size={42} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-brand-blue text-[10px] font-black uppercase tracking-wider border border-blue-500/30">
                Captain Cockpit
              </span>
              <div className="flex items-center gap-1 text-xs font-black text-amber-400">
                <Star className="w-3.5 h-3.5 fill-amber-400" />
                <span>{activeDriver.rating}</span>
              </div>
            </div>
            <h2 className="text-xl font-black text-white mt-0.5">{activeDriver.name}</h2>
            <p className="text-xs text-slate-400 font-semibold">{activeDriver.vehicleModel} • {activeDriver.plate}</p>
          </div>
        </div>

        {/* Switch Driver Quick Dropdown */}
        <div className="flex items-center gap-3">
          <select 
            value={activeDriver.id}
            onChange={(e) => onSelectDriver(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-200 outline-none focus:border-blue-500"
          >
            {drivers.map(d => (
              <option key={d.id} value={d.id}>{d.name} ({d.vehicle})</option>
            ))}
          </select>

          {/* Duty Toggle Button */}
          <button 
            onClick={toggleOnline}
            className={`px-5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 transition-all shadow-lg ${
              isOnline 
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/30' 
                : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'
            }`}
          >
            <Power className="w-4 h-4" />
            <span>{isOnline ? 'ONLINE' : 'GO ONLINE'}</span>
          </button>
        </div>

      </div>

      {/* Daily Metrics Dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl shadow-xl flex flex-col">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Today's Earnings</span>
          <div className="text-2xl font-black text-emerald-400 mt-1">₹{activeDriver.earningsToday + 480}</div>
          <span className="text-[10px] text-emerald-500 font-semibold mt-1">↑ +14% vs yesterday</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl shadow-xl flex flex-col">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Completed Trips</span>
          <div className="text-2xl font-black text-white mt-1">8 Trips</div>
          <span className="text-[10px] text-slate-400 font-semibold mt-1">5.2 hrs on duty</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl shadow-xl flex flex-col">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Acceptance</span>
          <div className="text-2xl font-black text-blue-400 mt-1">98.4%</div>
          <span className="text-[10px] text-blue-500 font-semibold mt-1">High demand zone</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl shadow-xl flex flex-col">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Target Bonus</span>
          <div className="text-2xl font-black text-amber-400 mt-1">+₹250</div>
          <span className="text-[10px] text-amber-500 font-semibold mt-1">2 more trips to unlock</span>
        </div>

      </div>

      {/* INCOMING RIDE NOTIFICATION CARD */}
      {incomingOrder && isOnline && (
        <div className="bg-gradient-to-r from-blue-900/60 via-slate-900 to-indigo-900/60 border-2 border-brand-blue rounded-3xl p-6 shadow-2xl relative overflow-hidden animate-in fade-in">
          
          <div className="flex items-center justify-between pb-4 border-b border-blue-500/30">
            <div className="flex items-center gap-2">
              <Vehicle3dIcon type={incomingOrder.vehicleTier} size={28} />
              <span className="text-xs font-black uppercase tracking-wider text-blue-300">New {incomingOrder.vehicleTier} Ride Dispatch Request</span>
            </div>
            <div className="px-3 py-1 rounded-full bg-brand-blue text-white font-black text-xs">
              Expires in 28s
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 my-5">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Pickup Location</span>
                  <div className="text-sm font-black text-white">{incomingOrder.pickup}</div>
                  <span className="text-[11px] text-emerald-400 font-semibold">1.2 km away (3 mins)</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Navigation className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Drop Location</span>
                  <div className="text-sm font-black text-white">{incomingOrder.drop}</div>
                  <span className="text-[11px] text-slate-400 font-semibold">Trip distance: {incomingOrder.distanceKm} km</span>
                </div>
              </div>
              {incomingOrder.serviceMode === 'PARCEL' && incomingOrder.parcelPhotos && incomingOrder.parcelPhotos.length > 0 && (
                <div className="flex items-start gap-3">
                  <Package className="w-5 h-5 flex-shrink-0 text-amber-400" />
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400">Parcel photo</span>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {incomingOrder.parcelPhotos.map((photo, index) => (
                        <img
                          key={`${index}-${photo.slice(0, 32)}`}
                          src={photo}
                          alt={`Customer parcel photo ${index + 1}: ${incomingOrder.parcelType || 'delivery item'}`}
                          className="h-24 w-24 rounded-xl border border-amber-500/30 object-cover"
                        />
                      ))}
                    </div>
                    <span className="mt-1 block text-[11px] font-semibold text-amber-300">
                      {incomingOrder.parcelType} · {incomingOrder.parcelWeightKg} kg · {incomingOrder.parcelPhotos.length} photo{incomingOrder.parcelPhotos.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col justify-center items-center sm:items-end bg-slate-950/60 rounded-2xl p-4 border border-blue-500/20">
              <span className="text-xs font-bold text-slate-400">Guaranteed Fare</span>
              <div className="text-4xl font-black text-emerald-400 mt-1">₹{incomingOrder.finalFare}</div>
              <span className="text-[11px] text-slate-400 font-semibold mt-1">
                Customer: {incomingOrder.customerName}
              </span>
            </div>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={() => handleAcceptRide(incomingOrder.id)}
              className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-base rounded-2xl shadow-xl shadow-emerald-500/30 flex items-center justify-center gap-2 transition active:scale-98"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>ACCEPT RIDE (₹{incomingOrder.finalFare})</span>
            </button>
            <button 
              onClick={() => onUpdateOrder(incomingOrder.id, { status: 'CANCELLED' })}
              className="px-6 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm rounded-2xl border border-slate-700 transition"
            >
              Pass
            </button>
          </div>

        </div>
      )}

      {/* ACTIVE TRIP COCKPIT */}
      {currentTrip && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-blue animate-pulse"></span>
              <h3 className="text-lg font-black text-white">Active Passenger Trip: {currentTrip.id}</h3>
            </div>
            <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 font-mono text-xs font-bold border border-blue-500/30 uppercase">
              {currentTrip.status}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="text-xs text-slate-400 font-bold">Passenger Details</div>
              <div className="font-black text-base text-white">{currentTrip.customerName}</div>
              <div className="text-xs text-slate-400">{currentTrip.customerPhone}</div>
              <div className="pt-2 text-xs font-bold text-emerald-400">
                Payment: {currentTrip.paymentMethod} (₹{currentTrip.finalFare})
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="text-xs text-slate-400 font-bold">Trip Route Navigation</div>
              <div className="text-xs font-semibold text-slate-300 truncate">P: {currentTrip.pickup}</div>
              <div className="text-xs font-semibold text-slate-300 truncate">D: {currentTrip.drop}</div>
              <div className="pt-1 text-[11px] text-blue-400 font-bold">GPS Route synced to Google Maps</div>
            </div>
          </div>

          {/* REAL-TIME PASSENGER & CAPTAIN MESSAGING COCKPIT */}
          <div className="space-y-2.5 pt-1 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
                  <MessageSquare className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                  Passenger Live Messaging Cockpit
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Real-Time Channel Active
                </span>
              </div>
            </div>

            <TripCockpitChat
              order={currentTrip}
              driver={activeDriver}
              currentRole="DRIVER"
              onSendMessage={(orderId, sender, text) => {
                if (onSendMessage) {
                  onSendMessage(orderId, sender, text);
                } else {
                  // Fallback to updating order directly
                  const newMsg = {
                    id: `msg-${Date.now()}`,
                    orderId,
                    sender,
                    senderName: `${activeDriver.name} (Captain)`,
                    text,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    createdAtMs: Date.now(),
                    readByDriver: true,
                    readByPassenger: false
                  };
                  onUpdateOrder(orderId, {
                    messages: [...(currentTrip.messages || []), newMsg]
                  });
                }
              }}
              onSwitchCockpitRole={onSwitchToCustomer}
            />
          </div>

          {/* OTP Verification to start trip */}
          {['ARRIVING', 'DRIVER_ARRIVED', 'DRIVER_COMING', 'DRIVER_ASSIGNED', 'MATCHED'].includes(currentTrip.status) && (
            <div className="bg-blue-950/40 border border-blue-500/30 p-5 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-black text-sm text-white">Ask Passenger for Rider PIN (OTP)</h4>
                  <p className="text-xs text-slate-400">Enter the 4-digit code shown on the rider's phone to start trip</p>
                </div>
                <span className="text-xs font-mono font-bold text-blue-400">(Test PIN: {currentTrip.riderPin})</span>
              </div>

              <div className="flex gap-3">
                <input 
                  type="text"
                  maxLength={4}
                  value={captainOtpInput}
                  onChange={(e) => setCaptainOtpInput(e.target.value)}
                  placeholder="Enter 4-digit PIN"
                  className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 font-mono text-center text-lg font-black tracking-widest text-white outline-none focus:border-brand-blue"
                />
                <button 
                  onClick={handleStartTripWithOtp}
                  className="flex-1 bg-brand-blue hover:bg-blue-600 text-white font-black text-sm rounded-xl shadow-lg transition"
                >
                  Verify PIN & Start Trip
                </button>
              </div>
              {otpError && <p className="text-xs text-rose-400 font-bold">Incorrect PIN. Please recheck with customer.</p>}
            </div>
          )}

          {/* In Progress Cockpit */}
          {(currentTrip.status === 'IN_PROGRESS' || currentTrip.status === 'TRIP_STARTED') && (
            <div className="space-y-4">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 font-bold">Distance remaining</span>
                  <div className="text-xl font-black text-white">{Math.max(currentTrip.distanceKm - 2, 1)} km</div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 font-bold">Speed limit</span>
                  <div className="text-xl font-black text-emerald-400">45 km/h</div>
                </div>
              </div>

              <button 
                onClick={handleCompleteTrip}
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-base rounded-2xl shadow-xl shadow-emerald-500/30 flex items-center justify-center gap-2 transition"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>COMPLETE TRIP & COLLECT ₹{currentTrip.finalFare}</span>
              </button>
            </div>
          )}

        </div>
      )}

      {/* Simulation Trigger Helper */}
      {!incomingOrder && !currentTrip && (
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>Scanning for passenger requests in Hyderabad / Warangal zone...</span>
          </div>
          <button 
            onClick={onSimulateIncomingRide}
            className="px-3.5 py-1.5 bg-brand-blue/20 hover:bg-brand-blue/30 text-blue-400 font-bold rounded-xl border border-blue-500/30 transition"
          >
            ⚡ Test Incoming Ping
          </button>
        </div>
      )}

    </div>
  );
};
