"use client";

  import { useCallback } from "react";
  import { useQuery, useQueryClient } from "@tanstack/react-query";
  import { supabase } from "@/lib/supabase";
  import type { Database } from "@/types/database.types";

  type PositionRow = Database["public"]["Tables"]["paper_positions"]["Row"];

  export interface PaperPosition {
    id: string;
    tokenId: string;
    outcome: "yes" | "no";
    status: "open" | "closed_sold" | "won" | "lost";
    shares: number;
    entryPrice: number;
    cost: number;
    exitPrice: number | null;
    realizedPnl: number;
    marketTitle: string;
    marketImage: string;
    marketSlug: string | null;
    createdAt: string;
    closedAt: string | null;
  }

  function mapRow(row: PositionRow): PaperPosition {
    return {
      id: row.id,
      tokenId: row.token_id,
      outcome: row.outcome as "yes" | "no",
      status: row.status as PaperPosition["status"],
      shares: Number(row.shares),
      entryPrice: Number(row.entry_price),
      cost: Number(row.cost),
      exitPrice: row.exit_price ? Number(row.exit_price) : null,
      realizedPnl: Number(row.realized_pnl),
      marketTitle: row.market_title,
      marketImage: row.market_image ?? "",
      marketSlug: row.market_slug ?? null,
      createdAt: row.created_at ?? "",
      closedAt: row.closed_at ?? null,
    };
  }

  export default function usePaperPositions(
    userAddress: string | null | undefined
  ) {
    const queryClient = useQueryClient();
    const addr = userAddress?.toLowerCase() ?? null;

    const {
      data: positions = [],
      isLoading,
      error,
    } = useQuery({
      queryKey: ["paperPositions", addr],
      queryFn: async (): Promise<PaperPosition[]> => {
        if (!addr) return [];

        const { data, error } = await supabase
          .from("paper_positions")
          .select("*")
          .eq("user_address", addr)
          .order("created_at", { ascending: false });

        if (error) throw error;
        return (data ?? []).map(mapRow);
      },
      enabled: !!addr,
      refetchInterval: 10_000,
    });

    const invalidate = useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["paperPositions", addr] });
    }, [queryClient, addr]);

    // ---- BUY: crear o aumentar posición + registrar trade ----
    const addPosition = useCallback(
      async (position: {
        tokenId: string;
        outcome: "yes" | "no";
        shares: number;
        entryPrice: number;
        marketTitle: string;
        marketImage: string;
        marketSlug?: string;
      }) => {
        if (!addr) return;

        const newCost = position.shares * position.entryPrice;

        // Consultar directamente a Supabase (no al cache) para evitar datos stale
        const { data: existingRows } = await supabase
          .from("paper_positions")
          .select("id, shares, cost, entry_price")
          .eq("user_address", addr)
          .eq("token_id", position.tokenId)
          .eq("status", "open")
          .limit(1);

        const existingRow = existingRows?.[0] ?? null;

        let positionId: string;

        if (existingRow) {
          const totalShares = Number(existingRow.shares) + position.shares;
          const totalCost = Number(existingRow.cost) + newCost;

          const { error } = await supabase
            .from("paper_positions")
            .update({
              shares: totalShares,
              cost: totalCost,
              entry_price: totalCost / totalShares,
            })
            .eq("id", existingRow.id);

          if (error) throw new Error(error.message);
          positionId = existingRow.id;
        } else {
          const { data, error } = await supabase
            .from("paper_positions")
            .insert({
              user_address: addr,
              token_id: position.tokenId,
              outcome: position.outcome,
              status: "open",
              shares: position.shares,
              entry_price: position.entryPrice,
              cost: newCost,
              realized_pnl: 0,
              market_title: position.marketTitle,
              market_image: position.marketImage,
              market_slug: position.marketSlug ?? null,
            })
            .select("id")
            .single();

          if (error) throw new Error(error.message);
          positionId = data.id;
        }

        // Registrar trade
        const { error: tradeError } = await supabase.from("paper_trades").insert({
          user_address: addr,
          position_id: positionId,
          token_id: position.tokenId,
          side: "buy",
          shares: position.shares,
          price: position.entryPrice,
          total: newCost,
        });

        if (tradeError) throw new Error(tradeError.message);

        invalidate();
        return positionId;
      },
      [addr, invalidate]
    );

    // ---- SELL: reducir o cerrar posición + registrar trade ----
    const reducePosition = useCallback(
      async (tokenId: string, sharesToSell: number, sellPrice: number) => {
        if (!addr) return;

        // Consultar directamente a Supabase para datos frescos
        const { data: existingRows } = await supabase
          .from("paper_positions")
          .select("id, shares, cost, entry_price, realized_pnl")
          .eq("user_address", addr)
          .eq("token_id", tokenId)
          .eq("status", "open")
          .limit(1);

        const existing = existingRows?.[0];
        if (!existing) return;

        const entryPrice = Number(existing.entry_price);
        const currentShares = Number(existing.shares);
        const currentPnl = Number(existing.realized_pnl);

        const pnl = (sellPrice - entryPrice) * sharesToSell;
        const newShares = currentShares - sharesToSell;
        const sellTotal = sharesToSell * sellPrice;

        if (newShares <= 0.001) {
          const { error } = await supabase
            .from("paper_positions")
            .update({
              shares: 0,
              cost: 0,
              status: "closed_sold",
              exit_price: sellPrice,
              realized_pnl: currentPnl + pnl,
              closed_at: new Date().toISOString(),
            })
            .eq("id", existing.id);

          if (error) throw new Error(error.message);
        } else {
          const { error } = await supabase
            .from("paper_positions")
            .update({
              shares: newShares,
              cost: newShares * entryPrice,
              realized_pnl: currentPnl + pnl,
            })
            .eq("id", existing.id);

          if (error) throw new Error(error.message);
        }

        const { error: tradeError } = await supabase.from("paper_trades").insert({
          user_address: addr,
          position_id: existing.id,
          token_id: tokenId,
          side: "sell",
          shares: sharesToSell,
          price: sellPrice,
          total: sellTotal,
        });

        if (tradeError) throw new Error(tradeError.message);

        invalidate();
      },
      [addr, invalidate]
    );

    const openPositions = positions.filter((p) => p.status === "open");
    const closedPositions = positions.filter((p) => p.status !== "open");
    const totalLocked = openPositions.reduce((sum, p) => sum + p.cost, 0);
    const totalRealizedPnl = positions.reduce((sum, p) => sum + p.realizedPnl, 0);

    const getPositionByToken = useCallback(
      (tokenId: string) =>
        positions.find((p) => p.tokenId === tokenId && p.status === "open") ??
        null,
      [positions]
    );

    return {
      positions,
      openPositions,
      closedPositions,
      addPosition,
      reducePosition,
      totalLocked,
      totalRealizedPnl,
      getPositionByToken,
      isLoading,
      error,
    };
  }