import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase, userErrorMessage } from '@/lib/supabase';

export default function RegistroScreen() {
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [rfc, setRfc] = useState('');
  const [actividad, setActividad] = useState('Generador');
  const [padron, setPadron] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const register = async () => {
    if (!nombreUsuario.trim() || !razonSocial.trim() || !rfc.trim() || !email.trim()) {
      Alert.alert('Campos incompletos', 'Completa los datos principales de tu cuenta.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Contrasenas distintas', 'La confirmacion no coincide.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          nombre_empresa: razonSocial.trim(),
          nombre_usuario: nombreUsuario.trim(),
          RFC: rfc.trim().toUpperCase(),
          tipo_actividad: actividad.trim(),
          registro_padron: padron.trim(),
        },
      },
    });

    if (!error && data.session && data.user) {
      const { error: profileError } = await supabase.from('perfiles').upsert({
        id: data.user.id,
        nombre_usuario: nombreUsuario.trim(),
        nombre_empresa: razonSocial.trim(),
        RFC: rfc.trim().toUpperCase(),
        tipo_actividad: actividad.trim(),
        registro_padron: padron.trim(),
        email: email.trim(),
      });

      if (profileError) {
        setLoading(false);
        Alert.alert('Perfil pendiente', userErrorMessage(profileError));
        return;
      }
    }

    setLoading(false);

    if (error) {
      Alert.alert('No se pudo registrar', userErrorMessage(error));
      return;
    }

    Alert.alert('Registro exitoso', 'Revisa tu correo para confirmar tu cuenta antes de iniciar sesion.');
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.title}>Registro de empresa</Text>
            <Text style={styles.subtitle}>Crea una cuenta para publicar y negociar materiales RSU.</Text>

            <Field label="Nombre visible" value={nombreUsuario} onChangeText={setNombreUsuario} />
            <Field label="Razon social" value={razonSocial} onChangeText={setRazonSocial} />
            <Field
              autoCapitalize="characters"
              label="RFC / identificacion fiscal"
              value={rfc}
              onChangeText={setRfc}
            />
            <Field label="Tipo de actividad" value={actividad} onChangeText={setActividad} />
            <Field label="Registro en padron" value={padron} onChangeText={setPadron} />
            <Field
              autoCapitalize="none"
              keyboardType="email-address"
              label="Email institucional"
              value={email}
              onChangeText={setEmail}
            />
            <Field label="Contrasena" value={password} onChangeText={setPassword} secureTextEntry />
            <Field
              label="Confirmar contrasena"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />

            <Pressable disabled={loading} onPress={register} style={styles.primaryButton}>
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Finalizar registro</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address';
};

function Field({
  label,
  value,
  onChangeText,
  secureTextEntry,
  autoCapitalize,
  keyboardType,
}: FieldProps) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor="#94a3b8"
        secureTextEntry={secureTextEntry}
        style={styles.input}
        value={value}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#eef8f6',
  },
  content: {
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
    marginBottom: 16,
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
});
