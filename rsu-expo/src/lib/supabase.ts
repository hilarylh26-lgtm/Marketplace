import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

export const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://nwlbwjeoaqpjyjkohpcr.supabase.co';

export const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53bGJ3amVvYXFwanlqa29ocGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwNTA2NDgsImV4cCI6MjA5MTYyNjY0OH0.VGWqD-K38HBDLQZYGW7mKb12qroON9zW6X5G0j6e_Nc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getAuthStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

function getAuthStorage() {
  if (Platform.OS !== 'web') {
    return AsyncStorage;
  }

  if (typeof window === 'undefined') {
    const memory = new Map<string, string>();
    return {
      getItem: async (key: string) => memory.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: async (key: string) => {
        memory.delete(key);
      },
    };
  }

  return {
    getItem: async (key: string) => window.localStorage.getItem(key),
    setItem: async (key: string, value: string) => window.localStorage.setItem(key, value),
    removeItem: async (key: string) => window.localStorage.removeItem(key),
  };
}

export type Publication = {
  id: string;
  titulo: string;
  empresa: string | null;
  categoria: string | null;
  estado: string | null;
  certificado: boolean | null;
  volumen_tons: number | null;
  unidad_medida: string | null;
  precio: number | null;
  ubicacion: string | null;
  direccion_google: string | null;
  imagenes: string[] | null;
  created_at: string | null;
};

export function formatCurrency(value: number | null | undefined) {
  return '$' + Number(value || 0).toLocaleString('es-MX');
}

export function formatUnit(unit: string | null | undefined) {
  const units: Record<string, string> = {
    tons: 'TONS',
    kg: 'KG',
    lt: 'LT',
    m3: 'M3',
  };

  return units[unit || 'tons'] || 'TONS';
}

export function userErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');

  if (message.includes('Invalid login credentials')) {
    return 'Correo o contrasena incorrectos.';
  }

  if (message.includes('JWT') || message.includes('Auth session missing')) {
    return 'Tu sesion expiro. Inicia sesion nuevamente.';
  }

  if (message.includes('row-level security') || message.includes('permission denied')) {
    return 'No tienes permisos para realizar esta accion.';
  }

  if (message.includes('fetch') || message.includes('Network')) {
    return 'No se pudo conectar. Revisa tu internet e intenta de nuevo.';
  }

  return message || 'Ocurrio un error inesperado.';
}
