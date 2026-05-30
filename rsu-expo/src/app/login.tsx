import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase, userErrorMessage } from '@/lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Campos incompletos', 'Escribe tu correo y contrasena.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      Alert.alert('No se pudo iniciar sesion', userErrorMessage(error));
      return;
    }

    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}>
        <View style={styles.card}>
          <Text style={styles.title}>Acceso de usuario</Text>
          <Text style={styles.subtitle}>Entra con tu cuenta registrada en RSU App.</Text>

          <Text style={styles.label}>Email institucional</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="usuario@empresa.com"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={email}
          />

          <Text style={styles.label}>Contrasena</Text>
          <TextInput
            onChangeText={setPassword}
            placeholder="********"
            placeholderTextColor="#94a3b8"
            secureTextEntry
            style={styles.input}
            value={password}
          />

          <Pressable disabled={loading} onPress={signIn} style={styles.primaryButton}>
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Entrar al sistema</Text>
            )}
          </Pressable>

          <Pressable onPress={() => router.push('/registro')} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Crear cuenta</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#eef8f6',
  },
  keyboard: {
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#d9e7e4',
    borderRadius: 8,
    borderWidth: 1,
    padding: 22,
  },
  title: {
    color: '#0f172a',
    fontSize: 26,
    fontWeight: '900',
  },
  subtitle: {
    color: '#64748b',
    fontSize: 14,
    marginBottom: 22,
    marginTop: 6,
  },
  label: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 7,
    marginTop: 12,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    borderRadius: 8,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 8,
    marginTop: 22,
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  secondaryButton: {
    alignItems: 'center',
    marginTop: 14,
    padding: 10,
  },
  secondaryButtonText: {
    color: '#0f766e',
    fontWeight: '900',
  },
});
