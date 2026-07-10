import { View } from 'react-native';
import { Slot } from 'expo-router';
import AuthFooter from '../../src/components/AuthFooter';

export default function AdminAuthLayout() {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
      <AuthFooter
        links={[
          { label: 'Manager / member login', href: '/(auth)/login' },
        ]}
      />
    </View>
  );
}
