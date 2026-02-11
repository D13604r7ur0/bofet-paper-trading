"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, Menu, X, Info, HelpCircle, Bug } from "lucide-react";
import { useWallet } from "@/providers/WalletContext";
import { useTrading } from "@/providers/TradingProvider";
import { useDictionary } from "@/providers/dictionary-provider";
import { useNavigationLoading } from "@/providers/NavigationLoadingProvider";
import UserAvatar from "@/components/Avatar/UserAvatar";
import useAvatarStyle from "@/hooks/useAvatarStyle";
import { useQueryClient } from "@tanstack/react-query";
import usePolygonBalances from "@/hooks/usePolygonBalances";
import useEoaBridgeConvert from "@/hooks/useEoaBridgeConvert";
import useEoaToSafeTransfer from "@/hooks/useEoaToSafeTransfer";
import useEoaUsdceToUsdcSwap from "@/hooks/useEoaUsdceToUsdcSwap";
import useSafeToEoaTransfer from "@/hooks/useSafeToEoaTransfer";
import useSafePolTransfer from "@/hooks/useSafePolTransfer";
import useUsdcToUsdceSwap from "@/hooks/useUsdcToUsdceSwap";
import useSendGas from "@/hooks/useSendGas";
import PortfolioCashBalance from "@/components/Header/PortfolioCashBalance";
import { MIN_BRIDGE_DEPOSIT } from "@/constants/api";
import { parseUsdcAmount } from "@/utils/bridge";
import { parseUnits, formatUnits } from "viem";
import HowItWorksModal from "@/components/HowItWorksModal";
import { usePaymentModal } from "@/providers/PaymentModalContext";
import PayoutModal from "@/components/PayoutModal";
import SearchModal from "@/components/shared/SearchModal";
import ConnectWalletUI from "@/components/ConnectWalletUI";
import type { SearchResult, SearchResponse } from "@/types/search";
import PMTBalance from "@/components/Navbar/PMTBalance";

const showRebalanceButton =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_SHOW_REBALANCE_BUTTON === "true";

type TradingTabId = "positions" | "orders" | "markets";

interface NavbarProps {
  activeTradingTab?: TradingTabId;
  onTradingTabChange?: (tab: TradingTabId) => void;
}

