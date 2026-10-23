export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string
          id: string
          ip_address: string | null
          payload: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity: string
          entity_id: string
          id?: string
          ip_address?: string | null
          payload?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string
          id?: string
          ip_address?: string | null
          payload?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_items: {
        Row: {
          bom_id: string
          id: string
          quantity: number
          raw_material_id: string
          waste_tolerance_pct: number
        }
        Insert: {
          bom_id: string
          id?: string
          quantity: number
          raw_material_id: string
          waste_tolerance_pct?: number
        }
        Update: {
          bom_id?: string
          id?: string
          quantity?: number
          raw_material_id?: string
          waste_tolerance_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "bom_items_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "boms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_items_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      boms: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          product_id: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          product_id: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          product_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "boms_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address: string | null
          brand_name: string
          company_name: string
          created_at: string
          currency: string
          email: string | null
          id: string
          phone: string | null
          tin_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          brand_name?: string
          company_name?: string
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          phone?: string | null
          tin_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          brand_name?: string
          company_name?: string
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          phone?: string | null
          tin_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          outstanding_balance: number
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          outstanding_balance?: number
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          outstanding_balance?: number
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      employee_permissions: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          permission_key: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          permission_key: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          permission_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          expense_date: string
          id: string
          payment_method: string
          receipt_url: string | null
          recorded_by: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          payment_method: string
          receipt_url?: string | null
          recorded_by?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          payment_method?: string
          receipt_url?: string | null
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipt_items: {
        Row: {
          id: string
          product_id: string
          purchase_item_id: string
          receipt_id: string
          received_quantity: number
        }
        Insert: {
          id?: string
          product_id: string
          purchase_item_id: string
          receipt_id: string
          received_quantity: number
        }
        Update: {
          id?: string
          product_id?: string
          purchase_item_id?: string
          receipt_id?: string
          received_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          id: string
          location_id: string
          notes: string | null
          purchase_id: string
          receipt_number: string
          received_at: string
          received_by: string | null
        }
        Insert: {
          id?: string
          location_id: string
          notes?: string | null
          purchase_id: string
          receipt_number: string
          received_at?: string
          received_by?: string | null
        }
        Update: {
          id?: string
          location_id?: string
          notes?: string | null
          purchase_id?: string
          receipt_number?: string
          received_at?: string
          received_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          movement_type: string
          notes: string | null
          product_id: string
          quantity: number
          reference_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          movement_type: string
          notes?: string | null
          product_id: string
          quantity: number
          reference_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          movement_type?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          reference_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          type: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          type: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          type?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          payment_method: string
          received_by: string | null
          reference_id: string
          reference_type: string
          transaction_reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_method: string
          received_by?: string | null
          reference_id: string
          reference_type: string
          transaction_reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string
          received_by?: string | null
          reference_id?: string
          reference_type?: string
          transaction_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_material_issues: {
        Row: {
          id: string
          issued_at: string
          issued_by: string | null
          production_order_id: string
          quantity: number
          raw_material_id: string
          total_cost: number
          unit_cost: number
        }
        Insert: {
          id?: string
          issued_at?: string
          issued_by?: string | null
          production_order_id: string
          quantity: number
          raw_material_id: string
          total_cost?: number
          unit_cost?: number
        }
        Update: {
          id?: string
          issued_at?: string
          issued_by?: string | null
          production_order_id?: string
          quantity?: number
          raw_material_id?: string
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_material_issues_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_material_issues_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_material_issues_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          bom_id: string
          completed_at: string | null
          completed_quantity: number
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          labor_cost: number
          location_id: string
          notes: string | null
          order_number: string
          product_id: string
          progress_pct: number
          status: string
          target_quantity: number
          total_material_cost: number
          waste_quantity: number
        }
        Insert: {
          bom_id: string
          completed_at?: string | null
          completed_quantity?: number
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          labor_cost?: number
          location_id: string
          notes?: string | null
          order_number: string
          product_id: string
          progress_pct?: number
          status: string
          target_quantity: number
          total_material_cost?: number
          waste_quantity?: number
        }
        Update: {
          bom_id?: string
          completed_at?: string | null
          completed_quantity?: number
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          labor_cost?: number
          location_id?: string
          notes?: string | null
          order_number?: string
          product_id?: string
          progress_pct?: number
          status?: string
          target_quantity?: number
          total_material_cost?: number
          waste_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "boms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          attributes: Json | null
          category_id: string | null
          cost_price: number
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          min_stock_level: number
          name: string
          selling_price: number
          sku: string
          type: string
          unit_of_measure: string
          updated_at: string
        }
        Insert: {
          attributes?: Json | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          min_stock_level?: number
          name: string
          selling_price?: number
          sku: string
          type: string
          unit_of_measure: string
          updated_at?: string
        }
        Update: {
          attributes?: Json | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          min_stock_level?: number
          name?: string
          selling_price?: number
          sku?: string
          type?: string
          unit_of_measure?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          id: string
          ordered_quantity: number
          product_id: string
          purchase_id: string
          received_quantity: number
          total_cost: number
          unit_cost: number
        }
        Insert: {
          id?: string
          ordered_quantity: number
          product_id: string
          purchase_id: string
          received_quantity?: number
          total_cost: number
          unit_cost: number
        }
        Update: {
          id?: string
          ordered_quantity?: number
          product_id?: string
          purchase_id?: string
          received_quantity?: number
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          balance_due: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          paid_amount: number
          purchase_number: string
          status: string
          supplier_id: string
          total_cost: number
        }
        Insert: {
          balance_due?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number
          purchase_number: string
          status: string
          supplier_id: string
          total_cost: number
        }
        Update: {
          balance_due?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number
          purchase_number?: string
          status?: string
          supplier_id?: string
          total_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          cost_price: number
          id: string
          product_id: string
          quantity: number
          sale_id: string
          total_price: number
          unit_price: number
        }
        Insert: {
          cost_price?: number
          id?: string
          product_id: string
          quantity: number
          sale_id: string
          total_price: number
          unit_price: number
        }
        Update: {
          cost_price?: number
          id?: string
          product_id?: string
          quantity?: number
          sale_id?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          balance_due: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          discount_amount: number
          id: string
          invoice_number: string
          location_id: string
          notes: string | null
          paid_amount: number
          status: string
          subtotal: number
          total_amount: number
        }
        Insert: {
          balance_due?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount_amount?: number
          id?: string
          invoice_number: string
          location_id: string
          notes?: string | null
          paid_amount?: number
          status: string
          subtotal: number
          total_amount: number
        }
        Update: {
          balance_due?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount_amount?: number
          id?: string
          invoice_number?: string
          location_id?: string
          notes?: string | null
          paid_amount?: number
          status?: string
          subtotal?: number
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_levels: {
        Row: {
          location_id: string
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          location_id: string
          product_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          location_id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_levels_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_levels_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          outstanding_balance: number
          phone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          outstanding_balance?: number
          phone: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          outstanding_balance?: number
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          phone?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      confirm_goods_receipt: {
        Args: {
          p_items: Json
          p_location_id: string
          p_notes?: string
          p_purchase_id: string
          p_receipt_number: string
          p_user_id?: string
        }
        Returns: Json
      }
      execute_sale_checkout: {
        Args: {
          p_customer_id: string
          p_discount_amount: number
          p_invoice_number: string
          p_items: Json
          p_location_id: string
          p_notes?: string
          p_paid_amount: number
          p_payment_method: string
          p_subtotal: number
          p_total_amount: number
          p_user_id?: string
        }
        Returns: Json
      }
      record_stock_adjustment: {
        Args: {
          p_location_id: string
          p_new_quantity: number
          p_product_id: string
          p_reason: string
          p_user_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
