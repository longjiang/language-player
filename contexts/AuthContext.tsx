// @/src/context/AuthContext.tsx

import React, { createContext, useState, useEffect, useContext } from 'react';
import { verifyEmailCode } from "@/src/api/python/verify-email";
import {
  login as apiLogin,
  checkToken as apiCheckToken,
  fetchUserInfo,
  registerUser as apiRegisterUser,
  User,
} from "@/src/api/directus/user";
import { useLanguage } from "@/contexts/LanguageContext";
import { storageManager } from "./StorageManager";

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
            await storageManager.initialize();
            const token = storageManager.getAuthToken();
            if (token) {
                const isValid = await apiCheckToken(token);
                if (isValid) {
                    setIsAuthenticated(true);
                    setUserInfo(storageManager.getUserInfo());
                } else {
                    await storageManager.clearAll();
                }
            }
            setLoading(false);
        };

        initializeAuth();
    }, []);

    const handleLogin = async (email: string, password: string) => {
        setLoading(true);
        try {
            const token = await apiLogin(email, password);
            await storageManager.setAuthToken(token);
            const userData = await fetchUserInfo(token);
            await storageManager.setUserInfo(userData);
            setUserInfo(userData);
            setIsAuthenticated(true);
            return token;
        } catch (error) {
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await storageManager.clearAll();
        setUserInfo(null);
        setIsAuthenticated(false);
        return true;
    };

    const handleVerify = async (email: string, code: string) => {
      await verifyEmailCode(email, code);
      const password = await storageManager.getAuthToken();
      if (!password) throw new Error(t('error.failed_retrieve_password'));
      const token = await handleLogin(email, password);
      return token;
    }

    const handleRegister = async (firstName: string, lastName: string, email: string, password: string) => {
        setLoading(true);
        try {
            const token = await apiRegisterUser(firstName, lastName, email, password);
            
            if (token) {
                await storageManager.setAuthToken(token);
                const userData = await fetchUserInfo(token);
                await storageManager.setUserInfo(userData);
                setUserInfo(userData);
                setIsAuthenticated(true);
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

    const getStoredUserInfo = async (): Promise<User | null> => {
        return storageManager.getUserInfo();
    };

    const getStoredAuthToken = async (): Promise<string | null> => {
        return storageManager.getAuthToken();
    }

    return (
        <AuthContext.Provider value={{ isAuthenticated, loading, userInfo, handleLogin, handleLogout, handleRegister, handleVerify, getStoredUserInfo, getStoredAuthToken }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => useContext(AuthContext);