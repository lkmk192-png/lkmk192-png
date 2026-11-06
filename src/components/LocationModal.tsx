import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Navigation,
  Search,
  X,
  Home,
  Briefcase,
  MapPinned,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { UserAddress } from '../types/commerce.ts';
import { calculateLocationServiceability } from '../utils/commerceRules.ts';

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAddress: UserAddress;
  savedAddresses: UserAddress[];
  onSaveAddress: (address: UserAddress) => Promise<void>;
}

interface PresetLocality {
  title: string;
  towerBuilding: string;
  area: string;
  city: string;
  pincode: string;
  lat: number;
  lng: number;
}

const PRESET_LOCALITIES: PresetLocality[] = [
  {
    title: 'Nirvana Country, Sector 50, Gurugram',
    towerBuilding: 'TOWER-C, Nirvana Country',
    area: 'Sector 50, Golf Course Ext Road',
    city: 'Gurugram',
    pincode: '122018',
    lat: 28.4126,
    lng: 77.066,
  },
  {
    title: 'DLF Phase 4, Galleria Market, Gurugram',
    towerBuilding: 'Ridgewood Estate, Tower B',
    area: 'DLF Phase 4',
    city: 'Gurugram',
    pincode: '122009',
    lat: 28.4671,
    lng: 77.0818,
  },
  {
    title: 'Green Park Main, South Delhi',
    towerBuilding: 'Block G, Green Park Main',
    area: 'Hauz Khas Enclave',
    city: 'New Delhi',
    pincode: '110016',
    lat: 28.5589,
    lng: 77.2068,
  },
  {
    title: 'Indiranagar 100 Feet Road, Bengaluru',
    towerBuilding: 'Palm Grove Apartments',
    area: 'HAL 2nd Stage, Indiranagar',
    city: 'Bengaluru',
    pincode: '560038',
    lat: 12.9784,
    lng: 77.6408,
  },
  {
    title: 'Bandra West, Pali Hill, Mumbai',
    towerBuilding: 'Sea Breeze Residency',
    area: 'Pali Hill, Bandra West',
    city: 'Mumbai',
    pincode: '400050',
    lat: 19.0596,
    lng: 72.8295,
  },
  {
    title: 'Jubilee Hills Road No. 36, Hyderabad',
    towerBuilding: 'Lotus Pond Enclave',
    area: 'Jubilee Hills',
    city: 'Hyderabad',
    pincode: '500033',
    lat: 17.4326,
    lng: 78.4071,
  },
  {
    title: 'Udaipur Fateh Sagar (Unserviceable Demo)',
    towerBuilding: 'Lake View Haveli',
    area: 'Fateh Sagar Road',
    city: 'Udaipur',
    pincode: '313001',
    lat: 24.5854,
    lng: 73.7125,
  },
];

