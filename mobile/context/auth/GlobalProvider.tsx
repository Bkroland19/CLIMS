import React, {
	ReactNode,
	createContext,
	useContext,
	useEffect,
	useState,
	Dispatch,
	SetStateAction,
} from "react";
import * as SecureStore from "expo-secure-store";

interface GlobalContextType {
	isLogged: boolean;
	setIsLogged: Dispatch<SetStateAction<boolean>>;
	user: any;
	setUser: Dispatch<SetStateAction<any>>;
	loading: boolean;
	setLoading: Dispatch<SetStateAction<boolean>>;
}

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

export const useGlobalContext = () => {
	const context = useContext(GlobalContext);
	if (!context) {
		throw new Error(
			"useGlobalContext must be used within a GlobalProvider"
		);
	}
	return context;
};

interface GlobalProviderProps {
	children: ReactNode;
}

const GlobalProvider: React.FC<GlobalProviderProps> = ({ children }) => {
	const [isLogged, setIsLogged] = useState(false);
	const [user, setUser] = useState<any>(null);
	const [loading, setLoading] = useState(true);

	// Function to load user data from SecureStore
	const loadUserData = async () => {
		try {
			const userData = await SecureStore.getItemAsync("user");
			if (userData) {
				const parsedUser = JSON.parse(userData);
				setUser(parsedUser);
				setIsLogged(true);
			}
		} catch (error) {
			console.error("Failed to load user data:", error);
		} finally {
			setLoading(false); // Loading finished
		}
	};

	// Function to save user data to SecureStore
	const saveUserData = async (user: any) => {
		try {
			await SecureStore.setItemAsync("user", JSON.stringify(user));
		} catch (error) {
			console.error("Failed to save user data:", error);
		}
	};

	// Load user data on component mount
	useEffect(() => {
		loadUserData();
	}, []);

	// Save user data whenever it changes
	useEffect(() => {
		if (user) {
			saveUserData(user);
		}
	}, [user]);

	const value: GlobalContextType = {
		isLogged,
		setIsLogged,
		user,
		setUser,
		loading,
		setLoading,
	};

	return (
		<GlobalContext.Provider value={value}>
			{!loading && children}
		</GlobalContext.Provider>
	);
};

export default GlobalProvider;
