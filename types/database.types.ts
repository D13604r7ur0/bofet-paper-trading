export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      "AUDIENCE-INSTA-1": {
        Row: {
          dimension: string | null
          metric: string | null
          report_date: string | null
          section: string | null
          source: string | null
          value: string | null
          value_pct: string | null
        }
        Insert: {
          dimension?: string | null
          metric?: string | null
          report_date?: string | null
          section?: string | null
          source?: string | null
          value?: string | null
          value_pct?: string | null
        }
        Update: {
          dimension?: string | null
          metric?: string | null
          report_date?: string | null
          section?: string | null
          source?: string | null
          value?: string | null
          value_pct?: string | null
        }
        Relationships: []
      }
      paper_positions: {
        Row: {
          closed_at: string | null
          cost: number
          created_at: string | null
          entry_price: number
          exit_price: number | null
          id: string
          market_image: string | null
          market_slug: string | null
          market_title: string
          outcome: string
          realized_pnl: number
          shares: number
          status: string
          token_id: string
          updated_at: string | null
          user_address: string
        }
        Insert: {
          closed_at?: string | null
          cost: number
          created_at?: string | null
          entry_price: number
          exit_price?: number | null
          id?: string
          market_image?: string | null
          market_slug?: string | null
          market_title: string
          outcome: string
          realized_pnl?: number
          shares?: number
          status?: string
          token_id: string
          updated_at?: string | null
          user_address: string
        }
        Update: {
          closed_at?: string | null
          cost?: number
          created_at?: string | null
          entry_price?: number
          exit_price?: number | null
          id?: string
          market_image?: string | null
          market_slug?: string | null
          market_title?: string
          outcome?: string
          realized_pnl?: number
          shares?: number
          status?: string
          token_id?: string
          updated_at?: string | null
          user_address?: string
        }
        Relationships: []
      }
      paper_trades: {
        Row: {
          created_at: string | null
          id: string
          position_id: string | null
          price: number
          shares: number
          side: string
          token_id: string
          total: number
          user_address: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          position_id?: string | null
          price: number
          shares: number
          side: string
          token_id: string
          total: number
          user_address: string
        }
        Update: {
          created_at?: string | null
          id?: string
          position_id?: string | null
          price?: number
          shares?: number
          side?: string
          token_id?: string
          total?: number
          user_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_trades_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "paper_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      pmt_claims: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          tx_hash: string | null
          user_address: string
        }
        Insert: {
          amount?: number
          created_at?: string | null
          id?: string
          tx_hash?: string | null
          user_address: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          tx_hash?: string | null
          user_address?: string
        }
        Relationships: []
      }
      "RESUMEN ACTIVIDAD INSTAGRAM 2026": {
        Row: {
          Subtipo: string | null
          Tipo: string | null
          Valor: string | null
        }
        Insert: {
          Subtipo?: string | null
          Tipo?: string | null
          Valor?: string | null
        }
        Update: {
          Subtipo?: string | null
          Tipo?: string | null
          Valor?: string | null
        }
        Relationships: []
      }
      "RESUMEN ACTIVIDAD TIKTOK 26 DE ENERO": {
        Row: {
          "Post time": string | null
          Time: string | null
          "Total comments": number | null
          "Total likes": number | null
          "Total shares": number | null
          "Total views": number | null
        }
        Insert: {
          "Post time"?: string | null
          Time?: string | null
          "Total comments"?: number | null
          "Total likes"?: number | null
          "Total shares"?: number | null
          "Total views"?: number | null
        }
        Update: {
          "Post time"?: string | null
          Time?: string | null
          "Total comments"?: number | null
          "Total likes"?: number | null
          "Total shares"?: number | null
          "Total views"?: number | null
        }
        Relationships: []
      }
      "TIKTOK RESUMEN TOTAL": {
        Row: {
          Comments: number | null
          Date: string
          Likes: number | null
          "Profile Views": number | null
          Shares: number | null
          "Video Views": number | null
        }
        Insert: {
          Comments?: number | null
          Date: string
          Likes?: number | null
          "Profile Views"?: number | null
          Shares?: number | null
          "Video Views"?: number | null
        }
        Update: {
          Comments?: number | null
          Date?: string
          Likes?: number | null
          "Profile Views"?: number | null
          Shares?: number | null
          "Video Views"?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
