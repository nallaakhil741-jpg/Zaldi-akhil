/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useState, useEffect } from 'react';
import { 
  AppRole, Driver, RideOrder, TripMessage, CustomerTab 
} from './types';
import { INITIAL_DRIVERS } from './services/mockData';
import { CustomerApp } from './components/CustomerApp';
const CaptainApp = lazy(() => import('./components/CaptainApp').then(({ CaptainApp }) => ({ default: CaptainApp })));
const AdminApp = lazy(() => import('./components/AdminApp').then(({ AdminApp }) => ({ default: AdminApp })));
const FleetTelematicsGIS = lazy(() => import('./components/FleetTelematicsGIS').then(({ FleetTelematicsGIS }) => ({ default: FleetTelematicsGIS })));
const ArchitecturalDepotViewer = lazy(() => import('./components/ArchitecturalDepotViewer').then(({ ArchitecturalDepotViewer }) => ({ default: ArchitecturalDepotViewer })));
import { sounds } from './services/audio';
import { tripChatBroadcaster } from './services/tripChatService';
import { signOutFirebase } from './services/firebase';
import { 
  Smartphone, UserCheck, Shield, Sparkles, 
  Volume2, Car, Bell, ExternalLink, KeyRound, LogOut, ArrowLeft,
  Radio, Building2, Users
} from 'lucide-react';
import { PartnerAuthModal } from './components/PartnerAuthModal';