export const LocationModal: React.FC<LocationModalProps> = ({
  isOpen,
  onClose,
  currentAddress,
  savedAddresses,
  onSaveAddress,
}) => {
  const [searchText, setSearchText] = useState('');
  const [lat, setLat] = useState(currentAddress.lat || 28.4126);
  const [lng, setLng] = useState(currentAddress.lng || 77.066);
  const [flatHouse, setFlatHouse] = useState(currentAddress.flatHouse || 'Flat 402');
  const [towerBuilding, setTowerBuilding] = useState(
    currentAddress.towerBuilding || 'TOWER-C, Nirvana Country'
  );
  const [area, setArea] = useState(currentAddress.area || 'Sector 50');
  const [city, setCity] = useState(currentAddress.city || 'Gurugram');
  const [pincode, setPincode] = useState(currentAddress.pincode || '122018');
  const [landmark, setLandmark] = useState(currentAddress.landmark || 'Near Central Park Gate 2');
  const [label, setLabel] = useState<'Home' | 'Work' | 'Other'>(
    currentAddress.label || 'Home'
  );
  const [gpsStatus, setGpsStatus] = useState<string>('');
  const [reverseLoading, setReverseLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastNominatimCallRef = useRef<number>(0);

  // Sync initial state when modal opens
  useEffect(() => {
    if (isOpen) {
      setLat(currentAddress.lat);
      setLng(currentAddress.lng);
      setFlatHouse(currentAddress.flatHouse || 'Flat 402');
      setTowerBuilding(currentAddress.towerBuilding);
      setArea(currentAddress.area);
      setCity(currentAddress.city);
      setPincode(currentAddress.pincode);
      setLandmark(currentAddress.landmark || '');
      setLabel(currentAddress.label || 'Home');
      setFormError('');
    }
  }, [isOpen, currentAddress]);

  // Reverse geocode with OpenStreetMap Nominatim (debounced, max 1 req/sec) + local fallback
  const reverseGeocodeCoordinates = async (nextLat: number, nextLng: number) => {
    setReverseLoading(true);
    try {
      const now = Date.now();
      const elapsed = now - lastNominatimCallRef.current;
      if (elapsed < 1050) {
        await new Promise((r) => setTimeout(r, 1050 - elapsed));
      }
      lastNominatimCallRef.current = Date.now();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 900);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${nextLat}&lon=${nextLng}`,
        {
          headers: {
            Accept: 'application/json',
          },
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const addr = data.address || {};
        const detectedBuilding =
          addr.building ||
          addr.residential ||
          addr.neighbourhood ||
          addr.road ||
          'TOWER-C, Nirvana Country';
        const detectedArea =
          addr.suburb || addr.quarter || addr.city_district || 'Sector 50';
        const detectedCity =
          addr.city || addr.town || addr.state_district || 'Gurugram';
        const detectedPincode = addr.postcode || pincode || '122018';

        setTowerBuilding(detectedBuilding);
        setArea(detectedArea);
        setCity(detectedCity);
        setPincode(detectedPincode);
        setReverseLoading(false);
        return;
      }
    } catch {
      // Fallback to nearest preset locality when sandbox blocks external Nominatim
    }

    // Nearest preset fallback
    let closest = PRESET_LOCALITIES[0];
    let minD = Infinity;
    for (const loc of PRESET_LOCALITIES) {
      const d = Math.hypot(loc.lat - nextLat, loc.lng - nextLng);
      if (d < minD) {
        minD = d;
        closest = loc;
      }
    }
    setTowerBuilding(closest.towerBuilding);
    setArea(closest.area);
    setCity(closest.city);
    setPincode(closest.pincode);
    setReverseLoading(false);
  };

  // Initialize Leaflet Map + Draggable Pin
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: [lat, lng],
      zoom: 15,
      zoomControl: true,
      fadeAnimation: false,
      zoomAnimation: false,
      markerZoomAnimation: false,
    });

    const StreetGridLayer = L.GridLayer.extend({
      createTile: function () {
        const tile = document.createElement('div');
        tile.style.width = '256px';
        tile.style.height = '256px';
        tile.style.backgroundColor = '#eef4ef';
        tile.style.backgroundImage =
          'linear-gradient(to right, #ffffff 6px, transparent 6px), linear-gradient(to bottom, #ffffff 6px, transparent 6px), linear-gradient(to right, #dcece0 1px, transparent 1px), linear-gradient(to bottom, #dcece0 1px, transparent 1px)';
        tile.style.backgroundSize = '128px 128px, 128px 128px, 32px 32px, 32px 32px';
        return tile;
      },
    });

    new (StreetGridLayer as any)({
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const customPinIcon = L.divIcon({
      className: 'bharat-organic-map-pin',
      html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
        <div style="background:#065f46;color:#ffffff;font-size:10px;font-weight:700;padding:4px 8px;border-radius:8px;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.22);margin-bottom:4px;">
          Order will be delivered here – Place the pin to your exact location
        </div>
        <div style="width:28px;height:28px;border-radius:9999px;background:#059669;border:3px solid #ffffff;box-shadow:0 4px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
          <div style="width:8px;height:8px;border-radius:9999px;background:#fde68a;"></div>
        </div>
      </div>`,
      iconSize: [0, 0],
    });

    const marker = L.marker([lat, lng], {
      draggable: true,
      icon: customPinIcon,
    }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      const nextLat = Math.round(pos.lat * 10000) / 10000;
      const nextLng = Math.round(pos.lng * 10000) / 10000;
      setLat(nextLat);
      setLng(nextLng);
      reverseGeocodeCoordinates(nextLat, nextLng);
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      const nextLat = Math.round(e.latlng.lat * 10000) / 10000;
      const nextLng = Math.round(e.latlng.lng * 10000) / 10000;
      marker.setLatLng([nextLat, nextLng]);
      setLat(nextLat);
      setLng(nextLng);
      reverseGeocodeCoordinates(nextLat, nextLng);
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const serviceStatus = calculateLocationServiceability(lat, lng, pincode);

  const handleSelectLocality = (loc: PresetLocality) => {
    setLat(loc.lat);
    setLng(loc.lng);
    setTowerBuilding(loc.towerBuilding);
    setArea(loc.area);
    setCity(loc.city);
    setPincode(loc.pincode);
    setSearchText('');
    if (mapInstanceRef.current && markerRef.current) {
      mapInstanceRef.current.setView([loc.lat, loc.lng], 15);
      markerRef.current.setLatLng([loc.lat, loc.lng]);
    }
  };

  const handleRequestCurrentLocation = () => {
    setGpsStatus('Detecting your live GPS coordinates...');
    if (!navigator.geolocation) {
      setGpsStatus('Geolocation unavailable in browser — using Gurugram Sector 50 hub.');
      handleSelectLocality(PRESET_LOCALITIES[0]);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLat = Math.round(position.coords.latitude * 10000) / 10000;
        const nextLng = Math.round(position.coords.longitude * 10000) / 10000;
        setLat(nextLat);
        setLng(nextLng);
        setGpsStatus('Live GPS coordinates locked!');
        if (mapInstanceRef.current && markerRef.current) {
          mapInstanceRef.current.setView([nextLat, nextLng], 16);
          markerRef.current.setLatLng([nextLat, nextLng]);
        }
        reverseGeocodeCoordinates(nextLat, nextLng);
      },
      () => {
        setGpsStatus(
          'GPS permission denied or unavailable. Please use search or move the pin below.'
        );
      },
      { timeout: 6000 }
    );
  };

  const filteredPresets = searchText.trim()
    ? PRESET_LOCALITIES.filter(
        (l) =>
          l.title.toLowerCase().includes(searchText.toLowerCase()) ||
          l.pincode.includes(searchText.trim()) ||
          l.city.toLowerCase().includes(searchText.toLowerCase())
      )
    : PRESET_LOCALITIES;

  const handleConfirmAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flatHouse.trim() || !area.trim() || !city.trim() || !/^\d{6}$/.test(pincode.trim())) {
      setFormError(
        'Please enter your Flat/House No., Area, City, and a valid 6-digit Pincode.'
      );
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      await onSaveAddress({
        label,
        flatHouse: flatHouse.trim(),
        towerBuilding: towerBuilding.trim() || area.trim(),
        area: area.trim(),
        city: city.trim(),
        pincode: pincode.trim(),
        landmark: landmark.trim(),
        lat,
        lng,
        distanceKm: serviceStatus.distanceKm,
        etaMinutes: serviceStatus.etaMinutes,
        isServiceable: serviceStatus.isServiceable,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Location Information"
      className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-extrabold text-slate-900">
              Location Information
            </h2>
            <p className="text-xs text-slate-500">
              Allow location to see products delivered near you
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Location Modal"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Search a new address input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search a new address, sector, society or 6-digit pincode..."
              aria-label="Search a new address"
              className="w-full h-11 pl-10 pr-4 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none"
            />
          </div>

          {/* Quick Locality Suggestions */}
          <div className="flex flex-wrap gap-1.5">
            {filteredPresets.map((loc) => (
              <button
                key={loc.title}
                type="button"
                onClick={() => handleSelectLocality(loc)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  pincode === loc.pincode && city === loc.city
                    ? 'bg-emerald-50 border-emerald-600 text-emerald-900 font-semibold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {loc.title} ({loc.pincode})
              </button>
            ))}
          </div>

          {/* Interactive Leaflet + OpenStreetMap Map with Draggable Pin */}
          <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100">
            <div ref={mapContainerRef} className="w-full h-56 sm:h-64 z-10" />

            {/* Two Floating Map Action Buttons: Search Location & Current Location */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => searchInputRef.current?.focus()}
                  className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold text-slate-800 flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5 text-slate-600" />
                  Search Location
                </button>
                <button
                  type="button"
                  onClick={handleRequestCurrentLocation}
                  className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-xs font-bold text-white flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Current Location
                </button>
              </div>
              <span className="text-[11px] text-slate-500 font-mono-tabular">
                Pin: {lat.toFixed(4)}, {lng.toFixed(4)}
                {reverseLoading ? ' · Detecting address...' : ''}
              </span>
            </div>
          </div>

          {gpsStatus && (
            <p className="text-xs font-medium text-emerald-800 bg-emerald-50 px-3 py-2 rounded-xl">
              {gpsStatus}
            </p>
          )}

          {/* Serviceability & Live ETA Status Strip */}
          {serviceStatus.isServiceable ? (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                <div>
                  <p className="text-xs sm:text-sm font-extrabold text-emerald-950">
                    Delivering in {serviceStatus.etaMinutes} minutes from{' '}
                    {serviceStatus.nearestHub}
                  </p>
                  <p className="text-[11px] text-emerald-800">
                    Distance: {serviceStatus.distanceKm} km · Free delivery on orders above ₹199
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-700 text-white text-xs font-extrabold whitespace-nowrap tabular-nums">
                ⏱ {serviceStatus.etaMinutes} MINS
              </span>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
              <div>
                <p className="text-xs sm:text-sm font-extrabold text-amber-950">
                  We don't deliver here yet ({city} - {pincode})
                </p>
                <p className="text-[11px] text-amber-900">
                  You can browse our entire catalogue in browse-only mode, or select a serviceable NCR / Bengaluru / Mumbai / Hyderabad / Pune location above.
                </p>
              </div>
            </div>
          )}

          {/* Saved Addresses Quick Switch */}
          {savedAddresses.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">
                YOUR SAVED ADDRESSES
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {savedAddresses.slice(0, 4).map((addr, idx) => (
                  <button
                    key={addr.id || idx}
                    type="button"
                    onClick={() => {
                      onSaveAddress(addr);
                      onClose();
                    }}
                    className="p-2.5 rounded-xl border border-slate-200 hover:border-emerald-600 text-left flex items-start gap-2 transition-colors"
                  >
                    <MapPin className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-900 block">
                        {addr.label} · {addr.etaMinutes} mins
                      </span>
                      <span className="text-[11px] text-slate-500 truncate block">
                        {addr.flatHouse}, {addr.towerBuilding}, {addr.city} ({addr.pincode})
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Address Details Form */}
          <form onSubmit={handleConfirmAddress} className="space-y-3 pt-2 border-t border-slate-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Flat / House No. / Floor *
                </label>
                <input
                  type="text"
                  value={flatHouse}
                  onChange={(e) => setFlatHouse(e.target.value)}
                  placeholder="e.g. Flat 402, 4th Floor"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tower / Society / Building *
                </label>
                <input
                  type="text"
                  value={towerBuilding}
                  onChange={(e) => setTowerBuilding(e.target.value)}
                  placeholder="e.g. TOWER-C, Nirvana Country"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Area / Sector *
                </label>
                <input
                  type="text"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  City *
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Pincode (6 digits) *
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 font-mono-tabular focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nearby Landmark (Optional)
                </label>
                <input
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="e.g. Opposite Gate No. 2"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Save Address As Home / Work / Other */}
              <div>
                <span className="block text-xs font-bold text-slate-700 mb-1">
                  Save Address As
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'Home', icon: Home },
                      { id: 'Work', icon: Briefcase },
                      { id: 'Other', icon: MapPinned },
                    ] as const
                  ).map(({ id, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setLabel(id)}
                      className={`h-10 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                        label === id
                          ? 'border-emerald-700 bg-emerald-700 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {id}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {formError && (
              <p className="text-xs font-semibold text-red-600">{formError}</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full h-12 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-sm shadow-sm transition-colors cursor-pointer"
            >
              {saving
                ? 'Saving Location...'
                : serviceStatus.isServiceable
                ? `Confirm Location & Deliver in ${serviceStatus.etaMinutes} Mins`
                : 'Save Location (Browse-Only Mode)'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
