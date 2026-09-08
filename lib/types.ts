export type PlateStatus = 'available' | 'active';

export interface Plate {
  id: string;
  code: string;
  company_name: string | null;
  destination_url: string | null;
  status: PlateStatus;
  created_at: string;
  updated_at: string;
}

export type CreatePlateInput = {
  code: string;
  company_name?: string | null;
  destination_url?: string | null;
  status?: PlateStatus;
};
