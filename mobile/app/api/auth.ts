// app/api/auth.ts
import { BASE_URL } from "@/constants/baseUrl";
import axios from "axios";

export type LoginData = {
  username: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  code: number;
  user: {
    id: number;
    username: string;
  };
};

export const login = async (data: LoginData): Promise<LoginResponse> => {
  const url = `${BASE_URL}/login`;
  console.log("[login] sending request:", url, { username: data.username });
  try {
    const response = await axios.post(url, data);
    console.log("[login] response:", response.status, response.data);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // Server replied with an error status
        console.log("[login] server error:", error.response.status, error.response.data);
      } else if (error.request) {
        // Request was sent but no response came back
        console.log("[login] no response from server:", error.code, error.message);
      } else {
        console.log("[login] request was not sent:", error.message);
      }
    } else {
      console.log("[login] unexpected error:", error);
    }
    throw error;
  }
};
