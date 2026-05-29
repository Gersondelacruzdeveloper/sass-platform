// frontend/src/modules/disco/api/posApi.ts

import axios from "../../../api/axios"

export const getProducts = async () => {
  const response = await axios.get("/disco/products/")
  return response.data
}

export const createSale = async (payload: any) => {
  const response = await axios.post(
    "/disco/sales/",
    payload
  )

  return response.data
}