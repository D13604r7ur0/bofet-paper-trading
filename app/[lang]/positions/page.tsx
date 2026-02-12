 "use client";                                                                                                                                                                                                            
                                                                                                                                                                                                                           
  import Navbar from "@/components/Navbar";                                                                                                                                                                                
  import PaperUserPositions from "@/components/Trading/Positions/PaperUserPositions";                                                                                                                                      
  import Footer from "@/components/Footer";
  import { useWallet } from "@/providers/WalletContext";
  import { useDictionary } from "@/providers/dictionary-provider";
  import { useRouter } from "next/navigation";

  export default function PositionsPage() {
    const { eoaAddress } = useWallet();
    const { dict } = useDictionary();
    const router = useRouter();

    if (!eoaAddress) {
      return (
        <div className="min-h-dvh flex flex-col">
          <Navbar />
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="card bg-base-100 border border-base-300 shadow-xl max-w-md w-full">
              <div className="card-body text-center">
                <div className="flex justify-center mb-4">
                  <svg
                    className="w-16 h-16 text-warning"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <h2 className="card-title justify-center text-2xl">
                  {dict.trading?.positions?.authRequired ?? "Authentication Required"}
                </h2>
                <p className="text-base-content/70">
                  {dict.trading?.positions?.pleaseSignIn ?? "Please sign in to view your positions."}
                </p>
                <div className="card-actions justify-center mt-4">
                  <button
                    onClick={() => router.push("/")}
                    className="btn btn-primary btn-wide"
                  >
                    {dict.common?.goHome ?? "Go to Home"}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <Footer />
        </div>
      );
    }

    return (
      <div className="min-h-dvh flex flex-col bg-base-200">
        <Navbar />

        {/* Hero Section */}
        <div className="bg-gradient-to-br from-primary/10 via-base-100 to-secondary/10 border-b border-base-300">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <div className="flex items-center gap-4 mb-2">
              <div className="avatar placeholder">
                <div className="bg-primary text-primary-content rounded-full w-12">
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-bold">
                  {dict.trading?.positions?.myPositions ?? "My Positions"}
                </h1>
                <p className="text-base-content/70 mt-1">
                  {dict.trading?.positions?.subtitle ?? "Gestiona tus posiciones en USDC"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 px-6 py-6">
          <div className="max-w-7xl mx-auto">
            <PaperUserPositions />
          </div>
        </div>

        <Footer />
      </div>
    );
  }
/*
"use client";

import Navbar from "@/components/Navbar";
import UserPositions from "@/components/Trading/Positions";
import Footer from "@/components/Footer";
import { useTrading } from "@/providers/TradingProvider";
import { useDictionary } from "@/providers/dictionary-provider";
import { useRouter } from "next/navigation";

export default function PositionsPage() {
  const { isTradingSessionComplete, eoaAddress } = useTrading();
  const { dict } = useDictionary();
  const router = useRouter();

  // Redirect to home if not authenticated or trading session not complete
  if (!eoaAddress || !isTradingSessionComplete) {
    return (
      <div className="min-h-dvh flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="card bg-base-100 border border-base-300 shadow-xl max-w-md w-full">
            <div className="card-body text-center">
              <div className="flex justify-center mb-4">
                <svg
                  className="w-16 h-16 text-warning"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <h2 className="card-title justify-center text-2xl">
                {dict.trading?.positions?.authRequired ?? "Authentication Required"}
              </h2>
              <p className="text-base-content/70">
                {dict.trading?.positions?.pleaseSignIn ?? "Please sign in and initialize your trading session to view positions."}
              </p>
              <div className="card-actions justify-center mt-4">
                <button
                  onClick={() => router.push("/")}
                  className="btn btn-primary btn-wide"
                >
                  {dict.common?.goHome ?? "Go to Home"}
                </button>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-base-200">
      <Navbar />

      {/* Hero Section 
      <div className="bg-gradient-to-br from-primary/10 via-base-100 to-secondary/10 border-b border-base-300">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center gap-4 mb-2">
            <div className="avatar placeholder">
              <div className="bg-primary text-primary-content rounded-full w-12">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold">
                {dict.trading?.positions?.myPositions ?? "My Positions"}
              </h1>
              <p className="text-base-content/70 mt-1">
                {dict.trading?.positions?.subtitle ?? "Manage and track your active market positions"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content *
      <div className="flex-1 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <UserPositions />
        </div>
      </div>

      <Footer />
    </div>
  );
}
*/