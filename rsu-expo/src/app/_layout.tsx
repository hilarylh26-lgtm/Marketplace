import 'react-native-url-polyfill/auto';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0f766e' },
          headerTintColor: '#ffffff',
          headerTitleStyle: { fontWeight: '800' },
          contentStyle: { backgroundColor: '#eef8f6' },
        }}>
        <Stack.Screen name="index" options={{ title: 'RSU App' }} />
        <Stack.Screen name="login" options={{ title: 'Iniciar sesion' }} />
        <Stack.Screen name="registro" options={{ title: 'Registro' }} />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}
