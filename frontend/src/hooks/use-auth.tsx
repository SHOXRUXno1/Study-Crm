import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { apiClient, clearToken, getToken, setToken } from "@/lib/api";
import type { AdminUser, TokenResponse, UserRole } from "@/types/auth";

interface AdminProfile {
  login: string;
  first_name: string | null;
  last_name: string | null;
  middle_name: string | null;
  phone: string | null;
  avatar_base64: string | null;
}

interface TeacherProfile {
  id: number;
  login: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  phone: string | null;
  is_active: boolean;
  avatar_base64: string | null;
}

interface StudentProfile {
  id: number;
  full_name: string;
  phone: string | null;
  parent_phone: string | null;
  gender: string | null;
  birth_date: string | null;
  source: string | null;
  group_id: number | null;
  group_code: string | null;
  course_name: string | null;
  payment_status: string;
  is_active: boolean;
  created_at: string;
}

type AnyProfile = AdminProfile | TeacherProfile | StudentProfile;

function isTeacherProfile(p: AnyProfile | null): p is TeacherProfile {
  return !!p && "first_name" in p && "id" in p && typeof (p as TeacherProfile).id === "number";
}

function isStudentProfile(p: AnyProfile | null): p is StudentProfile {
  return !!p && "full_name" in p;
}

export interface AuthUser {
  login: string;
  name: string;
  initials: string;
  role: UserRole;
  teacherId: number | null;
  studentId: number | null;
  managerId: number | null;
  avatar_base64: string | null;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  login: (loginValue: string, password: string, rememberMe?: boolean) => Promise<boolean>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function buildAuthUser(me: AdminUser, profile?: AnyProfile | null): AuthUser {
  const role = (me.role ?? "admin") as UserRole;

  if (role === "teacher") {
    const tp = isTeacherProfile(profile ?? null) ? (profile as TeacherProfile) : null;
    const firstName = tp?.first_name ?? "";
    const lastName  = tp?.last_name  ?? "";
    const fullName  = me.name || [lastName, firstName].filter(Boolean).join(" ") || me.login;
    const initials  = [firstName[0], lastName[0]].filter(Boolean).join("").toUpperCase()
      || me.login.slice(0, 2).toUpperCase();

    return {
      login: me.login,
      name: fullName,
      initials,
      role: "teacher",
      teacherId: me.id ?? tp?.id ?? null,
      studentId: null,
      managerId: null,
      avatar_base64: tp?.avatar_base64 ?? null,
    };
  }

  if (role === "student") {
    const sp = isStudentProfile(profile ?? null) ? (profile as StudentProfile) : null;
    const fullName = sp?.full_name || me.name || me.login;
    const parts = fullName.split(/\s+/).filter(Boolean);
    const initials = parts.length >= 2
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : (parts[0]?.slice(0, 2).toUpperCase() || me.login.slice(0, 2).toUpperCase());

    return {
      login: me.login,
      name: fullName,
      initials,
      role: "student",
      teacherId: null,
      studentId: me.id ?? sp?.id ?? null,
      managerId: null,
      avatar_base64: null,
    };
  }

  if (role === "manager") {
    const mp = isTeacherProfile(profile ?? null) ? (profile as TeacherProfile) : null;
    const firstName = mp?.first_name ?? "";
    const lastName  = mp?.last_name  ?? "";
    const fullName  = me.name || [lastName, firstName].filter(Boolean).join(" ") || me.login;
    const initials  = [firstName[0], lastName[0]].filter(Boolean).join("").toUpperCase()
      || me.login.slice(0, 2).toUpperCase();

    return {
      login: me.login,
      name: fullName,
      initials,
      role: "manager",
      teacherId: null,
      studentId: null,
      managerId: me.id ?? mp?.id ?? null,
      avatar_base64: mp?.avatar_base64 ?? null,
    };
  }

  // admin
  const ap = profile && !isTeacherProfile(profile) && !isStudentProfile(profile)
    ? (profile as AdminProfile)
    : null;
  const firstName = ap?.first_name ?? "";
  const lastName  = ap?.last_name  ?? "";
  const fullName  = [firstName, lastName].filter(Boolean).join(" ") || me.login;
  const initials  = [firstName[0], lastName[0]].filter(Boolean).join("").toUpperCase()
    || me.login.slice(0, 2).toUpperCase();

  return {
    login: me.login,
    name: fullName,
    initials,
    role: "admin",
    teacherId: null,
    studentId: null,
    managerId: null,
    avatar_base64: ap?.avatar_base64 ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Latest user, used inside refreshProfile so the callback identity stays
  // stable (otherwise consumers like useEffect deps would re-run on every
  // user change).
  const userRef = useRef<AuthUser | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const isAuthenticated = !!user;

  const loadUser = useCallback(async () => {
    const [me, profileData] = await Promise.all([
      apiClient.get<AdminUser>("/auth/me"),
      apiClient.get<AnyProfile>("/auth/profile").catch(() => null),
    ]);
    setUser(buildAuthUser(me, profileData));
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) { setIsLoading(false); return; }
    loadUser()
      .catch(() => { clearToken(); setUser(null); })
      .finally(() => setIsLoading(false));
  }, [loadUser]);

  useEffect(() => {
    const handler = () => setUser(null);
    window.addEventListener("auth:expired", handler);
    return () => window.removeEventListener("auth:expired", handler);
  }, []);

  const login = async (loginValue: string, password: string, rememberMe = false): Promise<boolean> => {
    const data = await apiClient.post<TokenResponse>("/auth/login", {
      login: loginValue,
      password,
      remember_me: rememberMe,
    });
    setToken(data.access_token);
    const profile = await apiClient.get<AnyProfile>("/auth/profile").catch(() => null);
    setUser(buildAuthUser(data.user, profile));
    return true;
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  const refreshProfile = useCallback(async () => {
    if (!userRef.current) return;
    const [me, profileData] = await Promise.all([
      apiClient.get<AdminUser>("/auth/me"),
      apiClient.get<AnyProfile>("/auth/profile").catch(() => null),
    ]);
    setUser(buildAuthUser(me, profileData));
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
