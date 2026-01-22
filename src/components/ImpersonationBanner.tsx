'use client';

import { useImpersonation } from '@/hooks/useImpersonation';
import { createSupabaseBrowserClient } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';

// Add padding to body when banner is active
function updateBodyPadding(isActive: boolean) {
  if (typeof document === 'undefined') return;
  
  const styleId = 'impersonation-banner-padding';
  let style = document.getElementById(styleId);
  
  if (isActive && !style) {
    style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      body {
        padding-top: 48px !important;
      }
    `;
    document.head.appendChild(style);
  } else if (!isActive && style) {
    style.remove();
  }
}

export function ImpersonationBanner() {
  const { impersonation, isActive, clearImpersonation } = useImpersonation();
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    updateBodyPadding(isActive && !!impersonation.impersonation_id);
    return () => {
      updateBodyPadding(false);
    };
  }, [isActive, impersonation.impersonation_id]);

  if (!isActive || !impersonation.impersonation_id) {
    return null;
  }

  const handleExit = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);

    try {
      const supabase = createSupabaseBrowserClient();
      // Sign out from Supabase
      await supabase.auth.signOut();
      
      // Clear impersonation context
      clearImpersonation();

      // Redirect to return_url or default to login
      const returnUrl = impersonation.return_url || '/login';
      
      if (returnUrl.startsWith('http')) {
        window.location.href = returnUrl;
      } else {
        window.location.href = returnUrl;
      }
    } catch (error) {
      console.error('Error signing out:', error);
      // Still redirect even if sign out fails
      const returnUrl = impersonation.return_url || '/login';
      clearImpersonation();
      window.location.href = returnUrl;
    } finally {
      setIsSigningOut(false);
    }
  };

  const getDisplayText = () => {
    const type = impersonation.target_type === 'coach' ? 'coach' : 'user';
    return `Impersonating as ${type}`;
  };

  return (
    <div className="impersonation-banner" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      backgroundColor: '#ff9800',
      color: '#fff',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontWeight: 600 }}>⚠️ {getDisplayText()}</span>
      </div>
      <button
        onClick={handleExit}
        disabled={isSigningOut}
        style={{
          backgroundColor: '#fff',
          color: '#ff9800',
          border: 'none',
          padding: '8px 16px',
          borderRadius: '4px',
          fontWeight: 600,
          cursor: isSigningOut ? 'not-allowed' : 'pointer',
          opacity: isSigningOut ? 0.6 : 1,
        }}
      >
        {isSigningOut ? 'Exiting...' : 'Exit'}
      </button>
    </div>
  );
}
