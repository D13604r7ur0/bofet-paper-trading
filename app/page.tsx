"use client";

import { useTrading } from "@/providers/TradingProvider";
import Navbar from "@/components/Navbar";
import NavbarPreview from "@/components/Navbar/NavbarPreview";
import MarketTabs from "@/components/Trading/MarketTabs";
import GeoBlockedBanner from "@/components/GeoBlockedBanner";
import PreviewMarketCards from "@/components/Trading/Markets/PreviewMarketCards";
import InitializeGuide from "@/components/InitializeGuide";
import { OnboardingWelcome } from "@/components/Onboarding";
import Footer from "@/components/Footer";
import { useState, useEffect, Suspense } from "react";
import { useDictionary } from "@/providers/dictionary-provider";
import { useRouter, useSearchParams } from "next/navigation";

type TradingTabId = "positions" | "orders" | "markets";

function HomeContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as TradingTabId | null;
  const [activeTradingTab, setActiveTradingTab] = useState<TradingTabId>(
    tabParam && ["positions", "orders", "markets"].includes(tabParam) ? tabParam : "markets"
  );
  const {
    isTradingSessionComplete,
    eoaAddress,
    isGeoblocked,
    isGeoblockLoading,
    geoblockStatus,
    initializeTradingSession,
    currentStep,
  } = useTrading();
  const { dict } = useDictionary();
  const router = useRouter();
  const [isInitializing, setIsInitializing] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Update active tab when URL changes
  useEffect(() => {
    if (tabParam && ["positions", "orders", "markets"].includes(tabParam)) {
      setActiveTradingTab(tabParam);
    } else if (!tabParam) {
      // If no tab param, default to markets
      setActiveTradingTab("markets");
    }
  }, [tabParam]);

  useEffect(() => {
    const checkOnboardingStatus = async () => {
      // Don't show onboarding if wallet is not connected
      if (!eoaAddress) {
        setShowOnboarding(false);
        return;
      }

      try {
        // Check if onboarding was already completed in Redis
        const key = `app:user:onboarding:completed:${eoaAddress}`;
        const response = await fetch(`/api/redis?key=${encodeURIComponent(key)}`);

        if (!response.ok) {
          console.error('[Onboarding] Failed to check onboarding status from Redis');
          setShowOnboarding(false);
          return;
        }

        const data = await response.json();

        // If the key exists, user already completed onboarding
        if (data.value) {
          console.log('[Onboarding] User already completed onboarding at:', data.value);
          setShowOnboarding(false);
        } else {
          // User has not completed onboarding yet, show it
          console.log('[Onboarding] User has not completed onboarding, showing modal');
          setShowOnboarding(true);
        }
      } catch (error) {
        console.error('[Onboarding] Error checking onboarding status:', error);
        setShowOnboarding(false);
      }
    };

    checkOnboardingStatus();
  }, [eoaAddress]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    // Onboarding component already saves to Redis
  };

  const handleInitialize = async () => {
    try {
      setIsInitializing(true);
      await initializeTradingSession();

      // Check if there's a saved redirect path
      const savedRedirect = sessionStorage.getItem('redirectAfterInit');
      if (savedRedirect) {
        console.log('[Home] Redirecting to saved path:', savedRedirect);
        sessionStorage.removeItem('redirectAfterInit'); // Clean up
        router.push(savedRedirect);
      }
    } catch (error) {
      console.error("Failed to initialize trading session:", error);
    } finally {
      setIsInitializing(false);
    }
  };

  const showInitializeButton = 
    eoaAddress && 
    !isTradingSessionComplete && 
    !isGeoblocked;

  const showLoginMessage = 
    !eoaAddress && 
    !isTradingSessionComplete;

  return (
    <div className="min-h-dvh flex flex-col">
      {showLoginMessage ? (
        <NavbarPreview />
      ) : (
        <Navbar 
          activeTradingTab={activeTradingTab} 
          onTradingTabChange={setActiveTradingTab} 
        />
      )}
      {showOnboarding && (
        <OnboardingWelcome onComplete={handleOnboardingComplete} />
      )}

      <div className="px-6 pt-2 pb-2 flex flex-col gap-6 max-w-7xl mx-auto w-full flex-1">
        {/* Show geoblock banner if user is in blocked region */}
        {isGeoblocked && !isGeoblockLoading && (
          <GeoBlockedBanner geoblockStatus={geoblockStatus} />
        )}

        {/* Preview Market Cards - Shallow copy for non-logged users */}
        {showLoginMessage && <PreviewMarketCards />}

        {/* Initialize Trading Session Guide - Arrow points to the button */}
        {showInitializeButton && (
          <div className="flex-1 flex items-center justify-center">
            <InitializeGuide 
              onClick={handleInitialize}
              disabled={isInitializing || currentStep !== "idle"}
              isInitializing={isInitializing || currentStep !== "idle"}
            />
          </div>
        )}

        {/* Markets are viewable even when geoblocked, but trading buttons should be disabled */}
        {(isTradingSessionComplete || isGeoblocked) && eoaAddress && (
          <MarketTabs 
            activeTab={activeTradingTab} 
            onTabChange={setActiveTradingTab} 
          />
        )}
      </div>
      <Footer />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-dvh flex items-center justify-center">Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
