import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowDownToLine, ChevronDown,
  CircleDollarSign, Clock3, FileText, LayoutDashboard, MapPin, Pencil, Plus,
  Radio, Search, Settings2, ShieldCheck, Trash2, Users, Wallet, X,
} from 'lucide-react';
import type { AdminCollection, FirestoreRecord } from '../services/firebase';
import {
  createAdminRecord, deleteAdminRecord, isFirebaseConfigured, listenToAdminCollection,
  updateAdminRecord,
} from '../services/firebase';
import { downloadCsv } from '../services/csvExport';
import type { BookingStatus, Driver, RideOrder, ServiceMode, TripMessage } from '../types';
import { sounds } from '../services/audio';
import { DemandHeatmap } from './DemandHeatmap';
import { CaptainDensityMap } from './CaptainDensityMap';
import { FleetTelematicsGIS } from './FleetTelematicsGIS';
import { ArchitecturalDepotViewer } from './ArchitecturalDepotViewer';

type AdminSection = 'dashboard' | 'locations' | 'fleet' | 'finance' | 'administration';
type FieldKind = 'text' | 'email' | 'number' | 'date' | 'boolean' | 'select';

interface AdminField {
  key: string;
  label: string;
  kind?: FieldKind;
  required?: boolean;
  options?: string[];
}

interface CollectionConfig {
  label: string;
  fields: AdminField[];
}

interface AdminAppProps {
  drivers: Driver[];
  orders: RideOrder[];
  onUpdateDriver: (driverId: string, updates: Partial<Driver>) => void;
  onUpdateOrder: (orderId: string, updates: Partial<RideOrder>) => void;
  onAddDriver: (driver: Driver) => void;
  onDeleteDriver: (driverId: string) => void;
  onAddOrder: (order: RideOrder) => void;
  onDeleteOrder: (orderId: string) => void;
}

const bookingStatuses: BookingStatus[] = [
  'IDLE', 'FINDING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_COMING', 'DRIVER_ARRIVED',
  'TRIP_STARTED', 'TRIP_COMPLETED', 'SEARCHING', 'MATCHED', 'ARRIVING',
  'IN_PROGRESS', 'PAYMENT', 'COMPLETED', 'CANCELLED',
];
const paymentMethods = ['WALLET', 'UPI', 'CASH', 'CARD'];
const currentDate = new Date().toISOString().slice(0, 10);
const field = (
  key: string,
  label: string,
  kind: FieldKind = 'text',
  extra: Pick<AdminField, 'required' | 'options'> = {},
): AdminField => ({ key, label, kind, ...extra });

