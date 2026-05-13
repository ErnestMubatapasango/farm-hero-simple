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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      crop_yield_history: {
        Row: {
          created_at: string
          crop: string
          farmer_id: string
          id: string
          organization_id: string
          revenue_usd: number | null
          updated_at: string
          year: number
          yield_kg: number | null
        }
        Insert: {
          created_at?: string
          crop: string
          farmer_id: string
          id?: string
          organization_id: string
          revenue_usd?: number | null
          updated_at?: string
          year: number
          yield_kg?: number | null
        }
        Update: {
          created_at?: string
          crop?: string
          farmer_id?: string
          id?: string
          organization_id?: string
          revenue_usd?: number | null
          updated_at?: string
          year?: number
          yield_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crop_yield_history_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
        ]
      }
      farmer_crops: {
        Row: {
          created_at: string
          crop: string
          farmer_id: string
          farming_method: string | null
          id: string
          organization_id: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          crop: string
          farmer_id: string
          farming_method?: string | null
          id?: string
          organization_id: string
          position: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          crop?: string
          farmer_id?: string
          farming_method?: string | null
          id?: string
          organization_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "farmer_crops_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
        ]
      }
      farmers: {
        Row: {
          annual_income: number | null
          bank_name: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          enrolled_by: string
          farm_name: string | null
          farm_size_hectares: number | null
          farming_type: string | null
          first_name: string
          gender: string | null
          has_bank_account: boolean | null
          id: string
          last_name: string
          mobile_money_provider: string | null
          national_id: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          primary_crops: string[] | null
          primary_livestock: string[] | null
          region: string | null
          status: string
          sub_county: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          village: string | null
          ward: string | null
        }
        Insert: {
          annual_income?: number | null
          bank_name?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          enrolled_by: string
          farm_name?: string | null
          farm_size_hectares?: number | null
          farming_type?: string | null
          first_name: string
          gender?: string | null
          has_bank_account?: boolean | null
          id?: string
          last_name: string
          mobile_money_provider?: string | null
          national_id?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          primary_crops?: string[] | null
          primary_livestock?: string[] | null
          region?: string | null
          status?: string
          sub_county?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          village?: string | null
          ward?: string | null
        }
        Update: {
          annual_income?: number | null
          bank_name?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          enrolled_by?: string
          farm_name?: string | null
          farm_size_hectares?: number | null
          farming_type?: string | null
          first_name?: string
          gender?: string | null
          has_bank_account?: boolean | null
          id?: string
          last_name?: string
          mobile_money_provider?: string | null
          national_id?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          primary_crops?: string[] | null
          primary_livestock?: string[] | null
          region?: string | null
          status?: string
          sub_county?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          village?: string | null
          ward?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "farmers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          invited_by: string
          invited_user_id: string | null
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          invited_by: string
          invited_user_id?: string | null
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          status?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          invited_by?: string
          invited_user_id?: string | null
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          slug: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          slug?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          slug?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string
          organization_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          organization_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          organization_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_my_invitation:
        | {
            Args: never
            Returns: {
              accepted_at: string | null
              created_at: string
              email: string
              full_name: string | null
              id: string
              invited_by: string
              invited_user_id: string | null
              organization_id: string
              revoked_at: string | null
              revoked_by: string | null
              role: Database["public"]["Enums"]["app_role"]
              status: string
            }
            SetofOptions: {
              from: "*"
              to: "invitations"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { _full_name?: string }
            Returns: {
              accepted_at: string | null
              created_at: string
              email: string
              full_name: string | null
              id: string
              invited_by: string
              invited_user_id: string | null
              organization_id: string
              revoked_at: string | null
              revoked_by: string | null
              role: Database["public"]["Enums"]["app_role"]
              status: string
            }
            SetofOptions: {
              from: "*"
              to: "invitations"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _org_id: string
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
      revoke_invitation: {
        Args: { _invitation_id: string }
        Returns: {
          accepted_at: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          invited_by: string
          invited_user_id: string | null
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "developer" | "super_admin" | "admin" | "enumerator"
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
    Enums: {
      app_role: ["developer", "super_admin", "admin", "enumerator"],
    },
  },
} as const