export default function App() {
  const [activeApp, setActiveApp] = useState<AppRole>('CUSTOMER_APP');
  const [customerSubTab, setCustomerSubTab] = useState<CustomerTab>('BOOKING');
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authenticatedRole, setAuthenticatedRole] = useState<AppRole | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>(INITIAL_DRIVERS);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('cap-ravi-001');

  // Orders state
  const [orders, setOrders] = useState<RideOrder[]>([]);

  const activeDriver = drivers.find(d => d.id === selectedDriverId) || drivers[0];

  // Listen to cross-tab broadcast events for real-time trip messages
  useEffect(() => {
    const unsubscribe = tripChatBroadcaster.subscribe((incomingMsg: TripMessage) => {
      setOrders(prev => prev.map(o => {
        if (o.id === incomingMsg.orderId) {
          if (o.messages?.some(m => m.id === incomingMsg.id)) {
            return o;
          }
          return {
            ...o,
            messages: [...(o.messages || []), incomingMsg]
          };
        }
        return o;
      }));
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const handleNewOrder = (order: RideOrder) => {
    setOrders(prev => [order, ...prev]);
  };

  const handleUpdateOrder = (orderId: string, updates: Partial<RideOrder>) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));
  };

  const handleSendMessage = (orderId: string, sender: 'PASSENGER' | 'DRIVER', text: string) => {
    const order = orders.find(o => o.id === orderId);
    const assignedDriver = drivers.find(d => d.id === (order?.driverId || activeDriver.id)) || activeDriver;
    const senderName = sender === 'PASSENGER' 
      ? (order?.customerName || 'Akhil (Passenger)') 
      : `${assignedDriver.name} (Captain)`;

    const newMsg = tripChatBroadcaster.createMessage({
      orderId,
      sender,
      senderName,
      text
    });

    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          messages: [...(o.messages || []), newMsg]
        };
      }
      return o;
    }));

    tripChatBroadcaster.broadcast(newMsg);
  };

  const handleUpdateDriver = (driverId: string, updates: Partial<Driver>) => {
    setDrivers(prev => prev.map(d => d.id === driverId ? { ...d, ...updates } : d));
  };

  const handleAddDriver = (driver: Driver) => {
    setDrivers(prev => [driver, ...prev.filter(existing => existing.id !== driver.id)]);
  };

  const handleDeleteDriver = (driverId: string) => {
    setDrivers(prev => prev.filter(driver => driver.id !== driverId));
  };

  const handleSimulateIncomingRide = () => {
    sounds.playAlert();
    const orderId = "TRP-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    const mockOrder: RideOrder = {
      id: orderId,
      customerName: "Kavya Patel",
      customerPhone: "+91 98112-99882",
      pickup: "Hitec City Metro Station",
      drop: "Inorbit Mall, Durgam Cheruvu",
      distanceKm: 4.8,
      fare: 75,
      discount: 0,
      finalFare: 75,
      vehicleTier: activeDriver.vehicle,
      vehicleIcon: "🏍️",
      driverId: activeDriver.id,
      riderPin: String(Math.floor(1000 + Math.random() * 9000)),
      status: "SEARCHING",
      paymentMethod: "WALLET",
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      progressPercent: 0,
      messages: [
        tripChatBroadcaster.createMessage({
          orderId,
          sender: 'PASSENGER',
          senderName: 'Kavya Patel (Passenger)',
          text: 'Hi Captain! Waiting at Hitec City Metro Pillar 32.'
        })
      ]
    };
    setOrders(prev => [mockOrder, ...prev]);
  };

  return (
    <div className="w-full h-full min-h-[100svh] bg-white text-slate-900 flex flex-col selection:bg-brand-blue selection:text-white overflow-x-hidden">
      
      {/* Top Universal App Navigation Header (Desktop / Large Screens Only) */}
      <header className="hidden lg:block sticky top-0 z-[120] bg-white/95 backdrop-blur-xl border-b border-slate-200 px-4 sm:px-8 py-3.5 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          
          {/* Logo Branding - Direct Zaldi Identity */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveApp('CUSTOMER_APP')}>
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-brand-blue to-blue-500 flex items-center justify-center shadow-lg shadow-blue-600/30 font-black text-white text-base">
              Z
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-black tracking-tight text-slate-900">Zaldi</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 text-[10px] font-black uppercase tracking-wider border border-blue-500/30">
                  MOBILITY
                </span>
              </div>
              <p className="text-[10px] font-bold text-slate-500 -mt-0.5">Hyderabad & Warangal City Network</p>
            </div>
          </div>

          {/* Primary Platform Switcher Tabs */}
          <nav className="hidden lg:flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold overflow-x-auto no-scrollbar flex-nowrap">
            <button
              onClick={() => {
                sounds.playPop();
                setActiveApp('CUSTOMER_APP');
                setCustomerSubTab('BOOKING');
              }}
              className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
                activeApp === 'CUSTOMER_APP' && customerSubTab === 'BOOKING'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-black' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Car className="w-3.5 h-3.5" />
              <span>Ride Booking</span>
            </button>

            <button
              onClick={() => {
                sounds.playSuccess();
                setActiveApp('CUSTOMER_APP');
                setCustomerSubTab('CARPOOL');
              }}
              className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
                activeApp === 'CUSTOMER_APP' && customerSubTab === 'CARPOOL'
                  ? 'bg-[#00875A] text-white shadow-md shadow-emerald-700/30 font-black' 
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Highway Carpooling</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </button>

            <button
              onClick={() => {
                sounds.playPop();
                setActiveApp('FLEET_GIS');
              }}
              className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
                activeApp === 'FLEET_GIS' 
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30 font-black' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Fleet Telematics & GIS</span>
            </button>

            <button
              onClick={() => {
                sounds.playPop();
                setActiveApp('ARCHITECTURAL_DEPOT');
              }}
              className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
                activeApp === 'ARCHITECTURAL_DEPOT' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-black' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>3D Virtual Depots</span>
            </button>
          </nav>

          {/* Header Actions: Live Status, Audio Mute, and Discreet Partner Portal */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-[11px] font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-slate-700">Live Fleet Active</span>
            </div>

            <button
              onClick={() => {
                const muted = sounds.toggleMute();
                if (!muted) sounds.playPing();
              }}
              title="Toggle Audio Feedback"
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 transition"
            >
              <Volume2 className="w-4 h-4" />
            </button>

            {/* Discreet Captain & Ops Access (Protected behind Authentication) */}
            <button
              onClick={() => {
                sounds.playPop();
                setShowAuthModal(true);
              }}
              title="Partner Portal (Captain & Operations Access)"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold transition hover:text-slate-900"
            >
              <KeyRound className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Partner Portal</span>
            </button>
          </div>

        </div>
      </header>

      {/* Mobile Responsive Navigation Sub-Bar (Shown only in Partner / Telematics / 3D scenes when not on Customer App) */}
      {activeApp !== 'CUSTOMER_APP' && (
        <div className="lg:hidden bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-start gap-1.5 overflow-x-auto no-scrollbar">
        <button
          onClick={() => {
            sounds.playPop();
            setActiveApp('CUSTOMER_APP');
            setCustomerSubTab('BOOKING');
          }}
          className="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 flex-shrink-0 text-slate-600 hover:text-slate-900"
        >
          <Car className="w-3.5 h-3.5" />
          <span>Ride Booking</span>
        </button>

        <button
          onClick={() => {
            sounds.playSuccess();
            setActiveApp('CUSTOMER_APP');
            setCustomerSubTab('CARPOOL');
          }}
          className="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 flex-shrink-0 text-slate-700 hover:text-slate-900"
        >
          <Users className="w-3.5 h-3.5 text-emerald-400" />
          <span>Carpool Hub</span>
        </button>

        <button
          onClick={() => {
            sounds.playPop();
            setActiveApp('FLEET_GIS');
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 flex-shrink-0 ${
            activeApp === 'FLEET_GIS' 
              ? 'bg-cyan-600 text-white font-black shadow-md shadow-cyan-600/30' 
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Fleet GIS</span>
        </button>

        <button
          onClick={() => {
            sounds.playPop();
            setActiveApp('ARCHITECTURAL_DEPOT');
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 flex-shrink-0 ${
            activeApp === 'ARCHITECTURAL_DEPOT' 
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' 
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>3D Depots</span>
        </button>
      </div>
      )}

      {/* Authenticated Mode Banner (Only shown when captain/admin is logged in) */}
      {(activeApp === 'DRIVER_APP' || activeApp === 'ADMIN_APP') && (
        <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 border-b border-blue-800/50 px-4 py-2 text-xs font-bold flex items-center justify-between shadow-inner">
          <div className="flex items-center gap-2 text-blue-300">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
            <span>
              {activeApp === 'DRIVER_APP' 
                ? `Captain Portal Active • ${activeDriver.name} (${activeDriver.vehicle})`
                : 'Ops Command Center Active • Dispatch & Heatmaps'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                sounds.playPop();
                setActiveApp('CUSTOMER_APP');
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-black text-[11px] transition"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>Customer Booking</span>
            </button>
            <button
              onClick={() => {
                sounds.playPop();
                void signOutFirebase().then(() => {
                  setAuthenticatedRole(null);
                  setActiveApp('CUSTOMER_APP');
                }).catch((error: unknown) => {
                  console.error('Firebase sign-out failed:', error);
                  window.alert(error instanceof Error ? error.message : 'Unable to sign out.');
                });
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition"
            >
              <LogOut className="w-3 h-3 text-rose-400" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Telematics / Depot Breadcrumb Banner */}
      {(activeApp === 'FLEET_GIS' || activeApp === 'ARCHITECTURAL_DEPOT') && (
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-700">
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
            <span className="text-slate-700 font-semibold">
              {activeApp === 'FLEET_GIS' 
                ? 'GIS Fleet Telematics • Real-Time GPS Tracking & Speed Compliance Active' 
                : '3D Virtual Architectural Scenes • Staging Bays & Smart Urban Corridor'}
            </span>
          </div>
          <button
            onClick={() => {
              sounds.playPop();
              setActiveApp('CUSTOMER_APP');
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-black text-[11px] transition"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>Passenger Ride</span>
          </button>
        </div>
      )}

      {/* Main App Container */}
      <main className={`flex-1 w-full flex flex-col justify-start bg-white overflow-hidden ${
        activeApp === 'CUSTOMER_APP' 
          ? 'h-full p-0 m-0' 
          : 'max-w-7xl mx-auto px-3 sm:px-6 py-4'
      }`}>
        {activeApp === 'CUSTOMER_APP' && (
          <CustomerApp
            activeDriver={activeDriver}
            orders={orders}
            onNewOrder={handleNewOrder}
            onUpdateOrder={handleUpdateOrder}
            onSendMessage={handleSendMessage}
            activeTab={customerSubTab}
            onTabChange={setCustomerSubTab}
            onSwitchToCaptain={() => {
              setAuthenticatedRole('DRIVER_APP');
              setActiveApp('DRIVER_APP');
            }}
          />
        )}

        {activeApp === 'FLEET_GIS' && (
          <FleetTelematicsGIS 
            onSelectVehicleForDispatch={() => {
              setShowAuthModal(true);
            }} 
          />
        )}

        {activeApp === 'ARCHITECTURAL_DEPOT' && (
          <ArchitecturalDepotViewer />
        )}

        {activeApp === 'DRIVER_APP' && (
          <CaptainApp
            drivers={drivers}
            selectedDriverId={selectedDriverId}
            onSelectDriver={setSelectedDriverId}
            orders={orders}
            onUpdateOrder={handleUpdateOrder}
            onSimulateIncomingRide={handleSimulateIncomingRide}
            onSendMessage={handleSendMessage}
            onSwitchToCustomer={() => setActiveApp('CUSTOMER_APP')}
          />
        )}

        {activeApp === 'ADMIN_APP' && (
          <AdminApp
            drivers={drivers}
            orders={orders}
            onUpdateDriver={handleUpdateDriver}
            onUpdateOrder={handleUpdateOrder}
            onAddDriver={handleAddDriver}
            onDeleteDriver={handleDeleteDriver}
            onAddOrder={handleNewOrder}
            onDeleteOrder={(orderId) => setOrders(prev => prev.filter(order => order.id !== orderId))}
          />
        )}
      </main>

      {/* Partner Authentication Modal */}
      <PartnerAuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthenticate={(role) => {
          setAuthenticatedRole(role);
          setActiveApp(role);
        }}
      />

      {/* Footer Info (Desktop Only for Partner/Ops modes, never squeezing mobile Customer App) */}
      {activeApp !== 'CUSTOMER_APP' && (
        <footer className="hidden lg:flex border-t border-slate-200 bg-white py-4 px-6 text-center text-xs text-slate-600 flex-wrap items-center justify-between max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">Zaldi Logistics & Mobility Platform</span>
            <span>•</span>
            <span>Hyderabad & Warangal City Network</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <span>Fast Pickup</span>
            <span>•</span>
            <span>Verified Captains</span>
            <span>•</span>
            <span>24x7 Safety Shield</span>
          </div>
        </footer>
      )}

    </div>
  );
}
