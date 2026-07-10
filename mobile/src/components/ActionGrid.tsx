import { StyleSheet, View } from 'react-native';

type Props = {
  children: React.ReactNode;
};

export default function ActionGrid({ children }: Props) {
  return <View style={styles.grid}>{children}</View>;
}

export function ActionCell({ children }: { children: React.ReactNode }) {
  return <View style={styles.cell}>{children}</View>;
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cell: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 140,
  },
});
