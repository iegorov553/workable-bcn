export type Place = {
  id: string;
  name: string;
  chain: string;
  address: string;
  latitude: number;
  longitude: number;
  googlePlaceId?: string;
  googleMapsUrl?: string;
  verification?: {
    status: 'listed' | 'unverified';
    checkedAt: string;
    sourceUrl: string;
    note?: string;
  };
};

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type ViewMode = 'map' | 'list';

export type MapOrientation = 'north' | 'grid';
