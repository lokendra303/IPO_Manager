import React from 'react';
import { StyleSheet, View } from 'react-native';

type Props = {
  children: React.ReactNode;
  gap?: number;
  columns?: number;
};

export default function StatGrid({ children, gap = 10, columns = 2 }: Props) {
  const items = React.Children.toArray(children);
  const widthPercent = columns <= 1 ? '100%' : '48%';

  return (
    <View style={[styles.grid, { gap }]}>
      {items.map((child, index) => (
        <View key={index} style={[styles.cell, { width: widthPercent }]}>
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    flexGrow: 1,
    maxWidth: '100%',
  },
});
