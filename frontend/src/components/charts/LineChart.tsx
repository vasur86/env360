import * as React from 'react';
import {
  LineChart as RLineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

export type LineDatum = { name: string; value: number };

type Props = {
  data: LineDatum[];
  height?: number;
};

export function LineChart({ data, height = 240 }: Props) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <RLineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--chakra-colors-border)" strokeDasharray="3 3" />
          <XAxis dataKey="name" stroke="currentColor" />
          <YAxis stroke="currentColor" />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--chakra-colors-secondary-500)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}


