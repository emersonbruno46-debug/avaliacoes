export type PlateStatus = 'available' | 'active';

export interface Plate {
  id: string;
  code: string;
  company_name: string | null;
  business_name?: string | null;
  formatted_address?: string | null;
  google_place_id?: string | null;
  destination_url: string | null;
  status: PlateStatus;
  created_at: string;
  updated_at: string;
  linked_at?: string | null;
  link_verified_at?: string | null;
}

export type CreatePlateInput = {
  code: string;
  company_name?: string | null;
  business_name?: string | null;
  formatted_address?: string | null;
  google_place_id?: string | null;
  destination_url?: string | null;
  status?: PlateStatus;
};

