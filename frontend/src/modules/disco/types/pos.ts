// frontend/src/modules/disco/types/pos.ts

export interface Product {
  id: number
  name: string
  sale_price: string
  stock: number
  image?: string
  category?: number
  is_low_stock: boolean
  price: string
}

export interface CartItem {
  product: Product
  quantity: number
}

export interface SalePayload {
  payment_method: string
  sale_type: string
  customer_name?: string
  table_number?: string
  items: {
    product_id: number
    quantity: number
  }[]
}