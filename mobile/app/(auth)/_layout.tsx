import { View } from 'react-native';
import { Slot } from 'expo-router';
import AuthFooter from '../../src/components/AuthFooter';

export default function AuthLayout() {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
      <AuthFooter
        links={[
          { label: 'System administrator', href: '/(admin-auth)/login' },
        ]}
      />
    </View>
  );
}