const COLLECTION_CONFIG: Record<AdminCollection, CollectionConfig> = {
  orders: {
    label: 'Bookings',
    fields: [
      field('customerName', 'Customer', 'text', { required: true }),
      field('customerPhone', 'Customer phone'),
      field('pickup', 'Pickup', 'text', { required: true }),
      field('drop', 'Drop-off', 'text', { required: true }),
      field('vehicleTier', 'Vehicle type'),
      field('finalFare', 'Fare (₹)', 'number', { required: true }),
      field('status', 'Booking status', 'select', { options: bookingStatuses }),
      field('paymentMethod', 'Payment method', 'select', { options: paymentMethods }),
    ],
  },
  drivers: {
    label: 'Drivers',
    fields: [
      field('name', 'Name', 'text', { required: true }),
      field('phone', 'Phone', 'text', { required: true }),
      field('vehicle', 'Vehicle type'),
      field('vehicleModel', 'Vehicle model'),
      field('plate', 'Registration'),
      field('isOnline', 'Available', 'boolean'),
      field('rating', 'Rating', 'number'),
      field('totalTrips', 'Completed trips', 'number'),
      field('earningsToday', "Today's earnings (₹)", 'number'),
    ],
  },
  cities: {
    label: 'Cities',
    fields: [
      field('name', 'City name', 'text', { required: true }),
      field('state', 'State', 'text', { required: true }),
      field('active', 'Active', 'boolean'),
    ],
  },
  zones: {
    label: 'Zones',
    fields: [
      field('name', 'Zone name', 'text', { required: true }),
      field('city', 'City', 'text', { required: true }),
      field('coverageKm', 'Coverage (km)', 'number'),
      field('active', 'Active', 'boolean'),
    ],
  },
  customers: {
    label: 'Customers',
    fields: [
      field('name', 'Name', 'text', { required: true }),
      field('email', 'Email', 'email'),
      field('phone', 'Phone', 'text', { required: true }),
      field('status', 'Status', 'select', { options: ['ACTIVE', 'SUSPENDED'] }),
      field('createdAt', 'Joined', 'date'),
    ],
  },
  vehicleTypes: {
    label: 'Vehicle types',
    fields: [
      field('name', 'Name', 'text', { required: true }),
      field('category', 'Category'),
      field('capacity', 'Capacity'),
      field('baseFare', 'Base fare (₹)', 'number'),
      field('perKm', 'Per km (₹)', 'number'),
      field('status', 'Status', 'select', { options: ['ACTIVE', 'INACTIVE'] }),
    ],
  },
  bookingStatuses: {
    label: 'Booking status',
    fields: [
      field('value', 'Status code', 'text', { required: true }),
      field('label', 'Display name', 'text', { required: true }),
      field('description', 'Description'),
      field('active', 'Active', 'boolean'),
    ],
  },
  paymentMethods: {
    label: 'Payment methods',
    fields: [
      field('name', 'Method name', 'text', { required: true }),
      field('provider', 'Provider'),
      field('enabled', 'Enabled', 'boolean'),
    ],
  },
  commissions: {
    label: 'Commissions',
    fields: [
      field('service', 'Service', 'text', { required: true }),
      field('rate', 'Commission (%)', 'number', { required: true }),
      field('effectiveFrom', 'Effective from', 'date'),
      field('status', 'Status', 'select', { options: ['ACTIVE', 'INACTIVE'] }),
    ],
  },
  transactions: {
    label: 'Transactions',
    fields: [
      field('bookingId', 'Booking ID'),
      field('customer', 'Customer'),
      field('amount', 'Amount (₹)', 'number', { required: true }),
      field('method', 'Method', 'select', { options: paymentMethods }),
      field('status', 'Status', 'select', { options: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'] }),
      field('createdAt', 'Date', 'date'),
    ],
  },
  wallets: {
    label: 'Wallets',
    fields: [
      field('customer', 'Customer', 'text', { required: true }),
      field('balance', 'Balance (₹)', 'number', { required: true }),
      field('currency', 'Currency'),
      field('status', 'Status', 'select', { options: ['ACTIVE', 'FROZEN'] }),
    ],
  },
  invoices: {
    label: 'Invoices',
    fields: [
      field('invoiceNo', 'Invoice number', 'text', { required: true }),
      field('bookingId', 'Booking ID'),
      field('amount', 'Amount (₹)', 'number', { required: true }),
      field('status', 'Status', 'select', { options: ['DRAFT', 'ISSUED', 'PAID', 'OVERDUE'] }),
      field('dueDate', 'Due date', 'date'),
    ],
  },
  refunds: {
    label: 'Refunds',
    fields: [
      field('bookingId', 'Booking ID', 'text', { required: true }),
      field('amount', 'Amount (₹)', 'number', { required: true }),
      field('reason', 'Reason', 'text', { required: true }),
      field('status', 'Status', 'select', { options: ['REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSED'] }),
      field('requestedAt', 'Requested', 'date'),
    ],
  },
  roles: {
    label: 'Roles',
    fields: [
      field('name', 'Role name', 'text', { required: true }),
      field('description', 'Description'),
      field('permissions', 'Permission codes (comma-separated)'),
      field('status', 'Status', 'select', { options: ['ACTIVE', 'INACTIVE'] }),
    ],
  },
  permissions: {
    label: 'Permissions',
    fields: [
      field('name', 'Permission code', 'text', { required: true }),
      field('resource', 'Resource', 'text', { required: true }),
      field('action', 'Action', 'select', { options: ['READ', 'CREATE', 'UPDATE', 'DELETE', 'MANAGE'] }),
    ],
  },
  supportTickets: {
    label: 'Support',
    fields: [
      field('customer', 'Customer', 'text', { required: true }),
      field('subject', 'Subject', 'text', { required: true }),
      field('priority', 'Priority', 'select', { options: ['LOW', 'NORMAL', 'HIGH', 'URGENT'] }),
      field('status', 'Status', 'select', { options: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] }),
      field('updatedAt', 'Last updated', 'date'),
    ],
  },
  content: {
    label: 'Content',
    fields: [
      field('key', 'Content key', 'text', { required: true }),
      field('title', 'Title', 'text', { required: true }),
      field('body', 'Body'),
      field('status', 'Status', 'select', { options: ['PUBLISHED', 'DRAFT'] }),
    ],
  },
  systemSettings: {
    label: 'System settings',
    fields: [
      field('key', 'Setting key', 'text', { required: true }),
      field('value', 'Value', 'text', { required: true }),
      field('description', 'Description'),
      field('updatedAt', 'Updated', 'date'),
    ],
  },
};

const COLLECTIONS_BY_SECTION: Record<Exclude<AdminSection, 'dashboard'>, AdminCollection[]> = {
  locations: ['cities', 'zones'],
  fleet: ['orders', 'drivers', 'customers', 'vehicleTypes', 'bookingStatuses'],
  finance: ['paymentMethods', 'commissions', 'transactions', 'wallets', 'invoices', 'refunds'],
  administration: ['roles', 'permissions', 'supportTickets', 'content', 'systemSettings'],
};

const DEMO_RECORDS: Record<AdminCollection, FirestoreRecord[]> = {
  orders: [],
  drivers: [],
  cities: [
    { id: 'city-hyderabad', name: 'Hyderabad', state: 'Telangana', active: true },
    { id: 'city-warangal', name: 'Warangal', state: 'Telangana', active: true },
  ],
  zones: [
    { id: 'zone-hitec', name: 'HITEC City', city: 'Hyderabad', coverageKm: 12, active: true },
    { id: 'zone-secunderabad', name: 'Secunderabad', city: 'Hyderabad', coverageKm: 10, active: true },
    { id: 'zone-hanamkonda', name: 'Hanamkonda', city: 'Warangal', coverageKm: 8, active: true },
  ],
  customers: [
    { id: 'customer-1', name: 'Aarav Reddy', email: 'aarav@example.com', phone: '+91 90000 10001', status: 'ACTIVE', createdAt: currentDate },
    { id: 'customer-2', name: 'Maya Shah', email: 'maya@example.com', phone: '+91 90000 10002', status: 'ACTIVE', createdAt: currentDate },
  ],
  vehicleTypes: [
    { id: 'vehicle-bike', name: 'Bike Moto', category: 'Two-wheeler', capacity: '1 person', baseFare: 25, perKm: 8, status: 'ACTIVE' },
    { id: 'vehicle-auto', name: 'Auto 3W', category: 'Auto', capacity: '3 persons', baseFare: 25, perKm: 8, status: 'ACTIVE' },
    { id: 'vehicle-cab', name: 'Cab Prime', category: 'Cab', capacity: '4 persons', baseFare: 25, perKm: 8, status: 'ACTIVE' },
  ],
  bookingStatuses: bookingStatuses.map((status) => ({
    id: `status-${status.toLowerCase()}`,
    value: status,
    label: status.replaceAll('_', ' '),
    description: '',
    active: true,
  })),
  paymentMethods: [
    { id: 'method-upi', name: 'UPI', provider: 'Unified Payments Interface', enabled: true },
    { id: 'method-cash', name: 'Cash', provider: 'Cash', enabled: true },
    { id: 'method-wallet', name: 'Wallet', provider: 'Zaldi Wallet', enabled: true },
  ],
  commissions: [
    { id: 'commission-city', service: 'City rides', rate: 10, effectiveFrom: currentDate, status: 'ACTIVE' },
    { id: 'commission-carpool', service: 'Carpool', rate: 8, effectiveFrom: currentDate, status: 'ACTIVE' },
  ],
  transactions: [
    { id: 'txn-demo-1', bookingId: 'DEMO-1042', customer: 'Aarav Reddy', amount: 285, method: 'UPI', status: 'COMPLETED', createdAt: currentDate },
    { id: 'txn-demo-2', bookingId: 'DEMO-1041', customer: 'Maya Shah', amount: 160, method: 'WALLET', status: 'COMPLETED', createdAt: currentDate },
  ],
  wallets: [
    { id: 'wallet-1', customer: 'Aarav Reddy', balance: 1240, currency: 'INR', status: 'ACTIVE' },
    { id: 'wallet-2', customer: 'Maya Shah', balance: 680, currency: 'INR', status: 'ACTIVE' },
  ],
  invoices: [
    { id: 'invoice-1042', invoiceNo: 'ZAL-2026-1042', bookingId: 'DEMO-1042', amount: 285, status: 'PAID', dueDate: currentDate },
  ],
  refunds: [],
  roles: [
    { id: 'role-ops-admin', name: 'Operations Admin', description: 'Manage bookings and fleet', permissions: 'bookings.manage,fleet.manage', status: 'ACTIVE' },
    { id: 'role-finance', name: 'Finance', description: 'Manage payments and invoices', permissions: 'finance.read,finance.manage', status: 'ACTIVE' },
  ],
  permissions: [
    { id: 'permission-bookings-read', name: 'bookings.read', resource: 'bookings', action: 'READ' },
    { id: 'permission-fleet-manage', name: 'fleet.manage', resource: 'fleet', action: 'MANAGE' },
  ],
  supportTickets: [
    { id: 'ticket-1001', customer: 'Aarav Reddy', subject: 'Fare adjustment request', priority: 'NORMAL', status: 'OPEN', updatedAt: currentDate },
  ],
  content: [
    { id: 'content-home-banner', key: 'home.banner', title: 'Ride across the city', body: 'Book a ride with Zaldi.', status: 'PUBLISHED' },
  ],
  systemSettings: [
    { id: 'setting-currency', key: 'currency', value: 'INR', description: 'Platform display currency', updatedAt: currentDate },
    { id: 'setting-support-email', key: 'supportEmail', value: 'support@zaldi.in', description: 'Customer support email', updatedAt: currentDate },
  ],
};

const EMPTY_RECORDS: Record<AdminCollection, FirestoreRecord[]> = {
  orders: [],
  drivers: [],
  cities: [],
  zones: [],
  customers: [],
  vehicleTypes: [],
  bookingStatuses: [],
  paymentMethods: [],
  commissions: [],
  transactions: [],
  wallets: [],
  invoices: [],
  refunds: [],
  roles: [],
  permissions: [],
  supportTickets: [],
  content: [],
  systemSettings: [],
};

const SECTIONS: Array<{ id: AdminSection; label: string; icon: React.ElementType }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'locations', label: 'Locations', icon: MapPin },
  { id: 'fleet', label: 'Fleet', icon: Users },
  { id: 'finance', label: 'Finance', icon: CircleDollarSign },
  { id: 'administration', label: 'Administration', icon: Settings2 },
];

