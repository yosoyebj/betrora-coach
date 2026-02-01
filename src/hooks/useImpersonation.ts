'use client';

import { useEffect, useState } from 'react';

export interface ImpersonationContext {
  impersonation_id: string | null;
  expires_at: string | null;
  return_url: string | null;
  target_type: 'user' | 'coach' | null;
}

const STORAGE_KEY_PREFIX = 'betrora_impersonation';

export function useImpersonation() {
  const [impersonation, setImpersonation] = useState<ImpersonationContext>({
    impersonation_id: null,
    expires_at: null,
    return_url: null,
    target_type: null,
  });
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    // Check URL params (impersonation params are now in query string, not hash)
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    const searchParams = url.searchParams;

    // Impersonation params are in query string (middleware needs them there)
    const urlImpersonationId = searchParams.get('impersonation_id');
    const urlExpiresAt = searchParams.get('expires_at');
    const urlReturnUrl = searchParams.get('return_url');
    const urlTargetType = searchParams.get('target_type') as 'user' | 'coach' | null;

    if (urlImpersonationId) {
      // Store in sessionStorage
      const context: ImpersonationContext = {
        impersonation_id: urlImpersonationId,
        expires_at: urlExpiresAt,
        return_url: urlReturnUrl || null,
        target_type: urlTargetType,
      };

      sessionStorage.setItem(`${STORAGE_KEY_PREFIX}_id`, urlImpersonationId);
      if (urlExpiresAt) sessionStorage.setItem(`${STORAGE_KEY_PREFIX}_expires_at`, urlExpiresAt);
      if (urlReturnUrl) sessionStorage.setItem(`${STORAGE_KEY_PREFIX}_return_url`, urlReturnUrl);
      if (urlTargetType) sessionStorage.setItem(`${STORAGE_KEY_PREFIX}_target_type`, urlTargetType);

      // Clean up impersonation params from query string
      // Keep hash intact (may contain auth tokens that getSessionFromUrl processes)
      searchParams.delete('impersonation_id');
      searchParams.delete('expires_at');
      searchParams.delete('return_url');
      searchParams.delete('target_type');

      // Update URL without impersonation params in query string
      url.search = searchParams.toString();
      window.history.replaceState({}, '', url.toString());

      setImpersonation(context);
      setIsActive(true);
    } else {
      // Load from sessionStorage
      if (typeof window !== 'undefined') {
        const storedId = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}_id`);
        const storedExpiresAt = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}_expires_at`);
        const storedReturnUrl = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}_return_url`);
        const storedTargetType = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}_target_type`) as 'user' | 'coach' | null;

        if (storedId) {
          const context: ImpersonationContext = {
            impersonation_id: storedId,
            expires_at: storedExpiresAt,
            return_url: storedReturnUrl,
            target_type: storedTargetType,
          };
          setImpersonation(context);
          setIsActive(true);
        }
      }
    }
  }, []);

  useEffect(() => {
    // Check expiration periodically
    if (!impersonation.expires_at || !isActive) return;

    const checkExpiration = () => {
      const expiresAt = parseInt(impersonation.expires_at!);
      if (isNaN(expiresAt)) return;

      const now = Date.now();
      if (now >= expiresAt) {
        // Expired - clear impersonation
        clearImpersonation();
        // Sign out and redirect
        if (typeof window !== 'undefined') {
          window.location.href = '/login?impersonation_expired=1';
        }
      }
    };

    checkExpiration();
    const interval = setInterval(checkExpiration, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [impersonation.expires_at, isActive]);

  const clearImpersonation = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}_id`);
      sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}_expires_at`);
      sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}_return_url`);
      sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}_target_type`);
    }
    setImpersonation({
      impersonation_id: null,
      expires_at: null,
      return_url: null,
      target_type: null,
    });
    setIsActive(false);
  };

  return {
    impersonation,
    isActive,
    clearImpersonation,
  };
}
