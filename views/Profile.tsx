"use client";

import { useState } from "react";
import Link from "next/link";
import { useTrading } from "@/providers/TradingProvider";
import { useWallet } from "@/providers/WalletContext";
import useUserPositions from "@/hooks/useUserPositions";
import useAddressCopy from "@/hooks/useAddressCopy";
import useSafeDeployment from "@/hooks/useSafeDeployment";
import useMemberSince from "@/hooks/useMemberSince";
import { formatAddress } from "@/utils/formatting";
import getMagic from "@/lib/magic";
import { ChevronRight, User, Shield, FileText, Trophy, TrendingUp, Send, Copy, CheckCircle2, Circle, Loader2, Wallet, KeyRound } from "lucide-react";
import TransferModal from "@/components/PolygonAssets/TransferModal";
import FundSafeSection from "@/components/FundSafeSection";
import TradingSession from "@/components/TradingSession";
import { useDictionary } from "@/providers/dictionary-provider";
import ConvertUsdceSection from "@/components/Profile/ConvertUsdceSection";
import ClaimPMTButton from "@/components/Navbar/ClaimPMTButton";
import UserAvatar from "@/components/Avatar/UserAvatar";
import AvatarStyleSelector from "@/components/Avatar/AvatarStyleSelector";
import useAvatarStyle from "@/hooks/useAvatarStyle";

const isDev = process.env.NODE_ENV === "development";

