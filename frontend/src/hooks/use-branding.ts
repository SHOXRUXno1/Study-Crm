import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

export interface BrandingData {
  brand_name: string | null;
  brand_logo_base64: string | null;
}

export interface Branding {
  brandName: string;
  /** null = no custom logo set — render Building2 icon fallback */
  brandLogo: string | null;
}

export interface BrandingUpdate {
  brand_name: string | null;
  brand_logo_base64: string | null;
  logo_set: boolean;
}

const QK = ["branding"] as const;

function resolve(data: BrandingData | undefined): Branding {
  return {
    brandName: data?.brand_name || "School CRM",
    brandLogo: data?.brand_logo_base64 ?? null,
  };
}

export function useBranding(): Branding {
  const { data } = useQuery<BrandingData>({
    queryKey: QK,
    queryFn: () => apiClient.get<BrandingData>("/branding"),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
  return resolve(data);
}

/** Returns the raw DB values (null when not set). Use in the settings form. */
export function useBrandingRaw(): BrandingData | undefined {
  const { data } = useQuery<BrandingData>({
    queryKey: QK,
    queryFn: () => apiClient.get<BrandingData>("/branding"),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
  return data;
}

export function useUpdateBranding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BrandingUpdate) =>
      apiClient.patch<BrandingData>("/branding", payload),
    onSuccess: (updated) => {
      qc.setQueryData(QK, updated);
    },
  });
}