export default function Navbar(props: NavbarProps = {}) {

  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const handleSearch = useCallback(async (query: string) => {
    if (!query || query.trim().length === 0) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    try {
      setIsSearching(true);

      const response = await fetch(`/api/polymarket/search?q=${encodeURIComponent(query)}`);

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data: SearchResponse = await response.json();
      setSearchResults(data.results);
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const { activeTradingTab, onTradingTabChange } = props;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { eoaAddress, connect, disconnect, userEmail } = useWallet();
  const {
    safeAddress,
    isTradingSessionComplete,
    initializeTradingSession,
    endTradingSession,
    currentStep,
  } = useTrading();
  const queryClient = useQueryClient();
  const { convertUsdcToUsdce, isConverting, error: convertError } =
    useEoaBridgeConvert();
  const { transferUsdceToSafe, isTransferring, error: transferError } =
    useEoaToSafeTransfer();
  const {
    transferSafeUsdceToEoa,
    isTransferring: isWithdrawingToEoa,
    error: safeToEoaError,
    safeUsdcBalance,
  } = useSafeToEoaTransfer();
  const { swapUsdceToUsdc, isSwapping, error: swapError } =
    useEoaUsdceToUsdcSwap();
  const { transferPolToEoa, isTransferring: isTransferringPol, error: polTransferError } =
    useSafePolTransfer();
  const {
    executeSwap: executeUsdcToUsdceSwap,
    isSwapping: isSwappingUsdcToUsdce,
    error: usdcToUsdceError,
  } = useUsdcToUsdceSwap();
  const {
    claimGas,
    isClaiming,
    error: sendGasError,
    hasClaimed,
    isCheckingClaimed,
  } = useSendGas();
  const {
    rawNativeUsdcBalance: eoaRawNativeUsdcBalance,
    rawUsdcBalance: eoaRawUsdcBalance,
  } = usePolygonBalances(eoaAddress);
  const {
    rawNativeUsdcBalance: safeRawNativeUsdcBalance,
  } = usePolygonBalances(safeAddress);
  const [buyUsdceAmount, setBuyUsdceAmount] = useState("");
  // DEV: Get Safe balances for dev display - COMMENTED OUT
  // const {
  //   nativeUsdcBalance: safeNativeUsdc,
  //   usdcBalance: safeUsdce,
  // } = usePolygonBalances(safeAddress);
  const minBridgeAmount = parseUsdcAmount(MIN_BRIDGE_DEPOSIT);
  const { dict, locale } = useDictionary();
  const { startLoading } = useNavigationLoading();
  const { avatarStyle } = useAvatarStyle();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showHowItWorksModal, setShowHowItWorksModal] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [showWalletUI, setShowWalletUI] = useState(false);
  const { openPaymentModal } = usePaymentModal();
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [polAmount, setPolAmount] = useState("0.5");

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

  // Keyboard shortcut to open search with "/"
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if "/" was pressed
      if (event.key === '/') {
        // Don't trigger if user is typing in an input, textarea, or contenteditable
        const target = event.target as HTMLElement;
        const isTyping =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable;

        if (!isTyping) {
          event.preventDefault(); // Prevent "/" from being typed

          // If user is not logged in, trigger connect
          if (!eoaAddress) {
            connect();
          } else {
            // If logged in, open search modal
            setIsSearchModalOpen(true);
          }
        }
      }
    };

    // Add event listener
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [eoaAddress, connect]);

  const handleConnect = async () => {
    if (!eoaAddress) {
      // Step 1: Connect wallet
      await connect();
    } else if (!isTradingSessionComplete) {
      // Step 2: Initialize trading session
      await initializeTradingSession();
    }
  };

  const handleDisconnectClick = () => {
    setShowDisconnectModal(true);
    setIsMobileMenuOpen(false); // Close drawer when showing modal
  };

  const handleConvertToUsdceClick = async () => {
    const amount = eoaRawNativeUsdcBalance ?? BigInt(0);

    if (amount < minBridgeAmount) return;
    try {
      await convertUsdcToUsdce(amount);
      if (eoaAddress) {
        queryClient.invalidateQueries({
          queryKey: ["usdcBalance", eoaAddress],
        });
        queryClient.invalidateQueries({
          queryKey: ["nativeUsdcBalance", eoaAddress],
        });
      }
    } catch {
      // Error is set in useEoaBridgeConvert; show via convertError below
    }
  };

  const handleSendUsdceToSafeClick = async () => {
    const amount = eoaRawUsdcBalance ?? BigInt(0);
    if (amount <= BigInt(0)) return;
    try {
      await transferUsdceToSafe(amount);
      if (safeAddress && eoaAddress) {
        queryClient.invalidateQueries({
          queryKey: ["usdcBalance", safeAddress],
        });
        queryClient.invalidateQueries({
          queryKey: ["usdcBalance", eoaAddress],
        });
      }
    } catch {
      // Error is set in useEoaToSafeTransfer; show via transferError below
    }
  };

  const handleWithdrawSafeToEoaClick = async () => {
    if (safeUsdcBalance <= BigInt(0)) return;
    try {
      await transferSafeUsdceToEoa();
    } catch {
      // Error is set in useSafeToEoaTransfer; show via safeToEoaError below
    }
  };

  const handleSwapUsdceToUsdcClick = async () => {
    if ((eoaRawUsdcBalance ?? BigInt(0)) <= BigInt(0)) return;
    try {
      await swapUsdceToUsdc();
    } catch {
      // Error is set in useEoaUsdceToUsdcSwap; show via swapError below
    }
  };

  const handleSetMaxPol = async () => {
    if (!safeAddress) return;
    try {
      const { getPublicPolygonClient } = await import("@/utils/polygonGas");
      const publicClient = getPublicPolygonClient();
      const balance = await publicClient.getBalance({
        address: safeAddress as `0x${string}`,
      });
      // Convert from wei to POL and leave small amount for gas
      const balanceInPol = Number(balance) / 1e18;
      const maxTransferable = Math.max(0, balanceInPol - 0.01); // Reserve 0.01 POL for gas
      setPolAmount(maxTransferable.toFixed(4));
    } catch (err) {
      console.error("Error getting POL balance:", err);
    }
  };

  const handleTransferPolToEoaClick = async () => {
    if (!polAmount || parseFloat(polAmount) <= 0) {
      alert("❌ Please enter a valid POL amount");
      return;
    }
    try {
      await transferPolToEoa(polAmount);
      alert(`✅ Successfully transferred ${polAmount} POL from Safe to EOA`);
      setPolAmount("0.5"); // Reset to default
    } catch (err) {
      console.error("POL transfer error:", err);
      alert(`❌ Error: ${(err as Error).message}`);
    }
  };

  const handleBuyUsdceClick = async () => {
    if (!buyUsdceAmount || parseFloat(buyUsdceAmount) <= 0) return;
    try {
      const amountIn = parseUnits(buyUsdceAmount, 6);
      await executeUsdcToUsdceSwap(amountIn);
      if (safeAddress) {
        queryClient.invalidateQueries({
          queryKey: ["nativeUsdcBalance", safeAddress],
        });
        queryClient.invalidateQueries({
          queryKey: ["usdcBalance", safeAddress],
        });
      }
    } catch {
      // Error is set in useUsdcToUsdceSwap; show via usdcToUsdceError below
    }
  };

  const handleClaimGasClick = async () => {
    try {
      await claimGas();
    } catch {
      // Error is set in useSendGas; show via sendGasError below
    }
  };

  const handleSetMaxBuyUsdce = () => {
    if (!safeRawNativeUsdcBalance) return;
    setBuyUsdceAmount(formatUnits(safeRawNativeUsdcBalance, 6));
  };

  const handleDisconnectConfirm = async () => {
    setShowDisconnectModal(false);
    try {
      if (isTradingSessionComplete) {
        endTradingSession();
      }
      await disconnect();
    } catch (error) {
      console.error("Disconnect error:", error);
    }
  };

  // Determine button state and text
  const getButtonState = () => {
    if (!eoaAddress) {
      return {
        text: dict.wallet?.connect ?? "Connect Wallet",
        onClick: handleConnect,
        disabled: false,
        variant: "primary" as const,
      };
    }
    if (!isTradingSessionComplete) {
      return {
        text: currentStep !== "idle"
          ? dict.wallet?.initializing ?? "Initializing..."
          : dict.wallet?.initializeSession ?? "Initialize Trading Session",
        onClick: handleConnect,
        disabled: currentStep !== "idle",
        variant: "primary" as const,
      };
    }
    return {
      text: dict.wallet?.disconnect ?? "Disconnect",
      onClick: handleDisconnectClick,
      disabled: false,
      variant: "secondary" as const,
    };
  };

  const buttonState = getButtonState();

  const profileHref = `/${locale || "es"}/profile`;
  const isOnProfile = pathname === profileHref;
  const marketsHref = `/${locale || "es"}?tab=markets`;
  const isOnMarkets =
    (pathname === `/${locale || "es"}` || pathname === "/") &&
    searchParams.get("tab") === "markets";

  const handleNavClick = (page: string) => {
    setIsMobileMenuOpen(false);

    if (page === "profile" && isOnProfile) return;
    if (page === "markets" && isOnMarkets) return;

    startLoading();

    if (page === "profile") {
      router.push(profileHref);
    } else if (page === "markets") {
      router.push(marketsHref);
    }
  };

  const registerHref = `/${locale || "es"}/register`;

  // Prefetch profile when logged in, register/sign-in when not, so those pages load faster
  useEffect(() => {
    if (eoaAddress) {
      router.prefetch(profileHref);
    } else {
      router.prefetch(registerHref);
    }
  }, [router, profileHref, registerHref, eoaAddress]);

  // Navigation items matching source Header
  const navItems: Array<{ id: string; label: string; requiresAuth?: boolean }> = [
    // { id: "markets", label: dict.navbar.markets ?? "Markets" }, // Removed - logo already navigates to home
    // { id: "investing", label: dict.navbar.investingHome ?? "Investing Home" },
    // { id: "portfolio", label: dict.navbar.portfolio ?? "Portfolio", requiresAuth: true },
  ];

  const visibleNavItems = navItems.filter(
    (item) => !item.requiresAuth || eoaAddress
  );

  return (
    <>
      <div className="drawer drawer-end">
        {/* Input checkbox that controls the drawer */}
        <input
          id="mobile-drawer"
          type="checkbox"
          className="drawer-toggle"
          checked={isMobileMenuOpen}
          onChange={(e) => setIsMobileMenuOpen(e.target.checked)}
        />

        {/* Main content: Navbar */}
        <div className="drawer-content">
          <nav
            className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 overflow-x-auto md:overflow-x-hidden">
            <div className="w-full max-w-7xl mx-auto px-6">
              <div className="flex justify-between h-16 items-center w-full">
                {/* Left side: Brand, Search, and Navigation */}
                <div className="flex items-center gap-4 md:gap-6">
                  {/* Logo */}
                  <Link
                    href={marketsHref}
                    onClick={() => {
                      if (!isOnMarkets) startLoading();
                    }}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#00C805]">
                      <img src="/boget_logo_white.svg" alt={dict.wallet?.logoAlt ?? "UseBofet Logo"} className="w-6 h-6 object-contain" />
                    </div>
                    <span className="font-bold text-xl tracking-tight text-slate-900">useBofet.com</span>
                  </Link>

                  {/* Search Input - Moved to start, after logo */}
                  <div className="relative hidden sm:block">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm w-4 h-4" />
                    <input
                      type="text"
                      onClick={async () => {
                        if (!eoaAddress) {
                          await connect();
                        } else {
                          setIsSearchModalOpen(true);
                        }
                      }}
                      placeholder={dict.navbar.searchPlaceholder ?? "Search markets..."}
                      className="pl-10 pr-8 py-2 bg-slate-100 border-none rounded-full text-sm w-48 sm:w-52 md:w-60 lg:w-72 xl:w-80 focus:ring-2 focus:ring-[#00C805]/20 text-slate-900 placeholder:text-slate-400 transition-all cursor-pointer"
                    />
                    {/* "/" keyboard shortcut indicator */}
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">
                      /
                    </span>
                  </div>
                </div>

                {/* Right side: Auth, Profile */}
                <div className="flex items-center gap-1 sm:gap-2 md:gap-4">
                  {/* Search Icon - Mobile only */}
                  <button
                    onClick={async () => {
                      if (!eoaAddress) {
                        await connect();
                      } else {
                        setIsSearchModalOpen(true);
                      }
                    }}
                    className="sm:hidden btn btn-ghost btn-circle btn-sm"
                    aria-label="Buscar"
                    title="Buscar"
                  >
                    <Search className="w-4 h-4" />
                  </button>

                  {/* How it works - outline blue, always show text + icon */}
                  <button
                    onClick={() => setShowHowItWorksModal(true)}
                    className="flex items-center gap-1 sm:gap-1.5 border border-blue-500 text-blue-500 hover:bg-blue-50 hover:text-blue-600 font-medium px-1.5 py-1 sm:px-2.5 sm:py-1.5 rounded-full text-[10px] sm:text-xs transition-colors shrink-0 cursor-pointer"
                    aria-label={dict.navbar?.howItWorks ?? "How it works"}
                    title={dict.navbar?.howItWorks ?? "How it works"}
                  >
                    <Info className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                    <span>{dict.navbar?.howItWorks ?? "Cómo funciona"}</span>
                  </button>

                  {/* Wallet Connect/Disconnect Button (no Regístrate here - only on public NavbarPreview) */}
                  <div className="md:flex items-center gap-1 sm:gap-2 shrink-0 hidden">
                    <button
                      type="button"
                      onClick={buttonState.onClick}
                      disabled={buttonState.disabled}
                      aria-label={buttonState.text}
                      className={`${buttonState.variant === "primary"
                        ? "bg-[#00C805] hover:bg-[#00A804] text-white font-semibold px-4 py-2 rounded-full text-sm"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-900 border-none px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2"
                        } ${buttonState.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} transition-colors`}
                    >
                      {buttonState.variant === "secondary" && (
                        <div className="w-3 h-3 rounded-full bg-green-500 shrink-0"></div>
                      )}
                      <span>{buttonState.text}</span>
                    </button>
                  </div>

                  {/* Hamburger Menu Button - Always visible at the end */}
                  <label
                    htmlFor="mobile-drawer"
                    className="btn btn-ghost btn-circle btn-sm"
                    aria-label="Toggle menu"
                  >
                    <Menu className="w-5 h-5" />
                  </label>
                </div>
              </div>

              {/* Second Navbar - Trading Balance (subtle, smaller) */}
              {eoaAddress && (
                <div className="border-t border-slate-100 bg-slate-50/50">
                  <div className="flex justify-between items-center gap-2 h-12 max-w-7xl mx-auto px-6">
                    {/* Desktop: Inicio + Mis Posiciones at start (same style as balance buttons) */}
                    <div className="hidden md:flex items-center border border-gray-300 rounded-lg overflow-hidden bg-gray-100">
                      <Link
                        href={marketsHref}
                        onClick={() => {
                          if (!isOnMarkets) startLoading();
                        }}
                        aria-label="Inicio"
                        className="flex-shrink-0 p-1.5 sm:px-2 sm:py-1.5 md:px-3 md:py-1.5 text-xs font-medium hover:bg-gray-200 text-gray-900 transition-all duration-200 flex items-center gap-1 md:gap-1.5 border-r border-gray-300 cursor-pointer"
                      >

                        <span>Inicio</span>
                      </Link>
                      <Link
                        href={`/${locale || "es"}?tab=positions`}
                        onClick={() => {
                          if (pathname !== `/${locale || "es"}` || searchParams.get("tab") !== "positions") startLoading();
                        }}
                        aria-label={dict.trading?.tabs?.positions ?? "Mis Posiciones"}
                        className="flex-shrink-0 p-1.5 sm:px-2 sm:py-1.5 md:px-3 md:py-1.5 text-xs font-medium hover:bg-gray-200 text-gray-900 transition-all duration-200 flex items-center gap-1 md:gap-1.5 cursor-pointer"
                      >

                        <span>{dict.trading?.tabs?.positions ?? "Mis Posiciones"}</span>
                      </Link>
                    </div>
                    {/* Balance, rebalance, profile at end */}
                    <div className="flex justify-end items-center gap-2 flex-1 min-w-0">
                      {/* Report bug - soft red, logged-in only; at start of this row */}
                      {eoaAddress && (
                        <Link
                          href={`/${locale || "es"}/report-bug`}
                          className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 hover:text-red-700 hover:border-red-300 transition-colors shrink-0"
                          aria-label={(dict as { reportBug?: { title: string } }).reportBug?.title ?? "Reportar un error"}
                          title={(dict as { reportBug?: { title: string } }).reportBug?.title ?? "Reportar un error"}
                        >
                          <Bug className="w-4 h-4 sm:w-4 sm:h-4" />
                        </Link>
                      )}
                      {/* DEV: Safe Balances Display - COMMENTED OUT */}
                      {/* {showRebalanceButton && safeAddress && (
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-orange-50 border border-orange-200 rounded-md text-xs">
                        <span className="text-orange-800 font-semibold">DEV Safe:</span>
                        <span className="text-orange-700">
                          USDC: ${safeNativeUsdc?.toFixed(2) || '0.00'}
                        </span>
                        <span className="text-orange-700">|</span>
                        <span className="text-orange-700">
                          USDCe: ${safeUsdce?.toFixed(2) || '0.00'}
                        </span>
                      </div>
                    )} */}
                      {/* Convert EOA native USDC → USDC.e (stays on EOA); Send EOA USDC.e → Safe */}
                      {showRebalanceButton &&
                        eoaAddress && (
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* DEV: Transfer POL from Safe to EOA - commented out
                          {safeAddress && (
                            <div className="flex items-center gap-1">
                              <label className="input input-bordered input-sm flex items-center gap-1 w-32">
                                <input
                                  type="text"
                                  value={polAmount}
                                  onChange={(e) => setPolAmount(e.target.value)}
                                  placeholder="0.5"
                                  className="grow w-16 text-xs"
                                  disabled={isTransferringPol}
                                />
                                <button
                                  type="button"
                                  onClick={handleSetMaxPol}
                                  className="btn btn-xs btn-primary"
                                  disabled={isTransferringPol}
                                  title="Set max transferable POL"
                                >
                                  MAX
                                </button>
                              </label>
                              <button
                                type="button"
                                onClick={handleTransferPolToEoaClick}
                                disabled={isTransferringPol || !polAmount || parseFloat(polAmount) <= 0}
                                aria-label={
                                  isTransferringPol
                                    ? "Transferring POL..."
                                    : `Transfer ${polAmount} POL to EOA`
                                }
                                title="Transfer POL from Safe to your wallet (DEV ONLY)"
                                className="btn btn-sm bg-purple-100 hover:bg-purple-200 text-purple-800 border-purple-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isTransferringPol ? "Sending..." : "Get POL"}
                              </button>
                            </div>
                          )}
                          */}
                            {polTransferError && (
                              <span className="text-xs text-red-600 max-w-35 truncate" title={polTransferError.message}>
                                {polTransferError.message}
                              </span>
                            )}
                            {/* TEMPORARILY DISABLED - Buy USDC.e button */}
                            {/* {safeAddress && (
                            <div className="flex items-center gap-1">
                              <label className="input input-bordered input-sm flex items-center gap-1 w-36">
                                <input
                                  type="text"
                                  value={buyUsdceAmount}
                                  onChange={(e) => setBuyUsdceAmount(e.target.value)}
                                  placeholder="0.00"
                                  className="grow w-16 text-xs"
                                  disabled={isSwappingUsdcToUsdce}
                                />
                                <button
                                  type="button"
                                  onClick={handleSetMaxBuyUsdce}
                                  className="btn btn-xs btn-primary"
                                  disabled={isSwappingUsdcToUsdce}
                                  title="Set max USDC from Safe"
                                >
                                  MAX
                                </button>
                              </label>
                              <button
                                type="button"
                                onClick={handleBuyUsdceClick}
                                disabled={isSwappingUsdcToUsdce || !buyUsdceAmount || parseFloat(buyUsdceAmount) <= 0 || (safeRawNativeUsdcBalance ?? BigInt(0)) <= BigInt(0)}
                                aria-label={
                                  isSwappingUsdcToUsdce
                                    ? "Swapping..."
                                    : `Buy USDC.e with ${buyUsdceAmount} USDC`
                                }
                                title="Swap Safe's native USDC for USDC.e (1% fee) (DEV ONLY)"
                                className="btn btn-sm bg-blue-100 hover:bg-blue-200 text-blue-800 border-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isSwappingUsdcToUsdce ? "Swapping..." : "Buy USDC.e"}
                              </button>
                            </div>
                          )}
                          {usdcToUsdceError && (
                            <span className="text-xs text-red-600 max-w-35 truncate" title={usdcToUsdceError.message}>
                              {usdcToUsdceError.message}
                            </span>
                          )} */}
                            {/* TEMPORARILY DISABLED - Claim Gas button */}
                            {/* <button
                            type="button"
                            onClick={handleClaimGasClick}
                            disabled={isClaiming || hasClaimed || isCheckingClaimed}
                            aria-label={
                              isClaiming
                                ? "Claiming..."
                                : hasClaimed
                                  ? "Gas Claimed"
                                  : "Claim Gas"
                            }
                            title="Claim 2 free POL for your wallet (one time per wallet, DEV ONLY)"
                            className="btn btn-sm bg-orange-100 hover:bg-orange-200 text-orange-800 border-orange-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isClaiming
                              ? "Claiming..."
                              : hasClaimed
                                ? "Gas Claimed"
                                : "Claim Gas"}
                          </button>
                          {sendGasError && (
                            <span className="text-xs text-red-600 max-w-35 truncate" title={sendGasError.message}>
                              {sendGasError.message}
                            </span>
                          )} */}
                            {/* TEMPORARILY DISABLED - Convert to USDC.e button */}
                            {/* <button
                            type="button"
                            onClick={handleConvertToUsdceClick}
                            disabled={isConverting || (eoaRawNativeUsdcBalance ?? BigInt(0)) < minBridgeAmount}
                            aria-label={
                              isConverting
                                ? "Converting..."
                                : "Convert to USDC.e"
                            }
                            title={
                              (eoaRawNativeUsdcBalance ?? BigInt(0)) < minBridgeAmount
                                ? "Requires at least $2 native USDC in your wallet"
                                : undefined
                            }
                            className="btn btn-sm bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isConverting ? "Converting..." : "Convert to USDC.e"}
                          </button>
                          {(eoaRawNativeUsdcBalance ?? BigInt(0)) < minBridgeAmount && !isConverting && (
                            <span className="text-xs text-slate-500" title="Polymarket bridge minimum">
                              Need $2+ native USDC
                            </span>
                          )} */}
                            {/* TEMPORARILY DISABLED - Swap to USDC button */}
                            {/* <button
                            type="button"
                            onClick={handleSwapUsdceToUsdcClick}
                            disabled={isSwapping || (eoaRawUsdcBalance ?? BigInt(0)) <= BigInt(0)}
                            aria-label={
                              isSwapping
                                ? ((dict.navbar as { swapToUsdcSending?: string })?.swapToUsdcSending ?? "Swapping...")
                                : ((dict.navbar as { swapToUsdc?: string })?.swapToUsdc ?? "Swap to USDC")
                            }
                            title={
                              (eoaRawUsdcBalance ?? BigInt(0)) <= BigInt(0)
                                ? ((dict.navbar as { swapToUsdcErrorNoBalance?: string })?.swapToUsdcErrorNoBalance ?? "No USDC.e in your wallet")
                                : ((dict.navbar as { swapToUsdcTooltip?: string })?.swapToUsdcTooltip ?? "Swap all USDC.e in your wallet to native USDC")
                            }
                            className="btn btn-sm bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isSwapping ? ((dict.navbar as { swapToUsdcSending?: string })?.swapToUsdcSending ?? "Swapping...") : ((dict.navbar as { swapToUsdc?: string })?.swapToUsdc ?? "Swap to USDC")}
                          </button> */}
                            {/* TEMPORARILY DISABLED - Send USDC.e to Safe button */}
                            {/* {safeAddress && (
                            <button
                              type="button"
                              onClick={handleSendUsdceToSafeClick}
                              disabled={isTransferring || (eoaRawUsdcBalance ?? BigInt(0)) <= BigInt(0)}
                              aria-label={
                                isTransferring
                                  ? "Sending..."
                                  : "Send USDC.e to Safe"
                              }
                              title={
                                (eoaRawUsdcBalance ?? BigInt(0)) <= BigInt(0)
                                  ? "No USDC.e in your wallet"
                                  : undefined
                              }
                              className="btn btn-sm bg-sky-100 hover:bg-sky-200 text-sky-800 border-sky-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isTransferring ? "Sending..." : "Send USDC.e to Safe"}
                            </button>
                          )} */}
                            {/* TEMPORARILY DISABLED - Withdraw to wallet button */}
                            {/* {safeAddress && (
                            <button
                              type="button"
                              onClick={handleWithdrawSafeToEoaClick}
                              disabled={isWithdrawingToEoa || safeUsdcBalance <= BigInt(0)}
                              aria-label={
                                isWithdrawingToEoa
                                  ? "Withdrawing..."
                                  : "Withdraw USDC.e to wallet"
                              }
                              title={
                                safeUsdcBalance <= BigInt(0)
                                  ? "No USDC.e in Safe"
                                  : "Send all USDC.e from Safe to your wallet"
                              }
                              className="btn btn-sm bg-violet-100 hover:bg-violet-200 text-violet-800 border-violet-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isWithdrawingToEoa ? "Withdrawing..." : "Withdraw to wallet"}
                            </button>
                          )} */}
                            {/* TEMPORARILY DISABLED - Error messages for disabled buttons */}
                            {/* {convertError && (
                            <>
                              <span className="text-xs text-red-600 max-w-35 truncate" title={convertError.message}>
                                {convertError.message}
                              </span>
                            </>
                          )}
                          {transferError && (
                            <>
                              <span className="text-xs text-red-600 max-w-35 truncate" title={transferError.message}>
                                {transferError.message}
                              </span>
                            </>
                          )}
                          {safeToEoaError && (
                            <>
                              <span className="text-xs text-red-600 max-w-35 truncate" title={safeToEoaError.message}>
                                {safeToEoaError.message}
                              </span>
                            </>
                          )}
                          {swapError && (
                            <>
                              <span className="text-xs text-red-600 max-w-35 truncate" title={swapError.message}>
                                {swapError.message}
                              </span>
                            </>
                          )} */}

                          </div>
                        )}
                      {/* PortfolioCashBalance oculto - reemplazado por PMTBalance con misma UI */}
                      {/* <PortfolioCashBalance /> */}
                      <PMTBalance />
                      {/* Wallet Button */}
                      {/* <button
                      onClick={() => setShowWalletUI(true)}
                      className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-[#00C805] transition-all"
                      aria-label="Wallet Settings"
                      title="Wallet Settings"
                    >
                      <Wallet className="w-4 h-4 text-slate-400" />
                    </button> */}

                      {/* Profile Button - Link for prefetch when not on profile; hidden on mobile */}
                      <div className="hidden md:block">
                        {isOnProfile ? (
                          <span
                            className="hover:ring-2 hover:ring-[#00C805] transition-all cursor-default rounded-full overflow-hidden"
                            aria-current="page"
                          >
                            <UserAvatar
                              seed={userEmail || eoaAddress || undefined}
                              size={32}
                              style={avatarStyle}
                            />
                          </span>
                        ) : (
                          <Link
                            href={profileHref}
                            onClick={() => startLoading()}
                            className="hover:ring-2 hover:ring-[#00C805] transition-all cursor-pointer rounded-full overflow-hidden"
                            aria-label={dict.navbar?.viewProfile ?? "View Profile"}
                          >
                            <UserAvatar
                              seed={userEmail || eoaAddress || undefined}
                              size={32}
                              style={avatarStyle}
                            />
                          </Link>
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              )}
            </div>
          </nav>
        </div>

        {/* Drawer Side - Mobile sidebar menu */}
        <div className="drawer-side z-60">
          {/* Dark overlay */}
          <label htmlFor="mobile-drawer" aria-label="close sidebar" className="drawer-overlay"></label>

          {/* Drawer content */}
          <div className="min-h-full w-80 bg-white flex flex-col">
            {/* Drawer header with logo and close button */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              {/* Logo */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#00C805]">
                  <img src="/boget_logo_white.svg" alt={dict.wallet?.logoAlt ?? "UseBofet Logo"} className="w-6 h-6 object-contain" />
                </div>
                <span className="font-bold text-xl tracking-tight text-slate-900">useBofet.com</span>
              </div>
              {/* Close button */}
              <label htmlFor="mobile-drawer" className="btn btn-ghost btn-circle btn-sm">
                <X className="w-5 h-5" />
              </label>
            </div>

            {/* User profile (if connected) - Link for prefetch when not on profile */}
            {eoaAddress && (
              <div className="px-4 py-4 border-b border-slate-200">
                {isOnProfile ? (
                  <button
                    type="button"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                    aria-current="page"
                  >
                    <UserAvatar
                      seed={userEmail || eoaAddress || undefined}
                      size={40}
                      style={avatarStyle}
                    />
                    <span className="text-sm font-medium text-slate-900">
                      {dict.navbar?.viewProfile ?? "View Profile"}
                    </span>
                  </button>
                ) : (
                  <Link
                    href={profileHref}
                    onClick={() => {
                      startLoading();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <UserAvatar
                      seed={userEmail || eoaAddress || undefined}
                      size={40}
                      style={avatarStyle}
                    />
                    <span className="text-sm font-medium text-slate-900">
                      {dict.navbar?.viewProfile ?? "View Profile"}
                    </span>
                  </Link>
                )}
              </div>
            )}

            {/* Trading Navigation - Large buttons */}
            {eoaAddress && (
              <div className="px-4 py-6 flex-1">
                <Link
                  href={`/${locale || "es"}?tab=positions`}
                  onClick={() => {
                    startLoading();
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full block text-left text-xl font-bold transition-colors mb-4 px-4 py-3 rounded-lg cursor-pointer ${activeTradingTab === "positions"
                    ? "bg-[#00C805]/10 text-[#00C805]"
                    : "text-gray-900 hover:bg-slate-100 hover:text-[#00C805]"
                    }`}
                >
                  {dict.trading?.tabs?.positions ?? "My Positions"}
                </Link>
                <Link
                  href={`/${locale || "es"}?tab=orders`}
                  onClick={() => {
                    startLoading();
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full block text-left text-xl font-bold transition-colors mb-4 px-4 py-3 rounded-lg cursor-pointer ${activeTradingTab === "orders"
                    ? "bg-[#00C805]/10 text-[#00C805]"
                    : "text-gray-900 hover:bg-slate-100 hover:text-[#00C805]"
                    }`}
                >
                  {dict.trading?.tabs?.orders ?? "Open Orders"}
                </Link>
                <Link
                  href={`/${locale || "es"}?tab=markets`}
                  onClick={() => {
                    startLoading();
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full block text-left text-xl font-bold transition-colors mb-4 px-4 py-3 rounded-lg cursor-pointer ${activeTradingTab === "markets"
                    ? "bg-[#00C805]/10 text-[#00C805]"
                    : "text-gray-900 hover:bg-slate-100 hover:text-[#00C805]"
                    }`}
                >
                  {dict.trading?.tabs?.markets ?? "Markets"}
                </Link>

                {/* Reportar bug - red, logged-in only */}
                <Link
                  href={`/${locale || "es"}/report-bug`}
                  onClick={() => {
                    startLoading();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full block text-left text-xl font-bold transition-colors px-4 py-3 rounded-lg cursor-pointer text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  {(dict as { reportBug?: { title: string } }).reportBug?.title ?? "Reportar un error"}
                </Link>
              </div>
            )}

            {/* Drawer footer - Actions */}
            <div className="p-4 border-t border-slate-200 space-y-3 mt-auto">
              {/* Payment and Payout (if connected) */}
              {eoaAddress && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      openPaymentModal();
                      setIsMobileMenuOpen(false);
                    }}
                    className="flex-1 text-center px-4 py-3 rounded-full text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-900 transition-colors cursor-pointer"
                    title={dict.navbar?.payment ?? "Payment"}
                  >
                    {dict.navbar?.payment ?? "Payment"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPayoutModalOpen(true);
                      setIsMobileMenuOpen(false);
                    }}
                    className="flex-1 text-center px-4 py-3 rounded-full text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-900 transition-colors cursor-pointer"
                    title={dict.navbar?.payout ?? "Payout"}
                  >
                    {dict.navbar?.payout ?? "Payout"}
                  </button>
                </div>
              )}

              {/* Wallet Connect/Disconnect Button (no Regístrate in drawer - only on public NavbarPreview) */}
              <button
                type="button"
                onClick={buttonState.onClick}
                disabled={buttonState.disabled}
                aria-label={buttonState.text}
                className={`w-full ${buttonState.variant === "primary"
                  ? "bg-[#00C805] hover:bg-[#00A804] text-white font-semibold px-4 py-3 rounded-full text-sm transition-colors"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-900 border-none px-4 py-3 rounded-full text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  } ${buttonState.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                {buttonState.variant === "secondary" && (
                  <div className="w-3 h-3 rounded-full bg-green-500 shrink-0"></div>
                )}
                <span>{buttonState.text}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: floating help widget (bottom right) */}
      <button
        type="button"
        onClick={() => setShowHowItWorksModal(true)}
        className="fixed bottom-5 right-5 z-40 md:hidden flex items-center justify-center w-12 h-12 rounded-full bg-blue-500 text-white shadow-lg hover:bg-blue-600 active:scale-95 transition-colors"
        aria-label={dict.navbar?.howItWorks ?? "How it works"}
        title={dict.navbar?.howItWorks ?? "How it works"}
      >
        <HelpCircle className="w-6 h-6" />
      </button>

      {/* How It Works Modal */}
      <HowItWorksModal
        isOpen={showHowItWorksModal}
        onClose={() => setShowHowItWorksModal(false)}
      />


      {/* Disconnect Confirmation Modal */}
      <input
        type="checkbox"
        id="disconnect-modal"
        className="modal-toggle"
        checked={showDisconnectModal}
        onChange={(e) => setShowDisconnectModal(e.target.checked)}
      />
      <div className="modal" role="dialog">
        <div className="modal-box bg-white">
          <h3 className="font-bold text-lg text-gray-900 mb-4">
            {dict.wallet?.disconnectConfirmTitle ?? "Log out?"}
          </h3>
          <p className="py-4 text-gray-700">
            {dict.wallet?.disconnectConfirmMessage ?? "Are you sure you want to log out?"}
          </p>
          <div className="modal-action">
            <button
              className="btn btn-ghost"
              onClick={() => setShowDisconnectModal(false)}
            >
              {dict.wallet?.disconnectCancel ?? "Cancel"}
            </button>
            <button
              className="btn bg-[#00C805] hover:bg-[#00A804] text-white border-none"
              onClick={handleDisconnectConfirm}
            >
              {dict.wallet?.disconnectConfirm ?? "Log out"}
            </button>
          </div>
        </div>
        <label className="modal-backdrop" htmlFor="disconnect-modal" onClick={() => setShowDisconnectModal(false)}>
          Close
        </label>
      </div>

      <PayoutModal
        isOpen={isPayoutModalOpen}
        onClose={() => setIsPayoutModalOpen(false)}
        wallet={safeAddress}
      />

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSearch={handleSearch}
        results={searchResults}
        placeholder={dict.navbar.searchPlaceholder ?? "Search markets..."}
        isSearching={isSearching}
      />

      {/* Connect Wallet UI Modal */}
      <ConnectWalletUI
        isOpen={showWalletUI}
        onClose={() => setShowWalletUI(false)}
      />
    </>
  );
}
