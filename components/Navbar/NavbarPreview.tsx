"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Search, Menu, X, Info, HelpCircle } from "lucide-react";
import { useWallet } from "@/providers/WalletContext";
import { useDictionary } from "@/providers/dictionary-provider";
import { useNavigationLoading } from "@/providers/NavigationLoadingProvider";
import HowItWorksModal from "@/components/HowItWorksModal";


export default function NavbarPreview() {
  const { connect } = useWallet();
  const { dict, locale } = useDictionary();
  const { startLoading } = useNavigationLoading();
  const [showHowItWorksModal, setShowHowItWorksModal] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleConnectClick = async () => {
    // Track signup goal
    if (typeof window !== 'undefined' && (window as any).datafast) {
      (window as any).datafast('signup');
    }
    // Start loading animation before navigation
    startLoading();
    await connect();
  };

  return (
    <>
      <div className="drawer drawer-end">
        {/* Input checkbox that controls the drawer */}
        <input
          id="mobile-drawer-preview"
          type="checkbox"
          className="drawer-toggle"
          checked={isMobileMenuOpen}
          onChange={(e) => setIsMobileMenuOpen(e.target.checked)}
        />

        {/* Main content: Navbar */}
        <div className="drawer-content">
          <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 overflow-x-auto md:overflow-x-hidden">
            <div className="w-full max-w-7xl mx-auto px-6">
              <div className="flex justify-between h-16 items-center w-full">
                {/* Left side: Brand and Search */}
                <div className="flex items-center gap-4 md:gap-6">
                  {/* Logo */}
                  <div className="flex items-center gap-2 cursor-pointer">
                    <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#00C805]">
                      <img src="/boget_logo_white.svg" alt={dict.wallet?.logoAlt ?? "UseBofet Logo"} className="w-6 h-6 object-contain" />
                    </div>
                    <span className="font-bold text-xl tracking-tight text-slate-900">useBofet.com</span>
                  </div>

                  {/* Search Button - Styled as input, triggers connect on click */}
                  <button
                    type="button"
                    onClick={handleConnectClick}
                    className="relative hidden sm:flex items-center pl-10 pr-8 py-2 bg-slate-100 border-none rounded-full text-sm w-48 sm:w-52 md:w-60 lg:w-72 xl:w-80 hover:ring-2 hover:ring-[#00C805]/20 text-slate-400 transition-all cursor-pointer"
                  >
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <span>{dict.navbar?.searchPlaceholder ?? "Search markets..."}</span>
                    {/* "/" keyboard shortcut indicator */}
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">
                      /
                    </span>
                  </button>
                </div>

                {/* Right side: Actions */}
                <div className="flex items-center gap-1 sm:gap-2 md:gap-4">
                  

                  {/* How it works - outline blue, always show text + icon */}
                  <button
                    onClick={() => setShowHowItWorksModal(true)}
                    className="flex items-center gap-1 sm:gap-1.5 border border-blue-500 text-blue-500 hover:bg-blue-50 hover:text-blue-600 font-medium px-1.5 py-1 sm:px-2.5 sm:py-1.5 rounded-full text-[10px] sm:text-xs transition-colors shrink-0"
                    aria-label={dict.navbar?.howItWorks ?? "How it works"}
                    title={dict.navbar?.howItWorks ?? "How it works"}
                  >
                    <Info className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                    <span>{dict.navbar?.howItWorks ?? "Cómo funciona"}</span>
                  </button>
                  {/* Search Icon - Mobile only */}
                  <button
                    onClick={handleConnectClick}
                    className="sm:hidden btn btn-ghost btn-circle btn-sm"
                    aria-label="Buscar"
                    title="Buscar"
                  >
                    <Search className="w-4 h-4" />
                  </button>

                  {/* Regístrate (outline) + Connect Wallet Button */}
                  <div className="md:flex items-center gap-1 sm:gap-2 shrink-0 hidden">
                    <button
                      type="button"
                      onClick={handleConnectClick}
                      aria-label={dict.wallet?.connect ?? "Connect Wallet"}
                      className="bg-[#00C805] hover:bg-[#00A804] text-white font-semibold px-4 py-2 rounded-full text-sm transition-colors"
                    >
                      <span>{dict.wallet?.connect ?? "Connect Wallet"}</span>
                    </button>
                    {/* DO NOT DELETE we will use this button later
                    <Link
                      href={`/${locale || "es"}/register`}
                      className="border-2 border-neutral-900 text-neutral-900 hover:bg-neutral-100 font-semibold px-4 py-2 rounded-full text-sm transition-colors dark:border-white dark:text-white dark:hover:bg-white/10"
                      aria-label={dict.signin?.signUp ?? "Sign up"}
                    >
                      {dict.signin?.signUp ?? "Sign up"}
                    </Link>
                    */}
                  </div>

                  {/* Hamburger Menu Button */}
                  <label
                    htmlFor="mobile-drawer-preview"
                    className="btn btn-ghost btn-circle btn-sm"
                    aria-label="Toggle menu"
                  >
                    <Menu className="w-5 h-5" />
                  </label>
                </div>
              </div>
            </div>
          </nav>
        </div>

        {/* Drawer Side - Mobile sidebar menu */}
        <div className="drawer-side z-60">
          {/* Dark overlay */}
          <label htmlFor="mobile-drawer-preview" aria-label="close sidebar" className="drawer-overlay"></label>

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
              <label htmlFor="mobile-drawer-preview" className="btn btn-ghost btn-circle btn-sm">
                <X className="w-5 h-5" />
              </label>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Drawer footer - Actions */}
            <div className="p-4 border-t border-slate-200 space-y-3 mt-auto">
              {/* How it works button - outline blue, icon + text */}
              <button
                onClick={() => {
                  setShowHowItWorksModal(true);
                  setIsMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 border border-blue-500 text-blue-500 hover:bg-blue-50 hover:text-blue-600 font-medium px-4 py-2.5 rounded-full text-sm transition-colors"
              >
                <Info className="w-4 h-4 shrink-0" />
                <span>{dict.navbar?.howItWorks ?? "Cómo funciona"}</span>
              </button>

           

              {/* Connect Wallet Button */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleConnectClick();
                }}
                aria-label={dict.wallet?.connect ?? "Connect Wallet"}
                className="w-full bg-[#00C805] hover:bg-[#00A804] text-white font-semibold px-4 py-3 rounded-full text-sm transition-colors"
              >
                <span>{dict.wallet?.connect ?? "Connect Wallet"}</span>
              </button>
                 {/* DO NOT DELETE we will use this button later - Regístrate (outline) - same destination as sign in
                 <Link
                href={`/${locale || "es"}/register`}
                className="w-full block text-center border-2 border-neutral-900 text-neutral-900 hover:bg-neutral-100 font-semibold px-4 py-3 rounded-full text-sm transition-colors dark:border-white dark:text-white dark:hover:bg-white/10"
                aria-label={dict.signin?.signUp ?? "Sign up"}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {dict.signin?.signUp ?? "Sign up"}
              </Link>
              */}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: floating help widget (bottom right) */}
      <button
        type="button"
        onClick={() => setShowHowItWorksModal(true)}
        className="fixed bottom-5 right-5 z-40 md:hidden flex items-center justify-center w-12 h-12 rounded-full bg-blue-500 text-white shadow-lg hover:bg-blue-600 active:scale-95 transition-colors"
        aria-label={dict.navbar?.howItWorks ?? "Cómo funciona"}
        title={dict.navbar?.howItWorks ?? "How it works"}
      >
        <HelpCircle className="w-6 h-6" />
      </button>

      {/* How It Works Modal */}
      <HowItWorksModal
        isOpen={showHowItWorksModal}
        onClose={() => setShowHowItWorksModal(false)}
      />
    </>
  );
}
