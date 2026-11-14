import { createContext } from "react";

interface GlobalContextType {
    isLogged: boolean;
    setIsLogged: React.Dispatch<React.SetStateAction<boolean>>;
    user: any;
    setUser: React.Dispatch<React.SetStateAction<any>>;
    loading: boolean;
    token: string | null;
}

export const GlobalContext = createContext<GlobalContextType | undefined>(undefined);