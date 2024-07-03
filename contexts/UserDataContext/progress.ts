import { UserData } from '.';
import { patchUserData } from '@/src/api/directus/user-data';

export interface Progress {
  [langCode: string]: {
    level: string;
    time: number; // milliseconds
  };
}

export const getProgress = (progress: Progress, langCode: string) => {
  return progress[langCode];
};

export const updateProgress = async (
  progress: Progress,
  setProgress: React.Dispatch<React.SetStateAction<Progress>>,
  userData: UserData | null,
  langCode: string,
  newProgress: { level: string; time: number },
  getStoredAuthToken: () => Promise<string | null>
): Promise<void> => {
  if (!userData) throw new Error('Cannot update progress when user data is not initialized');
  if (!progress) throw new Error('Cannot update progress when progress is not initialized');

  const updatedProgress: Progress = {
    ...progress,
    [langCode]: newProgress,
  };

  setProgress(updatedProgress);
  try {
    const authToken = await getStoredAuthToken();
    if (!authToken) throw new Error('No auth token found');
    await patchUserData(Number(userData.id), { progress: JSON.stringify(updatedProgress) }, authToken);
  } catch (error) {
    console.error('Error updating user data:', error);
  }
};
