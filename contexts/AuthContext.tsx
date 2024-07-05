// @/src/context/AuthContext.tsx
import React, { createContext, useState, useEffect, useContext } from 'react';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { verifyEmailCode } from "@/src/api/python/verify-email";
import {
  login as apiLogin,
  checkToken as apiCheckToken,
  fetchUserInfo,
  registerUser as apiRegisterUser,
  User,
} from "@/src/api/directus/user";
import { useLanguage } from "@/contexts/LanguageContext";

type AuthContextType = {
  isAuthenticated: boolean;
  loading: boolean;
  userInfo: User | null;
  handleLogin: (email: string, password: string) => Promise<void>;
  handleLogout: () => Promise<void>;
  handleRegister: (firstName: string, lastName: string, email: string, password: string) => Promise<void>;
  handleVerify: (email: string, code: string) => Promise<void>;
  getStoredUserInfo: () => Promise<User | null>;
  getStoredAuthToken: () => Promise<string | null>;
}


const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  loading: true,
  userInfo: null,
  handleLogin: async () => { },
  handleLogout: async () => { },
  handleRegister: async () => { },
  getStoredUserInfo: async () => null,
  getStoredAuthToken: async () => null,
  handleVerify: async () => { },
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [userInfo, setUserInfo] = useState<User | null>(null);
    const { t } = useLanguage();

    useEffect(() => {
        const initializeAuth = async () => {
            const token = await SecureStore.getItemAsync('authToken');
            if (token) {
                const isValid = await apiCheckToken(token);
                if (isValid) {
                    setIsAuthenticated(true);
                    await fetchAndStoreUserInfo(token);
                } else {
                    await SecureStore.deleteItemAsync('authToken');
                }
            }
            setLoading(false);
        };

        initializeAuth();
    }, []);

    const fetchAndStoreUserInfo = async (token: string) => {
        const data = await fetchUserInfo(token);
        await SecureStore.setItemAsync('userInfo', JSON.stringify(data));
        setUserInfo(data);
    };

    const getStoredUserInfo = async (): Promise<User | null> => {
        const userInfo = await SecureStore.getItemAsync('userInfo');
        return userInfo ? JSON.parse(userInfo) : null;
    };

    const getStoredAuthToken = async (): Promise<string | null> => {
        const token = await SecureStore.getItemAsync('authToken');
        return token;
    }

    const handleLogin = async (email: string, password: string) => {
        setLoading(true);
        try {
            const token = await apiLogin(email, password);
            await SecureStore.setItemAsync('authToken', token);
            await fetchAndStoreUserInfo(token);
            setIsAuthenticated(true);
            setLoading(false);
            return token;
        } catch (error) {
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await SecureStore.deleteItemAsync('authToken');
        await SecureStore.deleteItemAsync('userInfo');
        setUserInfo(null);
        setIsAuthenticated(false);
        return true;
    };

    const handleVerify = async (email: string, code: string) => {
      await verifyEmailCode(email, code);
      const password = await SecureStore.getItemAsync('user_password');
      if (!password) throw new Error(t('error.failed_retrieve_password'));
      const token = await handleLogin(email, password);
      await SecureStore.deleteItemAsync('user_password');
      return token;
    }

    const handleRegister = async (firstName: string, lastName: string, email: string, password: string) => {
        setLoading(true);
        try {
            // This function should now return the token upon successful registration
            const token = await apiRegisterUser(firstName, lastName, email, password);
            
            if (token) {
                await SecureStore.setItemAsync('authToken', token);
                await fetchAndStoreUserInfo(token);
                setIsAuthenticated(true);
                setLoading(false);
                return token;
            } else {
                throw new Error("Failed to obtain token after registration");
            }
        } catch (error) {
            console.error("Registration failed: ", error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, loading, userInfo, handleLogin, handleLogout, handleRegister, handleVerify, getStoredUserInfo, getStoredAuthToken }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => useContext(AuthContext);
