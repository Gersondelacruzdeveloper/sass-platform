import { useEffect, useMemo, useState } from "react";
import {
  getApiBaseUrl,
  getCurrentHostname,
  isCustomTicketingDomain,
} from "../utils/publicDomain";

export interface PublicTicketingDomainResolution {
  organisation_id: number;
  organisation_slug: string;
  organisation_name: string;
  business_type?: string;
  public_domain: string;
  public_base_url: string;
  is_published: boolean;
  domain_status?: string;
}

interface UsePublicTicketingOrganisationResult {
  organisationSlug: string;
  resolvedDomain: PublicTicketingDomainResolution | null;
  loading: boolean;
  error: string;
  isCustomDomain: boolean;
}

export function usePublicTicketingOrganisation(
  organisationSlugFromUrl?: string
): UsePublicTicketingOrganisationResult {
  const hostname = useMemo(() => getCurrentHostname(), []);
  const isCustomDomain = useMemo(() => isCustomTicketingDomain(hostname), [hostname]);

  const [resolvedDomain, setResolvedDomain] =
    useState<PublicTicketingDomainResolution | null>(null);
  const [loading, setLoading] = useState<boolean>(!organisationSlugFromUrl && isCustomDomain);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function resolveDomain() {
      if (organisationSlugFromUrl) {
        setLoading(false);
        setError("");
        return;
      }

      if (!isCustomDomain || !hostname) {
        setLoading(false);
        setError("Organisation slug is missing.");
        return;
      }

      try {
        setLoading(true);
        setError("");

        const apiBaseUrl = getApiBaseUrl();
        const url = `${apiBaseUrl}/ticketing/public/resolve-domain/?domain=${encodeURIComponent(
          hostname
        )}`;

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.detail || "Unable to resolve this domain.");
        }

        if (!cancelled) {
          setResolvedDomain(data);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to resolve this domain.");
          setResolvedDomain(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    resolveDomain();

    return () => {
      cancelled = true;
    };
  }, [hostname, isCustomDomain, organisationSlugFromUrl]);

  return {
    organisationSlug: organisationSlugFromUrl || resolvedDomain?.organisation_slug || "",
    resolvedDomain,
    loading,
    error,
    isCustomDomain,
  };
}