const SPATIAL_VIEWS = ['Fleet GIS', 'Depot view', 'Driver density', 'Demand heatmap'] as const;
type SpatialView = (typeof SPATIAL_VIEWS)[number];

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asDateString(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString();
  }
  return fallback;
}

function isTripMessage(value: unknown): value is TripMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Record<string, unknown>;
  return typeof message.id === 'string'
    && typeof message.orderId === 'string'
    && (message.sender === 'PASSENGER' || message.sender === 'DRIVER')
    && typeof message.senderName === 'string'
    && typeof message.text === 'string'
    && typeof message.timestamp === 'string'
    && typeof message.createdAtMs === 'number';
}

function coordinatesFromRecord(value: unknown): { lat: number; lng: number } | undefined {
  if (typeof value !== 'object' || value === null || !('lat' in value) || !('lng' in value)) return undefined;
  const lat = asNumber(value.lat, Number.NaN);
  const lng = asNumber(value.lng, Number.NaN);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
}

function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === 'string' && bookingStatuses.includes(value as BookingStatus);
}

function driverFromRecord(record: FirestoreRecord): Driver {
  return {
    id: record.id,
    name: asString(record.name, 'New driver'),
    phone: asString(record.phone),
    vehicle: asString(record.vehicle),
    vehicleModel: asString(record.vehicleModel),
    plate: asString(record.plate),
    rating: asNumber(record.rating, 5),
    totalTrips: asNumber(record.totalTrips),
    isOnline: record.isOnline === true,
    avatarSeed: asString(record.avatarSeed, record.id),
    lat: asNumber(record.lat),
    lng: asNumber(record.lng),
    earningsToday: asNumber(record.earningsToday),
  };
}

