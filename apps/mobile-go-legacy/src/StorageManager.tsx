// @/src/StorageManager.ts

import { secureStorage } from '@/src/storage';
import { User } from "@/src/api/directus/user";
import { UserData } from "@/contexts/UserDataContext";

export interface StorageData {
  authToken: string | null;
  userInfo: User | null;
  userData: UserData | null;
  tempPassword: string | null;
}

class StorageManager {
  private static instance: StorageManager;
  private storageData: StorageData = {
    authToken: null,
    userInfo: null,
    userData: null,
    tempPassword: null,
  };

  private constructor() {}

  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  async initialize(): Promise<void> {
    const authToken = await secureStorage.getItemAsync('authToken');
    const userInfoString = await secureStorage.getItemAsync('userInfo');
    const tempPassword = await secureStorage.getItemAsync('tempPassword');

    this.storageData = {
      ...this.storageData,
      authToken,
      userInfo: userInfoString ? JSON.parse(userInfoString) : null,
      tempPassword,
    };
  }

  async setAuthToken(token: string | null): Promise<void> {
    this.storageData.authToken = token;
    if (token) {
      await secureStorage.setItemAsync('authToken', token);
    } else {
      await secureStorage.deleteItemAsync('authToken');
    }
  }

  async setUserInfo(userInfo: User | null): Promise<void> {
    this.storageData.userInfo = userInfo;
    if (userInfo) {
      await secureStorage.setItemAsync('userInfo', JSON.stringify(userInfo));
    } else {
      await secureStorage.deleteItemAsync('userInfo');
    }
  }

  setUserData(userData: UserData | null): void {
    this.storageData.userData = userData;
  }

  async setTempPassword(password: string): Promise<void> {
    this.storageData.tempPassword = password;
    await secureStorage.setItemAsync('tempPassword', password);
  }

  getAuthToken(): string | null {
    return this.storageData.authToken;
  }

  getUserInfo(): User | null {
    return this.storageData.userInfo;
  }

  getUserData(): UserData | null {
    return this.storageData.userData;
  }

  async getTempPassword(): Promise<string | null> {
    if (!this.storageData.tempPassword) {
      const tempPassword = await secureStorage.getItemAsync('tempPassword');
      this.storageData.tempPassword = tempPassword;
    }
    return this.storageData.tempPassword;
  }

  async clearTempPassword(): Promise<void> {
    this.storageData.tempPassword = null;
    await secureStorage.deleteItemAsync('tempPassword');
  }

  async clearAll(): Promise<void> {
    this.storageData = {
      authToken: null,
      userInfo: null,
      userData: null,
      tempPassword: null,
    };
    await secureStorage.deleteItemAsync('authToken');
    await secureStorage.deleteItemAsync('userInfo');
    await secureStorage.deleteItemAsync('tempPassword');
  }

  // New methods for managing time
  async setTime(time: number): Promise<void> {
    await secureStorage.setItemAsync('userProgressTime', time.toString());
  }

  async getTime(): Promise<number> {
    const storedTime = await secureStorage.getItemAsync('userProgressTime');
    return storedTime ? parseInt(storedTime, 10) : 0;
  }

  async resetTime(): Promise<void> {
    await secureStorage.setItemAsync('userProgressTime', '0');
  }
}

export const storageManager = StorageManager.getInstance();
