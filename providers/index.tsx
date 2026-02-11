"use client";

import { ReactNode } from "react";
import QueryProvider from "./QueryProvider";
import { WalletProvider } from "./WalletProvider";
import TradingProvider from "./TradingProvider";
import { DictionaryProvider } from "./dictionary-provider";
import { NavigationLoadingProvider } from "./NavigationLoadingProvider";
import { PaymentModalProvider } from "./PaymentModalContext";
import { CurrencyProvider } from "./CurrencyContext";
import NavigationLoader from "@/components/shared/NavigationLoader";
import HeyoEmbedScript from "@/components/shared/HeyoEmbedScript";
import ToastProvider from "./ToastProvider";
import esDict from "@/app/[lang]/dictionaries/es.json";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <DictionaryProvider dict={esDict} locale="es">
      <NavigationLoadingProvider>
        <WalletProvider>
          <ToastProvider>
            <QueryProvider>
              <CurrencyProvider>
                <TradingProvider>
                  <PaymentModalProvider>
                    <NavigationLoader />
                    <HeyoEmbedScript />
                    {children}
                  </PaymentModalProvider>
                </TradingProvider>
              </CurrencyProvider>
            </QueryProvider>
          </ToastProvider>
        </WalletProvider>
      </NavigationLoadingProvider>
    </DictionaryProvider>
  );
}