function orderFromRecord(record: FirestoreRecord): RideOrder {
  const status = isBookingStatus(record.status) ? record.status : 'SEARCHING';
  const paymentMethod = paymentMethods.includes(String(record.paymentMethod))
    ? record.paymentMethod as RideOrder['paymentMethod']
    : 'CASH';
  const serviceMode: ServiceMode | undefined = record.serviceMode === 'PERSON' || record.serviceMode === 'PARCEL'
    ? record.serviceMode
    : undefined;
  const messages = Array.isArray(record.messages) ? record.messages.filter(isTripMessage) : undefined;
  const parcelPhotos = Array.isArray(record.parcelPhotos)
    ? record.parcelPhotos.filter((photo): photo is string => typeof photo === 'string')
    : undefined;
  return {
    id: record.id,
    customerName: asString(record.customerName, 'Customer'),
    customerPhone: asString(record.customerPhone),
    pickup: asString(record.pickup),
    drop: asString(record.drop),
    distanceKm: asNumber(record.distanceKm),
    fare: asNumber(record.fare, asNumber(record.finalFare)),
    discount: asNumber(record.discount),
    finalFare: asNumber(record.finalFare),
    vehicleTier: asString(record.vehicleTier),
    vehicleIcon: asString(record.vehicleIcon),
    driverId: asString(record.driverId),
    riderPin: asString(record.riderPin),
    status,
    paymentMethod,
    createdAt: asDateString(record.createdAt, new Date().toISOString()),
    progressPercent: asNumber(record.progressPercent),
    pickupPlaceId: asString(record.pickupPlaceId) || undefined,
    dropPlaceId: asString(record.dropPlaceId) || undefined,
    pickupCoordinates: coordinatesFromRecord(record.pickupCoordinates),
    dropCoordinates: coordinatesFromRecord(record.dropCoordinates),
    serviceMode,
    parcelType: asString(record.parcelType) || undefined,
    parcelWeightKg: record.parcelWeightKg === undefined ? undefined : asNumber(record.parcelWeightKg),
    parcelPhotos,
    luggageWeightKg: record.luggageWeightKg === undefined ? undefined : asNumber(record.luggageWeightKg),
    extraLuggageFee: record.extraLuggageFee === undefined ? undefined : asNumber(record.extraLuggageFee),
    receiverName: asString(record.receiverName) || undefined,
    receiverPhone: asString(record.receiverPhone) || undefined,
    deliveryNotes: asString(record.deliveryNotes) || undefined,
    isFragile: typeof record.isFragile === 'boolean' ? record.isFragile : undefined,
    messages,
  };
}