export default function Profile() {
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isAvatarSelectorOpen, setIsAvatarSelectorOpen] = useState(false);

  const [eoaPkLoading, setEoaPkLoading] = useState(false);
  const [eoaPkError, setEoaPkError] = useState<string | null>(null);
  const {
    safeAddress,
    eoaAddress,
    tradingSession,
    currentStep,
    isTradingSessionComplete,
    sessionError,
    initializeTradingSession,
    endTradingSession,
  } = useTrading();
  const { disconnect, userEmail } = useWallet();
  const { dict, locale } = useDictionary();

  // Use avatar style hook to force re-render when style changes
  const { avatarStyle } = useAvatarStyle();
  const { derivedSafeAddressFromEoa } = useSafeDeployment(eoaAddress);
  const { copied: copiedSafe, copyAddress: copySafeAddress } = useAddressCopy(
    safeAddress || null
  );
  const { copied: copiedEoa, copyAddress: copyEoaAddress } = useAddressCopy(
    eoaAddress || null
  );

  // Fetch member since date
  const { data: memberSinceDate } = useMemberSince(derivedSafeAddressFromEoa);
  

  
  // Fetch real positions to calculate stats
  const { data: positions = [], isLoading } = useUserPositions(safeAddress);

  // Calculate stats from real positions
  const totalPnL = positions.reduce((sum, pos) => sum + pos.cashPnl, 0);
  const totalInitial = positions.reduce((sum, pos) => sum + pos.initialValue, 0);
  const roiPercent = totalInitial > 0 ? (totalPnL / totalInitial) * 100 : 0;
  const isPositive = roiPercent >= 0;

  // Count "winning" positions (positive PnL)
  const winningPositions = positions.filter((pos) => pos.cashPnl > 0).length;

  // Format member since date
  const formatMemberSince = (dateString: string | null | undefined): string => {
    if (!dateString) return "";
    
    try {
      const date = new Date(dateString);
      const dateLocale = locale === "es" ? "es-ES" : "en-US";
      const options: Intl.DateTimeFormatOptions = { 
        year: "numeric", 
        month: "long" 
      };
      
      // Localize the "Member since" text
      const memberSinceText = locale === "es" 
        ? "Miembro desde" 
        : "Member since";
      
      return `${memberSinceText} ${date.toLocaleDateString(dateLocale, options)}`;
    } catch {
      return "";
    }
  };

  const getStatusText = () => {
    if (isTradingSessionComplete) {
      return dict.trading?.session?.ready ?? "Ready to Trade";
    }
    switch (currentStep) {
      case "idle":
        return dict.trading?.session?.notStarted ?? "Not Started";
      case "checking":
        return dict.trading?.session?.checking ?? "Checking...";
      case "deploying":
        return dict.trading?.session?.deploying ?? "Deploying Safe...";
      case "credentials":
        return dict.trading?.session?.credentials ?? "Creating Credentials...";
      case "approvals":
        return dict.trading?.session?.approvals ?? "Setting Approvals...";
      case "complete":
        return dict.trading?.session?.ready ?? "Ready to Trade";
      default:
        return dict.trading?.session?.notStarted ?? "Not Started";
    }
  };

  const getStatusIcon = () => {
    if (isTradingSessionComplete) {
      return <CheckCircle2 className="w-4 h-4 text-green-600" />;
    }
    if (currentStep !== "idle" && currentStep !== "complete") {
      return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
    }
    return <Circle className="w-4 h-4 text-gray-400" />;
  };


  const handleRevealEoaPrivateKey = async () => {
    setEoaPkError(null);
    setEoaPkLoading(true);
    try {
      const magic = getMagic();
      await magic.user.revealEVMPrivateKey();
    } catch (err) {
      setEoaPkError(err instanceof Error ? err.message : "Failed to reveal private key");
    } finally {
      setEoaPkLoading(false);
    }
  };

  const settingsItems = [
    {
      icon: User,
      title: dict.profile?.personalInformation ?? "Personal Information",
      desc: dict.profile?.personalInformationDesc ?? "Verify your profile and KYC",
    },
    {
      icon: Shield,
      title: dict.profile?.security ?? "Security",
      desc: dict.profile?.securityDesc ?? "2FA and password changes",
    },
    {
      icon: FileText,
      title: dict.profile?.statements ?? "Statements",
      desc: dict.profile?.statementsDesc ?? "Tax history and monthly reports",
    },
  ];

  // Not connected state
  if (!eoaAddress) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="text-center space-y-6">
          <UserAvatar size={80} className="mx-auto" />
          <h2 className="text-2xl font-bold text-slate-900">{dict.profile?.title ?? "Profile"}</h2>
          <p className="text-slate-500">{dict.profile?.connectToView ?? "Connect wallet to view your profile"}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href={`/${locale || "es"}/signin`}
              className="w-full sm:w-auto bg-[#00C805] hover:bg-[#00A804] text-white font-semibold px-6 py-3 rounded-full text-sm transition-colors"
            >
              {dict.wallet?.connect ?? "Log in"}
            </Link>
            <Link
              href="/"
              className="w-full sm:w-auto border-2 border-neutral-900 text-neutral-900 hover:bg-neutral-100 font-semibold px-6 py-3 rounded-full text-sm transition-colors dark:border-white dark:text-white dark:hover:bg-white/10"
            >
              {dict.navbar?.markets ?? "Markets"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-12">
      {/* Profile Header */}
      <header className="mb-8 sm:mb-12">
        {/* Mobile Layout */}
        <div className="sm:hidden">
          <div className="flex flex-col items-center text-center mb-4">
            <button
              onClick={() => setIsAvatarSelectorOpen(true)}
              className="mb-3 cursor-pointer hover:opacity-80 transition-opacity relative group"
              title="Click para cambiar tu avatar"
            >
              <UserAvatar
                seed={userEmail || eoaAddress || undefined}
                size={80}
                style={avatarStyle}
              />
              <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-semibold">✏️</span>
              </div>
            </button>
            <h1 className="text-xl font-bold text-slate-900 break-words max-w-full px-2">
              {userEmail || formatAddress(eoaAddress || "")}
            </h1>
          </div>

          {safeAddress && (
            <div
              onClick={copySafeAddress}
              className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-2 cursor-pointer active:bg-gray-100 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500 font-mono truncate flex-1">
                  {safeAddress}
                </p>
                {copiedSafe ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-400 shrink-0" />
                )}
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                {dict.profile?.copySafe ?? "Tap to copy"}
              </p>
            </div>
          )}

          {memberSinceDate && (
            <p className="text-xs text-center text-slate-400 mb-2">
              {formatMemberSince(memberSinceDate)}
            </p>
          )}

          <div className="flex items-center justify-center gap-1 text-xs text-gray-600">
            <Wallet className="w-3 h-3" />
            <span>{dict.wallet?.connected ?? "Connected"}</span>
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden sm:flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setIsAvatarSelectorOpen(true)}
              className="cursor-pointer hover:opacity-80 transition-opacity relative group"
              title="Click para cambiar tu avatar"
            >
              <UserAvatar
                seed={userEmail || eoaAddress || undefined}
                size={96}
                style={avatarStyle}
              />
              <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                <span className="opacity-0 group-hover:opacity-100 text-white text-2xl">✏️</span>
              </div>
            </button>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                {userEmail || formatAddress(eoaAddress || "")}
              </h1>
              {safeAddress && (
                <p
                  onClick={copySafeAddress}
                  className="text-slate-500 font-mono cursor-pointer hover:text-slate-700 transition-colors flex items-center gap-2 mt-1"
                  title={dict.profile?.copySafe ?? "Click to copy Safe address"}
                >
                  {safeAddress}
                  {copiedSafe ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4 text-slate-400" />
                  )}
                </p>
              )}
              {memberSinceDate && (
                <p className="text-xs text-slate-400 mt-1">
                  {formatMemberSince(memberSinceDate)}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <Wallet className="w-3 h-3" />
            <span>{dict.wallet?.connected ?? "Connected"}</span>
          </div>
        </div>
      </header>

      {/* Send Funds Section */}
      {/* <div className="bg-white p-6 rounded-[28px] border border-slate-200 mb-8">
        <h2 className="text-lg font-bold text-slate-900 mb-4">
          {dict.profile?.sendFunds ?? "Send Funds"}
        </h2>
        
        <button 
          onClick={() => setIsTransferModalOpen(true)}
          className="w-full bg-[#00C805] hover:bg-[#00A804] text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all"
        >
          <Send className="w-5 h-5" />
          {dict.profile?.sendUsdc ?? "Send USDC"}
        </button>
      </div> */}

      {/* Fund Safe Section — Convert USDC → USDC.e at EOA, then transfer to Safe */}
      {/* <FundSafeSection /> */}

      {/* Trading Session Section */}
      {/* {eoaAddress && (
        <div className="mb-8">
          <TradingSession
            session={tradingSession}
            currentStep={currentStep}
            error={sessionError}
            isComplete={isTradingSessionComplete}
            initialize={initializeTradingSession}
            endSession={endTradingSession}
          />
        </div>
      )} */}

      {/* Convert USDC.e to USDC Section */}
      <ConvertUsdceSection />

      {/* Wallet Info Section */}
      <div className="bg-white p-6 rounded-[28px] border border-slate-200 mb-8">
        <h2 className="text-lg font-bold text-slate-900 mb-4">
          {dict.profile?.walletInformation ?? "Wallet Information"}
        </h2>

        {/* Session Status */}
        {tradingSession && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-slate-50 rounded-lg">
            {getStatusIcon()}
            <span className="text-slate-700">{getStatusText()}</span>
          </div>
        )}

        {/* Addresses with copy */}
        {/* <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-slate-500">{dict.profile?.eoa ?? "EOA:"}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-slate-900">{formatAddress(eoaAddress || "")}</span>
              <button 
                onClick={copyEoaAddress} 
                className="p-1 hover:bg-slate-100 rounded transition-colors"
                title={dict.profile?.copyEoa ?? "Copy EOA address"}
              >
                {copiedEoa ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4 text-slate-500" />
                )}
              </button>
            </div>
          </div>
          {derivedSafeAddressFromEoa && (
            <div className="flex justify-between items-center">
              <span className="text-slate-500">{dict.profile?.safe ?? "Safe:"}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-slate-900">{formatAddress(derivedSafeAddressFromEoa)}</span>
                <button 
                  onClick={copySafeAddress} 
                  className="p-1 hover:bg-slate-100 rounded transition-colors"
                  title={dict.profile?.copySafe ?? "Copy Safe address"}
                >
                  {copiedSafe ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4 text-slate-500" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div> */}

        {/* Session Details */}
        {/* {tradingSession && (
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">{dict.profile?.deployed ?? "Deployed:"}</span>
              <span className="text-slate-900">
                {tradingSession.isSafeDeployed ? dict.common?.yes ?? "Yes" : dict.common?.no ?? "No"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">{dict.profile?.credentials ?? "Credentials:"}</span>
              <span className="text-slate-900">
                {tradingSession.hasApiCredentials ? dict.common?.set ?? "Set" : dict.common?.notSet ?? "Not Set"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">{dict.profile?.approvals ?? "Approvals:"}</span>
              <span className="text-slate-900">
                {tradingSession.hasApprovals ? dict.common?.set ?? "Set" : dict.common?.notSet ?? "Not Set"}
              </span>
            </div>
          </div>
        )} */}
      </div>

      {/* Recibir PMT / Paper trading tokens */}
      <div className="bg-white p-6 rounded-[28px] border border-slate-200 mb-8">
        <h2 className="text-lg font-bold text-slate-900 mb-2">
          {locale === "es" ? "Recibir PMT" : "Paper trading tokens"}
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          {locale === "es"
            ? "Recibe 10 PMT para practicar paper trading. Los tokens son de prueba en Base Sepolia y no tienen valor real."
            : "Receive 10 PMT to practice paper trading. Tokens are for testing on Base Sepolia and have no real value."}
        </p>
        <ClaimPMTButton address={eoaAddress!} />
      </div>

      {/* [DEV] EOA Private Key - only in development */}
      {/* {isDev && (
        <div className="bg-amber-50 border border-amber-200 p-6 rounded-[28px] mb-8">
          <h2 className="text-lg font-bold text-amber-900 mb-2 flex items-center gap-2">
            <KeyRound className="w-5 h-5" />
            [DEV] EOA Private Key
          </h2>
          <p className="text-sm text-amber-800 mb-4">
            Opens Magic&apos;s secure modal so you can view and copy your EOA private key via <code className="bg-amber-100 px-1 rounded">magic.user.revealEVMPrivateKey()</code>. Only you can see the key in the modal.
          </p>
          <button
            type="button"
            onClick={handleRevealEoaPrivateKey}
            disabled={eoaPkLoading}
            className="btn btn-warning btn-sm gap-2"
          >
            {eoaPkLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Opening...
              </>
            ) : (
              "Reveal EOA private key"
            )}
          </button>
          {eoaPkError && (
            <p className="mt-3 text-sm text-red-600">{eoaPkError}</p>
          )}
        </div>
      )} */}

      {/* Stats Cards */}
      {/* <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">

        <div className="bg-white p-8 rounded-[32px] border border-slate-200 transition-all group">
          <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center mb-6">
            <Trophy className="w-6 h-6 text-[#00C805]" />
          </div>
          {isLoading ? (
            <div className="animate-pulse h-10 w-16 bg-slate-200 rounded"></div>
          ) : (
            <>
              <div className="text-4xl font-bold text-slate-900 mb-1 tracking-tight">{winningPositions}</div>
              <div className="text-slate-500 font-medium text-sm uppercase tracking-wide">
                {dict.profile?.predictionsWon ?? "PREDICTIONS WON"}
              </div>
            </>
          )}
        </div>


        <div className="bg-white p-8 rounded-[32px] border border-slate-200 transition-all group">
          <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center mb-6">
            <TrendingUp className="w-6 h-6 text-[#00C805]" />
          </div>
          {isLoading ? (
            <div className="animate-pulse h-10 w-24 bg-slate-200 rounded"></div>
          ) : (
            <>
              <div className={`text-4xl font-bold mb-1 tracking-tight ${isPositive ? "text-[#00C805]" : "text-red-500"}`}>
                {isPositive ? "+" : ""}{roiPercent.toFixed(1)}%
              </div>
              <div className="text-slate-500 font-medium text-sm uppercase tracking-wide">
                {dict.profile?.totalRoi ?? "TOTAL ROI"}
              </div>
            </>
          )}
        </div>
      </div> */}

      {/* Account Settings */}

        {/* <h2 className="text-slate-400 uppercase tracking-widest text-[11px] font-bold mb-6 ml-1">
          {dict.profile?.accountSettings ?? "ACCOUNT SETTINGS"}
        </h2>
        
        {settingsItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.title}
              className="w-full bg-white p-6 rounded-[28px] flex items-center justify-between border border-slate-200 hover:border-[#00C805] transition-all group"
            >
              <div className="flex items-center space-x-5 text-left">
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center">
                  <Icon className="w-5 h-5 text-slate-500" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">{item.title}</h3>
                  <p className="text-sm text-slate-500 mt-0.5">{item.desc}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-[#00C805] transition-colors" />
            </button>
          );
        })} */}

        {/* Disconnect Button */}
        


      <div className="space-y-4">
      <div className="pt-8">
          <button
            onClick={disconnect}
            className="w-full bg-red-50 text-red-600 font-bold py-3 px-6 rounded-xl border border-red-200 hover:bg-red-100 transition-all"
          >
            {dict.wallet?.disconnect ?? "Disconnect"}
          </button>
        </div>
      </div>

      {/* Transfer Modal */}
      {/* <TransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        allowTokenSelect
      /> */}

      {/* Avatar Style Selector Modal */}
      <input
        type="checkbox"
        id="avatar-selector-modal"
        className="modal-toggle"
        checked={isAvatarSelectorOpen}
        onChange={(e) => setIsAvatarSelectorOpen(e.target.checked)}
      />
      <div className="modal" role="dialog">
        <div className="modal-box bg-white max-w-2xl w-full h-dvh sm:h-auto sm:max-h-[80vh] m-0 sm:m-4 rounded-none sm:rounded-2xl p-6 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0">
            <AvatarStyleSelector seed={userEmail || eoaAddress || "default"} />
          </div>
          <div className="pt-4 shrink-0">
            <button
              className="btn bg-[#00C805] hover:bg-[#00A804] text-white border-none w-full sm:w-auto"
              onClick={() => setIsAvatarSelectorOpen(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
        <label
          className="modal-backdrop hidden sm:block"
          htmlFor="avatar-selector-modal"
          onClick={() => setIsAvatarSelectorOpen(false)}
        >
          Close
        </label>
      </div>
    </div>
  );
}
