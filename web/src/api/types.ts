export type ManagedPark = {
  id: string;
  catalogId: string;
  name: string;
  status: 'pending' | 'approved' | 'rejected';
  routeSetupDone: boolean;
  rejectReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
};
export type Profile = { name: string; email: string; role: 'manager' | 'super_admin' };
export type LoginRequest = { loginId: string; password: string };
export type LoginResponse = { accessToken: string; expiresIn: number; role: Profile['role'] };
