export type Place = {
  id: string;
  name: string;
  chain: string;
  address: string;
  latitude: number;
  longitude: number;
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

export type ViewMode = 'map' | 'list' | 'saved';
