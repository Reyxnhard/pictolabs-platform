export class SessionQueryDto {
  search?: string;
  boothId?: string;
  branchId?: string;
  status?: string;
  date?: string; // Format: YYYY-MM-DD
  page?: number | string;
  limit?: number | string;
}
