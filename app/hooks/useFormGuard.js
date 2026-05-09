import { useState, useEffect } from 'react';

export const useFormGuard = (currentData, storageKey) => {
  const [lastSavedData, setLastSavedData] = useState(JSON.stringify(currentData));

  // Fungsi Simpan Draft
  const saveDraft = () => {
    localStorage.setItem(storageKey, JSON.stringify(currentData));
    setLastSavedData(JSON.stringify(currentData));
    return true;
  };

  // Cek apakah data sudah berubah dibandingkan draft terakhir
  const isDirty = JSON.stringify(currentData) !== lastSavedData;

  return { isDirty, saveDraft };
};