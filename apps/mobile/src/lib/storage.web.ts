// The web preview only: expo-secure-store has no web version, so localStorage.
export const getItem = (key: string) => localStorage.getItem(key)
export const setItem = (key: string, value: string) =>
  localStorage.setItem(key, value)
export const getItemAsync = async (key: string) => getItem(key)
export const setItemAsync = async (key: string, value: string) =>
  setItem(key, value)
export const deleteItemAsync = async (key: string) =>
  localStorage.removeItem(key)
