export type UserRole = "admin" | "teacher" | "student" | "manager";

export interface AdminUser {
  login: string;
  role: UserRole;
  id?: number | null;
  name?: string | null;
}

export interface LoginRequest {
  login: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: AdminUser;
}