function createDemoId(): string {
  return `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function currency(value: number): string {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function displayValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export const AdminApp: React.FC<AdminAppProps> = ({
  drivers,
  orders,
  onUpdateDriver,
  onUpdateOrder,
  onAddDriver,
  onDeleteDriver,
  onAddOrder,
  onDeleteOrder,
}) => {
  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');
  const [activeCollection, setActiveCollection] = useState<AdminCollection>('orders');
  const [spatialView, setSpatialView] = useState<SpatialView>('Fleet GIS');
  const [records, setRecords] = useState<Record<AdminCollection, FirestoreRecord[]>>(() => ({
    ...DEMO_RECORDS,
  }));
  const [listenerErrors, setListenerErrors] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [editingRecord, setEditingRecord] = useState<FirestoreRecord | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) return;

    setRecords(EMPTY_RECORDS);
    const unsubscribe = (Object.keys(COLLECTION_CONFIG) as AdminCollection[]).map((name) =>
      listenToAdminCollection(
        name,
        (nextRecords) => {
          setRecords((current) => ({ ...current, [name]: nextRecords }));
        },
        (error) => {
          console.error(`Firebase ${name} listener failed:`, error);
          setListenerErrors((current) => [...new Set([...current, `${COLLECTION_CONFIG[name].label}: ${error.message}`])]);
        },
      ),
    );

    return () => unsubscribe.forEach((stop) => stop());
  }, []);

  const adminDrivers = useMemo(
    () => isFirebaseConfigured ? records.drivers.map(driverFromRecord) : drivers,
    [drivers, records.drivers],
  );
  const adminOrders = useMemo(
    () => isFirebaseConfigured ? records.orders.map(orderFromRecord) : orders,
    [orders, records.orders],
  );

  const activeRows = useMemo(() => {
    if (activeCollection === 'drivers') {
      return isFirebaseConfigured
        ? records.drivers
        : drivers.map((driver) => ({ ...driver }) as FirestoreRecord);
    }
    if (activeCollection === 'orders') {
      return isFirebaseConfigured
        ? records.orders
        : orders.map((order) => ({ ...order }) as FirestoreRecord);
    }
    return records[activeCollection];
  }, [activeCollection, drivers, orders, records]);

  const filteredRows = useMemo(() => activeRows.filter((record) => {
    if (statusFilter !== 'ALL' && String(record.status ?? record.active ?? record.enabled) !== statusFilter) return false;
    return !search.trim() || JSON.stringify(record).toLowerCase().includes(search.trim().toLowerCase());
  }), [activeRows, search, statusFilter]);

  const completedOrders = adminOrders.filter((order) => order.status === 'COMPLETED' || order.status === 'TRIP_COMPLETED');
  const totalRevenue = completedOrders.reduce((sum, order) => sum + order.finalFare, 0);
  const successfulTransactions = records.transactions.filter((transaction) => transaction.status === 'COMPLETED');
  const transactionRevenue = successfulTransactions.reduce((sum, transaction) => sum + asNumber(transaction.amount), 0);

  const setSection = (section: AdminSection) => {
    setActiveSection(section);
    if (section !== 'dashboard') setActiveCollection(COLLECTIONS_BY_SECTION[section][0]);
    setSearch('');
    setStatusFilter('ALL');
    sounds.playPop();
  };

  const setCollection = (collectionName: AdminCollection) => {
    setActiveCollection(collectionName);
    setSearch('');
    setStatusFilter('ALL');
    setMutationError(null);
    sounds.playPop();
  };

  const openCreate = () => {
    setDraft(Object.fromEntries(COLLECTION_CONFIG[activeCollection].fields.map((item) => [
      item.key,
      item.kind === 'boolean' ? false : item.kind === 'number' ? 0 : item.kind === 'date' ? currentDate : '',
    ])));
    setEditingRecord(null);
    setIsCreating(true);
    setMutationError(null);
  };

  const openEdit = (record: FirestoreRecord) => {
    setDraft(Object.fromEntries(COLLECTION_CONFIG[activeCollection].fields.map((item) => [
      item.key,
      item.kind === 'date'
        ? asDateString(record[item.key], '').slice(0, 10)
        : record[item.key] ?? (item.kind === 'boolean' ? false : ''),
    ])));
    setEditingRecord(record);
    setIsCreating(false);
    setMutationError(null);
  };

  const applyParentCollectionChange = (
    collectionName: AdminCollection,
    record: FirestoreRecord,
    operation: 'create' | 'update' | 'delete',
  ) => {
    if (isFirebaseConfigured) return;
    if (collectionName === 'drivers') {
      if (operation === 'delete') onDeleteDriver(record.id);
      else if (operation === 'create') onAddDriver(driverFromRecord(record));
      else onUpdateDriver(record.id, driverFromRecord(record));
    }
    if (collectionName === 'orders') {
      if (operation === 'delete') onDeleteOrder(record.id);
      else if (operation === 'create') onAddOrder(orderFromRecord(record));
      else onUpdateOrder(record.id, {
        customerName: asString(record.customerName),
        customerPhone: asString(record.customerPhone),
        pickup: asString(record.pickup),
        drop: asString(record.drop),
        vehicleTier: asString(record.vehicleTier),
        finalFare: asNumber(record.finalFare),
        status: isBookingStatus(record.status) ? record.status : 'SEARCHING',
        paymentMethod: paymentMethods.includes(String(record.paymentMethod))
          ? record.paymentMethod as RideOrder['paymentMethod']
          : 'CASH',
      });
    }
  };

  const toggleDriverAvailability = async (driver: Driver) => {
    const isOnline = !driver.isOnline;
    try {
      if (isFirebaseConfigured) await updateAdminRecord('drivers', driver.id, { isOnline });
      else onUpdateDriver(driver.id, { isOnline });
      if (!isFirebaseConfigured) {
        setRecords((current) => ({
          ...current,
          drivers: current.drivers.map((record) => record.id === driver.id ? { ...record, isOnline } : record),
        }));
      }
    } catch (error) {
      console.error('Failed to update driver availability:', error);
      setMutationError(error instanceof Error ? error.message : 'Unable to update availability.');
    }
  };

  const saveRecord = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setMutationError(null);
    const collectionName = activeCollection;
    const timestamp = new Date().toISOString();
    const payload: Record<string, unknown> = { ...draft };
    if (collectionName === 'drivers' && isCreating) {
      Object.assign(payload, { avatarSeed: asString(payload.name), lat: 0, lng: 0 });
    }
    if (collectionName === 'orders' && isCreating) {
      Object.assign(payload, {
        distanceKm: 0,
        fare: asNumber(payload.finalFare),
        discount: 0,
        vehicleIcon: '',
        driverId: '',
        riderPin: '',
        createdAt: timestamp,
        progressPercent: 0,
      });
    }
    try {
      if (isCreating) {
        const id = isFirebaseConfigured
          ? await createAdminRecord(collectionName, payload)
          : createDemoId();
        const created = { ...payload, id } as FirestoreRecord;
        if (!isFirebaseConfigured) {
          setRecords((current) => ({ ...current, [collectionName]: [created, ...current[collectionName]] }));
          applyParentCollectionChange(collectionName, created, 'create');
        }
      } else if (editingRecord) {
        const updated = { ...editingRecord, ...payload };
        if (isFirebaseConfigured) await updateAdminRecord(collectionName, editingRecord.id, payload);
        else setRecords((current) => ({
          ...current,
          [collectionName]: current[collectionName].map((record) => record.id === editingRecord.id ? updated : record),
        }));
        applyParentCollectionChange(collectionName, updated, 'update');
      }
      setIsCreating(false);
      setEditingRecord(null);
      sounds.playSuccess();
    } catch (error) {
      console.error(`Failed to save ${COLLECTION_CONFIG[collectionName].label.toLowerCase()} record:`, error);
      setMutationError(error instanceof Error ? error.message : 'Unable to save record.');
    } finally {
      setIsSaving(false);
    }
  };

  const removeRecord = async (record: FirestoreRecord) => {
    if (!window.confirm(`Delete this ${COLLECTION_CONFIG[activeCollection].label.toLowerCase()} record?`)) return;
    setMutationError(null);
    try {
      if (isFirebaseConfigured) await deleteAdminRecord(activeCollection, record.id);
      else setRecords((current) => ({
        ...current,
        [activeCollection]: current[activeCollection].filter((item) => item.id !== record.id),
      }));
      applyParentCollectionChange(activeCollection, record, 'delete');
      sounds.playSuccess();
    } catch (error) {
      console.error(`Failed to delete ${COLLECTION_CONFIG[activeCollection].label.toLowerCase()} record:`, error);
      setMutationError(error instanceof Error ? error.message : 'Unable to delete record.');
    }
  };

  const rowStatusValues = Array.from(new Set(activeRows.map((record) => {
    const value = record.status ?? (typeof record.active === 'boolean' ? record.active : record.enabled);
    return value === undefined ? '' : String(value);
  }).filter(Boolean)));
  const collectionConfig = COLLECTION_CONFIG[activeCollection];
  const setDraftField = (key: string, value: unknown, kind?: FieldKind) => {
    const parsed = kind === 'number' ? (value === '' ? '' : Number(value)) : value;
    setDraft((current) => ({ ...current, [key]: parsed }));
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-12 text-slate-100">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-xl sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em]">
            <span className="rounded-full border border-blue-400/30 bg-blue-500/10 px-2.5 py-1 text-blue-300">Zaldi Admin</span>
            <span className={`flex items-center gap-1.5 ${isFirebaseConfigured ? 'text-emerald-300' : 'text-amber-300'}`}>
              <span className={`h-2 w-2 rounded-full ${isFirebaseConfigured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {isFirebaseConfigured ? 'Firebase live mode' : 'Local demo mode'}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">Mobility operations</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage bookings, fleet, locations, finance, and platform settings.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
          <ShieldCheck className={`h-5 w-5 ${isFirebaseConfigured ? 'text-emerald-400' : 'text-amber-400'}`} />
          <div>
            <p className="text-xs font-bold text-white">{isFirebaseConfigured ? 'Authenticated admin' : 'Demo data only'}</p>
            <p className="text-[11px] text-slate-400">{isFirebaseConfigured ? 'Live listeners connected' : 'Changes are temporary'}</p>
          </div>
        </div>
      </header>

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950 p-2 no-scrollbar">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              activeSection === id ? 'bg-blue-600 text-white shadow-lg shadow-blue-950' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {listenerErrors.length > 0 && (
        <div className="flex gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">Some live records could not be loaded.</p>
            <ul className="mt-1 list-inside list-disc text-xs text-rose-100/80">{listenerErrors.map((error) => <li key={error}>{error}</li>)}</ul>
            <p className="mt-2 text-xs">Check Firebase Authentication claims and Firestore rules. No remote changes are hidden or replaced with demo data.</p>
          </div>
        </div>
      )}

      {activeSection === 'dashboard' ? (
        <Dashboard
          orders={adminOrders}
          drivers={adminDrivers}
          revenue={isFirebaseConfigured ? transactionRevenue || totalRevenue : totalRevenue || transactionRevenue}
          transactions={records.transactions}
          onOpenBookings={() => {
            setSection('fleet');
            setCollection('orders');
          }}
          onSpatialViewChange={setSpatialView}
          spatialView={spatialView}
          onToggleDriver={toggleDriverAvailability}
        />
      ) : (
        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-xl">
          <div className="flex flex-col gap-4 border-b border-slate-800 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-blue-300">
                {activeSection === 'locations' ? <MapPin className="h-3.5 w-3.5" /> :
                  activeSection === 'fleet' ? <Users className="h-3.5 w-3.5" /> :
                    activeSection === 'finance' ? <Wallet className="h-3.5 w-3.5" /> : <Settings2 className="h-3.5 w-3.5" />}
                {activeSection}
              </div>
              <h2 className="mt-1 text-xl font-black text-white">{collectionConfig.label} management</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[190px] flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search records"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-blue-500"
                />
              </label>
              {rowStatusValues.length > 0 && (
                <label className="relative">
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="appearance-none rounded-xl border border-slate-700 bg-slate-900 py-2.5 pl-3 pr-9 text-sm text-white outline-none focus:border-blue-500"
                  >
                    <option value="ALL">All statuses</option>
                    {rowStatusValues.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </label>
              )}
              <button
                onClick={() => downloadCsv(
                  `zaldi-${activeCollection}.csv`,
                  ['id', ...collectionConfig.fields.map((item) => item.key)],
                  filteredRows,
                )}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-800"
              >
                <ArrowDownToLine className="h-4 w-4" /> CSV
              </button>
              <button
                onClick={openCreate}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2.5 text-sm font-black text-white hover:bg-blue-500"
              >
                <Plus className="h-4 w-4" /> Add record
              </button>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto border-b border-slate-800 px-4 py-3 no-scrollbar">
            {COLLECTIONS_BY_SECTION[activeSection as Exclude<AdminSection, 'dashboard'>].map((name) => (
              <button
                key={name}
                onClick={() => setCollection(name)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  activeCollection === name ? 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/30' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                }`}
              >
                {COLLECTION_CONFIG[name].label}
              </button>
            ))}
          </div>

          {mutationError && (
            <div className="m-4 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {mutationError}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-900/80 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Record ID</th>
                  {collectionConfig.fields.slice(0, 5).map((item) => <th className="px-4 py-3" key={item.key}>{item.label}</th>)}
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredRows.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-900/60">
                    <td className="max-w-40 truncate px-4 py-3 font-mono text-xs font-bold text-blue-300">{record.id}</td>
                    {collectionConfig.fields.slice(0, 5).map((item) => (
                      <td className="max-w-48 truncate px-4 py-3 text-slate-300" key={item.key}>
                        {item.key === 'status' || item.key === 'active' || item.key === 'enabled' ? (
                          <span className={`rounded-full px-2 py-1 text-[10px] font-black ${
                            record[item.key] === true || ['ACTIVE', 'COMPLETED', 'PAID', 'PUBLISHED', 'OPEN'].includes(String(record[item.key]))
                              ? 'bg-emerald-500/10 text-emerald-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}>{displayValue(record[item.key])}</span>
                        ) : displayValue(record[item.key])}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {activeCollection === 'drivers' && (
                          <button
                            title={record.isOnline ? 'Set offline' : 'Set available'}
                            onClick={() => void toggleDriverAvailability(driverFromRecord(record))}
                            className={`mr-1 rounded-lg px-2 py-1 text-[10px] font-black ${record.isOnline ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}
                          >
                            {record.isOnline ? 'Available' : 'Offline'}
                          </button>
                        )}
                        <button aria-label={`Edit ${record.id}`} onClick={() => openEdit(record)} className="rounded-lg p-2 text-slate-400 hover:bg-blue-500/10 hover:text-blue-300">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button aria-label={`Delete ${record.id}`} onClick={() => void removeRecord(record)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-300">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredRows.length === 0 && (
              <div className="px-6 py-14 text-center">
                <FileText className="mx-auto h-8 w-8 text-slate-600" />
                <p className="mt-3 font-bold text-slate-300">No {collectionConfig.label.toLowerCase()} found</p>
                <p className="mt-1 text-xs text-slate-500">{search || statusFilter !== 'ALL' ? 'Try adjusting your filters.' : 'Add a record to get started.'}</p>
              </div>
            )}
          </div>
          <footer className="border-t border-slate-800 px-5 py-3 text-xs text-slate-500">
            Showing {filteredRows.length} of {activeRows.length} records {isFirebaseConfigured ? '• live Firestore data' : '• local demo data'}
          </footer>
        </section>
      )}

      {(isCreating || editingRecord) && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form onSubmit={(event) => void saveRecord(event)} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-700 bg-slate-950 p-5 shadow-2xl sm:p-6">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-300">{isCreating ? 'New record' : 'Edit record'}</p>
                <h2 className="mt-1 text-xl font-black text-white">{collectionConfig.label}</h2>
                {editingRecord && <p className="mt-1 font-mono text-xs text-slate-500">{editingRecord.id}</p>}
              </div>
              <button type="button" onClick={() => { setIsCreating(false); setEditingRecord(null); }} className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
                <div className="grid gap-4 sm:grid-cols-2">
              {collectionConfig.fields.map((item) => (
                <label key={item.key} className={`text-xs font-bold text-slate-300 ${item.kind === 'boolean' ? 'flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-3 py-3' : ''} ${item.key === 'body' || item.key === 'description' ? 'sm:col-span-2' : ''}`}>
                  {item.kind === 'boolean' ? (
                    <>
                      <input
                        type="checkbox"
                        checked={draft[item.key] === true}
                        onChange={(event) => setDraftField(item.key, event.target.checked, item.kind)}
                        className="h-4 w-4 accent-blue-500"
                      />
                      {item.label}
                    </>
                  ) : item.kind === 'select' ? (
                    <>
                      {item.label}
                      <select
                        required={item.required}
                        value={String(draft[item.key] ?? '')}
                        onChange={(event) => setDraftField(item.key, event.target.value, item.kind)}
                        className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
                      >
                        <option value="">Select…</option>
                        {item.options?.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </>
                  ) : (
                    <>
                      {item.label}
                      {item.key === 'body' || item.key === 'description' ? (
                        <textarea
                          required={item.required}
                          rows={4}
                          value={displayValue(draft[item.key]) === '—' ? '' : displayValue(draft[item.key])}
                          onChange={(event) => setDraftField(item.key, event.target.value, item.kind)}
                          className="mt-1.5 w-full resize-y rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
                        />
                      ) : (
                        <input
                          type={item.kind ?? 'text'}
                          required={item.required}
                          value={displayValue(draft[item.key]) === '—' ? '' : displayValue(draft[item.key])}
                          onChange={(event) => setDraftField(item.key, event.target.value, item.kind)}
                          className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
                        />
                      )}
                    </>
                  )}
                </label>
              ))}
            </div>
            {mutationError && <p className="mt-4 rounded-xl bg-rose-500/10 p-3 text-xs text-rose-200">{mutationError}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => { setIsCreating(false); setEditingRecord(null); }} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-300 hover:bg-slate-800">Cancel</button>
              <button type="submit" disabled={isSaving} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-500 disabled:opacity-60">
                {isSaving ? 'Saving…' : isCreating ? 'Create record' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

interface DashboardProps {
  orders: RideOrder[];
  drivers: Driver[];
  revenue: number;
  transactions: FirestoreRecord[];
  onOpenBookings: () => void;
  onSpatialViewChange: (view: SpatialView) => void;
  spatialView: SpatialView;
  onToggleDriver: (driver: Driver) => void | Promise<void>;
}

const Dashboard: React.FC<DashboardProps> = ({
  orders, drivers, revenue, transactions, onOpenBookings, onSpatialViewChange, spatialView, onToggleDriver,
}) => {
  const active = orders.filter((order) => !['COMPLETED', 'TRIP_COMPLETED', 'CANCELLED'].includes(order.status));
  const completed = orders.filter((order) => ['COMPLETED', 'TRIP_COMPLETED'].includes(order.status));
  const revenueByVehicle = completed.reduce<Record<string, number>>((summary, order) => {
    const name = order.vehicleTier || 'Other';
    summary[name] = (summary[name] ?? 0) + order.finalFare;
    return summary;
  }, {});
  const maxRevenue = Math.max(...Object.values(revenueByVehicle), 1);
  const onlineDrivers = drivers.filter((driver) => driver.isOnline).length;
  const ongoing = orders.filter((order) => ['ARRIVING', 'IN_PROGRESS', 'TRIP_STARTED', 'DRIVER_COMING', 'DRIVER_ARRIVED'].includes(order.status)).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard title="Total bookings" value={orders.length.toLocaleString()} detail={`${active.length} active now`} icon={<Activity className="h-4 w-4" />} tone="blue" />
        <MetricCard title="Drivers available" value={`${onlineDrivers} / ${drivers.length}`} detail={`${drivers.length - onlineDrivers} currently offline`} icon={<Users className="h-4 w-4" />} tone="emerald" />
        <MetricCard title="Ongoing trips" value={ongoing.toLocaleString()} detail={`${completed.length} completed`} icon={<Clock3 className="h-4 w-4" />} tone="violet" />
        <MetricCard title="Revenue overview" value={currency(revenue)} detail="Completed rides and paid transactions" icon={<CircleDollarSign className="h-4 w-4" />} tone="amber" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-white">Revenue by vehicle</h2>
              <p className="mt-1 text-xs text-slate-500">Based on completed bookings currently loaded.</p>
            </div>
            <CircleDollarSign className="h-5 w-5 text-emerald-400" />
          </div>
          {Object.keys(revenueByVehicle).length === 0 ? (
            <EmptyDashboard text="Completed booking revenue will appear here." />
          ) : (
            <div className="mt-6 space-y-4">
              {Object.entries(revenueByVehicle).map(([name, amount]) => (
                <div key={name}>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="font-bold text-slate-300">{name}</span>
                    <span className="font-black text-white">{currency(amount)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400" style={{ width: `${Math.max(3, (amount / maxRevenue) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-800 pt-4">
            <div><p className="text-[10px] font-bold uppercase text-slate-500">Completed ride revenue</p><p className="mt-1 text-lg font-black text-white">{currency(completed.reduce((sum, order) => sum + order.finalFare, 0))}</p></div>
            <div><p className="text-[10px] font-bold uppercase text-slate-500">Completed transactions</p><p className="mt-1 text-lg font-black text-white">{transactions.filter((transaction) => transaction.status === 'COMPLETED').length}</p></div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-white">Driver availability</h2>
              <p className="mt-1 text-xs text-slate-500">Update availability from the live roster.</p>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-black text-emerald-300">{onlineDrivers} online</span>
          </div>
          {drivers.length === 0 ? <EmptyDashboard text="Driver availability appears when driver records are loaded." /> : (
            <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
              {drivers.slice(0, 8).map((driver) => (
                <div key={driver.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{driver.name}</p>
                    <p className="truncate text-[11px] text-slate-500">{driver.vehicle} • {driver.plate}</p>
                  </div>
                  <button
                    onClick={() => onToggleDriver(driver)}
                    className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-black ${driver.isOnline ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}
                  >
                    {driver.isOnline ? 'Available' : 'Offline'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div><h2 className="text-lg font-black text-white">Recent bookings</h2><p className="mt-1 text-xs text-slate-500">Latest booking activity</p></div>
            <button onClick={onOpenBookings} className="text-xs font-black text-blue-300 hover:text-blue-200">Manage bookings →</button>
          </div>
          <div className="space-y-2">
            {orders.slice(0, 5).map((order) => (
              <div key={order.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{order.customerName}</p>
                  <p className="truncate text-[11px] text-slate-500">{order.pickup} → {order.drop}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-black text-white">{currency(order.finalFare)}</p>
                  <p className="mt-1 text-[9px] font-bold uppercase text-blue-300">{order.status.replaceAll('_', ' ')}</p>
                </div>
              </div>
            ))}
            {orders.length === 0 && <EmptyDashboard text="New ride bookings will show up here." />}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-950 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div><h2 className="text-lg font-black text-white">Recent transactions</h2><p className="mt-1 text-xs text-slate-500">Payment status and amounts</p></div>
            <Wallet className="h-5 w-5 text-blue-300" />
          </div>
          <div className="space-y-2">
            {transactions.slice(0, 5).map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{asString(transaction.customer, asString(transaction.bookingId, transaction.id))}</p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">{asString(transaction.method)} • {asString(transaction.createdAt)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-black text-white">{currency(asNumber(transaction.amount))}</p>
                  <p className="mt-1 text-[9px] font-bold uppercase text-emerald-300">{asString(transaction.status, 'UNKNOWN')}</p>
                </div>
              </div>
            ))}
            {transactions.length === 0 && <EmptyDashboard text="Payment transactions will show up here." />}
          </div>
        </section>
      </div>

      <section className="space-y-4 rounded-3xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-white">Operations map</h2>
            <p className="mt-1 text-xs text-slate-500">Fleet, depot, driver density, and demand views.</p>
          </div>
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-800 bg-slate-900 p-1">
            {SPATIAL_VIEWS.map((view) => (
              <button key={view} onClick={() => onSpatialViewChange(view)} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black sm:text-xs ${spatialView === view ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {view}
              </button>
            ))}
          </div>
        </div>
        {spatialView === 'Fleet GIS' ? <FleetTelematicsGIS /> :
          spatialView === 'Depot view' ? <ArchitecturalDepotViewer /> :
            spatialView === 'Driver density' ? <CaptainDensityMap drivers={drivers} onToggleDriverStatus={(driverId) => {
              const driver = drivers.find((item) => item.id === driverId);
              if (driver) onToggleDriver(driver);
            }} onDispatchToZone={() => sounds.playSuccess()} /> :
              <DemandHeatmap onDispatchIncentive={() => sounds.playAlert()} />}
      </section>
    </div>
  );
};

const MetricCard: React.FC<{ title: string; value: string; detail: string; icon: React.ReactNode; tone: 'blue' | 'emerald' | 'violet' | 'amber' }> = ({ title, value, detail, icon, tone }) => {
  const toneClass = {
    blue: 'bg-blue-500/10 text-blue-300',
    emerald: 'bg-emerald-500/10 text-emerald-300',
    violet: 'bg-violet-500/10 text-violet-300',
    amber: 'bg-amber-500/10 text-amber-300',
  }[tone];
  return (
  <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
    <div className="flex items-center justify-between gap-2">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 sm:text-xs">{title}</p>
      <span className={`rounded-lg p-2 ${toneClass}`}>{icon}</span>
    </div>
    <p className="mt-4 break-words text-2xl font-black text-white sm:text-3xl">{value}</p>
    <p className="mt-1 text-[10px] text-slate-500 sm:text-xs">{detail}</p>
  </div>
  );
};

const EmptyDashboard: React.FC<{ text: string }> = ({ text }) => (
  <div className="py-8 text-center text-xs text-slate-500">{text}</div>
);
