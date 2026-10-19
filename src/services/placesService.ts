import { GOOGLE_MAPS_API_KEY } from './routingEngineService';

export interface PlacePrediction {
  placeId: string;
  description: string;
  primaryText: string;
  secondaryText: string;
}

export interface SelectedPlace {
  placeId: string;
  formattedAddress: string;
  lat: number;
  lng: number;
}

interface GooglePlacePrediction {
  placeId: string;
  text: string;
  structuredFormat?: {
    mainText?: { text: string };
    secondaryText?: { text: string };
  };
  toPlace(): GooglePlace;
}

interface GooglePlace {
  id?: string;
  formattedAddress?: string;
  location?: { lat(): number; lng(): number };
  fetchFields(options: { fields: string[] }): Promise<void>;
}

interface PlacesLibrary {
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(request: {
      input: string;
      includedRegionCodes: string[];
    }): Promise<{
      suggestions: Array<{ placePrediction?: GooglePlacePrediction }>;
    }>;
  };
  Place: new (options: { id: string }) => GooglePlace;
}

interface GoogleMapsNamespace {
  maps?: {
    importLibrary(name: string): Promise<unknown>;
  };
}

declare global {
  interface Window {
    google?: GoogleMapsNamespace;
  }
}

let placesLibraryPromise: Promise<PlacesLibrary> | null = null;

async function loadPlacesLibrary(): Promise<PlacesLibrary> {
  if (!placesLibraryPromise) {
    placesLibraryPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>('#google-maps-places-sdk');
      if (existingScript) {
        if (window.google?.maps?.importLibrary) {
          resolve();
          return;
        }
        if (existingScript.dataset.loaded === 'true') {
          reject(new Error('Google Maps Places is unavailable. Check the Maps JavaScript API key and enabled APIs.'));
          return;
        }
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => reject(new Error('Google Maps Places could not be loaded.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-maps-places-sdk';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&v=weekly&loading=async`;
      script.async = true;
      script.onload = () => {
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = () => reject(new Error('Google Maps Places could not be loaded.'));
      document.head.appendChild(script);
    }).then(async () => {
      if (!window.google?.maps?.importLibrary) {
        throw new Error('Google Maps Places is unavailable. Check the Maps JavaScript API key and enabled APIs.');
      }
      return await window.google.maps.importLibrary('places') as PlacesLibrary;
    }).catch(error => {
      placesLibraryPromise = null;
      if (!window.google?.maps?.importLibrary) {
        document.querySelector('#google-maps-places-sdk')?.remove();
      }
      throw error;
    });
  }
  return placesLibraryPromise;
}

export async function fetchPlacePredictions(input: string): Promise<PlacePrediction[]> {
  const places = await loadPlacesLibrary();
  const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input,
    includedRegionCodes: ['IN']
  });

  return suggestions.flatMap(({ placePrediction }) => {
    if (!placePrediction?.placeId) return [];
    return [{
      placeId: placePrediction.placeId,
      description: placePrediction.text,
      primaryText: placePrediction.structuredFormat?.mainText?.text || placePrediction.text,
      secondaryText: placePrediction.structuredFormat?.secondaryText?.text || ''
    }];
  });
}

export async function fetchPlaceDetails(placeId: string): Promise<SelectedPlace> {
  const places = await loadPlacesLibrary();
  const place = new places.Place({ id: placeId });
  await place.fetchFields({ fields: ['id', 'formattedAddress', 'location'] });

  const lat = place.location?.lat();
  const lng = place.location?.lng();
  if (
    !place.id ||
    !place.formattedAddress ||
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    throw new Error('Google Place details returned incomplete address information.');
  }

  return {
    placeId: place.id,
    formattedAddress: place.formattedAddress,
    lat,
    lng
  };
}
