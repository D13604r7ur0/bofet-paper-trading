 "use client";

  import { useState, useRef, useEffect } from "react";
  import { createPortal } from "react-dom";
  import { Gift } from "lucide-react";
  import useClaimPMT from "@/hooks/useClaimPMT";

  interface ClaimPMTButtonProps {
      address: string;
  }

  export default function ClaimPMTButton({ address }: ClaimPMTButtonProps) {
      const { claimPMT, isClaiming, error, txHash } = useClaimPMT();
      const [isOpen, setIsOpen] = useState(false);
      const [position, setPosition] = useState({ top: 0, right: 0 });
      const buttonRef = useRef<HTMLButtonElement>(null);
      const dropdownRef = useRef<HTMLDivElement>(null);
      const [isMounted, setIsMounted] = useState(false);

      useEffect(() => {
          setIsMounted(true);
      }, []);

      // Calcular posición al abrir
      useEffect(() => {
          if (isOpen && buttonRef.current) {
              const rect = buttonRef.current.getBoundingClientRect();
              setPosition({
                  top: rect.bottom + 8,
                  right: window.innerWidth - rect.right,
              });
          }
      }, [isOpen]);

      // Cerrar al hacer clic afuera (solo si no está claiming)
      useEffect(() => {
          function handleClickOutside(event: MouseEvent) {
              if (
                  !isClaiming &&
                  dropdownRef.current &&
                  !dropdownRef.current.contains(event.target as Node) &&
                  buttonRef.current &&
                  !buttonRef.current.contains(event.target as Node)
              ) {
                  setIsOpen(false);
              }
          }

          if (isOpen) {
              document.addEventListener("mousedown", handleClickOutside);
              return () => document.removeEventListener("mousedown", handleClickOutside);
          }
      }, [isOpen, isClaiming]);

      const handleClose = () => {
          if (!isClaiming) {
              setIsOpen(false);
          }
      };

      return (
          <>
              {/* Botón verde estilo WithdrawDropdown */}
              <button
                  ref={buttonRef}
                  onClick={() => setIsOpen(!isOpen)}
                  className="btn bg-purple-600 hover:bg-purple-700 text-white border-none btn-sm gap-1.5 cursor-pointer"
              >
                  <Gift className="w-4 h-4" />
                  <span className="hidden xl:inline">Recibir PMT</span>
              </button>

              {/* Dropdown Portal */}
              {isMounted && isOpen && createPortal(
                  <div
                      ref={dropdownRef}
                      className="fixed w-80 bg-white shadow-xl border border-gray-200 z-[9999] rounded-box"
                      style={{
                          top: `${position.top}px`,
                          right: `${position.right}px`,
                      }}
                  >
                      <div className="p-6">
                          {/* Header */}
                          <div className="flex items-center justify-between mb-4">
                              <h3 className="text-sm font-semibold text-gray-700">
                                  Recibir tokens PMT
                              </h3>
                              <button
                                  onClick={handleClose}
                                  disabled={isClaiming}
                                  className="btn btn-ghost btn-sm btn-circle"
                                  title={isClaiming ? "Procesando..." : "Cerrar"}
                              >
                                  ✕
                              </button>
                          </div>

                          {/* Info */}
                          <p className="text-xs text-gray-500 mb-6 leading-relaxed">
                              Recibe 10 PMT para practicar paper trading. Los tokens son de prueba en Base Sepolia y no tienen valor real.
                          </p>

                          {/* Resultado exitoso */}
                          {txHash && (
                              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                                  <p className="text-sm font-medium text-green-800">
                                      10 PMT recibidos!
                                  </p>
                              </div>
                          )}

                          {/* Botón de acción */}
                          <button
                              type="button"
                              onClick={async () => {
                                  try {
                                      await claimPMT(address);
                                  } catch {
                                      // error handled in hook
                                  }
                              }}
                              disabled={isClaiming}
                              className={`w-full btn ${
                                  txHash
                                      ? "bg-green-100 hover:bg-green-200 text-green-800 border-green-200"
                                      : "bg-purple-600 hover:bg-purple-700 text-white border-none"
                              } ${isClaiming ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                          >
                              <Gift className="w-4 h-4" />
                              {isClaiming
                                  ? "Enviando PMT..."
                                  : txHash
                                      ? "Recibir más PMT"
                                      : "Recibir 10 PMT"}
                          </button>

                          {/* Error */}
                          {error && (
                              <p className="text-xs text-red-500 text-center mt-3">{error}</p>
                          )}

                          {/* Warning cuando está procesando */}
                          {isClaiming && (
                              <p className="text-xs text-orange-600 mt-3 text-center">
                                  Por favor espera...
                              </p>
                          )}
                      </div>
                  </div>,
                  document.body
              )}
          </>
      );
  }