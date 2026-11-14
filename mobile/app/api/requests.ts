import { BASE_URL } from "@/constants/baseUrl";
import axios from "axios";

export const addStock = async (formData: FormData): Promise<any> => {
    const response = await axios.post(`${BASE_URL}/hotspots/registerStock`, formData, {
        headers: {
            "Content-Type": "multipart/form-data",
        },
    });
    return response.data;
};

export const getCondoms = async (): Promise<any> => {
    const response = await axios.get(`${BASE_URL}/condoms`);
    return response.data;
};

export const getHotSpotStock = async (id: number): Promise<any> => {
    const response = await axios.get(`${BASE_URL}/hotspots/${id}/stockHistory`);
    return response.data;
};

export const getCurrentStock = async (id: number): Promise<any> => {
    const response = await axios.get(`${BASE_URL}/hotspots/${id}/currentStock`);
    return response.data;
};

export const sendNotification = async (): Promise<any> => {
    const response = await axios.post(`${BASE_URL}/sendstockoutNotification`);
    return response.data;
}

export const addHotSpot = async (formData: any): Promise<any> => {
    const response = await axios.post(`${BASE_URL}/hotSpots`, formData);
    return response.data;
}

export const getUserHotSpots = async (userId: any): Promise<any> => {
    const response = await axios.post(`${BASE_URL}/hotSpots/getHotspotsByUser`, { user_id: userId });
    return response.data;
}

export const getUsers = async (): Promise<any> => {
    const response = await axios.get(`${BASE_URL}/users`);
    return response.data;
}

export const getHotspots = async (): Promise<any> => {
    const response = await axios.get(`${BASE_URL}/hotSpots`);
    return response.data;
}


export const getRegions = async () => {
    try {
        const { data } = await axios.get(
            `${BASE_URL}/regions`
        );
        return data || [];
    } catch (error: any) {
        return []; // Return empty array instead of undefined
    }
};


export const getDistricts = async (regionId: string) => {
    if (!regionId) {
        return [];
    }

    try {
        const { data } = await axios.get(
            `${BASE_URL}/districts/${regionId}`
        );
        return data || [];
    } catch (error: any) {
        // If the main API fails, try the fallback URL
        try {
            const { data } = await axios.get(
                `https://codezoneug.com/clims_backend/clims/public/api/districts/${regionId}`
            );
            return data || [];
        } catch (fallbackError: any) {
            return []; // Return empty array instead of undefined
        }
    }
};